-- =============================================================================
-- PDI · 0244 · Pilo at Work · Microsoft 365 y avisos (prefijo pw_)
--
-- Requiere 0243. Idempotente.
--
-- HALLAZGO. El correo y la agenda de Microsoft 365 piden guardar tokens de acceso y de
-- renovación de cada persona, y los avisos (Web Push) piden guardar la suscripción de
-- cada dispositivo y las reuniones por avisar. Ninguna de esas cosas debe poder leerse
-- desde el navegador.
--
-- DECISIÓN.
--   · pw_ms_tokens guarda los tokens CIFRADOS (AES-GCM, clave PW_TOKEN_KEY en la función
--     pw-microsoft). Tiene RLS activada y NINGUNA política: solo la lee service_role.
--     La persona solo ve «conectado o no» con pw_ms_estado().
--   · pw_ms_pkce guarda el verificador PKCE (cifrado) del inicio de sesión, por «state».
--   · pw_push_suscripciones: una por dispositivo; la persona decide si se le avisa en el
--     equipo y si también en segundo plano. La llave VAPID NO está en la base: son
--     variables de entorno de la función pw-avisos (PW_VAPID_PUBLIC, PW_VAPID_PRIVATE,
--     PW_VAPID_SUBJECT).
--   · pw_recordatorios: reuniones y plazos por avisar; los llena la agenda (cliente) y
--     la sincronización de pw-avisos con Graph. pw-avisos avisa 10 minutos antes.
--
-- Todo DELETE y UPDATE lleva WHERE (ver 0095).
-- =============================================================================

create table if not exists public.pw_ms_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_cifrado text not null,
  refresh_cifrado text not null,
  expira_en timestamptz not null,
  scopes text not null default '',
  cuenta text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.pw_ms_pkce (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  verificador_cifrado text not null,
  permisos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create table if not exists public.pw_push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  dispositivo text not null default '',
  avisar_equipo boolean not null default true,
  segundo_plano boolean not null default false,
  creado_en timestamptz not null default now(),
  visto_en timestamptz
);
create index if not exists pw_push_user_idx on public.pw_push_suscripciones (user_id);

create table if not exists public.pw_recordatorios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null default 'reunion' check (tipo in ('reunion', 'plazo')),
  titulo text not null check (char_length(titulo) <= 200),
  inicia_en timestamptz not null,
  avisar_min int not null default 10 check (avisar_min between 0 and 1440),
  url text not null default '/work/agenda',
  origen text not null default 'manual' check (origen in ('manual', 'graph', 'pilo')),
  graph_id text,
  enviado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists pw_recordatorios_pend_idx on public.pw_recordatorios (inicia_en) where enviado_en is null;
create unique index if not exists pw_recordatorios_graph_idx on public.pw_recordatorios (user_id, graph_id) where graph_id is not null;

alter table public.pw_ms_tokens enable row level security;
alter table public.pw_ms_pkce enable row level security;
alter table public.pw_push_suscripciones enable row level security;
alter table public.pw_recordatorios enable row level security;

do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('pw_ms_tokens', 'pw_ms_pkce', 'pw_push_suscripciones', 'pw_recordatorios') and policyname like 'pw\_%' escape '\'
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- pw_ms_tokens y pw_ms_pkce: sin políticas a propósito (solo service_role).
create policy pw_push_propias on public.pw_push_suscripciones for all to authenticated
  using (user_id = auth.uid() and public.pw_mi_rol() is not null)
  with check (user_id = auth.uid() and public.pw_mi_rol() is not null);
create policy pw_recordatorios_propios on public.pw_recordatorios for all to authenticated
  using (user_id = auth.uid() and public.pw_mi_rol() is not null)
  with check (user_id = auth.uid() and public.pw_mi_rol() is not null);

-- «¿Hay Microsoft conectado?» sin tocar los tokens.
create or replace function public.pw_ms_estado()
returns table (conectado boolean, cuenta text, scopes text)
language sql
stable
security definer
set search_path = public
as $$
  select true, t.cuenta, t.scopes from public.pw_ms_tokens t where t.user_id = auth.uid() and public.pw_mi_rol() is not null
  union all
  select false, '', '' where not exists (select 1 from public.pw_ms_tokens t where t.user_id = auth.uid());
$$;

create or replace function public.pw_ms_desconectar()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pw_ms_tokens where user_id = auth.uid();
  delete from public.pw_ms_pkce where user_id = auth.uid();
  delete from public.pw_recordatorios where user_id = auth.uid() and origen = 'graph' and enviado_en is null;
end;
$$;

-- Los que tiene pw-avisos por enviar ahora: dentro de su ventana y sin enviar.
create or replace function public.pw_avisos_pendientes(p_limite int default 100)
returns table (id uuid, user_id uuid, titulo text, inicia_en timestamptz, url text, tipo text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.user_id, r.titulo, r.inicia_en, r.url, r.tipo
  from public.pw_recordatorios r
  where r.enviado_en is null
    and r.inicia_en > now() - interval '5 minutes'
    and r.inicia_en <= now() + make_interval(mins => r.avisar_min)
  order by r.inicia_en
  limit greatest(1, least(coalesce(p_limite, 100), 500));
$$;

do $$
declare f text;
begin
  foreach f in array array['pw_ms_estado()', 'pw_ms_desconectar()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  revoke all on function public.pw_avisos_pendientes(int) from public, anon, authenticated;
  grant execute on function public.pw_avisos_pendientes(int) to service_role;
end $$;

grant select, insert, update, delete on table public.pw_push_suscripciones, public.pw_recordatorios to authenticated;
grant all on table public.pw_ms_tokens, public.pw_ms_pkce, public.pw_push_suscripciones, public.pw_recordatorios to service_role;

notify pgrst, 'reload schema';

-- =============================================================================
-- CÓMO PROGRAMAR LOS AVISOS (NO se activa en esta migración; lo decide y lo hace el dueño)
--
-- Igual que 0213 y 0241: pg_cron o el cron de Coolify. pw-avisos primero pide a pw-microsoft que
-- sincronice las reuniones próximas de quienes conectaron su calendario y luego envía los avisos
-- que vencen. Cada 5 minutos basta (el aviso sale 10 minutos antes).
--
--   -- pg_cron
--   select cron.schedule('pw-avisos', '*/5 * * * *', $$
--     select net.http_post(
--       url := 'https://<su-dominio>/functions/v1/pw-avisos',
--       headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
--       body := jsonb_build_object('action', 'enviar')
--     );
--   $$);
--
--   -- Coolify (sin pg_cron): cada 5 minutos
--   --   curl -s -X POST https://<su-dominio>/functions/v1/pw-avisos -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
--   --        -H "Content-Type: application/json" -d '{"action":"enviar"}'
--
-- Sin programar nada, los avisos solo salen mientras la app está abierta (aviso dentro de la app).
-- =============================================================================
