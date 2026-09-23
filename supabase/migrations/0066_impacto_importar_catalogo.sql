-- =============================================================================
-- PDI · 0066 · Impacto: cargar la matriz importada como borrador
--
-- El navegador lee el Excel (src/modules/impacto/import/matrix.ts) y manda
-- aquí lo normalizado y los hallazgos. Esta función lo escribe todo de una
-- vez, en una sola transacción: o queda la versión completa o no queda nada.
--
--   · crea la versión siguiente en borrador (si ya hay un borrador, se niega:
--     primero se publica o se descarta el que existe);
--   · inserta indicadores con lo que trae la matriz, metas, línea base
--     institucional y alineaciones;
--   · agrega al catálogo maestro las fuentes y las dimensiones nuevas;
--   · guarda los hallazgos, abiertos;
--   · si se pide, copia la ficha técnica de la última versión publicada a los
--     indicadores con el mismo código, para no volver a llenarla.
--
-- Solo quien tenga impacto.catalogo.
-- Requiere 0064. Idempotente.
-- =============================================================================

create or replace function public.imp_import_catalog(payload jsonb, carry_sheets boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version uuid;
  v_number integer;
  v_previous uuid;
  item jsonb;
  v_indicator uuid;
  t jsonb;
  a jsonb;
  f jsonb;
  counts jsonb;
begin
  if not public.imp_can_global('impacto.catalogo') then
    raise exception 'Solo la administración de Impacto puede importar la matriz.' using errcode = '42501';
  end if;
  if exists (select 1 from public.imp_catalog_versions where state = 'borrador') then
    raise exception 'Ya hay una versión del catálogo en borrador. Publíquela o descártela antes de importar otra.'
      using errcode = '55000';
  end if;
  if jsonb_typeof(payload -> 'indicators') <> 'array' or jsonb_array_length(payload -> 'indicators') = 0 then
    raise exception 'La matriz no trae indicadores.' using errcode = '22023';
  end if;

  select coalesce(max(number), 0) + 1 into v_number from public.imp_catalog_versions;
  select v.id into v_previous
    from public.imp_catalog_versions v
   where v.state = 'publicada'
   order by v.number desc
   limit 1;

  insert into public.imp_catalog_versions (number, source_file, created_by)
  values (v_number, coalesce(payload ->> 'sourceFile', ''), auth.uid())
  returning id into v_version;

  -- Catálogo maestro: fuentes y dimensiones nuevas.
  insert into public.imp_master_catalog (kind, code, name)
  select 'fuente', left(s, 200), s
    from jsonb_array_elements_text(coalesce(payload -> 'sources', '[]'::jsonb)) s
  on conflict (kind, function_id, code) do nothing;

  insert into public.imp_master_catalog (kind, function_id, code, name)
  select 'dimension', d ->> 'functionId', left(d ->> 'name', 200), d ->> 'name'
    from jsonb_array_elements(coalesce(payload -> 'dimensions', '[]'::jsonb)) d
  on conflict (kind, function_id, code) do nothing;

  for item in select * from jsonb_array_elements(payload -> 'indicators')
  loop
    insert into public.imp_indicators (
      version_id, code, function_id, level, catalog_state, name, description,
      matrix_sheet, matrix_row, unit_original, unit, responsible_original, source, origin,
      dfma_pillars_review, dfma_projects_review, validator_function)
    values (
      v_version, item ->> 'code', item ->> 'functionId', item ->> 'level', item ->> 'catalogState',
      item ->> 'name', coalesce(item ->> 'description', ''),
      item ->> 'sheet', (item ->> 'row')::integer, coalesce(item ->> 'unitOriginal', ''), item ->> 'unit',
      coalesce(item ->> 'responsible', ''), coalesce(item ->> 'source', ''), coalesce(item ->> 'origin', ''),
      coalesce(item ->> 'dfmaPillarsReview', ''), coalesce(item ->> 'dfmaProjectsReview', ''),
      -- La vicerrectoría validadora por defecto es la de la función; Planeación la cambia en la ficha.
      item ->> 'functionId')
    returning id into v_indicator;

    for t in select * from jsonb_array_elements(coalesce(item -> 'targets', '[]'::jsonb))
    loop
      insert into public.imp_targets (indicator_id, year, numeric_value, text_value)
      values (v_indicator, (t ->> 'year')::smallint, (t ->> 'numeric')::numeric, t ->> 'text');
    end loop;

    if jsonb_typeof(item -> 'baseline') = 'object' then
      insert into public.imp_baselines (indicator_id, unit_id, year, value)
      values (v_indicator, null, (item -> 'baseline' ->> 'year')::smallint, (item -> 'baseline' ->> 'value')::numeric);
    end if;

    for a in select * from jsonb_array_elements(coalesce(item -> 'alignments', '[]'::jsonb))
    loop
      insert into public.imp_alignments (indicator_id, kind, code)
      values (v_indicator, a ->> 'kind', a ->> 'code')
      on conflict do nothing;
    end loop;
  end loop;

  for f in select * from jsonb_array_elements(coalesce(payload -> 'findings', '[]'::jsonb))
  loop
    insert into public.imp_import_findings (version_id, sheet, row_number, column_name, kind, value, suggestion)
    values (v_version, f ->> 'sheet', (f ->> 'row')::integer, f ->> 'column', f ->> 'kind', f ->> 'value', f ->> 'suggestion');
  end loop;

  -- La ficha técnica de la versión publicada anterior, por código.
  if carry_sheets and v_previous is not null then
    update public.imp_indicators n
       set unit = coalesce(n.unit, o.unit),
           calc_type = o.calc_type,
           numerator_def = o.numerator_def,
           denominator_def = o.denominator_def,
           factor = o.factor,
           aggregation = o.aggregation,
           direction = o.direction,
           periodicity = o.periodicity,
           report_level = o.report_level,
           applies_degrees = o.applies_degrees,
           applies_modalities = o.applies_modalities,
           capture_mode = o.capture_mode,
           evidence_type = o.evidence_type,
           evidence_required = o.evidence_required,
           variation_threshold = o.variation_threshold,
           range_min = o.range_min,
           range_max = o.range_max,
           n_minimum = o.n_minimum,
           allows_over_one = o.allows_over_one,
           validator_function = o.validator_function,
           in_pilot = o.in_pilot
      from public.imp_indicators o
     where n.version_id = v_version
       and o.version_id = v_previous
       and o.code = n.code;
  end if;

  select jsonb_build_object(
    'versionId', v_version,
    'number', v_number,
    'indicators', (select count(*) from public.imp_indicators i where i.version_id = v_version),
    'official', (select count(*) from public.imp_indicators i where i.version_id = v_version and i.catalog_state = 'oficial'),
    'suggested', (select count(*) from public.imp_indicators i where i.version_id = v_version and i.catalog_state = 'sugerido'),
    'findings', (select count(*) from public.imp_import_findings x where x.version_id = v_version),
    'carried', (select count(*) from public.imp_indicators i where i.version_id = v_version and i.calc_type is not null)
  ) into counts;
  return counts;
end;
$$;

comment on function public.imp_import_catalog(jsonb, boolean) is
  'Crea el borrador siguiente del catálogo con la matriz importada y sus hallazgos. Todo o nada.';

-- Descartar un borrador (por ejemplo, una importación equivocada). Una
-- versión publicada no se descarta nunca: el disparador de 0064 lo impide.
create or replace function public.imp_discard_draft()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.imp_can_global('impacto.catalogo') then
    raise exception 'Solo la administración de Impacto puede descartar el borrador.' using errcode = '42501';
  end if;
  delete from public.imp_catalog_versions where state = 'borrador';
end;
$$;

comment on function public.imp_discard_draft() is 'Borra el borrador del catálogo con todo lo que cuelga de él.';

do $$
declare
  fn text;
begin
  foreach fn in array array['imp_import_catalog(jsonb, boolean)', 'imp_discard_draft()'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
