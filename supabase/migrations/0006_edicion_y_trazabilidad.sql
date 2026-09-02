-- =============================================================================
-- PDI · 0006 · Edición y trazabilidad automática.
--
-- 1. Actividades y documentos pasan a colgar de un área y de una línea, como ya
--    hacían los proyectos.
--
-- 2. El control de cambios pasa a poder referirse a un proyecto o a una
--    actividad concretos, no solo al pilar y su indicador.
--
-- 3. Cada alta, actualización y baja de un proyecto o de una actividad deja su
--    propio registro en el control de cambios, automáticamente.
--
--    Se hace con disparadores y no desde React a propósito: así el registro es
--    atómico con el cambio que documenta —no puede guardarse el proyecto y
--    perderse su traza— y ocurre igual venga de la intranet o de una llamada
--    directa a la API.
--
-- Es idempotente: se puede ejecutar más de una vez sin efectos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Actividades y documentos dentro de la estructura
-- -----------------------------------------------------------------------------

alter table public.activities
  add column if not exists action_line_id uuid references public.action_lines (id) on delete set null;

alter table public.documents
  add column if not exists action_line_id uuid references public.action_lines (id) on delete set null;

comment on column public.activities.action_line_id is
  'Línea de acción de la que cuelga. Nulo = actividad del pilar sin línea asignada.';
comment on column public.documents.action_line_id is
  'Línea de acción que respalda el documento. area_id ya existía; con la línea el soporte queda ubicado en la estructura.';

create index if not exists activities_line_idx on public.activities (action_line_id);
create index if not exists documents_line_idx  on public.documents (action_line_id);
create index if not exists documents_area_idx  on public.documents (area_id);

-- -----------------------------------------------------------------------------
-- 2. El control de cambios apunta a lo que cambió
-- -----------------------------------------------------------------------------

alter table public.change_log
  add column if not exists project_id uuid references public.projects (id) on delete set null;

alter table public.change_log
  add column if not exists activity_id uuid references public.activities (id) on delete set null;

comment on column public.change_log.project_id is
  'Proyecto al que se refiere el cambio. Queda en nulo si el proyecto se elimina: la traza sobrevive al objeto.';

create index if not exists change_log_project_idx  on public.change_log (project_id, changed_on desc);
create index if not exists change_log_activity_idx on public.change_log (activity_id, changed_on desc);

-- La restricción anterior cubría (pilar, indicador, versión) y sirve para las
-- entradas que se escriben a mano. Las automáticas numeran por proyecto o por
-- actividad, así que quedan fuera: si dos ediciones simultáneas calcularan la
-- misma versión, es preferible una etiqueta repetida a perder un registro.
alter table public.change_log drop constraint if exists change_log_version_unique;

create unique index if not exists change_log_manual_version_unique
  on public.change_log (pillar_id, indicator_id, version) nulls not distinct
  where project_id is null and activity_id is null;

-- -----------------------------------------------------------------------------
-- 3. Registro automático
-- -----------------------------------------------------------------------------

-- Nombre de quien hace el cambio, para la columna "aval".
create or replace function public.current_actor()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.email, 'Sistema')
  from public.profiles p
  where p.id = auth.uid();
$$;

-- Código del área a la que pertenece una línea de acción.
create or replace function public.area_code_of_line(target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(a.code, a.name, '')
  from public.action_lines l
  join public.strategic_areas a on a.id = l.area_id
  where l.id = target;
$$;

-- Versión correlativa dentro de la historia de un proyecto o una actividad.
create or replace function public.next_change_version(project uuid, activity uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select '1.' || count(*)::text
  from public.change_log c
  where (project is not null and c.project_id = project)
     or (activity is not null and c.activity_id = activity);
$$;

-- --- Proyectos ---------------------------------------------------------------

create or replace function public.log_project_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  detail text := '';
begin
  if tg_op = 'INSERT' then
    insert into public.change_log
      (pillar_id, project_id, area_code, version, approved_by, changed_on, description, change_type)
    values (
      new.pillar_id, new.id,
      coalesce(public.area_code_of_line(new.action_line_id), ''),
      public.next_change_version(new.id, null),
      public.current_actor(), current_date,
      format('Registro inicial del proyecto. Avance %s %%, estado %s.', new.progress, new.status),
      'creacion'
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.change_log
      (pillar_id, area_code, version, approved_by, changed_on, description, change_type)
    values (
      old.pillar_id,
      coalesce(public.area_code_of_line(old.action_line_id), ''),
      -- La baja pierde el vínculo con el objeto, así que entra en el índice de
      -- las entradas manuales: la versión lleva el id para no chocar con otra.
      format('baja-%s', left(old.id::text, 8)),
      public.current_actor(), current_date,
      format('Se eliminó el proyecto "%s".', old.name),
      'eliminacion'
    );
    return old;
  end if;

  -- UPDATE: solo deja traza lo que cambia el sentido del proyecto. Reordenar la
  -- lista o corregir una descripción no merece una entrada.
  if new.progress is not distinct from old.progress
     and new.status is not distinct from old.status
     and new.name is not distinct from old.name
     and new.owner is not distinct from old.owner
     and new.due_date is not distinct from old.due_date
     and new.action_line_id is not distinct from old.action_line_id then
    return new;
  end if;

  if new.progress is distinct from old.progress then
    detail := detail || format('Avance %s %% → %s %%. ', old.progress, new.progress);
  end if;
  if new.status is distinct from old.status then
    detail := detail || format('Estado %s → %s. ', old.status, new.status);
  end if;
  if new.name is distinct from old.name then
    detail := detail || format('Renombrado desde "%s". ', old.name);
  end if;
  if new.owner is distinct from old.owner then
    detail := detail || format('Responsable %s → %s. ', coalesce(nullif(old.owner, ''), 'sin asignar'), coalesce(nullif(new.owner, ''), 'sin asignar'));
  end if;
  if new.due_date is distinct from old.due_date then
    detail := detail || format('Fecha objetivo %s → %s. ', coalesce(old.due_date::text, 'sin fecha'), coalesce(new.due_date::text, 'sin fecha'));
  end if;
  if new.action_line_id is distinct from old.action_line_id then
    detail := detail || 'Cambió de línea de acción. ';
  end if;

  insert into public.change_log
    (pillar_id, project_id, area_code, version, approved_by, changed_on, description, change_type)
  values (
    new.pillar_id, new.id,
    coalesce(public.area_code_of_line(new.action_line_id), ''),
    public.next_change_version(new.id, null),
    public.current_actor(), current_date,
    btrim(detail), 'modificacion'
  );

  return new;
end;
$$;

drop trigger if exists projects_log_change on public.projects;
create trigger projects_log_change
  after insert or update or delete on public.projects
  for each row execute function public.log_project_change();

-- --- Actividades -------------------------------------------------------------

create or replace function public.log_activity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  detail text := '';
begin
  if tg_op = 'INSERT' then
    insert into public.change_log
      (pillar_id, activity_id, area_code, version, approved_by, changed_on, description, change_type)
    values (
      new.pillar_id, new.id,
      coalesce(public.area_code_of_line(new.action_line_id), ''),
      public.next_change_version(null, new.id),
      public.current_actor(), current_date,
      format('Registro inicial de la actividad. Avance %s %%, estado %s.', new.progress, new.status),
      'creacion'
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.change_log
      (pillar_id, area_code, version, approved_by, changed_on, description, change_type)
    values (
      old.pillar_id,
      coalesce(public.area_code_of_line(old.action_line_id), ''),
      format('baja-%s', left(old.id::text, 8)),
      public.current_actor(), current_date,
      format('Se eliminó la actividad "%s".', old.title),
      'eliminacion'
    );
    return old;
  end if;

  if new.progress is not distinct from old.progress
     and new.status is not distinct from old.status
     and new.title is not distinct from old.title
     and new.owner is not distinct from old.owner
     and new.due_date is not distinct from old.due_date
     and new.is_featured is not distinct from old.is_featured
     and new.action_line_id is not distinct from old.action_line_id then
    return new;
  end if;

  if new.progress is distinct from old.progress then
    detail := detail || format('Avance %s %% → %s %%. ', old.progress, new.progress);
  end if;
  if new.status is distinct from old.status then
    detail := detail || format('Estado %s → %s. ', old.status, new.status);
  end if;
  if new.title is distinct from old.title then
    detail := detail || format('Renombrada desde "%s". ', old.title);
  end if;
  if new.owner is distinct from old.owner then
    detail := detail || format('Responsable %s → %s. ', coalesce(nullif(old.owner, ''), 'sin asignar'), coalesce(nullif(new.owner, ''), 'sin asignar'));
  end if;
  if new.due_date is distinct from old.due_date then
    detail := detail || format('Vencimiento %s → %s. ', coalesce(old.due_date::text, 'sin fecha'), coalesce(new.due_date::text, 'sin fecha'));
  end if;
  if new.is_featured is distinct from old.is_featured then
    detail := detail || case when new.is_featured
      then 'Se destacó en el tablero público. '
      else 'Se retiró del tablero público. ' end;
  end if;
  if new.action_line_id is distinct from old.action_line_id then
    detail := detail || 'Cambió de línea de acción. ';
  end if;

  insert into public.change_log
    (pillar_id, activity_id, area_code, version, approved_by, changed_on, description, change_type)
  values (
    new.pillar_id, new.id,
    coalesce(public.area_code_of_line(new.action_line_id), ''),
    public.next_change_version(null, new.id),
    public.current_actor(), current_date,
    btrim(detail), 'modificacion'
  );

  return new;
end;
$$;

drop trigger if exists activities_log_change on public.activities;
create trigger activities_log_change
  after insert or update or delete on public.activities
  for each row execute function public.log_activity_change();

-- -----------------------------------------------------------------------------
-- 5. Traza inicial de lo que ya existía
--
-- Los disparadores se crean después de la semilla, así que los proyectos y
-- actividades ya cargados no tendrían historia. Se les da su entrada de alta
-- para que la trazabilidad empiece completa.
-- -----------------------------------------------------------------------------

insert into public.change_log
  (pillar_id, project_id, area_code, version, approved_by, changed_on, description, change_type)
select
  p.pillar_id, p.id,
  coalesce(public.area_code_of_line(p.action_line_id), ''),
  '1.0', 'Carga inicial', current_date,
  format('Registro inicial del proyecto. Avance %s %%, estado %s.', p.progress, p.status),
  'creacion'
from public.projects p
where not exists (select 1 from public.change_log c where c.project_id = p.id);

insert into public.change_log
  (pillar_id, activity_id, area_code, version, approved_by, changed_on, description, change_type)
select
  a.pillar_id, a.id,
  coalesce(public.area_code_of_line(a.action_line_id), ''),
  '1.0', 'Carga inicial', current_date,
  format('Registro inicial de la actividad. Avance %s %%, estado %s.', a.progress, a.status),
  'creacion'
from public.activities a
where not exists (select 1 from public.change_log c where c.activity_id = a.id);

-- -----------------------------------------------------------------------------
-- 4. Vista de la traza con el objeto ya resuelto
-- -----------------------------------------------------------------------------

create or replace view public.v_change_log
with (security_invoker = on) as
select
  c.*,
  p.name  as project_name,
  a.title as activity_title,
  i.code  as indicator_code
from public.change_log c
left join public.projects   p on p.id = c.project_id
left join public.activities a on a.id = c.activity_id
left join public.indicators i on i.id = c.indicator_id;

comment on view public.v_change_log is
  'Control de cambios con el nombre del proyecto, la actividad o el indicador al que se refiere cada entrada.';

grant select on public.v_change_log to anon, authenticated;
