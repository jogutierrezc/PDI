-- =============================================================================
-- 0143 · Recolector de noticias: las noticias de udes.edu.co clasificadas por ODS.
--
-- La función `noticias-ods` recorre el sitio de la UDES, guarda cada nota y le
-- propone los ODS que toca. Planeación las revisa en /admin/rankings; solo las
-- aprobadas aparecen en los informes públicos de THE Impact Rankings.
--
--   news_items   una fila por nota: enlace único, título, extracto, texto, imagen,
--                fecha, sección, sede y estado (pending | ok | no).
--   news_ods     los ODS de cada nota, con puntaje (0 a 100) y la razón. Los que
--                agrega o quita una persona llevan manual = true y no se pisan.
--   news_runs    la bitácora de cada carga (cuántas notas vio, guardó y descartó).
--
-- Quién puede qué:
--   · Planeación y la administración leen y escriben todo.
--   · El público (clave anónima) solo lee las notas aprobadas y sus ODS.
--   · La función escribe con la clave de servicio.
-- Una nota que ya existe nunca vuelve a «pending» al recargar: si Planeación la
-- aprobó o la descartó, esa decisión se respeta.
-- Todo DELETE y UPDATE lleva WHERE (safeupdate, ver 0095). Idempotente.
-- =============================================================================

create table if not exists public.news_items (
  id           uuid primary key default gen_random_uuid(),
  url          text not null unique,
  title        text not null,
  excerpt      text not null default '',
  body         text not null default '',
  image_url    text,
  published_on date,
  section      text not null default '',
  campus       text not null default '',
  state        text not null default 'pending',
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint news_items_state check (state in ('pending', 'ok', 'no')),
  constraint news_items_title check (length(title) between 1 and 400),
  constraint news_items_url check (url ~ '^https://')
);

create index if not exists news_items_state_idx on public.news_items (state, published_on desc);

create table if not exists public.news_ods (
  news_id uuid not null references public.news_items (id) on delete cascade,
  ods     smallint not null,
  score   smallint not null default 0,
  reason  text not null default '',
  manual  boolean not null default false,
  primary key (news_id, ods),
  constraint news_ods_range check (ods between 1 and 17),
  constraint news_ods_score check (score between 0 and 100)
);

create index if not exists news_ods_ods_idx on public.news_ods (ods);

create table if not exists public.news_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  source      text not null default '',
  seen        int not null default 0,
  saved       int not null default 0,
  skipped     int not null default 0,
  error       text
);

comment on table public.news_items is
  'Recolector de noticias (0143): notas de udes.edu.co. Solo las aprobadas (state = ok) son públicas.';

-- RLS --------------------------------------------------------------------------
alter table public.news_items enable row level security;
alter table public.news_ods   enable row level security;
alter table public.news_runs  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['news_items','news_ods','news_runs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_planeacion', t);
    execute format($p$create policy %I on public.%I for all to authenticated using (public.has_role_at_least('planeacion')) with check (public.has_role_at_least('planeacion'))$p$, t || '_planeacion', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- El público lee solo lo aprobado.
drop policy if exists news_items_publico on public.news_items;
create policy news_items_publico on public.news_items for select to anon, authenticated using (state = 'ok');
drop policy if exists news_ods_publico on public.news_ods;
create policy news_ods_publico on public.news_ods for select to anon, authenticated
  using (exists (select 1 from public.news_items i where i.id = news_id and i.state = 'ok'));

-- Del texto completo no se sirve nada al público: solo título, extracto, imagen y enlace.
revoke select on public.news_items from anon;
grant select (id, url, title, excerpt, image_url, published_on, section, campus, state) on public.news_items to anon;
grant select on public.news_ods to anon;
