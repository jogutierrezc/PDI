-- =============================================================================
-- PDI · 0177 · Datos de Sostenibilidad
--
-- La réplica de Programas en Cifras (0164) para los indicadores de
-- sostenibilidad de UDES Sostenible. Dos funciones, como en aquel:
--
--   1. ASIGNACIÓN A OFICINAS. No se trabaja por pareja programa × campus sino
--      por oficina (units: UDES Verde, Planeación Institucional…). Quien
--      pertenece a `ds_miembros` es gestor o colaborador de una oficina y
--      edita sus libros. Planeación ve todo y no edita nada, como allí.
--
--   2. LIBROS DE DATOS CONECTADOS A INDICADORES. Una oficina crea libros
--      (tablas o listas con columnas tipadas, en carpetas, al estilo OneDrive)
--      y los conecta a un indicador de sostenibilidad con un mapa: qué columna
--      del libro da el VALOR del indicador, cuál el PERIODO, el CAMPUS, la
--      FUENTE y la EVIDENCIA. Los slots son fijos (los define esta migración y
--      lib/indicadores.ts los espeja): el indicador es a quien se responde, el
--      slot es qué se responde de él.
--
-- Qué NO se replica de 0164 y por qué: ventanas de observación, periodos
-- cerrados y emisión (eran del trámite del CNA), estructura bloqueada (los
-- cuadros del CNA la traían de serie; aquí los libros son libres) y el
-- catálogo de destinos CNA/SNIES (aquí el catálogo son los indicadores).
--
-- La validación, los estados (borrador → listo), la reserva de solo lectura y
-- el historial sí se replican con las mismas reglas. `pc_*` documenta el
-- porqué de cada pieza; aquí no se repite.
--
-- Requiere 0057 (units), 0026 (set_updated_at) y los helpers de rol que usa
-- 0164 (current_role, has_role_at_least). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las tablas
-- -----------------------------------------------------------------------------

create table if not exists public.ds_miembros (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  oficina_id uuid not null references public.units (id) on delete cascade,
  -- gestor: además nombra colaboradores de su oficina.
  rol        text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint ds_miembros_rol check (rol in ('gestor', 'colaborador')),
  constraint ds_miembros_unico unique (user_id, oficina_id)
);

create index if not exists ds_miembros_oficina_idx on public.ds_miembros (oficina_id);

comment on table public.ds_miembros is
  'Quién trabaja en Datos de Sostenibilidad y en qué oficina: gestor (dirige y reparte) o colaborador (aporta libros).';

-- El catálogo de indicadores de sostenibilidad. Lo siembra esta migración con
-- los del ODS 13 (los del marco THE que ya están definidos en
-- src/modules/sostenible/ods-data.ts); el resto los añade la administración
-- cuando UDES Verde y Planeación definan el marco completo.
create table if not exists public.ds_indicadores (
  id          text primary key,
  ods         smallint not null,
  nombre      text not null,
  descripcion text not null default '',
  unidad      text not null default '',
  position    smallint not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint ds_indicadores_ods check (ods between 1 and 17)
);

comment on table public.ds_indicadores is
  'Indicadores de sostenibilidad a los que un libro puede conectarse. Espejo: src/modules/datos-sostenibilidad/lib/indicadores.ts.';

create table if not exists public.ds_carpetas (
  id         uuid primary key default gen_random_uuid(),
  oficina_id uuid references public.units (id) on delete cascade,
  clave      text not null,
  nombre     text not null,
  -- Las fijas no son de una oficina: las ve todo el módulo.
  fija       boolean not null default false,
  constraint ds_carpetas_fija_oficina check (fija or oficina_id is not null)
);

create unique index if not exists ds_carpetas_unicas on public.ds_carpetas (coalesce(oficina_id, '00000000-0000-0000-0000-000000000000'::uuid), clave);

comment on table public.ds_carpetas is
  'Carpetas de libros: dos fijas (indicadores, trabajo) y las que cree cada oficina.';

create table if not exists public.ds_libros (
  id         uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references public.units (id) on delete cascade,
  carpeta_id uuid not null references public.ds_carpetas (id),
  nombre     text not null,
  -- tabla: filas × columnas; lista: una fila con sus campos.
  tipo       text not null default 'tabla',
  estado     text not null default 'borrador',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  listo_en   timestamptz,
  listo_por  uuid,
  constraint ds_libros_tipo check (tipo in ('tabla', 'lista')),
  constraint ds_libros_estado check (estado in ('borrador', 'listo'))
);

create index if not exists ds_libros_oficina_idx on public.ds_libros (oficina_id, carpeta_id);

drop trigger if exists ds_libros_set_updated_at on public.ds_libros;
create trigger ds_libros_set_updated_at before update on public.ds_libros
  for each row execute function public.set_updated_at();

comment on table public.ds_libros is
  'Libro de datos de una oficina: tabla o lista con columnas tipadas, como los archivos de Programas en Cifras.';

create table if not exists public.ds_columnas (
  id          uuid primary key default gen_random_uuid(),
  libro_id    uuid not null references public.ds_libros (id) on delete cascade,
  clave       text not null,
  etiqueta    text not null,
  tipo        text not null default 'texto',
  obligatorio boolean not null default false,
  opciones    text[] not null default '{}',
  -- Origen de sistema, p. ej. el Warehouse: el cliente no la escribe.
  solo_lectura text,
  posterior_a text,
  orden       smallint not null default 0,
  constraint ds_columnas_tipo check (tipo in ('texto', 'numero', 'fecha', 'lista', 'porcentaje')),
  constraint ds_columnas_clave unique (libro_id, clave),
  constraint ds_columnas_posterior_a check (posterior_a is null or tipo = 'fecha')
);

create index if not exists ds_columnas_libro_idx on public.ds_columnas (libro_id, orden);

create table if not exists public.ds_filas (
  id         uuid primary key default gen_random_uuid(),
  libro_id   uuid not null references public.ds_libros (id) on delete cascade,
  oficina_id uuid,
  datos      jsonb not null default '{}',
  orden      integer not null,
  origen     text not null default 'manual',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint ds_filas_orden unique (libro_id, orden),
  constraint ds_filas_origen check (origen in ('manual', 'excel', 'sistema'))
);

create index if not exists ds_filas_libro_idx on public.ds_filas (libro_id, orden);

drop trigger if exists ds_filas_set_updated_at on public.ds_filas;
create trigger ds_filas_set_updated_at before update on public.ds_filas
  for each row execute function public.set_updated_at();

-- La conexión libro × indicador: qué slot del indicador sale de qué columna.
create table if not exists public.ds_respuestas (
  id            uuid primary key default gen_random_uuid(),
  libro_id      uuid not null references public.ds_libros (id) on delete cascade,
  indicador_id  text not null references public.ds_indicadores (id) on delete cascade,
  mapa          jsonb not null default '{}',
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ds_respuestas_unicas unique (libro_id, indicador_id),
  constraint ds_respuestas_mapa check (jsonb_typeof(mapa) = 'object')
);

drop trigger if exists ds_respuestas_set_updated_at on public.ds_respuestas;
create trigger ds_respuestas_set_updated_at before update on public.ds_respuestas
  for each row execute function public.set_updated_at();

comment on table public.ds_respuestas is
  'Conexión de un libro a un indicador: {slot: clave de la columna}. Slots fijos: valor, periodo, campus, fuente, evidencia.';

create table if not exists public.ds_actividad (
  id         uuid primary key default gen_random_uuid(),
  oficina_id uuid not null,
  libro_id   uuid,
  accion     text not null,
  detalle    jsonb not null default '{}',
  user_id    uuid default auth.uid(),
  at         timestamptz not null default now()
);

create index if not exists ds_actividad_oficina_idx on public.ds_actividad (oficina_id, at desc);

-- -----------------------------------------------------------------------------
-- 2. Funciones de permiso (security definer: leen sin pasar por RLS)
-- -----------------------------------------------------------------------------

create or replace function public.ds_es_planeacion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() is not null and public.has_role_at_least('planeacion');
$$;

/** Papel frente a una oficina: gestor | colaborador | admin (editan), planeacion (solo lee) o nulo. */
create or replace function public.ds_rol_en(p_oficina uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_role() is null then null
    when exists (select 1 from public.ds_miembros m
                  where m.user_id = auth.uid() and m.oficina_id = p_oficina and m.rol = 'gestor') then 'gestor'
    when exists (select 1 from public.ds_miembros m
                  where m.user_id = auth.uid() and m.oficina_id = p_oficina and m.rol = 'colaborador') then 'colaborador'
    -- La administración (y los roles de acceso con base administrador, como el
    -- de UDES Verde) dirige el módulo: crea, edita y nombra en cualquier oficina.
    when public.current_role() = 'admin' then 'admin'
    when public.has_role_at_least('planeacion') then 'planeacion'
    else null
  end;
$$;

create or replace function public.ds_puede_ver(p_oficina uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.ds_rol_en(p_oficina) is not null;
$$;

create or replace function public.ds_puede_editar(p_oficina uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.ds_rol_en(p_oficina) in ('gestor', 'colaborador', 'admin'), false);
$$;

/** ¿Trabaja en el módulo (alguna oficina) o es de Planeación? Abre el catálogo y las carpetas fijas. */
create or replace function public.ds_es_participante()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() is not null
     and (public.has_role_at_least('planeacion')
          or exists (select 1 from public.ds_miembros m where m.user_id = auth.uid()));
$$;

/** ¿Una función interna está escribiendo (crear libro, marcar listo…)? */
create or replace function public.ds_interno()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('ds.interno', true), '') = 'si';
$$;

/**
 * Mis papeles, para la pantalla: {planeacion, oficinas: [{oficina_id, oficina,
 * codigo, rol}]}. Gestores y colaboradores ven sus oficinas; Planeación y la
 * administración, todas las unidades del organigrama.
 */
create or replace function public.ds_yo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'planeacion', public.ds_es_planeacion(),
    'oficinas', coalesce((
      select jsonb_agg(t.x order by t.x ->> 'oficina')
        from (
          select jsonb_build_object(
                   'oficina_id', u.id, 'oficina', u.name, 'codigo', u.code,
                   'rol', coalesce(m.rol, case when public.current_role() = 'admin' then 'admin' else 'planeacion' end)) as x
            from public.units u
            left join public.ds_miembros m
              on m.oficina_id = u.id and m.user_id = auth.uid()
           where public.current_role() is not null
             and (m.id is not null
                  or (public.has_role_at_least('planeacion')
                      and exists (select 1 from public.units o where o.id = u.id)))
        ) t), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Validación (espejo de lib/validacion.ts de Programas en Cifras)
-- -----------------------------------------------------------------------------

create or replace function public.ds_fecha(v text)
returns date
language plpgsql
immutable
as $$
begin
  if v is null or btrim(v) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return btrim(v)::date;
exception when others then
  return null;
end;
$$;

create or replace function public.ds_error_valor(p_tipo text, p_opciones text[], p_obligatorio boolean, p_valor jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v text;
  n numeric;
begin
  if p_valor is null or jsonb_typeof(p_valor) = 'null' then
    v := '';
  elsif jsonb_typeof(p_valor) in ('string', 'number') then
    v := btrim(p_valor #>> '{}');
  else
    return 'Valor no válido';
  end if;
  if v = '' then
    return case when p_obligatorio then 'Obligatorio' else null end;
  end if;
  if p_tipo = 'numero' then
    if v !~ '^[0-9]+([.,][0-9]+)?$' then
      return 'Escriba un número';
    end if;
  elsif p_tipo = 'porcentaje' then
    if v !~ '^[0-9]+([.,][0-9]+)?$' then
      return 'Entre 0 y 100';
    end if;
    n := replace(v, ',', '.')::numeric;
    if n > 100 then
      return 'Entre 0 y 100';
    end if;
  elsif p_tipo = 'fecha' then
    if public.ds_fecha(v) is null then
      return 'Use AAAA-MM-DD';
    end if;
  elsif p_tipo = 'lista' then
    if cardinality(p_opciones) > 0 and not (v = any (p_opciones)) then
      return 'Elija de la lista';
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.ds_validar_forma(p_libro uuid, p_datos jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_par record;
  v_col public.ds_columnas;
begin
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    return 'Los datos de la fila deben ser un objeto.';
  end if;
  for v_par in select key, value from jsonb_each(p_datos) loop
    select * into v_col from public.ds_columnas c where c.libro_id = p_libro and c.clave = v_par.key;
    if not found then
      return format('La columna «%s» no existe en este libro.', v_par.key);
    end if;
    if jsonb_typeof(v_par.value) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_par.value) not in ('string', 'number') then
      return format('«%s»: el valor debe ser texto o número.', v_col.etiqueta);
    end if;
    if char_length(v_par.value #>> '{}') > 4000 then
      return format('«%s»: el texto es demasiado largo (máximo 4000 caracteres).', v_col.etiqueta);
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.ds_errores_internos(p_libro uuid)
returns table (fila_id uuid, orden integer, clave text, mensaje text)
language sql
stable
security definer
set search_path = public
as $$
  select x.fila_id, x.orden, x.clave, x.mensaje
    from (
      select f.id as fila_id, f.orden, c.clave,
             coalesce(
               public.ds_error_valor(c.tipo, c.opciones, c.obligatorio, f.datos -> c.clave),
               case when c.tipo = 'fecha' and c.posterior_a is not null
                         and public.ds_fecha(f.datos ->> c.clave) is not null
                         and public.ds_fecha(f.datos ->> c.posterior_a) is not null
                         and public.ds_fecha(f.datos ->> c.clave) < public.ds_fecha(f.datos ->> c.posterior_a)
                    then 'Es anterior a «' || coalesce((select p.etiqueta from public.ds_columnas p
                                                          where p.libro_id = c.libro_id and p.clave = c.posterior_a), c.posterior_a) || '»'
               end) as mensaje
        from public.ds_filas f
        join public.ds_columnas c on c.libro_id = f.libro_id
       where f.libro_id = p_libro and c.solo_lectura is null
    ) x
   where x.mensaje is not null
   order by x.orden, x.clave;
$$;

create or replace function public.ds_errores_libro(p_libro uuid)
returns table (fila_id uuid, orden integer, clave text, mensaje text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.ds_libros l where l.id = p_libro and public.ds_puede_ver(l.oficina_id)) then
    raise exception 'No tiene acceso a este libro.' using errcode = '42501';
  end if;
  return query select e.fila_id, e.orden, e.clave, e.mensaje from public.ds_errores_internos(p_libro) e;
end;
$$;

create or replace function public.ds_resumen_libros(p_oficina uuid)
returns table (libro_id uuid, filas bigint, errores bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ds_puede_ver(p_oficina) then
    raise exception 'No tiene acceso a esta oficina.' using errcode = '42501';
  end if;
  return query
    select l.id,
           (select count(*) from public.ds_filas f where f.libro_id = l.id),
           (select count(*) from public.ds_errores_internos(l.id))
      from public.ds_libros l
     where l.oficina_id = p_oficina;
end;
$$;

create or replace function public.ds_conservar_ro(p_libro uuid, p_viejo jsonb, p_nuevo jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select (p_nuevo - coalesce((select array_agg(c.clave) from public.ds_columnas c where c.libro_id = p_libro and c.solo_lectura is not null), '{}'::text[]))
         || coalesce((select jsonb_object_agg(c.clave, p_viejo -> c.clave)
                        from public.ds_columnas c
                       where c.libro_id = p_libro and c.solo_lectura is not null and p_viejo ? c.clave), '{}'::jsonb);
$$;

/** Interna: registra en el historial. */
create or replace function public.ds_registrar(p_oficina uuid, p_libro uuid, p_accion text, p_detalle jsonb default '{}')
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ds_actividad (oficina_id, libro_id, accion, detalle, user_id)
  values (p_oficina, p_libro, p_accion, coalesce(p_detalle, '{}'::jsonb), auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- 4. Los guards (lo que la base exige, no la pantalla)
-- -----------------------------------------------------------------------------

create or replace function public.ds_miembros_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    v_rol := public.ds_rol_en(old.oficina_id);
    if v_rol not in ('gestor') and public.current_role() <> 'admin' then
      raise exception 'Los accesos de una oficina los reparte su gestor.' using errcode = '42501';
    end if;
    return old;
  end if;
  v_rol := public.ds_rol_en(new.oficina_id);
  if v_rol not in ('gestor') and public.current_role() <> 'admin' then
    raise exception 'Los accesos de una oficina los reparte su gestor.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists ds_miembros_guard_trg on public.ds_miembros;
create trigger ds_miembros_guard_trg before insert or update or delete on public.ds_miembros
  for each row execute function public.ds_miembros_guard();

create or replace function public.ds_libros_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oficina uuid;
  v_carpeta public.ds_carpetas;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    v_oficina := old.oficina_id;
  else
    v_oficina := new.oficina_id;
  end if;
  if not public.ds_puede_editar(v_oficina) then
    raise exception 'La oficina o la administración crea y edita los libros.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if old.estado = 'listo' then
      perform public.ds_registrar(old.oficina_id, old.id, 'libro_eliminado', jsonb_build_object('nombre', old.nombre));
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.oficina_id is distinct from old.oficina_id then
      raise exception 'Un libro no cambia de oficina: expórtelo y créelo donde va.' using errcode = '42501';
    end if;
    if new.tipo is distinct from old.tipo then
      raise exception 'Un libro no cambia de tipo después de creado.' using errcode = '42501';
    end if;
    if new.estado is distinct from old.estado and not public.ds_interno() then
      raise exception 'El estado se cambia con la operación de marcar listo.' using errcode = '42501';
    end if;
  end if;
  select * into v_carpeta from public.ds_carpetas c where c.id = new.carpeta_id;
  if not found or (not v_carpeta.fija and v_carpeta.oficina_id is distinct from new.oficina_id) then
    raise exception 'La carpeta no es de esta oficina.' using errcode = '42501';
  end if;
  if btrim(new.nombre) = '' then
    raise exception 'El libro necesita un nombre.' using errcode = '23514';
  end if;
  new.nombre := btrim(new.nombre);
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    perform public.ds_registrar(new.oficina_id, new.id, 'libro_creado', jsonb_build_object('nombre', new.nombre, 'tipo', new.tipo));
  end if;
  return new;
end;
$$;

drop trigger if exists ds_libros_guard_trg on public.ds_libros;
create trigger ds_libros_guard_trg before insert or update or delete on public.ds_libros
  for each row execute function public.ds_libros_guard();

/** Devuelve libros a borrador: se tocó lo que solo un borrador tolera. */
create or replace function public.ds_tocar_libros(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('ds.interno', true), '');
begin
  perform set_config('ds.interno', 'si', true);
  update public.ds_libros l
     set estado = 'borrador', listo_en = null, listo_por = null
   where l.estado = 'listo' and l.id = any (coalesce(p_ids, '{}'::uuid[]));
  perform set_config('ds.interno', v_prev, true);
end;
$$;

create or replace function public.ds_columnas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_libro public.ds_libros;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    select * into v_libro from public.ds_libros l where l.id = old.libro_id;
  else
    select * into v_libro from public.ds_libros l where l.id = new.libro_id;
  end if;
  if not found then
    raise exception 'El libro no existe.' using errcode = 'P0002';
  end if;
  if not public.ds_puede_editar(v_libro.oficina_id) then
    raise exception 'La oficina o la administración edita las columnas.' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then
    if btrim(new.clave) = '' or btrim(new.clave) !~ '^[a-z0-9_]+$' then
      raise exception 'La clave de una columna es minúsculas, números y guion bajo.' using errcode = '23514';
    end if;
    if btrim(new.etiqueta) = '' then
      raise exception 'La columna necesita una etiqueta.' using errcode = '23514';
    end if;
    if new.tipo = 'lista' and new.obligatorio and cardinality(new.opciones) = 0 then
      raise exception 'Una lista obligatoria necesita sus opciones.' using errcode = '23514';
    end if;
    if new.posterior_a = new.clave then
      raise exception 'Una fecha no se sigue a sí misma.' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists ds_columnas_guard_trg on public.ds_columnas;
create trigger ds_columnas_guard_trg before insert or update or delete on public.ds_columnas
  for each row execute function public.ds_columnas_guard();

/**
 * Al cambiar las columnas: el libro vuelve a borrador y, si una se quitó, se
 * limpian los valores de las filas y los mapas que la usaban (fila, como en 0164).
 */
create or replace function public.ds_columnas_despues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_libro uuid := case when tg_op = 'DELETE' then old.libro_id else new.libro_id end;
begin
  if pg_trigger_depth() > 1 and tg_op = 'DELETE' then
    return null;
  end if;
  -- El libro ya no existe (se borró y arrastró sus columnas): nada que tocar.
  if not exists (select 1 from public.ds_libros l where l.id = v_libro) then
    return null;
  end if;
  perform public.ds_tocar_libros(array[v_libro]);
  if tg_op = 'DELETE' then
    -- Una conexión que perdía su columna de valor ya no es una conexión.
    delete from public.ds_respuestas r
     where r.libro_id = old.libro_id
       and r.mapa ->> 'valor' = old.clave;
    update public.ds_filas f set datos = f.datos - old.clave, updated_at = now() where f.libro_id = old.libro_id and f.datos ? old.clave;
    update public.ds_respuestas r
       set mapa = coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(r.mapa) e where e.value #>> '{}' <> old.clave), '{}'::jsonb),
           updated_at = now()
     where r.libro_id = old.libro_id and exists (select 1 from jsonb_each(r.mapa) e where e.value #>> '{}' = old.clave);
    if not public.ds_interno() and auth.uid() is not null then
      perform public.ds_registrar((select l.oficina_id from public.ds_libros l where l.id = v_libro), v_libro, 'estructura',
        jsonb_build_object('operacion', lower(tg_op), 'clave', old.clave));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists ds_columnas_despues_trg on public.ds_columnas;
create trigger ds_columnas_despues_trg after insert or update or delete on public.ds_columnas
  for each row execute function public.ds_columnas_despues();

-- El libro vuelve a borrador cuando sus filas cambian (tablas de transición).
create or replace function public.ds_filas_despues_nuevas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ds_tocar_libros(array(select distinct n.libro_id from nuevas n));
  return null;
end;
$$;

create or replace function public.ds_filas_despues_viejas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ds_tocar_libros(array(select distinct v.libro_id from viejas v));
  return null;
end;
$$;

drop trigger if exists ds_filas_despues_ins_trg on public.ds_filas;
drop trigger if exists ds_filas_despues_upd_trg on public.ds_filas;
drop trigger if exists ds_filas_despues_del_trg on public.ds_filas;
create trigger ds_filas_despues_ins_trg after insert on public.ds_filas
  referencing new table as nuevas for each statement execute function public.ds_filas_despues_nuevas();
create trigger ds_filas_despues_upd_trg after update on public.ds_filas
  referencing new table as nuevas for each statement execute function public.ds_filas_despues_nuevas();
create trigger ds_filas_despues_del_trg after delete on public.ds_filas
  referencing old table as viejas for each statement execute function public.ds_filas_despues_viejas();

create or replace function public.ds_filas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f public.ds_filas;
  v_l public.ds_libros;
  v_rol text;
  v_error text;
  v_ro record;
begin
  if tg_op = 'DELETE' then
    v_f := old;
  else
    v_f := new;
  end if;
  if auth.uid() is null then
    return v_f;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  select * into v_l from public.ds_libros l where l.id = v_f.libro_id;
  if not found then
    raise exception 'El libro no existe.' using errcode = 'P0002';
  end if;
  v_rol := public.ds_rol_en(v_l.oficina_id);
  if v_rol is null then
    raise exception 'No tiene acceso a esta oficina.' using errcode = '42501';
  end if;
  if v_rol = 'planeacion' then
    raise exception 'Planeación solo observa: los libros los edita la oficina.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.libro_id is distinct from old.libro_id then
    raise exception 'Una fila no cambia de libro: bórrela y créela donde va.' using errcode = '42501';
  end if;

  new.oficina_id := v_l.oficina_id;

  v_error := public.ds_validar_forma(new.libro_id, new.datos);
  if v_error is not null then
    raise exception '%', v_error using errcode = '23514';
  end if;

  if not public.ds_interno() then
    for v_ro in select c.clave, c.etiqueta, c.solo_lectura from public.ds_columnas c
                 where c.libro_id = new.libro_id and c.solo_lectura is not null loop
      if tg_op = 'INSERT' then
        if btrim(coalesce(new.datos ->> v_ro.clave, '')) <> '' then
          raise exception '«%» viene del % y no se edita aquí.', v_ro.etiqueta, v_ro.solo_lectura using errcode = '42501';
        end if;
      elsif (new.datos ->> v_ro.clave) is distinct from (old.datos ->> v_ro.clave) then
        raise exception '«%» viene del % y no se edita aquí.', v_ro.etiqueta, v_ro.solo_lectura using errcode = '42501';
      end if;
    end loop;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ds_filas_guard_trg on public.ds_filas;
create trigger ds_filas_guard_trg before insert or update or delete on public.ds_filas
  for each row execute function public.ds_filas_guard();

/** Los slots a los que un mapa puede responder: qué se contesta de un indicador. */
create or replace function public.ds_slots()
returns text[]
language sql
immutable
as $$
  select array['valor', 'periodo', 'campus', 'fuente', 'evidencia'];
$$;

create or replace function public.ds_respuestas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.ds_respuestas;
  v_l public.ds_libros;
  v_rol text;
  v_par record;
  v_col public.ds_columnas;
begin
  if tg_op = 'DELETE' then
    v_r := old;
  else
    v_r := new;
  end if;
  if auth.uid() is null then
    return v_r;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  select * into v_l from public.ds_libros l where l.id = v_r.libro_id;
  if not found then
    raise exception 'El libro no existe.' using errcode = 'P0002';
  end if;
  v_rol := public.ds_rol_en(v_l.oficina_id);
  if v_rol is null then
    raise exception 'No tiene acceso a esta oficina.' using errcode = '42501';
  end if;
  if v_rol = 'planeacion' then
    raise exception 'Planeación solo observa: las conexiones las edita la oficina.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.libro_id is distinct from old.libro_id or new.indicador_id is distinct from old.indicador_id) then
    raise exception 'Una conexión no cambia de libro ni de indicador.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ds_indicadores i where i.id = new.indicador_id) then
    raise exception 'El indicador no existe.' using errcode = 'P0002';
  end if;

  for v_par in select key, value from jsonb_each(new.mapa) loop
    if jsonb_typeof(v_par.value) <> 'string' then
      raise exception 'El mapa une columnas por su clave (texto).' using errcode = '23514';
    end if;
    if not (v_par.key = any (public.ds_slots())) then
      raise exception '«%» no es un slot del indicador: %.', v_par.key, array_to_string(public.ds_slots(), ', ') using errcode = '23514';
    end if;
    select * into v_col from public.ds_columnas c where c.libro_id = new.libro_id and c.clave = v_par.value #>> '{}';
    if not found then
      raise exception 'La columna «%» no existe en este libro.', v_par.value #>> '{}' using errcode = '23514';
    end if;
    if v_par.key = 'valor' and v_col.tipo not in ('numero', 'porcentaje') then
      raise exception 'El valor de un indicador sale de una columna de número o porcentaje.' using errcode = '23514';
    end if;
  end loop;
  if not (new.mapa ? 'valor') then
    raise exception 'La conexión necesita el slot «valor»: qué columna da la cifra del indicador.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists ds_respuestas_guard_trg on public.ds_respuestas;
create trigger ds_respuestas_guard_trg before insert or update or delete on public.ds_respuestas
  for each row execute function public.ds_respuestas_guard();

-- -----------------------------------------------------------------------------
-- 5. Operaciones de escritura (RPC)
-- -----------------------------------------------------------------------------

create or replace function public.ds_crear_libro(
  p_oficina uuid, p_carpeta uuid, p_nombre text, p_tipo text default 'tabla',
  p_columnas jsonb default '[]', p_filas jsonb default '[]', p_respuestas jsonb default '{}'
)
returns public.ds_libros
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('ds.interno', true), '');
  v_libro public.ds_libros;
begin
  if not public.ds_puede_editar(p_oficina) then
    raise exception 'La oficina o la administración crea los libros.' using errcode = '42501';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 20000 then
    raise exception 'Las filas deben llegar como una lista de hasta 20.000.' using errcode = '22023';
  end if;
  if p_columnas is null or jsonb_typeof(p_columnas) <> 'array' or jsonb_array_length(p_columnas) = 0 then
    raise exception 'Un libro necesita al menos una columna.' using errcode = '22023';
  end if;

  insert into public.ds_libros (oficina_id, carpeta_id, nombre, tipo)
  values (p_oficina, p_carpeta, btrim(p_nombre), coalesce(p_tipo, 'tabla'))
  returning * into v_libro;

  -- Las columnas se crean con permiso interno: aún no hay filas que valide.
  perform set_config('ds.interno', 'si', true);
  insert into public.ds_columnas (libro_id, clave, etiqueta, tipo, obligatorio, opciones, posterior_a, orden)
  select v_libro.id, x.clave, x.etiqueta, coalesce(x.tipo, 'texto'), coalesce(x.obligatorio, false), coalesce(x.opciones, '{}'::text[]),
         x.posterior_a, coalesce(x.orden, (row_number() over ())::integer)
    from jsonb_to_recordset(p_columnas) as x(clave text, etiqueta text, tipo text, obligatorio boolean, opciones text[], posterior_a text, orden integer);
  perform set_config('ds.interno', v_prev, true);

  if jsonb_array_length(p_filas) > 0 then
    insert into public.ds_filas (libro_id, oficina_id, datos, orden, origen)
    select v_libro.id, p_oficina, coalesce(x.v -> 'datos', '{}'::jsonb), coalesce((x.v ->> 'orden')::integer, (x.n - 1)::integer), 'excel'
      from jsonb_array_elements(p_filas) with ordinality x(v, n);
  end if;

  -- Conexiones directas a indicadores, si vinieron en la misma llamada.
  if jsonb_typeof(coalesce(p_respuestas, '{}'::jsonb)) <> 'object' then
    raise exception 'Las conexiones llegan como {indicador: {slot: columna}}.' using errcode = '22023';
  end if;
  perform set_config('ds.interno', 'si', true);
  insert into public.ds_respuestas (libro_id, indicador_id, mapa)
  select v_libro.id, x.indicador, x.mapa
    from jsonb_each(p_respuestas) x(indicador, mapa)
   where jsonb_typeof(x.mapa) = 'object' and x.mapa ? 'valor';
  perform set_config('ds.interno', v_prev, true);

  select * into v_libro from public.ds_libros l where l.id = v_libro.id;
  return v_libro;
end;
$$;

create or replace function public.ds_guardar_filas(
  p_libro uuid, p_filas jsonb, p_borrar uuid[] default null, p_reemplazar boolean default false, p_origen text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.ds_libros;
  v_borradas integer := 0;
  v_insertadas integer := 0;
  v_actualizadas integer := 0;
  v_base integer;
begin
  select * into v_l from public.ds_libros l where l.id = p_libro;
  if not found then
    raise exception 'El libro no existe.' using errcode = 'P0002';
  end if;
  if not public.ds_puede_editar(v_l.oficina_id) then
    raise exception 'La oficina o la administración edita sus libros.' using errcode = '42501';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'Las filas deben llegar como una lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > 20000 then
    raise exception 'Son % filas: el máximo por carga es 20.000.', jsonb_array_length(p_filas) using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_filas) x(v) where jsonb_typeof(x.v) <> 'object') then
    raise exception 'Cada fila lleva su objeto datos.' using errcode = '22023';
  end if;

  if p_reemplazar then
    delete from public.ds_filas f where f.libro_id = p_libro;
    get diagnostics v_borradas = row_count;
  elsif p_borrar is not null and cardinality(p_borrar) > 0 then
    delete from public.ds_filas f where f.libro_id = p_libro and f.id = any (p_borrar);
    get diagnostics v_borradas = row_count;
  end if;

  update public.ds_filas f
     set datos = public.ds_conservar_ro(p_libro, f.datos, coalesce(x.v -> 'datos', '{}'::jsonb)),
         orden = coalesce((x.v ->> 'orden')::integer, f.orden)
    from jsonb_array_elements(p_filas) x(v)
   where nullif(x.v ->> 'id', '') is not null
     and f.id = (x.v ->> 'id')::uuid
     and f.libro_id = p_libro;
  get diagnostics v_actualizadas = row_count;

  select coalesce(max(f.orden), -1) + 1 into v_base from public.ds_filas f where f.libro_id = p_libro;
  insert into public.ds_filas (libro_id, oficina_id, datos, orden, origen)
  select p_libro, v_l.oficina_id, coalesce(x.v -> 'datos', '{}'::jsonb),
         coalesce((x.v ->> 'orden')::integer, v_base + (x.n - 1)::integer),
         case when p_origen = 'excel' then 'excel' else 'manual' end
    from jsonb_array_elements(p_filas) with ordinality x(v, n)
   where nullif(x.v ->> 'id', '') is null;
  get diagnostics v_insertadas = row_count;

  if v_insertadas + v_actualizadas + v_borradas > 0 then
    perform public.ds_registrar(v_l.oficina_id, p_libro, 'filas',
      jsonb_build_object('insertadas', v_insertadas, 'actualizadas', v_actualizadas, 'borradas', v_borradas, 'origen', p_origen));
  end if;
  return jsonb_build_object('insertadas', v_insertadas, 'actualizadas', v_actualizadas, 'borradas', v_borradas);
end;
$$;

create or replace function public.ds_marcar_listo(p_libro uuid, p_listo boolean)
returns public.ds_libros
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('ds.interno', true), '');
  v_l public.ds_libros;
  v_errores integer;
begin
  select * into v_l from public.ds_libros l where l.id = p_libro;
  if not found then
    raise exception 'El libro no existe.' using errcode = 'P0002';
  end if;
  if not public.ds_puede_editar(v_l.oficina_id) then
    raise exception 'La oficina o la administración marca los libros.' using errcode = '42501';
  end if;
  if p_listo then
    select count(*) into v_errores from public.ds_errores_internos(p_libro);
    if v_errores > 0 then
      raise exception 'El libro tiene % celda(s) con error: corríjalas antes de marcarlo como listo.', v_errores using errcode = '23514';
    end if;
  end if;
  if (v_l.estado = 'listo') = p_listo then
    return v_l;
  end if;

  perform set_config('ds.interno', 'si', true);
  update public.ds_libros l
     set estado = case when p_listo then 'listo' else 'borrador' end,
         listo_en = case when p_listo then now() else null end,
         listo_por = case when p_listo then auth.uid() else null end
   where l.id = p_libro
  returning * into v_l;
  perform set_config('ds.interno', v_prev, true);

  perform public.ds_registrar(v_l.oficina_id, p_libro, 'estado', jsonb_build_object('a', v_l.estado, 'nombre', v_l.nombre));
  return v_l;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------

alter table public.ds_miembros     enable row level security;
alter table public.ds_indicadores  enable row level security;
alter table public.ds_carpetas     enable row level security;
alter table public.ds_libros       enable row level security;
alter table public.ds_columnas     enable row level security;
alter table public.ds_filas        enable row level security;
alter table public.ds_respuestas   enable row level security;
alter table public.ds_actividad    enable row level security;

-- El catálogo lo lee quien pertenece al módulo; lo mantiene la administración.
drop policy if exists ds_indicadores_select on public.ds_indicadores;
create policy ds_indicadores_select on public.ds_indicadores
  for select using (public.ds_es_participante());
drop policy if exists ds_indicadores_admin on public.ds_indicadores;
create policy ds_indicadores_admin on public.ds_indicadores
  for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- Las carpetas fijas las ve quien pertenece al módulo; las de una oficina, quien la ve.
drop policy if exists ds_carpetas_select on public.ds_carpetas;
create policy ds_carpetas_select on public.ds_carpetas
  for select using (public.ds_es_participante() and (fija or (oficina_id is not null and public.ds_puede_ver(oficina_id))));
drop policy if exists ds_carpetas_write on public.ds_carpetas;
create policy ds_carpetas_write on public.ds_carpetas
  for all to authenticated using (oficina_id is not null and public.ds_puede_editar(oficina_id)) with check (oficina_id is not null and public.ds_puede_editar(oficina_id));

drop policy if exists ds_libros_select on public.ds_libros;
create policy ds_libros_select on public.ds_libros
  for select using (public.ds_puede_ver(oficina_id));
drop policy if exists ds_libros_write on public.ds_libros;
create policy ds_libros_write on public.ds_libros
  for all to authenticated using (public.ds_puede_editar(oficina_id)) with check (public.ds_puede_editar(oficina_id));

drop policy if exists ds_columnas_select on public.ds_columnas;
create policy ds_columnas_select on public.ds_columnas
  for select using (exists (select 1 from public.ds_libros l where l.id = ds_columnas.libro_id and public.ds_puede_ver(l.oficina_id)));
drop policy if exists ds_columnas_write on public.ds_columnas;
create policy ds_columnas_write on public.ds_columnas
  for all to authenticated using (exists (select 1 from public.ds_libros l where l.id = ds_columnas.libro_id and public.ds_puede_editar(l.oficina_id))) with check (exists (select 1 from public.ds_libros l where l.id = ds_columnas.libro_id and public.ds_puede_editar(l.oficina_id)));

drop policy if exists ds_filas_select on public.ds_filas;
create policy ds_filas_select on public.ds_filas
  for select using (exists (select 1 from public.ds_libros l where l.id = ds_filas.libro_id and public.ds_puede_ver(l.oficina_id)));
drop policy if exists ds_filas_write on public.ds_filas;
create policy ds_filas_write on public.ds_filas
  for all to authenticated using (exists (select 1 from public.ds_libros l where l.id = ds_filas.libro_id and public.ds_puede_editar(l.oficina_id))) with check (exists (select 1 from public.ds_libros l where l.id = ds_filas.libro_id and public.ds_puede_editar(l.oficina_id)));

drop policy if exists ds_respuestas_select on public.ds_respuestas;
create policy ds_respuestas_select on public.ds_respuestas
  for select using (exists (select 1 from public.ds_libros l where l.id = ds_respuestas.libro_id and public.ds_puede_ver(l.oficina_id)));
drop policy if exists ds_respuestas_write on public.ds_respuestas;
create policy ds_respuestas_write on public.ds_respuestas
  for all to authenticated using (exists (select 1 from public.ds_libros l where l.id = ds_respuestas.libro_id and public.ds_puede_editar(l.oficina_id))) with check (exists (select 1 from public.ds_libros l where l.id = ds_respuestas.libro_id and public.ds_puede_editar(l.oficina_id)));

drop policy if exists ds_actividad_select on public.ds_actividad;
create policy ds_actividad_select on public.ds_actividad
  for select using (public.ds_puede_ver(oficina_id));

-- El equipo de una oficina lo ve quien pertenece al módulo; repartirlo es del
-- gestor de esa oficina o de la administración.
drop policy if exists ds_miembros_select on public.ds_miembros;
create policy ds_miembros_select on public.ds_miembros
  for select using (public.ds_es_participante());
drop policy if exists ds_miembros_write on public.ds_miembros;
create policy ds_miembros_write on public.ds_miembros
  for all to authenticated using (public.ds_rol_en(oficina_id) = 'gestor' or public.current_role() = 'admin') with check (public.ds_rol_en(oficina_id) = 'gestor' or public.current_role() = 'admin');

-- -----------------------------------------------------------------------------
-- 7. Semilla
-- -----------------------------------------------------------------------------

insert into public.ds_carpetas (oficina_id, clave, nombre, fija) values
  (null, 'indicadores', 'Indicadores', true),
  (null, 'trabajo', 'Trabajo propio', true)
on conflict do nothing;

insert into public.ds_indicadores (id, ods, nombre, descripcion, unidad, position) values
  ('13.1', 13, 'Investigación sobre acción climática', 'Producción científica y proyectos que atienden el cambio climático y la transición energética.', '', 1),
  ('13.2', 13, 'Energía con bajas emisiones', 'Consumo de energía de fuentes limpias en los campus y plan de transición.', '%', 2),
  ('13.3', 13, 'Educación ambiental', 'Cursos, campañas y jornadas que forman a la comunidad frente al clima.', '', 3),
  ('13.4', 13, 'Compromiso carbono neutral', 'Certificaciones, alianzas y metas públicas de neutralidad de carbono.', '', 4)
on conflict (id) do update
  set nombre = excluded.nombre, descripcion = excluded.descripcion, unidad = excluded.unidad, position = excluded.position;
