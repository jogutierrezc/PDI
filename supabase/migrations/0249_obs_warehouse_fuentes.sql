-- =============================================================================
-- 0249 · Observatorio ↔ UDES Warehouse: tablas agregadas desde el almacén
--
-- Una persona con permiso elige en el Observatorio una carga VIGENTE del
-- Warehouse (conjunto + sede + periodo + corte), ve las columnas que la
-- política de privacidad permite, define una agregación (contar, sumar o
-- promediar; agrupar por una o dos columnas) y la guarda como una tabla de
-- datos del Observatorio (obs_datasets, borrador). Después se usa en los
-- visores, tableros, boletín e insertados de siempre. Esa tabla puede
-- «refrescarse» cuando el Warehouse tenga una versión más nueva.
--
-- Privacidad (el Observatorio es público):
--   · La agregación ocurre aquí, en la base. El navegador nunca recibe filas
--     individuales del almacén: solo recibe columnas permitidas (nombre, tipo,
--     cuántos valores distintos) y los resultados ya agregados.
--   · Columnas permitidas = las que la carga conserva Y que la política del
--     conjunto (wh_politicas) deja usar: se excluyen las que la política
--     seudonimiza (docente) y las que marca como dato personal (código del
--     estudiante), y una lista de nombres de identidad por si una política se
--     afloja. Un conjunto puede vetarse para el Observatorio con
--     wh_politicas.agregable_obs = false (la nómina y lo financiero nacen
--     vetados).
--   · Reserva «< 5»: todo grupo con menos de 5 registros SE DESCARTA aquí
--     (no se guarda con «< 5» porque una suma o un promedio de un grupo
--     chico identificaría a la persona). El acta cuenta cuántos grupos y
--     registros se dejaron fuera. Sin agrupar, el total también debe tener 5.
--   · Como máximo 2 columnas de agrupación, 3 medidas y 500 grupos.
--   · Sin filtros por valor: filtrar por un valor y comparar con el total
--     permite restar y aislar a una persona.
--
-- Permisos: capacidad de Planeación (obs_can_edit), la pantalla «warehouse»
-- del rol (wh_autorizado) y el panel Captura o Tableros del Observatorio con
-- nivel Editar en ESE observatorio: los mismos que ya escriben obs_datasets
-- (0231), más el permiso de leer el almacén.
--
-- Trazabilidad: obs_dataset_origen guarda de dónde viene cada tabla
-- (conjunto, sede, periodo, corte, carga, versión, huella, definición y
-- fecha). No es legible por el público (sin políticas ni permisos de tabla);
-- se consulta por obs_wh_origenes, que marca «desactualizada» cuando el
-- Warehouse tiene una versión vigente distinta.
--
-- Requiere 0049, 0155–0161, 0230–0234. Idempotente.
-- =============================================================================

-- 1. El Warehouse puede vetar un conjunto para el Observatorio --------------------------

alter table public.wh_politicas add column if not exists agregable_obs boolean not null default true;
comment on column public.wh_politicas.agregable_obs is
  'Observatorio (0249): si el conjunto puede ofrecerse como fuente de tablas agregadas del Observatorio público.';

update public.wh_politicas set agregable_obs = false where conjunto in ('ms_nom', 'dv_fin');

-- 2. Origen de cada tabla --------------------------------------------------------------

create table if not exists public.obs_dataset_origen (
  dataset_id       uuid primary key references public.obs_datasets (id) on delete cascade,
  conjunto         text not null,
  sede             text not null,
  periodo          text not null,
  corte            text not null default '',
  carga_id         uuid not null,
  version          integer not null,
  huella           text not null,
  spec             jsonb not null,
  vivo             boolean not null default false,
  materializado_en timestamptz not null default now(),
  materializado_por uuid default auth.uid(),
  constraint obs_dataset_origen_spec check (jsonb_typeof(spec) = 'object')
);

comment on table public.obs_dataset_origen is
  'Observatorio (0249): de qué carga del Warehouse sale una tabla y cómo se agregó. Sin lectura directa: obs_wh_origenes.';

alter table public.obs_dataset_origen enable row level security;
revoke all on public.obs_dataset_origen from public, anon, authenticated;

-- 3. Ayudantes internos -----------------------------------------------------------------

create or replace function public.obs_wh_num(v jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case jsonb_typeof(v)
           when 'number' then (v #>> '{}')::numeric
           when 'string' then case when (v #>> '{}') ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(v #>> '{}', ',', '.')::numeric end
         end;
$$;

create or replace function public.obs_wh_permite(p_obs uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.obs_can_edit() and public.wh_autorizado()
     and (public.obs_puede('obs_captura', p_obs, 'editar') or public.obs_puede('obs_tableros', p_obs, 'editar'));
$$;

-- La carga debe ser la vigente de su conjunto y el conjunto estar abierto al Observatorio.
create or replace function public.obs_wh_carga(p_carga uuid)
returns public.wh_cargas
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.wh_cargas;
begin
  select k.* into c
    from public.wh_cargas k
    join public.wh_vigentes v on v.id = k.id
    join public.wh_politicas p on p.conjunto = k.conjunto
   where k.id = p_carga and p.agregable_obs;
  if not found then
    raise exception 'La carga no existe, no es la versión vigente de su conjunto o su conjunto no está abierto al Observatorio.' using errcode = '22023';
  end if;
  return c;
end;
$$;

-- Columnas que la política permite usar de una carga.
create or replace function public.obs_wh_permitidas(p_carga uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(k order by k), '{}')
    from public.wh_cargas c
    join public.wh_politicas p on p.conjunto = c.conjunto
   cross join lateral jsonb_array_elements_text(c.columnas) as k
   where c.id = p_carga
     and k ~ '^[a-z0-9_]{1,80}$'
     and k !~ '(documento|correo|email|telefono|celular|direccion|cedula|contrasena|password|salud)'
     and not (k = any (p.seudonimizar))
     and not (k = any (p.datos_personales))
     and ((p.modo = 'permitir' and k = any (p.lista)) or (p.modo = 'excluir' and not (k = any (p.lista))));
$$;

create or replace function public.obs_wh_etiqueta(p_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select initcap(replace(p_key, '_', ' '));
$$;

-- El agregador. Solo lo llaman las funciones de abajo, que ya validaron permisos.
create or replace function public.obs_wh_agregar(p_carga uuid, p_dims text[], p_medidas jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_perm    text[] := public.obs_wh_permitidas(p_carga);
  v_dims    text[] := coalesce(p_dims, '{}');
  v_keys    text[] := '{}';
  v_cols    jsonb := '[]'::jsonb;
  v_sel     text := '';
  v_cells   text := '';
  v_grupo   text := '';
  v_orden   text := 'n_';
  m         jsonb;
  i         integer := 0;
  d         text;
  v_op      text;
  v_col     text;
  v_key     text;
  v_etq     text;
  v_expr    text;
  v_sql     text;
  v_filas   jsonb;
  v_grupos  bigint;
  v_chicos  bigint;
  v_fchicas bigint;
  v_total   bigint;
begin
  if cardinality(v_dims) > 2 then
    raise exception 'Se puede agrupar por una o dos columnas como máximo.' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(v_dims) x) <> cardinality(v_dims) then
    raise exception 'Las columnas de agrupación no pueden repetirse.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_medidas) is distinct from 'array' then
    raise exception 'Defina de una a tres medidas.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_medidas) not between 1 and 3 then
    raise exception 'Defina de una a tres medidas.' using errcode = '22023';
  end if;

  foreach d in array v_dims loop
    if not (d = any (v_perm)) then
      raise exception 'La columna «%» no está permitida por la política de privacidad del conjunto.', d using errcode = 'insufficient_privilege';
    end if;
    i := i + 1;
    v_sel := v_sel || format('coalesce(nullif(btrim(datos ->> %L), ''''), ''(sin dato)'') as d%s, ', d, i);
    v_cells := v_cells || format('%L::text, d%s, ', d, i);
    v_grupo := v_grupo || case when i > 1 then ', ' else '' end || 'd' || i;
    v_keys := v_keys || d;
    v_cols := v_cols || jsonb_build_object('key', d, 'label', public.obs_wh_etiqueta(d), 'kind', 'texto');
  end loop;
  if v_grupo <> '' then
    v_orden := v_grupo;
  end if;

  i := 0;
  for m in select * from jsonb_array_elements(p_medidas) loop
    i := i + 1;
    v_op := m ->> 'op';
    v_col := m ->> 'col';
    if v_op not in ('contar', 'sumar', 'promediar') then
      raise exception 'Medida no válida: use contar, sumar o promediar.' using errcode = '22023';
    end if;
    if v_op = 'contar' then
      v_key := 'registros';
      v_expr := 'count(*)';
      v_cols := v_cols || jsonb_build_object('key', v_key, 'label', 'Registros', 'kind', 'cifra', 'format', 'entero', 'unit', 'registros');
    else
      if v_col is null or not (v_col = any (v_perm)) then
        raise exception 'La columna «%» no está permitida por la política de privacidad del conjunto.', coalesce(v_col, '') using errcode = 'insufficient_privilege';
      end if;
      v_key := case v_op when 'sumar' then 'suma_' else 'promedio_' end || v_col;
      v_expr := format('round(%s(public.obs_wh_num(datos -> %L)), 2)', case v_op when 'sumar' then 'sum' else 'avg' end, v_col);
      v_etq := case v_op when 'sumar' then 'Suma de ' else 'Promedio de ' end || lower(public.obs_wh_etiqueta(v_col));
      v_cols := v_cols || jsonb_build_object('key', v_key, 'label', v_etq, 'kind', 'cifra', 'format', 'decimal', 'decimals', 2);
    end if;
    if v_key = any (v_keys) then
      raise exception 'La medida «%» está repetida o choca con una columna de agrupación.', v_key using errcode = '22023';
    end if;
    v_keys := v_keys || v_key;
    v_sel := v_sel || format('%s as m%s, ', v_expr, i);
    v_cells := v_cells || format('%L::text, m%s, ', v_key, i);
  end loop;

  v_cells := rtrim(v_cells, ', ');
  v_sql := format(
    'with g as (select %s count(*) as n_ from public.wh_filas where carga_id = %L group by %s) '
    'select coalesce(jsonb_agg(jsonb_build_object(''year'', null, ''kind'', ''dato'', ''label'', '''', ''cells'', jsonb_build_object(%s)) order by %s) filter (where n_ >= 5), ''[]''::jsonb), '
    'count(*) filter (where n_ >= 5), count(*) filter (where n_ < 5), coalesce(sum(n_) filter (where n_ < 5), 0), coalesce(sum(n_), 0) from g',
    v_sel, p_carga, case when v_grupo = '' then '()' else v_grupo end, v_cells, v_orden);
  execute v_sql into v_filas, v_grupos, v_chicos, v_fchicas, v_total;

  if v_grupos > 500 then
    raise exception 'La agregación produce % grupos (máximo 500). Agrupe por columnas con menos valores distintos.', v_grupos using errcode = '22023';
  end if;
  return jsonb_build_object('columns', v_cols, 'rows', v_filas, 'grupos', v_grupos, 'grupos_descartados', v_chicos,
                            'registros_descartados', v_fchicas, 'registros', v_total);
end;
$$;

-- 4. Funciones que llama la intranet ----------------------------------------------------

-- Cargas vigentes que se pueden ofrecer.
create or replace function public.obs_wh_catalogo(p_obs uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.obs_wh_permite(p_obs) then
    raise exception 'Leer el Warehouse desde el Observatorio pide el panel Captura o Tableros (nivel Editar) y la pantalla Warehouse.' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('carga', v.id, 'conjunto', v.conjunto, 'periodo', v.periodo, 'sede', v.sede, 'corte', v.corte,
                                        'version', v.version, 'filas', v.filas, 'huella', v.huella, 'terminada_en', v.terminada_en)
                     order by v.conjunto, v.periodo desc, v.sede, v.corte)
      from public.wh_vigentes v
      join public.wh_politicas p on p.conjunto = v.conjunto
     where p.agregable_obs and v.filas > 0
  ), '[]'::jsonb);
end;
$$;

-- Columnas permitidas de una carga (nombre, tipo, valores distintos) y las que la política deja fuera.
create or replace function public.obs_wh_columnas(p_obs uuid, p_carga uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c      public.wh_cargas;
  v_perm text[];
  pol    public.wh_politicas;
begin
  if not public.obs_wh_permite(p_obs) then
    raise exception 'Leer el Warehouse desde el Observatorio pide el panel Captura o Tableros (nivel Editar) y la pantalla Warehouse.' using errcode = 'insufficient_privilege';
  end if;
  c := public.obs_wh_carga(p_carga);
  v_perm := public.obs_wh_permitidas(p_carga);
  select * into pol from public.wh_politicas where conjunto = c.conjunto;
  return jsonb_build_object(
    'columnas', coalesce((
      select jsonb_agg(jsonb_build_object('key', s.key,
                                          'tipo', case when s.n > 0 and s.nn::numeric / s.n >= 0.9 then 'numero' else 'texto' end,
                                          'distintos', s.d, 'llenos', s.n) order by s.key)
        from (
          select k.key, count(t.txt) as n, count(distinct t.txt) as d, count(public.obs_wh_num(f.datos -> k.key)) as nn
            from public.wh_filas f
           cross join unnest(v_perm) as k(key)
           cross join lateral (select nullif(btrim(f.datos ->> k.key), '') as txt) t
           where f.carga_id = p_carga
           group by k.key
        ) s
    ), '[]'::jsonb),
    'excluidas', coalesce((
      select jsonb_agg(jsonb_build_object('key', x, 'motivo',
               case when x = any (pol.seudonimizar) then 'seudónimo'
                    when x = any (pol.datos_personales) then 'dato personal'
                    else 'no permitida' end) order by x)
        from jsonb_array_elements_text(c.columnas) x
       where not (x = any (v_perm))
    ), '[]'::jsonb),
    'filas', c.filas);
end;
$$;

-- Vista previa: la agregación sin guardar nada.
create or replace function public.obs_wh_previsualizar(p_obs uuid, p_carga uuid, p_dims text[], p_medidas jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.obs_wh_permite(p_obs) then
    raise exception 'Leer el Warehouse desde el Observatorio pide el panel Captura o Tableros (nivel Editar) y la pantalla Warehouse.' using errcode = 'insufficient_privilege';
  end if;
  perform public.obs_wh_carga(p_carga);
  return public.obs_wh_agregar(p_carga, p_dims, p_medidas);
end;
$$;

-- El acta de anonimización de una tabla que viene del almacén.
create or replace function public.obs_wh_acta(c public.wh_cargas, p_dims text[], agg jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'fileName', 'UDES Warehouse · ' || c.conjunto || ' · ' || upper(c.sede) || ' · ' || c.periodo,
    'sourceRows', c.filas,
    'sourceColumns', jsonb_array_length(c.columnas),
    'removed', coalesce((
        select jsonb_agg(jsonb_build_object('column', x, 'reason', 'No usada en la agregación o vetada por la política de privacidad del Warehouse'))
          from jsonb_array_elements_text(c.columnas) x
         where not (x = any (coalesce(p_dims, '{}')))), '[]'::jsonb),
    'groupedBy', to_jsonb(coalesce(p_dims, '{}')),
    'reservedCells', (agg ->> 'grupos_descartados')::integer,
    'threshold', 5,
    'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
$$;

-- Guardar (o rehacer) la tabla del Observatorio.
create or replace function public.obs_wh_materializar(
  p_obs uuid, p_tema text, p_carga uuid, p_dims text[], p_medidas jsonb,
  p_titulo text, p_dataset uuid default null, p_vivo boolean default false,
  p_descripcion text default '', p_fuente text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c       public.wh_cargas;
  agg     jsonb;
  acta    jsonb;
  v_id    uuid;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_fuente text := coalesce(nullif(btrim(coalesce(p_fuente, '')), ''), 'UDES Warehouse');
begin
  if not public.obs_wh_permite(p_obs) then
    raise exception 'Crear tablas desde el Warehouse pide el panel Captura o Tableros (nivel Editar) y la pantalla Warehouse.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.obs_topics t where t.slug = p_tema and t.observatorio_id = p_obs) then
    raise exception 'El tema no pertenece a este observatorio.' using errcode = '22023';
  end if;
  if char_length(v_titulo) < 3 or char_length(v_titulo) > 160 then
    raise exception 'El título lleva de 3 a 160 caracteres.' using errcode = '22023';
  end if;
  c := public.obs_wh_carga(p_carga);
  agg := public.obs_wh_agregar(p_carga, p_dims, p_medidas);
  if jsonb_array_length(agg -> 'rows') = 0 then
    raise exception 'Ningún grupo reúne 5 registros o más: no se puede publicar esta agregación sin exponer casos individuales. Agrupe por menos columnas.' using errcode = '22023';
  end if;
  acta := public.obs_wh_acta(c, p_dims, agg);

  if p_dataset is null then
    insert into public.obs_datasets (topic, observatorio_id, title, description, source, data_type, temporality, period_label,
                                     columns, rows, anonymization, is_sample, status, position)
    values (p_tema, p_obs, v_titulo, coalesce(p_descripcion, ''), v_fuente, 'conteo', 'sin_tiempo', c.periodo,
            agg -> 'columns', agg -> 'rows', acta, false, 'borrador',
            coalesce((select max(position) from public.obs_datasets where topic = p_tema), 0) + 1)
    returning id into v_id;
  else
    if not exists (select 1 from public.obs_datasets d join public.obs_dataset_origen o on o.dataset_id = d.id
                    where d.id = p_dataset and d.observatorio_id = p_obs) then
      raise exception 'La tabla no existe en este observatorio o no viene del Warehouse.' using errcode = '22023';
    end if;
    update public.obs_datasets
       set title = v_titulo, description = coalesce(p_descripcion, ''), source = v_fuente, period_label = c.periodo,
           columns = agg -> 'columns', rows = agg -> 'rows', anonymization = acta
     where id = p_dataset
    returning id into v_id;
  end if;

  insert into public.obs_dataset_origen (dataset_id, conjunto, sede, periodo, corte, carga_id, version, huella, spec, vivo)
  values (v_id, c.conjunto, c.sede, c.periodo, c.corte, c.id, c.version, c.huella,
          jsonb_build_object('dims', to_jsonb(coalesce(p_dims, '{}')), 'medidas', p_medidas), coalesce(p_vivo, false))
  on conflict (dataset_id) do update
    set conjunto = excluded.conjunto, sede = excluded.sede, periodo = excluded.periodo, corte = excluded.corte,
        carga_id = excluded.carga_id, version = excluded.version, huella = excluded.huella, spec = excluded.spec,
        vivo = excluded.vivo, materializado_en = now(), materializado_por = auth.uid();

  return jsonb_build_object('dataset_id', v_id, 'filas', jsonb_array_length(agg -> 'rows'),
                            'grupos_descartados', agg -> 'grupos_descartados', 'registros_descartados', agg -> 'registros_descartados');
end;
$$;

-- Pasar una tabla a la versión vigente más nueva de su misma fuente (conjunto, sede, periodo, corte).
create or replace function public.obs_wh_refrescar(p_dataset uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o       public.obs_dataset_origen;
  v_obs   uuid;
  v       public.wh_vigentes;
  c       public.wh_cargas;
  agg     jsonb;
begin
  select d.observatorio_id into v_obs from public.obs_datasets d where d.id = p_dataset;
  select * into o from public.obs_dataset_origen where dataset_id = p_dataset;
  if v_obs is null or o.dataset_id is null then
    raise exception 'La tabla no existe o no viene del Warehouse.' using errcode = '22023';
  end if;
  if not public.obs_wh_permite(v_obs) then
    raise exception 'Refrescar desde el Warehouse pide el panel Captura o Tableros (nivel Editar) y la pantalla Warehouse.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.wh_vigentes where conjunto = o.conjunto and periodo = o.periodo and sede = o.sede and corte = o.corte;
  if not found then
    raise exception 'El Warehouse ya no tiene una versión vigente de esta fuente.' using errcode = '22023';
  end if;
  if v.id = o.carga_id then
    return jsonb_build_object('cambio', false, 'version', o.version);
  end if;
  c := public.obs_wh_carga(v.id);
  agg := public.obs_wh_agregar(c.id, array(select jsonb_array_elements_text(o.spec -> 'dims')), o.spec -> 'medidas');
  if jsonb_array_length(agg -> 'rows') = 0 then
    raise exception 'Con la versión nueva ningún grupo reúne 5 registros: la tabla se deja como estaba.' using errcode = '22023';
  end if;
  update public.obs_datasets
     set columns = agg -> 'columns', rows = agg -> 'rows',
         anonymization = public.obs_wh_acta(c, array(select jsonb_array_elements_text(o.spec -> 'dims')), agg)
   where id = p_dataset;
  update public.obs_dataset_origen
     set carga_id = c.id, version = c.version, huella = c.huella, materializado_en = now(), materializado_por = auth.uid()
   where dataset_id = p_dataset;
  return jsonb_build_object('cambio', true, 'version', c.version, 'filas', jsonb_array_length(agg -> 'rows'));
end;
$$;

-- Origen de las tablas de un observatorio y si están desactualizadas.
create or replace function public.obs_wh_origenes(p_obs uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.obs_ve_taller(p_obs) then
    raise exception 'No tiene acceso al taller de este observatorio.' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'dataset_id', o.dataset_id, 'conjunto', o.conjunto, 'sede', o.sede, 'periodo', o.periodo, 'corte', o.corte,
             'version', o.version, 'carga', o.carga_id, 'vivo', o.vivo, 'materializado_en', o.materializado_en,
             'spec', o.spec, 'vigente_version', v.version, 'vigente_en', v.terminada_en,
             'desactualizado', v.id is not null and v.id <> o.carga_id,
             'sin_vigente', v.id is null))
      from public.obs_dataset_origen o
      join public.obs_datasets d on d.id = o.dataset_id and d.observatorio_id = p_obs
      left join public.wh_vigentes v on v.conjunto = o.conjunto and v.periodo = o.periodo and v.sede = o.sede and v.corte = o.corte
  ), '[]'::jsonb);
end;
$$;

-- 5. Permisos de ejecución --------------------------------------------------------------

revoke all on function public.obs_wh_num(jsonb), public.obs_wh_etiqueta(text) from public, anon;
revoke all on function public.obs_wh_permite(uuid), public.obs_wh_carga(uuid), public.obs_wh_permitidas(uuid),
  public.obs_wh_agregar(uuid, text[], jsonb), public.obs_wh_acta(public.wh_cargas, text[], jsonb) from public, anon, authenticated;
revoke all on function public.obs_wh_catalogo(uuid), public.obs_wh_columnas(uuid, uuid), public.obs_wh_previsualizar(uuid, uuid, text[], jsonb),
  public.obs_wh_materializar(uuid, text, uuid, text[], jsonb, text, uuid, boolean, text, text), public.obs_wh_refrescar(uuid),
  public.obs_wh_origenes(uuid) from public, anon;
grant execute on function public.obs_wh_catalogo(uuid), public.obs_wh_columnas(uuid, uuid), public.obs_wh_previsualizar(uuid, uuid, text[], jsonb),
  public.obs_wh_materializar(uuid, text, uuid, text[], jsonb, text, uuid, boolean, text, text), public.obs_wh_refrescar(uuid),
  public.obs_wh_origenes(uuid) to authenticated;
grant execute on function public.obs_wh_num(jsonb), public.obs_wh_etiqueta(text) to authenticated;
