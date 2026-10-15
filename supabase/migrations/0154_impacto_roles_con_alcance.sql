-- =============================================================================
-- PDI · 0154 · Roles de Impacto con alcance (editor y administrador)
--
-- En Impacto manda la PERTENENCIA (unit_members: unidad + función + sede), y
-- el rol de acceso solo servía para «ver» la pantalla. Esto añade lo que faltaba
-- al crear un rol: que lleve consigo el nivel y el alcance, como ya hacen los
-- informes de UDES en Cifras (access_role_reports):
--
--   access_roles.impact_level      none · editor · admin
--                                  editor  define y captura en su alcance
--                                          (como un Contribuyente);
--                                  admin   además publica, revisa y emite
--                                          informes (como un Gestor).
--   access_roles.all_impact_units  el alcance es toda la estructura
--   access_role_units              si no: estas vicerrectorías, oficinas,
--                                  facultades o programas
--
-- NINGUNA POLÍTICA RLS CAMBIA. Toda la autorización de Impacto pasa por unas
-- pocas funciones que preguntaban a unit_members; ahora preguntan a
-- imp_my_memberships(), que une las pertenencias de la persona con las que su
-- rol le da (editor → 'editor', admin → 'jefe'). Una pertenencia real y una del
-- rol valen igual; la herencia por árbol (unit_chain) también: un rol sobre una
-- facultad alcanza a sus programas.
--
-- Informes de Impacto (0100): quien tiene el alcance por su rol los emite sobre
-- esa unidad aunque el interruptor del tipo siga cerrado. El interruptor sigue
-- mandando para quien solo pertenece a la unidad.
--
-- Requiere 0024, 0057, 0078 y 0100. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El rol lleva su nivel y su alcance
-- -----------------------------------------------------------------------------

alter table public.access_roles
  add column if not exists impact_level text not null default 'none',
  add column if not exists all_impact_units boolean not null default false;

alter table public.access_roles drop constraint if exists access_roles_impact_level_check;
alter table public.access_roles
  add constraint access_roles_impact_level_check check (impact_level in ('none', 'editor', 'admin'));

comment on column public.access_roles.impact_level is
  'Indicadores de Impacto: none (solo ve lo suyo), editor (define y captura) o admin (además publica, revisa y emite informes) dentro del alcance del rol.';
comment on column public.access_roles.all_impact_units is
  'Impacto: el alcance del rol es toda la estructura (vicerrectorías, oficinas, facultades y programas).';

create table if not exists public.access_role_units (
  access_role_id uuid not null references public.access_roles (id) on delete cascade,
  unit_id        uuid not null references public.units (id) on delete cascade,
  primary key (access_role_id, unit_id)
);

create index if not exists access_role_units_unit_idx on public.access_role_units (unit_id);

comment on table public.access_role_units is
  'Alcance de un rol en Impacto: las vicerrectorías, oficinas, facultades o programas sobre los que actúa.';

create or replace function public.access_role_units_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.units u
     where u.id = new.unit_id and u.kind in ('vicerrectoria', 'oficina', 'facultad', 'programa')
  ) then
    raise exception 'Un rol de Impacto se asigna a una vicerrectoría, oficina, facultad o programa.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists access_role_units_guard on public.access_role_units;
create trigger access_role_units_guard
  before insert or update on public.access_role_units
  for each row execute function public.access_role_units_guard();

alter table public.access_role_units enable row level security;

drop policy if exists access_role_units_read on public.access_role_units;
create policy access_role_units_read on public.access_role_units for select to authenticated
  using (public.has_role_at_least('consulta'));

drop policy if exists access_role_units_write on public.access_role_units;
create policy access_role_units_write on public.access_role_units for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.access_role_units to anon, authenticated;
grant insert, update, delete on public.access_role_units to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Las pertenencias efectivas de quien pregunta
-- -----------------------------------------------------------------------------

/** Lo que el rol de acceso de quien pregunta le da en Impacto, como pertenencias sin sede. */
create or replace function public.imp_my_role_scope()
returns table (unit_id uuid, unit_kind text, role text, campus_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         u.kind::text,
         case r.impact_level when 'admin' then 'jefe' else 'editor' end,
         null::uuid
    from public.profiles p
    join public.access_roles r on r.id = p.access_role_id
    join public.units u on u.kind in ('vicerrectoria', 'oficina', 'facultad', 'programa')
   where p.id = auth.uid()
     and p.is_active
     and r.impact_level <> 'none'
     and (
       r.all_impact_units
       or exists (select 1 from public.access_role_units ru where ru.access_role_id = r.id and ru.unit_id = u.id)
     );
$$;

comment on function public.imp_my_role_scope() is
  'Impacto: las unidades sobre las que el rol de acceso de quien pregunta le da editar (editor) o administrar (jefe).';

/** Pertenencias reales (unit_members) más las que da el rol. */
create or replace function public.imp_my_memberships()
returns table (unit_id uuid, role text, campus_id uuid, via_role boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.unit_id, m.role::text, m.campus_id, false
    from public.unit_members m
   where m.profile_id = auth.uid()
  union all
  select given.unit_id, given.role, given.campus_id, true
    from public.imp_my_role_scope() given;
$$;

comment on function public.imp_my_memberships() is
  'Impacto: las pertenencias de quien pregunta, las suyas y las que le da su rol de acceso (via_role).';

revoke all on function public.imp_my_role_scope() from public, anon;
revoke all on function public.imp_my_memberships() from public, anon;
grant execute on function public.imp_my_role_scope() to authenticated;
grant execute on function public.imp_my_memberships() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Las preguntas de permisos, sobre las pertenencias efectivas
--    (mismas firmas que 0078: las políticas no se enteran)
-- -----------------------------------------------------------------------------

create or replace function public.imp_fn_member(target_fn text, minimum text default 'visor')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.imp_my_memberships() m
      join public.imp_unit_functions f on f.unit_id = m.unit_id
     where f.fn = target_fn
       and case minimum
             when 'jefe' then m.role = 'jefe'
             when 'editor' then m.role in ('editor', 'jefe')
             else true
           end
  );
$$;

create or replace function public.imp_can_define(target_fn text, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('admin')
      or exists (
        select 1
          from public.imp_my_memberships() m
          join public.imp_unit_functions f on f.unit_id = m.unit_id and f.fn = target_fn
         where m.unit_id = owner
           and m.role in ('editor', 'jefe')
      );
$$;

create or replace function public.imp_on_program_side()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.imp_my_memberships() m
      join public.units u on u.id = m.unit_id
     where u.kind in ('programa', 'facultad')
  );
$$;

create or replace function public.imp_program_role(program uuid, campus uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
    from public.imp_my_memberships() m
    join public.unit_chain(program) c on c.id = m.unit_id
   where (m.campus_id is null or campus is null or m.campus_id = campus)
   order by c.depth asc,
            case m.role when 'jefe' then 3 when 'editor' then 2 else 1 end desc
   limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 4. Informes de Impacto: ¿de qué unidad puede pedir el informe?
-- -----------------------------------------------------------------------------

/**
 * ¿Pertenece a esa unidad? Con `p_role_only`, solo cuenta lo que le da su rol.
 * Es la misma regla de 0100, sobre las pertenencias efectivas:
 *   programa       pertenecer al programa o a su facultad; con sede, que valga
 *                  para ella; sin sede, una pertenencia sin sede fija.
 *   facultad       pertenecer a ella (decanatura).
 *   vicerrectoria  pertenecer a una unidad que lleva esa función.
 */
create or replace function public.imp_report_scope(p_kind text, p_ref text, p_campus uuid, p_role_only boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if p_kind = 'vicerrectoria' then
    return p_ref in ('investigacion', 'ensenanza', 'extension')
       and exists (
         select 1
           from public.imp_my_memberships() mine
           join public.imp_unit_functions f on f.unit_id = mine.unit_id
          where f.fn = p_ref and (not p_role_only or mine.via_role)
       );
  end if;

  if p_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  target := p_ref::uuid;

  if p_kind = 'programa' then
    return exists (select 1 from public.units u where u.id = target and u.kind = 'programa')
       and exists (
         select 1
           from public.imp_my_memberships() mine
           join public.unit_chain(target) c on c.id = mine.unit_id
          where (mine.campus_id is null or mine.campus_id = p_campus)
            and (not p_role_only or mine.via_role)
       );
  end if;

  if p_kind = 'facultad' then
    return exists (
      select 1
        from public.imp_my_memberships() mine
        join public.units u on u.id = mine.unit_id
       where u.id = target
         and u.kind = 'facultad'
         and (not p_role_only or mine.via_role)
    );
  end if;

  return false;
end;
$$;

revoke all on function public.imp_report_scope(text, text, uuid, boolean) from public, anon;
grant execute on function public.imp_report_scope(text, text, uuid, boolean) to authenticated;

create or replace function public.imp_report_allowed(p_kind text, p_ref text, p_campus uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_open boolean;
begin
  if auth.uid() is null then
    return false;
  end if;
  if public.has_role_at_least('admin') then
    return true;
  end if;

  -- Lo que su rol le da vale sin el interruptor: la administración ya decidió
  -- al asignarle el rol.
  if public.imp_report_scope(p_kind, p_ref, p_campus, true) then
    return true;
  end if;

  select coalesce(s.impacto_report ->> p_kind, 'false') = 'true' into is_open
    from public.pilo_ai_settings s
   where s.id = 1;
  if not coalesce(is_open, false) then
    return false;
  end if;

  return public.imp_report_scope(p_kind, p_ref, p_campus, false);
end;
$$;

comment on function public.imp_report_allowed(text, text, uuid) is
  'Informes de Impacto con Pilo: la administración, siempre; quien tiene la unidad en el alcance de su rol, siempre; los demás, si el tipo está abierto y pertenecen a la unidad.';

notify pgrst, 'reload schema';
