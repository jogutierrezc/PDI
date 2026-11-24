-- =============================================================================
-- PDI · 0003 · Vistas derivadas.
--
-- El avance no se guarda en ninguna columna: se calcula a partir de las
-- actividades. Guardarlo abriría la puerta a que el porcentaje del pilar y sus
-- actividades dejaran de coincidir, que es exactamente el problema que tenía el
-- portal cuando cada pantalla llevaba sus propias cifras.
--
-- Todas las vistas son SECURITY INVOKER: se evalúan con las políticas de quien
-- pregunta. Sin esa opción una vista correría con los permisos de su dueño y
-- filtraría a los anónimos el conteo de los pilares en borrador.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Avance por pilar
-- -----------------------------------------------------------------------------

create or replace view public.v_pillar_progress
with (security_invoker = on) as
select
  p.id                                                              as pillar_id,
  p.slug,
  count(a.id) filter (where a.status = 'cumplida')::integer         as done,
  count(a.id) filter (where a.status = 'curso')::integer            as active,
  count(a.id) filter (where a.status = 'pendiente')::integer        as pending,
  count(a.id) filter (where a.status = 'riesgo')::integer           as risk,
  count(a.id)::integer                                              as total,
  case
    when count(a.id) = 0 then 0
    else round(count(a.id) filter (where a.status = 'cumplida') * 100.0 / count(a.id))::integer
  end                                                               as progress
from public.pillars p
left join public.activities a on a.pillar_id = p.id
group by p.id, p.slug;

comment on view public.v_pillar_progress is
  'Conteo de actividades por estado y porcentaje de avance de cada pilar.';

-- -----------------------------------------------------------------------------
-- Resumen global del plan
-- -----------------------------------------------------------------------------

create or replace view public.v_pdi_summary
with (security_invoker = on) as
select
  coalesce(sum(v.done), 0)::integer                                 as done,
  coalesce(sum(v.active), 0)::integer                               as active,
  coalesce(sum(v.pending), 0)::integer                              as pending,
  coalesce(sum(v.risk), 0)::integer                                 as risk,
  coalesce(sum(v.total), 0)::integer                                as total,
  case
    when coalesce(sum(v.total), 0) = 0 then 0
    else round(sum(v.done) * 100.0 / sum(v.total))::integer
  end                                                               as progress,
  count(*) filter (where v.progress >= 80)::integer                 as on_track,
  count(*) filter (where v.risk > 0)::integer                       as need_attention,
  count(*)::integer                                                 as pillar_count
from public.v_pillar_progress v;

comment on view public.v_pdi_summary is
  'Una sola fila con el estado del plan completo, respetando lo que puede ver quien pregunta.';

-- -----------------------------------------------------------------------------
-- Indicadores con las etiquetas de los catálogos ya resueltas
-- -----------------------------------------------------------------------------

create or replace view public.v_indicators
with (security_invoker = on) as
select
  i.*,
  level.label       as level_label,
  unit.label        as unit_label,
  periodicity.label as periodicity_label
from public.indicators i
left join public.parameters level       on level.id = i.level_id
left join public.parameters unit        on unit.id = i.unit_id
left join public.parameters periodicity on periodicity.id = i.periodicity_id;

comment on view public.v_indicators is
  'Indicadores con nivel, unidad y periodicidad expandidos, para no pedir tres tablas más desde el cliente.';

-- -----------------------------------------------------------------------------
-- Cumplimiento por línea de acción, con su área y su pilar
-- -----------------------------------------------------------------------------

create or replace view public.v_action_lines
with (security_invoker = on) as
select
  l.id,
  l.code,
  l.name,
  l.progress,
  l.position,
  a.id        as area_id,
  a.name      as area_name,
  a.pillar_id
from public.action_lines l
join public.strategic_areas a on a.id = l.area_id;

-- -----------------------------------------------------------------------------
-- Corte vigente
-- -----------------------------------------------------------------------------

create or replace view public.v_current_period
with (security_invoker = on) as
select id, label, cutoff_date, published_at
from public.report_periods
where is_current
limit 1;

grant select on public.v_pillar_progress, public.v_pdi_summary, public.v_indicators,
                public.v_action_lines, public.v_current_period
  to anon, authenticated;
