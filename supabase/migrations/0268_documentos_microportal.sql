-- =============================================================================
-- PDI · 0268 · Documentos · microportales (un sitio ya renderizado, subido en .zip)
--
-- Requiere 0051 y 0267. Idempotente.
--
-- Un microportal es un documento cuyo contenido es una carpeta entera: el sitio
-- que Quarto, R Markdown, Jupyter Book, MkDocs o Vite dejan ya renderizado
-- (index.html + estilos, imágenes, datos…). El panel descomprime el .zip en el
-- navegador y sube cada archivo al bucket «documentos», bajo portales/<carpeta>/.
--
--   site_dir   la carpeta del sitio dentro del bucket (portales/<id>-<sello>).
--              Nulo = no es un microportal. La página de entrada es `path`
--              (portales/<id>-<sello>/index.html), así que la fila sigue siendo
--              «archivo con ruta» y la restricción doc_items_source no cambia.
--
-- El sitio se sirve desde nginx en /portales/<carpeta>/…, que lo lee del bucket
-- y le pone el tipo y la política de seguridad correctos (ver nginx.conf).
-- =============================================================================

alter table public.doc_items
  add column if not exists site_dir text;

alter table public.doc_items drop constraint if exists doc_items_site_dir_shape;
alter table public.doc_items add constraint doc_items_site_dir_shape
  check (
    site_dir is null
    or (site_dir ~ '^portales/[A-Za-z0-9_-]+$' and kind = 'archivo' and path like site_dir || '/%')
  );

comment on column public.doc_items.site_dir is
  'Carpeta del microportal en el bucket «documentos» (portales/<id>-<sello>). path es su página de entrada.';

notify pgrst, 'reload schema';
