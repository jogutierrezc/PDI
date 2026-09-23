-- =============================================================================
-- PDI · 0068 · Impacto: periodos, asignaciones y valores precargados
--
-- REGLAS DE ASIGNACIÓN (imp_assignment_candidates)
--
-- Al abrir un periodo, cada indicador recibe una asignación por programa (y
-- por sede, si se reporta por sede) cuando:
--   · es oficial en la versión publicada del periodo; los sugeridos nunca;
--   · tiene la ficha completa: sin ella no se sabe qué ni cómo pedir;
--   · su periodicidad corresponde: los anuales, solo en el segundo semestre;
--   · se reporta por programa o por programa y sede;
--   · el programa se ofrece en alguna sede activa y cumple «aplica a»: su
--     nivel de formación está en la lista y, si la ficha nombra
--     modalidades, la suya está entre ellas.
--
-- Abrir es en dos pasos: la vista previa no escribe nada; confirmar crea el
-- periodo, las asignaciones y un registro en borrador por cada una activa.
-- Quitar una asignación la deja inactiva con su porqué; agregar una a mano
-- la marca como manual, también con su porqué. Nada desaparece sin rastro.
--
-- PRECARGADOS (imp_load_preloaded)
--
-- Los indicadores con modo de captura «precargado» llegan de una fuente
-- institucional (Registro y Control, Gestión Humana, ICFES). Planeación los
-- carga aquí; el programa los confirma o declara la discrepancia. El valor
-- que llegó se guarda aparte (`preloaded`) para que la discrepancia se vea.
--
-- Solo quien tenga impacto.periodo. Requiere 0067. Idempotente.
-- =============================================================================

alter table public.imp_records add column if not exists preloaded jsonb;

comment on column public.imp_records.preloaded is
  'Lo que llegó de la fuente institucional para un indicador precargado: numerador, denominador y n, con archivo y fecha.';

-- -----------------------------------------------------------------------------
-- 1. Qué le toca a cada programa
-- -----------------------------------------------------------------------------

create or replace function public.imp_assignment_candidates(version uuid, period_code text)
returns table (
  indicator_id uuid,
  indicator_code text,
  indicator_name text,
  function_id text,
  report_level text,
  program_id uuid,
  program_name text,
  faculty_name text,
  degree_level text,
  campus_id uuid,
  campus_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with programs as (
    select u.id, u.name, u.degree_level, u.modality, f.name as faculty
      from public.units u
      left join public.units f on f.id = u.parent_id
     where u.kind = 'programa'
       and exists (select 1 from public.imp_program_campuses pc where pc.program_id = u.id and pc.active)
  ),
  indicators as (
    select i.*
      from public.imp_indicators i
     where i.version_id = version
       and i.catalog_state = 'oficial'
       and public.imp_sheet_complete(i)
       and i.report_level in ('programa', 'programa_sede')
       and (i.periodicity = 'semestral' or right(period_code, 2) = '-2')
  )
  select i.id, i.code, i.name, i.function_id, i.report_level,
         p.id, p.name, p.faculty, p.degree_level,
         c.id, c.name
    from indicators i
    join programs p
      on p.degree_level = any (i.applies_degrees)
     and (cardinality(i.applies_modalities) = 0 or p.modality = any (i.applies_modalities))
    left join lateral (
      select cc.id, cc.name, cc.position
        from public.imp_program_campuses pc
        join public.campuses cc on cc.id = pc.campus_id
       where pc.program_id = p.id and pc.active and i.report_level = 'programa_sede'
    ) c on true
   where i.report_level = 'programa' or c.id is not null
   order by p.faculty, p.name, i.code, c.position;
$$;

comment on function public.imp_assignment_candidates(uuid, text) is
  'Las asignaciones que salen de las reglas para una versión del catálogo y un periodo. No escribe nada.';

-- Se borra y se crea: si cambia el tipo de salida, create or replace no basta.
drop function if exists public.imp_preview_assignments(text, uuid);
create or replace function public.imp_preview_assignments(period_code text, version uuid default null)
returns table (
  indicator_id uuid, indicator_code text, indicator_name text, function_id text, report_level text,
  program_id uuid, program_name text, faculty_name text, degree_level text, campus_id uuid, campus_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid := version;
begin
  if not public.imp_can_global('impacto.periodo') then
    raise exception 'Solo la administración de Impacto abre periodos.' using errcode = '42501';
  end if;
  if period_code !~ '^[0-9]{4}-[12]$' then
    raise exception 'El periodo se escribe AAAA-1 o AAAA-2 (por ejemplo, 2026-2).' using errcode = '22023';
  end if;
  if v is null then
    select c.id into v from public.imp_catalog_versions c where c.state = 'publicada' order by c.number desc limit 1;
  end if;
  if v is null or not public.imp_version_is_published(v) then
    raise exception 'Un periodo se abre con una versión publicada del catálogo, y no hay ninguna.' using errcode = 'P0002';
  end if;
  return query select * from public.imp_assignment_candidates(v, period_code);
end;
$$;

comment on function public.imp_preview_assignments(text, uuid) is
  'Vista previa de las asignaciones de un periodo; sin versión, la última publicada.';

-- -----------------------------------------------------------------------------
-- 2. Abrir el periodo
-- -----------------------------------------------------------------------------

/**
 * changes: [{ indicator_id, program_id, campus_id, action: 'quitar'|'agregar', justification }]
 * Quitar deja la asignación inactiva con su porqué; agregar crea una manual.
 */
create or replace function public.imp_open_period(
  period_code text,
  cutoff_program date,
  cutoff_faculty date,
  cutoff_vice date,
  version uuid default null,
  changes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := version;
  v_period uuid;
  ch jsonb;
  n_active integer;
  n_removed integer;
  n_added integer := 0;
begin
  if not public.imp_can_global('impacto.periodo') then
    raise exception 'Solo la administración de Impacto abre periodos.' using errcode = '42501';
  end if;
  if exists (select 1 from public.imp_periods where code = period_code) then
    raise exception 'El periodo % ya existe.', period_code using errcode = '23505';
  end if;
  if v is null then
    select c.id into v from public.imp_catalog_versions c where c.state = 'publicada' order by c.number desc limit 1;
  end if;

  -- Cada cambio necesita su porqué.
  if exists (select 1 from jsonb_array_elements(changes) c where length(trim(coalesce(c ->> 'justification', ''))) = 0) then
    raise exception 'Cada asignación que se quita o se agrega necesita su justificación.' using errcode = '23514';
  end if;

  insert into public.imp_periods (code, catalog_version_id, cutoff_program, cutoff_faculty, cutoff_vice, created_by)
  values (period_code, v, cutoff_program, cutoff_faculty, cutoff_vice, auth.uid())
  returning id into v_period;

  -- Las de las reglas.
  insert into public.imp_assignments (period_id, indicator_id, program_id, campus_id, created_by)
  select v_period, cand.indicator_id, cand.program_id, cand.campus_id, auth.uid()
    from public.imp_assignment_candidates(v, period_code) cand;

  -- Las que se quitan: inactivas, con su porqué.
  update public.imp_assignments a
     set active = false, justification = trim(c ->> 'justification')
    from jsonb_array_elements(changes) c
   where c ->> 'action' = 'quitar'
     and a.period_id = v_period
     and a.indicator_id = (c ->> 'indicator_id')::uuid
     and a.program_id = (c ->> 'program_id')::uuid
     and a.campus_id is not distinct from nullif(c ->> 'campus_id', '')::uuid;

  -- Las que se agregan a mano.
  for ch in select * from jsonb_array_elements(changes) where value ->> 'action' = 'agregar'
  loop
    if not exists (select 1 from public.imp_indicators i where i.id = (ch ->> 'indicator_id')::uuid and i.version_id = v) then
      raise exception 'El indicador agregado no es de la versión del periodo.' using errcode = '23514';
    end if;
    insert into public.imp_assignments (period_id, indicator_id, program_id, campus_id, manual, justification, created_by)
    values (v_period, (ch ->> 'indicator_id')::uuid, (ch ->> 'program_id')::uuid, nullif(ch ->> 'campus_id', '')::uuid,
            true, trim(ch ->> 'justification'), auth.uid())
    on conflict (period_id, indicator_id, program_id, campus_id)
      do update set active = true, manual = true, justification = excluded.justification;
    n_added := n_added + 1;
  end loop;

  -- Un registro en borrador por asignación activa.
  insert into public.imp_records (assignment_id)
  select a.id from public.imp_assignments a where a.period_id = v_period and a.active
  on conflict (assignment_id) do nothing;

  select count(*) filter (where active), count(*) filter (where not active)
    into n_active, n_removed
    from public.imp_assignments where period_id = v_period;

  return jsonb_build_object('periodId', v_period, 'code', period_code, 'active', n_active, 'removed', n_removed, 'added', n_added);
end;
$$;

comment on function public.imp_open_period(text, date, date, date, uuid, jsonb) is
  'Abre un periodo: asignaciones por reglas, las quitadas y agregadas con su porqué, y un registro en borrador por cada una activa.';

-- -----------------------------------------------------------------------------
-- 3. Cambiar asignaciones con el periodo abierto
-- -----------------------------------------------------------------------------

create or replace function public.imp_set_assignment(target uuid, make_active boolean, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.imp_assignments;
  r public.imp_records;
begin
  if not public.imp_can_global('impacto.periodo') then
    raise exception 'Solo la administración de Impacto cambia asignaciones.' using errcode = '42501';
  end if;
  if length(trim(coalesce(reason, ''))) = 0 then
    raise exception 'Quitar o devolver una asignación necesita su justificación.' using errcode = '23514';
  end if;
  select * into a from public.imp_assignments where id = target;
  if not found then
    raise exception 'La asignación no existe.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.imp_periods p where p.id = a.period_id and p.state = 'cerrado') then
    raise exception 'El periodo está cerrado.' using errcode = '55000';
  end if;
  select * into r from public.imp_records where assignment_id = target;
  if not make_active and r.id is not null and r.state <> 'borrador' then
    raise exception 'El registro ya salió del programa (%): no se puede quitar la asignación.', r.state using errcode = '55000';
  end if;

  update public.imp_assignments set active = make_active, justification = trim(reason) where id = target;
  if make_active then
    insert into public.imp_records (assignment_id) values (target) on conflict (assignment_id) do nothing;
  end if;
end;
$$;

create or replace function public.imp_add_assignment(period uuid, indicator uuid, program uuid, campus uuid, reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.imp_can_global('impacto.periodo') then
    raise exception 'Solo la administración de Impacto agrega asignaciones.' using errcode = '42501';
  end if;
  if length(trim(coalesce(reason, ''))) = 0 then
    raise exception 'Agregar una asignación necesita su justificación.' using errcode = '23514';
  end if;
  if exists (select 1 from public.imp_periods p where p.id = period and p.state = 'cerrado') then
    raise exception 'El periodo está cerrado.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.imp_indicators i join public.imp_periods p on p.catalog_version_id = i.version_id
     where i.id = indicator and p.id = period) then
    raise exception 'El indicador no es de la versión del catálogo del periodo.' using errcode = '23514';
  end if;

  insert into public.imp_assignments (period_id, indicator_id, program_id, campus_id, manual, justification, created_by)
  values (period, indicator, program, campus, true, trim(reason), auth.uid())
  on conflict (period_id, indicator_id, program_id, campus_id)
    do update set active = true, manual = true, justification = excluded.justification
  returning id into v_id;
  insert into public.imp_records (assignment_id) values (v_id) on conflict (assignment_id) do nothing;
  return v_id;
end;
$$;

create or replace function public.imp_close_period(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.imp_can_global('impacto.periodo') then
    raise exception 'Solo la administración de Impacto cierra periodos.' using errcode = '42501';
  end if;
  update public.imp_periods set state = 'cerrado' where id = target and state = 'abierto';
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Valores precargados
-- -----------------------------------------------------------------------------

/**
 * items: [{ row, indicator, program, campus, numerator, denominator, n }]
 *   indicator  código del indicador (E04)
 *   program    código SNIES o código de la unidad (MED)
 *   campus     slug o nombre de la sede; vacío si el indicador es por programa
 * Devuelve cuántas filas cargó y, por cada fila que no, su motivo.
 */
create or replace function public.imp_load_preloaded(period uuid, items jsonb, source_file text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_record public.imp_records;
  v_indicator public.imp_indicators;
  v_program uuid;
  v_campus uuid;
  loaded integer := 0;
  errors jsonb := '[]'::jsonb;
  err text;
begin
  if not public.imp_can_global('impacto.periodo') then
    raise exception 'Solo la administración de Impacto carga valores precargados.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.imp_periods p where p.id = period and p.state = 'abierto') then
    raise exception 'El periodo no existe o está cerrado.' using errcode = '55000';
  end if;

  for item in select * from jsonb_array_elements(items)
  loop
    err := null;
    v_record := null;

    select i.* into v_indicator
      from public.imp_indicators i
      join public.imp_periods p on p.catalog_version_id = i.version_id
     where p.id = period and upper(i.code) = upper(trim(item ->> 'indicator'));
    select u.id into v_program
      from public.units u
     where u.kind = 'programa'
       and (u.snies_code = trim(item ->> 'program') or upper(u.code) = upper(trim(item ->> 'program')))
     limit 1;
    select c.id into v_campus
      from public.campuses c
     where nullif(trim(item ->> 'campus'), '') is not null
       and (c.slug = lower(trim(item ->> 'campus')) or lower(c.name) = lower(trim(item ->> 'campus')))
     limit 1;

    if v_indicator.id is null then
      err := format('El indicador «%s» no está en la versión del periodo.', item ->> 'indicator');
    elsif v_indicator.capture_mode <> 'precargado' then
      err := format('%s no es un indicador precargado: lo captura el programa.', v_indicator.code);
    elsif v_program is null then
      err := format('No se encontró el programa «%s» (use el código SNIES o el código del programa).', item ->> 'program');
    elsif nullif(trim(item ->> 'campus'), '') is not null and v_campus is null then
      err := format('No se encontró la sede «%s».', item ->> 'campus');
    else
      select r.* into v_record
        from public.imp_records r
        join public.imp_assignments a on a.id = r.assignment_id
       where a.period_id = period and a.active
         and a.indicator_id = v_indicator.id and a.program_id = v_program
         and a.campus_id is not distinct from v_campus;
      if v_record.id is null then
        err := 'El programa no tiene esa asignación en el periodo (revise la sede).';
      elsif v_record.state not in ('borrador', 'devuelto_programa') then
        err := 'El registro ya fue enviado: no se sobrescribe.';
      elsif (item ->> 'numerator') is null or (item ->> 'numerator')::numeric < 0
            or ((item ->> 'denominator') is not null and (item ->> 'denominator')::numeric <= 0) then
        err := 'El numerador debe ser un número mayor o igual a cero y el denominador, mayor que cero.';
      end if;
    end if;

    if err is not null then
      errors := errors || jsonb_build_object('row', item -> 'row', 'message', err);
      continue;
    end if;

    update public.imp_records
       set numerator = (item ->> 'numerator')::numeric,
           denominator = (item ->> 'denominator')::numeric,
           n_responses = (item ->> 'n')::integer,
           confirms_preloaded = null,
           preloaded = jsonb_build_object(
             'numerator', (item ->> 'numerator')::numeric,
             'denominator', (item ->> 'denominator')::numeric,
             'n', (item ->> 'n')::integer,
             'file', source_file,
             'at', now(),
             'by', auth.uid()),
           updated_by = auth.uid()
     where id = v_record.id;
    loaded := loaded + 1;
  end loop;

  return jsonb_build_object('loaded', loaded, 'errors', errors);
end;
$$;

comment on function public.imp_load_preloaded(uuid, jsonb, text) is
  'Carga valores de indicadores precargados en los registros del periodo. Nunca sobrescribe un registro enviado.';

-- -----------------------------------------------------------------------------
-- 5. Permisos
-- -----------------------------------------------------------------------------

revoke all on function public.imp_assignment_candidates(uuid, text) from public, anon, authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'imp_preview_assignments(text, uuid)',
    'imp_open_period(text, date, date, date, uuid, jsonb)',
    'imp_set_assignment(uuid, boolean, text)',
    'imp_add_assignment(uuid, uuid, uuid, uuid, text)',
    'imp_close_period(uuid)',
    'imp_load_preloaded(uuid, jsonb, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
