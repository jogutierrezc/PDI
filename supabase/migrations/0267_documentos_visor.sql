-- =============================================================================
-- PDI · 0267 · Documentos · resumen corto, visibilidad, código fuente y miniatura
--
-- Requiere 0051. Idempotente.
--
-- Lo que el rediseño del portal de Documentos necesita guardar por documento:
--   summary      el resumen corto (2 líneas) que se ve en el índice. La descripción
--                completa sigue en `description` y se abre con «Leer más».
--   visibility   'publico' (cualquiera) o 'intranet' (solo personas con sesión).
--                OJO: oculta el documento del listado público. El archivo vive en un
--                bucket público: quien tenga la dirección exacta podría abrirlo.
--   flavor       de dónde viene un .html: '' (HTML común), 'quarto' o 'rmarkdown'.
--                Cambia cómo se rotula y si se ofrece el código fuente.
--   source_path  el código fuente (.qmd, .Rmd, .R) en el mismo bucket, para mostrarlo
--                junto al resultado. source_name es su nombre.
--   thumb_path   la miniatura (imagen) en el mismo bucket. Sin ella el portal dibuja
--                una portada con el tipo y el título.
-- =============================================================================

alter table public.doc_items
  add column if not exists summary     text not null default '',
  add column if not exists visibility  text not null default 'publico',
  add column if not exists flavor      text not null default '',
  add column if not exists source_path text,
  add column if not exists source_name text not null default '',
  add column if not exists thumb_path  text;

alter table public.doc_items drop constraint if exists doc_items_visibility;
alter table public.doc_items add constraint doc_items_visibility check (visibility in ('publico', 'intranet'));

alter table public.doc_items drop constraint if exists doc_items_flavor;
alter table public.doc_items add constraint doc_items_flavor check (flavor in ('', 'quarto', 'rmarkdown'));

alter table public.doc_items drop constraint if exists doc_items_summary_len;
alter table public.doc_items add constraint doc_items_summary_len check (char_length(summary) <= 400);

comment on column public.doc_items.visibility is
  'publico = se lista para cualquiera; intranet = solo con sesión. No protege el archivo: el bucket «documentos» es público.';

-- Lectura: sin sesión, solo lo público; con sesión, también lo de intranet.
drop policy if exists doc_items_read on public.doc_items;
create policy doc_items_read on public.doc_items for select to anon, authenticated
  using (
    public.has_screen('documents')
    or (
      status = 'publicado'
      and (visibility = 'publico' or auth.uid() is not null)
      and exists (
        select 1 from public.doc_collections c
        where c.id = collection_id and c.status = 'publicado'
      )
    )
  );

notify pgrst, 'reload schema';
