-- =============================================================================
-- 0251 · Observatorio: rediseño público (imagen y degradado por tablero)
--
-- El rediseño de /datos-abiertos/observatorio dibuja cada tema como un tablero
-- de color sólido (o foto con degradado del color del tablero). Color e icono
-- ya existen (0248). Aquí se añade lo que falta:
--
--   1. Columnas de obs_topics: imagen_url, degradado (intensidad), alcance,
--      encuadre_x y encuadre_y (0–100). Sin imagen, el tablero es de color
--      sólido con el icono como marca de agua.
--   2. Bucket público de Storage «obs-tableros»: lectura pública; escritura solo
--      para quien hoy edita el Observatorio (capacidad de Planeación + panel
--      Observatorios o Tableros, nivel Editar), la misma regla que obs_topics_write
--      (0231). Los permisos de la fila (RLS de obs_topics) no cambian: ya cubren
--      las columnas nuevas.
--
-- Requiere 0230, 0231 y 0248. Idempotente. No cambia filas existentes.
-- =============================================================================

alter table public.obs_topics
  add column if not exists imagen_url text,
  add column if not exists degradado  smallint not null default 92,
  add column if not exists alcance    smallint not null default 62,
  add column if not exists encuadre_x smallint not null default 50,
  add column if not exists encuadre_y smallint not null default 50;

alter table public.obs_topics drop constraint if exists obs_topics_degradado;
alter table public.obs_topics add constraint obs_topics_degradado check (degradado between 0 and 100);
alter table public.obs_topics drop constraint if exists obs_topics_alcance;
alter table public.obs_topics add constraint obs_topics_alcance check (alcance between 0 and 100);
alter table public.obs_topics drop constraint if exists obs_topics_encuadre_x;
alter table public.obs_topics add constraint obs_topics_encuadre_x check (encuadre_x between 0 and 100);
alter table public.obs_topics drop constraint if exists obs_topics_encuadre_y;
alter table public.obs_topics add constraint obs_topics_encuadre_y check (encuadre_y between 0 and 100);
alter table public.obs_topics drop constraint if exists obs_topics_imagen_url;
alter table public.obs_topics add constraint obs_topics_imagen_url
  check (imagen_url is null or (char_length(imagen_url) <= 600 and imagen_url ~ '^https://'));

comment on column public.obs_topics.imagen_url is 'Foto del tablero (0251), en el bucket público obs-tableros; null: color sólido.';
comment on column public.obs_topics.degradado  is 'Intensidad del degradado de color sobre la foto, 0–100 (0251).';
comment on column public.obs_topics.alcance    is 'Alcance del degradado sobre la foto, 0–100 (0251).';
comment on column public.obs_topics.encuadre_x is 'Encuadre horizontal de la foto, 0–100 (0251).';
comment on column public.obs_topics.encuadre_y is 'Encuadre vertical de la foto, 0–100 (0251).';

-- Bucket y políticas. Si quien aplica la migración no es dueño de storage.objects,
-- lo demás queda aplicado y el aviso dice qué hacer a mano.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('obs-tableros', 'obs-tableros', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = true,
        file_size_limit = 3145728,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  -- Lectura pública: el bucket es público y sirve las fotos por su URL; la política
  -- cubre también las consultas por la API de Storage.
  execute 'drop policy if exists obs_tableros_lectura on storage.objects';
  execute $pol$
    create policy obs_tableros_lectura on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'obs-tableros')
  $pol$;

  execute 'drop policy if exists obs_tableros_escritura on storage.objects';
  execute $pol$
    create policy obs_tableros_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'obs-tableros'
                  and public.obs_can_edit()
                  and (public.obs_puede('obs_tableros', null, 'editar') or public.obs_puede('obs_observatorios', null, 'editar')))
  $pol$;

  execute 'drop policy if exists obs_tableros_reemplazo on storage.objects';
  execute $pol$
    create policy obs_tableros_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'obs-tableros'
             and public.obs_can_edit()
             and (public.obs_puede('obs_tableros', null, 'editar') or public.obs_puede('obs_observatorios', null, 'editar')))
      with check (bucket_id = 'obs-tableros'
                  and public.obs_can_edit()
                  and (public.obs_puede('obs_tableros', null, 'editar') or public.obs_puede('obs_observatorios', null, 'editar')))
  $pol$;

  execute 'drop policy if exists obs_tableros_borrado on storage.objects';
  execute $pol$
    create policy obs_tableros_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'obs-tableros'
             and public.obs_can_edit()
             and (public.obs_puede('obs_tableros', null, 'editar') or public.obs_puede('obs_observatorios', null, 'editar')))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "obs-tableros" (%). Créelo a mano desde Storage: público, 3 MB por archivo, solo imágenes JPEG, PNG y WebP.',
      sqlerrm;
end $$;
