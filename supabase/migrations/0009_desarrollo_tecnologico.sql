-- =============================================================================
-- PDI · 0009 · Desarrollo tecnológico.
--
-- Catálogo de los desarrollos web que construye la Oficina de Planeación, con
-- su enlace de acceso, su repositorio y sus autores. Se administra desde la
-- intranet y se publica en una página propia del portal.
--
-- No cuelga de ningún pilar a propósito: son herramientas de la oficina, no
-- proyectos del plan. Por eso su edición es de Planeación en adelante y no
-- entra en el reparto por responsable de pilar.
--
-- Es idempotente.
-- =============================================================================

-- Dónde vive el código. Se guarda aparte de la URL para poder mostrar la
-- etiqueta correcta sin adivinarla del dominio.
do $$ begin
  create type public.repo_kind as enum ('github', 'udes');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Validación de los autores
--
-- Los autores son una lista ordenada que solo tiene sentido dentro de su
-- proyecto: no se consultan por separado ni se enlazan con perfiles. Por eso van
-- en JSONB y no en una tabla hija — así el alta, la edición y el borrado del
-- proyecto son una sola operación.
--
-- La contrapartida es que la base no puede imponer columnas: esta función lo
-- suple comprobando la forma de cada elemento.
-- -----------------------------------------------------------------------------

create or replace function public.web_project_authors_ok(value jsonb)
returns boolean
language sql
immutable
as $$
  select case
    -- CASE evalúa en cortocircuito: sin esta guarda, jsonb_array_elements
    -- reventaría al recibir algo que no sea un array.
    when jsonb_typeof(coalesce(value, '[]'::jsonb)) <> 'array' then false
    else not exists (
      select 1
      from jsonb_array_elements(coalesce(value, '[]'::jsonb)) as item
      where jsonb_typeof(item) <> 'object'
         or coalesce(btrim(item ->> 'full_name'), '') = ''
    )
  end;
$$;

comment on function public.web_project_authors_ok(jsonb) is
  'Cada autor debe ser un objeto con full_name no vacío. role (el cargo) es opcional.';

-- -----------------------------------------------------------------------------
-- Tabla
-- -----------------------------------------------------------------------------

create table if not exists public.web_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  /** A dónde lleva el botón principal: el aplicativo o el portal en marcha. */
  public_url  text,
  repo_kind   public.repo_kind not null default 'github',
  repo_url    text,
  /** [{ "full_name": "…", "role": "…" }, …] en el orden en que se firman. */
  authors     jsonb not null default '[]'::jsonb,
  status      public.publication_status not null default 'borrador',
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,

  constraint web_projects_name_not_blank check (length(btrim(name)) > 0),
  constraint web_projects_name_unique unique (name),
  -- Solo http(s): impide que un enlace javascript: acabe en un href del portal.
  constraint web_projects_public_url_scheme check (public_url is null or public_url ~* '^https?://'),
  constraint web_projects_repo_url_scheme   check (repo_url   is null or repo_url   ~* '^https?://'),
  constraint web_projects_authors_shape     check (public.web_project_authors_ok(authors))
);

comment on table public.web_projects is
  'Desarrollos web de la Oficina de Planeación, publicados en /desarrollo-tecnologico.';

create index if not exists web_projects_status_idx on public.web_projects (status, position);
-- Para poder buscar por autor más adelante sin recorrer la tabla entera.
create index if not exists web_projects_authors_idx on public.web_projects using gin (authors);

drop trigger if exists web_projects_set_updated_at on public.web_projects;
create trigger web_projects_set_updated_at
  before update on public.web_projects
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Seguridad
-- -----------------------------------------------------------------------------

alter table public.web_projects enable row level security;

drop policy if exists web_projects_read on public.web_projects;
create policy web_projects_read on public.web_projects
  for select to anon, authenticated
  using (status = 'publicado' or public.has_role_at_least('consulta'));

drop policy if exists web_projects_write on public.web_projects;
create policy web_projects_write on public.web_projects
  for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

-- -----------------------------------------------------------------------------
-- Un primer registro: el propio portal
--
-- Sirve de ejemplo de la forma esperada y, además, es cierto.
-- -----------------------------------------------------------------------------

insert into public.web_projects (name, description, public_url, repo_kind, repo_url, authors, status, position)
values (
  'Portal PDI 2024-2028',
  'Portal público y de administración del Plan de Desarrollo Institucional: tablero de cumplimiento, ficha de cada pilar, repositorio documental e intranet de seguimiento.',
  'https://www.udes.edu.co/',
  'github',
  'https://github.com/jogutierrezc/PDI',
  '[{"full_name": "Oficina de Planeación Institucional", "role": "Formulación y seguimiento"}]'::jsonb,
  'publicado',
  1
)
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- Permisos y caché
-- -----------------------------------------------------------------------------

grant select on public.web_projects to anon, authenticated;
grant insert, update, delete on public.web_projects to authenticated;

notify pgrst, 'reload schema';
