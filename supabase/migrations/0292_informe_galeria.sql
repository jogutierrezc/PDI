-- =============================================================================
-- Informes Institucionales · Galería Institucional (0292).
--
-- Imágenes de portada aprobadas por Planeación. Cualquier usuario del módulo
-- elige una desde «Personalizar portada»; solo el administrador las carga,
-- las oculta o las borra.
--   informe_galeria        catálogo (ruta, título, activa, orden)
--   bucket «informe-galeria» privado, 5 MB, solo imágenes; lectura para
--                          usuarios autenticados, escritura solo de admin.
-- Requiere 0002 (is_admin). Idempotente.
-- =============================================================================

create table if not exists public.informe_galeria (
  id         uuid primary key default gen_random_uuid(),
  ruta       text not null unique,
  titulo     text not null default '',
  activa     boolean not null default true,
  orden      integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint informe_galeria_ruta check (char_length(ruta) between 1 and 300),
  constraint informe_galeria_titulo check (char_length(titulo) <= 80)
);

comment on table public.informe_galeria is
  'Galería Institucional (0292): imágenes de portada aprobadas. Leen los usuarios autenticados (las activas); solo el administrador escribe.';

alter table public.informe_galeria enable row level security;

drop policy if exists informe_galeria_lectura on public.informe_galeria;
create policy informe_galeria_lectura on public.informe_galeria
  for select to authenticated
  using (activa or public.is_admin());

drop policy if exists informe_galeria_alta on public.informe_galeria;
create policy informe_galeria_alta on public.informe_galeria
  for insert to authenticated with check (public.is_admin());

drop policy if exists informe_galeria_cambio on public.informe_galeria;
create policy informe_galeria_cambio on public.informe_galeria
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists informe_galeria_baja on public.informe_galeria;
create policy informe_galeria_baja on public.informe_galeria
  for delete to authenticated using (public.is_admin());

revoke all on public.informe_galeria from public, anon;
grant select, insert, update, delete on public.informe_galeria to authenticated;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('informe-galeria', 'informe-galeria', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false, file_size_limit = 5242880,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  execute 'drop policy if exists informe_galeria_obj_lectura on storage.objects';
  execute $pol$create policy informe_galeria_obj_lectura on storage.objects
    for select to authenticated using (bucket_id = 'informe-galeria')$pol$;

  execute 'drop policy if exists informe_galeria_obj_alta on storage.objects';
  execute $pol$create policy informe_galeria_obj_alta on storage.objects
    for insert to authenticated with check (bucket_id = 'informe-galeria' and public.is_admin())$pol$;

  execute 'drop policy if exists informe_galeria_obj_cambio on storage.objects';
  execute $pol$create policy informe_galeria_obj_cambio on storage.objects
    for update to authenticated using (bucket_id = 'informe-galeria' and public.is_admin())
    with check (bucket_id = 'informe-galeria' and public.is_admin())$pol$;

  execute 'drop policy if exists informe_galeria_obj_baja on storage.objects';
  execute $pol$create policy informe_galeria_obj_baja on storage.objects
    for delete to authenticated using (bucket_id = 'informe-galeria' and public.is_admin())$pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning 'No se pudo preparar el bucket "informe-galeria" (%). Créelo a mano: privado, 5 MB, JPEG/PNG/WebP.', sqlerrm;
end $$;

notify pgrst, 'reload schema';
