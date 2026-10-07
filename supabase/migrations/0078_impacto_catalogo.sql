-- =============================================================================
-- PDI · 0078 · Indicadores de Impacto, de nuevo desde cero
--
-- El módulo se retiró en 0077 para rehacerlo. Esta es la base del rediseño:
--
--   imp_unit_functions   qué funciones sustantivas lleva cada vicerrectoría u
--                        oficina. Una vicerrectoría suele llevar una; una
--                        oficina (Bienestar, Internacionalización) puede tener
--                        indicadores en varias.
--   imp_dimensions       las dimensiones del PDI dentro de cada función
--                        (Permanencia, Aprendizaje…): las filas de la cadena.
--   imp_indicators       la ficha: función, eslabón, dimensión, cómo se mide,
--                        metas, procedencia. La define su unidad dueña.
--   imp_indicator_refs   un indicador que además se muestra como antecedente
--                        en otra dimensión (referencia cruzada).
--   imp_adoptions        qué indicadores sigue cada programa EN CADA SEDE, con
--                        su línea base y sus metas propias.
--   imp_values           las cifras por año: la global de la unidad dueña
--                        (sin programa) y la de cada programa en cada sede.
--   imp_criteria         el diccionario que estandariza cómo se reconoce a qué
--                        pilar del PDI u ODS apunta un indicador.
--   imp_alignments       el cruce indicador ↔ pilar u ODS: sugerido por el
--                        motor, cargado de la matriz o puesto a mano.
--
-- QUIÉN VE Y QUIÉN ESCRIBE
--
--   · Planeación (rol global) lee todo; la administración escribe todo.
--   · Una vicerrectoría u oficina ve y define SOLO las funciones que lleva:
--     pertenencia DIRECTA a la unidad (la herencia del árbol no sube: un
--     decano que cuelga de la Vicerrectoría de Enseñanza no se vuelve
--     vicerrector). Editor o jefe crean y editan; visor consulta.
--   · Un programa (o su facultad, por herencia) ve las fichas PUBLICADAS de las
--     tres funciones, elige las que sigue y reporta su aporte por sede.
--   · La unidad dueña también puede escribir la cifra de un programa: a veces
--     la tiene ella y no el programa.
--
-- PROGRAMAS EN VARIAS SEDES
--
-- Un programa es una unidad; en qué sedes se ofrece lo dice `program_campuses`.
-- Lo que se adopta y lo que se reporta va por programa × sede. Para que quien
-- dirige Fisioterapia en Bucaramanga no escriba la de Cúcuta, la pertenencia a
-- una unidad puede llevar sede (`unit_members.campus_id`): vacía, todas.
--
-- Requiere 0017 (campuses), 0024 (has_role_at_least), 0026 (set_updated_at),
-- 0057 (units, unit_chain), 0063/0077 (program_campuses). Idempotente.
-- =============================================================================

-- 0064 dejó dos tablas del diseño anterior con los mismos nombres. El rediseño
-- las conserva fuera de los esquemas expuestos por PostgREST: así sus datos,
-- índices y relaciones quedan archivados mientras este módulo crea las nuevas.
create schema if not exists legacy_impact;

do $$
begin
  if to_regclass('public.imp_indicators') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'imp_indicators'
         and column_name = 'version_id'
     )
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'imp_indicators'
         and column_name = 'fn'
     ) then
    alter table public.imp_indicators set schema legacy_impact;
  end if;

  if to_regclass('public.imp_alignments') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'imp_alignments'
         and column_name = 'kind'
     )
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'imp_alignments'
         and column_name = 'target'
     ) then
    alter table public.imp_alignments set schema legacy_impact;
  end if;
end $$;

revoke all on schema legacy_impact from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 0. Sede en la pertenencia
-- -----------------------------------------------------------------------------

alter table public.unit_members
  add column if not exists campus_id uuid references public.campuses (id) on delete set null;

comment on column public.unit_members.campus_id is
  'Sede a la que se limita la pertenencia en un programa ofrecido en varias. Vacía: todas las sedes.';

-- -----------------------------------------------------------------------------
-- 1. Funciones de cada vicerrectoría u oficina
-- -----------------------------------------------------------------------------

create table if not exists public.imp_unit_functions (
  unit_id  uuid not null references public.units (id) on delete cascade,
  fn       text not null,
  primary key (unit_id, fn),
  constraint imp_unit_functions_fn check (fn in ('investigacion', 'ensenanza', 'extension'))
);

comment on table public.imp_unit_functions is
  'Funciones sustantivas en las que una vicerrectoría u oficina define y reporta indicadores de impacto.';

create or replace function public.imp_unit_functions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.units u where u.id = new.unit_id and u.kind in ('vicerrectoria', 'oficina')) then
    raise exception 'Solo una vicerrectoría o una oficina lleva funciones sustantivas.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists imp_unit_functions_guard on public.imp_unit_functions;
create trigger imp_unit_functions_guard
  before insert or update on public.imp_unit_functions
  for each row execute function public.imp_unit_functions_guard();

-- Las vicerrectorías que ya tenían su función marcada en la estructura.
insert into public.imp_unit_functions (unit_id, fn)
select u.id, u.substantive_function
  from public.units u
 where u.kind = 'vicerrectoria' and u.substantive_function is not null
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. Las preguntas de permisos
-- -----------------------------------------------------------------------------

/** ¿Pertenece DIRECTAMENTE a una unidad que lleva esta función? (con el papel mínimo) */
create or replace function public.imp_fn_member(target_fn text, minimum text default 'visor')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.unit_members m
      join public.imp_unit_functions f on f.unit_id = m.unit_id
     where m.profile_id = auth.uid()
       and f.fn = target_fn
       and case minimum
             when 'jefe' then m.role = 'jefe'
             when 'editor' then m.role in ('editor', 'jefe')
             else true
           end
  );
$$;

/** Lee las fichas de una función: Planeación, o quien pertenece a una unidad que la lleva. */
create or replace function public.imp_can_read_fn(target_fn text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion') or public.imp_fn_member(target_fn, 'visor');
$$;

/**
 * Define (crea, edita, publica) fichas de una función a nombre de una unidad:
 * la administración, o editor o jefe DIRECTO de esa unidad, que además debe
 * llevar la función.
 */
create or replace function public.imp_can_define(target_fn text, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('admin')
      or exists (
        select 1
          from public.unit_members m
          join public.imp_unit_functions f on f.unit_id = m.unit_id and f.fn = target_fn
         where m.profile_id = auth.uid()
           and m.unit_id = owner
           and m.role in ('editor', 'jefe')
      );
$$;

/** ¿Está del lado de los programas? Pertenece a un programa o a una facultad. */
create or replace function public.imp_on_program_side()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.unit_members m
      join public.units u on u.id = m.unit_id
     where m.profile_id = auth.uid()
       and u.kind in ('programa', 'facultad')
  );
$$;

/**
 * La pertenencia que manda sobre un programa en una sede: la más cercana del
 * árbol (como `unit_role_at`), contando solo las que valen para esa sede.
 */
create or replace function public.imp_program_role(program uuid, campus uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role::text
    from public.unit_members m
    join public.unit_chain(program) c on c.id = m.unit_id
   where m.profile_id = auth.uid()
     and (m.campus_id is null or campus is null or m.campus_id = campus)
   order by c.depth asc,
            case m.role when 'jefe' then 3 when 'editor' then 2 else 1 end desc
   limit 1;
$$;

create or replace function public.imp_can_view_program(program uuid, campus uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion') or public.imp_program_role(program, campus) is not null;
$$;

create or replace function public.imp_can_edit_program(program uuid, campus uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('admin') or public.imp_program_role(program, campus) in ('editor', 'jefe');
$$;

comment on function public.imp_can_read_fn(text) is
  'Lee fichas de una función: Planeación o miembro directo de una unidad que la lleva.';
comment on function public.imp_can_define(text, uuid) is
  'Crea y edita fichas: administración, o editor/jefe directo de la unidad dueña, que debe llevar la función.';
comment on function public.imp_can_edit_program(uuid, uuid) is
  'Reporta por un programa en una sede: administración, o editor/jefe cuya pertenencia más cercana vale para esa sede.';

-- -----------------------------------------------------------------------------
-- 3. Dimensiones
-- -----------------------------------------------------------------------------

create table if not exists public.imp_dimensions (
  id         uuid primary key default gen_random_uuid(),
  fn         text not null,
  name       text not null,
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint imp_dimensions_fn check (fn in ('investigacion', 'ensenanza', 'extension')),
  constraint imp_dimensions_unique unique (fn, name)
);

comment on table public.imp_dimensions is
  'Dimensiones del PDI dentro de cada función: las filas de la cadena de valor.';

-- -----------------------------------------------------------------------------
-- 4. La ficha
-- -----------------------------------------------------------------------------

create table if not exists public.imp_indicators (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  fn             text not null,
  stage          text not null,
  -- Impacto real sugerido por la brecha CESU (Acuerdo 01/2025): se marca aparte.
  suggested      boolean not null default false,
  dimension_id   uuid references public.imp_dimensions (id) on delete set null,
  owner_unit_id  uuid not null references public.units (id) on delete restrict,
  name           text not null,
  description    text not null default '',
  -- Cómo se mide.
  unit_label     text not null default '',
  measure        text not null default 'numero',
  numerator      text not null default '',
  denominator    text not null default '',
  direction      text not null default 'sube',
  -- Línea base y metas institucionales. El texto es lo que se muestra
  -- ("+2 pp vs LB"); el número, si lo hay, alimenta el avance.
  baseline_year  smallint not null default 2023,
  baseline_text  text not null default '',
  baseline_num   numeric,
  target_2026    text not null default '',
  target_2026_num numeric,
  target_2028    text not null default '',
  target_2028_num numeric,
  -- Procedencia.
  source         text not null default '',
  responsible    text not null default '',
  projects_text  text not null default '',
  cesu           text[] not null default '{}',
  -- Ficha metodológica: objetivo, método, interpretación, periodicidad, notas.
  sheet          jsonb not null default '{}'::jsonb,
  -- Falso cuando el indicador es de la institución y el programa solo lo consulta.
  program_reports boolean not null default true,
  status         text not null default 'borrador',
  position       integer not null default 0,
  created_by     uuid references public.profiles (id) on delete set null,
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint imp_indicators_code_unique unique (code),
  constraint imp_indicators_fn check (fn in ('investigacion', 'ensenanza', 'extension')),
  constraint imp_indicators_stage check (stage in ('insumos', 'procesos', 'productos', 'impacto')),
  constraint imp_indicators_measure check (measure in ('numero', 'porcentaje', 'proporcion', 'dual', 'pesos', 'texto')),
  constraint imp_indicators_direction check (direction in ('sube', 'baja')),
  constraint imp_indicators_status check (status in ('borrador', 'publicado', 'retirado')),
  constraint imp_indicators_code_format check (code ~ '^[A-Z]{1,4}[0-9]{1,3}$')
);

comment on table public.imp_indicators is
  'Ficha de cada indicador de impacto. La define su unidad dueña (vicerrectoría u oficina) dentro de una función que lleva.';
comment on column public.imp_indicators.measure is
  'numero · porcentaje · proporcion · dual (número y proporción) · pesos · texto (categorías como "Media-Alta").';
comment on column public.imp_indicators.direction is
  'sube: más es mejor. baja: menos es mejor (deserción).';

create index if not exists imp_indicators_fn_idx on public.imp_indicators (fn, stage, position);
create index if not exists imp_indicators_owner_idx on public.imp_indicators (owner_unit_id);

drop trigger if exists imp_indicators_set_updated_at on public.imp_indicators;
create trigger imp_indicators_set_updated_at before update on public.imp_indicators
  for each row execute function public.set_updated_at();

/** La dimensión es de la misma función, y la unidad dueña lleva la función. */
create or replace function public.imp_indicators_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.dimension_id is not null
     and not exists (select 1 from public.imp_dimensions d where d.id = new.dimension_id and d.fn = new.fn) then
    raise exception 'La dimensión no pertenece a esa función.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.imp_unit_functions f where f.unit_id = new.owner_unit_id and f.fn = new.fn) then
    raise exception 'La unidad dueña no lleva esa función sustantiva.' using errcode = '23514';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists imp_indicators_guard on public.imp_indicators;
create trigger imp_indicators_guard
  before insert or update on public.imp_indicators
  for each row execute function public.imp_indicators_guard();

-- -----------------------------------------------------------------------------
-- 5. Referencias cruzadas
-- -----------------------------------------------------------------------------

create table if not exists public.imp_indicator_refs (
  indicator_id uuid not null references public.imp_indicators (id) on delete cascade,
  dimension_id uuid not null references public.imp_dimensions (id) on delete cascade,
  stage        text not null,
  note         text not null default '',
  primary key (indicator_id, dimension_id, stage),
  constraint imp_indicator_refs_stage check (stage in ('insumos', 'procesos', 'productos', 'impacto'))
);

comment on table public.imp_indicator_refs is
  'Un indicador que además se muestra como antecedente en otra dimensión, para cerrar su cadena sin moverlo.';

-- -----------------------------------------------------------------------------
-- 6. Lo que sigue cada programa en cada sede
-- -----------------------------------------------------------------------------

create table if not exists public.imp_adoptions (
  id              uuid primary key default gen_random_uuid(),
  indicator_id    uuid not null references public.imp_indicators (id) on delete cascade,
  program_id      uuid not null references public.units (id) on delete cascade,
  campus_id       uuid not null references public.campuses (id) on delete cascade,
  baseline_year   smallint not null default 2023,
  baseline_text   text not null default '',
  baseline_num    numeric,
  target_2026     text not null default '',
  target_2026_num numeric,
  target_2028     text not null default '',
  target_2028_num numeric,
  active          boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint imp_adoptions_unique unique (indicator_id, program_id, campus_id)
);

comment on table public.imp_adoptions is
  'Indicadores que sigue un programa en una sede, con su línea base y metas propias. Quitar uno lo desactiva: lo reportado no se borra.';

create index if not exists imp_adoptions_program_idx on public.imp_adoptions (program_id, campus_id);

drop trigger if exists imp_adoptions_set_updated_at on public.imp_adoptions;
create trigger imp_adoptions_set_updated_at before update on public.imp_adoptions
  for each row execute function public.set_updated_at();

/** Solo un programa, en una sede donde se ofrece, y una ficha publicada. */
create or replace function public.imp_adoptions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.program_campuses pc
     where pc.program_id = new.program_id and pc.campus_id = new.campus_id and pc.active
  ) then
    raise exception 'El programa no se ofrece en esa sede.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and not exists (
    select 1 from public.imp_indicators i where i.id = new.indicator_id and i.status = 'publicado'
  ) then
    raise exception 'Solo se adopta una ficha publicada.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists imp_adoptions_guard on public.imp_adoptions;
create trigger imp_adoptions_guard
  before insert or update on public.imp_adoptions
  for each row execute function public.imp_adoptions_guard();

-- -----------------------------------------------------------------------------
-- 7. Las cifras
-- -----------------------------------------------------------------------------

create table if not exists public.imp_values (
  id            uuid primary key default gen_random_uuid(),
  indicator_id  uuid not null references public.imp_indicators (id) on delete cascade,
  year          smallint not null,
  -- Sin programa: la cifra global de la unidad dueña. Con programa: su sede.
  program_id    uuid references public.units (id) on delete cascade,
  campus_id     uuid references public.campuses (id) on delete cascade,
  value_num     numeric,
  numerator     numeric,
  denominator   numeric,
  value_text    text not null default '',
  -- "Este año no aplica": no es un vacío ni un cero.
  not_applicable boolean not null default false,
  evidence_url  text not null default '',
  note          text not null default '',
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint imp_values_year check (year between 2015 and 2040),
  constraint imp_values_scope check ((program_id is null) = (campus_id is null)),
  constraint imp_values_evidence check (evidence_url = '' or evidence_url ~* '^https?://')
);

comment on table public.imp_values is
  'Cifra de un indicador en un año: la global (sin programa) o la de un programa en una sede.';

create unique index if not exists imp_values_unique
  on public.imp_values (indicator_id, year,
                        coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        coalesce(campus_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists imp_values_program_idx on public.imp_values (program_id, campus_id);

create or replace function public.imp_values_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  -- Numerador y denominador: la cifra se calcula aquí, no la escribe nadie.
  if new.numerator is not null and new.denominator is not null and new.denominator <> 0 then
    new.value_num := round(new.numerator / new.denominator * 100, 4);
  end if;
  return new;
end;
$$;

drop trigger if exists imp_values_stamp on public.imp_values;
create trigger imp_values_stamp before insert or update on public.imp_values
  for each row execute function public.imp_values_stamp();

drop trigger if exists imp_values_set_updated_at on public.imp_values;
create trigger imp_values_set_updated_at before update on public.imp_values
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. Pilares y ODS: el diccionario y el cruce
-- -----------------------------------------------------------------------------

create table if not exists public.imp_criteria (
  id         uuid primary key default gen_random_uuid(),
  target     text not null,
  pillar_id  uuid references public.pillars (id) on delete cascade,
  sdg        smallint,
  term       text not null,
  weight     numeric not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint imp_criteria_target check (
    (target = 'pilar' and pillar_id is not null and sdg is null)
    or (target = 'ods' and sdg between 1 and 17 and pillar_id is null)
  ),
  constraint imp_criteria_weight check (weight > 0 and weight <= 10),
  constraint imp_criteria_term check (length(btrim(term)) between 2 and 120)
);

comment on table public.imp_criteria is
  'Criterios estandarizados del motor: términos que, hallados en la ficha, apuntan a un pilar o a un ODS, con su peso.';

create unique index if not exists imp_criteria_unique
  on public.imp_criteria (target, coalesce(pillar_id, '00000000-0000-0000-0000-000000000000'::uuid),
                          coalesce(sdg, 0), lower(term));

create table if not exists public.imp_alignments (
  id            uuid primary key default gen_random_uuid(),
  indicator_id  uuid not null references public.imp_indicators (id) on delete cascade,
  target        text not null,
  pillar_id     uuid references public.pillars (id) on delete cascade,
  sdg           smallint,
  -- motor: lo sugirió el motor · matriz: venía en la matriz vr7 · manual: a mano.
  origin        text not null default 'motor',
  confirmed     boolean not null default false,
  score         numeric,
  matched_terms text[] not null default '{}',
  updated_by    uuid references public.profiles (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint imp_alignments_target check (
    (target = 'pilar' and pillar_id is not null and sdg is null)
    or (target = 'ods' and sdg between 1 and 17 and pillar_id is null)
  ),
  constraint imp_alignments_origin check (origin in ('motor', 'matriz', 'manual'))
);

comment on table public.imp_alignments is
  'A qué pilares del PDI y a qué ODS apunta cada indicador. El motor sugiere; una persona confirma.';

create unique index if not exists imp_alignments_unique
  on public.imp_alignments (indicator_id, target,
                            coalesce(pillar_id, '00000000-0000-0000-0000-000000000000'::uuid),
                            coalesce(sdg, 0));

-- -----------------------------------------------------------------------------
-- 9. Permisos
-- -----------------------------------------------------------------------------

alter table public.imp_unit_functions enable row level security;
alter table public.imp_dimensions enable row level security;
alter table public.imp_indicators enable row level security;
alter table public.imp_indicator_refs enable row level security;
alter table public.imp_adoptions enable row level security;
alter table public.imp_values enable row level security;
alter table public.imp_criteria enable row level security;
alter table public.imp_alignments enable row level security;

-- Qué función lleva cada unidad: lo lee cualquier sesión; lo reparte la administración.
drop policy if exists imp_unit_functions_read on public.imp_unit_functions;
create policy imp_unit_functions_read on public.imp_unit_functions
  for select to authenticated using (true);
drop policy if exists imp_unit_functions_write on public.imp_unit_functions;
create policy imp_unit_functions_write on public.imp_unit_functions
  for all to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

-- Dimensiones: nombres, no datos. Las ordena quien define en esa función.
drop policy if exists imp_dimensions_read on public.imp_dimensions;
create policy imp_dimensions_read on public.imp_dimensions
  for select to authenticated using (true);
drop policy if exists imp_dimensions_write on public.imp_dimensions;
create policy imp_dimensions_write on public.imp_dimensions
  for all to authenticated
  using (public.has_role_at_least('admin') or public.imp_fn_member(fn, 'editor'))
  with check (public.has_role_at_least('admin') or public.imp_fn_member(fn, 'editor'));

-- La ficha: su función la ve entera; los programas, solo lo publicado.
drop policy if exists imp_indicators_read on public.imp_indicators;
create policy imp_indicators_read on public.imp_indicators
  for select to authenticated
  using (public.imp_can_read_fn(fn) or (status = 'publicado' and public.imp_on_program_side()));
drop policy if exists imp_indicators_insert on public.imp_indicators;
create policy imp_indicators_insert on public.imp_indicators
  for insert to authenticated
  with check (public.imp_can_define(fn, owner_unit_id));
drop policy if exists imp_indicators_update on public.imp_indicators;
create policy imp_indicators_update on public.imp_indicators
  for update to authenticated
  using (public.imp_can_define(fn, owner_unit_id))
  with check (public.imp_can_define(fn, owner_unit_id));
drop policy if exists imp_indicators_delete on public.imp_indicators;
create policy imp_indicators_delete on public.imp_indicators
  for delete to authenticated
  using (public.has_role_at_least('admin'));

-- Lo que cuelga de la ficha se lee si la ficha se lee, y se escribe si se define.
drop policy if exists imp_indicator_refs_read on public.imp_indicator_refs;
create policy imp_indicator_refs_read on public.imp_indicator_refs
  for select to authenticated
  using (exists (select 1 from public.imp_indicators i where i.id = indicator_id));
drop policy if exists imp_indicator_refs_write on public.imp_indicator_refs;
create policy imp_indicator_refs_write on public.imp_indicator_refs
  for all to authenticated
  using (exists (select 1 from public.imp_indicators i where i.id = indicator_id and public.imp_can_define(i.fn, i.owner_unit_id)))
  with check (exists (select 1 from public.imp_indicators i where i.id = indicator_id and public.imp_can_define(i.fn, i.owner_unit_id)));

drop policy if exists imp_alignments_read on public.imp_alignments;
create policy imp_alignments_read on public.imp_alignments
  for select to authenticated
  using (exists (select 1 from public.imp_indicators i where i.id = indicator_id));
drop policy if exists imp_alignments_write on public.imp_alignments;
create policy imp_alignments_write on public.imp_alignments
  for all to authenticated
  using (exists (select 1 from public.imp_indicators i where i.id = indicator_id and public.imp_can_define(i.fn, i.owner_unit_id)))
  with check (exists (select 1 from public.imp_indicators i where i.id = indicator_id and public.imp_can_define(i.fn, i.owner_unit_id)));

-- El diccionario del motor: lo lee cualquier sesión; lo estandariza la administración.
drop policy if exists imp_criteria_read on public.imp_criteria;
create policy imp_criteria_read on public.imp_criteria
  for select to authenticated using (true);
drop policy if exists imp_criteria_write on public.imp_criteria;
create policy imp_criteria_write on public.imp_criteria
  for all to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

-- Adopciones: el programa en su sede; la unidad dueña de la ficha las ve.
drop policy if exists imp_adoptions_read on public.imp_adoptions;
create policy imp_adoptions_read on public.imp_adoptions
  for select to authenticated
  using (
    public.imp_can_view_program(program_id, campus_id)
    or exists (select 1 from public.imp_indicators i where i.id = indicator_id and public.imp_can_read_fn(i.fn))
  );
drop policy if exists imp_adoptions_write on public.imp_adoptions;
create policy imp_adoptions_write on public.imp_adoptions
  for all to authenticated
  using (public.imp_can_edit_program(program_id, campus_id))
  with check (public.imp_can_edit_program(program_id, campus_id));

-- Cifras: la global se lee con la ficha; la de un programa, el programa y la
-- función. Escribe la unidad dueña (global y por programa) o el programa (la suya).
drop policy if exists imp_values_read on public.imp_values;
create policy imp_values_read on public.imp_values
  for select to authenticated
  using (
    exists (
      select 1 from public.imp_indicators i
       where i.id = indicator_id
         and (program_id is null
              or public.imp_can_read_fn(i.fn)
              or public.imp_can_view_program(program_id, campus_id))
    )
  );
drop policy if exists imp_values_write on public.imp_values;
create policy imp_values_write on public.imp_values
  for all to authenticated
  using (
    exists (select 1 from public.imp_indicators i where i.id = indicator_id and public.imp_can_define(i.fn, i.owner_unit_id))
    or (program_id is not null and public.imp_can_edit_program(program_id, campus_id))
  )
  with check (
    exists (select 1 from public.imp_indicators i where i.id = indicator_id and public.imp_can_define(i.fn, i.owner_unit_id))
    or (program_id is not null and public.imp_can_edit_program(program_id, campus_id))
  );

grant select on public.imp_unit_functions, public.imp_dimensions, public.imp_indicators,
  public.imp_indicator_refs, public.imp_adoptions, public.imp_values, public.imp_criteria,
  public.imp_alignments to authenticated;
grant insert, update, delete on public.imp_unit_functions, public.imp_dimensions, public.imp_indicators,
  public.imp_indicator_refs, public.imp_adoptions, public.imp_values, public.imp_criteria,
  public.imp_alignments to authenticated;

notify pgrst, 'reload schema';
