-- =============================================================================
-- 0181 · Portal de agentes · tablas, acceso y archivos.
--
-- Cuando Pilo no basta, la persona pasa a un agente de la UDES. Este es el
-- modelo (tomado de Chatwoot): contactos, conversaciones, mensajes, equipos,
-- portales de Pilo con atención por agente, reparto y auditoría. La lógica
-- (reparto, ofertas, reasignar, cerrar) está en 0182.
--
--   support_agents / teams / team_members   el equipo de la UDES (rol, foto,
--                                           disponibilidad, capacidad)
--   support_portals                         un portal por espacio de Pilo
--                                           («planeacion» = Pilo,
--                                           «ensenanza» = Pilo Académico)
--   support_contacts, consents              la persona y su autorización
--                                           (Ley 1581 de 2012)
--   support_conversations, messages,
--   attachments                             el chat
--   support_labels, quick_replies           etiquetas y respuestas rápidas
--   support_assignment_policy               reglas de reparto (una fila)
--   support_audit                           reasignaciones y ofertas
--
-- Acceso:
--   · NADIE anónimo toca estas tablas. Quien escribe desde Pilo habla con la
--     función `soporte` (clave de servicio) y prueba que es dueño de su
--     conversación con un secreto del que la base guarda solo la huella.
--   · Un agente ve las conversaciones de sus equipos o asignadas a él; el
--     director ve todo. Las notas privadas no salen del equipo.
--   · Las escrituras del chat van SOLO por las funciones de 0182. El director
--     administra agentes, equipos, portales, etiquetas, respuestas y reglas
--     directamente.
--   · Bucket privado «support-attachments»: 10 MB y solo imágenes, PDF, Word y
--     Excel, con URLs firmadas.
--
-- Primer director (cambie el correo y ejecute UNA vez, con el rol postgres):
--
--   insert into public.support_agents (name, email, role)
--   values ('Nombre Apellido', 'director@udes.edu.co', 'director')
--   on conflict (email) do nothing;
--
-- Todo DELETE y UPDATE lleva WHERE (safeupdate, ver 0095). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Equipo
-- -----------------------------------------------------------------------------

create table if not exists public.support_agents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete set null,
  name          text not null,
  email         text not null,
  role          text not null default 'agent',
  photo_url     text not null default '',
  availability  text not null default 'fuera',
  capacity      integer,
  active        boolean not null default true,
  last_seen_at  timestamptz,
  last_offer_at timestamptz,
  invited_at    timestamptz,
  created_at    timestamptz not null default now(),
  constraint support_agents_role check (role in ('agent', 'director')),
  constraint support_agents_avail check (availability in ('en_linea', 'ocupado', 'fuera')),
  constraint support_agents_capacity check (capacity is null or capacity between 1 and 50),
  constraint support_agents_name check (length(trim(name)) between 2 and 120),
  constraint support_agents_email check (email = lower(email) and email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+$')
);

create unique index if not exists support_agents_email_idx on public.support_agents (email);

create table if not exists public.support_teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  constraint support_teams_name check (length(trim(name)) between 2 and 80)
);

create unique index if not exists support_teams_name_idx on public.support_teams (lower(name));

create table if not exists public.support_team_members (
  team_id   uuid not null references public.support_teams (id) on delete cascade,
  agent_id  uuid not null references public.support_agents (id) on delete cascade,
  primary key (team_id, agent_id)
);

-- -----------------------------------------------------------------------------
-- Portales de Pilo con atención por agente
-- -----------------------------------------------------------------------------

create table if not exists public.support_portals (
  space       text primary key,
  name        text not null,
  agent_on    boolean not null default false,
  team_id     uuid references public.support_teams (id) on delete set null,
  -- {"tz":"America/Bogota","days":{"1":[["08:00","12:00"],["14:00","18:00"]], ...}}; vacío = siempre.
  schedule    jsonb not null default '{}'::jsonb,
  -- Los textos que Pilo dice fuera de horario o sin agentes (vacío = los de fábrica).
  messages    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint support_portals_space check (space in ('planeacion', 'ensenanza')),
  constraint support_portals_json check (jsonb_typeof(schedule) = 'object' and jsonb_typeof(messages) = 'object')
);

insert into public.support_portals (space, name, schedule) values
  ('planeacion', 'Pilo', '{"tz":"America/Bogota","days":{"1":[["08:00","12:00"],["14:00","18:00"]],"2":[["08:00","12:00"],["14:00","18:00"]],"3":[["08:00","12:00"],["14:00","18:00"]],"4":[["08:00","12:00"],["14:00","18:00"]],"5":[["08:00","12:00"],["14:00","18:00"]]}}'::jsonb),
  ('ensenanza', 'Pilo Académico', '{"tz":"America/Bogota","days":{"1":[["08:00","12:00"],["14:00","18:00"]],"2":[["08:00","12:00"],["14:00","18:00"]],"3":[["08:00","12:00"],["14:00","18:00"]],"4":[["08:00","12:00"],["14:00","18:00"]],"5":[["08:00","12:00"],["14:00","18:00"]]}}'::jsonb)
on conflict (space) do nothing;

-- -----------------------------------------------------------------------------
-- Reglas de reparto (una sola fila)
-- -----------------------------------------------------------------------------

create table if not exists public.support_assignment_policy (
  id                 integer primary key default 1,
  auto_assign        boolean not null default true,
  default_capacity   integer not null default 5,
  queue_order        text not null default 'oldest',
  accept_seconds     integer not null default 45,
  long_wait_minutes  integer not null default 10,
  updated_at         timestamptz not null default now(),
  constraint support_policy_one check (id = 1),
  constraint support_policy_capacity check (default_capacity between 1 and 50),
  constraint support_policy_order check (queue_order in ('oldest', 'longest_wait')),
  constraint support_policy_accept check (accept_seconds between 10 and 600),
  constraint support_policy_wait check (long_wait_minutes between 1 and 240)
);

insert into public.support_assignment_policy (id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Etiquetas y respuestas rápidas
-- -----------------------------------------------------------------------------

create table if not exists public.support_labels (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,
  color  text not null default 'azul',
  constraint support_labels_name check (length(trim(name)) between 2 and 40),
  constraint support_labels_color check (color in ('azul', 'turquesa', 'verde', 'amarillo', 'gris'))
);

create unique index if not exists support_labels_name_idx on public.support_labels (lower(name));

create table if not exists public.support_quick_replies (
  id         uuid primary key default gen_random_uuid(),
  shortcut   text not null,
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  constraint support_quick_shortcut check (shortcut ~ '^[a-z0-9_-]{2,30}$'),
  constraint support_quick_len check (length(title) between 2 and 80 and length(body) between 2 and 2000)
);

create unique index if not exists support_quick_shortcut_idx on public.support_quick_replies (shortcut);

-- -----------------------------------------------------------------------------
-- Contactos y conversaciones
-- -----------------------------------------------------------------------------

create table if not exists public.support_contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  phone       text not null default '',
  city        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint support_contacts_email check (email = lower(email) and email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  constraint support_contacts_len check (length(name) between 3 and 120 and length(phone) <= 30 and length(city) <= 80)
);

create unique index if not exists support_contacts_email_idx on public.support_contacts (email);

create table if not exists public.support_conversations (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid not null references public.support_contacts (id) on delete restrict,
  space            text not null references public.support_portals (space),
  status           text not null default 'pending',
  priority         text not null default 'media',
  team_id          uuid references public.support_teams (id) on delete set null,
  assignee_id      uuid references public.support_agents (id) on delete set null,
  offered_to       uuid references public.support_agents (id) on delete set null,
  offer_expires_at timestamptz,
  offer_attempts   integer not null default 0,
  declined_by      uuid[] not null default '{}',
  labels           text[] not null default '{}',
  pilo_summary     text not null default '',
  unanswered       text not null default '',
  -- Solo la huella del secreto que tiene quien escribe desde Pilo; el canal es el nombre (impredecible) del Broadcast.
  secret_hash      text not null,
  channel_key      text not null,
  after_hours      boolean not null default false,
  notified_at      timestamptz,
  csat             smallint,
  csat_comment     text not null default '',
  snoozed_until    timestamptz,
  waiting_since    timestamptz,
  created_at       timestamptz not null default now(),
  queued_at        timestamptz,
  accepted_at      timestamptz,
  resolved_at      timestamptz,
  last_message_at  timestamptz not null default now(),
  constraint support_conv_status check (status in ('pending', 'queued', 'offered', 'open', 'snoozed', 'resolved')),
  constraint support_conv_priority check (priority in ('baja', 'media', 'alta', 'urgente')),
  constraint support_conv_csat check (csat is null or csat between 1 and 5),
  constraint support_conv_hash check (secret_hash ~ '^[0-9a-f]{64}$' and channel_key ~ '^[0-9a-f]{32,64}$'),
  constraint support_conv_len check (length(pilo_summary) <= 4000 and length(unanswered) <= 600 and length(csat_comment) <= 500)
);

create index if not exists support_conv_status_idx on public.support_conversations (status, queued_at);
create index if not exists support_conv_assignee_idx on public.support_conversations (assignee_id) where status in ('open', 'offered', 'snoozed');
create index if not exists support_conv_offer_idx on public.support_conversations (offered_to) where status = 'offered';
create index if not exists support_conv_contact_idx on public.support_conversations (contact_id);

create table if not exists public.support_messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.support_conversations (id) on delete cascade,
  kind             text not null,
  author_kind      text not null,
  author_agent_id  uuid references public.support_agents (id) on delete set null,
  author_name      text not null default '',
  body             text not null default '',
  -- Un aviso de auditoría que solo ve el equipo («María reasignó…»).
  staff_only       boolean not null default false,
  status           text not null default 'sent',
  created_at       timestamptz not null default now(),
  delivered_at     timestamptz,
  read_at          timestamptz,
  constraint support_msg_kind check (kind in ('incoming', 'outgoing', 'activity', 'private_note')),
  constraint support_msg_author check (author_kind in ('student', 'pilo', 'agent', 'system')),
  constraint support_msg_status check (status in ('sent', 'delivered', 'read')),
  constraint support_msg_len check (length(body) <= 4000),
  constraint support_msg_private check (kind <> 'private_note' or staff_only)
);

create index if not exists support_msg_conv_idx on public.support_messages (conversation_id, id);

create table if not exists public.support_attachments (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.support_conversations (id) on delete cascade,
  message_id       bigint not null references public.support_messages (id) on delete cascade,
  path             text not null,
  name             text not null,
  mime             text not null,
  size             bigint not null,
  created_at       timestamptz not null default now(),
  constraint support_att_size check (size between 1 and 10485760)
);

create unique index if not exists support_att_path_idx on public.support_attachments (path);
create index if not exists support_att_msg_idx on public.support_attachments (message_id);

create table if not exists public.support_consents (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.support_conversations (id) on delete cascade,
  contact_id       uuid not null references public.support_contacts (id) on delete restrict,
  policy_version   text not null,
  accepted_at      timestamptz not null default now(),
  ip_hash          text not null default '',
  constraint support_consent_version check (length(policy_version) between 1 and 40)
);

create table if not exists public.support_audit (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.support_conversations (id) on delete cascade,
  action           text not null,
  by_agent_id      uuid references public.support_agents (id) on delete set null,
  from_agent_id    uuid references public.support_agents (id) on delete set null,
  to_agent_id      uuid references public.support_agents (id) on delete set null,
  reason           text not null default '',
  created_at       timestamptz not null default now(),
  constraint support_audit_action check (action in ('offer', 'offer_expired', 'offer_declined', 'accept', 'reassign', 'undo', 'resolve', 'reopen', 'snooze', 'cancel'))
);

create index if not exists support_audit_conv_idx on public.support_audit (conversation_id, id);

-- -----------------------------------------------------------------------------
-- Quién es quién (para las políticas)
-- -----------------------------------------------------------------------------

create or replace function public.support_agent_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id from public.support_agents a where a.user_id = auth.uid() and a.active limit 1
$$;

create or replace function public.support_is_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.support_agents a where a.user_id = auth.uid() and a.active and a.role = 'director')
$$;

create or replace function public.support_in_team(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_team is not null and exists (
    select 1 from public.support_team_members m
    where m.team_id = p_team and m.agent_id = public.support_agent_id()
  )
$$;

-- Una conversación la ve el director, el agente al que está asignada u ofrecida y los de su equipo.
create or replace function public.support_sees(p_team uuid, p_assignee uuid, p_offered uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- coalesce: con asignada u ofrecida vacías la comparación da NULL, y un NULL no debe contar como «sí» en un IF.
  select coalesce(
    public.support_agent_id() is not null and (
      public.support_is_director()
      or p_assignee = public.support_agent_id()
      or p_offered = public.support_agent_id()
      or public.support_in_team(p_team)
    ), false)
$$;

-- Quien llama es la función del servidor (clave de servicio), no una persona.
create or replace function public.support_is_service()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role' or current_user = 'service_role'
$$;

revoke all on function public.support_agent_id(), public.support_is_director(), public.support_in_team(uuid), public.support_sees(uuid, uuid, uuid), public.support_is_service() from public, anon;
grant execute on function public.support_agent_id(), public.support_is_director(), public.support_in_team(uuid), public.support_sees(uuid, uuid, uuid), public.support_is_service() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.support_agents enable row level security;
alter table public.support_teams enable row level security;
alter table public.support_team_members enable row level security;
alter table public.support_portals enable row level security;
alter table public.support_assignment_policy enable row level security;
alter table public.support_labels enable row level security;
alter table public.support_quick_replies enable row level security;
alter table public.support_contacts enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_attachments enable row level security;
alter table public.support_consents enable row level security;
alter table public.support_audit enable row level security;

revoke all on
  public.support_agents, public.support_teams, public.support_team_members, public.support_portals,
  public.support_assignment_policy, public.support_labels, public.support_quick_replies, public.support_contacts,
  public.support_conversations, public.support_messages, public.support_attachments, public.support_consents, public.support_audit
from public, anon, authenticated;

-- Lectura: cualquier agente ve el equipo, los portales, las reglas, las etiquetas y las respuestas rápidas.
do $$
declare
  t text;
begin
  foreach t in array array['support_agents', 'support_teams', 'support_team_members', 'support_portals', 'support_assignment_policy', 'support_labels', 'support_quick_replies'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.support_agent_id() is not null)', t || '_read', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  -- Escritura: solo el director.
  foreach t in array array['support_agents', 'support_teams', 'support_team_members', 'support_portals', 'support_assignment_policy', 'support_labels', 'support_quick_replies'] loop
    execute format('drop policy if exists %I on public.%I', t || '_director', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.support_is_director()) with check (public.support_is_director())', t || '_director', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- El agente no cambia a mano su rol ni su correo: el director sí (política de arriba). Su disponibilidad y foto, por funciones.
-- Las filas de agentes llevan datos del equipo; ningún anónimo las lee (sin política, sin permiso).

-- Conversaciones: lectura según el alcance; escritura SOLO por funciones.
drop policy if exists support_conversations_read on public.support_conversations;
create policy support_conversations_read on public.support_conversations
  for select to authenticated using (public.support_sees(team_id, assignee_id, offered_to));
grant select on public.support_conversations to authenticated;

-- Los mensajes, adjuntos y auditoría siguen a la conversación (la subconsulta ya filtra con la política de arriba).
drop policy if exists support_messages_read on public.support_messages;
create policy support_messages_read on public.support_messages
  for select to authenticated using (exists (select 1 from public.support_conversations c where c.id = conversation_id));
grant select on public.support_messages to authenticated;

drop policy if exists support_attachments_read on public.support_attachments;
create policy support_attachments_read on public.support_attachments
  for select to authenticated using (exists (select 1 from public.support_conversations c where c.id = conversation_id));
grant select on public.support_attachments to authenticated;

drop policy if exists support_audit_read on public.support_audit;
create policy support_audit_read on public.support_audit
  for select to authenticated using (exists (select 1 from public.support_conversations c where c.id = conversation_id));
grant select on public.support_audit to authenticated;

drop policy if exists support_contacts_read on public.support_contacts;
create policy support_contacts_read on public.support_contacts
  for select to authenticated using (exists (select 1 from public.support_conversations c where c.contact_id = support_contacts.id));
grant select on public.support_contacts to authenticated;

-- Las autorizaciones de datos personales las ve solo el director.
drop policy if exists support_consents_director on public.support_consents;
create policy support_consents_director on public.support_consents
  for select to authenticated using (public.support_is_director());
grant select on public.support_consents to authenticated;

-- -----------------------------------------------------------------------------
-- Tiempo real: lo que cambia llega a los agentes (la RLS decide quién lo recibe).
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['support_conversations', 'support_messages', 'support_agents'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
exception
  when insufficient_privilege then
    raise warning 'No se pudo agregar las tablas de soporte a supabase_realtime (%). Agréguelas desde Database > Replication.', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- Archivos: bucket privado, 10 MB, imágenes, PDF, Word y Excel.
-- El agente sube con su sesión a «<id de la conversación>/<archivo>»; quien escribe
-- desde Pilo sube con una URL firmada que entrega la función. Se lee con URL firmada.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'support-attachments', 'support-attachments', false, 10485760,
    array[
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  )
  on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists support_files_read on storage.objects';
  execute $pol$
    create policy support_files_read on storage.objects
      for select to authenticated
      using (
        bucket_id = 'support-attachments'
        and exists (select 1 from public.support_conversations c where c.id::text = (storage.foldername(name))[1])
      )
  $pol$;

  execute 'drop policy if exists support_files_write on storage.objects';
  execute $pol$
    create policy support_files_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'support-attachments'
        and exists (select 1 from public.support_conversations c where c.id::text = (storage.foldername(name))[1])
      )
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "support-attachments" (%). Créelo a mano desde Storage: privado, 10 MB, imágenes, PDF, Word y Excel.',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';
