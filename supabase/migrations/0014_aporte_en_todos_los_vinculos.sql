-- =============================================================================
-- PDI · 0014 · El proyecto aporta en todos sus vínculos, no solo en los que
--              llegan hasta una línea de acción.
--
-- La 0013 dejó a medias la regla que anunciaba. Decía —y sigue siendo cierto—
-- que "el avance del proyecto cuenta en cada línea vinculada", y la cascada lo
-- cumple: `v_line_progress` recorre `project_links` y suma el proyecto en cada
-- línea a la que apunte, esté en el pilar que esté.
--
-- El agujero está en los vínculos que NO llegan a una línea. El formulario de
-- proyectos permite —a propósito— vincular a un pilar entero ("Todo el pilar")
-- o a un área entera ("Toda el área"): un pilar puede no tener todavía sus
-- líneas capturadas, y obligar a elegir una impediría registrar el aporte.
--
-- Esos vínculos no llegaban a ninguna parte. La cascada entra por las líneas,
-- así que un proyecto vinculado a un pilar sin línea aparecía en su recuento de
-- proyectos y en su ficha, pero su avance no movía ni el área ni el pilar: el
-- vínculo se veía y no pesaba. Quien lo capturaba tenía razón en esperar que
-- contara.
--
-- Esta migración lo cierra: el proyecto entra en la cascada **al nivel de su
-- vínculo**.
--
--   · Vínculo con línea  → pesa dentro de esa línea, como hasta ahora.
--   · Vínculo con área   → pesa como una línea más de esa área.
--   · Vínculo con pilar  → pesa como un área más de ese pilar.
--
-- Y no se cuenta dos veces. Si un proyecto tiene en el mismo pilar un vínculo a
-- una línea y además otro al pilar entero, solo cuenta el más específico: el
-- segundo es una captura redundante, no un aporte adicional. La misma regla
-- para un vínculo a un área cuando ya hay uno a una línea de esa área.
--
-- Lo que NO cambia: un proyecto que aporta a tres pilares sigue pesando en los
-- tres. Es la decisión de la 0013 y es lo que se pidió — el trabajo aporta a
-- los tres frentes— a cambio de que ese avance pese tres veces en el total.
--
-- Se recrean las vistas en orden de dependencia, como en 0010, 0012 y 0013.
-- Es idempotente.
-- =============================================================================

drop view if exists public.v_project_entry cascade;
drop view if exists public.v_year_progress cascade;
drop view if exists public.v_pillar_year cascade;
drop view if exists public.v_area_year cascade;
drop view if exists public.v_line_year cascade;
drop view if exists public.v_project_year cascade;
drop view if exists public.v_activity_year cascade;
drop view if exists public.v_pdi_summary cascade;
drop view if exists public.v_pillar_progress cascade;
drop view if exists public.v_area_progress cascade;
drop view if exists public.v_line_progress cascade;
drop view if exists public.v_project_progress cascade;
drop view if exists public.v_action_lines cascade;

-- -----------------------------------------------------------------------------
-- 0. Dónde entra cada proyecto
--
-- Una sola vista que responde, para cada proyecto y cada pilar al que apunta,
-- a qué nivel entra en la cascada. Todo lo demás la consulta en vez de repetir
-- la regla: mientras estuvo escrita cuatro veces (avance de línea, de área, y
-- las dos anuales), cambiarla significaba acordarse de los cuatro sitios.
--
-- `level` es el nivel del vínculo ya resuelto:
--   'line'   el vínculo nombra una línea
--   'area'   nombra un área y el proyecto no entra por ninguna línea de ella
--   'pillar' nombra solo el pilar y el proyecto no entra por ninguna de sus
--            áreas ni de sus líneas
-- -----------------------------------------------------------------------------

create view public.v_project_entry
with (security_invoker = on) as
with vinculos as (
  select
    pl.project_id,
    pl.pillar_id,
    -- El área del vínculo, resuelta: cuando nombra una línea, el área es la de
    -- la línea aunque quien capturó dejara `area_id` en blanco.
    coalesce(l.area_id, pl.area_id) as area_id,
    pl.action_line_id
  from public.project_links pl
  left join public.action_lines l on l.id = pl.action_line_id

  union

  -- Respaldo para un proyecto sin ningún vínculo: su pilar y su línea de
  -- siempre. La 0013 creó los vínculos de todo lo que existía, así que esto
  -- solo cubre una fila insertada a mano saltándose el módulo.
  select p.id, p.pillar_id, l.area_id, p.action_line_id
  from public.projects p
  left join public.action_lines l on l.id = p.action_line_id
  where not exists (select 1 from public.project_links pl where pl.project_id = p.id)
)
select
  v.project_id,
  v.pillar_id,
  v.area_id,
  v.action_line_id,
  case
    when v.action_line_id is not null then 'line'
    when v.area_id is not null then 'area'
    else 'pillar'
  end::text as level
from vinculos v
where
  -- Un vínculo a un área no cuenta si el proyecto ya entra por una línea de esa
  -- misma área: sería contar dos veces el mismo aporte.
  (
    v.action_line_id is not null
    or v.area_id is null
    or not exists (
      select 1 from vinculos w
      where w.project_id = v.project_id
        and w.area_id = v.area_id
        and w.action_line_id is not null
    )
  )
  -- Y un vínculo al pilar entero no cuenta si el proyecto ya entra por alguna
  -- de sus áreas o de sus líneas.
  and (
    v.area_id is not null
    or not exists (
      select 1 from vinculos w
      where w.project_id = v.project_id
        and w.pillar_id = v.pillar_id
        and w.area_id is not null
    )
  );

comment on view public.v_project_entry is
  'A qué nivel entra cada proyecto en la cascada de cada pilar al que apunta: línea, área o pilar. Sin duplicar: solo el vínculo más específico de cada pilar.';

-- -----------------------------------------------------------------------------
-- 1. Proyecto
--
-- Gana `pillar_ids`, igual que `v_projects`. Sin esa columna, las pantallas
-- pedían el avance de los proyectos con `pillar_id = <este pilar>` —el pilar
-- dueño— y un proyecto compartido no traía sus cifras al pilar vecino: su
-- ficha caía al avance reportado a mano en vez del promedio de sus indicadores,
-- y la tabla de proyectos del cuadro de mando ni siquiera lo listaba.
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
  count(a.id) filter (where a.status = 'cumplida')::integer as activity_done,
  count(a.id) > 0                                  as is_derived,
  p.target_value,
  p.achieved_value,
  p.measure_unit,
  -- Todos los pilares en los que el proyecto entra, para filtrar por cualquiera
  -- de ellos. El respaldo cubre a un proyecto sin vínculos.
  coalesce(
    (select array_agg(distinct e.pillar_id)
     from public.v_project_entry e where e.project_id = p.id),
    array[p.pillar_id]
  )                                                as pillar_ids
from public.projects p
left join public.activities a on a.project_id = p.id
group by p.id;

-- -----------------------------------------------------------------------------
-- 2. Línea de acción
--
-- Igual que en 0013, pero leyendo los vínculos de `v_project_entry` en vez de
-- recorrer `project_links` con su respaldo escrito a mano.
-- -----------------------------------------------------------------------------

create view public.v_line_progress
with (security_invoker = on) as
with proyectos as (
  select e.action_line_id as line_id, e.project_id, pp.progress
  from public.v_project_entry e
  join public.v_project_progress pp on pp.project_id = e.project_id
  where e.level = 'line'
),
piezas as (
  select line_id, progress from proyectos
  union all
  -- Los indicadores que cuelgan de la línea sin proyecto pesan como un
  -- proyecto más. Los que sí lo tienen ya llegaron por él.
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
  select line_id, count(distinct project_id)::integer as project_count
  from proyectos
  group by line_id
),
indicadores as (
  select
    a.action_line_id                                       as line_id,
    count(*)::integer                                      as activity_count,
    count(*) filter (where a.status = 'cumplida')::integer  as activity_done,
    count(*) filter (where a.project_id is null)::integer   as loose_count
  from public.activities a
  where a.action_line_id is not null
  group by a.action_line_id
)
select
  l.id                                        as line_id,
  l.area_id,
  area.pillar_id,
  l.progress                                  as reported_progress,
  coalesce(r.progress, l.progress)            as progress,
  coalesce(c.project_count, 0)                as project_count,
  coalesce(r.source_count, 0) > 0             as is_derived,
  coalesce(r.source_count, 0)                 as source_count,
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

-- -----------------------------------------------------------------------------
-- 3. Área estratégica
--
-- Aquí está el primer cambio de fondo: además del promedio de sus líneas, el
-- área recibe los proyectos vinculados directamente a ella. Cada uno pesa como
-- una línea más, que es exactamente lo que es a efectos de la cascada: una
-- pieza de la que el área depende.
-- -----------------------------------------------------------------------------

create view public.v_area_progress
with (security_invoker = on) as
with directos as (
  select e.area_id, e.project_id, pp.progress
  from public.v_project_entry e
  join public.v_project_progress pp on pp.project_id = e.project_id
  where e.level = 'area'
),
-- El promedio del área y los conteos de sus líneas se agregan por separado y
-- se unen ya resumidos. Juntar las dos tablas antes de agrupar multiplicaría
-- las filas —cada línea contra cada proyecto directo— e inflaría los conteos.
piezas as (
  select area_id, round(avg(progress))::integer as progress, count(*)::integer as source_count
  from (
    select lp.area_id, lp.progress from public.v_line_progress lp
    union all
    select area_id, progress from directos
  ) t
  group by area_id
),
lineas as (
  select
    area_id,
    count(*)::integer               as line_count,
    sum(activity_count)::integer    as activity_count,
    sum(activity_done)::integer     as activity_done
  from public.v_line_progress
  group by area_id
),
-- Los proyectos del área: los que entran por sus líneas más los que se
-- vincularon al área entera. `distinct` porque un proyecto en dos líneas de la
-- misma área es un proyecto, no dos.
proyectos as (
  select area_id, count(distinct project_id)::integer as project_count
  from public.v_project_entry
  where area_id is not null
  group by area_id
)
select
  area.id                                          as area_id,
  area.pillar_id,
  area.code                                        as area_code,
  area.name                                        as area_name,
  coalesce(pz.progress, 0)                         as progress,
  coalesce(ln.line_count, 0)                       as line_count,
  coalesce(pr.project_count, 0)                    as project_count,
  coalesce(ln.activity_count, 0)                   as activity_count,
  coalesce(ln.activity_done, 0)                    as activity_done,
  area.target_value,
  area.achieved_value,
  area.measure_unit
from public.strategic_areas area
left join piezas    pz on pz.area_id = area.id
left join lineas    ln on ln.area_id = area.id
left join proyectos pr on pr.area_id = area.id;

-- -----------------------------------------------------------------------------
-- 4. Línea con su área resuelta (sin cambios)
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

-- -----------------------------------------------------------------------------
-- 5. Pilar
--
-- Segundo cambio de fondo: al promedio de las áreas se suman los proyectos
-- vinculados al pilar entero, cada uno con el peso de un área.
--
-- Y `progress` gana un caso: antes, un pilar sin áreas capturadas caía en el
-- promedio de sus indicadores y sus proyectos no contaban. Ahora, si hay
-- proyectos vinculados al pilar, pesan aunque no haya ni una sola línea: es el
-- escenario para el que existe el vínculo a pilar entero.
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
    case when count(a.id) = 0 then null else round(avg(a.progress))::integer end as activity_average
  from public.pillars p
  left join public.activities a on a.pillar_id = p.id
  group by p.id
),
directos as (
  select e.pillar_id, e.project_id, pp.progress
  from public.v_project_entry e
  join public.v_project_progress pp on pp.project_id = e.project_id
  where e.level = 'pillar'
),
piezas as (
  select pillar_id, progress from public.v_area_progress
  union all
  select pillar_id, progress from directos
),
estructura as (
  select
    piezas.pillar_id,
    round(avg(piezas.progress))::integer as progress,
    count(*)::integer                    as source_count
  from piezas
  group by piezas.pillar_id
),
areas as (
  select pillar_id, count(*)::integer as area_count, sum(line_count)::integer as line_count
  from public.v_area_progress
  group by pillar_id
),
-- Los proyectos del pilar son todos los que entran en él a cualquier nivel.
-- Distintos: un proyecto vinculado a tres líneas del mismo pilar es uno.
proyectos as (
  select pillar_id, count(distinct project_id)::integer as project_count
  from public.v_project_entry
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
    when coalesce(e.source_count, 0) > 0 then e.progress
    when c.activity_average is not null then c.activity_average
    else 0
  end                                                            as progress,
  case when c.total = 0 then 0 else round(c.done * 100.0 / c.total)::integer end as completion_rate,
  coalesce(ar.area_count, 0)                                     as area_count,
  coalesce(ar.line_count, 0)                                     as line_count,
  coalesce(pr.project_count, 0)                                  as project_count
from conteos c
left join estructura e on e.pillar_id = c.pillar_id
left join areas      ar on ar.pillar_id = c.pillar_id
left join proyectos  pr on pr.pillar_id = c.pillar_id;

-- -----------------------------------------------------------------------------
-- 6. Resumen del plan (sin cambios)
-- -----------------------------------------------------------------------------

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
-- 7. La cascada anual, con la misma regla
--
-- Punto por punto lo mismo que arriba: el año de un proyecto entra en el año de
-- la línea, del área o del pilar según el nivel de su vínculo. Si las dos
-- cascadas usaran reglas distintas, el avance del plan y el de un año concreto
-- contarían los mismos proyectos de forma diferente.
-- -----------------------------------------------------------------------------

create view public.v_activity_year
with (security_invoker = on) as
select
  a.id                                                     as activity_id,
  a.pillar_id,
  a.action_line_id,
  a.project_id,
  t.year,
  least(100, greatest(0, round(t.compliance)))::integer    as progress,
  t.target_value,
  t.result_value,
  t.compliance
from public.activities a
join public.activity_targets t on t.activity_id = a.id
where t.compliance is not null;

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

create view public.v_line_year
with (security_invoker = on) as
with proyectos as (
  select e.action_line_id as line_id, py.year, py.progress
  from public.v_project_entry e
  join public.v_project_year py on py.project_id = e.project_id
  where e.level = 'line'
),
piezas as (
  select line_id, year, progress from proyectos
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

create view public.v_area_year
with (security_invoker = on) as
with directos as (
  select e.area_id, py.year, py.progress
  from public.v_project_entry e
  join public.v_project_year py on py.project_id = e.project_id
  where e.level = 'area'
),
piezas as (
  select ly.area_id, ly.year, ly.progress from public.v_line_year ly
  union all
  select area_id, year, progress from directos
)
select
  area.id                             as area_id,
  area.pillar_id,
  piezas.year,
  round(avg(piezas.progress))::integer as progress,
  count(*)::integer                   as line_count
from public.strategic_areas area
join piezas on piezas.area_id = area.id
group by area.id, area.pillar_id, piezas.year;

create view public.v_pillar_year
with (security_invoker = on) as
with directos as (
  select e.pillar_id, py.year, py.progress
  from public.v_project_entry e
  join public.v_project_year py on py.project_id = e.project_id
  where e.level = 'pillar'
),
piezas as (
  select pillar_id, year, progress from public.v_area_year
  union all
  select pillar_id, year, progress from directos
),
por_area as (
  select pillar_id, year, round(avg(progress))::integer as progress, count(*)::integer as area_count
  from piezas
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
  coalesce(a.progress, i.progress)        as progress,
  coalesce(a.area_count, 0)               as area_count,
  coalesce(i.activity_count, 0)           as activity_count
from por_area a
full join por_indicador i on i.pillar_id = a.pillar_id and i.year = a.year;

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

-- -----------------------------------------------------------------------------
-- 8. Permisos y caché de la API
-- -----------------------------------------------------------------------------

grant select on
  public.v_project_entry,
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
