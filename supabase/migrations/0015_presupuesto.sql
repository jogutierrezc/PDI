-- =============================================================================
-- PDI · 0015 · Presupuesto: reporte anual, y fuera de lo público.
--
-- Dos cosas que van juntas porque son la misma decisión vista por sus dos
-- caras: el presupuesto del plan existe, se administra y se reporta —pero no se
-- publica—.
--
-- -----------------------------------------------------------------------------
-- 1. El presupuesto se reporta por año, igual que todo lo demás
--
-- Hasta ahora la única cifra de dinero del portal era `projects.total_value`:
-- lo que el proyecto declara que vale al formularse. Una sola cifra, sin año y
-- sin contraparte, así que "presupuesto ejecutado" solo podía publicarse en
-- cero porque no había dónde registrarlo.
--
-- `project_budget_reports` le da la forma que ya tiene el resto del plan: una
-- fila por proyecto y año, con lo proyectado y lo ejecutado. Es la misma
-- estructura de `activity_targets` —(indicador, año, meta, resultado)— y no por
-- casualidad: el presupuesto se reporta en el mismo ciclo y por las mismas
-- personas, y darle una forma distinta obligaría a explicar dos veces cómo se
-- reporta.
--
-- `projects.total_value` no desaparece ni se recalcula: es la formulación, lo
-- que el proyecto dijo que costaría el día que se formuló. Los reportes son
-- otra cosa —lo que se programó para cada año y lo que se giró— y compararlas
-- es justamente lo que el módulo tiene que dejar ver.
--
-- -----------------------------------------------------------------------------
-- 2. Ninguna cifra de dinero sale a lo público
--
-- Las pantallas públicas dejaron de mostrar presupuesto, pero ocultarlo en la
-- interfaz no es lo mismo que no publicarlo: `grant select on all tables ... to
-- anon` (migración 0007) deja `projects.total_value` al alcance de cualquiera
-- que sepa pedirlo a PostgREST, y `v_projects` lo servía con `p.*`.
--
-- Aquí se cierra de verdad:
--
--   · `anon` pierde el permiso sobre la tabla `projects` y lo recupera columna
--     a columna, salvo las de dinero.
--   · `v_projects` —la que leen las páginas públicas— deja de traerlas.
--   · Nace `v_projects_admin`, con todo, y solo para sesiones con rol.
--   · `project_budget_reports` no se le concede a `anon` en ningún momento.
--
-- Es idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El reporte anual de presupuesto
-- -----------------------------------------------------------------------------

create table if not exists public.project_budget_reports (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  year       smallint not null,
  -- Nulos a propósito: "todavía no se ha reportado" no es "cero". Un cero dice
  -- que ese año no se programó ni se giró nada, y esa es una afirmación.
  projected  numeric(16, 2),
  executed   numeric(16, 2),
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,

  constraint project_budget_reports_unique unique (project_id, year),
  constraint project_budget_reports_year_range check (year between 2000 and 2100),
  constraint project_budget_reports_projected_positive
    check (projected is null or projected >= 0),
  constraint project_budget_reports_executed_positive
    check (executed is null or executed >= 0)
);

comment on table public.project_budget_reports is
  'Presupuesto de cada proyecto, año a año: lo proyectado y lo ejecutado. Nunca se publica: solo lo leen sesiones con rol.';
comment on column public.project_budget_reports.projected is
  'Lo programado para ese año. Nulo = sin reportar, que no es lo mismo que cero.';
comment on column public.project_budget_reports.executed is
  'Lo efectivamente girado en ese año. Nulo = sin reportar.';

create index if not exists project_budget_reports_project_idx
  on public.project_budget_reports (project_id, year);

drop trigger if exists project_budget_reports_set_updated_at on public.project_budget_reports;
create trigger project_budget_reports_set_updated_at
  before update on public.project_budget_reports
  for each row execute function public.set_updated_at();

-- --- Seguridad ---------------------------------------------------------------
--
-- La diferencia con el resto de tablas del portal: aquí NO hay política para
-- `anon`. `pillar_is_public` no entra en la ecuación; el presupuesto no se
-- publica aunque el pilar sí.

alter table public.project_budget_reports enable row level security;

drop policy if exists project_budget_reports_read on public.project_budget_reports;
create policy project_budget_reports_read on public.project_budget_reports
  for select to authenticated
  using (public.has_role_at_least('consulta'));

drop policy if exists project_budget_reports_write on public.project_budget_reports;
create policy project_budget_reports_write on public.project_budget_reports
  for all to authenticated
  using (public.can_edit_pillar(public.pillar_of_project(project_id)))
  with check (public.can_edit_pillar(public.pillar_of_project(project_id)));

revoke all on public.project_budget_reports from anon;
grant select, insert, update, delete on public.project_budget_reports to authenticated;

-- -----------------------------------------------------------------------------
-- 2. `anon` deja de poder leer las columnas de dinero de `projects`
--
-- Se hace con permisos por columna y no quitando la columna de la vista, porque
-- PostgREST expone también la tabla: cerrar solo la vista dejaría la puerta de
-- al lado abierta.
--
-- La lista de columnas se calcula en vez de escribirse. Escrita a mano, añadir
-- mañana una columna a `projects` la dejaría sin permiso para `anon` y el
-- portal público se caería sin que nadie relacionara una cosa con la otra.
-- Calculada, una columna nueva entra sola; la contrapartida —que una futura
-- columna de dinero entraría también— se cubre con la lista de abajo, que es el
-- único sitio donde hay que acordarse.
-- -----------------------------------------------------------------------------

do $$
declare
  reservadas constant text[] := array['total_value'];
  columnas text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into columnas
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'projects'
    and not (column_name = any (reservadas));

  execute 'revoke select on public.projects from anon';
  execute format('grant select (%s) on public.projects to anon', columnas);
end $$;

-- -----------------------------------------------------------------------------
-- 3. Las vistas de proyecto: una pública y una interna
--
-- `v_projects` se recrea sin las columnas de dinero. No puede seguir usando
-- `p.*`: con `security_invoker = on` la vista se ejecuta con los permisos de
-- quien pregunta, y para `anon` el asterisco ahora incluye una columna que no
-- puede leer, así que la consulta entera fallaría.
-- -----------------------------------------------------------------------------

drop view if exists public.v_projects cascade;

create view public.v_projects
with (security_invoker = on) as
select
  p.id,
  p.pillar_id,
  p.action_line_id,
  p.indicator_id,
  p.name,
  p.owner,
  p.description,
  p.detail,
  p.due_date,
  p.progress,
  p.status,
  p.state_id,
  p.document_id,
  p.position,
  p.target_value,
  p.achieved_value,
  p.measure_unit,
  p.start_date,
  p.end_date,
  p.academic_units,
  p.sdg_goals,
  p.impacts,
  p.attachment_path,
  p.attachment_name,
  p.attachment_size,
  p.created_at,
  p.updated_at,
  coalesce(
    (select array_agg(distinct pl.pillar_id)
     from public.project_links pl where pl.project_id = p.id),
    array[p.pillar_id]
  )                                                            as pillar_ids,
  coalesce(
    (select jsonb_agg(to_jsonb(pl) order by pl.position, pl.created_at)
     from public.project_links pl where pl.project_id = p.id),
    '[]'::jsonb
  )                                                            as links
from public.projects p;

comment on view public.v_projects is
  'Proyecto con sus vínculos, SIN cifras de presupuesto. Es la que leen las páginas públicas.';

-- La misma vista con el dinero, y solo para quien tiene rol en el portal. El
-- filtro va dentro: `grant ... to authenticated` alcanzaría también a una
-- sesión recién creada sin perfil.
drop view if exists public.v_projects_admin cascade;

create view public.v_projects_admin
with (security_invoker = on) as
select
  p.*,
  coalesce(
    (select array_agg(distinct pl.pillar_id)
     from public.project_links pl where pl.project_id = p.id),
    array[p.pillar_id]
  )                                                            as pillar_ids,
  coalesce(
    (select jsonb_agg(to_jsonb(pl) order by pl.position, pl.created_at)
     from public.project_links pl where pl.project_id = p.id),
    '[]'::jsonb
  )                                                            as links
from public.projects p
where public.has_role_at_least('consulta');

comment on view public.v_projects_admin is
  'Proyecto con sus vínculos y su presupuesto formulado. Solo para sesiones con rol; nunca se concede a anon.';

-- -----------------------------------------------------------------------------
-- 4. El presupuesto resumido
--
-- Dos vistas para no repetir la aritmética en la pantalla. Ambas quedan fuera
-- del alcance de `anon`, igual que la tabla.
--
-- Una decisión que conviene tener escrita: aquí un proyecto cuenta **una sola
-- vez, en su pilar dueño**, al revés que la cascada de avance, donde un
-- proyecto transversal pesa en cada pilar al que aporta. Son preguntas
-- distintas. El avance responde "¿cuánto se ha hecho de esto?", y que el
-- trabajo cuente en los tres frentes a los que aporta es correcto. El dinero
-- responde "¿cuánto vale esto?", y sumarlo tres veces daría un total del plan
-- que no existe.
-- -----------------------------------------------------------------------------

create or replace view public.v_project_budget
with (security_invoker = on) as
select
  p.id                                          as project_id,
  p.pillar_id,
  p.name,
  p.total_value                                 as formulated,
  coalesce(sum(r.projected), 0)::numeric(16, 2) as projected,
  coalesce(sum(r.executed), 0)::numeric(16, 2)  as executed,
  count(r.id) filter (where r.projected is not null or r.executed is not null)::integer
                                                as reported_years,
  min(r.year)                                   as first_year,
  max(r.year)                                   as last_year,
  -- Cuánto de lo programado se ha girado. Nulo si no hay nada programado: un
  -- porcentaje sobre cero no es cero, es una pregunta sin respuesta.
  case
    when coalesce(sum(r.projected), 0) = 0 then null
    else round(coalesce(sum(r.executed), 0) * 100 / sum(r.projected))::integer
  end                                           as execution_rate
from public.projects p
left join public.project_budget_reports r on r.project_id = p.id
group by p.id;

comment on view public.v_project_budget is
  'Presupuesto de cada proyecto: lo formulado, lo proyectado y lo ejecutado según sus reportes anuales.';

create or replace view public.v_pillar_budget
with (security_invoker = on) as
select
  pl.id                                          as pillar_id,
  pl.slug,
  pl.name,
  count(b.project_id)::integer                   as project_count,
  coalesce(sum(b.formulated), 0)::numeric(16, 2) as formulated,
  coalesce(sum(b.projected), 0)::numeric(16, 2)  as projected,
  coalesce(sum(b.executed), 0)::numeric(16, 2)   as executed,
  case
    when coalesce(sum(b.projected), 0) = 0 then null
    else round(coalesce(sum(b.executed), 0) * 100 / sum(b.projected))::integer
  end                                            as execution_rate
from public.pillars pl
left join public.v_project_budget b on b.pillar_id = pl.id
group by pl.id;

comment on view public.v_pillar_budget is
  'Presupuesto por pilar. Cada proyecto cuenta en su pilar dueño y solo una vez: el dinero no se multiplica al ser transversal, a diferencia del avance.';

-- -----------------------------------------------------------------------------
-- 5. Permisos y caché de la API
-- -----------------------------------------------------------------------------

grant select on public.v_projects to anon, authenticated;

revoke all on public.v_projects_admin from anon;
revoke all on public.v_project_budget from anon;
revoke all on public.v_pillar_budget  from anon;

grant select on
  public.v_projects_admin,
  public.v_project_budget,
  public.v_pillar_budget
to authenticated;

-- --- Comprobación ------------------------------------------------------------
--
-- Mejor un aviso al aplicar que una columna de dinero publicada sin que nadie
-- se dé cuenta.

do $$
declare
  filtradas text;
begin
  select string_agg(a.attname, ', ' order by a.attname) into filtradas
  from pg_attribute a
  where a.attrelid = 'public.projects'::regclass
    and a.attnum > 0
    and not a.attisdropped
    and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
    and a.attname = 'total_value';

  if filtradas is not null then
    raise warning
      'anon todavía puede leer las columnas de dinero de projects (%). Revisa si se volvió a aplicar la migración 0007 después de esta.',
      filtradas;
  end if;
end $$;

notify pgrst, 'reload schema';
