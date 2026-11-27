-- =============================================================================
-- PDI · 0299 · Pilo en el Aula: la clave del plugin local_pilo de Moodle
--
-- Requiere 0133 (sitios de Moodle). Idempotente. Todo UPDATE lleva WHERE (0095).
--
-- El plugin local_pilo firma en el servidor de Moodle una credencial corta (JWT
-- HS256, 5 minutos) con quién pregunta, su rol y sus cursos. La función
-- pilo-aula la verifica con la misma clave. La clave es una por sitio, la crea
-- Pilo (32 bytes al azar) y se muestra una sola vez para pegarla en Moodle.
--
--   pilo_moodle_site_secret.firma_key   la clave; solo la lee el rol de servicio.
--   pilo_moodle_site_secret.firma_at    cuándo se creó la clave vigente.
--   pilo_moodle_site_new_firma_key(espacio, sitio)
--                             crea (o cambia) la clave y la devuelve esa única vez.
--                             Cambiarla invalida las credenciales firmadas con la
--                             anterior: hay que pegar la nueva en Moodle.
--   pilo_moodle_site_drop_firma_key(espacio, sitio)
--                             la borra: el plugin de ese sitio deja de funcionar.
--   pilo_moodle_firma_status(espacio)
--                             por sitio: si hay clave, sus 4 últimos y cuándo.
-- =============================================================================

alter table public.pilo_moodle_site_secret
  add column if not exists firma_key text not null default '',
  add column if not exists firma_at timestamptz;

alter table public.pilo_moodle_site_secret drop constraint if exists pilo_moodle_site_secret_firma_len;
alter table public.pilo_moodle_site_secret
  add constraint pilo_moodle_site_secret_firma_len check (firma_key = '' or length(firma_key) between 32 and 128);

comment on column public.pilo_moodle_site_secret.firma_key is
  'Clave HMAC del plugin local_pilo de este sitio (0299). La verifica la función pilo-aula. Nadie la lee desde el portal.';

-- -----------------------------------------------------------------------------
-- Crear o cambiar la clave.
-- -----------------------------------------------------------------------------

create or replace function public.pilo_moodle_site_new_firma_key(p_space text, p_site text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración crea la clave del plugin de Moodle.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pilo_moodle_sites s where s.space = p_space and s.id = p_site) then
    raise exception 'Ese sitio de Moodle no existe en este espacio.' using errcode = '22023';
  end if;
  insert into public.pilo_moodle_site_secret as k (space, site, firma_key, firma_at, updated_by, updated_at)
  values (p_space, p_site, v_key, now(), auth.uid(), now())
  on conflict (space, site) do update
    set firma_key = excluded.firma_key, firma_at = excluded.firma_at, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('key', v_key, 'last4', right(v_key, 4), 'at', now());
end;
$$;

revoke all on function public.pilo_moodle_site_new_firma_key(text, text) from public, anon;
grant execute on function public.pilo_moodle_site_new_firma_key(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Borrar la clave.
-- -----------------------------------------------------------------------------

create or replace function public.pilo_moodle_site_drop_firma_key(p_space text, p_site text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración borra la clave del plugin de Moodle.' using errcode = '42501';
  end if;
  update public.pilo_moodle_site_secret
     set firma_key = '', firma_at = null, updated_by = auth.uid(), updated_at = now()
   where space = p_space and site = p_site;
end;
$$;

revoke all on function public.pilo_moodle_site_drop_firma_key(text, text) from public, anon;
grant execute on function public.pilo_moodle_site_drop_firma_key(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- El estado, sin la clave.
-- -----------------------------------------------------------------------------

create or replace function public.pilo_moodle_firma_status(p_space text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración ve el estado del plugin de Moodle.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(s.id, jsonb_build_object(
      'on', coalesce(k.firma_key, '') <> '',
      'last4', case when coalesce(k.firma_key, '') = '' then '' else right(k.firma_key, 4) end,
      'at', k.firma_at))
    from public.pilo_moodle_sites s
    left join public.pilo_moodle_site_secret k on k.space = s.space and k.site = s.id
    where s.space = p_space
  ), '{}'::jsonb);
end;
$$;

revoke all on function public.pilo_moodle_firma_status(text) from public, anon;
grant execute on function public.pilo_moodle_firma_status(text) to authenticated;

notify pgrst, 'reload schema';
