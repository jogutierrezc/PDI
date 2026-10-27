-- =============================================================================
-- PDI · 0212 · UI GreenMetric · lecturas PÚBLICAS agregadas (página pública)
--
-- Requiere 0202, 0204, 0207, 0208, 0210 y 0211. Idempotente.
--
-- Estas son las ÚNICAS puertas de la web pública a los datos de UI GreenMetric.
-- Son funciones SECURITY DEFINER con search_path fijo, ejecutables por `anon` y
-- `authenticated`. El rol anon NO tiene acceso a ninguna tabla ugm_* ni ranking_*.
--
-- PORQUÉ DE CADA DECISIÓN DE SEGURIDAD
--  1. Solo sale una respuesta que cumple TODO, comprobado en cada lectura (no se
--     confía solo en el interruptor): publicar_web, aprobada, no sensible, con
--     traducción revisada y vigente, con evidencia si la pregunta la exige y con
--     las tablas conectadas de Datos de Sostenibilidad publicadas (si una tabla
--     deja de estar publicada, el indicador desaparece de inmediato). Una gráfica
--     conectada sin publicar NO bloquea: el indicador sale sin ella.
--  2. NUNCA salen: puntos, pesos, factores, bandas, el número de nivel de una
--     escala (se entrega la frase de la opción), estados, comentarios, devoluciones,
--     bitácora, versiones, nombres/correos/ids de personas ni de unidades,
--     nombres internos de archivos, borradores ni traducciones sin revisar.
--  3. Las tablas del indicador salen solo con las columnas que define el esquema
--     de la pregunta (una clave extra que alguien meta en el JSON no sale). De las
--     tablas conectadas de Datos de Sostenibilidad salen únicamente las columnas
--     usadas por el vínculo (valor y periodo), ya validadas como no sensibles, con
--     tope de 500 filas. Las gráficas salen por sos_graficas_publicas() (que ya
--     exige publicadas, sin dispersión y sin columnas sensibles).
--  4. Evidencias: solo las marcadas «pública» por la administración. Se entregan
--     como etiqueta («Documento de soporte N»), tipo, pie e id estable; un enlace
--     https público lleva su URL. Un archivo de UDrive NO lleva ruta ni nombre: lo
--     sirve una URL firmada de corta vida que genera una función con el rol de
--     servicio (ugm_ruta_evidencia_publica, 0211).
--  5. Indicadores calculados (SI4, EC4, EC8, TR4, ED1, ED2, GD1): se calculan en
--     la base y salen solo cuando TODOS sus datos de entrada están publicados.
--  6. Solo ciclos en estado abierto o cerrado; uno en preparación no se ve.
-- =============================================================================

create or replace function public.ugm_publico_ciclo_ok(p_ciclo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ranking_cycles c where c.id = p_ciclo and c.ranking = 'ui-greenmetric' and c.estado in ('abierto', 'cerrado'));
$$;

/** ¿La respuesta cumple hoy todas las condiciones para mostrarse en la web? */
create or replace function public.ugm_publica_ok(r public.ugm_respuestas)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select r.publicar_web and r.estado = 'aprobado' and not r.sensible
         and coalesce((public.ugm_publicacion_estado_fila(r) ->> 'puede')::boolean, false);
$$;

/** El ciclo pedido, o el más reciente con algo publicado. */
create or replace function public.ugm_publico_ciclo(p_ciclo uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  if p_ciclo is not null then
    return case when public.ugm_publico_ciclo_ok(p_ciclo) then p_ciclo else null end;
  end if;
  select c.id into v from public.ranking_cycles c
   where c.ranking = 'ui-greenmetric' and c.estado in ('abierto', 'cerrado')
     and exists (select 1 from public.ugm_respuestas r where r.ciclo_id = c.id and r.publicar_web)
   order by c.anio desc limit 1;
  if v is null then
    select c.id into v from public.ranking_cycles c where c.ranking = 'ui-greenmetric' and c.estado in ('abierto', 'cerrado') order by c.anio desc limit 1;
  end if;
  return v;
end;
$$;

/** Una tabla del esquema, con el inglés si se pide y solo con las columnas del esquema. */
create or replace function public.ugm_publico_tabla(r public.ugm_respuestas, t jsonb, p_en boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_k text := t ->> 'k';
  v_es jsonb := case when jsonb_typeof(r.tablas -> v_k) = 'array' then r.tablas -> v_k else '[]'::jsonb end;
  v_en jsonb := case when jsonb_typeof(r.tablas_en -> v_k) = 'array' then r.tablas_en -> v_k else '[]'::jsonb end;
  v_filas jsonb := '[]'::jsonb;
  v_fila jsonb;
  v_valor jsonb;
  col jsonb;
  i int;
begin
  if jsonb_array_length(v_es) = 0 then return null; end if;
  for i in 0 .. least(jsonb_array_length(v_es), 200) - 1 loop
    v_fila := '{}'::jsonb;
    for col in select * from jsonb_array_elements(t -> 'columnas') loop
      v_valor := case
        when coalesce(col ->> 'tipo', 'texto') = 'texto' and p_en then coalesce(v_en -> i -> (col ->> 'k'), v_es -> i -> (col ->> 'k'))
        else v_es -> i -> (col ->> 'k') end;
      if col ->> 'tipo' = 'url' and (jsonb_typeof(v_valor) <> 'string' or (v_valor #>> '{}') !~ '^https://') then v_valor := null; end if;
      if col ->> 'tipo' = 'numero' and jsonb_typeof(v_valor) <> 'number' then v_valor := null; end if;
      if v_valor is not null and jsonb_typeof(v_valor) <> 'null' then v_fila := v_fila || jsonb_build_object(col ->> 'k', v_valor); end if;
    end loop;
    if v_fila <> '{}'::jsonb then v_filas := v_filas || jsonb_build_array(v_fila); end if;
  end loop;
  if jsonb_array_length(v_filas) = 0 then return null; end if;
  return jsonb_build_object(
    'k', v_k, 'titulo', case when p_en then t ->> 'en' else t ->> 'es' end,
    'columnas', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('k', c ->> 'k', 'etiqueta', case when p_en then c ->> 'en' else c ->> 'es' end,
                                                                        'unidad', c ->> 'unidad', 'tipo', coalesce(c ->> 'tipo', 'texto'))))
                   from jsonb_array_elements(t -> 'columnas') c),
    'filas', v_filas);
end;
$$;

/** Un indicador listo para la web, o nulo si hoy no puede salir. p_graficas = sos_graficas_publicas() (se pide una sola vez por llamada). */
create or replace function public.ugm_publico_item(r public.ugm_respuestas, p public.ugm_preguntas, p_idioma text, p_graficas jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_en boolean := p_idioma = 'en';
  v_val jsonb;
  v_campos jsonb;
  v_frase text;
  v_ods jsonb;
  v_desc text;
  v_tablas jsonb := '[]'::jsonb;
  v_t jsonb;
  t jsonb;
  v_graf jsonb;
  v_conectadas jsonb := '[]'::jsonb;
  x record;
  v_dato jsonb;
  v_cols text[];
  v_evid jsonb;
  v_valor jsonb;
begin
  if not public.ugm_publica_ok(r) then return null; end if;
  v_val := public.ugm_valores_efectivos_fila(r);

  -- Campos con valor: números (con unidad), enlaces https y textos en el idioma pedido.
  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into v_campos from (
    select ord, jsonb_strip_nulls(jsonb_build_object('k', c ->> 'k', 'etiqueta', case when v_en then c ->> 'en' else c ->> 'es' end, 'unidad', c ->> 'unidad', 'valor', val)) as e
      from (
        select ord, c,
               case c ->> 'tipo'
                 when 'numero' then case when jsonb_typeof(v_val -> (c ->> 'k')) = 'number' then v_val -> (c ->> 'k') end
                 when 'url' then case when (v_val ->> (c ->> 'k')) ~ '^https://[^[:space:]]+$' then to_jsonb(btrim(v_val ->> (c ->> 'k'))) end
                 when 'texto' then to_jsonb(nullif(btrim(case when v_en then r.textos_en ->> (c ->> 'k') else r.textos_es ->> (c ->> 'k') end), ''))
                 when 'texto_largo' then to_jsonb(nullif(btrim(case when v_en then r.textos_en ->> (c ->> 'k') else r.textos_es ->> (c ->> 'k') end), ''))
               end as val
          from jsonb_array_elements(p.esquema -> 'campos') with ordinality as t(c, ord)
         where c ->> 'tipo' in ('numero', 'url', 'texto', 'texto_largo')
      ) z where val is not null
  ) w;

  v_desc := nullif(btrim(case when v_en then r.textos_en ->> 'descripcion' else r.textos_es ->> 'descripcion' end), '');
  -- Si pide inglés y no hay descripción en inglés, el indicador no se publica (decisión aprobada).
  if v_en and p.esquema -> 'campos' @> '[{"k":"descripcion"}]'::jsonb and btrim(coalesce(r.textos_es ->> 'descripcion', '')) <> '' and v_desc is null then
    return null;
  end if;

  -- Escalas y selecciones: la frase de la opción elegida, nunca el número de nivel.
  if p.tipo in ('escala', 'seleccion') and r.opcion is not null then
    select o ->> (case when v_en then 'en' else 'es' end) into v_frase
      from jsonb_array_elements(coalesce(p.opciones, '[]'::jsonb)) o where (o ->> 'valor')::int = r.opcion limit 1;
  end if;
  if p.tipo = 'impacto_ods' and jsonb_typeof(v_val -> 'ods') = 'array' then
    select coalesce(jsonb_agg(n order by n), '[]'::jsonb) into v_ods from (
      select distinct x::int as n from jsonb_array_elements_text(v_val -> 'ods') x where x ~ '^[0-9]{1,2}$' and x::int between 1 and 17) s;
  end if;

  for t in select * from jsonb_array_elements(p.esquema -> 'tablas') loop
    v_t := public.ugm_publico_tabla(r, t, v_en);
    if v_t is not null then v_tablas := v_tablas || jsonb_build_array(v_t); end if;
  end loop;

  -- Gráficas conectadas y publicadas.
  select coalesce(jsonb_agg(g order by gr.orden), '[]'::jsonb) into v_graf
    from jsonb_array_elements(coalesce(p_graficas, '[]'::jsonb)) g
    join public.ugm_datos_graficas gr on gr.respuesta_id = r.id and gr.archivo_id = (g ->> 'id')::uuid;

  -- Tablas conectadas y publicadas: solo la columna de valor y la de periodo.
  for x in select v.* from public.ugm_datos_vinculos v where v.respuesta_id = r.id and v.modo = 'conectado' loop
    v_dato := public.ugm_valor_vinculo(x.id);
    continue when v_dato is null or not public.ugm_tabla_publicada(x.archivo_id);
    v_cols := array_remove(array[x.columna, x.col_periodo], null);
    v_conectadas := v_conectadas || jsonb_build_array(jsonb_build_object(
      'campo', x.campo, 'dato', v_dato, 'fuente', 'Datos de Sostenibilidad',
      'nombre', (select a.nombre from public.drive_archivos a where a.id = x.archivo_id),
      'actualizado', (select a.updated_at from public.drive_archivos a where a.id = x.archivo_id),
      'columnas', (select coalesce(jsonb_agg(jsonb_build_object('clave', c ->> 'clave', 'etiqueta', c ->> 'etiqueta', 'tipo', c ->> 'tipo')), '[]'::jsonb)
                     from public.drive_archivos a, jsonb_array_elements(a.contenido -> 'columnas') c
                    where a.id = x.archivo_id and c ->> 'clave' = any (v_cols)),
      'filas', (select case when jsonb_array_length(coalesce(a.contenido -> 'filas', '[]'::jsonb)) <= 500 then public.sos_filas_de(a.contenido, v_cols) else '[]'::jsonb end
                  from public.drive_archivos a where a.id = x.archivo_id)));
  end loop;

  -- Evidencias públicas: etiqueta, no nombre de archivo.
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', z.id, 'etiqueta', (case when v_en then 'Supporting document ' else 'Documento de soporte ' end) || z.n,
           'tipo', case when z.url is not null then 'enlace' else coalesce(z.ext, 'archivo') end,
           'url', z.url, 'pie', nullif(case when v_en then z.pie_en else z.pie_es end, ''), 'figura', z.figura, 'es_mapa', nullif(z.es_mapa, false),
           'nota', case when z.url is null then (case when v_en then 'PDF, up to 2 MB, in English' else 'PDF de hasta 2 MB, en inglés' end) end))
         order by z.n), '[]'::jsonb) into v_evid
    from (
      select e.id, e.url, e.pie_es, e.pie_en, e.figura, e.es_mapa,
             row_number() over (order by e.orden, e.created_at) as n,
             lower(substring(a.nombre from '\.([A-Za-z0-9]{1,5})$')) as ext
        from public.ugm_evidencias e
        left join public.drive_archivos a on a.id = e.archivo_id
       where e.respuesta_id = r.id and e.publica and (e.url is not null or (a.id is not null and a.borrado_en is null))
    ) z;

  v_valor := case
    when p.tipo in ('razon', 'area_banda') and jsonb_typeof(r.calculo -> 'valor') = 'number' then r.calculo -> 'valor'
    when p.tipo = 'numero' and jsonb_typeof(v_val -> 'valor') = 'number' then v_val -> 'valor'
    when p.tipo = 'numero' and jsonb_typeof(v_val -> 'y1') = 'number' then
      to_jsonb((select round(avg((v_val ->> k)::numeric), 4) from unnest(array['y1', 'y2', 'y3']) k where jsonb_typeof(v_val -> k) = 'number'))
    end;

  return jsonb_strip_nulls(jsonb_build_object(
    'q', p.q, 'indicador', p.indicador, 'categoria', p.categoria,
    'nombre', case when v_en then p.nombre_en else p.nombre_es end,
    'tipo', p.tipo, 'calculado', false, 'unidad', nullif(case when p.tipo in ('razon', 'area_banda') then coalesce(r.calculo ->> 'unidad', p.unidad) else p.unidad end, ''),
    'periodo', p.periodo,
    'valor', v_valor, 'opcion_frase', v_frase, 'ods', v_ods, 'descripcion', v_desc,
    'campos', v_campos, 'tablas', v_tablas, 'graficas', v_graf, 'tablas_conectadas', v_conectadas,
    'evidencias', v_evid, 'evidencia_publica', jsonb_array_length(v_evid) > 0,
    'actualizado', greatest(r.aprobado_at, r.publicado_at, r.updated_at)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Las lecturas públicas
-- -----------------------------------------------------------------------------

/** Ciclos visibles al público (abiertos o cerrados): {id, anio, anio_datos, estado, publicados}. Para el selector de edición. */
create or replace function public.ugm_publico_ciclos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'anio', c.anio, 'anio_datos', c.anio_datos, 'estado', c.estado,
           'publicados', (select count(*) from public.ugm_respuestas r where r.ciclo_id = c.id and r.publicar_web)::int,
           'actualizado', (select pv.updated_at from public.ugm_publico_version pv where pv.ciclo_id = c.id)) order by c.anio desc), '[]'::jsonb)
    from public.ranking_cycles c
   where c.ranking = 'ui-greenmetric' and c.estado in ('abierto', 'cerrado');
$$;

/** Cambia cuando algo se publica o se retira: la página la consulta para saber si debe volver a leer. */
create or replace function public.ugm_publico_actualizacion(p_ciclo uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid := public.ugm_publico_ciclo(p_ciclo);
begin
  if v is null then return null; end if;
  return (select jsonb_build_object('ciclo', v, 'version', pv.version, 'actualizado', pv.updated_at) from public.ugm_publico_version pv where pv.ciclo_id = v);
end;
$$;

/**
 * Resumen por categoría: {ciclo, version, actualizado, categorias:[{categoria, numero, nombre_es, nombre_en, publicados, total,
 * graficas, tablas, evidencias_publicas}], total:{publicados, total}}. SIN puntos ni pesos. «total» cuenta los indicadores con
 * plantilla más los calculados (93 en la guía 2026). Un inventario, no una escala.
 */
create or replace function public.ugm_publico_resumen(p_ciclo uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid := public.ugm_publico_ciclo(p_ciclo);
  v_calc jsonb;
  v_out jsonb;
begin
  if v is null then return null; end if;
  v_calc := public.ugm_calculados_interno(v);
  with ok as (
    select r.id, p.categoria, p.calculada, p.q, (p.plantilla is not null or p.calculada) as cuenta, public.ugm_publica_ok(r) as ok
      from public.ugm_respuestas r join public.ugm_preguntas p on p.ciclo_id = r.ciclo_id and p.q = r.q
     where r.ciclo_id = v
  ),
  cat as (
    select c.categoria, c.numero, c.nombre_es, c.nombre_en,
           (select count(*) from ok where ok.categoria = c.categoria and ok.cuenta and not ok.calculada and ok.ok)
             + (select count(*) from jsonb_array_elements(v_calc) k join public.ugm_preguntas pq on pq.ciclo_id = v and pq.q = k ->> 'q'
                 where pq.categoria = c.categoria and (k ->> 'publicable')::boolean) as publicados,
           (select count(*) from ok where ok.categoria = c.categoria and ok.cuenta) as total,
           (select count(distinct g.archivo_id) from ok join public.ugm_datos_graficas g on g.respuesta_id = ok.id
             where ok.categoria = c.categoria and ok.ok and public.ugm_grafica_publicada(g.archivo_id)) as graficas,
           (select count(distinct vi.archivo_id) from ok join public.ugm_datos_vinculos vi on vi.respuesta_id = ok.id
             where ok.categoria = c.categoria and ok.ok and vi.modo = 'conectado' and public.ugm_tabla_publicada(vi.archivo_id)) as tablas,
           (select count(*) from ok join public.ugm_evidencias e on e.respuesta_id = ok.id
             where ok.categoria = c.categoria and ok.ok and e.publica) as evidencias_publicas
      from public.ugm_categorias c where c.ciclo_id = v
  )
  select jsonb_build_object(
           'categorias', coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'numero', numero, 'nombre_es', nombre_es, 'nombre_en', nombre_en,
                                    'publicados', publicados::int, 'total', total::int, 'graficas', graficas::int, 'tablas', tablas::int,
                                    'evidencias_publicas', evidencias_publicas::int) order by numero), '[]'::jsonb),
           'total', jsonb_build_object('publicados', coalesce(sum(publicados), 0)::int, 'total', coalesce(sum(total), 0)::int))
    into v_out from cat;
  return v_out || jsonb_build_object(
    'ciclo', (select jsonb_build_object('id', c.id, 'anio', c.anio, 'anio_datos', c.anio_datos, 'estado', c.estado) from public.ranking_cycles c where c.id = v),
    'version', (select pv.version from public.ugm_publico_version pv where pv.ciclo_id = v),
    'actualizado', (select pv.updated_at from public.ugm_publico_version pv where pv.ciclo_id = v));
end;
$$;

/** Los indicadores publicados de una categoría en el idioma pedido ('es' o 'en'), más los calculados que ya pueden salir. */
create or replace function public.ugm_publico_categoria(p_ciclo uuid, p_categoria text, p_idioma text default 'es')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid := public.ugm_publico_ciclo(p_ciclo);
  v_idioma text := case when p_idioma = 'en' then 'en' else 'es' end;
  v_graf jsonb;
  v_items jsonb;
  v_calc jsonb;
begin
  if v is null or not exists (select 1 from public.ugm_categorias c where c.ciclo_id = v and c.categoria = p_categoria) then return null; end if;
  v_graf := public.sos_graficas_publicas();
  select coalesce(jsonb_agg(s.it order by s.orden), '[]'::jsonb) into v_items
    from (
      select p.orden, public.ugm_publico_item(r, p, v_idioma, v_graf) as it
        from public.ugm_respuestas r join public.ugm_preguntas p on p.ciclo_id = r.ciclo_id and p.q = r.q
       where r.ciclo_id = v and p.categoria = p_categoria and r.publicar_web
    ) s where s.it is not null;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'q', k ->> 'q', 'indicador', k ->> 'indicador', 'categoria', p.categoria, 'calculado', true,
           'nombre', case when v_idioma = 'en' then p.nombre_en else p.nombre_es end,
           'unidad', k ->> 'unidad', 'valor', k -> 'valor', 'tipo', 'razon')) order by p.orden), '[]'::jsonb)
    into v_calc
    from jsonb_array_elements(public.ugm_calculados_interno(v)) k
    join public.ugm_preguntas p on p.ciclo_id = v and p.q = k ->> 'q'
   where p.categoria = p_categoria and (k ->> 'publicable')::boolean;
  return jsonb_build_object(
    'ciclo', (select jsonb_build_object('id', c.id, 'anio', c.anio, 'anio_datos', c.anio_datos, 'estado', c.estado) from public.ranking_cycles c where c.id = v),
    'categoria', (select jsonb_build_object('categoria', c.categoria, 'numero', c.numero, 'nombre', case when v_idioma = 'en' then c.nombre_en else c.nombre_es end,
                                           'nombre_es', c.nombre_es, 'nombre_en', c.nombre_en) from public.ugm_categorias c where c.ciclo_id = v and c.categoria = p_categoria),
    'indicadores', v_items, 'calculados', v_calc,
    'actualizado', (select pv.updated_at from public.ugm_publico_version pv where pv.ciclo_id = v));
end;
$$;

/** La hoja de un indicador publicado (o nulo si no puede salir hoy). Acepta el número de pregunta («1.10») o el código («SI3»). */
create or replace function public.ugm_publico_evidencia(p_ciclo uuid, p_q text, p_idioma text default 'es')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid := public.ugm_publico_ciclo(p_ciclo);
  r public.ugm_respuestas;
  p public.ugm_preguntas;
  v_idioma text := case when p_idioma = 'en' then 'en' else 'es' end;
  v_item jsonb;
begin
  if v is null then return null; end if;
  select * into p from public.ugm_preguntas where ciclo_id = v and (q = p_q or upper(indicador) = upper(p_q)) order by (q = p_q) desc limit 1;
  if not found then return null; end if;
  select * into r from public.ugm_respuestas where ciclo_id = v and q = p.q;
  if not found then return null; end if;
  v_item := public.ugm_publico_item(r, p, v_idioma, public.sos_graficas_publicas());
  if v_item is null then return null; end if;
  return jsonb_build_object('ciclo', (select jsonb_build_object('id', c.id, 'anio', c.anio, 'anio_datos', c.anio_datos) from public.ranking_cycles c where c.id = v), 'indicador', v_item);
end;
$$;

/** Preguntas publicadas del ciclo: para el mapa del sitio y para la regleta de cuadros. {q, indicador, categoria, actualizado}. */
create or replace function public.ugm_publico_indice(p_ciclo uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid := public.ugm_publico_ciclo(p_ciclo);
begin
  if v is null then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('q', p.q, 'indicador', p.indicador, 'categoria', p.categoria,
                                                           'actualizado', greatest(r.aprobado_at, r.publicado_at, r.updated_at))) order by p.orden)
      from public.ugm_respuestas r join public.ugm_preguntas p on p.ciclo_id = r.ciclo_id and p.q = r.q
     where r.ciclo_id = v and r.publicar_web and public.ugm_publica_ok(r)), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'ugm_publico_ciclos()', 'ugm_publico_actualizacion(uuid)', 'ugm_publico_resumen(uuid)',
    'ugm_publico_categoria(uuid, text, text)', 'ugm_publico_evidencia(uuid, text, text)', 'ugm_publico_indice(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
  -- Internas de la lectura pública: nadie las llama desde la API.
  foreach f in array array[
    'ugm_publico_ciclo_ok(uuid)', 'ugm_publica_ok(public.ugm_respuestas)', 'ugm_publico_ciclo(uuid)',
    'ugm_publico_tabla(public.ugm_respuestas, jsonb, boolean)',
    'ugm_publico_item(public.ugm_respuestas, public.ugm_preguntas, text, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
