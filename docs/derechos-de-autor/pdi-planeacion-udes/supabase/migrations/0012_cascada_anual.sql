-- =============================================================================
-- PDI · 0012 · La cascada, año a año.
--
-- La 0011 dio a cada indicador su serie anual, pero solo el año más reciente
-- llegaba al pilar: el resto se leía en la tabla y desaparecía. La pregunta que
-- no se podía responder era "¿cómo iba esta línea en 2024?".
--
-- Dos cambios:
--
-- 1. La cascada se recorre completa **para cada año**. Mismas reglas que la
--    cascada agregada, aplicadas al cumplimiento de ese año concreto:
--
--      indicador → su cumplimiento del año (recortado a 0-100)
--      proyecto  → promedio de sus indicadores en ese año
--      línea     → promedio de sus proyectos y de los indicadores que cuelgan
--                  de ella sin proyecto
--      área      → promedio de sus líneas
--      pilar     → promedio de sus áreas, o de sus indicadores si no hay áreas
--
--    Un año solo existe donde hay algo reportado: una línea cuyos proyectos no
--    han reportado 2026 no aparece con un cero en 2026, aparece sin 2026. Un
--    cero dicho por falta de datos es peor que no decir nada.
--
--    Todo sale de `v_year_progress`, una sola vista que apila los cinco
--    niveles con su ámbito: la pantalla pide una vez y arma sus columnas.
--
-- 2. Se corrige un hueco de la cascada agregada: un indicador colgado
--    directamente de una línea, sin proyecto, no contaba para nada. La línea
--    solo promediaba proyectos, de modo que reportar ese indicador no movía ni
--    la línea, ni el área, ni el pilar.
--
--    Ahora la línea promedia sus **piezas**: sus proyectos y esos indicadores
--    sueltos. Los indicadores que sí tienen proyecto siguen llegando por él y
--    no se cuentan dos veces.
--
--    Esto puede mover el porcentaje de las líneas que tuvieran indicadores sin
--    proyecto: antes se ignoraban, ahora pesan.
--
-- Es idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La cascada agregada cuenta ya todos los indicadores
--
-- Se recrean en orden de dependencia, como en 0010. v_project_progress,
-- v_area_progress, v_pillar_progress y v_pdi_summary no cambian de regla, pero
-- cuelgan de v_line_progress y hay que volver a crearlas.
-- -----------------------------------------------------------------------------

drop view if exists public.v_pdi_summary cascade;
drop view if exists public.v_pillar_progress cascade;
drop view if exists public.v_area_progress cascade;
drop view if exists public.v_line_progress cascade;
drop view if exists public.v_project_progress cascade;
drop view if exists public.v_action_lines cascade;

-- --- Proyecto ----------------------------------------------------------------

create view public.v_project_progress
with (security_invoker = on) as
select
  p.id                                             as project_id,
  p.pillar_id,
  p.action_line_id,
  p.name,
  p.progress                                       as reported_progress,
  case
    when count(a.id) > 0 then round(avg(a.progress))::integer
    else p.progress
  end                                              as progress,
  count(a.id)::integer                             as activity_count,
  count(a.id) filter (where a.status = 'cumplida')::integer as activity_done,
  count(a.id) > 0                                  as is_derived,
  p.target_value,
  p.achieved_value,
  p.measure_unit
from public.projects p
left join public.activities a on a.project_id = p.id
group by p.id;

-- --- Línea de acción ---------------------------------------------------------

create view public.v_line_progress
with (security_invoker = on) as
with piezas as (
  -- Lo que promedia la línea: cada proyecto cuenta una vez, y cada indicador
  -- que no cuelga de ningún proyecto, también. Un indicador dentro de un
  -- proyecto ya llegó por él; sumarlo aparte le daría doble peso.
  select p.action_line_id as line_id, pp.progress
  from public.projects p
  join public.v_project_progress pp on pp.project_id = p.id
  where p.action_line_id is not null
  union all
  select a.action_line_id, a.progress
  from public.activities a
  where a.action_line_id is not null and a.project_id is null
),
resumen as (
  select line_id, round(avg(progress))::integer as progress, count(*)::integer as source_count
  from piezas
  group by line_id
),
conteos as (
  select
    p.action_line_id                    as line_id,
    count(*)::integer                   as project_count
  from public.projects p
  where p.action_line_id is not null
  group by p.action_line_id
),
indicadores as (
  select
    a.action_line_id                                                  as line_id,
    count(*)::integer                                                 as activity_count,
    count(*) filter (where a.status = 'cumplida')::integer            as activity_done,
    count(*) filter (where a.project_id is null)::integer             as loose_count
  from public.activities a
  where a.action_line_id is not null
  group by a.action_line_id
)
select
  l.id                                        as line_id,
  l.area_id,
  area.pillar_id,
  l.progress                                  as reported_progress,
  -- El reporte manual sobrevive como respaldo: una línea sin nada colgando
  -- conserva el porcentaje que valida el comité.
  coalesce(r.progress, l.progress)            as progress,
  coalesce(c.project_count, 0)                as project_count,
  coalesce(r.source_count, 0) > 0             as is_derived,
  coalesce(r.source_count, 0)                 as source_count,
  -- Cuántos indicadores entran en el promedio por su cuenta. La intranet lo
  -- usa para decir de dónde sale el número.
  coalesce(i.loose_count, 0)                  as loose_activity_count,
  coalesce(i.activity_count, 0)               as activity_count,
  coalesce(i.activity_done, 0)                as activity_done,
  l.target_value,
  l.achieved_value,
  l.measure_unit
from public.action_lines l
join public.strategic_areas area on area.id = l.area_id
left join resumen     r on r.line_id = l.id
left join conteos     c on c.line_id = l.id
left join indicadores i on i.line_id = l.id;

-- --- Área estratégica --------------------------------------------------------

create view public.v_area_progress
with (security_invoker = on) as
select
  area.id                                          as area_id,
  area.pillar_id,
  area.code                                        as area_code,
  area.name                                        as area_name,
  coalesce(round(avg(lp.progress))::integer, 0)    as progress,
  count(lp.line_id)::integer                       as line_count,
  coalesce(sum(lp.project_count), 0)::integer      as project_count,
  coalesce(sum(lp.activity_count), 0)::integer     as activity_count,
  coalesce(sum(lp.activity_done), 0)::integer      as activity_done,
  area.target_value,
  area.achieved_value,
  area.measure_unit
from public.strategic_areas area
left join public.v_line_progress lp on lp.area_id = area.id
group by area.id;

-- --- Línea con su área resuelta ----------------------------------------------

create view public.v_action_lines
with (security_invoker = on) as
select
  l.id,
  l.code,
  l.name,
  lp.progress,
  l.position,
  area.id                                          as area_id,
  area.name                                        as area_name,
  area.pillar_id,
  lp.reported_progress,
  lp.project_count,
  lp.is_derived,
  area.code                                        as area_code,
  lp.activity_count,
  lp.activity_done,
  lp.source_count,
  lp.loose_activity_count,
  lp.target_value,
  lp.achieved_value,
  lp.measure_unit
from public.action_lines l
join public.strategic_areas area on area.id = l.area_id
join public.v_line_progress lp on lp.line_id = l.id;

-- --- Pilar -------------------------------------------------------------------

create view public.v_pillar_progress
with (security_invoker = on) as
with conteos as (
  select
    p.id                                                        as pillar_id,
    p.slug,
    count(a.id) filter (where a.status = 'cumplida')::integer    as done,
    count(a.id) filter (where a.status = 'curso')::integer       as active,
    count(a.id) filter (where a.status = 'pendiente')::integer   as pending,
    count(a.id) filter (where a.status = 'riesgo')::integer      as risk,
    count(a.id)::integer                                         as total,
    case when count(a.id) = 0 then null else round(avg(a.progress))::integer end as activity_average
  from public.pillars p
  left join public.activities a on a.pillar_id = p.id
  group by p.id
),
estructura as (
  select
    pillar_id,
    round(avg(progress))::integer as progress,
    count(*)::integer             as area_count,
    sum(line_count)::integer      as line_count,
    sum(project_count)::integer   as project_count
  from public.v_area_progress
  group by pillar_id
)
select
  c.pillar_id,
  c.slug,
  c.done,
  c.active,
  c.pending,
  c.risk,
  c.total,
  case
    when coalesce(e.line_count, 0) > 0 then e.progress
    when c.activity_average is not null then c.activity_average
    else 0
  end                                                            as progress,
  case when c.total = 0 then 0 else round(c.done * 100.0 / c.total)::integer end as completion_rate,
  coalesce(e.area_count, 0)                                      as area_count,
  coalesce(e.line_count, 0)                                      as line_count,
  coalesce(e.project_count, 0)                                   as project_count
from conteos c
left join estructura e on e.pillar_id = c.pillar_id;

-- --- Resumen del plan --------------------------------------------------------

create view public.v_pdi_summary
with (security_invoker = on) as
select
  coalesce(sum(v.done), 0)::integer                              as done,
  coalesce(sum(v.active), 0)::integer                            as active,
  coalesce(sum(v.pending), 0)::integer                           as pending,
  coalesce(sum(v.risk), 0)::integer                              as risk,
  coalesce(sum(v.total), 0)::integer                             as total,
  coalesce(round(avg(v.progress))::integer, 0)                   as progress,
  count(*) filter (where v.progress >= 80)::integer              as on_track,
  count(*) filter (where v.risk > 0)::integer                    as need_attention,
  count(*)::integer                                              as pillar_count,
  case
    when coalesce(sum(v.total), 0) = 0 then 0
    else round(sum(v.done) * 100.0 / sum(v.total))::integer
  end                                                            as completion_rate
from public.v_pillar_progress v;

-- -----------------------------------------------------------------------------
-- 2. La misma cascada, año a año
--
-- Se recorre desde el cumplimiento de cada indicador en cada año, no desde el
-- porcentaje agregado: por eso "2024" de una línea es lo que esa línea cumplió
-- en 2024, y no un recuerdo de lo que se veía entonces.
-- -----------------------------------------------------------------------------

drop view if exists public.v_year_progress cascade;
drop view if exists public.v_pillar_year cascade;
drop view if exists public.v_area_year cascade;
drop view if exists public.v_line_year cascade;
drop view if exists public.v_project_year cascade;
drop view if exists public.v_activity_year cascade;

-- --- Indicador ---------------------------------------------------------------

create view public.v_activity_year
with (security_invoker = on) as
select
  a.id                                                     as activity_id,
  a.pillar_id,
  a.action_line_id,
  a.project_id,
  t.year,
  -- Recortado a 0-100 igual que en sync_activity_progress: un 120 % es una
  -- buena noticia que se lee en la tabla del año, pero llevarlo a la cascada
  -- dejaría áreas por encima del 100 %.
  least(100, greatest(0, round(t.compliance)))::integer    as progress,
  t.target_value,
  t.result_value,
  t.compliance
from public.activities a
join public.activity_targets t on t.activity_id = a.id
where t.compliance is not null;

comment on view public.v_activity_year is
  'Cumplimiento de cada indicador en cada año. Es la hoja de la cascada anual.';

-- --- Proyecto ----------------------------------------------------------------

create view public.v_project_year
with (security_invoker = on) as
select
  p.id                              as project_id,
  p.pillar_id,
  p.action_line_id,
  ay.year,
  round(avg(ay.progress))::integer  as progress,
  count(*)::integer                 as activity_count
from public.projects p
join public.v_activity_year ay on ay.project_id = p.id
group by p.id, ay.year;

-- --- Línea de acción ---------------------------------------------------------

create view public.v_line_year
with (security_invoker = on) as
with piezas as (
  -- Las mismas piezas que en la cascada agregada, para que el año y el total
  -- no puedan contar cosas distintas.
  select py.action_line_id as line_id, py.year, py.progress
  from public.v_project_year py
  where py.action_line_id is not null
  union all
  select ay.action_line_id, ay.year, ay.progress
  from public.v_activity_year ay
  where ay.action_line_id is not null and ay.project_id is null
)
select
  l.id                                  as line_id,
  l.area_id,
  area.pillar_id,
  piezas.year,
  round(avg(piezas.progress))::integer  as progress,
  count(*)::integer                     as source_count
from public.action_lines l
join public.strategic_areas area on area.id = l.area_id
join piezas on piezas.line_id = l.id
group by l.id, l.area_id, area.pillar_id, piezas.year;

-- --- Área estratégica --------------------------------------------------------

create view public.v_area_year
with (security_invoker = on) as
select
  area.id                             as area_id,
  area.pillar_id,
  ly.year,
  round(avg(ly.progress))::integer    as progress,
  count(*)::integer                   as line_count
from public.strategic_areas area
join public.v_line_year ly on ly.area_id = area.id
group by area.id, area.pillar_id, ly.year;

-- --- Pilar -------------------------------------------------------------------

create view public.v_pillar_year
with (security_invoker = on) as
with por_area as (
  select pillar_id, year, round(avg(progress))::integer as progress, count(*)::integer as area_count
  from public.v_area_year
  group by pillar_id, year
),
por_indicador as (
  select pillar_id, year, round(avg(progress))::integer as progress, count(*)::integer as activity_count
  from public.v_activity_year
  group by pillar_id, year
)
select
  coalesce(a.pillar_id, i.pillar_id)      as pillar_id,
  coalesce(a.year, i.year)                as year,
  -- Igual que en la cascada agregada: manda la estructura; los indicadores
  -- sueltos solo hablan cuando el pilar todavía no tiene áreas.
  coalesce(a.progress, i.progress)        as progress,
  coalesce(a.area_count, 0)               as area_count,
  coalesce(i.activity_count, 0)           as activity_count
from por_area a
full join por_indicador i on i.pillar_id = a.pillar_id and i.year = a.year;

-- --- Los cinco niveles en una sola vista -------------------------------------
--
-- Una tabla con una columna por año necesita el avance de todas sus filas a la
-- vez. Con cinco vistas serían cinco peticiones por pantalla; apiladas, es una.

create view public.v_year_progress
with (security_invoker = on) as
select 'pillar'::text   as scope, pillar_id   as entity_id, pillar_id, year, progress from public.v_pillar_year
union all
select 'area',            area_id,              pillar_id, year, progress from public.v_area_year
union all
select 'line',            line_id,              pillar_id, year, progress from public.v_line_year
union all
select 'project',         project_id,           pillar_id, year, progress from public.v_project_year
union all
select 'activity',        activity_id,          pillar_id, year, progress from public.v_activity_year;

comment on view public.v_year_progress is
  'Avance por año de los cinco niveles del plan. scope dice de qué nivel es cada fila.';

-- -----------------------------------------------------------------------------
-- 3. Permisos y caché de la API
-- -----------------------------------------------------------------------------

grant select on
  public.v_project_progress,
  public.v_line_progress,
  public.v_area_progress,
  public.v_action_lines,
  public.v_pillar_progress,
  public.v_pdi_summary,
  public.v_activity_year,
  public.v_project_year,
  public.v_line_year,
  public.v_area_year,
  public.v_pillar_year,
  public.v_year_progress
to anon, authenticated;

notify pgrst, 'reload schema';
