-- =============================================================================
-- PDI · 0289 · Planeación y Seguimiento · FASE 3B (varios planes, planes por oficina, plantilla y pilares por plan, tablero del administrador)
--
-- Contrato: docs/planeacion-seguimiento/CONTRATO-BD-F3B.md (§6: firmas reales y desviaciones). Requiere 0286, 0287 y 0288.
--
--   1. ps_planes gana oficina dueña, alcance (institucional | oficina), descripción, estado (activo | archivado), config (plantilla) y archivado_en.
--   2. Visibilidad por plan (ps_plan_visible): admin, lector y aprobador ven todo (como antes); gestor y colaborador, la oficina dueña y
--      sus descendientes, y toda oficina con una línea o actividad en el plan. Las políticas de ps_planes, ps_lineas, ps_versiones y
--      ps_version_lineas la usan.
--   3. ps_plan_pilares (pilares por plan, enlazables al PDI), ps_usuario_pref (plan activo por persona).
--   4. Funciones de planes (crear, editar, archivar, reabrir, config, pilares, visibles, activo) y de la visión del administrador.
--   5. ps_cargar_matriz con la plantilla del plan (columnas obligatorias, listas, pilares, columna «oficina»); publicar y asignar oficina
--      también para el gestor de la oficina dueña de un plan de oficina.
--   6. p_plan uuid default null en las lecturas de actividades, avances, riesgos y resúmenes (null = como hoy / todos los visibles).
--
-- Todo es security definer con search_path fijo; nunca capacity ni has_role_at_least. Idempotente; todo UPDATE/DELETE lleva WHERE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columnas de ps_planes y tablas nuevas
-- -----------------------------------------------------------------------------

alter table public.ps_planes add column if not exists oficina_unit_id uuid references public.units (id) on delete restrict;
alter table public.ps_planes add column if not exists alcance text not null default 'institucional';
alter table public.ps_planes add column if not exists descripcion text not null default '';
alter table public.ps_planes add column if not exists estado text not null default 'activo';
alter table public.ps_planes add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.ps_planes add column if not exists archivado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ps_planes_alcance' and conrelid = 'public.ps_planes'::regclass) then
    alter table public.ps_planes add constraint ps_planes_alcance check (alcance in ('institucional', 'oficina'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ps_planes_estado' and conrelid = 'public.ps_planes'::regclass) then
    alter table public.ps_planes add constraint ps_planes_estado check (estado in ('activo', 'archivado') and (estado = 'archivado') = (archivado_en is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ps_planes_config' and conrelid = 'public.ps_planes'::regclass) then
    alter table public.ps_planes add constraint ps_planes_config check (jsonb_typeof(config) = 'object' and char_length(descripcion) <= 2000);
  end if;
end $$;

create index if not exists ps_planes_oficina_idx on public.ps_planes (oficina_unit_id);

comment on column public.ps_planes.oficina_unit_id is
  'Planeación y Seguimiento (0289): la oficina dueña del plan. Nulo solo en planes anteriores a la fase 3B (el administrador la fija con ps_plan_editar o al cargar).';

/** Pilares de un plan. pillar_id nulo = pilar propio del plan (texto); con valor, es un pilar del PDI institucional. */
create table if not exists public.ps_plan_pilares (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.ps_planes (id) on delete cascade,
  orden      integer not null default 0,
  codigo     text,
  nombre     text not null,
  pillar_id  uuid references public.pillars (id) on delete restrict,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now(),
  constraint ps_ppil_nombre check (char_length(btrim(nombre)) between 2 and 150),
  constraint ps_ppil_codigo check (codigo is null or char_length(codigo) between 1 and 40)
);
create unique index if not exists ps_ppil_nombre_unico on public.ps_plan_pilares (plan_id, lower(btrim(nombre)));
create index if not exists ps_ppil_plan_idx on public.ps_plan_pilares (plan_id, orden);

/** El plan activo de cada persona (su preferencia). */
create table if not exists public.ps_usuario_pref (
  perfil_id      uuid primary key references public.profiles (id) on delete cascade,
  plan_activo    uuid references public.ps_planes (id) on delete set null,
  actualizado_en timestamptz not null default now()
);

alter table public.ps_plan_pilares enable row level security;
alter table public.ps_usuario_pref enable row level security;

-- Los 6 pilares del PDIFyT (y de cualquier plan existente) salen de los valores distintos de la columna «pilar» de sus líneas.
insert into public.ps_plan_pilares (plan_id, orden, codigo, nombre)
select x.plan_id, row_number() over (partition by x.plan_id order by x.o, x.nombre), 'P' || row_number() over (partition by x.plan_id order by x.o, x.nombre), x.nombre
  from (select v.plan_id, min(vl.pilar) as nombre, min(vl.orden) as o
          from public.ps_version_lineas vl join public.ps_versiones v on v.id = vl.version_id
         group by v.plan_id, lower(btrim(vl.pilar))) x
 where not exists (select 1 from public.ps_plan_pilares pp where pp.plan_id = x.plan_id);

-- -----------------------------------------------------------------------------
-- 2. Visibilidad por plan
-- -----------------------------------------------------------------------------

/** Unidad p_unit es p_raiz o cuelga de ella. */
create or replace function public.ps_unidad_bajo(p_unit uuid, p_raiz uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_unit is not null and p_raiz is not null and exists (select 1 from public.unit_chain(p_unit) c where c.id = p_raiz);
$$;

/**
 * ¿Ve quien pregunta este plan? admin, lector y aprobador: todos (como antes). Gestor y colaborador: la oficina dueña y sus
 * descendientes (con la herencia del árbol de unidades), y toda oficina suya que tenga una línea o una actividad en el plan.
 */
create or replace function public.ps_plan_visible(p_plan uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nivel text := public.ps_nivel_actual();
  v_of uuid;
begin
  if v_nivel = 'none' then return false; end if;
  select oficina_unit_id into v_of from public.ps_planes where id = p_plan;
  if not found then return false; end if;
  if v_nivel in ('admin', 'lector', 'aprobador', 'financiero') then return true; end if;
  if v_of is not null and exists (
       with recursive d as (select id from public.units where id = v_of
                            union all select u.id from public.units u join d on u.parent_id = d.id)
       select 1 from d where public.ps_poder(d.id) is not null) then
    return true;
  end if;
  return exists (select 1 from public.ps_actividades a where a.plan_id = p_plan and public.ps_poder(a.oficina_unit_id) is not null)
      or exists (select 1 from public.ps_version_lineas vl join public.ps_versiones v on v.id = vl.version_id
                  where v.plan_id = p_plan and vl.oficina_unit_id is not null and public.ps_poder(vl.oficina_unit_id) is not null);
end;
$$;

/** ¿Administra el plan? El administrador del módulo, o el gestor de la oficina dueña de un plan de oficina. */
create or replace function public.ps_plan_gestiona(p_plan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.ps_puede('cargar') or (p.alcance = 'oficina' and p.oficina_unit_id is not null and public.ps_poder(p.oficina_unit_id) = 'gestor')
      from public.ps_planes p where p.id = p_plan), false);
$$;

drop policy if exists ps_planes_lectura on public.ps_planes;
create policy ps_planes_lectura on public.ps_planes for select to authenticated using (public.ps_plan_visible(id));

drop policy if exists ps_lineas_lectura on public.ps_lineas;
create policy ps_lineas_lectura on public.ps_lineas for select to authenticated using (public.ps_plan_visible(plan_id));

drop policy if exists ps_versiones_lectura on public.ps_versiones;
create policy ps_versiones_lectura on public.ps_versiones for select to authenticated using (public.ps_plan_visible(plan_id));

drop policy if exists ps_version_lineas_lectura on public.ps_version_lineas;
create policy ps_version_lineas_lectura on public.ps_version_lineas for select to authenticated
  using (exists (select 1 from public.ps_versiones v where v.id = version_id and public.ps_plan_visible(v.plan_id)));

drop policy if exists ps_plan_pilares_lectura on public.ps_plan_pilares;
create policy ps_plan_pilares_lectura on public.ps_plan_pilares for select to authenticated using (public.ps_plan_visible(plan_id));

drop policy if exists ps_usuario_pref_lectura on public.ps_usuario_pref;
create policy ps_usuario_pref_lectura on public.ps_usuario_pref for select to authenticated using (perfil_id = auth.uid());

revoke all on public.ps_plan_pilares, public.ps_usuario_pref from public, anon, authenticated;
grant select on public.ps_plan_pilares, public.ps_usuario_pref to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Plantilla por plan (config) y lista de pilares
-- -----------------------------------------------------------------------------

/** Columnas que reconoce la plantilla: clave → (etiqueta, tipo, campo de la línea). */
create or replace function public.ps_plan_columnas_defecto()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select '[
    {"clave":"no","etiqueta":"N.º","tipo":"texto","obligatoria":true,"ayuda":"Clave de la línea; no se repite"},
    {"clave":"clasif","etiqueta":"Clasificación","tipo":"lista","obligatoria":false},
    {"clave":"nombre","etiqueta":"Nombre","tipo":"texto","obligatoria":true},
    {"clave":"descripcion","etiqueta":"Descripción","tipo":"texto","obligatoria":false},
    {"clave":"campus","etiqueta":"Campus","tipo":"lista","obligatoria":true,"ayuda":"Un campus o «Todos»"},
    {"clave":"pilar","etiqueta":"Pilar","tipo":"lista","obligatoria":true},
    {"clave":"monto","etiqueta":"Monto","tipo":"numero","obligatoria":false},
    {"clave":"prioridad","etiqueta":"Prioridad","tipo":"lista","obligatoria":true},
    {"clave":"resultado","etiqueta":"Resultado","tipo":"lista","obligatoria":false},
    {"clave":"fuente","etiqueta":"Fuente","tipo":"lista","obligatoria":false},
    {"clave":"inicio","etiqueta":"Inicio","tipo":"fecha","obligatoria":false},
    {"clave":"fin","etiqueta":"Fin","tipo":"fecha","obligatoria":false}
  ]'::jsonb;
$$;

create or replace function public.ps_plan_clave_valida(p text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p = any (array['no', 'clasif', 'nombre', 'descripcion', 'campus', 'pilar', 'monto', 'prioridad', 'resultado', 'fuente', 'origen', 'inicio', 'fin', 'nota_no_eval', 'oficina']);
$$;

/** Valida y normaliza un config {columnas?, listas?}. Error 22023 con el motivo. */
create or replace function public.ps_plan_config_validar(p_config jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k text;
  c jsonb;
  v_cols jsonb := null;
  v_listas jsonb := null;
  v_vistas text[] := '{}'::text[];
  v_et text;
  v_tipo text;
  v_clave text;
  v_item jsonb;
  v_arr jsonb;
  x text;
  t text;
  canon text;
  v_out jsonb := '{}'::jsonb;
begin
  if p_config is null or p_config = 'null'::jsonb then return '{}'::jsonb; end if;
  if jsonb_typeof(p_config) <> 'object' then raise exception 'La configuración del plan debe ser un objeto {columnas, listas}.' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_config) loop
    if k not in ('columnas', 'listas', 'vigilancia') then raise exception 'La configuración no admite «%»: solo columnas, listas y vigilancia.', k using errcode = '22023'; end if;
  end loop;
  if p_config ? 'columnas' and jsonb_typeof(p_config -> 'columnas') <> 'null' then
    if jsonb_typeof(p_config -> 'columnas') <> 'array' or jsonb_array_length(p_config -> 'columnas') > 20 then
      raise exception 'Las columnas deben ser una lista de hasta 20.' using errcode = '22023';
    end if;
    v_cols := '[]'::jsonb;
    for c in select * from jsonb_array_elements(p_config -> 'columnas') loop
      if jsonb_typeof(c) <> 'object' then raise exception 'Cada columna debe ser un objeto {clave, etiqueta, tipo, obligatoria}.' using errcode = '22023'; end if;
      v_clave := c ->> 'clave';
      if v_clave is null or not public.ps_plan_clave_valida(v_clave) then
        raise exception 'La columna «%» no es parte del catálogo de la plantilla.', left(coalesce(v_clave, ''), 40) using errcode = '22023';
      end if;
      if v_clave = any (v_vistas) then raise exception 'La columna «%» está repetida.', v_clave using errcode = '22023'; end if;
      v_vistas := v_vistas || v_clave;
      v_et := btrim(coalesce(c ->> 'etiqueta', ''));
      if char_length(v_et) < 1 or char_length(v_et) > 60 then raise exception 'La etiqueta de la columna «%» debe tener entre 1 y 60 caracteres.', v_clave using errcode = '22023'; end if;
      v_tipo := coalesce(c ->> 'tipo', 'texto');
      if v_tipo not in ('texto', 'numero', 'fecha', 'lista') then raise exception 'El tipo de la columna «%» debe ser texto, numero, fecha o lista.', v_clave using errcode = '22023'; end if;
      if c ? 'obligatoria' and jsonb_typeof(c -> 'obligatoria') not in ('boolean', 'null') then raise exception '«obligatoria» de la columna «%» debe ser verdadero o falso.', v_clave using errcode = '22023'; end if;
      if char_length(coalesce(c ->> 'ayuda', '')) > 200 then raise exception 'La ayuda de la columna «%» supera los 200 caracteres.', v_clave using errcode = '22023'; end if;
      v_cols := v_cols || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'clave', v_clave, 'etiqueta', v_et, 'tipo', v_tipo,
        'obligatoria', v_clave in ('no', 'nombre') or coalesce((c ->> 'obligatoria')::boolean, false),
        'lista', nullif(btrim(coalesce(c ->> 'lista', '')), ''), 'ayuda', nullif(btrim(coalesce(c ->> 'ayuda', '')), ''))));
    end loop;
    -- «no» y «nombre» siempre están y siempre son obligatorias.
    if not ('nombre' = any (v_vistas)) then
      v_cols := '[{"clave":"nombre","etiqueta":"Nombre","tipo":"texto","obligatoria":true}]'::jsonb || v_cols;
    end if;
    if not ('no' = any (v_vistas)) then
      v_cols := '[{"clave":"no","etiqueta":"N.º","tipo":"texto","obligatoria":true,"ayuda":"Clave de la línea; no se repite"}]'::jsonb || v_cols;
    end if;
    v_out := v_out || jsonb_build_object('columnas', v_cols);
  end if;
  if p_config ? 'listas' and jsonb_typeof(p_config -> 'listas') <> 'null' then
    if jsonb_typeof(p_config -> 'listas') <> 'object' then raise exception 'Las listas deben ser un objeto {clave: [valores]}.' using errcode = '22023'; end if;
    v_listas := '{}'::jsonb;
    for k, v_arr in select * from jsonb_each(p_config -> 'listas') loop
      if k not in ('clasif', 'prioridad', 'resultado', 'fuente', 'origen') then
        raise exception 'La lista «%» no existe: use clasif, prioridad, resultado, fuente u origen.', left(k, 40) using errcode = '22023';
      end if;
      if jsonb_typeof(v_arr) <> 'array' or jsonb_array_length(v_arr) > 50 then raise exception 'La lista «%» debe tener hasta 50 valores.', k using errcode = '22023'; end if;
      v_item := '[]'::jsonb;
      for x in select jsonb_array_elements_text(v_arr) loop
        x := btrim(x);
        if char_length(x) < 1 or char_length(x) > 60 then raise exception 'Los valores de la lista «%» deben tener entre 1 y 60 caracteres.', k using errcode = '22023'; end if;
        if k = 'prioridad' then
          t := public.ps_texto_norm(x);
          canon := case t when 'critico' then 'Crítico' when 'alto' then 'Alto' when 'medio' then 'Medio' when 'largo plazo' then 'Largo plazo' end;
          if canon is null then raise exception 'La lista de prioridad solo admite Crítico, Alto, Medio y Largo plazo.' using errcode = '22023'; end if;
          x := canon;
        end if;
        if not (v_item @> jsonb_build_array(x)) then v_item := v_item || jsonb_build_array(x); end if;
      end loop;
      v_listas := v_listas || jsonb_build_object(k, v_item);
    end loop;
    v_out := v_out || jsonb_build_object('listas', v_listas);
  end if;
  if p_config ? 'vigilancia' and jsonb_typeof(p_config -> 'vigilancia') <> 'null' then
    if jsonb_typeof(p_config -> 'vigilancia') <> 'object' then raise exception 'La vigilancia debe ser un objeto {umbral_desviacion, umbral_sobreejecucion, meses_sin_ejecucion}.' using errcode = '22023'; end if;
    declare
      vg jsonb := p_config -> 'vigilancia';
      a numeric; b numeric; m numeric;
    begin
      for k in select jsonb_object_keys(vg) loop
        if k not in ('umbral_desviacion', 'umbral_sobreejecucion', 'meses_sin_ejecucion') then raise exception 'La vigilancia no admite «%».', left(k, 40) using errcode = '22023'; end if;
      end loop;
      begin
        a := coalesce((vg ->> 'umbral_desviacion')::numeric, 15);
        b := coalesce((vg ->> 'umbral_sobreejecucion')::numeric, 100);
        m := coalesce((vg ->> 'meses_sin_ejecucion')::numeric, 3);
      exception when others then
        raise exception 'Los umbrales de vigilancia deben ser números.' using errcode = '22023';
      end;
      if a not between 1 and 100 or b not between 50 and 300 or m not between 1 and 24 or m <> trunc(m) then
        raise exception 'Umbrales de vigilancia fuera de rango (desviación 1-100, sobreejecución 50-300, meses 1-24).' using errcode = '22023';
      end if;
      v_out := v_out || jsonb_build_object('vigilancia', jsonb_build_object('umbral_desviacion', a, 'umbral_sobreejecucion', b, 'meses_sin_ejecucion', m::integer));
    end;
  end if;
  return v_out;
end;
$$;

/** {columnas, listas} que valen para un plan: los guardados o, si no hay, el conjunto actual del PDIFyT. */
create or replace function public.ps_plan_config_efectiva(p_plan uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'columnas', coalesce(p.config -> 'columnas', public.ps_plan_columnas_defecto()),
    'listas', jsonb_build_object('prioridad', jsonb_build_array('Crítico', 'Alto', 'Medio', 'Largo plazo')) || coalesce(p.config -> 'listas', '{}'::jsonb),
    'vigilancia', '{"umbral_desviacion":15,"umbral_sobreejecucion":100,"meses_sin_ejecucion":3}'::jsonb || coalesce(p.config -> 'vigilancia', '{}'::jsonb))
    from public.ps_planes p where p.id = p_plan;
$$;

/** Resuelve una oficina por id, código o nombre. Nulo si no existe. */
create or replace function public.ps_resolver_oficina(p_texto text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text := btrim(coalesce(p_texto, ''));
  v uuid;
begin
  if t = '' then return null; end if;
  if t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v from public.units where id = t::uuid;
    return v;
  end if;
  select id into v from public.units where lower(code) = lower(t) order by id limit 1;
  if v is null then select id into v from public.units where public.ps_texto_norm(name) = public.ps_texto_norm(t) order by id limit 1; end if;
  return v;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Funciones de planes
-- -----------------------------------------------------------------------------

drop function if exists public.ps_crear_plan(text, integer, integer);

/** El cliente anterior (3 argumentos) ya no crea planes sin oficina: pide la oficina. */
create or replace function public.ps_crear_plan(p_nombre text, p_anio_ini integer, p_anio_fin integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ps_puede('cargar') then
    raise exception 'Sin permiso: crear un plan es del administrador de Planeación y Seguimiento (el gestor de una oficina usa la firma con p_oficina).' using errcode = '42501';
  end if;
  raise exception 'Indique la oficina dueña del plan (use ps_crear_plan con p_oficina).' using errcode = '22023';
end;
$$;

/**
 * Crea un plan. El administrador, de cualquier oficina y alcance; el gestor, solo de su oficina y con alcance «oficina» (sin aprobación
 * de Planeación: queda en borrador hasta su primera versión publicada). p_config = {columnas?, listas?} (la plantilla del plan).
 */
create or replace function public.ps_crear_plan(p_nombre text, p_anio_ini integer, p_anio_fin integer, p_oficina uuid, p_alcance text default 'oficina', p_descripcion text default '', p_config jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_desc text := btrim(coalesce(p_descripcion, ''));
  v_admin boolean := public.ps_puede('cargar');
  v_cfg jsonb;
begin
  if not v_admin and not coalesce(public.ps_nivel_actual() = 'gestor' and p_oficina is not null and public.ps_poder(p_oficina) = 'gestor', false) then
    raise exception 'Sin permiso: crear un plan es del administrador de Planeación y Seguimiento o del gestor de la oficina dueña.' using errcode = '42501';
  end if;
  if p_oficina is null then raise exception 'Indique la oficina dueña del plan.' using errcode = '22023'; end if;
  if not exists (select 1 from public.units where id = p_oficina) then raise exception 'La oficina indicada no existe.' using errcode = 'P0002'; end if;
  if p_alcance is null or p_alcance not in ('institucional', 'oficina') then raise exception 'El alcance debe ser institucional u oficina.' using errcode = '22023'; end if;
  if p_alcance = 'institucional' and not v_admin then
    raise exception 'Sin permiso: un plan institucional lo crea el administrador del módulo.' using errcode = '42501';
  end if;
  if char_length(v_nombre) < 3 or char_length(v_nombre) > 120 then
    raise exception 'El nombre del plan debe tener entre 3 y 120 caracteres.' using errcode = '22023';
  end if;
  if char_length(v_desc) > 2000 then raise exception 'La descripción supera los 2000 caracteres.' using errcode = '22023'; end if;
  if p_anio_ini is null or p_anio_fin is null or p_anio_ini < 2000 or p_anio_fin > 2100 or p_anio_fin < p_anio_ini then
    raise exception 'Los años del plan deben estar entre 2000 y 2100 y el final no puede ser anterior al inicial.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ps_planes where lower(btrim(nombre)) = lower(v_nombre)) then
    raise exception 'Ya existe un plan con el nombre «%».', v_nombre using errcode = '23505';
  end if;
  v_cfg := public.ps_plan_config_validar(p_config);
  insert into public.ps_planes (nombre, anio_ini, anio_fin, creado_por, oficina_unit_id, alcance, descripcion, config)
  values (v_nombre, p_anio_ini, p_anio_fin, auth.uid(), p_oficina, p_alcance, v_desc, v_cfg)
  returning id into v_id;
  perform public.ps_evento('plan.creado', v_id, null, null,
    jsonb_build_object('nombre', v_nombre, 'anio_ini', p_anio_ini, 'anio_fin', p_anio_fin, 'oficina_unit_id', p_oficina, 'alcance', p_alcance));
  return v_id;
end;
$$;

/** Edita nombre, descripcion, oficina_unit_id (solo admin) y anio_ini/anio_fin (mientras no haya una versión publicada). */
create or replace function public.ps_plan_editar(p_plan uuid, p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  k text;
  v_nombre text;
  v_desc text;
  v_of uuid;
  v_ini integer;
  v_fin integer;
  v_dif jsonb := '{}'::jsonb;
begin
  select * into p from public.ps_planes where id = p_plan for update;
  if not found or not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  if not public.ps_plan_gestiona(p_plan) then
    raise exception 'Sin permiso: editar el plan es del administrador o del gestor de la oficina dueña.' using errcode = '42501';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then raise exception 'No hay cambios que guardar.' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_cambios) loop
    if k not in ('nombre', 'descripcion', 'oficina_unit_id', 'anio_ini', 'anio_fin') then
      raise exception 'El campo «%» no se puede editar aquí.', k using errcode = '22023';
    end if;
  end loop;
  v_nombre := btrim(coalesce(p_cambios ->> 'nombre', p.nombre));
  v_desc := btrim(coalesce(p_cambios ->> 'descripcion', p.descripcion));
  v_of := p.oficina_unit_id;
  v_ini := p.anio_ini;
  v_fin := p.anio_fin;
  begin
    if p_cambios ? 'oficina_unit_id' then v_of := nullif(p_cambios ->> 'oficina_unit_id', '')::uuid; end if;
    if p_cambios ? 'anio_ini' then v_ini := (p_cambios ->> 'anio_ini')::integer; end if;
    if p_cambios ? 'anio_fin' then v_fin := (p_cambios ->> 'anio_fin')::integer; end if;
  exception when others then
    raise exception 'La oficina o los años no son válidos.' using errcode = '22023';
  end;
  if char_length(v_nombre) < 3 or char_length(v_nombre) > 120 then raise exception 'El nombre del plan debe tener entre 3 y 120 caracteres.' using errcode = '22023'; end if;
  if char_length(v_desc) > 2000 then raise exception 'La descripción supera los 2000 caracteres.' using errcode = '22023'; end if;
  if v_of is distinct from p.oficina_unit_id then
    if not public.ps_puede('cargar') then raise exception 'Sin permiso: cambiar la oficina dueña es del administrador.' using errcode = '42501'; end if;
    if v_of is null or not exists (select 1 from public.units where id = v_of) then raise exception 'La oficina indicada no existe.' using errcode = '22023'; end if;
  end if;
  if (v_ini <> p.anio_ini or v_fin <> p.anio_fin) then
    if exists (select 1 from public.ps_versiones where plan_id = p_plan and estado = 'publicada') then
      raise exception 'Los años no se cambian cuando el plan ya tiene una versión publicada.' using errcode = '55000';
    end if;
    if v_ini < 2000 or v_fin > 2100 or v_fin < v_ini then raise exception 'Los años del plan deben estar entre 2000 y 2100 y el final no puede ser anterior al inicial.' using errcode = '22023'; end if;
  end if;
  if lower(v_nombre) <> lower(p.nombre) and exists (select 1 from public.ps_planes where lower(btrim(nombre)) = lower(v_nombre) and id <> p_plan) then
    raise exception 'Ya existe un plan con el nombre «%».', v_nombre using errcode = '23505';
  end if;
  update public.ps_planes set nombre = v_nombre, descripcion = v_desc, oficina_unit_id = v_of, anio_ini = v_ini, anio_fin = v_fin where id = p_plan;
  if v_nombre <> p.nombre then v_dif := v_dif || jsonb_build_object('nombre', jsonb_build_object('antes', p.nombre, 'despues', v_nombre)); end if;
  if v_desc <> p.descripcion then v_dif := v_dif || jsonb_build_object('descripcion', jsonb_build_object('antes', p.descripcion, 'despues', v_desc)); end if;
  if v_of is distinct from p.oficina_unit_id then v_dif := v_dif || jsonb_build_object('oficina_unit_id', jsonb_build_object('antes', p.oficina_unit_id, 'despues', v_of)); end if;
  if v_ini <> p.anio_ini then v_dif := v_dif || jsonb_build_object('anio_ini', jsonb_build_object('antes', p.anio_ini, 'despues', v_ini)); end if;
  if v_fin <> p.anio_fin then v_dif := v_dif || jsonb_build_object('anio_fin', jsonb_build_object('antes', p.anio_fin, 'despues', v_fin)); end if;
  perform public.ps_evento('plan.editado', p_plan, null, null, jsonb_build_object('cambios', v_dif));
  return public.ps_plan_json((select x from public.ps_planes x where x.id = p_plan));
end;
$$;

create or replace function public.ps_plan_archivar(p_plan uuid, p_motivo text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  select * into p from public.ps_planes where id = p_plan for update;
  if not found or not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  if not public.ps_plan_gestiona(p_plan) then raise exception 'Sin permiso: archivar el plan es del administrador o del gestor de la oficina dueña.' using errcode = '42501'; end if;
  if char_length(v_motivo) > 1000 then raise exception 'El motivo supera los 1000 caracteres.' using errcode = '22023'; end if;
  if p.estado = 'archivado' then raise exception 'El plan ya está archivado.' using errcode = '22023'; end if;
  update public.ps_planes set estado = 'archivado', archivado_en = now() where id = p_plan;
  perform public.ps_evento('plan.archivado', p_plan, null, null, jsonb_build_object('motivo', v_motivo));
  return public.ps_plan_json((select x from public.ps_planes x where x.id = p_plan));
end;
$$;

create or replace function public.ps_plan_reabrir(p_plan uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
begin
  select * into p from public.ps_planes where id = p_plan for update;
  if not found or not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  if not public.ps_plan_gestiona(p_plan) then raise exception 'Sin permiso: reabrir el plan es del administrador o del gestor de la oficina dueña.' using errcode = '42501'; end if;
  if p.estado <> 'archivado' then raise exception 'El plan no está archivado.' using errcode = '22023'; end if;
  update public.ps_planes set estado = 'activo', archivado_en = null where id = p_plan;
  perform public.ps_evento('plan.reabierto', p_plan, null, null, '{}'::jsonb);
  return public.ps_plan_json((select x from public.ps_planes x where x.id = p_plan));
end;
$$;

/** Guarda la plantilla del plan: {columnas, listas}. Quien administra el plan. */
create or replace function public.ps_plan_config_guardar(p_plan uuid, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  v_cfg jsonb;
begin
  select * into p from public.ps_planes where id = p_plan for update;
  if not found or not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  if not public.ps_plan_gestiona(p_plan) then raise exception 'Sin permiso: la plantilla del plan la define el administrador o el gestor de la oficina dueña.' using errcode = '42501'; end if;
  v_cfg := public.ps_plan_config_validar(p_config);
  -- Se reemplazan columnas y listas si vienen; lo demás de config (p. ej. vigilancia) se conserva.
  update public.ps_planes set config = config || v_cfg where id = p_plan;
  perform public.ps_evento('plan.config', p_plan, null, null, jsonb_build_object('columnas', v_cfg ? 'columnas', 'listas', v_cfg ? 'listas'));
  return public.ps_plan_config_leer(p_plan);
end;
$$;

/** Reemplaza la lista de pilares del plan. No quita un pilar que usan líneas de una versión publicada. */
create or replace function public.ps_plan_pilares_guardar(p_plan uuid, p_pilares jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  it jsonb;
  i integer := 0;
  v_nombre text;
  v_codigo text;
  v_pil uuid;
  v_vistos text[] := '{}'::text[];
  v_nuevos jsonb := '[]'::jsonb;
  v_usado text;
begin
  select * into p from public.ps_planes where id = p_plan for update;
  if not found or not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  if not public.ps_plan_gestiona(p_plan) then raise exception 'Sin permiso: los pilares del plan los define el administrador o el gestor de la oficina dueña.' using errcode = '42501'; end if;
  if p_pilares is null or jsonb_typeof(p_pilares) <> 'array' or jsonb_array_length(p_pilares) > 30 then
    raise exception 'Los pilares deben ser una lista de hasta 30.' using errcode = '22023';
  end if;
  for it in select * from jsonb_array_elements(p_pilares) loop
    if jsonb_typeof(it) <> 'object' then raise exception 'Cada pilar debe ser un objeto {nombre, codigo, pillar_id, activo}.' using errcode = '22023'; end if;
    v_pil := null;
    begin
      v_pil := nullif(it ->> 'pillar_id', '')::uuid;
    exception when others then
      raise exception 'Un pillar_id no es un identificador válido.' using errcode = '22023';
    end;
    v_nombre := btrim(coalesce(it ->> 'nombre', ''));
    v_codigo := nullif(btrim(coalesce(it ->> 'codigo', '')), '');
    if v_pil is not null then
      if not exists (select 1 from public.pillars where id = v_pil and status = 'publicado') then
        raise exception 'El pilar del PDI indicado no existe o no está publicado.' using errcode = '22023';
      end if;
      if v_nombre = '' then select name into v_nombre from public.pillars where id = v_pil; end if;
      if v_codigo is null then select slug into v_codigo from public.pillars where id = v_pil; end if;
    end if;
    if char_length(v_nombre) < 2 or char_length(v_nombre) > 150 then raise exception 'El nombre de un pilar debe tener entre 2 y 150 caracteres.' using errcode = '22023'; end if;
    if v_codigo is not null and char_length(v_codigo) > 40 then raise exception 'El código de un pilar supera los 40 caracteres.' using errcode = '22023'; end if;
    if public.ps_texto_norm(v_nombre) = any (v_vistos) then raise exception 'El pilar «%» está repetido.', v_nombre using errcode = '22023'; end if;
    v_vistos := v_vistos || public.ps_texto_norm(v_nombre);
    i := i + 1;
    v_nuevos := v_nuevos || jsonb_build_array(jsonb_build_object('orden', i, 'codigo', v_codigo, 'nombre', v_nombre, 'pillar_id', v_pil,
                                                                  'activo', coalesce((it ->> 'activo')::boolean, true)));
  end loop;
  select min(vl.pilar) into v_usado
    from public.ps_version_lineas vl join public.ps_versiones v on v.id = vl.version_id
   where v.plan_id = p_plan and v.estado = 'publicada' and not (public.ps_texto_norm(vl.pilar) = any (v_vistos));
  if v_usado is not null then
    raise exception 'No se puede quitar el pilar «%»: lo usan líneas de una versión publicada.', v_usado using errcode = '23503';
  end if;
  delete from public.ps_plan_pilares where plan_id = p_plan;
  insert into public.ps_plan_pilares (plan_id, orden, codigo, nombre, pillar_id, activo)
  select p_plan, (x ->> 'orden')::integer, x ->> 'codigo', x ->> 'nombre', nullif(x ->> 'pillar_id', '')::uuid, (x ->> 'activo')::boolean
    from jsonb_array_elements(v_nuevos) x;
  perform public.ps_evento('plan.pilares', p_plan, null, null, jsonb_build_object('pilares', i));
  return public.ps_plan_config_leer(p_plan);
end;
$$;

/** {plan, columnas, listas, pilares, pdi} para construir la plantilla y el formulario. */
create or replace function public.ps_plan_config_leer(p_plan uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  v_cfg jsonb;
begin
  select * into p from public.ps_planes where id = p_plan;
  if not found or not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  v_cfg := public.ps_plan_config_efectiva(p_plan);
  return jsonb_build_object(
    'plan', jsonb_build_object('id', p.id, 'nombre', p.nombre, 'oficina_unit_id', p.oficina_unit_id, 'alcance', p.alcance, 'estado', p.estado),
    'columnas', v_cfg -> 'columnas',
    'listas', v_cfg -> 'listas',
    'vigilancia', v_cfg -> 'vigilancia',
    'personalizada', p.config ? 'columnas',
    'pilares', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'orden', x.orden, 'codigo', x.codigo, 'nombre', x.nombre, 'pillar_id', x.pillar_id, 'activo', x.activo) order by x.orden)
                           from public.ps_plan_pilares x where x.plan_id = p_plan), '[]'::jsonb),
    'pdi', jsonb_build_object(
      'pillar_ids', coalesce((select jsonb_agg(x.pillar_id order by x.orden) from public.ps_plan_pilares x where x.plan_id = p_plan and x.pillar_id is not null), '[]'::jsonb),
      'pilares', coalesce((
        select jsonb_agg(jsonb_build_object('pillar_id', pl.id, 'nombre', pl.name, 'areas', coalesce((
          select jsonb_agg(jsonb_build_object('area_id', s.id, 'codigo', s.code, 'nombre', s.name, 'lineas', coalesce((
            select jsonb_agg(jsonb_build_object('linea_id', l.id, 'codigo', l.code, 'nombre', l.name) order by l.position, l.code) from public.action_lines l where l.area_id = s.id), '[]'::jsonb))
            order by s.position, s.code) from public.strategic_areas s where s.pillar_id = pl.id), '[]'::jsonb)) order by x.orden)
          from public.ps_plan_pilares x join public.pillars pl on pl.id = x.pillar_id where x.plan_id = p_plan), '[]'::jsonb)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Métricas, listado de planes y plan activo
-- -----------------------------------------------------------------------------

/** Métricas de un plan para quien pregunta (solo cuentan las oficinas que ve). */
create or replace function public.ps_plan_metricas(p_plan uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  v_ver uuid;
  v_hoy date := public.ps_hoy();
  v_lineas integer := 0;
  v_monto numeric := 0;
  v_act integer;
  v_activas integer;
  v_venc integer;
  v_riesgo integer;
  v_fis numeric;
  v_fin numeric;
  v_val integer;
  v_estados jsonb;
  v_salud text;
begin
  select * into p from public.ps_planes where id = p_plan;
  v_ver := coalesce(p.version_vigente_id, (select id from public.ps_versiones where plan_id = p_plan order by numero desc limit 1));
  if v_ver is not null then
    select count(*), coalesce(sum(monto), 0) into v_lineas, v_monto from public.ps_version_lineas where version_id = v_ver;
  end if;
  with a as (
    select x.id, x.estado, x.fin,
           coalesce((select v.av_fisico from public.ps_avances v where v.actividad_id = x.id and v.estado = 'validado' order by v.revisado_en desc, v.id desc limit 1), 0) as fis,
           (select v.av_financiero from public.ps_avances v where v.actividad_id = x.id and v.estado = 'validado' order by v.revisado_en desc, v.id desc limit 1) as fin_
      from public.ps_actividades x where x.plan_id = p_plan and public.ps_ver_oficina(x.oficina_unit_id))
  select count(*), count(*) filter (where estado <> 'hecho'), count(*) filter (where estado <> 'hecho' and fin < v_hoy),
         count(*) filter (where estado = 'en_riesgo'), round(avg(fis), 1), round(avg(fin_), 1)
    into v_act, v_activas, v_venc, v_riesgo, v_fis, v_fin
    from a;
  select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) into v_estados
    from (select estado, count(*) n from public.ps_actividades x where x.plan_id = p_plan and public.ps_ver_oficina(x.oficina_unit_id) group by estado) q;
  select count(*) into v_val from public.ps_avances v join public.ps_actividades x on x.id = v.actividad_id
   where x.plan_id = p_plan and v.estado = 'pendiente' and public.ps_ver_oficina(x.oficina_unit_id);
  v_salud := case when v_act = 0 then 'sin_datos'
                  when v_activas > 0 and v_venc::numeric / v_activas >= 0.3 then 'rojo'
                  when v_venc > 0 or v_riesgo > 0 or v_val > 0 and exists (
                        select 1 from public.ps_avances v join public.ps_actividades x on x.id = v.actividad_id
                         where x.plan_id = p_plan and v.estado = 'pendiente' and v.reportado_en < now() - interval '72 hours' and public.ps_ver_oficina(x.oficina_unit_id)) then 'amarillo'
                  else 'verde' end;
  return jsonb_build_object('lineas', v_lineas, 'monto', v_monto, 'actividades', coalesce(v_act, 0), 'vencidas', coalesce(v_venc, 0), 'en_riesgo', coalesce(v_riesgo, 0),
    'por_validar', coalesce(v_val, 0), 'avance_fisico', coalesce(v_fis, 0), 'avance_financiero', v_fin, 'salud', v_salud, 'por_estado', v_estados);
end;
$$;

/** Un plan como JSON, con sus métricas. */
create or replace function public.ps_plan_json(p public.ps_planes)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'nombre', p.nombre, 'anio_ini', p.anio_ini, 'anio_fin', p.anio_fin, 'descripcion', p.descripcion, 'estado', p.estado,
    'alcance', p.alcance, 'creado_en', p.creado_en, 'archivado_en', p.archivado_en,
    'oficina', (select jsonb_build_object('unit_id', u.id, 'nombre', u.name, 'codigo', u.code) from public.units u where u.id = p.oficina_unit_id),
    'version_vigente', (select jsonb_build_object('id', v.id, 'numero', v.numero, 'etiqueta', v.etiqueta) from public.ps_versiones v where v.id = p.version_vigente_id),
    'poder', case when public.ps_puede('cargar') then 'admin'
                  else coalesce(public.ps_poder(p.oficina_unit_id), case when public.ps_nivel_actual() in ('lector', 'aprobador', 'financiero') then 'lector' end) end)
    || public.ps_plan_metricas(p.id);
$$;

/** Planes que ve quien pregunta, con métricas. `activo` marca el plan activo de la persona (su preferencia o, si no se ve, el más reciente). */
create or replace function public.ps_planes_visibles()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pref uuid;
  v_act uuid;
begin
  if public.ps_nivel_actual() = 'none' then
    raise exception 'Sin permiso: no tiene acceso a Planeación y Seguimiento.' using errcode = '42501';
  end if;
  select plan_activo into v_pref from public.ps_usuario_pref where perfil_id = auth.uid();
  if v_pref is not null and public.ps_plan_visible(v_pref) then
    v_act := v_pref;
  else
    select p.id into v_act from public.ps_planes p where public.ps_plan_visible(p.id) order by (p.estado = 'activo') desc, p.creado_en desc, p.id limit 1;
  end if;
  return coalesce((
    select jsonb_agg(public.ps_plan_json(p) || jsonb_build_object('activo', p.id = v_act) order by (p.estado = 'activo') desc, p.creado_en desc, p.id)
      from public.ps_planes p where public.ps_plan_visible(p.id)), '[]'::jsonb);
end;
$$;

create or replace function public.ps_plan_activo_guardar(p_plan uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.ps_nivel_actual() = 'none' then
    raise exception 'Sin permiso: no tiene acceso a Planeación y Seguimiento.' using errcode = '42501';
  end if;
  if p_plan is not null and not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  insert into public.ps_usuario_pref (perfil_id, plan_activo, actualizado_en) values (auth.uid(), p_plan, now())
  on conflict (perfil_id) do update set plan_activo = excluded.plan_activo, actualizado_en = excluded.actualizado_en;
  return jsonb_build_object('ok', true, 'plan_activo', p_plan);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Matriz: cargar, publicar y asignar oficina con la plantilla del plan
-- -----------------------------------------------------------------------------

drop function if exists public.ps_cargar_matriz(uuid, jsonb, text);

/**
 * Carga la matriz como borrador de la versión v1.0 con la plantilla del plan (columnas obligatorias, listas, pilares) y la columna
 * «oficina» (id, código o nombre; si falta, la línea hereda la oficina dueña del plan). Quien administra el plan (admin, o el gestor
 * de la oficina dueña de un plan de oficina). Si el plan no tiene oficina, el administrador debe indicarla (p_oficina). Todo o nada.
 */
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
  v_res jsonb;
  v_n integer;
  i integer;
  l jsonb;
  o jsonb;
  c jsonb;
  v_linea uuid;
  v_cruda jsonb;
  v_clave text;
  v_recarga boolean := false;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_admin boolean := public.ps_puede('cargar');
  v_of_plan uuid;
  v_cfg jsonb;
  v_pil jsonb;
  v_pil_def boolean;
  v_of uuid;
  v_txt text;
  v_campo text;
  v_lista jsonb;
  v_canon text;
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
    o := p_lineas -> (i - 1);
    v_pil_def := false;
    if jsonb_typeof(o) = 'object' then
      -- oficina de la línea: la columna «oficina» (o oficina_unit_id) o, si falta, la oficina dueña del plan
      v_txt := coalesce(public.ps_j(o, array['oficina']) #>> '{}', '');
      v_of := null;
      if btrim(v_txt) <> '' then
        v_of := public.ps_resolver_oficina(v_txt);
        if v_of is null then v_err := v_err || public.ps_err(i, 'oficina', format('La oficina «%s» no existe (use su código o su nombre).', left(btrim(v_txt), 60)));
        else o := o || jsonb_build_object('oficina_unit_id', v_of); end if;
      elsif public.ps_j(o, array['oficina_unit_id']) is null and v_of_plan is not null then
        o := o || jsonb_build_object('oficina_unit_id', v_of_plan);
      end if;
      if not v_admin then
        v_of := nullif(o ->> 'oficina_unit_id', '')::uuid;
        if v_of is not null and not public.ps_unidad_bajo(v_of, v_of_plan) then
          v_err := v_err || public.ps_err(i, 'oficina', 'La oficina de la línea debe ser la oficina dueña del plan o una que dependa de ella.');
        end if;
      end if;
      -- columnas no obligatorias que la fila trae vacías: valor neutro para el validador base
      for c in select * from jsonb_array_elements(v_cfg -> 'columnas') loop
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
    v_res := public.ps_normalizar_linea(i, o, v_plan.anio_ini, v_plan.anio_fin);
    v_err := v_err || (v_res -> 'errores');
    l := v_res -> 'linea';
    if l is not null and jsonb_typeof(l) = 'object' then
      -- obligatoriedad y listas de la plantilla del plan
      for c in select * from jsonb_array_elements(v_cfg -> 'columnas') loop
        v_campo := c ->> 'clave';
        if coalesce((c ->> 'obligatoria')::boolean, false) then
          v_txt := l ->> (case v_campo when 'no' then 'clave' when 'oficina' then 'oficina_unit_id' else v_campo end);
          if v_campo not in ('no', 'nombre', 'pilar', 'campus', 'prioridad') and (v_txt is null or btrim(v_txt) = '') then
            v_err := v_err || public.ps_err(i, v_campo, format('La columna «%s» es obligatoria en este plan.', c ->> 'etiqueta'));
          end if;
        end if;
      end loop;
      for v_campo, v_lista in select * from jsonb_each(v_cfg -> 'listas') loop
        v_txt := l ->> v_campo;
        if v_txt is not null and jsonb_array_length(v_lista) > 0 then
          select x into v_canon from jsonb_array_elements_text(v_lista) x where public.ps_texto_norm(x) = public.ps_texto_norm(v_txt) limit 1;
          if v_canon is null then
            v_err := v_err || public.ps_err(i, v_campo, format('«%s» no está en la lista de %s de este plan.', left(v_txt, 60), v_campo));
          else
            l := l || jsonb_build_object(v_campo, v_canon);
          end if;
        end if;
      end loop;
      if v_hay_pilares and not v_pil_def then
        select to_jsonb(pp.nombre) into v_pil from public.ps_plan_pilares pp
         where pp.plan_id = p_plan and pp.activo and (public.ps_texto_norm(pp.nombre) = public.ps_texto_norm(l ->> 'pilar') or lower(pp.codigo) = lower(btrim(l ->> 'pilar')))
         limit 1;
        if v_pil is null then
          v_err := v_err || public.ps_err(i, 'pilar', format('El pilar «%s» no está en la lista de pilares del plan.', left(l ->> 'pilar', 60)));
        else
          l := l || jsonb_build_object('pilar', v_pil #>> '{}');
        end if;
      end if;
    end if;
    v_cruda := case when jsonb_typeof(o) = 'object' then public.ps_j(o, array['clave', 'no']) end;
    v_clave := case when v_cruda is not null and public.ps_j_escalar(v_cruda) then nullif(btrim(v_cruda #>> '{}'), '') end;
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

  delete from public.ps_lineas pl
   where pl.plan_id = p_plan
     and not exists (select 1 from public.ps_version_lineas vl where vl.linea_id = pl.id);

  if v_plan.oficina_unit_id is null then
    update public.ps_planes set oficina_unit_id = v_of_plan where id = p_plan;
  end if;
  perform public.ps_evento(case when v_recarga then 'matriz.recargada' else 'matriz.cargada' end, p_plan, v_ver.id, null,
    jsonb_build_object('etiqueta', v_ver.etiqueta, 'recibidas', v_n, 'aceptadas', v_n, 'nota', v_nota));

  return jsonb_build_object('version_id', v_ver.id, 'etiqueta', v_ver.etiqueta, 'recibidas', v_n, 'aceptadas', v_n, 'errores', '[]'::jsonb);
end;
$$;

/** Asigna (o quita, con NULL) la oficina de una línea en un borrador: quien administra el plan (en un plan de oficina, dentro de su árbol). */
create or replace function public.ps_asignar_oficina_linea(p_version uuid, p_clave text, p_unit uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ver public.ps_versiones%rowtype;
  v_antes uuid;
begin
  select * into v_ver from public.ps_versiones where id = p_version;
  if not found then
    if not public.ps_puede('asignar_oficina') then raise exception 'Sin permiso: asignar la oficina de una línea es del administrador o del gestor de la oficina dueña del plan.' using errcode = '42501'; end if;
    raise exception 'La versión no existe.' using errcode = 'P0002';
  end if;
  if not public.ps_plan_gestiona(v_ver.plan_id) then
    raise exception 'Sin permiso: asignar la oficina de una línea es del administrador o del gestor de la oficina dueña del plan.' using errcode = '42501';
  end if;
  if v_ver.estado <> 'borrador' then
    raise exception 'La oficina solo se asigna en un borrador: la versión % está publicada.', v_ver.etiqueta using errcode = '55000';
  end if;
  if p_unit is not null and not exists (select 1 from public.units where id = p_unit) then
    raise exception 'La unidad indicada no existe.' using errcode = 'P0002';
  end if;
  if p_unit is not null and not public.ps_puede('asignar_oficina')
     and not public.ps_unidad_bajo(p_unit, (select oficina_unit_id from public.ps_planes where id = v_ver.plan_id)) then
    raise exception 'Sin permiso: la oficina de la línea debe ser la dueña del plan o una que dependa de ella.' using errcode = '42501';
  end if;
  select oficina_unit_id into v_antes from public.ps_version_lineas where version_id = p_version and clave = p_clave;
  if not found then
    raise exception 'La línea «%» no está en esta versión.', p_clave using errcode = 'P0002';
  end if;
  update public.ps_version_lineas set oficina_unit_id = p_unit where version_id = p_version and clave = p_clave;
  perform public.ps_evento('linea.oficina_asignada', v_ver.plan_id, p_version, p_clave,
    jsonb_build_object('antes', v_antes, 'despues', p_unit));
  return jsonb_build_object('version_id', p_version, 'clave', p_clave, 'oficina_unit_id', p_unit);
end;
$$;


drop function if exists public.ps_oficinas_visibles(boolean);
drop function if exists public.ps_mis_actividades(boolean);
drop function if exists public.ps_actividades_oficina(uuid, jsonb);
drop function if exists public.ps_avances_por_validar(uuid);
drop function if exists public.ps_riesgos_oficina(uuid, jsonb);
drop function if exists public.ps_resumen_pdi_oficina(uuid);

-- -----------------------------------------------------------------------------
-- 7. Funciones anteriores con p_plan uuid default null (null = como hoy; con varios planes, las lecturas agregan todos)
--    y publicar versión por quien administra el plan
-- -----------------------------------------------------------------------------

/** Publica un borrador: pasa a publicada, queda inmutable y es la vigente del plan. Solo el administrador. */
create or replace function public.ps_publicar_version(p_version uuid, p_nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ver public.ps_versiones%rowtype;
  v_huella text;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_lineas integer;
begin
  select * into v_ver from public.ps_versiones where id = p_version for update;
  if not found then
    if not public.ps_puede('publicar') then raise exception 'Sin permiso: publicar una versión es del administrador o del gestor de la oficina dueña del plan.' using errcode = '42501'; end if;
    raise exception 'La versión no existe.' using errcode = 'P0002';
  end if;
  if not public.ps_plan_gestiona(v_ver.plan_id) then
    raise exception 'Sin permiso: publicar una versión es del administrador o del gestor de la oficina dueña del plan.' using errcode = '42501';
  end if;
  if v_ver.estado <> 'borrador' then
    raise exception 'La versión % ya está publicada.', v_ver.etiqueta using errcode = '55000';
  end if;
  if char_length(v_nota) > 1000 then
    raise exception 'La nota de publicación supera los 1000 caracteres.' using errcode = '22023';
  end if;
  select count(*) into v_lineas from public.ps_version_lineas where version_id = p_version;
  if v_lineas = 0 then
    raise exception 'No se puede publicar una versión sin líneas.' using errcode = '55000';
  end if;
  perform 1 from public.ps_planes where id = v_ver.plan_id for update;
  v_huella := public.ps_huella_version(p_version);
  update public.ps_versiones
     set estado = 'publicada', publicada_en = now(), publicada_por = auth.uid(), huella = v_huella,
         nota = case when v_nota <> '' then v_nota else nota end
   where id = p_version;
  update public.ps_planes set version_vigente_id = p_version where id = v_ver.plan_id;
  perform public.ps_evento('version.publicada', v_ver.plan_id, p_version, null,
    jsonb_build_object('etiqueta', v_ver.etiqueta, 'lineas', v_lineas, 'huella', v_huella, 'nota', v_nota));
  return jsonb_build_object('version_id', p_version, 'etiqueta', v_ver.etiqueta, 'huella', v_huella,
    'lineas', v_lineas, 'publicada_en', (select publicada_en from public.ps_versiones where id = p_version));
end;
$$;


/**
 * Oficinas donde quien pregunta opera (o que ve en lectura), con su poder efectivo.
 * Globales (lector, aprobador, admin): las unidades que participan del plan; con p_todas el admin ve todas.
 * gestor y colaborador: donde tienen pertenencia propia, más las que participan y heredan.
 */
create or replace function public.ps_oficinas_visibles(p_todas boolean default false, p_plan uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nivel text := public.ps_nivel_actual();
begin
  if v_nivel = 'none' then
    raise exception 'Sin permiso: no tiene acceso a Planeación y Seguimiento.' using errcode = '42501';
  end if;
  if p_plan is not null and not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'nombre')
    from (
      select jsonb_build_object(
        'unit_id', u.id, 'codigo', u.code, 'nombre', u.name, 'kind', u.kind, 'parent_id', u.parent_id,
        'poder', public.ps_poder(u.id),
        'unit_role', public.ps_rol_en(auth.uid(), u.id),
        'lineas', (select count(*) from public.ps_planes p join public.ps_version_lineas vl on vl.version_id = p.version_vigente_id where vl.oficina_unit_id = u.id and (p_plan is null or p.id = p_plan)),
        'activas', (select count(*) from public.ps_actividades a where a.oficina_unit_id = u.id and (p_plan is null or a.plan_id = p_plan) and a.estado <> 'hecho'),
        'total', (select count(*) from public.ps_actividades a where a.oficina_unit_id = u.id and (p_plan is null or a.plan_id = p_plan)),
        'vencidas', (select count(*) from public.ps_actividades a where a.oficina_unit_id = u.id and (p_plan is null or a.plan_id = p_plan) and a.estado <> 'hecho' and a.fin < public.ps_hoy())
      ) as x
      from public.units u
      where public.ps_poder(u.id) is not null
        and (
          (p_todas and v_nivel = 'admin')
          or exists (select 1 from public.ps_actividades a where a.oficina_unit_id = u.id and (p_plan is null or a.plan_id = p_plan))
          or exists (select 1 from public.ps_planes p join public.ps_version_lineas vl on vl.version_id = p.version_vigente_id where vl.oficina_unit_id = u.id and (p_plan is null or p.id = p_plan))
          or exists (select 1 from public.unit_members m where m.unit_id = u.id and m.profile_id = auth.uid())
        )
    ) s
  ), '[]'::jsonb);
end;
$$;


/** Mis actividades: las asignadas a quien pregunta. Por omisión, las no hechas. */
create or replace function public.ps_mis_actividades(p_incluir_hechas boolean default false, p_plan uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.ps_nivel_actual() = 'none' then
    raise exception 'Sin permiso: no tiene acceso a Planeación y Seguimiento.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'hoy', public.ps_hoy(),
    'actividades', coalesce((
      select jsonb_agg(public.ps_actividad_json(a) order by a.fin nulls last, a.orden)
        from public.ps_actividades a
       where exists (select 1 from public.ps_asignaciones s where s.actividad_id = a.id and s.profile_id = auth.uid() and s.quitado_en is null)
         and (p_incluir_hechas or a.estado <> 'hecho') and (p_plan is null or a.plan_id = p_plan)
    ), '[]'::jsonb));
end;
$$;


/**
 * Actividades de una oficina con filtros (jsonb, todos opcionales):
 *   estado (texto o lista), prioridad, perfil (uuid, responsable), sin_asignar (bool), linea_clave, campus_id,
 *   vencidas (bool), fin_desde, fin_hasta (AAAA-MM-DD), q (texto en el título), incluir_subunidades (bool), limite (≤ 1000),
 *   pdi (con_pdi | sin_pdi | sin_definir), pillar_id (conectadas con ese pilar del PDI).
 */
create or replace function public.ps_actividades_oficina(p_unit uuid, p_filtros jsonb default '{}'::jsonb, p_plan uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_poder text := public.ps_poder(p_unit);
  v_estados text[];
  v_prior text[];
  v_perfil uuid;
  v_campus uuid;
  v_desde date; v_hasta date;
  v_pdi text := nullif(f ->> 'pdi', '');
  v_pilar uuid;
  v_plan uuid := p_plan;
  v_q text := lower(btrim(coalesce(f ->> 'q', '')));
  v_lim integer := 500;
  v_sub boolean := coalesce(f ->> 'incluir_subunidades', 'false') = 'true';
  v_total integer;
  v_lista jsonb;
  v_ids uuid[];
begin
  if v_poder is null then
    raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501';
  end if;
  if jsonb_typeof(f) <> 'object' then
    raise exception 'Los filtros deben ser un objeto.' using errcode = '22023';
  end if;
  begin
    v_estados := case jsonb_typeof(f -> 'estado') when 'string' then array[f ->> 'estado']
                 when 'array' then (select array_agg(x) from jsonb_array_elements_text(f -> 'estado') as x) end;
    v_prior := case jsonb_typeof(f -> 'prioridad') when 'string' then array[f ->> 'prioridad']
               when 'array' then (select array_agg(x) from jsonb_array_elements_text(f -> 'prioridad') as x) end;
    v_perfil := nullif(f ->> 'perfil', '')::uuid;
    v_campus := nullif(f ->> 'campus_id', '')::uuid;
    v_desde := nullif(f ->> 'fin_desde', '')::date;
    v_hasta := nullif(f ->> 'fin_hasta', '')::date;
    v_pilar := nullif(f ->> 'pillar_id', '')::uuid;
    v_plan := coalesce(p_plan, nullif(f ->> 'plan_id', '')::uuid);
    if v_pdi is not null and v_pdi not in ('con_pdi', 'sin_pdi', 'sin_definir') then raise exception 'pdi'; end if;
    if f ? 'limite' then v_lim := least(greatest((f ->> 'limite')::integer, 1), 1000); end if;
  exception when others then
    raise exception 'Algún filtro tiene un valor inválido.' using errcode = '22023';
  end;

  select coalesce(array_agg(x.id order by x.fin nulls last, x.orden), '{}'::uuid[]) into v_ids
    from (
      select a.id, a.fin, a.orden
        from public.ps_actividades a
       where (a.oficina_unit_id = p_unit
              or (v_sub and a.oficina_unit_id in (
                    with recursive d as (select id from public.units where id = p_unit
                                         union all select u.id from public.units u join d on u.parent_id = d.id)
                    select id from d)))
         and public.ps_ver_oficina(a.oficina_unit_id)
         and (v_estados is null or a.estado = any (v_estados))
         and (v_prior is null or a.prioridad = any (v_prior))
         and (v_perfil is null or exists (select 1 from public.ps_asignaciones s where s.actividad_id = a.id and s.profile_id = v_perfil and s.quitado_en is null))
         and (coalesce(f ->> 'sin_asignar', 'false') <> 'true' or not exists (select 1 from public.ps_asignaciones s where s.actividad_id = a.id and s.quitado_en is null))
         and (nullif(f ->> 'linea_clave', '') is null or a.linea_id = (select l.id from public.ps_lineas l where l.plan_id = a.plan_id and l.clave = f ->> 'linea_clave'))
         and (v_campus is null or a.campus_id = v_campus)
         and (coalesce(f ->> 'vencidas', 'false') <> 'true' or (a.estado <> 'hecho' and a.fin < public.ps_hoy()))
         and (v_desde is null or a.fin >= v_desde)
         and (v_hasta is null or a.fin <= v_hasta)
         and (v_q = '' or position(v_q in lower(a.titulo)) > 0)
         and (v_pdi is null or a.pdi_conexion = v_pdi)
         and (v_plan is null or a.plan_id = v_plan)
         and (v_pilar is null or exists (select 1 from public.ps_actividad_pdi x where x.actividad_id = a.id and x.pillar_id = v_pilar))
    ) x;
  v_total := cardinality(v_ids);
  v_ids := v_ids[1:v_lim];
  select coalesce(jsonb_agg(public.ps_actividad_json(a) order by array_position(v_ids, a.id)), '[]'::jsonb) into v_lista
    from public.ps_actividades a where a.id = any (v_ids);
  return jsonb_build_object(
    'oficina', (select jsonb_build_object('unit_id', u.id, 'nombre', u.name, 'codigo', u.code, 'poder', v_poder) from public.units u where u.id = p_unit),
    'total', v_total, 'actividades', v_lista);
end;
$$;


/** Los avances pendientes de revisión (más antiguo primero). p_unit nulo = todas las oficinas donde quien llama es gestor (o admin). */
create or replace function public.ps_avances_por_validar(p_unit uuid default null, p_plan uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nivel text := public.ps_nivel_actual();
begin
  if v_nivel not in ('gestor', 'admin') then
    raise exception 'Sin permiso: los avances por validar son del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if p_unit is not null and coalesce(public.ps_poder(p_unit) in ('admin', 'gestor'), false) is not true then
    raise exception 'Sin permiso: esa oficina no está a su cargo.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.ps_avance_json(v) || jsonb_build_object(
      'actividad', jsonb_build_object('id', a.id, 'titulo', a.titulo, 'oficina', (select u.name from public.units u where u.id = a.oficina_unit_id), 'fin', a.fin),
      'horas_esperando', round((extract(epoch from (now() - v.reportado_en)) / 3600)::numeric, 1),
      'puede_validar', public.ps_motivo_no_revisa(v.reportado_por, a.oficina_unit_id) is null) order by v.reportado_en, v.id)
      from public.ps_avances v
      join public.ps_actividades a on a.id = v.actividad_id
     where v.estado = 'pendiente'
       and (p_unit is null or a.oficina_unit_id = p_unit)
       and (p_plan is null or a.plan_id = p_plan)
       and public.ps_poder(a.oficina_unit_id) in ('admin', 'gestor')), '[]'::jsonb);
end;
$$;


/** Riesgos de una oficina con sus acciones. Filtros: nivel, estado, actividad_id. Primero los más graves. */
create or replace function public.ps_riesgos_oficina(p_unit uuid, p_filtros jsonb default '{}'::jsonb, p_plan uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_nivel text;
  v_estado text;
  v_act uuid;
  v_lista jsonb;
  v_total integer;
begin
  if public.ps_poder(p_unit) is null then
    raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501';
  end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'Los filtros deben ser un objeto.' using errcode = '22023'; end if;
  begin
    v_nivel := nullif(f ->> 'nivel', '');
    v_estado := nullif(f ->> 'estado', '');
    v_act := nullif(f ->> 'actividad_id', '')::uuid;
    if v_nivel is not null then
      v_nivel := case public.ps_texto_norm(v_nivel) when 'critico' then 'Crítico' when 'alto' then 'Alto' when 'medio' then 'Medio' when 'bajo' then 'Bajo' else null end;
      if v_nivel is null then raise exception 'nivel'; end if;
    end if;
    if v_estado is not null and v_estado not in ('abierto', 'mitigando', 'cerrado') then raise exception 'estado'; end if;
  exception when others then
    raise exception 'Algún filtro tiene un valor inválido.' using errcode = '22023';
  end;
  select count(*) into v_total from public.ps_riesgos r
   where r.oficina_unit_id = p_unit and (p_plan is null or exists (select 1 from public.ps_actividades a2 where a2.id = r.actividad_id and a2.plan_id = p_plan)) and (v_nivel is null or r.nivel = v_nivel) and (v_estado is null or r.estado = v_estado) and (v_act is null or r.actividad_id = v_act);
  select coalesce(jsonb_agg(public.ps_riesgo_json(r) || jsonb_build_object('actividad', (select a.titulo from public.ps_actividades a where a.id = r.actividad_id))
         order by (r.estado = 'cerrado'), case r.nivel when 'Crítico' then 1 when 'Alto' then 2 when 'Medio' then 3 else 4 end, r.creado_en desc, r.id), '[]'::jsonb)
    into v_lista
    from public.ps_riesgos r
   where r.oficina_unit_id = p_unit and (p_plan is null or exists (select 1 from public.ps_actividades a2 where a2.id = r.actividad_id and a2.plan_id = p_plan)) and (v_nivel is null or r.nivel = v_nivel) and (v_estado is null or r.estado = v_estado) and (v_act is null or r.actividad_id = v_act);
  return jsonb_build_object('total', v_total, 'riesgos', v_lista);
end;
$$;


/** Cuántas actividades de la oficina están conectadas con el PDI, no lo están o no se han definido, y por pilar. */
create or replace function public.ps_resumen_pdi_oficina(p_unit uuid, p_plan uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.ps_poder(p_unit) is null then
    raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'con_pdi', (select count(*) from public.ps_actividades a where a.oficina_unit_id = p_unit and (p_plan is null or a.plan_id = p_plan) and a.pdi_conexion = 'con_pdi'),
    'sin_pdi', (select count(*) from public.ps_actividades a where a.oficina_unit_id = p_unit and (p_plan is null or a.plan_id = p_plan) and a.pdi_conexion = 'sin_pdi'),
    'sin_definir', (select count(*) from public.ps_actividades a where a.oficina_unit_id = p_unit and (p_plan is null or a.plan_id = p_plan) and a.pdi_conexion = 'sin_definir'),
    'por_pilar', coalesce((
      select jsonb_agg(jsonb_build_object('pillar_id', x.id, 'nombre', x.name, 'actividades', x.n) order by x.pos, x.name)
        from (select p.id, p.name, p.position as pos, count(distinct a.id) as n
                from public.ps_actividad_pdi d
                join public.ps_actividades a on a.id = d.actividad_id and a.oficina_unit_id = p_unit and (p_plan is null or a.plan_id = p_plan)
                join public.pillars p on p.id = d.pillar_id
               group by p.id, p.name, p.position) x), '[]'::jsonb));
end;
$$;


/**
 * Crea una actividad en una oficina. p_datos: titulo, descripcion, linea_clave, campus_id (o campus por nombre),
 * prioridad, inicio, fin, es_hito, responsables (lista de ids de perfil o correos), pdi ({conexion, items}: obligatorio). Solo gestor y admin.
 * Devuelve {ok:true, actividad} o, si algún responsable tiene otro campus y no se confirmó,
 * {ok:false, requiere_confirmacion:true, conflictos_campus:[…]} sin crear nada.
 */
create or replace function public.ps_actividad_crear(p_plan uuid, p_unit uuid, p_datos jsonb, p_confirmar_campus boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
  v_plan public.ps_planes%rowtype;
  v_n jsonb;
  v_id uuid;
begin
  if v_poder is null or v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: crear actividades es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  select * into v_plan from public.ps_planes where id = p_plan;
  if not found or not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  if v_plan.estado = 'archivado' then raise exception 'El plan está archivado: no admite actividades nuevas.' using errcode = '22023'; end if;
  if v_plan.version_vigente_id is null then
    raise exception 'El plan todavía no tiene una versión vigente: no se pueden crear actividades.' using errcode = '22023';
  end if;
  v_n := public.ps_actividad_normalizar(null, p_datos, p_plan, p_unit, v_poder = 'admin', null, true);
  if jsonb_array_length(v_n -> 'errores') > 0 then
    raise exception '%', (v_n -> 'errores' -> 0 ->> 'mensaje') using errcode = '22023';
  end if;
  if jsonb_array_length(v_n -> 'conflictos') > 0 and not coalesce(p_confirmar_campus, false) then
    return jsonb_build_object('ok', false, 'requiere_confirmacion', true, 'conflictos_campus', v_n -> 'conflictos');
  end if;
  v_id := public.ps_actividad_insertar(p_plan, v_plan.version_vigente_id, p_unit, v_n -> 'datos');
  return jsonb_build_object('ok', true, 'conflictos_campus', v_n -> 'conflictos',
    'actividad', public.ps_actividad_json((select a from public.ps_actividades a where a.id = v_id)));
end;
$$;


/**
 * Carga actividades de una oficina desde filas del Excel. TODO O NADA: con un solo error no se crea nada y se informan
 * todos los errores por fila y campo. Solo gestor de la oficina y admin. Columnas (con alias): titulo (actividad),
 * descripcion (desc), linea (linea_clave, proyecto), campus, prioridad (prior), inicio, fin, hito (es_hito),
 * responsable (responsables, correo: correos separados por ; o ,), pdi («Con PDI» | «Sin conexión», obligatoria), pilar_pdi y linea_pdi
 * (varios separados por ;). Duplicados (mismo título, línea y fin) se rechazan.
 * Devuelve {creadas, recibidas, errores:[{fila, campo, mensaje}], ids}.
 */
create or replace function public.ps_actividades_cargar(p_unit uuid, p_filas jsonb, p_plan uuid default null, p_confirmar_campus boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
  v_plan public.ps_planes%rowtype;
  v_n integer;
  i integer;
  v_err jsonb := '[]'::jsonb;
  v_datos jsonb := '[]'::jsonb;
  v_res jsonb;
  v_d jsonb;
  c jsonb;
  v_vistas jsonb := '{}'::jsonb;
  v_clave text;
  v_ids jsonb := '[]'::jsonb;
  v_id uuid;
  v_planes integer;
begin
  if v_poder is null or v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: cargar actividades es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if p_plan is null then
    select count(*) into v_planes from public.ps_planes where version_vigente_id is not null and estado = 'activo' and public.ps_plan_visible(id);
    if v_planes = 0 then
      return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
        'errores', jsonb_build_array(public.ps_err(null, 'plan', 'No hay un plan con versión vigente.')));
    elsif v_planes > 1 then
      return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
        'errores', jsonb_build_array(public.ps_err(null, 'plan', 'Indique el plan: hay varios planes vigentes.')));
    end if;
    select * into v_plan from public.ps_planes where version_vigente_id is not null and estado = 'activo' and public.ps_plan_visible(id);
  else
    select * into v_plan from public.ps_planes where id = p_plan;
    if not found or not public.ps_plan_visible(p_plan) then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
    if v_plan.estado = 'archivado' then raise exception 'El plan está archivado: no admite actividades nuevas.' using errcode = '22023'; end if;
    if v_plan.version_vigente_id is null then
      return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
        'errores', jsonb_build_array(public.ps_err(null, 'plan', 'El plan todavía no tiene una versión vigente.')));
    end if;
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
      'errores', jsonb_build_array(public.ps_err(null, 'filas', 'Se esperaba una lista con al menos una fila.')));
  end if;
  v_n := jsonb_array_length(p_filas);
  if v_n > 500 then
    return jsonb_build_object('creadas', 0, 'recibidas', v_n, 'ids', '[]'::jsonb,
      'errores', jsonb_build_array(public.ps_err(null, 'filas', 'La carga admite hasta 500 filas.')));
  end if;

  for i in 1 .. v_n loop
    v_res := public.ps_actividad_normalizar(i, p_filas -> (i - 1), v_plan.id, p_unit, v_poder = 'admin', null, true);
    v_err := v_err || (v_res -> 'errores');
    v_d := v_res -> 'datos';
    if jsonb_array_length(v_res -> 'errores') = 0 and v_d is not null then
      if jsonb_array_length(v_res -> 'conflictos') > 0 and not coalesce(p_confirmar_campus, false) then
        for c in select * from jsonb_array_elements(v_res -> 'conflictos') loop
          v_err := v_err || public.ps_err(i, 'responsable', format('%s tiene el campus %s y la actividad es de %s: confirme la asignación para continuar.',
            c ->> 'nombre', c ->> 'campus_miembro', c ->> 'campus_actividad'));
        end loop;
      end if;
      v_clave := public.ps_texto_norm(v_d ->> 'titulo') || '|' || coalesce(v_d ->> 'linea_clave', '') || '|' || coalesce(v_d ->> 'fin', '');
      if v_vistas ? v_clave then
        v_err := v_err || public.ps_err(i, 'titulo', format('Fila repetida: es igual a la fila %s.', v_vistas ->> v_clave));
      else
        v_vistas := v_vistas || jsonb_build_object(v_clave, i);
        if exists (select 1 from public.ps_actividades a
                    where a.oficina_unit_id = p_unit and public.ps_texto_norm(a.titulo) = public.ps_texto_norm(v_d ->> 'titulo')
                      and a.linea_id is not distinct from nullif(v_d ->> 'linea_id', '')::uuid and a.fin is not distinct from nullif(v_d ->> 'fin', '')::date) then
          v_err := v_err || public.ps_err(i, 'titulo', 'Ya existe una actividad igual en la oficina (mismo título, línea y fin).');
        end if;
      end if;
    end if;
    v_datos := v_datos || jsonb_build_array(coalesce(v_d, 'null'::jsonb));
  end loop;

  if jsonb_array_length(v_err) > 0 then
    return jsonb_build_object('creadas', 0, 'recibidas', v_n, 'ids', '[]'::jsonb,
      'errores', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(v_err) as x limit 500) s));
  end if;

  for i in 0 .. v_n - 1 loop
    v_id := public.ps_actividad_insertar(v_plan.id, v_plan.version_vigente_id, p_unit, v_datos -> i);
    v_ids := v_ids || to_jsonb(v_id);
  end loop;
  perform public.ps_evento_act('actividades.cargadas', v_plan.id, v_plan.version_vigente_id, null, null, p_unit, jsonb_build_object('creadas', v_n));
  return jsonb_build_object('creadas', v_n, 'recibidas', v_n, 'errores', '[]'::jsonb, 'ids', v_ids);
end;
$$;


-- -----------------------------------------------------------------------------
-- 8. Visión de todos los planes (administrador; lectura para aprobador, lector y financiero)
-- -----------------------------------------------------------------------------

/** Por oficina dentro de un plan: líneas, actividades, avance físico, vencidas, por validar y salud (solo lo que quien pregunta ve). */
create or replace function public.ps_plan_oficinas_json(p_plan uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.ps_planes%rowtype;
  v_ver uuid;
  v_hoy date := public.ps_hoy();
  u record;
  v_out jsonb := '[]'::jsonb;
  v_l integer; v_a integer; v_act integer; v_v integer; v_pv integer; v_avance numeric; v_salud text;
begin
  select * into p from public.ps_planes where id = p_plan;
  v_ver := coalesce(p.version_vigente_id, (select id from public.ps_versiones where plan_id = p_plan order by numero desc limit 1));
  for u in
    select distinct x.id, x.name, x.code from public.units x
     where x.id in (select vl.oficina_unit_id from public.ps_version_lineas vl where vl.version_id = v_ver and vl.oficina_unit_id is not null
                    union select a.oficina_unit_id from public.ps_actividades a where a.plan_id = p_plan)
       and public.ps_ver_oficina(x.id)
     order by x.name
  loop
    select count(*) into v_l from public.ps_version_lineas vl where vl.version_id = v_ver and vl.oficina_unit_id = u.id;
    select count(*), count(*) filter (where a.estado <> 'hecho'), count(*) filter (where a.estado <> 'hecho' and a.fin < v_hoy),
           round(avg(coalesce((select v.av_fisico from public.ps_avances v where v.actividad_id = a.id and v.estado = 'validado' order by v.revisado_en desc, v.id desc limit 1), 0)), 1)
      into v_a, v_act, v_v, v_avance
      from public.ps_actividades a where a.plan_id = p_plan and a.oficina_unit_id = u.id;
    select count(*) into v_pv from public.ps_avances av join public.ps_actividades a on a.id = av.actividad_id
     where a.plan_id = p_plan and a.oficina_unit_id = u.id and av.estado = 'pendiente';
    v_salud := case when v_a = 0 then 'sin_datos' when v_act > 0 and v_v::numeric / v_act >= 0.3 then 'rojo' when v_v > 0 then 'amarillo' else 'verde' end;
    v_out := v_out || jsonb_build_array(jsonb_build_object('unit_id', u.id, 'nombre', u.name, 'codigo', u.code, 'lineas', v_l, 'actividades', v_a,
      'avance', coalesce(v_avance, 0), 'vencidas', v_v, 'por_validar', v_pv, 'salud', v_salud));
  end loop;
  return v_out;
end;
$$;

/** El tablero sin lo presupuestal (ps_tablero_admin lo completa en 0290). */
create or replace function public.ps_tablero_base(p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_estado text;
  v_of uuid;
  v_anio integer;
  v_salud text;
  p public.ps_planes%rowtype;
  j jsonb;
  v_ver uuid;
  v_planes jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
  v_tot jsonb;
  v_hoy date := public.ps_hoy();
  r record;
  v_n integer;
begin
  if public.ps_nivel_actual() not in ('admin', 'aprobador', 'lector', 'financiero') then
    raise exception 'Sin permiso: el tablero de todos los planes es del administrador (y de lectura para aprobador, lector y financiero).' using errcode = '42501';
  end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'Los filtros deben ser un objeto.' using errcode = '22023'; end if;
  begin
    v_estado := nullif(f ->> 'estado', '');
    v_of := nullif(f ->> 'oficina_unit_id', '')::uuid;
    v_anio := nullif(f ->> 'anio', '')::integer;
    v_salud := nullif(f ->> 'salud', '');
    if v_estado is not null and v_estado not in ('activo', 'archivado') then raise exception 'estado'; end if;
    if v_salud is not null and v_salud not in ('verde', 'amarillo', 'rojo', 'sin_datos') then raise exception 'salud'; end if;
  exception when others then
    raise exception 'Algún filtro tiene un valor inválido.' using errcode = '22023';
  end;

  for p in select * from public.ps_planes x where public.ps_plan_visible(x.id) and (v_estado is null or x.estado = v_estado)
              and (v_anio is null or v_anio between x.anio_ini and x.anio_fin)
              and (v_of is null or x.oficina_unit_id = v_of
                   or exists (select 1 from public.ps_actividades a where a.plan_id = x.id and a.oficina_unit_id = v_of)
                   or exists (select 1 from public.ps_version_lineas vl join public.ps_versiones v on v.id = vl.version_id where v.plan_id = x.id and vl.oficina_unit_id = v_of))
            order by (x.estado = 'activo') desc, x.creado_en desc, x.id loop
    j := public.ps_plan_json(p);
    continue when v_salud is not null and j ->> 'salud' <> v_salud;
    v_ver := coalesce(p.version_vigente_id, (select id from public.ps_versiones where plan_id = p.id order by numero desc limit 1));
    j := j || jsonb_build_object(
      'por_oficina', public.ps_plan_oficinas_json(p.id),
      'por_pilar', coalesce((select jsonb_agg(jsonb_build_object('pilar', q.pilar, 'lineas', q.n, 'monto', q.m) order by q.pilar)
                               from (select vl.pilar, count(*) n, coalesce(sum(vl.monto), 0) m from public.ps_version_lineas vl where vl.version_id = v_ver group by vl.pilar) q), '[]'::jsonb),
      'ritmo_semanas', (
        select coalesce(jsonb_agg(jsonb_build_object('semana', s.d::date, 'avances_validados', coalesce(c.n, 0)) order by s.d), '[]'::jsonb)
          from generate_series(date_trunc('week', v_hoy::timestamp) - interval '11 weeks', date_trunc('week', v_hoy::timestamp), interval '1 week') s (d)
          left join (select date_trunc('week', (av.revisado_en at time zone 'America/Bogota')) as w, count(*) n
                       from public.ps_avances av join public.ps_actividades a on a.id = av.actividad_id
                      where a.plan_id = p.id and av.estado = 'validado' and public.ps_ver_oficina(a.oficina_unit_id) group by 1) c on c.w = s.d));
    v_planes := v_planes || jsonb_build_array(j);

    -- alertas del plan
    if p.estado = 'activo' and p.version_vigente_id is null then
      v_alertas := v_alertas || jsonb_build_array(jsonb_build_object('tipo', 'plan_sin_version', 'plan_id', p.id, 'oficina_unit_id', p.oficina_unit_id,
        'texto', format('El plan «%s» no tiene una versión vigente.', p.nombre), 'severidad', 'media'));
    end if;
    if p.alcance = 'oficina' and p.version_vigente_id is null and p.estado = 'activo' and p.creado_en < now() - interval '30 days' then
      v_alertas := v_alertas || jsonb_build_array(jsonb_build_object('tipo', 'plan_borrador_antiguo', 'plan_id', p.id, 'oficina_unit_id', p.oficina_unit_id,
        'texto', format('El plan de oficina «%s» lleva más de 30 días en borrador.', p.nombre), 'severidad', 'baja'));
    end if;
    for r in select o ->> 'unit_id' as uid, o ->> 'nombre' as nombre, (o ->> 'vencidas')::int as venc, (o ->> 'lineas')::int as lineas
               from jsonb_array_elements(j -> 'por_oficina') o loop
      if r.lineas > 0 and not exists (select 1 from public.ps_gestores_de(r.uid::uuid)) then
        v_alertas := v_alertas || jsonb_build_array(jsonb_build_object('tipo', 'oficina_sin_responsable', 'plan_id', p.id, 'oficina_unit_id', r.uid::uuid,
          'texto', format('La oficina «%s» tiene líneas en «%s» y ningún gestor.', r.nombre, p.nombre), 'severidad', 'alta'));
      end if;
      if r.venc > 5 then
        v_alertas := v_alertas || jsonb_build_array(jsonb_build_object('tipo', 'actividades_vencidas', 'plan_id', p.id, 'oficina_unit_id', r.uid::uuid,
          'texto', format('La oficina «%s» tiene %s actividades vencidas en «%s».', r.nombre, r.venc, p.nombre), 'severidad', 'media'));
      end if;
      select count(*) into v_n from public.ps_avances av join public.ps_actividades a on a.id = av.actividad_id, lateral public.ps_config_efectiva(a.oficina_unit_id) c
       where a.plan_id = p.id and a.oficina_unit_id = r.uid::uuid and av.estado = 'pendiente' and av.reportado_en < now() - make_interval(hours => c.validar_horas);
      if v_n > 0 then
        v_alertas := v_alertas || jsonb_build_array(jsonb_build_object('tipo', 'avances_por_validar_vencidos', 'plan_id', p.id, 'oficina_unit_id', r.uid::uuid,
          'texto', format('%s avances de «%s» esperan validación fuera de plazo en «%s».', v_n, r.nombre, p.nombre), 'severidad', 'media'));
      end if;
    end loop;
  end loop;

  select jsonb_build_object(
    'planes', jsonb_array_length(v_planes),
    'activos', (select count(*) from jsonb_array_elements(v_planes) x where x ->> 'estado' = 'activo'),
    'lineas', coalesce((select sum((x ->> 'lineas')::int) from jsonb_array_elements(v_planes) x), 0),
    'actividades', coalesce((select sum((x ->> 'actividades')::int) from jsonb_array_elements(v_planes) x), 0),
    'vencidas', coalesce((select sum((x ->> 'vencidas')::int) from jsonb_array_elements(v_planes) x), 0),
    'en_riesgo', coalesce((select sum((x ->> 'en_riesgo')::int) from jsonb_array_elements(v_planes) x), 0),
    'por_validar', coalesce((select sum((x ->> 'por_validar')::int) from jsonb_array_elements(v_planes) x), 0),
    'avance_fisico', coalesce((select round(sum((x ->> 'avance_fisico')::numeric * (x ->> 'actividades')::int) / nullif(sum((x ->> 'actividades')::int), 0), 1) from jsonb_array_elements(v_planes) x), 0),
    'avance_financiero', (select round(avg((x ->> 'avance_financiero')::numeric), 1) from jsonb_array_elements(v_planes) x where x ->> 'avance_financiero' is not null),
    'monto', coalesce((select sum((x ->> 'monto')::numeric) from jsonb_array_elements(v_planes) x), 0))
    into v_tot;
  return jsonb_build_object('generado_en', now(), 'totales', v_tot, 'planes', v_planes, 'alertas', v_alertas);
end;
$$;

/** Tablero de todos los planes: totales, por plan (oficinas, estados, pilares, ritmo semanal) y alertas. Filtros: estado, oficina_unit_id, anio, salud. */
create or replace function public.ps_tablero_admin(p_filtros jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.ps_tablero_base(p_filtros);
$$;

-- -----------------------------------------------------------------------------
-- 9. Papel «financiero» (VAF): ps_nivel, ps_puede, ps_poder
-- -----------------------------------------------------------------------------

alter table public.access_roles drop constraint if exists access_roles_ps_nivel;
alter table public.access_roles
  add constraint access_roles_ps_nivel check (ps_nivel in ('none', 'lector', 'colaborador', 'gestor', 'aprobador', 'financiero', 'admin'));

comment on column public.access_roles.ps_nivel is
  'Planeación y Seguimiento (0286, 0289): none · lector · colaborador · gestor · aprobador · financiero · admin. financiero (VAF): ve todos los planes en lectura, evalúa financiación y registra presupuesto; no crea actividades ni valida avances. Exige la pantalla «planeacion_seguimiento».';

create or replace function public.ps_puede(p_accion text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_accion
    when 'ver'             then public.ps_nivel_actual() <> 'none'
    when 'ver_bitacora'    then public.ps_nivel_actual() in ('aprobador', 'admin')
    when 'solicitar'       then public.ps_nivel_actual() in ('gestor', 'admin')
    when 'aprobar'         then public.ps_nivel_actual() = 'aprobador'
    when 'cargar'          then public.ps_nivel_actual() = 'admin'
    when 'publicar'        then public.ps_nivel_actual() = 'admin'
    when 'asignar_oficina' then public.ps_nivel_actual() = 'admin'
    when 'gestionar'       then public.ps_nivel_actual() = 'admin'
    when 'financiero'      then public.ps_nivel_actual() in ('financiero', 'admin')
    else false
  end;
$$;

/** Igual que en 0287, con el financiero como lector global (ve todas las oficinas, no opera ninguna). */
create or replace function public.ps_poder(p_unit uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nivel text := public.ps_nivel_actual();
  v_rol text;
  v_tope integer;
  v_unit integer;
begin
  if v_nivel = 'none' or p_unit is null then return null; end if;
  if v_nivel = 'admin' then
    return case when exists (select 1 from public.units where id = p_unit) then 'admin' else null end;
  end if;
  if not exists (select 1 from public.units where id = p_unit) then return null; end if;
  if v_nivel in ('lector', 'aprobador', 'financiero') then return 'lector'; end if;
  v_rol := public.ps_rol_en(auth.uid(), p_unit);
  if v_rol is null then return null; end if;
  v_tope := case v_nivel when 'gestor' then 3 else 2 end;
  v_unit := case v_rol when 'jefe' then 3 when 'editor' then 2 else 1 end;
  return case least(v_tope, v_unit) when 3 then 'gestor' when 2 then 'colaborador' else 'lector' end;
end;
$$;


-- -----------------------------------------------------------------------------
-- 10. Permisos de ejecución
-- -----------------------------------------------------------------------------

revoke all on function
  public.ps_unidad_bajo(uuid, uuid), public.ps_plan_visible(uuid), public.ps_plan_gestiona(uuid), public.ps_plan_columnas_defecto(),
  public.ps_plan_clave_valida(text), public.ps_plan_config_validar(jsonb), public.ps_plan_config_efectiva(uuid), public.ps_resolver_oficina(text),
  public.ps_plan_metricas(uuid), public.ps_plan_json(public.ps_planes), public.ps_plan_oficinas_json(uuid), public.ps_tablero_base(jsonb),
  public.ps_crear_plan(text, integer, integer), public.ps_crear_plan(text, integer, integer, uuid, text, text, jsonb),
  public.ps_plan_editar(uuid, jsonb), public.ps_plan_archivar(uuid, text), public.ps_plan_reabrir(uuid),
  public.ps_plan_config_guardar(uuid, jsonb), public.ps_plan_pilares_guardar(uuid, jsonb), public.ps_plan_config_leer(uuid),
  public.ps_planes_visibles(), public.ps_plan_activo_guardar(uuid), public.ps_tablero_admin(jsonb),
  public.ps_cargar_matriz(uuid, jsonb, text, uuid),
  public.ps_oficinas_visibles(boolean, uuid), public.ps_mis_actividades(boolean, uuid), public.ps_actividades_oficina(uuid, jsonb, uuid),
  public.ps_avances_por_validar(uuid, uuid), public.ps_riesgos_oficina(uuid, jsonb, uuid), public.ps_resumen_pdi_oficina(uuid, uuid)
  from public, anon, authenticated;

-- Las evalúan las políticas de lectura con el rol de quien consulta.
grant execute on function public.ps_plan_visible(uuid) to authenticated;

grant execute on function
  public.ps_crear_plan(text, integer, integer), public.ps_crear_plan(text, integer, integer, uuid, text, text, jsonb),
  public.ps_plan_editar(uuid, jsonb), public.ps_plan_archivar(uuid, text), public.ps_plan_reabrir(uuid),
  public.ps_plan_config_guardar(uuid, jsonb), public.ps_plan_pilares_guardar(uuid, jsonb), public.ps_plan_config_leer(uuid),
  public.ps_planes_visibles(), public.ps_plan_activo_guardar(uuid), public.ps_tablero_admin(jsonb),
  public.ps_cargar_matriz(uuid, jsonb, text, uuid),
  public.ps_oficinas_visibles(boolean, uuid), public.ps_mis_actividades(boolean, uuid), public.ps_actividades_oficina(uuid, jsonb, uuid),
  public.ps_avances_por_validar(uuid, uuid), public.ps_riesgos_oficina(uuid, jsonb, uuid), public.ps_resumen_pdi_oficina(uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';

