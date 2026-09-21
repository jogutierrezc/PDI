-- =============================================================================
-- PDI · 0052 · Secciones dentro de una colección del repositorio
--
-- Una colección («Documentos Institucionales») puede dividirse en secciones
-- («Estatutos», «Reglamentos», «Acuerdos»), y un documento cuelga de la
-- colección o de una de sus secciones, indistintamente: obligar a clasificarlo
-- todo obligaría a inventar una sección «Varios» para cada documento huérfano.
--
-- Una sección es una fila más de `doc_collections` con `parent_id`, no una
-- tabla nueva: así hereda tapa, estado, orden y permisos sin duplicar nada, y
-- el editor es el mismo formulario.
--
-- Un solo nivel, y lo vigila la base. Un árbol de profundidad libre en un
-- repositorio documental termina escondiendo el papel tres clics adentro, y
-- ninguna restricción CHECK puede mirar otra fila: hace falta un disparador.
--
-- Requiere 0051. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El vínculo con la colección madre
-- -----------------------------------------------------------------------------

alter table public.doc_collections
  add column if not exists parent_id uuid references public.doc_collections (id) on delete cascade;

comment on column public.doc_collections.parent_id is
  'La colección a la que pertenece esta sección. Nulo en una colección de primer nivel.';

create index if not exists doc_collections_parent_idx on public.doc_collections (parent_id, position, title);

-- Dos colecciones distintas pueden tener cada una su sección «Acuerdos», así
-- que la dirección deja de ser única en todo el repositorio y pasa a serlo
-- dentro de su madre. NULLS NOT DISTINCT hace que dos colecciones de primer
-- nivel con el mismo slug también choquen, que es lo que se quiere.
alter table public.doc_collections drop constraint if exists doc_collections_slug_unique;
alter table public.doc_collections
  add constraint doc_collections_slug_unique unique nulls not distinct (parent_id, slug);

-- -----------------------------------------------------------------------------
-- 2. Un solo nivel
-- -----------------------------------------------------------------------------

create or replace function public.doc_collections_one_level()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Una colección no puede ser sección de sí misma.';
  end if;

  if exists (select 1 from public.doc_collections p where p.id = new.parent_id and p.parent_id is not null) then
    raise exception 'Las secciones no se anidan: solo hay un nivel bajo la colección.';
  end if;

  if exists (select 1 from public.doc_collections c where c.parent_id = new.id) then
    raise exception 'Esta colección ya tiene secciones propias: no puede pasar a ser sección de otra.';
  end if;

  return new;
end;
$$;

comment on function public.doc_collections_one_level() is
  'Impide anidar secciones: la madre de una sección no puede tener madre, y una colección con secciones no puede volverse sección.';

drop trigger if exists doc_collections_one_level on public.doc_collections;
create trigger doc_collections_one_level before insert or update of parent_id on public.doc_collections
  for each row execute function public.doc_collections_one_level();

-- -----------------------------------------------------------------------------
-- 3. Visibilidad heredada
--
-- Una sección publicada dentro de una colección en borrador sigue sin verse, y
-- sus documentos tampoco. Las dos comprobaciones miran `doc_collections` desde
-- una política de `doc_collections`, así que van en funciones SECURITY DEFINER:
-- una subconsulta directa sobre la propia tabla haría que la política se
-- llamara a sí misma.
-- -----------------------------------------------------------------------------

create or replace function public.doc_collection_published(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select status = 'publicado' from public.doc_collections where id = target), false);
$$;

comment on function public.doc_collection_published(uuid) is
  'Si esa colección está publicada. Sin RLS, para que una política de doc_collections pueda mirar a la madre.';

create or replace function public.doc_collection_visible(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.doc_collections c
    left join public.doc_collections p on p.id = c.parent_id
    where c.id = target
      and c.status = 'publicado'
      and (c.parent_id is null or p.status = 'publicado')
  );
$$;

comment on function public.doc_collection_visible(uuid) is
  'Si esa colección o sección se ve en el portal: publicada, y con su madre publicada cuando la tiene.';

drop policy if exists doc_collections_read on public.doc_collections;
create policy doc_collections_read on public.doc_collections for select to anon, authenticated
  using (
    public.has_screen('documents')
    or (status = 'publicado' and (parent_id is null or public.doc_collection_published(parent_id)))
  );

drop policy if exists doc_items_read on public.doc_items;
create policy doc_items_read on public.doc_items for select to anon, authenticated
  using (
    public.has_screen('documents')
    or (status = 'publicado' and public.doc_collection_visible(collection_id))
  );

-- -----------------------------------------------------------------------------
-- 4. Caché del esquema
-- -----------------------------------------------------------------------------

notify pgrst, 'reload schema';
