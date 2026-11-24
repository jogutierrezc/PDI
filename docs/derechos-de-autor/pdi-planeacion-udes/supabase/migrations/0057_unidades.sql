-- =============================================================================
-- PDI · 0057 · Unidades de la universidad y quién es quién en ellas
--
-- El cimiento de «Mis Tableros»: el organigrama y el reparto de papeles.
--
--   units         el árbol: vicerrectorías, facultades, programas, oficinas.
--                 Cada una cuelga de otra por `parent_id`, o de nada si es de
--                 primer nivel.
--   unit_members  quién trabaja en cada unidad y con qué papel: visor, editor
--                 o jefe.
--
-- LA HERENCIA, Y CÓMO SE ROMPE
--
-- Lo que alguien es en una unidad, lo es también en las que cuelgan de ella:
-- quien dirige una facultad dirige sus programas sin que haya que apuntarlo
-- programa por programa. Pero a veces hace falta lo contrario —el decano es
-- jefe de la facultad y solo editor de un programa concreto—, así que gana la
-- pertenencia *más cercana*, no la más fuerte:
--
--   `unit_chain` devuelve la unidad y sus ancestros con su distancia;
--   `unit_role_at` toma la de menor distancia, y a igual distancia la más
--   fuerte.
--
-- Sin eso, una pertenencia puesta a propósito en el programa nunca podría
-- rebajar la que baja de la facultad, y «romper la herencia» no existiría.
--
-- PLANEACIÓN
--
-- Quien tiene el rol de la Oficina de Planeación lee los datos de todas las
-- unidades, sin que haga falta invitarle y sin que la unidad pueda quitárselo:
-- es su trabajo. Lee, no escribe: editar sigue siendo de la unidad.
--
-- POR QUÉ LAS FUNCIONES SON `security definer`
--
-- Las políticas de `unit_members` preguntan por `unit_can_view`, que a su vez
-- lee `unit_members`. Sin `security definer` eso se muerde la cola: la
-- política llamaría a una consulta que vuelve a aplicar la política. Es el
-- mismo patrón de `od_can_read` (0024) y de las subcolecciones (0052).
--
-- Requiere 0001 (profiles, app_role), 0024 (has_role_at_least) y 0026
-- (set_updated_at). Idempotente.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'unit_kind') then
    create type public.unit_kind as enum ('vicerrectoria', 'facultad', 'programa', 'oficina', 'otra');
  end if;
  if not exists (select 1 from pg_type where typname = 'unit_role') then
    create type public.unit_role as enum ('visor', 'editor', 'jefe');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. El árbol
-- -----------------------------------------------------------------------------

create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.units (id) on delete restrict,
  kind        public.unit_kind not null default 'oficina',
  -- El código con el que se la conoce: FCS, VIA, MED. Sale en el árbol.
  code        text not null,
  name        text not null,
  slug        text not null,
  description text not null default '',
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint units_slug_unique unique (slug),
  constraint units_code_unique unique (code),
  constraint units_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint units_not_own_parent check (parent_id is null or parent_id <> id)
);

comment on table public.units is
  'Organigrama: vicerrectorías, facultades, programas y oficinas, cada una colgando de otra.';
comment on column public.units.parent_id is
  'De qué unidad cuelga. Vacío en las de primer nivel. `on delete restrict`: una unidad con hijas no se borra sin recolocarlas.';

create index if not exists units_parent_idx on public.units (parent_id, position);

drop trigger if exists units_set_updated_at on public.units;
create trigger units_set_updated_at before update on public.units
  for each row execute function public.set_updated_at();

/**
 * El árbol no admite ciclos.
 *
 * Con `parent_id` a mano es fácil dejar A colgando de B y B de A, y entonces
 * `unit_chain` no termina nunca. Se comprueba al guardar, que es barato: el
 * árbol de una universidad tiene decenas de nodos, no miles.
 */
create or replace function public.units_no_cycle()
returns trigger
language plpgsql
as $$
declare
  walker uuid := new.parent_id;
  steps  integer := 0;
begin
  while walker is not null loop
    if walker = new.id then
      raise exception 'La unidad "%" no puede colgar de sí misma ni de una de las suyas.', new.name;
    end if;
    select parent_id into walker from public.units where id = walker;
    steps := steps + 1;
    if steps > 64 then
      raise exception 'El árbol de unidades tiene un ciclo.';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists units_no_cycle on public.units;
create trigger units_no_cycle
  before insert or update of parent_id on public.units
  for each row execute function public.units_no_cycle();

-- -----------------------------------------------------------------------------
-- 2. Quién trabaja en cada unidad
-- -----------------------------------------------------------------------------

create table if not exists public.unit_members (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.units (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       public.unit_role not null default 'visor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_members_unique unique (unit_id, profile_id)
);

comment on table public.unit_members is
  'Quién pertenece a cada unidad y con qué papel. El papel baja a las unidades hijas; una pertenencia en la hija lo reemplaza.';

create index if not exists unit_members_profile_idx on public.unit_members (profile_id);

drop trigger if exists unit_members_set_updated_at on public.unit_members;
create trigger unit_members_set_updated_at before update on public.unit_members
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Las preguntas que hace el resto del sistema
-- -----------------------------------------------------------------------------

/** La unidad y todas de las que cuelga, con su distancia (0 = ella misma). */
create or replace function public.unit_chain(target uuid)
returns table (id uuid, depth integer)
language sql
stable
security definer
set search_path = public
as $$
  with recursive up as (
    select u.id, u.parent_id, 0 as depth
      from public.units u
     where u.id = target
    union all
    select u.id, u.parent_id, up.depth + 1
      from public.units u
      join up on u.id = up.parent_id
     where up.depth < 64
  )
  select up.id, up.depth from up;
$$;

comment on function public.unit_chain(uuid) is
  'La unidad y sus ancestros, con la distancia a cada uno. La herencia de papeles viaja por aquí.';

/**
 * El papel de quien pregunta sobre una unidad.
 *
 * Gana la pertenencia más cercana en el árbol —por eso una puesta en el
 * programa rebaja la que baja de la facultad— y, a igual distancia, la más
 * fuerte. Sin pertenencia, nulo.
 */
create or replace function public.unit_role_at(target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role::text
    from public.unit_members m
    join public.unit_chain(target) c on c.id = m.unit_id
   where m.profile_id = auth.uid()
   order by c.depth asc,
            case m.role when 'jefe' then 3 when 'editor' then 2 else 1 end desc
   limit 1;
$$;

comment on function public.unit_role_at(uuid) is
  'Papel de quien pregunta sobre una unidad: manda la pertenencia más cercana del árbol, no la más fuerte.';

/** ¿Puede ver lo de esta unidad? Planeación siempre; los suyos, siempre. */
create or replace function public.unit_can_view(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion') or public.unit_role_at(target) is not null;
$$;

/** ¿Puede escribir? Solo editores y jefes de la unidad. Planeación no. */
create or replace function public.unit_can_edit(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.unit_role_at(target) in ('editor', 'jefe');
$$;

/** ¿Puede repartir accesos y crear o borrar tableros? El jefe, y el admin. */
create or replace function public.unit_can_lead(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('admin') or public.unit_role_at(target) = 'jefe';
$$;

comment on function public.unit_can_view(uuid) is
  'Lee lo de la unidad: quien pertenece a ella o a una de la que cuelga, y cualquiera de Planeación.';
comment on function public.unit_can_edit(uuid) is
  'Escribe en la unidad: editor o jefe. Planeación lee, no escribe.';
comment on function public.unit_can_lead(uuid) is
  'Reparte accesos y crea tableros: el jefe de la unidad, o un administrador.';

-- -----------------------------------------------------------------------------
-- 4. Permisos
--
-- El organigrama se lee entero, sin sesión: es la estructura de la
-- universidad, no un dato reservado, y una página pública de un tablero
-- necesita el nombre de la unidad que firma. Escribirlo es de Planeación: la
-- estructura institucional no la cambia cada facultad.
-- -----------------------------------------------------------------------------

alter table public.units enable row level security;
alter table public.unit_members enable row level security;

drop policy if exists units_read on public.units;
create policy units_read on public.units for select to anon, authenticated
  using (true);

drop policy if exists units_write on public.units;
create policy units_write on public.units for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

drop policy if exists unit_members_read on public.unit_members;
create policy unit_members_read on public.unit_members for select to authenticated
  using (public.unit_can_view(unit_id));

drop policy if exists unit_members_write on public.unit_members;
create policy unit_members_write on public.unit_members for all to authenticated
  using (public.unit_can_lead(unit_id))
  with check (public.unit_can_lead(unit_id));

grant select on public.units to anon, authenticated;
grant select, insert, update, delete on public.units to authenticated;
grant select, insert, update, delete on public.unit_members to authenticated;

notify pgrst, 'reload schema';
