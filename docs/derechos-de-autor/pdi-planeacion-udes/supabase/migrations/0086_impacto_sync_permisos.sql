-- =============================================================================
-- PDI · 0086 · Impacto: la sincronización no depende de cada política
-- =============================================================================
-- Síntoma: «No tienes permiso para hacer este cambio» (403, 42501) al aplicar
-- la sincronización con la hoja de Apps Script, siendo administración.
--
-- Causa: imp_sync_apply corría con los permisos de quien llama (security
-- invoker), así que cada escritura interna pasaba por RLS y por los GRANT de
-- cada tabla. La primera versión de 0083 solo daba SELECT sobre
-- imp_sync_runs, y anotar la corrida en el historial fallaba.
--
-- Arreglo:
--   · imp_sync_apply pasa a security definer: escribe con los permisos de la
--     función. Sigue empezando por comprobar que quien llama es de la
--     administración, y auth.uid() sigue siendo quien llama (created_by,
--     updated_by, run_by).
--   · Por si acaso, los permisos y la política de inserción del historial se
--     vuelven a declarar.
--
-- Requiere 0083 y 0084. Idempotente.
-- =============================================================================

alter function public.imp_sync_apply(jsonb) security definer;
alter function public.imp_sync_apply(jsonb) set search_path = public;

revoke all on function public.imp_sync_apply(jsonb) from public;
grant execute on function public.imp_sync_apply(jsonb) to authenticated;

grant select, insert on public.imp_sync_runs to authenticated;

drop policy if exists imp_sync_runs_admin_insert on public.imp_sync_runs;
create policy imp_sync_runs_admin_insert on public.imp_sync_runs
  for insert to authenticated
  with check (public.has_role_at_least('admin'));

notify pgrst, 'reload schema';
