-- =============================================================================
-- PDI · 0199 · Editores del CMS por portal
-- =============================================================================
-- Hasta aquí editar el CMS (0174) pedía rol Planeación. Ahora la administración
-- puede designar a una persona como editora de UN portal (p. ej. «sostenible»)
-- sin darle rol Planeación:
--
--   cms_editores        quién edita qué portal. La administra solo la
--                       administración; cada persona lee sus propias filas.
--   cms_puede_editar    ¿Planeación/administración, o editor de ese portal?
--
-- Un editor de un portal edita y publica las páginas, bloques y versiones de
-- ESE portal y de ningún otro; no toca cms_portales (sigue siendo solo admin).
-- Para Planeación y la administración nada cambia. El CMS no usa
-- almacenamiento de archivos propio, así que no hay políticas de storage.
--
-- Idempotente. El front lee cms_editores en auth.tsx; sin esta migración la
-- consulta falla y la persona queda sin portales designados.
-- =============================================================================

create table if not exists public.cms_editores (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  portal     text not null references public.cms_portales (slug) on update cascade on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint cms_editores_unico unique (user_id, portal)
);

create index if not exists cms_editores_portal_idx on public.cms_editores (portal);

comment on table public.cms_editores is
  'Personas designadas por la administración para editar y publicar un portal del CMS sin rol Planeación.';

alter table public.cms_editores enable row level security;

drop policy if exists cms_editores_admin on public.cms_editores;
create policy cms_editores_admin on public.cms_editores for all to authenticated
  using (public.has_role_at_least('admin')) with check (public.has_role_at_least('admin'));

drop policy if exists cms_editores_propias on public.cms_editores;
create policy cms_editores_propias on public.cms_editores for select to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.cms_editores to authenticated;

-- ¿Edita este portal? Planeación y administración, todos; un editor, los suyos.
create or replace function public.cms_puede_editar(p_portal text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion')
      or exists (select 1 from public.cms_editores e
                  where e.user_id = auth.uid() and e.portal = p_portal);
$$;

-- Lo mismo, a partir de una página (los bloques y versiones cuelgan de ella).
create or replace function public.cms_puede_editar_pagina(p_pagina uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.cms_paginas p
                  where p.id = p_pagina and public.cms_puede_editar(p.portal));
$$;

grant execute on function public.cms_puede_editar(text) to anon, authenticated;
grant execute on function public.cms_puede_editar_pagina(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Políticas: las mismas de 0174, pero por portal
-- ---------------------------------------------------------------------------
drop policy if exists cms_paginas_read on public.cms_paginas;
create policy cms_paginas_read on public.cms_paginas for select to anon, authenticated
  using (publicada_version is not null or public.cms_puede_editar(portal));

drop policy if exists cms_paginas_write on public.cms_paginas;
create policy cms_paginas_write on public.cms_paginas for all to authenticated
  using (public.cms_puede_editar(portal)) with check (public.cms_puede_editar(portal));

drop policy if exists cms_bloques_all on public.cms_bloques;
create policy cms_bloques_all on public.cms_bloques for all to authenticated
  using (public.cms_puede_editar_pagina(pagina_id)) with check (public.cms_puede_editar_pagina(pagina_id));

drop policy if exists cms_versiones_read on public.cms_versiones;
create policy cms_versiones_read on public.cms_versiones for select to authenticated
  using (public.cms_puede_editar_pagina(pagina_id));

-- ---------------------------------------------------------------------------
-- Publicar: igual que en 0174, con el permiso del portal de la página
-- ---------------------------------------------------------------------------
create or replace function public.cms_publicar(p_pagina uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version  int;
  v_contenido jsonb;
begin
  if not public.cms_puede_editar_pagina(p_pagina) then
    raise exception 'Sin permiso para publicar esta página' using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.cms_versiones where pagina_id = p_pagina;

  select jsonb_build_object(
    'titulo', p.titulo,
    'ruta', p.ruta,
    'bloques', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', b.tipo, 'ancho', b.ancho, 'props', b.props) order by b.orden)
      from public.cms_bloques b where b.pagina_id = p.id
    ), '[]'::jsonb)
  )
  into v_contenido
  from public.cms_paginas p
  where p.id = p_pagina;

  if v_contenido is null then
    raise exception 'La página no existe';
  end if;

  insert into public.cms_versiones (pagina_id, version, contenido)
  values (p_pagina, v_version, v_contenido);

  update public.cms_paginas
  set publicada_version = v_version, publicada_en = now(), actualizado_en = now()
  where id = p_pagina;

  return v_version;
end;
$$;

comment on function public.cms_publicar(uuid) is
  'Copia el borrador de una página a una versión nueva y la deja publicada. Planeación, administración o editor de ese portal (0199).';

grant execute on function public.cms_publicar(uuid) to authenticated;
