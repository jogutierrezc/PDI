-- =============================================================================
-- PDI · 0269 · Warehouse · perfilar, explorar y paginar en la base
--
-- Explorar dejaba que el navegador bajara todas las filas de una carga (hasta
-- ~29.000 en notas) y adivinara allí qué columnas eran numéricas. Estas cuatro
-- funciones lo hacen donde están los datos:
--
--   wh_perfilar(carga)        por columna: tipo, llenos, distintos, mínimo, máximo
--                             y patrón de formato. De una columna marcada como
--                             dato personal no devuelve ni mínimo ni máximo.
--   wh_explorar(carga, ...)   agrupa y mide (contar, sumar, promediar, mediana,
--                             mínimo, máximo, distintos) con filtros y orden.
--   wh_filas_pagina(...)      filas de a 100 (hasta 1000 para exportar), con
--                             orden y búsqueda en la base.
--   wh_dispersion(...)        pares (x, y); pasados 5.000, celdas con conteo.
--
-- Privacidad (la política de la base manda, no la pantalla):
--   · Todas exigen wh_autorizado() (pantalla «warehouse» y rol Planeación). Son
--     security invoker: además rige la RLS de wh_filas, igual que la lectura
--     directa que ya existía.
--   · No se agrupa, filtra ni dispersa por una columna de datos_personales: sería
--     aislar a una persona. Medir sobre una de esas columnas (por ejemplo
--     «estudiantes distintos») es válido, pero el grupo se descarta si tiene
--     menos de 5 valores distintos (reserva de 5, como el Observatorio, 0249).
--   · wh_filas_pagina devuelve la fila tal cual la guardó la política, a quien ya
--     podía leer wh_filas.
--
-- Sin SQL dinámico: los nombres de columna viajan como valores (datos->>nombre),
-- así que no hay nada que inyectar. Requiere 0155 y 0161. Idempotente.
-- =============================================================================

-- Las columnas de datos personales de una carga (según la política de su conjunto).
create or replace function public.wh_columnas_personales(p_carga uuid)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct x), '{}'::text[])
    from public.wh_cargas c
    join public.wh_politicas p on p.conjunto = c.conjunto
   cross join lateral unnest(p.datos_personales) x
   where c.id = p_carga;
$$;

-- ¿Cumple la fila todos los filtros? [{col, op, val}] con op eq, ne, gte, lte, contiene o en.
create or replace function public.wh_cumple(p_datos jsonb, p_filtros jsonb)
returns boolean
language sql
stable
set search_path = public
as $$
  select not exists (
    select 1
      from jsonb_to_recordset(case when jsonb_typeof(p_filtros) = 'array' then p_filtros else '[]'::jsonb end) as x(col text, op text, val jsonb)
     where not coalesce(
       case x.op
         when 'eq'       then coalesce(p_datos ->> x.col, '') = coalesce(x.val #>> '{}', '')
         when 'ne'       then coalesce(p_datos ->> x.col, '') <> coalesce(x.val #>> '{}', '')
         when 'gte'      then public.wh_num(p_datos ->> x.col) >= public.wh_num(x.val #>> '{}')
         when 'lte'      then public.wh_num(p_datos ->> x.col) <= public.wh_num(x.val #>> '{}')
         when 'contiene' then position(lower(coalesce(x.val #>> '{}', '')) in lower(coalesce(p_datos ->> x.col, ''))) > 0
         when 'en'       then case when jsonb_typeof(x.val) = 'array'
                                   then coalesce(p_datos ->> x.col, '') in (select jsonb_array_elements_text(x.val))
                                   else false end
         else false
       end, false)
  );
$$;

-- Comprobaciones comunes: permiso, que la carga exista y que los filtros no toquen datos personales.
create or replace function public.wh_exigir(p_carga uuid, p_filtros jsonb, p_columnas text[])
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  pers text[];
begin
  if not public.wh_autorizado() then
    raise exception 'wh_sin_permiso: el Warehouse es de Planeación' using errcode = '42501';
  end if;
  if not exists (select 1 from public.wh_cargas where id = p_carga) then
    raise exception 'wh_no_existe: esa carga no existe o no se puede ver';
  end if;
  pers := public.wh_columnas_personales(p_carga);
  if coalesce(p_columnas, '{}') && pers then
    raise exception 'wh_dato_personal: no se puede agrupar ni dispersar por una columna con dato personal';
  end if;
  if jsonb_typeof(p_filtros) = 'array' and exists (
    select 1 from jsonb_array_elements(p_filtros) e where (e ->> 'col') = any (pers)
  ) then
    raise exception 'wh_dato_personal: no se puede filtrar por una columna con dato personal';
  end if;
  return pers;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Perfil de columnas
-- -----------------------------------------------------------------------------
create or replace function public.wh_perfilar(p_carga uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  pers text[];
  salida jsonb;
begin
  pers := public.wh_exigir(p_carga, '[]'::jsonb, '{}');
  with f as (
    select e.key as c, nullif(btrim(e.value #>> '{}'), '') as v
      from public.wh_filas r
     cross join lateral jsonb_each(r.datos) e
     where r.carga_id = p_carga
  ),
  s as (
    select c,
           count(*) filter (where v is not null) as llenos,
           count(distinct v) as distintos,
           count(*) filter (where public.wh_num(v) is not null) as nums,
           count(*) filter (where v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}') as fechas,
           min(public.wh_num(v)) as mn,
           max(public.wh_num(v)) as mx
      from f group by c
  ),
  p as (
    select c, pat, n, rank() over (partition by c order by n desc, pat) as rk
      from (
        select c, pat, count(*) as n
          from (
            select c, regexp_replace(regexp_replace(left(v, 30), '[0-9]', '9', 'g'), '[^9[:space:][:punct:]]', 'A', 'g') as pat
              from f where v is not null
          ) q
         group by c, pat
      ) g
  )
  select jsonb_build_object(
           'filas', (select filas from public.wh_cargas where id = p_carga),
           'columnas', coalesce(jsonb_agg(jsonb_build_object(
             'col', s.c,
             'tipo', case
                       when s.llenos = 0 then 'vacia'
                       when s.nums >= 0.9 * s.llenos then 'numero'
                       when s.fechas >= 0.9 * s.llenos then 'fecha'
                       when s.distintos <= 50 then 'categoria'
                       else 'texto' end,
             'llenos', s.llenos,
             'distintos', s.distintos,
             'min', case when s.c = any (pers) or s.nums < 0.9 * s.llenos then null else s.mn end,
             'max', case when s.c = any (pers) or s.nums < 0.9 * s.llenos then null else s.mx end,
             'patron', case when pp.n >= 0.6 * s.llenos then pp.pat end,
             'personal', s.c = any (pers)
           ) order by s.c), '[]'::jsonb))
    into salida
    from s
    left join p pp on pp.c = s.c and pp.rk = 1;
  return salida;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Agrupar y medir
--    p_medidas: [{"op":"contar"}, {"op":"sumar","col":"matriculados"}, …]
--    ops: contar, sumar, promediar, mediana, minimo, maximo, distintos
--    p_orden: valor_desc (por la primera medida), valor_asc o clave
-- -----------------------------------------------------------------------------
create or replace function public.wh_explorar(
  p_carga   uuid,
  p_dims    text[],
  p_medidas jsonb,
  p_filtros jsonb default '[]'::jsonb,
  p_orden   text default 'valor_desc',
  p_limite  int default 500
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  pers text[];
  lim int := least(greatest(coalesce(p_limite, 500), 1), 5000);
  salida jsonb;
begin
  if coalesce(array_length(p_dims, 1), 0) > 3 then
    raise exception 'wh_explorar: se agrupa por 3 columnas como máximo';
  end if;
  if jsonb_typeof(p_medidas) is distinct from 'array' or jsonb_array_length(p_medidas) not between 1 and 6 then
    raise exception 'wh_explorar: pida entre 1 y 6 medidas';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_medidas) e
     where coalesce(e ->> 'op', '') not in ('contar', 'sumar', 'promediar', 'mediana', 'minimo', 'maximo', 'distintos')
        or (coalesce(e ->> 'op', '') <> 'contar' and coalesce(e ->> 'col', '') = '')
  ) then
    raise exception 'wh_explorar: medida no válida';
  end if;
  pers := public.wh_exigir(p_carga, p_filtros, coalesce(p_dims, '{}'));

  with mm as (
    select (e.o - 1)::int as i, e.v ->> 'op' as op, e.v ->> 'col' as col,
           coalesce((e.v ->> 'col') = any (pers), false) as personal
      from jsonb_array_elements(p_medidas) with ordinality as e(v, o)
  ),
  claves as (
    select f.datos,
           (select coalesce(jsonb_agg(f.datos ->> t.c order by t.o), '[]'::jsonb)
              from unnest(coalesce(p_dims, '{}')) with ordinality as t(c, o)) as k
      from public.wh_filas f
     where f.carga_id = p_carga and public.wh_cumple(f.datos, p_filtros)
  ),
  vals as (
    select c.k, mm.i, mm.personal,
           nullif(btrim(c.datos ->> mm.col), '') as txt,
           case when mm.op in ('sumar', 'promediar', 'mediana', 'minimo', 'maximo') then public.wh_num(c.datos ->> mm.col) end as v
      from claves c cross join mm
  ),
  agg as (
    select k, i, personal,
           count(*) as n, sum(v) as s, avg(v) as a,
           percentile_cont(0.5) within group (order by v) as md,
           min(v) as mn, max(v) as mx, count(distinct txt) as dd
      from vals group by k, i, personal
  ),
  g as (
    select a.k,
           max(a.n) as n,
           jsonb_agg(
             case mm.op
               when 'contar'    then to_jsonb(a.n)
               when 'sumar'     then to_jsonb(a.s)
               when 'promediar' then to_jsonb(round(a.a, 4))
               when 'mediana'   then to_jsonb(round(a.md::numeric, 4))
               when 'minimo'    then to_jsonb(a.mn)
               when 'maximo'    then to_jsonb(a.mx)
               else to_jsonb(a.dd)
             end order by a.i) as vals,
           min(a.dd) filter (where a.personal) as dpers
      from agg a join mm on mm.i = a.i
     group by a.k
  ),
  ok as (select * from g where dpers is null or dpers >= 5),
  ord as (
    select o.*, row_number() over (
             order by case when p_orden = 'valor_asc' then (o.vals ->> 0)::numeric end asc nulls last,
                      case when p_orden = 'valor_desc' or p_orden is null then (o.vals ->> 0)::numeric end desc nulls last,
                      o.k::text) as rn
      from ok o
  )
  select jsonb_build_object(
           'grupos', (select count(*) from g),
           'descartados', (select count(*) from g) - (select count(*) from ok),
           'reservado', exists (select 1 from mm where personal),
           'filas', coalesce((select jsonb_agg(jsonb_build_object('k', d.k, 'n', d.n, 'v', d.vals) order by d.rn) from ord d where d.rn <= lim), '[]'::jsonb))
    into salida;
  return salida;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Filas por página, con orden, filtros y búsqueda
--    p_orden: «columna:asc» o «columna:desc» (numérico si la columna lo es).
-- -----------------------------------------------------------------------------
create or replace function public.wh_filas_pagina(
  p_carga    uuid,
  p_desde    int default 0,
  p_cantidad int default 100,
  p_orden    text default null,
  p_filtros  jsonb default '[]'::jsonb,
  p_busqueda text default ''
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  col text := split_part(coalesce(p_orden, ''), ':', 1);
  dir text := case when split_part(coalesce(p_orden, ''), ':', 2) = 'desc' then 'desc' else 'asc' end;
  q text := lower(btrim(coalesce(p_busqueda, '')));
  cant int := least(greatest(coalesce(p_cantidad, 100), 1), 1000);
  salida jsonb;
begin
  perform public.wh_exigir(p_carga, p_filtros, '{}');
  with base as (
    select f.n, f.datos
      from public.wh_filas f
     where f.carga_id = p_carga
       and public.wh_cumple(f.datos, p_filtros)
       and (q = '' or exists (select 1 from jsonb_each_text(f.datos) e where position(q in lower(e.value)) > 0))
  ),
  ord as (
    select b.datos,
           row_number() over (
             order by case when col <> '' and dir = 'asc'  then public.wh_num(b.datos ->> col) end asc nulls last,
                      case when col <> '' and dir = 'desc' then public.wh_num(b.datos ->> col) end desc nulls last,
                      case when col <> '' and dir = 'asc'  then b.datos ->> col end asc nulls last,
                      case when col <> '' and dir = 'desc' then b.datos ->> col end desc nulls last,
                      b.n) as rn
      from base b
  )
  select jsonb_build_object(
           'total', (select count(*) from base),
           'filas', coalesce((select jsonb_agg(o.datos order by o.rn) from ord o
                               where o.rn > greatest(coalesce(p_desde, 0), 0) and o.rn <= greatest(coalesce(p_desde, 0), 0) + cant), '[]'::jsonb))
    into salida;
  return salida;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Dispersión: puntos hasta 5.000; más allá, celdas con su conteo
-- -----------------------------------------------------------------------------
create or replace function public.wh_dispersion(
  p_carga   uuid,
  p_x       text,
  p_y       text,
  p_filtros jsonb default '[]'::jsonb,
  p_celdas  int default 40
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  c int := least(greatest(coalesce(p_celdas, 40), 5), 100);
  n int; xmin numeric; xmax numeric; ymin numeric; ymax numeric;
begin
  perform public.wh_exigir(p_carga, p_filtros, array[p_x, p_y]);
  select count(*), min(x), max(x), min(y), max(y) into n, xmin, xmax, ymin, ymax
    from (select public.wh_num(f.datos ->> p_x) as x, public.wh_num(f.datos ->> p_y) as y
            from public.wh_filas f where f.carga_id = p_carga and public.wh_cumple(f.datos, p_filtros)) q
   where x is not null and y is not null;
  if n <= 5000 then
    return jsonb_build_object('modo', 'puntos', 'total', n, 'xmin', xmin, 'xmax', xmax, 'ymin', ymin, 'ymax', ymax,
      'puntos', coalesce((select jsonb_agg(jsonb_build_array(x, y))
                            from (select public.wh_num(f.datos ->> p_x) as x, public.wh_num(f.datos ->> p_y) as y
                                    from public.wh_filas f where f.carga_id = p_carga and public.wh_cumple(f.datos, p_filtros)) q
                           where x is not null and y is not null), '[]'::jsonb));
  end if;
  return jsonb_build_object('modo', 'celdas', 'total', n, 'xmin', xmin, 'xmax', xmax, 'ymin', ymin, 'ymax', ymax, 'celdas', c,
    'datos', coalesce((select jsonb_agg(jsonb_build_array(cx, cy, k))
                         from (select least(c - 1, coalesce(floor((x - xmin) / nullif(xmax - xmin, 0) * c)::int, 0)) as cx,
                                      least(c - 1, coalesce(floor((y - ymin) / nullif(ymax - ymin, 0) * c)::int, 0)) as cy,
                                      count(*) as k
                                 from (select public.wh_num(f.datos ->> p_x) as x, public.wh_num(f.datos ->> p_y) as y
                                         from public.wh_filas f where f.carga_id = p_carga and public.wh_cumple(f.datos, p_filtros)) q
                                where x is not null and y is not null
                                group by 1, 2) z), '[]'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos: solo quien ya inició sesión; el filtro de verdad es wh_autorizado().
-- -----------------------------------------------------------------------------
revoke all on function public.wh_columnas_personales(uuid) from public, anon, authenticated;
revoke all on function public.wh_cumple(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.wh_exigir(uuid, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.wh_perfilar(uuid) from public, anon;
revoke all on function public.wh_explorar(uuid, text[], jsonb, jsonb, text, int) from public, anon;
revoke all on function public.wh_filas_pagina(uuid, int, int, text, jsonb, text) from public, anon;
revoke all on function public.wh_dispersion(uuid, text, text, jsonb, int) from public, anon;
grant execute on function public.wh_perfilar(uuid) to authenticated;
grant execute on function public.wh_explorar(uuid, text[], jsonb, jsonb, text, int) to authenticated;
grant execute on function public.wh_filas_pagina(uuid, int, int, text, jsonb, text) to authenticated;
grant execute on function public.wh_dispersion(uuid, text, text, jsonb, int) to authenticated;

comment on function public.wh_perfilar(uuid) is 'Warehouse: por columna, tipo, llenos, distintos, mínimo, máximo y patrón. Sin valores de datos personales.';
comment on function public.wh_explorar(uuid, text[], jsonb, jsonb, text, int) is 'Warehouse: agrupa y mide una carga en la base. Reserva de 5 cuando mide una columna de dato personal.';
comment on function public.wh_filas_pagina(uuid, int, int, text, jsonb, text) is 'Warehouse: filas de una carga por páginas, con orden, filtros y búsqueda en la base.';
comment on function public.wh_dispersion(uuid, text, text, jsonb, int) is 'Warehouse: puntos x–y de una carga; pasados 5.000, celdas con conteo.';

notify pgrst, 'reload schema';
