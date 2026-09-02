-- =============================================================================
-- PDI · 0002 · Seguridad a nivel de fila.
--
-- Idea central: la autorización vive en la base de datos, no en React. Un
-- usuario con rol 'responsable' que abriera la consola del navegador y llamara
-- a la API directamente seguiría sin poder tocar un pilar que no es suyo.
--
-- Tres audiencias:
--   anónimo      → solo pilares 'publicado' y sus hijos; documentos públicos.
--   intranet     → cualquier perfil activo lee todo el contenido.
--   edición      → planeacion y admin en todo; responsable solo en sus pilares.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funciones de apoyo
--
-- Todas son SECURITY DEFINER a propósito: leen public.profiles, que a su vez
-- tiene RLS. Sin definer, evaluar la política de profiles requeriría leer
-- profiles y la recursión no terminaría.
-- -----------------------------------------------------------------------------

create or replace function public.role_rank(role public.app_role)
returns integer
language sql
immutable
as $$
  select case role
    when 'consulta'    then 1
    when 'responsable' then 2
    when 'planeacion'  then 3
    when 'admin'       then 4
  end;
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active;
$$;

comment on function public.current_role() is
  'Rol de quien hace la petición, o NULL si es anónimo o su perfil está desactivado.';

create or replace function public.has_role_at_least(minimum public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.role_rank(public.current_role()) >= public.role_rank(minimum), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('admin');
$$;

-- ¿Puede quien pide editar el contenido de este pilar?
create or replace function public.can_edit_pillar(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Planeación y administración editan cualquier pilar, y también el
    -- contenido institucional que no cuelga de ninguno (target nulo).
    when public.has_role_at_least('planeacion') then true
    when target is null then false
    when public.current_role() = 'responsable' then exists (
      select 1
      from public.pillar_owners po
      where po.pillar_id = target
        and po.profile_id = auth.uid()
    )
    else false
  end;
$$;

comment on function public.can_edit_pillar(uuid) is
  'Regla de edición del contenido. target nulo = contenido institucional sin pilar.';

-- ¿Es este pilar visible para el público?
create or replace function public.pillar_is_public(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pillars p
    where p.id = target and p.status = 'publicado'
  );
$$;

-- Pilar al que pertenece una línea de acción, subiendo por el área.
create or replace function public.pillar_of_area(target uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.pillar_id from public.strategic_areas a where a.id = target;
$$;

create or replace function public.pillar_of_line(target uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.pillar_id
  from public.action_lines l
  join public.strategic_areas a on a.id = l.area_id
  where l.id = target;
$$;

-- -----------------------------------------------------------------------------
-- Activación de RLS
-- -----------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.parameters      enable row level security;
alter table public.report_periods  enable row level security;
alter table public.pillars         enable row level security;
alter table public.pillar_owners   enable row level security;
alter table public.strategic_areas enable row level security;
alter table public.action_lines    enable row level security;
alter table public.documents       enable row level security;
alter table public.indicators      enable row level security;
alter table public.projects        enable row level security;
alter table public.activities      enable row level security;
alter table public.planning_items  enable row level security;
alter table public.change_log      enable row level security;
alter table public.glossary_terms  enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  -- Todo el personal de la intranet ve el directorio: hace falta para elegir
  -- responsables de pilar y para mostrar quién editó qué.
  using (id = auth.uid() or public.has_role_at_least('consulta'));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Una política de UPDATE no puede impedir que se cambie *una columna*, así que
-- el ascenso de rol se bloquea aquí: sin esto, cualquiera podría hacerse admin
-- editando su propio perfil.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Solo un administrador puede cambiar el rol de un usuario';
  end if;

  if new.is_active is distinct from old.is_active then
    raise exception 'Solo un administrador puede activar o desactivar usuarios';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Un administrador no puede quitarse a sí mismo el último acceso: si lo hace,
-- nadie puede volver a gestionar usuarios sin entrar por el panel de Supabase.
create or replace function public.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin'
         and (new.role <> 'admin' or new.is_active = false)) then
    select count(*) into remaining
    from public.profiles
    where role = 'admin' and is_active and id <> old.id;

    if remaining = 0 then
      raise exception 'No se puede dejar el portal sin ningún administrador activo';
    end if;
  end if;

  -- Un BEFORE DELETE devuelve OLD para dejar seguir el borrado; COALESCE sobre
  -- registros no siempre resuelve el tipo, así que se ramifica explícitamente.
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_last_admin on public.profiles;
create trigger profiles_guard_last_admin
  before update or delete on public.profiles
  for each row execute function public.guard_last_admin();

-- -----------------------------------------------------------------------------
-- parameters · report_periods
-- -----------------------------------------------------------------------------

drop policy if exists parameters_read on public.parameters;
create policy parameters_read on public.parameters
  for select to anon, authenticated
  using (is_active or public.has_role_at_least('consulta'));

drop policy if exists parameters_write on public.parameters;
create policy parameters_write on public.parameters
  for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

drop policy if exists report_periods_read on public.report_periods;
create policy report_periods_read on public.report_periods
  for select to anon, authenticated
  using (published_at is not null or public.has_role_at_least('consulta'));

drop policy if exists report_periods_write on public.report_periods;
create policy report_periods_write on public.report_periods
  for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

-- -----------------------------------------------------------------------------
-- pillars
-- -----------------------------------------------------------------------------

drop policy if exists pillars_read on public.pillars;
create policy pillars_read on public.pillars
  for select to anon, authenticated
  using (status = 'publicado' or public.has_role_at_least('consulta'));

-- Crear y borrar pilares es de planeación en adelante: un responsable edita el
-- suyo, no da de alta pilares nuevos.
drop policy if exists pillars_insert on public.pillars;
create policy pillars_insert on public.pillars
  for insert to authenticated
  with check (public.has_role_at_least('planeacion'));

drop policy if exists pillars_delete on public.pillars;
create policy pillars_delete on public.pillars
  for delete to authenticated
  using (public.has_role_at_least('planeacion'));

drop policy if exists pillars_update on public.pillars;
create policy pillars_update on public.pillars
  for update to authenticated
  using (public.can_edit_pillar(id))
  with check (public.can_edit_pillar(id));

-- Publicar es una decisión editorial: un responsable actualiza su pilar pero no
-- decide cuándo sale al portal público.
create or replace function public.guard_pillar_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and not public.has_role_at_least('planeacion') then
    raise exception 'Solo Planeación puede cambiar el estado de publicación de un pilar';
  end if;
  return new;
end;
$$;

drop trigger if exists pillars_guard_publication on public.pillars;
create trigger pillars_guard_publication
  before update on public.pillars
  for each row execute function public.guard_pillar_publication();

drop policy if exists pillar_owners_read on public.pillar_owners;
create policy pillar_owners_read on public.pillar_owners
  for select to authenticated
  using (public.has_role_at_least('consulta'));

drop policy if exists pillar_owners_write on public.pillar_owners;
create policy pillar_owners_write on public.pillar_owners
  for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

-- -----------------------------------------------------------------------------
-- Contenido colgado del pilar
--
-- Mismo patrón en todas: lectura pública si el pilar está publicado, lectura
-- interna para cualquier perfil, escritura según can_edit_pillar().
-- -----------------------------------------------------------------------------

drop policy if exists strategic_areas_read on public.strategic_areas;
create policy strategic_areas_read on public.strategic_areas
  for select to anon, authenticated
  using (public.pillar_is_public(pillar_id) or public.has_role_at_least('consulta'));

drop policy if exists strategic_areas_write on public.strategic_areas;
create policy strategic_areas_write on public.strategic_areas
  for all to authenticated
  using (public.can_edit_pillar(pillar_id))
  with check (public.can_edit_pillar(pillar_id));

drop policy if exists action_lines_read on public.action_lines;
create policy action_lines_read on public.action_lines
  for select to anon, authenticated
  using (
    public.pillar_is_public(public.pillar_of_area(area_id))
    or public.has_role_at_least('consulta')
  );

drop policy if exists action_lines_write on public.action_lines;
create policy action_lines_write on public.action_lines
  for all to authenticated
  using (public.can_edit_pillar(public.pillar_of_area(area_id)))
  with check (public.can_edit_pillar(public.pillar_of_area(area_id)));

drop policy if exists indicators_read on public.indicators;
create policy indicators_read on public.indicators
  for select to anon, authenticated
  using (public.pillar_is_public(pillar_id) or public.has_role_at_least('consulta'));

drop policy if exists indicators_write on public.indicators;
create policy indicators_write on public.indicators
  for all to authenticated
  using (public.can_edit_pillar(pillar_id))
  with check (public.can_edit_pillar(pillar_id));

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
  for select to anon, authenticated
  using (public.pillar_is_public(pillar_id) or public.has_role_at_least('consulta'));

drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects
  for all to authenticated
  using (public.can_edit_pillar(pillar_id))
  with check (public.can_edit_pillar(pillar_id));

drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities
  for select to anon, authenticated
  using (public.pillar_is_public(pillar_id) or public.has_role_at_least('consulta'));

drop policy if exists activities_write on public.activities;
create policy activities_write on public.activities
  for all to authenticated
  using (public.can_edit_pillar(pillar_id))
  with check (public.can_edit_pillar(pillar_id));

drop policy if exists planning_items_read on public.planning_items;
create policy planning_items_read on public.planning_items
  for select to anon, authenticated
  using (public.pillar_is_public(pillar_id) or public.has_role_at_least('consulta'));

drop policy if exists planning_items_write on public.planning_items;
create policy planning_items_write on public.planning_items
  for all to authenticated
  using (public.can_edit_pillar(pillar_id))
  with check (public.can_edit_pillar(pillar_id));

drop policy if exists change_log_read on public.change_log;
create policy change_log_read on public.change_log
  for select to anon, authenticated
  using (public.pillar_is_public(pillar_id) or public.has_role_at_least('consulta'));

drop policy if exists change_log_write on public.change_log;
create policy change_log_write on public.change_log
  for all to authenticated
  using (public.can_edit_pillar(pillar_id))
  with check (public.can_edit_pillar(pillar_id));

drop policy if exists glossary_terms_read on public.glossary_terms;
create policy glossary_terms_read on public.glossary_terms
  for select to anon, authenticated
  using (
    pillar_id is null
    or public.pillar_is_public(pillar_id)
    or public.has_role_at_least('consulta')
  );

drop policy if exists glossary_terms_write on public.glossary_terms;
create policy glossary_terms_write on public.glossary_terms
  for all to authenticated
  using (public.can_edit_pillar(pillar_id))
  with check (public.can_edit_pillar(pillar_id));

-- -----------------------------------------------------------------------------
-- documents
--
-- El repositorio público muestra is_public; los soportes internos, no. Un
-- documento sin pilar es institucional y solo lo toca Planeación.
-- -----------------------------------------------------------------------------

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents
  for select to anon, authenticated
  using (
    (is_public and (pillar_id is null or public.pillar_is_public(pillar_id)))
    or public.has_role_at_least('consulta')
  );

drop policy if exists documents_write on public.documents;
create policy documents_write on public.documents
  for all to authenticated
  using (public.can_edit_pillar(pillar_id))
  with check (public.can_edit_pillar(pillar_id));

-- -----------------------------------------------------------------------------
-- Permisos de esquema
--
-- RLS solo filtra filas si el rol tiene permiso sobre la tabla. Se conceden
-- explícitamente para no depender de los privilegios por defecto del proyecto.
-- -----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant insert, update, delete on tables to authenticated;
