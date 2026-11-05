-- =============================================================================
-- 0258 · Internacionalización › Gestión de convenios, parte 2: firma electrónica (servidor)
--
-- Se apoya en 0255 (Convenios), 0256 (plantillas de correo) y 0257 (modelos y generados).
-- Idempotente. Todo DELETE lleva WHERE (safeupdate, 0095).
--
--   conv_firmas          una solicitud de firma por documento generado (conv_generados): estado,
--                        idioma, huella SHA-256 del PDF a firmar, rutas de los PDF, código público
--                        de verificación (UDES-CV-AAAA-NNNNNN) y vencimiento del enlace (15 días).
--   conv_firmantes       quien firma: orden, rol, token del enlace (SOLO hash), código de
--                        verificación de 6 dígitos (SOLO hash, 10 min, 5 intentos), sesión corta,
--                        método y datos de la firma (trazo o firma criptográfica), IP, agente, país.
--   conv_firma_eventos   registro INMUTABLE y encadenado por huellas de cada paso.
--   conv_firma_moviles   sesiones para firmar desde el teléfono (5 minutos).
--   conv_firma_limites   contadores para limitar intentos de los endpoints públicos.
--   Storage              bucket PRIVADO «conv-firmas» (PDF a firmar, firmados, certificados, trazos).
--
-- QUIÉN PUEDE QUÉ
--   · Ven (select) quienes cumplen int_ve_modulo(), con columnas limitadas: los hashes de token,
--     código y sesión NO son legibles para ningún rol de la aplicación.
--   · Todo lo que escribe lo hace la función conv-firma con el rol de servicio. Los firmantes
--     externos NUNCA tocan estas tablas con la clave anónima: todo pasa por la función.
--
-- UDRIVE: al quedar firmado, la función archiva el PDF firmado y el certificado en la carpeta
-- del convenio (conv_firma_udrive_destino / conv_firma_udrive_registrar). Es el mejor esfuerzo:
-- si UDrive no acepta el archivo (cuota, carpeta borrada), el bucket «conv-firmas» queda como
-- archivo oficial y el paso 5 de la ruta se deja sin marcar.
--
-- CRON: la función conv-firma tiene la acción «vencer» (marca vencidas las solicitudes y reintenta
-- las finalizaciones que fallaron). Ver supabase/functions/conv-firma/README.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Reparación previa (a prueba de bases que aplicaron la PRIMERA versión de 0255, 0256 o 0257)
--    Idempotente. Es el mismo bloque que cierra 0255, más las columnas de convenio que esta migración usa.
-- -----------------------------------------------------------------------------

alter table public.conv_convenios
  add column if not exists drive_carpeta_id uuid references public.drive_carpetas (id) on delete set null;
alter table public.conv_convenios add column if not exists pasos smallint not null default 1;
alter table public.conv_convenios add column if not exists pasos_fechas jsonb not null default '[null,null,null,null,null]'::jsonb;
alter table public.conv_convenios add column if not exists fecha_firma date;
alter table public.conv_convenios add column if not exists fecha_terminacion date;
alter table public.conv_convenios add column if not exists indefinido boolean not null default false;
alter table public.conv_historial add column if not exists autor uuid references public.profiles (id) on delete set null;
alter table public.conv_convenios drop constraint if exists conv_carpeta;
update public.conv_convenios set carpeta_estado = 'sin' where carpeta_estado = 'udrive_solicitada';
alter table public.conv_convenios
  add constraint conv_carpeta check (carpeta_estado in ('udrive', 'enlace', 'sin'));

-- -----------------------------------------------------------------------------
-- 1. Solicitudes de firma
-- -----------------------------------------------------------------------------

create table if not exists public.conv_firmas (
  id                    uuid primary key default gen_random_uuid(),
  convenio_id           uuid not null references public.conv_convenios (id) on delete restrict,
  generado_id           uuid not null references public.conv_generados (id) on delete restrict,
  estado                text not null default 'borrador',
  idioma                text not null default 'es',
  -- Verdadero: se avisa al siguiente firmante solo cuando firma el anterior (por orden).
  secuencial            boolean not null default false,
  -- Código público, sin secreto: UDES-CV-2026-123456.
  codigo_verificacion   text not null default '',
  nombre_documento      text not null,
  formato_origen        text not null default 'docx',
  -- PDF que firman las partes (sin bloques de firma) y su huella.
  pdf_base_ruta         text,
  pdf_base_hash         text,
  pdf_paginas           integer,
  -- PDF final con los bloques de firma, sellado con el certificado de la UDES.
  pdf_firmado_ruta      text,
  pdf_firmado_hash      text,
  pdf_firmado_tamano    integer,
  -- Certificado de trazabilidad (PDF aparte, también sellado).
  certificado_ruta      text,
  certificado_hash      text,
  -- Cómo se selló: {modo: prueba|real|sin_sello, sujeto, emisor, serie, desde, hasta, hora_utc, tsa, tsa_error}.
  sellado               jsonb not null default '{}'::jsonb,
  -- Dónde quedó en UDrive: {firmado: uuid, certificado: uuid} o {error}.
  udrive                jsonb not null default '{}'::jsonb,
  -- Cierre automático al firmar el último: null | pendiente | en_proceso | error | lista.
  finalizacion          text,
  finalizacion_inicio   timestamptz,
  finalizacion_intentos integer not null default 0,
  finalizacion_error    text,
  vence_en              timestamptz not null default (now() + interval '15 days'),
  enviada_en            timestamptz,
  firmada_en            timestamptz,
  cancelada_en          timestamptz,
  cancelada_motivo      text,
  created_by            uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint conv_firmas_estado check (estado in ('borrador', 'enviada', 'en_firma', 'firmada', 'vencida', 'cancelada')),
  constraint conv_firmas_idioma check (idioma in ('es', 'en')),
  constraint conv_firmas_formato check (formato_origen in ('docx', 'html')),
  constraint conv_firmas_codigo check (codigo_verificacion ~ '^UDES-CV-[0-9]{4}-[0-9]{6}$'),
  constraint conv_firmas_hash_base check (pdf_base_hash is null or pdf_base_hash ~ '^[0-9a-f]{64}$'),
  constraint conv_firmas_hash_firmado check (pdf_firmado_hash is null or pdf_firmado_hash ~ '^[0-9a-f]{64}$'),
  constraint conv_firmas_hash_cert check (certificado_hash is null or certificado_hash ~ '^[0-9a-f]{64}$'),
  constraint conv_firmas_finalizacion check (finalizacion is null or finalizacion in ('pendiente', 'en_proceso', 'error', 'lista')),
  constraint conv_firmas_firmada check (estado <> 'firmada' or (pdf_firmado_ruta is not null and certificado_ruta is not null))
);

comment on table public.conv_firmas is
  'Firma electrónica de convenios (0258): una solicitud por documento generado. La escribe solo la función conv-firma.';

create unique index if not exists conv_firmas_codigo_uq on public.conv_firmas (codigo_verificacion);
-- Un documento no puede tener dos solicitudes vivas a la vez.
create unique index if not exists conv_firmas_viva_uq on public.conv_firmas (generado_id)
  where estado in ('borrador', 'enviada', 'en_firma', 'firmada');
create index if not exists conv_firmas_convenio_idx on public.conv_firmas (convenio_id, created_at desc);
create index if not exists conv_firmas_vence_idx on public.conv_firmas (vence_en) where estado in ('enviada', 'en_firma');
create index if not exists conv_firmas_final_idx on public.conv_firmas (finalizacion) where finalizacion in ('pendiente', 'en_proceso', 'error');

drop trigger if exists conv_firmas_set_updated_at on public.conv_firmas;
create trigger conv_firmas_set_updated_at before update on public.conv_firmas
  for each row execute function public.set_updated_at();

/** Pone el código UDES-CV-AAAA-NNNNNN (único) si la fila no lo trae. El código no es secreto. */
create or replace function public.conv_firma_poner_codigo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_codigo text;
  v_intentos integer := 0;
begin
  if new.codigo_verificacion is not null and new.codigo_verificacion <> '' then
    return new;
  end if;
  loop
    v_codigo := 'UDES-CV-' || to_char(now() at time zone 'America/Bogota', 'YYYY') || '-' || lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.conv_firmas f where f.codigo_verificacion = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 50 then
      raise exception 'No se pudo generar un código de verificación único.';
    end if;
  end loop;
  new.codigo_verificacion := v_codigo;
  return new;
end;
$$;

drop trigger if exists conv_firmas_codigo_tg on public.conv_firmas;
create trigger conv_firmas_codigo_tg before insert on public.conv_firmas
  for each row execute function public.conv_firma_poner_codigo();

-- -----------------------------------------------------------------------------
-- 2. Firmantes
-- -----------------------------------------------------------------------------

create table if not exists public.conv_firmantes (
  id                  uuid primary key default gen_random_uuid(),
  firma_id            uuid not null references public.conv_firmas (id) on delete cascade,
  orden               integer not null,
  rol                 text not null,
  -- Cargo o nombre del papel tal como sale en el bloque de firma («Rector UDES»).
  rol_texto           text not null default '',
  nombre              text not null,
  correo              text not null,
  idioma              text not null default 'es',
  estado              text not null default 'pendiente',
  -- Código de identidad que sale impreso junto a la firma: ID-XXXX-XXXX.
  codigo_identidad    text not null,
  -- Enlace personal: SOLO el hash SHA-256 del token (el token va en el correo y nunca se guarda).
  token_hash          text,
  enlace_enviado_en   timestamptz,
  recordatorios       integer not null default 0,
  -- Código de 6 dígitos: SOLO HMAC-SHA256. Vence a los 10 minutos; 5 intentos; reenvío cada 60 s.
  codigo_hash         text,
  codigo_vence        timestamptz,
  codigo_intentos     integer not null default 0,
  codigo_enviado_en   timestamptz,
  codigo_envios_dia   integer not null default 0,
  codigo_dia          date,
  codigo_fallos       integer not null default 0,
  bloqueado_hasta     timestamptz,
  -- Sesión corta tras verificar el código (SOLO hash).
  sesion_hash         text,
  sesion_vence        timestamptz,
  -- La firma.
  metodo              text,
  trazo_ruta          text,
  firma_b64           text,
  firma_algoritmo     text,
  firma_mensaje       text,
  cert_cadena_pem     text,
  cert_sujeto         text,
  cert_emisor         text,
  cert_serie          text,
  cert_desde          timestamptz,
  cert_hasta          timestamptz,
  cert_cadena         text,
  acepta_firma        boolean not null default false,
  ip                  text,
  agente              text,
  pais                text,
  zona_horaria        text,
  abierto_en          timestamptz,
  verificado_en       timestamptz,
  leido_en            timestamptz,
  firmado_en          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint conv_firmantes_orden check (orden between 1 and 20),
  constraint conv_firmantes_rol check (rol in ('UDES', 'contraparte', 'testigo')),
  constraint conv_firmantes_idioma check (idioma in ('es', 'en')),
  constraint conv_firmantes_estado check (estado in ('pendiente', 'abierto', 'verificado', 'firmado')),
  constraint conv_firmantes_metodo check (metodo is null or metodo in ('dibujo', 'certificado', 'movil')),
  constraint conv_firmantes_nombre check (char_length(btrim(nombre)) between 1 and 160),
  constraint conv_firmantes_correo check (correo ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' and char_length(correo) <= 254),
  constraint conv_firmantes_identidad check (codigo_identidad ~ '^ID-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  constraint conv_firmantes_cadena check (cert_cadena is null or cert_cadena in ('lista_confianza', 'no_verificada_acreditada')),
  constraint conv_firmantes_firmado check (estado <> 'firmado' or (metodo is not null and firmado_en is not null and acepta_firma))
);

comment on table public.conv_firmantes is
  'Firmantes de una solicitud (0258). token_hash, codigo_hash y sesion_hash nunca se leen desde la aplicación.';

create unique index if not exists conv_firmantes_orden_uq on public.conv_firmantes (firma_id, orden);
create unique index if not exists conv_firmantes_token_uq on public.conv_firmantes (token_hash) where token_hash is not null;
create unique index if not exists conv_firmantes_identidad_uq on public.conv_firmantes (codigo_identidad);
create index if not exists conv_firmantes_firma_idx on public.conv_firmantes (firma_id);

drop trigger if exists conv_firmantes_set_updated_at on public.conv_firmantes;
create trigger conv_firmantes_set_updated_at before update on public.conv_firmantes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Eventos: inmutables y encadenados
-- -----------------------------------------------------------------------------

create table if not exists public.conv_firma_eventos (
  id           bigint generated always as identity primary key,
  firma_id     uuid not null references public.conv_firmas (id) on delete restrict,
  firmante_id  uuid references public.conv_firmantes (id) on delete restrict,
  tipo         text not null,
  ocurrio_en   timestamptz not null default now(),
  ip           text,
  agente       text,
  detalle      jsonb not null default '{}'::jsonb,
  -- Quién lo hizo si fue alguien de la oficina (null: el firmante o el sistema).
  actor        uuid references public.profiles (id) on delete set null,
  -- Cadena de huellas: hash = SHA-256(hash anterior | datos del evento). Cualquier cambio posterior
  -- en una fila rompe la cadena de las siguientes.
  hash_prev    text not null default '',
  hash         text not null default '',
  constraint conv_firma_eventos_tipo check (tipo in (
    'creado', 'enviado', 'entregado', 'abierto', 'codigo_enviado', 'codigo_reenviado', 'codigo_verificado',
    'codigo_fallido', 'documento_visto', 'documento_leido', 'firma_adoptada', 'firma_aplicada',
    'movil_iniciado', 'movil_recibido', 'pdf_generado', 'pdf_sellado', 'certificado_emitido',
    'correos_enviados', 'cancelado', 'vencido', 'recordatorio', 'enlace_reenviado', 'bloqueado',
    'udrive_archivado', 'udrive_fallo', 'finalizacion_error'
  )),
  constraint conv_firma_eventos_detalle check (jsonb_typeof(detalle) = 'object')
);

comment on table public.conv_firma_eventos is
  'Registro inmutable de la firma (0258): sin UPDATE ni DELETE, encadenado por huellas.';

create index if not exists conv_firma_eventos_firma_idx on public.conv_firma_eventos (firma_id, id);

create or replace function public.conv_firma_evento_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.firma_id::text, 0));
  select e.hash into v_prev from public.conv_firma_eventos e where e.firma_id = new.firma_id order by e.id desc limit 1;
  new.hash_prev := coalesce(v_prev, '');
  new.hash := encode(
    sha256(convert_to(concat_ws('|',
      new.hash_prev, new.firma_id::text, coalesce(new.firmante_id::text, ''), new.tipo,
      to_char(new.ocurrio_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      coalesce(new.ip, ''), new.detalle::text), 'UTF8')),
    'hex');
  return new;
end;
$$;

drop trigger if exists conv_firma_eventos_antes_tg on public.conv_firma_eventos;
create trigger conv_firma_eventos_antes_tg before insert on public.conv_firma_eventos
  for each row execute function public.conv_firma_evento_antes();

create or replace function public.conv_firma_evento_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El registro de eventos de la firma no se puede modificar ni borrar.' using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists conv_firma_eventos_inmutable_tg on public.conv_firma_eventos;
create trigger conv_firma_eventos_inmutable_tg before update or delete on public.conv_firma_eventos
  for each row execute function public.conv_firma_evento_inmutable();

drop trigger if exists conv_firma_eventos_truncate_tg on public.conv_firma_eventos;
create trigger conv_firma_eventos_truncate_tg before truncate on public.conv_firma_eventos
  for each statement execute function public.conv_firma_evento_inmutable();

-- -----------------------------------------------------------------------------
-- 4. Sesiones móviles y límites
-- -----------------------------------------------------------------------------

create table if not exists public.conv_firma_moviles (
  id           uuid primary key default gen_random_uuid(),
  firma_id     uuid not null references public.conv_firmas (id) on delete cascade,
  firmante_id  uuid not null references public.conv_firmantes (id) on delete cascade,
  token_hash   text not null,
  estado       text not null default 'pendiente',
  vence_en     timestamptz not null default (now() + interval '5 minutes'),
  trazo_ruta   text,
  recibido_en  timestamptz,
  ip           text,
  agente       text,
  created_at   timestamptz not null default now(),
  constraint conv_firma_moviles_estado check (estado in ('pendiente', 'recibido', 'usado', 'vencido'))
);

create unique index if not exists conv_firma_moviles_token_uq on public.conv_firma_moviles (token_hash);
create index if not exists conv_firma_moviles_firmante_idx on public.conv_firma_moviles (firmante_id, created_at desc);

create table if not exists public.conv_firma_limites (
  clave    text primary key,
  ventana  timestamptz not null default now(),
  n        integer not null default 0
);

/**
 * Cuenta un intento en `p_clave` dentro de una ventana de `p_segundos` y dice si aún cabe (≤ p_max).
 * Atómico. Solo service_role.
 */
create or replace function public.conv_firma_limite(p_clave text, p_max integer, p_segundos integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  insert into public.conv_firma_limites as l (clave, ventana, n)
  values (p_clave, now(), 1)
  on conflict (clave) do update
    set ventana = case when l.ventana < now() - make_interval(secs => p_segundos) then now() else l.ventana end,
        n = case when l.ventana < now() - make_interval(secs => p_segundos) then 1 else l.n + 1 end
  returning n into v_n;
  -- Limpieza ocasional de claves viejas.
  if random() < 0.01 then
    delete from public.conv_firma_limites where ventana < now() - interval '2 days';
  end if;
  return v_n <= p_max;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Seguridad de tablas
-- -----------------------------------------------------------------------------

alter table public.conv_firmas enable row level security;
alter table public.conv_firmantes enable row level security;
alter table public.conv_firma_eventos enable row level security;
alter table public.conv_firma_moviles enable row level security;
alter table public.conv_firma_limites enable row level security;

drop policy if exists conv_firmas_read on public.conv_firmas;
create policy conv_firmas_read on public.conv_firmas for select to authenticated using (public.int_ve_modulo());
drop policy if exists conv_firmantes_read on public.conv_firmantes;
create policy conv_firmantes_read on public.conv_firmantes for select to authenticated using (public.int_ve_modulo());
drop policy if exists conv_firma_eventos_read on public.conv_firma_eventos;
create policy conv_firma_eventos_read on public.conv_firma_eventos for select to authenticated using (public.int_ve_modulo());
-- Sin políticas de insert/update/delete: solo el rol de servicio (la función) escribe. conv_firma_moviles
-- y conv_firma_limites no tienen ninguna política: la aplicación no las lee.

revoke all on public.conv_firmas, public.conv_firmantes, public.conv_firma_eventos, public.conv_firma_moviles, public.conv_firma_limites from anon, authenticated;

grant select on public.conv_firmas to authenticated;
-- Columnas de conv_firmantes que la aplicación puede leer: nunca los hashes ni la firma criptográfica en bruto.
grant select (
  id, firma_id, orden, rol, rol_texto, nombre, correo, idioma, estado, codigo_identidad,
  enlace_enviado_en, recordatorios, codigo_enviado_en, bloqueado_hasta, metodo, cert_sujeto, cert_emisor,
  cert_serie, cert_desde, cert_hasta, cert_cadena, acepta_firma, ip, agente, pais, zona_horaria,
  abierto_en, verificado_en, leido_en, firmado_en, created_at, updated_at
) on public.conv_firmantes to authenticated;
grant select on public.conv_firma_eventos to authenticated;

revoke all on function public.conv_firma_limite(text, integer, integer) from public, anon, authenticated;
grant execute on function public.conv_firma_limite(text, integer, integer) to service_role;
revoke all on function public.conv_firma_evento_antes() from public, anon, authenticated;
revoke all on function public.conv_firma_poner_codigo() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Efectos sobre el convenio (ruta de firma, fechas, historial)
-- -----------------------------------------------------------------------------

/**
 * Avance parcial: cuando firmaron todas las personas con rol UDES y el convenio iba en «Revisión
 * jurídica» (pasos = 2), marca «Firma de la UDES» (paso 3). Solo service_role.
 */
create or replace function public.conv_firma_avance(p_firma uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.conv_firmas;
  c public.conv_convenios;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_fechas jsonb;
begin
  select * into f from public.conv_firmas where id = p_firma;
  if not found then return; end if;
  if not exists (select 1 from public.conv_firmantes x where x.firma_id = f.id and x.rol = 'UDES') then return; end if;
  if exists (select 1 from public.conv_firmantes x where x.firma_id = f.id and x.rol = 'UDES' and x.estado <> 'firmado') then return; end if;
  select * into c from public.conv_convenios where id = f.convenio_id for update;
  if not found or c.pasos <> 2 then return; end if;
  v_fechas := jsonb_build_array(
    coalesce(c.pasos_fechas -> 0, 'null'::jsonb), coalesce(c.pasos_fechas -> 1, 'null'::jsonb),
    case when c.pasos_fechas -> 2 is null or c.pasos_fechas -> 2 = 'null'::jsonb then to_jsonb(v_hoy::text) else c.pasos_fechas -> 2 end,
    coalesce(c.pasos_fechas -> 3, 'null'::jsonb), coalesce(c.pasos_fechas -> 4, 'null'::jsonb));
  update public.conv_convenios set pasos = 3, pasos_fechas = v_fechas where id = c.id;
  insert into public.conv_historial (convenio_id, fecha, texto, autor)
  values (c.id, v_hoy, 'Firma de la UDES: hecho (firma electrónica, código ' || f.codigo_verificacion || ').', null);
end;
$$;

/**
 * Cierre: todas las partes firmaron. Marca los pasos 3 y 4 (y el 5 si el PDF quedó archivado en UDrive),
 * fija la fecha de firma (hoy, Bogotá) y —si el convenio ya traía fecha de firma y de terminación— conserva
 * la misma vigencia contada desde hoy («vigencia contada desde la fecha de la última firma»). Si no hay
 * fechas no inventa ninguna y lo deja anotado. Deja líneas en el historial y marca el generado como firmado.
 * Solo service_role.
 */
create or replace function public.conv_firma_cerrar_convenio(p_firma uuid, p_archivado boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.conv_firmas;
  c public.conv_convenios;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_fechas jsonb;
  v_term date;
  v_firma date := v_hoy;
  v_pasos smallint;
  v_nota text := '';
  v_firmantes integer;
begin
  select * into f from public.conv_firmas where id = p_firma;
  if not found then return; end if;
  update public.conv_generados set estado = 'firmado' where id = f.generado_id;
  select * into c from public.conv_convenios where id = f.convenio_id for update;
  if not found then return; end if;
  select count(*) into v_firmantes from public.conv_firmantes where firma_id = f.id and estado = 'firmado';

  v_term := c.fecha_terminacion;
  if not c.indefinido and c.fecha_firma is not null and c.fecha_terminacion is not null and c.fecha_terminacion > c.fecha_firma then
    v_term := (v_hoy + age(c.fecha_terminacion, c.fecha_firma))::date;
    v_nota := ' Vigencia conservada: termina el ' || to_char(v_term, 'DD/MM/YYYY') || '.';
  elsif not c.indefinido and c.fecha_terminacion is null then
    v_nota := ' Falta registrar la fecha de terminación.';
  end if;

  v_fechas := jsonb_build_array(
    coalesce(c.pasos_fechas -> 0, 'null'::jsonb), coalesce(c.pasos_fechas -> 1, 'null'::jsonb),
    case when c.pasos_fechas -> 2 is null or c.pasos_fechas -> 2 = 'null'::jsonb then to_jsonb(v_hoy::text) else c.pasos_fechas -> 2 end,
    case when c.pasos_fechas -> 3 is null or c.pasos_fechas -> 3 = 'null'::jsonb then to_jsonb(v_hoy::text) else c.pasos_fechas -> 3 end,
    case when p_archivado and (c.pasos_fechas -> 4 is null or c.pasos_fechas -> 4 = 'null'::jsonb) then to_jsonb(v_hoy::text) else coalesce(c.pasos_fechas -> 4, 'null'::jsonb) end);
  v_pasos := greatest(c.pasos, case when p_archivado then 5 else 4 end);

  update public.conv_convenios
     set pasos = v_pasos,
         pasos_fechas = v_fechas,
         fecha_firma = v_firma,
         fecha_terminacion = v_term
   where id = c.id;

  insert into public.conv_historial (convenio_id, fecha, texto, autor)
  values (c.id, v_hoy, left('Convenio firmado electrónicamente por ' || v_firmantes || ' ' || case when v_firmantes = 1 then 'parte' else 'partes' end
          || ' (código de verificación ' || f.codigo_verificacion || '). Firma de la contraparte registrada el ' || to_char(v_hoy, 'DD/MM/YYYY') || '.' || v_nota, 1000), null);
  if p_archivado then
    insert into public.conv_historial (convenio_id, fecha, texto, autor)
    values (c.id, v_hoy, 'Archivo en la carpeta digital: el convenio firmado y su certificado quedaron en UDrive.', null);
  end if;
end;
$$;

revoke all on function public.conv_firma_avance(uuid) from public, anon, authenticated;
grant execute on function public.conv_firma_avance(uuid) to service_role;
revoke all on function public.conv_firma_cerrar_convenio(uuid, boolean) from public, anon, authenticated;
grant execute on function public.conv_firma_cerrar_convenio(uuid, boolean) to service_role;

-- -----------------------------------------------------------------------------
-- 7. UDrive: dónde y cómo archivar el PDF firmado (la función sube el binario y luego registra)
-- -----------------------------------------------------------------------------

/** La persona dueña del archivo (quien creó la solicitud) y la carpeta del convenio; vacío si no hay dónde archivar. */
create or replace function public.conv_firma_udrive_destino(p_firma uuid)
returns table (creada_por uuid, carpeta_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select f.created_by, c.drive_carpeta_id
    from public.conv_firmas f
    join public.conv_convenios c on c.id = f.convenio_id
   where f.id = p_firma
     and f.created_by is not null
     and exists (select 1 from auth.users u where u.id = f.created_by)
     and c.drive_carpeta_id is not null
     and exists (select 1 from public.drive_carpetas d where d.id = c.drive_carpeta_id and d.borrado_en is null);
$$;

/**
 * Registra en UDrive un archivo que la función ya subió al bucket «udrive» en
 * «<creada_por>/<id>/<nombre-limpio>». Si el nombre ya existe en la carpeta, agrega el código de la firma.
 * Devuelve el id. Cualquier fallo (cuota, permisos) se propaga para que la función lo anote.
 */
create or replace function public.conv_firma_udrive_registrar(p_firma uuid, p_id uuid, p_nombre text, p_ruta text, p_tamano bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  select * into d from public.conv_firma_udrive_destino(p_firma);
  if not found then
    raise exception 'El convenio no tiene carpeta en UDrive.' using errcode = 'P0002';
  end if;
  if p_ruta not like d.creada_por::text || '/' || p_id::text || '/%' then
    raise exception 'La ruta no corresponde a la persona dueña del archivo.' using errcode = 'check_violation';
  end if;
  insert into public.drive_archivos (id, carpeta_id, tipo, nombre, mime, tamano, ruta_storage, estado, creada_por)
  values (p_id, d.carpeta_id, 'archivo', left(p_nombre, 160), 'application/pdf', p_tamano, p_ruta, 'listo', d.creada_por);
  return p_id;
end;
$$;

revoke all on function public.conv_firma_udrive_destino(uuid) from public, anon, authenticated;
grant execute on function public.conv_firma_udrive_destino(uuid) to service_role;
revoke all on function public.conv_firma_udrive_registrar(uuid, uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.conv_firma_udrive_registrar(uuid, uuid, text, text, bigint) to service_role;

-- -----------------------------------------------------------------------------
-- 8. Bucket privado «conv-firmas». Mismo patrón que 0257: si quien aplica no es dueño de
--    storage.objects, lo demás queda aplicado y el aviso dice qué hacer a mano.
--    Rutas:  firmas/<firma>/base.pdf · firmado.pdf · certificado.pdf
--            firmas/<firma>/trazos/<firmante>.png · firmas/<firma>/moviles/<sesión>.png
--    Lectura: solo int_ve_modulo(). Nadie escribe con sesión: lo hace la función (rol de servicio).
--    Los firmantes externos reciben URLs firmadas de pocos segundos desde la función.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('conv-firmas', 'conv-firmas', false, 31457280, array['application/pdf', 'image/png'])
  on conflict (id) do update
    set public = false,
        file_size_limit = 31457280,
        allowed_mime_types = array['application/pdf', 'image/png'];

  execute 'drop policy if exists conv_firmas_lectura on storage.objects';
  execute $pol$
    create policy conv_firmas_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'conv-firmas' and public.int_ve_modulo())
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "conv-firmas" (%). Créelo a mano desde Storage: privado, 30 MB por archivo, solo application/pdf e image/png, con política de lectura para int_ve_modulo() y SIN políticas de escritura.',
      sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 9. Plantillas de correo (es / en)
--    · firma_solicitud: se agrega el código de verificación (variable {{codigo_verificacion}}). Solo si la
--      plantilla sigue siendo la original (si la oficina ya la editó, la función añade el código sola).
--    · firma_codigo: «pedí un código nuevo» (sin enlace).
--    · firma_recordatorio: recordatorio de firma pendiente, con enlace y código nuevos.
--    Variables de firma: {{enlace_firma}} {{vence}} {{nombre_firmante}} {{institucion}}
--    {{codigo_certificado}} {{codigo_verificacion}}
-- -----------------------------------------------------------------------------

update public.conv_correo_plantillas
   set cuerpo = replace(cuerpo, '<p>Si usted no es la persona indicada',
     '<p>Su código de verificación es <b>{{codigo_verificacion}}</b>. Vale por 10 minutos y la página de firma se lo pedirá antes de mostrar el documento. Si vence, podrá pedir uno nuevo allí.</p><p>Si usted no es la persona indicada')
 where clave = 'firma_solicitud' and idioma = 'es' and position('{{codigo_verificacion}}' in cuerpo) = 0;

update public.conv_correo_plantillas
   set cuerpo = replace(cuerpo, '<p>If you are not the right person',
     '<p>Your verification code is <b>{{codigo_verificacion}}</b>. It is valid for 10 minutes and the signing page will ask for it before showing the document. If it expires, you can request a new one there.</p><p>If you are not the right person')
 where clave = 'firma_solicitud' and idioma = 'en' and position('{{codigo_verificacion}}' in cuerpo) = 0;

insert into public.conv_correo_plantillas (clave, idioma, nombre, audiencia, asunto, cuerpo) values
('firma_codigo', 'es', 'Firma: código de verificación nuevo', 'externa',
 'Su código de verificación para firmar el convenio',
 $b$<p>Estimado(a) {{nombre_firmante}}:</p><p>Su nuevo código de verificación para firmar el convenio con <b>{{institucion}}</b> es:</p><p><b>{{codigo_verificacion}}</b></p><p>Vale por 10 minutos. El código anterior ya no sirve.</p><p>Si usted no lo pidió, ignore este mensaje: nadie puede firmar sin el código y el enlace personal.</p><p>Cordialmente,<br>Relaciones Internacionales · Universidad de Santander</p>$b$),
('firma_codigo', 'en', 'Signature: new verification code', 'externa',
 'Your verification code to sign the agreement',
 $b$<p>Dear {{nombre_firmante}},</p><p>Your new verification code to sign the agreement with <b>{{institucion}}</b> is:</p><p><b>{{codigo_verificacion}}</b></p><p>It is valid for 10 minutes. The previous code no longer works.</p><p>If you did not request it, please ignore this message: nobody can sign without the code and the personal link.</p><p>Kind regards,<br>International Relations · Universidad de Santander</p>$b$),
('firma_recordatorio', 'es', 'Firma: recordatorio', 'externa',
 'Recordatorio: convenio con la Universidad de Santander pendiente de su firma',
 $b$<p>Estimado(a) {{nombre_firmante}}:</p><p>Le recordamos que el convenio con <b>{{institucion}}</b> sigue esperando su firma electrónica. Este enlace reemplaza al anterior y vence el <b>{{vence}}</b>.</p><p><a class="boton" href="{{enlace_firma}}">Leer y firmar el convenio</a></p><p>Su código de verificación es <b>{{codigo_verificacion}}</b>. Vale por 10 minutos; si vence, podrá pedir uno nuevo en la página de firma.</p><p>Cordialmente,<br>Relaciones Internacionales · Universidad de Santander</p>$b$),
('firma_recordatorio', 'en', 'Signature: reminder', 'externa',
 'Reminder: agreement with Universidad de Santander awaiting your signature',
 $b$<p>Dear {{nombre_firmante}},</p><p>This is a reminder that the agreement with <b>{{institucion}}</b> is still waiting for your electronic signature. This link replaces the previous one and expires on <b>{{vence}}</b>.</p><p><a class="boton" href="{{enlace_firma}}">Read and sign the agreement</a></p><p>Your verification code is <b>{{codigo_verificacion}}</b>. It is valid for 10 minutes; if it expires, you can request a new one on the signing page.</p><p>Kind regards,<br>International Relations · Universidad de Santander</p>$b$)
on conflict (clave, idioma) do nothing;

notify pgrst, 'reload schema';
