-- =============================================================================
-- PDI · 0063 · Impacto: estructura y roles configurables
--
-- El módulo Impacto no crea un organigrama propio: usa el de «Mis Tableros»
-- (0057). Una vicerrectoría, una facultad y un programa ya son `units`; aquí
-- solo ganan lo que Impacto necesita saber de ellas:
--
--   · el programa: código SNIES, nivel de formación, modalidad y en qué sedes
--     se ofrece (`imp_program_campuses`, sobre las sedes de 0017);
--   · la vicerrectoría: qué función sustantiva valida.
--
-- LOS ROLES SON DATOS
--
-- Quién puede capturar, enviar, aprobar o validar no se escribe en el código.
-- Cada rol de acceso (0024) lleva una lista de capacidades de Impacto, y
-- Planeación puede crear roles nuevos y marcarlas desde «Usuarios y roles».
-- La persona recibe el rol *en una unidad* (`unit_members.access_role_id`):
-- directora del programa de Medicina, decano de la facultad, vicerrectora de
-- Investigaciones.
--
-- CAPTURAR NO SE HEREDA
--
-- En «Mis Tableros» el papel baja por el árbol: quien dirige la facultad
-- dirige sus programas. Para capturar datos eso no sirve: el decano audita lo
-- que reportan sus programas y no debe poder escribirlo. Por eso las
-- capacidades se piden con o sin herencia (`imp_can(cap, unidad, inherit)`):
-- capturar y enviar, solo en la propia unidad; aprobar, desde la facultad
-- hacia abajo; validar, por función sustantiva.
--
-- Requiere 0017 (campuses), 0024 (access_roles), 0057 (units). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lo que una unidad le dice a Impacto
-- -----------------------------------------------------------------------------

alter table public.units add column if not exists snies_code text;
alter table public.units add column if not exists degree_level text;
alter table public.units add column if not exists modality text;
alter table public.units add column if not exists substantive_function text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'units_degree_level_check') then
    alter table public.units add constraint units_degree_level_check
      check (degree_level is null or degree_level in ('pregrado', 'especializacion', 'maestria', 'doctorado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_modality_check') then
    alter table public.units add constraint units_modality_check
      check (modality is null or modality in ('presencial', 'virtual', 'distancia', 'dual', 'hibrida'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_substantive_function_check') then
    alter table public.units add constraint units_substantive_function_check
      check (substantive_function is null or substantive_function in ('investigacion', 'ensenanza', 'extension'));
  end if;
  -- Nivel y modalidad son de programas; la función, de vicerrectorías.
  if not exists (select 1 from pg_constraint where conname = 'units_program_fields') then
    alter table public.units add constraint units_program_fields
      check (kind = 'programa' or (degree_level is null and modality is null and snies_code is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_vice_function') then
    alter table public.units add constraint units_vice_function
      check (kind = 'vicerrectoria' or substantive_function is null);
  end if;
end $$;

comment on column public.units.snies_code is 'Código SNIES del programa.';
comment on column public.units.degree_level is 'Nivel de formación del programa: decide qué indicadores le aplican.';
comment on column public.units.modality is 'Modalidad del programa: presencial, virtual, a distancia, dual o híbrida.';
comment on column public.units.substantive_function is 'Función sustantiva que valida la vicerrectoría en Impacto.';

create unique index if not exists units_snies_code_unique on public.units (snies_code) where snies_code is not null;

-- Bogotá no estaba en las sedes del PDI (0017 trae tres). Entra en borrador:
-- existe para Impacto y el portal público de campus no la muestra hasta que
-- alguien la publique con su informe.
insert into public.campuses (slug, code, name, owner, position)
values ('bogota', 'BOG', 'Bogotá', 'Sede Bogotá', 4)
on conflict (slug) do nothing;

-- En qué sedes se ofrece cada programa.
create table if not exists public.imp_program_campuses (
  program_id uuid not null references public.units (id) on delete cascade,
  campus_id  uuid not null references public.campuses (id) on delete restrict,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (program_id, campus_id)
);

comment on table public.imp_program_campuses is
  'Oferta por sede: en qué campus se ofrece cada programa. Decide las asignaciones por programa y sede.';

create index if not exists imp_program_campuses_campus_idx on public.imp_program_campuses (campus_id);

-- Solo los programas se ofrecen en sedes.
create or replace function public.imp_program_campuses_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.units u where u.id = new.program_id and u.kind = 'programa') then
    raise exception 'Solo un programa se ofrece en una sede.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists imp_program_campuses_guard on public.imp_program_campuses;
create trigger imp_program_campuses_guard
  before insert or update on public.imp_program_campuses
  for each row execute function public.imp_program_campuses_guard();

-- -----------------------------------------------------------------------------
-- 2. Capacidades de Impacto en los roles de acceso
-- -----------------------------------------------------------------------------

alter table public.access_roles add column if not exists capabilities text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'access_roles_capabilities_known') then
    alter table public.access_roles add constraint access_roles_capabilities_known
      check (capabilities <@ array[
        'impacto.catalogo',   -- importar la matriz, editar fichas, publicar versiones
        'impacto.periodo',    -- abrir periodos, revisar asignaciones, cargar precargados
        'impacto.capturar',   -- llenar registros de su programa
        'impacto.enviar',     -- enviar el paquete del programa a decanatura
        'impacto.aprobar',    -- aprobar o devolver en decanatura
        'impacto.validar'     -- validar o devolver en la vicerrectoría de su función
      ]::text[]);
  end if;
end $$;

comment on column public.access_roles.capabilities is
  'Capacidades de Impacto del rol. Planeación las marca en «Usuarios y roles»; ningún permiso de Impacto está escrito en el código.';

-- El rol con el que alguien trabaja en una unidad concreta.
alter table public.unit_members add column if not exists access_role_id uuid references public.access_roles (id) on delete set null;

comment on column public.unit_members.access_role_id is
  'Rol de Impacto de la persona en esta unidad (directora de programa, reportante, decano…). Sus capacidades valen aquí.';

create index if not exists unit_members_access_role_idx on public.unit_members (access_role_id);

-- Los roles de partida. Son del sistema: se pueden renombrar, no borrar.
insert into public.access_roles (key, name, description, base_role, screens, all_screens, all_reports, is_system, position, capabilities)
values
  ('impacto_admin', 'Administración de Impacto',
   'Planeación Institucional: configura el catálogo y los periodos. No captura ni valida datos.',
   'planeacion', array['impacto'], false, false, true, 20, array['impacto.catalogo', 'impacto.periodo']),
  ('impacto_director', 'Dirección de programa',
   'Captura y envía a decanatura lo que reporta su programa.',
   'consulta', array['impacto'], false, false, true, 21, array['impacto.capturar', 'impacto.enviar']),
  ('impacto_reportante', 'Reportante de programa',
   'Captura los datos de su programa; el envío lo hace la dirección.',
   'consulta', array['impacto'], false, false, true, 22, array['impacto.capturar']),
  ('impacto_decano', 'Decanatura',
   'Audita lo que reportan los programas de su facultad: aprueba o devuelve.',
   'consulta', array['impacto'], false, false, true, 23, array['impacto.aprobar']),
  ('impacto_vicerrector', 'Vicerrectoría',
   'Garante del dato: valida los registros de su función sustantiva.',
   'consulta', array['impacto'], false, false, true, 24, array['impacto.validar'])
on conflict (key) do update
  set capabilities = excluded.capabilities,
      is_system = true;

-- -----------------------------------------------------------------------------
-- 3. ¿Puede quien pregunta hacer esto en esta unidad?
-- -----------------------------------------------------------------------------

/**
 * Capacidad de Impacto en una unidad.
 *
 * Con `inherit` basta tenerla en la unidad o en una de la que cuelga (aprobar:
 * el decano sobre sus programas). Sin él, tiene que estar puesta en la unidad
 * misma (capturar: solo en el propio programa).
 */
create or replace function public.imp_can(cap text, target uuid, inherit boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.unit_members m
      join public.access_roles r on r.id = m.access_role_id
      join public.unit_chain(target) c on c.id = m.unit_id
      join public.profiles p on p.id = m.profile_id
     where m.profile_id = auth.uid()
       and p.is_active
       and cap = any (r.capabilities)
       and (inherit or c.depth = 0)
  );
$$;

comment on function public.imp_can(text, uuid, boolean) is
  'Capacidad de Impacto de quien pregunta en una unidad; con inherit también vale la puesta en una unidad superior.';

/**
 * Capacidades globales: las del rol de acceso del perfil. Es donde vive la
 * administración del catálogo y de los periodos, que no es de una unidad.
 */
create or replace function public.imp_can_global(cap text)
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
     where p.id = auth.uid()
       and p.is_active
       and cap = any (r.capabilities)
  )
  -- La administración conserva todo, como en 0061: alguien tiene que poder
  -- arreglar un desastre.
  or public.has_role_at_least('admin');
$$;

comment on function public.imp_can_global(text) is
  'Capacidad de Impacto que no depende de una unidad (catálogo, periodos). La administración siempre la tiene.';

/** Funciones sustantivas que valida quien pregunta, por su vicerrectoría. */
create or replace function public.imp_validator_functions()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct u.substantive_function), '{}')
    from public.unit_members m
    join public.access_roles r on r.id = m.access_role_id
    join public.units u on u.id = m.unit_id
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = auth.uid()
     and p.is_active
     and 'impacto.validar' = any (r.capabilities)
     and u.kind = 'vicerrectoria'
     and u.substantive_function is not null;
$$;

comment on function public.imp_validator_functions() is
  'Funciones sustantivas (investigacion, ensenanza, extension) que valida quien pregunta.';

-- -----------------------------------------------------------------------------
-- 4. Permisos y políticas
-- -----------------------------------------------------------------------------

alter table public.imp_program_campuses enable row level security;

drop policy if exists imp_program_campuses_read on public.imp_program_campuses;
create policy imp_program_campuses_read on public.imp_program_campuses
  for select to authenticated using (true);

drop policy if exists imp_program_campuses_write on public.imp_program_campuses;
create policy imp_program_campuses_write on public.imp_program_campuses
  for all to authenticated
  using (public.imp_can_global('impacto.periodo'))
  with check (public.imp_can_global('impacto.periodo'));

grant select, insert, update, delete on public.imp_program_campuses to authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array['imp_can(text, uuid, boolean)', 'imp_can_global(text)', 'imp_validator_functions()'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
