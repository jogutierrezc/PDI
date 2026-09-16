-- =============================================================================
-- PDI · 0030 · Rankings universitarios
--
-- Cómo aparece la UDES en los rankings que sigue Planeación: QS World, QS Latin
-- America & The Caribbean, QS Subject, QS Sustainability, THE Latin America y
-- THE Impact (por ODS), u otro con nombre propio.
--
--   od_rankings           un ranking del informe: sistema, color de acento con
--                         el que se dibuja y la vista con la que abre la ficha
--                         (medallas, tabla, evolución u ODS)
--   od_ranking_editions   una edición por año: posiciones mundial, en
--                         Latinoamérica y en Colombia (número "145" o banda
--                         "801-1000"), puntaje, estrellas QS por categoría,
--                         ODS en los que participó con su posición, posiciones
--                         por área (QS Subject) y campos propios.
--
-- Las listas de una edición (estrellas, ODS, áreas, campos) viajan en jsonb:
-- se capturan y se guardan juntas desde la intranet.
--
--   stars    [{category, stars}]                 stars de 0 a 5
--   sdgs     [{sdg, global_rank, national_rank, score}]   sdg de 1 a 17
--   subjects [{subject, global_rank, national_rank}]
--   custom   [{label, value}]
--
-- El bloque "rankings" de la ficha muestra los rankings del informe con su
-- selector de vista. Requiere 0019, 0022, 0024 y 0026. Idempotente.
-- =============================================================================

alter type public.od_block_kind add value if not exists 'rankings';

-- -----------------------------------------------------------------------------
-- 1. Rankings y ediciones
-- -----------------------------------------------------------------------------

create table if not exists public.od_rankings (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.od_reports (id) on delete cascade,
  key         text not null,
  title       text not null,
  description text not null default '',
  -- qs_world | qs_latam | qs_subject | qs_sustainability | the_latam | the_impact | otro
  system      text not null default 'otro',
  -- Color de acento en hexadecimal (#1f5fbf).
  accent      text not null default '#1f5fbf',
  -- Vista con la que abre: medallas | tabla | evolucion | ods
  view        text not null default 'medallas',
  office_id   uuid references public.od_offices (id) on delete set null,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint od_rankings_key_unique unique (report_id, key),
  constraint od_rankings_system check (system in ('qs_world', 'qs_latam', 'qs_subject', 'qs_sustainability', 'the_latam', 'the_impact', 'otro')),
  constraint od_rankings_accent check (accent ~ '^#[0-9a-fA-F]{6}$'),
  constraint od_rankings_view check (view in ('medallas', 'tabla', 'evolucion', 'ods'))
);

comment on table public.od_rankings is
  'Rankings universitarios de un informe (QS, THE…): sistema, color de acento y vista por defecto.';

drop trigger if exists od_rankings_set_updated_at on public.od_rankings;
create trigger od_rankings_set_updated_at
  before update on public.od_rankings
  for each row execute function public.set_updated_at();

-- Posición: "145", "=145" o banda "801-1000" / "1001+". Vacío = no aparece.
create or replace function public.od_rank_is_valid(value text)
returns boolean
language sql
immutable
as $$
  select value is null or value = '' or value ~ '^=?[0-9]{1,5}=?$' or value ~ '^[0-9]{1,5} ?[-–] ?[0-9]{1,5}$' or value ~ '^[0-9]{1,5}\+$';
$$;

create table if not exists public.od_ranking_editions (
  id             uuid primary key default gen_random_uuid(),
  ranking_id     uuid not null references public.od_rankings (id) on delete cascade,
  year           smallint not null,
  global_rank    text not null default '',
  regional_rank  text not null default '',
  national_rank  text not null default '',
  -- Puesto entre cuántas instituciones evaluadas (opcional).
  evaluated      integer,
  score          numeric,
  stars          jsonb not null default '[]'::jsonb,
  sdgs           jsonb not null default '[]'::jsonb,
  subjects       jsonb not null default '[]'::jsonb,
  custom         jsonb not null default '[]'::jsonb,
  note           text not null default '',
  updated_at     timestamptz not null default now(),
  constraint od_ranking_editions_unique unique (ranking_id, year),
  constraint od_ranking_editions_year check (year between 2000 and 2100),
  constraint od_ranking_editions_ranks check (
    public.od_rank_is_valid(global_rank) and public.od_rank_is_valid(regional_rank) and public.od_rank_is_valid(national_rank)
  ),
  constraint od_ranking_editions_lists check (
    jsonb_typeof(stars) = 'array' and jsonb_typeof(sdgs) = 'array' and jsonb_typeof(subjects) = 'array' and jsonb_typeof(custom) = 'array'
  )
);

comment on table public.od_ranking_editions is
  'Una edición anual de un ranking: posiciones, puntaje, estrellas, ODS, áreas y campos propios.';

create index if not exists od_ranking_editions_ranking on public.od_ranking_editions (ranking_id);

drop trigger if exists od_ranking_editions_set_updated_at on public.od_ranking_editions;
create trigger od_ranking_editions_set_updated_at
  before update on public.od_ranking_editions
  for each row execute function public.set_updated_at();

-- Borrar un ranking no deja bloques colgando: el bloque "rankings" es del
-- informe, no de un ranking, así que no hay nada que limpiar.

-- -----------------------------------------------------------------------------
-- 2. Permisos: como el resto de UDES en Cifras, informe por informe (0024)
-- -----------------------------------------------------------------------------

alter table public.od_rankings enable row level security;
alter table public.od_ranking_editions enable row level security;

drop policy if exists od_rankings_read on public.od_rankings;
create policy od_rankings_read on public.od_rankings for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_rankings_write on public.od_rankings;
create policy od_rankings_write on public.od_rankings for all to authenticated
  using (public.od_can_edit_report(report_id)) with check (public.od_can_edit_report(report_id));

drop policy if exists od_ranking_editions_read on public.od_ranking_editions;
create policy od_ranking_editions_read on public.od_ranking_editions for select to anon, authenticated
  using (public.od_can_read((select rk.report_id from public.od_rankings rk where rk.id = ranking_id)));

drop policy if exists od_ranking_editions_write on public.od_ranking_editions;
create policy od_ranking_editions_write on public.od_ranking_editions for all to authenticated
  using (public.od_can_edit_report((select rk.report_id from public.od_rankings rk where rk.id = ranking_id)))
  with check (public.od_can_edit_report((select rk.report_id from public.od_rankings rk where rk.id = ranking_id)));

grant select on public.od_rankings, public.od_ranking_editions to anon, authenticated;
grant select, insert, update, delete on public.od_rankings, public.od_ranking_editions to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Abrir el periodo siguiente: igual que en 0026, más la definición de los
--    rankings (sus ediciones anuales no se copian).
-- -----------------------------------------------------------------------------

create or replace function public.od_copy_period(source uuid, new_label text, new_start smallint, new_end smallint)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  target uuid;
  r record;
  new_report uuid;
begin
  if not public.has_role_at_least('planeacion') then
    raise exception 'Solo Planeación puede abrir periodos.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.od_periods (label, start_year, end_year, illustrative, status)
  values (new_label, new_start, new_end, false, 'borrador')
  returning id into target;

  insert into public.od_period_campuses (period_id, campus_id, label, slug, position)
  select target, campus_id, label, slug, position from public.od_period_campuses where period_id = source;

  for r in select * from public.od_reports where period_id = source loop
    insert into public.od_reports
      (period_id, slug, code, name, summary, description, image_url, image_alt, image_credit, line, note, position, status)
    values
      (target, r.slug, r.code, r.name, r.summary, r.description, r.image_url, r.image_alt, r.image_credit, r.line, r.note, r.position, 'borrador')
    returning id into new_report;

    insert into public.od_indicators
      (report_id, key, label, unit, format, direction, aggregation, reporting, annual_rule, years, definition, office_id, position, is_kpi, kpi_position, is_headline)
    select new_report, key, label, unit, format, direction, aggregation, reporting, annual_rule, null, definition, office_id, position, is_kpi, kpi_position, is_headline
    from public.od_indicators where report_id = r.id;

    insert into public.od_breakdowns (report_id, key, title, unit, format, office_id, default_chart, reporting, annual_rule, years, position)
    select new_report, key, title, unit, format, office_id, default_chart, reporting, annual_rule, null, position
    from public.od_breakdowns where report_id = r.id;

    insert into public.od_heatmaps
      (report_id, key, title, description, row_label, column_label, rows, columns, unit, format, office_id, empty_meaning, position)
    select new_report, key, title, description, row_label, column_label, rows, columns, unit, format, office_id, empty_meaning, position
    from public.od_heatmaps where report_id = r.id;

    insert into public.od_maps (report_id, key, title, description, mode, reporting, unit, office_id, years, position)
    select new_report, key, title, description, mode, reporting, unit, office_id, null, position
    from public.od_maps where report_id = r.id;

    -- Un mapa de dato global (convenios vigentes) no pertenece a ningún año: sus
    -- cifras pasan al periodo nuevo tal cual. Los mapas por año arrancan vacíos.
    insert into public.od_map_values (map_id, year, campus_id, department_code, value)
    select m2.id, v.year, v.campus_id, v.department_code, v.value
    from public.od_maps m1
    join public.od_maps m2 on m2.key = m1.key and m2.report_id = new_report
    join public.od_map_values v on v.map_id = m1.id and v.year = 0
    where m1.report_id = r.id and m1.reporting = 'global';

    insert into public.od_pipelines (report_id, key, title, description, measure, stages, office_id, position)
    select new_report, key, title, description, measure, stages, office_id, position
    from public.od_pipelines where report_id = r.id;

    insert into public.od_histories (report_id, key, title, description, unit, format, total_label, office_id, position)
    select new_report, key, title, description, unit, format, total_label, office_id, position
    from public.od_histories where report_id = r.id;

    -- Secciones sin texto de cifras: el periodo nuevo las vuelve a llenar.
    insert into public.od_sections (report_id, key, number, title, status, lede, warning, source, requested, position)
    select new_report, key, number, title, 'no_recibido', '', '', '', requested, position
    from public.od_sections where report_id = r.id;

    insert into public.od_tables (report_id, key, title, description, display, columns, office_id, position)
    select new_report, key, title, description, display, columns, office_id, position
    from public.od_tables where report_id = r.id;

    -- Los bloques se reenganchan por clave al conjunto y a la sección copiados.
    insert into public.od_report_blocks (report_id, kind, ref_id, section_id, position, visible, settings)
    select new_report, b.kind,
      coalesce(
        (select d2.id from public.od_breakdowns d1 join public.od_breakdowns d2 on d2.key = d1.key and d2.report_id = new_report where d1.id = b.ref_id),
        (select h2.id from public.od_heatmaps h1 join public.od_heatmaps h2 on h2.key = h1.key and h2.report_id = new_report where h1.id = b.ref_id),
        (select m2.id from public.od_maps m1 join public.od_maps m2 on m2.key = m1.key and m2.report_id = new_report where m1.id = b.ref_id),
        (select p2.id from public.od_pipelines p1 join public.od_pipelines p2 on p2.key = p1.key and p2.report_id = new_report where p1.id = b.ref_id),
        (select s2.id from public.od_histories s1 join public.od_histories s2 on s2.key = s1.key and s2.report_id = new_report where s1.id = b.ref_id),
        (select t2.id from public.od_tables t1 join public.od_tables t2 on t2.key = t1.key and t2.report_id = new_report where t1.id = b.ref_id)
      ),
      (select s2.id from public.od_sections s1 join public.od_sections s2 on s2.key = s1.key and s2.report_id = new_report where s1.id = b.section_id),
      b.position, b.visible, b.settings
    from public.od_report_blocks b where b.report_id = r.id;

    -- Rankings: la definición pasa al periodo nuevo; sus ediciones son de cada
    -- año y se quedan con el periodo en que se publicaron.
    insert into public.od_rankings (report_id, key, title, description, system, accent, view, office_id, position)
    select new_report, key, title, description, system, accent, view, office_id, position
    from public.od_rankings where report_id = r.id;
  end loop;

  return target;
end;
$$;

grant execute on function public.od_copy_period(uuid, text, smallint, smallint) to authenticated;

notify pgrst, 'reload schema';
