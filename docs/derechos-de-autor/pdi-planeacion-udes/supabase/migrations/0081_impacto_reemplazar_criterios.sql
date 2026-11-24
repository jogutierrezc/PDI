-- =============================================================================
-- PDI · 0081 · Reemplazar el diccionario del motor de una sola vez
--
-- Cargar un Excel de criterios reemplaza el diccionario entero. Hecho desde la
-- pantalla con un borrar y luego un insertar, un fallo a mitad de camino deja
-- al motor sin criterios. Aquí va en una transacción: o entra el diccionario
-- nuevo completo, o se queda el anterior.
--
-- Cada criterio llega como {target, pillar_id, sdg, term, weight}. Requiere
-- 0078. Idempotente.
-- =============================================================================

create or replace function public.imp_replace_criteria(p_criteria jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted integer;
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración estandariza los criterios del motor.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_criteria) <> 'array' or jsonb_array_length(p_criteria) = 0 then
    raise exception 'El diccionario nuevo no trae criterios.' using errcode = '22023';
  end if;

  delete from public.imp_criteria where true;

  insert into public.imp_criteria (target, pillar_id, sdg, term, weight)
  select c ->> 'target',
         nullif(c ->> 'pillar_id', '')::uuid,
         nullif(c ->> 'sdg', '')::smallint,
         btrim(c ->> 'term'),
         coalesce(nullif(c ->> 'weight', '')::numeric, 1)
    from jsonb_array_elements(p_criteria) as c
  on conflict do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

comment on function public.imp_replace_criteria(jsonb) is
  'Reemplaza el diccionario del motor en una transacción. Solo administración.';

grant execute on function public.imp_replace_criteria(jsonb) to authenticated;

notify pgrst, 'reload schema';
