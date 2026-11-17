-- =============================================================================
-- Informes de gestión · 0282 · Lo que el sistema ya sabe de la unidad.
--
-- «Objetivos y metas», «Alineación estratégica», «Resultados y evidencias» y
-- «Evidencias y fuentes de verificación» traían solo meta, pilar y recursos.
-- Esta migración deja un solo RPC de lectura que reúne, para la unidad del
-- informe y su año:
--
--   · Impacto:   indicadores que sigue (imp_adoptions) o crea (propios) la
--                unidad o sus programas, con línea base, metas, la serie de
--                cifras por año (imp_values) con su evidencia, y los pilares y
--                ODS a los que apuntan (imp_alignments).
--   · Plan:      para una facultad, las acciones del plan de trabajo con sus
--                actividades, seguimientos (avances) y enlaces de evidencia
--                (faculty_actions / activities / followups).
--   · Informe:   el ciclo, las revisiones y los anexos ya cargados.
--   · Pilares:   el catálogo, para conectarlo todo en «Alineación estratégica».
--
-- Se lee en vivo mientras el informe es borrador. Al enviar, el disparador de
-- la foto guarda el resultado en informe_instancias.foto_resumen y esa foto es
-- lo que se lee desde entonces; al devolver, la foto se borra y vuelve a ser
-- en vivo (igual que las cifras).
--
-- Los programas y las oficinas no tienen plan de trabajo en el portal (las
-- tablas faculty_* son de facultades): para ellos «plan» llega vacío.
--
-- Es idempotente. Se aplica después de 0281.
-- =============================================================================

alter table public.informe_instancias add column if not exists foto_resumen jsonb;
comment on column public.informe_instancias.foto_resumen is
  'Foto de informe_resumen_vivo al enviar. Nula mientras el informe es borrador o devuelto.';

-- 1. El resumen en vivo (interno) ------------------------------------------------

create or replace function public.informe_resumen_vivo(p_instancia uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inf      record;
  v_fac    uuid;
  v_ind    jsonb;
  v_plan   jsonb;
  v_pil    jsonb;
  v_rev    jsonb;
  v_anx    jsonb;
begin
  select n.id, n.estado, n.unit_id, n.enviado_en, n.aprobado_en,
         ci.anio, ci.nombre as ciclo_nombre, ci.fecha_limite, ci.corte, ci.estado as ciclo_estado,
         u.name as unidad, u.kind::text as kind, u.code as unidad_codigo
    into inf
    from public.informe_instancias n
    join public.informe_ciclos ci on ci.id = n.ciclo_id
    join public.units u on u.id = n.unit_id
   where n.id = p_instancia;
  if inf.id is null then
    return null;
  end if;

  -- Impacto: los indicadores de la unidad (programa) o de sus programas (facultad).
  with progs as (
    select u.id, u.name from public.units u
     where u.kind = 'programa' and (u.id = inf.unit_id or u.parent_id = inf.unit_id)
  ),
  sel as (
    select p.id as prog, p.name as prog_name, c.id as camp, c.slug, c.name as camp_name,
           ind.id as ind, ind.code, ind.name, ind.fn::text as fn, ind.stage::text as stage,
           ind.unit_label, ind.measure::text as measure, ind.direction::text as direction,
           'adopcion'::text as origen,
           coalesce(a.baseline_year, ind.baseline_year) as b_year,
           coalesce(nullif(a.baseline_text, ''), ind.baseline_text) as b_text,
           coalesce(a.baseline_num, ind.baseline_num) as b_num,
           coalesce(nullif(a.target_2026, ''), ind.target_2026) as t26,
           coalesce(a.target_2026_num, ind.target_2026_num) as t26n,
           coalesce(nullif(a.target_2028, ''), ind.target_2028) as t28,
           coalesce(a.target_2028_num, ind.target_2028_num) as t28n
      from progs p
      join public.imp_adoptions a on a.program_id = p.id and a.active
      join public.program_campuses pc on pc.program_id = p.id and pc.campus_id = a.campus_id and pc.active
      join public.campuses c on c.id = a.campus_id
      join public.imp_indicators ind on ind.id = a.indicator_id and ind.program_id is null and ind.status = 'publicado'
    union all
    select p.id, p.name, c.id, c.slug, c.name,
           ind.id, ind.code, ind.name, ind.fn::text, ind.stage::text,
           ind.unit_label, ind.measure::text, ind.direction::text, 'propio',
           ind.baseline_year, ind.baseline_text, ind.baseline_num,
           ind.target_2026, ind.target_2026_num, ind.target_2028, ind.target_2028_num
      from progs p
      join public.imp_indicators ind on ind.program_id = p.id and ind.status <> 'retirado'
      join public.program_campuses pc on pc.program_id = p.id and pc.campus_id = ind.campus_id and pc.active
      join public.campuses c on c.id = ind.campus_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', s.code,
           'nombre', s.name,
           'fn', s.fn,
           'etapa', s.stage,
           'programa', s.prog_name,
           'sede', s.camp_name,
           'sede_slug', s.slug,
           'origen', s.origen,
           'baja', s.direction = 'baja',
           'medida', s.measure,
           'unidad', coalesce(s.unit_label, ''),
           'linea_base', jsonb_build_object('anio', s.b_year, 'texto', coalesce(s.b_text, ''), 'num', s.b_num),
           'meta_2026', jsonb_build_object('texto', coalesce(s.t26, ''), 'num', s.t26n),
           'meta_2028', jsonb_build_object('texto', coalesce(s.t28, ''), 'num', s.t28n),
           'serie', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'anio', v.year, 'valor', v.value_num, 'texto', coalesce(v.value_text, ''),
                      'no_aplica', v.not_applicable, 'evidencia', coalesce(v.evidence_url, ''),
                      'nota', coalesce(v.note, ''), 'actualizado', v.updated_at) order by v.year), '[]'::jsonb)
               from public.imp_values v
              where v.indicator_id = s.ind and v.program_id = s.prog and v.campus_id = s.camp),
           'alineaciones', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'tipo', al.target, 'pilar', al.pillar_id, 'ods', al.sdg,
                      'confirmada', al.confirmed, 'origen', al.origin)), '[]'::jsonb)
               from public.imp_alignments al
              where al.indicator_id = s.ind)
         ) order by s.prog_name, s.camp_name, s.code), '[]'::jsonb)
    into v_ind
    from sel s;

  -- Plan de trabajo: solo las facultades lo tienen (faculty_*, puente por el código).
  if inf.kind = 'facultad' then
    select f.id into v_fac from public.faculties f where f.code = inf.unidad_codigo limit 1;
  end if;
  if v_fac is not null then
    select jsonb_build_object(
             'facultad', inf.unidad_codigo,
             'acciones', coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id,
               'dimension', a.dimension,
               'dimension_nombre', a.dimension_name,
               'pilar', a.pillar_id,
               'pilar_declarado', a.declared_pillar,
               'titulo', a.title,
               'responsable', a.owner,
               'meta', coalesce(a.goal, ''),
               'recursos', coalesce(a.resources, ''),
               'fecha_limite', a.deadline,
               'estado_inicial', a.initial_status::text,
               'actividades', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'descripcion', x.description, 'responsable', x.owner, 'fecha', x.due_date,
                          'estado', coalesce(x.status_label, ''), 'evidencia', coalesce(x.evidence_url, '')) order by x.position), '[]'::jsonb)
                   from public.faculty_activities x where x.action_id = a.id),
               'seguimientos', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'corte', s.cut, 'avance', s.progress, 'estado', coalesce(s.status_label, ''),
                          'nota', coalesce(s.note, ''), 'evidencia', coalesce(s.evidence_url, ''),
                          'reportado', s.reported_on) order by s.reported_on nulls last, s.created_at), '[]'::jsonb)
                   from public.faculty_followups s where s.action_id = a.id)
             ) order by a.position), '[]'::jsonb))
      into v_plan
      from public.faculty_actions a
     where a.faculty_id = v_fac and a.status <> 'archivado';
  else
    v_plan := jsonb_build_object('facultad', null, 'acciones', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'numeral', p.numeral, 'nombre', p.name) order by p.position), '[]'::jsonb)
    into v_pil
    from public.pillars p
   where p.status <> 'archivado';

  select coalesce(jsonb_agg(jsonb_build_object(
           'decision', r.decision, 'nota', coalesce(r.nota, ''), 'seccion', r.seccion_clave, 'en', r.en) order by r.en desc), '[]'::jsonb)
    into v_rev
    from (select * from public.informe_revisiones where instancia_id = p_instancia order by en desc limit 20) r;

  select coalesce(jsonb_agg(jsonb_build_object(
           'n', x.n, 'tipo', x.tipo, 'nombre', x.nombre, 'descripcion', coalesce(x.descripcion, ''),
           'url', case when x.tipo = 'url' then x.ruta else null end) order by x.n), '[]'::jsonb)
    into v_anx
    from public.informe_anexos x
   where x.instancia_id = p_instancia;

  return jsonb_build_object(
    'version', 1,
    'generado', now(),
    'unidad', jsonb_build_object('id', inf.unit_id, 'nombre', inf.unidad, 'tipo', inf.kind),
    'ciclo', jsonb_build_object('anio', inf.anio, 'nombre', inf.ciclo_nombre, 'fecha_limite', inf.fecha_limite, 'corte', inf.corte, 'estado', inf.ciclo_estado),
    'instancia', jsonb_build_object('estado', inf.estado, 'enviado_en', inf.enviado_en, 'aprobado_en', inf.aprobado_en),
    'indicadores', v_ind,
    'plan', v_plan,
    'pilares', v_pil,
    'revisiones', v_rev,
    'anexos', v_anx
  );
end;
$$;

revoke all on function public.informe_resumen_vivo(uuid) from public, anon, authenticated;
grant execute on function public.informe_resumen_vivo(uuid) to service_role;

-- 2. El RPC que usa la interfaz ----------------------------------------------------

/** El resumen del informe: la foto si ya se envió; en vivo si no. Respeta la visibilidad del informe. */
create or replace function public.informe_resumen_gestion(p_instancia uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f jsonb;
begin
  if not public.informe_instancia_visible(p_instancia) then
    raise exception 'Sin permiso para ver este informe' using errcode = '42501';
  end if;
  select i.foto_resumen into f
    from public.informe_instancias i
   where i.id = p_instancia and i.estado in ('sent', 'ok');
  return coalesce(f, public.informe_resumen_vivo(p_instancia));
end;
$$;

revoke all on function public.informe_resumen_gestion(uuid) from public, anon;
grant execute on function public.informe_resumen_gestion(uuid) to authenticated, service_role;

-- 3. La foto: ahora también guarda el resumen --------------------------------------

create or replace function public.informe_instancias_foto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = old.estado or new.estado not in ('sent', 'back') then
    return null;
  end if;
  perform set_config('informe.sistema', 'si', true);
  if new.estado = 'sent' then
    update public.informe_cifras ic
       set foto_valor = vv.valor,
           foto_fuente = coalesce(vv.fuente, ''),
           foto_en = now()
      from public.informe_vivas_de(new.id) vv
     where ic.instancia_id = new.id and ic.clave = vv.clave;
    update public.informe_instancias
       set foto_resumen = public.informe_resumen_vivo(new.id)
     where id = new.id;
  else
    update public.informe_cifras ic
       set foto_valor = null, foto_fuente = null, foto_en = null
     where ic.instancia_id = new.id and ic.foto_en is not null;
    update public.informe_instancias set foto_resumen = null where id = new.id and foto_resumen is not null;
  end if;
  perform set_config('informe.sistema', '', true);
  return null;
end;
$$;

notify pgrst, 'reload schema';
