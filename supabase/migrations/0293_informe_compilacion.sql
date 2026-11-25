-- =============================================================================
-- Informes de gestión · 0293 · Compilar informe de colaboradores con Pilo.
--
-- Vicerrectorías, decanaturas y rectorías reciben los libros de Excel que devuelven
-- sus unidades de apoyo (sueltos o en un ZIP) y los organizan antes de llevarlos al
-- informe principal. Estas dos tablas guardan lo recibido y lo decidido para que el
-- trabajo siga mañana y desde otro equipo; al aprobar, lo escribe la pantalla en el
-- informe con las funciones de siempre (informe_guardar_seccion…): aquí no se toca
-- el informe.
--
--   informe_compilacion_libros   un libro recibido: nombre, equipo, hojas ya leídas (jsonb).
--   informe_compilacion          una por informe: decisiones (valor oficial y nombre
--                                unificado por indicador), borradores de Pilo por sección,
--                                nivel de razonamiento y ajustes.
--
-- Acceso: lee quien ve el informe (informe_instancia_visible); escribe quien lo
-- diligencia: Planeación, Gestor (jefe) o Contribuyente (editor) de la unidad
-- (informe_actor, 0192), y solo mientras el informe sea editable (borrador o devuelto).
-- Borra quien subió el libro o Planeación.
--
-- Es idempotente. Se aplica después de 0292.
-- =============================================================================

create or replace function public.informe_compilacion_escribe(inst uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.informe_instancias i
     where i.id = inst
       and i.estado in ('draft', 'back')
       and public.informe_actor(i.unit_id) in ('planeacion', 'jefe', 'editor')
  );
$$;

create table if not exists public.informe_compilacion_libros (
  id            uuid primary key default gen_random_uuid(),
  instancia_id  uuid not null references public.informe_instancias(id) on delete cascade,
  archivo       text not null,
  origen        text not null default 'archivo suelto',
  equipo        text not null,
  hojas         jsonb not null,
  creado_por    uuid default auth.uid() references public.profiles(id) on delete set null,
  creado_en     timestamptz not null default now(),
  constraint informe_compilacion_libros_archivo check (char_length(archivo) between 1 and 300),
  constraint informe_compilacion_libros_equipo check (char_length(equipo) between 1 and 160),
  constraint informe_compilacion_libros_tam check (pg_column_size(hojas) <= 8000000)
);

comment on table public.informe_compilacion_libros is
  'Libros de Excel recibidos de los equipos de apoyo para compilar el informe (hojas ya leídas con leerLibroCompleto). Se vuelven a clasificar al abrirlos.';

create index if not exists informe_compilacion_libros_inst_idx
  on public.informe_compilacion_libros (instancia_id, creado_en);

create table if not exists public.informe_compilacion (
  instancia_id  uuid primary key references public.informe_instancias(id) on delete cascade,
  decisiones    jsonb not null default '{}'::jsonb,
  borradores    jsonb not null default '[]'::jsonb,
  nivel         text not null default 'compleja',
  adaptar       boolean not null default true,
  actualizado_por uuid default auth.uid() references public.profiles(id) on delete set null,
  actualizado_en  timestamptz not null default now(),
  constraint informe_compilacion_nivel check (nivel in ('rapida', 'compleja', 'investigacion')),
  constraint informe_compilacion_tam check (pg_column_size(decisiones) + pg_column_size(borradores) <= 4000000)
);

comment on table public.informe_compilacion is
  'Estado de la compilación de un informe: valor oficial y nombre unificado por indicador, borradores de Pilo Astra por sección, nivel de razonamiento.';

alter table public.informe_compilacion_libros enable row level security;
alter table public.informe_compilacion enable row level security;

drop policy if exists informe_compilacion_libros_read on public.informe_compilacion_libros;
create policy informe_compilacion_libros_read on public.informe_compilacion_libros for select to authenticated
  using (public.informe_instancia_visible(instancia_id));

drop policy if exists informe_compilacion_libros_insert on public.informe_compilacion_libros;
create policy informe_compilacion_libros_insert on public.informe_compilacion_libros for insert to authenticated
  with check (creado_por = auth.uid() and public.informe_compilacion_escribe(instancia_id));

drop policy if exists informe_compilacion_libros_delete on public.informe_compilacion_libros;
create policy informe_compilacion_libros_delete on public.informe_compilacion_libros for delete to authenticated
  using (public.informe_compilacion_escribe(instancia_id) and (creado_por = auth.uid() or public.has_role_at_least('planeacion')));

drop policy if exists informe_compilacion_read on public.informe_compilacion;
create policy informe_compilacion_read on public.informe_compilacion for select to authenticated
  using (public.informe_instancia_visible(instancia_id));

drop policy if exists informe_compilacion_insert on public.informe_compilacion;
create policy informe_compilacion_insert on public.informe_compilacion for insert to authenticated
  with check (public.informe_compilacion_escribe(instancia_id));

drop policy if exists informe_compilacion_update on public.informe_compilacion;
create policy informe_compilacion_update on public.informe_compilacion for update to authenticated
  using (public.informe_compilacion_escribe(instancia_id))
  with check (public.informe_compilacion_escribe(instancia_id));

drop policy if exists informe_compilacion_delete on public.informe_compilacion;
create policy informe_compilacion_delete on public.informe_compilacion for delete to authenticated
  using (public.informe_compilacion_escribe(instancia_id));

revoke all on public.informe_compilacion_libros, public.informe_compilacion from anon;
grant select, insert, delete on public.informe_compilacion_libros to authenticated;
grant select, insert, update, delete on public.informe_compilacion to authenticated;
revoke all on function public.informe_compilacion_escribe(uuid) from public, anon;
grant execute on function public.informe_compilacion_escribe(uuid) to authenticated;
