-- =============================================================================
-- PDI · 0204 · Datos de Sostenibilidad: catálogo libre y tableros personalizados
--
-- 1. El catálogo de indicadores deja de ser solo «los de los 17 ODS»: el ODS pasa
--    a ser OPCIONAL (nulo = «sin ODS»; si viene, sigue entre 1 y 17), el código
--    (`id`, único por catálogo) es libre («CAMP-01»), y se suman `etiquetas`
--    (temas libres como «Campus» o «Energía») y `archivado` (se archiva en vez de
--    borrar para no romper vínculos ni tableros; archivar retira el indicador del
--    portal). Los indicadores sembrados y todas las columnas de 0202 quedan igual.
-- 2. `sos_tableros`: tableros personalizados que la persona arma con indicadores
--    del catálogo y gráficas de la unidad, y publica en /sostenible/tablero/:slug
--    o incrusta en el CMS.
--
-- Requiere 0178, 0198 y 0202. Idempotente. NO toca sos_cifras_publicas() ni
-- sos_graficas_publicas() ni ds_cifras_publicas(): los tableros las REUTILIZAN.
--
-- PORQUÉ DE CADA DECISIÓN DE SEGURIDAD
--
--  1. Ver: toda persona que pasa sos_entra() (igual que el resto del módulo).
--  2. Crear y editar: papel «Crea» o más en la unidad de Sostenibilidad (rango 3
--     de drive_unidad_rango; la administración general cuenta como Administra) o
--     haber creado el tablero. Publicar o retirar: Crea o más, el mismo criterio
--     que publicar una gráfica. Archivar y borrar: quien lo creó o Administra.
--     Las políticas dicen QUIÉN; el disparador sos_tableros_guardia decide los
--     cambios finos (publicar, archivar, fijar el enlace) para que un cliente no
--     se salte la regla actualizando solo una columna.
--  3. Público: una sola lectura nueva por tablero, sos_tablero_publico(slug),
--     SECURITY DEFINER con search_path fijo. Entrega la configuración y, de los
--     elementos que el tablero nombra, SOLO los que hoy son públicos: los
--     indicadores y gráficas se toman de sos_cifras_publicas() y
--     sos_graficas_publicas() (que ya exigen publicado, vínculo válido y columnas
--     no sensibles), así que un elemento no publicado se omite aunque el tablero
--     lo nombre. Nunca devuelve filas crudas, tablas ni usuarios. Un tablero sin
--     publicar o archivado responde nulo, igual que uno que no existe.
--  4. La configuración se valida en la base (versión, tipos, anchos 3|4|6|8|12,
--     tope de elementos y de tamaño): lo que llega por la API directa también
--     cumple la forma que el portal sabe dibujar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catálogo libre
-- -----------------------------------------------------------------------------

alter table public.ds_indicadores alter column ods drop not null;

alter table public.ds_indicadores drop constraint if exists ds_indicadores_ods;
alter table public.ds_indicadores add constraint ds_indicadores_ods check (ods is null or ods between 1 and 17);

alter table public.ds_indicadores add column if not exists etiquetas text[]  not null default '{}';
alter table public.ds_indicadores add column if not exists archivado boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ds_indicadores_etiquetas_ok') then
    alter table public.ds_indicadores add constraint ds_indicadores_etiquetas_ok
      check (cardinality(etiquetas) <= 12 and char_length(array_to_string(etiquetas, '|')) <= 400);
  end if;
  -- El código se usa en enlaces y listas: letras, números, punto, guion y guion bajo. «not valid»: no revisa lo ya guardado.
  if not exists (select 1 from pg_constraint where conname = 'ds_indicadores_codigo_ok') then
    alter table public.ds_indicadores add constraint ds_indicadores_codigo_ok
      check (id ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$') not valid;
  end if;
end $$;

comment on column public.ds_indicadores.etiquetas is 'Temas libres para agrupar y filtrar el catálogo (máximo 12).';
comment on column public.ds_indicadores.archivado is 'Archivado: sale del catálogo activo y del portal, pero conserva vínculos y tableros. Se restaura al desmarcarlo.';

-- Archivar retira el indicador del portal (así sos_cifras_publicas() no cambia).
create or replace function public.ds_indicadores_archivar_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.archivado then
    new.publicado := false;
  end if;
  return new;
end;
$$;

drop trigger if exists ds_indicadores_archivar_tg on public.ds_indicadores;
create trigger ds_indicadores_archivar_tg
  before insert or update on public.ds_indicadores
  for each row execute function public.ds_indicadores_archivar_guardia();

-- -----------------------------------------------------------------------------
-- 2. Ayudas
-- -----------------------------------------------------------------------------

-- Mi rango (0 a 4) en la unidad de Sostenibilidad; 0 si no entro a la pantalla.
create or replace function public.sos_rango_unidad()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when public.sos_entra()
         then coalesce((select max(public.drive_unidad_rango(u.id)) from public.drive_unidades u where u.lectura_abierta), 0)
         else 0 end;
$$;

-- La forma de la configuración: {version, campus?, selector?, elementos:[{id, tipo, ref?, ancho, titulo?, estilo?, opciones?}]}.
create or replace function public.sos_tablero_config_ok(c jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  e jsonb;
begin
  if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c -> 'elementos') is distinct from 'array' then
    return false;
  end if;
  if coalesce(c ->> 'version', '') !~ '^[0-9]{1,3}$' then return false; end if;
  if jsonb_array_length(c -> 'elementos') > 60 or octet_length(c::text) > 60000 then return false; end if;
  if c ? 'campus' and jsonb_typeof(c -> 'campus') not in ('string', 'null') then return false; end if;
  if c ? 'selector' and jsonb_typeof(c -> 'selector') <> 'boolean' then return false; end if;
  for e in select x from jsonb_array_elements(c -> 'elementos') x loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if coalesce(e ->> 'tipo', '') not in ('indicador', 'grafica', 'titulo', 'texto', 'separador') then return false; end if;
    if coalesce(e ->> 'ancho', '') not in ('3', '4', '6', '8', '12') then return false; end if;
    if char_length(coalesce(e ->> 'id', '')) not between 1 and 60 then return false; end if;
    if e ->> 'tipo' in ('indicador', 'grafica') and char_length(coalesce(e ->> 'ref', '')) not between 1 and 60 then return false; end if;
    if char_length(coalesce(e ->> 'titulo', '')) > 200 then return false; end if;
    if coalesce(e ->> 'estilo', 'tarjeta') not in ('tarjeta', 'compacta', 'grande') then return false; end if;
    if e ? 'opciones' and (jsonb_typeof(e -> 'opciones') <> 'object' or char_length(coalesce(e -> 'opciones' ->> 'texto', '')) > 2000) then return false; end if;
  end loop;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. La tabla de tableros
-- -----------------------------------------------------------------------------

create table if not exists public.sos_tableros (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  slug          text not null,
  descripcion   text not null default '',
  config        jsonb not null default '{"version": 1, "elementos": []}'::jsonb,
  publicado     boolean not null default false,
  publicado_por uuid,
  publicado_en  timestamptz,
  archivado     boolean not null default false,
  creado_por    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint sos_tableros_slug_uq unique (slug),
  constraint sos_tableros_slug_ok check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  constraint sos_tableros_nombre_ok check (char_length(btrim(nombre)) between 1 and 120 and char_length(descripcion) <= 400)
);
comment on table public.sos_tableros is
  'Datos de Sostenibilidad · tableros personalizados (indicadores y gráficas de la unidad en una cuadrícula de 12 columnas). Solo lo publicado sale al portal, con datos agregados.';

drop trigger if exists sos_tableros_set_updated_at on public.sos_tableros;
create trigger sos_tableros_set_updated_at
  before update on public.sos_tableros
  for each row execute function public.set_updated_at();

create or replace function public.sos_tableros_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sos_tablero_config_ok(new.config) then
    raise exception 'La configuración del tablero no es válida.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    if new.publicado and public.sos_rango_unidad() < 3 then
      raise exception 'Publicar un tablero pide el papel Crea o más en la unidad.' using errcode = 'insufficient_privilege';
    end if;
  else
    new.creado_por := old.creado_por;
    if new.publicado is distinct from old.publicado and public.sos_rango_unidad() < 3 then
      raise exception 'Publicar o retirar un tablero pide el papel Crea o más en la unidad.' using errcode = 'insufficient_privilege';
    end if;
    if new.archivado is distinct from old.archivado and not (old.creado_por = auth.uid() or public.sos_es_admin_unidad()) then
      raise exception 'Archivar un tablero es de quien lo creó o de quien Administra la unidad.' using errcode = 'insufficient_privilege';
    end if;
    if old.publicado and new.publicado and new.slug <> old.slug then
      raise exception 'No cambie el enlace de un tablero publicado: retírelo primero.' using errcode = 'check_violation';
    end if;
  end if;
  if new.archivado then
    new.publicado := false;
  end if;
  if new.publicado and (tg_op = 'INSERT' or not old.publicado) then
    new.publicado_por := auth.uid();
    new.publicado_en := now();
  elsif not new.publicado then
    new.publicado_por := null;
    new.publicado_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sos_tableros_guardia_tg on public.sos_tableros;
create trigger sos_tableros_guardia_tg
  before insert or update on public.sos_tableros
  for each row execute function public.sos_tableros_guardia();

-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------

alter table public.sos_tableros enable row level security;
revoke all on public.sos_tableros from public, anon;
grant select, insert, update, delete on public.sos_tableros to authenticated, service_role;

drop policy if exists sos_tableros_select on public.sos_tableros;
create policy sos_tableros_select on public.sos_tableros for select to authenticated using (public.sos_entra());

drop policy if exists sos_tableros_insert on public.sos_tableros;
create policy sos_tableros_insert on public.sos_tableros for insert to authenticated
  with check (public.sos_entra() and public.sos_rango_unidad() >= 3);

drop policy if exists sos_tableros_update on public.sos_tableros;
create policy sos_tableros_update on public.sos_tableros for update to authenticated
  using (public.sos_entra() and (creado_por = auth.uid() or public.sos_rango_unidad() >= 3))
  with check (public.sos_entra() and (creado_por = auth.uid() or public.sos_rango_unidad() >= 3));

drop policy if exists sos_tableros_delete on public.sos_tableros;
create policy sos_tableros_delete on public.sos_tableros for delete to authenticated
  using (public.sos_entra() and (creado_por = auth.uid() or public.sos_es_admin_unidad()));

-- -----------------------------------------------------------------------------
-- 5. Lectura PÚBLICA de un tablero
-- -----------------------------------------------------------------------------

/**
 * {slug, nombre, descripcion, campus, selector,
 *  elementos: [{id, tipo, ref, ancho, titulo, estilo, opciones}],
 *  cifras:    [...como sos_cifras_publicas(), solo los indicadores del tablero],
 *  graficas:  [...como sos_graficas_publicas(), solo las gráficas del tablero]}
 * o nulo si el tablero no existe, no está publicado o está archivado.
 * Un indicador o una gráfica que el tablero nombra pero que hoy no es público se
 * omite de `elementos` y de los datos. Títulos, textos y separadores siempre salen.
 */
create or replace function public.sos_tablero_publico(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t record;
  v_ids text[];
  v_cifras jsonb;
  v_graficas jsonb;
  v_elementos jsonb;
begin
  select * into t from public.sos_tableros s where s.slug = p_slug and s.publicado and not s.archivado;
  if not found then
    return null;
  end if;

  select coalesce(array_agg(x ->> 'ref'), '{}'::text[]) into v_ids
    from jsonb_array_elements(t.config -> 'elementos') x
   where x ->> 'tipo' in ('indicador', 'grafica');

  select coalesce(jsonb_agg(c), '[]'::jsonb) into v_cifras
    from jsonb_array_elements(public.sos_cifras_publicas()) c
   where c ->> 'id' = any (v_ids);

  select coalesce(jsonb_agg(g), '[]'::jsonb) into v_graficas
    from jsonb_array_elements(public.sos_graficas_publicas()) g
   where g ->> 'id' = any (v_ids);

  select coalesce(jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'id', x.e ->> 'id', 'tipo', x.e -> 'tipo', 'ref', x.e -> 'ref', 'ancho', x.e -> 'ancho',
             'titulo', x.e -> 'titulo', 'estilo', x.e -> 'estilo', 'opciones', x.e -> 'opciones'))
           order by x.n), '[]'::jsonb)
    into v_elementos
    from jsonb_array_elements(t.config -> 'elementos') with ordinality as x(e, n)
   where x.e ->> 'tipo' in ('titulo', 'texto', 'separador')
      or (x.e ->> 'tipo' = 'indicador' and exists (select 1 from jsonb_array_elements(v_cifras) c where c ->> 'id' = x.e ->> 'ref'))
      or (x.e ->> 'tipo' = 'grafica' and exists (select 1 from jsonb_array_elements(v_graficas) g where g ->> 'id' = x.e ->> 'ref'));

  return jsonb_build_object(
    'slug', t.slug, 'nombre', t.nombre, 'descripcion', t.descripcion,
    'campus', t.config -> 'campus', 'selector', coalesce(t.config -> 'selector', 'false'::jsonb),
    'elementos', v_elementos, 'cifras', v_cifras, 'graficas', v_graficas);
end;
$$;

revoke all on function public.sos_tablero_publico(text) from public;
grant execute on function public.sos_tablero_publico(text) to anon, authenticated, service_role;
comment on function public.sos_tablero_publico(text) is
  'Un tablero publicado de Datos de Sostenibilidad con solo los indicadores y gráficas que hoy son públicos, para el portal.';

/** [{slug, nombre, descripcion}] de los tableros publicados (para el selector del CMS). */
create or replace function public.sos_tableros_publicos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'nombre', s.nombre, 'descripcion', s.descripcion) order by s.nombre), '[]'::jsonb)
    from public.sos_tableros s
   where s.publicado and not s.archivado;
$$;

revoke all on function public.sos_tableros_publicos() from public;
grant execute on function public.sos_tableros_publicos() to anon, authenticated, service_role;
comment on function public.sos_tableros_publicos() is
  'Lista de los tableros publicados de Datos de Sostenibilidad (slug, nombre, descripción).';

-- Ayudas internas: las llaman las políticas y los disparadores.
do $$
declare
  f text;
begin
  foreach f in array array['sos_rango_unidad()', 'sos_tablero_config_ok(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
