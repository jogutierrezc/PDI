-- =============================================================================
-- PDI · Universidad de Santander
-- 0001 · Esquema base: tipos, tablas, índices y disparadores.
--
-- Convenciones
--   · Identificadores en inglés, comentarios en español.
--   · Toda tabla de contenido lleva created_at / updated_at con disparador.
--   · Los borrados de contenido en cascada siguen la jerarquía del plan:
--     pilar → área → línea → proyecto.
--   · Lo que el público puede ver se decide en 0002_rls.sql, no aquí.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

-- Roles del portal, de menor a mayor privilegio. El orden importa: role_rank()
-- en 0002 lo usa para comparar jerarquías.
do $$ begin
  create type public.app_role as enum ('consulta', 'responsable', 'planeacion', 'admin');
exception when duplicate_object then null; end $$;

-- Los cuatro estados de avance. Es un enum y no un catálogo editable a
-- propósito: la interfaz asigna a cada uno un color validado y un glifo
-- (✓ ◐ ○ ▲). Añadir un quinto estado exige revisar esa paleta.
do $$ begin
  create type public.activity_status as enum ('cumplida', 'curso', 'pendiente', 'riesgo');
exception when duplicate_object then null; end $$;

-- Ciclo de publicación del contenido. Solo 'publicado' llega al sitio público.
do $$ begin
  create type public.publication_status as enum ('borrador', 'revision', 'publicado', 'archivado');
exception when duplicate_object then null; end $$;

-- Categorías de los catálogos globales que administra Planeación.
do $$ begin
  create type public.parameter_category as enum ('estado_proyecto', 'nivel_gestion', 'unidad', 'periodicidad');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.change_type as enum ('creacion', 'modificacion', 'reforma', 'eliminacion');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Personas
-- -----------------------------------------------------------------------------

-- Espejo de auth.users con lo que el portal necesita mostrar y autorizar.
-- La contraseña, el correo verificado y la sesión siguen viviendo en auth.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text        not null,
  full_name    text        not null default '',
  unit         text,                                   -- dependencia: "Dirección TIC"
  role         public.app_role not null default 'consulta',
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table  public.profiles is 'Perfil y rol de cada persona con acceso a la intranet.';
comment on column public.profiles.is_active is
  'Desactivar conserva el historial de autoría; borrar el usuario en auth lo elimina en cascada.';

create index if not exists profiles_role_idx on public.profiles (role) where is_active;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Alta automática del perfil al crearse el usuario en auth. Sin esto, un
-- usuario creado desde el panel de Supabase entraría sin perfil ni rol.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    -- Un valor inesperado en los metadatos no debe impedir el alta ni, peor,
    -- conceder un rol que nadie pidió: cualquier cosa rara cae en 'consulta'.
    case new.raw_user_meta_data ->> 'role'
      when 'admin' then 'admin'::public.app_role
      when 'planeacion' then 'planeacion'::public.app_role
      when 'responsable' then 'responsable'::public.app_role
      else 'consulta'::public.app_role
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- El disparador vive en auth.users, que en algunos proyectos no pertenece al rol
-- que ejecuta las migraciones. Si no se puede crear, la migración avisa y
-- continúa: sin este bloque, el error tumbaría la transacción entera del editor
-- SQL y no quedaría creada ni una sola tabla.
--
-- Si aparece el aviso, créalo desde el panel de Supabase o asigna el rol a mano
-- tras dar de alta cada usuario (ver README, "El disparador de auth.users").
do $$
begin
  execute 'drop trigger if exists on_auth_user_created on auth.users';
  execute 'create trigger on_auth_user_created
             after insert on auth.users
             for each row execute function public.handle_new_user()';
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo crear el disparador sobre auth.users (%). El resto del esquema sí se aplicó; los perfiles habrá que crearlos a mano.',
      sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- Catálogos globales
-- -----------------------------------------------------------------------------

create table if not exists public.parameters (
  id          uuid primary key default gen_random_uuid(),
  category    public.parameter_category not null,
  label       text    not null,
  description text,
  position    smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint parameters_label_not_blank check (length(btrim(label)) > 0),
  constraint parameters_unique_label unique (category, label)
);

comment on table public.parameters is
  'Catálogos que alimentan los desplegables de la intranet (pantalla Parámetros globales).';

create index if not exists parameters_category_idx on public.parameters (category, position);

drop trigger if exists parameters_set_updated_at on public.parameters;
create trigger parameters_set_updated_at
  before update on public.parameters
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Cortes de reporte
-- -----------------------------------------------------------------------------

create table if not exists public.report_periods (
  id           uuid primary key default gen_random_uuid(),
  label        text        not null,                    -- "Corte agosto 2026"
  cutoff_date  date        not null,
  is_current   boolean     not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint report_periods_cutoff_unique unique (cutoff_date)
);

comment on table public.report_periods is
  'Cortes del seguimiento. El portal muestra la fecha del corte vigente como "actualizado al".';

-- Solo puede haber un corte vigente: el índice parcial lo garantiza en la base
-- de datos, no en el código de la aplicación.
create unique index if not exists report_periods_single_current
  on public.report_periods ((is_current)) where is_current;

drop trigger if exists report_periods_set_updated_at on public.report_periods;
create trigger report_periods_set_updated_at
  before update on public.report_periods
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Pilares
-- -----------------------------------------------------------------------------

create table if not exists public.pillars (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null,
  numeral           text not null default '',           -- "I", "II", …
  name              text not null,
  description       text not null default '',           -- párrafo largo (portada)
  focus             text not null default '',           -- frase corta (tablero)
  insight           text,                               -- lectura destacada del pilar
  icon              text not null default 'spark',
  accent_slot       smallint not null default 1,
  impulsor          text not null default '',
  contributes       text not null default '',
  management_owner  text not null default '',
  calculation_owner text not null default '',
  status            public.publication_status not null default 'borrador',
  position          smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null,

  constraint pillars_slug_unique unique (slug),
  -- El slug viaja en la URL pública: se restringe en la base para que no
  -- pueda entrar uno con mayúsculas, tildes o espacios.
  constraint pillars_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- El ícono debe existir en el set del portal (src/components/ui/Icon.tsx).
  constraint pillars_icon_known check (
    icon in ('person', 'chip', 'spark', 'columns', 'leaf', 'community')
  ),
  -- Los seis acentos están validados para daltonismo en conjunto. Un séptimo
  -- pilar obliga a re-validar la paleta antes de ampliar este rango.
  constraint pillars_accent_range check (accent_slot between 1 and 6)
);

comment on table  public.pillars is 'Pilares estratégicos del PDI 2024-2028.';
comment on column public.pillars.accent_slot is
  'Índice 1-6 del acento; la aplicación lo traduce a var(--pillar-N). El color vive en CSS para que el tema oscuro tenga su propia paleta validada.';

create index if not exists pillars_status_idx on public.pillars (status, position);

drop trigger if exists pillars_set_updated_at on public.pillars;
create trigger pillars_set_updated_at
  before update on public.pillars
  for each row execute function public.set_updated_at();

-- Asignación de responsables. Un rol 'responsable' solo puede editar los
-- pilares que aparezcan aquí a su nombre.
create table if not exists public.pillar_owners (
  pillar_id  uuid not null references public.pillars (id)  on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pillar_id, profile_id)
);

comment on table public.pillar_owners is
  'Qué persona responde por qué pilar. Base de la autorización del rol responsable.';

create index if not exists pillar_owners_profile_idx on public.pillar_owners (profile_id);

-- -----------------------------------------------------------------------------
-- Estructura: áreas estratégicas → líneas de acción
-- -----------------------------------------------------------------------------

create table if not exists public.strategic_areas (
  id          uuid primary key default gen_random_uuid(),
  pillar_id   uuid not null references public.pillars (id) on delete cascade,
  code        text,                                     -- "AE-04"
  name        text not null,
  description text not null default '',
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint strategic_areas_name_unique unique (pillar_id, name)
);

create index if not exists strategic_areas_pillar_idx on public.strategic_areas (pillar_id, position);

drop trigger if exists strategic_areas_set_updated_at on public.strategic_areas;
create trigger strategic_areas_set_updated_at
  before update on public.strategic_areas
  for each row execute function public.set_updated_at();

create table if not exists public.action_lines (
  id         uuid primary key default gen_random_uuid(),
  area_id    uuid not null references public.strategic_areas (id) on delete cascade,
  code       text,                                      -- "LA-4.1"
  name       text not null,
  -- Avance reportado de la línea. Es un dato que valida el comité, no una suma
  -- de proyectos: por eso se guarda y no se calcula.
  progress   smallint not null default 0,
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_lines_progress_range check (progress between 0 and 100),
  -- Dos líneas con el mismo nombre dentro de un área son un error de captura,
  -- y además hacen que volver a ejecutar la semilla duplique filas.
  constraint action_lines_name_unique unique (area_id, name)
);

create index if not exists action_lines_area_idx on public.action_lines (area_id, position);

drop trigger if exists action_lines_set_updated_at on public.action_lines;
create trigger action_lines_set_updated_at
  before update on public.action_lines
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Repositorio documental
-- -----------------------------------------------------------------------------

-- Los documentos son enlaces a archivos que viven fuera del portal.
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  pillar_id   uuid references public.pillars (id)        on delete cascade,
  area_id     uuid references public.strategic_areas (id) on delete set null,
  title       text not null,
  description text not null default '',
  kind        text not null default 'PDF',              -- PDF, XLSX, DOCX, HTML…
  url         text not null,
  size_label  text,                                     -- "4,2 MB", informativo
  is_public   boolean not null default false,
  published_at timestamptz,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,

  -- Solo http(s): impide que un enlace javascript: acabe en un href del portal.
  constraint documents_url_scheme check (url ~* '^https?://'),
  constraint documents_title_not_blank check (length(btrim(title)) > 0),
  -- NULLS NOT DISTINCT hace que dos documentos institucionales (sin pilar) con
  -- el mismo título también choquen, que es lo que se quiere.
  constraint documents_title_unique unique nulls not distinct (pillar_id, title)
);

comment on table  public.documents is
  'Repositorio documental y soportes. Guarda enlaces externos, no archivos.';
comment on column public.documents.pillar_id is
  'Nulo = documento institucional del PDI (aparece en el repositorio general).';
comment on column public.documents.is_public is
  'Marca la aparición en el repositorio público; el resto son soportes internos.';

create index if not exists documents_pillar_idx on public.documents (pillar_id, position);
create index if not exists documents_public_idx on public.documents (is_public, position) where is_public;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Indicadores (protocolos)
-- -----------------------------------------------------------------------------

create table if not exists public.indicators (
  id              uuid primary key default gen_random_uuid(),
  pillar_id       uuid not null references public.pillars (id) on delete cascade,
  code            text not null,                        -- "PDI-AT-001"
  name            text not null,
  status_label    text not null default 'En curso',
  -- Nivel, unidad y periodicidad salen de los catálogos globales. Con la
  -- referencia (y no una copia del texto) renombrar "Táctico" en el catálogo
  -- se refleja en todas partes, y borrarlo mientras está en uso falla.
  level_id        uuid references public.parameters (id) on delete restrict,
  unit_id         uuid references public.parameters (id) on delete restrict,
  periodicity_id  uuid references public.parameters (id) on delete restrict,
  considerations  text not null default '',
  budget_amount   numeric(14, 2),
  budget_progress smallint not null default 0,
  elapsed_label   text,                                 -- "18 meses"
  elapsed_progress smallint not null default 0,
  critical_tasks  smallint not null default 0,
  is_primary      boolean not null default false,
  position        smallint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint indicators_code_unique unique (code),
  constraint indicators_budget_range  check (budget_progress between 0 and 100),
  constraint indicators_elapsed_range check (elapsed_progress between 0 and 100),
  constraint indicators_critical_positive check (critical_tasks >= 0)
);

comment on table public.indicators is
  'Protocolos de medición del pilar. El selector del visor público alterna entre ellos.';

create index if not exists indicators_pillar_idx on public.indicators (pillar_id, position);
-- Un pilar tiene como máximo un indicador principal.
create unique index if not exists indicators_single_primary
  on public.indicators (pillar_id) where is_primary;

drop trigger if exists indicators_set_updated_at on public.indicators;
create trigger indicators_set_updated_at
  before update on public.indicators
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Proyectos
-- -----------------------------------------------------------------------------

create table if not exists public.projects (
  id             uuid primary key default gen_random_uuid(),
  pillar_id      uuid not null references public.pillars (id) on delete cascade,
  action_line_id uuid references public.action_lines (id) on delete set null,
  indicator_id   uuid references public.indicators (id)   on delete set null,
  name           text not null,
  owner          text not null default '',
  description    text not null default '',
  detail         text not null default '',
  due_date       date,
  progress       smallint not null default 0,
  status         public.activity_status not null default 'pendiente',
  state_id       uuid references public.parameters (id) on delete restrict,
  document_id    uuid references public.documents (id)  on delete set null,
  position       smallint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null,

  constraint projects_progress_range check (progress between 0 and 100),
  constraint projects_name_not_blank check (length(btrim(name)) > 0),
  constraint projects_name_unique unique (pillar_id, name)
);

comment on column public.projects.status is
  'Estado que pinta el portal (color + glifo). state_id guarda además el estado administrativo del catálogo.';

create index if not exists projects_pillar_idx on public.projects (pillar_id, position);
create index if not exists projects_line_idx   on public.projects (action_line_id);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Actividades
-- -----------------------------------------------------------------------------

-- La unidad que cuenta el tablero: el avance de un pilar es su proporción de
-- actividades cumplidas.
create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  pillar_id   uuid not null references public.pillars (id)  on delete cascade,
  project_id  uuid references public.projects (id)          on delete set null,
  title       text not null,
  owner       text not null default '',
  due_date    date,
  progress    smallint not null default 0,
  status      public.activity_status not null default 'pendiente',
  is_featured boolean not null default false,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,

  constraint activities_progress_range check (progress between 0 and 100),
  constraint activities_title_not_blank check (length(btrim(title)) > 0),
  -- Una actividad cumplida está al 100 %: impide el estado imposible
  -- "cumplida al 60 %" que rompería la lectura del tablero.
  constraint activities_done_is_complete check (status <> 'cumplida' or progress = 100),
  constraint activities_title_unique unique (pillar_id, title)
);

comment on column public.activities.is_featured is
  'Marca las actividades que salen en la tabla "Actividades destacadas" del tablero público.';

create index if not exists activities_pillar_idx   on public.activities (pillar_id, position);
create index if not exists activities_featured_idx on public.activities (is_featured) where is_featured;
create index if not exists activities_status_idx   on public.activities (pillar_id, status);

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Planeación de resultados
-- -----------------------------------------------------------------------------

create table if not exists public.planning_items (
  id         uuid primary key default gen_random_uuid(),
  pillar_id  uuid not null references public.pillars (id) on delete cascade,
  text       text not null,
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_items_text_not_blank check (length(btrim(text)) > 0),
  constraint planning_items_text_unique unique (pillar_id, text)
);

create index if not exists planning_items_pillar_idx on public.planning_items (pillar_id, position);

drop trigger if exists planning_items_set_updated_at on public.planning_items;
create trigger planning_items_set_updated_at
  before update on public.planning_items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Control de cambios y glosario
-- -----------------------------------------------------------------------------

create table if not exists public.change_log (
  id           uuid primary key default gen_random_uuid(),
  pillar_id    uuid not null references public.pillars (id) on delete cascade,
  indicator_id uuid references public.indicators (id) on delete set null,
  area_code    text not null default '',
  version      text not null,
  approved_by  text not null default '',
  changed_on   date not null default current_date,
  description  text not null default '',
  change_type  public.change_type not null default 'modificacion',
  document_id  uuid references public.documents (id) on delete set null,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  constraint change_log_version_unique unique nulls not distinct (pillar_id, indicator_id, version)
);

comment on table public.change_log is
  'Trazabilidad institucional del indicador: qué cambió, quién lo avaló y cuándo. No es un registro de auditoría técnica.';

create index if not exists change_log_pillar_idx on public.change_log (pillar_id, changed_on desc);

create table if not exists public.glossary_terms (
  id          uuid primary key default gen_random_uuid(),
  pillar_id   uuid references public.pillars (id) on delete cascade,
  term        text not null,
  definition  text not null default '',
  description text not null default '',
  source      text,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint glossary_terms_term_not_blank check (length(btrim(term)) > 0),
  constraint glossary_terms_unique unique nulls not distinct (pillar_id, term)
);

comment on column public.glossary_terms.pillar_id is
  'Nulo = término común a todo el PDI; se muestra en el glosario de cualquier pilar.';

create index if not exists glossary_terms_pillar_idx on public.glossary_terms (pillar_id, position);

drop trigger if exists glossary_terms_set_updated_at on public.glossary_terms;
create trigger glossary_terms_set_updated_at
  before update on public.glossary_terms
  for each row execute function public.set_updated_at();
