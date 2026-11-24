-- =============================================================================
-- PDI · 0243 · Pilo at Work · base (prefijo pw_)
--
-- Requiere 0002 (has_role_at_least) y 0120 (pilo_users). Idempotente.
--
-- HALLAZGO. Pilo at Work es un agente de trabajo para las oficinas de la universidad.
-- Las cuentas ya existen (Pilo: pilo_users con OTP y Microsoft; intranet: profiles),
-- pero no hay nada que diga QUIÉN puede usar el agente de trabajo, ni dónde guardar
-- la memoria de trabajo de cada persona sin mezclarla con pilo_memory (la del portal).
--
-- DECISIÓN.
--   · Roles en tabla propia pw_roles. Sin fila = cuenta verificada sin acceso. La
--     función pw_mi_rol() (security definer) manda; las políticas RLS la consultan.
--     Quien es administrador del portal (has_role_at_least('admin')) es «admin» de
--     Pilo at Work sin fila, y administra pw_roles.
--   · Memoria independiente: pw_memoria (personal), pw_memoria_colectiva (la oficina,
--     solo la administración escribe) y pw_propuestas (reglas que las personas
--     proponen a la colectiva; la administración aprueba, edita o rechaza).
--   · pw_skills: por persona (alcance «personal») y de la oficina (alcance «oficina»,
--     solo la publica la administración; la persona puede copiarlas).
--   · pw_documentos e historial: los documentos de Cowork con su deshacer.
--   · pw_senales: contador de tareas repetidas para que Pilo proponga una skill.
--   · pw_bitacora: quién usó qué y cuándo; NUNCA contenidos (solo la escribe el servidor).
--
-- Todo DELETE y UPDATE lleva WHERE (ver 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Roles y solicitudes
-- -----------------------------------------------------------------------------

create table if not exists public.pw_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('colaborador', 'colaborador_correo', 'coordinacion', 'admin')),
  dependencia text not null default '',
  nombre text not null default '',
  correo text not null default '',
  asignado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.pw_solicitudes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  correo text not null default '',
  dependencia text not null default '',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'atendida')),
  creado_en timestamptz not null default now()
);

-- El rol de quien consulta: el de pw_roles, o «admin» si administra el portal. Null = sin acceso.
create or replace function public.pw_mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when public.has_role_at_least('admin') then 'admin'
    else (select r.rol from public.pw_roles r where r.user_id = auth.uid())
  end;
$$;

create or replace function public.pw_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.pw_mi_rol() = 'admin', false);
$$;

-- La persona dice que verificó su cuenta y falta su rol: queda la solicitud para la administración.
create or replace function public.pw_solicitar_rol(p_dependencia text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_correo text;
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  select u.full_name, u.email into v_nombre, v_correo from public.pilo_users u where u.id = auth.uid();
  if v_correo is null then
    select coalesce(a.raw_user_meta_data ->> 'full_name', ''), coalesce(a.email, '') into v_nombre, v_correo from auth.users a where a.id = auth.uid();
  end if;
  insert into public.pw_solicitudes (user_id, nombre, correo, dependencia)
  values (auth.uid(), coalesce(v_nombre, ''), coalesce(v_correo, ''), left(coalesce(p_dependencia, ''), 120))
  on conflict (user_id) do update
    set dependencia = case when excluded.dependencia <> '' then excluded.dependencia else public.pw_solicitudes.dependencia end,
        estado = 'pendiente'
    where public.pw_solicitudes.user_id = excluded.user_id;
end;
$$;

-- La administración ve a las personas con cuenta de Pilo y su rol (o la falta de él).
create or replace function public.pw_personas_admin()
returns table (user_id uuid, nombre text, correo text, dependencia text, rol text, pendiente boolean)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.full_name, u.email, coalesce(r.dependencia, s.dependencia, ''), r.rol, (s.estado = 'pendiente' and r.user_id is null)
  from public.pilo_users u
  left join public.pw_roles r on r.user_id = u.id
  left join public.pw_solicitudes s on s.user_id = u.id
  where public.pw_es_admin()
  union
  select r.user_id, r.nombre, r.correo, r.dependencia, r.rol, false
  from public.pw_roles r
  where public.pw_es_admin() and not exists (select 1 from public.pilo_users u where u.id = r.user_id)
  order by 2;
$$;

-- Asignar o quitar un rol (solo administración). p_rol null = quitar.
create or replace function public.pw_asignar_rol(p_user uuid, p_rol text, p_dependencia text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_correo text;
begin
  if not public.pw_es_admin() then raise exception 'solo la administración asigna roles'; end if;
  if p_rol is null or p_rol = '' then
    delete from public.pw_roles where user_id = p_user;
    return;
  end if;
  select u.full_name, u.email into v_nombre, v_correo from public.pilo_users u where u.id = p_user;
  if v_correo is null then
    select coalesce(a.raw_user_meta_data ->> 'full_name', ''), coalesce(a.email, '') into v_nombre, v_correo from auth.users a where a.id = p_user;
  end if;
  insert into public.pw_roles (user_id, rol, dependencia, nombre, correo, asignado_por)
  values (p_user, p_rol, left(coalesce(p_dependencia, ''), 120), coalesce(v_nombre, ''), coalesce(v_correo, ''), auth.uid())
  on conflict (user_id) do update
    set rol = excluded.rol, dependencia = excluded.dependencia, asignado_por = excluded.asignado_por, actualizado_en = now()
    where public.pw_roles.user_id = excluded.user_id;
  update public.pw_solicitudes set estado = 'atendida' where user_id = p_user;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Memoria personal, colectiva y propuestas
-- -----------------------------------------------------------------------------

create table if not exists public.pw_memoria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  texto text not null check (char_length(texto) between 3 and 600),
  origen text not null default '',
  confianza text not null default 'media' check (confianza in ('alta', 'media', 'nueva')),
  activa boolean not null default true,
  estado text not null default 'aceptada' check (estado in ('propuesta', 'aceptada')),
  nueva boolean not null default false,
  creado_en timestamptz not null default now(),
  busqueda tsvector generated always as (to_tsvector('spanish', texto)) stored
);
create index if not exists pw_memoria_user_idx on public.pw_memoria (user_id, creado_en desc);
create index if not exists pw_memoria_busqueda_idx on public.pw_memoria using gin (busqueda);

create table if not exists public.pw_memoria_colectiva (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (char_length(texto) between 3 and 600),
  activa boolean not null default true,
  usos int not null default 0,
  publicada_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  busqueda tsvector generated always as (to_tsvector('spanish', texto)) stored
);
create index if not exists pw_memoria_colectiva_busqueda_idx on public.pw_memoria_colectiva using gin (busqueda);

create table if not exists public.pw_propuestas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  autor text not null default '',
  texto text not null check (char_length(texto) between 3 and 600),
  origen text not null default '',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  resuelto_por uuid references auth.users(id) on delete set null,
  resuelto_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists pw_propuestas_estado_idx on public.pw_propuestas (estado, creado_en desc);

-- -----------------------------------------------------------------------------
-- 3. Skills, documentos, señales y bitácora
-- -----------------------------------------------------------------------------

create table if not exists public.pw_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  alcance text not null default 'personal' check (alcance in ('personal', 'oficina')),
  nombre text not null check (char_length(nombre) between 2 and 120),
  cuando text not null default '' check (char_length(cuando) <= 300),
  instrucciones text not null default '' check (char_length(instrucciones) <= 4000),
  herramientas text[] not null default '{}',
  activa boolean not null default true,
  usos int not null default 0,
  color text not null default 'k1',
  nueva boolean not null default false,
  creado_en timestamptz not null default now(),
  constraint pw_skills_dueno check ((alcance = 'personal' and user_id is not null) or (alcance = 'oficina' and user_id is null))
);
create index if not exists pw_skills_user_idx on public.pw_skills (user_id);

create table if not exists public.pw_documentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null default 'Documento sin título' check (char_length(titulo) <= 160),
  tipo text not null default 'informe',
  bloques jsonb not null default '[]'::jsonb,
  equipo_id uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists pw_documentos_user_idx on public.pw_documentos (user_id, actualizado_en desc);

create table if not exists public.pw_documento_historial (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.pw_documentos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  resumen text not null default '',
  bloques jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now()
);
create index if not exists pw_documento_historial_idx on public.pw_documento_historial (documento_id, creado_en desc);

create table if not exists public.pw_senales (
  user_id uuid not null references auth.users(id) on delete cascade,
  clave text not null check (char_length(clave) <= 80),
  n int not null default 0,
  descartada boolean not null default false,
  actualizado_en timestamptz not null default now(),
  primary key (user_id, clave)
);

-- Solo identifica la acción: nunca el texto, el correo ni los archivos.
create table if not exists public.pw_bitacora (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  accion text not null check (char_length(accion) <= 60),
  detalle jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);
create index if not exists pw_bitacora_idx on public.pw_bitacora (creado_en desc);

-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------

alter table public.pw_roles enable row level security;
alter table public.pw_solicitudes enable row level security;
alter table public.pw_memoria enable row level security;
alter table public.pw_memoria_colectiva enable row level security;
alter table public.pw_propuestas enable row level security;
alter table public.pw_skills enable row level security;
alter table public.pw_documentos enable row level security;
alter table public.pw_documento_historial enable row level security;
alter table public.pw_senales enable row level security;
alter table public.pw_bitacora enable row level security;

do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in
    ('pw_roles','pw_solicitudes','pw_memoria','pw_memoria_colectiva','pw_propuestas','pw_skills','pw_documentos','pw_documento_historial','pw_senales','pw_bitacora')
    and policyname like 'pw\_%' escape '\'
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Roles: cada quien ve el suyo; la administración ve y escribe todos (escribe con pw_asignar_rol).
create policy pw_roles_ver on public.pw_roles for select to authenticated using (user_id = auth.uid() or public.pw_es_admin());
create policy pw_roles_admin on public.pw_roles for all to authenticated using (public.pw_es_admin()) with check (public.pw_es_admin());
create policy pw_solicitudes_ver on public.pw_solicitudes for select to authenticated using (user_id = auth.uid() or public.pw_es_admin());

-- Memoria personal: solo de su dueña, y solo con rol.
create policy pw_memoria_propia on public.pw_memoria for all to authenticated
  using (user_id = auth.uid() and public.pw_mi_rol() is not null)
  with check (user_id = auth.uid() and public.pw_mi_rol() is not null);

-- Colectiva: la lee quien tiene rol; la escribe la administración.
create policy pw_colectiva_leer on public.pw_memoria_colectiva for select to authenticated using (public.pw_mi_rol() is not null);
create policy pw_colectiva_admin on public.pw_memoria_colectiva for all to authenticated using (public.pw_es_admin()) with check (public.pw_es_admin());

-- Propuestas: cada quien crea y ve las suyas; la administración ve y resuelve todas.
create policy pw_propuestas_ver on public.pw_propuestas for select to authenticated using (user_id = auth.uid() or public.pw_es_admin());
create policy pw_propuestas_crear on public.pw_propuestas for insert to authenticated
  with check (user_id = auth.uid() and estado = 'pendiente' and public.pw_mi_rol() is not null);
create policy pw_propuestas_resolver on public.pw_propuestas for update to authenticated using (public.pw_es_admin()) with check (public.pw_es_admin());
create policy pw_propuestas_borrar on public.pw_propuestas for delete to authenticated using (public.pw_es_admin());

-- Skills: las personales de su dueña; las de la oficina las lee quien tiene rol y las escribe la administración.
create policy pw_skills_personales on public.pw_skills for all to authenticated
  using (alcance = 'personal' and user_id = auth.uid() and public.pw_mi_rol() is not null)
  with check (alcance = 'personal' and user_id = auth.uid() and public.pw_mi_rol() is not null);
create policy pw_skills_oficina_leer on public.pw_skills for select to authenticated using (alcance = 'oficina' and public.pw_mi_rol() is not null);
create policy pw_skills_oficina_admin on public.pw_skills for all to authenticated
  using (alcance = 'oficina' and public.pw_es_admin()) with check (alcance = 'oficina' and public.pw_es_admin());

-- Documentos e historial: de su dueña.
create policy pw_documentos_propios on public.pw_documentos for all to authenticated
  using (user_id = auth.uid() and public.pw_mi_rol() is not null)
  with check (user_id = auth.uid() and public.pw_mi_rol() is not null);
create policy pw_historial_propio on public.pw_documento_historial for all to authenticated
  using (user_id = auth.uid() and public.pw_mi_rol() is not null)
  with check (user_id = auth.uid() and public.pw_mi_rol() is not null and exists (select 1 from public.pw_documentos d where d.id = documento_id and d.user_id = auth.uid()));

create policy pw_senales_propias on public.pw_senales for all to authenticated
  using (user_id = auth.uid() and public.pw_mi_rol() is not null)
  with check (user_id = auth.uid() and public.pw_mi_rol() is not null);

-- Bitácora: solo la lee la administración; solo la escribe el servidor (service_role omite RLS).
create policy pw_bitacora_ver on public.pw_bitacora for select to authenticated using (public.pw_es_admin());

-- -----------------------------------------------------------------------------
-- 5. Uso para la administración (sin contenidos)
-- -----------------------------------------------------------------------------

create or replace function public.pw_uso_admin()
returns table (personas int, con_rol int, solicitudes int, reglas_activas int, propuestas int, acciones_30d int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.pilo_users),
    (select count(*)::int from public.pw_roles),
    (select count(*)::int from public.pw_solicitudes where estado = 'pendiente'),
    (select count(*)::int from public.pw_memoria_colectiva where activa),
    (select count(*)::int from public.pw_propuestas where estado = 'pendiente'),
    (select count(*)::int from public.pw_bitacora where creado_en > now() - interval '30 days')
  where public.pw_es_admin();
$$;

-- Suma uso a una regla colectiva o a una skill; lo llama solo el servidor.
create or replace function public.pw_sumar_uso(p_tabla text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tabla = 'colectiva' then
    update public.pw_memoria_colectiva set usos = usos + 1 where id = any (p_ids);
  elsif p_tabla = 'skills' then
    update public.pw_skills set usos = usos + 1 where id = any (p_ids);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Permisos
-- -----------------------------------------------------------------------------

do $$
declare f text;
begin
  foreach f in array array['pw_mi_rol()', 'pw_es_admin()', 'pw_solicitar_rol(text)', 'pw_personas_admin()', 'pw_asignar_rol(uuid, text, text)', 'pw_uso_admin()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  revoke all on function public.pw_sumar_uso(text, uuid[]) from public, anon, authenticated;
  grant execute on function public.pw_sumar_uso(text, uuid[]) to service_role;
end $$;

revoke all on table public.pw_bitacora from anon;
grant select, insert, update, delete on table
  public.pw_roles, public.pw_solicitudes, public.pw_memoria, public.pw_memoria_colectiva, public.pw_propuestas,
  public.pw_skills, public.pw_documentos, public.pw_documento_historial, public.pw_senales
  to authenticated;
grant select on table public.pw_bitacora to authenticated;
grant all on table
  public.pw_roles, public.pw_solicitudes, public.pw_memoria, public.pw_memoria_colectiva, public.pw_propuestas,
  public.pw_skills, public.pw_documentos, public.pw_documento_historial, public.pw_senales, public.pw_bitacora
  to service_role;

notify pgrst, 'reload schema';
