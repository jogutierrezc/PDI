-- =============================================================================
-- PDI · 0013 · Módulo de proyectos: un proyecto, varios pilares.
--
-- Hasta ahora un proyecto colgaba de un pilar y de una línea, y punto. Los
-- proyectos reales de la universidad no son así: un aula viva aporta al pilar
-- de ambiente tecnológico y al de apropiación social a la vez, tiene fechas,
-- presupuesto, unidades académicas responsables, objetivos de desarrollo
-- sostenible, impactos declarados y un documento que lo formula.
--
-- Se amplía el proyecto que ya existe en vez de crear uno nuevo al lado. Son el
-- mismo objeto: el que agrupa indicadores y el que se formula. Dos tablas
-- llamadas "proyecto" obligarían a capturar dos veces lo mismo y a decidir en
-- cada pantalla cuál de las dos se está mirando.
--
-- Cuatro cambios:
--
-- 1. `projects` gana los campos de formulación: fechas, unidades académicas,
--    ODS, valor total y el archivo de soporte.
--
-- 2. Nace `project_links`: a qué pilares, áreas y líneas apunta. Uno de los
--    vínculos es el principal —el que hereda `projects.pillar_id`— pero todos
--    cuentan.
--
-- 3. **El avance del proyecto cuenta en cada línea vinculada.** Si un proyecto
--    aporta a tres líneas, su porcentaje entra en el promedio de las tres. Es
--    una decisión deliberada: refleja que el trabajo aporta a los tres frentes,
--    a cambio de que ese mismo avance pese tres veces en el total del plan.
--
--    Los proyectos anteriores al módulo no tienen vínculos y siguen contando
--    en su línea de siempre; la migración les crea el suyo.
--
-- 4. Los impactos declarados viajan como JSON dentro de la fila, igual que los
--    autores de `web_projects`: son una lista corta que solo se lee entera,
--    nunca se consulta por sus partes.
--
-- Es idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Campos de formulación
-- -----------------------------------------------------------------------------

alter table public.projects
  add column if not exists start_date      date,
  add column if not exists end_date        date,
  add column if not exists academic_units  text[],
  add column if not exists sdg_goals       smallint[],
  add column if not exists total_value     numeric(16, 2),
  add column if not exists impacts         jsonb not null default '[]'::jsonb,
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint;

comment on column public.projects.academic_units is
  'Programas o unidades académicas responsables. Texto libre: no hay catálogo institucional de programas en el portal.';
comment on column public.projects.sdg_goals is
  'Números de los Objetivos de Desarrollo Sostenible (1-17) a los que aporta.';
comment on column public.projects.impacts is
  'Lista de impactos declarados: [{ "kind": …, "term": …, "justification": … }]. JSON y no tabla porque solo se lee entera.';
comment on column public.projects.attachment_path is
  'Ruta del archivo dentro del bucket "proyectos" de Storage. El archivo no vive en la base de datos.';

alter table public.projects drop constraint if exists projects_dates_order;
alter table public.projects
  add constraint projects_dates_order
  check (start_date is null or end_date is null or start_date <= end_date);

-- Los ODS son una lista cerrada de 17. Un 18 es un error de captura, no un
-- objetivo nuevo. El operador de contenido vale en una restricción; una
-- subconsulta sobre unnest(), no.
alter table public.projects drop constraint if exists projects_sdg_range;
alter table public.projects
  add constraint projects_sdg_range
  check (
    sdg_goals is null
    or sdg_goals <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]::smallint[]
  );

alter table public.projects drop constraint if exists projects_impacts_is_array;
alter table public.projects
  add constraint projects_impacts_is_array check (jsonb_typeof(impacts) = 'array');

alter table public.projects drop constraint if exists projects_total_value_positive;
alter table public.projects
  add constraint projects_total_value_positive
  check (total_value is null or total_value >= 0);

-- -----------------------------------------------------------------------------
-- 2. A qué apunta el proyecto
--
-- Una fila por vínculo. El área es redundante —la línea ya la conoce— pero se
-- guarda para poder vincular un proyecto a un área entera todavía sin líneas.
-- -----------------------------------------------------------------------------

create table if not exists public.project_links (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id)        on delete cascade,
  pillar_id      uuid not null references public.pillars (id)         on delete cascade,
  area_id        uuid references public.strategic_areas (id)          on delete cascade,
  action_line_id uuid references public.action_lines (id)             on delete cascade,
  -- El principal es el que manda en projects.pillar_id: el proyecto se
  -- administra desde ese pilar aunque se vea en todos.
  is_primary     boolean not null default false,
  position       smallint not null default 0,
  created_at     timestamptz not null default now(),

  -- NULLS NOT DISTINCT: sin esto, dos vínculos al mismo pilar sin línea se
  -- considerarían distintos y el proyecto aparecería duplicado en su ficha.
  constraint project_links_unique
    unique nulls not distinct (project_id, pillar_id, area_id, action_line_id)
);

comment on table public.project_links is
  'Pilares, áreas y líneas a los que apunta un proyecto. El avance del proyecto cuenta en todas las líneas vinculadas.';

create index if not exists project_links_project_idx on public.project_links (project_id, position);
create index if not exists project_links_pillar_idx  on public.project_links (pillar_id);
create index if not exists project_links_line_idx    on public.project_links (action_line_id);

-- Un pilar por proyecto no puede tener dos vínculos principales.
create unique index if not exists project_links_single_primary
  on public.project_links (project_id) where is_primary;

-- --- Traslado de lo que ya existe --------------------------------------------
--
-- Sin esto, los proyectos cargados antes del módulo no aparecerían en la lista
-- del pilar, que ahora se arma desde los vínculos.

insert into public.project_links (project_id, pillar_id, area_id, action_line_id, is_primary, position)
select
  p.id,
  p.pillar_id,
  l.area_id,
  p.action_line_id,
  true,
  1
from public.projects p
left join public.action_lines l on l.id = p.action_line_id
where not exists (select 1 from public.project_links pl where pl.project_id = p.id)
on conflict do nothing;

-- --- Seguridad ---------------------------------------------------------------

create or replace function public.pillar_of_project(target uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.pillar_id from public.projects p where p.id = target;
$$;

alter table public.project_links enable row level security;

drop policy if exists project_links_read on public.project_links;
create policy project_links_read on public.project_links
  for select to anon, authenticated
  using (public.pillar_is_public(pillar_id) or public.has_role_at_least('consulta'));

drop policy if exists project_links_write on public.project_links;
create policy project_links_write on public.project_links
  for all to authenticated
  -- Basta poder editar el pilar dueño del proyecto: si hiciera falta permiso
  -- sobre los dos, nadie podría vincular un proyecto a un pilar ajeno, que es
  -- justamente para lo que existe el módulo.
  using (public.can_edit_pillar(public.pillar_of_project(project_id)))
  with check (public.can_edit_pillar(public.pillar_of_project(project_id)));

-- -----------------------------------------------------------------------------
-- 3. La cascada cuenta el proyecto en cada línea vinculada
--
-- Se recrean en orden de dependencia, como en 0010 y 0012.
-- -----------------------------------------------------------------------------

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
with proyectos as (
  -- Un proyecto cuenta en cada línea a la que apunte. `union` y no `union all`:
  -- dos vínculos a la misma línea son un error de captura, no doble peso.
  select l.action_line_id as line_id, pp.project_id, pp.progress
  from public.v_project_progress pp
  join public.project_links l on l.project_id = pp.project_id
  where l.action_line_id is not null
  union
  -- Respaldo para un proyecto sin vínculos: su línea de siempre.
  select pp.action_line_id, pp.project_id, pp.progress
  from public.v_project_progress pp
  where pp.action_line_id is not null
    and not exists (
      select 1 from public.project_links l
      where l.project_id = pp.project_id and l.action_line_id is not null
    )
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
  select line_id, count(*)::integer as project_count
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
    sum(line_count)::integer      as line_count
  from public.v_area_progress
  group by pillar_id
),
-- Los proyectos del pilar son los suyos más los que apuntan a él desde otro.
-- Se cuentan distintos: un proyecto vinculado a tres líneas del mismo pilar es
-- un proyecto, no tres.
proyectos as (
  select pillar_id, count(distinct project_id)::integer as project_count
  from (
    select pl.pillar_id, pl.project_id from public.project_links pl
    union
    select p.pillar_id, p.id from public.projects p
  ) t
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
  coalesce(pr.project_count, 0)                                  as project_count
from conteos c
left join estructura e on e.pillar_id = c.pillar_id
left join proyectos pr on pr.pillar_id = c.pillar_id;

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
-- 4. La cascada anual, con la misma regla de vínculos
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
  select l.action_line_id as line_id, py.year, py.progress
  from public.v_project_year py
  join public.project_links l on l.project_id = py.project_id
  where l.action_line_id is not null
  union
  select py.action_line_id, py.year, py.progress
  from public.v_project_year py
  where py.action_line_id is not null
    and not exists (
      select 1 from public.project_links l
      where l.project_id = py.project_id and l.action_line_id is not null
    )
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
select
  area.id                             as area_id,
  area.pillar_id,
  ly.year,
  round(avg(ly.progress))::integer    as progress,
  count(*)::integer                   as line_count
from public.strategic_areas area
join public.v_line_year ly on ly.area_id = area.id
group by area.id, area.pillar_id, ly.year;

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
-- 4 bis. El proyecto con sus vínculos resueltos
--
-- Las fichas necesitan dos cosas a la vez: filtrar por pilar —incluyendo los
-- proyectos que apuntan a él desde otro— y mostrar todos los vínculos de cada
-- proyecto, no solo el que coincidió con el filtro.
--
-- Se resuelve en una vista y no con dos embebidos de PostgREST sobre la misma
-- tabla: aquí la regla está escrita y se puede leer, y la pantalla hace una
-- sola petición.
-- -----------------------------------------------------------------------------

create view public.v_projects
with (security_invoker = on) as
select
  p.*,
  -- Para filtrar: "dame los proyectos que tocan este pilar". El respaldo cubre
  -- a los que todavía no tienen vínculos.
  coalesce(
    (select array_agg(distinct pl.pillar_id)
     from public.project_links pl where pl.project_id = p.id),
    array[p.pillar_id]
  )                                                            as pillar_ids,
  -- Para mostrar: la lista entera, en su orden.
  coalesce(
    (select jsonb_agg(to_jsonb(pl) order by pl.position, pl.created_at)
     from public.project_links pl where pl.project_id = p.id),
    '[]'::jsonb
  )                                                            as links
from public.projects p;

comment on view public.v_projects is
  'Proyecto con sus vínculos: pillar_ids para filtrar por pilar, links para mostrarlos.';

-- -----------------------------------------------------------------------------
-- 5. Archivo de soporte en Storage
--
-- El bucket es público en lectura: el archivo que formula un proyecto es del
-- mismo tipo que lo que ya se publica en el repositorio documental. La
-- escritura exige sesión y rol de responsable para arriba.
--
-- Va dentro de un bloque con captura de errores porque en algunos proyectos el
-- rol que aplica las migraciones no es dueño de storage.objects. Si falla, el
-- resto del esquema sí queda aplicado y el aviso dice qué hacer a mano.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('proyectos', 'proyectos', true, 26214400)   -- 25 MB
  on conflict (id) do nothing;

  execute 'drop policy if exists proyectos_lectura on storage.objects';
  execute $pol$
    create policy proyectos_lectura on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'proyectos')
  $pol$;

  execute 'drop policy if exists proyectos_escritura on storage.objects';
  execute $pol$
    create policy proyectos_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'proyectos' and public.has_role_at_least('responsable'))
  $pol$;

  execute 'drop policy if exists proyectos_reemplazo on storage.objects';
  execute $pol$
    create policy proyectos_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'proyectos' and public.has_role_at_least('responsable'))
      with check (bucket_id = 'proyectos' and public.has_role_at_least('responsable'))
  $pol$;

  execute 'drop policy if exists proyectos_borrado on storage.objects';
  execute $pol$
    create policy proyectos_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'proyectos' and public.has_role_at_least('responsable'))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "proyectos" (%). Créalo a mano desde Storage: público en lectura, 25 MB por archivo.',
      sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Permisos y caché de la API
-- -----------------------------------------------------------------------------

grant select on public.project_links, public.v_projects to anon, authenticated;
grant insert, update, delete on public.project_links to authenticated;

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
