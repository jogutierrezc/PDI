-- =============================================================================
-- 0158 · Warehouse UDES · las políticas de lectura dejan de pesar por fila
--
-- Las políticas de 0155 decían `using (public.wh_autorizado())`. Esa función
-- consulta el rol y la pantalla de quien pregunta, y Postgres la volvía a
-- ejecutar por CADA fila que lee: con las ~29.000 filas de «Notas por
-- estudiante» (más las del resto) la lectura tardaba segundos y la llamada
-- terminaba en 500 por tiempo de espera («wh_notas_resumen», «v_wh_notas»).
--
-- Con `(select public.wh_autorizado())` Postgres la evalúa UNA vez por consulta
-- (un InitPlan) y la política deja de costar por fila. Quién puede leer no
-- cambia: sigue siendo Planeación o más con la pantalla «warehouse».
--
-- Además, wh_notas_resumen busca primero la carga vigente y agrupa solo sus
-- filas (por la llave de wh_filas), en vez de recorrer una vista con todas las
-- cargas vigentes.
--
-- Requiere 0155 y 0157. Idempotente.
-- =============================================================================

drop policy if exists wh_periodos_lectura on public.wh_periodos;
create policy wh_periodos_lectura on public.wh_periodos for select to authenticated using ((select public.wh_autorizado()));

drop policy if exists wh_cargas_lectura on public.wh_cargas;
create policy wh_cargas_lectura on public.wh_cargas for select to authenticated using ((select public.wh_autorizado()));

drop policy if exists wh_filas_lectura on public.wh_filas;
create policy wh_filas_lectura on public.wh_filas for select to authenticated using ((select public.wh_autorizado()));

drop policy if exists wh_politicas_lectura on public.wh_politicas;
create policy wh_politicas_lectura on public.wh_politicas for select to authenticated using ((select public.wh_autorizado()));

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
  with carga as (
    select c.id
      from public.wh_cargas c
     where c.conjunto = 'dv_notas' and c.periodo = p_periodo and c.sede = p_sede and c.estado = 'guardada'
     order by c.version desc
     limit 1
  ),
  n as (
    select f.datos->>'codigo_estudiante'  as est,
           f.datos->>'nombre_programa'    as prog,
           public.wh_num(f.datos->>'p1')  as p1,
           public.wh_num(f.datos->>'p2')  as p2,
           public.wh_num(f.datos->>'p3')  as p3
      from public.wh_filas f
     where f.carga_id = (select id from carga)
  )
  select n.est,
         min(n.prog),
         count(*)::int,
         count(n.p1)::int, count(n.p2)::int, count(n.p3)::int,
         round(avg(n.p1), 2), round(avg(n.p2), 2), round(avg(n.p3), 2),
         (count(*) filter (where n.p1 < p_aprueba))::int,
         (count(*) filter (where n.p2 < p_aprueba))::int,
         (count(*) filter (where n.p3 < p_aprueba))::int
    from n
   group by n.est;
$$;

revoke all on function public.wh_notas_resumen(text, text, numeric) from public, anon;
grant execute on function public.wh_notas_resumen(text, text, numeric) to authenticated;

notify pgrst, 'reload schema';
