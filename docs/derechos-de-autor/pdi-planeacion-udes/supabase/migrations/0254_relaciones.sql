-- =============================================================================
-- 0254 · Internacionalización: Relaciones (directorio único, plantillas y envío masivo)
--
-- Una sola vista de los contactos SIN copiarlos: la fuente de verdad sigue siendo
-- int_filas (las dos tablas Multicampus «Contactos académicos» y «Contactos de
-- empleadores», 0167). Aquí solo se agrega lo que esas filas no tienen:
--
--   rel_contactos         estado del correo (ok | pend | dom | bad | nv), detalle y fecha
--                         de la última validación, y la baja (no enviar). 1:1 con int_filas.
--   rel_directorio        VISTA (security_invoker): int_filas + rel_contactos con las columnas
--                         de las plantillas de Rua ya planas y la marca `duplicado` (mismo
--                         correo en minúsculas). Solo la ve quien puede crear (int_puede_crear):
--                         son datos personales.
--   rel_plantillas        plantillas de correo (texto plano + tarjeta de actividad opcional).
--   rel_envios            un envío masivo: copia de la plantilla, remitente, destino
--                         (mailpit | smtp), ritmo y avance.
--   rel_envio_destinos    bitácora por destinatario: enviado / falló / motivo / fecha, quién
--                         lo envió (rel_envios.created_by) y el token de baja.
--
-- Cola: la función rel-correos toma lotes con rel_tomar_lote (20 por minuto en SMTP real) y
-- anota cada resultado con rel_resultado; el navegador solo la dispara y puede reanudarla.
-- La baja pública (enlace del correo) la hace rel_dar_baja por esa misma función.
--
-- Quién puede qué: Director, Planeación y Coordinadores (int_puede_crear, 0166). Las
-- funciones rel_* de la cola y la baja las llama solo el rol de servicio.
--
-- Requiere 0151, 0166 y 0167. Idempotente. Todo DELETE lleva WHERE (safeupdate, 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Estado del correo y baja, por contacto
-- -----------------------------------------------------------------------------

create table if not exists public.rel_contactos (
  fila_id        uuid primary key references public.int_filas (id) on delete cascade,
  correo_estado  text not null default 'pend',
  -- {f, d, b, m} cada uno ok | bad | nv | na, y `nota` con el motivo en palabras.
  correo_detalle jsonb not null default '{}'::jsonb,
  correo_fecha   timestamptz,
  baja           boolean not null default false,
  baja_fecha     timestamptz,
  updated_at     timestamptz not null default now(),
  constraint rel_contactos_estado check (correo_estado in ('ok', 'pend', 'dom', 'bad', 'nv')),
  constraint rel_contactos_detalle check (jsonb_typeof(correo_detalle) = 'object')
);

comment on table public.rel_contactos is
  'Relaciones (0254): estado de validación del correo y baja de cada contacto (int_filas). nv = no verificable (el servidor no responde al sondeo); nunca se trata como rechazado.';

drop trigger if exists rel_contactos_set_updated_at on public.rel_contactos;
create trigger rel_contactos_set_updated_at before update on public.rel_contactos
  for each row execute function public.set_updated_at();

alter table public.rel_contactos enable row level security;
drop policy if exists rel_contactos_all on public.rel_contactos;
create policy rel_contactos_all on public.rel_contactos for all to authenticated
  using (public.int_puede_crear() and exists (select 1 from public.int_filas f where f.id = fila_id))
  with check (public.int_puede_crear() and exists (select 1 from public.int_filas f where f.id = fila_id));

-- -----------------------------------------------------------------------------
-- 2. El directorio único (vista sobre int_filas, con las reglas de acceso de int_filas)
-- -----------------------------------------------------------------------------

create or replace view public.rel_directorio with (security_invoker = true) as
select
  f.id,
  f.hoja_id,
  f.periodo_id,
  f.campus_id,
  f.datos,
  f.origen,
  f.canal,
  f.created_at,
  case l.plantilla_contactos when 'academica' then 'academico' else 'empleador' end as tipo,
  btrim(concat_ws(' ', f.datos ->> 'propio_first_name', f.datos ->> 'propio_last_name')) as nombre,
  coalesce(nullif(f.datos ->> 'propio_job_title', ''), f.datos ->> 'propio_position', '') as cargo,
  coalesce(nullif(f.datos ->> 'propio_institution', ''), f.datos ->> 'propio_company_name', '') as institucion,
  coalesce(f.datos ->> 'propio_country', '') as pais,
  lower(btrim(coalesce(f.datos ->> 'propio_email', ''))) as correo,
  coalesce(r.correo_estado, 'pend') as correo_estado,
  coalesce(r.correo_detalle, '{}'::jsonb) as correo_detalle,
  r.correo_fecha,
  coalesce(r.baja, false) as baja,
  r.baja_fecha,
  (lower(btrim(coalesce(f.datos ->> 'propio_email', ''))) <> ''
    and count(*) over (partition by lower(btrim(coalesce(f.datos ->> 'propio_email', '')))) > 1) as duplicado
from public.int_filas f
join public.int_hojas h on h.id = f.hoja_id
join public.int_libros l on l.id = h.libro_id
left join public.rel_contactos r on r.fila_id = f.id
where l.plantilla_contactos is not null
  and public.int_puede_crear();

comment on view public.rel_directorio is
  'Relaciones (0254): los contactos de int_filas con el estado del correo. Sin copia: editar una fila en Tablas o aquí es lo mismo.';

grant select on public.rel_directorio to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Plantillas de correo
-- -----------------------------------------------------------------------------

create table if not exists public.rel_plantillas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  asunto         text not null default '',
  cuerpo         text not null default '',
  usa_actividad  boolean not null default false,
  -- {nom, fec, hor, lug, btn, lim}
  actividad      jsonb not null default '{}'::jsonb,
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint rel_plantillas_nombre check (char_length(btrim(nombre)) between 1 and 120),
  constraint rel_plantillas_asunto check (char_length(asunto) <= 200),
  constraint rel_plantillas_cuerpo check (char_length(cuerpo) <= 20000),
  constraint rel_plantillas_actividad check (jsonb_typeof(actividad) = 'object')
);

drop trigger if exists rel_plantillas_set_updated_at on public.rel_plantillas;
create trigger rel_plantillas_set_updated_at before update on public.rel_plantillas
  for each row execute function public.set_updated_at();

alter table public.rel_plantillas enable row level security;
drop policy if exists rel_plantillas_all on public.rel_plantillas;
create policy rel_plantillas_all on public.rel_plantillas for all to authenticated
  using (public.int_puede_crear()) with check (public.int_puede_crear());

-- Las tres plantillas aprobadas, como datos editables (una sola vez: por nombre).
insert into public.rel_plantillas (nombre, asunto, cuerpo, usa_actividad, actividad)
select v.nombre, v.asunto, v.cuerpo, v.usa, v.act::jsonb
from (values
  ('Invitación a actividad', 'Invitación: {{actividad}}',
   E'Estimado(a) {{nombre}}:\n\nDesde la Oficina de Relaciones Internacionales de la Universidad de Santander queremos invitarle, junto con {{institucion}}, a participar en la siguiente actividad.\n\nSu presencia fortalece los vínculos que hemos construido y abre la puerta a nuevas movilidades para nuestros estudiantes y profesores.\n\nQuedamos atentos a su confirmación.\n\nCordialmente,\nRelaciones Internacionales · UDES',
   true, '{"nom":"","fec":"","hor":"","lug":"","btn":"Confirmar asistencia","lim":""}'),
  ('Recordatorio de actividad', 'Recordatorio: {{actividad}}',
   E'Hola {{nombre}}:\n\nLe recordamos que la actividad a la que fue invitado(a) se acerca. Si aún no ha confirmado, puede hacerlo en el botón de abajo.\n\nGracias por su tiempo.\n\nRelaciones Internacionales · UDES',
   true, '{"nom":"","fec":"","hor":"","lug":"","btn":"Confirmar asistencia","lim":""}'),
  ('Actualización de datos de contacto', 'Confirme sus datos de contacto en la UDES',
   E'Estimado(a) {{nombre}}:\n\nEstamos actualizando el directorio de aliados de la Universidad de Santander. Tenemos registrado su cargo como «{{cargo}}» en {{institucion}}.\n\nSi algún dato cambió, responda este mensaje y lo corregimos.\n\nGracias por ayudarnos a mantener la información al día.\n\nRelaciones Internacionales · UDES',
   false, '{}')
) as v (nombre, asunto, cuerpo, usa, act)
where not exists (select 1 from public.rel_plantillas p where p.nombre = v.nombre);

-- -----------------------------------------------------------------------------
-- 4. Envíos masivos y su bitácora por destinatario
-- -----------------------------------------------------------------------------

create table if not exists public.rel_envios (
  id             uuid primary key default gen_random_uuid(),
  -- Copia de lo que se envió (la plantilla puede cambiar después).
  plantilla_nombre text not null,
  asunto         text not null,
  cuerpo         text not null,
  usa_actividad  boolean not null default false,
  actividad      jsonb not null default '{}'::jsonb,
  remitente      text not null,
  destino        text not null default 'mailpit',
  estado         text not null default 'activo',
  total          integer not null default 0,
  enviados       integer not null default 0,
  fallidos       integer not null default 0,
  ultimo_lote    timestamptz,
  created_by     uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at     timestamptz not null default now(),
  constraint rel_envios_destino check (destino in ('mailpit', 'smtp')),
  constraint rel_envios_estado check (estado in ('activo', 'terminado', 'cancelado')),
  constraint rel_envios_remitente check (char_length(remitente) between 3 and 254)
);

create index if not exists rel_envios_creado_idx on public.rel_envios (created_at desc);

create table if not exists public.rel_envio_destinos (
  id          uuid primary key default gen_random_uuid(),
  envio_id    uuid not null references public.rel_envios (id) on delete cascade,
  -- Nulo si el contacto se borró después: la bitácora conserva correo y nombre.
  fila_id     uuid references public.int_filas (id) on delete set null,
  correo      text not null,
  nombre      text not null default '',
  estado      text not null default 'pendiente',
  motivo      text not null default '',
  enviado_en  timestamptz,
  tomado_en   timestamptz,
  -- Secreto del enlace «Dejar de recibir mensajes».
  token       text not null unique default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_'),
  created_at  timestamptz not null default now(),
  constraint rel_destinos_estado check (estado in ('pendiente', 'enviando', 'enviado', 'fallo'))
);

create index if not exists rel_destinos_envio_idx on public.rel_envio_destinos (envio_id, estado);
create index if not exists rel_destinos_fila_idx on public.rel_envio_destinos (fila_id) where fila_id is not null;

alter table public.rel_envios enable row level security;
alter table public.rel_envio_destinos enable row level security;

drop policy if exists rel_envios_read on public.rel_envios;
create policy rel_envios_read on public.rel_envios for select to authenticated using (public.int_puede_crear());
drop policy if exists rel_envios_insert on public.rel_envios;
create policy rel_envios_insert on public.rel_envios for insert to authenticated
  with check (public.int_puede_crear() and created_by = auth.uid());
-- Solo se puede cancelar (la cola la mueve el rol de servicio).
drop policy if exists rel_envios_update on public.rel_envios;
create policy rel_envios_update on public.rel_envios for update to authenticated
  using (public.int_puede_crear() and created_by = auth.uid()) with check (public.int_puede_crear() and created_by = auth.uid());

drop policy if exists rel_destinos_read on public.rel_envio_destinos;
create policy rel_destinos_read on public.rel_envio_destinos for select to authenticated using (public.int_puede_crear());
drop policy if exists rel_destinos_insert on public.rel_envio_destinos;
create policy rel_destinos_insert on public.rel_envio_destinos for insert to authenticated
  with check (public.int_puede_crear() and exists (select 1 from public.rel_envios e where e.id = envio_id and e.created_by = auth.uid() and e.estado = 'activo'));

-- -----------------------------------------------------------------------------
-- 5. La cola (solo el rol de servicio, desde la función rel-correos)
-- -----------------------------------------------------------------------------

/**
 * Toma hasta p_max destinatarios pendientes de un envío y los marca «enviando».
 * En SMTP real exige 55 s entre lotes (20 por minuto): si es pronto, devuelve cuánto
 * esperar. Quita de la cola a quien dio de baja desde que se armó el envío.
 * Devuelve {estado, espera, pendientes, destinos:[{id, correo, nombre, token}]}.
 */
create or replace function public.rel_tomar_lote(p_envio uuid, p_max integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.rel_envios;
  v_espera integer := 0;
  v_dest jsonb;
  v_pend integer;
begin
  select * into e from public.rel_envios where id = p_envio for update;
  if not found then
    raise exception 'El envío no existe.' using errcode = 'P0002';
  end if;
  if e.estado <> 'activo' then
    return jsonb_build_object('estado', e.estado, 'espera', 0, 'pendientes', 0, 'destinos', '[]'::jsonb);
  end if;

  if e.destino = 'smtp' and e.ultimo_lote is not null and e.ultimo_lote > now() - interval '55 seconds' then
    v_espera := ceil(extract(epoch from (e.ultimo_lote + interval '55 seconds' - now())))::integer;
    select count(*) into v_pend from public.rel_envio_destinos where envio_id = p_envio and estado in ('pendiente', 'enviando');
    return jsonb_build_object('estado', e.estado, 'espera', v_espera, 'pendientes', v_pend, 'destinos', '[]'::jsonb);
  end if;

  -- Quien tomó un lote y la función murió: vuelve a la cola a los 5 minutos.
  update public.rel_envio_destinos set estado = 'pendiente' where envio_id = p_envio and estado = 'enviando' and tomado_en < now() - interval '5 minutes';

  update public.rel_envio_destinos d
     set estado = 'fallo', motivo = 'Pidió no recibir mensajes.'
   where d.envio_id = p_envio and d.estado = 'pendiente'
     and exists (select 1 from public.rel_contactos c join public.int_filas f on f.id = c.fila_id
                  where c.baja and lower(btrim(coalesce(f.datos ->> 'propio_email', ''))) = lower(d.correo));

  with t as (
    select id from public.rel_envio_destinos
     where envio_id = p_envio and estado = 'pendiente'
     order by created_at, id
     limit greatest(1, least(p_max, 50))
       for update skip locked
  ), u as (
    update public.rel_envio_destinos d set estado = 'enviando', tomado_en = now()
      from t where d.id = t.id
    returning d.id, d.correo, d.nombre, d.token
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'correo', u.correo, 'nombre', u.nombre, 'token', u.token)), '[]'::jsonb) into v_dest from u;

  update public.rel_envios set ultimo_lote = now() where id = p_envio;
  select count(*) into v_pend from public.rel_envio_destinos where envio_id = p_envio and estado in ('pendiente', 'enviando');
  update public.rel_envios x
     set fallidos = (select count(*) from public.rel_envio_destinos where envio_id = p_envio and estado = 'fallo'),
         estado = case when v_pend = 0 then 'terminado' else x.estado end
   where x.id = p_envio;

  return jsonb_build_object('estado', e.estado, 'espera', 0, 'pendientes', v_pend, 'destinos', v_dest);
end;
$$;

/** Anota cómo salió un correo (enviado | fallo) y actualiza los contadores y el cierre del envío. */
create or replace function public.rel_resultado(p_destino uuid, p_estado text, p_motivo text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_envio uuid;
  v_pend integer;
begin
  if p_estado not in ('enviado', 'fallo') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  update public.rel_envio_destinos
     set estado = p_estado, motivo = left(coalesce(p_motivo, ''), 300), enviado_en = case when p_estado = 'enviado' then now() else enviado_en end
   where id = p_destino
  returning envio_id into v_envio;
  if v_envio is null then return; end if;
  select count(*) into v_pend from public.rel_envio_destinos where envio_id = v_envio and estado in ('pendiente', 'enviando');
  update public.rel_envios x
     set enviados = (select count(*) from public.rel_envio_destinos where envio_id = v_envio and estado = 'enviado'),
         fallidos = (select count(*) from public.rel_envio_destinos where envio_id = v_envio and estado = 'fallo'),
         estado = case when v_pend = 0 and x.estado = 'activo' then 'terminado' else x.estado end
   where x.id = v_envio;
end;
$$;

/** La baja del enlace del correo: marca a todas las filas con ese correo. Devuelve el correo, o nulo si el token no existe. */
create or replace function public.rel_dar_baja(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correo text;
begin
  select lower(correo) into v_correo from public.rel_envio_destinos where token = p_token;
  if v_correo is null then return null; end if;
  insert into public.rel_contactos (fila_id, baja, baja_fecha)
  select f.id, true, now() from public.int_filas f
    join public.int_hojas h on h.id = f.hoja_id
    join public.int_libros l on l.id = h.libro_id
   where l.plantilla_contactos is not null and lower(btrim(coalesce(f.datos ->> 'propio_email', ''))) = v_correo
  on conflict (fila_id) do update set baja = true, baja_fecha = now();
  return v_correo;
end;
$$;

revoke all on function public.rel_tomar_lote(uuid, integer) from public, anon, authenticated;
revoke all on function public.rel_resultado(uuid, text, text) from public, anon, authenticated;
revoke all on function public.rel_dar_baja(text) from public, anon, authenticated;
grant execute on function public.rel_tomar_lote(uuid, integer) to service_role;
grant execute on function public.rel_resultado(uuid, text, text) to service_role;
grant execute on function public.rel_dar_baja(text) to service_role;
