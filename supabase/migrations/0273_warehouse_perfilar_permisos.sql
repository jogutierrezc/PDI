-- =============================================================================
-- 0273 · Warehouse: permisos de las funciones auxiliares del perfilado
--
-- Error: «permission denied for function wh_exigir» al perfilar un reporte.
-- Causa: wh_perfilar, wh_explorar, wh_filas_pagina y wh_dispersion son
-- security invoker (corren con el rol de quien llama), pero en la 0269 se les
-- quitó EXECUTE a authenticated a sus auxiliares (wh_exigir, wh_cumple,
-- wh_columnas_personales). Al llamarlas desde la principal, la base negaba el
-- permiso.
--
-- Seguro: wh_exigir vuelve a exigir wh_autorizado() (pantalla «warehouse» y rol
-- Planeación) y la RLS de wh_cargas / wh_filas sigue rigiendo. Idempotente.
-- =============================================================================

grant execute on function public.wh_columnas_personales(uuid) to authenticated;
grant execute on function public.wh_cumple(jsonb, jsonb) to authenticated;
grant execute on function public.wh_exigir(uuid, jsonb, text[]) to authenticated;
