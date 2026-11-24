-- =============================================================================
-- 0248 · Observatorio: temas nuevos con color e icono + función para crearlos
--
-- Lo que ya existía (0230, 0231, 0234): el tema es una fila de obs_topics con
-- nombre, código, resumen, pregunta, fuente, línea, orden, archivado y estado
-- (borrador/publicado); el panel «Observatorios» lo crea, renombra, ordena,
-- archiva, publica y mueve, y la portada pública ya añade los temas nuevos
-- publicados. Lo que faltaba:
--
--   1. Color e icono propios del tema (hoy solo heredaba el de su línea).
--      Misma forma cerrada que en obs_observatorios: se imprimen en estilos y
--      atributos del portal.
--   2. Una función para CREAR el tema en la base. Hasta ahora la pantalla
--      elegía el enlace libre con una consulta y luego insertaba: dos personas
--      a la vez podían chocar en la llave primaria. Aquí el enlace único (en
--      todo el portal, porque el slug es la llave de obs_topics y de las
--      rutas /…/observatorio/:tema) se resuelve dentro de la misma
--      transacción, con las mismas validaciones de permiso que la política
--      obs_topics_write (0231): capacidad de Planeación, nivel Editar y panel
--      Observatorios o Tableros en ESE observatorio.
--
-- Requiere 0230 y 0231. Idempotente. No cambia filas existentes.
-- =============================================================================

alter table public.obs_topics
  add column if not exists color  text,
  add column if not exists icono  text;

alter table public.obs_topics drop constraint if exists obs_topics_color;
alter table public.obs_topics add constraint obs_topics_color
  check (color is null or color ~ '^(#[0-9a-fA-F]{3,8}|var\(--[a-z0-9-]{1,40}\))$');
alter table public.obs_topics drop constraint if exists obs_topics_icono;
alter table public.obs_topics add constraint obs_topics_icono
  check (icono is null or icono ~ '^[a-z0-9-]{1,40}$');

comment on column public.obs_topics.color is 'Color propio del tema (0248); null: el de su línea.';
comment on column public.obs_topics.icono is 'Icono propio del tema (0248); null: ninguno.';

create or replace function public.obs_tema_crear(
  p_obs      uuid,
  p_nombre   text,
  p_slug     text default null,
  p_linea    uuid default null,
  p_codigo   text default null,
  p_resumen  text default null,
  p_pregunta text default null,
  p_fuente   text default null,
  p_color    text default null,
  p_icono    text default null
)
returns public.obs_topics
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_base   text;
  v_slug   text;
  v_n      integer := 2;
  v_estado text;
  fila     public.obs_topics;
begin
  if not (public.obs_can_edit()
          and (public.obs_puede('obs_observatorios', p_obs, 'editar') or public.obs_puede('obs_tableros', p_obs, 'editar'))) then
    raise exception 'Crear un tema pide capacidad de Planeación y el panel Observatorios o Tableros (nivel Editar) en este observatorio.' using errcode = 'insufficient_privilege';
  end if;
  select estado into v_estado from public.obs_observatorios where id = p_obs;
  if not found then
    raise exception 'El observatorio no existe.' using errcode = 'no_data_found';
  end if;
  if v_estado = 'archivado' then
    raise exception 'El observatorio está archivado: restáurelo antes de crear temas.' using errcode = '22023';
  end if;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 120 then
    raise exception 'El nombre del tema lleva de 2 a 120 caracteres.' using errcode = '22023';
  end if;
  if p_linea is not null and not exists (select 1 from public.obs_lineas l where l.id = p_linea and l.observatorio_id = p_obs) then
    raise exception 'La línea no pertenece a este observatorio.' using errcode = '22023';
  end if;
  if p_codigo is not null and p_codigo !~ '^[A-Za-z0-9]{1,4}$' then
    raise exception 'El código lleva de 1 a 4 letras o cifras.' using errcode = '22023';
  end if;
  if p_color is not null and p_color !~ '^(#[0-9a-fA-F]{3,8}|var\(--[a-z0-9-]{1,40}\))$' then
    raise exception 'Color no válido.' using errcode = '22023';
  end if;
  if p_icono is not null and p_icono !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Icono no válido.' using errcode = '22023';
  end if;

  -- Enlace: el pedido (debe ser libre) o uno derivado del nombre (se numera si choca).
  if p_slug is not null and btrim(p_slug) <> '' then
    v_slug := btrim(p_slug);
    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 60 then
      raise exception 'El enlace usa minúsculas, cifras y guiones (hasta 60 caracteres).' using errcode = '22023';
    end if;
    if exists (select 1 from public.obs_topics where slug = v_slug) then
      raise exception 'slug_en_uso: ya existe un tema con el enlace «%». Los enlaces son únicos en todo el portal.', v_slug using errcode = '23505';
    end if;
  else
    v_base := regexp_replace(lower(translate(v_nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')), '[^a-z0-9]+', '-', 'g');
    v_base := btrim(left(btrim(v_base, '-'), 56), '-');
    if v_base = '' then
      v_base := 'tema';
    end if;
    v_slug := v_base;
    while exists (select 1 from public.obs_topics where slug = v_slug) loop
      v_slug := v_base || '-' || v_n;
      v_n := v_n + 1;
    end loop;
  end if;

  insert into public.obs_topics (slug, observatorio_id, linea_id, codigo, nombre, resumen, pregunta, fuente, color, icono, orden, status)
  values (
    v_slug, p_obs, p_linea,
    upper(coalesce(nullif(p_codigo, ''), nullif(left(regexp_replace(translate(v_nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'), '[^A-Za-z0-9]', '', 'g'), 2), ''), 'NT')),
    v_nombre, nullif(btrim(coalesce(p_resumen, '')), ''),
    coalesce(nullif(btrim(coalesce(p_pregunta, '')), ''), '¿Qué muestra ' || v_nombre || '?'),
    nullif(btrim(coalesce(p_fuente, '')), ''), p_color, p_icono,
    coalesce((select max(t.orden) from public.obs_topics t where t.observatorio_id = p_obs and t.linea_id is not distinct from p_linea), 0) + 1,
    'borrador')
  returning * into fila;
  return fila;
end;
$$;

revoke all on function public.obs_tema_crear(uuid, text, text, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.obs_tema_crear(uuid, text, text, uuid, text, text, text, text, text, text) to authenticated;
