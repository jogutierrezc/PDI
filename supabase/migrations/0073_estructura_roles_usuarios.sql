-- =============================================================================
-- PDI · 0073 · Estructura institucional, roles y usuarios
--
-- Tres pantallas nuevas en la intranet descansan sobre esta migración:
--
--   · Sistema → Estructura institucional: vicerrectorías, facultades y
--     programas (con SNIES, nivel, modalidad y sedes) sobre `units` (0057 y
--     0063), y su carga masiva desde Excel.
--   · Roles: nombre, para qué es y una matriz por módulo. La matriz es una
--     forma de mirar lo que la base ya usa (`base_role`, `screens`,
--     `all_screens`, informes y `capabilities`). NINGUNA POLÍTICA RLS CAMBIA.
--   · Crear un usuario en tres pasos: quién es, qué hace en toda la
--     universidad (rol global) y dónde trabaja (unidad + rol).
--
-- Lo que se añade es poco y es dato, no permiso:
--
--   access_roles.scope      'global' (va en el perfil) o 'unidad' (va en una
--                           pertenencia de `unit_members`). Ordena qué rol se
--                           ofrece en cada paso; un rol de unidad no puede ser
--                           el rol global de nadie.
--   access_roles.unit_role  papel en Mis Tableros (visor, editor, jefe) que
--                           recibe quien entra a una unidad con este rol, si
--                           no se dice otro.
--   units.reports_to        de qué vicerrectoría depende una facultad en el
--                           organigrama. Es informativo: NO es `parent_id`.
--                           Colgar la facultad de la vicerrectoría le daría a
--                           esta, por herencia, la vista de todo (ver la
--                           semilla de prueba de Impacto).
--
-- Y tres funciones de escritura para la administración, que hacen en una sola
-- transacción lo que la pantalla haría en varias llamadas:
--
--   admin_save_unit          unidad + sedes del programa.
--   admin_set_memberships    las pertenencias de una persona (unidad + rol).
--   admin_import_programs    carga masiva de programas, todo o nada.
--
-- Todas son `security invoker`: las mismas políticas de siempre deciden, y
-- además comprueban administración para responder con un mensaje claro.
--
-- Requiere 0024, 0057, 0060, 0063. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Alcance del rol y papel por defecto en Mis Tableros
-- -----------------------------------------------------------------------------

alter table public.access_roles add column if not exists scope text not null default 'global';
alter table public.access_roles add column if not exists unit_role public.unit_role;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'access_roles_scope_check') then
    alter table public.access_roles add constraint access_roles_scope_check
      check (scope in ('global', 'unidad'));
  end if;
end $$;

comment on column public.access_roles.scope is
  'global: es el rol de la persona en toda la intranet (profiles.access_role_id). unidad: se da en una unidad concreta (unit_members.access_role_id).';
comment on column public.access_roles.unit_role is
  'Papel en Mis Tableros que recibe quien entra a una unidad con este rol, si no se elige otro. Nulo: visor.';

-- Los roles de Impacto que se ejercen en una unidad.
update public.access_roles
   set scope = 'unidad'
 where key in ('impacto_director', 'impacto_reportante', 'impacto_decano', 'impacto_vicerrector')
   and scope <> 'unidad';

-- Un rol de unidad no puede ser el rol global de una persona: sus capacidades
-- valen en una unidad y en el perfil no dirían dónde.
create or replace function public.profiles_global_role_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.access_role_id is not null and exists (
    select 1 from public.access_roles r where r.id = new.access_role_id and r.scope = 'unidad'
  ) then
    raise exception 'Ese rol se da en una unidad, no como rol de toda la intranet.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_global_role_guard on public.profiles;
create trigger profiles_global_role_guard
  before insert or update of access_role_id on public.profiles
  for each row execute function public.profiles_global_role_guard();

-- Y al revés: una pertenencia solo lleva roles de unidad.
create or replace function public.unit_members_role_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.access_role_id is not null and exists (
    select 1 from public.access_roles r where r.id = new.access_role_id and r.scope <> 'unidad'
  ) then
    raise exception 'Ese rol es de toda la intranet; en una unidad solo van roles de unidad.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists unit_members_role_guard on public.unit_members;
create trigger unit_members_role_guard
  before insert or update of access_role_id on public.unit_members
  for each row execute function public.unit_members_role_guard();

-- Un rol que alguien lleva en una unidad no cambia de alcance por debajo.
create or replace function public.access_roles_scope_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.scope is distinct from old.scope then
    if new.scope = 'unidad' and exists (select 1 from public.profiles p where p.access_role_id = new.id) then
      raise exception 'Hay personas con este rol en toda la intranet: no puede pasar a ser de unidad.' using errcode = '23514';
    end if;
    if new.scope = 'global' and exists (select 1 from public.unit_members m where m.access_role_id = new.id) then
      raise exception 'Hay personas con este rol en una unidad: no puede pasar a ser de toda la intranet.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists access_roles_scope_guard on public.access_roles;
create trigger access_roles_scope_guard
  before update of scope on public.access_roles
  for each row execute function public.access_roles_scope_guard();

-- La capacidad de un rol se puede cambiar desde la matriz. Quien ya lo lleva
-- tiene que recibirla: profiles.role es lo que leen todas las políticas. Sin
-- esto, la persona seguiría con la capacidad de antes hasta que alguien le
-- volviera a asignar el rol. El guardián del último administrador (0024) sigue
-- actuando sobre cada perfil, así que no se puede dejar el portal sin ninguno.
create or replace function public.access_roles_resync_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.base_role is distinct from old.base_role then
    update public.profiles p
       set role = new.base_role
     where p.access_role_id = new.id
       and p.role is distinct from new.base_role;
  end if;
  return new;
end;
$$;

drop trigger if exists access_roles_resync_profiles on public.access_roles;
create trigger access_roles_resync_profiles
  after update of base_role on public.access_roles
  for each row execute function public.access_roles_resync_profiles();

-- Roles de partida que faltaban. No son de fábrica: se pueden borrar.
insert into public.access_roles (key, name, description, base_role, screens, all_screens, all_reports, is_system, position, scope)
values
  ('editor_cifras', 'Editor de UDES en Cifras',
   'Carga y publica los informes de UDES en Cifras que se le asignen. No ve el resto de la intranet.',
   'planeacion', array['cifras'], false, false, false, 5, 'global')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 2. De qué vicerrectoría depende una facultad (organigrama, informativo)
-- -----------------------------------------------------------------------------

alter table public.units add column if not exists reports_to uuid references public.units (id) on delete set null;

comment on column public.units.reports_to is
  'Vicerrectoría de la que depende la facultad en el organigrama. Informativo: no da herencia (eso es parent_id).';

create or replace function public.units_reports_to_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reports_to is not null then
    if new.kind <> 'facultad' then
      raise exception 'Solo una facultad depende de una vicerrectoría en el organigrama.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.units u where u.id = new.reports_to and u.kind = 'vicerrectoria') then
      raise exception 'Una facultad depende de una vicerrectoría, no de otra clase de unidad.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists units_reports_to_guard on public.units;
create trigger units_reports_to_guard
  before insert or update of reports_to, kind on public.units
  for each row execute function public.units_reports_to_guard();

-- -----------------------------------------------------------------------------
-- 3. Guardar una unidad con sus sedes
-- -----------------------------------------------------------------------------

/**
 * Crea o actualiza una unidad. Para un programa, `p_campuses` (slugs de sede)
 * dice dónde se ofrece: las que no vienen quedan inactivas, no se borran,
 * porque un periodo cerrado puede tener asignaciones en ellas.
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

    update public.imp_program_campuses pc
       set active = false
     where pc.program_id = v_id
       and pc.active
       and pc.campus_id not in (select c.id from public.campuses c where c.slug = any (p_campuses));

    insert into public.imp_program_campuses (program_id, campus_id, active)
    select v_id, c.id, true from public.campuses c where c.slug = any (p_campuses)
    on conflict (program_id, campus_id) do update set active = true;
  end if;

  return v_id;
end;
$$;

comment on function public.admin_save_unit(jsonb, text[]) is
  'Crea o actualiza una unidad de la estructura institucional y, si es programa, sus sedes. Solo administración.';

-- -----------------------------------------------------------------------------
-- 4. Dónde trabaja una persona
-- -----------------------------------------------------------------------------

/**
 * Pertenencias de una persona: filas {unit_id, access_role_id, role}.
 *
 * `role` es el papel en Mis Tableros; si no viene, el que ya tenía, o el del
 * rol (`unit_role`), o visor. Con `p_replace` las pertenencias que no vienen
 * se quitan —así funciona el paso 3 del asistente, que enseña todas—; sin él
 * solo se añaden o actualizan —así funciona la carga masiva—.
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
  v_role uuid;
  v_board public.unit_role;
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
    v_role := nullif(v_row ->> 'access_role_id', '')::uuid;
    v_board := nullif(v_row ->> 'role', '')::public.unit_role;

    insert into public.unit_members (unit_id, profile_id, access_role_id, role)
    values (
      v_unit,
      p_profile,
      v_role,
      coalesce(v_board, (select r.unit_role from public.access_roles r where r.id = v_role), 'visor')
    )
    on conflict (unit_id, profile_id) do update
      set access_role_id = excluded.access_role_id,
          role = coalesce(v_board, public.unit_members.role);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.admin_set_memberships(uuid, jsonb, boolean) is
  'Unidades en las que trabaja una persona, con su rol en cada una. Con p_replace quita las que no vienen. Solo administración.';

-- -----------------------------------------------------------------------------
-- 5. Carga masiva de programas
-- -----------------------------------------------------------------------------

/**
 * Programas desde la lista SNIES. Cada fila: snies_code, code, name, slug,
 * faculty_code, degree_level, modality, campuses (slugs).
 *
 * Todo o nada: la pantalla ya enseñó la vista previa y los errores por fila;
 * si aun así una fila falla aquí, no se escribe ninguna y el mensaje dice cuál.
 * Un programa existente se reconoce por su SNIES y, si no lo tiene, por su
 * código.
 */
create or replace function public.admin_import_programs(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row jsonb;
  v_n integer := 0;
  v_faculty uuid;
  v_existing public.units%rowtype;
  v_created integer := 0;
  v_updated integer := 0;
  v_campuses text[];
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración carga programas.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El archivo no trae programas.' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;

    select u.id into v_faculty
      from public.units u
     where u.kind = 'facultad' and upper(u.code) = upper(trim(v_row ->> 'faculty_code'));
    if v_faculty is null then
      raise exception 'Fila %: no existe la facultad «%».', coalesce((v_row ->> 'line')::int, v_n), v_row ->> 'faculty_code'
        using errcode = '23503';
    end if;

    select u.* into v_existing
      from public.units u
     where (nullif(trim(v_row ->> 'snies_code'), '') is not null and u.snies_code = trim(v_row ->> 'snies_code'))
        or (u.snies_code is null and upper(u.code) = upper(trim(v_row ->> 'code')))
     order by (u.snies_code is not null) desc
     limit 1;

    if v_existing.id is not null and v_existing.kind <> 'programa' then
      raise exception 'Fila %: el código «%» ya es de una unidad que no es programa.', coalesce((v_row ->> 'line')::int, v_n), v_row ->> 'code'
        using errcode = '23505';
    end if;

    select coalesce(array_agg(value), '{}') into v_campuses
      from jsonb_array_elements_text(coalesce(v_row -> 'campuses', '[]'::jsonb));

    begin
      perform public.admin_save_unit(
        jsonb_build_object(
          'id', v_existing.id,
          'parent_id', v_faculty,
          'kind', 'programa',
          'code', v_row ->> 'code',
          'name', v_row ->> 'name',
          'slug', coalesce(v_existing.slug, v_row ->> 'slug'),
          'description', coalesce(v_existing.description, ''),
          'position', coalesce(v_existing.position, 0),
          'snies_code', v_row ->> 'snies_code',
          'degree_level', v_row ->> 'degree_level',
          'modality', v_row ->> 'modality'
        ),
        v_campuses
      );
    exception when others then
      raise exception 'Fila %: %', coalesce((v_row ->> 'line')::int, v_n), sqlerrm using errcode = sqlstate;
    end;

    if v_existing.id is null then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
    v_existing := null;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

comment on function public.admin_import_programs(jsonb) is
  'Carga masiva de programas (lista SNIES) con sus sedes. Todo o nada. Solo administración.';

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'admin_save_unit(jsonb, text[])',
    'admin_set_memberships(uuid, jsonb, boolean)',
    'admin_import_programs(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
