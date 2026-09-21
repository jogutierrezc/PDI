-- =============================================================================
-- PDI · 0051 · El repositorio documental e histórico de la oficina
--
-- El portal «Documentos» (/documentos): colecciones con tapa, y dentro de cada
-- una los documentos que guarda. Dos tablas y un bucket:
--
--   doc_collections  el tomo: portada, título, subtítulo y estado. El rango de
--                    años y el conteo NO se guardan: se calculan de sus
--                    documentos, porque guardarlos abriría la puerta a que el
--                    lomo dijera una cosa y el índice otra.
--   doc_items        el documento: o un archivo subido al bucket, o un enlace
--                    externo, nunca las dos cosas. Lleva su año de vigencia y,
--                    si reemplaza a una edición anterior, a cuál reemplaza.
--
--   bucket "documentos"  los archivos. Público en lectura —son documentos
--                    institucionales—, escritura con capacidad de Planeación.
--
-- No toca `documents` (0001), que sigue siendo el repositorio de soportes del
-- PDI y se ve en /implementacion#repositorio. Son dos repositorios distintos a
-- propósito: aquel respalda las cifras del plan, este guarda la memoria
-- documental de la oficina.
--
-- Requiere 0024 (has_screen, has_role_at_least) y set_updated_at(). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las colecciones
-- -----------------------------------------------------------------------------

create table if not exists public.doc_collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  title       text not null,
  subtitle    text not null default '',
  /** Ruta de la tapa dentro del bucket "documentos". Sin ella, la inicial. */
  cover       text not null default '',
  cover_alt   text not null default '',
  status      text not null default 'borrador',
  position    smallint not null default 0,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint doc_collections_slug_unique unique (slug),
  constraint doc_collections_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint doc_collections_title_not_blank check (length(btrim(title)) > 0),
  constraint doc_collections_status check (status in ('borrador', 'publicado'))
);

comment on table public.doc_collections is
  'Repositorio documental: una colección con su tapa. El conteo y el rango de años se calculan de sus documentos, no se guardan.';
comment on column public.doc_collections.slug is
  'Parte final de la dirección pública: /documentos/<slug>. No cambia al renombrar la colección.';

create index if not exists doc_collections_order_idx on public.doc_collections (position, title);

-- -----------------------------------------------------------------------------
-- 2. Los documentos
--
-- `kind` decide de dónde sale el documento y la restricción lo hace cumplir:
-- un enlace tiene url y no ruta; un archivo tiene ruta y no url. Sin esa
-- restricción acabarían existiendo filas con las dos, y el portal tendría que
-- adivinar cuál abrir.
-- -----------------------------------------------------------------------------

create table if not exists public.doc_items (
  id             uuid primary key default gen_random_uuid(),
  collection_id  uuid not null references public.doc_collections (id) on delete cascade,
  title          text not null,
  description    text not null default '',
  kind           text not null default 'archivo',
  /** Enlace externo. Solo http(s): un `javascript:` no acaba en un href. */
  url            text,
  /** Ruta dentro del bucket "documentos". */
  path           text,
  file_name      text not null default '',
  file_type      text not null default '',
  size_bytes     bigint,
  /** Vigencia. `year_to` solo cuando el documento cubre un rango. */
  year           smallint,
  year_to        smallint,
  issued_on      date,
  version        text not null default '',
  /** A qué edición anterior reemplaza. La vigente es la que nadie reemplaza. */
  supersedes     uuid references public.doc_items (id) on delete set null,
  status         text not null default 'borrador',
  position       smallint not null default 0,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint doc_items_title_not_blank check (length(btrim(title)) > 0),
  constraint doc_items_kind check (kind in ('archivo', 'enlace')),
  constraint doc_items_status check (status in ('borrador', 'publicado')),
  constraint doc_items_source check (
    (kind = 'enlace' and url ~* '^https?://' and path is null)
    or (kind = 'archivo' and path is not null and length(btrim(path)) > 0 and url is null)
  ),
  constraint doc_items_year check (year is null or (year between 1970 and 2200)),
  constraint doc_items_year_to check (year_to is null or (year is not null and year_to >= year and year_to <= 2200)),
  -- Una edición no puede reemplazarse a sí misma; la cadena más larga la
  -- vigila la interfaz, que es donde se entiende el error.
  constraint doc_items_supersedes_self check (supersedes is null or supersedes <> id)
);

comment on table public.doc_items is
  'Repositorio documental: un documento de una colección. O archivo en el bucket, o enlace externo, nunca ambos.';
comment on column public.doc_items.supersedes is
  'La edición anterior que este documento reemplaza. La versión vigente es la que ninguna otra reemplaza.';

create index if not exists doc_items_collection_idx on public.doc_items (collection_id, position, created_at);
create index if not exists doc_items_year_idx on public.doc_items (year);
create index if not exists doc_items_supersedes_idx on public.doc_items (supersedes);

-- Marcas de tiempo -------------------------------------------------------------

drop trigger if exists doc_collections_set_updated_at on public.doc_collections;
create trigger doc_collections_set_updated_at before update on public.doc_collections
  for each row execute function public.set_updated_at();

drop trigger if exists doc_items_set_updated_at on public.doc_items;
create trigger doc_items_set_updated_at before update on public.doc_items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Permisos
-- -----------------------------------------------------------------------------

create or replace function public.doc_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion') and public.has_screen('documents');
$$;

comment on function public.doc_can_edit() is
  'Puede editar el repositorio documental: capacidad de Planeación y la pantalla «documents» en su rol de acceso.';

alter table public.doc_collections enable row level security;
alter table public.doc_items enable row level security;

drop policy if exists doc_collections_read on public.doc_collections;
create policy doc_collections_read on public.doc_collections for select to anon, authenticated
  using (status = 'publicado' or public.has_screen('documents'));

drop policy if exists doc_collections_write on public.doc_collections;
create policy doc_collections_write on public.doc_collections for all to authenticated
  using (public.doc_can_edit()) with check (public.doc_can_edit());

-- Un documento publicado dentro de una colección en borrador sigue sin verse:
-- publicar la colección es lo que abre la puerta.
drop policy if exists doc_items_read on public.doc_items;
create policy doc_items_read on public.doc_items for select to anon, authenticated
  using (
    public.has_screen('documents')
    or (
      status = 'publicado'
      and exists (
        select 1 from public.doc_collections c
        where c.id = collection_id and c.status = 'publicado'
      )
    )
  );

drop policy if exists doc_items_write on public.doc_items;
create policy doc_items_write on public.doc_items for all to authenticated
  using (public.doc_can_edit()) with check (public.doc_can_edit());

grant select on public.doc_collections, public.doc_items to anon;
grant select, insert, update, delete on public.doc_collections, public.doc_items to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Los archivos, en Storage
--
-- Mismo patrón que «proyectos» (0013), «boletines» (0027) y «oficina» (0050):
-- si el rol que aplica la migración no es dueño de storage.objects, el resto
-- queda aplicado y el aviso dice qué hacer a mano.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('documentos', 'documentos', true, 52428800)   -- 50 MB
  on conflict (id) do update set public = true, file_size_limit = 52428800;

  execute 'drop policy if exists documentos_lectura on storage.objects';
  execute $pol$
    create policy documentos_lectura on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'documentos')
  $pol$;

  execute 'drop policy if exists documentos_escritura on storage.objects';
  execute $pol$
    create policy documentos_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'documentos' and public.doc_can_edit())
  $pol$;

  execute 'drop policy if exists documentos_reemplazo on storage.objects';
  execute $pol$
    create policy documentos_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'documentos' and public.doc_can_edit())
      with check (bucket_id = 'documentos' and public.doc_can_edit())
  $pol$;

  execute 'drop policy if exists documentos_borrado on storage.objects';
  execute $pol$
    create policy documentos_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'documentos' and public.doc_can_edit())
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "documentos" (%). Créalo a mano desde Storage: público en lectura, 50 MB por archivo.',
      sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 5. La pantalla nueva en los roles hechos a medida que ya administran el portal
-- -----------------------------------------------------------------------------

update public.access_roles
   set screens = array_append(screens, 'documents')
 where not all_screens
   and not ('documents' = any (screens))
   and 'office' = any (screens);

-- -----------------------------------------------------------------------------
-- 6. Caché del esquema
-- -----------------------------------------------------------------------------

notify pgrst, 'reload schema';
