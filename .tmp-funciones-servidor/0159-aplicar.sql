-- =============================================================================
-- 0159 · Warehouse UDES · alertas de notas según el estudio de la UDES
--
-- Fuente: «Estrategias de intervención preventiva para fomentar la permanencia
-- y éxito estudiantil: alertas tempranas» (Pérez, Mejía, Serrano, Suescún y
-- León, UDES, 2023; DOI 10.37885/230914480). De él salen tres reglas de la
-- escala y dos factores de contexto que los reportes ya traen:
--
--   · Escala 0–5. Aprobar es 3,0, salvo Medicina, donde es 3,5. Un promedio
--     por debajo de 3,2 al cerrar el periodo es «periodo de prueba académica».
--   · El éxito se mide con promedio superior a 3,8.
--   · Deserción (cohortes 2017–2020): con promedio bajo (< 3,3) es 16,7 veces
--     más probable que con promedio alto (> 4,3); con promedio medio, 2,2 veces.
--     Entre 21 y 25 años, 3,1 veces; con 26 o más, 5,1 veces, frente a menores
--     de 20. Venir de fuera de Santander, 1,4 veces.
--
-- Esta migración:
--   1. wh_notas_resumen cuenta las materias perdidas con la nota de aprobar de
--      cada programa (3,5 en Medicina, 3,0 en los demás).
--   2. wh_notas_grupos: un renglón por materia y grupo con su promedio y cuántos
--      estudiantes van bajo la nota de aprobar en cada corte. Es la «Alerta
--      Temprana 4» del estudio (cursos con alta reprobación) calculada con las
--      notas de cada estudiante.
--   3. La política de «Estudiantes matriculados» (dv_matric) añade dos columnas
--      DERIVADAS, que no identifican a nadie: `grupo_etario` (≤20, 21–25, 26+) y
--      `origen` (Santander / Otro departamento). Se calculan al cargar, antes de
--      descartar la fecha de nacimiento y la ciudad, que siguen sin guardarse.
--
-- Requiere 0155–0158. Idempotente.
-- =============================================================================

update public.wh_politicas
   set lista = (select array_agg(distinct x) from unnest(lista || array['grupo_etario', 'origen']) x),
       nota = 'Se descartan documento, nombres, género, nacimiento, ciudad, dirección, barrio, estrato, teléfonos, correos, colegio, salud y responsable de matrícula. Se derivan, sin identificar a nadie, el grupo etario y si viene de Santander.'
 where conjunto = 'dv_matric'
   and not ('grupo_etario' = any (lista));

-- La nota de aprobar de cada programa: 3,5 en Medicina (no en Medicina Veterinaria), 3,0 en el resto.
create or replace function public.wh_nota_aprueba(p_programa text, p_general numeric default 3.0, p_medicina numeric default 3.5)
returns numeric
language sql
immutable
as $$
  select case when upper(btrim(coalesce(p_programa, ''))) in ('MEDICINA', 'MEDICINA GENERAL') then p_medicina else p_general end;
$$;

drop function if exists public.wh_notas_resumen(text, text, numeric);

create or replace function public.wh_notas_resumen(p_periodo text, p_sede text, p_aprueba numeric default 3.0, p_aprueba_medicina numeric default 3.5)
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
           public.wh_num(f.datos->>'p3')  as p3,
           public.wh_nota_aprueba(f.datos->>'nombre_programa', p_aprueba, p_aprueba_medicina) as apr
      from public.wh_filas f
     where f.carga_id = (select id from carga)
  )
  select n.est,
         min(n.prog),
         count(*)::int,
         count(n.p1)::int, count(n.p2)::int, count(n.p3)::int,
         round(avg(n.p1), 2), round(avg(n.p2), 2), round(avg(n.p3), 2),
         (count(*) filter (where n.p1 < n.apr))::int,
         (count(*) filter (where n.p2 < n.apr))::int,
         (count(*) filter (where n.p3 < n.apr))::int
    from n
   group by n.est;
$$;

comment on function public.wh_notas_resumen(text, text, numeric, numeric) is
  'Warehouse: un renglón por estudiante con sus materias, el promedio de cada corte y cuántas materias van bajo la nota de aprobar de su programa (3,5 en Medicina).';

create or replace function public.wh_notas_grupos(p_periodo text, p_sede text, p_aprueba numeric default 3.0, p_aprueba_medicina numeric default 3.5)
returns table (
  codigo_materia text,
  materia text,
  grupo text,
  programa text,
  estudiantes int,
  con_p1 int,
  con_p2 int,
  con_p3 int,
  prom_p1 numeric,
  prom_p2 numeric,
  prom_p3 numeric,
  bajo_p1 int,
  bajo_p2 int,
  bajo_p3 int
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
    select f.datos->>'codigo_materia' as cm,
           f.datos->>'nombre_materia' as mat,
           f.datos->>'grupo'          as gr,
           f.datos->>'nombre_programa' as prog,
           public.wh_num(f.datos->>'p1') as p1,
           public.wh_num(f.datos->>'p2') as p2,
           public.wh_num(f.datos->>'p3') as p3,
           public.wh_nota_aprueba(f.datos->>'nombre_programa', p_aprueba, p_aprueba_medicina) as apr
      from public.wh_filas f
     where f.carga_id = (select id from carga)
  )
  select n.cm, min(n.mat), n.gr, min(n.prog),
         count(*)::int,
         count(n.p1)::int, count(n.p2)::int, count(n.p3)::int,
         round(avg(n.p1), 2), round(avg(n.p2), 2), round(avg(n.p3), 2),
         (count(*) filter (where n.p1 < n.apr))::int,
         (count(*) filter (where n.p2 < n.apr))::int,
         (count(*) filter (where n.p3 < n.apr))::int
    from n
   group by n.cm, n.gr;
$$;

comment on function public.wh_notas_grupos(text, text, numeric, numeric) is
  'Warehouse: un renglón por materia y grupo con su promedio y cuántos estudiantes van bajo la nota de aprobar en cada corte (cursos con alta reprobación).';

revoke all on function public.wh_nota_aprueba(text, numeric, numeric) from public, anon;
revoke all on function public.wh_notas_resumen(text, text, numeric, numeric) from public, anon;
revoke all on function public.wh_notas_grupos(text, text, numeric, numeric) from public, anon;
grant execute on function public.wh_nota_aprueba(text, numeric, numeric) to authenticated;
grant execute on function public.wh_notas_resumen(text, text, numeric, numeric) to authenticated;
grant execute on function public.wh_notas_grupos(text, text, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('0159');
