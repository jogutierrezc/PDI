-- =============================================================================
-- PDI · 0074 · Estructura institucional: carga completa y personas con cargo
--
-- Dos cosas que pide la pantalla Sistema → Estructura institucional:
--
--   · CARGA MASIVA DE TODA LA ESTRUCTURA desde un libro de Excel con una hoja
--     por clase (vicerrectorías, facultades, oficinas, programas). 0073 solo
--     cargaba programas (`admin_import_programs`, que se queda como está).
--     `admin_import_units` hace todo o nada y en orden —vicerrectorías,
--     facultades, oficinas, programas— para que cada fila encuentre a su
--     padre aunque venga en el mismo archivo.
--
--   · EL CARGO de cada persona en su unidad (`unit_members.title`): texto
--     libre, «Director del programa», «Coordinadora de calidad». No da ni
--     quita permisos: lo que alguien puede hacer lo dicen su papel en la
--     unidad (`role`) y su rol de Impacto (`access_role_id`).
--     `admin_set_memberships` lo acepta en cada fila; nulo conserva el que
--     tenga.
--
-- Qué hereda qué, igual que en 0073:
--
--   · Una oficina cuelga (`parent_id`) de una vicerrectoría o de otra
--     oficina: ahí la herencia de Mis Tableros sí se quiere.
--   · Una facultad depende de una vicerrectoría por `reports_to`, que es
--     organigrama y no da acceso a nada.
--   · Un programa cuelga de su facultad (`parent_id`).
--
-- Todas las funciones son `security invoker` y comprueban administración.
-- Requiere 0073. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El cargo en la unidad
-- -----------------------------------------------------------------------------

alter table public.unit_members add column if not exists title text;

comment on column public.unit_members.title is
  'Cargo de la persona en la unidad (texto libre). Informativo: los permisos salen de role y access_role_id.';

-- -----------------------------------------------------------------------------
-- 2. Dónde trabaja una persona, ahora con cargo
-- -----------------------------------------------------------------------------

/**
 * Igual que en 0073, más `title` por fila:
 *   · sin la clave o con null, se conserva el cargo que tenga;
 *   · con texto, se guarda recortado; con texto vacío, se borra.
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
    v_role := nullif(v_row ->> 'access_role_id', '')::uuid;
    v_board := nullif(v_row ->> 'role', '')::public.unit_role;
    v_keep_title := not (v_row ? 'title') or jsonb_typeof(v_row -> 'title') = 'null';
    v_title := nullif(trim(coalesce(v_row ->> 'title', '')), '');

    insert into public.unit_members (unit_id, profile_id, access_role_id, role, title)
    values (
      v_unit,
      p_profile,
      v_role,
      coalesce(v_board, (select r.unit_role from public.access_roles r where r.id = v_role), 'visor'),
      v_title
    )
    on conflict (unit_id, profile_id) do update
      set access_role_id = excluded.access_role_id,
          role = coalesce(v_board, public.unit_members.role),
          title = case when v_keep_title then public.unit_members.title else v_title end;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.admin_set_memberships(uuid, jsonb, boolean) is
  'Unidades en las que trabaja una persona, con su rol, su papel y su cargo en cada una. Con p_replace quita las que no vienen. Solo administración.';

-- -----------------------------------------------------------------------------
-- 3. Carga masiva de toda la estructura
-- -----------------------------------------------------------------------------

/**
 * Cada fila: sheet, line, kind (vicerrectoria | facultad | oficina | programa),
 * code, name, slug y, según la clase:
 *   vicerrectoria  substantive_function
 *   facultad       vice_code        (reports_to, organigrama)
 *   oficina        parent_code      (vicerrectoría u oficina; hereda)
 *   programa       snies_code, faculty_code, degree_level, modality, campuses
 *
 * Una unidad existente se reconoce por su código (un programa, antes por su
 * SNIES). Lo que no viene en la hoja —descripción, orden, el padre de una
 * vicerrectoría o facultad— se conserva.
 */
create or replace function public.admin_import_units(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row jsonb;
  v_kind text;
  v_where text;
  v_existing public.units%rowtype;
  v_parent uuid;
  v_reports uuid;
  v_campuses text[];
  v_id uuid;
  v_created integer := 0;
  v_updated integer := 0;
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración carga la estructura institucional.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El archivo no trae unidades.' using errcode = '22023';
  end if;

  for v_row in
    select e
      from jsonb_array_elements(p_rows) with ordinality as t(e, n)
     order by case e ->> 'kind'
                when 'vicerrectoria' then 1
                when 'facultad' then 2
                when 'oficina' then 3
                when 'programa' then 4
                else 5
              end,
              n
  loop
    v_kind := v_row ->> 'kind';
    v_where := format('Hoja %s, fila %s', coalesce(v_row ->> 'sheet', v_kind), coalesce(v_row ->> 'line', '?'));
    v_existing := null;
    v_parent := null;
    v_reports := null;

    if v_kind not in ('vicerrectoria', 'facultad', 'oficina', 'programa') then
      raise exception '%: clase de unidad desconocida «%».', v_where, v_kind using errcode = '22023';
    end if;

    -- ¿Ya existe?
    if v_kind = 'programa' and nullif(trim(v_row ->> 'snies_code'), '') is not null then
      select u.* into v_existing from public.units u where u.snies_code = trim(v_row ->> 'snies_code');
    end if;
    if v_existing.id is null then
      select u.* into v_existing from public.units u where upper(u.code) = upper(trim(v_row ->> 'code'));
      if v_existing.id is not null and v_kind = 'programa' and v_existing.snies_code is not null
         and v_existing.snies_code is distinct from nullif(trim(v_row ->> 'snies_code'), '') then
        raise exception '%: el código «%» ya es del programa con SNIES %.', v_where, v_row ->> 'code', v_existing.snies_code
          using errcode = '23505';
      end if;
    end if;
    if v_existing.id is not null
       and not (v_existing.kind::text = v_kind or (v_kind = 'oficina' and v_existing.kind in ('oficina', 'otra'))) then
      raise exception '%: el código «%» ya es de «%», que no es de esta clase.', v_where, v_row ->> 'code', v_existing.name
        using errcode = '23505';
    end if;

    -- ¿De quién depende?
    if v_kind = 'facultad' and nullif(trim(v_row ->> 'vice_code'), '') is not null then
      select u.id into v_reports from public.units u
       where u.kind = 'vicerrectoria' and upper(u.code) = upper(trim(v_row ->> 'vice_code'));
      if v_reports is null then
        raise exception '%: no existe la vicerrectoría «%».', v_where, v_row ->> 'vice_code' using errcode = '23503';
      end if;
    elsif v_kind = 'oficina' and nullif(trim(v_row ->> 'parent_code'), '') is not null then
      select u.id into v_parent from public.units u
       where u.kind in ('vicerrectoria', 'oficina', 'otra') and upper(u.code) = upper(trim(v_row ->> 'parent_code'));
      -- Una oficina puede depender de otra que viene más abajo en la misma
      -- hoja: se crea sin padre y se engancha en la segunda pasada.
      if v_parent is null and not exists (
        select 1 from jsonb_array_elements(p_rows) e
         where e ->> 'kind' = 'oficina' and upper(trim(e ->> 'code')) = upper(trim(v_row ->> 'parent_code'))
      ) then
        raise exception '%: no existe la vicerrectoría u oficina «%».', v_where, v_row ->> 'parent_code' using errcode = '23503';
      end if;
    elsif v_kind = 'programa' then
      select u.id into v_parent from public.units u
       where u.kind = 'facultad' and upper(u.code) = upper(trim(v_row ->> 'faculty_code'));
      if v_parent is null then
        raise exception '%: no existe la facultad «%».', v_where, v_row ->> 'faculty_code' using errcode = '23503';
      end if;
    end if;

    select coalesce(array_agg(value), '{}') into v_campuses
      from jsonb_array_elements_text(coalesce(v_row -> 'campuses', '[]'::jsonb));

    begin
      v_id := public.admin_save_unit(
        jsonb_build_object(
          'id', v_existing.id,
          'kind', case when v_existing.id is not null then v_existing.kind::text else v_kind end,
          'parent_id', case
                         when v_kind in ('oficina', 'programa') then v_parent
                         else v_existing.parent_id
                       end,
          'code', trim(v_row ->> 'code'),
          'name', trim(v_row ->> 'name'),
          'slug', coalesce(v_existing.slug, v_row ->> 'slug'),
          'description', coalesce(v_existing.description, ''),
          'position', coalesce(v_existing.position, 0),
          'snies_code', case when v_kind = 'programa' then v_row ->> 'snies_code' end,
          'degree_level', case when v_kind = 'programa' then v_row ->> 'degree_level' end,
          'modality', case when v_kind = 'programa' then v_row ->> 'modality' end,
          'substantive_function', case when v_kind = 'vicerrectoria' then v_row ->> 'substantive_function' end,
          'reports_to', case when v_kind = 'facultad' then v_reports end
        ),
        case when v_kind = 'programa' then v_campuses end
      );
    exception when others then
      raise exception '%: %', v_where, sqlerrm using errcode = sqlstate;
    end;

    if v_existing.id is null then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
  end loop;

  -- Segunda pasada: las oficinas que dependían de otra que venía después.
  for v_row in select e from jsonb_array_elements(p_rows) e where e ->> 'kind' = 'oficina' loop
    if nullif(trim(v_row ->> 'parent_code'), '') is null then continue; end if;
    select u.id into v_parent from public.units u
     where u.kind in ('vicerrectoria', 'oficina', 'otra') and upper(u.code) = upper(trim(v_row ->> 'parent_code'));
    begin
      update public.units u
         set parent_id = v_parent
       where upper(u.code) = upper(trim(v_row ->> 'code'))
         and u.parent_id is distinct from v_parent;
    exception when others then
      raise exception 'Hoja %, fila %: %', coalesce(v_row ->> 'sheet', 'Oficinas'), coalesce(v_row ->> 'line', '?'), sqlerrm
        using errcode = sqlstate;
    end;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

comment on function public.admin_import_units(jsonb) is
  'Carga masiva de la estructura (vicerrectorías, facultades, oficinas, programas). Todo o nada. Solo administración.';

revoke all on function public.admin_import_units(jsonb) from public, anon;
grant execute on function public.admin_import_units(jsonb) to authenticated;
revoke all on function public.admin_set_memberships(uuid, jsonb, boolean) from public, anon;
grant execute on function public.admin_set_memberships(uuid, jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';
