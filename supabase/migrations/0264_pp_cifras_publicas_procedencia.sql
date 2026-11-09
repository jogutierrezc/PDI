-- =============================================================================
-- PDI · 0264 · Pilo Publica · las cifras públicas dicen qué son y de dónde salen
--
-- Requiere 0262. Idempotente.
--
-- pp_cifras_publicas (0262) devolvía solo valor, unidad y año: el informe público no podía
-- decir qué mide cada cifra ni su fuente. Ahora devuelve además `source`, con un
-- subconjunto SEGURO de la procedencia: la explicación (ES/EN), la tabla o informe de
-- origen, la oficina, el periodo, el desglose y el nombre del indicador.
-- No sale la cita literal, el enlace, la fila ni la fórmula: eso es interno.
-- Sigue devolviendo solo las cifras citadas por bloques activos de un informe publicado.
-- =============================================================================

drop function if exists public.pp_cifras_publicas(uuid);

create or replace function public.pp_cifras_publicas(p_informe uuid)
returns table (key text, label text, label_en text, unit text, year int, value numeric, source jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select c.key, c.label, c.label_en, c.unit, c.year, c.value,
         jsonb_strip_nulls(jsonb_build_object(
           'descripcion',    c.source -> 'descripcion',
           'descripcion_en', c.source -> 'descripcion_en',
           'tabla',          c.source -> 'tabla',
           'oficina',        c.source -> 'oficina',
           'periodo',        c.source -> 'periodo',
           'desglose',       c.source -> 'desglose',
           'indicador',      c.source -> 'indicador'
         )) as source
    from public.pp_cifras c
    join public.pp_informes i on i.id = c.informe_id
   where c.informe_id = p_informe
     and i.state = 'publicado'
     and exists (
       select 1 from public.pp_bloques b
        where b.informe_id = c.informe_id
          and b.enabled
          and (
            b.spec ->> 'cifra' = c.key
            or exists (select 1 from jsonb_array_elements(coalesce(b.spec -> 'series', '[]'::jsonb)) s where s ->> 'cifra' = c.key)
            or b.figs @> to_jsonb(c.key)
          )
     );
$$;

revoke all on function public.pp_cifras_publicas(uuid) from public;
grant execute on function public.pp_cifras_publicas(uuid) to anon, authenticated, service_role;

-- PostgREST: que vea la firma nueva sin reiniciar.
notify pgrst, 'reload schema';
