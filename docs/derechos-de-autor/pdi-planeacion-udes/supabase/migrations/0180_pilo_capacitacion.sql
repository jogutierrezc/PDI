-- =============================================================================
-- 0180 · Capacitación de Pilo.
--
-- Una sola memoria y dos capas de pensamiento (Institucional y Académica).
-- Cada pieza del catálogo tiene una capa (cómo razona Pilo) y un público (quién
-- puede oír la respuesta). Lo del Consejo Directivo nunca llega a un estudiante.
--
--   pilo_capacitacion_piezas     por respuesta del catálogo: su espacio, su capa
--                                y su público. La clave del catálogo la da 0096.
--   pilo_capacitacion_oficinas   por oficina: qué capas puede enseñar y si lo que
--                                propone un contribuyente exige aprobación del
--                                Gestor. Una oficina sin fila usa los valores de
--                                partida de la pantalla.
--
-- Solo la administración lee y cambia estas tablas. Requiere 0096, 0109 y 0113.
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Capa y público de cada pieza del catálogo
-- -----------------------------------------------------------------------------

create table if not exists public.pilo_capacitacion_piezas (
  space        text not null default 'planeacion',
  catalog_key  text not null,
  capa         text not null,
  publico      text[] not null default '{}',
  updated_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  primary key (space, catalog_key),
  constraint pilo_capacitacion_piezas_capa check (capa in ('institucional', 'academica')),
  constraint pilo_capacitacion_piezas_publico check (publico <@ array['consejo', 'admin', 'colab', 'prof', 'est']::text[])
);

comment on table public.pilo_capacitacion_piezas is
  'Capacitación de Pilo: la capa que piensa y el público que puede oír cada respuesta del catálogo.';

alter table public.pilo_capacitacion_piezas enable row level security;

drop policy if exists pilo_capacitacion_piezas_admin on public.pilo_capacitacion_piezas;
create policy pilo_capacitacion_piezas_admin on public.pilo_capacitacion_piezas
  for all to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

revoke all on public.pilo_capacitacion_piezas from anon;
grant select, insert, update, delete on public.pilo_capacitacion_piezas to authenticated;

-- -----------------------------------------------------------------------------
-- Permisos por oficina
-- -----------------------------------------------------------------------------

create table if not exists public.pilo_capacitacion_oficinas (
  oficina               text primary key,
  ensena_institucional  boolean not null default false,
  ensena_academica      boolean not null default false,
  exige_aprobacion      boolean not null default false,
  updated_at            timestamptz not null default now(),
  updated_by            uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint pilo_capacitacion_oficinas_len check (length(oficina) between 2 and 120)
);

comment on table public.pilo_capacitacion_oficinas is
  'Capacitación de Pilo: qué capas puede enseñar cada oficina y si sus aportes exigen aprobación del Gestor.';

alter table public.pilo_capacitacion_oficinas enable row level security;

drop policy if exists pilo_capacitacion_oficinas_admin on public.pilo_capacitacion_oficinas;
create policy pilo_capacitacion_oficinas_admin on public.pilo_capacitacion_oficinas
  for all to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

revoke all on public.pilo_capacitacion_oficinas from anon;
grant select, insert, update, delete on public.pilo_capacitacion_oficinas to authenticated;
