-- =============================================================================
-- PDI · 0049 · Observatorio de Analítica Académica: el taller de la intranet
--
-- Cuatro tablas para alimentar el Observatorio desde la intranet:
--
--   obs_datasets   tablas de datos ya anonimizadas en el navegador: columnas
--                  con tipo, filas agregadas (jsonb) y el acta de lo que la
--                  importación quitó, agrupó y reservó (< 5). Nunca llegan
--                  microdatos: el análisis y la anonimización corren antes de
--                  guardar.
--   obs_views      visores (gráficas) sobre una tabla, con su sección y ancho.
--   obs_topics     tipo de informe (plantilla) y secciones de cada tema.
--   obs_bulletins  recortes para el boletín en PDF (temas, años, periodos,
--                  fuentes y tipos de dato).
--
-- Permisos: la pantalla «observatorio» del rol de acceso (has_screen) para
-- leer en la intranet; capacidad de Planeación para escribir. El portal
-- público (anon) lee solo las tablas y visores publicados.
--
-- Requiere 0024 (has_screen, has_role_at_least) y set_updated_at(). Idempotente.
-- =============================================================================

create table if not exists public.obs_datasets (
  id             uuid primary key default gen_random_uuid(),
  topic          text not null,
  title          text not null,
  description    text not null default '',
  source         text not null default '',
  data_type      text not null default 'conteo',
  temporality    text not null default 'sin_tiempo',
  period_label   text not null default '',
  columns        jsonb not null default '[]'::jsonb,
  rows           jsonb not null default '[]'::jsonb,
  anonymization  jsonb,
  is_sample      boolean not null default false,
  status         text not null default 'borrador',
  position       smallint not null default 0,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint obs_datasets_status check (status in ('borrador', 'publicado')),
  constraint obs_datasets_temporality check (temporality in ('sin_tiempo', 'anual', 'periodo')),
  constraint obs_datasets_data_type check (data_type in ('conteo', 'tasa', 'serie', 'distribucion', 'georreferenciado', 'modelo', 'encuesta')),
  constraint obs_datasets_shapes check (jsonb_typeof(columns) = 'array' and jsonb_typeof(rows) = 'array')
);

comment on table public.obs_datasets is
  'Observatorio: tabla de datos agregada y anonimizada en la intranet antes de guardarse. Sin microdatos ni datos personales.';

create index if not exists obs_datasets_topic_idx on public.obs_datasets (topic, position);

create table if not exists public.obs_views (
  id          uuid primary key default gen_random_uuid(),
  dataset_id  uuid not null references public.obs_datasets (id) on delete cascade,
  topic       text not null,
  spec        jsonb not null default '{}'::jsonb,
  section     text not null default 'detalle',
  size        text not null default 'media',
  visible     boolean not null default true,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint obs_views_section check (section in ('panorama', 'tendencia', 'composicion', 'territorio', 'detalle')),
  constraint obs_views_size check (size in ('media', 'completa')),
  constraint obs_views_spec check (jsonb_typeof(spec) = 'object')
);

comment on table public.obs_views is
  'Observatorio: visor (gráfica) sobre una tabla de datos. spec lleva tipo, columnas y opciones.';

create index if not exists obs_views_topic_idx on public.obs_views (topic, position);

create table if not exists public.obs_topics (
  slug        text primary key,
  template    text not null default 'tablero',
  intro       text not null default '',
  sections    text[] not null default array['panorama', 'tendencia', 'composicion', 'territorio', 'detalle'],
  status      text not null default 'borrador',
  updated_at  timestamptz not null default now(),
  constraint obs_topics_template check (template in ('tablero', 'narrativo', 'comparativo', 'ficha')),
  constraint obs_topics_status check (status in ('borrador', 'publicado'))
);

comment on table public.obs_topics is
  'Observatorio: tipo de informe y secciones de cada una de las catorce páginas temáticas.';

create table if not exists public.obs_bulletins (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  subtitle    text not null default '',
  settings    jsonb not null default '{}'::jsonb,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint obs_bulletins_settings check (jsonb_typeof(settings) = 'object')
);

comment on table public.obs_bulletins is
  'Observatorio: boletín en PDF definido como recorte (temas, años, periodos, fuentes y tipos de dato).';

-- Marcas de tiempo -------------------------------------------------------------

drop trigger if exists obs_datasets_set_updated_at on public.obs_datasets;
create trigger obs_datasets_set_updated_at before update on public.obs_datasets
  for each row execute function public.set_updated_at();

drop trigger if exists obs_views_set_updated_at on public.obs_views;
create trigger obs_views_set_updated_at before update on public.obs_views
  for each row execute function public.set_updated_at();

drop trigger if exists obs_topics_set_updated_at on public.obs_topics;
create trigger obs_topics_set_updated_at before update on public.obs_topics
  for each row execute function public.set_updated_at();

drop trigger if exists obs_bulletins_set_updated_at on public.obs_bulletins;
create trigger obs_bulletins_set_updated_at before update on public.obs_bulletins
  for each row execute function public.set_updated_at();

-- Permisos ---------------------------------------------------------------------

create or replace function public.obs_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion') and public.has_screen('observatorio');
$$;

comment on function public.obs_can_edit() is
  'Puede escribir en el taller del Observatorio: capacidad de Planeación y la pantalla en su rol de acceso.';

alter table public.obs_datasets enable row level security;
alter table public.obs_views enable row level security;
alter table public.obs_topics enable row level security;
alter table public.obs_bulletins enable row level security;

drop policy if exists obs_datasets_read on public.obs_datasets;
create policy obs_datasets_read on public.obs_datasets for select to anon, authenticated
  using (status = 'publicado' or public.has_screen('observatorio'));

drop policy if exists obs_datasets_write on public.obs_datasets;
create policy obs_datasets_write on public.obs_datasets for all to authenticated
  using (public.obs_can_edit()) with check (public.obs_can_edit());

drop policy if exists obs_views_read on public.obs_views;
create policy obs_views_read on public.obs_views for select to anon, authenticated
  using (
    public.has_screen('observatorio')
    or (visible and exists (select 1 from public.obs_datasets d where d.id = dataset_id and d.status = 'publicado'))
  );

drop policy if exists obs_views_write on public.obs_views;
create policy obs_views_write on public.obs_views for all to authenticated
  using (public.obs_can_edit()) with check (public.obs_can_edit());

drop policy if exists obs_topics_read on public.obs_topics;
create policy obs_topics_read on public.obs_topics for select to anon, authenticated
  using (status = 'publicado' or public.has_screen('observatorio'));

drop policy if exists obs_topics_write on public.obs_topics;
create policy obs_topics_write on public.obs_topics for all to authenticated
  using (public.obs_can_edit()) with check (public.obs_can_edit());

drop policy if exists obs_bulletins_read on public.obs_bulletins;
create policy obs_bulletins_read on public.obs_bulletins for select to authenticated
  using (public.has_screen('observatorio'));

drop policy if exists obs_bulletins_write on public.obs_bulletins;
create policy obs_bulletins_write on public.obs_bulletins for all to authenticated
  using (public.obs_can_edit()) with check (public.obs_can_edit());

grant select on public.obs_datasets, public.obs_views, public.obs_topics to anon;
grant select, insert, update, delete on public.obs_datasets, public.obs_views, public.obs_topics, public.obs_bulletins to authenticated;
