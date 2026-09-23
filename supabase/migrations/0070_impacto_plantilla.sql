-- =============================================================================
-- PDI · 0070 · Impacto: plantilla Excel firmada e importación
--
-- El programa puede reportar en línea o en una plantilla de Excel que genera
-- el sistema. La plantilla lleva, en una hoja oculta (CONTROL), quién la
-- pidió, para qué programa y periodo, con qué versión del catálogo, cuándo y
-- qué asignaciones trae, y una huella HMAC de todo eso. Al importarla, la
-- base vuelve a calcular la huella: si alguien tocó CONTROL, la plantilla es
-- de otro programa, el periodo cerró o la versión del catálogo ya no es la
-- del periodo, el archivo se rechaza completo y se dice por qué.
--
--   imp_secrets          la clave HMAC; ni anon ni authenticated la leen.
--   imp_settings         parámetros de Impacto; aquí, IMPORTACION_TODO_O_NADA.
--   imp_templates        cada plantilla generada, con su huella.
--   imp_sign_template    genera la plantilla (la fila de control y su huella).
--   imp_verify_template  comprueba el CONTROL de un archivo que vuelve.
--   imp_import_template  carga las filas válidas en borrador, canal «excel»,
--                        y deja el lote en imp_import_batches (solo inserción).
--
-- REGLAS DE LA CARGA
--   · Solo se tocan registros en borrador o devueltos al programa.
--   · Una celda vacía no borra nada: el navegador manda solo lo que la
--     plantilla trae escrito, y aquí solo se escribe lo que llega.
--   · Con IMPORTACION_TODO_O_NADA, una fila con error cancela el archivo.
--
-- Las validaciones (V01–V12) no se repiten aquí: el navegador valida cada
-- fila con el mismo servicio de la captura en línea (validate.ts).
--
-- Requiere 0069 y pgcrypto. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La clave y los parámetros
-- -----------------------------------------------------------------------------

create table if not exists public.imp_secrets (
  key   text primary key,
  value bytea not null,
  created_at timestamptz not null default now()
);

comment on table public.imp_secrets is
  'Secretos de Impacto (la clave HMAC de las plantillas). Sin políticas: solo lo leen funciones security definer.';

alter table public.imp_secrets enable row level security;
revoke all on public.imp_secrets from anon, authenticated;

insert into public.imp_secrets (key, value)
values ('template_hmac', gen_random_bytes(32))
on conflict (key) do nothing;

create table if not exists public.imp_settings (
  key        text primary key,
  value      jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.imp_settings is 'Parámetros de Impacto que Planeación puede cambiar sin desplegar.';

insert into public.imp_settings (key, value, description)
values ('importacion_todo_o_nada', 'false'::jsonb,
        'IMPORTACION_TODO_O_NADA: con true, una sola fila con error cancela la importación del archivo completo.')
on conflict (key) do nothing;

alter table public.imp_settings enable row level security;

drop policy if exists imp_settings_read on public.imp_settings;
create policy imp_settings_read on public.imp_settings for select to authenticated using (true);
drop policy if exists imp_settings_write on public.imp_settings;
create policy imp_settings_write on public.imp_settings for update to authenticated
  using (public.imp_can_global('impacto.periodo'))
  with check (public.imp_can_global('impacto.periodo'));
revoke all on public.imp_settings from anon;
grant select, update on public.imp_settings to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Las plantillas generadas
-- -----------------------------------------------------------------------------

create table if not exists public.imp_templates (
  id                  uuid primary key default gen_random_uuid(),
  period_id           uuid not null references public.imp_periods (id) on delete restrict,
  program_id          uuid not null references public.units (id) on delete restrict,
  catalog_version_id  uuid not null references public.imp_catalog_versions (id) on delete restrict,
  generated_at        timestamptz not null default date_trunc('second', now()),
  generated_by        uuid references public.profiles (id) on delete set null,
  assignment_ids      uuid[] not null,
  protection_password text not null,
  signature           text not null
);

comment on table public.imp_templates is
  'Cada plantilla Excel generada: programa, periodo, versión del catálogo, asignaciones y su huella HMAC.';

create index if not exists imp_templates_program_idx on public.imp_templates (program_id, period_id);

alter table public.imp_templates enable row level security;
revoke all on public.imp_templates from anon, authenticated;

-- Quien la generó ve las suyas (sin la contraseña, que no sale de las funciones).
drop policy if exists imp_templates_read on public.imp_templates;
create policy imp_templates_read on public.imp_templates for select to authenticated
  using (generated_by = auth.uid() or public.imp_can_global('impacto.periodo'));
grant select (id, period_id, program_id, catalog_version_id, generated_at, generated_by, assignment_ids)
  on public.imp_templates to authenticated;

/**
 * La huella: HMAC-SHA256 de los campos de CONTROL, en un orden fijo. Las
 * asignaciones se ordenan para que el orden de las filas no cambie la huella.
 */
create or replace function public.imp_template_signature(
  template_id uuid,
  program_id uuid,
  period_id uuid,
  catalog_version_id uuid,
  generated_at timestamptz,
  assignment_ids uuid[]
)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select encode(
    hmac(
      convert_to(concat_ws('|',
        template_id::text,
        program_id::text,
        period_id::text,
        catalog_version_id::text,
        to_char(generated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        (select string_agg(a::text, ',' order by a::text) from unnest(assignment_ids) a)), 'UTF8'),
      (select s.value from public.imp_secrets s where s.key = 'template_hmac'),
      'sha256'),
    'hex');
$$;

comment on function public.imp_template_signature(uuid, uuid, uuid, uuid, timestamptz, uuid[]) is
  'Huella HMAC-SHA256 del CONTROL de una plantilla. La clave vive en imp_secrets.';

-- -----------------------------------------------------------------------------
-- 3. Generar una plantilla
-- -----------------------------------------------------------------------------

create or replace function public.imp_sign_template(period uuid, program uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  p public.imp_periods;
  v_id uuid := gen_random_uuid();
  v_at timestamptz := date_trunc('second', now());
  v_ids uuid[];
  v_password text := encode(gen_random_bytes(12), 'hex');
  v_signature text;
  v_version integer;
begin
  if not public.imp_can('impacto.capturar', program, false) then
    raise exception 'Solo quien captura en el programa descarga su plantilla.' using errcode = '42501';
  end if;
  select * into p from public.imp_periods where id = period;
  if not found or p.state <> 'abierto' then
    raise exception 'El periodo no existe o está cerrado.' using errcode = '55000';
  end if;

  select coalesce(array_agg(a.id order by a.id), '{}') into v_ids
    from public.imp_assignments a
   where a.period_id = period and a.program_id = program and a.active;
  if cardinality(v_ids) = 0 then
    raise exception 'El programa no tiene asignaciones en este periodo.' using errcode = 'P0002';
  end if;

  v_signature := public.imp_template_signature(v_id, program, period, p.catalog_version_id, v_at, v_ids);
  insert into public.imp_templates (id, period_id, program_id, catalog_version_id, generated_at, generated_by, assignment_ids, protection_password, signature)
  values (v_id, period, program, p.catalog_version_id, v_at, auth.uid(), v_ids, v_password, v_signature);

  select number into v_version from public.imp_catalog_versions where id = p.catalog_version_id;

  return jsonb_build_object(
    'templateId', v_id,
    'programId', program,
    'periodId', period,
    'periodCode', p.code,
    'cutoffProgram', p.cutoff_program,
    'catalogVersionId', p.catalog_version_id,
    'catalogVersion', v_version,
    'generatedAt', to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'assignmentIds', to_jsonb(v_ids),
    'signature', v_signature,
    'password', v_password);
end;
$$;

comment on function public.imp_sign_template(uuid, uuid) is
  'Registra una plantilla nueva y devuelve su CONTROL firmado y la contraseña de protección.';

-- -----------------------------------------------------------------------------
-- 4. Comprobar una plantilla que vuelve
-- -----------------------------------------------------------------------------

/**
 * control: { templateId, programId, periodId, catalogVersionId, generatedAt,
 *            assignmentIds, signature } tal como está en la hoja CONTROL.
 * Si algo no cuadra, el archivo se rechaza completo con el motivo.
 */
create or replace function public.imp_verify_template(control jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  t public.imp_templates;
  p public.imp_periods;
  v_ids uuid[];
  v_expected text;
  v_program text;
begin
  if control is null or jsonb_typeof(control) <> 'object'
     or exists (select 1 from unnest(array['templateId', 'programId', 'periodId', 'catalogVersionId', 'generatedAt', 'signature']) k
                 where coalesce(control ->> k, '') = '')
     or jsonb_typeof(control -> 'assignmentIds') is distinct from 'array' then
    raise exception 'La plantilla no se reconoce: su hoja CONTROL está incompleta o fue modificada.' using errcode = '22023';
  end if;

  begin
    select * into t from public.imp_templates where id = (control ->> 'templateId')::uuid;
    select coalesce(array_agg(x::uuid), '{}') into v_ids from jsonb_array_elements_text(control -> 'assignmentIds') x;
    v_expected := public.imp_template_signature(
      (control ->> 'templateId')::uuid,
      (control ->> 'programId')::uuid,
      (control ->> 'periodId')::uuid,
      (control ->> 'catalogVersionId')::uuid,
      (control ->> 'generatedAt')::timestamptz,
      v_ids);
  exception when others then
    raise exception 'La plantilla no se reconoce: su hoja CONTROL está incompleta o fue modificada.' using errcode = '22023';
  end;

  if t.id is null then
    raise exception 'La plantilla no se reconoce: no fue generada por este sistema.' using errcode = '22023';
  end if;
  if v_expected is distinct from control ->> 'signature' or v_expected is distinct from t.signature then
    raise exception 'La plantilla fue alterada: su huella de control no coincide. Descargue una plantilla nueva.' using errcode = '22023';
  end if;
  if not public.imp_can('impacto.capturar', t.program_id, false) then
    select name into v_program from public.units where id = t.program_id;
    raise exception 'La plantilla es de otro programa (%): usted no captura en él.', v_program using errcode = '42501';
  end if;

  select * into p from public.imp_periods where id = t.period_id;
  if p.state <> 'abierto' then
    raise exception 'El periodo % está cerrado: ya no se importan plantillas.', p.code using errcode = '55000';
  end if;
  if p.catalog_version_id <> t.catalog_version_id then
    raise exception 'La plantilla se generó con otra versión del catálogo: descargue una plantilla nueva.' using errcode = '55000';
  end if;
  if exists (
    select 1 from unnest(t.assignment_ids) a(id)
     where not exists (select 1 from public.imp_assignments x where x.id = a.id and x.active and x.program_id = t.program_id and x.period_id = t.period_id)) then
    raise exception 'Las asignaciones del periodo cambiaron después de generar la plantilla: descargue una nueva.' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'templateId', t.id,
    'programId', t.program_id,
    'periodId', t.period_id,
    'periodCode', p.code,
    'generatedAt', to_char(t.generated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'assignmentIds', to_jsonb(t.assignment_ids));
end;
$$;

comment on function public.imp_verify_template(jsonb) is
  'Comprueba el CONTROL de una plantilla: huella, programa, periodo abierto, versión del catálogo y asignaciones.';

-- -----------------------------------------------------------------------------
-- 5. Importar
-- -----------------------------------------------------------------------------

/**
 * rows: [{ row, recordId, fields: { numerator, denominator, n_responses,
 *          num_comparison, den_comparison, confirms_preloaded, no_data,
 *          justification, observations, evidence_url } }]
 * Solo trae las celdas con algo escrito; lo que no viene no se toca.
 * summary: { rowsRead, rowsError, report } lo que vio el navegador al validar.
 */
create or replace function public.imp_import_template(
  template uuid,
  rows_in jsonb,
  file_name text,
  summary jsonb default '{}'::jsonb,
  all_or_nothing boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  t public.imp_templates;
  v_policy boolean;
  item jsonb;
  f jsonb;
  r public.imp_records;
  loaded uuid[] := '{}';
  errors jsonb := '[]'::jsonb;
  v_batch bigint;
  v_read integer;
  v_client_errors integer;
begin
  select * into t from public.imp_templates where id = template;
  if not found then
    raise exception 'La plantilla no se reconoce.' using errcode = '22023';
  end if;
  if not public.imp_can('impacto.capturar', t.program_id, false) then
    raise exception 'Solo quien captura en el programa importa su plantilla.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.imp_periods where id = t.period_id and state = 'abierto') then
    raise exception 'El periodo está cerrado: ya no se importan plantillas.' using errcode = '55000';
  end if;

  v_policy := coalesce(all_or_nothing, (select (value)::text::boolean from public.imp_settings where key = 'importacion_todo_o_nada'), false);
  v_read := coalesce((summary ->> 'rowsRead')::integer, jsonb_array_length(rows_in));
  v_client_errors := coalesce((summary ->> 'rowsError')::integer, 0);

  if v_policy and v_client_errors > 0 then
    raise exception 'La importación es todo o nada y % filas tienen errores: no se cargó ninguna. Corríjalas y vuelva a importar.', v_client_errors
      using errcode = '23514';
  end if;

  for item in select * from jsonb_array_elements(rows_in)
  loop
    f := coalesce(item -> 'fields', '{}'::jsonb);
    select rec.* into r
      from public.imp_records rec
     where rec.id = (item ->> 'recordId')::uuid
       and rec.assignment_id = any (t.assignment_ids);

    if r.id is null then
      errors := errors || jsonb_build_object('row', item -> 'row', 'message', 'La fila no corresponde a esta plantilla.');
      continue;
    end if;
    if r.state not in ('borrador', 'devuelto_programa') then
      errors := errors || jsonb_build_object('row', item -> 'row', 'message', 'El registro ya fue enviado: no se modifica.');
      continue;
    end if;

    update public.imp_records
       set numerator          = case when f ? 'numerator' then (f ->> 'numerator')::numeric else numerator end,
           denominator        = case when f ? 'denominator' then (f ->> 'denominator')::numeric else denominator end,
           n_responses        = case when f ? 'n_responses' then (f ->> 'n_responses')::integer else n_responses end,
           num_comparison     = case when f ? 'num_comparison' then (f ->> 'num_comparison')::numeric else num_comparison end,
           den_comparison     = case when f ? 'den_comparison' then (f ->> 'den_comparison')::numeric else den_comparison end,
           confirms_preloaded = case when f ? 'confirms_preloaded' then (f ->> 'confirms_preloaded')::boolean else confirms_preloaded end,
           no_data            = case when f ? 'no_data' then nullif(f ->> 'no_data', '') else no_data end,
           justification      = case when f ? 'justification' then f ->> 'justification' else justification end,
           observations       = case when f ? 'observations' then f ->> 'observations' else observations end,
           channel            = 'excel'
     where id = r.id;

    if nullif(trim(f ->> 'evidence_url'), '') is not null then
      insert into public.imp_evidence (record_id, kind, url, file_name, created_by)
      values (r.id, 'url', trim(f ->> 'evidence_url'), trim(f ->> 'evidence_url'), auth.uid());
    end if;
    loaded := loaded || r.id;
  end loop;

  if v_policy and jsonb_array_length(errors) > 0 then
    raise exception 'La importación es todo o nada y % filas no se pudieron cargar, así que no se cargó ninguna: %', jsonb_array_length(errors), errors ->> 0
      using errcode = '23514';
  end if;

  insert into public.imp_import_batches (period_id, program_id, file_name, actor_id, rows_read, rows_loaded, rows_error, report)
  values (
    t.period_id, t.program_id, coalesce(nullif(file_name, ''), 'plantilla.xlsx'), auth.uid(),
    greatest(v_read, cardinality(loaded) + v_client_errors + jsonb_array_length(errors)),
    cardinality(loaded),
    v_client_errors + jsonb_array_length(errors),
    jsonb_build_object('templateId', t.id, 'serverErrors', errors, 'client', coalesce(summary -> 'report', '{}'::jsonb), 'allOrNothing', v_policy))
  returning id into v_batch;

  insert into public.imp_import_batch_records (batch_id, record_id)
  select v_batch, x from unnest(loaded) x
  on conflict do nothing;

  return jsonb_build_object('batchId', v_batch, 'loaded', cardinality(loaded), 'errors', errors, 'allOrNothing', v_policy);
end;
$$;

comment on function public.imp_import_template(uuid, jsonb, text, jsonb, boolean) is
  'Carga en borrador las filas válidas de una plantilla (canal excel) y registra el lote. Una celda vacía no borra.';

-- -----------------------------------------------------------------------------
-- 6. Permisos
-- -----------------------------------------------------------------------------

revoke all on function public.imp_template_signature(uuid, uuid, uuid, uuid, timestamptz, uuid[]) from public, anon, authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'imp_sign_template(uuid, uuid)',
    'imp_verify_template(jsonb)',
    'imp_import_template(uuid, jsonb, text, jsonb, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
