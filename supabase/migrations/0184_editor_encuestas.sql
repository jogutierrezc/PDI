-- =============================================================================
-- 0184 · Editor de encuestas con Pilo: el modelo nuevo
--
-- Convierte «Encuestas con Pilo» en un creador de encuestas. La primera encuesta
-- (rendicion-2026) sigue funcionando igual con su flujo de aportes (enc_enviar,
-- 0179) y queda además expresada en el modelo nuevo como su versión 1.
--
--   enc_encuestas   + acceso (microsoft | abierta), dominios_permitidos,
--                     una_por_persona, abre_el, limite_respuestas,
--                     mensaje_cierre, estado (borrador | publicada | pausada |
--                     cerrada), plantilla_origen, modo_llenado (guiado | clasico),
--                     config_pilo (presentación, tema, salida), y
--                     version_publicada_id. `abierta` se conserva y se mantiene
--                     en sintonía con `estado` por un disparador: abierta =
--                     (estado = 'publicada'). Lo que hoy está abierto pasa a
--                     publicada; lo cerrado, a cerrada.
--   enc_versiones   la estructura (JSON versionado) de cada versión. Hay a lo
--                     sumo un borrador editable por encuesta; al publicar queda
--                     fijada para siempre y las respuestas apuntan a ella.
--   enc_respuestas  una respuesta a una encuesta del modelo nuevo (con o sin
--                     correo; sin sesión si el acceso es abierto) y enc_valores
--                     su valor por pregunta (jsonb).
--   enc_editores    quién más edita o lee una encuesta (propietario, editor,
--                     lector).
--   enc_envios_log  freno de envíos por huella de IP (sin guardar la IP).
--
--   enc_crear_encuesta · enc_duplicar_encuesta · enc_guardar_borrador ·
--   enc_publicar · enc_compartir · enc_quitar_editor · enc_editores_de ·
--   enc_borrar_respuesta · enc_restaurar_respuesta · enc_purgar_borrados
--   (ampliada) · enc_enviar_respuesta (solo la función `encuestas`).
--
-- Estados de las respuestas: recibido, revisado, para_video, rechazado y
-- descartado; borrado lógico con papelera de 30 días, como los aportes (0183).
-- Quien crea, guarda o publica lo hace por funciones que dejan rastro en
-- enc_bitacora.
--
-- Requiere 0179 y 0183. Vuelta atrás: pausar o cerrar la encuesta; las tablas
-- pueden quedarse. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- enc_encuestas: columnas nuevas
-- -----------------------------------------------------------------------------

alter table public.enc_encuestas add column if not exists acceso text not null default 'microsoft';
alter table public.enc_encuestas add column if not exists dominios_permitidos text[] not null default array['udes.edu.co']::text[];
alter table public.enc_encuestas add column if not exists una_por_persona boolean not null default false;
alter table public.enc_encuestas add column if not exists abre_el date;
alter table public.enc_encuestas add column if not exists limite_respuestas int;
alter table public.enc_encuestas add column if not exists mensaje_cierre text not null default '';
alter table public.enc_encuestas add column if not exists estado text;
alter table public.enc_encuestas add column if not exists plantilla_origen text;
alter table public.enc_encuestas add column if not exists modo_llenado text not null default 'guiado';
alter table public.enc_encuestas add column if not exists config_pilo jsonb not null default '{}'::jsonb;
alter table public.enc_encuestas add column if not exists version_publicada_id uuid;

-- Lo que hoy está abierto es publicado; lo cerrado, cerrado. (Solo lo que aún no tiene estado.)
update public.enc_encuestas set estado = case when abierta then 'publicada' else 'cerrada' end where estado is null;
alter table public.enc_encuestas alter column estado set not null;
alter table public.enc_encuestas alter column estado set default 'borrador';

alter table public.enc_encuestas drop constraint if exists enc_encuestas_acceso;
alter table public.enc_encuestas add constraint enc_encuestas_acceso check (acceso in ('microsoft', 'abierta'));
alter table public.enc_encuestas drop constraint if exists enc_encuestas_estado;
alter table public.enc_encuestas add constraint enc_encuestas_estado check (estado in ('borrador', 'publicada', 'pausada', 'cerrada'));
alter table public.enc_encuestas drop constraint if exists enc_encuestas_modo;
alter table public.enc_encuestas add constraint enc_encuestas_modo check (modo_llenado in ('guiado', 'clasico'));
alter table public.enc_encuestas drop constraint if exists enc_encuestas_limite;
alter table public.enc_encuestas add constraint enc_encuestas_limite check (limite_respuestas is null or limite_respuestas between 1 and 1000000);
alter table public.enc_encuestas drop constraint if exists enc_encuestas_nuevos;
alter table public.enc_encuestas add constraint enc_encuestas_nuevos check (
  length(mensaje_cierre) <= 1000
  and cardinality(dominios_permitidos) <= 20
  and jsonb_typeof(config_pilo) = 'object'
  and length(config_pilo::text) <= 20000
  and (plantilla_origen is null or length(plantilla_origen) <= 40)
);

comment on column public.enc_encuestas.estado is 'Editor de encuestas (0184): borrador | publicada | pausada | cerrada. `abierta` sigue a este valor.';
comment on column public.enc_encuestas.config_pilo is 'Editor de encuestas (0184): presentación de Pilo (intro, pose, entrada), tema, salida y despedida.';

-- abierta y estado van juntos: cambiar uno mueve al otro (el panel viejo cambia `abierta`).
create or replace function public.enc_sync_estado()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.abierta := (new.estado = 'publicada');
  elsif new.estado is distinct from old.estado then
    new.abierta := (new.estado = 'publicada');
  elsif new.abierta is distinct from old.abierta then
    new.estado := case when new.abierta then 'publicada' else 'cerrada' end;
  end if;
  return new;
end;
$$;

drop trigger if exists enc_encuestas_sync_estado on public.enc_encuestas;
create trigger enc_encuestas_sync_estado
  before insert or update on public.enc_encuestas
  for each row execute function public.enc_sync_estado();

-- -----------------------------------------------------------------------------
-- Editores compartidos y permisos por encuesta
-- -----------------------------------------------------------------------------

create table if not exists public.enc_editores (
  encuesta_id  uuid not null references public.enc_encuestas (id) on delete cascade,
  usuario_id   uuid not null references auth.users (id) on delete cascade,
  rol          text not null default 'editor',
  agregado_por uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (encuesta_id, usuario_id),
  constraint enc_editores_rol check (rol in ('propietario', 'editor', 'lector'))
);

comment on table public.enc_editores is 'Editor de encuestas (0184): quién más ve (lector) o edita (editor, propietario) una encuesta. Se cambia con enc_compartir / enc_quitar_editor.';

create or replace function public.enc_puede_ver_encuesta(p_encuesta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_screen('encuestas')
     and (public.has_role_at_least('responsable')
          or exists (select 1 from public.enc_editores e where e.encuesta_id = p_encuesta and e.usuario_id = auth.uid()));
$$;

create or replace function public.enc_puede_editar_encuesta(p_encuesta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_screen('encuestas')
     and (public.has_role_at_least('planeacion')
          or exists (select 1 from public.enc_editores e where e.encuesta_id = p_encuesta and e.usuario_id = auth.uid() and e.rol in ('propietario', 'editor')));
$$;

revoke all on function public.enc_puede_ver_encuesta(uuid) from public, anon;
revoke all on function public.enc_puede_editar_encuesta(uuid) from public, anon;
grant execute on function public.enc_puede_ver_encuesta(uuid) to authenticated, service_role;
grant execute on function public.enc_puede_editar_encuesta(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Versiones
-- -----------------------------------------------------------------------------

create table if not exists public.enc_versiones (
  id          uuid primary key default gen_random_uuid(),
  encuesta_id uuid not null references public.enc_encuestas (id) on delete cascade,
  numero      int not null,
  estructura  jsonb not null,
  nota        text not null default '',
  autor       uuid references auth.users (id) on delete set null,
  fijada      boolean not null default false,
  created_at  timestamptz not null default now(),
  fijada_en   timestamptz,
  unique (encuesta_id, numero),
  constraint enc_versiones_estructura check (jsonb_typeof(estructura) = 'object' and (estructura ->> 'version') = '1' and jsonb_typeof(estructura -> 'secciones') = 'array' and length(estructura::text) <= 500000),
  constraint enc_versiones_nota check (length(nota) <= 300)
);

-- A lo sumo un borrador (no fijada) por encuesta.
create unique index if not exists enc_versiones_un_borrador on public.enc_versiones (encuesta_id) where not fijada;

comment on table public.enc_versiones is 'Editor de encuestas (0184): la estructura JSON de cada versión. La fijada (publicada) no se puede cambiar; las respuestas apuntan a ella.';

alter table public.enc_encuestas drop constraint if exists enc_encuestas_version_fk;
alter table public.enc_encuestas
  add constraint enc_encuestas_version_fk foreign key (version_publicada_id) references public.enc_versiones (id) on delete set null;

-- Una versión fijada no cambia ni se borra sola (sí con su encuesta).
create or replace function public.enc_versiones_fija()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.fijada and exists (select 1 from public.enc_encuestas where id = old.encuesta_id) then
      raise exception 'Una versión publicada no se puede borrar.' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.fijada and (new.estructura is distinct from old.estructura or new.numero <> old.numero or new.fijada = false or new.encuesta_id <> old.encuesta_id) then
    raise exception 'Una versión publicada no se puede cambiar.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enc_versiones_fija on public.enc_versiones;
create trigger enc_versiones_fija
  before update or delete on public.enc_versiones
  for each row execute function public.enc_versiones_fija();

-- -----------------------------------------------------------------------------
-- Respuestas del modelo nuevo
-- -----------------------------------------------------------------------------

create table if not exists public.enc_respuestas (
  id                uuid primary key default gen_random_uuid(),
  encuesta_id       uuid not null references public.enc_encuestas (id) on delete cascade,
  version_id        uuid references public.enc_versiones (id) on delete set null,
  correo            text,
  correo_verificado boolean not null default false,
  nombre            text,
  consentimiento    boolean not null default false,
  estado            text not null default 'recibido',
  created_at        timestamptz not null default now(),
  borrado_en        timestamptz,
  borrado_por       uuid references auth.users (id) on delete set null,
  borrado_motivo    text,
  constraint enc_respuestas_estado check (estado in ('recibido', 'revisado', 'para_video', 'rechazado', 'descartado')),
  constraint enc_respuestas_correo check (correo is null or (correo ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' and length(correo) <= 200)),
  constraint enc_respuestas_nombre check (nombre is null or length(nombre) <= 120),
  constraint enc_respuestas_motivo check (borrado_motivo is null or length(borrado_motivo) <= 300)
);

create index if not exists enc_respuestas_encuesta_idx on public.enc_respuestas (encuesta_id, created_at desc);
create index if not exists enc_respuestas_borradas_idx on public.enc_respuestas (borrado_en) where borrado_en is not null;
create index if not exists enc_respuestas_correo_idx on public.enc_respuestas (encuesta_id, lower(correo)) where correo is not null;

create table if not exists public.enc_valores (
  respuesta_id uuid not null references public.enc_respuestas (id) on delete cascade,
  pregunta_id  text not null,
  valor        jsonb not null,
  primary key (respuesta_id, pregunta_id),
  constraint enc_valores_pregunta check (pregunta_id ~ '^[a-z0-9_]{1,40}$'),
  constraint enc_valores_tamano check (length(valor::text) <= 200000)
);

comment on table public.enc_respuestas is 'Editor de encuestas (0184): una respuesta del modelo nuevo. Solo se inserta con enc_enviar_respuesta (función `encuestas`).';
comment on table public.enc_valores is 'Editor de encuestas (0184): el valor de cada pregunta de una respuesta.';

-- Los aportes y cifras de la encuesta vieja pueden enlazarse a una respuesta.
alter table public.enc_aportes add column if not exists respuesta_id uuid references public.enc_respuestas (id) on delete set null;
alter table public.enc_cifras add column if not exists respuesta_id uuid references public.enc_respuestas (id) on delete set null;

create table if not exists public.enc_envios_log (
  id          bigint generated always as identity primary key,
  encuesta_id uuid not null references public.enc_encuestas (id) on delete cascade,
  huella      text not null,
  en          timestamptz not null default now(),
  constraint enc_envios_huella check (length(huella) between 8 and 128)
);

create index if not exists enc_envios_log_idx on public.enc_envios_log (encuesta_id, huella, en desc);

-- -----------------------------------------------------------------------------
-- RLS y permisos de columna
-- -----------------------------------------------------------------------------

alter table public.enc_editores   enable row level security;
alter table public.enc_versiones  enable row level security;
alter table public.enc_respuestas enable row level security;
alter table public.enc_valores    enable row level security;
alter table public.enc_envios_log enable row level security;

drop policy if exists enc_encuestas_select on public.enc_encuestas;
create policy enc_encuestas_select on public.enc_encuestas
  for select to authenticated using (public.enc_puede_ver_encuesta(id));

drop policy if exists enc_encuestas_update on public.enc_encuestas;
create policy enc_encuestas_update on public.enc_encuestas
  for update to authenticated using (public.enc_puede_editar_encuesta(id)) with check (public.enc_puede_editar_encuesta(id));

drop policy if exists enc_aportes_select on public.enc_aportes;
create policy enc_aportes_select on public.enc_aportes
  for select to authenticated using (public.enc_puede_ver_encuesta(encuesta_id));

drop policy if exists enc_aportes_update on public.enc_aportes;
create policy enc_aportes_update on public.enc_aportes
  for update to authenticated using (public.enc_puede_editar_encuesta(encuesta_id)) with check (public.enc_puede_editar_encuesta(encuesta_id));

drop policy if exists enc_cifras_select on public.enc_cifras;
create policy enc_cifras_select on public.enc_cifras
  for select to authenticated using (exists (select 1 from public.enc_aportes a where a.id = aporte_id and public.enc_puede_ver_encuesta(a.encuesta_id)));

drop policy if exists enc_editores_select on public.enc_editores;
create policy enc_editores_select on public.enc_editores
  for select to authenticated using (public.enc_puede_ver_encuesta(encuesta_id));

drop policy if exists enc_versiones_select on public.enc_versiones;
create policy enc_versiones_select on public.enc_versiones
  for select to authenticated using (public.enc_puede_ver_encuesta(encuesta_id));

drop policy if exists enc_respuestas_select on public.enc_respuestas;
create policy enc_respuestas_select on public.enc_respuestas
  for select to authenticated using (public.enc_puede_ver_encuesta(encuesta_id));

drop policy if exists enc_respuestas_update on public.enc_respuestas;
create policy enc_respuestas_update on public.enc_respuestas
  for update to authenticated using (public.enc_puede_editar_encuesta(encuesta_id)) with check (public.enc_puede_editar_encuesta(encuesta_id));

drop policy if exists enc_valores_select on public.enc_valores;
create policy enc_valores_select on public.enc_valores
  for select to authenticated using (exists (select 1 from public.enc_respuestas r where r.id = respuesta_id and public.enc_puede_ver_encuesta(r.encuesta_id)));

drop policy if exists enc_bitacora_select on public.enc_bitacora;
create policy enc_bitacora_select on public.enc_bitacora
  for select to authenticated using ((encuesta_id is null and public.enc_puede_ver()) or (encuesta_id is not null and public.enc_puede_ver_encuesta(encuesta_id)));

revoke all on public.enc_editores, public.enc_versiones, public.enc_respuestas, public.enc_valores, public.enc_envios_log from public, anon, authenticated;
grant select on public.enc_editores, public.enc_versiones, public.enc_respuestas, public.enc_valores to authenticated;
grant update (estado) on public.enc_respuestas to authenticated;
grant update (acceso, dominios_permitidos, una_por_persona, abre_el, limite_respuestas, mensaje_cierre, estado, modo_llenado, config_pilo) on public.enc_encuestas to authenticated;
grant select, insert, update, delete on public.enc_editores, public.enc_versiones, public.enc_respuestas, public.enc_valores, public.enc_envios_log to service_role;

-- -----------------------------------------------------------------------------
-- Bitácora automática de los cambios de la encuesta
-- -----------------------------------------------------------------------------

create or replace function public.enc_bitacora_encuesta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    insert into public.enc_bitacora (encuesta_id, accion, actor, detalle) values (new.id, 'estado_cambiado', auth.uid(), jsonb_build_object('de', old.estado, 'a', new.estado));
  end if;
  if new.acceso is distinct from old.acceso then
    insert into public.enc_bitacora (encuesta_id, accion, actor, detalle) values (new.id, 'acceso_cambiado', auth.uid(), jsonb_build_object('de', old.acceso, 'a', new.acceso));
  end if;
  if new.titulo is distinct from old.titulo then
    insert into public.enc_bitacora (encuesta_id, accion, actor, detalle) values (new.id, 'titulo_cambiado', auth.uid(), jsonb_build_object('de', old.titulo, 'a', new.titulo));
  end if;
  if new.dominios_permitidos is distinct from old.dominios_permitidos or new.una_por_persona is distinct from old.una_por_persona
     or new.limite_respuestas is distinct from old.limite_respuestas or new.abre_el is distinct from old.abre_el or new.cierra_el is distinct from old.cierra_el then
    insert into public.enc_bitacora (encuesta_id, accion, actor, detalle) values (new.id, 'reglas_cambiadas', auth.uid(), '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists enc_encuestas_bitacora on public.enc_encuestas;
create trigger enc_encuestas_bitacora
  after update on public.enc_encuestas
  for each row execute function public.enc_bitacora_encuesta();

-- -----------------------------------------------------------------------------
-- Crear, duplicar, guardar borrador, publicar
-- -----------------------------------------------------------------------------

create or replace function public.enc_crear_encuesta(p_slug text, p_titulo text, p_estructura jsonb, p_plantilla text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.enc_puede_editar() then
    raise exception 'No tiene permiso para crear encuestas.' using errcode = '42501';
  end if;
  insert into public.enc_encuestas (slug, titulo, anio, estado, plantilla_origen, abierta)
  values (lower(btrim(p_slug)), btrim(p_titulo), to_char(now() at time zone 'America/Bogota', 'YYYY'), 'borrador', nullif(btrim(coalesce(p_plantilla, '')), ''), false)
  returning id into v_id;
  insert into public.enc_versiones (encuesta_id, numero, estructura, autor, nota) values (v_id, 1, p_estructura, auth.uid(), 'Primer borrador');
  insert into public.enc_editores (encuesta_id, usuario_id, rol, agregado_por) values (v_id, auth.uid(), 'propietario', auth.uid()) on conflict do nothing;
  insert into public.enc_bitacora (encuesta_id, accion, actor, detalle) values (v_id, 'encuesta_creada', auth.uid(), jsonb_build_object('plantilla', p_plantilla));
  return v_id;
end;
$$;

-- Duplicar: copia la estructura más reciente (borrador o publicada) y los ajustes; nunca las respuestas.
create or replace function public.enc_duplicar_encuesta(p_id uuid, p_slug text, p_titulo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.enc_encuestas;
  v_estructura jsonb;
  v_id uuid;
begin
  if not public.enc_puede_editar() then
    raise exception 'No tiene permiso para duplicar encuestas.' using errcode = '42501';
  end if;
  select * into o from public.enc_encuestas where id = p_id;
  if not found then
    raise exception 'La encuesta no existe.' using errcode = 'P0002';
  end if;
  select estructura into v_estructura from public.enc_versiones where encuesta_id = p_id order by numero desc limit 1;
  insert into public.enc_encuestas (slug, titulo, anio, estado, abierta, intro, despedida, acceso, dominios_permitidos, una_por_persona, limite_respuestas, mensaje_cierre, plantilla_origen, modo_llenado, config_pilo)
  values (lower(btrim(p_slug)), btrim(p_titulo), o.anio, 'borrador', false, o.intro, o.despedida, o.acceso, o.dominios_permitidos, o.una_por_persona, o.limite_respuestas, o.mensaje_cierre, coalesce(o.plantilla_origen, o.slug), o.modo_llenado, o.config_pilo - 'flujo')
  returning id into v_id;
  insert into public.enc_versiones (encuesta_id, numero, estructura, autor, nota) values (v_id, 1, coalesce(v_estructura, '{"version":1,"secciones":[]}'::jsonb), auth.uid(), 'Copia de ' || left(o.titulo, 200));
  insert into public.enc_editores (encuesta_id, usuario_id, rol, agregado_por) values (v_id, auth.uid(), 'propietario', auth.uid()) on conflict do nothing;
  insert into public.enc_bitacora (encuesta_id, accion, actor, detalle) values (v_id, 'encuesta_duplicada', auth.uid(), jsonb_build_object('origen', o.slug));
  return v_id;
end;
$$;

create or replace function public.enc_guardar_borrador(p_encuesta uuid, p_estructura jsonb, p_nota text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n int;
begin
  if not public.enc_puede_editar_encuesta(p_encuesta) then
    raise exception 'No tiene permiso para editar esta encuesta.' using errcode = '42501';
  end if;
  update public.enc_versiones set estructura = p_estructura, autor = auth.uid(), nota = left(coalesce(nullif(btrim(p_nota), ''), nota), 300)
   where encuesta_id = p_encuesta and not fijada
  returning id into v_id;
  if v_id is null then
    select coalesce(max(numero), 0) + 1 into v_n from public.enc_versiones where encuesta_id = p_encuesta;
    insert into public.enc_versiones (encuesta_id, numero, estructura, autor, nota) values (p_encuesta, v_n, p_estructura, auth.uid(), left(coalesce(p_nota, ''), 300)) returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Publicar: fija el borrador, lo vuelve la versión viva y abre otro borrador igual para seguir editando.
create or replace function public.enc_publicar(p_encuesta uuid, p_nota text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.enc_versiones;
  e public.enc_encuestas;
  v_n int;
begin
  if not public.enc_puede_editar_encuesta(p_encuesta) then
    raise exception 'No tiene permiso para publicar esta encuesta.' using errcode = '42501';
  end if;
  select * into e from public.enc_encuestas where id = p_encuesta for update;
  if not found then
    raise exception 'La encuesta no existe.' using errcode = 'P0002';
  end if;
  select * into v from public.enc_versiones where encuesta_id = p_encuesta and not fijada for update;
  if not found then
    raise exception 'No hay cambios por publicar.' using errcode = 'P0002';
  end if;
  if jsonb_array_length(v.estructura -> 'secciones') = 0 then
    raise exception 'La encuesta no tiene preguntas.' using errcode = '22023';
  end if;
  update public.enc_versiones set fijada = true, fijada_en = now(), autor = auth.uid(), nota = left(coalesce(nullif(btrim(p_nota), ''), nota), 300) where id = v.id;
  select max(numero) + 1 into v_n from public.enc_versiones where encuesta_id = p_encuesta;
  insert into public.enc_versiones (encuesta_id, numero, estructura, autor, nota) values (p_encuesta, v_n, v.estructura, auth.uid(), 'Borrador desde la versión ' || v.numero);
  update public.enc_encuestas set version_publicada_id = v.id, estado = case when e.estado = 'borrador' then 'publicada' else e.estado end where id = p_encuesta;
  insert into public.enc_bitacora (encuesta_id, accion, actor, detalle) values (p_encuesta, 'version_publicada', auth.uid(), jsonb_build_object('version', v.numero, 'nota', left(coalesce(p_nota, ''), 300)));
  return v.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Editores compartidos
-- -----------------------------------------------------------------------------

create or replace function public.enc_compartir(p_encuesta uuid, p_correo text, p_rol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.enc_puede_editar_encuesta(p_encuesta) then
    raise exception 'No tiene permiso para compartir esta encuesta.' using errcode = '42501';
  end if;
  if p_rol not in ('editor', 'lector') then
    raise exception 'El rol es editor o lector.' using errcode = '22023';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_correo));
  if v_user is null then
    raise exception 'Esa persona todavía no tiene cuenta en la intranet.' using errcode = 'P0002';
  end if;
  insert into public.enc_editores (encuesta_id, usuario_id, rol, agregado_por) values (p_encuesta, v_user, p_rol, auth.uid())
  on conflict (encuesta_id, usuario_id) do update set rol = excluded.rol where public.enc_editores.rol <> 'propietario';
  insert into public.enc_bitacora (encuesta_id, accion, actor, detalle) values (p_encuesta, 'editor_agregado', auth.uid(), jsonb_build_object('correo', lower(btrim(p_correo)), 'rol', p_rol));
end;
$$;

create or replace function public.enc_quitar_editor(p_encuesta uuid, p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.enc_puede_editar_encuesta(p_encuesta) then
    raise exception 'No tiene permiso para cambiar quién edita esta encuesta.' using errcode = '42501';
  end if;
  delete from public.enc_editores where encuesta_id = p_encuesta and usuario_id = p_usuario and rol <> 'propietario';
  insert into public.enc_bitacora (encuesta_id, accion, actor, detalle) values (p_encuesta, 'editor_quitado', auth.uid(), jsonb_build_object('usuario', p_usuario));
end;
$$;

create or replace function public.enc_editores_de(p_encuesta uuid)
returns table (usuario_id uuid, correo text, rol text)
language sql
stable
security definer
set search_path = public
as $$
  select e.usuario_id, u.email::text, e.rol
    from public.enc_editores e join auth.users u on u.id = e.usuario_id
   where e.encuesta_id = p_encuesta and public.enc_puede_ver_encuesta(p_encuesta)
   order by e.created_at;
$$;

-- -----------------------------------------------------------------------------
-- Borrado lógico de respuestas del modelo nuevo y purga (ampliada)
-- -----------------------------------------------------------------------------

create or replace function public.enc_borrar_respuesta(p_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.enc_respuestas;
begin
  select * into r from public.enc_respuestas where id = p_id for update;
  if not found then
    raise exception 'La respuesta no existe.' using errcode = 'P0002';
  end if;
  if not public.enc_puede_editar_encuesta(r.encuesta_id) then
    raise exception 'No tiene permiso para borrar respuestas.' using errcode = '42501';
  end if;
  if r.borrado_en is not null then
    return;
  end if;
  update public.enc_respuestas set borrado_en = now(), borrado_por = auth.uid(), borrado_motivo = nullif(left(btrim(coalesce(p_motivo, '')), 300), '') where id = p_id;
  insert into public.enc_bitacora (encuesta_id, aporte_id, accion, actor, detalle)
  values (r.encuesta_id, r.id, 'respuesta_borrada', auth.uid(), jsonb_build_object('motivo', nullif(left(btrim(coalesce(p_motivo, '')), 300), '')));
end;
$$;

create or replace function public.enc_restaurar_respuesta(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.enc_respuestas;
begin
  select * into r from public.enc_respuestas where id = p_id for update;
  if not found then
    raise exception 'La respuesta ya no existe (se purgó de la papelera).' using errcode = 'P0002';
  end if;
  if not public.enc_puede_editar_encuesta(r.encuesta_id) then
    raise exception 'No tiene permiso para restaurar respuestas.' using errcode = '42501';
  end if;
  if r.borrado_en is null then
    return;
  end if;
  update public.enc_respuestas set borrado_en = null, borrado_por = null, borrado_motivo = null where id = p_id;
  insert into public.enc_bitacora (encuesta_id, aporte_id, accion, actor, detalle) values (r.encuesta_id, r.id, 'respuesta_restaurada', auth.uid(), '{}'::jsonb);
end;
$$;

create or replace function public.enc_purgar_borrados()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  m int;
begin
  if auth.role() <> 'service_role' and not public.enc_puede_editar() then
    raise exception 'No tiene permiso para purgar la papelera.' using errcode = '42501';
  end if;
  with b as (
    delete from public.enc_aportes where borrado_en is not null and borrado_en < now() - interval '30 days' returning id
  )
  select count(*) into n from b;
  with b as (
    delete from public.enc_respuestas where borrado_en is not null and borrado_en < now() - interval '30 days' returning id
  )
  select count(*) into m from b;
  delete from public.enc_envios_log where en < now() - interval '2 days';
  if n + m > 0 then
    insert into public.enc_bitacora (encuesta_id, accion, actor, detalle) values (null, 'papelera_purgada', auth.uid(), jsonb_build_object('respuestas', n + m));
  end if;
  return n + m;
end;
$$;

-- -----------------------------------------------------------------------------
-- enc_enviar_respuesta: el envío del modelo nuevo, con o sin correo
--
-- La función `encuestas` ya validó los valores contra la estructura publicada y,
-- si el acceso es con Microsoft, comprobó el correo y su dominio. Aquí se vuelve a
-- comprobar lo que solo la base puede garantizar: que la encuesta recibe, el
-- límite de respuestas, una por persona y el freno por huella de IP.
-- Códigos: P0002 no existe · P0003 cerrada · P0004 demasiados envíos seguidos ·
--          P0005 ya respondió · P0006 se llegó al límite · 22023 dato no válido.
-- -----------------------------------------------------------------------------

create or replace function public.enc_enviar_respuesta(p_slug text, p_correo text, p_verificado boolean, p_nombre text, p_consentimiento boolean, p_valores jsonb, p_huella text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.enc_encuestas;
  v_correo text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_id uuid;
  v_k text;
begin
  select * into e from public.enc_encuestas where slug = p_slug;
  if not found then
    raise exception 'Esta encuesta no existe.' using errcode = 'P0002';
  end if;
  if e.estado <> 'publicada' or e.version_publicada_id is null
     or (e.abre_el is not null and v_hoy < e.abre_el) or (e.cierra_el is not null and v_hoy > e.cierra_el) then
    raise exception 'Esta encuesta no está recibiendo respuestas.' using errcode = 'P0003';
  end if;
  if p_valores is null or jsonb_typeof(p_valores) <> 'object' or length(p_valores::text) > 400000 then
    raise exception 'valores: el envío no tiene el formato esperado.' using errcode = '22023';
  end if;
  if e.acceso = 'microsoft' and (v_correo is null or not coalesce(p_verificado, false)) then
    raise exception 'correo: esta encuesta pide el correo institucional confirmado.' using errcode = '22023';
  end if;
  if v_correo is not null and (v_correo !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' or length(v_correo) > 200) then
    raise exception 'correo: el correo no tiene forma de correo.' using errcode = '22023';
  end if;
  if e.acceso = 'abierta' and p_huella is not null and length(p_huella) >= 8 then
    if (select count(*) from public.enc_envios_log where encuesta_id = e.id and huella = p_huella and en > now() - interval '10 minutes') >= 5 then
      raise exception 'Demasiados envíos seguidos. Espere unos minutos.' using errcode = 'P0004';
    end if;
  end if;
  if e.una_por_persona and e.acceso = 'microsoft' and exists (
       select 1 from public.enc_respuestas r where r.encuesta_id = e.id and r.borrado_en is null and lower(r.correo) = v_correo) then
    raise exception 'Ya hay una respuesta de este correo.' using errcode = 'P0005';
  end if;
  if e.limite_respuestas is not null and (select count(*) from public.enc_respuestas r where r.encuesta_id = e.id and r.borrado_en is null) >= e.limite_respuestas then
    raise exception 'Se alcanzó el límite de respuestas.' using errcode = 'P0006';
  end if;

  insert into public.enc_respuestas (encuesta_id, version_id, correo, correo_verificado, nombre, consentimiento)
  values (e.id, e.version_publicada_id, v_correo, coalesce(p_verificado, false) and v_correo is not null, nullif(left(btrim(coalesce(p_nombre, '')), 120), ''), coalesce(p_consentimiento, false))
  returning id into v_id;

  for v_k in select key from jsonb_each(p_valores) loop
    if v_k !~ '^[a-z0-9_]{1,40}$' then
      raise exception 'valores.%: identificador de pregunta no válido.', left(v_k, 40) using errcode = '22023';
    end if;
    insert into public.enc_valores (respuesta_id, pregunta_id, valor) values (v_id, v_k, p_valores -> v_k);
  end loop;

  if p_huella is not null and length(p_huella) >= 8 then
    insert into public.enc_envios_log (encuesta_id, huella) values (e.id, left(p_huella, 128));
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

comment on function public.enc_enviar_respuesta(text, text, boolean, text, boolean, jsonb, text) is 'Editor de encuestas (0184): guarda una respuesta del modelo nuevo. Solo la función `encuestas`, con el rol de servicio.';

revoke all on function public.enc_crear_encuesta(text, text, jsonb, text) from public, anon;
revoke all on function public.enc_duplicar_encuesta(uuid, text, text) from public, anon;
revoke all on function public.enc_guardar_borrador(uuid, jsonb, text) from public, anon;
revoke all on function public.enc_publicar(uuid, text) from public, anon;
revoke all on function public.enc_compartir(uuid, text, text) from public, anon;
revoke all on function public.enc_quitar_editor(uuid, uuid) from public, anon;
revoke all on function public.enc_editores_de(uuid) from public, anon;
revoke all on function public.enc_borrar_respuesta(uuid, text) from public, anon;
revoke all on function public.enc_restaurar_respuesta(uuid) from public, anon;
revoke all on function public.enc_purgar_borrados() from public, anon;
revoke all on function public.enc_enviar_respuesta(text, text, boolean, text, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.enc_crear_encuesta(text, text, jsonb, text) to authenticated, service_role;
grant execute on function public.enc_duplicar_encuesta(uuid, text, text) to authenticated, service_role;
grant execute on function public.enc_guardar_borrador(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.enc_publicar(uuid, text) to authenticated, service_role;
grant execute on function public.enc_compartir(uuid, text, text) to authenticated, service_role;
grant execute on function public.enc_quitar_editor(uuid, uuid) to authenticated, service_role;
grant execute on function public.enc_editores_de(uuid) to authenticated, service_role;
grant execute on function public.enc_borrar_respuesta(uuid, text) to authenticated, service_role;
grant execute on function public.enc_restaurar_respuesta(uuid) to authenticated, service_role;
grant execute on function public.enc_purgar_borrados() to authenticated, service_role;
grant execute on function public.enc_enviar_respuesta(text, text, boolean, text, boolean, jsonb, text) to service_role;

-- -----------------------------------------------------------------------------
-- rendicion-2026 en el modelo nuevo: su versión 1, fijada. Su flujo de aportes
-- (enc_enviar) sigue igual; la estructura es lo que ve el editor.
-- -----------------------------------------------------------------------------

do $seed$
declare
  v_enc uuid;
  v_ver uuid;
begin
  select id into v_enc from public.enc_encuestas where slug = 'rendicion-2026';
  if v_enc is null then
    return;
  end if;
  -- La marca del flujo de aportes con cifras (enc_enviar): la función `encuestas` lo usa para esta encuesta y no para las nuevas.
  update public.enc_encuestas set config_pilo = config_pilo || '{"flujo":"aportes"}'::jsonb where id = v_enc and not (config_pilo ? 'flujo');
  if not exists (select 1 from public.enc_versiones where encuesta_id = v_enc) then
    insert into public.enc_versiones (encuesta_id, numero, estructura, nota, fijada, fijada_en)
    values (v_enc, 1, '{"version":1,"secciones":[{"id":"identificacion","titulo":"Identificación","preguntas":[{"obligatoria":true,"id":"dependencia","tipo":"texto_corto","enunciado":"Dependencia","apoyo":"Como la conoce la comunidad, por ejemplo Facultad de Ingenierías.","validaciones":{"largoMin":3,"largoMax":90},"pilo":{"explicacion":"Escriba el nombre de su dependencia, como la conoce la comunidad. Por ejemplo: Facultad de Ingenierías o Bienestar Universitario."}}]},{"id":"aportes_seccion","titulo":"Logros y retos","preguntas":[{"obligatoria":true,"id":"aportes","tipo":"bloque_logro_reto","enunciado":"Logros y retos de su dependencia","apoyo":"Cada uno lleva un título, una descripción y las cifras que lo respaldan.","validaciones":{"maxItems":30},"pilo":{"explicacion":"Un logro es algo que su dependencia consiguió; un reto, lo que falta o exige más esfuerzo. Cada uno lleva una frase corta, una descripción y cifras reales que usted pueda respaldar."}}]}]}'::jsonb, 'Estructura de la primera encuesta, en el modelo nuevo', true, now())
    returning id into v_ver;
    insert into public.enc_versiones (encuesta_id, numero, estructura, nota)
    values (v_enc, 2, '{"version":1,"secciones":[{"id":"identificacion","titulo":"Identificación","preguntas":[{"obligatoria":true,"id":"dependencia","tipo":"texto_corto","enunciado":"Dependencia","apoyo":"Como la conoce la comunidad, por ejemplo Facultad de Ingenierías.","validaciones":{"largoMin":3,"largoMax":90},"pilo":{"explicacion":"Escriba el nombre de su dependencia, como la conoce la comunidad. Por ejemplo: Facultad de Ingenierías o Bienestar Universitario."}}]},{"id":"aportes_seccion","titulo":"Logros y retos","preguntas":[{"obligatoria":true,"id":"aportes","tipo":"bloque_logro_reto","enunciado":"Logros y retos de su dependencia","apoyo":"Cada uno lleva un título, una descripción y las cifras que lo respaldan.","validaciones":{"maxItems":30},"pilo":{"explicacion":"Un logro es algo que su dependencia consiguió; un reto, lo que falta o exige más esfuerzo. Cada uno lleva una frase corta, una descripción y cifras reales que usted pueda respaldar."}}]}]}'::jsonb, 'Borrador desde la versión 1');
    update public.enc_encuestas
       set version_publicada_id = v_ver,
           plantilla_origen = coalesce(plantilla_origen, 'rendicion'),
           mensaje_cierre = case when mensaje_cierre = '' then 'Esta encuesta ya no recibe respuestas. Gracias por su aporte.' else mensaje_cierre end
     where id = v_enc;
  end if;
end;
$seed$;

notify pgrst, 'reload schema';
