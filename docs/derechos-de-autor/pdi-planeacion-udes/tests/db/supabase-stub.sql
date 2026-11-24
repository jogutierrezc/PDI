-- =============================================================================
-- Lo mínimo de Supabase para aplicar las migraciones en PGlite.
--
-- En Supabase existen de antemano los roles anon, authenticated y
-- service_role, el esquema auth con sus usuarios y la función auth.uid(), y
-- el esquema storage con sus buckets y objetos. Aquí se imitan con la forma
-- que usan las migraciones del portal, nada más.
--
-- La sesión se simula con dos variables: request.jwt.claim.sub (el usuario)
-- y el rol activo (set role authenticated / anon).
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator nologin; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user::text)
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select jsonb_build_object('sub', auth.uid(), 'role', auth.role())
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

create or replace function storage.filename(name text) returns text
language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;

grant usage on schema auth, storage, public to anon, authenticated, service_role;
-- Como en Supabase: los permisos de tabla están; lo que decide son las políticas.
grant select, insert, update, delete on storage.objects, storage.buckets to authenticated;
