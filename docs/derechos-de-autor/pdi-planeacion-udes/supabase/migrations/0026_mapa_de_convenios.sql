-- =============================================================================
-- PDI · 0026 · Mapa de convenios internacionales por país
--
-- Un mapa de calor del mundo: cuántos convenios hay con cada país. No lleva
-- rutas; el color de cada país es la cifra.
--
--   od_map_mode 'convenios'   país en ISO alfa-3, como entrante y saliente
--   od_maps.reporting         cómo se registra el mapa:
--       'anual'   una cifra por año (lo de siempre; en "todo el periodo" se suma)
--       'global'  una sola cifra, sin año: se guarda con year = 0, la misma
--                 clave con la que el portal representa "todo el periodo"
--
-- Los convenios abren en 'global' desde la intranet; el resto de mapas sigue en
-- 'anual'. Al abrir un periodo nuevo, un mapa global conserva sus cifras (no
-- son de ningún año), por eso se redefine od_copy_period.
--
-- Requiere 0019, 0022 y 0025. Idempotente.
-- =============================================================================

alter type public.od_map_mode add value if not exists 'convenios';

alter table public.od_maps add column if not exists reporting text not null default 'anual';
alter table public.od_maps drop constraint if exists od_maps_reporting;
alter table public.od_maps add constraint od_maps_reporting check (reporting in ('anual', 'global'));

comment on column public.od_maps.reporting is
  'anual: una cifra por año. global: una sola cifra sin año, guardada con year = 0.';

-- Año 0 = dato global; los demás, años reales.
alter table public.od_map_values drop constraint if exists od_map_values_year;
alter table public.od_map_values add constraint od_map_values_year check (year = 0 or year between 2000 and 2100);

-- El código de país también vale para los convenios; y un mapa global solo
-- recibe year = 0, uno anual solo años reales. El modo se compara como texto
-- (ver 0025).
create or replace function public.od_map_values_check_code()
returns trigger
language plpgsql
as $$
declare
  map_mode text;
  map_reporting text;
begin
  select m.mode::text, m.reporting into map_mode, map_reporting from public.od_maps m where m.id = new.map_id;
  if map_mode in ('entrante', 'saliente', 'convenios') and new.department_code !~ '^[A-Z]{3}$' then
    raise exception 'El mapa % espera un país en ISO alfa-3 (p. ej. MEX), no "%".', map_mode, new.department_code
      using errcode = 'check_violation';
  end if;
  if map_mode in ('origen', 'cobertura') and new.department_code !~ '^[0-9]{2}$' then
    raise exception 'El mapa por departamento espera un código DANE de dos dígitos, no "%".', new.department_code
      using errcode = 'check_violation';
  end if;
  if map_reporting = 'global' and new.year <> 0 then
    raise exception 'El mapa es un dato global: sus cifras van sin año (year = 0).' using errcode = 'check_violation';
  end if;
  if map_reporting = 'anual' and new.year = 0 then
    raise exception 'El mapa se registra por año: falta el año de la cifra.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Abrir el periodo siguiente: igual que en 0022, más la forma de registro de
-- cada mapa y las cifras de los mapas globales.
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
  end loop;

  return target;
end;
$$;

grant execute on function public.od_copy_period(uuid, text, smallint, smallint) to authenticated;

notify pgrst, 'reload schema';
