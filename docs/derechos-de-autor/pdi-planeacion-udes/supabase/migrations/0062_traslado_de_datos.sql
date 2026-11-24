-- =============================================================================
-- PDI · 0062 · Traslado de datos entre servidores
--
-- Importar tabla por tabla desde el panel de Supabase choca con las llaves
-- foráneas: «action_lines» no entra porque apunta a áreas que en el destino
-- no existen —o existen con otro id, porque la semilla de 0004 las creó con
-- uuids propios—. Y aunque se acertara el orden de las 78 tablas, los perfiles
-- apuntan a auth.users, que en otro proyecto son otras personas con otros ids.
--
-- Estas funciones hacen lo que hace un pg_restore y la pantalla
-- «Sistema → Traslado de datos» las encadena:
--
--   1. data_transfer_inventory / _export / _files leen el origen.
--   2. data_transfer_start limpia el mapa de usuarios.
--   3. data_transfer_profiles empareja perfiles por correo con las cuentas
--      que ya existen en el destino. Los perfiles no se borran nunca: borrar
--      el propio sería dejar fuera, a mitad de camino, a quien importa.
--   4. data_transfer_wipe vacía cada tabla y data_transfer_load la llena, con
--      session_replication_role = replica: las llaves foráneas y los
--      disparadores (auditoría, updated_at, cascadas) no se ejecutan, así que
--      el orden de las tablas deja de importar y los datos llegan tal cual.
--   5. data_transfer_repair revisa cada llave foránea: cambia los ids de
--      usuario del origen por los del destino, y lo que siga apuntando a
--      nada se anula si la columna lo admite o se borra si no.
--   6. data_transfer_finish pone al día las secuencias.
--
-- Cada paso es una llamada corta a propósito: el rol authenticated corta a
-- los 8 segundos, y una sola función que lo hiciera todo no llegaría al final.
--
-- Solo la administración. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Mapa de usuarios: id en el origen → id en el destino
-- -----------------------------------------------------------------------------

create table if not exists public.data_transfer_user_map (
  source_id uuid primary key,
  target_id uuid not null
);

comment on table public.data_transfer_user_map is
  'Temporal del traslado de datos: qué cuenta del destino corresponde a cada perfil del origen.';

alter table public.data_transfer_user_map enable row level security;
revoke all on public.data_transfer_user_map from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Piezas comunes
-- -----------------------------------------------------------------------------

create or replace function public.data_transfer_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo la administración puede exportar o importar datos.'
      using errcode = '42501';
  end if;
end;
$$;

-- Una tabla de datos de public, o un error que dice cuál falta.
create or replace function public.data_transfer_table(p_table text)
returns regclass
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rel regclass;
begin
  select c.oid::regclass into rel
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = p_table
    and c.relkind in ('r', 'p')
    and not c.relispartition
    and c.relname <> 'data_transfer_user_map';

  if rel is null then
    raise exception 'La tabla «%» no existe en este servidor.', p_table
      using errcode = '42P01',
            hint = 'Aplica en este servidor las mismas migraciones que en el origen.';
  end if;
  return rel;
end;
$$;

-- Apaga llaves foráneas y disparadores hasta el final de la llamada.
create or replace function public.data_transfer_quiet()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('session_replication_role', 'replica', true);
exception when insufficient_privilege then
  raise exception 'Este servidor no permite desactivar las llaves foráneas durante la carga.'
    using errcode = '42501',
          hint = 'Aplica la migración 0062 desde el editor SQL del panel (usuario postgres).';
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Leer
-- -----------------------------------------------------------------------------

create or replace function public.data_transfer_inventory()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n bigint;
  result jsonb := '[]'::jsonb;
begin
  perform public.data_transfer_guard();

  for r in
    select c.relname,
           (select jsonb_agg(a.attname order by a.attnum)
              from pg_attribute a
             where a.attrelid = c.oid and a.attnum > 0
               and not a.attisdropped and a.attgenerated = '') as columns
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relispartition
      and c.relname <> 'data_transfer_user_map'
    order by c.relname
  loop
    execute format('select count(*) from public.%I', r.relname) into n;
    result := result || jsonb_build_object(
      'table', r.relname, 'rows', n, 'columns', coalesce(r.columns, '[]'::jsonb));
  end loop;

  return result;
end;
$$;

create or replace function public.data_transfer_export(
  p_table text,
  p_offset integer default 0,
  p_limit integer default 2000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rel regclass;
  ord text;
  result jsonb;
begin
  perform public.data_transfer_guard();
  rel := public.data_transfer_table(p_table);

  -- Por la llave primaria, para que las páginas no se pisen.
  select string_agg(quote_ident(a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum))
    into ord
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey::int2[])
  where i.indrelid = rel and i.indisprimary;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from %s order by %s offset %s limit %s) t',
    rel, coalesce(ord, 'ctid'), greatest(p_offset, 0), least(greatest(p_limit, 1), 10000)
  ) into result;

  return result;
end;
$$;

create or replace function public.data_transfer_files()
returns table (bucket text, path text, size bigint, mimetype text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.data_transfer_guard();

  return query
    select o.bucket_id::text,
           o.name::text,
           coalesce((o.metadata ->> 'size')::bigint, 0),
           o.metadata ->> 'mimetype'
    from storage.objects o
    where o.name is not null
      and o.name not like '%.emptyFolderPlaceholder'
    order by 1, 2;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Escribir
-- -----------------------------------------------------------------------------

create or replace function public.data_transfer_start()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.data_transfer_guard();
  delete from public.data_transfer_user_map where true;  -- pg_safeupdate pide WHERE
end;
$$;

-- Perfiles del origen → cuentas del destino, por correo. Quien importa
-- conserva la administración: el origen podría tenerle con otro rol, y
-- perderla aquí sería quedarse fuera antes de terminar.
create or replace function public.data_transfer_profiles(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  target uuid;
  me uuid := auth.uid();
  cols text;
  sets text;
  mapped integer := 0;
  missing jsonb := '[]'::jsonb;
begin
  perform public.data_transfer_guard();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('mapped', 0, 'missing', missing);
  end if;
  perform public.data_transfer_quiet();

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
           filter (where a.attname not in ('id', 'created_at'))
    into cols, sets
  from pg_attribute a
  where a.attrelid = 'public.profiles'::regclass
    and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and (p_rows -> 0) ? a.attname;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    select u.id into target
    from auth.users u
    where lower(u.email) = lower(r ->> 'email')
    limit 1;

    if target is null then
      missing := missing || to_jsonb(r ->> 'email');
      continue;
    end if;

    insert into public.data_transfer_user_map (source_id, target_id)
    values ((r ->> 'id')::uuid, target)
    on conflict (source_id) do update set target_id = excluded.target_id;

    r := jsonb_set(r, '{id}', to_jsonb(target));
    if target = me then
      r := r || jsonb_build_object('role', 'admin', 'is_active', true, 'access_role_id', null);
    end if;

    execute format(
      'insert into public.profiles (%1$s) select %1$s from jsonb_populate_record(null::public.profiles, $1) '
      'on conflict (id) do update set %2$s',
      cols, sets
    ) using r;
    mapped := mapped + 1;
  end loop;

  return jsonb_build_object('mapped', mapped, 'missing', missing);
end;
$$;

create or replace function public.data_transfer_wipe(p_table text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  rel regclass;
  n bigint;
begin
  perform public.data_transfer_guard();
  rel := public.data_transfer_table(p_table);
  if rel = 'public.profiles'::regclass then
    raise exception 'Los perfiles no se vacían: se emparejan por correo.';
  end if;
  perform public.data_transfer_quiet();

  execute format('delete from %s where true', rel);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.data_transfer_load(p_table text, p_rows jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  rel regclass;
  cols text;
  overriding text := '';
  n bigint;
begin
  perform public.data_transfer_guard();
  rel := public.data_transfer_table(p_table);
  if rel = 'public.profiles'::regclass then
    raise exception 'Los perfiles se cargan con data_transfer_profiles.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;
  perform public.data_transfer_quiet();

  -- Las columnas que existen en los dos lados. Las generadas se recalculan;
  -- las que el origen no tiene toman su valor por defecto.
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into cols
  from pg_attribute a
  where a.attrelid = rel
    and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and (p_rows -> 0) ? a.attname;

  if cols is null then
    return 0;
  end if;

  if exists (select 1 from pg_attribute a
             where a.attrelid = rel and a.attidentity = 'a' and not a.attisdropped) then
    overriding := 'overriding system value';
  end if;

  execute format(
    'insert into %1$s (%2$s) %3$s select %2$s from jsonb_populate_recordset(null::%1$s, $1) on conflict do nothing',
    rel, cols, overriding
  ) using p_rows;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Reparar las referencias
-- -----------------------------------------------------------------------------

create or replace function public.data_transfer_links()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.data_transfer_guard();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'table', t.relname,
             'name', c.conname,
             'references', c.confrelid::regclass::text)
           order by t.relname, c.conname)
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and not t.relispartition
      and t.relname <> 'data_transfer_user_map'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.data_transfer_repair(
  p_table text,
  p_constraint text,
  p_remap boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rel regclass;
  con record;
  cols text[];
  refcols text[];
  nullable boolean;
  cond text;
  remapped bigint := 0;
  nulled bigint := 0;
  deleted bigint := 0;
begin
  perform public.data_transfer_guard();
  rel := public.data_transfer_table(p_table);

  select c.conrelid, c.confrelid, c.conkey, c.confkey into con
  from pg_constraint c
  where c.conrelid = rel and c.conname = p_constraint and c.contype = 'f';
  if not found then
    return jsonb_build_object('remapped', 0, 'nulled', 0, 'deleted', 0);
  end if;

  select array_agg(a.attname::text order by k.i), bool_and(not a.attnotnull)
    into cols, nullable
  from unnest(con.conkey) with ordinality as k(attnum, i)
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum;

  select array_agg(a.attname::text order by k.i)
    into refcols
  from unnest(con.confkey) with ordinality as k(attnum, i)
  join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum;

  perform public.data_transfer_quiet();

  -- Autoría: el usuario del origen pasa a ser su cuenta en el destino.
  if p_remap
     and array_length(cols, 1) = 1
     and con.confrelid in (to_regclass('public.profiles'), to_regclass('auth.users'))
     and rel <> to_regclass('public.profiles') then
    execute format(
      'update %1$s t set %2$I = m.target_id from public.data_transfer_user_map m '
      'where t.%2$I = m.source_id and m.source_id <> m.target_id',
      rel, cols[1]);
    get diagnostics remapped = row_count;
  end if;

  -- Lo que apunta a nada.
  select string_agg(format('t.%I is not null', c), ' and ') into cond from unnest(cols) as c;
  cond := cond || format(
    ' and not exists (select 1 from %s r where %s)',
    con.confrelid::regclass,
    (select string_agg(format('r.%I = t.%I', refcols[i], cols[i]), ' and ')
       from generate_subscripts(cols, 1) as i));

  if nullable then
    execute format(
      'update %s t set %s where %s',
      rel,
      (select string_agg(format('%I = null', c), ', ') from unnest(cols) as c),
      cond);
    get diagnostics nulled = row_count;
  else
    execute format('delete from %s t where %s', rel, cond);
    get diagnostics deleted = row_count;
  end if;

  return jsonb_build_object('remapped', remapped, 'nulled', nulled, 'deleted', deleted);
end;
$$;

create or replace function public.data_transfer_finish()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  sequences integer := 0;
  mv record;
  views integer := 0;
begin
  perform public.data_transfer_guard();

  -- Las secuencias siguen donde las dejó el destino; sin esto, el próximo
  -- alta chocaría con un id que ya llegó del origen.
  for s in
    select seq.oid::regclass as seq, t.oid::regclass as tbl, a.attname as col
    from pg_class seq
    join pg_depend d on d.objid = seq.oid
                    and d.classid = 'pg_class'::regclass
                    and d.refclassid = 'pg_class'::regclass
                    and d.deptype in ('a', 'i')
    join pg_class t on t.oid = d.refobjid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
    where seq.relkind = 'S' and n.nspname = 'public'
  loop
    execute format(
      'select setval(%L, coalesce((select max(%I) from %s), 0) + 1, false)',
      s.seq, s.col, s.tbl);
    sequences := sequences + 1;
  end loop;

  for mv in select schemaname, matviewname from pg_matviews where schemaname = 'public'
  loop
    execute format('refresh materialized view %I.%I', mv.schemaname, mv.matviewname);
    views := views + 1;
  end loop;

  delete from public.data_transfer_user_map where true;  -- pg_safeupdate pide WHERE

  return jsonb_build_object('sequences', sequences, 'views', views);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Permisos
-- -----------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'data_transfer_guard()',
    'data_transfer_table(text)',
    'data_transfer_quiet()',
    'data_transfer_inventory()',
    'data_transfer_export(text, integer, integer)',
    'data_transfer_files()',
    'data_transfer_start()',
    'data_transfer_profiles(jsonb)',
    'data_transfer_wipe(text)',
    'data_transfer_load(text, jsonb)',
    'data_transfer_links()',
    'data_transfer_repair(text, text, boolean)',
    'data_transfer_finish()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
