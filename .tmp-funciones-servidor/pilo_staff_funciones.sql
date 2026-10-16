=== pilo_is_admin ===
CREATE OR REPLACE FUNCTION public.pilo_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.pilo_staff_role() = 'admin', false)
$function$

=== pilo_staff_check_insert ===
CREATE OR REPLACE FUNCTION public.pilo_staff_check_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from auth.users a where a.id = new.user_id and lower(a.email) = new.email) then
    raise exception 'Esa cuenta no existe o su correo no coincide.' using errcode = '23514';
  end if;
  if exists (select 1 from public.pilo_users u where u.id = new.user_id) then
    raise exception 'Esa cuenta es un Usuario de Pilo: no puede ser personal.' using errcode = '23514';
  end if;
  return new;
end;
$function$

=== pilo_staff_keep_admin ===
CREATE OR REPLACE FUNCTION public.pilo_staff_keep_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and old.user_id = auth.uid() and old.active and old.role = 'admin' then
    -- Un solo cambio de admins a la vez: dos últimos admins no se quitan en paralelo.
    perform pg_advisory_xact_lock(hashtext('pilo_staff_admins'));
  end if;
  if auth.uid() is not null and old.user_id = auth.uid() and old.active and old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.active)
     and public.pilo_staff_other_admins(old.user_id) = 0 then
    raise exception 'Usted es el último administrador activo de Pilo: nómbre a otro antes de dejar de serlo.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$

=== pilo_staff_other_admins ===
CREATE OR REPLACE FUNCTION public.pilo_staff_other_admins(p_exclude uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::integer from (
    select s.user_id as id from public.pilo_staff s
    where s.active and s.role = 'admin' and s.user_id is distinct from p_exclude
    union
    select p.id from public.profiles p
    where p.role = 'admin' and p.is_active and p.id is distinct from p_exclude
      and not exists (select 1 from public.pilo_staff s2 where s2.user_id = p.id and s2.active)
  ) x
$function$

=== pilo_staff_remove_row ===
CREATE OR REPLACE FUNCTION public.pilo_staff_remove_row(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.pilo_staff;
begin
  if not public.pilo_is_service() then
    raise exception 'Solo la función de Pilo quita personal.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('pilo_staff_admins'));
  select * into v_row from public.pilo_staff where user_id = p_user for update;
  if not found then
    raise exception 'Esa persona no está en el personal de Pilo.' using errcode = '22023';
  end if;
  if v_row.active and v_row.role = 'admin' and public.pilo_staff_other_admins(p_user) = 0 then
    raise exception 'Es el último administrador activo de Pilo.' using errcode = '23514';
  end if;
  delete from public.pilo_staff where user_id = p_user;
  return jsonb_build_object('user_id', v_row.user_id, 'created_by', v_row.created_by, 'role', v_row.role);
end;
$function$

=== pilo_staff_role ===
CREATE OR REPLACE FUNCTION public.pilo_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select s.role from public.pilo_staff s where s.user_id = auth.uid() and s.active),
    case when public.has_role_at_least('admin') then 'admin' end
  )
$function$

