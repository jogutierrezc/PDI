-- =============================================================================
-- 0093 · Portal de Impacto: la ficha de cada indicador y el mapa de red.
--
-- La foto del portal (0088) suma lo que necesita la ficha metodológica que se
-- abre desde cada indicador de un programa: numerador y denominador, fuente,
-- responsable, proyectos y el texto metodológico (`sheet`: objetivo, método
-- de cálculo, interpretación, periodicidad); la línea base y las metas que
-- puso cada programa al adoptar; la ficha y las metas de los indicadores
-- propios de los programas, y sus cruces con pilares y ODS (el mapa de red
-- los une por lo que comparten).
--
-- Sigue sin salir: borradores, retirados, notas ni evidencias de las cifras.
-- Requiere 0088 (y 0084). Idempotente.
-- =============================================================================

create or replace function public.imp_portal_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  published uuid[];
begin
  if not public.has_role_at_least('consulta') then
    raise exception 'El portal de Impacto se consulta con una sesión activa.' using errcode = '42501';
  end if;

  select coalesce(array_agg(i.id), '{}') into published
  from public.imp_indicators i
  where i.program_id is null and i.status = 'publicado';

  return jsonb_build_object(
    'indicators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'code', i.code, 'fn', i.fn, 'stage', i.stage, 'suggested', i.suggested,
        'dimension_id', i.dimension_id, 'owner_unit_id', i.owner_unit_id, 'name', i.name,
        'description', i.description, 'unit_label', i.unit_label, 'measure', i.measure,
        'direction', i.direction, 'baseline_year', i.baseline_year, 'baseline_num', i.baseline_num,
        'baseline_text', i.baseline_text, 'target_2026', i.target_2026, 'target_2026_num', i.target_2026_num,
        'target_2028', i.target_2028, 'target_2028_num', i.target_2028_num, 'mandatory', i.mandatory,
        'position', i.position,
        -- 0093: lo que pide la ficha metodológica.
        'numerator', i.numerator, 'denominator', i.denominator, 'source', i.source,
        'responsible', i.responsible, 'projects_text', i.projects_text, 'sheet', i.sheet
      ) order by i.position, i.code)
      from public.imp_indicators i
      where i.id = any (published)
    ), '[]'::jsonb),

    -- Los indicadores propios de los programas cuentan para su cadena.
    'program_indicators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'code', i.code, 'fn', i.fn, 'stage', i.stage, 'name', i.name,
        'program_id', i.program_id, 'campus_id', i.campus_id, 'parent_id', i.parent_id,
        'dimension_id', i.dimension_id,
        -- 0093: su ficha y sus metas, para verlos aparte en el detalle del programa.
        'description', i.description, 'unit_label', i.unit_label, 'measure', i.measure, 'direction', i.direction,
        'numerator', i.numerator, 'denominator', i.denominator, 'source', i.source, 'responsible', i.responsible,
        'baseline_year', i.baseline_year, 'baseline_text', i.baseline_text, 'baseline_num', i.baseline_num,
        'target_2026', i.target_2026, 'target_2026_num', i.target_2026_num,
        'target_2028', i.target_2028, 'target_2028_num', i.target_2028_num, 'sheet', i.sheet
      ) order by i.code)
      from public.imp_indicators i
      where i.program_id is not null and i.status <> 'retirado'
    ), '[]'::jsonb),

    'dimensions', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'fn', d.fn, 'name', d.name, 'position', d.position)
        order by d.fn, d.position, d.name)
      from public.imp_dimensions d
    ), '[]'::jsonb),

    'refs', coalesce((
      select jsonb_agg(jsonb_build_object('indicator_id', r.indicator_id, 'dimension_id', r.dimension_id, 'stage', r.stage, 'note', r.note))
      from public.imp_indicator_refs r
      where r.indicator_id = any (published)
    ), '[]'::jsonb),

    -- Solo alineaciones con respaldo: de la matriz, puestas a mano o confirmadas.
    'alignments', coalesce((
      select jsonb_agg(jsonb_build_object('indicator_id', a.indicator_id, 'target', a.target, 'pillar_id', a.pillar_id, 'sdg', a.sdg))
      from public.imp_alignments a
      join public.imp_indicators i on i.id = a.indicator_id
      where (i.id = any (published) or (i.program_id is not null and i.status <> 'retirado'))
        and (a.confirmed or a.origin in ('matriz', 'manual'))
    ), '[]'::jsonb),

    'pillars', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'numeral', p.numeral, 'name', p.name) order by p.position)
      from public.pillars p
    ), '[]'::jsonb),

    'units', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'parent_id', u.parent_id, 'kind', u.kind, 'code', u.code, 'name', u.name, 'slug', u.slug)
        order by u.position, u.name)
      from public.units u
    ), '[]'::jsonb),

    'unit_functions', coalesce((
      select jsonb_agg(jsonb_build_object('unit_id', f.unit_id, 'fn', f.fn))
      from public.imp_unit_functions f
    ), '[]'::jsonb),

    'campuses', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name) order by c.name)
      from public.campuses c
    ), '[]'::jsonb),

    'offer', coalesce((
      select jsonb_agg(jsonb_build_object('program_id', o.program_id, 'campus_id', o.campus_id))
      from public.program_campuses o
      where o.active
    ), '[]'::jsonb),

    'adoptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'indicator_id', a.indicator_id, 'program_id', a.program_id, 'campus_id', a.campus_id,
        'target_2026_num', a.target_2026_num,
        -- 0093: la línea base y las metas que puso el programa, para su ficha.
        'baseline_text', a.baseline_text, 'target_2026', a.target_2026,
        'target_2028', a.target_2028, 'target_2028_num', a.target_2028_num
      ))
      from public.imp_adoptions a
      where a.active and a.indicator_id = any (published)
    ), '[]'::jsonb),

    -- Cifras sin notas ni evidencias: la cifra, su año y dónde vive.
    'values', coalesce((
      select jsonb_agg(jsonb_build_object(
        'indicator_id', v.indicator_id, 'year', v.year, 'program_id', v.program_id, 'campus_id', v.campus_id,
        'value_num', v.value_num, 'not_applicable', v.not_applicable, 'has_text', v.value_text <> ''
      ))
      from public.imp_values v
      join public.imp_indicators i on i.id = v.indicator_id
      where i.status = 'publicado' or (i.program_id is not null and i.status <> 'retirado')
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.imp_portal_snapshot() is
  'Portal de Impacto: estructura, conexiones y cifras de solo lectura para cualquier sesión activa. Sin borradores, notas ni evidencias.';

revoke all on function public.imp_portal_snapshot() from public;
revoke all on function public.imp_portal_snapshot() from anon;
grant execute on function public.imp_portal_snapshot() to authenticated;

notify pgrst, 'reload schema';
