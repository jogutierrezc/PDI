-- =============================================================================
-- 0173 · Mr. Pilo: UNA sola memoria para UN solo Pilo (Planeación y Enseñanza
--        como dos hemisferios del mismo cerebro).
--
-- Hasta 0122 cada portal era una vista con su matriz «casa / visita / no» y el
-- conocimiento de otro ámbito entraba solo «de visita». Resultado: el Pilo
-- incrustado en udes.edu.co (portal de Planeación) no sabía responder lo de
-- Enseñanza. Desde aquí la memoria se lee UNIFICADA, y quien decide qué se lee
-- es QUIÉN pregunta, no el portal:
--
--   · «oculto» nunca.
--   · «con sesión» y las fuentes que piden sesión (Impacto): solo el personal de
--     la intranet (una cuenta de Pilo nunca cuenta como personal).
--   · Lo que no sale de su portal (Moodle): solo desde su portal.
--   · El público (sin sesión, o con cuenta de Pilo): solo lo marcado PÚBLICO y,
--     además, APROBADO por la administración (ver «aprobación pública»).
--   · Una fuente apagada en su portal de casa (la celda de su matriz) está
--     apagada para todos.
--
-- Los portales siguen existiendo para el tono, la voz, el saludo, las reglas de
-- uso y la matriz de encendido; la celda «visita» deja de usarse para buscar.
--
-- APROBACIÓN PÚBLICA (entrega 2):
--   pilo_sources.public_ok   interruptor por fuente: la administración aprobó que
--                            el público la lea. Nace en true para lo que ya
--                            estaba encendido (así no cambia lo que hoy se ve),
--                            en false para toda fuente nueva, y pasa a true
--                            cuando la administración enciende una fuente en su
--                            portal de casa.
--   pilo_sources.deep_ok     que los pasajes NUEVOS de la capa profunda de esa
--                            fuente nazcan aprobados (false de partida).
--   pilo_memory.approved     aprobación del pasaje. Lo de siempre nace aprobado;
--                            lo que entra por los lectores profundos nace según
--                            deep_ok (de partida, SIN aprobar).
--   pilo_memory.layer        «base» (lo de siempre) o «profunda» (lectores
--                            directos de la base de datos del portal).
--   pilo_source_approve(fuente, sí/no) y pilo_sources_overview()
--                            lo que usa la administración: por fuente, cuántos
--                            pasajes, cuántos públicos aprobados y el interruptor.
--
-- CAPA PROFUNDA (entrega 4): pilo_deep_save / pilo_deep_prune guardan por lotes y
-- de forma idempotente los pasajes que arman los lectores; «Actualizar la
-- memoria» (pilo_memory_replace) ya no toca la capa profunda.
--
-- SALUDOS (entrega 3): pilo_greetings, editable por la administración, y
-- pilo_greetings_public(espacio), que lee cualquiera (sin cifras).
--
-- Cambian (se BORRA la firma y se crea la misma, con columnas de procedencia de
-- más; todo parámetro nuevo tiene valor de partida, así la función pilo-ia
-- desplegada antes de esta migración sigue llamando igual):
--   pilo_scope                  una fila por fuente que quien pregunta puede leer
--                               (mode siempre «casa»; + needs_ok)
--   pilo_memory_search, pilo_memory_semantic, pilo_memory_readable,
--   pilo_graph_neighbors        + space, layer (procedencia)
--   pilo_graph_around, pilo_answer_candidates   sin cambio de firma
-- y se crea pilo_memory_find: la búsqueda unificada (palabras + significado) con
-- puntaje fundido y procedencia.
--
-- Todo DELETE y UPDATE lleva WHERE (safeupdate, ver 0095). Requiere 0121–0127.
-- Idempotente. Sin pgvector (PGlite) la parte semántica se omite sin fallar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columnas.
-- -----------------------------------------------------------------------------

alter table public.pilo_memory add column if not exists layer text not null default 'base';
alter table public.pilo_memory add column if not exists approved boolean not null default true;
alter table public.pilo_memory add column if not exists seen_at timestamptz;

alter table public.pilo_memory drop constraint if exists pilo_memory_layer;
alter table public.pilo_memory add constraint pilo_memory_layer check (layer in ('base', 'profunda'));

create index if not exists pilo_memory_layer_idx on public.pilo_memory (source, layer);

comment on column public.pilo_memory.layer is
  '«base»: lo que arma «Actualizar la memoria» desde las páginas. «profunda»: lo que arman los lectores directos desde las tablas del portal (0173).';
comment on column public.pilo_memory.approved is
  'La administración aprobó que el público lea este pasaje (0173). Solo importa para quien no es personal con sesión.';

-- La aprobación por fuente. El valor de partida solo se siembra cuando la columna
-- nace (no se vuelve a pisar si la migración se aplica otra vez).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pilo_sources' and column_name = 'public_ok'
  ) then
    alter table public.pilo_sources add column public_ok boolean not null default false;
    update public.pilo_sources s
    set public_ok = true
    where exists (
      select 1 from public.pilo_portals h
      where h.scope = s.scope and coalesce(h.matrix ->> s.id, 'no') = 'casa'
    );
  end if;
end $$;

alter table public.pilo_sources add column if not exists deep_ok boolean not null default false;

comment on column public.pilo_sources.public_ok is
  'La administración aprobó que el público lea esta fuente (0173). Sin aprobar, solo la lee el personal con sesión.';
comment on column public.pilo_sources.deep_ok is
  'Los pasajes nuevos de la capa profunda de esta fuente nacen aprobados (0173).';

-- Encender una fuente en su portal de casa es aprobarla, como lo era hasta hoy.
create or replace function public.pilo_portals_approve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pilo_sources s
  set public_ok = true
  where coalesce(new.matrix ->> s.id, 'no') = 'casa'
    and coalesce(old.matrix ->> s.id, 'no') <> 'casa'
    and s.scope = new.scope
    and not s.public_ok;
  return new;
end;
$$;

revoke all on function public.pilo_portals_approve() from public, anon, authenticated;

drop trigger if exists pilo_portals_approve on public.pilo_portals;
create trigger pilo_portals_approve
  after update of matrix on public.pilo_portals
  for each row execute function public.pilo_portals_approve();

-- -----------------------------------------------------------------------------
-- El filtro, unificado. Una fila por fuente que esta persona puede leer, desde
-- cualquier portal. `mode` queda en «casa» (ya no hay lectura «de visita» para
-- el conocimiento); `needs_ok` dice que, además, el pasaje tiene que estar
-- aprobado (todo el que no es personal con sesión).
-- -----------------------------------------------------------------------------

drop function if exists public.pilo_scope(text, boolean, boolean);

create or replace function public.pilo_scope(
  p_portal text,
  p_session boolean default false,
  p_member boolean default false
)
returns table (source text, space text, mode text, vis text[], name text, needs_ok boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff boolean := coalesce(p_session, false) and not coalesce(p_member, false);
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la función de Pilo y la administración consultan qué lee cada portal.' using errcode = '42501';
  end if;
  return query
    select s.id, s.scope, 'casa'::text,
           case when v_staff then array['publico', 'sesion'] else array['publico'] end,
           s.name,
           not v_staff
    from public.pilo_portals p
    cross join public.pilo_sources s
    where p.id = coalesce(p_portal, 'planeacion')
      -- encendida en el portal de su ámbito
      and exists (
        select 1 from public.pilo_portals h
        where h.scope = s.scope and coalesce(h.matrix ->> s.id, 'no') = 'casa'
      )
      -- lo que no sale de su portal (Moodle) solo se lee desde él
      and (not s.stays_home or s.scope = p.scope)
      -- las fuentes que piden sesión (Impacto) solo con personal
      and (not s.staff_only or v_staff)
      -- el público solo lee lo que la administración aprobó
      and (v_staff or s.public_ok)
    order by s.sort, s.id;
end;
$$;

comment on function public.pilo_scope(text, boolean, boolean) is
  'Mr. Pilo: qué fuentes puede leer quien pregunta (0173: unificado; depende de quién pregunta, no del portal). Es el único filtro de la memoria: todas las búsquedas lo usan. Solo la función del servidor y la administración.';

revoke all on function public.pilo_scope(text, boolean, boolean) from public, anon;
grant execute on function public.pilo_scope(text, boolean, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Buscar por palabras.
-- -----------------------------------------------------------------------------

drop function if exists public.pilo_memory_search(text, text[], integer, text, boolean, boolean);

create or replace function public.pilo_memory_search(
  p_q text,
  p_sources text[] default null,
  p_limit integer default 6,
  p_space text default 'planeacion',
  p_public_only boolean default false,
  p_member boolean default false
)
returns table (ref text, source text, title text, section text, body text, path text, cut text, office text, updated_at timestamptz, rank real, space text, layer text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  words text := replace(plainto_tsquery('spanish', public.pilo_fold(p_q))::text, ' & ', ' | ');
  v_portal text := coalesce(p_space, 'planeacion');
  v_session boolean := not coalesce(p_public_only, false);
  v_member boolean := coalesce(p_member, false);
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la función de Pilo y la administración buscan en la memoria.' using errcode = '42501';
  end if;
  if coalesce(words, '') = '' then
    return;
  end if;
  return query
    select m.ref, m.source, m.title, m.section, m.body, m.path, m.cut, m.office, m.updated_at,
           ts_rank_cd(m.fts, words::tsquery, 32)::real as rank, m.space, m.layer
    from public.pilo_memory m
    join public.pilo_scope(v_portal, v_session, v_member) sc on sc.source = m.source and sc.space = m.space
    where m.fts @@ words::tsquery
      and m.vis <> 'oculto'
      and m.vis = any (sc.vis)
      and (not sc.needs_ok or m.approved)
      and (p_sources is null or m.source = any (p_sources))
    order by rank desc, m.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 6), 20));
end;
$$;

revoke all on function public.pilo_memory_search(text, text[], integer, text, boolean, boolean) from public, anon;
grant execute on function public.pilo_memory_search(text, text[], integer, text, boolean, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Buscar por significado.
-- -----------------------------------------------------------------------------

drop function if exists public.pilo_memory_semantic(text, text, text[], integer, real, text, boolean, boolean);

create or replace function public.pilo_memory_semantic(
  p_embedding text,
  p_model text,
  p_sources text[] default null,
  p_limit integer default 8,
  p_min real default 0.3,
  p_space text default 'planeacion',
  p_public_only boolean default false,
  p_member boolean default false
)
returns table (ref text, source text, title text, section text, body text, path text, cut text, office text, updated_at timestamptz, sim real, space text, layer text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_portal text := coalesce(p_space, 'planeacion');
  v_session boolean := not coalesce(p_public_only, false);
  v_member boolean := coalesce(p_member, false);
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la función de Pilo y la administración buscan en la memoria.' using errcode = '42501';
  end if;
  return query
    select * from (
      select m.ref, m.source, m.title, m.section, m.body, m.path, m.cut, m.office, m.updated_at,
             (1 - (m.embedding <=> q.v))::real as sim, m.space, m.layer
      from public.pilo_memory m
      join public.pilo_scope(v_portal, v_session, v_member) sc on sc.source = m.source and sc.space = m.space,
           (select p_embedding::extensions.vector as v) q
      where m.embedding is not null and m.embed_model = p_model
        and m.vis <> 'oculto'
        and m.vis = any (sc.vis)
        and (not sc.needs_ok or m.approved)
        and (p_sources is null or m.source = any (p_sources))
      order by m.embedding <=> q.v
      limit greatest(1, least(coalesce(p_limit, 8), 20))
    ) near
    where near.sim >= coalesce(p_min, 0.3);
end;
$$;

revoke all on function public.pilo_memory_semantic(text, text, text[], integer, real, text, boolean, boolean) from public, anon;
grant execute on function public.pilo_memory_semantic(text, text, text[], integer, real, text, boolean, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- LA BÚSQUEDA UNIFICADA: palabras + significado en una sola llamada, con el
-- puntaje fundido (1/(60 + puesto) de cada lista, sumado) y la procedencia de
-- cada pasaje (ámbito, fuente, capa). Sin vector (o sin pgvector) busca solo
-- por palabras. `via`: «palabras», «significado» o «ambas». `rank` va de 0 a 1
-- frente al primero.
-- -----------------------------------------------------------------------------

create or replace function public.pilo_memory_find(
  p_q text,
  p_embedding text default null,
  p_model text default null,
  p_sources text[] default null,
  p_limit integer default 8,
  p_min real default 0.3,
  p_space text default 'planeacion',
  p_public_only boolean default false,
  p_member boolean default false
)
returns table (
  ref text, source text, title text, section text, body text, path text, cut text, office text, updated_at timestamptz,
  space text, layer text, via text, rank real, sim real, score real
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  words text := replace(plainto_tsquery('spanish', public.pilo_fold(p_q))::text, ' & ', ' | ');
  v_portal text := coalesce(p_space, 'planeacion');
  v_session boolean := not coalesce(p_public_only, false);
  v_member boolean := coalesce(p_member, false);
  v_limit integer := greatest(1, least(coalesce(p_limit, 8), 20));
  v_sem jsonb := '[]'::jsonb;
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la función de Pilo y la administración buscan en la memoria.' using errcode = '42501';
  end if;
  if p_embedding is not null and p_model is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(jsonb_build_object('ref', x.ref, 'sim', x.sim, 'pos', x.pos) order by x.pos), '[]'::jsonb)
        from (
          select m.ref, (1 - (m.embedding <=> $1::extensions.vector))::real as sim,
                 row_number() over (order by m.embedding <=> $1::extensions.vector) as pos
          from public.pilo_memory m
          join public.pilo_scope($2, $3, $4) sc on sc.source = m.source and sc.space = m.space
          where m.embedding is not null and m.embed_model = $5
            and m.vis <> 'oculto' and m.vis = any (sc.vis)
            and (not sc.needs_ok or m.approved)
            and ($6::text[] is null or m.source = any ($6::text[]))
          order by m.embedding <=> $1::extensions.vector
          limit 20
        ) x
        where x.sim >= $7
      $q$ into v_sem using p_embedding, v_portal, v_session, v_member, p_model, p_sources, coalesce(p_min, 0.3);
    exception when others then
      v_sem := '[]'::jsonb;
    end;
  end if;
  return query
    with lex as (
      select m.ref, row_number() over (order by ts_rank_cd(m.fts, words::tsquery, 32) desc, m.updated_at desc) as pos,
             ts_rank_cd(m.fts, words::tsquery, 32)::real as rk
      from public.pilo_memory m
      join public.pilo_scope(v_portal, v_session, v_member) sc on sc.source = m.source and sc.space = m.space
      where coalesce(words, '') <> '' and m.fts @@ words::tsquery
        and m.vis <> 'oculto' and m.vis = any (sc.vis)
        and (not sc.needs_ok or m.approved)
        and (p_sources is null or m.source = any (p_sources))
      order by rk desc, m.updated_at desc
      limit 20
    ),
    sem as (
      select e.ref, e.pos, e.sim
      from jsonb_to_recordset(v_sem) as e(ref text, sim real, pos bigint)
    ),
    fused as (
      select coalesce(l.ref, s.ref) as ref,
             (coalesce(1.0 / (60 + l.pos), 0) + coalesce(1.0 / (60 + s.pos), 0))::real as sc,
             l.rk, s.sim,
             case when l.ref is not null and s.ref is not null then 'ambas' when l.ref is not null then 'palabras' else 'significado' end as how
      from lex l full join sem s on s.ref = l.ref
    ),
    top as (select max(f.sc) as best from fused f)
    select m.ref, m.source, m.title, m.section, m.body, m.path, m.cut, m.office, m.updated_at,
           m.space, m.layer, f.how, (f.sc / nullif(t.best, 0))::real, f.sim, f.sc
    from fused f
    cross join top t
    join public.pilo_memory m on m.ref = f.ref
    order by f.sc desc, m.updated_at desc, m.ref
    limit v_limit;
end;
$$;

comment on function public.pilo_memory_find(text, text, text, text[], integer, real, text, boolean, boolean) is
  'Mr. Pilo: la búsqueda unificada de la memoria (palabras + significado, 0173), con procedencia. Solo la función del servidor y la administración.';

revoke all on function public.pilo_memory_find(text, text, text, text[], integer, real, text, boolean, boolean) from public, anon;
grant execute on function public.pilo_memory_find(text, text, text, text[], integer, real, text, boolean, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- De unos pasajes, los que quien pregunta puede leer (las guardadas y lo citado).
-- -----------------------------------------------------------------------------

drop function if exists public.pilo_memory_readable(text[], text, boolean, boolean);

create or replace function public.pilo_memory_readable(
  p_refs text[],
  p_space text default 'planeacion',
  p_public_only boolean default false,
  p_member boolean default false
)
returns table (ref text, source text, title text, section text, body text, path text, cut text, office text, vis text, space text, approved boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_refs text[] := (coalesce(p_refs, '{}'::text[]))[1:40];
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la función de Pilo y la administración leen la memoria.' using errcode = '42501';
  end if;
  if cardinality(v_refs) = 0 then
    return;
  end if;
  return query
    select m.ref, m.source, m.title, m.section, m.body, m.path, m.cut, m.office, m.vis, m.space, m.approved
    from public.pilo_memory m
    join public.pilo_scope(coalesce(p_space, 'planeacion'), not coalesce(p_public_only, false), coalesce(p_member, false)) sc
      on sc.source = m.source and sc.space = m.space
    where m.ref = any (v_refs)
      and m.vis <> 'oculto'
      and m.vis = any (sc.vis)
      and (not sc.needs_ok or m.approved);
end;
$$;

revoke all on function public.pilo_memory_readable(text[], text, boolean, boolean) from public, anon;
grant execute on function public.pilo_memory_readable(text[], text, boolean, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Respuestas guardadas. Siguen siendo del portal y el rol que las dio (su voz y
-- su tono), pero ya no están frescas si ALGO de lo que citan no lo puede leer
-- este mismo lector: no existe, cambió, está oculto, es «con sesión» y no es
-- personal, la fuente se apagó o pide sesión, o no está aprobado para el público.
-- -----------------------------------------------------------------------------

drop function if exists public.pilo_answer_candidates(text, text, text, boolean, boolean);

create or replace function public.pilo_answer_candidates(
  p_qnorm text,
  p_space text default 'planeacion',
  p_rol text default '',
  p_public_only boolean default false,
  p_member boolean default false
)
returns table (id bigint, question text, qnorm text, kind text, answer text, refs text[], created_at timestamptz, fresh boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  words text := replace(plainto_tsquery('spanish', public.pilo_fold(p_qnorm))::text, ' & ', ' | ');
  v_portal text := coalesce(p_space, 'planeacion');
  v_rol text := case when p_rol in ('estudiante', 'profesor') then p_rol else '' end;
  v_session boolean := not coalesce(p_public_only, false);
  v_member boolean := coalesce(p_member, false);
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la función de Pilo consulta las respuestas guardadas.' using errcode = '42501';
  end if;
  if coalesce(words, '') = '' then
    return;
  end if;
  return query
    select a.id, a.question, a.qnorm, a.kind, a.answer, a.refs, a.created_at,
      cardinality(a.refs) > 0
      and not exists (
        select 1 from unnest(a.refs) r
        left join public.pilo_memory m on m.ref = r
        where m.ref is null or m.updated_at > a.created_at
           or m.vis = 'oculto'
           or not exists (
             select 1 from public.pilo_scope(v_portal, v_session, v_member) sc
             where sc.source = m.source and sc.space = m.space and m.vis = any (sc.vis)
               and (not sc.needs_ok or m.approved)
           )
      ) as fresh
    from public.pilo_answers a
    where a.space = v_portal and a.rol = v_rol
      and not a.hidden and a.down < greatest(2, a.up) and a.fts @@ words::tsquery
    order by ts_rank_cd(a.fts, words::tsquery, 32) desc, a.created_at desc
    limit 12;
end;
$$;

revoke all on function public.pilo_answer_candidates(text, text, text, boolean, boolean) from public, anon;
grant execute on function public.pilo_answer_candidates(text, text, text, boolean, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- La malla alrededor de unos pasajes. Ya no se queda en el ámbito del portal: se
-- recorre toda, y solo salen los nodos de las fuentes que quien pregunta puede
-- leer (los del mapa de documentos siempre). La administración (sesión humana)
-- sigue viendo la malla entera de SU ámbito.
-- -----------------------------------------------------------------------------

drop function if exists public.pilo_graph_around(text[], text[], integer, integer, integer, text, boolean, boolean);

create or replace function public.pilo_graph_around(
  p_ids text[],
  p_sources text[] default null,
  p_up integer default 6,
  p_down integer default 1,
  p_limit integer default 80,
  p_space text default 'planeacion',
  p_public_only boolean default false,
  p_member boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_portal text := coalesce(p_space, 'planeacion');
  v_scope text;
  v_admin boolean := public.has_role_at_least('admin');
  v_session boolean := not coalesce(p_public_only, false);
  v_member boolean := coalesce(p_member, false);
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la función de Pilo y la administración leen la malla.' using errcode = '42501';
  end if;
  select p.scope into v_scope from public.pilo_portals p where p.id = v_portal;
  v_scope := coalesce(v_scope, v_portal);
  with recursive up as (
    select n.id, 0 as d from public.pilo_nodes n where n.id = any (p_ids)
    union
    select e.from_id, up.d + 1 from public.pilo_edges e join up on e.to_id = up.id
    where e.rel = 'contiene' and up.d < greatest(0, least(coalesce(p_up, 6), 10))
  ),
  down as (
    select n.id, 0 as d from public.pilo_nodes n where n.id = any (p_ids)
    union
    select e.to_id, down.d + 1 from public.pilo_edges e join down on e.from_id = down.id
    where e.rel in ('contiene', 'incluye', 'mide') and down.d < greatest(0, least(coalesce(p_down, 1), 4))
  ),
  picked as (
    select distinct n.id
    from (select id from up union select id from down) ids
    join public.pilo_nodes n on n.id = ids.id
    where (not v_admin or n.space = v_scope)
      and (p_sources is null or n.source = any (p_sources))
      and (
        v_admin
        or n.source = 'mapa'
        or exists (
          select 1 from public.pilo_scope(v_portal, v_session, v_member) sc
          where sc.source = n.source and sc.space = n.space
        )
      )
    limit greatest(1, least(coalesce(p_limit, 80), 400))
  )
  select jsonb_build_object(
    'nodes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'source', n.source, 'type', n.type, 'code', n.code, 'label', n.label, 'path', n.path, 'props', n.props))
                       from public.pilo_nodes n where n.id in (select id from picked)), '[]'::jsonb),
    'edges', coalesce((select jsonb_agg(jsonb_build_object('from', e.from_id, 'to', e.to_id, 'rel', e.rel))
                       from public.pilo_edges e where e.from_id in (select id from picked) and e.to_id in (select id from picked)), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.pilo_graph_around(text[], text[], integer, integer, integer, text, boolean, boolean) from public, anon;
grant execute on function public.pilo_graph_around(text[], text[], integer, integer, integer, text, boolean, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Vecinos por el mapa: comparten tema o referencia con los pasajes de partida, de
-- cualquier ámbito, siempre que quien pregunta pueda leerlos.
-- -----------------------------------------------------------------------------

drop function if exists public.pilo_graph_neighbors(text[], text, text[], boolean, integer, boolean);

create or replace function public.pilo_graph_neighbors(
  p_refs text[],
  p_space text,
  p_sources text[] default null,
  p_public_only boolean default false,
  p_limit integer default 3,
  p_member boolean default false
)
returns table (ref text, source text, title text, section text, body text, path text, cut text, office text, updated_at timestamptz, via text, shared integer, space text, layer text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_portal text := coalesce(p_space, 'planeacion');
  v_session boolean := not coalesce(p_public_only, false);
  v_member boolean := coalesce(p_member, false);
  v_refs text[] := (coalesce(p_refs, '{}'::text[]))[1:20];
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la función de Pilo y la administración leen la malla.' using errcode = '42501';
  end if;
  if cardinality(v_refs) = 0 then
    return;
  end if;
  return query
    with hubs as (
      select distinct e.to_id as hub
      from public.pilo_edges e
      where e.rel in ('trata', 'cita') and e.from_id = any (v_refs)
    ),
    near as (
      select e.from_id as near_ref, count(distinct e.to_id)::integer as near_shared, min(e.to_id) as near_hub
      from public.pilo_edges e
      join hubs h on h.hub = e.to_id
      where e.rel in ('trata', 'cita') and e.from_id <> all (v_refs)
      group by e.from_id
    )
    select m.ref, m.source, m.title, m.section, m.body, m.path, m.cut, m.office, m.updated_at,
           coalesce(n.label, '') as via, near.near_shared, m.space, m.layer
    from near
    join public.pilo_memory m on m.ref = near.near_ref
    join public.pilo_scope(v_portal, v_session, v_member) sc on sc.source = m.source and sc.space = m.space
    left join public.pilo_nodes n on n.id = near.near_hub and n.source = 'mapa'
    where m.vis <> 'oculto'
      and m.vis = any (sc.vis)
      and (not sc.needs_ok or m.approved)
      and (p_sources is null or m.source = any (p_sources))
    order by near.near_shared desc, m.updated_at desc, m.ref
    limit greatest(1, least(coalesce(p_limit, 3), 10));
end;
$$;

revoke all on function public.pilo_graph_neighbors(text[], text, text[], boolean, integer, boolean) from public, anon;
grant execute on function public.pilo_graph_neighbors(text[], text, text[], boolean, integer, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- «Actualizar la memoria» (0095) ya no toca la capa profunda: solo rehace lo de
-- la capa «base» de la fuente.
-- -----------------------------------------------------------------------------

create or replace function public.pilo_memory_replace(p_source text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed integer := 0;
  v_added integer := 0;
  v_changed integer := 0;
  v_total integer := 0;
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la administración actualiza la memoria de Pilo.' using errcode = '42501';
  end if;
  if p_source not in ('cifras', 'boletines', 'pdi', 'observatorio', 'impacto') then
    raise exception 'Fuente desconocida: %', p_source using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Las filas deben ser una lista.' using errcode = '22023';
  end if;

  create temporary table if not exists pilo_incoming (
    ref text primary key, title text, section text, body text, path text, cut text, office text
  ) on commit drop;
  delete from pilo_incoming where true;

  insert into pilo_incoming (ref, title, section, body, path, cut, office)
  select distinct on (r->>'ref')
    left(r->>'ref', 300), left(coalesce(r->>'title', ''), 300), left(coalesce(r->>'section', ''), 300),
    left(coalesce(r->>'body', ''), 8000), left(coalesce(r->>'path', ''), 300),
    left(coalesce(r->>'cut', ''), 60), left(coalesce(r->>'office', ''), 200)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where coalesce(r->>'ref', '') <> '' and coalesce(r->>'title', '') <> '' and length(coalesce(r->>'body', '')) >= 10;

  delete from public.pilo_memory m
  where m.source = p_source and m.layer = 'base' and not exists (select 1 from pilo_incoming i where i.ref = m.ref);
  get diagnostics v_removed = row_count;

  select count(*) into v_added from pilo_incoming i where not exists (select 1 from public.pilo_memory m where m.ref = i.ref);
  select count(*) into v_changed
  from pilo_incoming i join public.pilo_memory m on m.ref = i.ref
  where (m.title, m.section, m.body, m.path, m.cut, m.office, m.source)
        is distinct from (i.title, i.section, i.body, i.path, i.cut, i.office, p_source);

  insert into public.pilo_memory (ref, source, title, section, body, path, cut, office, updated_at)
  select i.ref, p_source, i.title, i.section, i.body, i.path, i.cut, i.office, now() from pilo_incoming i
  on conflict (ref) do update set
    source = excluded.source, title = excluded.title, section = excluded.section, body = excluded.body,
    path = excluded.path, cut = excluded.cut, office = excluded.office,
    updated_at = case
      when (pilo_memory.title, pilo_memory.section, pilo_memory.body, pilo_memory.path, pilo_memory.cut, pilo_memory.office, pilo_memory.source)
           is distinct from (excluded.title, excluded.section, excluded.body, excluded.path, excluded.cut, excluded.office, excluded.source)
      then now() else pilo_memory.updated_at end;

  select count(*) into v_total from public.pilo_memory where source = p_source and layer = 'base';
  update public.pilo_ai_settings set memory_indexed_at = now() where id = 1;

  return jsonb_build_object('source', p_source, 'added', v_added, 'changed', v_changed, 'removed', v_removed, 'total', v_total);
end;
$$;

revoke all on function public.pilo_memory_replace(text, jsonb) from public, anon;
grant execute on function public.pilo_memory_replace(text, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- LA CAPA PROFUNDA. Los lectores directos arman pasajes desde las tablas del
-- portal y los guardan por lotes con la misma «corrida» (p_run); al final, la
-- poda borra de esa fuente los pasajes profundos que la corrida no tocó.
--
--   · El ref de un pasaje profundo empieza por «prof:» (no choca con la capa base).
--   · Nace SIN aprobar (approved = deep_ok de la fuente, false de partida).
--     Una fuente que pide sesión (Impacto) nace «con sesión»: nunca es pública.
--   · Lo que ya existe conserva su aprobación; solo cambia updated_at si cambió
--     el contenido (así el índice por significado no repite trabajo).
-- -----------------------------------------------------------------------------

create or replace function public.pilo_deep_save(p_source text, p_run timestamptz, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.pilo_sources;
  v_added integer := 0;
  v_changed integer := 0;
  v_seen integer := 0;
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la administración y la función de Pilo guardan la capa profunda.' using errcode = '42501';
  end if;
  select * into v_src from public.pilo_sources s where s.id = p_source and s.kind = 'portal';
  if not found then
    raise exception 'La capa profunda es de las fuentes de portal; fuente desconocida: %', p_source using errcode = '22023';
  end if;
  if p_run is null then
    raise exception 'Falta la hora de la corrida.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Las filas deben ser una lista.' using errcode = '22023';
  end if;

  create temporary table if not exists pilo_deep_incoming (
    ref text primary key, title text, section text, body text, path text, cut text, office text, vis text
  ) on commit drop;
  delete from pilo_deep_incoming where true;

  insert into pilo_deep_incoming (ref, title, section, body, path, cut, office, vis)
  select distinct on (r->>'ref')
    left(r->>'ref', 300), left(coalesce(r->>'title', ''), 300), left(coalesce(r->>'section', ''), 300),
    left(coalesce(r->>'body', ''), 8000), left(coalesce(r->>'path', ''), 300),
    left(coalesce(r->>'cut', ''), 60), left(coalesce(r->>'office', ''), 200),
    case when v_src.staff_only or r->>'vis' = 'sesion' then 'sesion' else 'publico' end
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where coalesce(r->>'ref', '') like 'prof:%' and coalesce(r->>'title', '') <> '' and length(coalesce(r->>'body', '')) >= 10;

  select count(*) into v_seen from pilo_deep_incoming;
  select count(*) into v_added from pilo_deep_incoming i where not exists (select 1 from public.pilo_memory m where m.ref = i.ref);
  select count(*) into v_changed
  from pilo_deep_incoming i join public.pilo_memory m on m.ref = i.ref
  where (m.title, m.section, m.body, m.path, m.cut, m.office, m.source, m.vis, m.layer)
        is distinct from (i.title, i.section, i.body, i.path, i.cut, i.office, p_source, i.vis, 'profunda');

  insert into public.pilo_memory (ref, source, title, section, body, path, cut, office, vis, layer, approved, seen_at, updated_at)
  select i.ref, p_source, i.title, i.section, i.body, i.path, i.cut, i.office, i.vis, 'profunda', v_src.deep_ok, p_run, now()
  from pilo_deep_incoming i
  on conflict (ref) do update set
    source = excluded.source, title = excluded.title, section = excluded.section, body = excluded.body,
    path = excluded.path, cut = excluded.cut, office = excluded.office, vis = excluded.vis, layer = 'profunda',
    seen_at = excluded.seen_at,
    updated_at = case
      when (pilo_memory.title, pilo_memory.section, pilo_memory.body, pilo_memory.path, pilo_memory.cut, pilo_memory.office, pilo_memory.source, pilo_memory.vis)
           is distinct from (excluded.title, excluded.section, excluded.body, excluded.path, excluded.cut, excluded.office, excluded.source, excluded.vis)
      then now() else pilo_memory.updated_at end
  where pilo_memory.layer = 'profunda';

  return jsonb_build_object('source', p_source, 'seen', v_seen, 'added', v_added, 'changed', v_changed);
end;
$$;

revoke all on function public.pilo_deep_save(text, timestamptz, jsonb) from public, anon;
grant execute on function public.pilo_deep_save(text, timestamptz, jsonb) to authenticated, service_role;

create or replace function public.pilo_deep_prune(p_source text, p_run timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed integer := 0;
  v_total integer := 0;
begin
  if not public.pilo_is_service_or_admin() then
    raise exception 'Solo la administración y la función de Pilo podan la capa profunda.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pilo_sources s where s.id = p_source and s.kind = 'portal') then
    raise exception 'Fuente desconocida: %', p_source using errcode = '22023';
  end if;
  if p_run is null then
    raise exception 'Falta la hora de la corrida.' using errcode = '22023';
  end if;
  delete from public.pilo_memory m
  where m.source = p_source and m.layer = 'profunda' and (m.seen_at is null or m.seen_at < p_run);
  get diagnostics v_removed = row_count;
  select count(*) into v_total from public.pilo_memory m where m.source = p_source and m.layer = 'profunda';
  return jsonb_build_object('source', p_source, 'removed', v_removed, 'total', v_total);
end;
$$;

revoke all on function public.pilo_deep_prune(text, timestamptz) from public, anon;
grant execute on function public.pilo_deep_prune(text, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- La aprobación pública, para la administración.
-- -----------------------------------------------------------------------------

create or replace function public.pilo_sources_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración ve qué fuentes lee el público.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'scope', s.scope, 'kind', s.kind,
      'staff_only', s.staff_only, 'stays_home', s.stays_home,
      'enabled', exists (select 1 from public.pilo_portals h where h.scope = s.scope and coalesce(h.matrix ->> s.id, 'no') = 'casa'),
      'public_ok', s.public_ok, 'deep_ok', s.deep_ok,
      'passages', c.total, 'public', c.pub, 'approved', c.ok, 'pending', c.pub - c.ok,
      'deep', c.deep, 'hidden', c.hid, 'session', c.ses,
      'updated_at', c.last
    ) order by s.sort, s.id)
    from public.pilo_sources s
    cross join lateral (
      select count(*) filter (where m.vis <> 'oculto') as total,
             count(*) filter (where m.vis = 'publico') as pub,
             count(*) filter (where m.vis = 'publico' and m.approved) as ok,
             count(*) filter (where m.layer = 'profunda') as deep,
             count(*) filter (where m.vis = 'oculto') as hid,
             count(*) filter (where m.vis = 'sesion') as ses,
             max(m.updated_at) as last
      from public.pilo_memory m where m.source = s.id
    ) c
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.pilo_sources_overview() from public, anon;
grant execute on function public.pilo_sources_overview() to authenticated;

create or replace function public.pilo_source_approve(p_source text, p_ok boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := coalesce(p_ok, false);
  v_changed integer := 0;
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración aprueba qué lee el público.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pilo_sources s where s.id = p_source) then
    raise exception 'Fuente desconocida: %', p_source using errcode = '22023';
  end if;
  update public.pilo_sources set public_ok = v_ok, deep_ok = v_ok where id = p_source;
  update public.pilo_memory set approved = v_ok where source = p_source and approved is distinct from v_ok;
  get diagnostics v_changed = row_count;
  return jsonb_build_object('source', p_source, 'public_ok', v_ok, 'passages', v_changed);
end;
$$;

revoke all on function public.pilo_source_approve(text, boolean) from public, anon;
grant execute on function public.pilo_source_approve(text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- LOS SALUDOS del chat incrustado. Sin cifras. La administración los edita; el
-- chat (anónimo) los pide por pilo_greetings_public.
-- -----------------------------------------------------------------------------

create table if not exists public.pilo_greetings (
  id          bigint generated always as identity primary key,
  space       text not null,
  text        text not null,
  moment      text not null default 'cualquiera',
  active      boolean not null default true,
  sort        integer not null default 100,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint pilo_greetings_space check (space in ('planeacion', 'ensenanza')),
  constraint pilo_greetings_moment check (moment in ('cualquiera', 'manana', 'tarde', 'noche')),
  constraint pilo_greetings_text check (length(btrim(text)) between 3 and 300 and text !~ '[0-9]')
);

comment on table public.pilo_greetings is
  'Mr. Pilo: los saludos del chat incrustado, por Pilo (espacio) y momento del día. Sin números ni cifras. La administración los edita; el chat los lee por pilo_greetings_public.';

create index if not exists pilo_greetings_space_idx on public.pilo_greetings (space, active);

alter table public.pilo_greetings enable row level security;

drop policy if exists pilo_greetings_admin on public.pilo_greetings;
create policy pilo_greetings_admin on public.pilo_greetings
  for all to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

revoke all on public.pilo_greetings from public, anon;
grant select, insert, update, delete on public.pilo_greetings to authenticated;

-- Los valores de partida, una sola vez por Pilo (si ya tiene saludos, no se toca).
insert into public.pilo_greetings (space, text, moment, sort)
select v.space, v.text, v.moment, v.sort
from (values
  ('planeacion', 'Hola, soy Mr. Pilo, la AI de la UDES. ¿En qué te ayudo hoy?', 'cualquiera', 1),
  ('planeacion', '¡Hola! Soy Mr. Pilo, la AI de la UDES y estoy para ayudarte. Pregúntame lo que quieras de la universidad.', 'cualquiera', 2),
  ('planeacion', '¡Buenos días! Soy Mr. Pilo, la AI de la UDES. ¿Qué quieres saber de la universidad?', 'manana', 3),
  ('planeacion', '¡Buenas tardes! Soy Mr. Pilo, la AI de la UDES. Cuéntame qué necesitas y lo buscamos juntos.', 'tarde', 4),
  ('planeacion', '¡Buenas noches! Soy Mr. Pilo, la AI de la UDES. Aquí sigo, listo para ayudarte con lo que necesites.', 'noche', 5),
  ('planeacion', 'Hola, soy Mr. Pilo, la AI de la UDES. Pregúntame por programas, sedes, estudiantes, docentes o investigación.', 'cualquiera', 6),
  ('planeacion', '¿Quieres conocer la UDES? Soy Mr. Pilo, su AI, y te cuento lo que sé. ¡Pregúntame!', 'cualquiera', 7),
  ('planeacion', 'Hola, qué gusto saludarte. Soy Mr. Pilo, la AI de la UDES. ¿Sobre qué te gustaría preguntar?', 'cualquiera', 8),
  ('planeacion', '¡Hola! Soy Mr. Pilo, la AI de la UDES. Puedo ayudarte con datos, planes, normas y mucho más de la universidad.', 'cualquiera', 9),
  ('planeacion', 'Aquí estoy: Mr. Pilo, la AI de la UDES. Escríbeme tu pregunta y te respondo con gusto.', 'cualquiera', 10),
  ('ensenanza', 'Hola, soy Mr. Pilo, la AI de la UDES. ¿Qué quieres saber sobre enseñanza y aprendizaje?', 'cualquiera', 1),
  ('ensenanza', '¡Hola! Soy Mr. Pilo, la AI de la UDES. Pregúntame por innovación educativa, políticas académicas o tus cursos.', 'cualquiera', 2),
  ('ensenanza', '¡Buenos días! Soy Mr. Pilo, la AI de la UDES. ¿En qué te ayudo con tu clase de hoy?', 'manana', 3),
  ('ensenanza', '¡Buenas tardes! Soy Mr. Pilo, la AI de la UDES. Cuéntame qué necesitas para tus estudios o tu docencia.', 'tarde', 4),
  ('ensenanza', '¡Buenas noches! Soy Mr. Pilo, la AI de la UDES. Si algo de tus clases te inquieta, aquí estoy.', 'noche', 5),
  ('ensenanza', 'Hola, soy Mr. Pilo, la AI de la UDES. También puedo hablarte de la universidad entera: pregúntame sin pena.', 'cualquiera', 6)
) as v(space, text, moment, sort)
where not exists (select 1 from public.pilo_greetings g where g.space = v.space);

-- Lo que lee el chat, sin sesión: solo el texto y el momento de los activos.
create or replace function public.pilo_greetings_public(p_space text default 'planeacion')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('text', g.text, 'moment', g.moment) order by g.sort, g.id), '[]'::jsonb)
  from public.pilo_greetings g
  where g.space = coalesce(p_space, 'planeacion') and g.active
$$;

revoke all on function public.pilo_greetings_public(text) from public;
grant execute on function public.pilo_greetings_public(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
