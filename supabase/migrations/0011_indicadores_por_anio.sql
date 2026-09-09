-- =============================================================================
-- PDI · 0011 · Indicadores de resultado: unidad, línea base y serie anual.
--
-- Hasta ahora una actividad tenía un único porcentaje escrito a mano. El
-- seguimiento real del PDI se reporta con esta forma:
--
--   Indicador | Unidad | Base 2023 | Meta 24 | Result. 24 | Cumpl. 24 | Meta 25 | …
--
-- Es decir: un dato de partida y, por cada año del plan, lo comprometido, lo
-- logrado y la relación entre ambos. Un solo porcentaje no puede representar
-- eso, y menos aún explicar de dónde sale.
--
-- Tres cambios:
--
-- 1. La actividad gana unidad de medida (del catálogo global, no texto libre) y
--    línea base con su año.
--
-- 2. Nace `activity_targets`: una fila por año e indicador. El cumplimiento no
--    se captura, se calcula —resultado sobre meta— en una columna generada; se
--    puede sobrescribir cuando el indicador no se mide así (los de reducción,
--    por ejemplo), y entonces queda claro que el número es una decisión y no
--    una división.
--
-- 3. El avance de la actividad deja de escribirse a mano en cuanto hay años
--    capturados: lo fija el cumplimiento del año más reciente. Así el número
--    que sube por la cascada —línea, área, pilar— es el mismo que se lee en la
--    tabla, y no dos cifras que hay que conciliar.
--
--    Mientras un indicador no tenga ningún año capturado, su porcentaje sigue
--    siendo el manual: los pilares ya cargados no cambian de valor.
--
-- 4. `pillar_observations`: la lectura cualitativa del avance de los
--    indicadores del pilar. Lo que una tabla de cifras nunca dice.
--
-- Es idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Unidad y línea base del indicador
-- -----------------------------------------------------------------------------

alter table public.activities
  add column if not exists unit_id        uuid references public.parameters (id) on delete restrict,
  add column if not exists baseline_year  smallint,
  add column if not exists baseline_value numeric(14, 2);

comment on column public.activities.unit_id is
  'Unidad de medida, del catálogo global (categoría "unidad"). Referencia y no copia del texto: renombrarla en el catálogo se refleja en todas partes.';
comment on column public.activities.baseline_year is
  'Año de la línea base ("Base 2023"). Nulo mientras no se capture.';
comment on column public.activities.baseline_value is
  'Valor de partida del indicador, en la misma unidad que las metas.';

alter table public.activities
  drop constraint if exists activities_baseline_year_range;
alter table public.activities
  add constraint activities_baseline_year_range
  check (baseline_year is null or baseline_year between 2000 and 2100);

create index if not exists activities_unit_idx on public.activities (unit_id);

-- -----------------------------------------------------------------------------
-- 2. Serie anual: meta, resultado y cumplimiento
-- -----------------------------------------------------------------------------

create table if not exists public.activity_targets (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities (id) on delete cascade,
  year         smallint not null,
  target_value numeric(14, 2),
  result_value numeric(14, 2),

  -- Cumplimiento decidido a mano. Solo hace falta cuando el indicador no se
  -- mide dividiendo resultado entre meta: los de reducción, los que tienen
  -- tope, los que el comité ajusta por contexto.
  compliance_override numeric(6, 2),

  -- El cumplimiento que se publica. Es una columna generada y no un dato
  -- capturado: así no puede quedarse desfasado respecto a la meta y el
  -- resultado que tiene al lado.
  compliance numeric(6, 2) generated always as (
    coalesce(
      compliance_override,
      case
        when target_value is not null and target_value <> 0 and result_value is not null
          then round(result_value * 100 / target_value, 2)
      end
    )
  ) stored,

  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint activity_targets_year_unique unique (activity_id, year),
  constraint activity_targets_year_range check (year between 2000 and 2100),
  constraint activity_targets_compliance_range
    check (compliance_override is null or compliance_override between 0 and 999)
);

comment on table public.activity_targets is
  'Meta, resultado y cumplimiento de un indicador en un año. Una fila por año: la tabla del reporte se arma girando estas filas a columnas.';
comment on column public.activity_targets.compliance is
  'Calculado: resultado / meta. Si hay compliance_override, manda ese.';
comment on column public.activity_targets.note is
  'Nota del año concreto. Las observaciones generales del pilar viven en pillar_observations.';

create index if not exists activity_targets_activity_idx
  on public.activity_targets (activity_id, year);

drop trigger if exists activity_targets_set_updated_at on public.activity_targets;
create trigger activity_targets_set_updated_at
  before update on public.activity_targets
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. El avance de la actividad sale del último año reportado
--
-- El porcentaje de la actividad es la raíz de toda la cascada del tablero. Si
-- se pudiera escribir a mano teniendo años capturados, la tabla diría 94 % y el
-- pilar otra cosa, sin manera de saber cuál de las dos mirar.
-- -----------------------------------------------------------------------------

create or replace function public.sync_activity_progress(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  latest   numeric;
  computed smallint;
  actual    public.activity_status;
  siguiente public.activity_status;
  anterior  smallint;
begin
  -- El año más reciente con cumplimiento, calculado o decidido.
  select t.compliance into latest
  from public.activity_targets t
  where t.activity_id = target
    and t.compliance is not null
  order by t.year desc
  limit 1;

  -- Sin ningún año capturado el porcentaje sigue siendo el manual: esto es lo
  -- que deja intactos los pilares cargados antes de esta migración.
  if latest is null then
    return;
  end if;

  -- El avance vive en 0-100. Un cumplimiento del 120 % es una buena noticia que
  -- se lee en la tabla del año; llevarlo a la cascada dejaría pilares por
  -- encima del 100 %.
  computed := least(100, greatest(0, round(latest)))::smallint;

  select a.status, a.progress into actual, anterior
  from public.activities a
  where a.id = target;

  -- La actividad puede haber desaparecido entre el borrado en cascada y este
  -- disparador: sin fila que actualizar no hay nada que hacer.
  if actual is null then
    return;
  end if;

  siguiente := case
    when computed >= 100                           then 'cumplida'::public.activity_status
    -- La base rechaza "cumplida al 94 %": si el año la baja del 100, el estado
    -- tiene que bajar con ella.
    when actual = 'cumplida'                       then 'curso'::public.activity_status
    when actual = 'pendiente' and computed > 0     then 'curso'::public.activity_status
    else actual
  end;

  -- Sin esta condición, guardar un año sin cambiar nada dejaría una entrada
  -- vacía en el control de cambios.
  if anterior = computed and siguiente = actual then
    return;
  end if;

  update public.activities
  set progress = computed,
      status = siguiente
  where id = target;
end;
$$;

comment on function public.sync_activity_progress(uuid) is
  'Fija el avance de la actividad en el cumplimiento de su año más reciente. Sin años capturados no toca nada.';

create or replace function public.activity_targets_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_activity_progress(old.activity_id);
    return old;
  end if;

  perform public.sync_activity_progress(new.activity_id);

  -- Mover un año de indicador deja al de origen con una serie más corta.
  if tg_op = 'UPDATE' and new.activity_id is distinct from old.activity_id then
    perform public.sync_activity_progress(old.activity_id);
  end if;

  return new;
end;
$$;

drop trigger if exists activity_targets_sync_progress on public.activity_targets;
create trigger activity_targets_sync_progress
  after insert or update or delete on public.activity_targets
  for each row execute function public.activity_targets_sync();

-- -----------------------------------------------------------------------------
-- 4. Observaciones del pilar
--
-- La lectura cualitativa: por qué un indicador se quedó corto, qué se decidió
-- en el comité, qué depende de algo que aún no llega. Cuelgan del pilar y no de
-- un indicador porque es un balance del conjunto.
-- -----------------------------------------------------------------------------

create table if not exists public.pillar_observations (
  id         uuid primary key default gen_random_uuid(),
  pillar_id  uuid not null references public.pillars (id) on delete cascade,
  -- Nulo = observación vigente, sin año. Con año, queda anclada al corte.
  year       smallint,
  title      text not null default '',
  body       text not null,
  author     text not null default '',
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,

  constraint pillar_observations_body_not_blank check (length(btrim(body)) > 0),
  constraint pillar_observations_year_range check (year is null or year between 2000 and 2100)
);

comment on table public.pillar_observations is
  'Observaciones sobre el avance de los indicadores del pilar. Texto, no cifras: lo que la tabla de resultados no explica.';

create index if not exists pillar_observations_pillar_idx
  on public.pillar_observations (pillar_id, year desc nulls first, position);

drop trigger if exists pillar_observations_set_updated_at on public.pillar_observations;
create trigger pillar_observations_set_updated_at
  before update on public.pillar_observations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Seguridad a nivel de fila
--
-- Las mismas dos reglas del resto del contenido: lo lee el público si el pilar
-- está publicado, lo edita quien pueda editar ese pilar. Los años cuelgan de la
-- actividad, así que hay que subir hasta su pilar para decidir.
-- -----------------------------------------------------------------------------

create or replace function public.pillar_of_activity(target uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.pillar_id from public.activities a where a.id = target;
$$;

alter table public.activity_targets    enable row level security;
alter table public.pillar_observations enable row level security;

drop policy if exists activity_targets_read on public.activity_targets;
create policy activity_targets_read on public.activity_targets
  for select to anon, authenticated
  using (
    public.pillar_is_public(public.pillar_of_activity(activity_id))
    or public.has_role_at_least('consulta')
  );

drop policy if exists activity_targets_write on public.activity_targets;
create policy activity_targets_write on public.activity_targets
  for all to authenticated
  using (public.can_edit_pillar(public.pillar_of_activity(activity_id)))
  with check (public.can_edit_pillar(public.pillar_of_activity(activity_id)));

drop policy if exists pillar_observations_read on public.pillar_observations;
create policy pillar_observations_read on public.pillar_observations
  for select to anon, authenticated
  using (public.pillar_is_public(pillar_id) or public.has_role_at_least('consulta'));

drop policy if exists pillar_observations_write on public.pillar_observations;
create policy pillar_observations_write on public.pillar_observations
  for all to authenticated
  using (public.can_edit_pillar(pillar_id))
  with check (public.can_edit_pillar(pillar_id));

-- -----------------------------------------------------------------------------
-- 6. Catálogo de unidades: valores de arranque
--
-- Sin nada en el catálogo, el desplegable de unidad sale vacío y parece roto.
-- Estas son las unidades que aparecen en los reportes actuales; se añaden y se
-- quitan desde Parámetros globales.
-- -----------------------------------------------------------------------------

insert into public.parameters (category, label, description, position)
values
  ('unidad', 'Porcentaje',   'Cumplimiento expresado en porcentaje.',        1),
  ('unidad', 'Número',       'Conteo simple de unidades.',                   2),
  ('unidad', 'Convenios',    'Convenios suscritos o vigentes.',              3),
  ('unidad', 'Programas',    'Programas académicos.',                        4),
  ('unidad', 'Estudiantes',  'Personas matriculadas.',                       5),
  ('unidad', 'Docentes',     'Personas del cuerpo docente.',                 6),
  ('unidad', 'Publicaciones','Productos de investigación publicados.',       7),
  ('unidad', 'Proyectos',    'Proyectos formulados o en ejecución.',         8),
  ('unidad', 'Horas',        'Horas de dedicación o de formación.',          9),
  ('unidad', 'Millones COP', 'Pesos colombianos, en millones.',             10)
on conflict (category, label) do nothing;

-- -----------------------------------------------------------------------------
-- 7. Permisos y caché de la API
-- -----------------------------------------------------------------------------

grant select on public.activity_targets, public.pillar_observations to anon, authenticated;
grant insert, update, delete on public.activity_targets, public.pillar_observations to authenticated;

notify pgrst, 'reload schema';
