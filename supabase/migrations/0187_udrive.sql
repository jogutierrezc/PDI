-- =============================================================================
-- UDrive · fase 1 (0187): archivos y carpetas, tablas editables y gráficas.
--
-- Un gestor de archivos para armar informes complejos. Cada persona tiene su
-- propio espacio; lo comparte con otras por carpeta o por archivo (lector o
-- editor). Un archivo puede ser:
--
--   archivo    cualquier tipo, hasta 100 MB, en el bucket privado «udrive»;
--   tabla      columnas tipadas y filas, guardadas en `contenido` (jsonb);
--   grafica    la definición de una gráfica que lee una tabla (por id);
--   cruce      dos tablas unidas por una columna, con su gráfica combinada;
--   documento  reservado para la fase 2 (documento por bloques).
--
-- Cualquier archivo se identifica por su id: la fase 2 insertará tablas y
-- gráficas en un documento como bloques que apuntan a ese id.
--
-- Quién entra: una persona activa con capacidad «consulta» o más, y cuyo rol de
-- acceso marque la pantalla «udrive» (has_screen). Lo que ve y edita lo decide
-- el árbol de carpetas (drive_rol_*), no el cliente.
--
-- Permisos de tabla mínimos: ningún DELETE ni escritura sobre drive_permisos
-- salen directo; todo pasa por funciones security definer con search_path fijo.
-- `updated_at` lo llena el disparador: el cliente no lo manda (ver 0179/0184).
-- Requiere 0001 (set_updated_at) y 0024 (has_role_at_least, has_screen).
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.drive_carpetas (
  id          uuid primary key default gen_random_uuid(),
  padre_id    uuid references public.drive_carpetas (id) on delete cascade,
  nombre      text not null,
  creada_por  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  borrado_en  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint drive_carpetas_nombre_ok check (
    char_length(btrim(nombre)) between 1 and 120 and nombre !~ '[/\\]' and nombre !~ '[[:cntrl:]]'
  ),
  constraint drive_carpetas_no_es_su_padre check (padre_id is distinct from id)
);
comment on table public.drive_carpetas is
  'UDrive · carpetas. padre_id nulo = raíz del espacio de quien la creó. Papelera: borrado_en (30 días).';

-- Nombre único dentro de la misma carpeta (o de la raíz de la misma persona), sin contar la papelera.
create unique index if not exists drive_carpetas_nombre_uq
  on public.drive_carpetas (coalesce(padre_id, creada_por), lower(nombre)) where borrado_en is null;
create index if not exists drive_carpetas_padre_idx on public.drive_carpetas (padre_id);

create table if not exists public.drive_archivos (
  id           uuid primary key default gen_random_uuid(),
  carpeta_id   uuid references public.drive_carpetas (id) on delete cascade,
  tipo         text not null check (tipo in ('archivo', 'tabla', 'grafica', 'cruce', 'documento')),
  nombre       text not null,
  mime         text,
  tamano       bigint check (tamano is null or tamano between 0 and 104857600),
  ruta_storage text unique,
  contenido    jsonb,
  resumen      jsonb not null default '{}'::jsonb,
  estado       text not null default 'borrador' check (estado in ('borrador', 'listo')),
  creada_por   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  borrado_en   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint drive_archivos_nombre_ok check (
    char_length(btrim(nombre)) between 1 and 160 and nombre !~ '[/\\]' and nombre !~ '[[:cntrl:]]'
  ),
  -- Un archivo real vive en Storage; los demás, en `contenido`.
  constraint drive_archivos_forma check (
    (tipo = 'archivo' and ruta_storage is not null and contenido is null)
    or (tipo <> 'archivo' and ruta_storage is null and contenido is not null)
  ),
  -- La ruta es «persona/archivo/nombre-limpio»: nunca sale del prefijo de quien lo subió.
  constraint drive_archivos_ruta_ok check (
    ruta_storage is null
    or ruta_storage like creada_por::text || '/' || id::text || '/%'
       and ruta_storage ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,150}$'
  ),
  constraint drive_archivos_contenido_chico check (contenido is null or octet_length(contenido::text) <= 15000000)
);
comment on table public.drive_archivos is
  'UDrive · archivos, tablas, gráficas y cruces. `contenido` guarda tabla/gráfica/cruce; el binario va a Storage (bucket udrive).';

create unique index if not exists drive_archivos_nombre_uq
  on public.drive_archivos (coalesce(carpeta_id, creada_por), lower(nombre)) where borrado_en is null;
create index if not exists drive_archivos_carpeta_idx on public.drive_archivos (carpeta_id);
create index if not exists drive_archivos_tipo_idx on public.drive_archivos (tipo);

create table if not exists public.drive_permisos (
  id           uuid primary key default gen_random_uuid(),
  carpeta_id   uuid references public.drive_carpetas (id) on delete cascade,
  archivo_id   uuid references public.drive_archivos (id) on delete cascade,
  usuario_id   uuid not null references auth.users (id) on delete cascade,
  rol          text not null check (rol in ('propietario', 'editor', 'lector')),
  otorgado_por uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  constraint drive_permisos_uno check ((carpeta_id is null) <> (archivo_id is null))
);
comment on table public.drive_permisos is
  'UDrive · a quién se comparte una carpeta (con todo lo que contiene) o un archivo. Se maneja con drive_compartir.';
create unique index if not exists drive_permisos_carpeta_uq on public.drive_permisos (carpeta_id, usuario_id) where carpeta_id is not null;
create unique index if not exists drive_permisos_archivo_uq on public.drive_permisos (archivo_id, usuario_id) where archivo_id is not null;
create index if not exists drive_permisos_usuario_idx on public.drive_permisos (usuario_id);

-- -----------------------------------------------------------------------------
-- 2. Disparadores
-- -----------------------------------------------------------------------------

drop trigger if exists drive_carpetas_set_updated_at on public.drive_carpetas;
create trigger drive_carpetas_set_updated_at
  before update on public.drive_carpetas
  for each row execute function public.set_updated_at();

drop trigger if exists drive_archivos_set_updated_at on public.drive_archivos;
create trigger drive_archivos_set_updated_at
  before update on public.drive_archivos
  for each row execute function public.set_updated_at();

-- Una carpeta no se mueve dentro de sí misma ni de sus descendientes.
create or replace function public.drive_carpetas_sin_ciclos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.padre_id is null or new.padre_id is not distinct from old.padre_id then
    return new;
  end if;
  if exists (
    with recursive abajo as (
      select c.id from public.drive_carpetas c where c.id = new.id
      union
      select c.id from public.drive_carpetas c join abajo a on c.padre_id = a.id
    )
    select 1 from abajo where id = new.padre_id
  ) then
    raise exception 'Una carpeta no se puede mover dentro de sí misma.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists drive_carpetas_ciclos on public.drive_carpetas;
create trigger drive_carpetas_ciclos
  before update of padre_id on public.drive_carpetas
  for each row execute function public.drive_carpetas_sin_ciclos();

-- El resumen (filas y columnas) lo calcula la base: el explorador lo muestra sin bajar el contenido.
create or replace function public.drive_archivos_resumen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.contenido is not null and jsonb_typeof(new.contenido) = 'object' then
    new.resumen := jsonb_strip_nulls(jsonb_build_object(
      'filas', case when jsonb_typeof(new.contenido -> 'filas') = 'array' then jsonb_array_length(new.contenido -> 'filas') end,
      'columnas', case when jsonb_typeof(new.contenido -> 'columnas') = 'array' then jsonb_array_length(new.contenido -> 'columnas') end
    ));
  else
    new.resumen := '{}'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists drive_archivos_resumen_tg on public.drive_archivos;
create trigger drive_archivos_resumen_tg
  before insert or update of contenido on public.drive_archivos
  for each row execute function public.drive_archivos_resumen();

-- -----------------------------------------------------------------------------
-- 3. Quién entra y qué puede cada quien
-- -----------------------------------------------------------------------------

create or replace function public.drive_entra()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.has_role_at_least('consulta') and public.has_screen('udrive');
$$;

create or replace function public.drive_rango(p_rol text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_rol when 'propietario' then 3 when 'editor' then 2 when 'lector' then 1 else 0 end;
$$;

-- Mi papel en una carpeta: lo que creé en ella o en una de sus carpetas superiores, o lo que me compartieron en cualquiera de ellas.
create or replace function public.drive_rol_carpeta(p_carpeta uuid, p_usuario uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  with recursive arriba as (
    select c.id, c.padre_id, c.creada_por from public.drive_carpetas c where c.id = p_carpeta
    union
    select c.id, c.padre_id, c.creada_por from public.drive_carpetas c join arriba a on c.id = a.padre_id
  ),
  rangos as (
    select case when a.creada_por = p_usuario then 3 else 0 end as r from arriba a
    union all
    select public.drive_rango(p.rol) from public.drive_permisos p join arriba a on p.carpeta_id = a.id where p.usuario_id = p_usuario
  )
  select case max(r) when 3 then 'propietario' when 2 then 'editor' when 1 then 'lector' else null end from rangos;
$$;

-- Mi papel en un archivo: el mío, el compartido directamente o el de su carpeta.
create or replace function public.drive_rol_archivo(p_archivo uuid, p_usuario uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  with a as (select id, carpeta_id, creada_por from public.drive_archivos where id = p_archivo),
  rangos as (
    select case when a.creada_por = p_usuario then 3 else 0 end as r from a
    union all
    select public.drive_rango(p.rol) from public.drive_permisos p where p.archivo_id = p_archivo and p.usuario_id = p_usuario
    union all
    select public.drive_rango(public.drive_rol_carpeta(a.carpeta_id, p_usuario)) from a where a.carpeta_id is not null
  )
  select case max(r) when 3 then 'propietario' when 2 then 'editor' when 1 then 'lector' else null end from rangos;
$$;

create or replace function public.drive_puede_ver_carpeta(p_carpeta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.drive_entra() and public.drive_rango(public.drive_rol_carpeta(p_carpeta)) >= 1;
$$;
create or replace function public.drive_puede_editar_carpeta(p_carpeta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.drive_entra() and public.drive_rango(public.drive_rol_carpeta(p_carpeta)) >= 2;
$$;
create or replace function public.drive_puede_ver_archivo(p_archivo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.drive_entra() and public.drive_rango(public.drive_rol_archivo(p_archivo)) >= 1;
$$;
create or replace function public.drive_puede_editar_archivo(p_archivo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.drive_entra() and public.drive_rango(public.drive_rol_archivo(p_archivo)) >= 2;
$$;

-- Con el tipo por delante: 'carpeta' o 'archivo'.
create or replace function public.drive_puede_ver(p_tipo text, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_tipo when 'carpeta' then public.drive_puede_ver_carpeta(p_id) when 'archivo' then public.drive_puede_ver_archivo(p_id) else false end;
$$;
create or replace function public.drive_puede_editar(p_tipo text, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_tipo when 'carpeta' then public.drive_puede_editar_carpeta(p_id) when 'archivo' then public.drive_puede_editar_archivo(p_id) else false end;
$$;

-- -----------------------------------------------------------------------------
-- 4. RLS y permisos de tabla
-- -----------------------------------------------------------------------------

alter table public.drive_carpetas enable row level security;
alter table public.drive_archivos enable row level security;
alter table public.drive_permisos enable row level security;

-- `creada_por = auth.uid()` va por delante para que INSERT … RETURNING vea su propia fila.
drop policy if exists drive_carpetas_ver on public.drive_carpetas;
create policy drive_carpetas_ver on public.drive_carpetas for select to authenticated
  using (public.drive_entra() and (creada_por = auth.uid() or public.drive_puede_ver_carpeta(id)));

drop policy if exists drive_carpetas_crear on public.drive_carpetas;
create policy drive_carpetas_crear on public.drive_carpetas for insert to authenticated
  with check (public.drive_entra() and creada_por = auth.uid() and (padre_id is null or public.drive_puede_editar_carpeta(padre_id)));

drop policy if exists drive_carpetas_cambiar on public.drive_carpetas;
create policy drive_carpetas_cambiar on public.drive_carpetas for update to authenticated
  using (public.drive_puede_editar_carpeta(id))
  with check (
    (padre_id is null and (creada_por = auth.uid() or public.drive_puede_editar_carpeta(id)))
    or (padre_id is not null and public.drive_puede_editar_carpeta(padre_id))
  );

drop policy if exists drive_archivos_ver on public.drive_archivos;
create policy drive_archivos_ver on public.drive_archivos for select to authenticated
  using (public.drive_entra() and (creada_por = auth.uid() or public.drive_puede_ver_archivo(id)));

drop policy if exists drive_archivos_crear on public.drive_archivos;
create policy drive_archivos_crear on public.drive_archivos for insert to authenticated
  with check (public.drive_entra() and creada_por = auth.uid() and (carpeta_id is null or public.drive_puede_editar_carpeta(carpeta_id)));

drop policy if exists drive_archivos_cambiar on public.drive_archivos;
create policy drive_archivos_cambiar on public.drive_archivos for update to authenticated
  using (public.drive_puede_editar_archivo(id))
  with check (
    (carpeta_id is null and (creada_por = auth.uid() or public.drive_puede_editar_archivo(id)))
    or (carpeta_id is not null and public.drive_puede_editar_carpeta(carpeta_id))
  );

-- drive_permisos: sin políticas para el cliente; se maneja con las funciones de la sección 5.

revoke all on public.drive_carpetas, public.drive_archivos, public.drive_permisos from public, anon, authenticated;
grant select on public.drive_carpetas, public.drive_archivos to authenticated;
-- Se escribe solo lo que la pantalla manda. Nada de creada_por, tipo, ruta_storage, resumen ni updated_at (los pone la base).
grant insert (id, padre_id, nombre) on public.drive_carpetas to authenticated;
grant update (padre_id, nombre) on public.drive_carpetas to authenticated;
grant insert (id, carpeta_id, tipo, nombre, mime, tamano, ruta_storage, contenido, estado) on public.drive_archivos to authenticated;
grant update (carpeta_id, nombre, contenido, estado) on public.drive_archivos to authenticated;
grant select, insert, update, delete on public.drive_carpetas, public.drive_archivos, public.drive_permisos to service_role;

-- -----------------------------------------------------------------------------
-- 5. Funciones de la pantalla
-- -----------------------------------------------------------------------------

-- Una carpeta y todo lo que tiene debajo.
create or replace function public.drive_subarbol(p_carpeta uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive abajo as (
    select c.id from public.drive_carpetas c where c.id = p_carpeta
    union
    select c.id from public.drive_carpetas c join abajo a on c.padre_id = a.id
  )
  select id from abajo;
$$;

-- A la papelera: la carpeta o el archivo (y todo lo que contiene) con la misma marca de tiempo.
create or replace function public.drive_a_papelera(p_tipo text, p_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamptz := now();
begin
  if not public.drive_puede_editar(p_tipo, p_id) then
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

-- Restaurar: lo que se fue a la papelera en el mismo momento que el elemento vuelve con él.
create or replace function public.drive_restaurar(p_tipo text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marca timestamptz;
begin
  if not public.drive_puede_editar(p_tipo, p_id) then
    raise exception 'No tiene permiso para restaurar esto.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo = 'carpeta' then
    select borrado_en into v_marca from public.drive_carpetas where id = p_id;
    if v_marca is null then return; end if;
    update public.drive_carpetas set borrado_en = null where id in (select public.drive_subarbol(p_id)) and borrado_en = v_marca;
    update public.drive_archivos set borrado_en = null where carpeta_id in (select public.drive_subarbol(p_id)) and borrado_en = v_marca;
  else
    -- Si su carpeta sigue en la papelera, el archivo vuelve a la raíz.
    update public.drive_archivos a
       set borrado_en = null,
           carpeta_id = case when a.carpeta_id is not null and exists (
             select 1 from public.drive_carpetas c where c.id = a.carpeta_id and c.borrado_en is not null
           ) then null else a.carpeta_id end
     where a.id = p_id;
  end if;
end;
$$;

-- Borrar para siempre lo que es de quien pide (propietario). Devuelve las rutas de Storage para que el cliente las quite.
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
     ) < 3 then
    raise exception 'Solo quien es propietario puede borrar para siempre.' using errcode = 'insufficient_privilege';
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

-- Vacía de la papelera, para siempre, lo mío que lleva más de 30 días allí.
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
   where creada_por = auth.uid() and ruta_storage is not null and borrado_en < now() - interval '30 days';
  delete from public.drive_archivos where creada_por = auth.uid() and borrado_en < now() - interval '30 days';
  -- Las carpetas vencidas: sus archivos ya se fueron (o van en cascada con la misma marca).
  select v_rutas || coalesce(array_agg(a.ruta_storage), '{}') into v_rutas
    from public.drive_archivos a
   where a.ruta_storage is not null
     and a.carpeta_id in (select id from public.drive_carpetas where creada_por = auth.uid() and borrado_en < now() - interval '30 days');
  delete from public.drive_carpetas where creada_por = auth.uid() and borrado_en < now() - interval '30 days';
  return v_rutas;
end;
$$;

-- Compartir con una persona de la intranet por su correo.
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
  if not public.drive_entra() or public.drive_rango(
       case p_tipo when 'carpeta' then public.drive_rol_carpeta(p_id) else public.drive_rol_archivo(p_id) end
     ) < 3 then
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
     ) < 3 then
    raise exception 'Solo quien es propietario puede dejar de compartir.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo = 'carpeta' then
    delete from public.drive_permisos where carpeta_id = p_id and usuario_id = p_usuario;
  else
    delete from public.drive_permisos where archivo_id = p_id and usuario_id = p_usuario;
  end if;
end;
$$;

-- Con quién se comparte (solo lo ve el propietario).
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
     ) < 3 then
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

-- Quién es el dueño y mi papel en cada elemento visible (el explorador lo pinta en el panel de detalles).
create or replace function public.drive_duenos(p_ids uuid[])
returns table (id uuid, correo text, nombre text, mi_rol text)
language sql
stable
security definer
set search_path = public
as $$
  select x.id, pr.email, pr.full_name, x.mi_rol
    from (
      select c.id, c.creada_por, public.drive_rol_carpeta(c.id) as mi_rol from public.drive_carpetas c where c.id = any (p_ids)
      union all
      select a.id, a.creada_por, public.drive_rol_archivo(a.id) from public.drive_archivos a where a.id = any (p_ids)
    ) x
    join public.profiles pr on pr.id = x.creada_por
   where public.drive_entra() and x.mi_rol is not null;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'drive_entra()', 'drive_rango(text)', 'drive_rol_carpeta(uuid, uuid)', 'drive_rol_archivo(uuid, uuid)',
    'drive_puede_ver_carpeta(uuid)', 'drive_puede_editar_carpeta(uuid)', 'drive_puede_ver_archivo(uuid)', 'drive_puede_editar_archivo(uuid)',
    'drive_puede_ver(text, uuid)', 'drive_puede_editar(text, uuid)', 'drive_subarbol(uuid)', 'drive_a_papelera(text, uuid)',
    'drive_restaurar(text, uuid)', 'drive_eliminar_definitivo(text, uuid)', 'drive_vaciar_vencidos()', 'drive_compartir(text, uuid, text, text)',
    'drive_quitar_permiso(text, uuid, uuid)', 'drive_permisos_de(text, uuid)', 'drive_duenos(uuid[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Storage: bucket privado «udrive», 100 MB por archivo, cualquier tipo
--
-- Cada persona sube solo bajo su propio prefijo (<su id>/<archivo>/<nombre>);
-- lee lo que drive_puede_ver_archivo permite y cambia lo que puede editar.
-- Mismo patrón de 0013/0027: si el rol que aplica la migración no es dueño de
-- storage.objects, el resto queda aplicado y el aviso dice qué crear a mano.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('udrive', 'udrive', false, 104857600)
  on conflict (id) do update set public = false, file_size_limit = 104857600;

  execute 'drop policy if exists udrive_lectura on storage.objects';
  execute $pol$
    create policy udrive_lectura on storage.objects
      for select to authenticated
      using (
        bucket_id = 'udrive' and public.drive_entra() and (
          (storage.foldername(name))[1] = auth.uid()::text
          or exists (select 1 from public.drive_archivos a where a.ruta_storage = name and public.drive_puede_ver_archivo(a.id))
        )
      )
  $pol$;

  execute 'drop policy if exists udrive_subida on storage.objects';
  execute $pol$
    create policy udrive_subida on storage.objects
      for insert to authenticated
      with check (bucket_id = 'udrive' and public.drive_entra() and (storage.foldername(name))[1] = auth.uid()::text)
  $pol$;

  execute 'drop policy if exists udrive_reemplazo on storage.objects';
  execute $pol$
    create policy udrive_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'udrive' and public.drive_entra() and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'udrive' and public.drive_entra() and (storage.foldername(name))[1] = auth.uid()::text)
  $pol$;

  execute 'drop policy if exists udrive_borrado on storage.objects';
  execute $pol$
    create policy udrive_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'udrive' and public.drive_entra() and (storage.foldername(name))[1] = auth.uid()::text)
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "udrive" (%). Créalo a mano desde Storage: privado, 100 MB por archivo, con políticas por propietario.',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';
