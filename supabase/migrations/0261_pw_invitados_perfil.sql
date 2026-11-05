-- =============================================================================
-- PDI · 0261 · Pilo at Work · invitados UDES y perfil que alimenta Usuarios y roles
--
-- Requiere 0243 (pw_*), 0247 (pw_config), 0120/0175 (pilo_users, pilo_email_rule),
-- 0057 (units, unit_members). Idempotente.
--
-- DECISIÓN.
--   · «Invitado»: cuenta con correo UDES verificado y perfil completo (pw_solicitudes.
--     perfil_completo) sin fila en pw_roles. Lo dice la función NUEVA pw_mi_nivel()
--     (el rol de pw_roles, o 'invitado'; null en cualquier otro caso).
--   · pw_mi_rol() NO cambia: sigue devolviendo solo roles reales. Todas las políticas RLS
--     (memoria personal y colectiva, skills, equipos, documentos, tokens de Microsoft) y
--     las funciones pw-microsoft / pw-avisos preguntan por pw_mi_rol(), así que el
--     invitado queda fuera de todo eso sin tocar una sola política. Solo se abren para
--     él pw_config_publica() y la función pilo-work (chat y redacción, límite propio).
--   · El perfil llega a la administración ya con su unidad (unit_id): aprobar crea el
--     perfil de intranet (profiles), la pertenencia (unit_members) y el rol (pw_roles).
--   · Todo UPDATE y DELETE lleva WHERE (ver 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lo que la persona dice de sí misma
-- -----------------------------------------------------------------------------

alter table public.pw_solicitudes add column if not exists unit_id uuid references public.units(id) on delete set null;
alter table public.pw_solicitudes add column if not exists cargo text not null default '';
alter table public.pw_solicitudes add column if not exists via text not null default '';
alter table public.pw_solicitudes add column if not exists sede text not null default '';
alter table public.pw_solicitudes add column if not exists perfil_completo boolean not null default false;

-- «invitado»: la administración revisó el perfil y lo dejó sin rol.
alter table public.pw_solicitudes drop constraint if exists pw_solicitudes_estado_check;
alter table public.pw_solicitudes add constraint pw_solicitudes_estado_check check (estado in ('pendiente', 'atendida', 'invitado'));

alter table public.pw_config add column if not exists limite_hora_invitado int not null default 10 check (limite_hora_invitado between 1 and 200);

-- -----------------------------------------------------------------------------
-- 2. El nivel de quien consulta: su rol o «invitado»
-- -----------------------------------------------------------------------------

create or replace function public.pw_mi_nivel()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when public.pw_mi_rol() is not null then public.pw_mi_rol()
    when exists (
      select 1
      from auth.users a
      join public.pw_solicitudes s on s.user_id = a.id
      where a.id = auth.uid()
        and a.email_confirmed_at is not null
        and public.pilo_email_rule(lower(a.email)) is not null
        and s.perfil_completo
    ) then 'invitado'
    else null
  end;
$$;

-- La app necesita saber las funciones habilitadas también siendo invitado.
create or replace function public.pw_config_publica()
returns table (funciones jsonb, subida_max_mb int)
language sql
stable
security definer
set search_path = public
as $$
  select c.funciones, c.subida_max_mb from public.pw_config c where c.id = 1 and public.pw_mi_nivel() is not null;
$$;

-- -----------------------------------------------------------------------------
-- 3. Guardar el perfil (lo llama la propia persona, tras verificar su correo)
-- -----------------------------------------------------------------------------

create or replace function public.pw_guardar_perfil(p_nombre text, p_sede text, p_unit_id uuid, p_cargo text, p_via text, p_tipo text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correo text;
  v_confirmado timestamptz;
  v_regla jsonb;
  v_nombre text := left(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), 120);
  v_cargo text := left(btrim(regexp_replace(coalesce(p_cargo, ''), '\s+', ' ', 'g')), 120);
  v_unidad text;
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  select lower(a.email), a.email_confirmed_at into v_correo, v_confirmado from auth.users a where a.id = auth.uid();
  v_regla := public.pilo_email_rule(v_correo);
  if v_regla is null or v_confirmado is null then raise exception 'Pilo at Work pide un correo de la UDES verificado.'; end if;
  if array_length(regexp_split_to_array(v_nombre, '\s+'), 1) < 2 then raise exception 'Escriba nombre y apellido.'; end if;
  if p_sede not in ('bucaramanga', 'cucuta', 'valledupar', 'bogota') then raise exception 'Elija su sede.'; end if;
  if char_length(v_cargo) < 2 then raise exception 'Escriba su cargo.'; end if;
  select u.name into v_unidad from public.units u where u.id = p_unit_id;
  if v_unidad is null then raise exception 'Elija su dependencia de la lista.'; end if;

  -- La cuenta de Pilo toma el nombre, el tipo (si el dominio lo admite) y la sede (si el dominio no la fija).
  update public.pilo_users u set
    full_name = case when char_length(v_nombre) >= 3 then v_nombre else u.full_name end,
    rol = case when p_tipo in ('administrativo', 'profesor') and (v_regla -> 'roles') ? p_tipo then p_tipo else u.rol end,
    campus = case when coalesce(v_regla ->> 'campus', '') = '' then p_sede else u.campus end
  where u.id = auth.uid();

  insert into public.pw_solicitudes (user_id, nombre, correo, dependencia, unit_id, cargo, via, sede, perfil_completo, estado)
  values (auth.uid(), v_nombre, v_correo, v_unidad, p_unit_id, v_cargo, left(coalesce(p_via, ''), 40), p_sede, true,
          case when exists (select 1 from public.pw_roles r where r.user_id = auth.uid()) then 'atendida' else 'pendiente' end)
  on conflict (user_id) do update
    set nombre = excluded.nombre, correo = excluded.correo, dependencia = excluded.dependencia, unit_id = excluded.unit_id,
        cargo = excluded.cargo, sede = excluded.sede, perfil_completo = true,
        via = case when excluded.via <> '' then excluded.via else public.pw_solicitudes.via end,
        estado = excluded.estado
    where public.pw_solicitudes.user_id = excluded.user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Lo que ve la administración
-- -----------------------------------------------------------------------------

drop function if exists public.pw_personas_admin();
create or replace function public.pw_personas_admin()
returns table (
  user_id uuid, nombre text, correo text, dependencia text, rol text, pendiente boolean,
  unit_id uuid, unidad text, cargo text, via text, sede text, creado_en timestamptz, estado text, perfil_completo boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select x.* from (
    select u.id as user_id, coalesce(nullif(s.nombre, ''), u.full_name) as nombre, u.email as correo,
           coalesce(r.dependencia, s.dependencia, '') as dependencia, r.rol,
           (s.estado = 'pendiente' and r.user_id is null) as pendiente,
           s.unit_id, un.name as unidad, coalesce(s.cargo, '') as cargo, coalesce(s.via, '') as via, coalesce(s.sede, '') as sede,
           coalesce(s.creado_en, u.created_at) as creado_en, s.estado, coalesce(s.perfil_completo, false) as perfil_completo
    from public.pilo_users u
    left join public.pw_roles r on r.user_id = u.id
    left join public.pw_solicitudes s on s.user_id = u.id
    left join public.units un on un.id = s.unit_id
    union all
    select r.user_id, r.nombre, r.correo, r.dependencia, r.rol, false, s.unit_id, un.name, coalesce(s.cargo, ''), coalesce(s.via, ''), coalesce(s.sede, ''),
           coalesce(s.creado_en, r.creado_en), s.estado, coalesce(s.perfil_completo, false)
    from public.pw_roles r
    left join public.pw_solicitudes s on s.user_id = r.user_id
    left join public.units un on un.id = s.unit_id
    where not exists (select 1 from public.pilo_users u where u.id = r.user_id)
    union all
    select s.user_id, s.nombre, s.correo, s.dependencia, null, (s.estado = 'pendiente'), s.unit_id, un.name, s.cargo, s.via, s.sede, s.creado_en, s.estado, s.perfil_completo
    from public.pw_solicitudes s
    left join public.units un on un.id = s.unit_id
    where not exists (select 1 from public.pilo_users u where u.id = s.user_id)
      and not exists (select 1 from public.pw_roles r where r.user_id = s.user_id)
  ) x
  where public.pw_es_admin()
  order by 2;
$$;

-- Asignar o quitar un rol (solo administración). p_rol null = quitar.
-- Al asignar a alguien con perfil completo: perfil de intranet, pertenencia a su unidad y rol de Pilo at Work.
-- p_unit_rol: visor | editor | jefe (null = visor, o el que ya tenía).
drop function if exists public.pw_asignar_rol(uuid, text, text);
create or replace function public.pw_asignar_rol(p_user uuid, p_rol text, p_dependencia text, p_unit_rol text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_correo text;
  v_sol public.pw_solicitudes;
  v_unit_rol public.unit_role := nullif(p_unit_rol, '')::public.unit_role;
begin
  if not public.pw_es_admin() then raise exception 'solo la administración asigna roles'; end if;
  if p_rol is null or p_rol = '' then
    delete from public.pw_roles where user_id = p_user;
    return;
  end if;
  select * into v_sol from public.pw_solicitudes where user_id = p_user and perfil_completo;
  select u.full_name, u.email into v_nombre, v_correo from public.pilo_users u where u.id = p_user;
  if v_correo is null then
    select coalesce(a.raw_user_meta_data ->> 'full_name', ''), coalesce(a.email, '') into v_nombre, v_correo from auth.users a where a.id = p_user;
  end if;
  if v_sol.user_id is not null then v_nombre := v_sol.nombre; end if;

  insert into public.pw_roles (user_id, rol, dependencia, nombre, correo, asignado_por)
  values (p_user, p_rol, left(coalesce(nullif(p_dependencia, ''), v_sol.dependencia, ''), 120), coalesce(v_nombre, ''), coalesce(v_correo, ''), auth.uid())
  on conflict (user_id) do update
    set rol = excluded.rol, dependencia = excluded.dependencia, asignado_por = excluded.asignado_por, actualizado_en = now()
    where public.pw_roles.user_id = excluded.user_id;

  if v_sol.user_id is not null and v_sol.unit_id is not null then
    -- Perfil de intranet: nunca se toca el rol de quien ya lo tiene.
    insert into public.profiles (id, email, full_name, unit, is_active)
    values (p_user, coalesce(v_correo, ''), coalesce(v_nombre, ''), v_sol.dependencia, true)
    on conflict (id) do update
      set full_name = excluded.full_name, unit = excluded.unit, is_active = true
      where public.profiles.id = excluded.id;
    insert into public.unit_members (unit_id, profile_id, role)
    values (v_sol.unit_id, p_user, coalesce(v_unit_rol, 'visor'))
    on conflict (unit_id, profile_id) do update
      set role = coalesce(v_unit_rol, public.unit_members.role)
      where public.unit_members.unit_id = excluded.unit_id and public.unit_members.profile_id = excluded.profile_id;
  end if;
  update public.pw_solicitudes set estado = 'atendida' where user_id = p_user;
end;
$$;

-- La administración revisó el perfil y la persona sigue como invitada.
create or replace function public.pw_dejar_invitado(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pw_es_admin() then raise exception 'solo la administración revisa perfiles'; end if;
  update public.pw_solicitudes set estado = 'invitado' where user_id = p_user and not exists (select 1 from public.pw_roles r where r.user_id = p_user);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Permisos
-- -----------------------------------------------------------------------------

do $$
declare f text;
begin
  foreach f in array array['pw_mi_nivel()', 'pw_config_publica()', 'pw_guardar_perfil(text, text, uuid, text, text, text)', 'pw_personas_admin()', 'pw_asignar_rol(uuid, text, text, text)', 'pw_dejar_invitado(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
