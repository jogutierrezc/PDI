-- =============================================================================
-- PDI · 0016 · PDI por facultad: los planes de acción de las facultades.
--
-- Las facultades ya formulan su plan fuera del portal, en una aplicación propia
-- que guarda cada plan en una hoja de cálculo y lo publica como JSON. Esta
-- migración le da sitio a ese plan dentro del portal para poder responder lo
-- que hoy no se puede: **¿a qué pilar del PDI está empujando cada facultad, y
-- cuál se está quedando sin quien lo empuje?**
--
-- El esquema es un calco de lo que sirve el origen, no un modelo inventado. Su
-- forma, de fuera hacia dentro:
--
--     Facultad → Dimensión (d1…d7) → Acción → Actividad
--                                      ↑
--                                 declara un pilar
--
-- -----------------------------------------------------------------------------
-- 1. Por qué se copia la forma del origen en vez de traducirla
--
-- La tentación era encajar cada acción en `projects` o en `activities`. No cabe:
-- una acción de facultad no tiene la cascada de avance del plan, no tiene
-- indicadores con serie anual y su seguimiento va por cortes semestrales
-- propios. Metida ahí dentro, contaminaría el avance del PDI con cifras que se
-- miden de otra manera.
--
-- Y al revés: traducirla a una forma "más limpia" que la del origen obligaría a
-- decidir en cada sincronización qué se pierde. Copiando la forma, sincronizar
-- es copiar, y lo único que el portal añade es lo que el origen no sabe: a qué
-- pilar del PDI corresponde el texto que la facultad escribió.
--
-- -----------------------------------------------------------------------------
-- 2. El enganche con el plan: el pilar, y por su nombre
--
-- Cada acción declara su pilar como texto. Resulta que esos textos coinciden
-- **exactamente** con `pillars.name` —"Gobernanza para el buen gobierno",
-- "Personalización", "Ambiente tecnológico", "Sostenibilidad", "Apropiación
-- social"—, así que el enganche es una igualdad y no una adivinanza. El
-- disparador la resuelve al escribir y guarda además el texto original en
-- `declared_pillar`: si mañana el origen cambia una etiqueta, se ve cuál dejó
-- de casar en vez de perderse en silencio.
--
-- Un pilar que ninguna acción declara —hoy, "Entorno emprendedor"— sale con
-- cero en la matriz. Es el hallazgo, no un hueco que haya que rellenar.
--
-- El área estratégica y la línea de acción quedan como refinamiento opcional:
-- el origen no las pide, y exigirlas dejaría el módulo vacío esperando un dato
-- que nadie está capturando. Cuando Planeación ancle una acción a una línea,
-- el disparador rellena el área y el pilar hacia arriba y el anclaje manda.
--
-- -----------------------------------------------------------------------------
-- 3. Nada se publica solo
--
-- Lo que entra por la sincronización nace en `borrador`. Publicar es un acto de
-- la intranet, y la restricción `faculty_actions_pillar_before_publish` impide
-- publicar una acción cuyo pilar no se haya podido resolver: sin pilar no
-- aparece en la matriz, y una fila invisible en la pieza central de la página
-- es peor que no tenerla.
--
-- -----------------------------------------------------------------------------
-- 4. La sincronización no pisa lo revisado
--
-- Cada fila viaja con el identificador que le dio el origen (`source_id`, del
-- estilo "d1_2"). Con él, volver a sincronizar actualiza lo que la facultad
-- escribe y deja intactos el anclaje, el estado de publicación y las notas, que
-- son decisiones del portal. Sin esa separación, corregir algo sería inútil: la
-- siguiente corrida lo borraría.
--
-- Es idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Lo que dejó la primera versión de esta migración
--
-- Esta migración se publicó una vez con otra forma —`faculty_proposals`, con
-- propuestas alineadas a una línea de acción— antes de conocer lo que sirve de
-- verdad la aplicación de las facultades. Quien la aplicara entonces tiene esas
-- tablas creadas, y `create table if not exists` se las saltaría en silencio
-- dejando el esquema a medias.
--
-- Las vistas se retiran sin más: son derivadas y se vuelven a crear abajo. La
-- tabla solo se borra si está vacía; si alguien alcanzó a capturar algo, se
-- avisa y se deja, porque borrar datos de alguien nunca debe ser un efecto
-- secundario de aplicar una migración.
-- -----------------------------------------------------------------------------

drop view if exists public.v_faculty_proposals cascade;
drop view if exists public.v_faculty_proposals_admin cascade;

do $$
declare
  filas bigint;
begin
  if to_regclass('public.faculty_proposals') is null then
    return;
  end if;

  execute 'select count(*) from public.faculty_proposals' into filas;

  if filas = 0 then
    drop table public.faculty_proposals cascade;
    drop type if exists public.proposal_stage;
    raise notice 'Se retiró faculty_proposals, que estaba vacía.';
  else
    raise warning
      'public.faculty_proposals tiene % fila(s) de la versión anterior de esta migración. El módulo ya no la usa: revísalas y bórrala a mano cuando confirmes que no hacen falta.',
      filas;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. El estado de una acción, tal y como lo nombra el origen
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'faculty_action_status') then
    create type public.faculty_action_status as enum ('pendiente', 'proceso', 'completado');
  end if;
end $$;

comment on type public.faculty_action_status is
  'Estado de la acción según la facultad: Pendiente, En proceso, Completado.';

-- -----------------------------------------------------------------------------
-- 2. Las facultades
--
-- Tabla propia y no el `academic_units` de `projects`: ese es un arreglo de
-- texto libre donde caben programas, unidades y facultades mal escritas. Aquí
-- hace falta una entidad con identidad estable —para agrupar, para comparar y
-- para que `/facultades/:slug` sea un enlace que se pueda compartir—.
-- -----------------------------------------------------------------------------

create table if not exists public.faculties (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  -- El código con el que la facultad se identifica en el origen: FCS, FCMS…
  -- Es la llave de la sincronización, así que no se inventa aquí.
  code        text not null,
  name        text not null,
  -- Quién responde por el plan. Texto y no una llave a profiles: la decanatura
  -- es un cargo, y quien lo ocupa cambia sin que el dato deje de ser cierto.
  dean        text not null default '',
  description text not null default '',
  status      public.publication_status not null default 'borrador',
  position    integer not null default 0,

  -- --- Lo que dice el origen sobre el plan -----------------------------------
  phase       text not null default '',
  period      text not null default '',
  plan_date   date,
  /** Cuándo se trajo por última vez, y qué marca de tiempo traía el origen. */
  synced_at   timestamptz,
  source_updated_at timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint faculties_slug_unique unique (slug),
  constraint faculties_code_unique unique (code),
  constraint faculties_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Si la tabla venía de la versión anterior, `create table if not exists` la dejó
-- como estaba: las columnas del plan se añaden aquí una a una. Es lo que hace
-- que volver a aplicar esta migración sobre una base ya tocada funcione.
alter table public.faculties add column if not exists dean text not null default '';
alter table public.faculties add column if not exists description text not null default '';
alter table public.faculties add column if not exists phase text not null default '';
alter table public.faculties add column if not exists period text not null default '';
alter table public.faculties add column if not exists plan_date date;
alter table public.faculties add column if not exists synced_at timestamptz;
alter table public.faculties add column if not exists source_updated_at timestamptz;

comment on table public.faculties is
  'Las facultades de la Universidad y el estado de su plan de acción.';
comment on column public.faculties.code is
  'Código del origen (FCS, FCMS…). Es la llave con la que sincroniza el plan.';
comment on column public.faculties.phase is
  'Fase del plan según el origen: fase1 (formulación) o fase2 (con seguimiento).';
comment on column public.faculties.status is
  'Solo las publicadas salen al portal. Una facultad en borrador esconde también sus acciones.';

drop trigger if exists faculties_set_updated_at on public.faculties;
create trigger faculties_set_updated_at
  before update on public.faculties
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Las acciones
-- -----------------------------------------------------------------------------

create table if not exists public.faculty_actions (
  id             uuid primary key default gen_random_uuid(),
  faculty_id     uuid not null references public.faculties (id) on delete cascade,
  /** El id que le puso el origen: "d1_2". Único dentro de su facultad. */
  source_id      text not null,

  -- --- Cómo lo agrupa la facultad -------------------------------------------
  dimension      text not null default '',
  dimension_name text not null default '',

  -- --- Enganche con el PDI ---------------------------------------------------
  /** El pilar tal y como lo escribió la facultad. Se conserva siempre: si deja
   *  de casar con ninguno, es lo único que permite ver por qué. */
  declared_pillar text not null default '',
  pillar_id       uuid references public.pillars (id) on delete set null,
  /** Refinamiento opcional desde la intranet. El origen no los pide. */
  area_id         uuid references public.strategic_areas (id) on delete set null,
  action_line_id  uuid references public.action_lines (id) on delete set null,

  -- --- Lo que la facultad escribe --------------------------------------------
  title          text not null,
  owner          text not null default '',
  /** La meta, que en el origen trae también el indicador, en el mismo campo. */
  goal           text not null default '',
  resources      text not null default '',
  /** Muchas acciones traen "Por definir" en vez de una fecha. Se guardan las
   *  dos cosas: la fecha cuando la hay —para poder ordenar y comparar— y el
   *  texto original, que es lo que hay que enseñar cuando no la hay. */
  deadline       date,
  deadline_label text not null default '',
  initial_status public.faculty_action_status not null default 'pendiente',
  budget_ordinary    boolean not null default false,
  budget_improvement boolean not null default false,

  -- --- Publicación y orden ---------------------------------------------------
  status         public.publication_status not null default 'borrador',
  published_at   timestamptz,
  position       integer not null default 0,
  note           text not null default '',

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint faculty_actions_source_unique unique (faculty_id, source_id),

  -- La regla del módulo, escrita donde no se puede saltar desde el navegador:
  -- sin pilar resuelto, la acción no aparecería en la matriz y publicarla sería
  -- publicar una fila invisible.
  constraint faculty_actions_pillar_before_publish
    check (status <> 'publicado' or pillar_id is not null)
);

alter table public.faculty_actions add column if not exists dimension text not null default '';
alter table public.faculty_actions add column if not exists dimension_name text not null default '';
alter table public.faculty_actions add column if not exists declared_pillar text not null default '';
alter table public.faculty_actions add column if not exists goal text not null default '';
alter table public.faculty_actions add column if not exists resources text not null default '';
alter table public.faculty_actions add column if not exists deadline date;
alter table public.faculty_actions add column if not exists deadline_label text not null default '';
alter table public.faculty_actions add column if not exists budget_ordinary boolean not null default false;
alter table public.faculty_actions add column if not exists budget_improvement boolean not null default false;
alter table public.faculty_actions add column if not exists note text not null default '';
alter table public.faculty_actions add column if not exists published_at timestamptz;

comment on table public.faculty_actions is
  'Las acciones del plan de cada facultad, con el pilar del PDI al que declaran aportar.';
comment on column public.faculty_actions.declared_pillar is
  'El pilar en las palabras de la facultad. Se guarda aunque se haya resuelto, para poder auditar el enganche.';
comment on constraint faculty_actions_pillar_before_publish on public.faculty_actions is
  'Sin pilar no se publica: una acción sin pilar no sale en la matriz, que es la pieza central de la página.';

create index if not exists faculty_actions_faculty_idx
  on public.faculty_actions (faculty_id, position);
create index if not exists faculty_actions_pillar_idx on public.faculty_actions (pillar_id);
create index if not exists faculty_actions_status_idx on public.faculty_actions (status);

drop trigger if exists faculty_actions_set_updated_at on public.faculty_actions;
create trigger faculty_actions_set_updated_at
  before update on public.faculty_actions
  for each row execute function public.set_updated_at();

-- Las facultades de ejemplo que sembró la primera versión de esta migración
-- llevaban códigos F-01…F-06, que no son los que usa el origen (FCS, FCMS…).
-- Se retiran ahora que ya existe la tabla contra la que hay que comprobarlo.
--
-- Dos condiciones, y las dos importan. Que no tengan acciones es la obvia. La
-- segunda es que `faculty_proposals` ya no esté: mientras exista, su clave
-- foránea borra en cascada, y este borrado se llevaría por delante propuestas
-- que el bloque de arriba decidió conservar precisamente por tener datos.
do $$
declare
  borradas integer;
begin
  if to_regclass('public.faculty_proposals') is not null then
    raise notice
      'No se retiran las facultades de ejemplo (F-01…): todavía existe faculty_proposals y borrarlas arrastraría sus filas en cascada.';
    return;
  end if;

  delete from public.faculties f
  where f.code ~ '^F-0[1-9]$'
    and not exists (select 1 from public.faculty_actions a where a.faculty_id = f.id);

  get diagnostics borradas = row_count;
  if borradas > 0 then
    raise notice 'Se retiraron % facultad(es) de ejemplo de la versión anterior.', borradas;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Las actividades de cada acción
-- -----------------------------------------------------------------------------

create table if not exists public.faculty_activities (
  id           uuid primary key default gen_random_uuid(),
  action_id    uuid not null references public.faculty_actions (id) on delete cascade,
  source_id    text not null,
  description  text not null,
  owner        text not null default '',
  due_date     date,
  due_label    text not null default '',
  /** Estado del último corte reportado, cuando lo hay. */
  status_label text not null default '',
  evidence_url text not null default '',
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint faculty_activities_source_unique unique (action_id, source_id)
);

alter table public.faculty_activities add column if not exists due_date date;
alter table public.faculty_activities add column if not exists due_label text not null default '';
alter table public.faculty_activities add column if not exists status_label text not null default '';
alter table public.faculty_activities add column if not exists evidence_url text not null default '';

comment on table public.faculty_activities is
  'Lo concreto que la facultad se compromete a hacer dentro de cada acción.';

create index if not exists faculty_activities_action_idx
  on public.faculty_activities (action_id, position);

drop trigger if exists faculty_activities_set_updated_at on public.faculty_activities;
create trigger faculty_activities_set_updated_at
  before update on public.faculty_activities
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. El seguimiento, por cortes
--
-- Una fila por acción y corte, igual que `activity_targets` lo hace por año, y
-- por el mismo motivo: el seguimiento del plan se reporta en ciclos y guardar
-- solo el último borraría la historia en cuanto se abra el corte siguiente.
-- -----------------------------------------------------------------------------

create table if not exists public.faculty_followups (
  id           uuid primary key default gen_random_uuid(),
  action_id    uuid not null references public.faculty_actions (id) on delete cascade,
  /** "Semestre I 2026". Texto porque el origen no usa un calendario fijo. */
  cut          text not null,
  reported_on  date,
  /** Avance declarado de 0 a 100. Nulo no es cero: es "sin reportar". */
  progress     smallint,
  status_label text not null default '',
  note         text not null default '',
  evidence_url text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint faculty_followups_unique unique (action_id, cut),
  constraint faculty_followups_progress_range
    check (progress is null or progress between 0 and 100)
);

alter table public.faculty_followups add column if not exists reported_on date;
alter table public.faculty_followups add column if not exists progress smallint;
alter table public.faculty_followups add column if not exists status_label text not null default '';
alter table public.faculty_followups add column if not exists note text not null default '';
alter table public.faculty_followups add column if not exists evidence_url text not null default '';

comment on table public.faculty_followups is
  'El avance reportado de cada acción, corte a corte. Nulo es "sin reportar", que no es cero.';

create index if not exists faculty_followups_action_idx
  on public.faculty_followups (action_id, cut);

drop trigger if exists faculty_followups_set_updated_at on public.faculty_followups;
create trigger faculty_followups_set_updated_at
  before update on public.faculty_followups
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Lo que la fila se rellena sola
--
-- Tres cosas que nadie debería escribir a mano y que, escritas a mano, acabarían
-- en desacuerdo: el pilar deducido del texto declarado, el área y el pilar
-- deducidos de la línea cuando la hay, y la fecha de publicación.
-- -----------------------------------------------------------------------------

create or replace function public.faculty_action_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.action_line_id is not null then
    -- El anclaje manual manda sobre el texto: si alguien se tomó el trabajo de
    -- elegir la línea, el pilar es el de esa línea y no el que dijo la hoja.
    select l.area_id, a.pillar_id
      into new.area_id, new.pillar_id
    from public.action_lines l
    join public.strategic_areas a on a.id = l.area_id
    where l.id = new.action_line_id;

  elsif new.area_id is not null then
    select a.pillar_id into new.pillar_id
    from public.strategic_areas a
    where a.id = new.area_id;

  elsif new.declared_pillar <> '' then
    -- Los textos del origen coinciden con `pillars.name`, así que esto es una
    -- igualdad y no una adivinanza. Se compara sin mayúsculas ni espacios
    -- sobrantes porque es lo único que cambia entre una hoja y otra.
    select p.id into new.pillar_id
    from public.pillars p
    where lower(btrim(p.name)) = lower(btrim(new.declared_pillar))
    limit 1;

    -- Segundo intento, solo si el primero falló: el origen a veces alarga el
    -- nombre ("Gobernanza para el buen gobierno" frente a "Gobernanza").
    if new.pillar_id is null then
      select p.id into new.pillar_id
      from public.pillars p
      where lower(btrim(new.declared_pillar)) like lower(btrim(p.name)) || '%'
         or lower(btrim(p.name)) like lower(btrim(new.declared_pillar)) || '%'
      order by length(p.name) desc
      limit 1;
    end if;
  end if;

  if new.status = 'publicado' and new.published_at is null then
    new.published_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists faculty_actions_fill on public.faculty_actions;
create trigger faculty_actions_fill
  before insert or update on public.faculty_actions
  for each row execute function public.faculty_action_fill();

-- -----------------------------------------------------------------------------
-- 7. Seguridad
--
-- Público: solo acciones publicadas de facultades publicadas.
-- Intranet: cualquier perfil activo lee todo.
-- Edición: planeación y administración. Un responsable de pilar puede tocar las
--          acciones ancladas a un pilar suyo; las que aún no tienen pilar son
--          de Planeación, que es quien las resuelve.
-- -----------------------------------------------------------------------------

alter table public.faculties         enable row level security;
alter table public.faculty_actions   enable row level security;
alter table public.faculty_activities enable row level security;
alter table public.faculty_followups  enable row level security;

drop policy if exists faculties_read_public on public.faculties;
create policy faculties_read_public on public.faculties
  for select to anon
  using (status = 'publicado');

drop policy if exists faculties_read_intranet on public.faculties;
create policy faculties_read_intranet on public.faculties
  for select to authenticated
  using (public.has_role_at_least('consulta') or status = 'publicado');

drop policy if exists faculties_write on public.faculties;
create policy faculties_write on public.faculties
  for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

drop policy if exists faculty_actions_read_public on public.faculty_actions;
create policy faculty_actions_read_public on public.faculty_actions
  for select to anon
  using (
    status = 'publicado'
    and exists (select 1 from public.faculties f where f.id = faculty_id and f.status = 'publicado')
  );

drop policy if exists faculty_actions_read_intranet on public.faculty_actions;
create policy faculty_actions_read_intranet on public.faculty_actions
  for select to authenticated
  using (
    public.has_role_at_least('consulta')
    or (status = 'publicado'
        and exists (select 1 from public.faculties f where f.id = faculty_id and f.status = 'publicado'))
  );

drop policy if exists faculty_actions_write on public.faculty_actions;
create policy faculty_actions_write on public.faculty_actions
  for all to authenticated
  using (public.can_edit_pillar(pillar_id))
  with check (public.can_edit_pillar(pillar_id));

-- Las hijas heredan la visibilidad de su acción: no tienen estado propio, y
-- dárselo obligaría a mantener dos verdades sobre lo mismo.
create or replace function public.faculty_action_is_public(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.faculty_actions a
    join public.faculties f on f.id = a.faculty_id
    where a.id = target and a.status = 'publicado' and f.status = 'publicado'
  );
$$;

create or replace function public.pillar_of_faculty_action(target uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.pillar_id from public.faculty_actions a where a.id = target;
$$;

drop policy if exists faculty_activities_read_public on public.faculty_activities;
create policy faculty_activities_read_public on public.faculty_activities
  for select to anon
  using (public.faculty_action_is_public(action_id));

drop policy if exists faculty_activities_read_intranet on public.faculty_activities;
create policy faculty_activities_read_intranet on public.faculty_activities
  for select to authenticated
  using (public.has_role_at_least('consulta') or public.faculty_action_is_public(action_id));

drop policy if exists faculty_activities_write on public.faculty_activities;
create policy faculty_activities_write on public.faculty_activities
  for all to authenticated
  using (public.can_edit_pillar(public.pillar_of_faculty_action(action_id)))
  with check (public.can_edit_pillar(public.pillar_of_faculty_action(action_id)));

drop policy if exists faculty_followups_read_public on public.faculty_followups;
create policy faculty_followups_read_public on public.faculty_followups
  for select to anon
  using (public.faculty_action_is_public(action_id));

drop policy if exists faculty_followups_read_intranet on public.faculty_followups;
create policy faculty_followups_read_intranet on public.faculty_followups
  for select to authenticated
  using (public.has_role_at_least('consulta') or public.faculty_action_is_public(action_id));

drop policy if exists faculty_followups_write on public.faculty_followups;
create policy faculty_followups_write on public.faculty_followups
  for all to authenticated
  using (public.can_edit_pillar(public.pillar_of_faculty_action(action_id)))
  with check (public.can_edit_pillar(public.pillar_of_faculty_action(action_id)));

-- --- Permisos por columna ----------------------------------------------------
--
-- Misma técnica y mismo motivo que en la 0015: la lista se calcula para que una
-- columna nueva entre sola y lo único que haya que recordar sea esta lista de
-- reservadas. PostgREST expone la tabla además de la vista, así que esconder una
-- columna solo en la vista no serviría de nada.

grant select on public.faculties to anon, authenticated;
grant insert, update, delete on public.faculties to authenticated;

do $$
declare
  reservadas constant text[] := array['note'];
  columnas text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into columnas
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'faculty_actions'
    and not (column_name = any (reservadas));

  execute 'revoke all on public.faculty_actions from anon';
  execute format('grant select (%s) on public.faculty_actions to anon', columnas);
end $$;

grant select, insert, update, delete on public.faculty_actions to authenticated;
grant select on public.faculty_activities, public.faculty_followups to anon;
grant select, insert, update, delete
  on public.faculty_activities, public.faculty_followups to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Las vistas
--
-- Todas con `security_invoker = on`: la vista no es una puerta trasera, las
-- políticas de arriba siguen mandando. El `where status = 'publicado'` de las
-- públicas no sobra: una sesión de intranet mirando el portal público leería,
-- si no, también lo que no está publicado.
-- -----------------------------------------------------------------------------

drop view if exists public.v_faculty_actions cascade;

create view public.v_faculty_actions
with (security_invoker = on) as
select
  a.id,
  a.faculty_id,
  a.source_id,
  a.dimension,
  a.dimension_name,
  a.declared_pillar,
  a.pillar_id,
  a.area_id,
  a.action_line_id,
  a.title,
  a.owner,
  a.goal,
  a.resources,
  a.deadline,
  a.deadline_label,
  a.initial_status,
  a.budget_ordinary,
  a.budget_improvement,
  a.published_at,
  a.position,
  f.slug         as faculty_slug,
  f.code         as faculty_code,
  f.name         as faculty_name,
  pl.slug        as pillar_slug,
  pl.numeral     as pillar_numeral,
  pl.name        as pillar_name,
  pl.accent_slot as pillar_accent,
  ar.code        as area_code,
  ar.name        as area_name,
  l.code         as line_code,
  l.name         as line_name,
  -- Las actividades viajan dentro de la fila: la ficha las necesita todas y
  -- pedirlas aparte serían dos peticiones para pintar una sola lista.
  coalesce((
    select jsonb_agg(to_jsonb(ac) order by ac.position, ac.created_at)
    from public.faculty_activities ac where ac.action_id = a.id
  ), '[]'::jsonb)                                              as activities,
  -- Y el último corte reportado, que es el que se enseña.
  (select fu.cut          from public.faculty_followups fu
    where fu.action_id = a.id order by fu.reported_on desc nulls last limit 1) as last_cut,
  (select fu.progress     from public.faculty_followups fu
    where fu.action_id = a.id order by fu.reported_on desc nulls last limit 1) as last_progress,
  (select fu.status_label from public.faculty_followups fu
    where fu.action_id = a.id order by fu.reported_on desc nulls last limit 1) as last_status,
  (select fu.reported_on  from public.faculty_followups fu
    where fu.action_id = a.id order by fu.reported_on desc nulls last limit 1) as last_reported_on
from public.faculty_actions a
join public.faculties f on f.id = a.faculty_id
left join public.pillars pl        on pl.id = a.pillar_id
left join public.strategic_areas ar on ar.id = a.area_id
left join public.action_lines l    on l.id  = a.action_line_id
where a.status = 'publicado' and f.status = 'publicado';

comment on view public.v_faculty_actions is
  'Acciones publicadas con su pilar resuelto, sus actividades y su último corte. Es la que leen las páginas públicas.';

drop view if exists public.v_faculty_actions_admin cascade;

create view public.v_faculty_actions_admin
with (security_invoker = on) as
select
  a.*,
  f.slug         as faculty_slug,
  f.code         as faculty_code,
  f.name         as faculty_name,
  f.status       as faculty_status,
  pl.slug        as pillar_slug,
  pl.numeral     as pillar_numeral,
  pl.name        as pillar_name,
  pl.accent_slot as pillar_accent,
  ar.code        as area_code,
  ar.name        as area_name,
  l.code         as line_code,
  l.name         as line_name,
  (select count(*) from public.faculty_activities ac where ac.action_id = a.id)::integer
                 as activity_count,
  (select fu.progress from public.faculty_followups fu
    where fu.action_id = a.id order by fu.reported_on desc nulls last limit 1) as last_progress
from public.faculty_actions a
join public.faculties f on f.id = a.faculty_id
left join public.pillars pl        on pl.id = a.pillar_id
left join public.strategic_areas ar on ar.id = a.area_id
left join public.action_lines l    on l.id  = a.action_line_id
where public.has_role_at_least('consulta');

comment on view public.v_faculty_actions_admin is
  'Todas las acciones, publicadas o no, con la nota interna. Nunca se concede a anon.';

-- --- Resumen por facultad ----------------------------------------------------
--
-- Cuenta solo lo publicado, porque es lo que la página pública enseña: si el
-- número dijera treinta y uno y la lista tuviera veinte, el número mentiría.

drop view if exists public.v_faculties cascade;

create view public.v_faculties
with (security_invoker = on) as
select
  f.id                                          as faculty_id,
  f.slug,
  f.code,
  f.name,
  f.dean,
  f.description,
  f.phase,
  f.period,
  f.plan_date,
  f.position,
  count(a.id)::integer                          as action_count,
  count(distinct a.pillar_id)::integer          as pillar_count,
  count(distinct a.dimension) filter (where a.dimension <> '')::integer as dimension_count,
  (select count(*)
     from public.faculty_activities ac
     join public.faculty_actions a2 on a2.id = ac.action_id
    where a2.faculty_id = f.id and a2.status = 'publicado')::integer   as activity_count,
  -- El avance de la facultad es el promedio de lo que ha reportado. Las
  -- acciones sin reporte no entran: promediarlas como cero diría que van mal
  -- cuando lo que pasa es que todavía no se han medido.
  (select round(avg(fu.progress))::integer
     from public.faculty_followups fu
     join public.faculty_actions a3 on a3.id = fu.action_id
    where a3.faculty_id = f.id and a3.status = 'publicado' and fu.progress is not null)
                                                as reported_progress,
  (select count(distinct a4.id)
     from public.faculty_followups fu2
     join public.faculty_actions a4 on a4.id = fu2.action_id
    where a4.faculty_id = f.id and a4.status = 'publicado' and fu2.progress is not null)::integer
                                                as reported_count,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'pillar_id', t.pillar_id,
             'numeral',   t.numeral,
             'accent',    t.accent_slot,
             'count',     t.n)
           order by t.n desc, t.pillar_position)
    from (
      select a5.pillar_id, pl.numeral, pl.accent_slot, pl.position as pillar_position, count(*) as n
      from public.faculty_actions a5
      join public.pillars pl on pl.id = a5.pillar_id
      where a5.faculty_id = f.id and a5.status = 'publicado'
      group by a5.pillar_id, pl.numeral, pl.accent_slot, pl.position
    ) t
  ), '[]'::jsonb)                               as pillar_counts
from public.faculties f
left join public.faculty_actions a on a.faculty_id = f.id and a.status = 'publicado'
where f.status = 'publicado'
group by f.id;

comment on view public.v_faculties is
  'Cada facultad con el recuento de lo que tiene publicado y su avance reportado.';

-- --- La matriz facultad × pilar ----------------------------------------------
--
-- Producto cruzado a propósito: las casillas en cero tienen que existir. Un
-- pilar que ninguna facultad empuja —hoy, "Entorno emprendedor"— es justo lo
-- que esta página sirve para ver, y una matriz que solo trajera las
-- combinaciones con datos lo escondería.

drop view if exists public.v_faculty_pillar_matrix cascade;

create view public.v_faculty_pillar_matrix
with (security_invoker = on) as
select
  f.id                 as faculty_id,
  f.slug               as faculty_slug,
  f.code               as faculty_code,
  f.name               as faculty_name,
  f.position           as faculty_position,
  pl.id                as pillar_id,
  pl.numeral           as pillar_numeral,
  pl.name              as pillar_name,
  pl.accent_slot       as pillar_accent,
  pl.position          as pillar_position,
  count(a.id)::integer as actions
from public.faculties f
cross join public.pillars pl
left join public.faculty_actions a
  on a.faculty_id = f.id and a.pillar_id = pl.id and a.status = 'publicado'
where f.status = 'publicado' and pl.status = 'publicado'
group by f.id, pl.id;

comment on view public.v_faculty_pillar_matrix is
  'Una fila por facultad y pilar, con ceros incluidos: la ausencia de aporte también es un dato.';

grant select on public.v_faculty_actions     to anon, authenticated;
grant select on public.v_faculties           to anon, authenticated;
grant select on public.v_faculty_pillar_matrix to anon, authenticated;

revoke all on public.v_faculty_actions_admin from anon;
grant select on public.v_faculty_actions_admin to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Las facultades, con el código con el que se identifican en el origen
--
-- Se insertan en borrador: publicarlas es una decisión, y hasta que no se
-- sincronice su plan no hay nada que enseñar. Los nombres son los que devuelve
-- el propio origen, así que no hay que confirmarlos contra nada.
-- -----------------------------------------------------------------------------

insert into public.faculties (slug, code, name, status, position)
values
  ('ciencias-medicas-y-de-la-salud',                'FCMS',  'Facultad de Ciencias Médicas y de la Salud',                 'borrador', 1),
  ('ciencias-sociales',                             'FCS',   'Facultad de Ciencias Sociales',                              'borrador', 2),
  ('ingenierias-y-tecnologias',                     'FIT',   'Facultad de Ingenierías y Tecnologías',                      'borrador', 3),
  ('ciencias-agricolas-y-veterinarias',             'FCAV',  'Facultad de Ciencias Agrícolas y Veterinarias',              'borrador', 4),
  ('ciencias-economicas-administrativas-contables', 'FCEAC', 'Facultad de Ciencias Económicas, Administrativas y Contables','borrador', 5),
  ('ciencias-naturales',                            'FCN',   'Facultad de Ciencias Naturales',                             'borrador', 6),
  ('formacion-tecnica-y-tecnologica',               'CFTT',  'Centro de Formación Técnica y Tecnológica',                   'borrador', 7)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
