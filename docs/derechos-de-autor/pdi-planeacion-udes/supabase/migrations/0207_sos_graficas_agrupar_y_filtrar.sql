-- =============================================================================
-- PDI · 0207 · Gráficas publicadas: agrupar nombres repetidos y filtrar por fecha
--
-- Las gráficas de UDrive ahora pueden agrupar las filas que repiten el mismo
-- nombre en el eje (suma, promedio, conteo…), agrupar fechas por mes, trimestre
-- o año y filtrar por fecha (rango o «últimos N»). El portal público dibuja con
-- la misma lógica, así que necesita recibir esos campos:
--
--   · sos_columnas_grafica() suma la columna de fecha del filtro (si el filtro
--     está encendido) a «las columnas que usa la gráfica». Eso hace dos cosas con
--     el mismo código de siempre: el portal recibe esa columna en `columnas` y
--     `filas`, y sos_validar_grafica() la revisa como a las demás (una columna
--     sensible, p. ej. «fecha de nacimiento», impide publicar).
--   · sos_graficas_publicas() entrega, dentro de `config`, agrupar, agruparFecha,
--     filtroFecha y filtroInteractivo. Todo lo demás queda igual: configuración
--     mínima, solo las columnas usadas, máximo 500 filas, nada sensible.
--
-- Sin esta migración el portal sigue dibujando como antes (los campos nuevos no
-- llegan y la gráfica se ve sin agrupar ni filtrar). Los tableros públicos
-- (sos_tablero_publico, 0204) llaman a sos_graficas_publicas(): se actualizan
-- solos. Idempotente.
-- =============================================================================

-- Las columnas que usa una gráfica (eje x, series, tamaño, fila del calor y, si hay filtro, su columna de fecha).
create or replace function public.sos_columnas_grafica(p_config jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct k), '{}'::text[])
    from (
      select p_config ->> 'x' as k
      union all select p_config ->> 'tamano'
      union all select p_config ->> 'filaCalor'
      union all select s ->> 'clave'
        from jsonb_array_elements(case when jsonb_typeof(p_config -> 'series') = 'array' then p_config -> 'series' else '[]'::jsonb end) s
      union all select p_config #>> '{filtroFecha,columna}'
       where coalesce(p_config #>> '{filtroFecha,modo}', 'todo') <> 'todo'
    ) q
   where k is not null and k <> '';
$$;

/**
 * [{id, nombre, seccion, orden, fuente, actualizado,
 *   config: {tipo, titulo, nota, x, series:[{clave,color,eje,agrupar}], tamano, filaCalor, ejeX, ejeY, ejeY2, min, max, tendencia, rotular,
 *            agrupar, agruparFecha, filtroFecha:{columna,modo,desde,hasta,n,unidad}, filtroInteractivo},
 *   columnas: [{clave, etiqueta, tipo}], filas: [{<clave>: valor}]}]
 * Solo gráficas publicadas que pasan sos_validar_grafica; solo las columnas que
 * la gráfica usa. Ordenadas por sección del Observatorio y orden.
 */
create or replace function public.sos_graficas_publicas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select a.id, a.nombre, a.contenido -> 'config' as cfg, pu.seccion, pu.orden,
           t.nombre as fuente, t.contenido as tabla, t.updated_at as actualizado,
           public.sos_columnas_grafica(a.contenido -> 'config') as usadas
      from public.sos_publicaciones pu
      join public.drive_archivos a on a.id = pu.archivo_id
      join public.drive_archivos t on t.id = public.sos_uuid(a.contenido ->> 'tabla_id')
     where pu.publicado
       and public.sos_validar_grafica(pu.archivo_id) is null
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', p.id, 'nombre', p.nombre, 'seccion', p.seccion, 'orden', p.orden,
             'fuente', p.fuente, 'actualizado', p.actualizado,
             'config', jsonb_strip_nulls(jsonb_build_object(
               'tipo', p.cfg -> 'tipo', 'titulo', p.cfg -> 'titulo', 'nota', p.cfg -> 'nota', 'x', p.cfg -> 'x',
               'series', p.cfg -> 'series', 'tamano', p.cfg -> 'tamano', 'filaCalor', p.cfg -> 'filaCalor',
               'ejeX', p.cfg -> 'ejeX', 'ejeY', p.cfg -> 'ejeY', 'ejeY2', p.cfg -> 'ejeY2',
               'min', p.cfg -> 'min', 'max', p.cfg -> 'max', 'tendencia', p.cfg -> 'tendencia', 'rotular', p.cfg -> 'rotular',
               'agrupar', p.cfg -> 'agrupar', 'agruparFecha', p.cfg -> 'agruparFecha',
               'filtroFecha', p.cfg -> 'filtroFecha', 'filtroInteractivo', p.cfg -> 'filtroInteractivo')),
             'columnas', (select coalesce(jsonb_agg(jsonb_build_object('clave', c ->> 'clave', 'etiqueta', c ->> 'etiqueta', 'tipo', c ->> 'tipo')), '[]'::jsonb)
                            from jsonb_array_elements(case when jsonb_typeof(p.tabla -> 'columnas') = 'array' then p.tabla -> 'columnas' else '[]'::jsonb end) c
                           where c ->> 'clave' = any (p.usadas)),
             'filas', public.sos_filas_de(p.tabla, p.usadas))
           order by case p.seccion when 'panorama' then 1 when 'tendencia' then 2 when 'composicion' then 3 when 'territorio' then 4 else 5 end, p.orden, p.nombre), '[]'::jsonb)
    from p;
$$;

revoke all on function public.sos_graficas_publicas() from public;
grant execute on function public.sos_graficas_publicas() to anon, authenticated, service_role;
comment on function public.sos_graficas_publicas() is
  'Gráficas publicadas de Datos de Sostenibilidad con su configuración mínima (incluida la agrupación y el filtro por fecha) y solo las columnas que usan, para el portal público.';
