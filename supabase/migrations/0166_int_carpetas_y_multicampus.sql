-- =============================================================================
-- 0166 · Internacionalización: carpetas reales, tablas Multicampus y autoría
--
-- Qué cambia (diseño aprobado en la maqueta «Internacionalización · Tablas y
-- Multicampus»):
--
--   int_carpetas          carpetas con subcarpetas (parent_id). int_libros
--                         lleva carpeta_id (nulo = «Sin carpeta»). Antes las
--                         carpetas eran cuatro constantes deducidas de la clase
--                         de las hojas y no se podían crear.
--   captura = 'multicampus'
--                         un archivo al que aportan todos los campus.
--                         · TODOS los miembros del módulo ven todas sus filas.
--                         · Bucaramanga (Gestor y Coordinador) edita las filas
--                           de cualquier campus; Valledupar, Cúcuta y Bogotá,
--                           solo las suyas. Planeación y el Director, todas.
--                         · El envío y la aprobación siguen por campus: cada
--                           campus envía su parte; la tabla queda aprobada
--                           cuando todos los campus que aportan lo están.
--   int_filas.archivo     nombre del Excel de donde vino la fila (con created_by,
--                         updated_by y origen, que ya existían, completa la
--                         autoría: quién, cuándo y de dónde).
--
-- Quién puede qué:
--   · Crear carpetas y tablas «por campus»: Director, Planeación y cualquier
--     Coordinador. Quien las crea las edita; el Director y Planeación, todas.
--   · Tablas «solo la oficina»: Director y Planeación.
--   · Tablas Multicampus (crear, cambiar estructura, borrar): exclusivo del
--     Director, Planeación y el Coordinador de Bucaramanga.
--   · Planeación ve y administra el módulo sin ser Director: no aprueba, no
--     reabre y no nombra miembros (eso sigue siendo del Director).
--   · Quien administra una tabla abre la ventana de captura de sus hojas
--     (int_ventanas); los periodos siguen siendo del Director.
--
-- Requiere 0151 (int_*) y 0001/0002 (profiles, has_role_at_least).
-- Idempotente. Todo DELETE lleva WHERE (safeupdate, ver 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Funciones de permiso nuevas (security definer, como las de 0151)
-- -----------------------------------------------------------------------------

/** ¿Planeación (o administración)? Sin ser miembro del módulo. */
create or replace function public.int_es_planeacion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() is not null and public.has_role_at_least('planeacion');
$$;

/** ¿Ve el módulo? Miembro (cualquier papel), administración o Planeación. */
create or replace function public.int_ve_modulo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.int_es_miembro() or public.int_es_planeacion();
$$;

/** El campus que controla las tablas Multicampus: Bucaramanga. */
create or replace function public.int_campus_central()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
    from public.campuses c
   where c.slug = 'bucaramanga' or lower(c.name) like 'bucaramanga%'
   order by (c.slug = 'bucaramanga') desc
   limit 1;
$$;

/** ¿Coordinador de algún campus? */
create or replace function public.int_es_coordinador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() is not null
     and exists (select 1 from public.int_miembros m where m.user_id = auth.uid() and m.rol = 'coordinador');
$$;

/** ¿Crea carpetas y tablas «por campus»? Director, Planeación o un Coordinador. */
create or replace function public.int_puede_crear()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.int_es_director() or public.int_es_planeacion() or public.int_es_coordinador();
$$;

/** ¿Controla las tablas Multicampus? Director, Planeación o el Coordinador de Bucaramanga. */
create or replace function public.int_controla_multicampus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.int_es_director() or public.int_es_planeacion()
      or (public.current_role() is not null
          and exists (select 1 from public.int_miembros m
                       where m.user_id = auth.uid() and m.rol = 'coordinador'
                         and m.campus_id = public.int_campus_central()));
$$;

/** ¿Esta hoja pertenece a una tabla Multicampus? */
create or replace function public.int_es_multicampus(p_hoja uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.int_hojas h join public.int_libros l on l.id = h.libro_id
                  where h.id = p_hoja and l.captura = 'multicampus');
$$;

/**
 * Papel frente a las filas de (campus, hoja): el de int_rol_en y, en una tabla
 * Multicampus, el mejor entre ese y el que da Planeación (coordinador) o el que
 * tiene la persona en Bucaramanga. Ordenado: director > coordinador > gestor.
 */
create or replace function public.int_rol_fila(p_campus uuid, p_hoja uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base text := public.int_rol_en(p_campus);
  v_extra text;
begin
  if v_base = 'director' or not public.int_es_multicampus(p_hoja) then
    return v_base;
  end if;
  if public.int_es_planeacion() then
    v_extra := 'coordinador';
  else
    v_extra := public.int_rol_en(public.int_campus_central());
  end if;
  return case
    when v_base is null then v_extra
    when v_extra is null then v_base
    when v_extra = 'director' or v_base = 'director' then 'director'
    when v_extra = 'coordinador' or v_base = 'coordinador' then 'coordinador'
    else 'gestor'
  end;
end;
$$;

/** ¿Ve las filas de este campus en esta hoja? Su campus, o cualquiera si la tabla es Multicampus. */
create or replace function public.int_ve_fila(p_campus uuid, p_hoja uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.int_puede_ver_campus(p_campus)
      or (public.int_es_multicampus(p_hoja) and public.int_ve_modulo());
$$;

/** Puede crear un libro con esta forma de captura. */
create or replace function public.int_puede_crear_libro(p_captura text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_captura
    when 'multicampus' then public.int_controla_multicampus()
    when 'oficina' then public.int_es_director() or public.int_es_planeacion()
    when 'campus' then public.int_puede_crear()
    else false
  end;
$$;

/** Puede cambiar la estructura de este libro (hojas, columnas, nombre, carpeta) o borrarlo. */
create or replace function public.int_puede_editar_libro(p_libro uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when public.int_es_director() or public.int_es_planeacion() then true
      when l.captura = 'multicampus' then public.int_controla_multicampus()
      when l.captura = 'campus' then l.created_by = auth.uid() and public.int_es_coordinador()
      else false
    end
    from public.int_libros l
    where l.id = p_libro
  ), false);
$$;

/** Lo mismo, partiendo de la hoja. */
create or replace function public.int_puede_editar_hoja(p_hoja uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select public.int_puede_editar_libro(h.libro_id) from public.int_hojas h where h.id = p_hoja), false);
$$;

-- -----------------------------------------------------------------------------
-- 2. Carpetas con subcarpetas
-- -----------------------------------------------------------------------------

create table if not exists public.int_carpetas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  parent_id   uuid references public.int_carpetas (id) on delete restrict,
  orden       integer not null default 0,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint int_carpetas_nombre check (char_length(btrim(nombre)) between 1 and 80)
);

comment on table public.int_carpetas is
  'Internacionalización (0166): carpetas con subcarpetas para ordenar las tablas. int_libros.carpeta_id nulo = «Sin carpeta». Una carpeta con contenido no se borra.';

-- Dos carpetas hermanas no se llaman igual (sin distinguir mayúsculas).
create unique index if not exists int_carpetas_hermanas_idx
  on public.int_carpetas (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nombre)));
create index if not exists int_carpetas_parent_idx on public.int_carpetas (parent_id);

drop trigger if exists int_carpetas_set_updated_at on public.int_carpetas;
create trigger int_carpetas_set_updated_at before update on public.int_carpetas
  for each row execute function public.set_updated_at();

/** Sin ciclos y con una profundidad máxima de 5 niveles. */
create or replace function public.int_carpetas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nivel integer := 1;
  v_actual uuid := new.parent_id;
begin
  while v_actual is not null loop
    if tg_op = 'UPDATE' and v_actual = new.id then
      raise exception 'Una carpeta no puede quedar dentro de sí misma ni de sus subcarpetas.' using errcode = '23514';
    end if;
    v_nivel := v_nivel + 1;
    if v_nivel > 5 then
      raise exception 'Las carpetas llegan hasta 5 niveles.' using errcode = '23514';
    end if;
    select c.parent_id into v_actual from public.int_carpetas c where c.id = v_actual;
  end loop;
  return new;
end;
$$;

drop trigger if exists int_carpetas_guard_trg on public.int_carpetas;
create trigger int_carpetas_guard_trg before insert or update of parent_id on public.int_carpetas
  for each row execute function public.int_carpetas_guard();

alter table public.int_libros
  add column if not exists carpeta_id uuid references public.int_carpetas (id) on delete restrict;
create index if not exists int_libros_carpeta_idx on public.int_libros (carpeta_id);

alter table public.int_libros drop constraint if exists int_libros_captura;
alter table public.int_libros
  add constraint int_libros_captura check (captura in ('campus', 'oficina', 'multicampus'));

comment on column public.int_libros.captura is
  'campus: cada campus sus filas · oficina: solo el Director/Planeación · multicampus (0166): un archivo al que aportan todos los campus; Bucaramanga edita las de todos.';

-- -----------------------------------------------------------------------------
-- 3. Autoría de las filas
-- -----------------------------------------------------------------------------

alter table public.int_filas
  add column if not exists archivo text;
alter table public.int_filas drop constraint if exists int_filas_archivo;
alter table public.int_filas
  add constraint int_filas_archivo check (archivo is null or char_length(archivo) <= 200);

comment on column public.int_filas.archivo is
  'Nombre del Excel de donde vino la fila (origen = excel). Con created_by y created_at dice quién la subió y cuándo.';

/** Carga masiva. Nueva: p_archivo (nombre del Excel). Security invoker: RLS y el disparador deciden fila por fila. */
drop function if exists public.int_guardar_filas(uuid, uuid, jsonb, uuid[], text);
create or replace function public.int_guardar_filas(
  p_hoja uuid, p_periodo uuid, p_filas jsonb, p_reemplazar uuid[] default null, p_origen text default 'excel', p_archivo text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_borradas integer := 0;
  v_insertadas integer := 0;
  v_actualizadas integer := 0;
  v_archivo text := nullif(left(btrim(coalesce(p_archivo, '')), 200), '');
begin
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'Las filas deben llegar como una lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > 20000 then
    raise exception 'Son % filas: el máximo por carga es 20.000.', jsonb_array_length(p_filas) using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_filas) x(v)
              where jsonb_typeof(x.v) <> 'object' or nullif(x.v ->> 'campus_id', '') is null) then
    raise exception 'Cada fila lleva su campus_id y sus datos.' using errcode = '22023';
  end if;

  if p_reemplazar is not null and cardinality(p_reemplazar) > 0 then
    delete from public.int_filas f
     where f.hoja_id = p_hoja and f.periodo_id = p_periodo and f.campus_id = any (p_reemplazar);
    get diagnostics v_borradas = row_count;
  end if;

  update public.int_filas f
     set datos = coalesce(x.v -> 'datos', '{}'::jsonb),
         orden = coalesce((x.v ->> 'orden')::integer, f.orden)
    from jsonb_array_elements(p_filas) x(v)
   where nullif(x.v ->> 'id', '') is not null
     and f.id = (x.v ->> 'id')::uuid
     and f.hoja_id = p_hoja and f.periodo_id = p_periodo
     and f.campus_id = (x.v ->> 'campus_id')::uuid;
  get diagnostics v_actualizadas = row_count;

  insert into public.int_filas (hoja_id, periodo_id, campus_id, datos, orden, origen, archivo)
  select p_hoja, p_periodo, (x.v ->> 'campus_id')::uuid, coalesce(x.v -> 'datos', '{}'::jsonb),
         coalesce((x.v ->> 'orden')::integer, (x.n - 1)::integer),
         case when p_origen = 'manual' then 'manual' else 'excel' end,
         case when p_origen = 'manual' then null else v_archivo end
    from jsonb_array_elements(p_filas) with ordinality x(v, n)
   where nullif(x.v ->> 'id', '') is null;
  get diagnostics v_insertadas = row_count;

  return jsonb_build_object('insertadas', v_insertadas, 'actualizadas', v_actualizadas, 'borradas', v_borradas);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. int_yo, el bloqueo de filas y las políticas
-- -----------------------------------------------------------------------------

/** Mis papeles. Las claves nuevas no quitan las de 0151. */
create or replace function public.int_yo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'director', public.int_es_director(),
    'coordinador', coalesce((select jsonb_agg(m.campus_id order by m.campus_id) from public.int_miembros m
                              where m.user_id = auth.uid() and m.rol = 'coordinador' and public.current_role() is not null), '[]'::jsonb),
    'gestor', coalesce((select jsonb_agg(m.campus_id order by m.campus_id) from public.int_miembros m
                         where m.user_id = auth.uid() and m.rol = 'gestor' and public.current_role() is not null), '[]'::jsonb),
    'planeacion', public.int_es_planeacion(),
    'crea', public.int_puede_crear(),
    'multicampus', public.int_controla_multicampus(),
    'central', public.int_campus_central()
  );
$$;

/**
 * Por qué no puede escribir filas de (periodo, hoja, campus), o nulo. Igual que
 * en 0151 salvo que el papel sale de int_rol_fila (Multicampus) y que «solo la
 * oficina» la escriben también Planeación y el Director. Espejo: lib/permisos.ts.
 */
create or replace function public.int_motivo_bloqueo(p_periodo uuid, p_hoja uuid, p_campus uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text := public.int_rol_fila(p_campus, p_hoja);
  v_estado text := public.int_estado_envio(p_periodo, p_hoja, p_campus);
  v_captura text;
begin
  if v_rol is null then
    return 'No tiene permiso en este campus.';
  end if;
  if v_estado = 'aprobado' then
    return 'La hoja de este campus ya está aprobada: solo el Director la reabre, con motivo.';
  end if;
  if v_rol = 'director' then
    return null;
  end if;
  select l.captura into v_captura
    from public.int_hojas h join public.int_libros l on l.id = h.libro_id
   where h.id = p_hoja;
  if v_captura = 'oficina' then
    return 'Esta tabla la captura solo la oficina principal.';
  end if;
  if not public.int_ventana_abierta(p_periodo, p_hoja, p_campus) then
    return 'La ventana de captura de esta hoja está cerrada para este campus.';
  end if;
  if v_rol = 'gestor' and v_estado <> 'borrador' then
    return 'La hoja ya se envió: solo se corrige si la devuelven.';
  end if;
  if v_rol = 'coordinador' and v_estado = 'validado' then
    return 'La hoja ya está validada: devuélvala para corregirla.';
  end if;
  return null;
end;
$$;

revoke all on function public.int_es_planeacion() from public, anon;
revoke all on function public.int_ve_modulo() from public, anon;
revoke all on function public.int_campus_central() from public, anon;
revoke all on function public.int_es_coordinador() from public, anon;
revoke all on function public.int_puede_crear() from public, anon;
revoke all on function public.int_controla_multicampus() from public, anon;
revoke all on function public.int_es_multicampus(uuid) from public, anon;
revoke all on function public.int_rol_fila(uuid, uuid) from public, anon;
revoke all on function public.int_ve_fila(uuid, uuid) from public, anon;
revoke all on function public.int_puede_crear_libro(text) from public, anon;
revoke all on function public.int_puede_editar_libro(uuid) from public, anon;
revoke all on function public.int_puede_editar_hoja(uuid) from public, anon;
revoke all on function public.int_guardar_filas(uuid, uuid, jsonb, uuid[], text, text) from public, anon;
grant execute on function public.int_es_planeacion() to authenticated;
grant execute on function public.int_ve_modulo() to authenticated;
grant execute on function public.int_campus_central() to authenticated;
grant execute on function public.int_es_coordinador() to authenticated;
grant execute on function public.int_puede_crear() to authenticated;
grant execute on function public.int_controla_multicampus() to authenticated;
grant execute on function public.int_es_multicampus(uuid) to authenticated;
grant execute on function public.int_rol_fila(uuid, uuid) to authenticated;
grant execute on function public.int_ve_fila(uuid, uuid) to authenticated;
grant execute on function public.int_puede_crear_libro(text) to authenticated;
grant execute on function public.int_puede_editar_libro(uuid) to authenticated;
grant execute on function public.int_puede_editar_hoja(uuid) to authenticated;
grant execute on function public.int_guardar_filas(uuid, uuid, jsonb, uuid[], text, text) to authenticated;

-- RLS ---------------------------------------------------------------------------

alter table public.int_carpetas enable row level security;
revoke all on public.int_carpetas from public, anon;
grant select, insert, update, delete on public.int_carpetas to authenticated;

-- Lectura: ahora también Planeación (antes solo miembros del módulo).
do $$
declare
  t text;
begin
  foreach t in array array['int_conceptos', 'int_libros', 'int_hojas', 'int_columnas', 'int_periodos',
                           'int_ventanas', 'int_plantillas', 'int_plantilla_columnas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.int_ve_modulo())', t || '_read', t);
  end loop;
end $$;

-- Carpetas: las lee quien ve el módulo; las crea quien puede crear; las cambia su autor (Coordinador) o Director/Planeación.
drop policy if exists int_carpetas_read on public.int_carpetas;
create policy int_carpetas_read on public.int_carpetas for select to authenticated
  using (public.int_ve_modulo());
drop policy if exists int_carpetas_insert on public.int_carpetas;
create policy int_carpetas_insert on public.int_carpetas for insert to authenticated
  with check (public.int_puede_crear());
drop policy if exists int_carpetas_update on public.int_carpetas;
create policy int_carpetas_update on public.int_carpetas for update to authenticated
  using (public.int_es_director() or public.int_es_planeacion() or (created_by = auth.uid() and public.int_es_coordinador()))
  with check (public.int_es_director() or public.int_es_planeacion() or (created_by = auth.uid() and public.int_es_coordinador()));
drop policy if exists int_carpetas_delete on public.int_carpetas;
create policy int_carpetas_delete on public.int_carpetas for delete to authenticated
  using (public.int_es_director() or public.int_es_planeacion() or (created_by = auth.uid() and public.int_es_coordinador()));

-- Libros, hojas y columnas: escribe quien puede crear ese tipo / quien administra el libro.
drop policy if exists int_libros_write on public.int_libros;
drop policy if exists int_libros_insert on public.int_libros;
create policy int_libros_insert on public.int_libros for insert to authenticated
  with check (public.int_puede_crear_libro(captura));
drop policy if exists int_libros_update on public.int_libros;
create policy int_libros_update on public.int_libros for update to authenticated
  using (public.int_puede_editar_libro(id))
  with check (public.int_puede_crear_libro(captura) and public.int_puede_editar_libro(id));
drop policy if exists int_libros_delete on public.int_libros;
create policy int_libros_delete on public.int_libros for delete to authenticated
  using (public.int_puede_editar_libro(id));

drop policy if exists int_hojas_write on public.int_hojas;
create policy int_hojas_write on public.int_hojas for all to authenticated
  using (public.int_puede_editar_libro(libro_id))
  with check (public.int_puede_editar_libro(libro_id));

drop policy if exists int_columnas_write on public.int_columnas;
create policy int_columnas_write on public.int_columnas for all to authenticated
  using (public.int_puede_editar_hoja(hoja_id))
  with check (public.int_puede_editar_hoja(hoja_id));

-- Ventanas de captura: el Director, o quien administra la tabla de esa hoja.
drop policy if exists int_ventanas_write on public.int_ventanas;
create policy int_ventanas_write on public.int_ventanas for all to authenticated
  using (public.int_es_director() or public.int_puede_editar_hoja(hoja_id))
  with check (public.int_es_director() or public.int_puede_editar_hoja(hoja_id));

-- Filas: se leen por campus o, en Multicampus, todas; se escriben según int_rol_fila.
drop policy if exists int_filas_read on public.int_filas;
create policy int_filas_read on public.int_filas for select to authenticated
  using (public.int_ve_fila(campus_id, hoja_id));
drop policy if exists int_filas_insert on public.int_filas;
create policy int_filas_insert on public.int_filas for insert to authenticated
  with check (public.int_rol_fila(campus_id, hoja_id) is not null);
drop policy if exists int_filas_update on public.int_filas;
create policy int_filas_update on public.int_filas for update to authenticated
  using (public.int_rol_fila(campus_id, hoja_id) is not null)
  with check (public.int_rol_fila(campus_id, hoja_id) is not null);
drop policy if exists int_filas_delete on public.int_filas;
create policy int_filas_delete on public.int_filas for delete to authenticated
  using (public.int_rol_fila(campus_id, hoja_id) is not null);

-- Estados de envío: en Multicampus todos ven el de todos los campus.
drop policy if exists int_envios_read on public.int_envios;
create policy int_envios_read on public.int_envios for select to authenticated
  using (public.int_ve_fila(campus_id, hoja_id));

notify pgrst, 'reload schema';
