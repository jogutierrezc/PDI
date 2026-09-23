-- =============================================================================
-- PDI · 0072 · Impacto: lo que lee el portal
--
-- El portal Impacto Institucional (/impacto) deja las cifras ilustrativas y
-- lee la base. Tres lecturas, todas para una sesión de la intranet (rol
-- «consulta» o más); anon no las ejecuta:
--
--   imp_portal_catalog     la última versión PUBLICADA del catálogo: cada
--                          indicador con lo que dice la matriz (metas, línea
--                          base institucional, alineaciones) y su ficha.
--   imp_portal_structure   facultades y programas (units), sedes (campuses) y
--                          en qué sedes se ofrece cada programa.
--   imp_portal_records     las medidas de los registros VALIDADOS: indicador,
--                          programa, sede (o nula), periodo, numerador,
--                          denominador, n y comparación.
--
-- LO NO VALIDADO NUNCA SALE
--
-- Un registro en borrador, enviado, aprobado por la decanatura o devuelto no
-- es una cifra de la universidad todavía. Las funciones son security definer
-- porque quien consulta no ve los registros por RLS (0064: solo su programa,
-- la vicerrectoría y la administración); a cambio, solo devuelven lo validado.
--
-- LA CONSOLIDACIÓN SIGUE EN EL CLIENTE
--
-- Aquí no se calcula ningún total: salen numerador, denominador y n de cada
-- registro, y aggregate.ts los consolida con la regla de la ficha (suma,
-- razón de sumas, promedio ponderado, no agregable). Nunca un promedio de
-- porcentajes.
--
-- PERIODOS DE VERSIONES DISTINTAS
--
-- Cada periodo se abrió con su versión del catálogo. El portal muestra la
-- última publicada y une los registros por código de indicador. Un registro
-- sale solo si su indicador se calculaba igual que en la versión que se
-- muestra (mismo tipo de cálculo, factor y agregación): si la fórmula cambió,
-- sumarlo con los nuevos mezclaría dos cosas distintas.
--
-- Requiere 0071. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El catálogo publicado
-- -----------------------------------------------------------------------------

create or replace function public.imp_portal_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.imp_catalog_versions;
begin
  if not public.has_role_at_least('consulta') then
    raise exception 'El portal de Impacto se consulta con una sesión activa de la intranet.' using errcode = '42501';
  end if;

  select * into v
    from public.imp_catalog_versions
   where state = 'publicada'
   order by number desc
   limit 1;

  if not found then
    return jsonb_build_object('version', null, 'indicators', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v.id,
      'number', v.number,
      'source_file', v.source_file,
      'published_at', v.published_at),
    'indicators', coalesce((
      select jsonb_agg(jsonb_build_object(
          'code', i.code,
          'function_id', i.function_id,
          'level', i.level,
          'catalog_state', i.catalog_state,
          'name', i.name,
          'description', i.description,
          'unit_original', i.unit_original,
          'responsible_original', i.responsible_original,
          'source', i.source,
          'origin', i.origin,
          'unit', i.unit,
          'calc_type', i.calc_type,
          'numerator_def', i.numerator_def,
          'denominator_def', i.denominator_def,
          'factor', i.factor,
          'aggregation', i.aggregation,
          'direction', i.direction,
          'periodicity', i.periodicity,
          'report_level', i.report_level,
          'applies_degrees', to_jsonb(i.applies_degrees),
          'capture_mode', i.capture_mode,
          'evidence_type', i.evidence_type,
          'evidence_required', i.evidence_required,
          'variation_threshold', i.variation_threshold,
          'range_min', i.range_min,
          'range_max', i.range_max,
          'n_minimum', i.n_minimum,
          'allows_over_one', i.allows_over_one,
          'in_pilot', i.in_pilot,
          'sheet_complete', public.imp_sheet_complete(i),
          'targets', coalesce((
            select jsonb_agg(jsonb_build_object('year', t.year, 'numeric', t.numeric_value, 'text', t.text_value) order by t.year)
              from public.imp_targets t
             where t.indicator_id = i.id), '[]'::jsonb),
          -- La línea base institucional (sin unidad), la más reciente.
          'baseline', (
            select jsonb_build_object('year', b.year, 'value', b.value)
              from public.imp_baselines b
             where b.indicator_id = i.id and b.unit_id is null
             order by b.year desc
             limit 1),
          'alignments', coalesce((
            select jsonb_agg(jsonb_build_object('kind', a.kind, 'code', a.code) order by a.kind, a.code)
              from public.imp_alignments a
             where a.indicator_id = i.id), '[]'::jsonb)
        ) order by array_position(array['investigacion', 'ensenanza', 'extension'], i.function_id), i.code)
        from public.imp_indicators i
       where i.version_id = v.id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.imp_portal_catalog() is
  'Portal de Impacto: la última versión publicada del catálogo, con fichas, metas, línea base y alineaciones. Sesión con rol consulta o más.';

-- -----------------------------------------------------------------------------
-- 2. La estructura: facultades, programas, sedes y oferta
-- -----------------------------------------------------------------------------

create or replace function public.imp_portal_structure()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role_at_least('consulta') then
    raise exception 'El portal de Impacto se consulta con una sesión activa de la intranet.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'faculties', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'slug', f.slug, 'code', f.code, 'name', f.name) order by f.position, f.name)
        from public.units f
       where f.kind = 'facultad'
    ), '[]'::jsonb),
    'programs', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'slug', p.slug,
          'code', p.code,
          'name', p.name,
          'faculty_id', f.id,
          'degree_level', p.degree_level,
          'modality', p.modality,
          -- Sedes donde se ofrece hoy, en el orden de las sedes.
          'campus_ids', coalesce((
            select jsonb_agg(c.id order by c.position, c.name)
              from public.imp_program_campuses pc
              join public.campuses c on c.id = pc.campus_id
             where pc.program_id = p.id and pc.active), '[]'::jsonb)
        ) order by p.name)
        from public.units p
        left join public.units f on f.id = p.parent_id and f.kind = 'facultad'
       where p.kind = 'programa'
    ), '[]'::jsonb),
    'campuses', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name) order by c.position, c.name)
        from public.campuses c
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.imp_portal_structure() is
  'Portal de Impacto: facultades y programas (units), sedes (campuses) y la oferta de cada programa por sede. Sesión con rol consulta o más.';

-- -----------------------------------------------------------------------------
-- 3. Las medidas validadas
-- -----------------------------------------------------------------------------

drop function if exists public.imp_portal_records();
create or replace function public.imp_portal_records()
returns table (
  code             text,
  program_id       uuid,
  campus_id        uuid,
  period_code      text,
  numerator        numeric,
  denominator      numeric,
  n_responses      integer,
  num_comparison   numeric,
  den_comparison   numeric,
  value            numeric,
  comparison_value numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role_at_least('consulta') then
    raise exception 'El portal de Impacto se consulta con una sesión activa de la intranet.' using errcode = '42501';
  end if;

  return query
    with shown as (
      select i.code, i.calc_type, i.factor, i.aggregation
        from public.imp_indicators i
       where i.version_id = (
         select v.id from public.imp_catalog_versions v
          where v.state = 'publicada'
          order by v.number desc
          limit 1)
    )
    select i.code, a.program_id, a.campus_id, p.code,
           r.numerator, r.denominator, r.n_responses, r.num_comparison, r.den_comparison,
           r.value, r.comparison_value
      from public.imp_records r
      join public.imp_assignments a on a.id = r.assignment_id and a.active
      join public.imp_periods p on p.id = a.period_id
      join public.imp_indicators i on i.id = a.indicator_id
      join shown s on s.code = i.code
                  and s.calc_type is not distinct from i.calc_type
                  and s.factor is not distinct from i.factor
                  and s.aggregation is not distinct from i.aggregation
     where r.state = 'validado'
       and r.no_data is null
     order by p.code, i.code, a.program_id, a.campus_id;
end;
$$;

comment on function public.imp_portal_records() is
  'Portal de Impacto: numerador, denominador, n y comparación de los registros validados, por indicador, programa, sede y periodo. Nada que no esté validado.';

-- -----------------------------------------------------------------------------
-- 4. Permisos: con sesión, nunca anon
-- -----------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array['imp_portal_catalog()', 'imp_portal_structure()', 'imp_portal_records()'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
