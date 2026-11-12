-- =============================================================================
-- PDI · 0279 · Informes de gestión · responsables, estructuras propias, restablecer y evidencia
--
-- Requiere 0057 (unit_members), 0153, 0192 (informe_gestiona, informe_puede_leer_ciclo),
-- 0272 y 0276. Idempotente. Planeación y la administración (informe_gestiona) gestionan todo.
--
--   1. RESPONSABLES  quién escribe el informe de cada unidad, con su propio usuario. Se asigna
--      y se quita desde el Tablero del ciclo. Cada asignación deja un registro
--      (informe_responsables_log) con el papel que la persona tenía antes, para poder
--      «restablecer» y volver a como estaban las cosas, sin tocar a nadie más.
--   2. ESTRUCTURAS PROPIAS  además de las plantillas A–D, Planeación crea estructuras nuevas
--      (X1, X2…) con las secciones que cada oficina necesita, y elige quién puede usarlas
--      (informe_plantilla_unidades). Sin filas de unidades, la plantilla es de todos.
--   3. RESTABLECER  informe_estructura_restablecer devuelve una plantilla del ciclo a la
--      estructura base: en preparación borra los ajustes (y lo escrito en las secciones libres);
--      con el ciclo abierto solo reactiva las secciones y vuelve a abrirlas a la unidad.
--   4. EVIDENCIA OBLIGATORIA  informe_validar_envio (reescrita de 0276) no deja enviar un informe
--      sin al menos una evidencia o fuente de verificación (informe_anexos). Es la misma regla
--      para toda estructura, propia o no.
--
-- Las plantillas pasan de la lista fija A–D a un patrón (letra o X + números). Lo que ya existe
-- no cambia. Todo DELETE y UPDATE lleva WHERE (ver 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Las plantillas dejan de estar limitadas a A–D
-- -----------------------------------------------------------------------------

alter table public.informe_requisitos drop constraint if exists informe_requisitos_plantilla;
alter table public.informe_requisitos add constraint informe_requisitos_plantilla check (plantilla ~ '^[A-Z][A-Z0-9]{0,2}$');

alter table public.informe_instancias drop constraint if exists informe_instancias_plantilla;
alter table public.informe_instancias add constraint informe_instancias_plantilla check (plantilla ~ '^[A-Z][A-Z0-9]{0,2}$');

alter table public.informe_ejemplos drop constraint if exists informe_ejemplos_plantilla;
alter table public.informe_ejemplos add constraint informe_ejemplos_plantilla check (plantilla is null or plantilla ~ '^[A-Z][A-Z0-9]{0,2}$');

alter table public.informe_secciones_config drop constraint if exists informe_secciones_config_plantilla;
alter table public.informe_secciones_config add constraint informe_secciones_config_plantilla check (plantilla ~ '^[A-Z][A-Z0-9]{0,2}$');

alter table public.informe_datos_requeridos drop constraint if exists informe_datos_req_plantilla;
alter table public.informe_datos_requeridos add constraint informe_datos_req_plantilla check (plantilla ~ '^[A-Z][A-Z0-9]{0,2}$');

-- Los criterios aprobados dicen en qué plantillas se ofrecen; una estructura propia no está en esa lista.
alter table public.informe_criterios drop constraint if exists informe_criterios_plantillas;

-- -----------------------------------------------------------------------------
-- 1. Estructuras propias
-- -----------------------------------------------------------------------------

create table if not exists public.informe_estructuras (
  plantilla    text primary key,
  nombre       text not null,
  quien        text not null default '',
  destino      text not null default '',
  descripcion  text not null default '',
  base         text,
  secciones    jsonb not null default '[]'::jsonb,
  activa       boolean not null default true,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint informe_estructuras_plantilla check (plantilla ~ '^X[0-9]{1,2}$'),
  constraint informe_estructuras_nombre check (char_length(btrim(nombre)) between 3 and 80),
  constraint informe_estructuras_quien check (char_length(quien) <= 120 and char_length(destino) <= 120 and char_length(descripcion) <= 600),
  constraint informe_estructuras_base check (base is null or base in ('A', 'B', 'C', 'D')),
  constraint informe_estructuras_secciones check (jsonb_typeof(secciones) = 'array')
);

comment on table public.informe_estructuras is
  'Estructuras de informe creadas por Planeación (0279), además de las plantillas A–D del código. secciones: [{titulo, tipo, extension?, minimo?, columnas?, dims?, borrador?}]; la clave de cada sección es s1, s2… por posición. Toda estructura lleva una sección «evid».';

/** ¿Es válida la lista de secciones? Tipos conocidos, títulos, al menos una de evidencias y anexos al final. */
create or replace function public.informe_secciones_validas(p_secciones jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  s        jsonb;
  n        integer := 0;
  v_tipos  text[] := array['narr', 'pdi', 'metas', 'dim', 'matriz', 'filas', 'logros', 'evid', 'anexos'];
  v_dims   text[] := array['acad', 'prof', 'cal', 'inv', 'ext', 'fin'];
  v_evid   boolean := false;
  v_ultimo text;
  d        text;
begin
  if jsonb_typeof(p_secciones) is distinct from 'array' then return 'Las secciones deben ser una lista'; end if;
  if jsonb_array_length(p_secciones) < 2 or jsonb_array_length(p_secciones) > 30 then return 'Una estructura lleva entre 2 y 30 secciones'; end if;
  for s in select * from jsonb_array_elements(p_secciones) loop
    n := n + 1;
    if jsonb_typeof(s) is distinct from 'object' then return format('La sección %s no es válida', n); end if;
    if not ((s ->> 'tipo') = any (v_tipos)) then return format('La sección %s tiene un tipo desconocido', n); end if;
    if char_length(btrim(coalesce(s ->> 'titulo', ''))) not between 1 and 120 then return format('La sección %s necesita un título de hasta 120 caracteres', n); end if;
    if (s ->> 'tipo') = 'evid' then v_evid := true; end if;
    if (s ->> 'tipo') = 'dim' and s ? 'dims' then
      if jsonb_typeof(s -> 'dims') is distinct from 'array' then return format('Las dimensiones de la sección %s no son válidas', n); end if;
      for d in select jsonb_array_elements_text(s -> 'dims') loop
        if not (d = any (v_dims)) then return format('La sección %s trae una dimensión desconocida', n); end if;
      end loop;
    end if;
    if s ? 'minimo' and (jsonb_typeof(s -> 'minimo') is distinct from 'number' or (s ->> 'minimo')::numeric not between 0 and 2000) then
      return format('El mínimo de palabras de la sección %s no es válido', n);
    end if;
    v_ultimo := s ->> 'tipo';
  end loop;
  if not v_evid then return 'Toda estructura lleva la sección de evidencias y fuentes de verificación'; end if;
  if (select count(*) from jsonb_array_elements(p_secciones) x where x ->> 'tipo' = 'anexos') > 1 then return 'Solo puede haber una sección de anexos'; end if;
  return null;
end;
$$;

create or replace function public.informe_estructuras_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_error text;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.informe_instancias i where i.plantilla = old.plantilla) then
      raise exception 'La estructura % ya tiene informes abiertos: no se puede eliminar, solo desactivar', old.plantilla using errcode = '23514';
    end if;
    return old;
  end if;
  v_error := public.informe_secciones_validas(new.secciones);
  if v_error is not null then raise exception '%', v_error using errcode = '23514'; end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.secciones is distinct from old.secciones
     and exists (select 1 from public.informe_instancias i where i.plantilla = new.plantilla) then
    raise exception 'La estructura % ya la usan informes abiertos: sus secciones no se pueden cambiar. Duplíquela para hacer una nueva', new.plantilla using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists informe_estructuras_guard_trg on public.informe_estructuras;
create trigger informe_estructuras_guard_trg before insert or update or delete on public.informe_estructuras
  for each row execute function public.informe_estructuras_guard();

/** Al borrar una estructura se van sus ajustes y requisitos (sin informes no hay nada más que cuide). */
create or replace function public.informe_estructuras_baja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('informe.sistema', 'si', true);
  -- Los ajustes de ciclos abiertos o cerrados no se pueden borrar (0276): quedan sin efecto, la estructura ya no existe.
  delete from public.informe_secciones_config k
   using public.informe_ciclos c
   where k.plantilla = old.plantilla and c.id = k.ciclo_id and c.estado = 'preparacion';
  delete from public.informe_requisitos where plantilla = old.plantilla;
  delete from public.informe_plantilla_unidades where plantilla = old.plantilla;
  perform set_config('informe.sistema', '', true);
  return old;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Qué oficinas pueden usar cada plantilla (A–D o propias)
-- -----------------------------------------------------------------------------

create table if not exists public.informe_plantilla_unidades (
  plantilla text not null,
  unit_id   uuid not null references public.units (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint informe_plantilla_unidades_pk primary key (plantilla, unit_id),
  constraint informe_plantilla_unidades_plantilla check (plantilla ~ '^[A-Z][A-Z0-9]{0,2}$')
);

comment on table public.informe_plantilla_unidades is
  'A qué oficinas se limita una plantilla (0279). Sin filas: la pueden usar todas las unidades.';

drop trigger if exists informe_estructuras_baja_trg on public.informe_estructuras;
create trigger informe_estructuras_baja_trg after delete on public.informe_estructuras
  for each row execute function public.informe_estructuras_baja();

/** ¿Puede esta unidad usar esta plantilla? Sin filas, todas; con filas, solo las listadas. */
create or replace function public.informe_plantilla_permitida(p_plantilla text, p_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (select 1 from public.informe_plantilla_unidades u where u.plantilla = p_plantilla) then true
    else exists (select 1 from public.informe_plantilla_unidades u where u.plantilla = p_plantilla and u.unit_id = p_unit)
  end;
$$;

/** Un informe nuevo solo se abre con una plantilla que la unidad puede usar (Planeación puede abrir cualquiera). */
create or replace function public.informe_instancias_plantilla_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.informe_gestiona() then
    return new;
  end if;
  if not public.informe_plantilla_permitida(new.plantilla, new.unit_id) then
    raise exception 'Esa plantilla no está habilitada para esta unidad' using errcode = '42501';
  end if;
  if exists (select 1 from public.informe_estructuras e where e.plantilla = new.plantilla and not e.activa) then
    raise exception 'Esa estructura está desactivada' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists informe_instancias_plantilla_guard_trg on public.informe_instancias;
create trigger informe_instancias_plantilla_guard_trg before insert on public.informe_instancias
  for each row execute function public.informe_instancias_plantilla_guard();

alter table public.informe_estructuras enable row level security;
drop policy if exists informe_estructuras_read on public.informe_estructuras;
create policy informe_estructuras_read on public.informe_estructuras for select to authenticated
  using (public.informe_puede_leer_ciclo());
drop policy if exists informe_estructuras_write on public.informe_estructuras;
create policy informe_estructuras_write on public.informe_estructuras for all to authenticated
  using (public.informe_gestiona()) with check (public.informe_gestiona());
grant select, insert, update, delete on public.informe_estructuras to authenticated;

alter table public.informe_plantilla_unidades enable row level security;
drop policy if exists informe_plantilla_unidades_read on public.informe_plantilla_unidades;
create policy informe_plantilla_unidades_read on public.informe_plantilla_unidades for select to authenticated
  using (public.informe_puede_leer_ciclo());
drop policy if exists informe_plantilla_unidades_write on public.informe_plantilla_unidades;
create policy informe_plantilla_unidades_write on public.informe_plantilla_unidades for all to authenticated
  using (public.informe_gestiona()) with check (public.informe_gestiona());
grant select, insert, update, delete on public.informe_plantilla_unidades to authenticated;

/** Crea (p_plantilla nula) o cambia una estructura propia. p_datos: nombre, quien, destino, descripcion, base, secciones, activa. */
create or replace function public.informe_estructura_guardar(p_plantilla text, p_datos jsonb)
returns public.informe_estructuras
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clave text := p_plantilla;
  v_fila  public.informe_estructuras;
begin
  if not public.informe_gestiona() then
    raise exception 'Solo Planeación gestiona las estructuras de informe' using errcode = '42501';
  end if;
  if v_clave is null then
    select 'X' || (coalesce(max(substring(e.plantilla from 2)::int), 0) + 1) into v_clave from public.informe_estructuras e;
    if v_clave !~ '^X[0-9]{1,2}$' then raise exception 'Ya no caben más estructuras propias' using errcode = '23514'; end if;
    insert into public.informe_estructuras (plantilla, nombre, quien, destino, descripcion, base, secciones, activa, created_by)
    values (
      v_clave,
      coalesce(p_datos ->> 'nombre', ''),
      coalesce(p_datos ->> 'quien', ''),
      coalesce(p_datos ->> 'destino', ''),
      coalesce(p_datos ->> 'descripcion', ''),
      nullif(p_datos ->> 'base', ''),
      coalesce(p_datos -> 'secciones', '[]'::jsonb),
      coalesce((p_datos ->> 'activa')::boolean, true),
      auth.uid()
    ) returning * into v_fila;
  else
    update public.informe_estructuras e set
      nombre      = coalesce(p_datos ->> 'nombre', e.nombre),
      quien       = coalesce(p_datos ->> 'quien', e.quien),
      destino     = coalesce(p_datos ->> 'destino', e.destino),
      descripcion = coalesce(p_datos ->> 'descripcion', e.descripcion),
      secciones   = coalesce(p_datos -> 'secciones', e.secciones),
      activa      = coalesce((p_datos ->> 'activa')::boolean, e.activa)
    where e.plantilla = v_clave
    returning * into v_fila;
    if v_fila.plantilla is null then raise exception 'No existe la estructura %', v_clave using errcode = '23503'; end if;
  end if;
  return v_fila;
end;
$$;

/** Define a qué unidades se limita una plantilla. Lista vacía: todas la pueden usar. */
create or replace function public.informe_plantilla_unidades_guardar(p_plantilla text, p_unidades uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.informe_gestiona() then
    raise exception 'Solo Planeación decide qué oficinas usan cada plantilla' using errcode = '42501';
  end if;
  if p_plantilla !~ '^[A-Z][A-Z0-9]{0,2}$' then raise exception 'Plantilla no válida' using errcode = '23514'; end if;
  delete from public.informe_plantilla_unidades where plantilla = p_plantilla;
  insert into public.informe_plantilla_unidades (plantilla, unit_id)
  select p_plantilla, u.id from public.units u where u.id = any (coalesce(p_unidades, '{}'::uuid[]))
  on conflict do nothing;
  return (select count(*)::int from public.informe_plantilla_unidades where plantilla = p_plantilla);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Restablecer la estructura de una plantilla en un ciclo
-- -----------------------------------------------------------------------------

/**
 * Devuelve una plantilla a su estructura base en el ciclo.
 *   · Ciclo en preparación: borra los ajustes (orden, títulos, secciones libres y lo escrito en ellas).
 *   · Ciclo abierto o cerrado: no se puede borrar nada; reactiva las secciones y las abre a la unidad.
 * Devuelve cuántos ajustes cambió o quitó.
 */
create or replace function public.informe_estructura_restablecer(p_ciclo uuid, p_plantilla text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_n      integer;
begin
  if not public.informe_gestiona() then
    raise exception 'Solo Planeación restablece la estructura de un informe' using errcode = '42501';
  end if;
  select c.estado into v_estado from public.informe_ciclos c where c.id = p_ciclo;
  if v_estado is null then raise exception 'No existe ese ciclo' using errcode = '23503'; end if;
  if v_estado = 'preparacion' then
    delete from public.informe_secciones_config k where k.ciclo_id = p_ciclo and k.plantilla = p_plantilla;
    get diagnostics v_n = row_count;
  else
    update public.informe_secciones_config k set activa = true, editable_por_unidad = true
     where k.ciclo_id = p_ciclo and k.plantilla = p_plantilla and (not k.activa or not k.editable_por_unidad);
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Responsables de cada informe
-- -----------------------------------------------------------------------------

create table if not exists public.informe_responsables_log (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.units (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  rol          public.unit_role not null,
  rol_anterior public.unit_role,
  asignado_por uuid references auth.users (id) on delete set null,
  asignado_en  timestamptz not null default now(),
  constraint informe_responsables_log_unica unique (unit_id, profile_id)
);

comment on table public.informe_responsables_log is
  'Asignaciones de responsables hechas desde Informes (0279). rol_anterior: el papel que la persona tenía en la unidad antes (nulo: no era miembro). Sirve para restablecer.';

alter table public.informe_responsables_log enable row level security;
drop policy if exists informe_responsables_log_read on public.informe_responsables_log;
create policy informe_responsables_log_read on public.informe_responsables_log for select to authenticated
  using (public.informe_gestiona());
grant select on public.informe_responsables_log to authenticated;

/** Quién escribe el informe de una unidad: sus integrantes, con su papel y si los asignó este módulo. */
create or replace function public.informe_responsables(p_unit uuid)
returns table (profile_id uuid, nombre text, correo text, rol text, asignado boolean, asignado_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.informe_gestiona() then
    raise exception 'Solo Planeación ve los responsables de los informes' using errcode = '42501';
  end if;
  return query
    select m.profile_id, coalesce(p.full_name, ''), coalesce(p.email, ''), m.role::text, (l.id is not null), l.asignado_en
      from public.unit_members m
      join public.profiles p on p.id = m.profile_id
      left join public.informe_responsables_log l on l.unit_id = m.unit_id and l.profile_id = m.profile_id
     where m.unit_id = p_unit
     order by case m.role when 'jefe' then 0 when 'editor' then 1 else 2 end, p.full_name;
end;
$$;

/** Busca personas por nombre o correo para asignarlas (solo quienes gestionan los informes). */
create or replace function public.informe_buscar_personas(p_q text)
returns table (id uuid, nombre text, correo text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := '%' || btrim(coalesce(p_q, '')) || '%';
begin
  if not public.informe_gestiona() then
    raise exception 'Solo Planeación asigna responsables' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_q, ''))) < 2 then return; end if;
  return query
    select p.id, coalesce(p.full_name, ''), coalesce(p.email, '')
      from public.profiles p
     where p.full_name ilike v_q or p.email ilike v_q
     order by p.full_name
     limit 15;
end;
$$;

/** Asigna a una persona como responsable de la unidad: jefe = Gestor (diligencia y envía), editor = Contribuyente, visor = Consulta. */
create or replace function public.informe_asignar_responsable(p_unit uuid, p_profile uuid, p_rol text, p_campus uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.unit_role;
  v_rol   public.unit_role;
begin
  if not public.informe_gestiona() then
    raise exception 'Solo Planeación asigna responsables de los informes' using errcode = '42501';
  end if;
  if p_rol not in ('jefe', 'editor', 'visor') then
    raise exception 'El papel debe ser jefe, editor o visor' using errcode = '22023';
  end if;
  v_rol := p_rol::public.unit_role;
  if not exists (select 1 from public.units u where u.id = p_unit) then raise exception 'No existe esa unidad' using errcode = '23503'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile) then raise exception 'No existe esa persona' using errcode = '23503'; end if;

  select m.role into v_antes from public.unit_members m where m.unit_id = p_unit and m.profile_id = p_profile;
  insert into public.unit_members (unit_id, profile_id, role, campus_id)
  values (p_unit, p_profile, v_rol, p_campus)
  on conflict (unit_id, profile_id) do update set role = excluded.role, campus_id = coalesce(excluded.campus_id, public.unit_members.campus_id), updated_at = now();

  -- Se guarda el papel original solo la primera vez: restablecer vuelve a él, no al intermedio.
  insert into public.informe_responsables_log (unit_id, profile_id, rol, rol_anterior, asignado_por)
  values (p_unit, p_profile, v_rol, v_antes, auth.uid())
  on conflict (unit_id, profile_id) do update set rol = excluded.rol, asignado_por = excluded.asignado_por, asignado_en = now();
end;
$$;

/** Quita a un responsable: si lo había asignado este módulo vuelve a su papel anterior (o sale); si ya estaba, se le quita de la unidad. */
create or replace function public.informe_quitar_responsable(p_unit uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.informe_responsables_log;
begin
  if not public.informe_gestiona() then
    raise exception 'Solo Planeación quita responsables de los informes' using errcode = '42501';
  end if;
  select * into v_log from public.informe_responsables_log l where l.unit_id = p_unit and l.profile_id = p_profile;
  if v_log.id is not null and v_log.rol_anterior is not null then
    update public.unit_members set role = v_log.rol_anterior, updated_at = now() where unit_id = p_unit and profile_id = p_profile;
  else
    delete from public.unit_members where unit_id = p_unit and profile_id = p_profile;
  end if;
  delete from public.informe_responsables_log where unit_id = p_unit and profile_id = p_profile;
end;
$$;

/** Restablece los responsables de la unidad: deshace lo asignado desde Informes y deja a todos los demás como estaban. */
create or replace function public.informe_responsables_restablecer(p_unit uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
  l   public.informe_responsables_log;
begin
  if not public.informe_gestiona() then
    raise exception 'Solo Planeación restablece los responsables de los informes' using errcode = '42501';
  end if;
  for l in select * from public.informe_responsables_log x where x.unit_id = p_unit loop
    if l.rol_anterior is not null then
      update public.unit_members set role = l.rol_anterior, updated_at = now() where unit_id = l.unit_id and profile_id = l.profile_id;
    else
      delete from public.unit_members where unit_id = l.unit_id and profile_id = l.profile_id;
    end if;
    v_n := v_n + 1;
  end loop;
  delete from public.informe_responsables_log where unit_id = p_unit;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Evidencia obligatoria para enviar (reescrita de 0276)
-- -----------------------------------------------------------------------------

create or replace function public.informe_validar_envio(p_instancia uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inst    record;
  faltan  text;
begin
  select i.plantilla, i.ciclo_id, c.estado as ciclo_estado, c.config into inst
    from public.informe_instancias i
    join public.informe_ciclos c on c.id = i.ciclo_id
   where i.id = p_instancia;

  if inst.ciclo_estado <> 'abierto' then
    raise exception 'El ciclo no está abierto: no se puede enviar' using errcode = '23514';
  end if;
  if not exists (select 1 from public.informe_secciones s where s.instancia_id = p_instancia) then
    raise exception 'El informe no tiene secciones' using errcode = '23514';
  end if;
  select string_agg(s.clave, ', ' order by s.orden) into faltan
    from public.informe_secciones s
   where s.instancia_id = p_instancia and not s.listo
     and not exists (
       select 1 from public.informe_secciones_config k
        where k.ciclo_id = inst.ciclo_id and k.plantilla = inst.plantilla and k.clave = s.clave and not k.activa
     );
  if faltan is not null then
    raise exception 'Faltan secciones por terminar: %', faltan using errcode = '23514';
  end if;

  -- Evidencias y fuentes de verificación: esenciales y obligatorias en toda estructura.
  if not exists (select 1 from public.informe_anexos a where a.instancia_id = p_instancia) then
    raise exception 'Faltan las evidencias y fuentes de verificación: cargue al menos un archivo o enlace antes de enviar' using errcode = '23514';
  end if;

  if coalesce((inst.config ->> 'exigir_fuente')::boolean, true) then
    select string_agg(x.clave, ', ' order by x.clave) into faltan
      from public.informe_cifras x
     where x.instancia_id = p_instancia and x.incluida and x.propia and btrim(x.fuente_nombre) = '';
    if faltan is not null then
      raise exception 'Falta el nombre de la fuente en: %', faltan using errcode = '23514';
    end if;
  end if;
  if coalesce((inst.config ->> 'exigir_pilar')::boolean, false) then
    select string_agg(x.clave, ', ' order by x.clave) into faltan
      from public.informe_cifras x
     where x.instancia_id = p_instancia and x.incluida and x.propia and coalesce(btrim(x.pilar), '') = '';
    if faltan is not null then
      raise exception 'Falta el pilar del PDI en: %', faltan using errcode = '23514';
    end if;
  end if;

  select string_agg(x.clave, ', ' order by x.clave) into faltan
    from public.informe_requisitos r
    join public.informe_cifras x on x.instancia_id = p_instancia and x.clave = r.clave
   where r.ciclo_id = inst.ciclo_id and r.plantilla = inst.plantilla and r.condicion = 'justificar'
     and (not x.incluida or btrim(x.justificacion) = '')
     and not exists (
       select 1 from public.informe_secciones_config k
        where k.ciclo_id = inst.ciclo_id and k.plantilla = inst.plantilla and k.clave = x.seccion_clave and not k.activa
     );
  if faltan is not null then
    raise exception 'Falta justificar (y dejar incluidas) las cifras: %', faltan using errcode = '23514';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------

do $$
declare f text;
begin
  foreach f in array array[
    'informe_estructura_guardar(text, jsonb)',
    'informe_plantilla_unidades_guardar(text, uuid[])',
    'informe_estructura_restablecer(uuid, text)',
    'informe_responsables(uuid)',
    'informe_buscar_personas(text)',
    'informe_asignar_responsable(uuid, uuid, text, uuid)',
    'informe_quitar_responsable(uuid, uuid)',
    'informe_responsables_restablecer(uuid)',
    'informe_plantilla_permitida(text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
