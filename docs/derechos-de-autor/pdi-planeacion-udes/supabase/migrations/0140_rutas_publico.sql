-- =============================================================================
-- 0140 · Ruta del bus UDES, versión pública (/rutas): solo lectura de la ruta.
--
-- La migración 0139 dejó todo el módulo cerrado a Planeación y administración.
-- Aquí se abre, y solo a lectura, lo mínimo para dibujar el mapa público sin
-- iniciar sesión: la ruta, sus paradas y su trazado, y únicamente de las rutas
-- que están activas y marcadas como públicas.
--
--   bus_routes          select a anon y authenticated, solo filas con active y public.
--                       Para anon, además, solo las columnas que el mapa usa (nada de
--                       flota ni capacidad).
--   bus_stops           select de las paradas de una ruta activa y pública.
--   bus_route_geometry  select del trazado de una ruta activa y pública.
--
-- Lo que NO se abre, y sigue como en 0139 (Planeación y administración, nadie más):
--   bus_origin_cells (estudiantes por celda), bus_ridership (abordajes) y
--   bus_proposals (propuestas). Ni una política, ni un grant a anon.
--
-- La política `for all` de Planeación (0139) sigue mandando para escribir: estas
-- son políticas permisivas de solo select y se suman con un OR, no la reemplazan.
--
-- Columnas nuevas de bus_routes:
--   public           false oculta una ruta del mapa público sin desactivarla.
--   first_departure  primera salida de la UDES (por defecto 05:30, como el módulo interno).
--   last_departure   última salida de la UDES (por defecto 21:00).
-- Con headway_min (0139) forman el horario publicado. Los buses del mapa público son
-- una simulación calculada con ese horario, no un GPS.
--
-- Idempotente. No hay DELETE ni UPDATE en esta migración.
-- =============================================================================

alter table public.bus_routes add column if not exists "public" boolean not null default true;
alter table public.bus_routes add column if not exists first_departure time not null default '05:30';
alter table public.bus_routes add column if not exists last_departure time not null default '21:00';
alter table public.bus_routes drop constraint if exists bus_routes_departures;
alter table public.bus_routes add constraint bus_routes_departures check (last_departure >= first_departure);

comment on column public.bus_routes."public" is
  'Rutas (0140): true muestra la ruta en la página pública /rutas (junto con active). false la oculta sin desactivarla.';

-- Lectura pública de las rutas activas y públicas.
drop policy if exists bus_routes_publico on public.bus_routes;
create policy bus_routes_publico on public.bus_routes
  for select to anon, authenticated
  using (active and "public");

drop policy if exists bus_stops_publico on public.bus_stops;
create policy bus_stops_publico on public.bus_stops
  for select to anon, authenticated
  using (exists (select 1 from public.bus_routes r where r.id = bus_stops.route_id and r.active and r."public"));

drop policy if exists bus_route_geometry_publico on public.bus_route_geometry;
create policy bus_route_geometry_publico on public.bus_route_geometry
  for select to anon, authenticated
  using (exists (select 1 from public.bus_routes r where r.id = bus_route_geometry.route_id and r.active and r."public"));

-- Permisos de tabla para anon: solo select, y en bus_routes solo las columnas del mapa.
revoke all on public.bus_routes from anon;
revoke all on public.bus_stops from anon;
revoke all on public.bus_route_geometry from anon;
grant select (id, code, name, color, active, "public", headway_min, terminal_dwell_min, first_departure, last_departure, updated_at) on public.bus_routes to anon;
grant select on public.bus_stops to anon;
grant select on public.bus_route_geometry to anon;

-- Las tres tablas privadas se quedan cerradas a anon (por si algo las abrió después de 0139).
revoke all on public.bus_origin_cells from anon;
revoke all on public.bus_ridership from anon;
revoke all on public.bus_proposals from anon;
