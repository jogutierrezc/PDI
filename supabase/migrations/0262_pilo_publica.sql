-- =============================================================================
-- PDI · 0262 · Pilo Publica · informes de cada ranking armados por Pilo
--
-- Requiere 0143 a 0146 (noticias y informes ODS), 0149 (reporte de rankings) y 0178
-- (Datos de Sostenibilidad). Idempotente. Todo UPDATE y DELETE lleva WHERE (safeupdate, 0095).
--
-- QUÉ ES
--  Un informe por ranking, unidad y edición: THE Impact (unidad = ODS 1..17), THE World
--  (unidad = pilar) y UI GreenMetric (unidad = categoría). La edge function `pilo-publica`
--  (Pilo con el rol de periodista y estadístico) lee las fuentes, arma el libro de cifras
--  y escribe el tablero, los gráficos y la narrativa en español e inglés.
--
-- LAS CINCO TABLAS
--  pp_informes  el informe (estado, ajustes de diagramación, título y entrada bilingües)
--  pp_fuentes   qué lee Pilo (noticias, indicadores, tablas de Datos de Sostenibilidad…)
--  pp_cifras    el LIBRO DE CIFRAS: toda cifra del informe sale de aquí; la IA nunca teclea una
--  pp_bloques   lo que se publica: cifras clave, gráficos, textos, imágenes (en orden)
--  pp_corridas  bitácora de lo que hizo Pilo (quién, qué paso, cuánto)
--
-- QUIÉN VE QUÉ
--  Planeación y administración: todo. Público: solo informes publicados y sus bloques activos
--  (sin avisos internos, sin el texto original de Pilo, sin las fuentes).
-- =============================================================================

create table if not exists public.pp_informes (
  id          uuid primary key default gen_random_uuid(),
  ranking     text not null,
  unit_key    text not null,
  edition     int  not null,
  state       text not null default 'borrador',
  -- Diagramación y voz: {tone, person, cover:'right'|'left', cols:1|2, motion:'editorial'|'subtle'|'none'}
  settings    jsonb not null default '{"tone":"cercano","person":"nosotros","cover":"right","cols":1,"motion":"editorial"}'::jsonb,
  title_es    text not null default '',
  title_en    text not null default '',
  lead_es     text not null default '',
  lead_en     text not null default '',
  published_at timestamptz,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint pp_informes_ranking check (ranking in ('impact', 'world', 'green')),
  constraint pp_informes_state check (state in ('borrador', 'revision', 'publicado')),
  constraint pp_informes_edition check (edition between 2020 and 2100),
  constraint pp_informes_unit check (length(unit_key) between 1 and 40),
  constraint pp_informes_unico unique (ranking, unit_key, edition)
);

create table if not exists public.pp_fuentes (
  id         uuid primary key default gen_random_uuid(),
  informe_id uuid not null references public.pp_informes (id) on delete cascade,
  kind       text not null,
  ref        text not null,
  label      text not null default '',
  include    boolean not null default true,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pp_fuentes_kind check (kind in ('noticia', 'indicador', 'libro', 'documento', 'cifras')),
  constraint pp_fuentes_unica unique (informe_id, kind, ref)
);

-- El libro de cifras. `key` es estable (p. ej. 'ds:<libro>:<columna>:2025'); `derived` marca las que
-- calcula el código (variación, promedio…) a partir de otras: `formula` dice cómo.
create table if not exists public.pp_cifras (
  id         uuid primary key default gen_random_uuid(),
  informe_id uuid not null references public.pp_informes (id) on delete cascade,
  key        text not null,
  label      text not null,
  label_en   text not null default '',
  unit       text not null default '',
  year       int,
  value      numeric,
  derived    boolean not null default false,
  formula    text not null default '',
  source     jsonb not null default '{}'::jsonb,
  indicator  text,
  created_at timestamptz not null default now(),
  constraint pp_cifras_unica unique (informe_id, key)
);

create table if not exists public.pp_bloques (
  id         uuid primary key default gen_random_uuid(),
  informe_id uuid not null references public.pp_informes (id) on delete cascade,
  kind       text not null,
  sec        text not null default '',
  pos        int  not null default 0,
  origin     text not null default 'pilo',
  enabled    boolean not null default true,
  -- kpi:     {cifra:'<key>'}                       el valor sale del libro de cifras
  -- grafico: {chart:'bar'|'line'|'donut', series:[{x:'2023', cifra:'<key>'}], title_es, title_en}
  -- imagen:  {news_id, image_id?, crop?, caption?}
  -- texto:   {indicator?}                          el indicador del ranking al que responde
  spec       jsonb not null default '{}'::jsonb,
  heading_es text not null default '',
  heading_en text not null default '',
  text_es    text not null default '',
  text_en    text not null default '',
  orig_es    text not null default '',
  orig_en    text not null default '',
  sources    jsonb not null default '[]'::jsonb,
  figs       jsonb not null default '[]'::jsonb,
  warn       text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pp_bloques_kind check (kind in ('kpi', 'grafico', 'texto', 'imagen')),
  constraint pp_bloques_origin check (origin in ('pilo', 'persona', 'editado'))
);
create index if not exists pp_bloques_informe on public.pp_bloques (informe_id, pos);
create index if not exists pp_fuentes_informe on public.pp_fuentes (informe_id);
create index if not exists pp_cifras_informe on public.pp_cifras (informe_id);

create table if not exists public.pp_corridas (
  id         uuid primary key default gen_random_uuid(),
  informe_id uuid references public.pp_informes (id) on delete cascade,
  actor      uuid references public.profiles (id) on delete set null,
  accion     text not null,
  detalle    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pp_corridas_informe on public.pp_corridas (informe_id, created_at desc);

-- Lo que escribe una persona no lo pisa Pilo: con sesión, un texto de Pilo que se cambia pasa a «editado»
-- y un bloque nuevo es «persona». La función escribe sin sesión (clave de servicio) y fija origin por su cuenta.
create or replace function public.pp_bloques_origin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if new.origin = 'pilo' then new.origin := 'persona'; end if;
    else
      if new.origin = 'pilo' and old.origin <> 'pilo' then
        new.origin := old.origin;
      end if;
      if old.origin = 'pilo' and (new.text_es is distinct from old.text_es or new.text_en is distinct from old.text_en) then
        new.origin := 'editado';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pp_bloques_origin on public.pp_bloques;
create trigger pp_bloques_origin before insert or update on public.pp_bloques
  for each row execute function public.pp_bloques_origin();

create or replace function public.pp_informes_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.state = 'publicado' and old.state is distinct from 'publicado' then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists pp_informes_touch on public.pp_informes;
create trigger pp_informes_touch before update on public.pp_informes
  for each row execute function public.pp_informes_touch();

-- RLS ----------------------------------------------------------------------------------
alter table public.pp_informes enable row level security;
alter table public.pp_fuentes  enable row level security;
alter table public.pp_cifras   enable row level security;
alter table public.pp_bloques  enable row level security;
alter table public.pp_corridas enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pp_informes', 'pp_fuentes', 'pp_cifras', 'pp_bloques', 'pp_corridas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_planeacion', t);
    execute format($p$create policy %I on public.%I for all to authenticated using (public.has_role_at_least('planeacion')) with check (public.has_role_at_least('planeacion'))$p$, t || '_planeacion', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

drop policy if exists pp_informes_publico on public.pp_informes;
create policy pp_informes_publico on public.pp_informes for select to anon, authenticated
  using (state = 'publicado');

drop policy if exists pp_bloques_publico on public.pp_bloques;
create policy pp_bloques_publico on public.pp_bloques for select to anon, authenticated
  using (enabled and exists (select 1 from public.pp_informes i where i.id = informe_id and i.state = 'publicado'));

-- El público lee solo lo necesario: nunca orig_*, warn, sources, updated_by ni las fuentes y el libro completo.
grant select (id, ranking, unit_key, edition, state, settings, title_es, title_en, lead_es, lead_en, published_at, updated_at) on public.pp_informes to anon;
grant select (id, informe_id, kind, sec, pos, origin, spec, heading_es, heading_en, text_es, text_en, figs, enabled, updated_at) on public.pp_bloques to anon;

-- Las cifras que un informe publicado muestra, resueltas: una función en lugar de abrir el libro entero.
-- Devuelve solo las cifras citadas por bloques activos de un informe publicado, con un subconjunto SEGURO de su
-- procedencia (explicación, tabla, oficina, periodo, desglose, indicador; nunca la cita, el enlace ni la fórmula).
-- Esta es la versión final (la misma de 0264): se borra antes para poder aplicar 0262 y 0264 en cualquier orden y repetirlas.
drop function if exists public.pp_cifras_publicas(uuid);

create or replace function public.pp_cifras_publicas(p_informe uuid)
returns table (key text, label text, label_en text, unit text, year int, value numeric, source jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select c.key, c.label, c.label_en, c.unit, c.year, c.value,
         jsonb_strip_nulls(jsonb_build_object(
           'descripcion',    c.source -> 'descripcion',
           'descripcion_en', c.source -> 'descripcion_en',
           'tabla',          c.source -> 'tabla',
           'oficina',        c.source -> 'oficina',
           'periodo',        c.source -> 'periodo',
           'desglose',       c.source -> 'desglose',
           'indicador',      c.source -> 'indicador'
         )) as source
    from public.pp_cifras c
    join public.pp_informes i on i.id = c.informe_id
   where c.informe_id = p_informe
     and i.state = 'publicado'
     and exists (
       select 1 from public.pp_bloques b
        where b.informe_id = c.informe_id
          and b.enabled
          and (
            b.spec ->> 'cifra' = c.key
            or exists (select 1 from jsonb_array_elements(coalesce(b.spec -> 'series', '[]'::jsonb)) s where s ->> 'cifra' = c.key)
            or b.figs @> to_jsonb(c.key)
          )
     );
$$;

revoke all on function public.pp_cifras_publicas(uuid) from public;
grant execute on function public.pp_cifras_publicas(uuid) to anon, authenticated, service_role;
