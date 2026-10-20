-- =============================================================================
-- PDI · 0174 · CMS Portales
-- =============================================================================
-- Un solo módulo para editar los portales públicos: la landing de la UDES,
-- Planeación y UDES Sostenible. Dentro de cada portal hay páginas, y cada
-- página puede tener micrositios (páginas hijas) con su propia ruta.
--
--   cms_portales    los tres portales (slug fijo: landing, planeacion, sostenible).
--   cms_paginas     páginas y micrositios. `ruta` es la dirección dentro del
--                   portal: '' es la portada, 'clima' una página y
--                   'clima/energia' un micrositio dentro de ella.
--                   `padre_id` dice de quién cuelga; `ruta` ya lo lleva escrito.
--   cms_bloques     el borrador: los bloques que se editan. Solo planeación.
--   cms_versiones   cada publicación queda guardada completa, con quién y cuándo.
--                   El público lee solo la versión publicada.
--
-- Publicar es la función cms_publicar: copia el borrador a una versión nueva
-- en una sola transacción. Leer lo publicado (cms_leer_publicada) es la única
-- lectura pública de contenido: el portal no toca cms_bloques.
--
-- Tipos de bloque: se validan en la aplicación (src/modules/admin/cms/bloques.ts),
-- no con un CHECK, para agregar un tipo sin migrar la base.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.cms_portales (
  slug   text primary key,
  nombre text not null,
  orden  int  not null default 0
);

insert into public.cms_portales (slug, nombre, orden) values
  ('landing',    'Landing de la UDES', 1),
  ('planeacion', 'Planeación',         2),
  ('sostenible', 'UDES Sostenible',    3)
on conflict (slug) do nothing;

create table if not exists public.cms_paginas (
  id              uuid primary key default gen_random_uuid(),
  portal          text not null references public.cms_portales (slug) on update cascade on delete cascade,
  padre_id        uuid references public.cms_paginas (id) on delete cascade,
  ruta            text not null default '',
  titulo          text not null default '',
  publicada_version int,
  publicada_en    timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (portal, ruta)
);

create index if not exists cms_paginas_padre_idx on public.cms_paginas (padre_id);

create table if not exists public.cms_bloques (
  id             uuid primary key default gen_random_uuid(),
  pagina_id      uuid not null references public.cms_paginas (id) on delete cascade,
  orden          int  not null default 0,
  tipo           text not null,
  ancho          int  not null default 12 check (ancho in (4, 6, 8, 12)),
  props          jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now()
);

create index if not exists cms_bloques_pagina_idx on public.cms_bloques (pagina_id, orden);

create table if not exists public.cms_versiones (
  id             uuid primary key default gen_random_uuid(),
  pagina_id      uuid not null references public.cms_paginas (id) on delete cascade,
  version        int  not null,
  contenido      jsonb not null,
  publicado_por  uuid default auth.uid(),
  publicado_en   timestamptz not null default now(),
  unique (pagina_id, version)
);

-- Portadas de los tres portales. Sin contenido todavía: se escriben desde la intranet.
insert into public.cms_paginas (portal, ruta, titulo)
select p.slug, '', p.nombre
from public.cms_portales p
on conflict (portal, ruta) do nothing;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
alter table public.cms_portales  enable row level security;
alter table public.cms_paginas   enable row level security;
alter table public.cms_bloques   enable row level security;
alter table public.cms_versiones enable row level security;

drop policy if exists cms_portales_read on public.cms_portales;
create policy cms_portales_read on public.cms_portales for select to anon, authenticated
  using (true);

drop policy if exists cms_portales_write on public.cms_portales;
create policy cms_portales_write on public.cms_portales for all to authenticated
  using (public.has_role_at_least('admin')) with check (public.has_role_at_least('admin'));

-- Público: solo las páginas que tienen una versión publicada. Planeación ve todas.
drop policy if exists cms_paginas_read on public.cms_paginas;
create policy cms_paginas_read on public.cms_paginas for select to anon, authenticated
  using (publicada_version is not null or public.has_role_at_least('planeacion'));

drop policy if exists cms_paginas_write on public.cms_paginas;
create policy cms_paginas_write on public.cms_paginas for all to authenticated
  using (public.has_role_at_least('planeacion')) with check (public.has_role_at_least('planeacion'));

drop policy if exists cms_bloques_all on public.cms_bloques;
create policy cms_bloques_all on public.cms_bloques for all to authenticated
  using (public.has_role_at_least('planeacion')) with check (public.has_role_at_least('planeacion'));

-- El historial de versiones lo ve planeación; el público lo lee por cms_leer_publicada.
drop policy if exists cms_versiones_read on public.cms_versiones;
create policy cms_versiones_read on public.cms_versiones for select to authenticated
  using (public.has_role_at_least('planeacion'));

grant select on public.cms_portales, public.cms_paginas to anon;
grant select, insert, update, delete on public.cms_portales, public.cms_paginas, public.cms_bloques, public.cms_versiones to authenticated;

-- ---------------------------------------------------------------------------
-- Publicar y leer lo publicado
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
  if not public.has_role_at_least('planeacion') then
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
  'Copia el borrador de una página a una versión nueva y la deja publicada. Solo planeación o administración.';

create or replace function public.cms_leer_publicada(p_portal text, p_ruta text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select v.contenido
  from public.cms_paginas p
  join public.cms_versiones v on v.pagina_id = p.id and v.version = p.publicada_version
  where p.portal = p_portal and p.ruta = p_ruta
  limit 1;
$$;

comment on function public.cms_leer_publicada(text, text) is
  'Contenido publicado de una página del portal, por su ruta. Lo lee el público sin iniciar sesión.';

grant execute on function public.cms_publicar(uuid) to authenticated;
grant execute on function public.cms_leer_publicada(text, text) to anon, authenticated;
