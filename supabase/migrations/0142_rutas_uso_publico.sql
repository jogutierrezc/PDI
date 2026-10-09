-- =============================================================================
-- 0142 · Ruta del bus UDES: el uso que se puede mostrar al público.
--
-- La página pública /rutas muestra cuándo hay más gente y cuáles paradas y rutas
-- son las más usadas, SOLO con lo que se contó de verdad: bus_ridership (0139),
-- los conteos de quienes suben y bajan por parada y hora. Esa tabla sigue
-- cerrada a anon y a todo el que no sea de Planeación: no hay política ni grant
-- nuevo sobre ella. Lo público sale de dos funciones que devuelven agregados:
--
--   bus_uso_paradas(p_days)  por parada: abordajes del periodo y su participación (%).
--   bus_uso_horas(p_days)    por hora del día (0 a 23, hora de Colombia): promedio de
--                            abordajes por día de servicio.
--
-- Qué se protege:
--   · Nunca salen filas crudas, ni `source`, ni `observed_at` exacto: solo sumas.
--   · Se suprime cualquier grupo (parada u hora) con menos de 10 abordajes.
--   · Si el total del periodo es menor que 50 abordajes, no se devuelve nada
--     (todavía no hay suficientes conteos para decir algo).
--   · Solo rutas activas y públicas (active and "public", 0140).
--   · p_days se acota entre 7 y 90.
--
-- Son SECURITY DEFINER con search_path fijo, STABLE y de solo lectura.
-- Idempotente (create or replace). No hay UPDATE ni DELETE aquí.
-- =============================================================================

-- Los umbrales viven en las funciones; para cambiarlos hay que reemplazarlas:
--   10  abordajes mínimos por grupo (parada u hora)
--   50  abordajes mínimos en todo el periodo

create or replace function public.bus_uso_paradas(p_days int default 30)
returns table (route_id uuid, stop_id uuid, seq int, nombre text, abordajes bigint, participacion numeric, total_periodo bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with p as (
    select least(greatest(coalesce(p_days, 30), 7), 90) as dias
  ),
  base as (
    select s.route_id, s.id as stop_id, s.seq, s.name as nombre, sum(r.boardings)::bigint as ab
    from public.bus_ridership r
    join public.bus_stops s on s.id = r.stop_id
    join public.bus_routes b on b.id = s.route_id and b.active and b."public"
    cross join p
    where r.observed_at >= now() - make_interval(days => p.dias)
      and r.observed_at <= now()
    group by s.route_id, s.id, s.seq, s.name
  ),
  tot as (
    select coalesce(sum(base.ab), 0)::bigint as t from base
  )
  select base.route_id, base.stop_id, base.seq, base.nombre, base.ab,
         round(100.0 * base.ab / nullif(tot.t, 0), 1), tot.t
  from base cross join tot
  where tot.t >= 50      -- mínimo del periodo
    and base.ab >= 10    -- mínimo por grupo
  order by base.ab desc, base.seq;
$$;

create or replace function public.bus_uso_horas(p_days int default 30)
returns table (hora int, promedio numeric, abordajes bigint, dias_servicio int, total_periodo bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with p as (
    select least(greatest(coalesce(p_days, 30), 7), 90) as dias
  ),
  base as (
    select (extract(hour from r.observed_at at time zone 'America/Bogota'))::int as h,
           (r.observed_at at time zone 'America/Bogota')::date as dia,
           sum(r.boardings)::bigint as ab
    from public.bus_ridership r
    join public.bus_stops s on s.id = r.stop_id
    join public.bus_routes b on b.id = s.route_id and b.active and b."public"
    cross join p
    where r.observed_at >= now() - make_interval(days => p.dias)
      and r.observed_at <= now()
    group by 1, 2
  ),
  dias as (
    select count(distinct base.dia)::int as n from base
  ),
  tot as (
    select coalesce(sum(base.ab), 0)::bigint as t from base
  )
  select base.h,
         round(sum(base.ab)::numeric / greatest(dias.n, 1), 1),
         sum(base.ab)::bigint,
         dias.n,
         tot.t
  from base cross join dias cross join tot
  where tot.t >= 50      -- mínimo del periodo
  group by base.h, dias.n, tot.t
  having sum(base.ab) >= 10  -- mínimo por grupo
  order by base.h;
$$;

comment on function public.bus_uso_paradas(int) is
  'Rutas (0142): abordajes por parada en los últimos p_days días (7 a 90), solo rutas públicas. Agregados; grupos con menos de 10 y periodos con menos de 50 abordajes se suprimen.';
comment on function public.bus_uso_horas(int) is
  'Rutas (0142): promedio de abordajes por hora del día (Colombia) y día de servicio. Mismas reglas de reserva que bus_uso_paradas.';

revoke all on function public.bus_uso_paradas(int) from public;
revoke all on function public.bus_uso_horas(int) from public;
grant execute on function public.bus_uso_paradas(int) to anon, authenticated, service_role;
grant execute on function public.bus_uso_horas(int) to anon, authenticated, service_role;
