-- =============================================================================
-- PDI · 0067 · Impacto: administrar el catálogo
--
--   imp_indicators_admin   los indicadores con su ficha marcada completa o
--                          incompleta; es lo que lista la pantalla.
--   imp_publish_catalog    publica el borrador. Se niega si un indicador en
--                          piloto tiene la ficha incompleta, y dice cuáles.
--   imp_new_draft          abre la versión siguiente copiando la publicada:
--                          es la única forma de cambiar algo publicado.
--   imp_renumber_codes     vuelve a numerar I01…, E01…, X01… en el orden de
--                          la matriz. Los códigos también se editan a mano.
--   hallazgos              resolver o aceptar deja quién y cuándo.
--
-- Solo quien tenga impacto.catalogo. Requiere 0066. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lo que lista la pantalla
-- -----------------------------------------------------------------------------

create or replace view public.imp_indicators_admin
with (security_invoker = true)
as
select i.*,
       public.imp_sheet_complete(i) as sheet_complete,
       v.number as version_number,
       v.state as version_state,
       (select count(*) from public.imp_import_findings f
         where f.version_id = i.version_id and f.state = 'abierto'
           and f.sheet = i.matrix_sheet and f.row_number = i.matrix_row) as open_findings
  from public.imp_indicators i
  join public.imp_catalog_versions v on v.id = i.version_id;

comment on view public.imp_indicators_admin is
  'Indicadores con el estado de su ficha y sus hallazgos abiertos. security_invoker: respeta el RLS de quien consulta.';

grant select on public.imp_indicators_admin to authenticated;

-- Qué le falta a una ficha, dicho en palabras para la pantalla y para el error de publicar.
create or replace function public.imp_sheet_missing(i public.imp_indicators)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
    case when i.calc_type is null then 'tipo de cálculo' end,
    case when nullif(trim(i.numerator_def), '') is null then 'qué va en el numerador' end,
    case when i.calc_type in ('razon', 'comparacion') and nullif(trim(i.denominator_def), '') is null then 'qué va en el denominador' end,
    case when i.factor is null then 'factor' end,
    case when i.aggregation is null then 'regla de agregación' end,
    case when i.direction is null then 'sentido' end,
    case when i.periodicity is null then 'periodicidad' end,
    case when i.report_level is null then 'nivel de reporte' end,
    case when cardinality(i.applies_degrees) = 0 then 'niveles de formación' end,
    case when i.capture_mode is null then 'modo de captura' end,
    case when i.unit is null then 'unidad' end,
    case when i.validator_function is null then 'vicerrectoría validadora' end,
    case when i.calc_type = 'puntaje' and i.n_minimum is null then 'n mínimo' end,
    case when i.evidence_required and nullif(trim(i.evidence_type), '') is null then 'tipo de evidencia' end
  ], null);
$$;

comment on function public.imp_sheet_missing(public.imp_indicators) is
  'Campos que le faltan a la ficha técnica; vacío cuando está completa.';

/** Lo mismo, por id, para llamarlo desde la API. Respeta el RLS de quien pregunta. */
create or replace function public.imp_indicator_missing(target uuid)
returns text[]
language sql
stable
security invoker
set search_path = public
as $$
  select public.imp_sheet_missing(i) from public.imp_indicators i where i.id = target;
$$;

-- -----------------------------------------------------------------------------
-- 2. Publicar
-- -----------------------------------------------------------------------------

create or replace function public.imp_publish_catalog(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.imp_catalog_versions;
  blockers jsonb;
begin
  if not public.imp_can_global('impacto.catalogo') then
    raise exception 'Solo la administración de Impacto puede publicar el catálogo.' using errcode = '42501';
  end if;

  select * into v from public.imp_catalog_versions where id = target for update;
  if not found then
    raise exception 'La versión no existe.' using errcode = 'P0002';
  end if;
  if v.state = 'publicada' then
    raise exception 'La versión % ya está publicada.', v.number using errcode = '55000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('code', i.code, 'name', i.name, 'missing', public.imp_sheet_missing(i)) order by i.code), '[]')
    into blockers
    from public.imp_indicators i
   where i.version_id = target
     and i.in_pilot
     and not public.imp_sheet_complete(i);

  if jsonb_array_length(blockers) > 0 then
    raise exception 'No se puede publicar: falta completar la ficha de % (en piloto).',
      (select string_agg(b ->> 'code', ', ') from jsonb_array_elements(blockers) b)
      using errcode = '23514', detail = blockers::text;
  end if;

  if not exists (select 1 from public.imp_indicators i where i.version_id = target and i.in_pilot) then
    raise exception 'No se puede publicar un catálogo sin indicadores en piloto: no habría nada que reportar.' using errcode = '23514';
  end if;

  update public.imp_catalog_versions
     set state = 'publicada', published_at = now(), published_by = auth.uid()
   where id = target;

  return jsonb_build_object(
    'number', v.number,
    'indicators', (select count(*) from public.imp_indicators where version_id = target),
    'pilot', (select count(*) from public.imp_indicators where version_id = target and in_pilot));
end;
$$;

comment on function public.imp_publish_catalog(uuid) is
  'Publica un borrador. Se niega si algún indicador en piloto tiene la ficha incompleta.';

-- -----------------------------------------------------------------------------
-- 3. Cambiar algo publicado: la versión siguiente
-- -----------------------------------------------------------------------------

create or replace function public.imp_new_draft()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source uuid;
  v_number integer;
  v_draft uuid;
begin
  if not public.imp_can_global('impacto.catalogo') then
    raise exception 'Solo la administración de Impacto puede abrir una versión nueva.' using errcode = '42501';
  end if;
  if exists (select 1 from public.imp_catalog_versions where state = 'borrador') then
    raise exception 'Ya hay una versión en borrador: los cambios van allí.' using errcode = '55000';
  end if;

  select id into v_source from public.imp_catalog_versions where state = 'publicada' order by number desc limit 1;
  if v_source is null then
    raise exception 'No hay una versión publicada que copiar. Importe la matriz.' using errcode = 'P0002';
  end if;

  select max(number) + 1 into v_number from public.imp_catalog_versions;
  insert into public.imp_catalog_versions (number, source_file, notes, created_by)
  select v_number, source_file, format('Copia de la versión %s', number), auth.uid()
    from public.imp_catalog_versions where id = v_source
  returning id into v_draft;

  -- Se copian indicadores y lo que cuelga de ellos, emparejados por código.
  insert into public.imp_indicators (
    version_id, code, function_id, level, catalog_state, name, description, matrix_sheet, matrix_row,
    unit_original, responsible_original, source, origin, dfma_pillars_review, dfma_projects_review,
    unit, calc_type, numerator_def, denominator_def, factor, aggregation, direction, periodicity,
    report_level, applies_degrees, applies_modalities, capture_mode, evidence_type, evidence_required,
    variation_threshold, range_min, range_max, n_minimum, allows_over_one, validator_function, in_pilot)
  select
    v_draft, code, function_id, level, catalog_state, name, description, matrix_sheet, matrix_row,
    unit_original, responsible_original, source, origin, dfma_pillars_review, dfma_projects_review,
    unit, calc_type, numerator_def, denominator_def, factor, aggregation, direction, periodicity,
    report_level, applies_degrees, applies_modalities, capture_mode, evidence_type, evidence_required,
    variation_threshold, range_min, range_max, n_minimum, allows_over_one, validator_function, in_pilot
  from public.imp_indicators where version_id = v_source;

  insert into public.imp_targets (indicator_id, year, numeric_value, text_value)
  select n.id, t.year, t.numeric_value, t.text_value
    from public.imp_targets t
    join public.imp_indicators o on o.id = t.indicator_id and o.version_id = v_source
    join public.imp_indicators n on n.version_id = v_draft and n.code = o.code;

  insert into public.imp_baselines (indicator_id, unit_id, year, value)
  select n.id, b.unit_id, b.year, b.value
    from public.imp_baselines b
    join public.imp_indicators o on o.id = b.indicator_id and o.version_id = v_source
    join public.imp_indicators n on n.version_id = v_draft and n.code = o.code;

  insert into public.imp_alignments (indicator_id, kind, code)
  select n.id, a.kind, a.code
    from public.imp_alignments a
    join public.imp_indicators o on o.id = a.indicator_id and o.version_id = v_source
    join public.imp_indicators n on n.version_id = v_draft and n.code = o.code;

  return v_draft;
end;
$$;

comment on function public.imp_new_draft() is
  'Abre la versión siguiente del catálogo como copia de la última publicada. La publicada no cambia.';

-- -----------------------------------------------------------------------------
-- 4. Códigos
-- -----------------------------------------------------------------------------

create or replace function public.imp_renumber_codes(target uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.imp_can_global('impacto.catalogo') then
    raise exception 'Solo la administración de Impacto puede numerar el catálogo.' using errcode = '42501';
  end if;
  if public.imp_version_is_published(target) then
    raise exception 'La versión está publicada: los códigos no cambian.' using errcode = '55000';
  end if;

  -- En dos pasos para no chocar con la unicidad mientras se renumera.
  update public.imp_indicators set code = code || '9' where version_id = target and length(code) = 3;
  with ordered as (
    select id,
           case function_id when 'investigacion' then 'I' when 'ensenanza' then 'E' else 'X' end
           || lpad(row_number() over (partition by function_id order by matrix_row nulls last, created_at)::text, 2, '0') as code
      from public.imp_indicators
     where version_id = target
  )
  update public.imp_indicators i set code = o.code from ordered o where o.id = i.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.imp_renumber_codes(uuid) is
  'Asigna I01…, E01…, X01… en el orden de la matriz dentro de cada función.';

-- -----------------------------------------------------------------------------
-- 5. Hallazgos: quién los resolvió y cuándo
-- -----------------------------------------------------------------------------

create or replace function public.imp_findings_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.state is distinct from old.state then
    if new.state = 'abierto' then
      new.resolved_by := null;
      new.resolved_at := null;
    else
      new.resolved_by := auth.uid();
      new.resolved_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists imp_findings_stamp on public.imp_import_findings;
create trigger imp_findings_stamp
  before update on public.imp_import_findings
  for each row execute function public.imp_findings_stamp();

-- -----------------------------------------------------------------------------
-- 6. Permisos
-- -----------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array['imp_publish_catalog(uuid)', 'imp_new_draft()', 'imp_renumber_codes(uuid)',
                            'imp_sheet_missing(public.imp_indicators)', 'imp_indicator_missing(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
