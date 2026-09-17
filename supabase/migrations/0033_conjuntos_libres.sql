-- =============================================================================
-- PDI · 0033 · Conjuntos libres
--
-- Una fuente de datos con las columnas que define quien la reporta y las filas
-- que quiera, y las gráficas que se arman sobre ella: barras (simples,
-- apiladas y al 100 %), circular, dona, radar, líneas, área, histograma,
-- diagrama de caja, cascada, Gantt, mapa, cifras clave y tabla.
--
--   od_free_sets      la fuente: título, temporalidad, columnas y vistas
--   od_free_set_rows  una fila de la fuente, con sus casillas en jsonb
--
-- Temporalidad (temporality):
--   sin_tiempo   un dato suelto, sin año
--   anual        cada fila lleva su año (year)
--   periodo      un dato global para un rango; period_label lo nombra ("2020–2025")
--
-- columns  [{key, label, kind, format?, unit?, territory?}]
--          kind: texto | cifra | fecha | territorio
--          format: entero | decimal | porcentaje; territory: departamento | pais
-- views    [{key, title, description?, type, category?, series?, orientation?,
--            sort?, bins?, start?, end?, total?}]
-- cells    {"<clave de columna>": "texto" | 123.4 | null}
--
-- Cada gráfica lee una sola fuente. El bloque "libre" de la ficha apunta a la
-- fuente (ref_id) y, con settings.view, a una de sus vistas; sin vista, las
-- muestra todas. Requiere 0019, 0022, 0024, 0030 y 0031. Idempotente.
-- =============================================================================

alter type public.od_block_kind add value if not exists 'libre';

-- -----------------------------------------------------------------------------
-- 1. Fuentes y filas
-- -----------------------------------------------------------------------------

create table if not exists public.od_free_sets (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.od_reports (id) on delete cascade,
  key          text not null,
  title        text not null,
  description  text not null default '',
  temporality  text not null default 'sin_tiempo',
  period_label text not null default '',
  columns      jsonb not null default '[]'::jsonb,
  views        jsonb not null default '[]'::jsonb,
  office_id    uuid references public.od_offices (id) on delete set null,
  position     smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint od_free_sets_key_unique unique (report_id, key),
  constraint od_free_sets_temporality check (temporality in ('sin_tiempo', 'anual', 'periodo')),
  constraint od_free_sets_lists check (jsonb_typeof(columns) = 'array' and jsonb_typeof(views) = 'array')
);

comment on table public.od_free_sets is
  'Conjunto libre de un informe: columnas definidas por quien reporta, temporalidad y las gráficas que se arman sobre él.';

drop trigger if exists od_free_sets_set_updated_at on public.od_free_sets;
create trigger od_free_sets_set_updated_at
  before update on public.od_free_sets
  for each row execute function public.set_updated_at();

create table if not exists public.od_free_set_rows (
  id        uuid primary key default gen_random_uuid(),
  set_id    uuid not null references public.od_free_sets (id) on delete cascade,
  position  integer not null default 0,
  year      smallint,
  cells     jsonb not null default '{}'::jsonb,
  constraint od_free_set_rows_position_unique unique (set_id, position),
  constraint od_free_set_rows_year check (year is null or year between 1900 and 2200),
  constraint od_free_set_rows_cells check (jsonb_typeof(cells) = 'object')
);

create index if not exists od_free_set_rows_set on public.od_free_set_rows (set_id);

-- Borrar una fuente se lleva sus bloques (el disparador es el de 0019).
drop trigger if exists od_free_sets_drop_blocks on public.od_free_sets;
create trigger od_free_sets_drop_blocks after delete on public.od_free_sets
  for each row execute function public.od_drop_dataset_blocks();

-- -----------------------------------------------------------------------------
-- 2. Permisos: informe por informe (0024)
-- -----------------------------------------------------------------------------

alter table public.od_free_sets enable row level security;
alter table public.od_free_set_rows enable row level security;

drop policy if exists od_free_sets_read on public.od_free_sets;
create policy od_free_sets_read on public.od_free_sets for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_free_sets_write on public.od_free_sets;
create policy od_free_sets_write on public.od_free_sets for all to authenticated
  using (public.od_can_edit_report(report_id)) with check (public.od_can_edit_report(report_id));

drop policy if exists od_free_set_rows_read on public.od_free_set_rows;
create policy od_free_set_rows_read on public.od_free_set_rows for select to anon, authenticated
  using (public.od_can_read((select fs.report_id from public.od_free_sets fs where fs.id = set_id)));

drop policy if exists od_free_set_rows_write on public.od_free_set_rows;
create policy od_free_set_rows_write on public.od_free_set_rows for all to authenticated
  using (public.od_can_edit_report((select fs.report_id from public.od_free_sets fs where fs.id = set_id)))
  with check (public.od_can_edit_report((select fs.report_id from public.od_free_sets fs where fs.id = set_id)));

grant select on public.od_free_sets, public.od_free_set_rows to anon, authenticated;
grant select, insert, update, delete on public.od_free_sets, public.od_free_set_rows to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Abrir el periodo siguiente: igual que en 0031, más los conjuntos libres.
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
  sp record;
  new_saber uuid;
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

    insert into public.od_sections (report_id, key, number, title, status, lede, warning, source, requested, position)
    select new_report, key, number, title, 'no_recibido', '', '', '', requested, position
    from public.od_sections where report_id = r.id;

    insert into public.od_tables (report_id, key, title, description, display, columns, office_id, position)
    select new_report, key, title, description, display, columns, office_id, position
    from public.od_tables where report_id = r.id;

    -- Conjuntos libres: columnas y vistas pasan al periodo nuevo; las filas no,
    -- como en las tablas: el periodo nuevo las vuelve a reportar.
    insert into public.od_free_sets (report_id, key, title, description, temporality, period_label, columns, views, office_id, position)
    select new_report, key, title, description, temporality, period_label, columns, views, office_id, position
    from public.od_free_sets where report_id = r.id;

    insert into public.od_report_blocks (report_id, kind, ref_id, section_id, position, visible, settings)
    select new_report, b.kind,
      coalesce(
        (select d2.id from public.od_breakdowns d1 join public.od_breakdowns d2 on d2.key = d1.key and d2.report_id = new_report where d1.id = b.ref_id),
        (select h2.id from public.od_heatmaps h1 join public.od_heatmaps h2 on h2.key = h1.key and h2.report_id = new_report where h1.id = b.ref_id),
        (select m2.id from public.od_maps m1 join public.od_maps m2 on m2.key = m1.key and m2.report_id = new_report where m1.id = b.ref_id),
        (select p2.id from public.od_pipelines p1 join public.od_pipelines p2 on p2.key = p1.key and p2.report_id = new_report where p1.id = b.ref_id),
        (select s2.id from public.od_histories s1 join public.od_histories s2 on s2.key = s1.key and s2.report_id = new_report where s1.id = b.ref_id),
        (select t2.id from public.od_tables t1 join public.od_tables t2 on t2.key = t1.key and t2.report_id = new_report where t1.id = b.ref_id),
        (select f2.id from public.od_free_sets f1 join public.od_free_sets f2 on f2.key = f1.key and f2.report_id = new_report where f1.id = b.ref_id)
      ),
      (select s2.id from public.od_sections s1 join public.od_sections s2 on s2.key = s1.key and s2.report_id = new_report where s1.id = b.section_id),
      b.position, b.visible, b.settings
    from public.od_report_blocks b where b.report_id = r.id;

    insert into public.od_rankings (report_id, key, title, description, system, accent, view, office_id, position)
    select new_report, key, title, description, system, accent, view, office_id, position
    from public.od_rankings where report_id = r.id;

    for sp in select * from public.od_saber_pro where report_id = r.id loop
      insert into public.od_saber_pro (report_id, key, title, description, note, office_id, position)
      values (new_report, sp.key, sp.title, sp.description, sp.note, sp.office_id, sp.position)
      returning id into new_saber;

      insert into public.od_saber_pro_results
        (saber_id, year, scope, campus, faculty, program, competency, evaluated, mean, levels, histogram)
      select new_saber, year, scope, campus, faculty, program, competency, evaluated, mean, levels, histogram
      from public.od_saber_pro_results where saber_id = sp.id;
    end loop;
  end loop;

  return target;
end;
$$;

grant execute on function public.od_copy_period(uuid, text, smallint, smallint) to authenticated;

notify pgrst, 'reload schema';
