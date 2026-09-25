-- =============================================================================
-- PDI · 0082 · La sede de una pertenencia, desde Usuarios
-- =============================================================================
-- 0078 añadió `unit_members.campus_id`: quien dirige Fisioterapia en
-- Bucaramanga no escribe la de Cúcuta. Faltaba poder elegirla al asignar a la
-- persona. `admin_set_memberships` recibe ahora `campus_id` en cada fila:
--
--   · sin la clave: conserva la sede que tenga (vacía si la fila es nueva);
--   · null o '': todas las sedes;
--   · una sede: en un programa, debe ser una sede donde se ofrece.
--
-- Requiere 0073/0074 (admin_set_memberships), 0077 (program_campuses) y 0078.
-- Idempotente.
-- =============================================================================

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
  v_keep_campus boolean;
  v_campus uuid;
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
    v_keep_campus := not (v_row ? 'campus_id');
    v_campus := nullif(v_row ->> 'campus_id', '')::uuid;

    if v_campus is not null then
      if not exists (select 1 from public.campuses c where c.id = v_campus) then
        raise exception 'La sede elegida no existe.' using errcode = '23503';
      end if;
      if exists (select 1 from public.units u where u.id = v_unit and u.kind = 'programa')
         and not exists (
           select 1 from public.program_campuses pc
            where pc.program_id = v_unit and pc.campus_id = v_campus and pc.active
         ) then
        raise exception 'El programa no se ofrece en la sede elegida.' using errcode = '23514';
      end if;
    end if;

    insert into public.unit_members (unit_id, profile_id, role, title, campus_id)
    values (v_unit, p_profile, coalesce(v_board, 'visor'), v_title, v_campus)
    on conflict (unit_id, profile_id) do update
      set role = coalesce(v_board, public.unit_members.role),
          title = case when v_keep_title then public.unit_members.title else v_title end,
          campus_id = case when v_keep_campus then public.unit_members.campus_id else v_campus end;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.admin_set_memberships(uuid, jsonb, boolean) is
  'Unidades en las que trabaja una persona, con su función, su cargo y, si se limita, su sede. Con p_replace quita las que no vienen. Solo administración.';

notify pgrst, 'reload schema';
