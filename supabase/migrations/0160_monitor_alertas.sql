-- =============================================================================
-- 0160 · Monitor de alertas tempranas
--
-- El portal donde decanaturas y direcciones de programa ven cómo van las notas
-- de sus estudiantes (global, facultad, programa, grupo y estudiante). Lee las
-- notas que el Warehouse guarda («dv_notas», 0157) y las clasifica en Nivel
-- Esperado (NE), En Desarrollo (ED) y Requiere Seguimiento (RS).
--
-- Quién ve qué NO lo decide una clave: lo deciden los roles y las unidades que
-- ya asigna Planeación.
--   · Planeación y la administración ven todo.
--   · Quien pertenece a una facultad o a un programa (unit_members, 0057) ve lo
--     de esa unidad y de las que cuelgan de ella (unit_can_view: una decanatura
--     ve sus programas; una dirección, solo el suyo).
--   · Planeación necesita además la pantalla «monitor» de su rol de acceso (has_screen); a quien
--     pertenece a una unidad le basta la pertenencia, como en Informes y Mis Tableros.
--
-- Davinci conoce los programas por un código interno («115», «037») que no es
-- el SNIES ni el de la unidad. wh_programas_unidad dice a qué unidad del
-- organigrama corresponde cada código; Planeación la completa una vez (con una
-- sugerencia automática por nombre) y de ahí sale la facultad de cada programa.
-- Un programa sin unidad solo lo ve Planeación.
--
-- Las funciones devuelven lo que quien pregunta puede ver y nada más; ninguna
-- trae nombres de estudiantes (no se guardan): solo el código seudónimo.
--
-- Requiere 0057 (units, unit_can_view), 0155–0159 (Warehouse). Idempotente.
-- =============================================================================

create table if not exists public.wh_programas_unidad (
  codigo_programa text primary key,
  nombre          text not null default '',
  unit_id         uuid references public.units (id) on delete set null,
  asignado_por    uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now()
);

comment on table public.wh_programas_unidad is
  'Monitor: a qué unidad (programa) del organigrama corresponde cada código de programa de Davinci.';

alter table public.wh_programas_unidad enable row level security;
revoke all on public.wh_programas_unidad from anon, authenticated;

-- Normaliza un nombre de programa para compararlo: mayúsculas, sin tildes ni espacios de más.
create or replace function public.wh_norm_nombre(p text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(translate(upper(coalesce(p, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\s+', ' ', 'g'));
$$;

-- ¿Puede esta persona abrir el Monitor?
create or replace function public.wh_monitor_puede()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (public.has_role_at_least('planeacion') and public.has_screen('monitor'))
      or (
        -- Pertenecer a una facultad o a un programa es el permiso: así se asigna, como en Informes y Mis Tableros.
        public.current_role() is not null
        and exists (select 1 from public.wh_programas_unidad p where p.unit_id is not null and public.unit_can_view(p.unit_id))
      );
$$;

-- Los códigos de programa que esta persona puede ver; null = todos (Planeación).
create or replace function public.wh_monitor_codigos()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
           when public.has_role_at_least('planeacion') then null
           else coalesce((select array_agg(p.codigo_programa) from public.wh_programas_unidad p where p.unit_id is not null and public.unit_can_view(p.unit_id)), '{}')
         end;
$$;

revoke all on function public.wh_monitor_codigos() from public, anon;
revoke all on function public.wh_monitor_puede() from public, anon;
grant execute on function public.wh_monitor_puede() to authenticated;
grant execute on function public.wh_monitor_codigos() to authenticated;

-- La carga vigente de notas de un periodo y sede.
create or replace function public.wh_monitor_carga(p_periodo text, p_sede text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
    from public.wh_cargas c
   where c.conjunto = 'dv_notas' and c.periodo = p_periodo and c.sede = p_sede and c.estado = 'guardada'
   order by c.version desc
   limit 1;
$$;

revoke all on function public.wh_monitor_carga(text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Lectura del Monitor
-- -----------------------------------------------------------------------------

create or replace function public.wh_monitor_resumen(p_periodo text, p_sede text, p_aprueba numeric default 3.0, p_aprueba_medicina numeric default 3.5)
returns table (
  estudiante text,
  codigo_programa text,
  programa text,
  materias int,
  con_p1 int, con_p2 int, con_p3 int,
  prom_p1 numeric, prom_p2 numeric, prom_p3 numeric,
  riesgo_p1 int, riesgo_p2 int, riesgo_p3 int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  carga uuid;
  visibles text[];
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  visibles := public.wh_monitor_codigos();
  return query
    with n as (
      select f.datos->>'codigo_estudiante' as est,
             f.datos->>'codigo_programa'   as cod,
             f.datos->>'nombre_programa'   as prog,
             public.wh_num(f.datos->>'p1') as p1,
             public.wh_num(f.datos->>'p2') as p2,
             public.wh_num(f.datos->>'p3') as p3,
             public.wh_nota_aprueba(f.datos->>'nombre_programa', p_aprueba, p_aprueba_medicina) as apr
        from public.wh_filas f
       where f.carga_id = carga
         and (visibles is null or f.datos->>'codigo_programa' = any (visibles))
    )
    select n.est, n.cod, min(n.prog), count(*)::int,
           count(n.p1)::int, count(n.p2)::int, count(n.p3)::int,
           round(avg(n.p1), 2), round(avg(n.p2), 2), round(avg(n.p3), 2),
           (count(*) filter (where n.p1 < n.apr))::int,
           (count(*) filter (where n.p2 < n.apr))::int,
           (count(*) filter (where n.p3 < n.apr))::int
      from n
     group by n.est, n.cod;
end;
$$;

create or replace function public.wh_monitor_grupos(p_periodo text, p_sede text, p_aprueba numeric default 3.0, p_aprueba_medicina numeric default 3.5)
returns table (
  codigo_programa text,
  codigo_materia text,
  materia text,
  grupo text,
  estudiantes int,
  con_p1 int, con_p2 int, con_p3 int,
  prom_p1 numeric, prom_p2 numeric, prom_p3 numeric,
  bajo_p1 int, bajo_p2 int, bajo_p3 int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  carga uuid;
  visibles text[];
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  visibles := public.wh_monitor_codigos();
  return query
    with n as (
      select f.datos->>'codigo_programa' as cod,
             f.datos->>'codigo_materia'  as cm,
             f.datos->>'nombre_materia'  as mat,
             f.datos->>'grupo'           as gr,
             public.wh_num(f.datos->>'p1') as p1,
             public.wh_num(f.datos->>'p2') as p2,
             public.wh_num(f.datos->>'p3') as p3,
             public.wh_nota_aprueba(f.datos->>'nombre_programa', p_aprueba, p_aprueba_medicina) as apr
        from public.wh_filas f
       where f.carga_id = carga
         and (visibles is null or f.datos->>'codigo_programa' = any (visibles))
    )
    select n.cod, n.cm, min(n.mat), n.gr, count(*)::int,
           count(n.p1)::int, count(n.p2)::int, count(n.p3)::int,
           round(avg(n.p1), 2), round(avg(n.p2), 2), round(avg(n.p3), 2),
           (count(*) filter (where n.p1 < n.apr))::int,
           (count(*) filter (where n.p2 < n.apr))::int,
           (count(*) filter (where n.p3 < n.apr))::int
      from n
     group by n.cod, n.cm, n.gr;
end;
$$;

-- Las notas de un estudiante (por su código seudónimo), materia por materia.
create or replace function public.wh_monitor_estudiante(p_periodo text, p_sede text, p_estudiante text)
returns table (codigo_programa text, programa text, codigo_materia text, materia text, grupo text, p1 numeric, p2 numeric, p3 numeric, nota_acumulada numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  carga uuid;
  visibles text[];
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  visibles := public.wh_monitor_codigos();
  return query
    select f.datos->>'codigo_programa', f.datos->>'nombre_programa', f.datos->>'codigo_materia', f.datos->>'nombre_materia', f.datos->>'grupo',
           public.wh_num(f.datos->>'p1'), public.wh_num(f.datos->>'p2'), public.wh_num(f.datos->>'p3'), public.wh_num(f.datos->>'nota_acumulada')
      from public.wh_filas f
     where f.carga_id = carga
       and f.datos->>'codigo_estudiante' = p_estudiante
       and (visibles is null or f.datos->>'codigo_programa' = any (visibles))
     order by f.datos->>'nombre_materia';
end;
$$;

-- Los estudiantes de un grupo (una materia y su grupo) con sus notas por corte, por código seudónimo.
create or replace function public.wh_monitor_grupo_estudiantes(p_periodo text, p_sede text, p_codigo_materia text, p_grupo text)
returns table (estudiante text, codigo_programa text, programa text, p1 numeric, p2 numeric, p3 numeric, nota_acumulada numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  carga uuid;
  visibles text[];
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  visibles := public.wh_monitor_codigos();
  return query
    select f.datos->>'codigo_estudiante', f.datos->>'codigo_programa', f.datos->>'nombre_programa',
           public.wh_num(f.datos->>'p1'), public.wh_num(f.datos->>'p2'), public.wh_num(f.datos->>'p3'), public.wh_num(f.datos->>'nota_acumulada')
      from public.wh_filas f
     where f.carga_id = carga
       and f.datos->>'codigo_materia' = p_codigo_materia
       and f.datos->>'grupo' = p_grupo
       and (visibles is null or f.datos->>'codigo_programa' = any (visibles))
     order by f.datos->>'codigo_estudiante';
end;
$$;

-- El organigrama de lo que se ve: cada código de programa con su unidad y su facultad.
-- Planeación ve además los códigos de las notas que aún no tienen unidad, para asignarlos.
create or replace function public.wh_monitor_mapa(p_periodo text, p_sede text)
returns table (codigo_programa text, nombre text, unit_id uuid, unidad text, facultad_id uuid, facultad text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  visibles text[];
  carga uuid;
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  visibles := public.wh_monitor_codigos();
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  return query
    with codigos as (
      select f.datos->>'codigo_programa' as cod, min(f.datos->>'nombre_programa') as nom
        from public.wh_filas f
       where f.carga_id = carga
       group by f.datos->>'codigo_programa'
    )
    select c.cod,
           coalesce(nullif(m.nombre, ''), c.nom, ''),
           m.unit_id,
           u.name,
           fac.id,
           fac.name
      from codigos c
      left join public.wh_programas_unidad m on m.codigo_programa = c.cod
      left join public.units u on u.id = m.unit_id
      left join public.units fac on fac.id = u.parent_id and fac.kind = 'facultad'
     where visibles is null or c.cod = any (visibles);
end;
$$;

-- -----------------------------------------------------------------------------
-- Asignar programas a unidades (Planeación)
-- -----------------------------------------------------------------------------

create or replace function public.wh_monitor_asignar(p_codigo text, p_nombre text, p_unit uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_screen('monitor') and public.has_role_at_least('planeacion')) then
    raise exception 'monitor: la asignación de programas es de Planeación' using errcode = '42501';
  end if;
  if p_unit is not null and not exists (select 1 from public.units where id = p_unit and kind = 'programa') then
    raise exception 'unidad_invalida: la unidad debe ser un programa del organigrama' using errcode = 'P0001';
  end if;
  insert into public.wh_programas_unidad (codigo_programa, nombre, unit_id, asignado_por, updated_at)
  values (p_codigo, coalesce(p_nombre, ''), p_unit, auth.uid(), now())
  on conflict (codigo_programa) do update
    set unit_id = excluded.unit_id, nombre = excluded.nombre, asignado_por = auth.uid(), updated_at = now();
end;
$$;

-- Sugiere la unidad de cada código nuevo comparando nombres (sin tildes ni mayúsculas); deja sin tocar lo ya asignado.
create or replace function public.wh_monitor_autoasignar(p_periodo text, p_sede text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  carga uuid;
  total int;
begin
  if not (public.has_screen('monitor') and public.has_role_at_least('planeacion')) then
    raise exception 'monitor: la asignación de programas es de Planeación' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  with codigos as (
    select f.datos->>'codigo_programa' as cod, min(f.datos->>'nombre_programa') as nom
      from public.wh_filas f
     where f.carga_id = carga
     group by f.datos->>'codigo_programa'
  ),
  candidatos as (
    select c.cod, c.nom, (array_agg(u.id))[1] as unidad, count(*) as n
      from codigos c
      join public.units u on u.kind = 'programa' and public.wh_norm_nombre(u.name) = public.wh_norm_nombre(c.nom)
     where not exists (select 1 from public.wh_programas_unidad m where m.codigo_programa = c.cod and m.unit_id is not null)
     group by c.cod, c.nom
  ),
  hechos as (
    insert into public.wh_programas_unidad (codigo_programa, nombre, unit_id, asignado_por)
    select cod, nom, unidad, auth.uid() from candidatos where n = 1
    on conflict (codigo_programa) do update set unit_id = excluded.unit_id, nombre = excluded.nombre, asignado_por = auth.uid(), updated_at = now()
    returning 1
  )
  select count(*) into total from hechos;
  return total;
end;
$$;

revoke all on function public.wh_monitor_resumen(text, text, numeric, numeric) from public, anon;
revoke all on function public.wh_monitor_grupos(text, text, numeric, numeric) from public, anon;
revoke all on function public.wh_monitor_estudiante(text, text, text) from public, anon;
revoke all on function public.wh_monitor_grupo_estudiantes(text, text, text, text) from public, anon;
grant execute on function public.wh_monitor_grupo_estudiantes(text, text, text, text) to authenticated;
revoke all on function public.wh_monitor_mapa(text, text) from public, anon;
revoke all on function public.wh_monitor_asignar(text, text, uuid) from public, anon;
revoke all on function public.wh_monitor_autoasignar(text, text) from public, anon;
grant execute on function public.wh_monitor_resumen(text, text, numeric, numeric) to authenticated;
grant execute on function public.wh_monitor_grupos(text, text, numeric, numeric) to authenticated;
grant execute on function public.wh_monitor_estudiante(text, text, text) to authenticated;
grant execute on function public.wh_monitor_mapa(text, text) to authenticated;
grant execute on function public.wh_monitor_asignar(text, text, uuid) to authenticated;
grant execute on function public.wh_monitor_autoasignar(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- La pantalla «monitor» en los roles hechos a mano
--
-- `screens` es una lista libre; los roles de fábrica llevan all_screens. Se
-- añade a los roles a mano que ya veían el Warehouse o los informes (patrón de
-- 0153). Quien pertenece a una facultad o programa la ve de todos modos en el
-- portal; la base, además, exige la pertenencia (wh_monitor_puede).
-- -----------------------------------------------------------------------------

update public.access_roles
   set screens = array_append(screens, 'monitor')
 where not all_screens
   and not ('monitor' = any (screens))
   and screens && array['warehouse', 'informes']::text[];

notify pgrst, 'reload schema';
