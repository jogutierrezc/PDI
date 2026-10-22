-- =============================================================================
-- 0182 · Portal de agentes · la lógica (reparto, ofertas, chat, cierre).
--
-- Todo lo que cambia el estado de una conversación pasa por estas funciones,
-- que son atómicas (bloquean la fila) y dejan rastro en la auditoría.
--
-- Ciclo:  pending → queued → offered → open → resolved   (y snoozed)
--   pending   Pilo atiende solo
--   queued    ya hay datos y consentimiento; espera a un agente
--   offered   el reparto la ofreció a un agente (cuenta atrás); si vence, pasa al siguiente
--   open      un agente la aceptó y atiende
--   snoozed   pospuesta; reabre sola si la persona escribe
--   resolved  cerrada
--
-- De los AGENTES (con su sesión; revisan quién son con auth.uid()):
--   support_claim, support_heartbeat, support_set_availability, support_update_profile,
--   support_accept, support_decline, support_send, support_reassign,
--   support_undo_reassign, support_requeue, support_update, support_take, support_assign_best, support_resolve, support_reopen, support_snooze,
--   support_mark_read, support_report (director)
-- De la función `soporte` (clave de servicio; la persona anónima prueba que es
-- dueña de su conversación con la huella de su secreto):
--   support_portal_state, support_open, support_student_view, support_student_send,
--   support_student_read, support_student_rate, support_student_cancel
-- Internas: support_assert_move, support_portal_open, support_dispatch,
--   support_tick, support_add_message, support_attachment_ok.
--
-- Requiere 0181. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reglas puras
-- -----------------------------------------------------------------------------

-- Las transiciones permitidas del ciclo.
create or replace function public.support_transition_ok(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('pending', 'queued'), ('pending', 'resolved'),
    ('queued', 'offered'), ('queued', 'resolved'),
    ('offered', 'open'), ('offered', 'queued'), ('offered', 'resolved'),
    ('open', 'resolved'), ('open', 'snoozed'), ('open', 'queued'),
    ('snoozed', 'open'), ('snoozed', 'resolved'),
    ('resolved', 'open')
  )
$$;

create or replace function public.support_assert_move(p_from text, p_to text)
returns void
language plpgsql
immutable
as $$
begin
  if not public.support_transition_ok(p_from, p_to) then
    raise exception 'Una conversación % no puede pasar a %.', p_from, p_to using errcode = '23514';
  end if;
end;
$$;

-- 10 MB; imágenes, PDF, Word y Excel (el servidor las comprueba con el tipo real del archivo).
create or replace function public.support_attachment_ok(p_mime text, p_size bigint)
returns boolean
language sql
immutable
as $$
  select coalesce(p_size, 0) between 1 and 10485760 and coalesce(p_mime, '') = any (array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ])
$$;

-- ¿Hay atención ahora? El horario es {"tz","days":{"0".."6":[["08:00","12:00"],…]}}; sin días = siempre.
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
  for r in select * from jsonb_array_elements(coalesce(s->'days'->(extract(dow from local_at)::int)::text, '[]'::jsonb)) loop
    if local_at::time >= (r->>0)::time and local_at::time < (r->>1)::time then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- -----------------------------------------------------------------------------
-- Auditoría y mensajes (internas)
-- -----------------------------------------------------------------------------

create or replace function public.support_audit_add(p_conv uuid, p_action text, p_by uuid, p_from uuid, p_to uuid, p_reason text default '')
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.support_audit (conversation_id, action, by_agent_id, from_agent_id, to_agent_id, reason)
  values (p_conv, p_action, p_by, p_from, p_to, left(coalesce(p_reason, ''), 500))
$$;

-- Agrega un mensaje (y sus archivos, ya subidos al bucket) y mueve las marcas de la conversación.
create or replace function public.support_add_message(
  p_conv uuid, p_kind text, p_author_kind text, p_agent uuid, p_name text, p_body text,
  p_files jsonb default '[]'::jsonb, p_staff_only boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  f jsonb;
  v_meta jsonb;
  v_mime text;
  v_size bigint;
  v_path text;
begin
  if length(coalesce(p_body, '')) > 4000 then
    raise exception 'El mensaje es demasiado largo (máximo 4000 caracteres).' using errcode = '22023';
  end if;
  if coalesce(trim(p_body), '') = '' and jsonb_array_length(coalesce(p_files, '[]'::jsonb)) = 0 then
    raise exception 'El mensaje está vacío.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_files, '[]'::jsonb)) > 5 then
    raise exception 'Se pueden adjuntar hasta 5 archivos por mensaje.' using errcode = '22023';
  end if;

  insert into public.support_messages (conversation_id, kind, author_kind, author_agent_id, author_name, body, staff_only)
  values (p_conv, p_kind, p_author_kind, p_agent, left(coalesce(p_name, ''), 120), coalesce(p_body, ''), p_staff_only or p_kind = 'private_note')
  returning id into v_id;

  for f in select * from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) loop
    v_path := f->>'path';
    if v_path is null or split_part(v_path, '/', 1) <> p_conv::text then
      raise exception 'El archivo no pertenece a esta conversación.' using errcode = '22023';
    end if;
    select o.metadata into v_meta from storage.objects o where o.bucket_id = 'support-attachments' and o.name = v_path limit 1;
    if v_meta is null then
      raise exception 'No se encontró el archivo subido.' using errcode = '22023';
    end if;
    v_mime := v_meta->>'mimetype';
    v_size := (v_meta->>'size')::bigint;
    if not public.support_attachment_ok(v_mime, v_size) then
      raise exception 'Ese archivo no se admite: hasta 10 MB, imágenes, PDF, Word o Excel.' using errcode = '22023';
    end if;
    insert into public.support_attachments (conversation_id, message_id, path, name, mime, size)
    values (p_conv, v_id, v_path, left(coalesce(nullif(f->>'name', ''), 'archivo'), 120), v_mime, v_size);
  end loop;

  update public.support_conversations
     set last_message_at = now(),
         waiting_since = case
           when p_kind = 'incoming' then coalesce(waiting_since, now())
           when p_kind = 'outgoing' and p_author_kind = 'agent' then null
           else waiting_since end
   where id = p_conv;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reparto
-- -----------------------------------------------------------------------------

-- Ofrece una conversación en cola al siguiente agente: en línea (con latido reciente), del equipo, con
-- capacidad y que no la haya rechazado; el que lleva más tiempo sin recibir oferta (round-robin).
create or replace function public.support_dispatch(p_conv uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.support_conversations;
  pol public.support_assignment_policy;
  v_team uuid;
  v_agent uuid;
  v_pass integer;
begin
  select * into c from public.support_conversations where id = p_conv for update;
  if not found or c.status <> 'queued' then
    return false;
  end if;
  select * into pol from public.support_assignment_policy where id = 1;
  select team_id into v_team from public.support_portals where space = c.space;
  v_team := coalesce(c.team_id, v_team);

  for v_pass in 1..2 loop
    select a.id into v_agent
      from public.support_agents a
     where a.active and a.availability = 'en_linea'
       and a.last_seen_at > now() - interval '90 seconds'
       and (v_team is null or exists (select 1 from public.support_team_members m where m.team_id = v_team and m.agent_id = a.id))
       and not (a.id = any (c.declined_by))
       and (select count(*) from public.support_conversations x
             where (x.status = 'open' and x.assignee_id = a.id) or (x.status = 'offered' and x.offered_to = a.id)) < coalesce(a.capacity, pol.default_capacity)
     order by a.last_offer_at nulls first, a.id
     limit 1;
    exit when v_agent is not null;
    -- Todos los disponibles ya la rechazaron o la dejaron vencer: se vuelve a empezar la ronda.
    exit when v_pass = 2 or cardinality(c.declined_by) = 0;
    update public.support_conversations set declined_by = '{}' where id = p_conv;
    c.declined_by := '{}';
  end loop;

  if v_agent is null then
    return false;
  end if;

  perform public.support_assert_move(c.status, 'offered');
  update public.support_conversations
     set status = 'offered', offered_to = v_agent, team_id = coalesce(team_id, v_team),
         offer_expires_at = now() + make_interval(secs => pol.accept_seconds), offer_attempts = offer_attempts + 1
   where id = p_conv;
  update public.support_agents set last_offer_at = now() where id = v_agent;
  perform public.support_audit_add(p_conv, 'offer', null, null, v_agent);
  return true;
end;
$$;

-- Vence las ofertas, despierta las pospuestas y reparte lo que espera. Lo llaman los latidos de los
-- agentes y la función del servidor; sirve también desde un cron (select public.support_tick()).
create or replace function public.support_tick()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  pol public.support_assignment_policy;
  r record;
  n integer := 0;
begin
  if not (public.support_is_service() or public.support_agent_id() is not null) then
    raise exception 'Solo el portal de agentes y su función usan el reparto.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(7019001);
  select * into pol from public.support_assignment_policy where id = 1;

  for r in select id, offered_to from public.support_conversations where status = 'offered' and offer_expires_at < now() for update loop
    update public.support_conversations
       set status = 'queued', declined_by = array_append(declined_by, r.offered_to), offered_to = null, offer_expires_at = null
     where id = r.id;
    perform public.support_audit_add(r.id, 'offer_expired', null, r.offered_to, null);
  end loop;

  for r in select id from public.support_conversations where status = 'snoozed' and snoozed_until is not null and snoozed_until < now() loop
    update public.support_conversations set status = 'open', snoozed_until = null where id = r.id;
  end loop;

  if pol.auto_assign then
    for r in
      select c.id
        from public.support_conversations c
        join public.support_portals p on p.space = c.space
       where c.status = 'queued' and p.agent_on and public.support_portal_open(c.space)
       order by case when pol.queue_order = 'longest_wait' then coalesce(c.waiting_since, c.queued_at) else c.queued_at end, c.created_at
    loop
      if public.support_dispatch(r.id) then
        n := n + 1;
      end if;
    end loop;
  end if;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- De los agentes
-- -----------------------------------------------------------------------------

create or replace function public.support_require_agent()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid := public.support_agent_id();
begin
  if v is null then
    raise exception 'No tiene acceso al portal de agentes.' using errcode = '42501';
  end if;
  return v;
end;
$$;

-- Al entrar: enlaza la sesión con la fila del agente por su correo (verificado por Microsoft o por el código).
create or replace function public.support_claim()
returns public.support_agents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  a public.support_agents;
begin
  if v_uid is null then
    raise exception 'Falta iniciar sesión.' using errcode = '42501';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  update public.support_agents set user_id = null where user_id = v_uid and email <> coalesce(v_email, '');
  update public.support_agents set user_id = v_uid, last_seen_at = now() where email = v_email and active returning * into a;
  if not found then
    select * into a from public.support_agents where user_id = v_uid and active;
  end if;
  return a;
end;
$$;

create or replace function public.support_heartbeat()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
begin
  update public.support_agents set last_seen_at = now() where id = v;
  perform public.support_tick();
end;
$$;

create or replace function public.support_set_availability(p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
begin
  if p_value not in ('en_linea', 'ocupado', 'fuera') then
    raise exception 'Disponibilidad desconocida: %', p_value using errcode = '22023';
  end if;
  update public.support_agents set availability = p_value, last_seen_at = now() where id = v;
  if p_value = 'en_linea' then
    perform public.support_tick();
  end if;
end;
$$;

create or replace function public.support_update_profile(p_photo_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
begin
  if coalesce(p_photo_url, '') <> '' and p_photo_url !~ '^https://' then
    raise exception 'La foto debe ser un enlace https.' using errcode = '22023';
  end if;
  update public.support_agents set photo_url = left(coalesce(p_photo_url, ''), 500) where id = v;
end;
$$;

create or replace function public.support_accept(p_conv uuid)
returns public.support_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
  c public.support_conversations;
  a public.support_agents;
begin
  select * into c from public.support_conversations where id = p_conv for update;
  if not found or c.status <> 'offered' or c.offered_to is distinct from v then
    raise exception 'Esta conversación ya no se le ofrece.' using errcode = '42501';
  end if;
  if c.offer_expires_at < now() then
    raise exception 'La oferta venció.' using errcode = '23514';
  end if;
  select * into a from public.support_agents where id = v;
  perform public.support_assert_move(c.status, 'open');
  update public.support_conversations
     set status = 'open', assignee_id = v, offered_to = null, offer_expires_at = null, accepted_at = now()
   where id = p_conv returning * into c;
  -- Pilo se despide con estas palabras (no se cambian) y el chat pasa al agente.
  perform public.support_add_message(p_conv, 'outgoing', 'pilo', null, 'Pilo',
    'Hasta aquí termino yo, pero te dejo con un experto de la UDES que te puede ayudar. Recuerda que Pilo siempre está aquí cuando lo necesites.');
  perform public.support_add_message(p_conv, 'activity', 'system', v, 'Sistema', a.name || ' se unió a la conversación.');
  perform public.support_audit_add(p_conv, 'accept', v, null, v);
  return c;
end;
$$;

create or replace function public.support_decline(p_conv uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
  c public.support_conversations;
begin
  select * into c from public.support_conversations where id = p_conv for update;
  if not found or c.status <> 'offered' or c.offered_to is distinct from v then
    raise exception 'Esta conversación ya no se le ofrece.' using errcode = '42501';
  end if;
  perform public.support_assert_move(c.status, 'queued');
  update public.support_conversations
     set status = 'queued', declined_by = array_append(declined_by, v), offered_to = null, offer_expires_at = null
   where id = p_conv;
  perform public.support_audit_add(p_conv, 'offer_declined', v, v, null);
  perform public.support_dispatch(p_conv);
end;
$$;

-- Un agente toma una conversación que espera en su cola (sin esperar la oferta del reparto).
create or replace function public.support_take(p_conv uuid)
returns public.support_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
  c public.support_conversations;
begin
  select * into c from public.support_conversations where id = p_conv for update;
  if not found or not public.support_sees(c.team_id, c.assignee_id, c.offered_to) then
    raise exception 'No tiene acceso a esa conversación.' using errcode = '42501';
  end if;
  if c.status = 'queued' then
    perform public.support_assert_move(c.status, 'offered');
    update public.support_conversations set status = 'offered', offered_to = v, offer_expires_at = now() + interval '1 minute' where id = p_conv;
  elsif not (c.status = 'offered' and c.offered_to = v) then
    raise exception 'Esta conversación ya no está esperando.' using errcode = '23514';
  end if;
  return public.support_accept(p_conv);
end;
$$;

-- El director pide el reparto de una conversación en cola ahora mismo (al agente más libre en línea).
create or replace function public.support_assign_best(p_conv uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.support_is_director() then
    raise exception 'Solo el director reparte a mano.' using errcode = '42501';
  end if;
  update public.support_conversations set declined_by = '{}' where id = p_conv and status = 'queued';
  return public.support_dispatch(p_conv);
end;
$$;

-- Un mensaje del agente a la persona (o una nota privada para el equipo).
create or replace function public.support_send(p_conv uuid, p_body text, p_private boolean default false, p_files jsonb default '[]'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
  c public.support_conversations;
  a public.support_agents;
begin
  select * into c from public.support_conversations where id = p_conv for update;
  if not found or not public.support_sees(c.team_id, c.assignee_id, c.offered_to) then
    raise exception 'No tiene acceso a esa conversación.' using errcode = '42501';
  end if;
  select * into a from public.support_agents where id = v;
  if p_private then
    return public.support_add_message(p_conv, 'private_note', 'agent', v, a.name, p_body, p_files);
  end if;
  if c.status <> 'open' or not (c.assignee_id = v or a.role = 'director') then
    raise exception 'Solo quien atiende la conversación abierta puede escribirle a la persona.' using errcode = '42501';
  end if;
  return public.support_add_message(p_conv, 'outgoing', 'agent', v, a.name, p_body, p_files);
end;
$$;

-- Pasa la conversación a otro agente. Si estaba abierta, cambia de manos al instante; si esperaba, se le ofrece.
-- El motivo queda como nota privada para quien la recibe.
create or replace function public.support_reassign(p_conv uuid, p_to uuid, p_reason text default '')
returns public.support_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
  me public.support_agents;
  c public.support_conversations;
  dest public.support_agents;
  v_from uuid;
  pol public.support_assignment_policy;
begin
  select * into me from public.support_agents where id = v;
  select * into c from public.support_conversations where id = p_conv for update;
  if not found or not public.support_sees(c.team_id, c.assignee_id, c.offered_to) then
    raise exception 'No tiene acceso a esa conversación.' using errcode = '42501';
  end if;
  if not (me.role = 'director' or c.assignee_id = v) then
    raise exception 'Solo quien la atiende o el director puede reasignar.' using errcode = '42501';
  end if;
  select * into dest from public.support_agents where id = p_to and active;
  if not found then
    raise exception 'Ese agente no existe o está inactivo.' using errcode = '22023';
  end if;
  if c.status not in ('open', 'snoozed', 'queued', 'offered') then
    raise exception 'Una conversación cerrada no se reasigna.' using errcode = '23514';
  end if;
  v_from := coalesce(c.assignee_id, c.offered_to);

  if c.status in ('open', 'snoozed') then
    update public.support_conversations set assignee_id = p_to where id = p_conv returning * into c;
    perform public.support_add_message(p_conv, 'activity', 'system', null, 'Sistema', 'Te pasamos con ' || dest.name || ', que ya conoce tu caso.');
    perform public.support_add_message(p_conv, 'activity', 'system', v, 'Sistema', me.name || ' reasignó la conversación a ' || dest.name || '.', '[]'::jsonb, true);
  else
    select * into pol from public.support_assignment_policy where id = 1;
    if c.status = 'queued' then
      perform public.support_assert_move(c.status, 'offered');
    end if;
    update public.support_conversations
       set status = 'offered', offered_to = p_to, offer_expires_at = now() + make_interval(secs => pol.accept_seconds), offer_attempts = offer_attempts + 1
     where id = p_conv returning * into c;
  end if;
  if coalesce(trim(p_reason), '') <> '' then
    perform public.support_add_message(p_conv, 'private_note', 'agent', v, me.name, 'Motivo de la reasignación: ' || trim(p_reason));
  end if;
  perform public.support_audit_add(p_conv, 'reassign', v, v_from, p_to, p_reason);
  return c;
end;
$$;

-- «Deshacer»: devuelve la conversación a quien la tenía, como una segunda reasignación auditada.
create or replace function public.support_undo_reassign(p_conv uuid)
returns public.support_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
  me public.support_agents;
  last public.support_audit;
  c public.support_conversations;
  back public.support_agents;
begin
  select * into me from public.support_agents where id = v;
  select * into last from public.support_audit where conversation_id = p_conv order by id desc limit 1;
  if not found or last.action <> 'reassign' or last.from_agent_id is null or last.created_at < now() - interval '5 minutes'
     or not (last.by_agent_id = v or me.role = 'director') then
    raise exception 'Ya no se puede deshacer esa reasignación.' using errcode = '23514';
  end if;
  select * into c from public.support_conversations where id = p_conv for update;
  if c.status <> 'open' or c.assignee_id is distinct from last.to_agent_id then
    raise exception 'Ya no se puede deshacer esa reasignación.' using errcode = '23514';
  end if;
  select * into back from public.support_agents where id = last.from_agent_id and active;
  if not found then
    raise exception 'Quien la tenía ya no está activo.' using errcode = '23514';
  end if;
  update public.support_conversations set assignee_id = back.id where id = p_conv returning * into c;
  perform public.support_add_message(p_conv, 'activity', 'system', null, 'Sistema', 'Te pasamos con ' || back.name || ', que ya conoce tu caso.');
  perform public.support_add_message(p_conv, 'activity', 'system', v, 'Sistema', me.name || ' deshizo la reasignación: vuelve con ' || back.name || '.', '[]'::jsonb, true);
  perform public.support_audit_add(p_conv, 'undo', v, last.to_agent_id, back.id);
  return c;
end;
$$;

create or replace function public.support_resolve(p_conv uuid)
returns public.support_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
  me public.support_agents;
  c public.support_conversations;
begin
  select * into me from public.support_agents where id = v;
  select * into c from public.support_conversations where id = p_conv for update;
  if not found or not public.support_sees(c.team_id, c.assignee_id, c.offered_to) then
    raise exception 'No tiene acceso a esa conversación.' using errcode = '42501';
  end if;
  if not (me.role = 'director' or c.assignee_id = v) then
    raise exception 'Solo quien la atiende o el director puede cerrarla.' using errcode = '42501';
  end if;
  perform public.support_assert_move(c.status, 'resolved');
  update public.support_conversations
     set status = 'resolved', resolved_at = now(), offered_to = null, offer_expires_at = null, snoozed_until = null
   where id = p_conv returning * into c;
  perform public.support_add_message(p_conv, 'activity', 'system', v, 'Sistema', 'La conversación se cerró. Pilo vuelve a preguntarte si te sirvió.');
  perform public.support_audit_add(p_conv, 'resolve', v, c.assignee_id, null);
  return c;
end;
$$;

create or replace function public.support_reopen(p_conv uuid)
returns public.support_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
  me public.support_agents;
  c public.support_conversations;
begin
  select * into me from public.support_agents where id = v;
  select * into c from public.support_conversations where id = p_conv for update;
  if not found or not public.support_sees(c.team_id, c.assignee_id, c.offered_to) then
    raise exception 'No tiene acceso a esa conversación.' using errcode = '42501';
  end if;
  perform public.support_assert_move(c.status, 'open');
  update public.support_conversations
     set status = 'open', resolved_at = null, assignee_id = coalesce(assignee_id, v), snoozed_until = null
   where id = p_conv returning * into c;
  perform public.support_audit_add(p_conv, 'reopen', v, null, c.assignee_id);
  return c;
end;
$$;

create or replace function public.support_snooze(p_conv uuid, p_until timestamptz default null)
returns public.support_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
  c public.support_conversations;
begin
  select * into c from public.support_conversations where id = p_conv for update;
  if not found or not public.support_sees(c.team_id, c.assignee_id, c.offered_to) then
    raise exception 'No tiene acceso a esa conversación.' using errcode = '42501';
  end if;
  perform public.support_assert_move(c.status, 'snoozed');
  update public.support_conversations set status = 'snoozed', snoozed_until = p_until where id = p_conv returning * into c;
  perform public.support_audit_add(p_conv, 'snooze', v, null, null);
  return c;
end;
$$;

-- Devuelve la conversación abierta a la cola (de un equipo): sale de manos de quien la tenía y se reparte de nuevo.
create or replace function public.support_requeue(p_conv uuid, p_team uuid default null, p_reason text default '')
returns public.support_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := public.support_require_agent();
  me public.support_agents;
  c public.support_conversations;
  v_from uuid;
begin
  select * into me from public.support_agents where id = v;
  select * into c from public.support_conversations where id = p_conv for update;
  if not found or not public.support_sees(c.team_id, c.assignee_id, c.offered_to) then
    raise exception 'No tiene acceso a esa conversación.' using errcode = '42501';
  end if;
  if not (me.role = 'director' or c.assignee_id = v) then
    raise exception 'Solo quien la atiende o el director puede devolverla a la cola.' using errcode = '42501';
  end if;
  if p_team is not null and not exists (select 1 from public.support_teams where id = p_team) then
    raise exception 'Ese equipo no existe.' using errcode = '22023';
  end if;
  perform public.support_assert_move(c.status, 'queued');
  v_from := c.assignee_id;
  update public.support_conversations
     set status = 'queued', assignee_id = null, offered_to = null, offer_expires_at = null, declined_by = array[v],
         team_id = coalesce(p_team, team_id), queued_at = now(), waiting_since = now()
   where id = p_conv returning * into c;
  perform public.support_add_message(p_conv, 'activity', 'system', v, 'Sistema', me.name || ' devolvió la conversación a la cola.', '[]'::jsonb, true);
  if coalesce(trim(p_reason), '') <> '' then
    perform public.support_add_message(p_conv, 'private_note', 'agent', v, me.name, 'Motivo: ' || trim(p_reason));
  end if;
  perform public.support_audit_add(p_conv, 'reassign', v, v_from, null, p_reason);
  perform public.support_dispatch(p_conv);
  select * into c from public.support_conversations where id = p_conv;
  return c;
end;
$$;

-- Etiquetas y prioridad de una conversación.
create or replace function public.support_update(p_conv uuid, p_labels text[] default null, p_priority text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.support_conversations;
begin
  perform public.support_require_agent();
  select * into c from public.support_conversations where id = p_conv;
  if not found or not public.support_sees(c.team_id, c.assignee_id, c.offered_to) then
    raise exception 'No tiene acceso a esa conversación.' using errcode = '42501';
  end if;
  if p_priority is not null and p_priority not in ('baja', 'media', 'alta', 'urgente') then
    raise exception 'Prioridad desconocida.' using errcode = '22023';
  end if;
  update public.support_conversations
     set labels = coalesce((select array_agg(distinct left(l, 40)) from unnest(p_labels) l where l <> ''), labels),
         priority = coalesce(p_priority, priority)
   where id = p_conv;
end;
$$;

-- Marca como entregado (y leído, si se está viendo) lo que escribió la persona.
create or replace function public.support_mark_read(p_conv uuid, p_read boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.support_conversations;
begin
  perform public.support_require_agent();
  select * into c from public.support_conversations where id = p_conv;
  if not found or not public.support_sees(c.team_id, c.assignee_id, c.offered_to) then
    return;
  end if;
  update public.support_messages
     set status = case when p_read then 'read' else 'delivered' end,
         delivered_at = coalesce(delivered_at, now()),
         read_at = case when p_read then coalesce(read_at, now()) else read_at end
   where conversation_id = p_conv and kind = 'incoming' and status <> 'read' and (p_read or status = 'sent');
end;
$$;

-- Informes básicos del director.
create or replace function public.support_report(p_from timestamptz default now() - interval '30 days', p_to timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.support_is_director() then
    raise exception 'Solo el director ve los informes.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.support_conversations where created_at between p_from and p_to),
    'resolved', (select count(*) from public.support_conversations where created_at between p_from and p_to and status = 'resolved'),
    'wait_minutes', (select round((avg(extract(epoch from (accepted_at - queued_at))) / 60)::numeric, 1) from public.support_conversations where created_at between p_from and p_to and accepted_at is not null and queued_at is not null),
    'handle_minutes', (select round((avg(extract(epoch from (resolved_at - accepted_at))) / 60)::numeric, 1) from public.support_conversations where created_at between p_from and p_to and resolved_at is not null and accepted_at is not null),
    'csat', (select round(avg(csat)::numeric, 2) from public.support_conversations where created_at between p_from and p_to and csat is not null),
    'csat_count', (select count(csat) from public.support_conversations where created_at between p_from and p_to),
    'by_space', coalesce((select jsonb_object_agg(space, n) from (select space, count(*) n from public.support_conversations where created_at between p_from and p_to group by space) s), '{}'::jsonb),
    'by_agent', coalesce((select jsonb_agg(jsonb_build_object('agent_id', assignee_id, 'total', n, 'csat', cs)) from (
        select assignee_id, count(*) n, round(avg(csat)::numeric, 2) cs from public.support_conversations
         where created_at between p_from and p_to and assignee_id is not null group by assignee_id) s), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- De la función `soporte` (quien escribe desde Pilo)
-- -----------------------------------------------------------------------------

create or replace function public.support_require_service()
returns void
language plpgsql
stable
as $$
begin
  if not public.support_is_service() then
    raise exception 'Solo la función de soporte usa esto.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.support_portal_state(p_space text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.support_portals;
begin
  perform public.support_require_service();
  select * into p from public.support_portals where space = p_space;
  if not found then
    return jsonb_build_object('agent_on', false, 'open', false, 'online', 0, 'messages', '{}'::jsonb);
  end if;
  return jsonb_build_object(
    'agent_on', p.agent_on,
    'open', p.agent_on and public.support_portal_open(p_space),
    'online', (select count(*) from public.support_agents a
                where a.active and a.availability = 'en_linea' and a.last_seen_at > now() - interval '90 seconds'
                  and (p.team_id is null or exists (select 1 from public.support_team_members m where m.team_id = p.team_id and m.agent_id = a.id))),
    'messages', p.messages
  );
end;
$$;

-- Crea la conversación con el consentimiento registrado y la deja en cola (Pilo ya tiene los datos).
create or replace function public.support_open(
  p_space text, p_name text, p_email text, p_phone text, p_city text, p_policy text,
  p_summary text, p_question text, p_secret_hash text, p_channel_key text, p_ip_hash text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.support_portals;
  v_contact uuid;
  v_conv uuid;
  v_after boolean;
begin
  perform public.support_require_service();
  select * into p from public.support_portals where space = p_space;
  if not found or not p.agent_on then
    raise exception 'Este portal no tiene atención por agente.' using errcode = '23514';
  end if;
  if coalesce(trim(p_policy), '') = '' then
    raise exception 'Falta la autorización de tratamiento de datos personales.' using errcode = '23514';
  end if;

  insert into public.support_contacts (name, email, phone, city)
  values (left(trim(p_name), 120), lower(trim(p_email)), left(coalesce(trim(p_phone), ''), 30), left(coalesce(trim(p_city), ''), 80))
  on conflict (email) do update set name = excluded.name, phone = excluded.phone, city = excluded.city, updated_at = now()
  returning id into v_contact;

  if exists (select 1 from public.support_conversations c where c.contact_id = v_contact and c.space = p_space and c.status <> 'resolved') then
    raise exception 'Ya tiene una conversación abierta con un agente.' using errcode = '23505';
  end if;

  v_after := not public.support_portal_open(p_space);
  insert into public.support_conversations (contact_id, space, team_id, pilo_summary, unanswered, secret_hash, channel_key, after_hours)
  values (v_contact, p_space, p.team_id, left(coalesce(p_summary, ''), 4000), left(coalesce(p_question, ''), 600), p_secret_hash, p_channel_key, v_after)
  returning id into v_conv;

  insert into public.support_consents (conversation_id, contact_id, policy_version, ip_hash)
  values (v_conv, v_contact, left(trim(p_policy), 40), left(coalesce(p_ip_hash, ''), 64));

  perform public.support_assert_move('pending', 'queued');
  update public.support_conversations set status = 'queued', queued_at = now(), waiting_since = now() where id = v_conv;
  if coalesce(trim(p_summary), '') <> '' then
    perform public.support_add_message(v_conv, 'activity', 'system', null, 'Pilo', 'Resumen de Pilo: ' || left(p_summary, 3900), '[]'::jsonb, true);
  end if;
  if coalesce(trim(p_question), '') <> '' then
    perform public.support_add_message(v_conv, 'activity', 'system', null, 'Pilo', 'Pilo no supo responder: ' || left(p_question, 600), '[]'::jsonb, true);
  end if;

  if p.agent_on and not v_after then
    perform public.support_dispatch(v_conv);
  end if;
  return jsonb_build_object('id', v_conv, 'after_hours', v_after);
end;
$$;

-- Lo que ve la persona: el estado, el agente (nombre y foto), los mensajes sin notas ni avisos del equipo
-- y su puesto en la fila. Marca como entregado lo que el agente escribió.
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

create or replace function public.support_student_send(p_conv uuid, p_hash text, p_body text, p_files jsonb default '[]'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.support_conversations;
  v_name text;
begin
  perform public.support_require_service();
  select * into c from public.support_conversations where id = p_conv and secret_hash = p_hash for update;
  if not found then
    raise exception 'No encontramos esa conversación.' using errcode = '42501';
  end if;
  if c.status = 'resolved' then
    raise exception 'Esta conversación ya se cerró.' using errcode = '23514';
  end if;
  if c.status = 'snoozed' then
    perform public.support_assert_move(c.status, 'open');
    update public.support_conversations set status = 'open', snoozed_until = null where id = p_conv;
  end if;
  select name into v_name from public.support_contacts where id = c.contact_id;
  return public.support_add_message(p_conv, 'incoming', 'student', null, v_name, p_body, p_files);
end;
$$;

-- La persona vio lo que escribió el agente.
create or replace function public.support_student_read(p_conv uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.support_require_service();
  if not exists (select 1 from public.support_conversations where id = p_conv and secret_hash = p_hash) then
    raise exception 'No encontramos esa conversación.' using errcode = '42501';
  end if;
  update public.support_messages
     set status = 'read', delivered_at = coalesce(delivered_at, now()), read_at = coalesce(read_at, now())
   where conversation_id = p_conv and kind = 'outgoing' and status <> 'read';
end;
$$;

create or replace function public.support_student_rate(p_conv uuid, p_hash text, p_score integer, p_comment text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.support_require_service();
  if p_score not between 1 and 5 then
    raise exception 'La calificación va de 1 a 5.' using errcode = '22023';
  end if;
  update public.support_conversations
     set csat = p_score, csat_comment = left(coalesce(p_comment, ''), 500)
   where id = p_conv and secret_hash = p_hash and status = 'resolved' and csat is null;
  if not found then
    raise exception 'No se puede calificar esta conversación.' using errcode = '23514';
  end if;
end;
$$;

-- La persona deja de esperar (vuelve a Pilo) antes de que un agente la tome.
create or replace function public.support_student_cancel(p_conv uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.support_conversations;
begin
  perform public.support_require_service();
  select * into c from public.support_conversations where id = p_conv and secret_hash = p_hash for update;
  if not found then
    raise exception 'No encontramos esa conversación.' using errcode = '42501';
  end if;
  if c.status not in ('queued', 'offered') then
    return;
  end if;
  perform public.support_assert_move(c.status, 'resolved');
  update public.support_conversations set status = 'resolved', resolved_at = now(), offered_to = null, offer_expires_at = null where id = p_conv;
  perform public.support_add_message(p_conv, 'activity', 'system', null, 'Sistema', 'La persona dejó de esperar y volvió con Pilo.', '[]'::jsonb, true);
  perform public.support_audit_add(p_conv, 'cancel', null, null, null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------

revoke all on function
  public.support_transition_ok(text, text), public.support_assert_move(text, text), public.support_attachment_ok(text, bigint),
  public.support_portal_open(text, timestamptz), public.support_audit_add(uuid, text, uuid, uuid, uuid, text),
  public.support_add_message(uuid, text, text, uuid, text, text, jsonb, boolean), public.support_dispatch(uuid),
  public.support_require_agent(), public.support_require_service()
from public, anon, authenticated;

-- Las reglas puras y el horario se pueden consultar (la pantalla las usa para mostrar el estado).
grant execute on function public.support_transition_ok(text, text), public.support_attachment_ok(text, bigint), public.support_portal_open(text, timestamptz) to authenticated, service_role;

revoke all on function
  public.support_tick(), public.support_claim(), public.support_heartbeat(), public.support_set_availability(text),
  public.support_update_profile(text), public.support_accept(uuid), public.support_decline(uuid),
  public.support_send(uuid, text, boolean, jsonb), public.support_reassign(uuid, uuid, text), public.support_undo_reassign(uuid),
  public.support_resolve(uuid), public.support_reopen(uuid), public.support_snooze(uuid, timestamptz),
  public.support_mark_read(uuid, boolean), public.support_report(timestamptz, timestamptz),
  public.support_requeue(uuid, uuid, text), public.support_update(uuid, text[], text),
  public.support_take(uuid), public.support_assign_best(uuid)
from public, anon;

-- Las de la persona anónima: solo el servicio (ni siquiera una sesión de agente).
revoke all on function
  public.support_portal_state(text), public.support_open(text, text, text, text, text, text, text, text, text, text, text),
  public.support_student_view(uuid, text, bigint), public.support_student_send(uuid, text, text, jsonb),
  public.support_student_read(uuid, text), public.support_student_rate(uuid, text, integer, text), public.support_student_cancel(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.support_tick(), public.support_claim(), public.support_heartbeat(), public.support_set_availability(text),
  public.support_update_profile(text), public.support_accept(uuid), public.support_decline(uuid),
  public.support_send(uuid, text, boolean, jsonb), public.support_reassign(uuid, uuid, text), public.support_undo_reassign(uuid),
  public.support_resolve(uuid), public.support_reopen(uuid), public.support_snooze(uuid, timestamptz),
  public.support_mark_read(uuid, boolean), public.support_report(timestamptz, timestamptz),
  public.support_requeue(uuid, uuid, text), public.support_update(uuid, text[], text),
  public.support_take(uuid), public.support_assign_best(uuid)
to authenticated, service_role;

grant execute on function
  public.support_portal_state(text), public.support_open(text, text, text, text, text, text, text, text, text, text, text),
  public.support_student_view(uuid, text, bigint), public.support_student_send(uuid, text, text, jsonb),
  public.support_student_read(uuid, text), public.support_student_rate(uuid, text, integer, text), public.support_student_cancel(uuid, text)
to service_role;

notify pgrst, 'reload schema';
