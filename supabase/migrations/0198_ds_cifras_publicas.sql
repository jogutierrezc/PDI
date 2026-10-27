-- =============================================================================
-- 0198 · Datos de Sostenibilidad: las cifras que lee el portal público
--
-- ds_cifras_publicas() entrega a UDES Sostenible (sin sesión incluida) las filas
-- de los libros en estado 'listo' que están conectados a un indicador, leídas
-- con el mapa de ds_respuestas. Devuelve solo cifra, periodo, campus, fuente y
-- evidencia: ni oficinas, ni usuarios, ni libros en borrador.
--
-- El catálogo ds_indicadores ya lo mantiene la administración con la política
-- de 0178 (ds_indicadores_admin: for all, current_role() = 'admin'); aquí solo
-- se completa lo que el editor del catálogo necesita (ver el final).
--
-- Idempotente: se puede aplicar más de una vez.
-- =============================================================================

/**
 * {"13.2": [{valor, periodo, campus, fuente, evidencia}, ...], ...}
 * Solo libros 'listo'. `valor` es número (las filas sin número se omiten); el
 * resto, texto o nulo. security definer: lee sin pasar por RLS, por eso entrega
 * únicamente estas cinco columnas.
 */
create or replace function public.ds_cifras_publicas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(t.indicador_id, t.filas), '{}'::jsonb)
    from (
      select r.indicador_id,
             jsonb_agg(
               jsonb_build_object(
                 'valor',     case when jsonb_typeof(f.datos -> (r.mapa ->> 'valor')) = 'number'
                                   then f.datos -> (r.mapa ->> 'valor') end,
                 'periodo',   nullif(btrim(f.datos ->> (r.mapa ->> 'periodo')), ''),
                 'campus',    nullif(btrim(f.datos ->> (r.mapa ->> 'campus')), ''),
                 'fuente',    nullif(btrim(f.datos ->> (r.mapa ->> 'fuente')), ''),
                 'evidencia', nullif(btrim(f.datos ->> (r.mapa ->> 'evidencia')), '')
               )
               order by f.orden
             ) as filas
        from public.ds_respuestas r
        join public.ds_libros l on l.id = r.libro_id and l.estado = 'listo'
        join public.ds_filas f on f.libro_id = l.id
       where jsonb_typeof(f.datos -> (r.mapa ->> 'valor')) = 'number'
         and nullif(btrim(f.datos ->> (r.mapa ->> 'periodo')), '') is not null
       group by r.indicador_id
    ) t;
$$;

revoke all on function public.ds_cifras_publicas() from public;
grant execute on function public.ds_cifras_publicas() to anon, authenticated;

comment on function public.ds_cifras_publicas() is
  'Cifras de libros de Datos de Sostenibilidad en estado listo, por indicador, para el portal público (UDES Sostenible).';

-- -----------------------------------------------------------------------------
-- Catálogo: el editor de la administración
-- -----------------------------------------------------------------------------

-- El id (clave que el editor escribe a mano, p. ej. «13.5») no puede ir vacío ni
-- ser larguísimo. Los ids de 0178 son «ods.número». RLS ya basta: solo admin escribe.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ds_indicadores_id_forma') then
    alter table public.ds_indicadores
      add constraint ds_indicadores_id_forma check (btrim(id) <> '' and length(id) <= 40) not valid;
  end if;
end $$;
