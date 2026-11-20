-- =============================================================================
-- PDI · 0291 · Planeación y Seguimiento · FASE 3C: evaluación de proyectos, resumen solicitado vs aprobado, plan creado desde la app,
--               apertura retroactiva de la evaluación VAF y oficinas de las líneas de un plan vigente
--
-- Contrato: docs/planeacion-seguimiento/CONTRATO-BD-F3B.md §8. Requiere 0286 a 0290.
--   A. ps_evaluaciones_proyecto (historial insert-only) + ps_proyecto_evaluar / ps_proyecto_evaluacion_leer. Solo financiero y admin evalúan
--      (aprobar o rechazar); lo aprobado se escribe en ps_linea_financiacion por año (distribución × monto aprobado), que ya alimenta el
--      «aprobado» del presupuesto (0290). El gestor de la oficina solo lee.
--   B. ps_resumen_aprobacion: solicitado vs aprobado vs rechazado vs sin evaluar, por plan, pilar, campus, oficina y año.
--   C. Crear el plan desde la app: ps_proyecto_crear / editar / borrar sobre el borrador, ps_borrador_leer y ps_plan_enviar_a_evaluacion
--      (publica la versión y abre la evaluación VAF). Las filas pasan por LA MISMA validación que la carga por Excel
--      (ps_validar_fila_matriz, extraída de ps_cargar_matriz).
--   D. ps_vaf_abrir_pendientes: abre la evaluación VAF de los planes con versión publicada que no tienen ninguna (y se llama al final).
--   E. ps_asignar_oficinas_lineas (oficina de las líneas SOBRE la versión vigente), ps_lineas_para_actividad y aportar a una línea de otra
--      oficina (ps_actividad_normalizar relajada; evento y aviso al gestor de la oficina dueña).
-- Todo security definer con search_path fijo; nunca capacity ni has_role_at_least. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Evaluación de proyectos: historial insert-only
-- -----------------------------------------------------------------------------

create table if not exists public.ps_evaluaciones_proyecto (
  id               uuid primary key default gen_random_uuid(),
  seq              bigint generated always as identity,
  plan_id          uuid not null references public.ps_planes (id) on delete restrict,
  linea_id         uuid not null references public.ps_lineas (id) on delete restrict,
  version_id       uuid not null references public.ps_versiones (id) on delete restrict,
  resultado        text not null,
  criterios        jsonb not null default '{}'::jsonb,
  viabilidad       jsonb not null default '{}'::jsonb,
  prioridad        text not null,
  inicio           date,
  fin              date,
  pct              jsonb not null default '{}'::jsonb,
  monto_solicitado numeric(18, 2) not null default 0,
  monto_aprobado   numeric(18, 2) not null default 0,
  fuente           text not null default '',
  nota             text not null default '',
  evaluado_por     uuid references public.profiles (id) on delete set null,
  evaluado_en      timestamptz not null default clock_timestamp(),
  constraint ps_ep_resultado check (resultado in ('Aprobado', 'Rechazado')),
  constraint ps_ep_prioridad check (prioridad in ('Crítico', 'Alto', 'Medio', 'Largo plazo')),
  constraint ps_ep_objetos check (jsonb_typeof(criterios) = 'object' and jsonb_typeof(viabilidad) = 'object' and jsonb_typeof(pct) = 'object'),
  constraint ps_ep_montos check (monto_solicitado >= 0 and monto_aprobado >= 0 and monto_aprobado < 1e15
                                 and ((resultado = 'Aprobado' and monto_aprobado > 0) or (resultado = 'Rechazado' and monto_aprobado = 0))),
  constraint ps_ep_fechas check (inicio is null or fin is null or fin >= inicio),
  constraint ps_ep_textos check (char_length(fuente) <= 200 and char_length(nota) <= 1000),
  constraint ps_ep_nota check (char_length(btrim(nota)) >= 20 or (resultado = 'Aprobado' and monto_aprobado = monto_solicitado))
);
create index if not exists ps_ep_linea_idx on public.ps_evaluaciones_proyecto (linea_id, seq desc);
create index if not exists ps_ep_plan_idx on public.ps_evaluaciones_proyecto (plan_id);

comment on table public.ps_evaluaciones_proyecto is
  'Planeación y Seguimiento (0291): historial de evaluaciones de proyectos (ps_lineas). Insert-only; la vigente de cada proyecto es la de mayor seq.';

/** Solo INSERT. Único cambio admitido: que al borrar a una persona su rastro quede sin evaluador. */
create or replace function public.ps_evaluaciones_proyecto_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.evaluado_por is not null and new.evaluado_por is null
     and (to_jsonb(new) - 'evaluado_por') = (to_jsonb(old) - 'evaluado_por') then
    return new;
  end if;
  if tg_op = 'INSERT' then return new; end if;
  raise exception 'El historial de evaluaciones solo admite INSERT: una nueva evaluación reemplaza a la vigente.' using errcode = '42501';
end;
$$;

drop trigger if exists ps_evaluaciones_proyecto_inmutable on public.ps_evaluaciones_proyecto;
create trigger ps_evaluaciones_proyecto_inmutable before insert or update or delete on public.ps_evaluaciones_proyecto
  for each row execute function public.ps_evaluaciones_proyecto_guard();

alter table public.ps_evaluaciones_proyecto enable row level security;
drop policy if exists ps_evaluaciones_proyecto_lectura on public.ps_evaluaciones_proyecto;
create policy ps_evaluaciones_proyecto_lectura on public.ps_evaluaciones_proyecto for select to authenticated using (public.ps_ve_linea_presupuesto(linea_id));
revoke all on public.ps_evaluaciones_proyecto from public, anon, authenticated;
grant select on public.ps_evaluaciones_proyecto to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. La oficina de una línea publicada es administrativa: el guard admite ese único cambio (solo ps_asignar_oficinas_lineas)
-- -----------------------------------------------------------------------------

create or replace function public.ps_version_lineas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('ps.asignando_oficina', true), '') = 'on'
     and (to_jsonb(new) - 'oficina_unit_id') = (to_jsonb(old) - 'oficina_unit_id')
     and public.ps_puede('asignar_oficina') then
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select estado into v_estado from public.ps_versiones where id = old.version_id;
    if v_estado = 'publicada' then
      raise exception 'Las líneas de una versión publicada no se pueden modificar ni borrar.' using errcode = '42501';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select estado into v_estado from public.ps_versiones where id = new.version_id;
    if v_estado = 'publicada' then
      raise exception 'No se pueden añadir ni cambiar líneas en una versión publicada.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Apertura de la evaluación VAF: parámetro p_forzar (la retroactiva abre aunque los montos no cambien)
-- -----------------------------------------------------------------------------

drop function if exists public.ps_vaf_abrir_evaluacion(uuid, uuid);

create or replace function public.ps_vaf_abrir_evaluacion(p_plan uuid, p_version uuid, p_forzar boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev uuid;
  v_cambia boolean;
  v_monto numeric;
  v_id uuid;
  d uuid;
begin
  select coalesce(sum(monto), 0) into v_monto from public.ps_version_lineas where version_id = p_version;
  select id into v_prev from public.ps_versiones
   where plan_id = p_plan and estado = 'publicada' and id <> p_version and numero < (select numero from public.ps_versiones where id = p_version)
   order by numero desc limit 1;
  if v_prev is null or coalesce(p_forzar, false) then
    v_cambia := true;
  else
    v_cambia := exists (
      (select clave, monto from public.ps_version_lineas where version_id = p_version except select clave, monto from public.ps_version_lineas where version_id = v_prev)
      union all
      (select clave, monto from public.ps_version_lineas where version_id = v_prev except select clave, monto from public.ps_version_lineas where version_id = p_version));
  end if;
  if not v_cambia then return null; end if;
  insert into public.ps_evaluaciones_vaf (plan_id, version_id, monto_solicitado) values (p_plan, p_version, v_monto)
  on conflict (version_id) do nothing
  returning id into v_id;
  if v_id is null then return null; end if;
  perform public.ps_evento('vaf.evaluacion_abierta', p_plan, p_version, null, jsonb_build_object('evaluacion', v_id, 'monto_solicitado', v_monto, 'forzada', coalesce(p_forzar, false)));
  for d in select x from public.ps_vaf_destinatarios() as x loop
    perform public.ps_aviso_plan('c-ps-vaf-evaluar', d, p_plan,
      jsonb_build_object('monto', v_monto, 'version', (select etiqueta from public.ps_versiones where id = p_version)),
      format('vaf-ev:%s:%s', v_id, d));
  end loop;
  return v_id;
end;
$$;

/** Interna (sin permiso de quien llama, para la migración): abre la evaluación VAF de la versión vigente de los planes activos que no tienen ninguna. */
create or replace function public.ps_vaf_abrir_pendientes_interno()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_id uuid;
  v_lista jsonb := '[]'::jsonb;
begin
  for r in select p.id, p.nombre, p.version_vigente_id from public.ps_planes p
            where p.version_vigente_id is not null and p.estado = 'activo'
              and not exists (select 1 from public.ps_evaluaciones_vaf e where e.plan_id = p.id)
            order by p.creado_en, p.id loop
    v_id := public.ps_vaf_abrir_evaluacion(r.id, r.version_vigente_id, true);
    if v_id is not null then
      v_lista := v_lista || jsonb_build_object('plan_id', r.id, 'plan', r.nombre, 'version_id', r.version_vigente_id, 'evaluacion_id', v_id);
    end if;
  end loop;
  return jsonb_build_object('abiertas', jsonb_array_length(v_lista), 'planes', v_lista);
end;
$$;

/** Abre la evaluación VAF de los planes con versión publicada que no tienen ninguna. Financiero y admin. Idempotente. */
create or replace function public.ps_vaf_abrir_pendientes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ps_puede('financiero') then
    raise exception 'Sin permiso: abrir las evaluaciones pendientes es de la VAF y del administrador.' using errcode = '42501';
  end if;
  return public.ps_vaf_abrir_pendientes_interno();
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Plantilla del aviso «otra oficina aporta a un proyecto suyo»
-- -----------------------------------------------------------------------------

insert into public.correo_templates (key, identity, grp, name, sent_when, action, subject, preheader, title, greeting, body, button, note, active, sort, tipo)
values
  ('c-ps-aporte', 'plan', 'Planeación y Seguimiento', 'Otra oficina aporta a un proyecto de su oficina',
   'Cuando otra oficina crea una actividad vinculada a un proyecto de su oficina: al gestor de la oficina dueña', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'Una oficina aporta a su proyecto', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Otra oficina creó una actividad que aporta a un proyecto de su oficina.\n{{detalle}}', 'Ver el plan', '', true, 352, 'aviso')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Validación de una fila de la matriz (extraída de ps_cargar_matriz: la usan la carga por Excel y la creación manual)
-- -----------------------------------------------------------------------------

/**
 * Valida y normaliza UNA fila contra la plantilla del plan: oficina de la línea (columna «oficina» o la dueña del plan), valores neutros
 * de las columnas no obligatorias, ps_normalizar_linea, obligatoriedad, listas y pilares del plan.
 * Devuelve {errores:[{fila,campo,mensaje}], linea:{…}|null, clave:text|null}. Es exactamente la lógica que tenía ps_cargar_matriz.
 */
create or replace function public.ps_validar_fila_matriz(p_plan uuid, p_fila integer, p_obj jsonb, p_cfg jsonb, p_hay_pilares boolean, p_admin boolean, p_of_plan uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan public.ps_planes%rowtype;
  o jsonb := p_obj;
  l jsonb;
  c jsonb;
  v_res jsonb;
  v_err jsonb := '[]'::jsonb;
  v_pil_def boolean := false;
  v_of uuid;
  v_txt text;
  v_campo text;
  v_lista jsonb;
  v_canon text;
  v_pil jsonb;
  v_cruda jsonb;
  v_clave text;
begin
  select * into v_plan from public.ps_planes where id = p_plan;
  if jsonb_typeof(o) = 'object' then
    -- oficina de la línea: la columna «oficina» (o oficina_unit_id) o, si falta, la oficina dueña del plan
    v_txt := coalesce(public.ps_j(o, array['oficina']) #>> '{}', '');
    v_of := null;
    if btrim(v_txt) <> '' then
      v_of := public.ps_resolver_oficina(v_txt);
      if v_of is null then v_err := v_err || public.ps_err(p_fila, 'oficina', format('La oficina «%s» no existe (use su código o su nombre).', left(btrim(v_txt), 60)));
      else o := o || jsonb_build_object('oficina_unit_id', v_of); end if;
    elsif public.ps_j(o, array['oficina_unit_id']) is null and p_of_plan is not null then
      o := o || jsonb_build_object('oficina_unit_id', p_of_plan);
    end if;
    if not p_admin then
      v_of := nullif(o ->> 'oficina_unit_id', '')::uuid;
      if v_of is not null and not public.ps_unidad_bajo(v_of, p_of_plan) then
        v_err := v_err || public.ps_err(p_fila, 'oficina', 'La oficina de la línea debe ser la oficina dueña del plan o una que dependa de ella.');
      end if;
    end if;
    -- columnas no obligatorias que la fila trae vacías: valor neutro para el validador base
    for c in select * from jsonb_array_elements(p_cfg -> 'columnas') loop
      v_campo := c ->> 'clave';
      if not coalesce((c ->> 'obligatoria')::boolean, false) and v_campo in ('pilar', 'campus', 'prioridad') then
        if public.ps_j(o, case v_campo when 'prioridad' then array['prioridad', 'prior'] else array[v_campo] end) is null
           or btrim(coalesce(public.ps_j(o, case v_campo when 'prioridad' then array['prioridad', 'prior'] else array[v_campo] end) #>> '{}', '')) = '' then
          o := o || jsonb_build_object(v_campo, case v_campo when 'pilar' then 'Sin pilar' when 'campus' then 'Todos' else 'Medio' end);
          if v_campo = 'pilar' then v_pil_def := true; end if;
        end if;
      end if;
    end loop;
  end if;
  v_res := public.ps_normalizar_linea(p_fila, o, v_plan.anio_ini, v_plan.anio_fin);
  v_err := v_err || (v_res -> 'errores');
  l := v_res -> 'linea';
  if l is not null and jsonb_typeof(l) = 'object' then
    -- obligatoriedad y listas de la plantilla del plan
    for c in select * from jsonb_array_elements(p_cfg -> 'columnas') loop
      v_campo := c ->> 'clave';
      if coalesce((c ->> 'obligatoria')::boolean, false) then
        v_txt := l ->> (case v_campo when 'no' then 'clave' when 'oficina' then 'oficina_unit_id' else v_campo end);
        if v_campo not in ('no', 'nombre', 'pilar', 'campus', 'prioridad') and (v_txt is null or btrim(v_txt) = '') then
          v_err := v_err || public.ps_err(p_fila, v_campo, format('La columna «%s» es obligatoria en este plan.', c ->> 'etiqueta'));
        end if;
      end if;
    end loop;
    for v_campo, v_lista in select * from jsonb_each(p_cfg -> 'listas') loop
      v_txt := l ->> v_campo;
      if v_txt is not null and jsonb_array_length(v_lista) > 0 then
        select x into v_canon from jsonb_array_elements_text(v_lista) x where public.ps_texto_norm(x) = public.ps_texto_norm(v_txt) limit 1;
        if v_canon is null then
          v_err := v_err || public.ps_err(p_fila, v_campo, format('«%s» no está en la lista de %s de este plan.', left(v_txt, 60), v_campo));
        else
          l := l || jsonb_build_object(v_campo, v_canon);
        end if;
      end if;
    end loop;
    if p_hay_pilares and not v_pil_def then
      select to_jsonb(pp.nombre) into v_pil from public.ps_plan_pilares pp
       where pp.plan_id = p_plan and pp.activo and (public.ps_texto_norm(pp.nombre) = public.ps_texto_norm(l ->> 'pilar') or lower(pp.codigo) = lower(btrim(l ->> 'pilar')))
       limit 1;
      if v_pil is null then
        v_err := v_err || public.ps_err(p_fila, 'pilar', format('El pilar «%s» no está en la lista de pilares del plan.', left(l ->> 'pilar', 60)));
      else
        l := l || jsonb_build_object('pilar', v_pil #>> '{}');
      end if;
    end if;
  end if;
  v_cruda := case when jsonb_typeof(o) = 'object' then public.ps_j(o, array['clave', 'no']) end;
  v_clave := case when v_cruda is not null and public.ps_j_escalar(v_cruda) then nullif(btrim(v_cruda #>> '{}'), '') end;
  return jsonb_build_object('errores', v_err, 'linea', l, 'clave', v_clave);
end;
$$;

/** Igual que en 0289, pero cada fila pasa por ps_validar_fila_matriz. */
create or replace function public.ps_cargar_matriz(p_plan uuid, p_lineas jsonb, p_nota text default '', p_oficina uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.ps_planes%rowtype;
  v_ver public.ps_versiones%rowtype;
  v_err jsonb := '[]'::jsonb;
  v_norm jsonb := '[]'::jsonb;
  v_vistas jsonb := '{}'::jsonb;
  v_val jsonb;
  v_n integer;
  i integer;
  l jsonb;
  v_linea uuid;
  v_clave text;
  v_recarga boolean := false;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_admin boolean := public.ps_puede('cargar');
  v_of_plan uuid;
  v_cfg jsonb;
  v_hay_pilares boolean;
begin
  select * into v_plan from public.ps_planes where id = p_plan for update;
  if not found then
    if not v_admin then raise exception 'Sin permiso: cargar la matriz es del administrador o del gestor de la oficina dueña del plan.' using errcode = '42501'; end if;
    raise exception 'El plan no existe.' using errcode = 'P0002';
  end if;
  if not public.ps_plan_gestiona(p_plan) then
    raise exception 'Sin permiso: cargar la matriz es del administrador o del gestor de la oficina dueña del plan.' using errcode = '42501';
  end if;
  if char_length(v_nota) > 1000 then
    raise exception 'La nota de la carga supera los 1000 caracteres.' using errcode = '22023';
  end if;
  if v_plan.estado = 'archivado' then raise exception 'El plan está archivado: reábralo para cargar.' using errcode = '22023'; end if;

  v_of_plan := v_plan.oficina_unit_id;
  if v_of_plan is null then
    if p_oficina is null then raise exception 'Indique la oficina del plan (p_oficina).' using errcode = '22023'; end if;
    if not exists (select 1 from public.units where id = p_oficina) then raise exception 'La oficina indicada no existe.' using errcode = 'P0002'; end if;
    v_of_plan := p_oficina;
  elsif p_oficina is not null and p_oficina <> v_of_plan then
    raise exception 'El plan es de otra oficina: cámbiela con ps_plan_editar.' using errcode = '22023';
  end if;

  if v_plan.version_vigente_id is not null then
    return jsonb_build_object('version_id', null, 'etiqueta', null, 'recibidas', 0, 'aceptadas', 0,
      'errores', jsonb_build_array(public.ps_err(null, 'plan', 'La carga sobre un plan vigente se hace por solicitud de cambio (fase 4).')));
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    return jsonb_build_object('version_id', null, 'etiqueta', null, 'recibidas', 0, 'aceptadas', 0,
      'errores', jsonb_build_array(public.ps_err(null, 'lineas', 'Se esperaba una lista de líneas con al menos una fila.')));
  end if;
  v_n := jsonb_array_length(p_lineas);
  if v_n > 2000 then
    return jsonb_build_object('version_id', null, 'etiqueta', null, 'recibidas', v_n, 'aceptadas', 0,
      'errores', jsonb_build_array(public.ps_err(null, 'lineas', 'La matriz supera las 2000 filas.')));
  end if;

  v_cfg := public.ps_plan_config_efectiva(p_plan);
  select exists (select 1 from public.ps_plan_pilares where plan_id = p_plan and activo) into v_hay_pilares;

  for i in 1 .. v_n loop
    v_val := public.ps_validar_fila_matriz(p_plan, i, p_lineas -> (i - 1), v_cfg, v_hay_pilares, v_admin, v_of_plan);
    v_err := v_err || (v_val -> 'errores');
    l := v_val -> 'linea';
    v_clave := nullif(v_val ->> 'clave', '');
    if v_clave is not null then
      if v_vistas ? v_clave then
        v_err := v_err || public.ps_err(i, 'clave', format('La clave «%s» está repetida (ya aparece en la fila %s).', left(v_clave, 40), v_vistas ->> v_clave));
      else
        v_vistas := v_vistas || jsonb_build_object(v_clave, i);
      end if;
    end if;
    if l is not null and jsonb_typeof(l) = 'object' then
      v_norm := v_norm || jsonb_build_array(l || jsonb_build_object('orden', i));
    end if;
  end loop;

  if jsonb_array_length(v_err) > 0 then
    return jsonb_build_object('version_id', null, 'etiqueta', null, 'recibidas', v_n, 'aceptadas', 0,
      'errores', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(v_err) x limit 500) q));
  end if;

  select * into v_ver from public.ps_versiones where plan_id = p_plan and estado = 'borrador';
  if found then
    v_recarga := true;
    delete from public.ps_version_lineas where version_id = v_ver.id;
    update public.ps_versiones set nota = v_nota, creada_por = auth.uid(), creada_en = now() where id = v_ver.id;
  else
    insert into public.ps_versiones (plan_id, numero, etiqueta, estado, origen, nota, creada_por)
    values (p_plan, 1, 'v1.0', 'borrador', 'carga_matriz', v_nota, auth.uid())
    returning * into v_ver;
  end if;

  for i in 0 .. jsonb_array_length(v_norm) - 1 loop
    l := v_norm -> i;
    insert into public.ps_lineas (plan_id, clave) values (p_plan, l ->> 'clave')
    on conflict (plan_id, clave) do nothing;
    select id into v_linea from public.ps_lineas where plan_id = p_plan and clave = l ->> 'clave';
    insert into public.ps_version_lineas (
      version_id, linea_id, clave, orden, clasif, nombre, descripcion, campus_id, campus_texto, pilar, monto,
      prioridad, resultado, nota_no_eval, fuente, criterios, viabilidad, inicio, fin, pct, origen, oficina_unit_id, extra)
    values (
      v_ver.id, v_linea, l ->> 'clave', (l ->> 'orden')::integer, l ->> 'clasif', l ->> 'nombre', l ->> 'descripcion',
      nullif(l ->> 'campus_id', '')::uuid, l ->> 'campus_texto', l ->> 'pilar', nullif(l ->> 'monto', '')::numeric,
      l ->> 'prioridad', l ->> 'resultado', l ->> 'nota_no_eval', l ->> 'fuente', l -> 'criterios', l -> 'viabilidad',
      nullif(l ->> 'inicio', '')::date, nullif(l ->> 'fin', '')::date, l -> 'pct', l ->> 'origen',
      nullif(l ->> 'oficina_unit_id', '')::uuid, l -> 'extra');
  end loop;

  delete from public.ps_lineas lz
   where lz.plan_id = p_plan
     and not exists (select 1 from public.ps_version_lineas vl where vl.linea_id = lz.id);

  if v_plan.oficina_unit_id is null then
    update public.ps_planes set oficina_unit_id = v_of_plan where id = p_plan;
  end if;
  perform public.ps_evento(case when v_recarga then 'matriz.recargada' else 'matriz.cargada' end, p_plan, v_ver.id, null,
    jsonb_build_object('etiqueta', v_ver.etiqueta, 'recibidas', v_n, 'aceptadas', v_n, 'nota', v_nota));

  return jsonb_build_object('version_id', v_ver.id, 'etiqueta', v_ver.etiqueta, 'recibidas', v_n, 'aceptadas', v_n, 'errores', '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Crear el plan desde la app: proyectos del borrador
-- -----------------------------------------------------------------------------

/** Un proyecto (línea de la versión) para la interfaz. */
create or replace function public.ps_proyecto_json(vl public.ps_version_lineas)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'linea_id', vl.linea_id, 'version_id', vl.version_id, 'clave', vl.clave, 'orden', vl.orden, 'clasif', vl.clasif, 'nombre', vl.nombre,
    'descripcion', vl.descripcion, 'campus', vl.campus_texto, 'campus_id', vl.campus_id, 'pilar', vl.pilar, 'monto', vl.monto,
    'prioridad', vl.prioridad, 'fuente', vl.fuente, 'origen', vl.origen, 'inicio', vl.inicio, 'fin', vl.fin, 'pct', vl.pct,
    'nota_no_eval', vl.nota_no_eval,
    'oficina', (select jsonb_build_object('unit_id', u.id, 'nombre', u.name, 'codigo', u.code) from public.units u where u.id = vl.oficina_unit_id));
$$;

/** La fila de entrada de ps_validar_fila_matriz que equivale a una línea ya guardada. */
create or replace function public.ps_proyecto_entrada(vl public.ps_version_lineas)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('clave', vl.clave, 'clasif', vl.clasif, 'nombre', vl.nombre, 'descripcion', vl.descripcion, 'campus', vl.campus_texto,
    'pilar', vl.pilar, 'monto', vl.monto, 'prioridad', vl.prioridad, 'fuente', vl.fuente, 'origen', vl.origen, 'inicio', vl.inicio, 'fin', vl.fin,
    'pct', vl.pct, 'oficina_unit_id', vl.oficina_unit_id, 'extra', vl.extra, 'nota_no_eval', vl.nota_no_eval, 'resultado', vl.resultado,
    'criterios', vl.criterios, 'viabilidad', vl.viabilidad);
$$;

/**
 * Crea un proyecto en el borrador del plan (lo abre, como v1.0, si no existe). Admin, o el gestor de la oficina dueña de un plan de oficina.
 * p_datos como una fila de la matriz: nombre, descripcion, campus, pilar, monto, prioridad, oficina (código o nombre) u oficina_unit_id,
 * fuente, clasif, origen, inicio, fin, pct. «clave» (o «no») es opcional: sin ella se asigna el siguiente número. resultado, criterios y
 * viabilidad se ignoran (la evaluación es de la VAF: ps_proyecto_evaluar).
 * Validación: la misma de la carga por Excel. Si hay errores devuelve {ok:false, errores:[{fila:1,campo,mensaje}]} y no escribe.
 */
create or replace function public.ps_proyecto_crear(p_plan uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.ps_planes%rowtype;
  v_ver public.ps_versiones%rowtype;
  v_admin boolean := public.ps_puede('cargar');
  v_cfg jsonb;
  v_hay boolean;
  o jsonb;
  v_val jsonb;
  l jsonb;
  v_clave text;
  v_linea uuid;
  v_orden integer;
  vl public.ps_version_lineas%rowtype;
begin
  select * into v_plan from public.ps_planes where id = p_plan for update;
  if not found or not public.ps_plan_gestiona(p_plan) then
    if not found and v_admin then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
    raise exception 'Sin permiso: crear proyectos es del administrador o del gestor de la oficina dueña del plan.' using errcode = '42501';
  end if;
  if v_plan.estado = 'archivado' then raise exception 'El plan está archivado: reábralo para editarlo.' using errcode = '22023'; end if;
  if v_plan.version_vigente_id is not null then
    raise exception 'El plan ya tiene una versión publicada y nadie la edita: los cambios van por solicitud de cambio (fase 4).' using errcode = '55000';
  end if;
  if v_plan.oficina_unit_id is null then raise exception 'El plan no tiene oficina dueña: fíjela con ps_plan_editar.' using errcode = '22023'; end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then raise exception 'p_datos debe ser un objeto con los campos del proyecto.' using errcode = '22023'; end if;

  o := p_datos - 'resultado' - 'res' - 'criterios' - 'crit' - 'viabilidad' - 'viab';
  if public.ps_j(o, array['clave', 'no']) is null or btrim(coalesce(public.ps_j(o, array['clave', 'no']) #>> '{}', '')) = '' then
    select coalesce(max(clave::integer), 0) + 1 into v_orden from public.ps_lineas where plan_id = p_plan and clave ~ '^[0-9]{1,8}$';
    o := o || jsonb_build_object('clave', v_orden::text);
  end if;
  v_cfg := public.ps_plan_config_efectiva(p_plan);
  select exists (select 1 from public.ps_plan_pilares where plan_id = p_plan and activo) into v_hay;
  v_val := public.ps_validar_fila_matriz(p_plan, 1, o, v_cfg, v_hay, v_admin, v_plan.oficina_unit_id);
  l := v_val -> 'linea';
  v_clave := nullif(v_val ->> 'clave', '');
  if v_clave is not null and exists (select 1 from public.ps_lineas where plan_id = p_plan and clave = v_clave) then
    v_val := jsonb_set(v_val, '{errores}', (v_val -> 'errores') || public.ps_err(1, 'clave', format('La clave «%s» ya existe en este plan.', left(v_clave, 40))));
  end if;
  if jsonb_array_length(v_val -> 'errores') > 0 or l is null then
    return jsonb_build_object('ok', false, 'errores', v_val -> 'errores');
  end if;

  select * into v_ver from public.ps_versiones where plan_id = p_plan and estado = 'borrador';
  if not found then
    insert into public.ps_versiones (plan_id, numero, etiqueta, estado, origen, nota, creada_por)
    values (p_plan, 1, 'v1.0', 'borrador', 'carga_matriz', '', auth.uid())
    returning * into v_ver;
  end if;
  select coalesce(max(orden), 0) + 1 into v_orden from public.ps_version_lineas where version_id = v_ver.id;
  insert into public.ps_lineas (plan_id, clave) values (p_plan, v_clave) returning id into v_linea;
  insert into public.ps_version_lineas (
    version_id, linea_id, clave, orden, clasif, nombre, descripcion, campus_id, campus_texto, pilar, monto,
    prioridad, resultado, nota_no_eval, fuente, criterios, viabilidad, inicio, fin, pct, origen, oficina_unit_id, extra)
  values (
    v_ver.id, v_linea, v_clave, v_orden, l ->> 'clasif', l ->> 'nombre', l ->> 'descripcion',
    nullif(l ->> 'campus_id', '')::uuid, l ->> 'campus_texto', l ->> 'pilar', nullif(l ->> 'monto', '')::numeric,
    l ->> 'prioridad', null, l ->> 'nota_no_eval', l ->> 'fuente', '{}'::jsonb, '{}'::jsonb,
    nullif(l ->> 'inicio', '')::date, nullif(l ->> 'fin', '')::date, l -> 'pct', l ->> 'origen',
    nullif(l ->> 'oficina_unit_id', '')::uuid, l -> 'extra')
  returning * into vl;
  perform public.ps_evento('proyecto.creado', p_plan, v_ver.id, v_clave, jsonb_build_object('nombre', l ->> 'nombre', 'monto', l ->> 'monto'));
  return jsonb_build_object('ok', true, 'errores', '[]'::jsonb, 'version_id', v_ver.id, 'etiqueta', v_ver.etiqueta, 'proyecto', public.ps_proyecto_json(vl));
end;
$$;

/**
 * Edita un proyecto del borrador. p_cambios: los mismos campos que al crear (menos clave, resultado, criterios y viabilidad); lo que no se
 * envía se conserva. Misma validación y mismo formato de respuesta que ps_proyecto_crear.
 */
create or replace function public.ps_proyecto_editar(p_linea uuid, p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pl public.ps_lineas%rowtype;
  v_plan public.ps_planes%rowtype;
  v_admin boolean := public.ps_puede('cargar');
  vl public.ps_version_lineas%rowtype;
  v_ver public.ps_versiones%rowtype;
  o jsonb;
  v_val jsonb;
  l jsonb;
  v_cfg jsonb;
  v_hay boolean;
  k text;
begin
  select * into v_pl from public.ps_lineas where id = p_linea;
  if not found or not public.ps_plan_gestiona(v_pl.plan_id) then
    if not found and v_admin then raise exception 'El proyecto no existe.' using errcode = 'P0002'; end if;
    raise exception 'Sin permiso: editar proyectos es del administrador o del gestor de la oficina dueña del plan.' using errcode = '42501';
  end if;
  select * into v_plan from public.ps_planes where id = v_pl.plan_id for update;
  if v_plan.estado = 'archivado' then raise exception 'El plan está archivado: reábralo para editarlo.' using errcode = '22023'; end if;
  if v_plan.version_vigente_id is not null then
    raise exception 'El plan ya tiene una versión publicada y nadie la edita: los cambios van por solicitud de cambio (fase 4).' using errcode = '55000';
  end if;
  select * into v_ver from public.ps_versiones where plan_id = v_plan.id and estado = 'borrador';
  select * into vl from public.ps_version_lineas where version_id = v_ver.id and linea_id = p_linea;
  if not found then raise exception 'El proyecto no está en el borrador del plan.' using errcode = 'P0002'; end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then
    raise exception 'No hay cambios que guardar.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_cambios) loop
    if k in ('clave', 'no') and (p_cambios ->> k) is distinct from vl.clave then
      raise exception 'La clave de un proyecto no cambia.' using errcode = '22023';
    end if;
  end loop;
  o := public.ps_proyecto_entrada(vl) || (p_cambios - 'clave' - 'no' - 'resultado' - 'res' - 'criterios' - 'crit' - 'viabilidad' - 'viab');
  if p_cambios ? 'oficina' and not p_cambios ? 'oficina_unit_id' then o := o - 'oficina_unit_id'; end if;
  v_cfg := public.ps_plan_config_efectiva(v_plan.id);
  select exists (select 1 from public.ps_plan_pilares where plan_id = v_plan.id and activo) into v_hay;
  v_val := public.ps_validar_fila_matriz(v_plan.id, 1, o, v_cfg, v_hay, v_admin, v_plan.oficina_unit_id);
  l := v_val -> 'linea';
  if jsonb_array_length(v_val -> 'errores') > 0 or l is null then
    return jsonb_build_object('ok', false, 'errores', v_val -> 'errores');
  end if;
  update public.ps_version_lineas set
    clasif = l ->> 'clasif', nombre = l ->> 'nombre', descripcion = l ->> 'descripcion', campus_id = nullif(l ->> 'campus_id', '')::uuid,
    campus_texto = l ->> 'campus_texto', pilar = l ->> 'pilar', monto = nullif(l ->> 'monto', '')::numeric, prioridad = l ->> 'prioridad',
    nota_no_eval = l ->> 'nota_no_eval', fuente = l ->> 'fuente', inicio = nullif(l ->> 'inicio', '')::date, fin = nullif(l ->> 'fin', '')::date,
    pct = l -> 'pct', origen = l ->> 'origen', oficina_unit_id = nullif(l ->> 'oficina_unit_id', '')::uuid, extra = l -> 'extra'
   where version_id = v_ver.id and linea_id = p_linea
  returning * into vl;
  perform public.ps_evento('proyecto.editado', v_plan.id, v_ver.id, vl.clave,
    jsonb_build_object('campos', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_object_keys(p_cambios) x)));
  return jsonb_build_object('ok', true, 'errores', '[]'::jsonb, 'version_id', v_ver.id, 'etiqueta', v_ver.etiqueta, 'proyecto', public.ps_proyecto_json(vl));
end;
$$;

/** Borra un proyecto del borrador (y su identidad si ninguna otra versión ni actividad la usa). */
create or replace function public.ps_proyecto_borrar(p_linea uuid, p_motivo text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pl public.ps_lineas%rowtype;
  v_plan public.ps_planes%rowtype;
  v_ver public.ps_versiones%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  select * into v_pl from public.ps_lineas where id = p_linea;
  if not found or not public.ps_plan_gestiona(v_pl.plan_id) then
    if not found and public.ps_puede('cargar') then raise exception 'El proyecto no existe.' using errcode = 'P0002'; end if;
    raise exception 'Sin permiso: borrar proyectos es del administrador o del gestor de la oficina dueña del plan.' using errcode = '42501';
  end if;
  select * into v_plan from public.ps_planes where id = v_pl.plan_id for update;
  if v_plan.estado = 'archivado' then raise exception 'El plan está archivado: reábralo para editarlo.' using errcode = '22023'; end if;
  if v_plan.version_vigente_id is not null then
    raise exception 'El plan ya tiene una versión publicada y nadie la edita: los cambios van por solicitud de cambio (fase 4).' using errcode = '55000';
  end if;
  if char_length(v_motivo) > 500 then raise exception 'El motivo supera los 500 caracteres.' using errcode = '22023'; end if;
  select * into v_ver from public.ps_versiones where plan_id = v_plan.id and estado = 'borrador';
  if not found or not exists (select 1 from public.ps_version_lineas where version_id = v_ver.id and linea_id = p_linea) then
    raise exception 'El proyecto no está en el borrador del plan.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ps_actividades where linea_id = p_linea) then
    raise exception 'El proyecto tiene actividades: no se puede borrar.' using errcode = '23503';
  end if;
  delete from public.ps_version_lineas where version_id = v_ver.id and linea_id = p_linea;
  delete from public.ps_lineas lz where lz.id = p_linea and not exists (select 1 from public.ps_version_lineas x where x.linea_id = lz.id);
  perform public.ps_evento('proyecto.borrado', v_plan.id, v_ver.id, v_pl.clave, jsonb_build_object('motivo', v_motivo));
  return jsonb_build_object('ok', true, 'linea_id', p_linea, 'clave', v_pl.clave);
end;
$$;

/**
 * El borrador de un plan para la pantalla de creación: {plan_id, publicada, puede_editar, version:{id,numero,etiqueta}|null,
 * proyectos:[ProyectoJSON], totales:{proyectos, monto}}. «publicada»: el plan ya tiene versión vigente (nadie la edita). Quien ve el plan.
 */
create or replace function public.ps_borrador_leer(p_plan uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  v public.ps_versiones%rowtype;
begin
  if not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  select * into p from public.ps_planes where id = p_plan;
  select * into v from public.ps_versiones where plan_id = p_plan and estado = 'borrador';
  return jsonb_build_object(
    'plan_id', p_plan,
    'publicada', p.version_vigente_id is not null,
    'puede_editar', p.version_vigente_id is null and p.estado = 'activo' and public.ps_plan_gestiona(p_plan),
    'version', case when v.id is null then null else jsonb_build_object('id', v.id, 'numero', v.numero, 'etiqueta', v.etiqueta) end,
    'proyectos', coalesce((select jsonb_agg(public.ps_proyecto_json(vl) order by vl.orden, vl.clave) from public.ps_version_lineas vl where vl.version_id = v.id), '[]'::jsonb),
    'totales', jsonb_build_object('proyectos', (select count(*) from public.ps_version_lineas vl where vl.version_id = v.id),
                                  'monto', coalesce((select sum(vl.monto) from public.ps_version_lineas vl where vl.version_id = v.id), 0)));
end;
$$;

/**
 * Envía el plan a evaluación: revalida TODAS las filas del borrador con la plantilla del plan (la misma validación de la carga por Excel),
 * publica la versión (ps_publicar_version) y con ella se abre la evaluación VAF y se avisa a la VAF. Admin o gestor de la oficina dueña.
 * Con errores devuelve {enviada:false, errores:[{fila (= orden), campo, mensaje}]} y no publica. Éxito: {enviada:true, version_id, etiqueta,
 * huella, lineas, publicada_en, evaluacion_vaf:{id, estado}|null}.
 */
create or replace function public.ps_plan_enviar_a_evaluacion(p_plan uuid, p_nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.ps_planes%rowtype;
  v_ver public.ps_versiones%rowtype;
  v_admin boolean := public.ps_puede('cargar');
  v_cfg jsonb;
  v_hay boolean;
  vl public.ps_version_lineas%rowtype;
  v_val jsonb;
  v_err jsonb := '[]'::jsonb;
  v_pub jsonb;
  v_ev record;
begin
  select * into v_plan from public.ps_planes where id = p_plan for update;
  if not found or not public.ps_plan_gestiona(p_plan) then
    if not found and v_admin then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
    raise exception 'Sin permiso: enviar el plan a evaluación es del administrador o del gestor de la oficina dueña.' using errcode = '42501';
  end if;
  if v_plan.estado = 'archivado' then raise exception 'El plan está archivado: reábralo para enviarlo.' using errcode = '22023'; end if;
  if v_plan.version_vigente_id is not null then raise exception 'El plan ya tiene una versión publicada.' using errcode = '55000'; end if;
  select * into v_ver from public.ps_versiones where plan_id = p_plan and estado = 'borrador';
  if not found or not exists (select 1 from public.ps_version_lineas where version_id = v_ver.id) then
    raise exception 'El plan no tiene proyectos: cree al menos uno antes de enviarlo a evaluación.' using errcode = '55000';
  end if;
  v_cfg := public.ps_plan_config_efectiva(p_plan);
  select exists (select 1 from public.ps_plan_pilares where plan_id = p_plan and activo) into v_hay;
  for vl in select * from public.ps_version_lineas where version_id = v_ver.id order by orden, clave loop
    v_val := public.ps_validar_fila_matriz(p_plan, vl.orden, public.ps_proyecto_entrada(vl), v_cfg, v_hay, v_admin, v_plan.oficina_unit_id);
    v_err := v_err || (v_val -> 'errores');
  end loop;
  if jsonb_array_length(v_err) > 0 then
    return jsonb_build_object('enviada', false, 'errores', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(v_err) x limit 500) q));
  end if;
  v_pub := public.ps_publicar_version(v_ver.id, p_nota);
  select e.id, e.estado into v_ev from public.ps_evaluaciones_vaf e where e.version_id = v_ver.id;
  perform public.ps_evento('plan.enviado_evaluacion', p_plan, v_ver.id, null, jsonb_build_object('etiqueta', v_ver.etiqueta, 'evaluacion_vaf', v_ev.id));
  return jsonb_build_object('enviada', true) || v_pub
    || jsonb_build_object('evaluacion_vaf', case when v_ev.id is null then null else jsonb_build_object('id', v_ev.id, 'estado', v_ev.estado) end);
end;
$$;

/**
 * 0291: igual que en 0288, salvo la línea: una línea con oficina de OTRA oficina del mismo plan se puede vincular (la actividad «aporta» a
 * esa oficina; 'aporta_oficina_unit_id' en datos); una línea SIN oficina solo la vincula el administrador.
 */
create or replace function public.ps_actividad_normalizar(p_fila integer, p_obj jsonb, p_plan uuid, p_unit uuid, p_es_admin boolean, p_linea_actual text default null, p_pdi_obligatorio boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e jsonb := '[]'::jsonb;
  v jsonb;
  t text;
  r jsonb;
  pl public.ps_planes%rowtype;
  lo date; hi date;
  o_titulo text; o_desc text := ''; o_prior text := 'Medio';
  o_ini date; o_fin date; o_hito boolean := false;
  o_linea uuid; o_clave text; o_campus uuid;
  o_resp uuid[] := '{}'::uuid[];
  v_of uuid; v_ok boolean; o_aporta uuid;
  campo text; x text; pid uuid;
  lista text[];
  v_pdi jsonb;
begin
  if p_obj is null or jsonb_typeof(p_obj) <> 'object' then
    return jsonb_build_object('errores', jsonb_build_array(public.ps_err(p_fila, 'fila', 'La fila debe ser un objeto con los campos de la actividad.')), 'datos', null, 'conflictos', '[]'::jsonb);
  end if;
  select * into pl from public.ps_planes where id = p_plan;
  lo := make_date(pl.anio_ini, 1, 1);
  hi := make_date(pl.anio_fin, 12, 31);

  -- título
  v := public.ps_j(p_obj, array['titulo', 'actividad']);
  if v is null or not public.ps_j_escalar(v) or btrim(v #>> '{}') = '' then
    e := e || public.ps_err(p_fila, 'titulo', 'El título es obligatorio.');
  else
    o_titulo := btrim(v #>> '{}');
    if char_length(o_titulo) < 3 or char_length(o_titulo) > 200 then
      e := e || public.ps_err(p_fila, 'titulo', 'El título debe tener entre 3 y 200 caracteres.');
    end if;
  end if;

  -- descripción
  v := public.ps_j(p_obj, array['descripcion', 'desc']);
  if v is not null then
    if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'descripcion', 'La descripción debe ser un texto.');
    else
      o_desc := btrim(v #>> '{}');
      if char_length(o_desc) > 4000 then e := e || public.ps_err(p_fila, 'descripcion', 'La descripción supera los 4000 caracteres.'); end if;
    end if;
  end if;

  -- prioridad
  v := public.ps_j(p_obj, array['prioridad', 'prior']);
  if v is not null then
    if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'prioridad', 'La prioridad debe ser un texto.');
    else
      t := public.ps_texto_norm(v #>> '{}');
      if t = '' then null;
      elsif t = 'critico' then o_prior := 'Crítico';
      elsif t = 'alto' then o_prior := 'Alto';
      elsif t = 'medio' then o_prior := 'Medio';
      elsif t = 'bajo' then o_prior := 'Bajo';
      else e := e || public.ps_err(p_fila, 'prioridad', 'La prioridad debe ser Crítico, Alto, Medio o Bajo.'); end if;
    end if;
  end if;

  -- fechas
  for campo in select unnest(array['inicio', 'fin']) loop
    v := public.ps_j(p_obj, array[campo]);
    if v is not null then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        e := e || public.ps_err(p_fila, campo, 'La fecha debe venir como AAAA-MM-DD.');
      else
        begin
          if campo = 'inicio' then o_ini := (v #>> '{}')::date; else o_fin := (v #>> '{}')::date; end if;
        exception when others then
          e := e || public.ps_err(p_fila, campo, 'La fecha no existe en el calendario.');
        end;
      end if;
    end if;
  end loop;
  if o_ini is not null and o_fin is not null and o_fin < o_ini then
    e := e || public.ps_err(p_fila, 'fin', 'La fecha de fin no puede ser anterior a la de inicio.');
  end if;
  if o_ini is not null and (o_ini < lo or o_ini > hi) then
    e := e || public.ps_err(p_fila, 'inicio', format('El inicio debe estar dentro de la vigencia del plan (%s a %s).', lo, hi));
  end if;
  if o_fin is not null and (o_fin < lo or o_fin > hi) then
    e := e || public.ps_err(p_fila, 'fin', format('El fin debe estar dentro de la vigencia del plan (%s a %s).', lo, hi));
  end if;

  -- hito
  v := public.ps_j(p_obj, array['es_hito', 'hito']);
  if v is not null then
    t := public.ps_texto_norm(v #>> '{}');
    if jsonb_typeof(v) = 'boolean' then o_hito := (v #>> '{}')::boolean;
    elsif t in ('si', 'true', '1', 'x') then o_hito := true;
    elsif t in ('no', 'false', '0', '') then o_hito := false;
    else e := e || public.ps_err(p_fila, 'es_hito', 'El hito debe ser Sí o No.'); end if;
  end if;
  if o_hito and o_fin is null then
    e := e || public.ps_err(p_fila, 'fin', 'Un hito necesita fecha de fin.');
  end if;
  if o_hito and o_ini is not null and o_fin is not null and o_ini <> o_fin then
    e := e || public.ps_err(p_fila, 'inicio', 'En un hito el inicio y el fin son el mismo día (o se deja el inicio vacío).');
  end if;

  -- línea (versión vigente; de la misma oficina salvo administración)
  v := public.ps_j(p_obj, array['linea_clave', 'linea', 'proyecto']);
  if v is not null then
    if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'linea', 'La línea debe ser su clave (texto o número).');
    else
      o_clave := btrim(v #>> '{}');
      if o_clave = '' then
        o_clave := null;
      else
        select l.id, vl.oficina_unit_id into o_linea, v_of
          from public.ps_lineas l
          join public.ps_planes p on p.id = l.plan_id
          join public.ps_version_lineas vl on vl.linea_id = l.id and vl.version_id = p.version_vigente_id
         where l.plan_id = p_plan and l.clave = o_clave;
        if o_linea is null then
          if p_linea_actual is not null and o_clave = p_linea_actual then
            select l.id into o_linea from public.ps_lineas l where l.plan_id = p_plan and l.clave = o_clave;
          else
            e := e || public.ps_err(p_fila, 'linea', format('La línea «%s» no existe en la versión vigente del plan.', o_clave));
          end if;
        elsif not p_es_admin and p_linea_actual is distinct from o_clave and v_of is null then
          -- 0291: una línea de otra oficina del mismo plan SÍ se puede vincular (la actividad aporta a esa oficina); una sin oficina, no.
          e := e || public.ps_err(p_fila, 'linea', format('La línea «%s» está sin oficina asignada: pida al administrador que se la asigne.', o_clave));
        end if;
        if o_linea is not null and v_of is not null and v_of is distinct from p_unit then o_aporta := v_of; end if;
      end if;
    end if;
  end if;

  -- campus: por id o por nombre; vacío = todos los campus
  v := public.ps_j(p_obj, array['campus_id']);
  if v is not null then
    if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      e := e || public.ps_err(p_fila, 'campus', 'El campus debe ser un identificador válido.');
    else
      o_campus := (v #>> '{}')::uuid;
      if not exists (select 1 from public.campuses where id = o_campus) then
        e := e || public.ps_err(p_fila, 'campus', 'El campus no existe en la lista de campus del portal.');
        o_campus := null;
      end if;
    end if;
  else
    v := public.ps_j(p_obj, array['campus']);
    if v is not null then
      if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'campus', 'El campus debe ser un texto.');
      elsif btrim(v #>> '{}') <> '' then
        r := public.ps_resolver_campus(v #>> '{}');
        if (r ->> 'ok')::boolean then o_campus := nullif(r ->> 'id', '')::uuid;
        else e := e || public.ps_err(p_fila, 'campus', format('El campus «%s» no existe en la lista de campus del portal.', btrim(v #>> '{}'))); end if;
      end if;
    end if;
  end if;

  -- responsables: lista (o texto con ; o ,) de correos o ids de perfil; deben ser de la oficina
  v := public.ps_j(p_obj, array['responsables', 'responsable', 'correo']);
  if v is not null then
    if jsonb_typeof(v) = 'array' then
      select array_agg(btrim(x1)) into lista from jsonb_array_elements_text(v) as x1;
    elsif public.ps_j_escalar(v) then
      select array_agg(btrim(x1)) into lista from unnest(regexp_split_to_array(v #>> '{}', '\s*[;,]\s*')) as x1;
    else
      e := e || public.ps_err(p_fila, 'responsable', 'El responsable debe ser un correo o una lista de correos.');
    end if;
    if lista is not null then
      if cardinality(lista) > 10 then
        e := e || public.ps_err(p_fila, 'responsable', 'Una actividad admite hasta 10 responsables.');
      else
        foreach x in array lista loop
          continue when x = '';
          pid := null;
          if x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            select id into pid from public.profiles where id = x::uuid;
          else
            select id into pid from public.profiles where lower(email) = lower(x) limit 1;
          end if;
          if pid is null then
            e := e || public.ps_err(p_fila, 'responsable', format('No hay una persona con «%s» en el portal.', x));
          elsif not public.ps_asignable(pid, p_unit) then
            e := e || public.ps_err(p_fila, 'responsable', format('«%s» no pertenece a la oficina (como editor o jefe) o no tiene acceso al módulo.', x));
          elsif not (pid = any (o_resp)) then
            o_resp := o_resp || pid;
          end if;
        end loop;
      end if;
    end if;
  end if;

  -- conexión con el PDI (0288)
  v_pdi := public.ps_pdi_resolver(p_fila, p_obj, p_pdi_obligatorio);
  e := e || (v_pdi -> 'errores');

  return jsonb_build_object(
    'errores', e,
    'conflictos', public.ps_conflictos_campus(o_resp, p_unit, o_campus),
    'datos', jsonb_build_object(
      'titulo', o_titulo, 'descripcion', o_desc, 'prioridad', o_prior, 'inicio', o_ini, 'fin', o_fin, 'es_hito', o_hito,
      'linea_id', o_linea, 'linea_clave', o_clave, 'aporta_oficina_unit_id', o_aporta, 'campus_id', o_campus, 'responsables', to_jsonb(o_resp), 'pdi', coalesce(v_pdi -> 'pdi', 'null'::jsonb)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Evaluar un proyecto (aprobar o rechazar): solo financiero y admin
-- -----------------------------------------------------------------------------

/** Lee un objeto de respuestas sí/no (true/false o «Sí»/«No»). Devuelve {clave: true|false|null}. Con p_requerido, todas deben venir respondidas. */
create or replace function public.ps_evaluar_sino(p_obj jsonb, p_claves text[], p_nombre text, p_requerido boolean)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  k text;
  v jsonb;
  t text;
  r jsonb := '{}'::jsonb;
begin
  if p_obj is null or jsonb_typeof(p_obj) = 'null' then
    if p_requerido then raise exception 'Responda todos los % (Sí o No).', p_nombre using errcode = '22023'; end if;
    return r;
  end if;
  if jsonb_typeof(p_obj) <> 'object' then raise exception 'Los % deben ser un objeto {clave: Sí/No}.', p_nombre using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_obj) loop
    if not (k = any (p_claves)) then
      raise exception 'El criterio «%» no existe en los % (use: %).', left(k, 30), p_nombre, array_to_string(p_claves, ', ') using errcode = '22023';
    end if;
  end loop;
  foreach k in array p_claves loop
    v := p_obj -> k;
    if v is null or jsonb_typeof(v) = 'null' then
      if p_requerido then raise exception 'Responda «%» en los % (Sí o No).', k, p_nombre using errcode = '22023'; end if;
      if p_obj ? k then r := r || jsonb_build_object(k, null); end if;
    elsif jsonb_typeof(v) = 'boolean' then
      r := r || jsonb_build_object(k, v);
    elsif jsonb_typeof(v) = 'string' then
      t := public.ps_texto_norm(v #>> '{}');
      if t in ('si', 'true', '1') then r := r || jsonb_build_object(k, true);
      elsif t in ('no', 'false', '0') then r := r || jsonb_build_object(k, false);
      elsif t = '' then
        if p_requerido then raise exception 'Responda «%» en los % (Sí o No).', k, p_nombre using errcode = '22023'; end if;
        r := r || jsonb_build_object(k, null);
      else raise exception '«%» en los % debe ser Sí o No.', k, p_nombre using errcode = '22023'; end if;
    else
      raise exception '«%» en los % debe ser Sí o No.', k, p_nombre using errcode = '22023';
    end if;
  end loop;
  return r;
end;
$$;

create or replace function public.ps_evaluacion_proyecto_json(e public.ps_evaluaciones_proyecto)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', e.id, 'plan_id', e.plan_id, 'linea_id', e.linea_id, 'version_id', e.version_id,
    'clave', (select l.clave from public.ps_lineas l where l.id = e.linea_id),
    'resultado', e.resultado, 'criterios', e.criterios, 'viabilidad', e.viabilidad, 'prioridad', e.prioridad,
    'inicio', e.inicio, 'fin', e.fin, 'pct', e.pct, 'monto_solicitado', e.monto_solicitado, 'monto_aprobado', e.monto_aprobado,
    'fuente', e.fuente, 'nota', e.nota,
    'evaluado_por', (select jsonb_build_object('id', p.id, 'nombre', p.full_name) from public.profiles p where p.id = e.evaluado_por),
    'evaluado_en', e.evaluado_en);
$$;

/** Escribe lo evaluado en ps_linea_financiacion (el «aprobado» de 0290): aprobada/ajustada por año según la distribución × monto aprobado; rechazada en 0. */
create or replace function public.ps_evaluacion_sincronizar(e public.ps_evaluaciones_proyecto)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  r record;
  v_estado text;
  v_resto numeric;
  v_ult integer;
  v_m numeric;
  v_n integer;
begin
  select * into p from public.ps_planes where id = e.plan_id;
  if e.resultado = 'Aprobado' then
    v_estado := case when e.monto_aprobado = e.monto_solicitado then 'aprobada' else 'ajustada' end;
    v_resto := e.monto_aprobado;
    select max(key::integer) into v_ult from jsonb_each_text(e.pct) where value::numeric > 0;
    for r in select key::integer as anio, value::numeric as pct from jsonb_each_text(e.pct) where value::numeric > 0 order by 1 loop
      v_m := case when r.anio = v_ult then v_resto else round(e.monto_aprobado * r.pct / 100, 2) end;
      v_resto := v_resto - v_m;
      insert into public.ps_linea_financiacion (plan_id, linea_id, anio, monto_aprobado, fuente, estado, nota, evaluado_por, evaluado_en)
      values (e.plan_id, e.linea_id, r.anio, v_m, e.fuente, v_estado, e.nota, e.evaluado_por, e.evaluado_en)
      on conflict (linea_id, anio) do update
         set monto_aprobado = excluded.monto_aprobado, fuente = excluded.fuente, estado = excluded.estado, nota = excluded.nota,
             evaluado_por = excluded.evaluado_por, evaluado_en = excluded.evaluado_en;
    end loop;
    -- años que tenían financiación y la nueva distribución ya no usa: quedan en cero
    update public.ps_linea_financiacion
       set monto_aprobado = 0, estado = v_estado, nota = e.nota, evaluado_por = e.evaluado_por, evaluado_en = e.evaluado_en
     where linea_id = e.linea_id
       and anio not in (select key::integer from jsonb_each_text(e.pct) where value::numeric > 0);
  else
    update public.ps_linea_financiacion
       set monto_aprobado = 0, estado = 'rechazada', nota = e.nota, evaluado_por = e.evaluado_por, evaluado_en = e.evaluado_en
     where linea_id = e.linea_id;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      insert into public.ps_linea_financiacion (plan_id, linea_id, anio, monto_aprobado, fuente, estado, nota, evaluado_por, evaluado_en)
      select e.plan_id, e.linea_id, y.anio, 0, e.fuente, 'rechazada', e.nota, e.evaluado_por, e.evaluado_en
        from (select key::integer as anio from jsonb_each_text((select vl.pct from public.ps_version_lineas vl where vl.version_id = e.version_id and vl.linea_id = e.linea_id))
               where value::numeric > 0 and key::integer between p.anio_ini and p.anio_fin
              union select p.anio_ini where not exists (
                select 1 from jsonb_each_text((select vl.pct from public.ps_version_lineas vl where vl.version_id = e.version_id and vl.linea_id = e.linea_id)) kv
                 where kv.value::numeric > 0 and kv.key::integer between p.anio_ini and p.anio_fin)) y;
    end if;
  end if;
end;
$$;

/**
 * Evalúa un proyecto (ps_lineas.id) de la versión vigente: APROBAR o RECHAZAR. Solo financiero y admin; el gestor de la oficina solo lee.
 * p_datos: resultado ('Aprobado' | 'Rechazado'), criterios {alin,deficit,norm,pdi,sost}, viabilidad {tec,fin,op} (true/false o Sí/No; todos
 * obligatorios al aprobar), prioridad (por omisión la del proyecto), inicio y fin (AAAA-MM-DD; obligatorias al aprobar, dentro de la
 * vigencia del plan), pct {"2027": 40, …} (porcentajes 0-100 por año; deben sumar 100 al aprobar), monto_aprobado (por omisión el
 * solicitado; > 0 al aprobar), fuente, nota (≥ 20 caracteres al rechazar o al aprobar con un monto distinto del solicitado).
 * Inserta una fila en ps_evaluaciones_proyecto (la vigente es la última), escribe ps_linea_financiacion y el evento proyecto.evaluado.
 */
create or replace function public.ps_proyecto_evaluar(p_linea uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.ps_lineas%rowtype;
  p public.ps_planes%rowtype;
  vl public.ps_version_lineas%rowtype;
  d jsonb := p_datos;
  v_res text;
  v_crit jsonb;
  v_viab jsonb;
  v_prior text;
  v_ini date;
  v_fin date;
  v_pct jsonb := '{}'::jsonb;
  v_sum numeric := 0;
  v_sol numeric;
  v_apr numeric;
  v_nota text;
  v_fuente text;
  v_val jsonb;
  k text;
  w jsonb;
  t text;
  e public.ps_evaluaciones_proyecto%rowtype;
begin
  if not public.ps_puede('financiero') then
    raise exception 'Sin permiso: evaluar proyectos es de la VAF (financiero) y del administrador; el gestor de la oficina solo consulta.' using errcode = '42501';
  end if;
  select * into l from public.ps_lineas where id = p_linea;
  if not found then raise exception 'El proyecto no existe.' using errcode = 'P0002'; end if;
  select * into p from public.ps_planes where id = l.plan_id;
  if p.estado = 'archivado' then raise exception 'El plan está archivado: reábralo para evaluar.' using errcode = '22023'; end if;
  if p.version_vigente_id is null then
    raise exception 'El plan todavía no tiene una versión publicada: envíelo a evaluación primero.' using errcode = '55000';
  end if;
  select * into vl from public.ps_version_lineas where version_id = p.version_vigente_id and linea_id = p_linea;
  if not found then raise exception 'El proyecto no está en la versión vigente del plan.' using errcode = '55000'; end if;
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'p_datos debe ser un objeto con la evaluación.' using errcode = '22023'; end if;

  -- resultado
  v_val := public.ps_j(d, array['resultado']);
  t := public.ps_texto_norm(coalesce(v_val #>> '{}', ''));
  v_res := case t when 'aprobado' then 'Aprobado' when 'rechazado' then 'Rechazado' end;
  if v_res is null then raise exception 'El resultado debe ser Aprobado o Rechazado.' using errcode = '22023'; end if;

  v_crit := public.ps_evaluar_sino(d -> 'criterios', array['alin', 'deficit', 'norm', 'pdi', 'sost'], 'criterios', v_res = 'Aprobado');
  v_viab := public.ps_evaluar_sino(d -> 'viabilidad', array['tec', 'fin', 'op'], 'criterios de viabilidad', v_res = 'Aprobado');

  -- prioridad
  v_val := public.ps_j(d, array['prioridad']);
  if v_val is null then v_prior := vl.prioridad;
  else
    t := public.ps_texto_norm(coalesce(v_val #>> '{}', ''));
    v_prior := case t when 'critico' then 'Crítico' when 'alto' then 'Alto' when 'medio' then 'Medio' when 'largo plazo' then 'Largo plazo' end;
    if v_prior is null then raise exception 'La prioridad debe ser Crítico, Alto, Medio o Largo plazo.' using errcode = '22023'; end if;
  end if;

  -- fechas
  for k in select unnest(array['inicio', 'fin']) loop
    v_val := public.ps_j(d, array[k]);
    if v_val is not null then
      if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'La fecha de % debe venir como AAAA-MM-DD.', k using errcode = '22023'; end if;
      begin
        if k = 'inicio' then v_ini := (v_val #>> '{}')::date; else v_fin := (v_val #>> '{}')::date; end if;
      exception when others then
        raise exception 'La fecha de % no existe en el calendario.', k using errcode = '22023';
      end;
    end if;
  end loop;
  if v_ini is not null and v_fin is not null and v_fin < v_ini then raise exception 'La fecha de fin es anterior a la de inicio.' using errcode = '22023'; end if;
  if (v_ini is not null and (v_ini < make_date(p.anio_ini, 1, 1) or v_ini > make_date(p.anio_fin, 12, 31)))
     or (v_fin is not null and (v_fin < make_date(p.anio_ini, 1, 1) or v_fin > make_date(p.anio_fin, 12, 31))) then
    raise exception 'Las fechas deben estar dentro de la vigencia del plan (% a %).', p.anio_ini, p.anio_fin using errcode = '22023';
  end if;
  if v_res = 'Aprobado' and (v_ini is null or v_fin is null) then raise exception 'Al aprobar, indique las fechas de inicio y fin.' using errcode = '22023'; end if;

  -- distribución anual (porcentajes 0-100)
  v_val := public.ps_j(d, array['pct']);
  if v_val is not null then
    if jsonb_typeof(v_val) <> 'object' then raise exception 'La distribución anual debe ser un objeto {"2027": 40, …}.' using errcode = '22023'; end if;
    for k, w in select * from jsonb_each(v_val) loop
      if k !~ '^\d{4}$' or k::integer < p.anio_ini or k::integer > p.anio_fin then
        raise exception 'El año «%» está fuera del plan (% a %).', left(k, 12), p.anio_ini, p.anio_fin using errcode = '22023';
      end if;
      if jsonb_typeof(w) = 'null' then continue; end if;
      if jsonb_typeof(w) <> 'number' or (w #>> '{}')::numeric < 0 or (w #>> '{}')::numeric > 100 then
        raise exception 'El porcentaje de % debe ser un número entre 0 y 100.', k using errcode = '22023';
      end if;
      v_sum := v_sum + (w #>> '{}')::numeric;
      v_pct := v_pct || jsonb_build_object(k, w);
    end loop;
  end if;
  if v_res = 'Aprobado' then
    if abs(v_sum - 100) > 0.01 then raise exception 'La distribución anual suma % y debe sumar 100.', round(v_sum, 2) using errcode = '22023'; end if;
  else
    v_pct := '{}'::jsonb;   -- un proyecto rechazado no tiene distribución
  end if;

  -- montos y nota
  v_sol := coalesce(vl.monto, 0);
  v_val := public.ps_j(d, array['monto_aprobado']);
  if v_res = 'Rechazado' then
    v_apr := 0;
  else
    if v_val is null then v_apr := v_sol;
    elsif jsonb_typeof(v_val) = 'number' then v_apr := (v_val #>> '{}')::numeric;
    else raise exception 'El monto aprobado debe ser un número.' using errcode = '22023'; end if;
    if v_apr is null or v_apr <= 0 or v_apr >= 1e15 then raise exception 'Al aprobar, el monto aprobado debe ser mayor que cero.' using errcode = '22023'; end if;
  end if;
  v_nota := btrim(coalesce(public.ps_j(d, array['nota']) #>> '{}', ''));
  v_fuente := btrim(coalesce(public.ps_j(d, array['fuente']) #>> '{}', coalesce(vl.fuente, '')));
  if char_length(v_nota) > 1000 or char_length(v_fuente) > 200 then raise exception 'La nota (1000) o la fuente (200) superan el tope.' using errcode = '22023'; end if;
  if (v_res = 'Rechazado' or v_apr <> v_sol) and char_length(v_nota) < 20 then
    raise exception 'Explique en la nota (al menos 20 caracteres) por qué se rechaza o por qué el monto aprobado difiere del solicitado.' using errcode = '22023';
  end if;

  insert into public.ps_evaluaciones_proyecto (plan_id, linea_id, version_id, resultado, criterios, viabilidad, prioridad, inicio, fin, pct,
                                               monto_solicitado, monto_aprobado, fuente, nota, evaluado_por)
  values (l.plan_id, p_linea, p.version_vigente_id, v_res, v_crit, v_viab, v_prior, v_ini, v_fin, v_pct, v_sol, v_apr, v_fuente, v_nota, auth.uid())
  returning * into e;
  perform public.ps_evaluacion_sincronizar(e);
  perform public.ps_evento('proyecto.evaluado', l.plan_id, p.version_vigente_id, l.clave,
    jsonb_build_object('evaluacion', e.id, 'resultado', v_res, 'monto_solicitado', v_sol, 'monto_aprobado', v_apr));
  return public.ps_evaluacion_proyecto_json(e);
end;
$$;

/** La evaluación vigente y el historial de un proyecto: {linea_id, plan_id, clave, nombre, solicitado, estado, vigente, historial:[…]}. Quien ve el proyecto. */
create or replace function public.ps_proyecto_evaluacion_leer(p_linea uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l public.ps_lineas%rowtype;
  vl public.ps_version_lineas%rowtype;
  v_hist jsonb;
  v_vig jsonb;
begin
  select * into l from public.ps_lineas where id = p_linea;
  if not found or not public.ps_plan_visible(l.plan_id) or not public.ps_ve_linea_presupuesto(p_linea) then
    raise exception 'El proyecto no existe.' using errcode = 'P0002';
  end if;
  select vl2.* into vl from public.ps_version_lineas vl2
    join public.ps_planes p on p.id = l.plan_id
   where vl2.linea_id = p_linea and vl2.version_id = coalesce(p.version_vigente_id, (select v.id from public.ps_versiones v where v.plan_id = p.id order by v.numero desc limit 1));
  select coalesce(jsonb_agg(public.ps_evaluacion_proyecto_json(e) order by e.seq desc), '[]'::jsonb) into v_hist
    from public.ps_evaluaciones_proyecto e where e.linea_id = p_linea;
  v_vig := v_hist -> 0;
  return jsonb_build_object('linea_id', p_linea, 'plan_id', l.plan_id, 'clave', l.clave, 'nombre', vl.nombre, 'solicitado', coalesce(vl.monto, 0),
    'estado', case when v_vig is null then 'sin_evaluar' when v_vig ->> 'resultado' = 'Aprobado' then 'aprobado' else 'rechazado' end,
    'vigente', v_vig, 'historial', v_hist);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Resumen solicitado vs aprobado
-- -----------------------------------------------------------------------------

/** Totales de una lista de proyectos [{solicitado, aprobado, estado}]: solicitado, aprobado, rechazado y sin evaluar, en monto y cantidad. */
create or replace function public.ps_resumen_agregar(p_filas jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'solicitado', jsonb_build_object('monto', coalesce(sum(rr.solicitado), 0), 'cantidad', count(*)),
    'aprobado', jsonb_build_object('monto', coalesce(sum(rr.aprobado) filter (where rr.estado = 'aprobado'), 0), 'cantidad', count(*) filter (where rr.estado = 'aprobado'),
                                   'solicitado', coalesce(sum(rr.solicitado) filter (where rr.estado = 'aprobado'), 0),
                                   'ajuste', coalesce(sum(rr.aprobado - rr.solicitado) filter (where rr.estado = 'aprobado'), 0)),
    'rechazado', jsonb_build_object('monto', coalesce(sum(rr.solicitado) filter (where rr.estado = 'rechazado'), 0), 'cantidad', count(*) filter (where rr.estado = 'rechazado')),
    'sin_evaluar', jsonb_build_object('monto', coalesce(sum(rr.solicitado) filter (where rr.estado = 'sin_evaluar'), 0), 'cantidad', count(*) filter (where rr.estado = 'sin_evaluar')))
  from jsonb_to_recordset(p_filas) as rr (solicitado numeric, aprobado numeric, estado text);
$$;

/**
 * Resumen solicitado vs aprobado de los proyectos (versión vigente; si no hay, la última) de un plan, o de todos los planes activos que
 * quien pregunta ve (p_plan nulo). Solo cuenta los proyectos que quien pregunta ve (gestor y colaborador: los de sus oficinas).
 * {plan_id, generado_en, totales:{solicitado,aprobado,rechazado,sin_evaluar}, solicitado_sin_distribuir, por_plan, por_pilar, por_campus,
 *  por_oficina, por_anio:[{anio,solicitado,aprobado,diferencia}], proyectos:[…]}. «Sin evaluar» = sin fila en ps_evaluaciones_proyecto.
 */
create or replace function public.ps_resumen_aprobacion(p_plan uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nivel text := public.ps_nivel_actual();
  v_global boolean;
  v_filas jsonb;
  v_pilar jsonb; v_campus jsonb; v_oficina jsonb; v_plan jsonb; v_anio jsonb;
  v_sin numeric;
begin
  if v_nivel = 'none' then raise exception 'Sin permiso para ver Planeación y Seguimiento.' using errcode = '42501'; end if;
  if p_plan is not null and not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  v_global := v_nivel in ('admin', 'lector', 'aprobador', 'financiero');

  select coalesce(jsonb_agg(r.fila order by r.plan_nombre, r.orden, r.clave), '[]'::jsonb) into v_filas
  from (
    select p.nombre as plan_nombre, vl.orden, vl.clave,
           jsonb_build_object(
             'plan_id', p.id, 'plan', p.nombre, 'linea_id', l.id, 'clave', vl.clave, 'nombre', vl.nombre, 'pilar', vl.pilar,
             'campus', coalesce(vl.campus_texto, 'Todos'), 'prioridad', vl.prioridad,
             'oficina', case when vl.oficina_unit_id is null then null else jsonb_build_object('unit_id', u.id, 'nombre', u.name, 'codigo', u.code) end,
             'estado', case when e.id is null then 'sin_evaluar' when e.resultado = 'Aprobado' then 'aprobado' else 'rechazado' end,
             'resultado', e.resultado, 'resultado_matriz', vl.resultado,
             'solicitado', coalesce(vl.monto, 0),
             'aprobado', case when e.resultado = 'Aprobado' then e.monto_aprobado end,
             'diferencia', case when e.resultado = 'Aprobado' then e.monto_aprobado - coalesce(vl.monto, 0) end,
             'nota', e.nota, 'evaluacion_id', e.id, 'evaluado_en', e.evaluado_en,
             'evaluado_por', (select pr.full_name from public.profiles pr where pr.id = e.evaluado_por),
             'pct', vl.pct) as fila
      from public.ps_planes p
      join public.ps_version_lineas vl on vl.version_id = coalesce(p.version_vigente_id, (select v2.id from public.ps_versiones v2 where v2.plan_id = p.id order by v2.numero desc limit 1))
      join public.ps_lineas l on l.id = vl.linea_id
      left join public.units u on u.id = vl.oficina_unit_id
      left join lateral (select ev.* from public.ps_evaluaciones_proyecto ev where ev.linea_id = l.id order by ev.seq desc limit 1) e on true
     where (p_plan is null and p.estado = 'activo' or p.id = p_plan)
       and public.ps_plan_visible(p.id)
       and (v_global or coalesce(public.ps_poder(vl.oficina_unit_id) is not null, false))
  ) r;

  select coalesce(jsonb_agg(jsonb_build_object('plan_id', g.k, 'plan', g.n) || public.ps_resumen_agregar(g.filas) order by g.n), '[]'::jsonb) into v_plan
    from (select x ->> 'plan_id' as k, x ->> 'plan' as n, jsonb_agg(x) as filas from jsonb_array_elements(v_filas) x group by 1, 2) g;
  select coalesce(jsonb_agg(jsonb_build_object('pilar', g.k) || public.ps_resumen_agregar(g.filas) order by g.k), '[]'::jsonb) into v_pilar
    from (select x ->> 'pilar' as k, jsonb_agg(x) as filas from jsonb_array_elements(v_filas) x group by 1) g;
  select coalesce(jsonb_agg(jsonb_build_object('campus', g.k) || public.ps_resumen_agregar(g.filas) order by g.k), '[]'::jsonb) into v_campus
    from (select x ->> 'campus' as k, jsonb_agg(x) as filas from jsonb_array_elements(v_filas) x group by 1) g;
  select coalesce(jsonb_agg(jsonb_build_object('unit_id', g.k, 'nombre', coalesce(g.n, 'Sin oficina')) || public.ps_resumen_agregar(g.filas) order by coalesce(g.n, '￿')), '[]'::jsonb) into v_oficina
    from (select x #>> '{oficina,unit_id}' as k, x #>> '{oficina,nombre}' as n, jsonb_agg(x) as filas from jsonb_array_elements(v_filas) x group by 1, 2) g;

  select coalesce(sum((x ->> 'solicitado')::numeric), 0) into v_sin from jsonb_array_elements(v_filas) x where x -> 'pct' = '{}'::jsonb;
  select coalesce(jsonb_agg(jsonb_build_object('anio', a.anio, 'solicitado', round(a.sol, 2), 'aprobado', round(a.apr, 2), 'diferencia', round(a.apr - a.sol, 2)) order by a.anio), '[]'::jsonb) into v_anio
    from (
      select coalesce(s.anio, fa.anio) as anio, coalesce(s.sol, 0) as sol, coalesce(fa.apr, 0) as apr
        from (select y.key::integer as anio, sum(coalesce((x ->> 'solicitado')::numeric, 0) * y.value::numeric) as sol
                from jsonb_array_elements(v_filas) x cross join lateral jsonb_each_text(x -> 'pct') y group by 1) s
        full join (select f.anio::integer as anio, sum(f.monto_aprobado) as apr
                     from public.ps_linea_financiacion f
                    where f.estado in ('aprobada', 'ajustada') and f.linea_id in (select (x ->> 'linea_id')::uuid from jsonb_array_elements(v_filas) x)
                    group by 1) fa on fa.anio = s.anio
    ) a;

  return jsonb_build_object(
    'plan_id', p_plan, 'generado_en', now(),
    'totales', public.ps_resumen_agregar(v_filas),
    'solicitado_sin_distribuir', v_sin,
    'por_plan', v_plan, 'por_pilar', v_pilar, 'por_campus', v_campus, 'por_oficina', v_oficina, 'por_anio', v_anio,
    'proyectos', coalesce((select jsonb_agg(x - 'pct') from jsonb_array_elements(v_filas) x), '[]'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Oficinas de las líneas de un plan vigente y aportar a una línea de otra oficina
-- -----------------------------------------------------------------------------

/**
 * Asigna en lote la oficina de las líneas SOBRE LA VERSIÓN PUBLICADA vigente (solo admin). p_asignaciones = [{linea_id | clave,
 * oficina_unit_id (uuid, o null para quitarla)}]. Todo o nada. La oficina es administrativa: no crea versión ni cambia el monto ni abre
 * evaluaciones; la huella guardada al publicar sigue siendo la del contenido publicado. Evento linea.oficina_asignada (antes/despues).
 * → {version_id, recibidas, asignadas, sin_cambio, errores:[{fila,campo,mensaje}]}
 */
create or replace function public.ps_asignar_oficinas_lineas(p_plan uuid, p_asignaciones jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  v_n integer;
  i integer;
  o jsonb;
  v_err jsonb := '[]'::jsonb;
  v_plan jsonb := '[]'::jsonb;
  v_vistas jsonb := '{}'::jsonb;
  v_ref jsonb;
  v_clave text;
  v_linea uuid;
  v_unit uuid;
  v_antes uuid;
  v_asig integer := 0;
  c jsonb;
begin
  if not public.ps_puede('asignar_oficina') then
    raise exception 'Sin permiso: asignar la oficina de las líneas es del administrador.' using errcode = '42501';
  end if;
  select * into p from public.ps_planes where id = p_plan for update;
  if not found then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  if p.version_vigente_id is null then
    raise exception 'El plan no tiene una versión publicada: en un borrador use ps_asignar_oficina_linea.' using errcode = '55000';
  end if;
  if p_asignaciones is null or jsonb_typeof(p_asignaciones) <> 'array' or jsonb_array_length(p_asignaciones) = 0 then
    raise exception 'Se esperaba una lista de asignaciones con al menos una fila.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_asignaciones);
  if v_n > 2000 then raise exception 'Máximo 2000 asignaciones por llamada.' using errcode = '22023'; end if;

  for i in 1 .. v_n loop
    o := p_asignaciones -> (i - 1);
    v_linea := null; v_unit := null;
    if jsonb_typeof(o) <> 'object' then
      v_err := v_err || public.ps_err(i, 'fila', 'Cada asignación debe ser un objeto {linea_id | clave, oficina_unit_id}.');
      continue;
    end if;
    v_ref := public.ps_j(o, array['linea_id']);
    if v_ref is not null then
      if jsonb_typeof(v_ref) <> 'string' or (v_ref #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_err := v_err || public.ps_err(i, 'linea_id', 'Debe ser el identificador (uuid) del proyecto.'); continue;
      end if;
      select vl.linea_id, vl.clave, vl.oficina_unit_id into v_linea, v_clave, v_antes from public.ps_version_lineas vl
       where vl.version_id = p.version_vigente_id and vl.linea_id = (v_ref #>> '{}')::uuid;
    else
      v_ref := public.ps_j(o, array['clave', 'no']);
      if v_ref is null or not public.ps_j_escalar(v_ref) or btrim(v_ref #>> '{}') = '' then
        v_err := v_err || public.ps_err(i, 'clave', 'Indique linea_id o la clave del proyecto.'); continue;
      end if;
      select vl.linea_id, vl.clave, vl.oficina_unit_id into v_linea, v_clave, v_antes from public.ps_version_lineas vl
       where vl.version_id = p.version_vigente_id and vl.clave = btrim(v_ref #>> '{}');
    end if;
    if v_linea is null then
      v_err := v_err || public.ps_err(i, 'clave', 'El proyecto no está en la versión vigente del plan.'); continue;
    end if;
    if v_vistas ? v_linea::text then
      v_err := v_err || public.ps_err(i, 'clave', format('El proyecto «%s» está repetido (ya aparece en la fila %s).', v_clave, v_vistas ->> v_linea::text)); continue;
    end if;
    v_vistas := v_vistas || jsonb_build_object(v_linea::text, i);
    if not (o ? 'oficina_unit_id') then
      v_err := v_err || public.ps_err(i, 'oficina_unit_id', 'Falta oficina_unit_id (uuid de la unidad, o null para quitarla).'); continue;
    end if;
    v_ref := o -> 'oficina_unit_id';
    if jsonb_typeof(v_ref) = 'null' then
      v_unit := null;
    elsif jsonb_typeof(v_ref) <> 'string' or (v_ref #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or not exists (select 1 from public.units where id = (v_ref #>> '{}')::uuid) then
      v_err := v_err || public.ps_err(i, 'oficina_unit_id', 'La unidad indicada no existe.'); continue;
    else
      v_unit := (v_ref #>> '{}')::uuid;
    end if;
    v_plan := v_plan || jsonb_build_object('linea_id', v_linea, 'clave', v_clave, 'antes', v_antes, 'despues', v_unit);
  end loop;

  if jsonb_array_length(v_err) > 0 then
    return jsonb_build_object('version_id', p.version_vigente_id, 'recibidas', v_n, 'asignadas', 0, 'sin_cambio', 0, 'errores', v_err);
  end if;

  perform set_config('ps.asignando_oficina', 'on', true);
  for c in select * from jsonb_array_elements(v_plan) loop
    continue when (c ->> 'antes') is not distinct from (c ->> 'despues');
    update public.ps_version_lineas set oficina_unit_id = nullif(c ->> 'despues', '')::uuid
     where version_id = p.version_vigente_id and linea_id = (c ->> 'linea_id')::uuid;
    perform public.ps_evento('linea.oficina_asignada', p_plan, p.version_vigente_id, c ->> 'clave',
      jsonb_build_object('antes', c -> 'antes', 'despues', c -> 'despues', 'vigente', true));
    v_asig := v_asig + 1;
  end loop;
  perform set_config('ps.asignando_oficina', 'off', true);

  return jsonb_build_object('version_id', p.version_vigente_id, 'recibidas', v_n, 'asignadas', v_asig, 'sin_cambio', jsonb_array_length(v_plan) - v_asig, 'errores', '[]'::jsonb);
end;
$$;

/**
 * Proyectos (versión vigente) que una oficina puede vincular a una actividad: los suyos (propios = true) y los del resto del plan
 * (propios = false, con su oficina responsable) para aportar a otra oficina. Sin dinero. p_plan nulo: todos los planes activos con versión
 * vigente que quien pregunta ve. Quien ve la oficina.
 * → [{plan_id, plan, linea_id, clave, nombre, pilar, campus, prioridad, oficina:{unit_id,nombre,codigo}|null, propios, aporta, sin_oficina, puede_vincular}]
 * «aporta»: es de otra oficina (la actividad aportaría a ella). «puede_vincular»: propios, o de otra oficina; sin oficina solo el admin.
 */
create or replace function public.ps_lineas_para_actividad(p_oficina uuid, p_plan uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_oficina);
begin
  if v_poder is null then raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501'; end if;
  if p_plan is not null and not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'plan_id', p.id, 'plan', p.nombre, 'linea_id', vl.linea_id, 'clave', vl.clave, 'nombre', vl.nombre, 'pilar', vl.pilar,
             'campus', coalesce(vl.campus_texto, 'Todos'), 'prioridad', vl.prioridad,
             'oficina', case when u.id is null then null else jsonb_build_object('unit_id', u.id, 'nombre', u.name, 'codigo', u.code) end,
             'propios', vl.oficina_unit_id is not distinct from p_oficina,
             'aporta', vl.oficina_unit_id is not null and vl.oficina_unit_id is distinct from p_oficina,
             'sin_oficina', vl.oficina_unit_id is null,
             'puede_vincular', vl.oficina_unit_id is not null or v_poder = 'admin')
           order by (vl.oficina_unit_id is not distinct from p_oficina) desc, p.nombre, vl.orden, vl.clave)
      from public.ps_planes p
      join public.ps_version_lineas vl on vl.version_id = p.version_vigente_id
      left join public.units u on u.id = vl.oficina_unit_id
     where p.version_vigente_id is not null
       and ((p_plan is null and p.estado = 'activo') or p.id = p_plan)
       and public.ps_plan_visible(p.id)), '[]'::jsonb);
end;
$$;

/** Inserta una actividad ya validada (como en 0288) y, si aporta a una línea de otra oficina, lo deja en el evento y avisa a los gestores de esa oficina. */
create or replace function public.ps_actividad_insertar(p_plan uuid, p_version uuid, p_unit uuid, p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_orden integer;
  r uuid;
  g uuid;
  v_resp uuid[];
  v_aporta uuid := nullif(p_datos ->> 'aporta_oficina_unit_id', '')::uuid;
begin
  select coalesce(max(orden), 0) + 1 into v_orden from public.ps_actividades where oficina_unit_id = p_unit;
  insert into public.ps_actividades (plan_id, linea_id, oficina_unit_id, campus_id, titulo, descripcion, prioridad, inicio, fin, es_hito, version_creacion_id, creada_por, orden)
  values (p_plan, nullif(p_datos ->> 'linea_id', '')::uuid, p_unit, nullif(p_datos ->> 'campus_id', '')::uuid,
          p_datos ->> 'titulo', coalesce(p_datos ->> 'descripcion', ''), p_datos ->> 'prioridad',
          nullif(p_datos ->> 'inicio', '')::date, nullif(p_datos ->> 'fin', '')::date,
          coalesce((p_datos ->> 'es_hito')::boolean, false), p_version, auth.uid(), v_orden)
  returning id into v_id;
  if jsonb_typeof(p_datos -> 'pdi') = 'object' then perform public.ps_actividad_pdi_aplicar(v_id, p_datos -> 'pdi'); end if;
  select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_resp from jsonb_array_elements_text(coalesce(p_datos -> 'responsables', '[]'::jsonb)) as x;
  foreach r in array v_resp loop
    insert into public.ps_asignaciones (actividad_id, profile_id, asignado_por, nota) values (v_id, r, auth.uid(), 'Asignada al crear la actividad.');
    perform public.ps_aviso('c-ps-asignacion', r, v_id);
  end loop;
  perform public.ps_evento_act('actividad.creada', p_plan, p_version, p_datos ->> 'linea_clave', v_id, p_unit,
    jsonb_build_object('titulo', p_datos ->> 'titulo', 'responsables', to_jsonb(v_resp), 'fin', p_datos ->> 'fin',
                       'pdi', coalesce(p_datos #>> '{pdi,conexion}', 'sin_definir')));
  if v_aporta is not null and v_aporta is distinct from p_unit then
    perform public.ps_evento_act('actividad.aporta_otra_oficina', p_plan, p_version, p_datos ->> 'linea_clave', v_id, p_unit,
      jsonb_build_object('oficina_duena', v_aporta, 'titulo', p_datos ->> 'titulo'));
    for g in select x from public.ps_gestores_de(v_aporta) x where x is distinct from auth.uid() loop
      perform public.ps_aviso_plan('c-ps-aporte', g, p_plan,
        jsonb_build_object('actividad', p_datos ->> 'titulo', 'linea', p_datos ->> 'linea_clave',
                           'oficina_aporta', (select u.name from public.units u where u.id = p_unit),
                           'detalle', format('La oficina %s creó la actividad «%s» y la vinculó al proyecto %s de su oficina.',
                                             coalesce((select u.name from public.units u where u.id = p_unit), ''), p_datos ->> 'titulo', coalesce(p_datos ->> 'linea_clave', ''))),
        format('ap:%s:%s', v_id, g));
    end loop;
  end if;
  return v_id;
end;
$$;

/** ¿La actividad aporta a un proyecto de otra oficina? {aporta, oficina_duena:{unit_id,nombre}|null}. Quien ve la oficina de la actividad. */
create or replace function public.ps_actividad_aporte(p_actividad uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_of uuid;
begin
  select * into a from public.ps_actividades where id = p_actividad;
  if not found or public.ps_poder(a.oficina_unit_id) is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  select vl.oficina_unit_id into v_of from public.ps_planes p
    join public.ps_version_lineas vl on vl.version_id = p.version_vigente_id and vl.linea_id = a.linea_id
   where p.id = a.plan_id;
  return jsonb_build_object('aporta', v_of is not null and v_of is distinct from a.oficina_unit_id,
    'oficina_duena', case when v_of is null or v_of = a.oficina_unit_id then null
                          else (select jsonb_build_object('unit_id', u.id, 'nombre', u.name) from public.units u where u.id = v_of) end);
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Permisos de ejecución
-- -----------------------------------------------------------------------------

revoke all on function
  public.ps_evaluaciones_proyecto_guard(), public.ps_version_lineas_guard(), public.ps_vaf_abrir_evaluacion(uuid, uuid, boolean),
  public.ps_vaf_abrir_pendientes_interno(), public.ps_vaf_abrir_pendientes(),
  public.ps_validar_fila_matriz(uuid, integer, jsonb, jsonb, boolean, boolean, uuid), public.ps_cargar_matriz(uuid, jsonb, text, uuid),
  public.ps_proyecto_json(public.ps_version_lineas), public.ps_proyecto_entrada(public.ps_version_lineas),
  public.ps_proyecto_crear(uuid, jsonb), public.ps_proyecto_editar(uuid, jsonb), public.ps_proyecto_borrar(uuid, text),
  public.ps_borrador_leer(uuid), public.ps_plan_enviar_a_evaluacion(uuid, text),
  public.ps_evaluar_sino(jsonb, text[], text, boolean), public.ps_evaluacion_proyecto_json(public.ps_evaluaciones_proyecto),
  public.ps_evaluacion_sincronizar(public.ps_evaluaciones_proyecto), public.ps_proyecto_evaluar(uuid, jsonb),
  public.ps_proyecto_evaluacion_leer(uuid), public.ps_resumen_agregar(jsonb), public.ps_resumen_aprobacion(uuid),
  public.ps_asignar_oficinas_lineas(uuid, jsonb), public.ps_lineas_para_actividad(uuid, uuid),
  public.ps_actividad_normalizar(integer, jsonb, uuid, uuid, boolean, text, boolean), public.ps_actividad_insertar(uuid, uuid, uuid, jsonb),
  public.ps_actividad_aporte(uuid)
  from public, anon, authenticated;

grant execute on function
  public.ps_vaf_abrir_pendientes(), public.ps_cargar_matriz(uuid, jsonb, text, uuid),
  public.ps_proyecto_crear(uuid, jsonb), public.ps_proyecto_editar(uuid, jsonb), public.ps_proyecto_borrar(uuid, text),
  public.ps_borrador_leer(uuid), public.ps_plan_enviar_a_evaluacion(uuid, text),
  public.ps_proyecto_evaluar(uuid, jsonb), public.ps_proyecto_evaluacion_leer(uuid), public.ps_resumen_aprobacion(uuid),
  public.ps_asignar_oficinas_lineas(uuid, jsonb), public.ps_lineas_para_actividad(uuid, uuid), public.ps_actividad_aporte(uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Apertura retroactiva de la evaluación VAF (una vez; idempotente; un fallo no aborta la migración)
-- -----------------------------------------------------------------------------

do $$
begin
  perform public.ps_vaf_abrir_pendientes_interno();
exception when others then
  raise notice 'ps_vaf_abrir_pendientes_interno no se pudo ejecutar (se puede llamar luego con ps_vaf_abrir_pendientes): %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
