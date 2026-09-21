-- =============================================================================
-- PDI · 0058 · Mis Tableros
--
-- Cada unidad arma sus propios tableros: sube tablas, las dibuja y saca su
-- boletín. Es el taller del Observatorio, pero por unidad y con su propia
-- escalera de visibilidad.
--
--   boards            un tablero de una unidad: cómo se llama, qué páginas
--                     tiene y quién puede verlo.
--   board_datasets    sus tablas de datos.
--   board_views       los visores (gráficas) sobre esas tablas.
--   board_bulletins   el recorte del que sale el PDF.
--   board_reviews     la cola de publicación: quién pidió, qué comprobó el
--                     sistema y quién resolvió.
--
-- POR QUÉ `board_datasets` Y `board_views` COPIAN LA FORMA DE LAS DEL
-- OBSERVATORIO
--
-- Porque así `ObsChart` y `RawTable` las dibujan sin tocar una línea. Se
-- decidió no reutilizar las tablas `obs_*` mismas —el Observatorio es uno,
-- institucional y de Planeación; esto son muchos y de cada unidad, con otras
-- políticas— pero sí su forma, que es lo que hace el trabajo.
--
-- LA ESCALERA
--
--   unidad       la ven los suyos (y Planeación, que ve todo).
--   universidad  la ve cualquiera con sesión. Lo decide el jefe.
--   publico      la ve cualquiera. La aprueba Planeación.
--
-- La dirección del tablero no cambia al subir un peldaño: lo que cambia es a
-- quién le responde la base. Lo que alguien citó cuando era interno sigue
-- sirviendo cuando es público.
--
-- LAS POLÍTICAS DE LAS TABLAS HIJAS
--
-- Preguntan `board_id in (select b.id from public.boards b)`, sin correlacionar
-- con la fila. La subconsulta ya viene filtrada por la política de `boards`
-- —RLS se aplica también dentro de una subconsulta—, así que dice exactamente
-- «los tableros que esta persona puede leer», se resuelve una vez por
-- sentencia y no una vez por fila. Es la forma que la 0055 vino a imponer.
--
-- Requiere 0057 (units, unit_can_*) y 0026 (set_updated_at). Idempotente.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'board_visibility') then
    create type public.board_visibility as enum ('unidad', 'universidad', 'publico');
  end if;
  if not exists (select 1 from pg_type where typname = 'board_review_state') then
    create type public.board_review_state as enum ('pendiente', 'aprobada', 'devuelta');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. El tablero
-- -----------------------------------------------------------------------------

create table if not exists public.boards (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units (id) on delete cascade,
  slug        text not null,
  title       text not null,
  description text not null default '',
  visibility  public.board_visibility not null default 'unidad',
  -- Las pestañas del tablero: [{slug, title}]. Un visor dice en cuál va.
  pages       jsonb not null default '[{"slug":"panorama","title":"Panorama"}]'::jsonb,
  position    smallint not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint boards_slug_unique unique (unit_id, slug),
  constraint boards_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint boards_pages check (jsonb_typeof(pages) = 'array' and jsonb_array_length(pages) between 1 and 12)
);

comment on table public.boards is
  'Un tablero de una unidad: sus páginas y quién puede verlo. La dirección es /tableros/<unidad>/<tablero>.';
comment on column public.boards.visibility is
  'unidad: los suyos y Planeación · universidad: cualquiera con sesión · publico: cualquiera, previa aprobación de Planeación.';

create index if not exists boards_unit_idx on public.boards (unit_id, position);

drop trigger if exists boards_set_updated_at on public.boards;
create trigger boards_set_updated_at before update on public.boards
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Las tablas de datos y sus visores
--
-- Misma forma que obs_datasets y obs_views (0049), para que las dibuje el
-- mismo código.
-- -----------------------------------------------------------------------------

create table if not exists public.board_datasets (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.boards (id) on delete cascade,
  title         text not null,
  description   text not null default '',
  source        text not null default '',
  data_type     text not null default 'conteo',
  temporality   text not null default 'sin_tiempo',
  period_label  text not null default '',
  columns       jsonb not null default '[]'::jsonb,
  rows          jsonb not null default '[]'::jsonb,
  anonymization jsonb,
  position      smallint not null default 0,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint board_datasets_temporality check (temporality in ('sin_tiempo', 'anual', 'periodo')),
  constraint board_datasets_data_type check (data_type in ('conteo', 'tasa', 'serie', 'distribucion', 'georreferenciado', 'modelo', 'encuesta')),
  constraint board_datasets_shapes check (jsonb_typeof(columns) = 'array' and jsonb_typeof(rows) = 'array')
);

comment on table public.board_datasets is
  'Tabla de datos de un tablero, agregada y anonimizada en la intranet antes de guardarse. Sin microdatos ni datos personales.';

create index if not exists board_datasets_board_idx on public.board_datasets (board_id, position);

create table if not exists public.board_views (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  dataset_id uuid not null references public.board_datasets (id) on delete cascade,
  -- El slug de la página del tablero en la que va.
  page       text not null default 'panorama',
  spec       jsonb not null default '{}'::jsonb,
  size       text not null default 'media',
  visible    boolean not null default true,
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_views_size check (size in ('media', 'completa')),
  constraint board_views_spec check (jsonb_typeof(spec) = 'object')
);

comment on table public.board_views is
  'Visor de un tablero: una gráfica sobre una tabla. `spec` lleva tipo, columnas y opciones, igual que en el Observatorio.';

create index if not exists board_views_board_idx on public.board_views (board_id, page, position);

create table if not exists public.board_bulletins (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  title      text not null,
  subtitle   text not null default '',
  settings   jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_bulletins_settings check (jsonb_typeof(settings) = 'object')
);

comment on table public.board_bulletins is
  'Boletín de un tablero: qué hojas entran, con qué corte y con qué portada. De aquí sale el PDF.';

create index if not exists board_bulletins_board_idx on public.board_bulletins (board_id);

do $$
declare t text;
begin
  foreach t in array array['board_datasets', 'board_views', 'board_bulletins'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. La cola de publicación
--
-- Las comprobaciones las hace la intranet al pedir la publicación y se guardan
-- escritas, para que quien aprueba lea un informe y no una casilla de
-- «acepto». Quedan en el historial aunque la solicitud se resuelva.
-- -----------------------------------------------------------------------------

create table if not exists public.board_reviews (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.boards (id) on delete cascade,
  -- A qué peldaño se quiere subir. Hoy siempre 'publico'; mañana puede haber más.
  target       public.board_visibility not null default 'publico',
  state        public.board_review_state not null default 'pendiente',
  -- [{key, ok, label, detail}] tal como se comprobó al pedirla.
  checks       jsonb not null default '[]'::jsonb,
  note         text not null default '',
  requested_by uuid references public.profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz,
  resolution   text not null default '',
  constraint board_reviews_checks check (jsonb_typeof(checks) = 'array')
);

comment on table public.board_reviews is
  'Solicitud de publicación de un tablero, con lo que el sistema comprobó y cómo la resolvió Planeación.';

create index if not exists board_reviews_board_idx on public.board_reviews (board_id, requested_at desc);
-- Una sola solicitud pendiente por tablero: pedirla dos veces no hace cola.
create unique index if not exists board_reviews_one_open
  on public.board_reviews (board_id) where state = 'pendiente';

-- -----------------------------------------------------------------------------
-- 4. Permisos
-- -----------------------------------------------------------------------------

alter table public.boards enable row level security;
alter table public.board_datasets enable row level security;
alter table public.board_views enable row level security;
alter table public.board_bulletins enable row level security;
alter table public.board_reviews enable row level security;

drop policy if exists boards_read on public.boards;
create policy boards_read on public.boards for select to anon, authenticated
  using (
    visibility = 'publico'
    or (visibility = 'universidad' and auth.uid() is not null)
    or public.unit_can_view(unit_id)
  );

-- Crear y borrar tableros es del jefe; corregir el contenido, del editor. Las
-- dos cosas caben en una política porque `boards` solo guarda la carátula: las
-- cifras están en las tablas hijas, que sí distinguen.
drop policy if exists boards_write on public.boards;
create policy boards_write on public.boards for all to authenticated
  using (public.unit_can_lead(unit_id))
  with check (public.unit_can_lead(unit_id));

drop policy if exists board_datasets_read on public.board_datasets;
create policy board_datasets_read on public.board_datasets for select to anon, authenticated
  using (board_id in (select b.id from public.boards b));

drop policy if exists board_datasets_write on public.board_datasets;
create policy board_datasets_write on public.board_datasets for all to authenticated
  using (board_id in (select b.id from public.boards b where public.unit_can_edit(b.unit_id)))
  with check (board_id in (select b.id from public.boards b where public.unit_can_edit(b.unit_id)));

drop policy if exists board_views_read on public.board_views;
create policy board_views_read on public.board_views for select to anon, authenticated
  using (board_id in (select b.id from public.boards b));

drop policy if exists board_views_write on public.board_views;
create policy board_views_write on public.board_views for all to authenticated
  using (board_id in (select b.id from public.boards b where public.unit_can_edit(b.unit_id)))
  with check (board_id in (select b.id from public.boards b where public.unit_can_edit(b.unit_id)));

-- El boletín es del taller: no se publica solo, se descarga. Solo lo ve quien
-- puede editar el tablero.
drop policy if exists board_bulletins_read on public.board_bulletins;
create policy board_bulletins_read on public.board_bulletins for select to authenticated
  using (board_id in (select b.id from public.boards b where public.unit_can_view(b.unit_id)));

drop policy if exists board_bulletins_write on public.board_bulletins;
create policy board_bulletins_write on public.board_bulletins for all to authenticated
  using (board_id in (select b.id from public.boards b where public.unit_can_edit(b.unit_id)))
  with check (board_id in (select b.id from public.boards b where public.unit_can_edit(b.unit_id)));

-- La solicitud la lee la unidad y Planeación; la crea el jefe; la resuelve
-- Planeación. Por eso la escritura va partida en dos políticas.
drop policy if exists board_reviews_read on public.board_reviews;
create policy board_reviews_read on public.board_reviews for select to authenticated
  using (board_id in (select b.id from public.boards b where public.unit_can_view(b.unit_id)));

drop policy if exists board_reviews_request on public.board_reviews;
create policy board_reviews_request on public.board_reviews for insert to authenticated
  with check (board_id in (select b.id from public.boards b where public.unit_can_lead(b.unit_id)));

drop policy if exists board_reviews_resolve on public.board_reviews;
create policy board_reviews_resolve on public.board_reviews for update to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

drop policy if exists board_reviews_withdraw on public.board_reviews;
create policy board_reviews_withdraw on public.board_reviews for delete to authenticated
  using (state = 'pendiente' and board_id in (select b.id from public.boards b where public.unit_can_lead(b.unit_id)));

grant select on public.boards, public.board_datasets, public.board_views to anon, authenticated;
grant select, insert, update, delete on
  public.boards, public.board_datasets, public.board_views, public.board_bulletins, public.board_reviews
  to authenticated;

notify pgrst, 'reload schema';
