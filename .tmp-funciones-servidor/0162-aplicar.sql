-- =============================================================================
-- 0162 · Acceso con Microsoft y lista de correos habilitados
--
-- La persona entra con su cuenta de Microsoft (proveedor «Azure» de Supabase
-- Auth); la administración decide, en esta lista, qué correos (o dominios
-- enteros, «@udes.edu.co») entran a la intranet y con qué rol de acceso.
--
--   access_allowlist   un correo o un dominio, el rol que recibe y si está activo.
--   rol «invitado»     rol de fábrica sin pantallas, para quien entra por
--                      Microsoft sin estar en la lista.
--   handle_new_user()  al primer ingreso:
--                        · en la lista        → perfil activo con el rol de la lista;
--                        · Microsoft sin lista → perfil INACTIVO con rol invitado.
--                          Inactivo es lo que de verdad lo deja fuera: la base
--                          no le da ni lectura de intranet (current_role() es
--                          null). Ve lo mismo que cualquier visitante.
--
-- Habilitar a quien está esperando es agregar su correo a la lista (un
-- disparador activa su perfil). Quitar o desactivar un correo exacto cierra su
-- cuenta; quitar un dominio solo deja de admitir ingresos nuevos.
--
-- Además: el rol de los metadatos del alta (user_metadata.role) deja de
-- obedecerse. Cualquiera puede escribirlo en un registro propio; el rol sale
-- solo de la lista o de la administración.
--
-- Las pantallas Correos, Rutas y Rankings pasan a respetar también el rol de
-- acceso en el menú (como Warehouse y Monitor; la base de esas tres sigue
-- decidiendo por capacidad). Un rol con lista explícita de pantallas que no las
-- marque deja de verlas en el menú: se marcan en Usuarios y roles → Roles.
--
-- Requiere 0001, 0024, 0120. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El rol «invitado»
-- -----------------------------------------------------------------------------

insert into public.access_roles (key, name, description, base_role, screens, all_screens, all_reports, is_system, position)
values (
  'invitado',
  'Invitado (sin habilitar)',
  'Entró con Microsoft pero su correo no está en la lista de acceso. No ve ninguna pantalla de la intranet.',
  'consulta', '{}', false, false, true, 5
)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 2. La lista
-- -----------------------------------------------------------------------------

create table if not exists public.access_allowlist (
  id             uuid primary key default gen_random_uuid(),
  -- Un correo («ana@udes.edu.co») o un dominio entero («@udes.edu.co»), en minúsculas.
  email          text not null,
  full_name      text not null default '',
  note           text not null default '',
  access_role_id uuid not null references public.access_roles (id) on delete restrict,
  active         boolean not null default true,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint access_allowlist_email_unique unique (email),
  constraint access_allowlist_email_form check (
    email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' or email ~ '^@[^@[:space:]]+[.][^@[:space:]]+$'
  )
);

comment on table public.access_allowlist is
  'Correos (o dominios) que pueden entrar a la intranet, y el rol de acceso que reciben al primer ingreso.';

create index if not exists access_allowlist_role_idx on public.access_allowlist (access_role_id);

create or replace function public.access_allowlist_normalize()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  new.full_name := btrim(coalesce(new.full_name, ''));
  new.note := btrim(coalesce(new.note, ''));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists aa_access_allowlist_normalize on public.access_allowlist;
create trigger aa_access_allowlist_normalize
  before insert or update on public.access_allowlist
  for each row execute function public.access_allowlist_normalize();

alter table public.access_allowlist enable row level security;

drop policy if exists access_allowlist_admin on public.access_allowlist;
create policy access_allowlist_admin on public.access_allowlist for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.access_allowlist to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Lo que la lista hace con las cuentas que ya existen
-- -----------------------------------------------------------------------------

create or replace function public.access_allowlist_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  guest uuid;
begin
  select id into guest from public.access_roles where key = 'invitado';

  -- Quitar o desactivar un correo exacto cierra su cuenta. guard_last_admin()
  -- impide que eso deje el portal sin administradores.
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and not new.active) then
    if left(old.email, 1) <> '@' then
      update public.profiles
         set is_active = false, access_role_id = guest
       where lower(email) = old.email and (is_active or access_role_id is distinct from guest);
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Habilitar: quien esperaba (inactivo, invitado) recibe el rol de la lista.
  update public.profiles
     set is_active = true, access_role_id = new.access_role_id
   where access_role_id = guest and not is_active
     and (lower(email) = new.email or (left(new.email, 1) = '@' and lower(email) like '%' || new.email));
  return new;
end;
$$;

drop trigger if exists access_allowlist_apply on public.access_allowlist;
create trigger access_allowlist_apply
  after insert or update or delete on public.access_allowlist
  for each row execute function public.access_allowlist_apply();

-- -----------------------------------------------------------------------------
-- 4. El alta del perfil
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
  if coalesce(new.raw_user_meta_data ->> 'pilo', '') = 'true' then
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

-- -----------------------------------------------------------------------------
-- 5. Quien ya tenía acceso queda en la lista
-- -----------------------------------------------------------------------------

insert into public.access_allowlist (email, full_name, note, access_role_id)
select lower(btrim(p.email)), p.full_name, 'Ya tenía acceso antes de la lista.',
       coalesce(p.access_role_id, (select r.id from public.access_roles r where r.is_system and r.key = p.role::text))
  from public.profiles p
 where p.is_active
   and lower(btrim(p.email)) ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
   and coalesce(p.access_role_id, (select r.id from public.access_roles r where r.is_system and r.key = p.role::text)) is not null
on conflict (email) do nothing;

notify pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('0162');
