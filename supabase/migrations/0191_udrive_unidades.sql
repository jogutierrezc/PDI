-- =============================================================================
-- UDrive · Unidades de trabajo (0191).
--
-- Una unidad de trabajo es un espacio con nombre, identidad propia, personas con
-- papel, y carpetas y archivos propios. Los papeles son cuatro:
--
--   lector   Solo ver      abrir, descargar, comentar
--   editor   Editar        lo anterior y cambiar archivos que ya existen
--   creador  Crear         lo anterior y subir archivos o crear carpetas
--   admin    Administra    lo anterior y gestionar personas, borrar y archivar
--
-- Dentro del árbol de una unidad el rango sale solo del papel en la unidad: la
-- autoría de una subcarpeta NO da propiedad (0187 sí la da fuera de unidades,
-- y eso no cambia). Ve y edita todas las unidades solo el administrador general
-- (app_role 'admin'); su ingreso a una unidad ajena queda en un registro que
-- solo se agrega.
--
--   · drive_rango pasa a cuatro niveles (propietario 4, creador 3, editor 2,
--     lector 1). Las comprobaciones de «propietario» de 0187 pasan de >= 3 a >= 4.
--   · Personas externas al dominio institucional: vencimiento obligatorio, máximo
--     730 días; pasada la fecha, el papel deja de valer en la base.
--   · Cuota por unidad (5 GB por defecto, editable) comprobada al subir, y un
--     tope global (512 GB) del que el administrador general ve lo comprometido.
--   · Bucket privado «udrive-unidades» para las imágenes de cabecera.
--
-- No rompe 0187, 0188 ni 0190: fuera de unidades todo funciona como antes.
-- Requiere 0057 (units, unit_members), 0187 y 0188. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Parámetros
-- -----------------------------------------------------------------------------

create table if not exists public.drive_config (
  clave      text primary key,
  valor      text not null,
  updated_at timestamptz not null default now()
);
comment on table public.drive_config is
  'UDrive · parámetros: dominio institucional, cuota por unidad, capacidad del servidor, días máximos de un externo. Se cambian con drive_config_fijar (administrador general).';

insert into public.drive_config (clave, valor) values
  ('dominio_institucional', 'udes.edu.co'),
  ('cuota_unidad_bytes', '5368709120'),
  ('capacidad_servidor_bytes', '549755813888'),
  ('externos_dias_max', '730')
on conflict (clave) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.drive_unidades (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  descripcion     text not null default '',
  monograma       text not null,
  acento          text not null default '#0b3a78',
  icono           text not null default 'chart',
  composicion     text not null default 'A',
  portada         text not null default 'curvas',
  imagen          jsonb,
  orden_secciones text[] not null default array['carpetas', 'recientes', 'informes', 'miembros', 'actividad'],
  ancladas        uuid[] not null default '{}',
  plantilla       text not null default 'informes',
  unit_id         uuid references public.units (id) on delete set null,
  carpeta_raiz    uuid,
  cuota_bytes     bigint not null default 5368709120 check (cuota_bytes >= 0),
  archivada_en    timestamptz,
  creada_por      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint drive_unidades_nombre_ok check (char_length(btrim(nombre)) between 3 and 60 and nombre !~ '[/\\]' and nombre !~ '[[:cntrl:]]'),
  constraint drive_unidades_desc_ok check (char_length(descripcion) <= 140),
  constraint drive_unidades_mono_ok check (monograma ~ '^[A-Z0-9]{2,4}$'),
  constraint drive_unidades_acento_ok check (acento ~ '^#[0-9a-f]{6}$'),
  constraint drive_unidades_icono_ok check (icono in ('chart', 'book', 'flask', 'heart', 'building', 'globe', 'people', 'compass', 'leaf', 'scale', 'cap', 'gear')),
  constraint drive_unidades_comp_ok check (composicion in ('A', 'B', 'C', 'D')),
  constraint drive_unidades_portada_ok check (portada in ('ninguna', 'lineas', 'curvas', 'puntos', 'bloques', 'trama')),
  constraint drive_unidades_plantilla_ok check (plantilla in ('informes', 'seguimiento', 'blanco')),
  constraint drive_unidades_orden_ok check (cardinality(orden_secciones) = 5 and orden_secciones <@ array['carpetas', 'recientes', 'informes', 'miembros', 'actividad']),
  constraint drive_unidades_ancladas_ok check (cardinality(ancladas) <= 4)
);
comment on table public.drive_unidades is
  'UDrive · unidades de trabajo. Se crean con drive_unidad_crear (unidad, carpeta raíz, personas y carpetas iniciales en una sola operación).';

create unique index if not exists drive_unidades_nombre_uq on public.drive_unidades (lower(btrim(nombre)));
create index if not exists drive_unidades_unit_idx on public.drive_unidades (unit_id) where unit_id is not null;

-- El contraste del acento contra blanco se comprueba en la base: la pantalla avisa, la base hace cumplir.
create or replace function public.drive_contraste_blanco(p_hex text)
returns numeric
language sql
immutable
set search_path = public
as $$
  with c as (
    select (('x' || substr(p_hex, 2, 2))::bit(8)::int / 255.0) as r,
           (('x' || substr(p_hex, 4, 2))::bit(8)::int / 255.0) as g,
           (('x' || substr(p_hex, 6, 2))::bit(8)::int / 255.0) as b
  ), l as (
    select 0.2126 * case when r <= 0.03928 then r / 12.92 else power((r + 0.055) / 1.055, 2.4) end
         + 0.7152 * case when g <= 0.03928 then g / 12.92 else power((g + 0.055) / 1.055, 2.4) end
         + 0.0722 * case when b <= 0.03928 then b / 12.92 else power((b + 0.055) / 1.055, 2.4) end as lum
      from c
  )
  select 1.05 / (lum + 0.05) from l;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drive_unidades_contraste_ok') then
    alter table public.drive_unidades
      add constraint drive_unidades_contraste_ok check (public.drive_contraste_blanco(acento) >= 4.5);
  end if;
end $$;

drop trigger if exists drive_unidades_set_updated_at on public.drive_unidades;
create trigger drive_unidades_set_updated_at
  before update on public.drive_unidades
  for each row execute function public.set_updated_at();

create table if not exists public.drive_unidad_miembros (
  unidad_id    uuid not null references public.drive_unidades (id) on delete cascade,
  usuario_id   uuid not null references auth.users (id) on delete cascade,
  rol          text not null check (rol in ('lector', 'editor', 'creador', 'admin')),
  vence_en     timestamptz,
  otorgado_por uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (unidad_id, usuario_id)
);
comment on table public.drive_unidad_miembros is
  'UDrive · personas de una unidad y su papel. Una fila vencida (vence_en pasado) ya no da acceso.';
create index if not exists drive_unidad_miembros_usuario_idx on public.drive_unidad_miembros (usuario_id);

create table if not exists public.drive_unidad_eventos (
  id         bigint generated always as identity primary key,
  unidad_id  uuid not null references public.drive_unidades (id) on delete cascade,
  actor_id   uuid,
  como       text not null default 'miembro' check (como in ('miembro', 'admin_general', 'sistema')),
  accion     text not null,
  detalle    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.drive_unidad_eventos is
  'UDrive · registro de la unidad: solo se agrega. Cada cambio de personas, papeles, identidad, cuota y archivo, y el ingreso del administrador general a una unidad ajena.';
create index if not exists drive_unidad_eventos_unidad_idx on public.drive_unidad_eventos (unidad_id, created_at desc);
create index if not exists drive_unidad_eventos_fecha_idx on public.drive_unidad_eventos (created_at desc);

create table if not exists public.drive_unidad_peticiones (
  id               uuid primary key default gen_random_uuid(),
  unidad_id        uuid not null references public.drive_unidades (id) on delete cascade,
  pedida_por       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bytes_pedidos    bigint not null check (bytes_pedidos > 0),
  motivo           text not null check (char_length(btrim(motivo)) between 10 and 500),
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  respondida_por   uuid,
  respuesta        text,
  bytes_otorgados  bigint,
  created_at       timestamptz not null default now(),
  resuelta_en      timestamptz
);
comment on table public.drive_unidad_peticiones is
  'UDrive · peticiones de ampliación de cuota que hace quien administra una unidad y resuelve el administrador general.';
create unique index if not exists drive_unidad_peticion_abierta_uq on public.drive_unidad_peticiones (unidad_id) where estado = 'pendiente';

-- La unidad de cada carpeta y archivo la pone la base (disparador); el cliente no la manda.
alter table public.drive_carpetas add column if not exists unidad_id uuid references public.drive_unidades (id) on delete restrict;
alter table public.drive_archivos add column if not exists unidad_id uuid references public.drive_unidades (id) on delete restrict;
create index if not exists drive_carpetas_unidad_idx on public.drive_carpetas (unidad_id) where unidad_id is not null;
create index if not exists drive_archivos_unidad_idx on public.drive_archivos (unidad_id) where unidad_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drive_unidades_raiz_fk') then
    alter table public.drive_unidades
      add constraint drive_unidades_raiz_fk foreign key (carpeta_raiz) references public.drive_carpetas (id) on delete restrict deferrable initially deferred;
  end if;
end $$;

-- El nombre único por carpeta se parte en dos: lo personal como hasta ahora, y dentro de una unidad por su carpeta padre.
drop index if exists public.drive_carpetas_nombre_uq;
create unique index if not exists drive_carpetas_nombre_uq
  on public.drive_carpetas (coalesce(padre_id, creada_por), lower(nombre)) where borrado_en is null and unidad_id is null;
create unique index if not exists drive_carpetas_nombre_uq_unidad
  on public.drive_carpetas (padre_id, lower(nombre)) where borrado_en is null and unidad_id is not null and padre_id is not null;

-- -----------------------------------------------------------------------------
-- 3. Ayudas
-- -----------------------------------------------------------------------------

create or replace function public.drive_es_admin_general()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.has_role_at_least('admin');
$$;

create or replace function public.drive_config_num(p_clave text, p_defecto bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select valor::bigint from public.drive_config where clave = p_clave and valor ~ '^[0-9]+$'), p_defecto);
$$;

create or replace function public.drive_dominio()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce((select valor from public.drive_config where clave = 'dominio_institucional'), 'udes.edu.co'));
$$;

create or replace function public.drive_es_externo(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles p
     where p.id = p_usuario and lower(p.email) like '%@' || public.drive_dominio()
  );
$$;

create or replace function public.drive_sin_tildes(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(translate(coalesce(p_texto, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'));
$$;

create or replace function public.drive_rol_de_rango(p_rango int)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_rango when 4 then 'propietario' when 3 then 'creador' when 2 then 'editor' when 1 then 'lector' else null end;
$$;

-- Los cuatro niveles. Antes: propietario 3, editor 2, lector 1.
create or replace function public.drive_rango(p_rol text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_rol when 'propietario' then 4 when 'creador' then 3 when 'editor' then 2 when 'lector' then 1 else 0 end;
$$;

-- Mi papel en una unidad: el del administrador general, o el de mi fila vigente (sin vencer).
create or replace function public.drive_unidad_rol(p_unidad uuid, p_usuario uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_usuario is not distinct from auth.uid() and auth.uid() is not null and public.has_role_at_least('admin') then 'admin'
    else (select m.rol from public.drive_unidad_miembros m
           where m.unidad_id = p_unidad and m.usuario_id = p_usuario and (m.vence_en is null or m.vence_en > now()))
  end;
$$;

create or replace function public.drive_unidad_es_miembro(p_unidad uuid, p_usuario uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.drive_unidad_miembros m
     where m.unidad_id = p_unidad and m.usuario_id = p_usuario and (m.vence_en is null or m.vence_en > now())
  );
$$;

-- Rango en la unidad (1 a 4). Una unidad archivada queda de solo lectura para todos.
create or replace function public.drive_unidad_rango(p_unidad uuid, p_usuario uuid default auth.uid())
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when r.rango = 0 then 0
    when exists (select 1 from public.drive_unidades u where u.id = p_unidad and u.archivada_en is not null) then 1
    else r.rango
  end
  from (select case public.drive_unidad_rol(p_unidad, p_usuario) when 'admin' then 4 when 'creador' then 3 when 'editor' then 2 when 'lector' then 1 else 0 end as rango) r;
$$;

create or replace function public.drive_unidad_registrar(p_unidad uuid, p_accion text, p_detalle jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.drive_unidad_eventos (unidad_id, actor_id, como, accion, detalle)
  values (
    p_unidad, auth.uid(),
    case when public.drive_es_admin_general() and not public.drive_unidad_es_miembro(p_unidad) then 'admin_general' else 'miembro' end,
    p_accion, coalesce(p_detalle, '{}'::jsonb)
  );
end;
$$;

create or replace function public.drive_unidad_eventos_solo_agregar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'El registro de la unidad solo admite entradas nuevas.' using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists drive_unidad_eventos_inmutable on public.drive_unidad_eventos;
create trigger drive_unidad_eventos_inmutable
  before update or delete on public.drive_unidad_eventos
  for each row execute function public.drive_unidad_eventos_solo_agregar();

-- Personas de una unidad: el externo necesita vencimiento (máx. 730 días) y no puede administrar; no se degrada a la última persona que administra.
create or replace function public.drive_unidad_miembros_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias int;
begin
  if public.drive_es_externo(new.usuario_id) then
    if new.rol = 'admin' then
      raise exception 'Una persona externa no puede administrar la unidad.' using errcode = 'check_violation';
    end if;
    v_dias := public.drive_config_num('externos_dias_max', 730);
    if new.vence_en is null then
      raise exception 'Las personas externas al dominio institucional necesitan fecha de vencimiento.' using errcode = 'check_violation';
    end if;
    if new.vence_en > now() + make_interval(days => v_dias) then
      raise exception 'El vencimiento de una persona externa no puede pasar de % días.', v_dias using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.rol = 'admin' and new.rol <> 'admin' then
    if not exists (
      select 1 from public.drive_unidad_miembros m
       where m.unidad_id = old.unidad_id and m.usuario_id <> old.usuario_id and m.rol = 'admin' and (m.vence_en is null or m.vence_en > now())
    ) then
      raise exception 'La unidad necesita al menos una persona que la administre.' using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists drive_unidad_miembros_guardia_tg on public.drive_unidad_miembros;
create trigger drive_unidad_miembros_guardia_tg
  before insert or update on public.drive_unidad_miembros
  for each row execute function public.drive_unidad_miembros_guardia();

-- -----------------------------------------------------------------------------
-- 4. Permisos por árbol con unidades
-- -----------------------------------------------------------------------------

create or replace function public.drive_rol_carpeta(p_carpeta uuid, p_usuario uuid default auth.uid())
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_u uuid;
  v_r int;
begin
  select c.unidad_id into v_u from public.drive_carpetas c where c.id = p_carpeta;
  if v_u is not null then
    return public.drive_rol_de_rango(public.drive_unidad_rango(v_u, p_usuario));
  end if;
  with recursive arriba as (
    select c.id, c.padre_id, c.creada_por from public.drive_carpetas c where c.id = p_carpeta
    union
    select c.id, c.padre_id, c.creada_por from public.drive_carpetas c join arriba a on c.id = a.padre_id
  ),
  rangos as (
    select case when a.creada_por = p_usuario then 4 else 0 end as r from arriba a
    union all
    select public.drive_rango(p.rol) from public.drive_permisos p join arriba a on p.carpeta_id = a.id where p.usuario_id = p_usuario
  )
  select max(r) into v_r from rangos;
  return public.drive_rol_de_rango(coalesce(v_r, 0));
end;
$$;

create or replace function public.drive_rol_archivo(p_archivo uuid, p_usuario uuid default auth.uid())
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_u uuid;
  v_r int;
begin
  select a.unidad_id into v_u from public.drive_archivos a where a.id = p_archivo;
  if v_u is not null then
    return public.drive_rol_de_rango(public.drive_unidad_rango(v_u, p_usuario));
  end if;
  with a as (select id, carpeta_id, creada_por from public.drive_archivos where id = p_archivo),
  rangos as (
    select case when a.creada_por = p_usuario then 4 else 0 end as r from a
    union all
    select public.drive_rango(p.rol) from public.drive_permisos p where p.archivo_id = p_archivo and p.usuario_id = p_usuario
    union all
    select public.drive_rango(public.drive_rol_carpeta(a.carpeta_id, p_usuario)) from a where a.carpeta_id is not null
  )
  select max(r) into v_r from rangos;
  return public.drive_rol_de_rango(coalesce(v_r, 0));
end;
$$;

-- Crear dentro de una carpeta: en una unidad hace falta el papel Crear; fuera, como siempre, poder editar.
create or replace function public.drive_puede_crear_en_carpeta(p_carpeta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.drive_entra() and public.drive_rango(public.drive_rol_carpeta(p_carpeta)) >=
    case when exists (select 1 from public.drive_carpetas c where c.id = p_carpeta and c.unidad_id is not null) then 3 else 2 end;
$$;

-- ¿Se puede mandar a la papelera (o restaurar)? Fuera de unidades, quien edita. En una unidad: quien administra, o quien crea
-- si es suyo (y, en una carpeta, si todo lo de dentro es suyo). La carpeta raíz de la unidad no se toca.
create or replace function public.drive_puede_papelera(p_tipo text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_u uuid;
  v_por uuid;
  v_raiz boolean := false;
  v_rango int;
begin
  if p_tipo = 'carpeta' then
    select unidad_id, creada_por, padre_id is null into v_u, v_por, v_raiz from public.drive_carpetas where id = p_id;
  else
    select unidad_id, creada_por into v_u, v_por from public.drive_archivos where id = p_id;
  end if;
  if not found then
    return false;
  end if;
  if v_u is null then
    return public.drive_puede_editar(p_tipo, p_id);
  end if;
  if not public.drive_entra() or v_raiz then
    return false;
  end if;
  v_rango := public.drive_unidad_rango(v_u);
  if v_rango >= 4 then
    return true;
  end if;
  if v_rango = 3 and v_por = auth.uid() then
    if p_tipo = 'carpeta' then
      return not exists (select 1 from public.drive_carpetas c where c.id in (select public.drive_subarbol(p_id)) and c.creada_por <> auth.uid())
         and not exists (select 1 from public.drive_archivos a where a.carpeta_id in (select public.drive_subarbol(p_id)) and a.creada_por <> auth.uid());
    end if;
    return true;
  end if;
  return false;
end;
$$;

-- Fija la unidad de cada carpeta y vigila las mudanzas: no se pasa nada entre una unidad y otro espacio, y moverse dentro pide el papel Crear.
create or replace function public.drive_carpetas_unidad_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino uuid;
begin
  if tg_op = 'INSERT' then
    if new.padre_id is not null then
      select c.unidad_id into new.unidad_id from public.drive_carpetas c where c.id = new.padre_id;
    end if;
    return new;
  end if;
  new.unidad_id := old.unidad_id;
  if new.padre_id is distinct from old.padre_id then
    select c.unidad_id into v_destino from public.drive_carpetas c where c.id = new.padre_id;
    if v_destino is distinct from old.unidad_id then
      raise exception 'No se puede mover algo entre una unidad de trabajo y otro espacio. Descárguelo y súbalo allí.' using errcode = 'check_violation';
    end if;
    if old.unidad_id is not null and old.padre_id is null then
      raise exception 'La carpeta raíz de la unidad no se mueve.' using errcode = 'check_violation';
    end if;
    if old.unidad_id is not null and public.drive_unidad_rango(old.unidad_id) < 3 then
      raise exception 'Mover carpetas en una unidad pide el papel Crear.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.nombre is distinct from old.nombre and old.unidad_id is not null and old.padre_id is null
     and coalesce(current_setting('udrive.interno', true), '') <> '1' then
    raise exception 'La carpeta raíz toma el nombre de la unidad. Cambie el nombre desde Personalizar.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists drive_carpetas_unidad_tg on public.drive_carpetas;
create trigger drive_carpetas_unidad_tg
  before insert or update of padre_id, nombre on public.drive_carpetas
  for each row execute function public.drive_carpetas_unidad_guardia();

create or replace function public.drive_archivos_unidad_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino uuid;
  v_cuota bigint;
  v_uso bigint;
begin
  if tg_op = 'INSERT' then
    if new.carpeta_id is not null then
      select c.unidad_id into new.unidad_id from public.drive_carpetas c where c.id = new.carpeta_id;
    else
      new.unidad_id := null;
    end if;
  else
    new.unidad_id := old.unidad_id;
    if new.carpeta_id is distinct from old.carpeta_id then
      select c.unidad_id into v_destino from public.drive_carpetas c where c.id = new.carpeta_id;
      if v_destino is distinct from old.unidad_id then
        raise exception 'No se puede mover algo entre una unidad de trabajo y otro espacio. Descárguelo y súbalo allí.' using errcode = 'check_violation';
      end if;
      if old.unidad_id is not null and public.drive_unidad_rango(old.unidad_id) < 3 then
        raise exception 'Mover archivos en una unidad pide el papel Crear.' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  -- Cuota: lo que ocupa la unidad (también lo que está en la papelera) más lo nuevo no pasa del tope.
  if new.unidad_id is not null and coalesce(new.tamano, 0) > 0 and (tg_op = 'INSERT' or coalesce(old.tamano, 0) < new.tamano) then
    select u.cuota_bytes into v_cuota from public.drive_unidades u where u.id = new.unidad_id;
    select coalesce(sum(a.tamano), 0) into v_uso from public.drive_archivos a where a.unidad_id = new.unidad_id and a.id <> new.id;
    if v_uso + new.tamano > coalesce(v_cuota, 0) then
      raise exception 'drive_unidad_cuota: la unidad llegó a su cuota de almacenamiento. Quien la administra puede pedir una ampliación.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists drive_archivos_unidad_tg on public.drive_archivos;
create trigger drive_archivos_unidad_tg
  before insert or update of carpeta_id, tamano on public.drive_archivos
  for each row execute function public.drive_archivos_unidad_guardia();

-- Políticas: en una unidad, la autoría no abre la puerta; solo el papel vigente.
drop policy if exists drive_carpetas_ver on public.drive_carpetas;
create policy drive_carpetas_ver on public.drive_carpetas for select to authenticated
  using (public.drive_entra() and (
    (creada_por = auth.uid() and (unidad_id is null or public.drive_unidad_rango(unidad_id) >= 1))
    or public.drive_puede_ver_carpeta(id)
  ));

drop policy if exists drive_carpetas_crear on public.drive_carpetas;
create policy drive_carpetas_crear on public.drive_carpetas for insert to authenticated
  with check (public.drive_entra() and creada_por = auth.uid() and (padre_id is null or public.drive_puede_crear_en_carpeta(padre_id)));

drop policy if exists drive_carpetas_cambiar on public.drive_carpetas;
create policy drive_carpetas_cambiar on public.drive_carpetas for update to authenticated
  using (public.drive_puede_editar_carpeta(id))
  with check (
    (padre_id is null and (creada_por = auth.uid() or public.drive_puede_editar_carpeta(id)))
    or (padre_id is not null and public.drive_puede_editar_carpeta(padre_id))
  );

drop policy if exists drive_archivos_ver on public.drive_archivos;
create policy drive_archivos_ver on public.drive_archivos for select to authenticated
  using (public.drive_entra() and (
    (creada_por = auth.uid() and (unidad_id is null or public.drive_unidad_rango(unidad_id) >= 1))
    or public.drive_puede_ver_archivo(id)
  ));

drop policy if exists drive_archivos_crear on public.drive_archivos;
create policy drive_archivos_crear on public.drive_archivos for insert to authenticated
  with check (public.drive_entra() and creada_por = auth.uid() and (carpeta_id is null or public.drive_puede_crear_en_carpeta(carpeta_id)));

drop policy if exists drive_archivos_cambiar on public.drive_archivos;
create policy drive_archivos_cambiar on public.drive_archivos for update to authenticated
  using (public.drive_puede_editar_archivo(id))
  with check (
    (carpeta_id is null and (creada_por = auth.uid() or public.drive_puede_editar_archivo(id)))
    or (carpeta_id is not null and public.drive_puede_editar_carpeta(carpeta_id))
  );

-- Papelera, restauración, borrado y compartir con las reglas nuevas.
create or replace function public.drive_a_papelera(p_tipo text, p_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamptz := now();
begin
  if not public.drive_puede_papelera(p_tipo, p_id) then
    raise exception 'No tiene permiso para mover esto a la papelera.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo = 'carpeta' then
    update public.drive_carpetas set borrado_en = v_ahora
     where id in (select public.drive_subarbol(p_id)) and borrado_en is null;
    update public.drive_archivos set borrado_en = v_ahora
     where carpeta_id in (select public.drive_subarbol(p_id)) and borrado_en is null;
  else
    update public.drive_archivos set borrado_en = v_ahora where id = p_id and borrado_en is null;
  end if;
  return v_ahora;
end;
$$;

create or replace function public.drive_restaurar(p_tipo text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marca timestamptz;
begin
  if not public.drive_puede_papelera(p_tipo, p_id) then
    raise exception 'No tiene permiso para restaurar esto.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo = 'carpeta' then
    select borrado_en into v_marca from public.drive_carpetas where id = p_id;
    if v_marca is null then return; end if;
    update public.drive_carpetas set borrado_en = null where id in (select public.drive_subarbol(p_id)) and borrado_en = v_marca;
    update public.drive_archivos set borrado_en = null where carpeta_id in (select public.drive_subarbol(p_id)) and borrado_en = v_marca;
  else
    update public.drive_archivos a
       set borrado_en = null,
           carpeta_id = case when a.carpeta_id is not null and exists (
             select 1 from public.drive_carpetas c where c.id = a.carpeta_id and c.borrado_en is not null
           ) then null else a.carpeta_id end
     where a.id = p_id;
  end if;
end;
$$;

create or replace function public.drive_eliminar_definitivo(p_tipo text, p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rutas text[];
begin
  if not public.drive_entra() or public.drive_rango(
       case p_tipo when 'carpeta' then public.drive_rol_carpeta(p_id) else public.drive_rol_archivo(p_id) end
     ) < 4 then
    raise exception 'Solo quien es propietario puede borrar para siempre.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo = 'carpeta' and exists (select 1 from public.drive_carpetas where id = p_id and unidad_id is not null and padre_id is null) then
    raise exception 'La carpeta raíz de una unidad no se borra.' using errcode = 'check_violation';
  end if;
  if p_tipo = 'carpeta' then
    select coalesce(array_agg(ruta_storage), '{}') into v_rutas
      from public.drive_archivos where carpeta_id in (select public.drive_subarbol(p_id)) and ruta_storage is not null;
    delete from public.drive_carpetas where id = p_id;
  else
    select coalesce(array_agg(ruta_storage), '{}') into v_rutas
      from public.drive_archivos where id = p_id and ruta_storage is not null;
    delete from public.drive_archivos where id = p_id;
  end if;
  return v_rutas;
end;
$$;

-- Lo mío de más de 30 días en la papelera, fuera de unidades (en una unidad lo vacía quien administra).
create or replace function public.drive_vaciar_vencidos()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rutas text[];
begin
  if not public.drive_entra() then
    return '{}';
  end if;
  select coalesce(array_agg(ruta_storage), '{}') into v_rutas
    from public.drive_archivos
   where creada_por = auth.uid() and unidad_id is null and ruta_storage is not null and borrado_en < now() - interval '30 days';
  delete from public.drive_archivos where creada_por = auth.uid() and unidad_id is null and borrado_en < now() - interval '30 days';
  select v_rutas || coalesce(array_agg(a.ruta_storage), '{}') into v_rutas
    from public.drive_archivos a
   where a.ruta_storage is not null
     and a.carpeta_id in (select id from public.drive_carpetas where creada_por = auth.uid() and unidad_id is null and borrado_en < now() - interval '30 days');
  delete from public.drive_carpetas where creada_por = auth.uid() and unidad_id is null and borrado_en < now() - interval '30 days';
  return v_rutas;
end;
$$;

create or replace function public.drive_compartir(p_tipo text, p_id uuid, p_correo text, p_rol text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona uuid;
  v_id uuid;
begin
  if p_tipo not in ('carpeta', 'archivo') then
    raise exception 'Tipo no válido.' using errcode = 'invalid_parameter_value';
  end if;
  if p_rol not in ('editor', 'lector') then
    raise exception 'El rol debe ser editor o lector.' using errcode = 'invalid_parameter_value';
  end if;
  if (p_tipo = 'carpeta' and exists (select 1 from public.drive_carpetas where id = p_id and unidad_id is not null))
     or (p_tipo = 'archivo' and exists (select 1 from public.drive_archivos where id = p_id and unidad_id is not null)) then
    raise exception 'Dentro de una unidad de trabajo el acceso se da con sus personas y papeles.' using errcode = 'check_violation';
  end if;
  if not public.drive_entra() or public.drive_rango(
       case p_tipo when 'carpeta' then public.drive_rol_carpeta(p_id) else public.drive_rol_archivo(p_id) end
     ) < 4 then
    raise exception 'Solo quien es propietario puede compartir.' using errcode = 'insufficient_privilege';
  end if;
  select id into v_persona from public.profiles where lower(email) = lower(btrim(p_correo)) and is_active;
  if v_persona is null then
    raise exception 'No hay una persona activa con ese correo en la intranet.' using errcode = 'no_data_found';
  end if;
  if v_persona = auth.uid() then
    raise exception 'Ya es suyo.' using errcode = 'check_violation';
  end if;
  if p_tipo = 'carpeta' then
    insert into public.drive_permisos (carpeta_id, usuario_id, rol) values (p_id, v_persona, p_rol)
    on conflict (carpeta_id, usuario_id) where carpeta_id is not null do update set rol = excluded.rol, otorgado_por = auth.uid()
    returning id into v_id;
  else
    insert into public.drive_permisos (archivo_id, usuario_id, rol) values (p_id, v_persona, p_rol)
    on conflict (archivo_id, usuario_id) where archivo_id is not null do update set rol = excluded.rol, otorgado_por = auth.uid()
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.drive_quitar_permiso(p_tipo text, p_id uuid, p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.drive_entra() or public.drive_rango(
       case p_tipo when 'carpeta' then public.drive_rol_carpeta(p_id) else public.drive_rol_archivo(p_id) end
     ) < 4 then
    raise exception 'Solo quien es propietario puede dejar de compartir.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo = 'carpeta' then
    delete from public.drive_permisos where carpeta_id = p_id and usuario_id = p_usuario;
  else
    delete from public.drive_permisos where archivo_id = p_id and usuario_id = p_usuario;
  end if;
end;
$$;

create or replace function public.drive_permisos_de(p_tipo text, p_id uuid)
returns table (usuario_id uuid, correo text, nombre text, rol text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.drive_entra() or public.drive_rango(
       case p_tipo when 'carpeta' then public.drive_rol_carpeta(p_id) else public.drive_rol_archivo(p_id) end
     ) < 4 then
    raise exception 'Solo quien es propietario ve con quién se comparte.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select p.usuario_id, pr.email, pr.full_name, p.rol
      from public.drive_permisos p
      join public.profiles pr on pr.id = p.usuario_id
     where (p_tipo = 'carpeta' and p.carpeta_id = p_id) or (p_tipo = 'archivo' and p.archivo_id = p_id)
     order by pr.full_name, pr.email;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Lecturas de la pantalla de unidades
-- -----------------------------------------------------------------------------

-- Las unidades que veo: las mías (papel vigente) y, si soy administrador general, todas.
create or replace function public.drive_unidades_listar()
returns table (
  id uuid, nombre text, descripcion text, monograma text, acento text, icono text, composicion text, portada text,
  imagen jsonb, orden_secciones text[], ancladas uuid[], plantilla text, unit_id uuid, carpeta_raiz uuid,
  cuota_bytes bigint, archivada_en timestamptz, created_at timestamptz, updated_at timestamptz,
  mi_rol text, es_miembro boolean, n_miembros int, n_externos int, uso_bytes bigint, sin_admin boolean, vencen_pronto int
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.nombre, u.descripcion, u.monograma, u.acento, u.icono, u.composicion, u.portada,
         u.imagen, u.orden_secciones, u.ancladas, u.plantilla, u.unit_id, u.carpeta_raiz,
         u.cuota_bytes, u.archivada_en, u.created_at, u.updated_at,
         public.drive_unidad_rol(u.id) as mi_rol,
         public.drive_unidad_es_miembro(u.id) as es_miembro,
         (select count(*)::int from public.drive_unidad_miembros m where m.unidad_id = u.id and (m.vence_en is null or m.vence_en > now())),
         (select count(*)::int from public.drive_unidad_miembros m where m.unidad_id = u.id and (m.vence_en is null or m.vence_en > now()) and public.drive_es_externo(m.usuario_id)),
         (select coalesce(sum(a.tamano), 0)::bigint from public.drive_archivos a where a.unidad_id = u.id),
         not exists (select 1 from public.drive_unidad_miembros m where m.unidad_id = u.id and m.rol = 'admin' and (m.vence_en is null or m.vence_en > now())),
         (select count(*)::int from public.drive_unidad_miembros m where m.unidad_id = u.id and m.vence_en is not null and m.vence_en > now() and m.vence_en <= now() + interval '14 days')
    from public.drive_unidades u
   where public.drive_entra() and public.drive_unidad_rol(u.id) is not null
   order by u.archivada_en is not null, u.updated_at desc;
$$;

create or replace function public.drive_unidad_miembros_de(p_unidad uuid)
returns table (usuario_id uuid, correo text, nombre text, rol text, vence_en timestamptz, externo boolean, vigente boolean, otorgado_por uuid, es_yo boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.usuario_id, pr.email, pr.full_name, m.rol, m.vence_en, public.drive_es_externo(m.usuario_id),
         (m.vence_en is null or m.vence_en > now()), m.otorgado_por, m.usuario_id = auth.uid()
    from public.drive_unidad_miembros m
    join public.profiles pr on pr.id = m.usuario_id
   where m.unidad_id = p_unidad and public.drive_entra() and public.drive_unidad_rol(p_unidad) is not null
   order by public.drive_rango(case m.rol when 'admin' then 'propietario' else m.rol end) desc, pr.full_name, pr.email;
$$;

create or replace function public.drive_unidad_eventos_de(p_unidad uuid, p_limite int default 30)
returns table (id bigint, cuando timestamptz, actor_nombre text, como text, accion text, detalle jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.created_at, coalesce(nullif(btrim(pr.full_name), ''), pr.email), e.como, e.accion, e.detalle
    from public.drive_unidad_eventos e
    left join public.profiles pr on pr.id = e.actor_id
   where e.unidad_id = p_unidad and public.drive_entra() and public.drive_unidad_rol(p_unidad) is not null
   order by e.created_at desc, e.id desc
   limit greatest(1, least(coalesce(p_limite, 30), 200));
$$;

-- Registro de todas las unidades (solo el administrador general).
create or replace function public.drive_registro_global(p_limite int default 60)
returns table (id bigint, cuando timestamptz, unidad_id uuid, unidad text, actor_nombre text, como text, accion text, detalle jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.drive_entra() and public.drive_es_admin_general()) then
    raise exception 'Solo el administrador general ve el registro de todas las unidades.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select e.id, e.created_at, e.unidad_id, u.nombre, coalesce(nullif(btrim(pr.full_name), ''), pr.email), e.como, e.accion, e.detalle
      from public.drive_unidad_eventos e
      join public.drive_unidades u on u.id = e.unidad_id
      left join public.profiles pr on pr.id = e.actor_id
     order by e.created_at desc, e.id desc
     limit greatest(1, least(coalesce(p_limite, 60), 300));
end;
$$;

-- Búsqueda de personas para añadir (por nombre o correo; sin tildes). Solo cuentas activas.
create or replace function public.drive_personas_buscar(p_texto text)
returns table (id uuid, correo text, nombre text, externo boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.full_name, public.drive_es_externo(p.id)
    from public.profiles p
   where public.drive_entra() and p.is_active and char_length(btrim(coalesce(p_texto, ''))) >= 2
     and (public.drive_sin_tildes(p.full_name) like '%' || replace(replace(public.drive_sin_tildes(btrim(p_texto)), '%', ''), '_', '') || '%'
          or lower(p.email) like '%' || replace(replace(lower(btrim(p_texto)), '%', ''), '_', '') || '%')
   order by p.full_name, p.email
   limit 8;
$$;

create or replace function public.drive_personas_por_correo(p_correos text[])
returns table (id uuid, correo text, nombre text, externo boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.full_name, public.drive_es_externo(p.id)
    from public.profiles p
   where public.drive_entra() and p.is_active and lower(p.email) = any (select lower(btrim(x)) from unnest(p_correos) x)
   order by p.full_name, p.email;
$$;

create or replace function public.drive_estructura_lista()
returns table (id uuid, nombre text, codigo text, padre_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.name, u.code, u.parent_id from public.units u where public.drive_entra() order by u.name;
$$;

create or replace function public.drive_estructura_personas(p_unit uuid)
returns table (usuario_id uuid, correo text, nombre text, papel text)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.email, pr.full_name, m.role::text
    from public.unit_members m
    join public.profiles pr on pr.id = m.profile_id
   where public.drive_entra() and m.unit_id = p_unit and pr.is_active
   order by case m.role::text when 'jefe' then 0 when 'editor' then 1 else 2 end, pr.full_name;
$$;

-- -----------------------------------------------------------------------------
-- 6. Crear y cambiar unidades
-- -----------------------------------------------------------------------------

-- Crea la unidad completa en una sola operación: unidad, carpeta raíz, carpetas de la plantilla y personas.
create or replace function public.drive_unidad_crear(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_raiz uuid := gen_random_uuid();
  v_nombre text := btrim(coalesce(p ->> 'nombre', ''));
  v_desc text := btrim(coalesce(p ->> 'descripcion', ''));
  v_mono text := upper(btrim(coalesce(p ->> 'monograma', '')));
  v_acento text := lower(btrim(coalesce(p ->> 'acento', '#0b3a78')));
  v_plantilla text := coalesce(p ->> 'plantilla', 'informes');
  v_unit uuid := nullif(p ->> 'unit_id', '')::uuid;
  v_cuota bigint := public.drive_config_num('cuota_unidad_bytes', 5368709120);
  v_carpetas text[];
  v_nombre_c text;
  v_cid uuid;
  v_anclas uuid[] := '{}';
  m jsonb;
  v_usuario uuid;
  v_rol text;
  v_vence timestamptz;
  v_n int := 0;
begin
  if not public.drive_entra() then
    raise exception 'No tiene acceso a UDrive.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_nombre) < 3 then
    raise exception 'Escriba un nombre de al menos 3 caracteres.' using errcode = 'check_violation';
  end if;
  if v_mono !~ '^[A-Z0-9]{2,4}$' then
    raise exception 'El monograma lleva de 2 a 4 letras o números.' using errcode = 'check_violation';
  end if;
  if v_acento !~ '^#[0-9a-f]{6}$' or public.drive_contraste_blanco(v_acento) < 4.5 then
    raise exception 'El color de acento es muy claro: el texto blanco no se leería sobre él (contraste mínimo 4,5:1).' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.drive_unidades where lower(btrim(nombre)) = lower(v_nombre)) then
    raise exception 'drive_unidades_nombre_uq: ya hay una unidad con ese nombre.' using errcode = 'unique_violation';
  end if;
  v_carpetas := case v_plantilla
    when 'informes' then array['Informes', 'Datos', 'Documentos de apoyo']
    when 'seguimiento' then array['Plan de trabajo', 'Actas', 'Evidencias']
    else '{}'::text[] end;

  insert into public.drive_unidades (id, nombre, descripcion, monograma, acento, icono, composicion, portada, plantilla, unit_id, carpeta_raiz, cuota_bytes)
  values (v_id, v_nombre, v_desc, v_mono, v_acento, coalesce(p ->> 'icono', 'chart'), coalesce(p ->> 'composicion', 'A'), coalesce(p ->> 'portada', 'curvas'), v_plantilla, v_unit, v_raiz, v_cuota);

  insert into public.drive_carpetas (id, padre_id, nombre, creada_por, unidad_id) values (v_raiz, null, v_nombre, auth.uid(), v_id);
  foreach v_nombre_c in array v_carpetas loop
    v_cid := gen_random_uuid();
    insert into public.drive_carpetas (id, padre_id, nombre, creada_por) values (v_cid, v_raiz, v_nombre_c, auth.uid());
    v_anclas := v_anclas || v_cid;
  end loop;
  if cardinality(v_anclas) > 0 then
    update public.drive_unidades set ancladas = v_anclas[1:4] where id = v_id;
  end if;

  -- Quien crea administra, aunque la lista diga otra cosa.
  insert into public.drive_unidad_miembros (unidad_id, usuario_id, rol) values (v_id, auth.uid(), 'admin');
  for m in select * from jsonb_array_elements(coalesce(p -> 'miembros', '[]'::jsonb)) loop
    v_usuario := nullif(m ->> 'usuario', '')::uuid;
    v_rol := coalesce(m ->> 'rol', 'lector');
    v_vence := nullif(m ->> 'vence_en', '')::timestamptz;
    if v_usuario is null or v_usuario = auth.uid() then
      continue;
    end if;
    if v_rol not in ('lector', 'editor', 'creador', 'admin') then
      raise exception 'Papel no válido.' using errcode = 'invalid_parameter_value';
    end if;
    if not exists (select 1 from public.profiles where id = v_usuario and is_active) then
      raise exception 'Una de las personas ya no tiene cuenta activa.' using errcode = 'no_data_found';
    end if;
    insert into public.drive_unidad_miembros (unidad_id, usuario_id, rol, vence_en) values (v_id, v_usuario, v_rol, v_vence)
    on conflict (unidad_id, usuario_id) do nothing;
    v_n := v_n + 1;
  end loop;
  perform public.drive_unidad_registrar(v_id, 'creada', jsonb_build_object('personas', v_n + 1, 'plantilla', v_plantilla));
  return v_id;
end;
$$;

-- Cambios de identidad y de presentación (solo quien administra, o el administrador general).
create or replace function public.drive_unidad_actualizar(p_unidad uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.drive_unidades;
  v_nombre text;
  v_campos text[] := '{}';
  v_orden text[];
  v_anclas uuid[];
  v_acento text;
begin
  if not public.drive_entra() or public.drive_unidad_rol(p_unidad) is distinct from 'admin' then
    raise exception 'Solo quien administra la unidad puede cambiarla.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_u from public.drive_unidades where id = p_unidad for update;
  if not found then
    raise exception 'La unidad no existe.' using errcode = 'no_data_found';
  end if;
  if v_u.archivada_en is not null then
    raise exception 'La unidad está archivada. Restáurela para cambiarla.' using errcode = 'check_violation';
  end if;
  if p ? 'nombre' then
    v_nombre := btrim(p ->> 'nombre');
    if char_length(v_nombre) < 3 then
      raise exception 'Escriba un nombre de al menos 3 caracteres.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.drive_unidades where id <> p_unidad and lower(btrim(nombre)) = lower(v_nombre)) then
      raise exception 'drive_unidades_nombre_uq: ya hay una unidad con ese nombre.' using errcode = 'unique_violation';
    end if;
    update public.drive_unidades set nombre = v_nombre where id = p_unidad;
    perform set_config('udrive.interno', '1', true);
    update public.drive_carpetas set nombre = v_nombre where id = v_u.carpeta_raiz;
    perform set_config('udrive.interno', '', true);
    v_campos := v_campos || 'nombre';
  end if;
  if p ? 'descripcion' then
    update public.drive_unidades set descripcion = btrim(coalesce(p ->> 'descripcion', '')) where id = p_unidad;
    v_campos := v_campos || 'descripcion';
  end if;
  if p ? 'monograma' then
    update public.drive_unidades set monograma = upper(btrim(p ->> 'monograma')) where id = p_unidad;
    v_campos := v_campos || 'monograma';
  end if;
  if p ? 'acento' then
    v_acento := lower(btrim(p ->> 'acento'));
    if v_acento !~ '^#[0-9a-f]{6}$' or public.drive_contraste_blanco(v_acento) < 4.5 then
      raise exception 'El color de acento es muy claro (contraste mínimo 4,5:1 contra blanco).' using errcode = 'check_violation';
    end if;
    update public.drive_unidades set acento = v_acento where id = p_unidad;
    v_campos := v_campos || 'acento';
  end if;
  if p ? 'icono' then
    update public.drive_unidades set icono = p ->> 'icono' where id = p_unidad;
    v_campos := v_campos || 'icono';
  end if;
  if p ? 'composicion' then
    update public.drive_unidades set composicion = p ->> 'composicion' where id = p_unidad;
    v_campos := v_campos || 'composicion';
  end if;
  if p ? 'portada' then
    update public.drive_unidades set portada = p ->> 'portada' where id = p_unidad;
    v_campos := v_campos || 'portada';
  end if;
  if p ? 'imagen' then
    if jsonb_typeof(p -> 'imagen') = 'null' then
      update public.drive_unidades set imagen = null where id = p_unidad;
    else
      if jsonb_typeof(p -> 'imagen') <> 'object' or coalesce(p -> 'imagen' ->> 'ruta', '') not like p_unidad::text || '/%' then
        raise exception 'La imagen de cabecera no es válida.' using errcode = 'check_violation';
      end if;
      update public.drive_unidades set imagen = jsonb_build_object(
        'ruta', p -> 'imagen' ->> 'ruta',
        'x', least(100, greatest(0, coalesce((p -> 'imagen' ->> 'x')::numeric, 50))),
        'y', least(100, greatest(0, coalesce((p -> 'imagen' ->> 'y')::numeric, 50))),
        'zoom', least(3, greatest(1, coalesce((p -> 'imagen' ->> 'zoom')::numeric, 1)))
      ) where id = p_unidad;
    end if;
    v_campos := v_campos || 'imagen';
  end if;
  if p ? 'orden_secciones' then
    select array_agg(x) into v_orden from jsonb_array_elements_text(p -> 'orden_secciones') x;
    update public.drive_unidades set orden_secciones = v_orden where id = p_unidad;
    v_campos := v_campos || 'orden';
  end if;
  if p ? 'ancladas' then
    select coalesce(array_agg(x::uuid), '{}') into v_anclas from jsonb_array_elements_text(p -> 'ancladas') x;
    if exists (
      select 1 from unnest(v_anclas) a
       where not exists (select 1 from public.drive_carpetas c where c.id = a and c.unidad_id = p_unidad)
    ) then
      raise exception 'Solo se pueden anclar carpetas de la unidad.' using errcode = 'check_violation';
    end if;
    update public.drive_unidades set ancladas = v_anclas where id = p_unidad;
    v_campos := v_campos || 'ancladas';
  end if;
  perform public.drive_unidad_registrar(p_unidad, 'personalizada', jsonb_build_object('campos', to_jsonb(v_campos)));
end;
$$;

create or replace function public.drive_unidad_archivar(p_unidad uuid, p_archivar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.drive_entra() or public.drive_unidad_rol(p_unidad) is distinct from 'admin' then
    raise exception 'Solo quien administra la unidad puede archivarla o restaurarla.' using errcode = 'insufficient_privilege';
  end if;
  update public.drive_unidades set archivada_en = case when p_archivar then coalesce(archivada_en, now()) else null end where id = p_unidad;
  perform public.drive_unidad_registrar(p_unidad, case when p_archivar then 'archivada' else 'restaurada' end);
end;
$$;

-- El administrador general entra a una unidad ajena: queda registrado (una vez cada 30 minutos por unidad).
create or replace function public.drive_unidad_entrar(p_unidad uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.drive_entra() and public.drive_es_admin_general()) or public.drive_unidad_es_miembro(p_unidad) then
    return;
  end if;
  if not exists (
    select 1 from public.drive_unidad_eventos e
     where e.unidad_id = p_unidad and e.actor_id = auth.uid() and e.accion = 'ingreso_admin' and e.created_at > now() - interval '30 minutes'
  ) then
    perform public.drive_unidad_registrar(p_unidad, 'ingreso_admin');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Personas de la unidad
-- -----------------------------------------------------------------------------

create or replace function public.drive_unidad_miembro_fijar(p_unidad uuid, p_usuario uuid, p_rol text, p_vence timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes text;
begin
  if not public.drive_entra() or public.drive_unidad_rol(p_unidad) is distinct from 'admin' then
    raise exception 'Solo quien administra la unidad cambia a sus personas.' using errcode = 'insufficient_privilege';
  end if;
  if p_rol not in ('lector', 'editor', 'creador', 'admin') then
    raise exception 'Papel no válido.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.drive_unidades where id = p_unidad and archivada_en is not null) then
    raise exception 'La unidad está archivada. Restáurela para cambiar a sus personas.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.profiles where id = p_usuario and is_active) then
    raise exception 'Esa persona no tiene cuenta activa.' using errcode = 'no_data_found';
  end if;
  select rol into v_antes from public.drive_unidad_miembros where unidad_id = p_unidad and usuario_id = p_usuario;
  insert into public.drive_unidad_miembros (unidad_id, usuario_id, rol, vence_en)
  values (p_unidad, p_usuario, p_rol, p_vence)
  on conflict (unidad_id, usuario_id) do update set rol = excluded.rol, vence_en = excluded.vence_en, otorgado_por = auth.uid();
  perform public.drive_unidad_registrar(p_unidad,
    case when v_antes is null then 'persona_añadida' when v_antes <> p_rol then 'papel_cambiado' else 'vencimiento_cambiado' end,
    jsonb_build_object('usuario', p_usuario, 'rol', p_rol, 'antes', v_antes, 'vence_en', p_vence));
end;
$$;

create or replace function public.drive_unidad_miembro_quitar(p_unidad uuid, p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  if not public.drive_entra() or public.drive_unidad_rol(p_unidad) is distinct from 'admin' then
    raise exception 'Solo quien administra la unidad cambia a sus personas.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.drive_unidades where id = p_unidad and archivada_en is not null) then
    raise exception 'La unidad está archivada. Restáurela para cambiar a sus personas.' using errcode = 'check_violation';
  end if;
  select rol into v_rol from public.drive_unidad_miembros where unidad_id = p_unidad and usuario_id = p_usuario;
  if v_rol is null then
    return;
  end if;
  if v_rol = 'admin' and not exists (
    select 1 from public.drive_unidad_miembros m
     where m.unidad_id = p_unidad and m.usuario_id <> p_usuario and m.rol = 'admin' and (m.vence_en is null or m.vence_en > now())
  ) then
    raise exception 'La unidad necesita al menos una persona que la administre. Pase la administración a otra antes de quitarla.' using errcode = 'check_violation';
  end if;
  delete from public.drive_unidad_miembros where unidad_id = p_unidad and usuario_id = p_usuario;
  perform public.drive_unidad_registrar(p_unidad, 'persona_quitada', jsonb_build_object('usuario', p_usuario, 'rol', v_rol));
end;
$$;

-- Pasa la administración a otra persona de la unidad. Nunca deja la unidad sin quien administre.
create or replace function public.drive_unidad_transferir(p_unidad uuid, p_a uuid, p_dejar boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.drive_entra() or public.drive_unidad_rol(p_unidad) is distinct from 'admin' then
    raise exception 'Solo quien administra la unidad puede pasar la administración.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.drive_unidades where id = p_unidad and archivada_en is not null) then
    raise exception 'La unidad está archivada. Restáurela primero.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.drive_unidad_miembros where unidad_id = p_unidad and usuario_id = p_a and (vence_en is null or vence_en > now())
  ) then
    raise exception 'Esa persona no está en la unidad. Añádala primero.' using errcode = 'no_data_found';
  end if;
  if public.drive_es_externo(p_a) then
    raise exception 'Una persona externa no puede administrar la unidad.' using errcode = 'check_violation';
  end if;
  update public.drive_unidad_miembros set rol = 'admin', vence_en = null, otorgado_por = auth.uid() where unidad_id = p_unidad and usuario_id = p_a;
  if p_dejar and p_a <> auth.uid() and public.drive_unidad_es_miembro(p_unidad) then
    update public.drive_unidad_miembros set rol = 'editor' where unidad_id = p_unidad and usuario_id = auth.uid() and rol = 'admin';
  end if;
  perform public.drive_unidad_registrar(p_unidad, 'administracion_transferida', jsonb_build_object('a', p_a, 'dejo', coalesce(p_dejar, false)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Cuota y capacidad
-- -----------------------------------------------------------------------------

create or replace function public.drive_capacidad_resumen()
returns table (capacidad_bytes bigint, comprometido_bytes bigint, uso_unidades_bytes bigint, uso_personal_bytes bigint, n_unidades int, cuota_defecto_bytes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.drive_entra() and public.drive_es_admin_general()) then
    raise exception 'Solo el administrador general ve la capacidad.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select public.drive_config_num('capacidad_servidor_bytes', 549755813888),
           coalesce((select sum(u.cuota_bytes) from public.drive_unidades u where u.archivada_en is null), 0)::bigint,
           coalesce((select sum(a.tamano) from public.drive_archivos a where a.unidad_id is not null), 0)::bigint,
           coalesce((select sum(a.tamano) from public.drive_archivos a where a.unidad_id is null), 0)::bigint,
           (select count(*)::int from public.drive_unidades),
           public.drive_config_num('cuota_unidad_bytes', 5368709120);
end;
$$;

create or replace function public.drive_capacidad_unidades()
returns table (unidad_id uuid, nombre text, monograma text, acento text, archivada_en timestamptz, uso_bytes bigint, cuota_bytes bigint, peticion_id uuid, peticion_bytes bigint, peticion_motivo text, peticion_por text, peticion_fecha timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.drive_entra() and public.drive_es_admin_general()) then
    raise exception 'Solo el administrador general ve la capacidad.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select u.id, u.nombre, u.monograma, u.acento, u.archivada_en,
           (select coalesce(sum(a.tamano), 0)::bigint from public.drive_archivos a where a.unidad_id = u.id),
           u.cuota_bytes, pe.id, pe.bytes_pedidos, pe.motivo, coalesce(nullif(btrim(pr.full_name), ''), pr.email), pe.created_at
      from public.drive_unidades u
      left join public.drive_unidad_peticiones pe on pe.unidad_id = u.id and pe.estado = 'pendiente'
      left join public.profiles pr on pr.id = pe.pedida_por
     order by (pe.id is not null) desc, u.nombre;
end;
$$;

create or replace function public.drive_unidad_cuota_fijar(p_unidad uuid, p_bytes bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual bigint;
  v_uso bigint;
  v_comprometido bigint;
  v_capacidad bigint := public.drive_config_num('capacidad_servidor_bytes', 549755813888);
begin
  if not (public.drive_entra() and public.drive_es_admin_general()) then
    raise exception 'Solo el administrador general define la cuota de una unidad.' using errcode = 'insufficient_privilege';
  end if;
  select cuota_bytes into v_actual from public.drive_unidades where id = p_unidad;
  if not found then
    raise exception 'La unidad no existe.' using errcode = 'no_data_found';
  end if;
  select coalesce(sum(tamano), 0) into v_uso from public.drive_archivos where unidad_id = p_unidad;
  if p_bytes < v_uso then
    raise exception 'La cuota no puede ser menor que lo que la unidad ya ocupa.' using errcode = 'check_violation';
  end if;
  select coalesce(sum(cuota_bytes), 0) into v_comprometido from public.drive_unidades where archivada_en is null and id <> p_unidad;
  if v_comprometido + p_bytes > v_capacidad then
    raise exception 'Con esa cuota se compromete más de la capacidad del servidor.' using errcode = 'check_violation';
  end if;
  update public.drive_unidades set cuota_bytes = p_bytes where id = p_unidad;
  perform public.drive_unidad_registrar(p_unidad, 'cuota_cambiada', jsonb_build_object('antes', v_actual, 'despues', p_bytes));
end;
$$;

create or replace function public.drive_unidad_pedir_ampliacion(p_unidad uuid, p_bytes bigint, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.drive_entra() or public.drive_unidad_rol(p_unidad) is distinct from 'admin' then
    raise exception 'Solo quien administra la unidad pide una ampliación.' using errcode = 'insufficient_privilege';
  end if;
  if p_bytes <= 0 then
    raise exception 'Indique cuánto espacio más necesita.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.drive_unidad_peticiones where unidad_id = p_unidad and estado = 'pendiente') then
    raise exception 'Ya hay una petición en espera para esta unidad.' using errcode = 'check_violation';
  end if;
  insert into public.drive_unidad_peticiones (unidad_id, bytes_pedidos, motivo) values (p_unidad, p_bytes, btrim(coalesce(p_motivo, ''))) returning id into v_id;
  perform public.drive_unidad_registrar(p_unidad, 'ampliacion_pedida', jsonb_build_object('bytes', p_bytes));
  return v_id;
end;
$$;

create or replace function public.drive_unidad_peticiones_de(p_unidad uuid)
returns table (id uuid, bytes_pedidos bigint, motivo text, estado text, respuesta text, bytes_otorgados bigint, pedida_por text, created_at timestamptz, resuelta_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select pe.id, pe.bytes_pedidos, pe.motivo, pe.estado, pe.respuesta, pe.bytes_otorgados, coalesce(nullif(btrim(pr.full_name), ''), pr.email), pe.created_at, pe.resuelta_en
    from public.drive_unidad_peticiones pe
    left join public.profiles pr on pr.id = pe.pedida_por
   where pe.unidad_id = p_unidad and public.drive_entra() and public.drive_unidad_rol(p_unidad) = 'admin'
   order by pe.created_at desc
   limit 10;
$$;

create or replace function public.drive_unidad_resolver_peticion(p_peticion uuid, p_aprobar boolean, p_bytes_otorgados bigint default null, p_respuesta text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pe public.drive_unidad_peticiones;
  v_cuota bigint;
  v_otorgar bigint;
  v_comprometido bigint;
  v_capacidad bigint := public.drive_config_num('capacidad_servidor_bytes', 549755813888);
begin
  if not (public.drive_entra() and public.drive_es_admin_general()) then
    raise exception 'Solo el administrador general resuelve las peticiones.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pe from public.drive_unidad_peticiones where id = p_peticion for update;
  if not found or v_pe.estado <> 'pendiente' then
    raise exception 'La petición ya no está en espera.' using errcode = 'no_data_found';
  end if;
  if p_aprobar then
    v_otorgar := coalesce(p_bytes_otorgados, v_pe.bytes_pedidos);
    if v_otorgar <= 0 then
      raise exception 'Indique cuánto espacio se concede.' using errcode = 'check_violation';
    end if;
    select cuota_bytes into v_cuota from public.drive_unidades where id = v_pe.unidad_id;
    select coalesce(sum(cuota_bytes), 0) into v_comprometido from public.drive_unidades where archivada_en is null and id <> v_pe.unidad_id;
    if v_comprometido + v_cuota + v_otorgar > v_capacidad then
      raise exception 'Con esa ampliación se compromete más de la capacidad del servidor.' using errcode = 'check_violation';
    end if;
    update public.drive_unidades set cuota_bytes = v_cuota + v_otorgar where id = v_pe.unidad_id;
  end if;
  update public.drive_unidad_peticiones
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         respondida_por = auth.uid(), respuesta = nullif(btrim(coalesce(p_respuesta, '')), ''),
         bytes_otorgados = case when p_aprobar then v_otorgar end, resuelta_en = now()
   where id = p_peticion;
  perform public.drive_unidad_registrar(v_pe.unidad_id, case when p_aprobar then 'ampliacion_aprobada' else 'ampliacion_rechazada' end,
    jsonb_build_object('pedidos', v_pe.bytes_pedidos, 'otorgados', v_otorgar));
end;
$$;

-- Papelera de una unidad: quien la administra borra para siempre lo que lleva más de 30 días. Devuelve las rutas para quitarlas de Storage.
create or replace function public.drive_unidad_vaciar_papelera(p_unidad uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rutas text[];
begin
  if not public.drive_entra() or public.drive_unidad_rango(p_unidad) < 4 then
    raise exception 'Solo quien administra la unidad vacía su papelera.' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(array_agg(ruta_storage), '{}') into v_rutas
    from public.drive_archivos
   where unidad_id = p_unidad and ruta_storage is not null and borrado_en < now() - interval '30 days';
  delete from public.drive_archivos where unidad_id = p_unidad and borrado_en < now() - interval '30 days';
  delete from public.drive_carpetas where unidad_id = p_unidad and padre_id is not null and borrado_en < now() - interval '30 days';
  if cardinality(v_rutas) > 0 then
    perform public.drive_unidad_registrar(p_unidad, 'papelera_vaciada', jsonb_build_object('archivos', cardinality(v_rutas)));
  end if;
  return v_rutas;
end;
$$;

create or replace function public.drive_config_fijar(p_clave text, p_valor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.drive_entra() and public.drive_es_admin_general()) then
    raise exception 'Solo el administrador general cambia estos parámetros.' using errcode = 'insufficient_privilege';
  end if;
  if p_clave not in ('cuota_unidad_bytes', 'capacidad_servidor_bytes', 'externos_dias_max', 'dominio_institucional') then
    raise exception 'Parámetro no válido.' using errcode = 'invalid_parameter_value';
  end if;
  if p_clave = 'dominio_institucional' then
    if p_valor !~* '^[a-z0-9.-]+\.[a-z]{2,}$' then
      raise exception 'Escriba un dominio como udes.edu.co.' using errcode = 'check_violation';
    end if;
  elsif p_valor !~ '^[0-9]{1,15}$' or p_valor::bigint <= 0 then
    raise exception 'El valor debe ser un número entero mayor que cero.' using errcode = 'check_violation';
  end if;
  insert into public.drive_config (clave, valor) values (p_clave, lower(btrim(p_valor)))
  on conflict (clave) do update set valor = excluded.valor, updated_at = now();
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. RLS y permisos de tabla
-- -----------------------------------------------------------------------------

alter table public.drive_config enable row level security;
alter table public.drive_unidades enable row level security;
alter table public.drive_unidad_miembros enable row level security;
alter table public.drive_unidad_eventos enable row level security;
alter table public.drive_unidad_peticiones enable row level security;

drop policy if exists drive_config_ver on public.drive_config;
create policy drive_config_ver on public.drive_config for select to authenticated
  using (public.drive_entra());

drop policy if exists drive_unidades_ver on public.drive_unidades;
create policy drive_unidades_ver on public.drive_unidades for select to authenticated
  using (public.drive_entra() and public.drive_unidad_rol(id) is not null);

drop policy if exists drive_unidad_miembros_ver on public.drive_unidad_miembros;
create policy drive_unidad_miembros_ver on public.drive_unidad_miembros for select to authenticated
  using (public.drive_entra() and public.drive_unidad_rol(unidad_id) is not null);

drop policy if exists drive_unidad_eventos_ver on public.drive_unidad_eventos;
create policy drive_unidad_eventos_ver on public.drive_unidad_eventos for select to authenticated
  using (public.drive_entra() and public.drive_unidad_rol(unidad_id) is not null);

drop policy if exists drive_unidad_peticiones_ver on public.drive_unidad_peticiones;
create policy drive_unidad_peticiones_ver on public.drive_unidad_peticiones for select to authenticated
  using (public.drive_entra() and public.drive_unidad_rol(unidad_id) = 'admin');

revoke all on public.drive_config, public.drive_unidades, public.drive_unidad_miembros, public.drive_unidad_eventos, public.drive_unidad_peticiones from public, anon, authenticated;
grant select on public.drive_config, public.drive_unidades, public.drive_unidad_miembros, public.drive_unidad_eventos, public.drive_unidad_peticiones to authenticated;
grant select, insert, update, delete on public.drive_config, public.drive_unidades, public.drive_unidad_miembros, public.drive_unidad_eventos, public.drive_unidad_peticiones to service_role;

do $$
declare
  f text;
begin
  foreach f in array array[
    'drive_es_admin_general()', 'drive_config_num(text, bigint)', 'drive_dominio()', 'drive_es_externo(uuid)', 'drive_sin_tildes(text)',
    'drive_rol_de_rango(int)', 'drive_contraste_blanco(text)', 'drive_unidad_rol(uuid, uuid)', 'drive_unidad_es_miembro(uuid, uuid)', 'drive_unidad_rango(uuid, uuid)',
    'drive_puede_crear_en_carpeta(uuid)', 'drive_puede_papelera(text, uuid)',
    'drive_unidades_listar()', 'drive_unidad_miembros_de(uuid)', 'drive_unidad_eventos_de(uuid, int)', 'drive_registro_global(int)',
    'drive_personas_buscar(text)', 'drive_personas_por_correo(text[])', 'drive_estructura_lista()', 'drive_estructura_personas(uuid)',
    'drive_unidad_crear(jsonb)', 'drive_unidad_actualizar(uuid, jsonb)', 'drive_unidad_archivar(uuid, boolean)', 'drive_unidad_entrar(uuid)',
    'drive_unidad_miembro_fijar(uuid, uuid, text, timestamptz)', 'drive_unidad_miembro_quitar(uuid, uuid)', 'drive_unidad_transferir(uuid, uuid, boolean)',
    'drive_capacidad_resumen()', 'drive_capacidad_unidades()', 'drive_unidad_cuota_fijar(uuid, bigint)', 'drive_unidad_pedir_ampliacion(uuid, bigint, text)',
    'drive_unidad_peticiones_de(uuid)', 'drive_unidad_resolver_peticion(uuid, boolean, bigint, text)', 'drive_unidad_vaciar_papelera(uuid)', 'drive_config_fijar(text, text)',
    'drive_rango(text)', 'drive_rol_carpeta(uuid, uuid)', 'drive_rol_archivo(uuid, uuid)', 'drive_a_papelera(text, uuid)', 'drive_restaurar(text, uuid)',
    'drive_eliminar_definitivo(text, uuid)', 'drive_vaciar_vencidos()', 'drive_compartir(text, uuid, text, text)', 'drive_quitar_permiso(text, uuid, uuid)', 'drive_permisos_de(text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Internas: solo las llaman otras funciones (corren con los privilegios del dueño).
  revoke all on function public.drive_unidad_registrar(uuid, text, jsonb) from public, anon, authenticated;
  grant execute on function public.drive_unidad_registrar(uuid, text, jsonb) to service_role;
end $$;

-- -----------------------------------------------------------------------------
-- 10. Storage
--
-- «udrive»: los archivos de una unidad van bajo unidades/<unidad>/<archivo>/<nombre>.
-- Suben y reemplazan quienes tienen el papel Crear; quita quien administra, o quien
-- crea si el archivo ya no tiene fila (subida fallida o ya borrada).
-- «udrive-unidades» (nuevo, privado, 5 MB): imágenes de cabecera, <unidad>/<archivo>;
-- las ve quien tiene papel en la unidad y las cambia quien la administra.
-- Mismo patrón de 0187: si el rol que aplica la migración no es dueño de
-- storage.objects, el resto queda aplicado y el aviso dice qué crear a mano.
-- -----------------------------------------------------------------------------

create or replace function public.drive_uuid_de_ruta(p_nombre text, p_pos int)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case when split_part(p_nombre, '/', p_pos) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_nombre, '/', p_pos)::uuid end;
$$;
revoke all on function public.drive_uuid_de_ruta(text, int) from public, anon;
grant execute on function public.drive_uuid_de_ruta(text, int) to authenticated, service_role;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('udrive-unidades', 'udrive-unidades', false, 5242880)
  on conflict (id) do update set public = false, file_size_limit = 5242880;

  execute 'drop policy if exists udrive_subida on storage.objects';
  execute $pol$
    create policy udrive_subida on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'udrive' and public.drive_entra() and (
          (storage.foldername(name))[1] = auth.uid()::text
          or (split_part(name, '/', 1) = 'unidades' and public.drive_uuid_de_ruta(name, 2) is not null
              and public.drive_unidad_rango(public.drive_uuid_de_ruta(name, 2)) >= 3)
        )
      )
  $pol$;

  execute 'drop policy if exists udrive_reemplazo on storage.objects';
  execute $pol$
    create policy udrive_reemplazo on storage.objects
      for update to authenticated
      using (
        bucket_id = 'udrive' and public.drive_entra() and (
          (storage.foldername(name))[1] = auth.uid()::text
          or (split_part(name, '/', 1) = 'unidades' and public.drive_uuid_de_ruta(name, 2) is not null
              and public.drive_unidad_rango(public.drive_uuid_de_ruta(name, 2)) >= 3)
        )
      )
      with check (
        bucket_id = 'udrive' and public.drive_entra() and (
          (storage.foldername(name))[1] = auth.uid()::text
          or (split_part(name, '/', 1) = 'unidades' and public.drive_uuid_de_ruta(name, 2) is not null
              and public.drive_unidad_rango(public.drive_uuid_de_ruta(name, 2)) >= 3)
        )
      )
  $pol$;

  execute 'drop policy if exists udrive_borrado on storage.objects';
  execute $pol$
    create policy udrive_borrado on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'udrive' and public.drive_entra() and (
          (storage.foldername(name))[1] = auth.uid()::text
          or (split_part(name, '/', 1) = 'unidades' and public.drive_uuid_de_ruta(name, 2) is not null and (
                public.drive_unidad_rango(public.drive_uuid_de_ruta(name, 2)) >= 4
                or (public.drive_unidad_rango(public.drive_uuid_de_ruta(name, 2)) >= 3
                    and not exists (select 1 from public.drive_archivos a where a.ruta_storage = name))
              ))
        )
      )
  $pol$;

  execute 'drop policy if exists udrive_unidades_lectura on storage.objects';
  execute $pol$
    create policy udrive_unidades_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'udrive-unidades' and public.drive_entra() and public.drive_uuid_de_ruta(name, 1) is not null
             and public.drive_unidad_rol(public.drive_uuid_de_ruta(name, 1)) is not null)
  $pol$;

  execute 'drop policy if exists udrive_unidades_subida on storage.objects';
  execute $pol$
    create policy udrive_unidades_subida on storage.objects
      for insert to authenticated
      with check (bucket_id = 'udrive-unidades' and public.drive_entra() and public.drive_uuid_de_ruta(name, 1) is not null
                  and public.drive_unidad_rol(public.drive_uuid_de_ruta(name, 1)) = 'admin')
  $pol$;

  execute 'drop policy if exists udrive_unidades_reemplazo on storage.objects';
  execute $pol$
    create policy udrive_unidades_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'udrive-unidades' and public.drive_entra() and public.drive_uuid_de_ruta(name, 1) is not null
             and public.drive_unidad_rol(public.drive_uuid_de_ruta(name, 1)) = 'admin')
      with check (bucket_id = 'udrive-unidades' and public.drive_entra() and public.drive_uuid_de_ruta(name, 1) is not null
                  and public.drive_unidad_rol(public.drive_uuid_de_ruta(name, 1)) = 'admin')
  $pol$;

  execute 'drop policy if exists udrive_unidades_borrado on storage.objects';
  execute $pol$
    create policy udrive_unidades_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'udrive-unidades' and public.drive_entra() and public.drive_uuid_de_ruta(name, 1) is not null
             and public.drive_unidad_rol(public.drive_uuid_de_ruta(name, 1)) = 'admin')
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar Storage para las unidades (%). Cree a mano el bucket "udrive-unidades" (privado, 5 MB) y las políticas de este archivo, y rehaga las de "udrive".',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';
