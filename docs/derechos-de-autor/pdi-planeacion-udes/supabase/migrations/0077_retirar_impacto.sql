-- =============================================================================
-- PDI · 0077 · Retirar el módulo Impacto
--
-- Impacto (0063–0072) se rediseña desde cero. Esta migración borra todo lo que
-- era suyo, SIN RESPALDO (decisión del 2026-09-24): catálogo, versiones,
-- periodos, asignaciones, registros, evidencias, revisiones, plantillas e
-- importaciones.
--
-- Lo que se va:
--
--   · Todas las tablas, vistas, funciones y tipos `imp_*`.
--   · Las políticas del bucket «impacto» de Storage y, si está vacío, el bucket.
--   · Los cinco roles de acceso de Impacto (impacto_admin, impacto_director,
--     impacto_reportante, impacto_decano, impacto_vicerrector) y las pantallas
--     «impacto» e «impacto_audit» de los demás roles.
--   · Los roles de unidad: access_roles.scope, access_roles.unit_role,
--     access_roles.capabilities y unit_members.access_role_id, con los
--     guardianes que los mantenían coherentes (0073).
--
-- Lo que se queda, porque es de Estructura institucional y no de Impacto:
--
--   · La función de cada persona en su unidad —Gestor, Contribuyente,
--     Consulta— (`unit_members.role`) y su cargo (`unit_members.title`).
--   · Los datos de programa en `units` (SNIES, nivel, modalidad) y la función
--     sustantiva de las vicerrectorías.
--   · En qué sedes se ofrece cada programa: `imp_program_campuses` pasa a
--     llamarse `program_campuses`. La usan Estructura institucional y la
--     Oferta de programas.
--
-- `admin_save_unit` y `admin_set_memberships` se reescriben sin lo que se va;
-- `admin_import_programs` y `admin_import_units` llaman a la primera y no
-- cambian.
--
-- Requiere 0073 y 0074. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. En qué sedes se ofrece cada programa: se queda, con otro nombre
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.imp_program_campuses') is not null and to_regclass('public.program_campuses') is null then
    alter table public.imp_program_campuses rename to program_campuses;
  end if;
  if to_regclass('public.imp_program_campuses_campus_idx') is not null then
    alter index public.imp_program_campuses_campus_idx rename to program_campuses_campus_idx;
  end if;
  if exists (select 1 from pg_constraint where conname = 'imp_program_campuses_pkey') then
    alter table public.program_campuses rename constraint imp_program_campuses_pkey to program_campuses_pkey;
  end if;
end $$;

comment on table public.program_campuses is
  'Oferta por sede: en qué campus se ofrece cada programa. La edita Estructura institucional.';

create or replace function public.program_campuses_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.units u where u.id = new.program_id and u.kind = 'programa') then
    raise exception 'Solo un programa se ofrece en una sede.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists imp_program_campuses_guard on public.program_campuses;
drop trigger if exists program_campuses_guard on public.program_campuses;
create trigger program_campuses_guard
  before insert or update on public.program_campuses
  for each row execute function public.program_campuses_guard();

-- Sus políticas usaban las capacidades de Impacto: ahora escribe la
-- administración, como el resto de la estructura, y lee cualquier sesión.
do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'program_campuses' loop
    execute format('drop policy %I on public.program_campuses', pol.policyname);
  end loop;
end $$;

alter table public.program_campuses enable row level security;

create policy program_campuses_read on public.program_campuses
  for select to authenticated using (true);

create policy program_campuses_write on public.program_campuses
  for all to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

grant select, insert, update, delete on public.program_campuses to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Los roles de acceso de Impacto y sus pantallas
-- -----------------------------------------------------------------------------

-- Son de sistema (0063) y el guardián de 0024 no deja borrar uno de sistema.
-- Quien los llevaba como rol global queda sin rol de acceso y conserva su
-- capacidad (profiles.role); las pertenencias pierden la columna más abajo.
update public.access_roles set is_system = false where key like 'impacto\_%' and is_system;
delete from public.access_roles where key like 'impacto\_%';

update public.access_roles
   set screens = array_remove(array_remove(screens, 'impacto'), 'impacto_audit')
 where screens && array['impacto', 'impacto_audit'];

-- -----------------------------------------------------------------------------
-- 3. Los roles de unidad
-- -----------------------------------------------------------------------------

drop trigger if exists profiles_global_role_guard on public.profiles;
drop trigger if exists unit_members_role_guard on public.unit_members;
drop trigger if exists access_roles_scope_guard on public.access_roles;
drop function if exists public.profiles_global_role_guard();
drop function if exists public.unit_members_role_guard();
drop function if exists public.access_roles_scope_guard();

alter table public.access_roles drop constraint if exists access_roles_scope_check;
alter table public.access_roles drop constraint if exists access_roles_capabilities_known;
alter table public.access_roles drop column if exists scope;
alter table public.access_roles drop column if exists unit_role;
alter table public.access_roles drop column if exists capabilities;
alter table public.unit_members drop column if exists access_role_id;

comment on column public.unit_members.title is
  'Cargo de la persona en la unidad (texto libre). Informativo: los permisos salen de role.';
comment on column public.units.degree_level is 'Nivel de formación del programa.';
comment on column public.units.substantive_function is 'Función sustantiva de la vicerrectoría: investigación, enseñanza o extensión.';

-- -----------------------------------------------------------------------------
-- 4. Estructura institucional sin Impacto
-- -----------------------------------------------------------------------------

/**
 * Crea o actualiza una unidad. Para un programa, `p_campuses` (slugs de sede)
 * dice dónde se ofrece: las que no vienen quedan inactivas, no se borran.
 */
create or replace function public.admin_save_unit(p_unit jsonb, p_campuses text[] default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_unit ->> 'id', '')::uuid;
  v_kind public.unit_kind := coalesce(nullif(p_unit ->> 'kind', ''), 'oficina')::public.unit_kind;
  v_unknown text;
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración cambia la estructura institucional.' using errcode = '42501';
  end if;
  if coalesce(trim(p_unit ->> 'name'), '') = '' or coalesce(trim(p_unit ->> 'code'), '') = '' then
    raise exception 'La unidad necesita nombre y código.' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.units (parent_id, kind, code, name, slug, description, position,
                              snies_code, degree_level, modality, substantive_function, reports_to)
    values (
      nullif(p_unit ->> 'parent_id', '')::uuid,
      v_kind,
      trim(p_unit ->> 'code'),
      trim(p_unit ->> 'name'),
      p_unit ->> 'slug',
      coalesce(p_unit ->> 'description', ''),
      coalesce((p_unit ->> 'position')::smallint, 0),
      nullif(trim(p_unit ->> 'snies_code'), ''),
      nullif(p_unit ->> 'degree_level', ''),
      nullif(p_unit ->> 'modality', ''),
      nullif(p_unit ->> 'substantive_function', ''),
      nullif(p_unit ->> 'reports_to', '')::uuid
    )
    returning id into v_id;
  else
    update public.units u
       set parent_id = nullif(p_unit ->> 'parent_id', '')::uuid,
           kind = v_kind,
           code = trim(p_unit ->> 'code'),
           name = trim(p_unit ->> 'name'),
           slug = coalesce(p_unit ->> 'slug', u.slug),
           description = coalesce(p_unit ->> 'description', u.description),
           position = coalesce((p_unit ->> 'position')::smallint, u.position),
           snies_code = nullif(trim(p_unit ->> 'snies_code'), ''),
           degree_level = nullif(p_unit ->> 'degree_level', ''),
           modality = nullif(p_unit ->> 'modality', ''),
           substantive_function = nullif(p_unit ->> 'substantive_function', ''),
           reports_to = nullif(p_unit ->> 'reports_to', '')::uuid
     where u.id = v_id;
    if not found then
      raise exception 'La unidad ya no existe.' using errcode = 'P0002';
    end if;
  end if;

  if v_kind = 'programa' and p_campuses is not null then
    select s into v_unknown
      from unnest(p_campuses) s
     where not exists (select 1 from public.campuses c where c.slug = s)
     limit 1;
    if v_unknown is not null then
      raise exception 'No existe la sede «%».', v_unknown using errcode = '23503';
    end if;

    update public.program_campuses pc
       set active = false
     where pc.program_id = v_id
       and pc.active
       and pc.campus_id not in (select c.id from public.campuses c where c.slug = any (p_campuses));

    insert into public.program_campuses (program_id, campus_id, active)
    select v_id, c.id, true from public.campuses c where c.slug = any (p_campuses)
    on conflict (program_id, campus_id) do update set active = true;
  end if;

  return v_id;
end;
$$;

/**
 * Pertenencias de una persona: filas {unit_id, role, title}.
 *
 * `role` es su función en la unidad (jefe = Gestor, editor = Contribuyente,
 * visor = Consulta); si no viene, la que ya tenía o Consulta. `title` es el
 * cargo: sin la clave o null se conserva; con texto vacío se borra. Con
 * `p_replace` las pertenencias que no vienen se quitan.
 */
create or replace function public.admin_set_memberships(p_profile uuid, p_rows jsonb, p_replace boolean default true)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row jsonb;
  v_unit uuid;
  v_board public.unit_role;
  v_keep_title boolean;
  v_title text;
  v_count integer := 0;
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración asigna personas a las unidades.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile) then
    raise exception 'La persona no existe.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Las asignaciones deben ser una lista.' using errcode = '22023';
  end if;

  if p_replace then
    delete from public.unit_members m
     where m.profile_id = p_profile
       and m.unit_id not in (
         select (e ->> 'unit_id')::uuid from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e
       );
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_unit := (v_row ->> 'unit_id')::uuid;
    v_board := nullif(v_row ->> 'role', '')::public.unit_role;
    v_keep_title := not (v_row ? 'title') or jsonb_typeof(v_row -> 'title') = 'null';
    v_title := nullif(trim(coalesce(v_row ->> 'title', '')), '');

    insert into public.unit_members (unit_id, profile_id, role, title)
    values (v_unit, p_profile, coalesce(v_board, 'visor'), v_title)
    on conflict (unit_id, profile_id) do update
      set role = coalesce(v_board, public.unit_members.role),
          title = case when v_keep_title then public.unit_members.title else v_title end;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.admin_set_memberships(uuid, jsonb, boolean) is
  'Unidades en las que trabaja una persona, con su función y su cargo en cada una. Con p_replace quita las que no vienen. Solo administración.';

-- -----------------------------------------------------------------------------
-- 5. Evidencias en Storage
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists impacto_lectura on storage.objects';
    execute 'drop policy if exists impacto_escritura on storage.objects';
    execute 'drop policy if exists impacto_borrado on storage.objects';
  end if;
  if to_regclass('storage.buckets') is not null then
    begin
      delete from storage.buckets where id = 'impacto';
    exception when others then
      raise notice 'El bucket «impacto» no se pudo borrar (%). Vacíelo y bórrelo a mano desde Storage.', sqlerrm;
    end;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Todo lo imp_*
-- -----------------------------------------------------------------------------

-- Primero las tablas y vistas (con sus disparadores, políticas e índices),
-- luego las funciones y al final los tipos, que las funciones pueden usar.
-- Las funciones van sin cascade: si algo fuera de Impacto dependiera de una,
-- la migración se detiene en vez de llevárselo por delante.
do $$
declare
  obj record;
begin
  for obj in
    select c.relname, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname like 'imp\_%'
       and c.relkind in ('r', 'p', 'v', 'm')
  loop
    if obj.relkind in ('v') then
      execute format('drop view if exists public.%I cascade', obj.relname);
    elsif obj.relkind = 'm' then
      execute format('drop materialized view if exists public.%I cascade', obj.relname);
    else
      execute format('drop table if exists public.%I cascade', obj.relname);
    end if;
  end loop;

  for obj in
    select p.oid::regprocedure::text as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'imp\_%'
  loop
    execute format('drop function if exists %s', obj.signature);
  end loop;

  for obj in
    select t.typname
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
       and t.typname like 'imp\_%'
       and t.typtype in ('e', 'c', 'd')
  loop
    execute format('drop type if exists public.%I', obj.typname);
  end loop;
end $$;

notify pgrst, 'reload schema';
