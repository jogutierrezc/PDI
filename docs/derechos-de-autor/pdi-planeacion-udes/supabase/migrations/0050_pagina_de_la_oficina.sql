-- =============================================================================
-- PDI · 0050 · La página de la oficina, editable desde la intranet
--
-- Hasta aquí la portada de Planeación (`/`) y la página del equipo (`/equipo`)
-- se editaban en un archivo del código (`src/modules/planeacion/content.ts`):
-- cambiar una foto del equipo o un titular exigía un despliegue. Esta
-- migración mueve ese contenido editorial a la base, sin perder el archivo:
-- sigue siendo el valor por defecto cuando la oficina todavía no ha publicado
-- nada, así que el portal nunca se queda en blanco.
--
--   office_page   dos filas, y solo dos: «borrador» y «publicado». El
--                 documento entero de la página vive en `content` (jsonb),
--                 porque se edita, se previsualiza y se publica como una sola
--                 pieza; partirlo en siete tablas obligaría a siete guardados
--                 y a una transacción para publicar.
--
--   bucket "oficina"   las fotos de la galería y del equipo. Público en
--                 lectura —salen en una página pública—, escritura con
--                 capacidad de Planeación.
--
-- El borrador y el publicado son dos filas y no dos columnas a propósito: las
-- políticas RLS son por fila, así que una sola fila obligaría a una vista de
-- seguridad definida para esconder el borrador de los anónimos. Con dos filas
-- la regla es la misma que ya usan los informes y el Observatorio: se lee lo
-- publicado, o todo si tienes la pantalla.
--
-- Requiere 0024 (has_screen, has_role_at_least) y set_updated_at(). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El documento de la página
-- -----------------------------------------------------------------------------

create table if not exists public.office_page (
  state        text primary key,
  content      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,
  constraint office_page_state check (state in ('borrador', 'publicado')),
  constraint office_page_shape check (jsonb_typeof(content) = 'object')
);

comment on table public.office_page is
  'Contenido editorial de la portada de Planeación y de la página del equipo. Dos filas: el borrador que edita la oficina y lo que ve el público.';
comment on column public.office_page.content is
  'Documento completo de la página (titular, galería, equipo, áreas, accesos, contacto). Las fotos son rutas del bucket "oficina", no datos.';
comment on column public.office_page.state is
  '«borrador» lo ve la intranet; «publicado» lo ve cualquiera. Publicar copia el borrador sobre el publicado.';

drop trigger if exists office_page_set_updated_at on public.office_page;
create trigger office_page_set_updated_at before update on public.office_page
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Quién escribe
-- -----------------------------------------------------------------------------

create or replace function public.office_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion') and public.has_screen('office');
$$;

comment on function public.office_can_edit() is
  'Puede editar la página de la oficina: capacidad de Planeación y la pantalla «office» en su rol de acceso.';

alter table public.office_page enable row level security;

-- El público ve lo publicado; la intranet, también el borrador.
drop policy if exists office_page_read on public.office_page;
create policy office_page_read on public.office_page for select to anon, authenticated
  using (state = 'publicado' or public.has_screen('office'));

drop policy if exists office_page_write on public.office_page;
create policy office_page_write on public.office_page for all to authenticated
  using (public.office_can_edit()) with check (public.office_can_edit());

grant select on public.office_page to anon;
grant select, insert, update, delete on public.office_page to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Las fotos, en Storage
--
-- Mismo patrón que los buckets «proyectos» (0013) y «boletines» (0027): si el
-- rol que aplica la migración no es dueño de storage.objects, el resto queda
-- aplicado y el aviso dice qué hacer a mano.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('oficina', 'oficina', true, 8388608)   -- 8 MB: son fotografías, no documentos
  on conflict (id) do update set public = true, file_size_limit = 8388608;

  execute 'drop policy if exists oficina_lectura on storage.objects';
  execute $pol$
    create policy oficina_lectura on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'oficina')
  $pol$;

  execute 'drop policy if exists oficina_escritura on storage.objects';
  execute $pol$
    create policy oficina_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'oficina' and public.office_can_edit())
  $pol$;

  execute 'drop policy if exists oficina_reemplazo on storage.objects';
  execute $pol$
    create policy oficina_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'oficina' and public.office_can_edit())
      with check (bucket_id = 'oficina' and public.office_can_edit())
  $pol$;

  execute 'drop policy if exists oficina_borrado on storage.objects';
  execute $pol$
    create policy oficina_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'oficina' and public.office_can_edit())
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "oficina" (%). Créalo a mano desde Storage: público en lectura, 8 MB por archivo.',
      sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 4. La pantalla nueva en los roles que ya la tenían todo
--
-- `screens` es una lista libre: los cuatro roles de fábrica llevan
-- `all_screens`, así que alcanzan «office» sin tocar nada. Los roles hechos a
-- medida no la reciben sola —es contenido público y debe concederse a
-- propósito— salvo que su nombre diga que ya administran el portal.
-- -----------------------------------------------------------------------------

update public.access_roles
   set screens = array_append(screens, 'office')
 where not all_screens
   and not ('office' = any (screens))
   and 'parameters' = any (screens);

-- -----------------------------------------------------------------------------
-- 5. Caché del esquema
-- -----------------------------------------------------------------------------

notify pgrst, 'reload schema';
