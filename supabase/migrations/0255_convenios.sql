-- =============================================================================
-- 0255 · Internacionalización: Convenios (registro propio, ruta de firma e historial)
--
-- Reemplaza el Excel institucional «Relación de convenios» por un registro con
-- tablas propias (prefijo conv_). NO toca las tablas Multicampus de 0166/0167
-- (int_libros / int_hojas / int_filas): esas siguen como están.
--
--   conv_convenios    un convenio. La vigencia (Vigente / Por vencer / Vencido / Sin fecha)
--                     NO se guarda: se calcula con las fechas. Se guardan a mano la ruta de
--                     firma (pasos, 0 a 5) y el cierre anticipado (cerrado).
--   conv_historial    todo cambio relevante (creación, importación, pasos, renovación,
--                     carpeta, cierre), con fecha y autor.
--   conv_documentos   esqueleto para la etapa de gestión (carga de archivos): vacía, sin lógica.
--
-- Quién puede qué: ven el módulo quienes ya ven Internacionalización (int_ve_modulo);
-- crean y editan Director, Planeación y Coordinadores (int_puede_crear, 0166). Nadie borra
-- convenios desde la pantalla (no hay política de borrado).
--
-- También deja la plantilla «Renovación de convenio» en rel_plantillas (0254) para el
-- botón «Avisar». No envía nada: el envío masivo sigue siendo manual, en Relaciones.
--
-- UDrive (0187, 0188, 0191): esta migración siembra la unidad de trabajo «Internacionalización»
-- (monograma INT, icono globe, plantilla en blanco, cuota por defecto de drive_config) con la
-- raíz y la carpeta «Convenios», y fija cómo se mapea el rol de la oficina a un papel de la unidad:
--
--   Director de Internacionalización  → Administra (admin)
--   Planeación y Coordinadores        → Crea (creador): suben archivos y organizan carpetas
--   Gestores                          → Lector
--   Administración general            → Administra toda unidad (ya lo hace UDrive)
--
-- Decisión: a diferencia de las carpetas de responsables externos (0211/0239, que van por
-- funciones SECURITY DEFINER estrechas), esta es la propia oficina y trabaja en SU unidad, así
-- que recibe el papel directo y no necesita funciones de reserva para subir. conv_sincronizar_unidad()
-- reparte esos papeles; corre al aplicar la migración, cada vez que se crea una carpeta de
-- convenio y cuando cambia int_miembros (alta o cambio de papel). Solo SUBE papeles: nunca baja
-- ni quita a nadie; lo que se retira se hace a mano en UDrive. Las personas externas al dominio
-- institucional se omiten (UDrive les exige vencimiento). Para entrar a UDrive la persona
-- necesita además la pantalla «UDrive» en sus accesos (drive_entra, 0202).
--
-- Carpetas: Internacionalización › Convenios › <País> › <código> · <institución>
-- (conv_asegurar_carpeta). Se define su propio ayudante de carpetas (conv_asegurar_nodo) en lugar
-- de ugm_asegurar_carpeta para no depender de la migración 0211.
--
-- Requiere 0166, 0191 y 0254. Idempotente. Todo DELETE lleva WHERE (safeupdate, 0095).
-- =============================================================================

create table if not exists public.conv_convenios (
  id                    uuid primary key default gen_random_uuid(),
  -- ci-01-### (internacional) o cn-01-### (nacional), siempre en minúsculas.
  codigo                text not null,
  documento             text not null default 'Convenio',
  naturaleza            text not null default 'Internacional',
  institucion           text not null,
  -- Nombre del país como en el mapa de UDES en cifras; «Varios países» o «Sin país» si no aplica.
  pais                  text not null default 'Sin país',
  -- ISO 3166-1 alfa-3 si el país se ubica en el mapa.
  pais_cod              text,
  objeto                text not null default '',
  tipo                  text not null default 'Sin tipo',
  -- Lo que decía el Excel cuando se escribió de otra manera.
  tipo_excel            text not null default '',
  modalidad             text not null default '',
  fecha_firma           date,
  fecha_terminacion     date,
  indefinido            boolean not null default false,
  renovacion            text not null default '',
  campus                text not null default 'Todos',
  facultad              text not null default '',
  programas             text not null default '',
  observaciones         text not null default '',
  -- udrive (carpeta en la unidad «Internacionalización» de UDrive) | enlace (https, p. ej. SharePoint) | sin
  carpeta_estado        text not null default 'sin',
  carpeta_url           text,
  drive_carpeta_id      uuid references public.drive_carpetas (id) on delete set null,
  -- Pasos hechos de la ruta de firma (0 a 5) y la fecha en que se hizo cada uno ([null|'AAAA-MM-DD' × 5]).
  pasos                 smallint not null default 1,
  pasos_fechas          jsonb not null default '[null,null,null,null,null]'::jsonb,
  cerrado               boolean not null default false,
  cerrado_en            date,
  -- Estado que traía el Excel (normalizado), para avisar si ya no coincide con las fechas.
  estado_excel          text,
  origen                text not null default 'manual',
  created_by            uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint conv_codigo_formato check (codigo ~ '^c[in]-[0-9]{2}-[0-9]{3}$'),
  constraint conv_codigo_unico unique (codigo),
  constraint conv_naturaleza check (naturaleza in ('Internacional', 'Nacional')),
  constraint conv_institucion check (char_length(btrim(institucion)) between 1 and 300),
  constraint conv_tipo check (tipo in ('Marco', 'Específico', 'Otro', 'Sin tipo')),
  constraint conv_carpeta check (carpeta_estado in ('udrive', 'enlace', 'sin')),
  constraint conv_carpeta_url check (carpeta_url is null or carpeta_url ~ '^https://[^[:space:]]+$'),
  constraint conv_pasos check (pasos between 0 and 5),
  constraint conv_pasos_fechas check (jsonb_typeof(pasos_fechas) = 'array'),
  constraint conv_indefinido check (not (indefinido and fecha_terminacion is not null)),
  constraint conv_origen check (origen in ('manual', 'excel'))
);

comment on table public.conv_convenios is
  'Convenios (0255): registro de Internacionalización. La vigencia se calcula con fecha_terminacion; pasos y cerrado se guardan a mano.';

create index if not exists conv_convenios_pais_idx on public.conv_convenios (pais);
create index if not exists conv_convenios_termina_idx on public.conv_convenios (fecha_terminacion);

drop trigger if exists conv_convenios_set_updated_at on public.conv_convenios;
create trigger conv_convenios_set_updated_at before update on public.conv_convenios
  for each row execute function public.set_updated_at();

create table if not exists public.conv_historial (
  id           uuid primary key default gen_random_uuid(),
  convenio_id  uuid not null references public.conv_convenios (id) on delete cascade,
  fecha        date not null default current_date,
  texto        text not null,
  autor        uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint conv_historial_texto check (char_length(btrim(texto)) between 1 and 1000)
);

create index if not exists conv_historial_convenio_idx on public.conv_historial (convenio_id, fecha desc, created_at desc);

-- Esqueleto para la etapa de gestión: los espacios de documentos de cada convenio. Sin lógica de subida.
create table if not exists public.conv_documentos (
  id           uuid primary key default gen_random_uuid(),
  convenio_id  uuid not null references public.conv_convenios (id) on delete cascade,
  espacio      text not null,
  nombre       text not null default '',
  ruta         text,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint conv_documentos_espacio check (espacio in ('firmado', 'borrador', 'adendas', 'acta', 'informes'))
);

create index if not exists conv_documentos_convenio_idx on public.conv_documentos (convenio_id);

alter table public.conv_convenios enable row level security;
alter table public.conv_historial enable row level security;
alter table public.conv_documentos enable row level security;

drop policy if exists conv_convenios_read on public.conv_convenios;
create policy conv_convenios_read on public.conv_convenios for select to authenticated
  using (public.int_ve_modulo());
drop policy if exists conv_convenios_insert on public.conv_convenios;
create policy conv_convenios_insert on public.conv_convenios for insert to authenticated
  with check (public.int_puede_crear());
drop policy if exists conv_convenios_update on public.conv_convenios;
create policy conv_convenios_update on public.conv_convenios for update to authenticated
  using (public.int_puede_crear()) with check (public.int_puede_crear());

drop policy if exists conv_historial_read on public.conv_historial;
create policy conv_historial_read on public.conv_historial for select to authenticated
  using (public.int_ve_modulo());
drop policy if exists conv_historial_insert on public.conv_historial;
create policy conv_historial_insert on public.conv_historial for insert to authenticated
  with check (public.int_puede_crear() and (autor is null or autor = auth.uid()));

drop policy if exists conv_documentos_read on public.conv_documentos;
create policy conv_documentos_read on public.conv_documentos for select to authenticated
  using (public.int_ve_modulo());

-- -----------------------------------------------------------------------------
-- Plantilla de correo para «Avisar» (una sola vez: por nombre)
-- -----------------------------------------------------------------------------

insert into public.rel_plantillas (nombre, asunto, cuerpo, usa_actividad, actividad)
select 'Renovación de convenio',
       'Renovación del convenio con la Universidad de Santander',
       E'Estimado(a) {{nombre}}:\n\nDesde la Oficina de Relaciones Internacionales de la Universidad de Santander le escribimos porque el convenio que nos une con {{institucion}} se acerca a su fecha de terminación.\n\nQueremos conversar con usted sobre su renovación y revisar qué actividades de movilidad y cooperación convendría mantener o ampliar.\n\nQuedamos atentos a su respuesta para acordar los pasos siguientes.\n\nCordialmente,\nRelaciones Internacionales · UDES',
       false, '{}'::jsonb
where not exists (select 1 from public.rel_plantillas p where p.nombre = 'Renovación de convenio');

-- -----------------------------------------------------------------------------
-- UDrive: unidad «Internacionalización», papeles de la oficina y carpeta de cada convenio
-- -----------------------------------------------------------------------------

do $$
declare
  v_admin uuid;
  v_id uuid;
  v_raiz uuid := gen_random_uuid();
begin
  select u.id into v_id from public.drive_unidades u where lower(btrim(u.nombre)) = 'internacionalización';
  if v_id is not null then
    return;
  end if;
  select p.id into v_admin from public.profiles p where p.role = 'admin' and p.is_active order by p.created_at limit 1;
  if v_admin is null then
    raise notice '0255: no hay administrador activo; la unidad «Internacionalización» de UDrive no se sembró. Vuelva a aplicar la migración.';
    return;
  end if;
  v_id := gen_random_uuid();
  insert into public.drive_unidades (id, nombre, descripcion, monograma, acento, icono, composicion, portada, plantilla, carpeta_raiz, creada_por, cuota_bytes)
  values (v_id, 'Internacionalización', 'Documentos de convenios y relaciones internacionales de la UDES.', 'INT', '#0b3a78', 'globe', 'A', 'curvas', 'blanco', v_raiz,
          v_admin, public.drive_config_num('cuota_unidad_bytes', 5368709120));
  insert into public.drive_carpetas (id, padre_id, nombre, creada_por, unidad_id) values (v_raiz, null, 'Internacionalización', v_admin, v_id);
  insert into public.drive_carpetas (padre_id, nombre, creada_por) values (v_raiz, 'Convenios', v_admin);
  insert into public.drive_unidad_eventos (unidad_id, actor_id, como, accion, detalle)
  values (v_id, null, 'sistema', 'creada', jsonb_build_object('origen', '0255'));
end $$;

/** Reparte los papeles de la oficina en la unidad (solo sube, nunca baja). Ver la cabecera. */
create or replace function public.conv_sincronizar_unidad()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidad uuid;
begin
  select u.id into v_unidad from public.drive_unidades u where lower(btrim(u.nombre)) = 'internacionalización' and u.archivada_en is null;
  if v_unidad is null then return; end if;
  insert into public.drive_unidad_miembros (unidad_id, usuario_id, rol)
  select v_unidad, t.uid, case t.rango when 4 then 'admin' when 3 then 'creador' else 'lector' end
    from (
      select x.uid, max(x.rango) as rango
        from (
          select m.user_id as uid, case m.rol when 'director' then 4 when 'coordinador' then 3 else 1 end as rango from public.int_miembros m
          union all
          select p.id, 3 from public.profiles p where p.role = 'planeacion' and p.is_active
        ) x
        join public.profiles pr on pr.id = x.uid and pr.is_active
       where not public.drive_es_externo(x.uid)
       group by x.uid
    ) t
  on conflict (unidad_id, usuario_id) do update
    set rol = excluded.rol
    where (case excluded.rol when 'admin' then 4 when 'creador' then 3 when 'editor' then 2 else 1 end)
        > (case drive_unidad_miembros.rol when 'admin' then 4 when 'creador' then 3 when 'editor' then 2 else 1 end);
end;
$$;

create or replace function public.conv_miembros_a_unidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.conv_sincronizar_unidad();
  return null;
end;
$$;

drop trigger if exists conv_int_miembros_unidad on public.int_miembros;
create trigger conv_int_miembros_unidad after insert or update on public.int_miembros
  for each statement execute function public.conv_miembros_a_unidad();

/** La carpeta hija de `p_padre` con ese nombre (la crea si falta). El nombre se limpia de / \ y controles. */
create or replace function public.conv_asegurar_nodo(p_padre uuid, p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := left(btrim(regexp_replace(regexp_replace(coalesce(p_nombre, ''), '[/\\]', '-', 'g'), '[[:cntrl:]]', ' ', 'g')), 120);
  v_id uuid;
begin
  if v_nombre = '' then v_nombre := 'Sin nombre'; end if;
  select c.id into v_id from public.drive_carpetas c
   where c.padre_id = p_padre and lower(c.nombre) = lower(v_nombre) and c.borrado_en is null limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.drive_carpetas (padre_id, nombre, creada_por) values (p_padre, v_nombre, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

/**
 * Asegura Internacionalización › Convenios › <País> › <código> · <institución> y la deja en el
 * convenio (drive_carpeta_id, carpeta_estado = 'udrive'). Idempotente. Solo quien puede crear.
 * Devuelve el id de la carpeta.
 */
create or replace function public.conv_asegurar_carpeta(p_convenio uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conv_convenios;
  v_unidad public.drive_unidades;
  v_convs uuid;
  v_pais uuid;
  v_carpeta uuid;
begin
  if auth.uid() is null or not public.int_puede_crear() then
    raise exception 'No tiene permiso para crear carpetas de convenios.' using errcode = '42501';
  end if;
  select * into c from public.conv_convenios where id = p_convenio for update;
  if not found then raise exception 'El convenio no existe.' using errcode = 'P0002'; end if;
  if c.drive_carpeta_id is not null and exists (select 1 from public.drive_carpetas f where f.id = c.drive_carpeta_id and f.borrado_en is null) then
    if c.carpeta_estado <> 'udrive' then
      update public.conv_convenios set carpeta_estado = 'udrive', carpeta_url = null where id = c.id;
    end if;
    return c.drive_carpeta_id;
  end if;
  select * into v_unidad from public.drive_unidades u where lower(btrim(u.nombre)) = 'internacionalización' and u.archivada_en is null limit 1;
  if not found or v_unidad.carpeta_raiz is null then
    raise exception 'No se encontró la unidad «Internacionalización» de UDrive (migración 0255).' using errcode = 'P0002';
  end if;
  perform public.conv_sincronizar_unidad();
  v_convs := public.conv_asegurar_nodo(v_unidad.carpeta_raiz, 'Convenios');
  v_pais := public.conv_asegurar_nodo(v_convs, c.pais);
  v_carpeta := public.conv_asegurar_nodo(v_pais, c.codigo || ' · ' || c.institucion);
  update public.conv_convenios set drive_carpeta_id = v_carpeta, carpeta_estado = 'udrive', carpeta_url = null where id = c.id;
  insert into public.conv_historial (convenio_id, texto) values (c.id, 'Se creó la carpeta en UDrive.');
  return v_carpeta;
end;
$$;

revoke all on function public.conv_sincronizar_unidad() from public, anon, authenticated;
revoke all on function public.conv_miembros_a_unidad() from public, anon, authenticated;
revoke all on function public.conv_asegurar_nodo(uuid, text) from public, anon, authenticated;
revoke all on function public.conv_asegurar_carpeta(uuid) from public, anon;
grant execute on function public.conv_asegurar_carpeta(uuid) to authenticated;

-- Reparte los papeles de la oficina ahora (quienes ya están en int_miembros y Planeación).
select public.conv_sincronizar_unidad();

notify pgrst, 'reload schema';
