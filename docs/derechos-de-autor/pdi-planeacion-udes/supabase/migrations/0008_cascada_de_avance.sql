-- =============================================================================
-- PDI · 0008 · El avance se propaga hacia arriba.
--
-- Hasta ahora solo el pilar derivaba su porcentaje (contando actividades). La
-- línea de acción guardaba un número escrito a mano, el área no tenía ninguno y
-- el proyecto vivía aislado: mover el avance de un proyecto no cambiaba nada
-- por encima de él.
--
-- A partir de aquí cada nivel es el promedio del nivel inferior:
--
--     actividad   → porcentaje reportado (la hoja)
--     proyecto    → promedio de sus actividades, o su reporte si no tiene
--     línea       → promedio de sus proyectos,  o su reporte si no tiene
--     área        → promedio de sus líneas
--     pilar       → promedio de sus áreas, o de sus actividades si no hay áreas
--
-- El reporte manual sigue existiendo como respaldo: una línea sin proyectos
-- conserva el porcentaje que valida el comité. En cuanto cuelga un proyecto de
-- ella, manda el cálculo — y la intranet lo dice, para que nadie edite un número
-- que ya no se usa.
--
-- Todo se resuelve con vistas y no con columnas: un valor almacenado tendría
-- que mantenerse sincronizado con disparadores en cinco tablas, y bastaría un
-- fallo para que el pilar dijera una cosa y sus proyectos otra.
--
-- Es idempotente.
-- =============================================================================

-- Se recrean en orden de dependencia. CASCADE arrastra a las que dependen de
-- ellas; se vuelven a crear todas más abajo.
drop view if exists public.v_pdi_summary cascade;
drop view if exists public.v_pillar_progress cascade;
drop view if exists public.v_area_progress cascade;
drop view if exists public.v_line_progress cascade;
drop view if exists public.v_project_progress cascade;
drop view if exists public.v_action_lines cascade;

-- -----------------------------------------------------------------------------
-- Proyecto: promedio de sus actividades
-- -----------------------------------------------------------------------------

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
  count(a.id) > 0                                  as is_derived
from public.projects p
left join public.activities a on a.project_id = p.id
group by p.id;

comment on view public.v_project_progress is
  'Avance de cada proyecto: promedio de sus actividades, o el porcentaje reportado si todavía no tiene ninguna.';

-- -----------------------------------------------------------------------------
-- Línea de acción: promedio de sus proyectos
-- -----------------------------------------------------------------------------

create view public.v_line_progress
with (security_invoker = on) as
select
  l.id                                             as line_id,
  l.area_id,
  area.pillar_id,
  l.progress                                       as reported_progress,
  case
    when count(pp.project_id) > 0 then round(avg(pp.progress))::integer
    else l.progress
  end                                              as progress,
  count(pp.project_id)::integer                    as project_count,
  count(pp.project_id) > 0                         as is_derived
from public.action_lines l
join public.strategic_areas area on area.id = l.area_id
left join public.v_project_progress pp on pp.action_line_id = l.id
group by l.id, area.pillar_id;

comment on view public.v_line_progress is
  'Avance de cada línea: promedio de sus proyectos, o el cumplimiento reportado mientras no tenga ninguno.';

-- -----------------------------------------------------------------------------
-- Área estratégica: promedio de sus líneas
-- -----------------------------------------------------------------------------

create view public.v_area_progress
with (security_invoker = on) as
select
  area.id                                          as area_id,
  area.pillar_id,
  area.name                                        as area_name,
  coalesce(round(avg(lp.progress))::integer, 0)    as progress,
  count(lp.line_id)::integer                       as line_count,
  coalesce(sum(lp.project_count), 0)::integer      as project_count
from public.strategic_areas area
left join public.v_line_progress lp on lp.area_id = area.id
group by area.id;

comment on view public.v_area_progress is
  'Avance de cada área estratégica: promedio del avance de sus líneas de acción.';

-- -----------------------------------------------------------------------------
-- Línea con su área resuelta (la que consume el portal)
--
-- `progress` es ya el valor en cascada; `reported_progress` conserva el número
-- que se escribió a mano, para poder mostrarlo en la intranet.
-- -----------------------------------------------------------------------------

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
  lp.is_derived
from public.action_lines l
join public.strategic_areas area on area.id = l.area_id
join public.v_line_progress lp on lp.line_id = l.id;

-- -----------------------------------------------------------------------------
-- Pilar: promedio de sus áreas
--
-- Los conteos por estado siguen saliendo de las actividades: alimentan la barra
-- apilada y las tarjetas de estado, que responden a otra pregunta ("cuántas hay
-- de cada clase") distinta de "cuánto se ha avanzado".
-- -----------------------------------------------------------------------------

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
    case
      when count(a.id) = 0 then null
      else round(avg(a.progress))::integer
    end                                                          as activity_average
  from public.pillars p
  left join public.activities a on a.pillar_id = p.id
  group by p.id
),
estructura as (
  select
    pillar_id,
    round(avg(progress))::integer as progress,
    count(*)::integer             as area_count,
    sum(line_count)::integer      as line_count
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
  -- Cascada, con dos respaldos: un pilar sin estructura todavía puede tener
  -- actividades sueltas, y uno recién creado no tiene nada.
  case
    when coalesce(e.line_count, 0) > 0 then e.progress
    when c.activity_average is not null then c.activity_average
    else 0
  end                                                            as progress,
  -- Proporción de actividades cumplidas. Se conserva porque responde a otra
  -- pregunta y porque el tablero la muestra junto al anillo.
  case
    when c.total = 0 then 0
    else round(c.done * 100.0 / c.total)::integer
  end                                                            as completion_rate,
  coalesce(e.area_count, 0)                                      as area_count,
  coalesce(e.line_count, 0)                                      as line_count
from conteos c
left join estructura e on e.pillar_id = c.pillar_id;

comment on view public.v_pillar_progress is
  'Avance de cada pilar en cascada desde sus áreas, más los conteos de actividades por estado.';

-- -----------------------------------------------------------------------------
-- Resumen del plan
-- -----------------------------------------------------------------------------

create view public.v_pdi_summary
with (security_invoker = on) as
select
  coalesce(sum(v.done), 0)::integer                              as done,
  coalesce(sum(v.active), 0)::integer                            as active,
  coalesce(sum(v.pending), 0)::integer                           as pending,
  coalesce(sum(v.risk), 0)::integer                              as risk,
  coalesce(sum(v.total), 0)::integer                             as total,
  -- Promedio de los pilares, no de las actividades: cada pilar pesa lo mismo,
  -- que es como se lee el plan.
  coalesce(round(avg(v.progress))::integer, 0)                   as progress,
  count(*) filter (where v.progress >= 80)::integer              as on_track,
  count(*) filter (where v.risk > 0)::integer                    as need_attention,
  count(*)::integer                                              as pillar_count,
  case
    when coalesce(sum(v.total), 0) = 0 then 0
    else round(sum(v.done) * 100.0 / sum(v.total))::integer
  end                                                            as completion_rate
from public.v_pillar_progress v;

comment on view public.v_pdi_summary is
  'Estado del plan completo. progress = promedio de los pilares; completion_rate = proporción de actividades cumplidas.';

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
