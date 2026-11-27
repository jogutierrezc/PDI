-- =============================================================================
-- PDI · 0297 · Unidades con sede y organigrama por campus
--
-- Requiere 0073 (reports_to), 0077 (admin_save_unit), 0153 y 0192 (informes). Idempotente.
--
-- La UDES tiene unidades que existen una vez por campus: la Rectoría de cada campus
-- (Cúcuta, Valledupar) y la Vicerrectoría Académica de cada uno. Cada una es una UNIDAD
-- aparte, con su propio informe de gestión (0280: un informe por unidad), y sube a la
-- rectoría de su campus; las rectorías de campus suben a la Rectoría General.
--
--   units.campus_id   la sede de la unidad; vacío = toda la universidad. No se usa en
--                     programas: su oferta sigue en program_campuses.
--   admin_save_unit   guarda la sede y, además de las facultades, deja que vicerrectorías,
--                     oficinas y otras dependencias (las rectorías) digan de quién dependen
--                     (reports_to). Al cambiarlo, los informes abiertos de la unidad (borrador
--                     o devuelto, en un ciclo abierto) pasan a subir a la nueva unidad;
--                     los enviados y aprobados no se tocan.
--   unit_members      la sede de una persona en una unidad con sede debe ser esa misma
--                     (o vacía): un vicerrector de Cúcuta no trabaja en Valledupar.
-- =============================================================================

alter table public.units
  add column if not exists campus_id uuid references public.campuses (id) on delete set null;

comment on column public.units.campus_id is
  'Sede de la unidad (0297), p. ej. la Rectoría o la Vicerrectoría Académica de Cúcuta. Vacío = toda la universidad. Los programas usan program_campuses.';

create index if not exists units_campus_idx on public.units (campus_id);

-- 1. Guardar una unidad, ahora con sede y con «depende de» fuera de las facultades.
create or replace function public.admin_save_unit(p_unit jsonb, p_campuses text[] default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_unit ->> 'id', '')::uuid;
  v_kind public.unit_kind := coalesce(nullif(p_unit ->> 'kind', ''), 'oficina')::public.unit_kind;
  v_campus uuid := case when v_kind = 'programa' then null else nullif(p_unit ->> 'campus_id', '')::uuid end;
  v_reports uuid := case when v_kind = 'programa' then null else nullif(p_unit ->> 'reports_to', '')::uuid end;
  v_unknown text;
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración cambia la estructura institucional.' using errcode = '42501';
  end if;
  if coalesce(trim(p_unit ->> 'name'), '') = '' or coalesce(trim(p_unit ->> 'code'), '') = '' then
    raise exception 'La unidad necesita nombre y código.' using errcode = '23514';
  end if;
  if v_reports is not null and v_reports = v_id then
    raise exception 'Una unidad no puede depender de sí misma.' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.units (parent_id, kind, code, name, slug, description, position,
                              snies_code, degree_level, modality, substantive_function, reports_to, campus_id)
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
      v_reports,
      v_campus
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
           reports_to = v_reports,
           campus_id = v_campus
     where u.id = v_id;
    if not found then
      raise exception 'La unidad ya no existe.' using errcode = 'P0002';
    end if;

    -- Los informes abiertos suben a donde dice el organigrama nuevo. Solo quien gestiona
    -- los informes cambia el destino (lo exige el guardián de informe_instancias).
    if to_regclass('public.informe_instancias') is not null and public.informe_gestiona() then
      update public.informe_instancias i
         set destino = (select coalesce(u.reports_to, u.parent_id) from public.units u where u.id = v_id)
       where i.unit_id = v_id
         and i.estado in ('draft', 'back')
         and exists (select 1 from public.informe_ciclos c where c.id = i.ciclo_id and c.estado = 'abierto')
         and i.destino is distinct from (select coalesce(u.reports_to, u.parent_id) from public.units u where u.id = v_id);
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

revoke all on function public.admin_save_unit(jsonb, text[]) from public, anon;
grant execute on function public.admin_save_unit(jsonb, text[]) to authenticated, service_role;

-- 2. En una unidad con sede, la persona trabaja en esa sede (o la deja vacía).
create or replace function public.unit_members_sede_de_la_unidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede uuid;
begin
  select u.campus_id into v_sede from public.units u where u.id = new.unit_id;
  if v_sede is not null and new.campus_id is not null and new.campus_id <> v_sede then
    raise exception 'Esa unidad es de otra sede: deje la sede vacía o elija la de la unidad.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists unit_members_sede_de_la_unidad on public.unit_members;
create trigger unit_members_sede_de_la_unidad
  before insert or update of unit_id, campus_id on public.unit_members
  for each row execute function public.unit_members_sede_de_la_unidad();

notify pgrst, 'reload schema';
