-- =============================================================================
-- PDI · 0274 · Encuestas con Pilo · Libro de la Rendición de Cuentas
--
-- Requiere 0179 y 0184 (enc_encuestas, enc_puede_ver_encuesta, enc_puede_editar_encuesta).
-- Idempotente.
--
-- El libro es un resumen corto (5 a 10 páginas, Carta o A4) armado con los aportes y las
-- cifras de la encuesta de Rendición de Cuentas. Lo que se guarda es SOLO su configuración:
--
--   enc_libros.config   formato, vista, páginas activas y su orden, paleta, composición y textos
--                       de la portada, filtros (estado, dependencias), tono y extensión de la
--                       narrativa, textos editados por una persona, ODS que Pilo asignó a cada
--                       aporte y la ruta de las imágenes de portada y contraportada.
--
-- Los datos del libro no se copian: se leen de enc_aportes y enc_cifras cada vez, así que
-- cambiar el estado de un aporte cambia el libro. Un libro por encuesta.
--
-- Quién puede qué (misma regla que el resto de Encuestas):
--   · Ver el libro: enc_puede_ver_encuesta.
--   · Cambiarlo y subir imágenes: enc_puede_editar_encuesta.
--
-- Bucket «enc-libro» (privado, 8 MB, JPEG, PNG y WebP): la primera carpeta de la ruta es el id
-- de la encuesta (<encuesta>/portada-<sello>.jpg). Si quien aplica la migración no es dueño de
-- storage.objects, lo demás queda aplicado y el aviso dice qué hacer a mano.
-- =============================================================================

create table if not exists public.enc_libros (
  encuesta_id uuid primary key references public.enc_encuestas (id) on delete cascade,
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  constraint enc_libros_config_objeto check (jsonb_typeof(config) = 'object'),
  constraint enc_libros_config_tamano check (pg_column_size(config) <= 262144)
);

comment on table public.enc_libros is
  'Libro de la Rendición de Cuentas (0274): configuración del libro de cada encuesta. Los datos se leen de enc_aportes y enc_cifras.';

create or replace function public.enc_libros_sello()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists enc_libros_sello on public.enc_libros;
create trigger enc_libros_sello
  before insert or update on public.enc_libros
  for each row execute function public.enc_libros_sello();

alter table public.enc_libros enable row level security;

drop policy if exists enc_libros_select on public.enc_libros;
create policy enc_libros_select on public.enc_libros
  for select to authenticated
  using (public.enc_puede_ver_encuesta(encuesta_id));

drop policy if exists enc_libros_insert on public.enc_libros;
create policy enc_libros_insert on public.enc_libros
  for insert to authenticated
  with check (public.enc_puede_editar_encuesta(encuesta_id));

drop policy if exists enc_libros_update on public.enc_libros;
create policy enc_libros_update on public.enc_libros
  for update to authenticated
  using (public.enc_puede_editar_encuesta(encuesta_id))
  with check (public.enc_puede_editar_encuesta(encuesta_id));

revoke all on public.enc_libros from public, anon, authenticated;
grant select, insert, update on public.enc_libros to authenticated;
grant select, insert, update, delete on public.enc_libros to service_role;

-- -----------------------------------------------------------------------------
-- Bucket «enc-libro»
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('enc-libro', 'enc-libro', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = 8388608,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  execute 'drop policy if exists enc_libro_lectura on storage.objects';
  execute $pol$
    create policy enc_libro_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'enc-libro'
             and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             and public.enc_puede_ver_encuesta(((storage.foldername(name))[1])::uuid))
  $pol$;

  execute 'drop policy if exists enc_libro_escritura on storage.objects';
  execute $pol$
    create policy enc_libro_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'enc-libro'
                  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
                  and public.enc_puede_editar_encuesta(((storage.foldername(name))[1])::uuid))
  $pol$;

  execute 'drop policy if exists enc_libro_borrado on storage.objects';
  execute $pol$
    create policy enc_libro_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'enc-libro'
             and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             and public.enc_puede_editar_encuesta(((storage.foldername(name))[1])::uuid))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "enc-libro" (%). Créelo a mano desde Storage: privado, 8 MB por archivo, solo imágenes JPEG, PNG y WebP; la primera carpeta de la ruta es el id de la encuesta.',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';
