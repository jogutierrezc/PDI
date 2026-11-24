-- =============================================================================
-- 0256 · Internacionalización › Gestión de convenios, parte 1: avisos de vencimiento
--
-- Se apoya en 0255 (Convenios), 0254 (Relaciones) y 0137 (Correos). Idempotente.
--
--   conv_convenios.idioma      es | en: el idioma de la contraparte. Se llena solo por el
--                              país al crear (conv_idioma_por_pais) y se corrige en el detalle.
--   conv_aviso_config          una sola fila: hora de envío (Bogotá), solo días hábiles,
--                              detener al registrar renovación, modo (prueba = Mailpit,
--                              real = SMTP institucional), remitente y tope por ejecución.
--   conv_aviso_reglas          días antes (+) o después (−) del vencimiento, destinatarios, plantilla.
--   conv_correo_plantillas     plantillas de correo por clave + idioma (asunto y cuerpo HTML).
--                              Incluye las dos de la firma electrónica (parte 2):
--                              firma_solicitud y firma_certificado.
--   conv_aviso_envios          bitácora de envíos. El índice único parcial impide que el mismo
--                              aviso (convenio + regla + fecha de vencimiento) salga dos veces,
--                              aunque la función corra dos veces o se reinicie.
--   conv_contactos_de(texto)   contactos de una institución en el Directorio de Relaciones
--                              (mismo emparejamiento del botón «Avisar»). Solo service_role.
--
-- Quién puede qué: ven quienes cumplen int_ve_modulo(); escriben quienes cumplen
-- int_puede_crear(). La bitácora solo la escribe la función conv-avisos (rol de servicio).
--
-- PROGRAMAR EL ENVÍO DIARIO (paso manual, una sola vez; sigue el patrón de 0138 y 0213)
-- ---------------------------------------------------------------------------------------
-- La función conv-avisos (acción «ejecutar») decide sola si ya es la hora configurada en
-- Bogotá y no repite lo ya enviado, así que basta con llamarla CADA HORA, al minuto cinco.
-- (Ella omite los fines de semana si «solo días hábiles» está activo y recupera hasta 7 días
-- de retraso, por ejemplo un aviso que cayó en sábado.)
--
-- Secreto de función (una vez):  supabase secrets set CONV_AVISOS_CRON=<valor largo al azar>
--
-- A) Con pg_cron + pg_net (en Coolify hay que activar las extensiones primero):
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net with schema extensions;
--   select cron.schedule('conv-avisos-diario', '5 * * * *', $cron$
--     select net.http_post(
--       url     := 'https://<su-dominio>/functions/v1/conv-avisos',
--       headers := jsonb_build_object('Content-Type', 'application/json', 'x-conv-cron', '<CONV_AVISOS_CRON>'),
--       body    := '{"action":"ejecutar"}'::jsonb
--     );
--   $cron$);
--   -- Quitarla: select cron.unschedule('conv-avisos-diario');
--
-- B) Sin pg_cron: una tarea programada de Coolify cada hora con
--     curl -s -X POST https://<su-dominio>/functions/v1/conv-avisos \
--          -H "x-conv-cron: $CONV_AVISOS_CRON" -H "Content-Type: application/json" -d '{"action":"ejecutar"}'
--
-- La dirección debe ser la PÚBLICA https de la función (no la red interna). La función se despliega
-- sin verificación de JWT (las acciones manuales validan la sesión a mano):
--     supabase functions deploy conv-avisos --no-verify-jwt
--
-- Variables de la función: CONV_AVISOS_CRON (obligatoria para el cron), REL_MAILPIT_HOST y
-- REL_MAILPIT_PORT (modo prueba), SMTP_* o lo guardado en la intranet (Sistema › Correos) para el
-- modo real, CONV_URL_APP (base pública de la intranet; por omisión https://planeacion.udes.edu.co),
-- CONV_LOGO_URL (logo del encabezado de los correos; por omisión el PNG blanco de la UDES).
-- El modo inicial es «prueba»: nada sale a personas de afuera hasta que la oficina lo cambie.
-- Todo DELETE lleva WHERE (safeupdate, 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Idioma de la contraparte
-- -----------------------------------------------------------------------------

alter table public.conv_convenios add column if not exists idioma text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conv_idioma' and conrelid = 'public.conv_convenios'::regclass) then
    alter table public.conv_convenios add constraint conv_idioma check (idioma is null or idioma in ('es', 'en'));
  end if;
end $$;

/** Países hispanohablantes (y Colombia) → es; el resto → en. «Sin país» y «Varios países» → es. */
create or replace function public.conv_idioma_por_pais(p_pais text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when lower(translate(btrim(coalesce(p_pais, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')) in (
    '', 'colombia', 'espana', 'mexico', 'argentina', 'chile', 'peru', 'ecuador', 'bolivia', 'venezuela',
    'uruguay', 'paraguay', 'panama', 'costa rica', 'cuba', 'republica dominicana', 'honduras', 'guatemala',
    'el salvador', 'nicaragua', 'puerto rico', 'guinea ecuatorial', 'sin pais', 'varios paises'
  ) then 'es' else 'en' end;
$$;

create or replace function public.conv_fijar_idioma()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.idioma is null then
    new.idioma := public.conv_idioma_por_pais(new.pais);
  end if;
  return new;
end;
$$;

drop trigger if exists conv_convenios_idioma on public.conv_convenios;
create trigger conv_convenios_idioma before insert on public.conv_convenios
  for each row execute function public.conv_fijar_idioma();

update public.conv_convenios set idioma = public.conv_idioma_por_pais(pais) where idioma is null;

-- -----------------------------------------------------------------------------
-- 2. Configuración y reglas
-- -----------------------------------------------------------------------------

create table if not exists public.conv_aviso_config (
  id                  boolean primary key default true,
  activo              boolean not null default true,
  hora                time not null default '08:00',
  solo_habiles        boolean not null default true,
  detener_renovacion  boolean not null default true,
  -- prueba = todo a Mailpit; real = SMTP institucional (sale a personas de afuera).
  modo                text not null default 'prueba',
  remitente           text not null default 'Relaciones Internacionales UDES <relaciones.internacionales@udes.edu.co>',
  correo_direccion    text not null default 'relaciones.internacionales@udes.edu.co',
  tope_ejecucion      integer not null default 40,
  updated_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint conv_aviso_config_unica check (id),
  constraint conv_aviso_config_modo check (modo in ('prueba', 'real')),
  constraint conv_aviso_config_tope check (tope_ejecucion between 1 and 200),
  constraint conv_aviso_config_remitente check (char_length(remitente) between 5 and 254),
  constraint conv_aviso_config_direccion check (correo_direccion ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

insert into public.conv_aviso_config (id) values (true) on conflict (id) do nothing;

drop trigger if exists conv_aviso_config_set_updated_at on public.conv_aviso_config;
create trigger conv_aviso_config_set_updated_at before update on public.conv_aviso_config
  for each row execute function public.set_updated_at();

create table if not exists public.conv_correo_plantillas (
  clave       text not null,
  idioma      text not null,
  nombre      text not null,
  -- interna: para el equipo; externa: para la contraparte; ambas: sirve a los dos.
  audiencia   text not null default 'interna',
  asunto      text not null,
  cuerpo      text not null,
  updated_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (clave, idioma),
  constraint conv_correo_plantillas_idioma check (idioma in ('es', 'en')),
  constraint conv_correo_plantillas_audiencia check (audiencia in ('interna', 'externa', 'ambas')),
  constraint conv_correo_plantillas_clave check (clave ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint conv_correo_plantillas_largo check (char_length(asunto) between 1 and 200 and char_length(cuerpo) between 1 and 20000)
);

drop trigger if exists conv_correo_plantillas_set_updated_at on public.conv_correo_plantillas;
create trigger conv_correo_plantillas_set_updated_at before update on public.conv_correo_plantillas
  for each row execute function public.set_updated_at();

create table if not exists public.conv_aviso_reglas (
  id              uuid primary key default gen_random_uuid(),
  -- Positivo: días ANTES de terminar. 0: el día del vencimiento. Negativo: días DESPUÉS.
  dias            integer not null,
  activa          boolean not null default true,
  destinatarios   text[] not null default array['responsable']::text[],
  plantilla_clave text not null,
  canal           text not null default 'correo',
  orden           integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint conv_aviso_reglas_dias check (dias between -365 and 365),
  constraint conv_aviso_reglas_dest check (
    cardinality(destinatarios) >= 1
    and destinatarios <@ array['responsable', 'coordinacion', 'contacto', 'direccion']::text[]
  ),
  constraint conv_aviso_reglas_canal check (canal = 'correo')
);

drop trigger if exists conv_aviso_reglas_set_updated_at on public.conv_aviso_reglas;
create trigger conv_aviso_reglas_set_updated_at before update on public.conv_aviso_reglas
  for each row execute function public.set_updated_at();

insert into public.conv_aviso_reglas (dias, activa, destinatarios, plantilla_clave, orden)
select v.dias, v.activa, v.dest, v.clave, v.orden
  from (values
    (180, true,  array['responsable']::text[],                                          'aviso_interno',      1),
    (90,  true,  array['responsable', 'coordinacion']::text[],                          'aviso_coordinacion', 2),
    (60,  true,  array['responsable', 'coordinacion', 'contacto']::text[],              'invitacion_renovar', 3),
    (30,  true,  array['responsable', 'coordinacion', 'contacto', 'direccion']::text[], 'ultima_llamada',     4),
    (0,   true,  array['responsable', 'direccion']::text[],                             'vencido_hoy',        5),
    (-30, false, array['responsable', 'direccion']::text[],                             'seguimiento',        6)
  ) as v(dias, activa, dest, clave, orden)
 where not exists (select 1 from public.conv_aviso_reglas);

-- -----------------------------------------------------------------------------
-- 3. Bitácora
-- -----------------------------------------------------------------------------

create table if not exists public.conv_aviso_envios (
  id                 uuid primary key default gen_random_uuid(),
  convenio_id        uuid not null references public.conv_convenios (id) on delete cascade,
  regla_id           uuid references public.conv_aviso_reglas (id) on delete set null,
  regla_dias         integer,
  fecha_vencimiento  date not null,
  -- [{rol, correo, idioma, ok, error?}]
  destinatarios      jsonb not null default '[]'::jsonb,
  idioma             text,
  estado             text not null default 'pendiente',
  error              text,
  modo               text not null default 'prueba',
  origen             text not null default 'automatico',
  creado_por         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint conv_aviso_envios_estado check (estado in ('pendiente', 'enviado', 'error', 'rebote', 'sin_contacto')),
  constraint conv_aviso_envios_modo check (modo in ('prueba', 'real')),
  constraint conv_aviso_envios_origen check (origen in ('automatico', 'manual')),
  constraint conv_aviso_envios_dest check (jsonb_typeof(destinatarios) = 'array')
);

create index if not exists conv_aviso_envios_convenio_idx on public.conv_aviso_envios (convenio_id, created_at desc);
create index if not exists conv_aviso_envios_fecha_idx on public.conv_aviso_envios (created_at desc);

-- El mismo aviso automático no sale dos veces. Un intento con error (o un envío manual) no lo bloquea.
create unique index if not exists conv_aviso_envios_unico
  on public.conv_aviso_envios (convenio_id, regla_id, fecha_vencimiento)
  where origen = 'automatico' and regla_id is not null and estado in ('pendiente', 'enviado', 'sin_contacto', 'rebote');

-- -----------------------------------------------------------------------------
-- 4. Seguridad
-- -----------------------------------------------------------------------------

alter table public.conv_aviso_config enable row level security;
alter table public.conv_correo_plantillas enable row level security;
alter table public.conv_aviso_reglas enable row level security;
alter table public.conv_aviso_envios enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['conv_aviso_config', 'conv_correo_plantillas', 'conv_aviso_reglas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.int_ve_modulo())', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.int_puede_crear()) with check (public.int_puede_crear())', t || '_update', t);
  end loop;
end $$;

drop policy if exists conv_correo_plantillas_insert on public.conv_correo_plantillas;
create policy conv_correo_plantillas_insert on public.conv_correo_plantillas for insert to authenticated
  with check (public.int_puede_crear());

drop policy if exists conv_aviso_reglas_insert on public.conv_aviso_reglas;
create policy conv_aviso_reglas_insert on public.conv_aviso_reglas for insert to authenticated
  with check (public.int_puede_crear());
drop policy if exists conv_aviso_reglas_delete on public.conv_aviso_reglas;
create policy conv_aviso_reglas_delete on public.conv_aviso_reglas for delete to authenticated
  using (public.int_puede_crear());

drop policy if exists conv_aviso_envios_read on public.conv_aviso_envios;
create policy conv_aviso_envios_read on public.conv_aviso_envios for select to authenticated
  using (public.int_ve_modulo());

-- -----------------------------------------------------------------------------
-- 5. Contactos de una institución (para el aviso a la contraparte)
-- -----------------------------------------------------------------------------

/**
 * Correos del Directorio (int_filas de las hojas de contactos) cuya institución coincide con la
 * del convenio: sin tildes ni mayúsculas, al menos 4 letras y uno contiene al otro (igual que el
 * botón «Avisar», Relaciones.tsx). Se omiten las bajas y los correos con estado «bad» o «dom».
 */
create or replace function public.conv_contactos_de(p_institucion text)
returns table (correo text, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  with k as (
    select btrim(regexp_replace(lower(translate(coalesce(p_institucion, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')), '\s+', ' ', 'g')) as v
  ), d as (
    select lower(btrim(coalesce(f.datos ->> 'propio_email', ''))) as correo,
           btrim(concat_ws(' ', f.datos ->> 'propio_first_name', f.datos ->> 'propio_last_name')) as nombre,
           btrim(regexp_replace(lower(translate(coalesce(nullif(f.datos ->> 'propio_institution', ''), f.datos ->> 'propio_company_name', ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')), '\s+', ' ', 'g')) as inst,
           coalesce(r.baja, false) as baja,
           coalesce(r.correo_estado, 'pend') as estado
      from public.int_filas f
      join public.int_hojas h on h.id = f.hoja_id
      join public.int_libros l on l.id = h.libro_id
      left join public.rel_contactos r on r.fila_id = f.id
     where l.plantilla_contactos is not null
  )
  select distinct d.correo, d.nombre
    from d, k
   where char_length(k.v) >= 4
     and char_length(d.inst) >= 4
     and (strpos(d.inst, k.v) > 0 or strpos(k.v, d.inst) > 0)
     and d.correo ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$'
     and not d.baja
     and d.estado not in ('bad', 'dom');
$$;

revoke all on function public.conv_contactos_de(text) from public, anon, authenticated;
grant execute on function public.conv_contactos_de(text) to service_role;

-- -----------------------------------------------------------------------------
-- 6. Plantillas de correo (es / en). Se siembran una vez; luego se editan en la pantalla.
-- Variables: {{institucion}} {{pais}} {{codigo}} {{fecha_termino}} {{dias}} {{tipo}} {{enlace_renovacion}}
-- Las de firma: {{enlace_firma}} {{vence}} {{nombre_firmante}} {{institucion}} {{codigo_certificado}}
-- Etiquetas permitidas: p, br, b, strong, i, em, u, ul, ol, li, h3 y a (con class="boton" para el botón).
-- -----------------------------------------------------------------------------

insert into public.conv_correo_plantillas (clave, idioma, nombre, audiencia, asunto, cuerpo) values
('aviso_interno', 'es', 'Primer aviso interno', 'interna',
 'El convenio {{codigo}} con {{institucion}} termina en {{dias}} días',
 $b$<p>Buen día,</p><p>El convenio <b>{{codigo}}</b> con <b>{{institucion}}</b> ({{pais}}) termina el <b>{{fecha_termino}}</b>, dentro de {{dias}} días.</p><p>Si se quiere seguir con la cooperación, conviene hablar pronto con la contraparte y decidir si se renueva, se prorroga o se firma un convenio nuevo. Desde el módulo de Convenios puede preparar el documento con los datos actuales.</p><p><a class="boton" href="{{enlace_renovacion}}">Iniciar la renovación</a></p><p>Relaciones Internacionales · Universidad de Santander</p>$b$),
('aviso_interno', 'en', 'First internal notice', 'interna',
 'Agreement {{codigo}} with {{institucion}} ends in {{dias}} days',
 $b$<p>Good morning,</p><p>Agreement <b>{{codigo}}</b> with <b>{{institucion}}</b> ({{pais}}) ends on <b>{{fecha_termino}}</b>, {{dias}} days from now.</p><p>If the cooperation is to continue, it is worth talking to the partner soon and deciding whether to renew, extend or sign a new agreement. You can prepare the document with the current data from the Agreements module.</p><p><a class="boton" href="{{enlace_renovacion}}">Start the renewal</a></p><p>International Relations · Universidad de Santander</p>$b$),

('aviso_coordinacion', 'es', 'Aviso a coordinación', 'interna',
 'Convenio con {{institucion}}: termina el {{fecha_termino}}',
 $b$<p>Buen día,</p><p>Le escribimos desde Relaciones Internacionales porque el convenio <b>{{codigo}}</b> con <b>{{institucion}}</b> ({{pais}}), de tipo {{tipo}}, termina el <b>{{fecha_termino}}</b>. Faltan {{dias}} días.</p><p>Le pedimos revisar si las actividades que se hacen con esta institución (movilidad, proyectos, prácticas) justifican renovarlo y avisarnos su opinión, para empezar el trámite con tiempo.</p><p><a class="boton" href="{{enlace_renovacion}}">Ver el convenio y preparar la renovación</a></p><p>Gracias por su colaboración.</p><p>Relaciones Internacionales · Universidad de Santander</p>$b$),
('aviso_coordinacion', 'en', 'Notice to coordination', 'interna',
 'Agreement with {{institucion}}: ends on {{fecha_termino}}',
 $b$<p>Good morning,</p><p>International Relations is writing because agreement <b>{{codigo}}</b> with <b>{{institucion}}</b> ({{pais}}), type {{tipo}}, ends on <b>{{fecha_termino}}</b>. There are {{dias}} days left.</p><p>Please check whether the activities carried out with this institution (mobility, projects, internships) justify a renewal and let us know your opinion, so that we can start the process in time.</p><p><a class="boton" href="{{enlace_renovacion}}">View the agreement and prepare the renewal</a></p><p>Thank you for your help.</p><p>International Relations · Universidad de Santander</p>$b$),

('invitacion_renovar', 'es', 'Invitación a renovar', 'externa',
 'Renovación del convenio con la Universidad de Santander',
 $b$<p>Estimados colegas de {{institucion}}:</p><p>Desde la Oficina de Relaciones Internacionales de la Universidad de Santander (Colombia) les escribimos porque el convenio que nos une, con código {{codigo}}, termina el <b>{{fecha_termino}}</b>.</p><p>Nos gustaría seguir trabajando juntos. Si ustedes también lo desean, podemos preparar el documento de renovación con los datos actuales y enviarlo para firma electrónica, o conversar antes sobre las actividades que convendría mantener o ampliar.</p><p>Quedamos atentos a su respuesta para acordar los pasos siguientes.</p><p>Cordialmente,<br>Relaciones Internacionales · Universidad de Santander</p>$b$),
('invitacion_renovar', 'en', 'Invitation to renew', 'externa',
 'Renewal of our agreement with Universidad de Santander',
 $b$<p>Dear colleagues at {{institucion}},</p><p>The International Relations Office of Universidad de Santander (Colombia) is writing because the agreement between our institutions, code {{codigo}}, ends on <b>{{fecha_termino}}</b>.</p><p>We would like to keep working together. If you share this wish, we can prepare the renewal document with the current details and send it for electronic signature, or first talk about the activities worth keeping or expanding.</p><p>We look forward to hearing from you so that we can agree on the next steps.</p><p>Kind regards,<br>International Relations · Universidad de Santander</p>$b$),

('ultima_llamada', 'es', 'Última llamada', 'externa',
 'Último aviso: el convenio con la Universidad de Santander termina el {{fecha_termino}}',
 $b$<p>Estimados colegas de {{institucion}}:</p><p>Les recordamos que el convenio {{codigo}} con la Universidad de Santander termina el <b>{{fecha_termino}}</b>, dentro de {{dias}} días. Si no se renueva antes, las actividades de movilidad y cooperación que dependen de él tendrán que suspenderse.</p><p>Para evitarlo, les pedimos confirmar si desean renovarlo o prorrogarlo. Con su respuesta preparamos el documento enseguida.</p><p>Cordialmente,<br>Relaciones Internacionales · Universidad de Santander</p>$b$),
('ultima_llamada', 'en', 'Last call', 'externa',
 'Final reminder: the agreement with Universidad de Santander ends on {{fecha_termino}}',
 $b$<p>Dear colleagues at {{institucion}},</p><p>This is a reminder that agreement {{codigo}} with Universidad de Santander ends on <b>{{fecha_termino}}</b>, {{dias}} days from now. If it is not renewed before then, the mobility and cooperation activities that depend on it will have to be suspended.</p><p>To avoid this, please let us know whether you wish to renew or extend it. As soon as we hear from you, we will prepare the document.</p><p>Kind regards,<br>International Relations · Universidad de Santander</p>$b$),

('vencido_hoy', 'es', 'Convenio vencido hoy', 'interna',
 'Hoy vence el convenio {{codigo}} con {{institucion}}',
 $b$<p>Buen día,</p><p>El convenio <b>{{codigo}}</b> con <b>{{institucion}}</b> ({{pais}}) vence hoy, {{fecha_termino}}.</p><p>Si ya hay una renovación o una prórroga firmada, regístrela en el convenio para que deje de aparecer como vencido. Si no la hay, hay que decidir esta semana si se renueva o se da por terminado.</p><p><a class="boton" href="{{enlace_renovacion}}">Abrir el convenio</a></p><p>Relaciones Internacionales · Universidad de Santander</p>$b$),
('vencido_hoy', 'en', 'Agreement expires today', 'interna',
 'Agreement {{codigo}} with {{institucion}} expires today',
 $b$<p>Good morning,</p><p>Agreement <b>{{codigo}}</b> with <b>{{institucion}}</b> ({{pais}}) expires today, {{fecha_termino}}.</p><p>If a renewal or extension has already been signed, please record it in the agreement so that it stops showing as expired. If not, a decision is needed this week: renew it or close it.</p><p><a class="boton" href="{{enlace_renovacion}}">Open the agreement</a></p><p>International Relations · Universidad de Santander</p>$b$),

('seguimiento', 'es', 'Seguimiento tras vencer', 'interna',
 'El convenio {{codigo}} con {{institucion}} sigue vencido',
 $b$<p>Buen día,</p><p>El convenio <b>{{codigo}}</b> con <b>{{institucion}}</b> ({{pais}}) venció el {{fecha_termino}} y todavía no tiene una renovación registrada.</p><p>Le pedimos registrar la renovación si ya se firmó, o dar el convenio por terminado si no se va a continuar.</p><p><a class="boton" href="{{enlace_renovacion}}">Abrir el convenio</a></p><p>Relaciones Internacionales · Universidad de Santander</p>$b$),
('seguimiento', 'en', 'Follow-up after expiry', 'interna',
 'Agreement {{codigo}} with {{institucion}} is still expired',
 $b$<p>Good morning,</p><p>Agreement <b>{{codigo}}</b> with <b>{{institucion}}</b> ({{pais}}) expired on {{fecha_termino}} and still has no renewal on record.</p><p>Please record the renewal if it has been signed, or mark the agreement as closed if it will not continue.</p><p><a class="boton" href="{{enlace_renovacion}}">Open the agreement</a></p><p>International Relations · Universidad de Santander</p>$b$),

('firma_solicitud', 'es', 'Firma: solicitud con enlace', 'externa',
 'Convenio con la Universidad de Santander listo para su firma',
 $b$<p>Estimado(a) {{nombre_firmante}}:</p><p>La Universidad de Santander le envía para firma electrónica el convenio con <b>{{institucion}}</b>.</p><p>Con el botón siguiente puede leer el documento completo y firmarlo. El enlace es personal y vence el <b>{{vence}}</b>.</p><p><a class="boton" href="{{enlace_firma}}">Leer y firmar el convenio</a></p><p>Si usted no es la persona indicada para firmar, por favor responda este mensaje.</p><p>Cordialmente,<br>Relaciones Internacionales · Universidad de Santander</p>$b$),
('firma_solicitud', 'en', 'Signature: request with link', 'externa',
 'Agreement with Universidad de Santander ready for your signature',
 $b$<p>Dear {{nombre_firmante}},</p><p>Universidad de Santander is sending you the agreement with <b>{{institucion}}</b> for electronic signature.</p><p>Use the button below to read the full document and sign it. The link is personal and expires on <b>{{vence}}</b>.</p><p><a class="boton" href="{{enlace_firma}}">Read and sign the agreement</a></p><p>If you are not the right person to sign, please reply to this message.</p><p>Kind regards,<br>International Relations · Universidad de Santander</p>$b$),

('firma_certificado', 'es', 'Firma: convenio firmado y certificado', 'externa',
 'Convenio firmado con {{institucion}}',
 $b$<p>Estimado(a) {{nombre_firmante}}:</p><p>El convenio entre la Universidad de Santander y <b>{{institucion}}</b> quedó firmado por todas las partes. Adjuntamos el documento firmado y el certificado de trazabilidad.</p><p>Código de verificación del certificado: <b>{{codigo_certificado}}</b></p><p>Conserve estos archivos como constancia de la firma.</p><p>Cordialmente,<br>Relaciones Internacionales · Universidad de Santander</p>$b$),
('firma_certificado', 'en', 'Signature: signed agreement and certificate', 'externa',
 'Agreement signed with {{institucion}}',
 $b$<p>Dear {{nombre_firmante}},</p><p>The agreement between Universidad de Santander and <b>{{institucion}}</b> has been signed by all parties. The signed document and the traceability certificate are attached.</p><p>Certificate verification code: <b>{{codigo_certificado}}</b></p><p>Please keep these files as proof of signature.</p><p>Kind regards,<br>International Relations · Universidad de Santander</p>$b$)
on conflict (clave, idioma) do nothing;
