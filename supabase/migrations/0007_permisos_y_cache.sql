-- =============================================================================
-- PDI · 0007 · Permisos de la API y recarga de la caché.
--
-- PostgREST —la API REST de Supabase— no lee el esquema en cada petición: lo
-- guarda en una caché que reconstruye cuando recibe un aviso. Si la caché está
-- vieja, o si el rol anónimo no tiene permiso sobre un objeto, la respuesta no
-- es 401 sino **404 con "Could not find the table ... in the schema cache"**,
-- que se confunde con "la tabla no existe".
--
-- Esta migración vuelve a conceder todos los permisos y pide la recarga. Es
-- segura de ejecutar tantas veces como haga falta, y conviene volver a
-- ejecutarla cada vez que se cree una tabla o una vista nueva a mano.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permisos sobre todo lo que existe ahora
--
-- Las órdenes GRANT ... ON ALL solo alcanzan a los objetos que existen en ese
-- momento: por eso se repiten aquí, después de que 0003 y 0006 crearan sus
-- vistas.
-- -----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Y sobre lo que se cree en el futuro.
alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Comprobación: avisa si falta algo
--
-- Mejor un aviso explícito al aplicar la migración que un 404 en producción.
-- -----------------------------------------------------------------------------

do $$
declare
  faltan text;
begin
  select string_agg(nombre, ', ' order by nombre) into faltan
  from (
    select c.relname as nombre
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v')
      and not has_table_privilege('anon', c.oid, 'SELECT')
  ) as pendientes;

  if faltan is not null then
    raise warning 'El rol anónimo no puede leer: %. La API responderá 404 sobre esos objetos.', faltan;
  else
    raise notice 'Permisos de lectura correctos para el rol anónimo.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Recargar la caché de la API
--
-- Equivale a pulsar "Reload schema cache" en el panel. Sin esto, un objeto
-- recién creado puede seguir dando 404 durante un rato.
-- -----------------------------------------------------------------------------

notify pgrst, 'reload schema';
