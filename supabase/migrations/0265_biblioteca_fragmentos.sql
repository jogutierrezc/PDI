-- =============================================================================
-- PDI · 0265 · Biblioteca de evidencias · el texto de cada archivo con su lugar
--
-- Requiere 0152 y 0264. Idempotente.
--
-- Hasta ahora la biblioteca guardaba un solo texto corrido por archivo (recortado a
-- 20 000 caracteres): las cifras que Pilo Publica sacaba de un documento no podían decir
-- de qué página, hoja o celda venían, y una tabla de Excel quedaba sin sus encabezados.
--
-- Cada archivo se guarda ahora en FRAGMENTOS con su ubicación:
--   · PDF → una página por fragmento («p. 12»)
--   · PowerPoint → una diapositiva («Diapositiva 3»)
--   · Word → grupos de párrafos bajo su título («Sección «Resultados»»), y cada tabla
--   · Excel y CSV → cada tabla de cada hoja, con sus filas y columnas («Hoja «X» · filas 3–20»)
-- Un fragmento de tabla guarda sus celdas (`tabla`) para leer cada valor con su
-- encabezado y su celda (C14).
--
-- La función pilo-publica los lee con la llave de servicio; la intranet (Planeación)
-- los lee para mostrar el extracto de donde sale una cifra.
-- pp_cifras_publicas devuelve además `ubicacion` («p. 12», «Hoja «X» · celda C14»):
-- es un dato seguro; el extracto y la cita siguen siendo internos.
-- =============================================================================

create table if not exists public.ranking_biblioteca_fragmentos (
  id            bigint generated always as identity primary key,
  biblioteca_id uuid   not null references public.ranking_biblioteca (id) on delete cascade,
  orden         int    not null,
  tipo          text   not null,
  ubicacion     text   not null,
  hoja          text,
  texto         text   not null default '',
  tabla         jsonb,
  constraint ranking_biblioteca_fragmentos_tipo check (tipo in ('pagina', 'diapositiva', 'parrafos', 'tabla', 'texto')),
  constraint ranking_biblioteca_fragmentos_texto check (char_length(texto) <= 30000),
  constraint ranking_biblioteca_fragmentos_tabla check (tabla is null or jsonb_typeof(tabla) = 'object')
);

create unique index if not exists ranking_biblioteca_fragmentos_orden on public.ranking_biblioteca_fragmentos (biblioteca_id, orden);

comment on table public.ranking_biblioteca_fragmentos is
  'Texto de cada archivo de la biblioteca por página, diapositiva, sección o tabla, con su ubicación. Las cifras de Pilo Publica citan de aquí.';
comment on column public.ranking_biblioteca_fragmentos.tabla is
  '{fila0, col0, celdas: [[texto|número|null]]}: la tabla con la posición de su primera celda en la hoja (1 = fila 1 / columna A).';

alter table public.ranking_biblioteca
  add column if not exists fragmentos int not null default 0;

comment on column public.ranking_biblioteca.fragmentos is
  'Cuántos fragmentos con ubicación tiene el archivo. 0 = leído con la versión vieja: hay que releerlo.';

alter table public.ranking_biblioteca_fragmentos enable row level security;

drop policy if exists ranking_biblioteca_fragmentos_planeacion on public.ranking_biblioteca_fragmentos;
create policy ranking_biblioteca_fragmentos_planeacion on public.ranking_biblioteca_fragmentos for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

revoke all on public.ranking_biblioteca_fragmentos from anon;
grant select, insert, update, delete on public.ranking_biblioteca_fragmentos to authenticated;

-- -----------------------------------------------------------------------------
-- Las cifras públicas dicen también de qué página u hoja salen
-- -----------------------------------------------------------------------------

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
           'indicador',      c.source -> 'indicador',
           'ubicacion',      c.source -> 'ubicacion'
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

notify pgrst, 'reload schema';
