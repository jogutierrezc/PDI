-- =============================================================================
-- PDI · 0053 · Las imágenes de los informes de UDES en Cifras
--
-- El bloque «Grid de imágenes» pone fotografías dentro de una ficha, en dos
-- columnas, y las mismas imágenes viajan al boletín en papel.
--
-- Aquí solo va el bucket. Qué imágenes lleva cada bloque vive en
-- `od_blocks.settings`, que ya es jsonb: una lista de rutas con su texto
-- alternativo y su pie.
--
-- Ojo: esta migración dio por hecho que `od_blocks.kind` admitía cualquier
-- texto, y no es cierto —es el enum `od_block_kind`—. El valor «imagenes» lo
-- añade la 0054; sin ella, la intranet falla al crear el bloque.
--
-- Público en lectura —salen en una ficha pública— y escritura con capacidad de
-- Planeación sobre la pantalla de UDES en Cifras. La política no puede saber
-- de qué informe es cada archivo, así que no se afina por informe: quien puede
-- editar el portal estadístico puede subir sus imágenes.
--
-- Requiere 0024 (has_screen, has_role_at_least). Idempotente.
-- =============================================================================

create or replace function public.od_can_upload()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion') and public.has_screen('cifras');
$$;

comment on function public.od_can_upload() is
  'Puede subir imágenes de los informes: capacidad de Planeación y la pantalla «cifras» en su rol de acceso.';

-- -----------------------------------------------------------------------------
-- El bucket
--
-- Mismo patrón que «proyectos» (0013), «boletines» (0027), «oficina» (0050) y
-- «documentos» (0051): si el rol que aplica la migración no es dueño de
-- storage.objects, el resto queda aplicado y el aviso dice qué hacer a mano.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('informes', 'informes', true, 8388608)   -- 8 MB: son fotografías
  on conflict (id) do update set public = true, file_size_limit = 8388608;

  execute 'drop policy if exists informes_lectura on storage.objects';
  execute $pol$
    create policy informes_lectura on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'informes')
  $pol$;

  execute 'drop policy if exists informes_escritura on storage.objects';
  execute $pol$
    create policy informes_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'informes' and public.od_can_upload())
  $pol$;

  execute 'drop policy if exists informes_reemplazo on storage.objects';
  execute $pol$
    create policy informes_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'informes' and public.od_can_upload())
      with check (bucket_id = 'informes' and public.od_can_upload())
  $pol$;

  execute 'drop policy if exists informes_borrado on storage.objects';
  execute $pol$
    create policy informes_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'informes' and public.od_can_upload())
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "informes" (%). Créalo a mano desde Storage: público en lectura, 8 MB por archivo.',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';
