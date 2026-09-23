-- =============================================================================
-- PDI · 0064 · Impacto: el modelo
--
-- CATÁLOGO
--   imp_catalog_versions ─┬─ imp_indicators ─┬─ imp_targets      metas por año
--                         │                  ├─ imp_baselines    línea base (institucional o por unidad)
--                         │                  └─ imp_alignments   pilar, proyecto, ODS, CESU, dimensión, tema
--                         └─ imp_import_findings                 lo que el importador no corrige en silencio
--   imp_master_catalog                                           pilares, proyectos, ODS, fuentes…
--
-- OPERACIÓN
--   imp_periods ── imp_assignments ── imp_records ─┬─ imp_evidence
--                                                  └─ imp_transitions    (solo inserción)
--   imp_import_batches ── imp_import_batch_records                      (solo inserción)
--
-- TRES REGLAS QUE VIVEN EN LA BASE Y NO EN LA INTERFAZ
--
--   1. Una versión publicada no cambia. Ni ella ni sus indicadores, metas,
--      líneas base o alineaciones. Cambiar algo es abrir la versión siguiente.
--   2. El valor lo calcula la base. `imp_records.value` sale de numerador,
--      denominador y factor del indicador; lo que mande el cliente se ignora.
--      Así ningún porcentaje existe sin su numerador y su denominador.
--   3. Las bitácoras solo crecen. `imp_transitions` e `imp_import_batches`
--      rechazan UPDATE, DELETE y TRUNCATE, también para el dueño de la tabla.
--
-- El flujo (quién mueve un registro de un estado a otro) llega en la fase 7
-- como funciones; aquí queda la tabla de transiciones permitidas, que ya
-- rechaza un salto imposible aunque lo intente una función mal escrita.
--
-- Requiere 0063. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catálogos maestros
-- -----------------------------------------------------------------------------

create table if not exists public.imp_master_catalog (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  code       text not null,
  name       text not null,
  -- Las dimensiones son propias de cada función; lo demás, de todas.
  function_id text,
  description text not null default '',
  active     boolean not null default true,
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint imp_master_kind check (kind in ('pilar', 'proyecto', 'ods', 'fuente', 'dimension', 'cesu', 'tema')),
  constraint imp_master_function check (function_id is null or function_id in ('investigacion', 'ensenanza', 'extension')),
  constraint imp_master_unique unique nulls not distinct (kind, function_id, code)
);

comment on table public.imp_master_catalog is
  'Listas cerradas de Impacto: pilares, proyectos estratégicos, ODS, fuentes de verificación, dimensiones por función.';

-- -----------------------------------------------------------------------------
-- 2. Versiones del catálogo e indicadores
-- -----------------------------------------------------------------------------

create table if not exists public.imp_catalog_versions (
  id           uuid primary key default gen_random_uuid(),
  number       integer not null,
  state        text not null default 'borrador',
  source_file  text not null default '',
  notes        text not null default '',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  constraint imp_versions_number_unique unique (number),
  constraint imp_versions_number_positive check (number > 0),
  constraint imp_versions_state check (state in ('borrador', 'publicada')),
  constraint imp_versions_published check ((state = 'publicada') = (published_at is not null))
);

comment on table public.imp_catalog_versions is
  'Versiones del catálogo. Una publicada no cambia; solo puede haber un borrador a la vez.';

create unique index if not exists imp_versions_one_draft on public.imp_catalog_versions ((true)) where state = 'borrador';

create table if not exists public.imp_indicators (
  id                  uuid primary key default gen_random_uuid(),
  version_id          uuid not null references public.imp_catalog_versions (id) on delete cascade,
  code                text not null,
  function_id         text not null,
  level               text not null,
  catalog_state       text not null default 'oficial',
  name                text not null,
  description         text not null default '',
  -- Lo que trae la matriz, tal cual, para poder rastrearlo.
  matrix_sheet        text,
  matrix_row          integer,
  unit_original       text not null default '',
  responsible_original text not null default '',
  source              text not null default '',
  origin              text not null default '',
  dfma_pillars_review text not null default '',
  dfma_projects_review text not null default '',
  -- Ficha técnica: lo que completa Planeación.
  unit                text,
  calc_type           text,
  numerator_def       text,
  denominator_def     text,
  factor              smallint,
  aggregation         text,
  direction           text,
  periodicity         text,
  report_level        text,
  applies_degrees     text[] not null default '{}',
  applies_modalities  text[] not null default '{}',
  capture_mode        text,
  evidence_type       text,
  evidence_required   boolean not null default false,
  variation_threshold numeric not null default 30,
  range_min           numeric,
  range_max           numeric,
  n_minimum           integer,
  allows_over_one     boolean not null default false,
  validator_function  text,
  in_pilot            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint imp_indicators_code_unique unique (version_id, code),
  constraint imp_indicators_code_format check (code ~ '^[IEX][0-9]{2,3}$'),
  constraint imp_indicators_function check (function_id in ('investigacion', 'ensenanza', 'extension')),
  constraint imp_indicators_code_prefix check (
    (function_id = 'investigacion' and code like 'I%') or
    (function_id = 'ensenanza' and code like 'E%') or
    (function_id = 'extension' and code like 'X%')),
  constraint imp_indicators_level check (level in ('insumos', 'procesos', 'productos', 'impacto')),
  constraint imp_indicators_catalog_state check (catalog_state in ('oficial', 'sugerido')),
  constraint imp_indicators_unit check (unit is null or unit in ('numero', 'porcentaje', 'razon', 'puntaje', 'moneda_cop', 'horas')),
  constraint imp_indicators_calc_type check (calc_type is null or calc_type in ('conteo', 'razon', 'puntaje', 'comparacion', 'texto')),
  constraint imp_indicators_factor check (factor is null or factor in (1, 100)),
  constraint imp_indicators_aggregation check (aggregation is null or aggregation in ('suma', 'razon_de_sumas', 'promedio_ponderado', 'no_agregable')),
  constraint imp_indicators_direction check (direction is null or direction in ('mayor_mejor', 'menor_mejor')),
  constraint imp_indicators_periodicity check (periodicity is null or periodicity in ('semestral', 'anual')),
  constraint imp_indicators_report_level check (report_level is null or report_level in ('programa_sede', 'programa', 'facultad', 'institucional')),
  constraint imp_indicators_degrees check (applies_degrees <@ array['pregrado', 'especializacion', 'maestria', 'doctorado']),
  constraint imp_indicators_modalities check (applies_modalities <@ array['presencial', 'virtual', 'distancia', 'dual', 'hibrida']),
  constraint imp_indicators_capture_mode check (capture_mode is null or capture_mode in ('manual', 'precargado', 'encuesta', 'calculado')),
  constraint imp_indicators_threshold check (variation_threshold >= 0),
  constraint imp_indicators_range check (range_min is null or range_max is null or range_min <= range_max),
  constraint imp_indicators_n_minimum check (n_minimum is null or n_minimum > 0),
  constraint imp_indicators_validator check (validator_function is null or validator_function in ('investigacion', 'ensenanza', 'extension')),
  -- Una razón o una comparación sin denominador no es una razón.
  constraint imp_indicators_ratio_has_denominator check (
    calc_type is null or calc_type not in ('razon', 'comparacion') or denominator_def is null or length(trim(denominator_def)) > 0)
);

comment on table public.imp_indicators is
  'Indicadores de una versión del catálogo: lo que trae la matriz y la ficha técnica que completa Planeación.';

create index if not exists imp_indicators_version_idx on public.imp_indicators (version_id, function_id, level);

-- La ficha está completa cuando tiene todo lo que hace falta para capturar
-- y consolidar. Se calcula; no se marca a mano.
create or replace function public.imp_sheet_complete(i public.imp_indicators)
returns boolean
language sql
immutable
as $$
  select i.calc_type is not null
     and nullif(trim(i.numerator_def), '') is not null
     and (i.calc_type not in ('razon', 'comparacion') or nullif(trim(i.denominator_def), '') is not null)
     and i.factor is not null
     and i.aggregation is not null
     and i.direction is not null
     and i.periodicity is not null
     and i.report_level is not null
     and cardinality(i.applies_degrees) > 0
     and i.capture_mode is not null
     and i.unit is not null
     and i.validator_function is not null
     and (i.calc_type <> 'puntaje' or i.n_minimum is not null)
     and (not i.evidence_required or nullif(trim(i.evidence_type), '') is not null);
$$;

comment on function public.imp_sheet_complete(public.imp_indicators) is
  'Estado de la ficha: completa si tiene lo necesario para capturar y consolidar. Se usa como columna calculada (indicador.sheet_complete).';

create table if not exists public.imp_targets (
  id            uuid primary key default gen_random_uuid(),
  indicator_id  uuid not null references public.imp_indicators (id) on delete cascade,
  year          smallint not null,
  numeric_value numeric,
  text_value    text,
  constraint imp_targets_unique unique (indicator_id, year),
  constraint imp_targets_year check (year between 2020 and 2040),
  constraint imp_targets_value check (numeric_value is not null or nullif(trim(text_value), '') is not null)
);

comment on table public.imp_targets is 'Meta por año: un número o una expresión («+2 % vs LB»).';

create table if not exists public.imp_baselines (
  id           uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.imp_indicators (id) on delete cascade,
  unit_id      uuid references public.units (id) on delete cascade,
  year         smallint not null,
  value        numeric not null,
  constraint imp_baselines_unique unique nulls not distinct (indicator_id, unit_id, year),
  constraint imp_baselines_year check (year between 2015 and 2040)
);

comment on table public.imp_baselines is 'Línea base; sin unidad es la institucional. «Por definir» no se guarda: es un hallazgo.';

create table if not exists public.imp_alignments (
  indicator_id uuid not null references public.imp_indicators (id) on delete cascade,
  kind         text not null,
  code         text not null,
  primary key (indicator_id, kind, code),
  constraint imp_alignments_kind check (kind in ('pilar', 'proyecto', 'ods', 'cesu', 'dimension', 'tema'))
);

comment on table public.imp_alignments is 'Con qué se alinea un indicador: pilares, proyectos, ODS, CESU, dimensión, tema.';

create table if not exists public.imp_import_findings (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.imp_catalog_versions (id) on delete cascade,
  sheet       text not null,
  row_number  integer,
  column_name text,
  kind        text not null,
  value       text,
  suggestion  text,
  state       text not null default 'abierto',
  note        text not null default '',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint imp_findings_state check (state in ('abierto', 'resuelto', 'aceptado')),
  constraint imp_findings_resolution check ((state = 'abierto') = (resolved_at is null))
);

comment on table public.imp_import_findings is
  'Lo que el importador encontró y no corrigió: hoja, fila, columna, tipo, valor y sugerencia. Planeación lo resuelve o lo acepta.';

create index if not exists imp_findings_version_idx on public.imp_import_findings (version_id, state);

-- -----------------------------------------------------------------------------
-- 3. Una versión publicada no cambia
-- -----------------------------------------------------------------------------

create or replace function public.imp_version_is_published(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.imp_catalog_versions v where v.id = target and v.state = 'publicada');
$$;

create or replace function public.imp_versions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.state = 'publicada' then
      raise exception 'La versión % del catálogo está publicada y no se puede borrar.', old.number using errcode = '55000';
    end if;
    return old;
  end if;
  if old.state = 'publicada' then
    raise exception 'La versión % del catálogo está publicada: los cambios van en una versión nueva.', old.number using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists imp_versions_guard on public.imp_catalog_versions;
create trigger imp_versions_guard
  before update or delete on public.imp_catalog_versions
  for each row execute function public.imp_versions_guard();

-- Para indicadores (con version_id) y para lo que cuelga de ellos (con indicator_id).
create or replace function public.imp_catalog_content_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rows_versions uuid[];
begin
  if tg_table_name = 'imp_indicators' then
    rows_versions := array[
      case when tg_op <> 'INSERT' then old.version_id end,
      case when tg_op <> 'DELETE' then new.version_id end];
  else
    select array_agg(i.version_id) into rows_versions
      from public.imp_indicators i
     where i.id in (
       case when tg_op <> 'INSERT' then old.indicator_id end,
       case when tg_op <> 'DELETE' then new.indicator_id end);
  end if;

  if exists (select 1 from unnest(rows_versions) v where public.imp_version_is_published(v)) then
    raise exception 'Esta versión del catálogo está publicada: los cambios van en una versión nueva.' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['imp_indicators', 'imp_targets', 'imp_baselines', 'imp_alignments'] loop
    execute format('drop trigger if exists %1$s_published_guard on public.%1$s', t);
    execute format(
      'create trigger %1$s_published_guard before insert or update or delete on public.%1$s
         for each row execute function public.imp_catalog_content_guard()', t);
  end loop;
end $$;

drop trigger if exists imp_indicators_set_updated_at on public.imp_indicators;
create trigger imp_indicators_set_updated_at
  before update on public.imp_indicators
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Periodos, asignaciones y registros
-- -----------------------------------------------------------------------------

create table if not exists public.imp_periods (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  kind               text not null default 'semestral',
  catalog_version_id uuid not null references public.imp_catalog_versions (id) on delete restrict,
  opened_at          timestamptz not null default now(),
  cutoff_program     date not null,
  cutoff_faculty     date not null,
  cutoff_vice        date not null,
  state              text not null default 'abierto',
  created_by         uuid references public.profiles (id) on delete set null,
  constraint imp_periods_code_unique unique (code),
  constraint imp_periods_code_format check (code ~ '^[0-9]{4}-[12]$'),
  constraint imp_periods_kind check (kind in ('semestral')),
  constraint imp_periods_state check (state in ('abierto', 'cerrado')),
  constraint imp_periods_cutoffs check (cutoff_program <= cutoff_faculty and cutoff_faculty <= cutoff_vice)
);

comment on table public.imp_periods is
  'Periodo de reporte (2026-2) con su versión de catálogo y las fechas de corte por nivel.';

-- Un periodo solo se abre con una versión publicada.
create or replace function public.imp_periods_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.imp_version_is_published(new.catalog_version_id) then
    raise exception 'Un periodo solo se abre con una versión publicada del catálogo.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists imp_periods_guard on public.imp_periods;
create trigger imp_periods_guard
  before insert or update of catalog_version_id on public.imp_periods
  for each row execute function public.imp_periods_guard();

create table if not exists public.imp_assignments (
  id             uuid primary key default gen_random_uuid(),
  period_id      uuid not null references public.imp_periods (id) on delete restrict,
  indicator_id   uuid not null references public.imp_indicators (id) on delete restrict,
  program_id     uuid not null references public.units (id) on delete restrict,
  campus_id      uuid references public.campuses (id) on delete restrict,
  program_target numeric,
  -- Agregada o quitada a mano por Planeación: siempre con su porqué.
  manual         boolean not null default false,
  active         boolean not null default true,
  justification  text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null,
  constraint imp_assignments_unique unique nulls not distinct (period_id, indicator_id, program_id, campus_id),
  constraint imp_assignments_justified check ((manual or active) or length(trim(justification)) > 0),
  constraint imp_assignments_manual_justified check (not manual or length(trim(justification)) > 0)
);

comment on table public.imp_assignments is
  'Qué indicador reporta qué programa (y sede) en qué periodo. Quitar una deja active = false con justificación.';

create index if not exists imp_assignments_program_idx on public.imp_assignments (program_id, period_id);

create or replace function public.imp_assignments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.units u where u.id = new.program_id and u.kind = 'programa') then
    raise exception 'Solo un programa recibe asignaciones.' using errcode = '23514';
  end if;
  if new.campus_id is not null and not exists (
    select 1 from public.imp_program_campuses pc
     where pc.program_id = new.program_id and pc.campus_id = new.campus_id) then
    raise exception 'El programa no se ofrece en esa sede.' using errcode = '23514';
  end if;
  if exists (select 1 from public.imp_indicators i where i.id = new.indicator_id and i.catalog_state = 'sugerido') then
    raise exception 'Los indicadores sugeridos no se asignan.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists imp_assignments_guard on public.imp_assignments;
create trigger imp_assignments_guard
  before insert or update on public.imp_assignments
  for each row execute function public.imp_assignments_guard();

create table if not exists public.imp_records (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null references public.imp_assignments (id) on delete restrict,
  numerator           numeric,
  denominator         numeric,
  -- Siempre lo escribe la base (imp_records_compute).
  value               numeric,
  comparison_value    numeric,
  n_responses         integer,
  num_comparison      numeric,
  den_comparison      numeric,
  text_value          text,
  confirms_preloaded  boolean,
  no_data             text,
  justification       text not null default '',
  observations        text not null default '',
  state               text not null default 'borrador',
  channel             text not null default 'en_linea',
  version             integer not null default 1,
  captured_by         uuid references public.profiles (id) on delete set null,
  updated_by          uuid references public.profiles (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint imp_records_assignment_unique unique (assignment_id),
  constraint imp_records_nonnegative check (
    coalesce(numerator, 0) >= 0 and coalesce(denominator, 0) >= 0 and coalesce(n_responses, 0) >= 0
    and coalesce(num_comparison, 0) >= 0 and coalesce(den_comparison, 0) >= 0),
  constraint imp_records_no_data check (no_data is null or no_data in ('no_aplica', 'sin_dato')),
  constraint imp_records_state check (state in ('borrador', 'enviado', 'aprobado_decanatura', 'validado', 'devuelto_programa', 'devuelto_decanatura')),
  constraint imp_records_channel check (channel in ('en_linea', 'excel'))
);

comment on table public.imp_records is
  'Lo que reporta un programa para una asignación. value lo calcula la base: nunca hay un porcentaje sin numerador y denominador.';
comment on column public.imp_records.version is 'Sube en cada cambio: sirve para detectar conflictos entre la captura en línea y una plantilla vieja.';

/**
 * El valor del registro, calculado con la ficha de su indicador:
 * conteo y puntaje, el valor directo; razón y comparación, numerador ÷
 * denominador × factor; texto, ninguno. Con «no aplica» o «sin dato», nulo.
 */
create or replace function public.imp_records_compute()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ind public.imp_indicators;
begin
  select i.* into ind
    from public.imp_assignments a
    join public.imp_indicators i on i.id = a.indicator_id
   where a.id = new.assignment_id;

  new.value := null;
  new.comparison_value := null;

  if new.no_data is null then
    case ind.calc_type
      when 'conteo', 'puntaje' then
        new.value := new.numerator;
      when 'razon', 'comparacion' then
        if new.denominator > 0 then
          new.value := new.numerator / new.denominator * coalesce(ind.factor, 1);
        end if;
        if ind.calc_type = 'comparacion' and new.den_comparison > 0 then
          new.comparison_value := new.num_comparison / new.den_comparison * coalesce(ind.factor, 1);
        end if;
      else
        new.value := null;
    end case;
  end if;

  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists imp_records_compute on public.imp_records;
create trigger imp_records_compute
  before insert or update on public.imp_records
  for each row execute function public.imp_records_compute();

create table if not exists public.imp_evidence (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references public.imp_records (id) on delete cascade,
  kind         text not null,
  storage_path text,
  url          text,
  file_name    text,
  size_bytes   bigint,
  mime_type    text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint imp_evidence_kind check (kind in ('archivo', 'url')),
  constraint imp_evidence_shape check (
    (kind = 'url' and url ~* '^https?://[^[:space:]]+\.[^[:space:]]+$' and storage_path is null) or
    (kind = 'archivo' and storage_path is not null and url is null)),
  constraint imp_evidence_size check (size_bytes is null or size_bytes <= 10485760),
  constraint imp_evidence_file_type check (
    kind <> 'archivo' or file_name ~* '\.(pdf|xlsx?|png|jpe?g|webp)$')
);

comment on table public.imp_evidence is 'Soporte de un registro: archivo (PDF, Excel o imagen de hasta 10 MB) o enlace.';

create index if not exists imp_evidence_record_idx on public.imp_evidence (record_id);

-- -----------------------------------------------------------------------------
-- 5. Bitácoras: solo crecen
-- -----------------------------------------------------------------------------

create table if not exists public.imp_transitions (
  id         bigint generated always as identity primary key,
  record_id  uuid not null references public.imp_records (id) on delete restrict,
  from_state text not null,
  to_state   text not null,
  actor_id   uuid references public.profiles (id) on delete restrict,
  at         timestamptz not null default now(),
  reason     text,
  comment    text not null default '',
  constraint imp_transitions_reason check (reason is null or reason in (
    'dato_incompleto', 'formula_mal_aplicada', 'evidencia_insuficiente', 'evidencia_no_corresponde',
    'variacion_sin_justificar', 'falta_grupo_comparacion', 'duplicidad', 'ventana_temporal_errada')),
  -- Devolver siempre dice por qué, con motivo de la lista y comentario.
  constraint imp_transitions_return_explained check (
    to_state not in ('devuelto_programa', 'devuelto_decanatura')
    or (reason is not null and length(trim(comment)) > 0))
);

comment on table public.imp_transitions is
  'Bitácora de estados de cada registro. Solo inserción: ni UPDATE, ni DELETE, ni TRUNCATE.';

create index if not exists imp_transitions_record_idx on public.imp_transitions (record_id, at);

-- El flujo permitido. Cualquier otro salto se rechaza aquí.
create or replace function public.imp_transition_allowed(from_state text, to_state text)
returns boolean
language sql
immutable
as $$
  select (from_state, to_state) in (
    ('borrador', 'enviado'),
    ('enviado', 'aprobado_decanatura'),
    ('enviado', 'devuelto_programa'),
    ('devuelto_programa', 'enviado'),
    ('aprobado_decanatura', 'validado'),
    ('aprobado_decanatura', 'devuelto_decanatura'),
    ('devuelto_decanatura', 'aprobado_decanatura'),
    ('devuelto_decanatura', 'devuelto_programa')
  );
$$;

comment on function public.imp_transition_allowed(text, text) is
  'Las transiciones del flujo de tres niveles. Un registro validado no sale de ahí.';

create or replace function public.imp_transitions_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.imp_transition_allowed(new.from_state, new.to_state) then
    raise exception 'No se puede pasar un registro de «%» a «%».', new.from_state, new.to_state using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists imp_transitions_check on public.imp_transitions;
create trigger imp_transitions_check
  before insert on public.imp_transitions
  for each row execute function public.imp_transitions_check();

create table if not exists public.imp_import_batches (
  id          bigint generated always as identity primary key,
  period_id   uuid not null references public.imp_periods (id) on delete restrict,
  program_id  uuid not null references public.units (id) on delete restrict,
  file_name   text not null,
  actor_id    uuid references public.profiles (id) on delete restrict,
  at          timestamptz not null default now(),
  rows_read   integer not null,
  rows_loaded integer not null,
  rows_error  integer not null,
  report      jsonb not null default '{}'::jsonb,
  constraint imp_batches_counts check (rows_read >= 0 and rows_loaded >= 0 and rows_error >= 0 and rows_loaded + rows_error <= rows_read)
);

comment on table public.imp_import_batches is
  'Cada importación de una plantilla Excel: quién, cuándo, cuántas filas y el informe. Solo inserción.';

create table if not exists public.imp_import_batch_records (
  batch_id  bigint not null references public.imp_import_batches (id) on delete restrict,
  record_id uuid not null references public.imp_records (id) on delete restrict,
  primary key (batch_id, record_id)
);

comment on table public.imp_import_batch_records is
  'Qué registros modificó cada lote de importación: el historial de un registro muestra sus lotes. Solo inserción.';

create or replace function public.imp_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La tabla % es una bitácora: solo admite registros nuevos.', tg_table_name using errcode = '42501';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['imp_transitions', 'imp_import_batches', 'imp_import_batch_records'] loop
    execute format('drop trigger if exists %1$s_append_only on public.%1$s', t);
    execute format(
      'create trigger %1$s_append_only before update or delete on public.%1$s
         for each row execute function public.imp_append_only()', t);
    execute format('drop trigger if exists %1$s_no_truncate on public.%1$s', t);
    execute format(
      'create trigger %1$s_no_truncate before truncate on public.%1$s
         for each statement execute function public.imp_append_only()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Quién ve y quién escribe
--
-- Leer el catálogo: cualquiera con sesión (el portal lo necesita).
-- Escribirlo: quien tenga impacto.catalogo; los periodos, impacto.periodo.
-- Un registro lo ve su programa (y quien esté por encima), la vicerrectoría de
-- su función y la administración de Impacto. Escribirlo, solo quien captura
-- en ese programa y mientras esté en borrador o devuelto al programa; el
-- cambio de estado va por las funciones del flujo (fase 7).
-- -----------------------------------------------------------------------------

create or replace function public.imp_can_see_program(program uuid, fn text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.imp_can_global('impacto.periodo')
      or public.imp_can_global('impacto.catalogo')
      -- Cualquier pertenencia en el programa o en una unidad superior.
      or public.unit_role_at(program) is not null
      or fn = any (public.imp_validator_functions());
$$;

comment on function public.imp_can_see_program(uuid, text) is
  'Ve los registros de un programa: su gente y la de sus unidades superiores, la vicerrectoría de la función y la administración de Impacto.';

create or replace function public.imp_record_scope(target uuid)
returns table (program_id uuid, function_id text, state text)
language sql
stable
security definer
set search_path = public
as $$
  select a.program_id, i.function_id, r.state
    from public.imp_records r
    join public.imp_assignments a on a.id = r.assignment_id
    join public.imp_indicators i on i.id = a.indicator_id
   where r.id = target;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'imp_master_catalog', 'imp_catalog_versions', 'imp_indicators', 'imp_targets', 'imp_baselines',
    'imp_alignments', 'imp_import_findings', 'imp_periods', 'imp_assignments', 'imp_records',
    'imp_evidence', 'imp_transitions', 'imp_import_batches', 'imp_import_batch_records'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Catálogo: se lee con sesión; lo escribe impacto.catalogo.
do $$
declare
  t text;
begin
  foreach t in array array['imp_master_catalog', 'imp_catalog_versions', 'imp_indicators', 'imp_targets', 'imp_baselines', 'imp_alignments'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format(
      'create policy %1$s_write on public.%1$s for all to authenticated
         using (public.imp_can_global(''impacto.catalogo''))
         with check (public.imp_can_global(''impacto.catalogo''))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists imp_import_findings_all on public.imp_import_findings;
create policy imp_import_findings_all on public.imp_import_findings for all to authenticated
  using (public.imp_can_global('impacto.catalogo'))
  with check (public.imp_can_global('impacto.catalogo'));
grant select, insert, update, delete on public.imp_import_findings to authenticated;

drop policy if exists imp_periods_read on public.imp_periods;
create policy imp_periods_read on public.imp_periods for select to authenticated using (true);
drop policy if exists imp_periods_write on public.imp_periods;
create policy imp_periods_write on public.imp_periods for all to authenticated
  using (public.imp_can_global('impacto.periodo'))
  with check (public.imp_can_global('impacto.periodo'));
grant select, insert, update, delete on public.imp_periods to authenticated;

drop policy if exists imp_assignments_read on public.imp_assignments;
create policy imp_assignments_read on public.imp_assignments for select to authenticated
  using (public.imp_can_see_program(program_id,
    (select i.function_id from public.imp_indicators i where i.id = indicator_id)));
drop policy if exists imp_assignments_write on public.imp_assignments;
create policy imp_assignments_write on public.imp_assignments for all to authenticated
  using (public.imp_can_global('impacto.periodo'))
  with check (public.imp_can_global('impacto.periodo'));
grant select, insert, update, delete on public.imp_assignments to authenticated;

drop policy if exists imp_records_read on public.imp_records;
create policy imp_records_read on public.imp_records for select to authenticated
  using (exists (select 1 from public.imp_record_scope(id) s where public.imp_can_see_program(s.program_id, s.function_id)));

drop policy if exists imp_records_capture on public.imp_records;
create policy imp_records_capture on public.imp_records for update to authenticated
  using (exists (
    select 1 from public.imp_record_scope(id) s
     where public.imp_can('impacto.capturar', s.program_id, false)
       and s.state in ('borrador', 'devuelto_programa')))
  with check (
    state in ('borrador', 'devuelto_programa')
    and exists (select 1 from public.imp_record_scope(id) s where public.imp_can('impacto.capturar', s.program_id, false)));

grant select, update on public.imp_records to authenticated;

drop policy if exists imp_evidence_read on public.imp_evidence;
create policy imp_evidence_read on public.imp_evidence for select to authenticated
  using (exists (select 1 from public.imp_record_scope(record_id) s where public.imp_can_see_program(s.program_id, s.function_id)));
drop policy if exists imp_evidence_write on public.imp_evidence;
create policy imp_evidence_write on public.imp_evidence for all to authenticated
  using (exists (
    select 1 from public.imp_record_scope(record_id) s
     where public.imp_can('impacto.capturar', s.program_id, false) and s.state in ('borrador', 'devuelto_programa')))
  with check (exists (
    select 1 from public.imp_record_scope(record_id) s
     where public.imp_can('impacto.capturar', s.program_id, false) and s.state in ('borrador', 'devuelto_programa')));
grant select, insert, delete on public.imp_evidence to authenticated;

-- Bitácoras: se leen con el registro; se escriben solo desde las funciones
-- del flujo y del importador (security definer). Nunca se actualizan.
drop policy if exists imp_transitions_read on public.imp_transitions;
create policy imp_transitions_read on public.imp_transitions for select to authenticated
  using (exists (select 1 from public.imp_record_scope(record_id) s where public.imp_can_see_program(s.program_id, s.function_id)));
grant select on public.imp_transitions to authenticated;

drop policy if exists imp_import_batches_read on public.imp_import_batches;
create policy imp_import_batches_read on public.imp_import_batches for select to authenticated
  using (actor_id = auth.uid() or public.imp_can_see_program(program_id, null));
grant select on public.imp_import_batches to authenticated;

drop policy if exists imp_import_batch_records_read on public.imp_import_batch_records;
create policy imp_import_batch_records_read on public.imp_import_batch_records for select to authenticated
  using (exists (select 1 from public.imp_record_scope(record_id) s where public.imp_can_see_program(s.program_id, s.function_id)));
grant select on public.imp_import_batch_records to authenticated;

-- Supabase da por defecto todos los permisos a authenticated sobre las tablas
-- nuevas. En las bitácoras se quitan todos menos leer: las escriben solo las
-- funciones del flujo y del importador. RLS ya lo impediría; esto es la
-- segunda cerradura.
revoke insert, update, delete, truncate on public.imp_transitions, public.imp_import_batches, public.imp_import_batch_records from authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array['imp_version_is_published(uuid)', 'imp_can_see_program(uuid, text)', 'imp_record_scope(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
