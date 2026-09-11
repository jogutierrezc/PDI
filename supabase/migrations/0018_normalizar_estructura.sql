-- =============================================================================
-- PDI · 0018 · Normalizar la estructura: fusionar, no duplicar.
--
-- La 0017 trajo la estructura real del plan —21 áreas y 62 líneas, con códigos
-- 6.1.1 y 6.1.1.a— y la **añadió** junto a las 13 áreas de ejemplo que venían
-- del seed (AE-01, LA-1.1). Su `on conflict (pillar_id, name)` solo fusiona
-- cuando el nombre coincide carácter por carácter, y casi nunca coincide: el
-- seed decía "Cultura digital" y la estructura real dice "c. Educación
-- continua". Resultado: dos estructuras vivas en el mismo pilar, cada cosa
-- colgando de una, y ninguna pantalla capaz de decir cuál es la buena.
--
-- Esto no se arregla insertando mejor. Ya están creadas, y lo que cuelga de las
-- viejas —proyectos, indicadores, soportes, vínculos— no se puede tirar. Hace
-- falta **fusionarlas**: mover todo lo de la duplicada a la que se queda y
-- borrar la duplicada.
--
-- -----------------------------------------------------------------------------
-- 1. Por qué se propone y no se hace solo
--
-- Fusionar estructura es destructivo y no se puede deshacer con un `undo`. Dos
-- nombres parecidos pueden ser lo mismo escrito de dos formas ("Educación
-- continua" y "c. Educación continua") o dos cosas distintas que se parecen
-- ("Flexibilidad curricular" y "Flexibilidad administrativa"). Ninguna regla
-- automática acierta siempre con eso.
--
-- Así que la base **propone** —`v_structure_duplicates`— y una persona
-- confirma desde la intranet. La propuesta es deliberadamente conservadora:
-- solo empareja nombres que son iguales una vez normalizados, o donde uno
-- contiene al otro y el corto tiene sustancia suficiente para no ser una
-- coincidencia de una palabra común.
--
-- -----------------------------------------------------------------------------
-- 2. Cuál se queda
--
-- La que tiene código de la estructura real (`6.1.1`, `6.1.1.a`). No es una
-- preferencia estética: es la que referencian las cargas de campus y el
-- anclaje de las facultades, y la que sale en los informes. Si ninguna de las
-- dos lo tiene, se queda la que más cosas sostiene, porque mover menos filas
-- es siempre menos riesgo.
--
-- -----------------------------------------------------------------------------
-- 3. Mover significa mover todo
--
-- De un área cuelgan seis cosas y de una línea siete. Están enumeradas en las
-- funciones de abajo, una por una y con su nombre, en vez de resueltas con un
-- bucle sobre el catálogo: cuando mañana alguien añada una tabla que apunte a
-- `action_lines`, este archivo es el sitio donde hay que acordarse, y un bucle
-- lo habría escondido.
--
-- Dos cuidados que no son evidentes:
--
--   · `campus_facts.action_line_id` y `campus_indicators.action_line_id` son
--     NOT NULL con `on delete restrict`. Repuntarlas antes de borrar no es una
--     cortesía: si no, el borrado falla.
--   · `project_links` tiene un UNIQUE por (proyecto, pilar, área, línea).
--     Repuntar puede crear un duplicado exacto de un vínculo que ya existe, y
--     entonces lo que toca es borrar el que sobra, no fallar.
--
-- Es idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La llave de comparación
--
-- Sin acentos, sin mayúsculas, sin puntuación y sin el ordinal con el que la
-- estructura real numera sus líneas ("a. Mecanismos de escucha" → "mecanismos
-- de escucha"). `translate` en vez de `unaccent` para no depender de una
-- extensión que puede no estar instalada en el proyecto.
-- -----------------------------------------------------------------------------

create or replace function public.structure_key(value text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          -- El ordinal de la estructura real: "a. ", "12. ", "b) ".
          regexp_replace(
            lower(translate(coalesce(value, ''),
              'ÁÀÄÂÃÅáàäâãåÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç',
              'aaaaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuunncc')),
            '^\s*[a-z0-9]{1,3}\s*[.)-]\s*', ''),
          -- Cualquier cosa que no sea letra, número o espacio.
          '[^a-z0-9 ]+', ' ', 'g'),
        -- Espacios repetidos.
        '\s+', ' ', 'g')
    ),
  '');
$$;

comment on function public.structure_key(text) is
  'Nombre reducido a su forma comparable: sin acentos, sin puntuación y sin el ordinal de la estructura real. Es la llave con la que se detectan duplicados.';

-- -----------------------------------------------------------------------------
-- 2. Cuánto sostiene cada fila
--
-- Se usa para decidir cuál se queda cuando ninguna tiene código real, y para
-- que la pantalla pueda decir "esta fusión mueve 14 filas" antes de hacerla.
-- -----------------------------------------------------------------------------

create or replace function public.area_dependents(target uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*) from public.action_lines      where area_id = target) +
    (select count(*) from public.documents         where area_id = target) +
    (select count(*) from public.project_links     where area_id = target) +
    (select count(*) from public.faculty_actions   where area_id = target) +
    (select count(*) from public.campus_facts      where area_id = target) +
    (select count(*) from public.campus_indicators where area_id = target)
  )::integer;
$$;

create or replace function public.line_dependents(target uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*) from public.projects          where action_line_id = target) +
    (select count(*) from public.activities        where action_line_id = target) +
    (select count(*) from public.documents         where action_line_id = target) +
    (select count(*) from public.project_links     where action_line_id = target) +
    (select count(*) from public.faculty_actions   where action_line_id = target) +
    (select count(*) from public.campus_facts      where action_line_id = target) +
    (select count(*) from public.campus_indicators where action_line_id = target)
  )::integer;
$$;

-- -----------------------------------------------------------------------------
-- 3. Qué parece duplicado
--
-- Dos criterios, y el segundo con freno:
--
--   · Misma llave normalizada. Es el caso seguro.
--   · Una llave contiene a la otra, y la corta tiene al menos 14 caracteres.
--     Sin ese mínimo, "gestión" emparejaría media estructura.
--
-- Las áreas se comparan dentro del mismo pilar y las líneas dentro del mismo
-- pilar (no del mismo área: el duplicado suele estar en otra área, que es
-- justamente el área duplicada).
-- -----------------------------------------------------------------------------

drop view if exists public.v_structure_duplicates cascade;

create view public.v_structure_duplicates
with (security_invoker = on) as
with areas as (
  select a.id, a.pillar_id, a.code, a.name, public.structure_key(a.name) as k,
         -- La estructura real numera con puntos: 6.1.1. La de ejemplo, AE-01.
         (a.code ~ '^\d+(\.\d+)+$') as is_real,
         public.area_dependents(a.id) as dependents
  from public.strategic_areas a
),
lines as (
  select l.id, a.pillar_id, l.area_id, l.code, l.name, public.structure_key(l.name) as k,
         (l.code ~ '^\d+(\.\d+)+\.[a-z]$') as is_real,
         public.line_dependents(l.id) as dependents
  from public.action_lines l
  join public.strategic_areas a on a.id = l.area_id
),
pares as (
  select 'area'::text as kind, x.pillar_id,
         x.id as a_id, x.code as a_code, x.name as a_name, x.is_real as a_real, x.dependents as a_dep,
         y.id as b_id, y.code as b_code, y.name as b_name, y.is_real as b_real, y.dependents as b_dep
  from areas x
  join areas y
    on y.pillar_id = x.pillar_id
   and y.id <> x.id
   and x.k is not null and y.k is not null
   and (x.k = y.k
        or (length(least(x.k, y.k)) >= 14
            and (x.k like '%' || y.k || '%' or y.k like '%' || x.k || '%')))
  union all
  select 'line'::text as kind, x.pillar_id,
         x.id, x.code, x.name, x.is_real, x.dependents,
         y.id, y.code, y.name, y.is_real, y.dependents
  from lines x
  join lines y
    on y.pillar_id = x.pillar_id
   and y.id <> x.id
   and x.k is not null and y.k is not null
   and (x.k = y.k
        or (length(least(x.k, y.k)) >= 14
            and (x.k like '%' || y.k || '%' or y.k like '%' || x.k || '%')))
)
select
  kind,
  pillar_id,
  -- Cuál se queda: la del código real; y si empatan, la que más sostiene.
  case when a_real and not b_real then a_id
       when b_real and not a_real then b_id
       when a_dep >= b_dep        then a_id
       else b_id end as keep_id,
  case when a_real and not b_real then b_id
       when b_real and not a_real then a_id
       when a_dep >= b_dep        then b_id
       else a_id end as drop_id,
  case when a_real and not b_real then a_code
       when b_real and not a_real then b_code
       when a_dep >= b_dep        then a_code
       else b_code end as keep_code,
  case when a_real and not b_real then a_name
       when b_real and not a_real then b_name
       when a_dep >= b_dep        then a_name
       else b_name end as keep_name,
  case when a_real and not b_real then b_code
       when b_real and not a_real then a_code
       when a_dep >= b_dep        then b_code
       else a_code end as drop_code,
  case when a_real and not b_real then b_name
       when b_real and not a_real then a_name
       when a_dep >= b_dep        then b_name
       else a_name end as drop_name,
  case when a_real and not b_real then b_dep
       when b_real and not a_real then a_dep
       when a_dep >= b_dep        then b_dep
       else a_dep end as moves,
  -- Exacta o inferida. La pantalla marca las inferidas: son las que hay que
  -- mirar dos veces antes de confirmar.
  (public.structure_key(a_name) = public.structure_key(b_name)) as is_exact
from pares
-- El join produce cada pareja dos veces (x,y) y (y,x). Se queda una.
where a_id < b_id;

comment on view public.v_structure_duplicates is
  'Parejas de áreas o líneas que parecen la misma cosa escrita de dos formas, con cuál conviene conservar y cuántas filas movería la fusión. Propone; no cambia nada.';

grant select on public.v_structure_duplicates to authenticated;
revoke all on public.v_structure_duplicates from anon;

-- -----------------------------------------------------------------------------
-- 3b. Lo que queda suelto
--
-- Fusionar resuelve los pares. Lo que no tiene par es el otro problema: un área
-- del seed como "Seguridad y continuidad" no se parece a nada de la estructura
-- real, así que sobrevive a la normalización y sigue ahí, con su código AE-04 y
-- con lo que le colgara.
--
-- No se borra: puede estar sosteniendo un proyecto o un indicador de verdad, y
-- adivinar a qué línea real pertenece es exactamente lo que una máquina no
-- debe hacer. Se lista para que alguien lo mire y decida —moverlo a mano o
-- borrarlo si estaba de ejemplo—, que es la diferencia entre una estructura
-- limpia y una estructura mutilada.
-- -----------------------------------------------------------------------------

drop view if exists public.v_structure_orphans cascade;

create view public.v_structure_orphans
with (security_invoker = on) as
select
  'area'::text                as kind,
  a.id,
  a.pillar_id,
  p.numeral                   as pillar_numeral,
  p.name                      as pillar_name,
  a.code,
  a.name,
  public.area_dependents(a.id) as dependents
from public.strategic_areas a
join public.pillars p on p.id = a.pillar_id
where a.code is null or a.code !~ '^\d+(\.\d+)+$'
union all
select
  'line'::text                as kind,
  l.id,
  a.pillar_id,
  p.numeral,
  p.name,
  l.code,
  l.name,
  public.line_dependents(l.id)
from public.action_lines l
join public.strategic_areas a on a.id = l.area_id
join public.pillars p on p.id = a.pillar_id
where l.code is null or l.code !~ '^\d+(\.\d+)+\.[a-z]$';

comment on view public.v_structure_orphans is
  'Áreas y líneas que no tienen código de la estructura real y no emparejaron con ninguna. Se listan para decidirlas a mano: nunca se borran solas.';

grant select on public.v_structure_orphans to authenticated;
revoke all on public.v_structure_orphans from anon;

-- -----------------------------------------------------------------------------
-- 4. Fusionar una línea
-- -----------------------------------------------------------------------------

create or replace function public.merge_action_lines(keep_id uuid, drop_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  movidas integer := 0;
  n integer;
begin
  if not public.has_role_at_least('planeacion') then
    raise exception 'Hace falta rol de planeación para fusionar la estructura.';
  end if;
  if keep_id = drop_id then
    raise exception 'No se puede fusionar una línea consigo misma.';
  end if;
  if not exists (select 1 from public.action_lines where id = keep_id)
     or not exists (select 1 from public.action_lines where id = drop_id) then
    raise exception 'Una de las dos líneas ya no existe.';
  end if;

  -- `project_links` tiene un UNIQUE por proyecto+pilar+área+línea: si repuntar
  -- crearía un vínculo que ya existe, el que sobra se borra en vez de fallar.
  delete from public.project_links dup
  where dup.action_line_id = drop_id
    and exists (
      select 1 from public.project_links keep
      where keep.project_id = dup.project_id
        and keep.action_line_id = keep_id
    );

  update public.project_links set action_line_id = keep_id where action_line_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  update public.projects set action_line_id = keep_id where action_line_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  update public.activities set action_line_id = keep_id where action_line_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  update public.documents set action_line_id = keep_id where action_line_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  update public.faculty_actions set action_line_id = keep_id where action_line_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  -- Estas dos son NOT NULL con `on delete restrict`: sin repuntarlas, el
  -- borrado de abajo falla.
  update public.campus_facts set action_line_id = keep_id where action_line_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  update public.campus_indicators set action_line_id = keep_id where action_line_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  delete from public.action_lines where id = drop_id;
  return movidas;
end;
$$;

comment on function public.merge_action_lines(uuid, uuid) is
  'Mueve todo lo que cuelga de la segunda línea a la primera y borra la segunda. Devuelve cuántas filas movió.';

-- -----------------------------------------------------------------------------
-- 5. Fusionar un área
--
-- Sus líneas se mudan al área que se queda, y las que allí ya existan con el
-- mismo nombre se fusionan entre sí antes de mudarse: si no, el área buena
-- acabaría con dos líneas iguales y el problema se habría movido de sitio.
-- -----------------------------------------------------------------------------

create or replace function public.merge_strategic_areas(keep_id uuid, drop_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  movidas integer := 0;
  n integer;
  gemela uuid;
  linea record;
begin
  if not public.has_role_at_least('planeacion') then
    raise exception 'Hace falta rol de planeación para fusionar la estructura.';
  end if;
  if keep_id = drop_id then
    raise exception 'No se puede fusionar un área consigo misma.';
  end if;
  if not exists (select 1 from public.strategic_areas where id = keep_id)
     or not exists (select 1 from public.strategic_areas where id = drop_id) then
    raise exception 'Una de las dos áreas ya no existe.';
  end if;

  for linea in
    select id, name from public.action_lines where area_id = drop_id
  loop
    select l.id into gemela
    from public.action_lines l
    where l.area_id = keep_id
      and public.structure_key(l.name) = public.structure_key(linea.name)
    limit 1;

    if gemela is not null then
      movidas := movidas + public.merge_action_lines(gemela, linea.id);
    else
      update public.action_lines set area_id = keep_id where id = linea.id;
      movidas := movidas + 1;
    end if;

    gemela := null;
  end loop;

  delete from public.project_links dup
  where dup.area_id = drop_id
    and exists (
      select 1 from public.project_links keep
      where keep.project_id = dup.project_id
        and keep.area_id = keep_id
        and keep.action_line_id is not distinct from dup.action_line_id
    );

  update public.project_links set area_id = keep_id where area_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  update public.documents set area_id = keep_id where area_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  update public.faculty_actions set area_id = keep_id where area_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  update public.campus_facts set area_id = keep_id where area_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  update public.campus_indicators set area_id = keep_id where area_id = drop_id;
  get diagnostics n = row_count; movidas := movidas + n;

  delete from public.strategic_areas where id = drop_id;
  return movidas;
end;
$$;

comment on function public.merge_strategic_areas(uuid, uuid) is
  'Mueve las líneas y todo lo que cuelga de la segunda área a la primera y borra la segunda. Las líneas homónimas se fusionan entre sí en vez de duplicarse.';

-- -----------------------------------------------------------------------------
-- 6. Fusionar todo lo propuesto, de una vez
--
-- Es lo que llama el botón de la intranet. Va en una función y no en un bucle
-- en el cliente por dos razones: una tanda a medias dejaría la estructura peor
-- que al empezar, y cada fusión cambia lo que la vista propone —fusionar un
-- área puede resolver de paso dos líneas—, así que hay que recalcular.
--
-- Las áreas primero: fusionarlas resuelve sus líneas por el camino y deja menos
-- parejas de línea que atender.
-- -----------------------------------------------------------------------------

create or replace function public.normalize_structure(only_exact boolean default true)
returns table (kind text, keep_code text, drop_code text, moved integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  propuesta record;
  vuelta integer := 0;
begin
  if not public.has_role_at_least('planeacion') then
    raise exception 'Hace falta rol de planeación para normalizar la estructura.';
  end if;

  -- Se recalcula en cada vuelta porque una fusión cambia la lista. El tope
  -- evita un bucle infinito si dos filas se propusieran mutuamente para
  -- siempre por un fallo de la regla de similitud.
  loop
    vuelta := vuelta + 1;
    exit when vuelta > 200;

    select d.* into propuesta
    from public.v_structure_duplicates d
    where (not only_exact or d.is_exact)
    order by case when d.kind = 'area' then 0 else 1 end, d.moves
    limit 1;

    exit when not found;

    if propuesta.kind = 'area' then
      moved := public.merge_strategic_areas(propuesta.keep_id, propuesta.drop_id);
    else
      moved := public.merge_action_lines(propuesta.keep_id, propuesta.drop_id);
    end if;

    kind      := propuesta.kind;
    keep_code := propuesta.keep_code;
    drop_code := propuesta.drop_code;
    return next;
  end loop;
end;
$$;

comment on function public.normalize_structure(boolean) is
  'Aplica las fusiones que propone v_structure_duplicates y devuelve qué hizo. Con only_exact en falso incluye también las parejas inferidas por parecido.';

-- -----------------------------------------------------------------------------
-- 7. Retirar lo que quedó suelto y no sostiene nada
--
-- Mirando los nombres de verdad, la mayoría de lo que sobra no es un duplicado:
-- son las 13 áreas de ejemplo del seed, de las que solo dos tienen equivalente
-- en la estructura real ("Sostenibilidad financiera" y "Flexibilidad
-- curricular"). Las otras once nunca existieron en el plan —"Seguridad y
-- continuidad", "Divulgación científica"— y fusionarlas con algo sería
-- inventarse una correspondencia.
--
-- Lo que toca con ellas es retirarlas. Pero solo si están vacías: en cuanto
-- sostienen un proyecto, un indicador o un soporte, dejan de ser un resto de
-- ejemplo y borrarlas se llevaría datos por delante. Por eso la función cuenta
-- antes y se niega con un mensaje que dice cuántas filas lo impiden, en vez de
-- borrar en cascada.
-- -----------------------------------------------------------------------------

create or replace function public.drop_structure_orphan(kind text, target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  colgando integer;
begin
  if not public.has_role_at_least('planeacion') then
    raise exception 'Hace falta rol de planeación para retirar estructura.';
  end if;

  if kind = 'area' then
    colgando := public.area_dependents(target);
    if colgando > 0 then
      raise exception
        'Esta área sostiene % fila(s): líneas, proyectos, soportes o reportes. Muévelos antes de retirarla.',
        colgando;
    end if;
    delete from public.strategic_areas where id = target;

  elsif kind = 'line' then
    colgando := public.line_dependents(target);
    if colgando > 0 then
      raise exception
        'Esta línea sostiene % fila(s). Muévelas antes de retirarla.',
        colgando;
    end if;
    delete from public.action_lines where id = target;

  else
    raise exception 'Tipo desconocido: %. Solo "area" o "line".', kind;
  end if;
end;
$$;

comment on function public.drop_structure_orphan(text, uuid) is
  'Retira un área o una línea que no sostiene nada. Se niega —con la cuenta— si algo cuelga de ella: borrar estructura con datos no puede ser un clic.';

/**
 * Retirar de una vez todo lo vacío. Es el segundo botón de la pantalla, y el
 * que de verdad limpia: las líneas primero, porque vaciarlas puede dejar su
 * área vacía y entonces también se puede retirar en la misma pasada.
 */
create or replace function public.drop_empty_structure()
returns table (kind text, code text, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  fila record;
begin
  if not public.has_role_at_least('planeacion') then
    raise exception 'Hace falta rol de planeación para retirar estructura.';
  end if;

  for fila in
    select o.kind, o.id, o.code, o.name
    from public.v_structure_orphans o
    where o.kind = 'line' and o.dependents = 0
  loop
    delete from public.action_lines where id = fila.id;
    kind := fila.kind; code := fila.code; name := fila.name;
    return next;
  end loop;

  for fila in
    select o.kind, o.id, o.code, o.name
    from public.v_structure_orphans o
    where o.kind = 'area' and o.dependents = 0
  loop
    delete from public.strategic_areas where id = fila.id;
    kind := fila.kind; code := fila.code; name := fila.name;
    return next;
  end loop;
end;
$$;

comment on function public.drop_empty_structure() is
  'Retira todas las áreas y líneas sin código real que no sostienen nada. Las líneas primero: vaciarlas puede dejar su área retirable en la misma pasada.';

revoke all on function public.drop_structure_orphan(text, uuid) from anon;
revoke all on function public.drop_empty_structure()            from anon;
grant execute on function public.drop_structure_orphan(text, uuid) to authenticated;
grant execute on function public.drop_empty_structure()            to authenticated;

revoke all on function public.merge_action_lines(uuid, uuid)     from anon;
revoke all on function public.merge_strategic_areas(uuid, uuid)  from anon;
revoke all on function public.normalize_structure(boolean)       from anon;

grant execute on function public.merge_action_lines(uuid, uuid)    to authenticated;
grant execute on function public.merge_strategic_areas(uuid, uuid) to authenticated;
grant execute on function public.normalize_structure(boolean)      to authenticated;

notify pgrst, 'reload schema';
