-- =============================================================================
-- PDI · 0010 · Metas absolutas y conteos para el cuadro de mando.
--
-- La nueva vista de detalle del tablero necesita dos cosas que el esquema no
-- tenía:
--
-- 1. Meta y avance en valores absolutos ("28 de 40 convenios"). Hasta ahora
--    todo eran porcentajes, y una tabla de resultados sin la cifra que hay
--    detrás obliga a creerse el porcentaje.
--
--    Son opcionales: mientras no se capturen, la interfaz muestra en su lugar
--    el conteo de actividades, que sí existe siempre.
--
-- 2. Cuántas actividades cuelgan de cada área, línea y proyecto, y cuántas
--    están cumplidas. Se resuelve en las vistas, no en columnas.
--
-- El porcentaje de avance sigue siendo el de la cascada de 0008: una sola
-- fuente para toda la aplicación.
--
-- Es idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Meta y avance absolutos
-- -----------------------------------------------------------------------------

do $$
declare
  tabla text;
begin
  foreach tabla in array array['strategic_areas', 'action_lines', 'projects'] loop
    execute format('alter table public.%I add column if not exists target_value numeric(14, 2)', tabla);
    execute format('alter table public.%I add column if not exists achieved_value numeric(14, 2)', tabla);
    execute format('alter table public.%I add column if not exists measure_unit text', tabla);
  end loop;
end $$;

comment on column public.action_lines.target_value is
  'Meta en valor absoluto (40 convenios, 12 aulas…). Nula mientras no se capture.';
comment on column public.action_lines.achieved_value is
  'Lo alcanzado, en la misma unidad que la meta.';
comment on column public.action_lines.measure_unit is
  'Unidad de la meta, para poder escribir "28 de 40 convenios".';

-- -----------------------------------------------------------------------------
-- 2. Vistas: se recrean en orden de dependencia
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
select
  l.id                                             as line_id,
  l.area_id,
  area.pillar_id,
  l.progress                                       as reported_progress,
  case
    when count(distinct pp.project_id) > 0 then round(avg(pp.progress))::integer
    else l.progress
  end                                              as progress,
  count(distinct pp.project_id)::integer           as project_count,
  count(distinct pp.project_id) > 0                as is_derived,
  -- Las actividades se cuentan por su propia línea, no a través del proyecto:
  -- una actividad puede colgar de la línea sin pertenecer a ningún proyecto.
  count(distinct act.id)::integer                             as activity_count,
  count(distinct act.id) filter (where act.status = 'cumplida')::integer as activity_done,
  l.target_value,
  l.achieved_value,
  l.measure_unit
from public.action_lines l
join public.strategic_areas area on area.id = l.area_id
left join public.v_project_progress pp on pp.action_line_id = l.id
left join public.activities act on act.action_line_id = l.id
group by l.id, area.pillar_id;

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
-- Permisos y caché
-- -----------------------------------------------------------------------------

grant select on
  public.v_project_progress,
  public.v_line_progress,
  public.v_area_progress,
  public.v_action_lines,
  public.v_pillar_progress,
  public.v_pdi_summary
to anon, authenticated;

notify pgrst, 'reload schema';
