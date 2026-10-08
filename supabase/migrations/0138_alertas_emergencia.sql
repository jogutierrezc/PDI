-- =============================================================================
-- 0138 · Alertas de emergencia: la capa de Pilo que despierta con Aluna.
--
-- Aluna2 (aluna2.udesplanea.com) declara las emergencias del campus: sismos,
-- incendios, amenazas. Pilo no las inventa ni las decide: las recibe y, mientras
-- haya una activa, muestra una capa a todos sus usuarios. Cuando Aluna da el
-- «todo despejado», la capa se retira sola. Si no hay emergencia, no hay capa
-- ni pedidos: la capa solo escucha la tabla `pilo_alerts`.
--
--   pilo_alert_settings   fila única: el interruptor general, la dirección de
--                         la API REST de Aluna, qué tipos de aviso mostrar y
--                         cuáles caminos de entrada están abiertos (webhook y
--                         consulta periódica).
--   pilo_alert_secret     la clave de integración de Aluna (Bearer) y el
--                         secreto del webhook (firma x-aluna-firma). RLS sin
--                         políticas: solo la lee la función del servidor.
--   pilo_alerts           las alertas: activa o cerrada, con su origen
--                         («aluna» o «simulacro»), tipo, título y texto.
--                         Cualquiera las lee (la capa es pública: una
--                         evacuación no puede pedir sesión); solo el servidor
--                         las escribe.
--
--   pilo_alert_secret_set(cual, valor)   guarda uno de los dos secretos;
--                                        devuelve solo sus 4 últimos.
--   pilo_alert_secret_status()           si hay cada secreto y cómo termina.
--   pilo_alert_drill_start(tipo)         simulacro para todos (administración).
--   pilo_alert_drill_end()               cierra los simulacros abiertos.
--   pilo_alert_context()                 lo que la función necesita en un solo
--                                        viaje (solo el rol de servicio).
--
-- La función `pilo-alertas` escribe `pilo_alerts` con el rol de servicio. Para
-- que la consulta periódica (respaldo del webhook) corra sola, ver el pie.
--
-- Vuelta atrás: apagar el interruptor deja la capa dormida. Las tablas pueden
-- quedarse. Todo DELETE y UPDATE lleva WHERE (safeupdate, ver 0095). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ajustes
-- -----------------------------------------------------------------------------

create table if not exists public.pilo_alert_settings (
  id          boolean primary key default true,
  enabled     boolean not null default false,
  api_url     text not null default 'https://llgiyaudryvxeadzuysq.supabase.co/functions/v1/api-alertas',
  -- Qué clases de aviso de Aluna levantan la capa. Partida: solo la emergencia.
  types       text[] not null default '{emergencia}'::text[],
  webhook_on  boolean not null default true,
  poll_on     boolean not null default true,
  last_sync_at     timestamptz,
  last_sync_ok     boolean,
  last_sync_detail text,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint pilo_alert_settings_one check (id),
  constraint pilo_alert_settings_url check (api_url ~ '^https://[a-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~/-]*)?$' and length(api_url) <= 300),
  constraint pilo_alert_settings_types check (types <@ array['informativo', 'obligatoria', 'emergencia']::text[] and coalesce(array_length(types, 1), 0) >= 1)
);

comment on table public.pilo_alert_settings is
  'Alertas de emergencia (0138): la conexión con la API REST de Aluna y qué tipos de aviso levantan la capa. Una sola fila. Solo la administración.';

alter table public.pilo_alert_settings enable row level security;

drop policy if exists pilo_alert_settings_admin_read on public.pilo_alert_settings;
create policy pilo_alert_settings_admin_read on public.pilo_alert_settings
  for select to authenticated
  using (public.has_role_at_least('admin'));

drop policy if exists pilo_alert_settings_admin_write on public.pilo_alert_settings;
create policy pilo_alert_settings_admin_write on public.pilo_alert_settings
  for update to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

revoke all on public.pilo_alert_settings from public, anon, authenticated;
grant select on public.pilo_alert_settings to authenticated, service_role;
grant update (enabled, api_url, types, webhook_on, poll_on) on public.pilo_alert_settings to authenticated;
grant update on public.pilo_alert_settings to service_role;

create or replace function public.pilo_alert_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists pilo_alert_settings_touch on public.pilo_alert_settings;
create trigger pilo_alert_settings_touch before update on public.pilo_alert_settings
  for each row execute function public.pilo_alert_touch();

insert into public.pilo_alert_settings (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Los secretos: nadie los lee desde el portal.
-- -----------------------------------------------------------------------------

create table if not exists public.pilo_alert_secret (
  id              boolean primary key default true,
  api_key         text not null default '',
  webhook_secret  text not null default '',
  api_key_at      timestamptz,
  webhook_at      timestamptz,
  constraint pilo_alert_secret_one check (id),
  constraint pilo_alert_secret_len check (length(api_key) <= 400 and length(webhook_secret) <= 400)
);

comment on table public.pilo_alert_secret is
  'Alertas de emergencia (0138): la clave de integración de Aluna y el secreto de su webhook. Solo la función del servidor, con el rol de servicio. Se guardan con pilo_alert_secret_set.';

alter table public.pilo_alert_secret enable row level security;
revoke all on public.pilo_alert_secret from public, anon, authenticated;
grant select on public.pilo_alert_secret to service_role;

insert into public.pilo_alert_secret (id) values (true) on conflict (id) do nothing;

create or replace function public.pilo_alert_secret_set(p_which text, p_value text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := regexp_replace(coalesce(p_value, ''), '[[:space:]]', '', 'g');
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración guarda las claves de Aluna.' using errcode = '42501';
  end if;
  if p_which not in ('api_key', 'webhook_secret') then
    raise exception 'Clave desconocida.' using errcode = '22023';
  end if;
  if length(clean) > 400 then
    raise exception 'La clave es demasiado larga.' using errcode = '22023';
  end if;
  if p_which = 'api_key' then
    update public.pilo_alert_secret set api_key = clean, api_key_at = now() where id;
  else
    update public.pilo_alert_secret set webhook_secret = clean, webhook_at = now() where id;
  end if;
  return case when length(clean) >= 12 then right(clean, 4) else '' end;
end;
$$;

revoke all on function public.pilo_alert_secret_set(text, text) from public, anon;
grant execute on function public.pilo_alert_secret_set(text, text) to authenticated;

create or replace function public.pilo_alert_secret_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k public.pilo_alert_secret;
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la administración ve el estado de las claves de Aluna.' using errcode = '42501';
  end if;
  select * into k from public.pilo_alert_secret s where s.id;
  return jsonb_build_object(
    'api_key', jsonb_build_object(
      'has', coalesce(k.api_key, '') <> '',
      'last4', case when length(coalesce(k.api_key, '')) >= 12 then right(k.api_key, 4) else '' end,
      'at', k.api_key_at),
    'webhook_secret', jsonb_build_object(
      'has', coalesce(k.webhook_secret, '') <> '',
      'last4', case when length(coalesce(k.webhook_secret, '')) >= 12 then right(k.webhook_secret, 4) else '' end,
      'at', k.webhook_at)
  );
end;
$$;

revoke all on function public.pilo_alert_secret_status() from public, anon;
grant execute on function public.pilo_alert_secret_status() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Las alertas
-- -----------------------------------------------------------------------------

create table if not exists public.pilo_alerts (
  id          uuid primary key default gen_random_uuid(),
  -- De dónde vino: «aluna» (real) o «simulacro» (lo lanzó la administración).
  source      text not null default 'aluna',
  -- El identificador del aviso en Aluna; en un simulacro, uno propio.
  ext_id      text not null,
  code        text not null default '',
  -- sismo · incendio · seguridad · general (se deduce del texto en la capa; aquí viene de la función).
  kind        text not null default 'general',
  alert_type  text not null default 'emergencia',
  title       text not null,
  body        text not null default '',
  campus      text,
  state       text not null default 'activa',
  emitted_at  timestamptz not null default now(),
  closed_at   timestamptz,
  close_note  text,
  constraint pilo_alerts_source check (source in ('aluna', 'simulacro')),
  constraint pilo_alerts_state check (state in ('activa', 'cerrada')),
  constraint pilo_alerts_kind check (kind in ('sismo', 'incendio', 'seguridad', 'general')),
  constraint pilo_alerts_len check (length(title) <= 300 and length(body) <= 4000 and length(close_note) <= 1000),
  constraint pilo_alerts_unique unique (source, ext_id)
);

comment on table public.pilo_alerts is
  'Alertas de emergencia (0138): lo que Aluna declaró y la capa de Pilo muestra. Lectura pública (una evacuación no pide sesión); la escribe solo el servidor.';

create index if not exists pilo_alerts_state_idx on public.pilo_alerts (state, emitted_at desc);

alter table public.pilo_alerts enable row level security;

-- La capa lee lo activo y lo cerrado en los últimos dos días (el «todo despejado»).
drop policy if exists pilo_alerts_read on public.pilo_alerts;
create policy pilo_alerts_read on public.pilo_alerts
  for select to anon, authenticated
  using (state = 'activa' or coalesce(closed_at, emitted_at) > now() - interval '2 days');

drop policy if exists pilo_alerts_admin_read on public.pilo_alerts;
create policy pilo_alerts_admin_read on public.pilo_alerts
  for select to authenticated
  using (public.has_role_at_least('admin'));

revoke all on public.pilo_alerts from public, anon, authenticated;
grant select on public.pilo_alerts to anon, authenticated, service_role;
grant insert, update on public.pilo_alerts to service_role;

-- La capa se entera en el momento, sin preguntar cada tanto.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pilo_alerts'
     ) then
    alter publication supabase_realtime add table public.pilo_alerts;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Simulacro: para ensayar la capa con todos, sin esperar una emergencia.
-- -----------------------------------------------------------------------------

create or replace function public.pilo_alert_drill_start(p_kind text default 'general')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := case when p_kind in ('sismo', 'incendio', 'seguridad') then p_kind else 'general' end;
  new_id uuid;
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración lanza un simulacro.' using errcode = '42501';
  end if;
  -- Un solo simulacro a la vez.
  update public.pilo_alerts set state = 'cerrada', closed_at = now(), close_note = 'Simulacro reemplazado.'
  where source = 'simulacro' and state = 'activa';
  insert into public.pilo_alerts (source, ext_id, code, kind, title, body)
  values (
    'simulacro', 'sim-' || to_char(now(), 'YYYYMMDDHH24MISS'), 'SIMULACRO', k,
    case k when 'sismo' then 'Simulacro de sismo' when 'incendio' then 'Simulacro de incendio' when 'seguridad' then 'Simulacro de emergencia' else 'Simulacro de emergencia' end,
    'Este es un simulacro. No hay una emergencia real. La administración lo lanza para probar la alerta de Mr. Pilo.'
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.pilo_alert_drill_start(text) from public, anon;
grant execute on function public.pilo_alert_drill_start(text) to authenticated;

create or replace function public.pilo_alert_drill_end()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración termina un simulacro.' using errcode = '42501';
  end if;
  update public.pilo_alerts set state = 'cerrada', closed_at = now(), close_note = 'Fin del simulacro. Todo en orden.'
  where source = 'simulacro' and state = 'activa';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.pilo_alert_drill_end() from public, anon;
grant execute on function public.pilo_alert_drill_end() to authenticated;

-- -----------------------------------------------------------------------------
-- El contexto de la función, en un solo viaje.
-- -----------------------------------------------------------------------------

create or replace function public.pilo_alert_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.pilo_alert_settings;
  k public.pilo_alert_secret;
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo el servidor lee el contexto de las alertas.' using errcode = '42501';
  end if;
  select * into s from public.pilo_alert_settings x where x.id;
  select * into k from public.pilo_alert_secret x where x.id;
  return jsonb_build_object(
    'enabled', s.enabled, 'api_url', s.api_url, 'types', to_jsonb(s.types),
    'webhook_on', s.webhook_on, 'poll_on', s.poll_on,
    'api_key', k.api_key, 'webhook_secret', k.webhook_secret
  );
end;
$$;

revoke all on function public.pilo_alert_context() from public, anon, authenticated;
grant execute on function public.pilo_alert_context() to service_role;

-- =============================================================================
-- Consulta periódica (respaldo del webhook) · a mano, una sola vez
--
-- El webhook avisa en segundos; la consulta cada minuto lo respalda si un
-- aviso se pierde y es la que da por cerrada una emergencia que Aluna cerró.
-- Ejecutar en el SQL Editor, sustituyendo <PROJECT_REF> y <CRON_SECRET> (el
-- mismo valor que el secreto de función PILO_ALERTAS_CRON):
--
--   create extension if not exists pg_net with schema extensions;
--   select cron.schedule(
--     'pilo-alertas-sync', '* * * * *',
--     $cron$
--     select net.http_post(
--       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/pilo-alertas',
--       headers := jsonb_build_object('Content-Type', 'application/json', 'x-pilo-cron', '<CRON_SECRET>'),
--       body    := '{"action":"sync"}'::jsonb
--     );
--     $cron$
--   );
-- =============================================================================
