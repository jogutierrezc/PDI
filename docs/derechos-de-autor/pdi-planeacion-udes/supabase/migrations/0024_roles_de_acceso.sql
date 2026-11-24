-- =============================================================================
-- PDI · 0024 · Roles de acceso por área
--
-- Hasta aquí el acceso era una escalera de cuatro peldaños: consulta,
-- responsable, planeación y administración. Sirve para el Plan de Desarrollo,
-- donde el rol responsable ya se limita a sus pilares (pillar_owners), pero no
-- para UDES en Cifras: quien podía escribir, escribía los nueve informes.
--
-- Una oficina que reporta su propio informe —la Vicerrectoría de
-- Investigaciones, por ejemplo— necesita entrar, cargar y publicar lo suyo, y
-- no ver ni tocar lo demás. Crear un valor de enum por cada oficina obligaría a
-- una migración cada vez, así que los roles pasan a ser datos:
--
--   access_roles          un rol con nombre propio ("Editor de Investigación"):
--                         qué capacidad tiene (base_role), qué pantallas de la
--                         intranet ve y si alcanza a todos los informes
--   access_role_reports   si no alcanza a todos: sobre cuáles escribe, por slug
--                         (el slug sobrevive al cambio de periodo; el id no)
--   profiles.access_role_id   el rol de cada persona
--
-- profiles.role se mantiene y se sincroniza con base_role, así que todas las
-- políticas que ya existen (has_role_at_least, can_edit_pillar) siguen
-- funcionando igual. Lo que cambia es UDES en Cifras: la escritura pasa a
-- preguntar od_can_edit_report(), que es capacidad de planeación **y** ese
-- informe asignado.
--
-- Requiere 0001-0002 y 0019-0022. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Roles de acceso
-- -----------------------------------------------------------------------------

create table if not exists public.access_roles (
  id           uuid primary key default gen_random_uuid(),
  key          text not null,
  name         text not null,
  description  text not null default '',
  -- Qué puede hacer: la escalera de siempre.
  base_role    public.app_role not null default 'consulta',
  -- Qué pantallas de la intranet ve. Ids de AdminShell: pillars, projects,
  -- faculties, campus, budget, repository, cifras, structure, parameters,
  -- development, users.
  screens      text[] not null default '{}',
  all_screens  boolean not null default false,
  -- UDES en Cifras: todos los informes o los de access_role_reports.
  all_reports  boolean not null default false,
  -- Los cuatro roles clásicos no se borran: son la red de seguridad.
  is_system    boolean not null default false,
  position     smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint access_roles_key_unique unique (key)
);

comment on table public.access_roles is
  'Roles de acceso como datos: capacidad, pantallas visibles e informes propios.';

drop trigger if exists access_roles_set_updated_at on public.access_roles;
create trigger access_roles_set_updated_at
  before update on public.access_roles
  for each row execute function public.set_updated_at();

create table if not exists public.access_role_reports (
  access_role_id uuid not null references public.access_roles (id) on delete cascade,
  -- Slug del informe en UDES en Cifras: 'investigacion', 'poblacional'…
  report_slug    text not null,
  primary key (access_role_id, report_slug)
);

comment on table public.access_role_reports is
  'Informes de UDES en Cifras que un rol de acceso puede escribir y ver en borrador.';

alter table public.profiles
  add column if not exists access_role_id uuid references public.access_roles (id) on delete set null;

comment on column public.profiles.access_role_id is
  'Rol de acceso. Su base_role manda sobre profiles.role, que se sincroniza solo.';

-- -----------------------------------------------------------------------------
-- 2. Los cuatro roles de siempre, ya como datos
-- -----------------------------------------------------------------------------

insert into public.access_roles (key, name, description, base_role, screens, all_screens, all_reports, is_system, position)
values
  ('consulta', 'Consulta', 'Lee toda la intranet, no edita nada.', 'consulta', '{}', true, true, true, 1),
  ('responsable', 'Responsable de pilar', 'Edita únicamente los pilares que tiene asignados.', 'responsable', '{}', true, true, true, 2),
  ('planeacion', 'Planeación', 'Edita cualquier pilar y decide qué se publica.', 'planeacion', '{}', true, true, true, 3),
  ('admin', 'Administrador', 'Todo lo anterior, más la gestión de usuarios.', 'admin', '{}', true, true, true, 4)
on conflict (key) do update
  set name = excluded.name,
      base_role = excluded.base_role,
      all_screens = excluded.all_screens,
      all_reports = excluded.all_reports,
      is_system = true;

-- Cada perfil arranca con el rol de acceso que corresponde al que ya tenía.
update public.profiles p
   set access_role_id = r.id
  from public.access_roles r
 where p.access_role_id is null
   and r.is_system
   and r.key = p.role::text;

-- -----------------------------------------------------------------------------
-- 3. profiles.role sigue a base_role
--
-- Toda la autorización existente (has_role_at_least, can_edit_pillar y las
-- políticas del Plan de Desarrollo) lee profiles.role. En vez de reescribirla,
-- el rol de acceso la alimenta: cambiar de rol de acceso cambia la capacidad.
--
-- El disparador se llama "aa_" para correr antes que los guardianes: así el
-- guardián del último administrador ve el rol que va a quedar, no el anterior.
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
  -- Si se cambió el rol clásico y no el de acceso (pantallas antiguas, o el
  -- alta desde la Edge Function), se busca el rol de acceso equivalente.
  if tg_op = 'UPDATE'
     and new.role is distinct from old.role
     and new.access_role_id is not distinct from old.access_role_id then
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

drop trigger if exists profiles_sync_role on public.profiles;
drop trigger if exists aa_profiles_sync_role on public.profiles;
create trigger aa_profiles_sync_role
  before insert or update on public.profiles
  for each row execute function public.sync_profile_role();

-- Cambiar de rol de acceso es cambiar de privilegios: solo administración.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Desde el editor SQL o una migración no hay sesión de usuario: quien tiene
  -- la clave del proyecto ya manda sobre la base.
  if public.is_direct_session() or public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'Solo un administrador puede cambiar el rol de un perfil.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'Solo un administrador puede activar o desactivar un perfil.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.access_role_id is distinct from old.access_role_id then
    raise exception 'Solo un administrador puede cambiar el rol de acceso de un perfil.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Las preguntas que hacen la interfaz y la seguridad
-- -----------------------------------------------------------------------------

-- ¿Tiene rol de acceso asignado? Sin él, todo se comporta como antes de 0024.
create or replace function public.has_access_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.access_role_id is not null
  );
$$;

-- ¿Su rol alcanza a todos los informes de UDES en Cifras?
create or replace function public.has_all_reports()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.access_roles r on r.id = p.access_role_id
    where p.id = auth.uid() and p.is_active and r.all_reports
  );
$$;

-- ¿Ve esta pantalla de la intranet? Sin rol de acceso, las de siempre.
create or replace function public.has_screen(screen text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_role() is null then false
    when screen = 'users' and not public.has_role_at_least('admin') then false
    when not public.has_access_role() then true
    else exists (
      select 1
      from public.profiles p
      join public.access_roles r on r.id = p.access_role_id
      where p.id = auth.uid()
        and (r.all_screens or screen = any (r.screens))
    )
  end;
$$;

comment on function public.has_screen(text) is
  'Pantalla de la intranet visible para quien pide. Sin rol de acceso asignado, todas.';

-- Slug del informe: los roles hablan de informes por slug, que sobrevive al
-- cambio de periodo.
create or replace function public.od_report_slug(target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select slug from public.od_reports where id = target;
$$;

-- ¿Tiene este informe asignado en su rol?
create or replace function public.od_report_assigned(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target is not null and exists (
    select 1
    from public.profiles p
    join public.access_role_reports ar on ar.access_role_id = p.access_role_id
    where p.id = auth.uid()
      and p.is_active
      and ar.report_slug = public.od_report_slug(target)
  );
$$;

-- ¿Puede escribir en este informe? Capacidad de planeación y el informe suyo.
create or replace function public.od_can_edit_report(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion')
     and (
       public.has_role_at_least('admin')
       or not public.has_access_role()
       or public.has_all_reports()
       or public.od_report_assigned(target)
     );
$$;

comment on function public.od_can_edit_report(uuid) is
  'Escritura en UDES en Cifras: capacidad de planeación y ese informe asignado.';

-- Lo común del periodo (años, corte, campus, informes nuevos) exige alcance a
-- todos los informes: no lo decide una sola oficina.
create or replace function public.od_can_edit_period()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion')
     and (public.has_role_at_least('admin') or not public.has_access_role() or public.has_all_reports());
$$;

-- ¿Ve este informe en la intranet? Un rol con informes propios no ve los ajenos.
create or replace function public.od_can_see_report(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('admin')
      or not public.has_access_role()
      or public.has_all_reports()
      or public.od_report_assigned(target);
$$;

-- Lectura: lo publicado es público; en la intranet, además, los suyos.
-- El parámetro conserva el nombre de 0019: renombrarlo rompe el "replace".
create or replace function public.od_can_read(report uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.od_report_is_public(report)
      or (public.has_role_at_least('consulta') and public.od_can_see_report(report));
$$;

-- Importar un informe completo: el mismo permiso que escribirlo. La 0022 llama
-- a esta función; aquí se le añade el alcance por informe.
create or replace function public.od_import_allowed(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_direct_session() or public.od_can_edit_report(target);
$$;

-- -----------------------------------------------------------------------------
-- 5. Escritura de UDES en Cifras, informe por informe
--
-- Las tablas que cuelgan de un informe preguntan por ese informe; las comunes
-- del periodo siguen pidiendo alcance completo.
-- -----------------------------------------------------------------------------

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('od_indicators',       'report_id'),
      ('od_values',           '(select i.report_id from public.od_indicators i where i.id = indicator_id)'),
      ('od_breakdowns',       'report_id'),
      ('od_breakdown_values', '(select b.report_id from public.od_breakdowns b where b.id = breakdown_id)'),
      ('od_heatmaps',         'report_id'),
      ('od_heatmap_cells',    '(select h.report_id from public.od_heatmaps h where h.id = heatmap_id)'),
      ('od_maps',             'report_id'),
      ('od_map_values',       '(select m.report_id from public.od_maps m where m.id = map_id)'),
      ('od_pipelines',        'report_id'),
      ('od_pipeline_values',  '(select p.report_id from public.od_pipelines p where p.id = pipeline_id)'),
      ('od_histories',        'report_id'),
      ('od_history_values',   '(select s.report_id from public.od_histories s where s.id = history_id)'),
      ('od_sections',         'report_id'),
      ('od_tables',           'report_id'),
      ('od_table_rows',       '(select t2.report_id from public.od_tables t2 where t2.id = table_id)'),
      ('od_report_blocks',    'report_id'),
      ('od_imports',          'report_id'),
      ('od_publications',     'report_id')
    ) as v(table_name, report_expr)
  loop
    if to_regclass('public.' || t.table_name) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t.table_name || '_write', t.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.od_can_edit_report(%s)) with check (public.od_can_edit_report(%s))',
      t.table_name || '_write', t.table_name, t.report_expr, t.report_expr
    );
  end loop;
end $$;

-- El informe en sí: se edita el propio, se crean y se borran con alcance
-- completo.
drop policy if exists od_reports_write on public.od_reports;
create policy od_reports_write on public.od_reports for update to authenticated
  using (public.od_can_edit_report(id)) with check (public.od_can_edit_report(id));

drop policy if exists od_reports_create on public.od_reports;
create policy od_reports_create on public.od_reports for insert to authenticated
  with check (public.od_can_edit_period());

drop policy if exists od_reports_delete on public.od_reports;
create policy od_reports_delete on public.od_reports for delete to authenticated
  using (public.od_can_edit_period());

do $$
declare
  name text;
begin
  foreach name in array array['od_periods', 'od_period_campuses'] loop
    execute format('drop policy if exists %I on public.%I', name || '_write', name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.od_can_edit_period()) with check (public.od_can_edit_period())',
      name || '_write', name
    );
  end loop;
end $$;

-- Las oficinas son un catálogo compartido: quien escribe un informe puede
-- añadir la suya (el importador crea la oficina que firma el informe).
drop policy if exists od_offices_write on public.od_offices;
create policy od_offices_write on public.od_offices for all to authenticated
  using (public.has_role_at_least('planeacion')) with check (public.has_role_at_least('planeacion'));

-- -----------------------------------------------------------------------------
-- 6. Quién ve y edita los roles de acceso
-- -----------------------------------------------------------------------------

alter table public.access_roles        enable row level security;
alter table public.access_role_reports enable row level security;

drop policy if exists access_roles_read on public.access_roles;
create policy access_roles_read on public.access_roles for select to authenticated
  using (public.has_role_at_least('consulta'));

drop policy if exists access_roles_write on public.access_roles;
create policy access_roles_write on public.access_roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists access_role_reports_read on public.access_role_reports;
create policy access_role_reports_read on public.access_role_reports for select to authenticated
  using (public.has_role_at_least('consulta'));

drop policy if exists access_role_reports_write on public.access_role_reports;
create policy access_role_reports_write on public.access_role_reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Un rol de sistema no se borra: si desapareciera, los perfiles que cuelgan de
-- él se quedarían sin capacidad y la intranet sin administradores.
create or replace function public.guard_system_access_role()
returns trigger
language plpgsql
as $$
begin
  if old.is_system then
    raise exception 'Los roles de acceso de sistema no se pueden borrar. Crea uno propio y reasigna a las personas.'
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end;
$$;

drop trigger if exists access_roles_guard_system on public.access_roles;
create trigger access_roles_guard_system
  before delete on public.access_roles
  for each row execute function public.guard_system_access_role();

grant select on public.access_roles, public.access_role_reports to anon, authenticated;
grant insert, update, delete on public.access_roles, public.access_role_reports to authenticated;

notify pgrst, 'reload schema';
