-- =============================================================================
-- PDI · 0286 · Planeación y Seguimiento · FASE 1 (plan, versiones y matriz)
--
-- Qué es. La capa de base del módulo «Planeación y Seguimiento»
-- (docs/planeacion-seguimiento/DISENO.md): un plan (hoy, el PDIFyT 2027-2035) con
-- sus líneas (los 75 proyectos de la matriz), versiones inmutables y la carga de
-- la matriz como versión v1.0. Esta fase solo cubre lo que necesitan Resumen,
-- Proyectos, Cronograma y Calidad de datos en solo lectura, más cargar y publicar.
-- Actividades, avances, solicitudes de cambio y cortes llegan en las fases 2 a 5.
--
-- ACCESO (la lección de Informes, 0192, y de Gestión Master, 0194). Todo sale del
-- permiso EXPLÍCITO del rol de acceso: access_roles.ps_nivel
-- (none · lector · colaborador · gestor · aprobador · admin) y la pantalla
-- «planeacion_seguimiento». Ninguna política ni función usa
-- has_role_at_least('planeacion') ni la capacidad del rol: un rol con capacidad de
-- Planeación por otro módulo NO entra aquí. Solo la administración general
-- (profiles.role = admin) entra sin rol de acceso, como administrador del módulo.
--
-- CAMPUS. La Universidad maneja campus (Bucaramanga, Valledupar, Cúcuta). Cada línea trae
-- campus_id → campuses(id). NULL = «Todos los campus», igual que
-- unit_members.campus_id (0078). El texto original de la matriz se conserva en
-- campus_texto para trazabilidad.
--
-- ESCRITURA. Ninguna tabla admite escritura directa: todo entra por funciones
-- security definer con search_path fijo, que validan TODO en la base. Una versión
-- publicada y sus filas son inmutables; ps_eventos solo admite INSERT.
--
-- DINERO. ps_version_lineas trae montos: NO es accesible a anon ni a public.
--
-- OBJETOS NUEVOS
--   access_roles.ps_nivel
--   ps_planes, ps_lineas, ps_versiones, ps_version_lineas, ps_eventos
--   ps_nivel_actual, ps_puede
--   ps_crear_plan, ps_cargar_matriz, ps_publicar_version, ps_asignar_oficina_linea
--   ps_diff, ps_resumen_plan, ps_calidad_matriz
--   (internas, sin permiso de ejecución para los clientes: ps_evento, ps_texto_norm,
--    ps_j, ps_j_escalar, ps_err, ps_resolver_campus, ps_normalizar_linea,
--    ps_huella_version, ps_*_guard)
--
-- NO cambia ninguna política existente. Requiere 0002, 0017, 0024, 0057 y 0078.
-- Idempotente. Todo DELETE y UPDATE lleva WHERE (safeupdate, 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nivel en el rol de acceso
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'access_roles' and column_name = 'ps_nivel'
  ) then
    alter table public.access_roles add column ps_nivel text not null default 'none';
  end if;
end $$;

alter table public.access_roles drop constraint if exists access_roles_ps_nivel;
alter table public.access_roles
  add constraint access_roles_ps_nivel check (ps_nivel in ('none', 'lector', 'colaborador', 'gestor', 'aprobador', 'admin'));

comment on column public.access_roles.ps_nivel is
  'Planeación y Seguimiento (0286): none · lector · colaborador · gestor · aprobador · admin. Exige la pantalla «planeacion_seguimiento». Nace en none: ningún rol existente entra. La lista de pantallas (access_roles.screens) es texto libre: no hay lista que extender en la base.';

-- -----------------------------------------------------------------------------
-- 2. La regla de acceso
-- -----------------------------------------------------------------------------

/** El nivel de quien pregunta. Administración general: admin. Sin rol de acceso: nada. */
create or replace function public.ps_nivel_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_role() is null then 'none'
    when public.has_role_at_least('admin') then 'admin'
    when not public.has_access_role() then 'none'
    else coalesce((
      select case when r.all_screens or 'planeacion_seguimiento' = any (r.screens) then r.ps_nivel else 'none' end
        from public.profiles p
        join public.access_roles r on r.id = p.access_role_id
       where p.id = auth.uid() and p.is_active
    ), 'none')
  end;
$$;

/**
 * ¿Puede esta acción?
 *   ver · cualquier nivel                 ver_bitacora · aprobador y admin
 *   cargar, publicar, asignar_oficina, gestionar · admin
 *   solicitar · gestor y admin            aprobar · aprobador
 */
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
    else false
  end;
$$;

comment on function public.ps_puede(text) is
  'Planeación y Seguimiento (0286): el permiso sale del rol de acceso (ps_nivel y la pantalla), nunca de la capacidad global.';

-- -----------------------------------------------------------------------------
-- 3. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.ps_planes (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  anio_ini           smallint not null,
  anio_fin           smallint not null,
  version_vigente_id uuid,
  creado_por         uuid references public.profiles (id) on delete set null,
  creado_en          timestamptz not null default now(),
  constraint ps_planes_nombre check (char_length(btrim(nombre)) between 3 and 120),
  constraint ps_planes_anios check (anio_ini between 2000 and 2100 and anio_fin between anio_ini and 2100)
);

create unique index if not exists ps_planes_nombre_unico on public.ps_planes (lower(btrim(nombre)));

comment on table public.ps_planes is
  'Planeación y Seguimiento (0286): el contenedor de un plan («PDIFyT 2027-2035»). version_vigente_id apunta a la última versión publicada.';

create table if not exists public.ps_lineas (
  id        uuid primary key default gen_random_uuid(),
  plan_id   uuid not null references public.ps_planes (id) on delete restrict,
  clave     text not null,
  creado_en timestamptz not null default now(),
  constraint ps_lineas_clave check (char_length(btrim(clave)) between 1 and 40),
  constraint ps_lineas_unica unique (plan_id, clave)
);

comment on table public.ps_lineas is
  'Planeación y Seguimiento (0286): la identidad estable de una línea del plan entre versiones (la columna «no» de la matriz).';

create table if not exists public.ps_versiones (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.ps_planes (id) on delete restrict,
  numero       integer not null,
  etiqueta     text not null,
  estado       text not null default 'borrador',
  base_id      uuid references public.ps_versiones (id) on delete set null,
  origen       text not null default 'carga_matriz',
  huella       text,
  nota         text not null default '',
  creada_por   uuid references public.profiles (id) on delete set null,
  creada_en    timestamptz not null default now(),
  publicada_en timestamptz,
  publicada_por uuid references public.profiles (id) on delete set null,
  constraint ps_versiones_estado check (estado in ('borrador', 'publicada')),
  constraint ps_versiones_origen check (origen in ('carga_matriz', 'solicitud', 'restauracion')),
  constraint ps_versiones_publicada check ((estado = 'publicada') = (publicada_en is not null)),
  constraint ps_versiones_nota check (char_length(nota) <= 1000),
  constraint ps_versiones_etiqueta unique (plan_id, etiqueta),
  constraint ps_versiones_numero unique (plan_id, numero)
);

-- Un solo borrador abierto por plan.
create unique index if not exists ps_versiones_un_borrador on public.ps_versiones (plan_id) where estado = 'borrador';

comment on table public.ps_versiones is
  'Planeación y Seguimiento (0286): instantáneas del plan (v1.0, v1.1…). Publicada = inmutable. Un solo borrador abierto por plan.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ps_planes_vigente_fk') then
    alter table public.ps_planes
      add constraint ps_planes_vigente_fk foreign key (version_vigente_id) references public.ps_versiones (id) on delete set null;
  end if;
end $$;

create table if not exists public.ps_version_lineas (
  version_id      uuid not null references public.ps_versiones (id) on delete cascade,
  linea_id        uuid not null references public.ps_lineas (id) on delete restrict,
  clave           text not null,
  orden           integer not null default 0,
  clasif          text,
  nombre          text not null,
  descripcion     text,
  campus_id       uuid references public.campuses (id) on delete restrict,
  campus_texto    text,
  pilar           text not null,
  monto           numeric(18, 2),
  prioridad       text not null,
  resultado       text,
  nota_no_eval    text,
  fuente          text,
  criterios       jsonb not null default '{}'::jsonb,
  viabilidad      jsonb not null default '{}'::jsonb,
  inicio          date,
  fin             date,
  pct             jsonb not null default '{}'::jsonb,
  origen          text,
  oficina_unit_id uuid references public.units (id) on delete restrict,
  extra           jsonb not null default '{}'::jsonb,
  primary key (version_id, linea_id),
  constraint ps_vl_clave_unica unique (version_id, clave),
  constraint ps_vl_monto check (monto is null or monto >= 0),
  constraint ps_vl_prioridad check (prioridad in ('Crítico', 'Alto', 'Medio', 'Largo plazo')),
  constraint ps_vl_fechas check (inicio is null or fin is null or fin >= inicio),
  constraint ps_vl_pct_objeto check (jsonb_typeof(pct) = 'object'),
  constraint ps_vl_crit_objeto check (jsonb_typeof(criterios) = 'object' and jsonb_typeof(viabilidad) = 'object' and jsonb_typeof(extra) = 'object')
);

create index if not exists ps_vl_campus_idx on public.ps_version_lineas (campus_id);
create index if not exists ps_vl_oficina_idx on public.ps_version_lineas (oficina_unit_id);
create index if not exists ps_vl_linea_idx on public.ps_version_lineas (linea_id);

comment on table public.ps_version_lineas is
  'Planeación y Seguimiento (0286): la instantánea COMPLETA de cada versión (una fila por línea). Trae montos: cerrada a anon.';
comment on column public.ps_version_lineas.campus_id is
  'Campus de la línea. NULL = «Todos los campus» (igual que unit_members.campus_id, 0078).';
comment on column public.ps_version_lineas.campus_texto is
  'El texto de campus tal como vino en la matriz («Bucaramanga», «Todos»…), para trazabilidad.';
comment on column public.ps_version_lineas.oficina_unit_id is
  'Oficina responsable (units). NULL permitido: el Excel no trae responsables.';
comment on column public.ps_version_lineas.pct is
  'Porcentaje de la inversión por año: {"2027": 0.12, …}. Vacío si no está diligenciado; si lo está, suma 1 (±0.02).';
comment on column public.ps_version_lineas.nota_no_eval is
  'Texto de la matriz que explica por qué una línea no pasa a evaluación (distingue «no aplica todavía» de «pendiente»).';

create table if not exists public.ps_eventos (
  id          bigint generated always as identity primary key,
  tipo        text not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  plan_id     uuid,
  version_id  uuid,
  linea_clave text,
  datos       jsonb not null default '{}'::jsonb,
  creado_en   timestamptz not null default now(),
  constraint ps_eventos_tipo check (char_length(tipo) between 2 and 60)
);

create index if not exists ps_eventos_plan_idx on public.ps_eventos (plan_id, creado_en);
create index if not exists ps_eventos_version_idx on public.ps_eventos (version_id, creado_en);

comment on table public.ps_eventos is
  'Planeación y Seguimiento (0286): bitácora. Solo admite INSERT (un disparador rechaza UPDATE y DELETE).';

-- -----------------------------------------------------------------------------
-- 4. Inmutabilidad
-- -----------------------------------------------------------------------------

create or replace function public.ps_eventos_solo_anexar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Lo único que se permite: que al borrar a una persona su rastro quede sin actor.
  if tg_op = 'UPDATE' and old.actor_id is not null and new.actor_id is null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception 'ps_eventos solo admite INSERT: es el registro de lo que pasó.' using errcode = '42501';
end;
$$;

drop trigger if exists ps_eventos_inmutable on public.ps_eventos;
create trigger ps_eventos_inmutable before update or delete on public.ps_eventos
  for each row execute function public.ps_eventos_solo_anexar();

create or replace function public.ps_versiones_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado = 'publicada' then
    raise exception 'La versión % está publicada y no se puede modificar ni borrar.', old.etiqueta using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists ps_versiones_inmutable on public.ps_versiones;
create trigger ps_versiones_inmutable before update or delete on public.ps_versiones
  for each row execute function public.ps_versiones_guard();

create or replace function public.ps_version_lineas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
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

drop trigger if exists ps_version_lineas_inmutable on public.ps_version_lineas;
create trigger ps_version_lineas_inmutable before insert or update or delete on public.ps_version_lineas
  for each row execute function public.ps_version_lineas_guard();

-- -----------------------------------------------------------------------------
-- 5. Seguridad de filas: solo lectura, por nivel explícito
-- -----------------------------------------------------------------------------

alter table public.ps_planes enable row level security;
alter table public.ps_lineas enable row level security;
alter table public.ps_versiones enable row level security;
alter table public.ps_version_lineas enable row level security;
alter table public.ps_eventos enable row level security;

drop policy if exists ps_planes_lectura on public.ps_planes;
create policy ps_planes_lectura on public.ps_planes for select to authenticated using (public.ps_puede('ver'));

drop policy if exists ps_lineas_lectura on public.ps_lineas;
create policy ps_lineas_lectura on public.ps_lineas for select to authenticated using (public.ps_puede('ver'));

drop policy if exists ps_versiones_lectura on public.ps_versiones;
create policy ps_versiones_lectura on public.ps_versiones for select to authenticated using (public.ps_puede('ver'));

drop policy if exists ps_version_lineas_lectura on public.ps_version_lineas;
create policy ps_version_lineas_lectura on public.ps_version_lineas for select to authenticated using (public.ps_puede('ver'));

drop policy if exists ps_eventos_lectura on public.ps_eventos;
create policy ps_eventos_lectura on public.ps_eventos for select to authenticated using (public.ps_puede('ver_bitacora'));

revoke all on public.ps_planes, public.ps_lineas, public.ps_versiones, public.ps_version_lineas, public.ps_eventos
  from public, anon, authenticated;
grant select on public.ps_planes, public.ps_lineas, public.ps_versiones, public.ps_version_lineas, public.ps_eventos
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Utilidades internas (sin permiso de ejecución para los clientes)
-- -----------------------------------------------------------------------------

create or replace function public.ps_evento(p_tipo text, p_plan uuid, p_version uuid, p_clave text, p_datos jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ps_eventos (tipo, actor_id, plan_id, version_id, linea_clave, datos)
  values (p_tipo, auth.uid(), p_plan, p_version, p_clave, coalesce(p_datos, '{}'::jsonb));
$$;

/** Minúsculas, sin tildes y con espacios colapsados: para comparar nombres de campus. */
create or replace function public.ps_texto_norm(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(translate(lower(btrim(coalesce(p, ''))), 'áéíóúüñ', 'aeiouun'), '\s+', ' ', 'g');
$$;

/** El primer valor no nulo de un objeto jsonb entre varias claves (la clave canónica primero, luego los alias de la matriz). */
create or replace function public.ps_j(p_obj jsonb, p_claves text[])
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  k text;
  v jsonb;
begin
  foreach k in array p_claves loop
    v := p_obj -> k;
    if v is not null and jsonb_typeof(v) <> 'null' then return v; end if;
  end loop;
  return null;
end;
$$;

create or replace function public.ps_j_escalar(p jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p) in ('string', 'number', 'boolean');
$$;

create or replace function public.ps_err(p_fila integer, p_campo text, p_mensaje text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('fila', p_fila, 'campo', p_campo, 'mensaje', p_mensaje);
$$;

/** Resuelve el texto de campus de la matriz contra campuses (nombre, slug o código). {ok, id}: «Todos» da ok con id nulo. */
create or replace function public.ps_resolver_campus(p_texto text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text := public.ps_texto_norm(p_texto);
  v_id uuid;
begin
  if t in ('todos', 'todas', 'todos los campus', 'todos los campuses', 'todas las campus') then
    return jsonb_build_object('ok', true, 'id', null);
  end if;
  select c.id into v_id
    from public.campuses c
   where public.ps_texto_norm(c.name) = t
      or c.slug = replace(t, ' ', '-')
      or public.ps_texto_norm(c.code) = t
   order by c.position
   limit 1;
  if v_id is null then return jsonb_build_object('ok', false, 'id', null); end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

/** La huella (sha256) del contenido de una versión: líneas ordenadas por clave. */
create or replace function public.ps_huella_version(p_version uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(sha256(convert_to(coalesce(
    (select jsonb_agg(to_jsonb(l) - 'version_id' order by l.clave)::text from public.ps_version_lineas l where l.version_id = p_version),
    '[]'), 'UTF8')), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- 7. Validación de una fila de la matriz
-- -----------------------------------------------------------------------------

/**
 * Valida y normaliza una línea de la matriz. Devuelve {errores:[…], linea:{…}}.
 * Acepta los alias de la matriz: no→clave, desc→descripcion, prior→prioridad,
 * res→resultado, crit→criterios, viab→viabilidad, noEvalTexto→nota_no_eval.
 * No inventa ni rellena nada: lo vacío queda vacío.
 */
create or replace function public.ps_normalizar_linea(p_fila integer, p_obj jsonb, p_anio_ini integer, p_anio_fin integer)
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
  k text;
  w jsonb;
  s numeric;
  n integer;
  o_clave text; o_clasif text; o_nombre text; o_desc text; o_campus_texto text; o_pilar text;
  o_fuente text; o_origen text; o_resultado text; o_nota text; o_prior text;
  o_monto numeric; o_campus uuid; o_ini date; o_fin date; o_oficina uuid;
  o_crit jsonb := '{}'::jsonb; o_viab jsonb := '{}'::jsonb; o_pct jsonb := '{}'::jsonb; o_extra jsonb := '{}'::jsonb;
  campo text;
  malo boolean;
  malo2 boolean;
begin
  if p_obj is null or jsonb_typeof(p_obj) <> 'object' then
    return jsonb_build_object('errores', jsonb_build_array(public.ps_err(p_fila, 'fila', 'La fila debe ser un objeto con los campos de la matriz.')), 'linea', null);
  end if;

  -- Textos: (campo canónico, alias, obligatorio, tope)
  -- clave
  v := public.ps_j(p_obj, array['clave', 'no']);
  if v is null then e := e || public.ps_err(p_fila, 'clave', 'La clave es obligatoria.');
  elsif not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'clave', 'La clave debe ser un texto o un número.');
  else
    o_clave := btrim(v #>> '{}');
    if o_clave = '' then e := e || public.ps_err(p_fila, 'clave', 'La clave es obligatoria.');
    elsif char_length(o_clave) > 40 then e := e || public.ps_err(p_fila, 'clave', 'La clave supera los 40 caracteres.'); end if;
  end if;

  -- nombre
  v := public.ps_j(p_obj, array['nombre']);
  if v is null then e := e || public.ps_err(p_fila, 'nombre', 'El nombre es obligatorio.');
  elsif not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'nombre', 'El nombre debe ser un texto.');
  else
    o_nombre := btrim(v #>> '{}');
    if o_nombre = '' then e := e || public.ps_err(p_fila, 'nombre', 'El nombre es obligatorio.');
    elsif char_length(o_nombre) > 300 then e := e || public.ps_err(p_fila, 'nombre', 'El nombre supera los 300 caracteres.'); end if;
  end if;

  -- pilar
  v := public.ps_j(p_obj, array['pilar']);
  if v is null then e := e || public.ps_err(p_fila, 'pilar', 'El pilar es obligatorio.');
  elsif not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'pilar', 'El pilar debe ser un texto.');
  else
    o_pilar := btrim(v #>> '{}');
    if o_pilar = '' then e := e || public.ps_err(p_fila, 'pilar', 'El pilar es obligatorio.');
    elsif char_length(o_pilar) > 150 then e := e || public.ps_err(p_fila, 'pilar', 'El pilar supera los 150 caracteres.'); end if;
  end if;

  -- Textos opcionales con tope
  for campo, k, n in
    select * from (values
      ('clasif', 'clasif', 30), ('descripcion', 'desc', 4000), ('fuente', 'fuente', 200),
      ('origen', 'origen', 200), ('resultado', 'res', 60), ('nota_no_eval', 'noEvalTexto', 1000)
    ) as x (c, a, m)
  loop
    v := public.ps_j(p_obj, array[campo, k]);
    t := null;
    if v is not null then
      if not public.ps_j_escalar(v) then
        e := e || public.ps_err(p_fila, campo, 'Debe ser un texto.');
      else
        t := nullif(btrim(v #>> '{}'), '');
        if t is not null and char_length(t) > n then
          e := e || public.ps_err(p_fila, campo, format('Supera los %s caracteres.', n));
          t := null;
        end if;
      end if;
    end if;
    case campo
      when 'clasif' then o_clasif := t;
      when 'descripcion' then o_desc := t;
      when 'fuente' then o_fuente := t;
      when 'origen' then o_origen := t;
      when 'resultado' then o_resultado := t;
      else o_nota := t;
    end case;
  end loop;

  -- campus: obligatorio y resoluble
  v := public.ps_j(p_obj, array['campus']);
  if v is null or not public.ps_j_escalar(v) or btrim(v #>> '{}') = '' then
    e := e || public.ps_err(p_fila, 'campus', 'El campus es obligatorio (un campus o «Todos»).');
  else
    o_campus_texto := btrim(v #>> '{}');
    r := public.ps_resolver_campus(o_campus_texto);
    if (r ->> 'ok')::boolean then
      o_campus := nullif(r ->> 'id', '')::uuid;
    else
      e := e || public.ps_err(p_fila, 'campus', format('El campus «%s» no existe en la lista de campus del portal.', left(o_campus_texto, 60)));
    end if;
  end if;

  -- monto
  v := public.ps_j(p_obj, array['monto']);
  if v is not null then
    if jsonb_typeof(v) = 'number' or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$') then
      o_monto := btrim(v #>> '{}')::numeric;
      if o_monto < 0 then e := e || public.ps_err(p_fila, 'monto', 'El monto no puede ser negativo.'); o_monto := null; end if;
      if o_monto >= 1e15 then e := e || public.ps_err(p_fila, 'monto', 'El monto es demasiado grande.'); o_monto := null; end if;
    else
      e := e || public.ps_err(p_fila, 'monto', 'El monto debe ser un número (sin símbolos ni separadores de miles).');
    end if;
  end if;

  -- prioridad
  v := public.ps_j(p_obj, array['prioridad', 'prior']);
  if v is null or not public.ps_j_escalar(v) then
    e := e || public.ps_err(p_fila, 'prioridad', 'La prioridad es obligatoria: Crítico, Alto, Medio o Largo plazo.');
  else
    t := public.ps_texto_norm(v #>> '{}');
    o_prior := case t when 'critico' then 'Crítico' when 'alto' then 'Alto' when 'medio' then 'Medio' when 'largo plazo' then 'Largo plazo' end;
    if o_prior is null then
      e := e || public.ps_err(p_fila, 'prioridad', format('La prioridad «%s» no es válida: use Crítico, Alto, Medio o Largo plazo.', left(btrim(v #>> '{}'), 40)));
    end if;
  end if;

  -- fechas
  for campo in select unnest(array['inicio', 'fin']) loop
    v := public.ps_j(p_obj, array[campo]);
    t := null;
    if v is not null then
      malo := case when jsonb_typeof(v) <> 'string' then true else btrim(v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}' end;
      if malo then
        e := e || public.ps_err(p_fila, campo, 'La fecha debe venir como AAAA-MM-DD.');
      else
        begin
          t := left(btrim(v #>> '{}'), 10);
          if campo = 'inicio' then o_ini := t::date; else o_fin := t::date; end if;
          if t::date < date '2000-01-01' or t::date > date '2100-12-31' then
            e := e || public.ps_err(p_fila, campo, 'La fecha está fuera del rango 2000-2100.');
            if campo = 'inicio' then o_ini := null; else o_fin := null; end if;
          end if;
        exception when others then
          e := e || public.ps_err(p_fila, campo, format('«%s» no es una fecha válida.', left(t, 12)));
          if campo = 'inicio' then o_ini := null; else o_fin := null; end if;
        end;
      end if;
    end if;
  end loop;
  if o_ini is not null and o_fin is not null and o_fin < o_ini then
    e := e || public.ps_err(p_fila, 'fin', 'La fecha de fin es anterior a la de inicio.');
  end if;

  -- criterios y viabilidad: objetos de valores escalares (Si/No/vacío)
  for campo, k in select * from (values ('criterios', 'crit'), ('viabilidad', 'viab')) as x (c, a) loop
    v := public.ps_j(p_obj, array[campo, k]);
    w := '{}'::jsonb;
    if v is not null then
      if jsonb_typeof(v) <> 'object' then
        e := e || public.ps_err(p_fila, campo, 'Debe ser un objeto con un valor por criterio.');
      elsif (select count(*) from jsonb_object_keys(v)) > 20 then
        e := e || public.ps_err(p_fila, campo, 'Trae demasiados criterios (máximo 20).');
      elsif exists (select 1 from jsonb_each(v) kv where jsonb_typeof(kv.value) not in ('string', 'number', 'boolean', 'null')
                       or (jsonb_typeof(kv.value) = 'string' and char_length(kv.value #>> '{}') > 40)) then
        e := e || public.ps_err(p_fila, campo, 'Cada criterio debe ser un texto corto (Si, No) o estar vacío.');
      else
        select coalesce(jsonb_object_agg(kv.key, case when jsonb_typeof(kv.value) = 'string' and btrim(kv.value #>> '{}') = '' then 'null'::jsonb else kv.value end), '{}'::jsonb)
          into w from jsonb_each(v) kv;
      end if;
    end if;
    if campo = 'criterios' then o_crit := w; else o_viab := w; end if;
  end loop;

  -- porcentaje por año: años dentro del plan, 0..1, y suma 1 (±0.02) o vacío
  v := public.ps_j(p_obj, array['pct']);
  if v is not null then
    if jsonb_typeof(v) <> 'object' then
      e := e || public.ps_err(p_fila, 'pct', 'Debe ser un objeto {"2027": 0.12, …}.');
    else
      s := 0;
      for k, w in select * from jsonb_each(v) loop
        malo := case when k !~ '^\d{4}$' then true else (k::integer < p_anio_ini or k::integer > p_anio_fin) end;
        malo2 := case when jsonb_typeof(w) <> 'number' then true else ((w #>> '{}')::numeric < 0 or (w #>> '{}')::numeric > 1) end;
        if malo then
          e := e || public.ps_err(p_fila, 'pct', format('El año «%s» está fuera del plan (%s a %s).', left(k, 12), p_anio_ini, p_anio_fin));
        elsif jsonb_typeof(w) = 'null' then
          null;
        elsif malo2 then
          e := e || public.ps_err(p_fila, 'pct', format('El porcentaje de %s debe ser un número entre 0 y 1.', k));
        else
          s := s + (w #>> '{}')::numeric;
          o_pct := o_pct || jsonb_build_object(k, w);
        end if;
      end loop;
      if s = 0 then
        o_pct := '{}'::jsonb;
      elsif abs(s - 1) > 0.02 then
        e := e || public.ps_err(p_fila, 'pct', format('Los porcentajes por año suman %s y deben sumar 1 (tolerancia 0,02).', round(s, 4)));
      end if;
    end if;
  end if;

  -- oficina responsable (opcional)
  v := public.ps_j(p_obj, array['oficina_unit_id']);
  if v is not null then
    malo := case when jsonb_typeof(v) <> 'string' then true else (v #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' end;
    if malo then
      e := e || public.ps_err(p_fila, 'oficina_unit_id', 'Debe ser el identificador (uuid) de una unidad.');
    else
      o_oficina := (v #>> '{}')::uuid;
      if not exists (select 1 from public.units where id = o_oficina) then
        e := e || public.ps_err(p_fila, 'oficina_unit_id', 'La unidad indicada no existe.');
        o_oficina := null;
      end if;
    end if;
  end if;

  -- extra (opcional): objeto pequeño para lo que la matriz trae de más
  v := public.ps_j(p_obj, array['extra']);
  if v is not null then
    if jsonb_typeof(v) <> 'object' or char_length(v::text) > 2000 then
      e := e || public.ps_err(p_fila, 'extra', 'Debe ser un objeto de hasta 2000 caracteres.');
    else
      o_extra := v;
    end if;
  end if;

  if jsonb_array_length(e) > 0 then
    return jsonb_build_object('errores', e, 'linea', null);
  end if;

  return jsonb_build_object('errores', '[]'::jsonb, 'linea', jsonb_build_object(
    'clave', o_clave, 'clasif', o_clasif, 'nombre', o_nombre, 'descripcion', o_desc,
    'campus_id', o_campus, 'campus_texto', o_campus_texto, 'pilar', o_pilar, 'monto', o_monto,
    'prioridad', o_prior, 'resultado', o_resultado, 'nota_no_eval', o_nota, 'fuente', o_fuente,
    'criterios', o_crit, 'viabilidad', o_viab, 'inicio', o_ini, 'fin', o_fin, 'pct', o_pct,
    'origen', o_origen, 'oficina_unit_id', o_oficina, 'extra', o_extra));
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Escritura
-- -----------------------------------------------------------------------------

/** Crea un plan. Solo el administrador del módulo. Devuelve el id. */
create or replace function public.ps_crear_plan(p_nombre text, p_anio_ini integer, p_anio_fin integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  if not public.ps_puede('cargar') then
    raise exception 'Sin permiso: crear un plan es del administrador de Planeación y Seguimiento.' using errcode = '42501';
  end if;
  if char_length(v_nombre) < 3 or char_length(v_nombre) > 120 then
    raise exception 'El nombre del plan debe tener entre 3 y 120 caracteres.' using errcode = '22023';
  end if;
  if p_anio_ini is null or p_anio_fin is null or p_anio_ini < 2000 or p_anio_fin > 2100 or p_anio_fin < p_anio_ini then
    raise exception 'Los años del plan deben estar entre 2000 y 2100 y el final no puede ser anterior al inicial.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ps_planes where lower(btrim(nombre)) = lower(v_nombre)) then
    raise exception 'Ya existe un plan con el nombre «%».', v_nombre using errcode = '23505';
  end if;
  insert into public.ps_planes (nombre, anio_ini, anio_fin, creado_por)
  values (v_nombre, p_anio_ini, p_anio_fin, auth.uid())
  returning id into v_id;
  perform public.ps_evento('plan.creado', v_id, null, null, jsonb_build_object('nombre', v_nombre, 'anio_ini', p_anio_ini, 'anio_fin', p_anio_fin));
  return v_id;
end;
$$;

/**
 * Carga la matriz como borrador de la versión v1.0. Valida TODO en la base.
 * Devuelve {version_id, etiqueta, recibidas, aceptadas, errores:[{fila, campo, mensaje}]}.
 * Con algún error no crea ni cambia nada (aceptadas = 0). Si el plan ya tiene versión
 * vigente no carga: ese camino es la solicitud de cambio (fase 4). Si ya hay un
 * borrador abierto sin vigente, lo reemplaza entero (recarga).
 */
create or replace function public.ps_cargar_matriz(p_plan uuid, p_lineas jsonb, p_nota text default '')
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
  v_linea uuid;
  v_cruda jsonb;
  v_clave text;
  v_recarga boolean := false;
  v_nota text := btrim(coalesce(p_nota, ''));
begin
  if not public.ps_puede('cargar') then
    raise exception 'Sin permiso: cargar la matriz es del administrador de Planeación y Seguimiento.' using errcode = '42501';
  end if;
  select * into v_plan from public.ps_planes where id = p_plan for update;
  if not found then
    raise exception 'El plan no existe.' using errcode = 'P0002';
  end if;
  if char_length(v_nota) > 1000 then
    raise exception 'La nota de la carga supera los 1000 caracteres.' using errcode = '22023';
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

  -- Primera pasada: validar y normalizar cada fila (fila = posición 1-based en la lista).
  for i in 1 .. v_n loop
    v_res := public.ps_normalizar_linea(i, p_lineas -> (i - 1), v_plan.anio_ini, v_plan.anio_fin);
    v_err := v_err || (v_res -> 'errores');
    l := v_res -> 'linea';
    -- La repetición de claves se revisa con la clave cruda, aunque la fila tenga otros errores.
    v_cruda := public.ps_j(p_lineas -> (i - 1), array['clave', 'no']);
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

  -- Segunda pasada: crear (o reemplazar) el borrador y sus filas.
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

  -- Las líneas del plan que ya no estén en ninguna versión (una recarga que quitó claves) se retiran.
  delete from public.ps_lineas pl
   where pl.plan_id = p_plan
     and not exists (select 1 from public.ps_version_lineas vl where vl.linea_id = pl.id);

  perform public.ps_evento(case when v_recarga then 'matriz.recargada' else 'matriz.cargada' end, p_plan, v_ver.id, null,
    jsonb_build_object('etiqueta', v_ver.etiqueta, 'recibidas', v_n, 'aceptadas', v_n, 'nota', v_nota));

  return jsonb_build_object('version_id', v_ver.id, 'etiqueta', v_ver.etiqueta, 'recibidas', v_n, 'aceptadas', v_n, 'errores', '[]'::jsonb);
end;
$$;

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
  if not public.ps_puede('publicar') then
    raise exception 'Sin permiso: publicar una versión es del administrador de Planeación y Seguimiento.' using errcode = '42501';
  end if;
  select * into v_ver from public.ps_versiones where id = p_version for update;
  if not found then
    raise exception 'La versión no existe.' using errcode = 'P0002';
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

/** Asigna (o quita, con NULL) la oficina responsable de una línea. Solo en borrador y solo el administrador. */
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
  if not public.ps_puede('asignar_oficina') then
    raise exception 'Sin permiso: asignar la oficina de una línea es del administrador de Planeación y Seguimiento.' using errcode = '42501';
  end if;
  select * into v_ver from public.ps_versiones where id = p_version;
  if not found then
    raise exception 'La versión no existe.' using errcode = 'P0002';
  end if;
  if v_ver.estado <> 'borrador' then
    raise exception 'La oficina solo se asigna en un borrador: la versión % está publicada.', v_ver.etiqueta using errcode = '55000';
  end if;
  if p_unit is not null and not exists (select 1 from public.units where id = p_unit) then
    raise exception 'La unidad indicada no existe.' using errcode = 'P0002';
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

-- -----------------------------------------------------------------------------
-- 9. Lecturas (security invoker: la seguridad de filas de las tablas sigue vigente)
-- -----------------------------------------------------------------------------

/**
 * Compara dos versiones del mismo plan, campo a campo.
 * {a:{id,etiqueta}, b:{…}, anadidas:[{clave,nombre,monto}], retiradas:[…],
 *  modificadas:[{clave,nombre,cambios:{campo:{antes,despues}}}],
 *  totales:{lineas_a,lineas_b,monto_a,monto_b,variacion_monto,anadidas,retiradas,modificadas}}
 * «Añadidas» son las que están en b y no en a. campus_id y oficina_unit_id van como id.
 */
create or replace function public.ps_diff(p_a uuid, p_b uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  va public.ps_versiones%rowtype;
  vb public.ps_versiones%rowtype;
  campos text[] := array['clasif', 'nombre', 'descripcion', 'campus_id', 'pilar', 'monto', 'prioridad', 'resultado',
                         'nota_no_eval', 'fuente', 'criterios', 'viabilidad', 'inicio', 'fin', 'pct', 'origen', 'oficina_unit_id'];
  v_anad jsonb; v_ret jsonb; v_mod jsonb;
  v_ma numeric; v_mb numeric; v_la integer; v_lb integer;
begin
  if not public.ps_puede('ver') then
    raise exception 'Sin permiso para ver Planeación y Seguimiento.' using errcode = '42501';
  end if;
  select * into va from public.ps_versiones where id = p_a;
  select * into vb from public.ps_versiones where id = p_b;
  if va.id is null or vb.id is null then
    raise exception 'Alguna de las versiones no existe.' using errcode = 'P0002';
  end if;
  if va.plan_id <> vb.plan_id then
    raise exception 'Solo se comparan versiones del mismo plan.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('clave', b.clave, 'nombre', b.nombre, 'monto', b.monto) order by b.orden, b.clave), '[]'::jsonb)
    into v_anad
    from public.ps_version_lineas b
   where b.version_id = p_b and not exists (select 1 from public.ps_version_lineas a where a.version_id = p_a and a.clave = b.clave);

  select coalesce(jsonb_agg(jsonb_build_object('clave', a.clave, 'nombre', a.nombre, 'monto', a.monto) order by a.orden, a.clave), '[]'::jsonb)
    into v_ret
    from public.ps_version_lineas a
   where a.version_id = p_a and not exists (select 1 from public.ps_version_lineas b where b.version_id = p_b and b.clave = a.clave);

  select coalesce(jsonb_agg(jsonb_build_object('clave', x.clave, 'nombre', x.nombre, 'cambios', x.cambios) order by x.orden, x.clave), '[]'::jsonb)
    into v_mod
    from (
      select b.clave, b.nombre, b.orden,
             (select jsonb_object_agg(c, jsonb_build_object('antes', to_jsonb(a) -> c, 'despues', to_jsonb(b) -> c))
                from unnest(campos) c
               where (to_jsonb(a) -> c) is distinct from (to_jsonb(b) -> c)) as cambios
        from public.ps_version_lineas a
        join public.ps_version_lineas b on b.clave = a.clave and b.version_id = p_b
       where a.version_id = p_a
    ) x
   where x.cambios is not null;

  select coalesce(sum(monto), 0), count(*) into v_ma, v_la from public.ps_version_lineas where version_id = p_a;
  select coalesce(sum(monto), 0), count(*) into v_mb, v_lb from public.ps_version_lineas where version_id = p_b;

  return jsonb_build_object(
    'a', jsonb_build_object('id', va.id, 'etiqueta', va.etiqueta, 'estado', va.estado),
    'b', jsonb_build_object('id', vb.id, 'etiqueta', vb.etiqueta, 'estado', vb.estado),
    'anadidas', v_anad, 'retiradas', v_ret, 'modificadas', v_mod,
    'totales', jsonb_build_object(
      'lineas_a', v_la, 'lineas_b', v_lb, 'monto_a', v_ma, 'monto_b', v_mb, 'variacion_monto', v_mb - v_ma,
      'anadidas', jsonb_array_length(v_anad), 'retiradas', jsonb_array_length(v_ret), 'modificadas', jsonb_array_length(v_mod)));
end;
$$;

/**
 * Totales del plan para el Resumen. p_version nula: la vigente; si no hay, el borrador abierto.
 * {plan, version, totales, por_pilar, por_prioridad, por_campus, por_fuente, por_resultado, por_clasif, por_anio}
 * Las claves nulas (fuente, resultado, clasif) agrupan lo que está sin diligenciar: la pantalla las rotula.
 * La inversión por año es monto × pct del año; lo que no tiene pct va aparte en monto_sin_distribuir.
 */
create or replace function public.ps_resumen_plan(p_plan uuid, p_version uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_plan public.ps_planes%rowtype;
  v_ver public.ps_versiones%rowtype;
  v_tot jsonb;
begin
  if not public.ps_puede('ver') then
    raise exception 'Sin permiso para ver Planeación y Seguimiento.' using errcode = '42501';
  end if;
  select * into v_plan from public.ps_planes where id = p_plan;
  if not found then
    raise exception 'El plan no existe.' using errcode = 'P0002';
  end if;
  if p_version is not null then
    select * into v_ver from public.ps_versiones where id = p_version and plan_id = p_plan;
  elsif v_plan.version_vigente_id is not null then
    select * into v_ver from public.ps_versiones where id = v_plan.version_vigente_id;
  else
    select * into v_ver from public.ps_versiones where plan_id = p_plan order by numero desc limit 1;
  end if;
  if v_ver.id is null then
    return jsonb_build_object(
      'plan', jsonb_build_object('id', v_plan.id, 'nombre', v_plan.nombre, 'anio_ini', v_plan.anio_ini, 'anio_fin', v_plan.anio_fin),
      'version', null);
  end if;

  return (
    with l as (
      select vl.*, coalesce(c.name, 'Todos') as campus_nombre
        from public.ps_version_lineas vl
        left join public.campuses c on c.id = vl.campus_id
       where vl.version_id = v_ver.id
    )
    select jsonb_build_object(
      'plan', jsonb_build_object('id', v_plan.id, 'nombre', v_plan.nombre, 'anio_ini', v_plan.anio_ini, 'anio_fin', v_plan.anio_fin),
      'version', jsonb_build_object('id', v_ver.id, 'etiqueta', v_ver.etiqueta, 'estado', v_ver.estado,
                                    'publicada_en', v_ver.publicada_en, 'es_vigente', coalesce(v_plan.version_vigente_id = v_ver.id, false)),
      'totales', jsonb_build_object(
        'lineas', count(*),
        'monto', coalesce(sum(monto), 0),
        'evaluadas', count(*) filter (where resultado is not null),
        'sin_evaluar', count(*) filter (where resultado is null),
        'monto_evaluado', coalesce(sum(monto) filter (where resultado is not null), 0),
        'monto_sin_evaluar', coalesce(sum(monto) filter (where resultado is null), 0),
        'con_oficina', count(*) filter (where oficina_unit_id is not null),
        'sin_oficina', count(*) filter (where oficina_unit_id is null),
        'cobertura_oficina', case when count(*) = 0 then 0 else round(count(*) filter (where oficina_unit_id is not null)::numeric / count(*), 4) end,
        'monto_sin_distribuir', coalesce(sum(monto) filter (where pct = '{}'::jsonb), 0)),
      'por_pilar', (select coalesce(jsonb_agg(jsonb_build_object('pilar', g.k, 'lineas', g.n, 'monto', g.m) order by g.k), '[]'::jsonb)
                      from (select pilar k, count(*) n, coalesce(sum(monto), 0) m from l group by pilar) g),
      'por_prioridad', (select coalesce(jsonb_agg(jsonb_build_object('prioridad', g.k, 'lineas', g.n, 'monto', g.m)
                                                  order by array_position(array['Crítico', 'Alto', 'Medio', 'Largo plazo'], g.k)), '[]'::jsonb)
                          from (select prioridad k, count(*) n, coalesce(sum(monto), 0) m from l group by prioridad) g),
      'por_campus', (select coalesce(jsonb_agg(jsonb_build_object('campus_id', g.cid, 'campus', g.k, 'lineas', g.n, 'monto', g.m) order by g.k), '[]'::jsonb)
                       from (select campus_id cid, campus_nombre k, count(*) n, coalesce(sum(monto), 0) m from l group by campus_id, campus_nombre) g),
      'por_fuente', (select coalesce(jsonb_agg(jsonb_build_object('fuente', g.k, 'lineas', g.n, 'monto', g.m) order by g.m desc, g.k), '[]'::jsonb)
                       from (select fuente k, count(*) n, coalesce(sum(monto), 0) m from l group by fuente) g),
      'por_resultado', (select coalesce(jsonb_agg(jsonb_build_object('resultado', g.k, 'lineas', g.n, 'monto', g.m) order by g.m desc, g.k), '[]'::jsonb)
                          from (select resultado k, count(*) n, coalesce(sum(monto), 0) m from l group by resultado) g),
      'por_clasif', (select coalesce(jsonb_agg(jsonb_build_object('clasif', g.k, 'lineas', g.n, 'monto', g.m) order by g.m desc, g.k), '[]'::jsonb)
                       from (select clasif k, count(*) n, coalesce(sum(monto), 0) m from l group by clasif) g),
      'por_anio', (select jsonb_agg(jsonb_build_object('anio', y, 'monto', coalesce((
                            select round(sum(l2.monto * (l2.pct ->> y::text)::numeric), 2) from l l2 where l2.pct ? y::text), 0)) order by y)
                     from generate_series(v_plan.anio_ini::integer, v_plan.anio_fin::integer) y)
    )
    from l
  );
end;
$$;

/**
 * Vacíos e inconsistencias de una versión, sin inventar ni rellenar nada.
 * {version, resumen:{lineas, lineas_con_hallazgos, hallazgos, por_categoria:{pendiente,no_aplica,inconsistente}, por_campo:{campo:n}},
 *  hallazgos:[{clave, nombre, campo, categoria, detalle}]}
 * Categorías: «pendiente» (falta diligenciarlo), «no_aplica» (la matriz dice que aún no corresponde:
 * la línea no pasa a evaluación y trae su nota) e «inconsistente» (hay dato y se contradice).
 */
create or replace function public.ps_calidad_matriz(p_version uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_ver public.ps_versiones%rowtype;
  v_plan public.ps_planes%rowtype;
begin
  if not public.ps_puede('ver') then
    raise exception 'Sin permiso para ver Planeación y Seguimiento.' using errcode = '42501';
  end if;
  select * into v_ver from public.ps_versiones where id = p_version;
  if not found then
    raise exception 'La versión no existe.' using errcode = 'P0002';
  end if;
  select * into v_plan from public.ps_planes where id = v_ver.plan_id;

  return (
    with l as (
      select vl.*,
             (vl.resultado is not null) as evaluada,
             case when vl.resultado is null and vl.nota_no_eval is not null then 'no_aplica' else 'pendiente' end as cat_vacio,
             (select coalesce(sum((e.value #>> '{}')::numeric), 0) from jsonb_each(vl.pct) e) as suma_pct
        from public.ps_version_lineas vl
       where vl.version_id = p_version
    ),
    h as (
      select clave, nombre, orden, 'resultado' as campo, cat_vacio as categoria,
             case when cat_vacio = 'no_aplica' then 'Sin evaluar: ' || nota_no_eval else 'Sin resultado de evaluación.' end as detalle
        from l where resultado is null
      union all
      select clave, nombre, orden, 'monto', case when monto is null then cat_vacio else 'inconsistente' end,
             case when monto is null then 'Monto sin diligenciar.' else 'Línea evaluada con monto 0.' end
        from l where monto is null or (monto = 0 and evaluada)
      union all
      select clave, nombre, orden, 'monto', cat_vacio, 'Monto 0 en una línea sin evaluar.'
        from l where monto = 0 and not evaluada
      union all
      select clave, nombre, orden, 'fuente', cat_vacio, 'Fuente de financiación sin diligenciar.' from l where fuente is null
      union all
      select clave, nombre, orden, 'criterios', cat_vacio, 'Criterios de evaluación sin diligenciar.'
        from l where not exists (select 1 from jsonb_each(criterios) e where jsonb_typeof(e.value) <> 'null')
      union all
      select clave, nombre, orden, 'criterios', 'inconsistente', 'Tiene criterios diligenciados pero no resultado de evaluación.'
        from l where resultado is null and exists (select 1 from jsonb_each(criterios) e where jsonb_typeof(e.value) <> 'null')
      union all
      select clave, nombre, orden, 'viabilidad', cat_vacio, 'Viabilidad sin diligenciar.'
        from l where not exists (select 1 from jsonb_each(viabilidad) e where jsonb_typeof(e.value) <> 'null')
      union all
      select clave, nombre, orden, 'inicio', cat_vacio, 'Fecha de inicio sin diligenciar.' from l where inicio is null
      union all
      select clave, nombre, orden, 'fin', cat_vacio, 'Fecha de fin sin diligenciar.' from l where fin is null
      union all
      select clave, nombre, orden, 'fin', 'inconsistente', 'La fecha de fin es anterior a la de inicio.' from l where inicio is not null and fin is not null and fin < inicio
      union all
      select clave, nombre, orden, 'inicio', 'inconsistente', format('El inicio (%s) está fuera de los años del plan (%s a %s).', inicio, v_plan.anio_ini, v_plan.anio_fin)
        from l where inicio is not null and extract(year from inicio) not between v_plan.anio_ini and v_plan.anio_fin
      union all
      select clave, nombre, orden, 'fin', 'inconsistente', format('El fin (%s) está fuera de los años del plan (%s a %s).', fin, v_plan.anio_ini, v_plan.anio_fin)
        from l where fin is not null and extract(year from fin) not between v_plan.anio_ini and v_plan.anio_fin
      union all
      select clave, nombre, orden, 'pct', cat_vacio, 'Porcentaje de inversión por año sin diligenciar.' from l where pct = '{}'::jsonb
      union all
      select clave, nombre, orden, 'pct', 'inconsistente', format('Los porcentajes por año suman %s y deben sumar 1.', round(suma_pct, 4))
        from l where pct <> '{}'::jsonb and abs(suma_pct - 1) > 0.02
      union all
      select clave, nombre, orden, 'oficina_unit_id', cat_vacio, 'Sin oficina responsable asignada.' from l where oficina_unit_id is null
    )
    select jsonb_build_object(
      'version', jsonb_build_object('id', v_ver.id, 'etiqueta', v_ver.etiqueta, 'estado', v_ver.estado),
      'resumen', jsonb_build_object(
        'lineas', (select count(*) from l),
        'lineas_con_hallazgos', (select count(distinct clave) from h),
        'hallazgos', (select count(*) from h),
        'por_categoria', jsonb_build_object(
          'pendiente', (select count(*) from h where categoria = 'pendiente'),
          'no_aplica', (select count(*) from h where categoria = 'no_aplica'),
          'inconsistente', (select count(*) from h where categoria = 'inconsistente')),
        'por_campo', (select coalesce(jsonb_object_agg(pc.campo, pc.n), '{}'::jsonb) from (select campo, count(*) n from h group by campo) pc)),
      'hallazgos', (select coalesce(jsonb_agg(jsonb_build_object('clave', clave, 'nombre', nombre, 'campo', campo, 'categoria', categoria, 'detalle', detalle)
                                              order by orden, campo), '[]'::jsonb) from h))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Permisos de ejecución
-- -----------------------------------------------------------------------------

revoke all on function
  public.ps_nivel_actual(), public.ps_puede(text),
  public.ps_evento(text, uuid, uuid, text, jsonb), public.ps_texto_norm(text), public.ps_j(jsonb, text[]),
  public.ps_j_escalar(jsonb), public.ps_err(integer, text, text), public.ps_resolver_campus(text),
  public.ps_huella_version(uuid), public.ps_normalizar_linea(integer, jsonb, integer, integer),
  public.ps_eventos_solo_anexar(), public.ps_versiones_guard(), public.ps_version_lineas_guard(),
  public.ps_crear_plan(text, integer, integer), public.ps_cargar_matriz(uuid, jsonb, text),
  public.ps_publicar_version(uuid, text), public.ps_asignar_oficina_linea(uuid, text, uuid),
  public.ps_diff(uuid, uuid), public.ps_resumen_plan(uuid, uuid), public.ps_calidad_matriz(uuid)
  from public, anon, authenticated;

grant execute on function
  public.ps_nivel_actual(), public.ps_puede(text),
  public.ps_crear_plan(text, integer, integer), public.ps_cargar_matriz(uuid, jsonb, text),
  public.ps_publicar_version(uuid, text), public.ps_asignar_oficina_linea(uuid, text, uuid),
  public.ps_diff(uuid, uuid), public.ps_resumen_plan(uuid, uuid), public.ps_calidad_matriz(uuid)
  to authenticated;
grant execute on function public.ps_nivel_actual(), public.ps_puede(text) to service_role;
