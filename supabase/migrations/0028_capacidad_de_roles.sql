-- =============================================================================
-- PDI · 0028 · La capacidad de un rol de acceso llega a quienes lo llevan
--
-- En la 0024, profiles.role copia el base_role del rol de acceso, pero solo
-- cuando se toca el perfil (al asignar el rol). Si después se editaba el rol
-- —por ejemplo, un "Editor de Investigación" creado como Consulta que se pasa a
-- Planeación— las personas que ya lo llevaban conservaban la capacidad vieja:
-- la intranet les mostraba "Tu rol permite consultar esta información, no
-- modificarla" y la base les negaba la escritura.
--
--   1. Editar base_role de un rol actualiza a todas las personas que lo llevan.
--   2. sync_profile_role ya no confunde esa actualización con un cambio de rol
--      clásico: si el role nuevo es la capacidad de su rol de acceso, lo deja.
--   3. Se corrigen los perfiles que ya quedaron desfasados.
--
-- Requiere 0024. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. profiles.role sigue a base_role (sin perder el rol de acceso)
-- -----------------------------------------------------------------------------

create or replace function public.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base public.app_role;
begin
  if tg_op = 'UPDATE'
     and new.role is distinct from old.role
     and new.access_role_id is not distinct from old.access_role_id then
    -- Si el role nuevo es justo la capacidad de su rol de acceso, es la
    -- sincronización de abajo (se editó el rol): se conserva el rol de acceso.
    select r.base_role into base from public.access_roles r where r.id = new.access_role_id;
    if base is not null and base = new.role then
      return new;
    end if;
    -- Si no, se cambió el rol clásico (pantallas antiguas, Edge Function): se
    -- busca el rol de acceso equivalente.
    select r.id into new.access_role_id
      from public.access_roles r
     where r.is_system and r.key = new.role::text;
    return new;
  end if;

  if new.access_role_id is null then
    return new;
  end if;
  select r.base_role into base from public.access_roles r where r.id = new.access_role_id;
  if base is not null then
    new.role := base;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Editar la capacidad de un rol la aplica a sus personas
--
-- Corre como quien edita el rol (solo administración puede, por RLS), así que
-- los guardianes de perfiles siguen valiendo: no se puede dejar el portal sin
-- administradores bajando la capacidad de un rol.
-- -----------------------------------------------------------------------------

create or replace function public.access_role_propagate_base()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.base_role is distinct from old.base_role then
    update public.profiles
       set role = new.base_role
     where access_role_id = new.id
       and role is distinct from new.base_role;
  end if;
  return new;
end;
$$;

drop trigger if exists access_roles_propagate_base on public.access_roles;
create trigger access_roles_propagate_base
  after update of base_role on public.access_roles
  for each row execute function public.access_role_propagate_base();

-- -----------------------------------------------------------------------------
-- 3. Perfiles que ya quedaron con la capacidad vieja
-- -----------------------------------------------------------------------------

update public.profiles p
   set role = r.base_role
  from public.access_roles r
 where r.id = p.access_role_id
   and p.role is distinct from r.base_role;

notify pgrst, 'reload schema';
