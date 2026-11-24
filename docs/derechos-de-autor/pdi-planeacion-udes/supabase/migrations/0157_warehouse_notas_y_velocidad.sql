-- =============================================================================
-- 0157 · Warehouse UDES · notas por estudiante y más velocidad
--
-- 1. «dv_notas» (Davinci · Reporte global de notas): una fila por estudiante y
--    materia con P1, P2, P3 y la nota acumulada. Política: se guardan
--    programa, materia, grupo y las notas; el nombre se descarta y el código
--    del estudiante queda como seudónimo (el mismo que en «dv_matric», porque
--    el seudónimo sale del mismo código y la misma sal: los dos se cruzan).
--    Las notas faltantes llegan como «-»; wh_num las lee como vacías.
--
-- 2. v_wh_notas: ese reporte con sus columnas ya numéricas.
--
-- 3. wh_notas_resumen(periodo, sede, aprueba): UN renglón por estudiante con lo
--    que las alertas necesitan (cuántas materias, promedio de cada corte,
--    cuántas materias bajo la nota de aprobar). Así la pantalla baja ~4.000
--    renglones en una llamada y no ~29.000 filas en 30 páginas, y los umbrales
--    de las alertas se aplican en el navegador sin volver a la base.
--
-- 4. Más rápido al guardar: la sal del seudónimo se lee una vez por llamada
--    (no una vez por fila) y la limpieza de cada fila es una sola consulta
--    (jsonb_object_agg) en vez de un ciclo. El resultado es idéntico: el mismo
--    código da el mismo seudónimo que antes.
--
-- Requiere 0155. Idempotente.
-- =============================================================================

insert into public.wh_politicas (conjunto, modo, lista, seudonimizar, nota) values
  ('dv_notas', 'permitir',
   '{codigo_estudiante,codigo_programa,nombre_programa,codigo_materia,nombre_materia,grupo,p1,p2,p3,nota_acumulada}',
   '{codigo_estudiante}',
   'Se descarta el nombre del estudiante; su código queda como seudónimo (el mismo de los matriculados).')
on conflict (conjunto) do update
  set modo = excluded.modo, lista = excluded.lista, seudonimizar = excluded.seudonimizar, nota = excluded.nota;

-- -----------------------------------------------------------------------------
-- Limpieza de filas más rápida (la sal llega ya leída)
-- -----------------------------------------------------------------------------

create or replace function public.wh_limpiar_fila(p_fila jsonb, p_modo text, p_lista text[], p_seud text[], p_sal bytea)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    jsonb_object_agg(
      e.k,
      case
        when e.k = any (p_seud) and jsonb_typeof(e.v) <> 'null' and btrim(e.v #>> '{}') <> ''
          then to_jsonb('x-' || substr(encode(hmac(convert_to(btrim(e.v #>> '{}'), 'UTF8'), p_sal, 'sha256'), 'hex'), 1, 10))
        else e.v
      end
    ),
    '{}'::jsonb)
  from jsonb_each(coalesce(p_fila, '{}'::jsonb)) as e(k, v)
  where (p_modo = 'permitir' and e.k = any (p_lista))
     or (p_modo = 'excluir' and not (e.k = any (p_lista)));
$$;

revoke all on function public.wh_limpiar_fila(jsonb, text, text[], text[], bytea) from public, anon, authenticated;

-- La de cuatro argumentos (0155) sigue existiendo y da lo mismo.
create or replace function public.wh_limpiar_fila(p_fila jsonb, p_modo text, p_lista text[], p_seud text[])
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.wh_limpiar_fila(p_fila, p_modo, p_lista, p_seud, (select valor from public.wh_secretos where clave = 'sal_seudonimo'));
$$;

revoke all on function public.wh_limpiar_fila(jsonb, text, text[], text[]) from public, anon, authenticated;

create or replace function public.wh_agregar_filas(p_carga uuid, p_inicio int, p_filas jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  carga public.wh_cargas;
  pol public.wh_politicas;
  sal bytea;
  total int;
begin
  if not public.wh_autorizado() then
    raise exception 'warehouse: sin permiso' using errcode = '42501';
  end if;
  select * into carga from public.wh_cargas where id = p_carga;
  if not found or carga.estado <> 'en_curso' or carga.creada_por is distinct from auth.uid() then
    raise exception 'carga_no_disponible: la carga no existe, ya terminó o es de otra persona' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'filas_invalidas: se espera una lista' using errcode = 'P0001';
  end if;
  total := jsonb_array_length(p_filas);
  if total > 2000 then
    raise exception 'filas_demasiadas: máximo 2000 por llamada' using errcode = 'P0001';
  end if;
  select * into pol from public.wh_politicas where conjunto = carga.conjunto;
  select valor into sal from public.wh_secretos where clave = 'sal_seudonimo';

  insert into public.wh_filas (carga_id, n, datos)
  select p_carga, p_inicio + t.ord - 1, public.wh_limpiar_fila(t.fila, pol.modo, pol.lista, pol.seudonimizar, sal)
    from jsonb_array_elements(p_filas) with ordinality as t(fila, ord);
  return total;
end;
$$;

-- -----------------------------------------------------------------------------
-- Notas por estudiante
-- -----------------------------------------------------------------------------

create or replace view public.v_wh_notas with (security_invoker = true) as
  select v.periodo, v.sede, v.version,
         f.datos->>'codigo_estudiante'  as estudiante,
         f.datos->>'codigo_programa'    as codigo_programa,
         f.datos->>'nombre_programa'    as programa,
         f.datos->>'codigo_materia'     as codigo_materia,
         f.datos->>'nombre_materia'     as materia,
         f.datos->>'grupo'              as grupo,
         public.wh_num(f.datos->>'p1')  as p1,
         public.wh_num(f.datos->>'p2')  as p2,
         public.wh_num(f.datos->>'p3')  as p3,
         public.wh_num(f.datos->>'nota_acumulada') as nota_acumulada
    from public.wh_vigentes v
    join public.wh_filas f on f.carga_id = v.id
   where v.conjunto = 'dv_notas';

comment on view public.v_wh_notas is
  'Warehouse: notas por estudiante y materia (P1, P2, P3 y acumulada). La nota «-» (aún sin nota) sale vacía.';

create or replace function public.wh_notas_resumen(p_periodo text, p_sede text, p_aprueba numeric default 3.0)
returns table (
  estudiante text,
  programa text,
  materias int,
  con_p1 int,
  con_p2 int,
  con_p3 int,
  prom_p1 numeric,
  prom_p2 numeric,
  prom_p3 numeric,
  riesgo_p1 int,
  riesgo_p2 int,
  riesgo_p3 int
)
language sql
stable
as $$
  select n.estudiante,
         min(n.programa),
         count(*)::int,
         count(n.p1)::int, count(n.p2)::int, count(n.p3)::int,
         round(avg(n.p1), 2), round(avg(n.p2), 2), round(avg(n.p3), 2),
         (count(*) filter (where n.p1 < p_aprueba))::int,
         (count(*) filter (where n.p2 < p_aprueba))::int,
         (count(*) filter (where n.p3 < p_aprueba))::int
    from public.v_wh_notas n
   where n.periodo = p_periodo and n.sede = p_sede
   group by n.estudiante;
$$;

comment on function public.wh_notas_resumen(text, text, numeric) is
  'Warehouse: un renglón por estudiante con las materias, el promedio de cada corte y cuántas materias van por debajo de la nota de aprobar.';

grant select on public.v_wh_notas to authenticated;
revoke all on public.v_wh_notas from anon;
revoke all on function public.wh_notas_resumen(text, text, numeric) from public, anon;
grant execute on function public.wh_notas_resumen(text, text, numeric) to authenticated;

notify pgrst, 'reload schema';
