-- =============================================================================
-- PDI · 0019 · UDES en Cifras (Datos Abiertos)
--
-- El portal estadístico /datos-abiertos deja de leer un archivo de ejemplo y
-- pasa a leer estas tablas. Se administran desde la intranet, en el módulo
-- UDES en Cifras, y solo Planeación (planeacion y admin) escribe.
--
-- El modelo, de arriba abajo:
--
--   od_periods ─┬─ od_period_campuses        qué campus cubre el periodo
--               └─ od_reports ─┬─ od_indicators ── od_values (año × campus)
--                              ├─ od_breakdowns ── od_breakdown_values
--                              ├─ od_heatmaps ──── od_heatmap_cells
--                              ├─ od_maps ──────── od_map_values
--                              ├─ od_pipelines ─── od_pipeline_values
--                              └─ od_report_blocks  orden y visibilidad de la ficha
--
--   od_offices       oficinas que producen las cifras (la "fuente" pública)
--   od_imports       rastro de cada carga: rejilla, pegado o plantilla
--   od_publications  rastro de cada publicación
--
-- Decisiones que conviene conocer:
--
-- · El periodo es global: un periodo vigente (2020-2025) para todos los
--   informes. Abrir el siguiente copia la estructura (od_copy_period) y el
--   anterior queda archivado y consultable.
-- · Un valor ausente es NULL, nunca 0. "No reportado" y "cero" son
--   afirmaciones distintas y el portal las pinta distinto.
-- · El total institucional es la fila con campus_id NULL. Si el indicador
--   agrega por 'suma', el portal lo calcula sumando los campus cuando no se
--   capturó; si agrega por 'reportado' (tasas, promedios) se captura aparte.
-- · El público solo ve periodos publicados e informes publicados de esos
--   periodos. La intranet (consulta en adelante) lo ve todo.
--
-- Idempotente: se puede ejecutar más de una vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'od_value_format') then
    create type public.od_value_format as enum ('entero', 'porcentaje', 'decimal');
  end if;
  if not exists (select 1 from pg_type where typname = 'od_direction') then
    create type public.od_direction as enum ('sube', 'baja', 'neutro');
  end if;
  if not exists (select 1 from pg_type where typname = 'od_aggregation') then
    create type public.od_aggregation as enum ('suma', 'reportado');
  end if;
  if not exists (select 1 from pg_type where typname = 'od_map_mode') then
    create type public.od_map_mode as enum ('origen', 'cobertura');
  end if;
  if not exists (select 1 from pg_type where typname = 'od_chart_kind') then
    create type public.od_chart_kind as enum ('circular', 'barras', 'lineas');
  end if;
  if not exists (select 1 from pg_type where typname = 'od_block_kind') then
    create type public.od_block_kind as enum
      ('kpis', 'evolucion', 'mapa', 'tuberia', 'mapa_calor', 'desgloses', 'tabla_dinamica', 'metodologia');
  end if;
  if not exists (select 1 from pg_type where typname = 'od_import_kind') then
    create type public.od_import_kind as enum ('rejilla', 'pegado', 'plantilla');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Periodo y campus
-- -----------------------------------------------------------------------------

create table if not exists public.od_periods (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  start_year   smallint not null,
  end_year     smallint not null,
  cutoff_date  date not null default current_date,
  -- Mientras sea verdadero, cada cifra del portal lleva la marca "Dato ilustrativo".
  illustrative boolean not null default false,
  is_current   boolean not null default false,
  status       public.publication_status not null default 'borrador',
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint od_periods_label_unique unique (label),
  constraint od_periods_range check (end_year >= start_year and end_year - start_year <= 12),
  constraint od_periods_years check (start_year between 2000 and 2100)
);

comment on table public.od_periods is
  'Periodo global de UDES en Cifras. Un informe abarca todos los años del periodo (p. ej. 2020-2025).';

-- Solo un periodo vigente.
create unique index if not exists od_periods_one_current on public.od_periods (is_current) where is_current;

drop trigger if exists od_periods_set_updated_at on public.od_periods;
create trigger od_periods_set_updated_at
  before update on public.od_periods
  for each row execute function public.set_updated_at();

create table if not exists public.od_period_campuses (
  period_id uuid not null references public.od_periods (id) on delete cascade,
  campus_id uuid not null references public.campuses (id) on delete restrict,
  -- Nombre que muestra el portal. Va aquí para que el público no necesite leer
  -- `campuses`, que tiene sus propias reglas de publicación.
  label     text not null,
  -- Copia del slug del campus: el portal lo usa para ubicarlo en el mapa.
  slug      text not null default '',
  position  smallint not null default 0,
  primary key (period_id, campus_id)
);

create or replace function public.od_period_campus_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select c.slug, coalesce(nullif(new.label, ''), c.name) into new.slug, new.label
  from public.campuses c where c.id = new.campus_id;
  return new;
end;
$$;

drop trigger if exists od_period_campuses_fill on public.od_period_campuses;
create trigger od_period_campuses_fill
  before insert or update on public.od_period_campuses
  for each row execute function public.od_period_campus_fill();

comment on table public.od_period_campuses is
  'Campus que cubre un periodo. El total institucional no es una fila: es campus_id NULL en los valores.';

-- -----------------------------------------------------------------------------
-- 3. Oficinas que producen las cifras
-- -----------------------------------------------------------------------------

create table if not exists public.od_offices (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_email text not null default '',
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  constraint od_offices_name_unique unique (name)
);

-- -----------------------------------------------------------------------------
-- 4. Informes
-- -----------------------------------------------------------------------------

create table if not exists public.od_reports (
  id           uuid primary key default gen_random_uuid(),
  period_id    uuid not null references public.od_periods (id) on delete cascade,
  slug         text not null,
  code         text not null,
  name         text not null,
  summary      text not null default '',
  description  text not null default '',
  image_url    text not null default '',
  image_alt    text not null default '',
  image_credit text not null default '',
  line         smallint not null default 1,
  note         text not null default '',
  position     smallint not null default 0,
  status       public.publication_status not null default 'borrador',
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint od_reports_slug_unique unique (period_id, slug),
  constraint od_reports_code_unique unique (period_id, code),
  constraint od_reports_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint od_reports_code_format check (code ~ '^[A-Z]{2}$'),
  constraint od_reports_line_range check (line between 1 and 9)
);

drop trigger if exists od_reports_set_updated_at on public.od_reports;
create trigger od_reports_set_updated_at
  before update on public.od_reports
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Indicadores y valores
-- -----------------------------------------------------------------------------

create table if not exists public.od_indicators (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.od_reports (id) on delete cascade,
  key          text not null,
  label        text not null,
  unit         text not null default '',
  format       public.od_value_format not null default 'entero',
  direction    public.od_direction not null default 'neutro',
  aggregation  public.od_aggregation not null default 'suma',
  definition   text not null default '',
  office_id    uuid references public.od_offices (id) on delete set null,
  position     smallint not null default 0,
  -- Tablero de KPI: qué indicadores salen como cifra clave, en qué orden, y cuál
  -- es el titular que representa al informe en el tablero público.
  is_kpi       boolean not null default false,
  kpi_position smallint,
  is_headline  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint od_indicators_key_unique unique (report_id, key),
  constraint od_indicators_key_format check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint od_indicators_headline_is_kpi check (not is_headline or is_kpi)
);

create unique index if not exists od_indicators_one_headline
  on public.od_indicators (report_id) where is_headline;

drop trigger if exists od_indicators_set_updated_at on public.od_indicators;
create trigger od_indicators_set_updated_at
  before update on public.od_indicators
  for each row execute function public.set_updated_at();

create table if not exists public.od_values (
  id           uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.od_indicators (id) on delete cascade,
  year         smallint not null,
  -- NULL = total institucional.
  campus_id    uuid references public.campuses (id) on delete restrict,
  value        numeric,
  note         text not null default '',
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),

  constraint od_values_unique unique nulls not distinct (indicator_id, year, campus_id),
  constraint od_values_year_range check (year between 2000 and 2100)
);

create index if not exists od_values_indicator on public.od_values (indicator_id);

drop trigger if exists od_values_set_updated_at on public.od_values;
create trigger od_values_set_updated_at
  before update on public.od_values
  for each row execute function public.set_updated_at();

-- Un valor fuera de los años del periodo de su informe no se guarda: la
-- rejilla de captura no lo mostraría y el portal tampoco.
create or replace function public.od_value_in_period()
returns trigger
language plpgsql
as $$
declare
  first_year smallint;
  last_year  smallint;
begin
  select p.start_year, p.end_year into first_year, last_year
  from public.od_indicators i
  join public.od_reports r on r.id = i.report_id
  join public.od_periods p on p.id = r.period_id
  where i.id = new.indicator_id;

  if new.year < first_year or new.year > last_year then
    raise exception 'El año % está fuera del periodo %-%.', new.year, first_year, last_year
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists od_values_in_period on public.od_values;
create trigger od_values_in_period
  before insert or update on public.od_values
  for each row execute function public.od_value_in_period();

-- -----------------------------------------------------------------------------
-- 6. Desgloses
-- -----------------------------------------------------------------------------

create table if not exists public.od_breakdowns (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.od_reports (id) on delete cascade,
  key           text not null,
  title         text not null,
  unit          text not null default '',
  format        public.od_value_format not null default 'entero',
  office_id     uuid references public.od_offices (id) on delete set null,
  default_chart public.od_chart_kind not null default 'circular',
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  constraint od_breakdowns_key_unique unique (report_id, key)
);

create table if not exists public.od_breakdown_values (
  id           uuid primary key default gen_random_uuid(),
  breakdown_id uuid not null references public.od_breakdowns (id) on delete cascade,
  year         smallint not null,
  label        text not null,
  position     smallint not null default 0,
  value        numeric,
  constraint od_breakdown_values_unique unique (breakdown_id, year, label)
);

-- -----------------------------------------------------------------------------
-- 7. Mapas de calor
-- -----------------------------------------------------------------------------

create table if not exists public.od_heatmaps (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.od_reports (id) on delete cascade,
  key           text not null,
  title         text not null,
  description   text not null default '',
  row_label     text not null default '',
  column_label  text not null default '',
  rows          text[] not null default '{}',
  columns       text[] not null default '{}',
  unit          text not null default '',
  format        public.od_value_format not null default 'entero',
  office_id     uuid references public.od_offices (id) on delete set null,
  empty_meaning text not null default 'sin reportar',
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  constraint od_heatmaps_key_unique unique (report_id, key)
);

create table if not exists public.od_heatmap_cells (
  heatmap_id   uuid not null references public.od_heatmaps (id) on delete cascade,
  row_index    smallint not null,
  column_index smallint not null,
  value        numeric,
  primary key (heatmap_id, row_index, column_index)
);

-- -----------------------------------------------------------------------------
-- 8. Mapas por departamento
-- -----------------------------------------------------------------------------

create table if not exists public.od_maps (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.od_reports (id) on delete cascade,
  key         text not null,
  title       text not null,
  description text not null default '',
  mode        public.od_map_mode not null default 'origen',
  unit        text not null default '',
  office_id   uuid references public.od_offices (id) on delete set null,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  constraint od_maps_key_unique unique (report_id, key)
);

create table if not exists public.od_map_values (
  map_id          uuid not null references public.od_maps (id) on delete cascade,
  year            smallint not null,
  campus_id       uuid not null references public.campuses (id) on delete restrict,
  -- Código DANE del departamento, dos dígitos.
  department_code text not null,
  value           numeric not null,
  primary key (map_id, year, campus_id, department_code),
  constraint od_map_values_department check (department_code ~ '^[0-9]{2}$')
);

-- -----------------------------------------------------------------------------
-- 9. Tubería de permanencia
-- -----------------------------------------------------------------------------

create table if not exists public.od_pipelines (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.od_reports (id) on delete cascade,
  title       text not null,
  description text not null default '',
  stages      text[] not null default '{}',
  office_id   uuid references public.od_offices (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint od_pipelines_one_per_report unique (report_id)
);

create table if not exists public.od_pipeline_values (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.od_pipelines (id) on delete cascade,
  cohort      smallint not null,
  campus_id   uuid references public.campuses (id) on delete restrict,
  stage_index smallint not null,
  remaining   integer,
  -- Causa principal de retiro en el tramo que termina en esta etapa.
  main_cause  text not null default '',
  constraint od_pipeline_values_unique unique nulls not distinct (pipeline_id, cohort, campus_id, stage_index)
);

-- -----------------------------------------------------------------------------
-- 10. Diseño de la ficha
-- -----------------------------------------------------------------------------

create table if not exists public.od_report_blocks (
  id        uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.od_reports (id) on delete cascade,
  kind      public.od_block_kind not null,
  -- Para mapa, mapa de calor y tubería: cuál de los conjuntos del informe.
  ref_id    uuid,
  position  smallint not null default 0,
  visible   boolean not null default true,
  -- Ajustes del bloque: tipo de gráfica por defecto, título propio, etc.
  settings  jsonb not null default '{}'::jsonb,
  constraint od_report_blocks_unique unique nulls not distinct (report_id, kind, ref_id)
);

comment on table public.od_report_blocks is
  'Qué bloques muestra la ficha pública de un informe, en qué orden y con qué ajustes.';

-- -----------------------------------------------------------------------------
-- 11. Trazabilidad
-- -----------------------------------------------------------------------------

create table if not exists public.od_imports (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references public.od_periods (id) on delete cascade,
  report_id     uuid references public.od_reports (id) on delete set null,
  kind          public.od_import_kind not null,
  file_name     text not null default '',
  cells_changed integer not null default 0,
  summary       jsonb not null default '{}'::jsonb,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.od_publications (
  id           uuid primary key default gen_random_uuid(),
  period_id    uuid not null references public.od_periods (id) on delete cascade,
  report_id    uuid references public.od_reports (id) on delete set null,
  action       text not null check (action in ('publicado', 'retirado')),
  note         text not null default '',
  published_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz not null default now()
);

-- Cada cambio de estado de un informe deja su entrada, venga de donde venga.
create or replace function public.od_log_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and (new.status = 'publicado' or old.status = 'publicado') then
    insert into public.od_publications (period_id, report_id, action, published_by)
    values (new.period_id, new.id, case when new.status = 'publicado' then 'publicado' else 'retirado' end, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists od_reports_log_publication on public.od_reports;
create trigger od_reports_log_publication
  after update of status on public.od_reports
  for each row execute function public.od_log_publication();

-- -----------------------------------------------------------------------------
-- 12. Abrir el periodo siguiente copiando la estructura
--
-- Copia informes, indicadores (con su configuración de KPI), desgloses, mapas
-- de calor, mapas, tubería y diseño de la ficha. No copia valores: el periodo
-- nuevo nace vacío y en borrador.
-- -----------------------------------------------------------------------------

create or replace function public.od_copy_period(source uuid, new_label text, new_start smallint, new_end smallint)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  target uuid;
  r record;
  new_report uuid;
begin
  if not public.has_role_at_least('planeacion') then
    raise exception 'Solo Planeación puede abrir periodos.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.od_periods (label, start_year, end_year, illustrative, status)
  values (new_label, new_start, new_end, false, 'borrador')
  returning id into target;

  insert into public.od_period_campuses (period_id, campus_id, label, slug, position)
  select target, campus_id, label, slug, position from public.od_period_campuses where period_id = source;

  for r in select * from public.od_reports where period_id = source loop
    insert into public.od_reports
      (period_id, slug, code, name, summary, description, image_url, image_alt, image_credit, line, note, position, status)
    values
      (target, r.slug, r.code, r.name, r.summary, r.description, r.image_url, r.image_alt, r.image_credit, r.line, r.note, r.position, 'borrador')
    returning id into new_report;

    insert into public.od_indicators
      (report_id, key, label, unit, format, direction, aggregation, definition, office_id, position, is_kpi, kpi_position, is_headline)
    select new_report, key, label, unit, format, direction, aggregation, definition, office_id, position, is_kpi, kpi_position, is_headline
    from public.od_indicators where report_id = r.id;

    insert into public.od_breakdowns (report_id, key, title, unit, format, office_id, default_chart, position)
    select new_report, key, title, unit, format, office_id, default_chart, position
    from public.od_breakdowns where report_id = r.id;

    insert into public.od_heatmaps
      (report_id, key, title, description, row_label, column_label, rows, columns, unit, format, office_id, empty_meaning, position)
    select new_report, key, title, description, row_label, column_label, rows, columns, unit, format, office_id, empty_meaning, position
    from public.od_heatmaps where report_id = r.id;

    insert into public.od_maps (report_id, key, title, description, mode, unit, office_id, position)
    select new_report, key, title, description, mode, unit, office_id, position
    from public.od_maps where report_id = r.id;

    insert into public.od_pipelines (report_id, title, description, stages, office_id)
    select new_report, title, description, stages, office_id
    from public.od_pipelines where report_id = r.id;

    -- Los bloques con conjunto se reenganchan por clave al conjunto copiado.
    insert into public.od_report_blocks (report_id, kind, ref_id, position, visible, settings)
    select new_report, b.kind,
      coalesce(
        (select h2.id from public.od_heatmaps h1 join public.od_heatmaps h2 on h2.key = h1.key and h2.report_id = new_report where h1.id = b.ref_id),
        (select m2.id from public.od_maps m1 join public.od_maps m2 on m2.key = m1.key and m2.report_id = new_report where m1.id = b.ref_id),
        (select p.id from public.od_pipelines p where p.report_id = new_report and b.kind = 'tuberia')
      ),
      b.position, b.visible, b.settings
    from public.od_report_blocks b where b.report_id = r.id;
  end loop;

  return target;
end;
$$;

-- -----------------------------------------------------------------------------
-- 13. Seguridad
--
-- Lectura pública: periodo publicado y, para lo que cuelga de un informe,
-- informe publicado. Intranet: consulta en adelante lee todo.
-- Escritura: planeacion en adelante (Solo Planeación carga y publica).
-- -----------------------------------------------------------------------------

create or replace function public.od_period_is_public(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.od_periods p where p.id = target and p.status = 'publicado');
$$;

create or replace function public.od_report_is_public(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.od_reports r
    join public.od_periods p on p.id = r.period_id
    where r.id = target and r.status = 'publicado' and p.status = 'publicado'
  );
$$;

create or replace function public.od_can_read(report uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('consulta') or public.od_report_is_public(report);
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'od_periods', 'od_period_campuses', 'od_offices', 'od_reports', 'od_indicators', 'od_values',
    'od_breakdowns', 'od_breakdown_values', 'od_heatmaps', 'od_heatmap_cells', 'od_maps', 'od_map_values',
    'od_pipelines', 'od_pipeline_values', 'od_report_blocks', 'od_imports', 'od_publications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_role_at_least(''planeacion'')) with check (public.has_role_at_least(''planeacion''))',
      t || '_write', t
    );
  end loop;
end $$;

-- Lectura, tabla por tabla: cada una sabe a qué informe o periodo pertenece.
drop policy if exists od_periods_read on public.od_periods;
create policy od_periods_read on public.od_periods for select to anon, authenticated
  using (status = 'publicado' or public.has_role_at_least('consulta'));

drop policy if exists od_period_campuses_read on public.od_period_campuses;
create policy od_period_campuses_read on public.od_period_campuses for select to anon, authenticated
  using (public.od_period_is_public(period_id) or public.has_role_at_least('consulta'));

drop policy if exists od_offices_read on public.od_offices;
create policy od_offices_read on public.od_offices for select to anon, authenticated using (true);

drop policy if exists od_reports_read on public.od_reports;
create policy od_reports_read on public.od_reports for select to anon, authenticated
  using (public.od_can_read(id));

drop policy if exists od_indicators_read on public.od_indicators;
create policy od_indicators_read on public.od_indicators for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_values_read on public.od_values;
create policy od_values_read on public.od_values for select to anon, authenticated
  using (public.od_can_read((select i.report_id from public.od_indicators i where i.id = indicator_id)));

drop policy if exists od_breakdowns_read on public.od_breakdowns;
create policy od_breakdowns_read on public.od_breakdowns for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_breakdown_values_read on public.od_breakdown_values;
create policy od_breakdown_values_read on public.od_breakdown_values for select to anon, authenticated
  using (public.od_can_read((select b.report_id from public.od_breakdowns b where b.id = breakdown_id)));

drop policy if exists od_heatmaps_read on public.od_heatmaps;
create policy od_heatmaps_read on public.od_heatmaps for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_heatmap_cells_read on public.od_heatmap_cells;
create policy od_heatmap_cells_read on public.od_heatmap_cells for select to anon, authenticated
  using (public.od_can_read((select h.report_id from public.od_heatmaps h where h.id = heatmap_id)));

drop policy if exists od_maps_read on public.od_maps;
create policy od_maps_read on public.od_maps for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_map_values_read on public.od_map_values;
create policy od_map_values_read on public.od_map_values for select to anon, authenticated
  using (public.od_can_read((select m.report_id from public.od_maps m where m.id = map_id)));

drop policy if exists od_pipelines_read on public.od_pipelines;
create policy od_pipelines_read on public.od_pipelines for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_pipeline_values_read on public.od_pipeline_values;
create policy od_pipeline_values_read on public.od_pipeline_values for select to anon, authenticated
  using (public.od_can_read((select p.report_id from public.od_pipelines p where p.id = pipeline_id)));

drop policy if exists od_report_blocks_read on public.od_report_blocks;
create policy od_report_blocks_read on public.od_report_blocks for select to anon, authenticated
  using (public.od_can_read(report_id));

-- La trazabilidad es de la intranet.
drop policy if exists od_imports_read on public.od_imports;
create policy od_imports_read on public.od_imports for select to authenticated
  using (public.has_role_at_least('consulta'));

drop policy if exists od_publications_read on public.od_publications;
create policy od_publications_read on public.od_publications for select to authenticated
  using (public.has_role_at_least('consulta'));

grant select on
  public.od_periods, public.od_period_campuses, public.od_offices, public.od_reports, public.od_indicators,
  public.od_values, public.od_breakdowns, public.od_breakdown_values, public.od_heatmaps, public.od_heatmap_cells,
  public.od_maps, public.od_map_values, public.od_pipelines, public.od_pipeline_values, public.od_report_blocks
  to anon, authenticated;

grant select, insert, update, delete on
  public.od_periods, public.od_period_campuses, public.od_offices, public.od_reports, public.od_indicators,
  public.od_values, public.od_breakdowns, public.od_breakdown_values, public.od_heatmaps, public.od_heatmap_cells,
  public.od_maps, public.od_map_values, public.od_pipelines, public.od_pipeline_values, public.od_report_blocks,
  public.od_imports, public.od_publications
  to authenticated;

grant execute on function public.od_copy_period(uuid, text, smallint, smallint) to authenticated;

notify pgrst, 'reload schema';
