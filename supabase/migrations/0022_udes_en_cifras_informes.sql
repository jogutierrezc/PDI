-- =============================================================================
-- PDI · 0022 · UDES en Cifras · informes por secciones e importación
--
-- Un informe institucional (como la Sección Investigación del boletín) no es
-- solo cifras: se organiza en puntos, cada uno con su texto, su fuente y su
-- estado (completo, parcial, información no recibida, insumo no oficial), y
-- trae listados que no son series: rankings, fichas de institutos, cifras
-- acumuladas de un periodo.
--
--   od_sections      un punto del informe: número, título, estado, texto,
--                    advertencia, fuente y qué información falta y a quién
--   od_tables        tabla, ranking, fichas o cifras del periodo, con sus columnas
--   od_table_rows    filas de una tabla (celdas en jsonb, por clave de columna)
--   od_report_blocks.section_id   a qué punto pertenece cada bloque
--   reporting        en indicadores y desgloses: la cifra llega por periodo
--                    (A y B, el año sale de la regla) o por año (una sola cifra)
--
-- od_import_report(informe, plan) aplica un plan de importación (el JSON que
-- arma el importador de la intranet) en una sola transacción: rehace el
-- contenido del informe, no deja un informe a medias.
--
-- Requiere 0019-0021. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'od_section_status') then
    create type public.od_section_status as enum ('completo', 'parcial', 'no_recibido', 'no_oficial', 'abierto');
  end if;
  if not exists (select 1 from pg_type where typname = 'od_table_display') then
    create type public.od_table_display as enum ('tabla', 'ranking', 'fichas', 'cifras');
  end if;
  if not exists (select 1 from pg_type where typname = 'od_reporting') then
    create type public.od_reporting as enum ('periodo', 'anual');
  end if;
end $$;

alter type public.od_block_kind add value if not exists 'tabla';

-- -----------------------------------------------------------------------------
-- 2. Secciones
-- -----------------------------------------------------------------------------

create table if not exists public.od_sections (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.od_reports (id) on delete cascade,
  key         text not null,
  number      smallint,
  title       text not null,
  status      public.od_section_status not null default 'completo',
  -- La frase que abre el punto, con sus cifras.
  lede        text not null default '',
  -- Advertencia de cobertura o de calidad (información parcial, no oficial…).
  warning     text not null default '',
  -- Fuente y corte, como los escribe la oficina.
  source      text not null default '',
  -- Qué información falta: [{dato, responsable, periodicidad}].
  requested   jsonb not null default '[]'::jsonb,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint od_sections_key_unique unique (report_id, key)
);

drop trigger if exists od_sections_set_updated_at on public.od_sections;
create trigger od_sections_set_updated_at
  before update on public.od_sections
  for each row execute function public.set_updated_at();

alter table public.od_report_blocks
  add column if not exists section_id uuid references public.od_sections (id) on delete set null;

-- Un bloque de cada tipo por conjunto y por sección: cada punto puede tener su
-- propio tablero de KPI (antes era uno por informe).
alter table public.od_report_blocks drop constraint if exists od_report_blocks_unique;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'od_report_blocks_section_unique') then
    alter table public.od_report_blocks
      add constraint od_report_blocks_section_unique unique nulls not distinct (report_id, kind, ref_id, section_id);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Tablas: tabla, ranking, fichas y cifras del periodo
-- -----------------------------------------------------------------------------

create table if not exists public.od_tables (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.od_reports (id) on delete cascade,
  key         text not null,
  title       text not null,
  description text not null default '',
  display     public.od_table_display not null default 'tabla',
  -- [{key, label, format}] con format: entero | decimal | porcentaje | texto | enlace.
  columns     jsonb not null default '[]'::jsonb,
  office_id   uuid references public.od_offices (id) on delete set null,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  constraint od_tables_key_unique unique (report_id, key)
);

create table if not exists public.od_table_rows (
  id        uuid primary key default gen_random_uuid(),
  table_id  uuid not null references public.od_tables (id) on delete cascade,
  position  smallint not null default 0,
  cells     jsonb not null default '{}'::jsonb,
  constraint od_table_rows_position_unique unique (table_id, position)
);

create index if not exists od_table_rows_table on public.od_table_rows (table_id);

-- Borrar una tabla se lleva sus bloques (el disparador es el de 0019).
drop trigger if exists od_tables_drop_blocks on public.od_tables;
create trigger od_tables_drop_blocks after delete on public.od_tables
  for each row execute function public.od_drop_dataset_blocks();

-- -----------------------------------------------------------------------------
-- 4. Evolución histórica también por años sueltos ("2011"), no solo "2020-A"
-- -----------------------------------------------------------------------------

alter table public.od_history_values drop constraint if exists od_history_values_period;
alter table public.od_history_values
  add constraint od_history_values_period check (period_label ~ '^[0-9]{4}(-(A|B))?$');

-- -----------------------------------------------------------------------------
-- 4b. Periodicidad: por periodo (A y B) o por año
-- -----------------------------------------------------------------------------
-- Al crear la columna, lo que ya tiene cifras solo anuales queda "por año". Una
-- cifra por año no tiene regla: el año es lo reportado.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'od_indicators' and column_name = 'reporting') then
    alter table public.od_indicators add column reporting public.od_reporting not null default 'periodo';
    update public.od_indicators i set reporting = 'anual', annual_rule = 'reportado'
    where exists (select 1 from public.od_values v where v.indicator_id = i.id and v.term = 'anual')
      and not exists (select 1 from public.od_values v where v.indicator_id = i.id and v.term <> 'anual');
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'od_breakdowns' and column_name = 'reporting') then
    alter table public.od_breakdowns add column reporting public.od_reporting not null default 'periodo';
    update public.od_breakdowns b set reporting = 'anual', annual_rule = 'reportado'
    where exists (select 1 from public.od_breakdown_values v where v.breakdown_id = b.id and v.term = 'anual')
      and not exists (select 1 from public.od_breakdown_values v where v.breakdown_id = b.id and v.term <> 'anual');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Aplicar un plan de importación
-- -----------------------------------------------------------------------------

create or replace function public.od_import_report(target uuid, plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  rpt        public.od_reports;
  per        public.od_periods;
  office     uuid;
  item       jsonb;
  val        jsonb;
  pos        bigint;
  new_id     uuid;
  kpi_rank   integer := 0;
  n_values   integer := 0;
begin
  -- Desde la API (anon/authenticated) exige Planeación. Desde el editor SQL o
  -- una migración (postgres, service_role) no hay sesión de usuario y se permite.
  if current_user in ('anon', 'authenticated') and not public.has_role_at_least('planeacion') then
    raise exception 'Solo Planeación puede importar informes.' using errcode = 'insufficient_privilege';
  end if;
  select * into rpt from public.od_reports where id = target;
  if rpt.id is null then
    raise exception 'No existe el informe al que se quiere importar.' using errcode = 'no_data_found';
  end if;
  select * into per from public.od_periods where id = rpt.period_id;

  if coalesce(plan->>'office', '') <> '' then
    insert into public.od_offices (name, position)
    values (plan->>'office', (select coalesce(max(position), 0) + 1 from public.od_offices))
    on conflict (name) do nothing;
    select id into office from public.od_offices where name = plan->>'office';
  end if;

  -- Reemplazo completo: el informe queda exactamente como el plan.
  delete from public.od_report_blocks where report_id = target;
  delete from public.od_indicators where report_id = target;
  delete from public.od_breakdowns where report_id = target;
  delete from public.od_heatmaps where report_id = target;
  delete from public.od_maps where report_id = target;
  delete from public.od_pipelines where report_id = target;
  delete from public.od_histories where report_id = target;
  delete from public.od_tables where report_id = target;
  delete from public.od_sections where report_id = target;

  -- Secciones
  for item, pos in select e, o from jsonb_array_elements(coalesce(plan->'sections', '[]')) with ordinality as t(e, o) loop
    insert into public.od_sections (report_id, key, number, title, status, lede, warning, source, requested, position)
    values (
      target, item->>'key', nullif(item->>'number', '')::smallint, item->>'title',
      coalesce(nullif(item->>'status', ''), 'completo')::public.od_section_status,
      coalesce(item->>'lede', ''), coalesce(item->>'warning', ''), coalesce(item->>'source', ''),
      coalesce(item->'requested', '[]'::jsonb), pos
    );
  end loop;

  -- Indicadores y sus valores (solo años del periodo y campus del periodo)
  for item, pos in select e, o from jsonb_array_elements(coalesce(plan->'indicators', '[]')) with ordinality as t(e, o) loop
    if (item->>'is_kpi')::boolean then kpi_rank := kpi_rank + 1; end if;
    insert into public.od_indicators
      (report_id, key, label, unit, format, direction, aggregation, reporting, annual_rule, years, definition, office_id, position, is_kpi, kpi_position, is_headline)
    values (
      target, item->>'key', item->>'label', coalesce(item->>'unit', ''),
      (item->>'format')::public.od_value_format, (item->>'direction')::public.od_direction,
      (item->>'aggregation')::public.od_aggregation,
      coalesce(nullif(item->>'reporting', ''),
        case when exists (select 1 from jsonb_array_elements(coalesce(item->'values', '[]')) as v where v->>'term' <> 'anual') then 'periodo' else 'anual' end
      )::public.od_reporting,
      (item->>'annual_rule')::public.od_annual_rule,
      case when jsonb_typeof(item->'years') = 'array'
        then array(select y::smallint from jsonb_array_elements_text(item->'years') as y where y::int between per.start_year and per.end_year)
      end,
      coalesce(item->>'definition', ''), office, pos,
      coalesce((item->>'is_kpi')::boolean, false),
      case when (item->>'is_kpi')::boolean then kpi_rank end,
      (item->>'is_kpi')::boolean and kpi_rank = 1
    )
    returning id into new_id;

    insert into public.od_values (indicator_id, year, term, campus_id, value)
    select new_id, (v->>'year')::smallint, (v->>'term')::public.od_term, pc.campus_id, (v->>'value')::numeric
    from jsonb_array_elements(coalesce(item->'values', '[]')) as v
    left join public.od_period_campuses pc on pc.period_id = per.id and pc.slug = v->>'campus'
    where (v->>'year')::int between per.start_year and per.end_year
      and (v->>'campus' is null or pc.campus_id is not null);
    get diagnostics pos = row_count;
    n_values := n_values + pos;
  end loop;

  -- Desgloses
  for item, pos in select e, o from jsonb_array_elements(coalesce(plan->'breakdowns', '[]')) with ordinality as t(e, o) loop
    insert into public.od_breakdowns (report_id, key, title, unit, format, office_id, default_chart, reporting, annual_rule, position)
    values (
      target, item->>'key', item->>'title', coalesce(item->>'unit', ''), (item->>'format')::public.od_value_format, office,
      coalesce(nullif(item->>'chart', ''), 'barras')::public.od_chart_kind,
      coalesce(nullif(item->>'reporting', ''),
        case when exists (select 1 from jsonb_array_elements(coalesce(item->'values', '[]')) as v where v->>'term' <> 'anual') then 'periodo' else 'anual' end
      )::public.od_reporting,
      coalesce(nullif(item->>'annual_rule', ''), 'reportado')::public.od_annual_rule, pos
    )
    returning id into new_id;
    insert into public.od_breakdown_values (breakdown_id, year, term, label, position, value)
    select new_id, (v->>'year')::smallint, (v->>'term')::public.od_term, v->>'label', (v->>'position')::smallint, (v->>'value')::numeric
    from jsonb_array_elements(coalesce(item->'values', '[]')) as v;
  end loop;

  -- Mapas de calor
  for item, pos in select e, o from jsonb_array_elements(coalesce(plan->'heatmaps', '[]')) with ordinality as t(e, o) loop
    insert into public.od_heatmaps
      (report_id, key, title, description, row_label, column_label, rows, columns, unit, format, office_id, empty_meaning, position)
    values (
      target, item->>'key', item->>'title', coalesce(item->>'description', ''), coalesce(item->>'row_label', ''),
      coalesce(item->>'column_label', ''),
      array(select jsonb_array_elements_text(item->'rows')), array(select jsonb_array_elements_text(item->'columns')),
      coalesce(item->>'unit', ''), (item->>'format')::public.od_value_format, office,
      coalesce(nullif(item->>'empty_meaning', ''), 'sin reportar'), pos
    )
    returning id into new_id;
    insert into public.od_heatmap_cells (heatmap_id, row_index, column_index, value)
    select new_id, (c->>'row')::smallint, (c->>'column')::smallint, (c->>'value')::numeric
    from jsonb_array_elements(coalesce(item->'cells', '[]')) as c;
  end loop;

  -- Evolución histórica
  for item, pos in select e, o from jsonb_array_elements(coalesce(plan->'histories', '[]')) with ordinality as t(e, o) loop
    insert into public.od_histories (report_id, key, title, description, unit, format, total_label, office_id, position)
    values (
      target, item->>'key', item->>'title', coalesce(item->>'description', ''), coalesce(item->>'unit', ''),
      (item->>'format')::public.od_value_format, coalesce(nullif(item->>'total_label', ''), 'Total'), office, pos
    )
    returning id into new_id;
    insert into public.od_history_values (history_id, period_label, category, position, value)
    select new_id, v->>'period', coalesce(v->>'category', ''), coalesce((v->>'position')::smallint, 0), (v->>'value')::numeric
    from jsonb_array_elements(coalesce(item->'values', '[]')) as v;
  end loop;

  -- Tablas
  for item, pos in select e, o from jsonb_array_elements(coalesce(plan->'tables', '[]')) with ordinality as t(e, o) loop
    insert into public.od_tables (report_id, key, title, description, display, columns, office_id, position)
    values (
      target, item->>'key', item->>'title', coalesce(item->>'description', ''),
      coalesce(nullif(item->>'display', ''), 'tabla')::public.od_table_display, coalesce(item->'columns', '[]'::jsonb), office, pos
    )
    returning id into new_id;
    insert into public.od_table_rows (table_id, position, cells)
    select new_id, o, r from jsonb_array_elements(coalesce(item->'rows', '[]')) with ordinality as t(r, o);
  end loop;

  -- Bloques de la ficha, enganchados a su sección y a su conjunto por clave
  insert into public.od_report_blocks (report_id, kind, ref_id, section_id, position, visible, settings)
  select
    target,
    (b->>'kind')::public.od_block_kind,
    case split_part(b->>'ref', ':', 1)
      when 'desglose' then (select id from public.od_breakdowns where report_id = target and key = split_part(b->>'ref', ':', 2))
      when 'calor' then (select id from public.od_heatmaps where report_id = target and key = split_part(b->>'ref', ':', 2))
      when 'historico' then (select id from public.od_histories where report_id = target and key = split_part(b->>'ref', ':', 2))
      when 'tabla' then (select id from public.od_tables where report_id = target and key = split_part(b->>'ref', ':', 2))
    end,
    (select id from public.od_sections where report_id = target and key = b->>'section'),
    o,
    true,
    coalesce(b->'settings', '{}'::jsonb)
  from jsonb_array_elements(coalesce(plan->'blocks', '[]')) with ordinality as t(b, o);

  insert into public.od_imports (period_id, report_id, kind, file_name, cells_changed, summary)
  values (
    per.id, target, 'plantilla', coalesce(plan->>'title', ''), n_values,
    jsonb_build_object(
      'tipo', 'informe', 'perfil', plan->>'profile', 'corte', plan->>'corte',
      'secciones', jsonb_array_length(coalesce(plan->'sections', '[]')),
      'avisos', jsonb_array_length(coalesce(plan->'warnings', '[]'))
    )
  );

  return jsonb_build_object(
    'secciones', (select count(*) from public.od_sections where report_id = target),
    'indicadores', (select count(*) from public.od_indicators where report_id = target),
    'valores', n_values,
    'desgloses', (select count(*) from public.od_breakdowns where report_id = target),
    'mapas_calor', (select count(*) from public.od_heatmaps where report_id = target),
    'historicos', (select count(*) from public.od_histories where report_id = target),
    'tablas', (select count(*) from public.od_tables where report_id = target),
    'bloques', (select count(*) from public.od_report_blocks where report_id = target)
  );
end;
$$;

grant execute on function public.od_import_report(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Abrir el periodo siguiente: también secciones y tablas (sin filas)
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

    insert into public.od_maps (report_id, key, title, description, mode, unit, office_id, years, position)
    select new_report, key, title, description, mode, unit, office_id, null, position
    from public.od_maps where report_id = r.id;

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
  end loop;

  return target;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Seguridad
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['od_sections', 'od_tables', 'od_table_rows'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_role_at_least(''planeacion'')) with check (public.has_role_at_least(''planeacion''))',
      t || '_write', t
    );
  end loop;
end $$;

drop policy if exists od_sections_read on public.od_sections;
create policy od_sections_read on public.od_sections for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_tables_read on public.od_tables;
create policy od_tables_read on public.od_tables for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_table_rows_read on public.od_table_rows;
create policy od_table_rows_read on public.od_table_rows for select to anon, authenticated
  using (public.od_can_read((select t.report_id from public.od_tables t where t.id = table_id)));

grant select on public.od_sections, public.od_tables, public.od_table_rows to anon, authenticated;
grant select, insert, update, delete on public.od_sections, public.od_tables, public.od_table_rows to authenticated;

notify pgrst, 'reload schema';
