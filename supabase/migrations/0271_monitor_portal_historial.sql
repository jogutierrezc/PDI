-- =============================================================================
-- PDI · 0271 · Monitor · lo que el portal /alertas necesita de varios periodos
--
-- Requiere 0155 a 0161 (Monitor) y 0193 (dv_cred y dv_matric con política). Idempotente.
-- No toca ninguna función existente. Todas son security definer con el mismo control del
-- Monitor (wh_monitor_puede) y el mismo alcance por unidad (wh_monitor_codigos), así que
-- nadie ve un programa que no puede ver. Ninguna entrega nombres: solo el código del
-- estudiante (dato personal, ya restringido por programa) o cifras agregadas.
--
--   wh_monitor_historial        una fila por estudiante y periodo (promedio por corte y final,
--                               materias perdidas, semestre, grupo etario y origen)
--   wh_monitor_riesgo_semestre  lo mismo que wh_monitor_riesgo, pero solo con las matrículas de
--                               los estudiantes de un semestre de un programa
--   wh_monitor_cursos_historial reprobación por programa, curso y corte en varios periodos
--
-- Reserva de 5: lo agregado por curso o por grupo no sale con menos de 5 matrículas con nota.
-- El semestre sale de «semestre_ubicacion» del reporte de créditos (dv_cred); sin ese reporte
-- cargado el semestre llega vacío y el portal lo dice.
-- =============================================================================

-- La carga vigente de cualquier conjunto en un periodo y sede (solo para las funciones del Monitor).
create or replace function public.wh_monitor_carga_conjunto(p_conjunto text, p_periodo text, p_sede text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
    from public.wh_cargas c
   where c.conjunto = p_conjunto and c.periodo = p_periodo and c.sede = p_sede and c.estado = 'guardada'
   order by c.version desc
   limit 1;
$$;

revoke all on function public.wh_monitor_carga_conjunto(text, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Historial por estudiante y periodo (solo grupos de plan «tres cortes», como wh_monitor_resumen)
-- -----------------------------------------------------------------------------
create or replace function public.wh_monitor_historial(
  p_sede text,
  p_periodos text[],
  p_programa text default null,
  p_estudiante text default null,
  p_aprueba numeric default 3.0,
  p_aprueba_medicina numeric default 3.5
)
returns table (
  estudiante text,
  codigo_programa text,
  programa text,
  periodo text,
  semestre int,
  grupo_etario text,
  origen text,
  materias int,
  con_p1 int, con_p2 int, con_p3 int, con_fin int,
  prom_p1 numeric, prom_p2 numeric, prom_p3 numeric, prom_fin numeric,
  riesgo_p1 int, riesgo_p2 int, riesgo_p3 int, riesgo_fin int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  visibles text[];
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  if coalesce(array_length(p_periodos, 1), 0) > 12 then
    raise exception 'monitor: demasiados periodos';
  end if;
  visibles := public.wh_monitor_codigos();
  return query
    with per as (select distinct x as pr from unnest(p_periodos) x),
    cargas as (
      select per.pr,
             public.wh_monitor_carga_conjunto('dv_notas', per.pr, p_sede) as c_notas,
             public.wh_monitor_carga_conjunto('dv_cred', per.pr, p_sede) as c_cred,
             public.wh_monitor_carga_conjunto('dv_matric', per.pr, p_sede) as c_matric
        from per
    ),
    planes as (
      select c.pr, pl.codigo_materia as cm, pl.grupo as gr, pl.plan as pln
        from cargas c
       cross join lateral public.wh_monitor_planes(c.pr, p_sede) pl
       where c.c_notas is not null
    ),
    n as (
      select c.pr,
             f.datos->>'codigo_estudiante' as es,
             f.datos->>'codigo_programa' as cod,
             f.datos->>'nombre_programa' as prog,
             public.wh_num(f.datos->>'p1') as p1,
             public.wh_num(f.datos->>'p2') as p2,
             public.wh_num(f.datos->>'p3') as p3,
             case when public.wh_num(f.datos->>'nota_acumulada') > 0 then public.wh_num(f.datos->>'nota_acumulada') end as fin,
             public.wh_nota_aprueba(f.datos->>'nombre_programa', p_aprueba, p_aprueba_medicina) as apr
        from cargas c
        join public.wh_filas f on f.carga_id = c.c_notas
        left join planes pl on pl.pr = c.pr and pl.cm = btrim(f.datos->>'codigo_materia') and pl.gr = upper(btrim(f.datos->>'grupo'))
       where (visibles is null or f.datos->>'codigo_programa' = any (visibles))
         and (p_programa is null or f.datos->>'codigo_programa' = p_programa)
         and (p_estudiante is null or f.datos->>'codigo_estudiante' = p_estudiante)
         and coalesce(pl.pln, public.wh_plan_norm(f.datos->>'plan')) = 'tres_cortes'
    ),
    agg as (
      select n.pr, n.es, n.cod, min(n.prog) as prog, count(*)::int as materias,
             count(n.p1)::int as c1, count(n.p2)::int as c2, count(n.p3)::int as c3, count(n.fin)::int as cf,
             round(avg(n.p1), 2) as a1, round(avg(n.p2), 2) as a2, round(avg(n.p3), 2) as a3, round(avg(n.fin), 2) as af,
             (count(*) filter (where n.p1 < n.apr))::int as r1,
             (count(*) filter (where n.p2 < n.apr))::int as r2,
             (count(*) filter (where n.p3 < n.apr))::int as r3,
             (count(*) filter (where n.fin < n.apr))::int as rf
        from n
       group by n.pr, n.es, n.cod
    ),
    sem as (
      select c.pr, f.datos->>'codigo' as es,
             max(case when v.n between 1 and 20 then v.n end) as semestre
        from cargas c
        join public.wh_filas f on f.carga_id = c.c_cred
       cross join lateral (select nullif(substring(f.datos->>'semestre_ubicacion' from '[0-9]+'), '')::int as n) v
       group by c.pr, f.datos->>'codigo'
    ),
    mat as (
      select c.pr, f.datos->>'codigo' as es, max(f.datos->>'grupo_etario') as etario, max(f.datos->>'origen') as org
        from cargas c
        join public.wh_filas f on f.carga_id = c.c_matric
       group by c.pr, f.datos->>'codigo'
    )
    select a.es, a.cod, a.prog, a.pr, s.semestre::int, m.etario, m.org,
           a.materias, a.c1, a.c2, a.c3, a.cf, a.a1, a.a2, a.a3, a.af, a.r1, a.r2, a.r3, a.rf
      from agg a
      left join sem s on s.pr = a.pr and s.es = a.es
      left join mat m on m.pr = a.pr and m.es = a.es;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reprobación por programa × materia × grupo × corte, solo de los estudiantes de un semestre
-- (mismas columnas que wh_monitor_riesgo; corte 4 = nota final)
-- -----------------------------------------------------------------------------
create or replace function public.wh_monitor_riesgo_semestre(
  p_periodo text,
  p_sede text,
  p_programa text,
  p_semestre int default null,
  p_aprueba numeric default 3.0,
  p_aprueba_medicina numeric default 3.5
)
returns table (
  codigo_programa text,
  programa text,
  codigo_materia text,
  materia text,
  grupo text,
  grupo_clave text,
  plan text,
  corte int,
  con int,
  bajo int,
  promedio numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  carga uuid;
  c_cred uuid;
  visibles text[];
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  c_cred := public.wh_monitor_carga_conjunto('dv_cred', p_periodo, p_sede);
  visibles := public.wh_monitor_codigos();
  return query
    with planes as (select * from public.wh_monitor_planes(p_periodo, p_sede)),
    sem as (
      select f.datos->>'codigo' as es,
             max(case when v.n between 1 and 20 then v.n end) as semestre
        from public.wh_filas f
       cross join lateral (select nullif(substring(f.datos->>'semestre_ubicacion' from '[0-9]+'), '')::int as n) v
       where f.carga_id = c_cred
       group by f.datos->>'codigo'
    ),
    n as (
      select f.datos->>'codigo_programa' as cod,
             f.datos->>'nombre_programa' as prog,
             btrim(f.datos->>'codigo_materia') as cm,
             f.datos->>'nombre_materia' as mat,
             upper(btrim(f.datos->>'grupo')) as gr,
             coalesce(pl.plan, public.wh_plan_norm(f.datos->>'plan')) as pln,
             public.wh_num(f.datos->>'p1') as p1,
             public.wh_num(f.datos->>'p2') as p2,
             public.wh_num(f.datos->>'p3') as p3,
             public.wh_num(f.datos->>'nota_acumulada') as fin,
             public.wh_nota_aprueba(f.datos->>'nombre_programa', p_aprueba, p_aprueba_medicina) as apr
        from public.wh_filas f
        left join planes pl on pl.codigo_materia = btrim(f.datos->>'codigo_materia') and pl.grupo = upper(btrim(f.datos->>'grupo'))
        left join sem s on s.es = f.datos->>'codigo_estudiante'
       where f.carga_id = carga
         and f.datos->>'codigo_programa' = p_programa
         and (visibles is null or f.datos->>'codigo_programa' = any (visibles))
         and (p_semestre is null or s.semestre = p_semestre)
    )
    select n.cod, min(n.prog), n.cm, min(n.mat), n.gr, public.wh_grupo_clave(n.cm, n.gr), n.pln, v.corte,
           count(v.nota)::int,
           (count(*) filter (where v.nota < n.apr))::int,
           round(avg(v.nota), 2)
      from n
     cross join lateral (values (1, n.p1), (2, n.p2), (3, n.p3), (4, case when n.fin > 0 then n.fin end)) v(corte, nota)
     where v.nota is not null
       and (v.corte = 4 or n.pln = 'tres_cortes')
     group by n.cod, n.cm, n.gr, n.pln, v.corte
    having count(v.nota) >= 5;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reprobación por programa × materia × corte en varios periodos (evolución de los cursos)
-- -----------------------------------------------------------------------------
create or replace function public.wh_monitor_cursos_historial(
  p_sede text,
  p_periodos text[],
  p_programa text default null,
  p_aprueba numeric default 3.0,
  p_aprueba_medicina numeric default 3.5
)
returns table (
  periodo text,
  codigo_programa text,
  programa text,
  codigo_materia text,
  materia text,
  corte int,
  con int,
  bajo int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  visibles text[];
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  if coalesce(array_length(p_periodos, 1), 0) > 12 then
    raise exception 'monitor: demasiados periodos';
  end if;
  visibles := public.wh_monitor_codigos();
  return query
    with per as (select distinct x as pr from unnest(p_periodos) x),
    cargas as (
      select per.pr, public.wh_monitor_carga_conjunto('dv_notas', per.pr, p_sede) as c_notas from per
    ),
    planes as (
      select c.pr, pl.codigo_materia as cm, pl.grupo as gr, pl.plan as pln
        from cargas c
       cross join lateral public.wh_monitor_planes(c.pr, p_sede) pl
       where c.c_notas is not null
    ),
    n as (
      select c.pr,
             f.datos->>'codigo_programa' as cod,
             f.datos->>'nombre_programa' as prog,
             btrim(f.datos->>'codigo_materia') as cm,
             f.datos->>'nombre_materia' as mat,
             coalesce(pl.pln, public.wh_plan_norm(f.datos->>'plan')) as pln,
             public.wh_num(f.datos->>'p1') as p1,
             public.wh_num(f.datos->>'p2') as p2,
             public.wh_num(f.datos->>'p3') as p3,
             public.wh_num(f.datos->>'nota_acumulada') as fin,
             public.wh_nota_aprueba(f.datos->>'nombre_programa', p_aprueba, p_aprueba_medicina) as apr
        from cargas c
        join public.wh_filas f on f.carga_id = c.c_notas
        left join planes pl on pl.pr = c.pr and pl.cm = btrim(f.datos->>'codigo_materia') and pl.gr = upper(btrim(f.datos->>'grupo'))
       where (visibles is null or f.datos->>'codigo_programa' = any (visibles))
         and (p_programa is null or f.datos->>'codigo_programa' = p_programa)
    )
    select n.pr, n.cod, min(n.prog), n.cm, min(n.mat), v.corte,
           count(v.nota)::int,
           (count(*) filter (where v.nota < n.apr))::int
      from n
     cross join lateral (values (1, n.p1), (2, n.p2), (3, n.p3), (4, case when n.fin > 0 then n.fin end)) v(corte, nota)
     where v.nota is not null
       and (v.corte = 4 or n.pln = 'tres_cortes')
     group by n.pr, n.cod, n.cm, v.corte
    having count(v.nota) >= 5;
end;
$$;

revoke all on function public.wh_monitor_historial(text, text[], text, text, numeric, numeric) from public, anon;
revoke all on function public.wh_monitor_riesgo_semestre(text, text, text, int, numeric, numeric) from public, anon;
revoke all on function public.wh_monitor_cursos_historial(text, text[], text, numeric, numeric) from public, anon;
grant execute on function public.wh_monitor_historial(text, text[], text, text, numeric, numeric) to authenticated;
grant execute on function public.wh_monitor_riesgo_semestre(text, text, text, int, numeric, numeric) to authenticated;
grant execute on function public.wh_monitor_cursos_historial(text, text[], text, numeric, numeric) to authenticated;

comment on function public.wh_monitor_historial(text, text[], text, text, numeric, numeric) is
  'Portal /alertas: una fila por estudiante y periodo, con el alcance del Monitor (wh_monitor_puede y wh_monitor_codigos).';

notify pgrst, 'reload schema';
