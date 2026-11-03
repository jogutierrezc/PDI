-- =============================================================================
-- PDI · 0183 · Portal de agentes: avisos, festivos y reanudación.
--
-- Lo que agrega esta fase al portal (0181/0182):
--
--   Festivos      `support_holidays`: los festivos de Colombia cierran el
--                 horario de atención (Ley Emiliani/Milagro: los que no caen
--                 en lunes se corren al lunes siguiente). El director los ve y
--                 los cambia; se pueden cargar por año.
--   Avisos        El portal de agentes se instala como app (PWA) con Web Push:
--                 `support_push_config` guarda las llaves VAPID y
--                 `support_push_subscriptions` las suscripciones de cada
--                 agente. Solo el rol de servicio entra a ambas.
--   Reanudación   La persona que cierra la ventana vuelve por un enlace de un
--                 solo uso: `support_resume_tokens` (el token que va en el
--                 correo) y `support_resume_secrets` (el secreto cifrado por
--                 la función del servidor; ningún agente lo lee).
--   Colgado       `support_assignment_policy.stale_minutes`: el agente que no
--                 late pasa a «Fuera» solo (lo hace `support_tick`).
--   Escalado      `escalate_after_minutes` y `escalate_cooldown_hours`: si
--                 nadie acepta, la función `soporte` avisa al director por
--                 correo y push, con calma entre avisos.
--   Aviso correo  `student_last_seen_at` (la persona abrió la vista) y
--                 `aviso_at` (el último correo de «vuelva a su conversación»).
--
-- Requiere 0181 y 0182. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Los festivos de Colombia
-- -----------------------------------------------------------------------------

create table if not exists public.support_holidays (
  dia  date primary key,
  name text not null,
  constraint support_holidays_name check (name <> '' and length(name) <= 80)
);

comment on table public.support_holidays is
  'Soporte (0183): los festivos cierran la atención de todos los portales ese día. El director los administra.';

-- El lunes siguiente: los festivos que no caen en lunes se corren (Ley Emiliani).
create or replace function public.support_lunes_siguiente(p_dia date)
returns date
language sql
immutable
set search_path = public
as $$
  select p_dia + (((8 - extract(dow from p_dia))::int) % 7)
$$;

comment on function public.support_lunes_siguiente is
  'Soporte (0183): el día mismo si ya es lunes; si no, el lunes siguiente (Ley Emiliani).';

-- El Domingo de Pascua (algoritmo de Meeus/Jones/Butcher).
create or replace function public.support_pascua(p_anio integer)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  a integer; b integer; c integer; d integer; e integer; f integer; g integer;
  h integer; i integer; k integer; l integer; m integer;
begin
  a := p_anio % 19;
  b := floor(p_anio / 100.0);
  c := p_anio % 100;
  d := floor(b / 4.0);
  e := b % 4;
  f := floor((b + 8) / 25.0);
  g := floor((b - f + 1) / 3.0);
  h := (19 * a + b - d - g + 15) % 30;
  i := floor(c / 4.0);
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := floor((a + 11 * h + 22 * l) / 451.0);
  return make_date(p_anio, floor((h + l - 7 * m + 114) / 31.0)::int, ((h + l - 7 * m + 114) % 31) + 1);
end;
$$;

-- Los 18 festivos de un año, con el traslado a lunes donde aplica.
create or replace function public.support_colombia_festivos(p_anio integer)
returns table (dia date, nombre text)
language sql
stable
set search_path = public
as $$
  with pascua as (select public.support_pascua(p_anio) as p),
  fijos (mes, dia, nombre, corre) as (
    values
      (1, 1, 'Año Nuevo', false),
      (1, 6, 'Día de los Reyes Magos', true),
      (3, 19, 'Día de San José', true),
      (5, 1, 'Día del Trabajo', false),
      (6, 29, 'San Pedro y San Pablo', true),
      (7, 20, 'Grito de Independencia', false),
      (8, 7, 'Batalla de Boyacá', false),
      (8, 15, 'La Asunción de la Virgen', true),
      (10, 12, 'Día de la Raza', true),
      (11, 1, 'Todos los Santos', true),
      (11, 11, 'Independencia de Cartagena', true),
      (12, 8, 'La Inmaculada Concepción', false),
      (12, 25, 'Navidad', false)
  ),
  moviles (dias, nombre, corre) as (
    values
      (-3, 'Jueves Santo', false),
      (-2, 'Viernes Santo', false),
      (39, 'La Ascensión del Señor', true),
      (60, 'Corpus Christi', true),
      (68, 'El Sagrado Corazón de Jesús', true)
  ),
  todos as (
    select make_date(p_anio, f.mes, f.dia) as base, f.nombre, f.corre from fijos f
    union all
    select (select pascua.p from pascua) + m.dias, m.nombre, m.corre from moviles m
  )
  select case when t.corre then public.support_lunes_siguiente(t.base) else t.base end as dia, t.nombre
    from todos t
$$;

comment on function public.support_colombia_festivos is
  'Soporte (0183): los festivos de Colombia de un año, con el traslado a lunes de la Ley Emiliani.';

-- Carga los festivos de un año (el director lo puede pedir por la pantalla; la migración lo hace sola).
create or replace function public.support_festivos_cargar(p_anio integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not (public.support_is_service() or public.support_is_director()) then
    raise exception 'Solo el director carga los festivos.' using errcode = '42501';
  end if;
  if p_anio < 2024 or p_anio > 2100 then
    raise exception 'Ese año no va: cargue entre 2024 y 2100.' using errcode = '22023';
  end if;
  insert into public.support_holidays (dia, name)
  select f.dia, f.nombre from public.support_colombia_festivos(p_anio) f
  on conflict (dia) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Los dos años que corren desde hoy (idempotente: no repite).
insert into public.support_holidays (dia, name)
select f.dia, f.nombre
  from public.support_colombia_festivos(extract(year from now())::int) f
union
select f.dia, f.nombre
  from public.support_colombia_festivos((extract(year from now())::int) + 1) f
on conflict (dia) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Reglas de reparto: el agente colgado y el escalado
-- -----------------------------------------------------------------------------

alter table public.support_assignment_policy add column if not exists stale_minutes integer not null default 3;
alter table public.support_assignment_policy add column if not exists escalate_after_minutes integer not null default 15;
alter table public.support_assignment_policy add column if not exists escalate_cooldown_hours integer not null default 2;

alter table public.support_assignment_policy drop constraint if exists support_policy_stale;
alter table public.support_assignment_policy
  add constraint support_policy_stale check (stale_minutes between 1 and 60);
alter table public.support_assignment_policy drop constraint if exists support_policy_escalate;
alter table public.support_assignment_policy
  add constraint support_policy_escalate check (escalate_after_minutes between 1 and 240 and escalate_cooldown_hours between 1 and 48);

comment on column public.support_assignment_policy.stale_minutes is
  'Soporte (0183): sin latidos en ese tiempo, el agente «en línea» se MUESTRA como «fuera» en el portal (useAgents la deriva; la base no la toca).';
comment on column public.support_assignment_policy.escalate_after_minutes is
  'Soporte (0183): esperando más de eso sin que nadie acepte, la función soporte avisa al director.';
comment on column public.support_assignment_policy.escalate_cooldown_hours is
  'Soporte (0183): horas mínimas entre dos avisos al director por la misma conversación.';

-- -----------------------------------------------------------------------------
-- 3. La conversación: presencia de la persona, avisos y escalado
-- -----------------------------------------------------------------------------

alter table public.support_conversations add column if not exists student_last_seen_at timestamptz;
alter table public.support_conversations add column if not exists aviso_at timestamptz;
alter table public.support_conversations add column if not exists offered_push_at timestamptz;
alter table public.support_conversations add column if not exists escalated_at timestamptz;

comment on column public.support_conversations.student_last_seen_at is
  'Soporte (0183): la última vez que la persona abrió la vista de su conversación.';
comment on column public.support_conversations.aviso_at is
  'Soporte (0183): el último correo de «vuelva a su conversación» que se le mandó a la persona.';
comment on column public.support_conversations.offered_push_at is
  'Soporte (0183): la última oferta que ya se avisó por push (una por ventana de aceptación).';
comment on column public.support_conversations.escalated_at is
  'Soporte (0183): el último aviso al director por esta conversación (el cooldown manda).';

-- -----------------------------------------------------------------------------
-- 4. Reanudación: el secreto cifrado y los enlaces de un solo uso
-- -----------------------------------------------------------------------------

-- El secreto de la persona, cifrado por la función del servidor (AES-GCM con su
-- propia llave). Ninguna política lo deja leer: solo el rol de servicio.
create table if not exists public.support_resume_secrets (
  conversation_id uuid primary key references public.support_conversations (id) on delete cascade,
  crypt          text not null,
  constraint support_resume_crypt check (crypt <> '' and length(crypt) <= 500)
);

alter table public.support_resume_secrets enable row level security;

comment on table public.support_resume_secrets is
  'Soporte (0183): el secreto de la conversación cifrado por la función soporte, para poder volver con un enlace. Solo el servicio.';

-- El enlace del correo: un token de un solo uso que vale 30 días.
create table if not exists public.support_resume_tokens (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations (id) on delete cascade,
  token_hash      text not null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  used_at         timestamptz,
  constraint support_resume_token check (token_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists support_resume_token_idx on public.support_resume_tokens (token_hash) where used_at is null;

alter table public.support_resume_tokens enable row level security;

comment on table public.support_resume_tokens is
  'Soporte (0183): enlaces de un solo uso para volver a una conversación. Solo el servicio.';

-- -----------------------------------------------------------------------------
-- 5. Web Push: llaves VAPID y suscripciones
-- -----------------------------------------------------------------------------

create table if not exists public.support_push_config (
  id          integer primary key default 1,
  public_key  text,
  private_key text,
  subject     text not null default 'soporte@udes.edu.co',
  updated_at  timestamptz not null default now(),
  constraint support_push_one check (id = 1),
  constraint support_push_keys check ((public_key is null and private_key is null) or (public_key <> '' and private_key <> '' and length(public_key) <= 200 and length(private_key) <= 200)),
  constraint support_push_subject check (length(subject) <= 120)
);

insert into public.support_push_config (id) values (1) on conflict (id) do nothing;

alter table public.support_push_config enable row level security;

comment on table public.support_push_config is
  'Soporte (0183): las llaves VAPID de Web Push del portal. Sin llaves, el push queda apagado. Solo el servicio.';

create table if not exists public.support_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references public.support_agents (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth_key     text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint support_push_sub_len check (length(endpoint) <= 600 and length(p256dh) <= 200 and length(auth_key) <= 200)
);

alter table public.support_push_subscriptions enable row level security;

comment on table public.support_push_subscriptions is
  'Soporte (0183): a qué navegador avisarle a cada agente. Solo el servicio.';

-- -----------------------------------------------------------------------------
-- 6. El horario cierra en festivo
-- -----------------------------------------------------------------------------

create or replace function public.support_portal_open(p_space text, p_at timestamptz default now())
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  s jsonb;
  local_at timestamp;
  r jsonb;
begin
  select schedule into s from public.support_portals where space = p_space;
  if s is null then
    return false;
  end if;
  if coalesce(s->'days', '{}'::jsonb) = '{}'::jsonb then
    return true;
  end if;
  local_at := p_at at time zone coalesce(nullif(s->>'tz', ''), 'America/Bogota');
  -- Festivo: no hay atención, aunque el día de la semana tenga horario.
  if exists (select 1 from public.support_holidays where dia = local_at::date) then
    return false;
  end if;
  for r in select * from jsonb_array_elements(coalesce(s->'days'->(extract(dow from local_at)::int)::text, '[]'::jsonb)) loop
    if local_at::time >= (r->>0)::time and local_at::time < (r->>1)::time then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. La persona abrió su conversación
-- -----------------------------------------------------------------------------

create or replace function public.support_student_view(p_conv uuid, p_hash text, p_after bigint default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.support_conversations;
  ag public.support_agents;
begin
  perform public.support_require_service();
  select * into c from public.support_conversations where id = p_conv and secret_hash = p_hash;
  if not found then
    raise exception 'No encontramos esa conversación.' using errcode = '42501';
  end if;
  update public.support_messages
     set status = 'delivered', delivered_at = coalesce(delivered_at, now())
   where conversation_id = p_conv and kind = 'outgoing' and status = 'sent';
  update public.support_conversations set student_last_seen_at = now() where id = p_conv;
  select * into ag from public.support_agents where id = c.assignee_id;
  return jsonb_build_object(
    'status', c.status,
    'after_hours', c.after_hours,
    'csat', c.csat,
    'agent', case when ag.id is null then null else jsonb_build_object('name', ag.name, 'photo_url', ag.photo_url) end,
    'position', case when c.status in ('queued', 'offered') then
        (select count(*) + 1 from public.support_conversations x where x.space = c.space and x.status in ('queued', 'offered') and x.queued_at < c.queued_at) else 0 end,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'author_kind', m.author_kind, 'author_name', m.author_name, 'body', m.body, 'status', m.status, 'created_at', m.created_at,
        'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'mime', f.mime, 'size', f.size, 'path', f.path)) from public.support_attachments f where f.message_id = m.id), '[]'::jsonb)
      ) order by m.id)
      from public.support_messages m
      where m.conversation_id = p_conv and m.id > coalesce(p_after, 0) and m.kind <> 'private_note' and not m.staff_only
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. El agente colgado se ve «Fuera» en la pantalla, sin tocar la base
--
-- La disponibilidad real del agente no se toca: quien no late en
-- stale_minutes se MUESTRA como «Fuera» en el portal (useAgents la deriva),
-- y si vuelve, el latido lo devuelve solo. Cambiar la fila con un TICK habría
-- dejado a quien vuelve a abrir el portal marcado «Fuera» sin remedio.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 9. Quién ve y quién cambia los festivos
-- -----------------------------------------------------------------------------

alter table public.support_holidays enable row level security;

drop policy if exists support_holidays_read on public.support_holidays;
create policy support_holidays_read on public.support_holidays
  for select to authenticated
  using (public.support_agent_id() is not null);

drop policy if exists support_holidays_director on public.support_holidays;
create policy support_holidays_director on public.support_holidays
  for all to authenticated
  using (public.support_is_director())
  with check (public.support_is_director());

-- -----------------------------------------------------------------------------
-- 10. Los catalogadores de funciones nuevas para el rol de servicio
-- -----------------------------------------------------------------------------

grant execute on function public.support_lunes_siguiente(date) to authenticated, anon, service_role;
grant execute on function public.support_pascua(integer) to authenticated, anon, service_role;
grant execute on function public.support_colombia_festivos(integer) to authenticated, anon, service_role;
grant execute on function public.support_festivos_cargar(integer) to authenticated, anon, service_role;

notify pgrst, 'reload schema';
