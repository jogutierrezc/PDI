-- =============================================================================
-- PDI · 0056 · Medallero
--
-- Lo que gana la universidad cuando compite: juegos, festivales, concursos.
-- Nace para Bienestar Institucional, pero es un bloque como cualquier otro y
-- puede añadirse a cualquier informe.
--
--   od_medal_boards    un medallero del informe: cómo se llama, cómo se llama
--                      su columna de filas ("Competencia", "Campus",
--                      "Disciplina" — lo decide la oficina), qué categorías de
--                      medalla usa, si reporta por año o por periodo académico
--                      y cómo se ordena.
--   od_medal_entries   una fila del medallero en un año: su rótulo y cuántas
--                      medallas de cada categoría.
--
-- Por qué las categorías van en jsonb y no en una tabla: la oficina las
-- nombra. Oro, plata y bronce es lo corriente, pero un concurso de
-- investigación premia «Primer puesto» y «Mención de honor», y un festival
-- reparte «Ganador» y «Finalista». Lo que no cambia es que están *ordenadas*:
-- la posición 1 pesa más que la 2. De ahí salen el orden del medallero y el
-- metal con el que se dibuja cada una.
--
--   tiers   [{key, label, position}]   position 1 = la más alta
--   counts  {"<key de la categoría>": n}
--
-- Un recuento ausente y un cero no son lo mismo y no se dibujan igual: cero es
-- «compitió y no ganó», ausente es «no compitió». Por eso `counts` guarda solo
-- lo que se capturó y no rellena con ceros.
--
-- Las políticas siguen la forma de la 0055 —preguntar una vez por medallero y
-- no una vez por fila—, no la correlacionada que la 0055 vino a corregir.
--
-- Requiere 0019 (enum, od_reports, od_offices), 0024 (od_can_read,
-- od_can_edit_report) y 0026 (set_updated_at). Idempotente.
-- =============================================================================

alter type public.od_block_kind add value if not exists 'medallero';

-- -----------------------------------------------------------------------------
-- 1. El medallero
-- -----------------------------------------------------------------------------

create table if not exists public.od_medal_boards (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.od_reports (id) on delete cascade,
  key         text not null,
  title       text not null,
  description text not null default '',
  -- Cabecera de la columna de filas. La oficina decide qué compara.
  row_label   text not null default 'Competencia',
  -- anual | periodo  (el mismo par que el resto de UDES en Cifras)
  reporting   text not null default 'anual',
  -- acumulado: todo el periodo en una tabla | por_ano: un año a la vez
  scope       text not null default 'por_ano',
  -- Con scope = 'por_ano', el año con el que abre. Vacío = el último que tenga.
  fixed_year  smallint,
  -- medallero: se ordena por categorías, de la más alta a la más baja, y se
  -- numera el puesto | manual: el orden que dejó la oficina, sin puesto
  sort        text not null default 'medallero',
  tiers       jsonb not null default
    '[{"key":"oro","label":"Oro","position":1},
      {"key":"plata","label":"Plata","position":2},
      {"key":"bronce","label":"Bronce","position":3}]'::jsonb,
  office_id   uuid references public.od_offices (id) on delete set null,
  note        text not null default '',
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint od_medal_boards_key_unique unique (report_id, key),
  constraint od_medal_boards_reporting check (reporting in ('anual', 'periodo')),
  constraint od_medal_boards_scope check (scope in ('acumulado', 'por_ano')),
  constraint od_medal_boards_sort check (sort in ('medallero', 'manual')),
  constraint od_medal_boards_year check (fixed_year is null or fixed_year between 2000 and 2100),
  constraint od_medal_boards_tiers check (jsonb_typeof(tiers) = 'array' and jsonb_array_length(tiers) between 1 and 8)
);

comment on table public.od_medal_boards is
  'Un medallero de un informe: sus categorías de medalla, qué compara cada fila y cómo se ordena.';
comment on column public.od_medal_boards.row_label is
  'Cabecera de la columna de filas: «Competencia», «Campus», «Disciplina»… lo decide la oficina.';
comment on column public.od_medal_boards.tiers is
  'Categorías ordenadas [{key,label,position}]; la posición 1 es la más alta y manda en el orden del medallero.';

drop trigger if exists od_medal_boards_set_updated_at on public.od_medal_boards;
create trigger od_medal_boards_set_updated_at
  before update on public.od_medal_boards
  for each row execute function public.set_updated_at();

create index if not exists od_medal_boards_report on public.od_medal_boards (report_id, position);

-- -----------------------------------------------------------------------------
-- 2. Las filas
-- -----------------------------------------------------------------------------

create table if not exists public.od_medal_entries (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.od_medal_boards (id) on delete cascade,
  year       smallint not null,
  -- 'A' o 'B' cuando el medallero reporta por periodo académico; vacío si es anual.
  term       text,
  label      text not null,
  counts     jsonb not null default '{}'::jsonb,
  note       text not null default '',
  position   smallint not null default 0,
  updated_at timestamptz not null default now(),
  constraint od_medal_entries_year check (year between 2000 and 2100),
  constraint od_medal_entries_term check (term is null or term in ('A', 'B')),
  constraint od_medal_entries_label check (length(btrim(label)) > 0),
  constraint od_medal_entries_counts check (jsonb_typeof(counts) = 'object')
);

comment on table public.od_medal_entries is
  'Una fila de un medallero en un año: su rótulo y cuántas medallas de cada categoría.';
comment on column public.od_medal_entries.counts is
  'Recuento por categoría {"oro": 3}. Lo que no está no se capturó: no compitió. Un cero sí es «compitió y no ganó».';

-- La misma fila no puede capturarse dos veces en el mismo corte. `nulls not
-- distinct` es lo que hace que dos filas anuales (term vacío) con el mismo
-- rótulo choquen; sin eso, Postgres las daría por distintas.
create unique index if not exists od_medal_entries_unique
  on public.od_medal_entries (board_id, year, term, label) nulls not distinct;

create index if not exists od_medal_entries_board on public.od_medal_entries (board_id, year);

drop trigger if exists od_medal_entries_set_updated_at on public.od_medal_entries;
create trigger od_medal_entries_set_updated_at
  before update on public.od_medal_entries
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Permisos
--
-- Igual que el resto de UDES en Cifras: público lo publicado, y escribe quien
-- puede editar ese informe. Las filas preguntan por su medallero con una
-- subconsulta *sin correlacionar*, que se resuelve una vez por sentencia; la
-- forma correlacionada es justo la que la 0055 vino a quitar.
-- -----------------------------------------------------------------------------

alter table public.od_medal_boards enable row level security;
alter table public.od_medal_entries enable row level security;

drop policy if exists od_medal_boards_read on public.od_medal_boards;
create policy od_medal_boards_read on public.od_medal_boards for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_medal_boards_write on public.od_medal_boards;
create policy od_medal_boards_write on public.od_medal_boards for all to authenticated
  using (public.od_can_edit_report(report_id)) with check (public.od_can_edit_report(report_id));

drop policy if exists od_medal_entries_read on public.od_medal_entries;
create policy od_medal_entries_read on public.od_medal_entries for select to anon, authenticated
  using (board_id in (select b.id from public.od_medal_boards b where public.od_can_read(b.report_id)));

drop policy if exists od_medal_entries_write on public.od_medal_entries;
create policy od_medal_entries_write on public.od_medal_entries for all to authenticated
  using (board_id in (select b.id from public.od_medal_boards b where public.od_can_edit_report(b.report_id)))
  with check (board_id in (select b.id from public.od_medal_boards b where public.od_can_edit_report(b.report_id)));

grant select on public.od_medal_boards, public.od_medal_entries to anon, authenticated;
grant select, insert, update, delete on public.od_medal_boards, public.od_medal_entries to authenticated;

notify pgrst, 'reload schema';
