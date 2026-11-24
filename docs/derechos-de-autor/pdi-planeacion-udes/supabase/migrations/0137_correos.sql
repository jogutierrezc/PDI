-- =============================================================================
-- 0137 · Correos: las plantillas, los remitentes, la conexión y la bitácora.
--
-- Hasta aquí los correos de cuenta (activar la cuenta, cambiar la contraseña…)
-- los enviaba el servidor de cuentas con cinco archivos HTML publicados por el
-- portal (public/correos/). Cambiar una frase pedía editar un archivo, publicar
-- y a veces reiniciar; no había forma de ver cómo llegaba ni de saber si llegó,
-- y Mr. Pilo escribía con la voz de Planeación.
--
-- Desde aquí el servidor de cuentas le pasa cada pedido a la función `correos`
-- (gancho «Send Email» de Supabase Auth), que arma el correo con lo que la
-- administración escribió en la intranet y lo envía por SMTP. Esta migración
-- es lo que esa función y la pantalla «Correos» necesitan en la base:
--
--   correo_identities   quién firma: `plan` (Portal de Planeación) y `pilo`
--                       (Mr. Pilo). Nombre de remitente, dirección y
--                       «responder a». Dirección vacía: se usa el usuario de
--                       la conexión (con Microsoft 365 es lo que no falla).
--   correo_templates    lo que dice cada correo, por campos: asunto, línea
--                       previa, título, saludo, mensaje, botón y nota; y un
--                       mensaje por rol (estudiante, profesor, administrativo)
--                       cuando aplica. El diseño alrededor es fijo y vive en
--                       la función. El «texto original» no se guarda aquí:
--                       vive en el código (servidor-logica.ts, PLANTILLAS),
--                       que es lo que se siembra abajo; una prueba vigila que
--                       sean iguales. Una plantilla apagada (`active`) sale
--                       con su texto original.
--   correo_settings     fila única: el servidor SMTP, los topes, los dominios
--                       permitidos y el interruptor general.
--   correo_secret       la contraseña SMTP. RLS sin políticas y sin permisos
--                       para nadie del portal: solo la lee el rol de servicio.
--   correo_log          la bitácora: cuándo, identidad, plantilla y rol, el
--                       destinatario ENMASCARADO (la tabla rechaza uno sin
--                       tapar), una huella para contar el tope por persona,
--                       el resultado y el motivo. Nunca el contenido ni el
--                       enlace.
--
--   correo_secret_set(valor)     guarda la contraseña; devuelve solo sus 4
--                                últimos (nada si es muy corta).
--   correo_secret_status()       si hay contraseña, sus 4 últimos y cuándo.
--   correo_context(huella, id)   todo lo que la función necesita para un
--                                envío, en un solo viaje: ajustes, contraseña,
--                                remitentes, plantillas, cuántos correos van en
--                                la hora y cuántos de cuenta lleva esa persona
--                                en 24 horas. Solo el rol de servicio.
--
-- Quién puede qué: solo la administración lee y cambia remitentes, plantillas
-- y ajustes; Planeación (y la administración) lee la bitácora; nadie del
-- portal la escribe. La función lee y anota con el rol de servicio.
--
-- Lo que se siembra son las plantillas que SÍ se envían en esta entrega. Los
-- avisos («se publicó un informe», recordatorios de Moodle) quedan para
-- después. Volver a aplicar esta migración no pisa lo que ya se escribió.
--
-- Vuelta atrás: apagar el gancho en el servidor de cuentas devuelve los
-- correos a public/correos/. Estas tablas pueden quedarse: nadie más las lee.
--
-- Todo DELETE y UPDATE lleva WHERE (safeupdate, ver 0095). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Quién cambió qué y cuándo: lo pone la base, no quien escribe.
-- -----------------------------------------------------------------------------

create or replace function public.correo_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function public.correo_touch() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Las identidades.
-- -----------------------------------------------------------------------------

create table if not exists public.correo_identities (
  id          text primary key,
  from_name   text not null,
  address     text not null default '',
  reply_to    text not null default '',
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint correo_identities_id check (id in ('plan', 'pilo')),
  constraint correo_identities_name check (length(from_name) between 1 and 80 and from_name = btrim(from_name) and from_name !~ '[\n\r\t<>"]'),
  constraint correo_identities_address check (address = '' or (address ~ '^[^@[:space:]<>",;]+@[^@[:space:]<>",;]+\.[^@[:space:]<>",;.]+$' and length(address) <= 254)),
  constraint correo_identities_reply check (reply_to = '' or (reply_to ~ '^[^@[:space:]<>",;]+@[^@[:space:]<>",;]+\.[^@[:space:]<>",;.]+$' and length(reply_to) <= 254))
);

comment on table public.correo_identities is
  'Correos (0137): quién firma cada correo. plan = Portal de Planeación, pilo = Mr. Pilo. Dirección vacía: se usa el usuario de la conexión SMTP. Solo la administración.';

alter table public.correo_identities enable row level security;

drop policy if exists correo_identities_admin_read on public.correo_identities;
create policy correo_identities_admin_read on public.correo_identities
  for select to authenticated
  using (public.has_role_at_least('admin'));

drop policy if exists correo_identities_admin_write on public.correo_identities;
create policy correo_identities_admin_write on public.correo_identities
  for update to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

revoke all on public.correo_identities from public, anon, authenticated;
grant select on public.correo_identities to authenticated, service_role;
grant update (from_name, address, reply_to) on public.correo_identities to authenticated;

drop trigger if exists correo_identities_touch on public.correo_identities;
create trigger correo_identities_touch before update on public.correo_identities
  for each row execute function public.correo_touch();

insert into public.correo_identities (id, from_name)
values ('plan', 'Planeación UDES'), ('pilo', 'Mr. Pilo · UDES')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Las plantillas.
-- -----------------------------------------------------------------------------

create table if not exists public.correo_templates (
  key          text primary key,
  identity     text not null references public.correo_identities (id),
  grp          text not null,
  name         text not null,
  sent_when    text not null default '',
  -- El pedido del servidor de cuentas que la dispara (invite, recovery…).
  action       text not null default '',
  subject      text not null,
  preheader    text not null default '',
  title        text not null,
  greeting     text not null default '',
  body         text not null default '',
  button       text not null,
  note         text not null default '',
  -- Un mensaje por rol, o nulo si el mensaje es uno solo (`body`).
  role_bodies  jsonb,
  active       boolean not null default true,
  sort         integer not null default 0,
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint correo_templates_key check (key ~ '^[a-z][a-z0-9_-]{2,39}$'),
  constraint correo_templates_lines check (
    length(grp) between 1 and 80 and length(name) between 1 and 80 and length(sent_when) <= 120 and length(action) <= 40
    and length(btrim(subject)) between 1 and 200 and subject !~ '[\n\r\t]'
    and length(preheader) <= 200 and preheader !~ '[\n\r\t]'
    and length(btrim(title)) between 1 and 200 and title !~ '[\n\r\t]'
    and length(greeting) <= 200 and greeting !~ '[\n\r\t]'
    and length(btrim(button)) between 1 and 80 and button !~ '[\n\r\t]'
    and length(body) <= 4000 and length(note) <= 600
  ),
  constraint correo_templates_roles check (
    role_bodies is null or (
      jsonb_typeof(role_bodies) = 'object'
      and coalesce(jsonb_typeof(role_bodies -> 'estudiante') = 'string', false)
      and coalesce(jsonb_typeof(role_bodies -> 'profesor') = 'string', false)
      and coalesce(jsonb_typeof(role_bodies -> 'administrativo') = 'string', false)
      and (role_bodies - 'estudiante' - 'profesor' - 'administrativo') = '{}'::jsonb
      and length(role_bodies ->> 'estudiante') <= 4000
      and length(role_bodies ->> 'profesor') <= 4000
      and length(role_bodies ->> 'administrativo') <= 4000
    )
  ),
  -- Un correo no sale sin mensaje: o el común, o el de estudiante (que es el respaldo de los demás roles).
  constraint correo_templates_message check (
    (role_bodies is null and btrim(body) <> '') or (role_bodies is not null and btrim(role_bodies ->> 'estudiante') <> '')
  )
);

comment on table public.correo_templates is
  'Correos (0137): lo que dice cada correo, por campos. El diseño es fijo y vive en la función `correos`; el texto original, en servidor-logica.ts. Solo la administración.';

alter table public.correo_templates enable row level security;

drop policy if exists correo_templates_admin_read on public.correo_templates;
create policy correo_templates_admin_read on public.correo_templates
  for select to authenticated
  using (public.has_role_at_least('admin'));

drop policy if exists correo_templates_admin_write on public.correo_templates;
create policy correo_templates_admin_write on public.correo_templates
  for update to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

revoke all on public.correo_templates from public, anon, authenticated;
grant select on public.correo_templates to authenticated, service_role;
-- Solo los textos: la clave, la identidad y cuándo se envía no se cambian desde el portal.
grant update (subject, preheader, title, greeting, body, button, note, role_bodies, active) on public.correo_templates to authenticated;

drop trigger if exists correo_templates_touch on public.correo_templates;
create trigger correo_templates_touch before update on public.correo_templates
  for each row execute function public.correo_touch();

-- Los textos originales: los mismos de PLANTILLAS en servidor-logica.ts.
insert into public.correo_templates (key, identity, grp, name, sent_when, action, sort, subject, preheader, title, greeting, body, button, note, role_bodies)
values
  ('plan-invite', 'plan', 'Cuentas de la intranet', 'Activar la cuenta', 'Al crear un usuario', 'invite', 10,
   'Active su cuenta de Planeación UDES', 'Su cuenta está lista: elija su contraseña.', 'Active su cuenta', 'Hola, {{nombre}}.',
   E'La Dirección de Planeación le creó una cuenta en la intranet, con el correo {{correo}}.\nPara activarla y elegir su contraseña, abra este enlace.',
   'Activar mi cuenta', 'El enlace sirve una sola vez. Si no esperaba este mensaje, puede ignorarlo.', null),
  ('plan-recovery', 'plan', 'Cuentas de la intranet', 'Cambiar la contraseña', '«Olvidé mi contraseña»', 'recovery', 20,
   'Cambie su contraseña', 'Abra el enlace y escriba la nueva.', 'Cambie su contraseña', 'Hola, {{nombre}}.',
   E'Recibimos una solicitud para cambiar la contraseña de la cuenta {{correo}}.\nAbra este enlace y escriba la contraseña nueva.',
   'Cambiar mi contraseña', 'Si usted no lo pidió, ignore este mensaje: su contraseña sigue siendo la misma.', null),
  ('plan-email_change', 'plan', 'Cuentas de la intranet', 'Confirmar el correo nuevo', 'Al cambiar el correo', 'email_change', 30,
   'Confirme su correo nuevo', '', 'Confirme su correo nuevo', 'Hola, {{nombre}}.',
   'Pidió cambiar el correo de su cuenta. Para que el cambio quede hecho, confírmelo desde este enlace.',
   'Confirmar el cambio', 'Si usted no lo pidió, ignore este mensaje.', null),
  ('plan-signup', 'plan', 'Cuentas de la intranet', 'Confirmar el correo', 'Si alguien se registra por su cuenta', 'signup', 40,
   'Confirme su correo', 'Un paso más para terminar el registro.', 'Confirme su correo', 'Hola, {{nombre}}.',
   E'Alguien creó una cuenta con el correo {{correo}} en los portales de Planeación UDES.\nPara terminar el registro, confirme que este correo es suyo.',
   'Confirmar mi correo', 'Si usted no creó esta cuenta, ignore este mensaje: sin confirmar, la cuenta no se activa.', null),
  ('plan-magiclink', 'plan', 'Cuentas de la intranet', 'Enlace de acceso', 'Al pedir entrar con un enlace', 'magiclink', 50,
   'Su enlace para entrar', 'Entre sin escribir la contraseña.', 'Su enlace para entrar', 'Hola, {{nombre}}.',
   E'Pidió entrar a los portales de Planeación UDES con el correo {{correo}}.\nAbra este enlace para entrar sin escribir la contraseña.',
   'Entrar', 'El enlace sirve una sola vez y vence pronto. Si usted no lo pidió, ignore este mensaje.', null),
  ('pilo-invite', 'pilo', 'Cuenta de Pilo', 'Bienvenida y confirmación', 'Al crear la cuenta de Pilo', 'invite', 10,
   '{{nombre}}, confirme su cuenta de Mr. Pilo', 'Un paso más y empezamos.', '¡Qué bueno tenerlo por aquí!', 'Hola, {{nombre}}.',
   '', 'Confirmar mi cuenta', 'Si usted no creó esta cuenta, ignore este mensaje: sin confirmar, no se activa.',
   jsonb_build_object(
     'estudiante', E'Soy Mr. Pilo. Con su cuenta de {{sede}} puedo ayudarle a estudiar: explicarle un tema, recordarle sus entregas de Moodle y mostrarle sus notas.\nPara empezar, confirme que este correo es suyo.',
     'profesor', E'Soy Mr. Pilo. Con su cuenta de {{sede}} puedo apoyarle en su labor docente: políticas institucionales, innovación educativa y sus cursos de Moodle.\nPara empezar, confirme que este correo es suyo.',
     'administrativo', E'Soy Mr. Pilo. Con su cuenta de {{sede}} puedo responderle sobre las cifras, los planes y las políticas de la universidad.\nPara empezar, confirme que este correo es suyo.'
   )),
  ('pilo-recovery', 'pilo', 'Cuenta de Pilo', 'Cambiar la contraseña', '«Olvidé mi contraseña» en Pilo', 'recovery', 20,
   'Cambie su contraseña de Mr. Pilo', '', 'Cambiemos su contraseña', 'Hola, {{nombre}}.',
   'Me pidieron cambiar la contraseña de su cuenta. Abra este enlace y escriba la nueva.',
   'Cambiar mi contraseña', 'Si usted no lo pidió, ignore este mensaje: su contraseña sigue siendo la misma.', null)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Los ajustes: una sola fila.
-- -----------------------------------------------------------------------------

create table if not exists public.correo_settings (
  id                  boolean primary key default true,
  -- El interruptor general: apagado, la función no envía ningún correo de cuenta.
  enabled             boolean not null default true,
  smtp_host           text not null default '',
  smtp_port           integer not null default 587,
  smtp_security       text not null default 'starttls',
  smtp_user           text not null default '',
  -- 0 es «sin tope».
  hourly_limit        integer not null default 200,
  person_daily_limit  integer not null default 5,
  -- Vacío: a cualquiera. Un dominio incluye sus subdominios.
  allowed_domains     text[] not null default '{}'::text[],
  updated_by          uuid references public.profiles (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint correo_settings_one check (id),
  constraint correo_settings_host check (smtp_host = '' or (smtp_host ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' and length(smtp_host) <= 200)),
  constraint correo_settings_port check (smtp_port between 1 and 65535),
  constraint correo_settings_security check (smtp_security in ('starttls', 'ssl')),
  constraint correo_settings_user check (length(smtp_user) <= 254 and smtp_user !~ '[[:space:]]'),
  constraint correo_settings_limits check (hourly_limit between 0 and 100000 and person_daily_limit between 0 and 1000),
  constraint correo_settings_domains check (
    coalesce(array_length(allowed_domains, 1), 0) <= 40
    and array_to_string(allowed_domains, ' ') ~ '^([a-z0-9-]+(\.[a-z0-9-]+)+( |$))*$'
  )
);

comment on table public.correo_settings is
  'Correos (0137): la conexión SMTP (sin la contraseña, que va en correo_secret), los topes, los dominios permitidos y el interruptor general. Una sola fila. Solo la administración.';

alter table public.correo_settings enable row level security;

drop policy if exists correo_settings_admin_read on public.correo_settings;
create policy correo_settings_admin_read on public.correo_settings
  for select to authenticated
  using (public.has_role_at_least('admin'));

drop policy if exists correo_settings_admin_write on public.correo_settings;
create policy correo_settings_admin_write on public.correo_settings
  for update to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

revoke all on public.correo_settings from public, anon, authenticated;
grant select on public.correo_settings to authenticated, service_role;
grant update (enabled, smtp_host, smtp_port, smtp_security, smtp_user, hourly_limit, person_daily_limit, allowed_domains) on public.correo_settings to authenticated;

drop trigger if exists correo_settings_touch on public.correo_settings;
create trigger correo_settings_touch before update on public.correo_settings
  for each row execute function public.correo_touch();

insert into public.correo_settings (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- El secreto: la contraseña SMTP. Nadie la lee desde el portal.
-- -----------------------------------------------------------------------------

create table if not exists public.correo_secret (
  id             boolean primary key default true,
  smtp_password  text not null default '',
  updated_by     uuid references public.profiles (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint correo_secret_one check (id),
  constraint correo_secret_len check (length(smtp_password) <= 400)
);

comment on table public.correo_secret is
  'Correos (0137): la contraseña SMTP. Nadie la lee desde el portal: solo la función del servidor, con el rol de servicio. Se guarda con correo_secret_set.';

alter table public.correo_secret enable row level security;
revoke all on public.correo_secret from public, anon, authenticated;
grant select on public.correo_secret to service_role;

create or replace function public.correo_secret_set(p_value text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Una contraseña puede llevar espacios por dentro: solo se quitan los saltos de línea de pegarla.
  clean text := regexp_replace(coalesce(p_value, ''), '[\r\n\t]', '', 'g');
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración guarda la contraseña del correo.' using errcode = '42501';
  end if;
  if length(clean) > 400 then
    raise exception 'La contraseña es demasiado larga.' using errcode = '22023';
  end if;
  insert into public.correo_secret as k (id, smtp_password, updated_by, updated_at)
  values (true, clean, auth.uid(), now())
  on conflict (id) do update set smtp_password = excluded.smtp_password, updated_by = excluded.updated_by, updated_at = now();
  -- De una contraseña corta, cuatro caracteres serían media contraseña: no se devuelve nada.
  return case when length(clean) >= 8 then right(clean, 4) else '' end;
end;
$$;

revoke all on function public.correo_secret_set(text) from public, anon;
grant execute on function public.correo_secret_set(text) to authenticated;

create or replace function public.correo_secret_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k public.correo_secret;
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la administración ve el estado de la contraseña del correo.' using errcode = '42501';
  end if;
  select * into k from public.correo_secret s where s.id;
  return jsonb_build_object(
    'has', coalesce(k.smtp_password, '') <> '',
    'last4', case when length(coalesce(k.smtp_password, '')) >= 8 then right(k.smtp_password, 4) else '' end,
    'updated_at', k.updated_at
  );
end;
$$;

revoke all on function public.correo_secret_status() from public, anon;
grant execute on function public.correo_secret_status() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- La bitácora.
-- -----------------------------------------------------------------------------

create table if not exists public.correo_log (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  -- cuenta: lo pidió el servidor de cuentas · prueba: «Enviar una prueba» · aviso: para después.
  kind            text not null default 'cuenta',
  identity        text not null,
  template        text not null default '',
  rol             text not null default '',
  action          text not null default '',
  -- Enmascarado: l•••a.gomez@mail.udes.edu.co. La tabla rechaza una dirección sin tapar.
  recipient       text not null,
  -- Huella con sal del destinatario: para contar su tope sin guardar su correo.
  recipient_hash  text not null default '',
  result          text not null,
  reason          text not null default '',
  -- El número de pedido del servidor de cuentas: si lo repite, no se envía dos veces.
  hook_id         text not null default '',
  constraint correo_log_kind check (kind in ('cuenta', 'prueba', 'aviso')),
  constraint correo_log_identity check (identity in ('plan', 'pilo')),
  constraint correo_log_rol check (rol in ('', 'estudiante', 'profesor', 'administrativo')),
  constraint correo_log_recipient check (position('•••' in recipient) > 0 and length(recipient) <= 260),
  constraint correo_log_hash check (recipient_hash ~ '^[0-9a-f]{0,64}$'),
  constraint correo_log_result check (result in ('aceptado', 'rechazado', 'en_espera')),
  constraint correo_log_text check (length(template) <= 40 and length(action) <= 40 and length(reason) <= 300 and length(hook_id) <= 120)
);

create index if not exists correo_log_created_idx on public.correo_log (created_at desc);
create index if not exists correo_log_person_idx on public.correo_log (recipient_hash, created_at desc);
create index if not exists correo_log_hook_idx on public.correo_log (hook_id) where hook_id <> '';

comment on table public.correo_log is
  'Correos (0137): cada correo que salió o se rechazó. Sin el contenido ni el enlace; el destinatario va enmascarado. La lee Planeación; la escribe solo la función, con el rol de servicio.';

alter table public.correo_log enable row level security;

drop policy if exists correo_log_read on public.correo_log;
create policy correo_log_read on public.correo_log
  for select to authenticated
  using (public.has_role_at_least('planeacion'));

revoke all on public.correo_log from public, anon, authenticated;
grant select on public.correo_log to authenticated;
grant select, insert on public.correo_log to service_role;

-- -----------------------------------------------------------------------------
-- Todo lo que la función necesita para un envío, en un solo viaje. El servidor
-- de cuentas espera pocos segundos: no hay tiempo para seis consultas.
-- -----------------------------------------------------------------------------

create or replace function public.correo_context(p_hash text default '', p_hook text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Solo la función de correos lee su configuración completa.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'updated_by' from public.correo_settings s where s.id),
    'password', coalesce((select k.smtp_password from public.correo_secret k where k.id), ''),
    'identities', coalesce((select jsonb_object_agg(i.id, jsonb_build_object('from_name', i.from_name, 'address', i.address, 'reply_to', i.reply_to)) from public.correo_identities i), '{}'::jsonb),
    'templates', coalesce((select jsonb_object_agg(t.key, to_jsonb(t) - 'updated_by' - 'updated_at') from public.correo_templates t), '{}'::jsonb),
    -- Cuántos correos aceptó el servidor en la última hora.
    'in_hour', (select count(*) from public.correo_log l where l.result = 'aceptado' and l.created_at > now() - interval '1 hour'),
    -- Cuántos correos de cuenta lleva esa persona en las últimas 24 horas.
    'person_day', case when coalesce(p_hash, '') = '' then 0 else
      (select count(*) from public.correo_log l where l.recipient_hash = p_hash and l.kind = 'cuenta' and l.result = 'aceptado' and l.created_at > now() - interval '24 hours') end,
    -- ¿Este mismo pedido ya salió para esa persona? (El servidor de cuentas reintenta si no alcanza a oír la respuesta.)
    'repeated', case when coalesce(p_hook, '') = '' then false else
      exists (select 1 from public.correo_log l where l.hook_id = p_hook and l.recipient_hash = coalesce(p_hash, '') and l.result = 'aceptado') end
  );
end;
$$;

revoke all on function public.correo_context(text, text) from public, anon, authenticated;
grant execute on function public.correo_context(text, text) to service_role;

notify pgrst, 'reload schema';
