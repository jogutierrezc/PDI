-- =============================================================================
-- 0146 · Informes ODS con Pilo, segunda fase: español e inglés, las imágenes de
-- cada nota, el libro de cifras y la ficha de evidencia para THE.
--
--   ods_report_blocks     + text_en, orig_en   el párrafo en inglés (THE lee en
--                                              inglés; el español siempre existe).
--                         El disparador de 0145 también marca «editado» si una
--                         persona cambia el inglés de un párrafo de Pilo.
--   news_items            + title_en, excerpt_en   públicas, como las demás
--                                                  columnas anónimas de 0143.
--   news_images           las imágenes que trae cada nota (portada y cuerpo),
--                         con su tamaño, pie y crédito originales. Pilo no crea
--                         imágenes: solo elige entre estas. El público las ve
--                         solo de notas aprobadas.
--   news_figures          el libro de cifras: cada cifra de una nota con su cita
--                         literal, su tipo y su puntaje. `checked`: Pilo ya dijo
--                         si es un logro de la UDES (score 0 = no lo es). Solo
--                         Planeación y la función: el público ve las cifras
--                         dentro del informe publicado.
--   ods_report_photos     + image_id (news_images, opcional) y photo_key =
--                         coalesce(image_id, news_id), columna generada. La
--                         clave primaria pasa de (report_id, news_id) a
--                         (report_id, photo_key): las filas de 0145 (image_id
--                         nulo) conservan su clave; una nota puede aportar varias
--                         imágenes. Para upsert: onConflict «report_id,photo_key».
--   ods_report_indicators + ficha  la ficha de hechos en inglés para el LLM de THE
--                         + eval   la pre-evaluación de Pilo (interna).
--   ods_evidencia()       devuelve también la ficha, el título en inglés y la
--                         imagen elegida para la nota.
--   ods_report_blocks     + heading, heading_en  el subtítulo temático dentro de
--                         «Qué hicimos» («Educación en los colegios»…).
--                         sources (jsonb) admite otras fuentes, además de las
--                         noticias: [{news_id, quote, kind, ref, origen}] con
--                         kind 'noticia' | 'proyecto' | 'cifras' | 'impacto' |
--                         'documento'. Para las noticias, news_id es el id de la
--                         nota (como en 0145); para las demás, news_id = '' y
--                         ref = 'cifras:<id>:2025', 'impacto:<id>:2025',
--                         'proyecto:<id>' o 'documento:<id>'; origen es lo que
--                         se muestra («UDES en Cifras 2025»).
--   ods_registro()        el «Registro de actividades» del informe publicado:
--                         TODAS las notas aprobadas del ODS en orden
--                         cronológico, con fecha, sede, sección, título (es/en),
--                         la cifra principal del libro y si la narrativa la cita.
--                         Se calcula siempre (no hay copia que se desactualice) y
--                         sale solo de informes publicados, sin abrir RLS.
--   news_settings         + ai_provider ('pilo' | 'mistral'), ai_model,
--                         ai_vision_model, ai_batch: el proveedor de IA de los
--                         rankings, aparte del de /pregunta. Las claves siguen en
--                         pilo_ai_secret (0091): aquí no hay ninguna. Planeación
--                         los lee; solo la administración los cambia.
--
-- Quién puede qué: como 0143 y 0145. Todo UPDATE y DELETE lleva WHERE
-- (safeupdate, ver 0095). Idempotente. Requiere 0143, 0144 y 0145.
-- =============================================================================

-- Bilingüe ------------------------------------------------------------------------
alter table public.ods_report_blocks add column if not exists text_en text not null default '';
alter table public.ods_report_blocks add column if not exists orig_en text not null default '';
alter table public.ods_report_blocks drop constraint if exists ods_report_blocks_text_en;
alter table public.ods_report_blocks add constraint ods_report_blocks_text_en check (length(text_en) <= 6000);

alter table public.news_items add column if not exists title_en   text not null default '';
alter table public.news_items add column if not exists excerpt_en text not null default '';

create or replace function public.ods_report_blocks_origin()
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
      if old.origin = 'pilo' and (new.text is distinct from old.text or new.text_en is distinct from old.text_en) then
        new.origin := 'editado';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Imágenes de las notas -------------------------------------------------------------
create table if not exists public.news_images (
  id         uuid primary key default gen_random_uuid(),
  news_id    uuid not null references public.news_items (id) on delete cascade,
  url        text not null,
  width      int,
  height     int,
  caption    text not null default '',
  credit     text not null default '',
  pos        int not null default 0,
  is_cover   boolean not null default false,
  kind       text not null default 'foto',
  minors     boolean not null default false,
  alt        text not null default '',
  created_at timestamptz not null default now(),
  constraint news_images_unique unique (news_id, url),
  constraint news_images_url check (url ~ '^https://'),
  constraint news_images_kind check (kind in ('foto', 'grafica')),
  constraint news_images_size check ((width is null or width > 0) and (height is null or height > 0))
);
create index if not exists news_images_news_idx on public.news_images (news_id, pos);

-- Libro de cifras -------------------------------------------------------------------
create table if not exists public.news_figures (
  id         uuid primary key default gen_random_uuid(),
  news_id    uuid not null references public.news_items (id) on delete cascade,
  value      text not null,
  num        numeric,
  unit       text not null default '',
  label      text not null default '',
  quote      text not null,
  kind       text not null default 'otro',
  score      smallint not null default 50,
  checked    boolean not null default false,
  created_at timestamptz not null default now(),
  constraint news_figures_unique unique (news_id, quote, value),
  constraint news_figures_kind check (kind in ('personas', 'instituciones', 'horas', 'dinero', 'porcentaje', 'eventos', 'otro')),
  constraint news_figures_score check (score between 0 and 100),
  constraint news_figures_quote check (length(quote) between 1 and 600)
);
create index if not exists news_figures_news_idx on public.news_figures (news_id, score desc);

comment on table public.news_images is
  'Informes ODS (0146): imágenes de cada nota tal como vienen en udes.edu.co. Pilo solo elige entre ellas, no las crea.';
comment on table public.news_figures is
  'Informes ODS (0146): libro de cifras de cada nota con su cita literal. score 0 = no es un logro de la UDES.';

-- Fotos del informe: varias imágenes por nota ------------------------------------------
alter table public.ods_report_photos add column if not exists image_id uuid references public.news_images (id) on delete cascade;
alter table public.ods_report_photos add column if not exists photo_key uuid generated always as (coalesce(image_id, news_id)) stored;

do $$
declare def text;
begin
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.ods_report_photos'::regclass and c.contype = 'p';
  if def is null or def not like '%photo_key%' then
    if def is not null then
      execute (select format('alter table public.ods_report_photos drop constraint %I', conname)
                 from pg_constraint where conrelid = 'public.ods_report_photos'::regclass and contype = 'p');
    end if;
    alter table public.ods_report_photos add constraint ods_report_photos_pkey primary key (report_id, photo_key);
  end if;
end $$;

comment on column public.ods_report_photos.photo_key is
  'coalesce(image_id, news_id): la clave de la foto dentro del informe (0146). Las filas sin image_id (0145) usan la portada de la nota.';

-- Ficha y pre-evaluación --------------------------------------------------------------
alter table public.ods_report_indicators add column if not exists ficha jsonb not null default '{}'::jsonb;
alter table public.ods_report_indicators add column if not exists eval  jsonb not null default '{}'::jsonb;
alter table public.ods_report_indicators drop constraint if exists ods_report_indicators_ficha;
alter table public.ods_report_indicators add constraint ods_report_indicators_ficha check (jsonb_typeof(ficha) = 'object' and jsonb_typeof(eval) = 'object');

-- RLS -----------------------------------------------------------------------------------
alter table public.news_images  enable row level security;
alter table public.news_figures enable row level security;

do $$
declare t text;
begin
  foreach t in array array['news_images','news_figures'] loop
    execute format('drop policy if exists %I on public.%I', t || '_planeacion', t);
    execute format($p$create policy %I on public.%I for all to authenticated using (public.has_role_at_least('planeacion')) with check (public.has_role_at_least('planeacion'))$p$, t || '_planeacion', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- El público ve las imágenes solo de notas aprobadas; las cifras, nunca sueltas.
drop policy if exists news_images_publico on public.news_images;
create policy news_images_publico on public.news_images for select to anon, authenticated
  using (exists (select 1 from public.news_items i where i.id = news_id and i.state = 'ok'));
grant select (id, news_id, url, width, height, caption, credit, pos, is_cover, kind, minors, alt) on public.news_images to anon;

-- Columnas públicas de las notas: las de 0143 más el inglés.
revoke select on public.news_items from anon;
grant select (id, url, title, excerpt, image_url, published_on, section, campus, state, title_en, excerpt_en) on public.news_items to anon;

-- Columnas públicas nuevas del informe (eval, orig_en: nunca).
grant select (text_en) on public.ods_report_blocks to anon;
grant select (image_id, photo_key) on public.ods_report_photos to anon;
grant select (ficha) on public.ods_report_indicators to anon;

-- La página de evidencia ---------------------------------------------------------------
drop function if exists public.ods_evidencia(int, text);
create function public.ods_evidencia(p_ods int, p_indicator text)
returns table (
  indicator    text,
  ods          int,
  edition      int,
  title        text,
  title_en     text,
  published_on date,
  section      text,
  campus       text,
  image_url    text,
  url          text,
  page_es      jsonb,
  page_en      text,
  ficha        jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select e.indicator, r.ods::int, r.edition, n.title, n.title_en, n.published_on, n.section, n.campus,
         (select coalesce(im.url, n.image_url)
            from public.ods_report_photos f
            left join public.news_images im on im.id = f.image_id
           where f.report_id = r.id and f.news_id = n.id and f.use and (not f.minors or f.cleared)
           order by (f.slot = 'portada') desc, (f.slot in ('n1', 'n2')) desc
           limit 1),
         n.url, e.page_es, e.page_en, e.ficha
    from public.ods_report_indicators e
    join public.ods_reports r on r.id = e.report_id
    join public.news_items n on n.id = e.news_id
   where r.ods = p_ods
     and r.state = 'publicado'
     and e.indicator = p_indicator
     and e.approved
     and n.state = 'ok'
   order by r.edition desc
   limit 1;
$$;

revoke all on function public.ods_evidencia(int, text) from public;
grant execute on function public.ods_evidencia(int, text) to anon, authenticated, service_role;

-- Subtítulo temático de los párrafos ------------------------------------------------------
alter table public.ods_report_blocks add column if not exists heading    text not null default '';
alter table public.ods_report_blocks add column if not exists heading_en text not null default '';
grant select (heading, heading_en) on public.ods_report_blocks to anon;

-- Registro de actividades -------------------------------------------------------------------
drop function if exists public.ods_registro(int, int);
create function public.ods_registro(p_ods int, p_edition int)
returns table (
  news_id      uuid,
  published_on date,
  campus       text,
  section      text,
  title        text,
  title_en     text,
  url          text,
  figure_value text,
  figure_label text,
  en_narrativa boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select id from public.ods_reports where ods = p_ods and edition = p_edition and state = 'publicado'
  ),
  citadas as (
    select distinct (s ->> 'news_id') as news_id
      from public.ods_report_blocks b, jsonb_array_elements(b.sources) s
     where b.report_id in (select id from r) and b.enabled and not b.spare and coalesce(s ->> 'news_id', '') <> ''
  )
  select n.id, n.published_on, n.campus, n.section, n.title, n.title_en, n.url,
         f.value, f.label,
         exists (select 1 from citadas c where c.news_id = n.id::text)
    from public.news_items n
    join public.news_ods o on o.news_id = n.id and o.ods = p_ods
    left join lateral (
      select x.value, x.label from public.news_figures x
       where x.news_id = n.id and x.score > 0
       order by x.score desc, x.created_at
       limit 1
    ) f on true
   where n.state = 'ok' and exists (select 1 from r)
   order by n.published_on nulls last, n.title;
$$;

revoke all on function public.ods_registro(int, int) from public;
grant execute on function public.ods_registro(int, int) to anon, authenticated, service_role;

-- Proveedor de IA de los rankings --------------------------------------------------------------
alter table public.news_settings add column if not exists ai_provider     text not null default 'pilo';
alter table public.news_settings add column if not exists ai_model        text not null default '';
alter table public.news_settings add column if not exists ai_vision_model text not null default '';
alter table public.news_settings add column if not exists ai_batch        int  not null default 0;
alter table public.news_settings drop constraint if exists news_settings_ai;
alter table public.news_settings add constraint news_settings_ai check (
  ai_provider in ('pilo', 'mistral')
  and ai_batch between 0 and 8
  and ai_model ~ '^[A-Za-z0-9._:/-]{0,100}$'
  and ai_vision_model ~ '^[A-Za-z0-9._:/-]{0,100}$'
);

-- Planeación cambia pilo_aprueba y umbral; el proveedor de IA, solo la administración.
create or replace function public.news_settings_ai_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.ai_provider, new.ai_model, new.ai_vision_model, new.ai_batch)
         is distinct from (old.ai_provider, old.ai_model, old.ai_vision_model, old.ai_batch) then
    raise exception 'Solo la administración cambia el proveedor de IA de los rankings.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists news_settings_ai_admin on public.news_settings;
create trigger news_settings_ai_admin before update on public.news_settings
  for each row execute function public.news_settings_ai_admin();
