CREATE OR REPLACE FUNCTION public.pilo_staff_list()
 RETURNS TABLE(user_id uuid, email text, full_name text, role text, active boolean, created_at timestamp with time zone, last_seen_at timestamp with time zone, confirmed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.pilo_is_admin() then
    raise exception 'Solo la administración ve el personal de Pilo.' using errcode = '42501';
  end if;
  return query
    select s.user_id, s.email, s.full_name, s.role, s.active, s.created_at, s.last_seen_at,
           (a.email_confirmed_at is not null) as confirmed
    from public.pilo_staff s
    left join auth.users a on a.id = s.user_id
    order by s.active desc, s.full_name, s.email;
end;
$function$

CREATE OR REPLACE FUNCTION public.pilo_staff_set(p_user uuid, p_role text DEFAULT NULL::text, p_active boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.pilo_staff;
  v_role text;
  v_active boolean;
begin
  if not public.pilo_is_admin() then
    raise exception 'Solo la administración cambia el personal de Pilo.' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'Falta la persona.' using errcode = '22023';
  end if;
  if p_role is not null and p_role not in ('docencia', 'institucional', 'ambos', 'admin') then
    raise exception 'Rol desconocido: %', p_role using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('pilo_staff_admins'));
  select * into v_row from public.pilo_staff where user_id = p_user for update;
  if not found then
    raise exception 'Esa persona no está en el personal de Pilo.' using errcode = '22023';
  end if;
  v_role := coalesce(p_role, v_row.role);
  v_active := coalesce(p_active, v_row.active);

  if p_user = auth.uid() and v_row.active and v_row.role = 'admin' and (v_role <> 'admin' or not v_active)
     and public.pilo_staff_other_admins(p_user) = 0 then
    raise exception 'Usted es el último administrador activo de Pilo: nómbre a otro antes de dejar de serlo.' using errcode = '42501';
  end if;

  update public.pilo_staff set role = v_role, active = v_active
  where user_id = p_user
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$

CREATE OR REPLACE FUNCTION public.pilo_staff_touch()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.pilo_staff set last_seen_at = now()
  where user_id = auth.uid() and active
$function$

