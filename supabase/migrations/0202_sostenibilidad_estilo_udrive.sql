-- =============================================================================
-- PDI · 0202 · Datos de Sostenibilidad «al estilo UDrive»
--
-- Datos de Sostenibilidad deja de ser «libros por oficina» y pasa a trabajar
-- sobre UDrive: UNA unidad de trabajo («Datos de Sostenibilidad», con carpetas
-- semilla) en la que carpetas, tablas y gráficas son libres. Todas las personas
-- que entran a la pantalla VEN todo; edita quien tiene papel en la unidad
-- (Solo ver / Editar / Crear / Administra, los cuatro de 0191). Las tablas y
-- gráficas se conectan a los indicadores de UDES Sostenible, y solo lo marcado
-- como publicado sale al portal público, con datos agregados.
--
-- Requiere 0178, 0198 (indicadores), 0187, 0188, 0191 y 0195 (UDrive).
-- NO borra nada de los libros (ds_libros…): los reemplaza el paquete de pantallas.
-- Idempotente.
--
-- PORQUÉ DE CADA DECISIÓN DE SEGURIDAD
--
--  1. Lectura abierta SIN ser miembro (drive_unidades.lectura_abierta). Es un
--     indicador de la unidad, no una fila por persona: así no hay que repartir
--     cientos de papeles, y editar sigue exigiendo una fila vigente en
--     drive_unidad_miembros. El indicador NO lo puede cambiar el cliente
--     (drive_unidades no tiene política de escritura; drive_unidad_actualizar
--     no lo toca): solo esta migración o el administrador de la base.
--  2. sos_entra() espeja el criterio de la pantalla (src/lib/auth.tsx): sesión
--     activa y pantalla «datos-sostenibilidad» habilitada, o miembro de
--     ds_miembros, o Planeación/administración (siempre). La base lo hace
--     cumplir; la pantalla solo lo refleja.
--  3. drive_entra() también deja pasar a sos_entra(). Sin eso las políticas de
--     drive_carpetas/drive_archivos (que exigen drive_entra) esconderían la
--     unidad a quien no tenga la pantalla UDrive. Consecuencia aceptada: esa
--     persona alcanza las funciones de UDrive, pero solo VE la unidad de
--     Sostenibilidad (rol lector) y lo propio; la ruta /admin/udrive sigue
--     cerrada por la pantalla «udrive».
--  4. Las tablas crudas NO salen al público. Los dos RPC públicos son
--     SECURITY DEFINER con search_path fijo y entregan solo: (a) por indicador
--     publicado, la serie ya agregada por campus y año; (b) por gráfica
--     publicada, su configuración mínima y SOLO las columnas que usa. Nunca
--     nombres de personas, ids de usuario ni archivos en borrador.
--  5. Una tabla con columna sensible no se publica. UDrive no marca columnas,
--     así que la comprobación vive en sos_columna_sensible(): respeta una marca
--     `sensible: true` en la columna (si algún día UDrive la guarda) y, mientras
--     tanto, detecta por nombre/etiqueta las típicas (cédula, correo, teléfono,
--     dirección, apellido, nacimiento, salario…). Se comprueba al vincular o
--     publicar Y OTRA VEZ al leer en el RPC público (la tabla pudo cambiar
--     después). Es una red de seguridad, no un sustituto de revisar los datos.
--  6. Gráficas de dispersión y burbujas no se publican (un punto por registro:
--     son microdatos). Una gráfica publicada admite hasta 500 filas y solo las
--     de la tabla que referencia dentro de la misma unidad.
--  7. Quién escribe: vincular una tabla a un indicador pide papel Crear o más
--     sobre ese archivo; publicar una gráfica, lo mismo; crear/editar
--     indicadores y publicar un indicador, Administra en la unidad o el
--     administrador general. Si el indicador ya está publicado, cambiar su
--     vínculo también pide Administra (cambia lo que ve el público). Las
--     políticas dicen QUIÉN; los disparadores validan QUÉ (tabla, columnas).
--  8. Validación de contenido en SQL: el contenido de UDrive es jsonb
--     ({columnas:[{clave,etiqueta,tipo}], filas:[{id,datos}]}), así que la base
--     SÍ comprueba que el archivo sea tipo tabla de la unidad, que las columnas
--     existan y que la del valor sea numérica (numero|porcentaje). Lo que la
--     base no puede saber (si una columna de texto libre cuela datos personales)
--     lo cubre el punto 5 y la revisión humana. Si alguien edita la tabla
--     después y borra una columna, el RPC público la omite sin fallar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Acceso: sos_entra() y la lectura abierta de la unidad
-- -----------------------------------------------------------------------------

create or replace function public.sos_entra()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and public.current_role() is not null
     and (public.has_role_at_least('planeacion')
          or public.has_screen('datos-sostenibilidad')
          or exists (select 1 from public.ds_miembros m where m.user_id = auth.uid()));
$$;
comment on function public.sos_entra() is
  'Datos de Sostenibilidad · ¿entra a la pantalla? Espejo de screenVisible en src/lib/auth.tsx.';

alter table public.drive_unidades add column if not exists lectura_abierta boolean not null default false;
comment on column public.drive_unidades.lectura_abierta is
  'Quien pasa sos_entra() recibe al menos el papel lector sin ser miembro. Solo lo fija una migración.';

-- UDrive abre a quien tiene la pantalla UDrive o entra a Datos de Sostenibilidad.
create or replace function public.drive_entra()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.has_role_at_least('consulta')
     and (public.has_screen('udrive') or public.sos_entra());
$$;

-- Mi papel en una unidad: el del administrador general, el de mi fila vigente o,
-- si la unidad es de lectura abierta y entro a la pantalla, lector.
create or replace function public.drive_unidad_rol(p_unidad uuid, p_usuario uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_usuario is not distinct from auth.uid() and auth.uid() is not null and public.has_role_at_least('admin') then 'admin'
    else coalesce(
      (select m.rol from public.drive_unidad_miembros m
        where m.unidad_id = p_unidad and m.usuario_id = p_usuario and (m.vence_en is null or m.vence_en > now())),
      case when p_usuario is not distinct from auth.uid()
                and exists (select 1 from public.drive_unidades u where u.id = p_unidad and u.lectura_abierta)
                and public.sos_entra()
           then 'lector' end)
  end;
$$;

-- ¿La unidad es la de Sostenibilidad (lectura abierta)?
create or replace function public.sos_unidad_abierta(p_unidad uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (select 1 from public.drive_unidades u where u.id = p_unidad and u.lectura_abierta), false);
$$;

-- ¿Administra la unidad de Sostenibilidad (o es el administrador general)?
create or replace function public.sos_es_admin_unidad()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.sos_entra()
     and exists (select 1 from public.drive_unidades u where u.lectura_abierta and public.drive_unidad_rango(u.id) >= 4);
$$;

-- Rango (0 a 4) sobre un archivo si es de la unidad de Sostenibilidad; 0 si no.
create or replace function public.sos_rango_archivo(p_archivo uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.drive_archivos a where a.id = p_archivo and a.borrado_en is null and public.sos_unidad_abierta(a.unidad_id))
    then public.drive_rango(public.drive_rol_archivo(p_archivo))
    else 0 end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Semilla: la unidad y sus carpetas
-- -----------------------------------------------------------------------------
-- No se crean miembros: una persona externa no puede ser Administra (guardia de
-- 0191) y el administrador general ya administra toda unidad. Quien deba
-- administrarla se nombra desde UDrive.

do $$
declare
  v_admin uuid;
  v_id uuid;
  v_raiz uuid := gen_random_uuid();
  v_nombre text;
  v_cid uuid;
  v_anclas uuid[] := '{}';
begin
  select u.id into v_id from public.drive_unidades u where lower(btrim(u.nombre)) = 'datos de sostenibilidad';
  if v_id is not null then
    update public.drive_unidades set lectura_abierta = true where id = v_id and not lectura_abierta;
    return;
  end if;
  select p.id into v_admin from public.profiles p where p.role = 'admin' and p.is_active order by p.created_at limit 1;
  if v_admin is null then
    raise notice '0202: no hay administrador activo; la unidad «Datos de Sostenibilidad» no se sembró. Vuelva a aplicar la migración.';
    return;
  end if;
  v_id := gen_random_uuid();
  insert into public.drive_unidades (id, nombre, descripcion, monograma, acento, icono, composicion, portada, plantilla, carpeta_raiz, creada_por, lectura_abierta)
  values (v_id, 'Datos de Sostenibilidad', 'Tablas y gráficas de sostenibilidad abiertas a toda la comunidad de la intranet.', 'SOS', '#12833a', 'leaf', 'A', 'curvas', 'blanco', v_raiz, v_admin, true);
  insert into public.drive_carpetas (id, padre_id, nombre, creada_por, unidad_id) values (v_raiz, null, 'Datos de Sostenibilidad', v_admin, v_id);
  foreach v_nombre in array array['Energía y clima', 'Agua', 'Residuos', 'Campus verde'] loop
    v_cid := gen_random_uuid();
    insert into public.drive_carpetas (id, padre_id, nombre, creada_por) values (v_cid, v_raiz, v_nombre, v_admin);
    v_anclas := v_anclas || v_cid;
  end loop;
  update public.drive_unidades set ancladas = v_anclas where id = v_id;
  insert into public.drive_unidad_eventos (unidad_id, actor_id, como, accion, detalle)
  values (v_id, null, 'sistema', 'creada', jsonb_build_object('origen', '0202'));
end $$;

-- -----------------------------------------------------------------------------
-- 3. Catálogo de indicadores ampliado (sin romper los 4 sembrados)
-- -----------------------------------------------------------------------------

alter table public.ds_indicadores add column if not exists mejor     text     not null default 'sube';
alter table public.ds_indicadores add column if not exists resumen   text     not null default 'promedio';
alter table public.ds_indicadores add column if not exists meta      numeric;
alter table public.ds_indicadores add column if not exists decimales smallint not null default 0;
alter table public.ds_indicadores add column if not exists publicado boolean  not null default false;
alter table public.ds_indicadores add column if not exists tarjeta   text;
alter table public.ds_indicadores add column if not exists nota      text     not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ds_indicadores_mejor_ok') then
    alter table public.ds_indicadores add constraint ds_indicadores_mejor_ok check (mejor in ('sube', 'baja'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ds_indicadores_resumen_ok') then
    alter table public.ds_indicadores add constraint ds_indicadores_resumen_ok check (resumen in ('promedio', 'suma', 'ultimo'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ds_indicadores_decimales_ok') then
    alter table public.ds_indicadores add constraint ds_indicadores_decimales_ok check (decimales between 0 and 3);
  end if;
  -- Las claves de las tarjetas del portal (IndKey en src/modules/sostenible/data.ts).
  if not exists (select 1 from pg_constraint where conname = 'ds_indicadores_tarjeta_ok') then
    alter table public.ds_indicadores add constraint ds_indicadores_tarjeta_ok
      check (tarjeta is null or tarjeta in ('energia', 'solar', 'agua', 'residuos', 'verde', 'arboles', 'movil', 'volunt'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ds_indicadores_nota_ok') then
    alter table public.ds_indicadores add constraint ds_indicadores_nota_ok check (char_length(nota) <= 400 and char_length(nombre) <= 120);
  end if;
end $$;

-- Una tarjeta del portal la alimenta un solo indicador.
create unique index if not exists ds_indicadores_tarjeta_uq on public.ds_indicadores (tarjeta) where tarjeta is not null;

comment on column public.ds_indicadores.tarjeta is
  'Clave de la tarjeta del portal que alimenta (IndKey); nulo si el indicador es nuevo y sale como tarjeta propia.';
comment on column public.ds_indicadores.publicado is
  'Solo los publicados salen al portal público (sos_cifras_publicas). Marcarlo pide Administra y un vínculo válido.';

-- -----------------------------------------------------------------------------
-- 4. Ayudas de contenido (jsonb de UDrive)
-- -----------------------------------------------------------------------------

create or replace function public.sos_uuid(p_texto text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case when p_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_texto::uuid end;
$$;

-- La columna `clave` de una tabla de UDrive (su definición), o nulo.
create or replace function public.sos_col(p_columnas jsonb, p_clave text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select c
    from jsonb_array_elements(case when jsonb_typeof(p_columnas) = 'array' then p_columnas else '[]'::jsonb end) c
   where c ->> 'clave' = p_clave
   limit 1;
$$;

-- Marca de columna sensible (ver la cabecera, punto 5).
create or replace function public.sos_columna_sensible(p_col jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_col ->> 'sensible', '') = 'true'
      or public.drive_sin_tildes(coalesce(p_col ->> 'clave', '') || ' ' || coalesce(p_col ->> 'etiqueta', ''))
         ~ '(cedula|documento|identificaci|correo|e-?mail|telefono|celular|direccion|apellido|nacimiento|codigo.?(de.?)?(estudiante|empleado)|salario|sueldo)';
$$;

-- Las columnas que usa una gráfica (eje x, series, tamaño y fila del calor).
create or replace function public.sos_columnas_grafica(p_config jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct k), '{}'::text[])
    from (
      select p_config ->> 'x' as k
      union all select p_config ->> 'tamano'
      union all select p_config ->> 'filaCalor'
      union all select s ->> 'clave'
        from jsonb_array_elements(case when jsonb_typeof(p_config -> 'series') = 'array' then p_config -> 'series' else '[]'::jsonb end) s
    ) q
   where k is not null and k <> '';
$$;

-- Las filas de una tabla reducidas a las columnas pedidas.
create or replace function public.sos_filas_de(p_contenido jsonb, p_cols text[])
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(
           (select coalesce(jsonb_object_agg(k, f -> 'datos' -> k), '{}'::jsonb)
              from unnest(p_cols) k where jsonb_exists(f -> 'datos', k))
         ), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p_contenido -> 'filas') = 'array' then p_contenido -> 'filas' else '[]'::jsonb end) f;
$$;

-- -----------------------------------------------------------------------------
-- 5. Vínculos indicador → tabla
-- -----------------------------------------------------------------------------

create table if not exists public.sos_vinculos (
  id           uuid primary key default gen_random_uuid(),
  indicador_id text not null references public.ds_indicadores (id) on delete cascade,
  archivo_id   uuid not null references public.drive_archivos (id) on delete cascade,
  col_valor    text not null,
  col_periodo  text not null,
  col_campus   text,
  filtro_col   text,
  filtro_valor text,
  creado_por   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint sos_vinculos_indicador_uq unique (indicador_id),
  constraint sos_vinculos_filtro_ok check ((filtro_col is null) = (filtro_valor is null)),
  constraint sos_vinculos_claves_ok check (
    char_length(col_valor) between 1 and 80 and char_length(col_periodo) between 1 and 80
    and (col_campus is null or char_length(col_campus) between 1 and 80)
    and (filtro_col is null or char_length(filtro_col) between 1 and 80)
    and (filtro_valor is null or char_length(filtro_valor) <= 120)
  )
);
comment on table public.sos_vinculos is
  'Datos de Sostenibilidad · de qué tabla de UDrive sale cada indicador y en qué columnas (valor, periodo, campus, filtro opcional). Uno por indicador.';
create index if not exists sos_vinculos_archivo_idx on public.sos_vinculos (archivo_id);

drop trigger if exists sos_vinculos_set_updated_at on public.sos_vinculos;
create trigger sos_vinculos_set_updated_at
  before update on public.sos_vinculos
  for each row execute function public.set_updated_at();

/**
 * Devuelve el motivo por el que un vínculo no vale, o nulo si vale. La usan el
 * disparador (para rechazar) y el RPC público (para omitir, por si la tabla
 * cambió después).
 */
create or replace function public.sos_validar_vinculo(p_archivo uuid, p_valor text, p_periodo text, p_campus text, p_filtro text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  c jsonb;
  k text;
begin
  select tipo, unidad_id, borrado_en, contenido into a from public.drive_archivos where id = p_archivo;
  if not found or a.tipo <> 'tabla' or a.borrado_en is not null then
    return 'El archivo debe ser una tabla de UDrive.';
  end if;
  if not public.sos_unidad_abierta(a.unidad_id) then
    return 'La tabla debe estar en la unidad Datos de Sostenibilidad.';
  end if;
  c := public.sos_col(a.contenido -> 'columnas', p_valor);
  if c is null then return 'La columna del valor no existe en la tabla.'; end if;
  if coalesce(c ->> 'tipo', '') not in ('numero', 'porcentaje') then
    return 'La columna del valor debe ser numérica (número o porcentaje).';
  end if;
  foreach k in array array[p_valor, p_periodo, p_campus, p_filtro] loop
    if k is null then continue; end if;
    c := public.sos_col(a.contenido -> 'columnas', k);
    if c is null then return 'La columna «' || k || '» no existe en la tabla.'; end if;
    if public.sos_columna_sensible(c) then
      return 'La columna «' || k || '» parece traer datos personales y no se puede publicar.';
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.sos_vinculos_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_error text;
begin
  v_error := public.sos_validar_vinculo(new.archivo_id, new.col_valor, new.col_periodo, new.col_campus, new.filtro_col);
  if v_error is not null then
    raise exception '%', v_error using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    new.creado_por := old.creado_por;
  end if;
  return new;
end;
$$;

drop trigger if exists sos_vinculos_guardia_tg on public.sos_vinculos;
create trigger sos_vinculos_guardia_tg
  before insert or update on public.sos_vinculos
  for each row execute function public.sos_vinculos_guardia();

-- Un indicador publicado necesita un vínculo válido; si se borra el último, se despublica.
create or replace function public.sos_vinculos_despues_borrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ds_indicadores i set publicado = false
   where i.id = old.indicador_id and i.publicado
     and not exists (select 1 from public.sos_vinculos v where v.indicador_id = i.id);
  return old;
end;
$$;

drop trigger if exists sos_vinculos_despues_borrar_tg on public.sos_vinculos;
create trigger sos_vinculos_despues_borrar_tg
  after delete on public.sos_vinculos
  for each row execute function public.sos_vinculos_despues_borrar();

create or replace function public.ds_indicadores_publicar_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.publicado and not exists (select 1 from public.sos_vinculos v where v.indicador_id = new.id) then
    raise exception 'Para publicar un indicador primero vincúlelo a una tabla.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists ds_indicadores_publicar_tg on public.ds_indicadores;
create trigger ds_indicadores_publicar_tg
  before insert or update of publicado on public.ds_indicadores
  for each row execute function public.ds_indicadores_publicar_guardia();

-- ¿Puedo vincular/desvincular esta tabla a este indicador? Crear sobre el archivo; Administra si el indicador ya es público.
create or replace function public.sos_puede_vincular(p_indicador text, p_archivo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.sos_entra()
     and public.sos_rango_archivo(p_archivo) >= 3
     and (public.sos_es_admin_unidad()
          or not exists (select 1 from public.ds_indicadores i where i.id = p_indicador and i.publicado));
$$;

-- -----------------------------------------------------------------------------
-- 6. Publicación de gráficas
-- -----------------------------------------------------------------------------

create table if not exists public.sos_publicaciones (
  archivo_id uuid primary key references public.drive_archivos (id) on delete cascade,
  seccion    text not null default 'detalle',
  orden      int  not null default 0,
  publicado  boolean not null default false,
  por        uuid default auth.uid(),
  en         timestamptz not null default now(),
  constraint sos_publicaciones_seccion_ok check (seccion in ('panorama', 'tendencia', 'composicion', 'territorio', 'detalle'))
);
comment on table public.sos_publicaciones is
  'Datos de Sostenibilidad · gráficas de la unidad marcadas para el portal público y la sección del Observatorio donde van.';

/** Motivo por el que una gráfica no se puede publicar, o nulo si se puede. Misma idea que sos_validar_vinculo. */
create or replace function public.sos_validar_grafica(p_archivo uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g record;
  t record;
  cfg jsonb;
  usadas text[];
  k text;
  c jsonb;
begin
  select tipo, unidad_id, borrado_en, contenido into g from public.drive_archivos where id = p_archivo;
  if not found or g.tipo <> 'grafica' or g.borrado_en is not null or not public.sos_unidad_abierta(g.unidad_id) then
    return 'Solo se publican gráficas de la unidad Datos de Sostenibilidad.';
  end if;
  cfg := g.contenido -> 'config';
  if coalesce(cfg ->> 'tipo', '') in ('dispersion', 'burbujas') then
    return 'Las gráficas de dispersión y de burbujas muestran un punto por registro y no se publican.';
  end if;
  select a.tipo, a.unidad_id, a.borrado_en, a.contenido into t
    from public.drive_archivos a where a.id = public.sos_uuid(g.contenido ->> 'tabla_id');
  if not found or t.tipo <> 'tabla' or t.borrado_en is not null or t.unidad_id is distinct from g.unidad_id then
    return 'La gráfica debe usar una tabla de la misma unidad.';
  end if;
  usadas := public.sos_columnas_grafica(cfg);
  if cardinality(usadas) = 0 then return 'La gráfica no tiene columnas elegidas.'; end if;
  foreach k in array usadas loop
    c := public.sos_col(t.contenido -> 'columnas', k);
    if c is null then return 'La columna «' || k || '» ya no existe en la tabla.'; end if;
    if public.sos_columna_sensible(c) then
      return 'La columna «' || k || '» parece traer datos personales y no se puede publicar.';
    end if;
  end loop;
  if jsonb_typeof(t.contenido -> 'filas') = 'array' and jsonb_array_length(t.contenido -> 'filas') > 500 then
    return 'La tabla tiene más de 500 filas: agréguela antes de publicar su gráfica.';
  end if;
  return null;
end;
$$;

create or replace function public.sos_publicaciones_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_error text;
begin
  new.por := auth.uid();
  new.en := now();
  if new.publicado then
    v_error := public.sos_validar_grafica(new.archivo_id);
    if v_error is not null then
      raise exception '%', v_error using errcode = 'check_violation';
    end if;
  elsif not exists (select 1 from public.drive_archivos a where a.id = new.archivo_id and a.tipo = 'grafica' and public.sos_unidad_abierta(a.unidad_id)) then
    raise exception 'Solo se publican gráficas de la unidad Datos de Sostenibilidad.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists sos_publicaciones_guardia_tg on public.sos_publicaciones;
create trigger sos_publicaciones_guardia_tg
  before insert or update on public.sos_publicaciones
  for each row execute function public.sos_publicaciones_guardia();

-- -----------------------------------------------------------------------------
-- 7. RLS
-- -----------------------------------------------------------------------------

alter table public.sos_vinculos      enable row level security;
alter table public.sos_publicaciones enable row level security;

revoke all on public.sos_vinculos, public.sos_publicaciones from public, anon;
grant select, insert, update, delete on public.sos_vinculos, public.sos_publicaciones to authenticated, service_role;

-- Catálogo: lo lee quien entra a la pantalla; lo escribe la administración o quien Administra la unidad.
drop policy if exists ds_indicadores_select on public.ds_indicadores;
create policy ds_indicadores_select on public.ds_indicadores
  for select using (public.ds_es_participante() or public.sos_entra());
drop policy if exists ds_indicadores_sos_admin on public.ds_indicadores;
create policy ds_indicadores_sos_admin on public.ds_indicadores
  for all to authenticated using (public.sos_es_admin_unidad()) with check (public.sos_es_admin_unidad());

drop policy if exists sos_vinculos_select on public.sos_vinculos;
create policy sos_vinculos_select on public.sos_vinculos for select to authenticated using (public.sos_entra());
drop policy if exists sos_vinculos_insert on public.sos_vinculos;
create policy sos_vinculos_insert on public.sos_vinculos for insert to authenticated
  with check (public.sos_puede_vincular(indicador_id, archivo_id));
drop policy if exists sos_vinculos_update on public.sos_vinculos;
create policy sos_vinculos_update on public.sos_vinculos for update to authenticated
  using (public.sos_puede_vincular(indicador_id, archivo_id))
  with check (public.sos_puede_vincular(indicador_id, archivo_id));
drop policy if exists sos_vinculos_delete on public.sos_vinculos;
create policy sos_vinculos_delete on public.sos_vinculos for delete to authenticated
  using (public.sos_puede_vincular(indicador_id, archivo_id));

drop policy if exists sos_publicaciones_select on public.sos_publicaciones;
create policy sos_publicaciones_select on public.sos_publicaciones for select to authenticated using (public.sos_entra());
drop policy if exists sos_publicaciones_insert on public.sos_publicaciones;
create policy sos_publicaciones_insert on public.sos_publicaciones for insert to authenticated
  with check (public.sos_entra() and public.sos_rango_archivo(archivo_id) >= 3);
drop policy if exists sos_publicaciones_update on public.sos_publicaciones;
create policy sos_publicaciones_update on public.sos_publicaciones for update to authenticated
  using (public.sos_entra() and public.sos_rango_archivo(archivo_id) >= 3)
  with check (public.sos_entra() and public.sos_rango_archivo(archivo_id) >= 3);
drop policy if exists sos_publicaciones_delete on public.sos_publicaciones;
create policy sos_publicaciones_delete on public.sos_publicaciones for delete to authenticated
  using (public.sos_entra() and public.sos_rango_archivo(archivo_id) >= 3);

-- -----------------------------------------------------------------------------
-- 8. Lectura PÚBLICA (portal UDES Sostenible, sin sesión incluida)
-- -----------------------------------------------------------------------------

/**
 * [{id, ods, nombre, unidad, mejor, meta, tarjeta, decimales, nota, resumen,
 *   fuente, serie: [{campus, anio, periodo, valor}]}]
 * Solo indicadores publicados con vínculo válido. `serie` ya viene agregada por
 * campus y año con el `resumen` del indicador (promedio|suma|ultimo). `campus`
 * nulo es la cifra institucional: si la tabla tiene campus pero no una fila
 * institucional para ese año, se calcula con las filas de todos los campus (con
 * el mismo resumen). `fuente` es el nombre del archivo; `periodo`, el texto del
 * último periodo de ese grupo. Las filas sin número o sin año de cuatro cifras
 * se omiten.
 */
create or replace function public.sos_cifras_publicas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select i.id, i.ods, i.nombre, i.unidad, i.mejor, i.meta, i.tarjeta, i.decimales, i.nota, i.resumen, i.position,
           a.nombre as fuente, a.contenido,
           x.col_valor, x.col_periodo, x.col_campus, x.filtro_col, x.filtro_valor
      from public.ds_indicadores i
      join public.sos_vinculos x on x.indicador_id = i.id
      join public.drive_archivos a on a.id = x.archivo_id
     where i.publicado
       and public.sos_validar_vinculo(x.archivo_id, x.col_valor, x.col_periodo, x.col_campus, x.filtro_col) is null
  ),
  base as (
    select v.id, v.resumen, f.n,
           case when jsonb_typeof(f.d -> 'datos' -> v.col_valor) = 'number' then (f.d -> 'datos' ->> v.col_valor)::numeric end as valor,
           nullif(btrim(f.d -> 'datos' ->> v.col_periodo), '') as periodo,
           (regexp_match(f.d -> 'datos' ->> v.col_periodo, '\m(\d{4})\M'))[1]::int as anio,
           case when v.col_campus is null then null
                when public.drive_sin_tildes(btrim(f.d -> 'datos' ->> v.col_campus)) in ('', 'institucional', 'universidad', 'todos', 'todas') then null
                else btrim(f.d -> 'datos' ->> v.col_campus) end as campus
      from v
      cross join lateral jsonb_array_elements(case when jsonb_typeof(v.contenido -> 'filas') = 'array' then v.contenido -> 'filas' else '[]'::jsonb end)
                 with ordinality as f(d, n)
     where jsonb_typeof(f.d -> 'datos' -> v.col_valor) = 'number'
       and (v.filtro_col is null or f.d -> 'datos' ->> v.filtro_col = v.filtro_valor)
  ),
  ok as (
    select * from base where anio between 1900 and 2100
  ),
  g as (
    select id, campus, anio,
           case max(resumen) when 'suma' then sum(valor) when 'ultimo' then (array_agg(valor order by n desc))[1] else avg(valor) end as valor,
           (array_agg(periodo order by n desc))[1] as periodo
      from ok group by id, campus, anio
  ),
  todos as (
    select o.id, null::text as campus, o.anio,
           case max(o.resumen) when 'suma' then sum(o.valor) when 'ultimo' then (array_agg(o.valor order by o.n desc))[1] else avg(o.valor) end as valor,
           (array_agg(o.periodo order by o.n desc))[1] as periodo
      from ok o
     where o.campus is not null
       and not exists (select 1 from g where g.id = o.id and g.anio = o.anio and g.campus is null)
     group by o.id, o.anio
  ),
  serie as (
    select id, jsonb_agg(jsonb_build_object('campus', campus, 'anio', anio, 'periodo', periodo, 'valor', round(valor, 4)) order by anio, campus nulls first) as filas
      from (select * from g union all select * from todos) s
     group by id
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', v.id, 'ods', v.ods, 'nombre', v.nombre, 'unidad', v.unidad, 'mejor', v.mejor, 'meta', v.meta,
             'tarjeta', v.tarjeta, 'decimales', v.decimales, 'nota', v.nota, 'resumen', v.resumen,
             'fuente', v.fuente, 'serie', s.filas)
           order by v.ods, v.position, v.id), '[]'::jsonb)
    from v join serie s on s.id = v.id;
$$;

revoke all on function public.sos_cifras_publicas() from public;
grant execute on function public.sos_cifras_publicas() to anon, authenticated, service_role;
comment on function public.sos_cifras_publicas() is
  'Indicadores publicados de Datos de Sostenibilidad con su serie agregada por campus y año, para el portal público.';

/**
 * [{id, nombre, seccion, orden, fuente, actualizado,
 *   config: {tipo, titulo, nota, x, series:[{clave,color,eje}], tamano, filaCalor, ejeX, ejeY, ejeY2, min, max, tendencia, rotular},
 *   columnas: [{clave, etiqueta, tipo}], filas: [{<clave>: valor}]}]
 * Solo gráficas publicadas que pasan sos_validar_grafica; solo las columnas que
 * la gráfica usa. Ordenadas por sección del Observatorio y orden.
 */
create or replace function public.sos_graficas_publicas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select a.id, a.nombre, a.contenido -> 'config' as cfg, pu.seccion, pu.orden,
           t.nombre as fuente, t.contenido as tabla, t.updated_at as actualizado,
           public.sos_columnas_grafica(a.contenido -> 'config') as usadas
      from public.sos_publicaciones pu
      join public.drive_archivos a on a.id = pu.archivo_id
      join public.drive_archivos t on t.id = public.sos_uuid(a.contenido ->> 'tabla_id')
     where pu.publicado
       and public.sos_validar_grafica(pu.archivo_id) is null
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', p.id, 'nombre', p.nombre, 'seccion', p.seccion, 'orden', p.orden,
             'fuente', p.fuente, 'actualizado', p.actualizado,
             'config', jsonb_strip_nulls(jsonb_build_object(
               'tipo', p.cfg -> 'tipo', 'titulo', p.cfg -> 'titulo', 'nota', p.cfg -> 'nota', 'x', p.cfg -> 'x',
               'series', p.cfg -> 'series', 'tamano', p.cfg -> 'tamano', 'filaCalor', p.cfg -> 'filaCalor',
               'ejeX', p.cfg -> 'ejeX', 'ejeY', p.cfg -> 'ejeY', 'ejeY2', p.cfg -> 'ejeY2',
               'min', p.cfg -> 'min', 'max', p.cfg -> 'max', 'tendencia', p.cfg -> 'tendencia', 'rotular', p.cfg -> 'rotular')),
             'columnas', (select coalesce(jsonb_agg(jsonb_build_object('clave', c ->> 'clave', 'etiqueta', c ->> 'etiqueta', 'tipo', c ->> 'tipo')), '[]'::jsonb)
                            from jsonb_array_elements(case when jsonb_typeof(p.tabla -> 'columnas') = 'array' then p.tabla -> 'columnas' else '[]'::jsonb end) c
                           where c ->> 'clave' = any (p.usadas)),
             'filas', public.sos_filas_de(p.tabla, p.usadas))
           order by case p.seccion when 'panorama' then 1 when 'tendencia' then 2 when 'composicion' then 3 when 'territorio' then 4 else 5 end, p.orden, p.nombre), '[]'::jsonb)
    from p;
$$;

revoke all on function public.sos_graficas_publicas() from public;
grant execute on function public.sos_graficas_publicas() to anon, authenticated, service_role;
comment on function public.sos_graficas_publicas() is
  'Gráficas publicadas de Datos de Sostenibilidad con su configuración mínima y solo las columnas que usan, para el portal público.';

-- Ayudas internas: las llaman las políticas y las funciones (corren con los privilegios del dueño).
do $$
declare
  f text;
begin
  foreach f in array array[
    'sos_entra()', 'sos_unidad_abierta(uuid)', 'sos_es_admin_unidad()', 'sos_rango_archivo(uuid)', 'sos_puede_vincular(text, uuid)',
    'sos_validar_vinculo(uuid, text, text, text, text)', 'sos_validar_grafica(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
