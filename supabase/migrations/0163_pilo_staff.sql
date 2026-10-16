-- =============================================================================
-- 0163 · El personal de Mr. Pilo (pilo_staff)
--
-- Porta al repositorio el trabajo hecho directamente en el servidor el
-- 14 de octubre de 2026 (la tabla y estas funciones vivían solo allí, sin
-- migración). La función edge `pilo-staff` (invitar y quitar personal) y la
-- autorización de `pilo_staff_role()` son el mismo par que usaba la base.
--
--   pilo_staff   el personal administrativo de Pilo: docencia (documentos de
--                «ensenanza»), institucional («planeacion»), ambos o admin.
--                No tiene perfil de PDI: la función crea la cuenta con
--                pilo_staff='true' en sus metadatos y handle_new_user se salta
--                el perfil. Cada persona lee su fila; el admin, todo.
--
--   Funciones:  pilo_is_service, pilo_staff_role (la fila activa de la
--               persona, o admin si es admin activo de PDI), pilo_is_admin,
--               pilo_staff_other_admins (los admins activos de Pilo y de PDI),
--               pilo_staff_check_insert (la cuenta existe, su correo coincide
--               y no es Usuario de Pilo), pilo_staff_keep_admin (el último
--               admin activo no se quita), pilo_staff_remove_row (solo la
--               función edge, con la clave de servicio), pilo_staff_list y
--               pilo_staff_set (la administración ve y cambia el personal) y
--               pilo_staff_touch (la última vez que una persona estuvo).
--
-- Además repara handle_new_user (0162): el salto de perfil debe reconocer
-- también pilo_staff='true' — sin esto, una invitación del personal caería en
-- la lista de acceso y nacería con un perfil invitado inactivo en vez de sin
-- perfil, y «quitar» no sabría si debe borrar la cuenta.
--
-- Requiere 0162 (handle_new_user, access_roles) y las tablas de Pilo (0094+).
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La tabla
-- -----------------------------------------------------------------------------

create table if not exists public.pilo_staff (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  role         text not null check (role in ('docencia', 'institucional', 'ambos', 'admin')),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  constraint pilo_staff_email_check check (email = lower(email) and char_length(email) between 5 and 160),
  constraint pilo_staff_name_check check (char_length(full_name) <= 120)
);

comment on table public.pilo_staff is
  'Mr. Pilo: el personal administrativo de Pilo (docencia, institucional, ambos, admin). Aparte de profiles: no tienen perfil de PDI. Cada persona lee su fila; el admin lee y escribe todo. Las altas las hace la función pilo-staff.';

comment on column public.pilo_staff.role is
  'docencia = documentos de «ensenanza»; institucional = de «planeacion»; ambos = los dos; admin = todo.';

create unique index if not exists pilo_staff_email_idx on public.pilo_staff (email);
create index if not exists pilo_staff_role_idx on public.pilo_staff (role, active);

alter table public.pilo_staff enable row level security;
revoke all on public.pilo_staff from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Las funciones
-- -----------------------------------------------------------------------------

-- ¿Quién llama: la función edge con la clave de servicio?
create or replace function public.pilo_is_service()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') = 'service_role' or current_user = 'service_role'
$$;

-- El rol en el personal de Pilo: la fila activa de quien pregunta, o admin si es admin activo de PDI.
create or replace function public.pilo_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.role from public.pilo_staff s where s.user_id = auth.uid() and s.active),
    case when public.has_role_at_least('admin') then 'admin' end
  )
$$;

create or replace function public.pilo_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.pilo_staff_role() = 'admin', false)
$$;

-- Los demás administradores activos: los de Pilo y los de PDI que no son a la vez personal.
create or replace function public.pilo_staff_other_admins(p_exclude uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from (
    select s.user_id as id from public.pilo_staff s
    where s.active and s.role = 'admin' and s.user_id is distinct from p_exclude
    union
    select p.id from public.profiles p
    where p.role = 'admin' and p.is_active and p.id is distinct from p_exclude
      and not exists (select 1 from public.pilo_staff s2 where s2.user_id = p.id and s2.active)
  ) x
$$;

-- La cuenta existe, su correo coincide y no es un Usuario de Pilo.
create or replace function public.pilo_staff_check_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from auth.users a where a.id = new.user_id and lower(a.email) = new.email) then
    raise exception 'Esa cuenta no existe o su correo no coincide.' using errcode = '23514';
  end if;
  if exists (select 1 from public.pilo_users u where u.id = new.user_id) then
    raise exception 'Esa cuenta es un Usuario de Pilo: no puede ser personal.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- El último administrador activo de Pilo no se quita ni se degrada.
create or replace function public.pilo_staff_keep_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and old.user_id = auth.uid() and old.active and old.role = 'admin' then
    -- Un solo cambio de admins a la vez: dos últimos admins no se quitan en paralelo.
    perform pg_advisory_xact_lock(hashtext('pilo_staff_admins'));
  end if;
  if auth.uid() is not null and old.user_id = auth.uid() and old.active and old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.active)
     and public.pilo_staff_other_admins(old.user_id) = 0 then
    raise exception 'Usted es el último administrador activo de Pilo: nómbre a otro antes de dejar de serlo.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Quitar a una persona del personal: solo la función edge, con la clave de servicio.
create or replace function public.pilo_staff_remove_row(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pilo_staff;
begin
  if not public.pilo_is_service() then
    raise exception 'Solo la función de Pilo quita personal.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('pilo_staff_admins'));
  select * into v_row from public.pilo_staff where user_id = p_user for update;
  if not found then
    raise exception 'Esa persona no está en el personal de Pilo.' using errcode = '22023';
  end if;
  if v_row.active and v_row.role = 'admin' and public.pilo_staff_other_admins(p_user) = 0 then
    raise exception 'Es el último administrador activo de Pilo.' using errcode = '23514';
  end if;
  delete from public.pilo_staff where user_id = p_user;
  return jsonb_build_object('user_id', v_row.user_id, 'created_by', v_row.created_by, 'role', v_row.role);
end;
$$;

-- El personal, para la administración (con si la persona ya confirmó su correo).
create or replace function public.pilo_staff_list()
returns table (user_id uuid, email text, full_name text, role text, active boolean, created_at timestamptz, last_seen_at timestamptz, confirmed boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.pilo_is_admin() then
    raise exception 'Solo la administración ve el personal de Pilo.' using errcode = '42501';
  end if;
  return query
    select s.user_id, s.email, s.full_name, s.role, s.active, s.created_at, s.last_seen_at,
           (a.email_confirmed_at is not null) as confirmed
    from public.pilo_staff s
    left join auth.users a on a.id = s.user_id
    order by s.active desc, s.full_name, s.email;
end;
$$;

-- Cambiar el rol o el estado de una persona del personal (la administración).
create or replace function public.pilo_staff_set(p_user uuid, p_role text default null, p_active boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pilo_staff;
  v_role text;
  v_active boolean;
begin
  if not public.pilo_is_admin() then
    raise exception 'Solo la administración cambia el personal de Pilo.' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'Falta la persona.' using errcode = '22023';
  end if;
  if p_role is not null and p_role not in ('docencia', 'institucional', 'ambos', 'admin') then
    raise exception 'Rol desconocido: %', p_role using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('pilo_staff_admins'));
  select * into v_row from public.pilo_staff where user_id = p_user for update;
  if not found then
    raise exception 'Esa persona no está en el personal de Pilo.' using errcode = '22023';
  end if;
  v_role := coalesce(p_role, v_row.role);
  v_active := coalesce(p_active, v_row.active);

  if p_user = auth.uid() and v_row.active and v_row.role = 'admin' and (v_role <> 'admin' or not v_active)
     and public.pilo_staff_other_admins(p_user) = 0 then
    raise exception 'Usted es el último administrador activo de Pilo: nómbre a otro antes de dejar de serlo.' using errcode = '42501';
  end if;

  update public.pilo_staff set role = v_role, active = v_active
  where user_id = p_user
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

-- La última vez que una persona del personal estuvo por aquí (lo llama su sesión).
create or replace function public.pilo_staff_touch()
returns void
language sql
security definer
set search_path = public
as $$
  update public.pilo_staff set last_seen_at = now()
  where user_id = auth.uid() and active
$$;

revoke all on function public.pilo_is_service() from public, anon, authenticated;
revoke all on function public.pilo_staff_role() from public, anon;
grant execute on function public.pilo_staff_role() to authenticated;
revoke all on function public.pilo_is_admin() from public, anon;
grant execute on function public.pilo_is_admin() to authenticated;
revoke all on function public.pilo_staff_other_admins(uuid) from public, anon, authenticated;
revoke all on function public.pilo_staff_check_insert() from public, anon, authenticated;
revoke all on function public.pilo_staff_keep_admin() from public, anon, authenticated;
revoke all on function public.pilo_staff_remove_row(uuid) from public, anon, authenticated;
revoke all on function public.pilo_staff_list() from public, anon;
grant execute on function public.pilo_staff_list() to authenticated;
revoke all on function public.pilo_staff_set(uuid, text, boolean) from public, anon;
grant execute on function public.pilo_staff_set(uuid, text, boolean) to authenticated;
revoke all on function public.pilo_staff_touch() from public, anon;
grant execute on function public.pilo_staff_touch() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Disparadores y políticas
-- -----------------------------------------------------------------------------

drop trigger if exists pilo_staff_check_insert on public.pilo_staff;
create trigger pilo_staff_check_insert before insert on public.pilo_staff
  for each row execute function public.pilo_staff_check_insert();

drop trigger if exists pilo_staff_keep_admin on public.pilo_staff;
create trigger pilo_staff_keep_admin before delete or update on public.pilo_staff
  for each row execute function public.pilo_staff_keep_admin();

drop policy if exists pilo_staff_own on public.pilo_staff;
create policy pilo_staff_own on public.pilo_staff for select to authenticated
  using (user_id = auth.uid());

drop policy if exists pilo_staff_admin on public.pilo_staff;
create policy pilo_staff_admin on public.pilo_staff to authenticated
  using (public.pilo_is_admin()) with check (public.pilo_is_admin());

-- -----------------------------------------------------------------------------
-- 4. El salto de perfil también para el personal (repara 0162)
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mail  text := lower(btrim(coalesce(new.email, '')));
  entry public.access_allowlist;
  guest uuid;
  -- Quién la creó: la clave de servicio o el panel dejan 'email'; Microsoft, 'azure'.
  oauth boolean := coalesce(to_jsonb(new) -> 'raw_app_meta_data' ->> 'provider', 'email') <> 'email';
  nombre text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    ''
  );
begin
  -- Usuarios de Pilo (pilo) y personal administrativo de Pilo (pilo_staff, 0163):
  -- nacen sin perfil de PDI; el primero lo crea su flujo, el segundo vive en pilo_staff.
  if coalesce(new.raw_user_meta_data ->> 'pilo', '') = 'true'
     or coalesce(new.raw_user_meta_data ->> 'pilo_staff', '') = 'true' then
    return new;
  end if;

  -- El correo exacto manda sobre el dominio.
  select * into entry
    from public.access_allowlist a
   where a.active and (a.email = mail or a.email = '@' || split_part(mail, '@', 2))
   order by (a.email = mail) desc
   limit 1;

  if found then
    insert into public.profiles (id, email, full_name, role, access_role_id, is_active)
    values (new.id, new.email, coalesce(nullif(entry.full_name, ''), nombre), 'consulta', entry.access_role_id, true)
    on conflict (id) do nothing;  -- aa_profiles_sync_role pone el rol que pide el rol de acceso
  elsif oauth then
    select id into guest from public.access_roles where key = 'invitado';
    insert into public.profiles (id, email, full_name, role, access_role_id, is_active)
    values (new.id, new.email, nombre, 'consulta', guest, false)
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, nombre, 'consulta')
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
