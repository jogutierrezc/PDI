-- =============================================================================
-- 0250 · Observatorio ↔ Warehouse: quita los topes estrechos de la agregación
--
-- La 0249 dejaba agrupar por 2 columnas, 3 medidas y 500 grupos. Es una limitante
-- para diseñar visuales: ahora son hasta 6 columnas de agrupación, 12 medidas y
-- 5000 grupos. La privacidad no cambia: las columnas siguen filtradas por la
-- política (wh_politicas), todo grupo con menos de 5 registros se descarta y no
-- hay filtros por valor. Solo se reemplaza obs_wh_agregar (los permisos de la
-- función se conservan con CREATE OR REPLACE). Requiere 0249. Idempotente.
-- =============================================================================

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
  if cardinality(v_dims) > 6 then
    raise exception 'Se puede agrupar por hasta seis columnas.' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(v_dims) x) <> cardinality(v_dims) then
    raise exception 'Las columnas de agrupación no pueden repetirse.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_medidas) is distinct from 'array' then
    raise exception 'Defina de una a doce medidas.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_medidas) not between 1 and 12 then
    raise exception 'Defina de una a doce medidas.' using errcode = '22023';
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

  if v_grupos > 5000 then
    raise exception 'La agregación produce % grupos (máximo 5000). Agrupe por columnas con menos valores distintos.', v_grupos using errcode = '22023';
  end if;
  return jsonb_build_object('columns', v_cols, 'rows', v_filas, 'grupos', v_grupos, 'grupos_descartados', v_chicos,
                            'registros_descartados', v_fchicas, 'registros', v_total);
end;
$$;
