-- =============================================================================
-- PDI · 0031 · Resultados Saber PRO
--
-- Los resultados de la UDES en las pruebas Saber PRO del ICFES, por competencia,
-- año, sede y programa, frente al promedio nacional.
--
--   od_saber_pro           el conjunto de un informe (Enseñanza): título, texto
--                          de alcance y oficina que lo reporta
--   od_saber_pro_results   una fila por año × ámbito × sede × programa ×
--                          competencia, con evaluados, promedio, cuántos
--                          quedaron en cada nivel de desempeño y el reparto
--                          del puntaje en tramos de 10 puntos
--
-- Nunca se guardan estudiantes: la intranet lee el Excel del ICFES en el
-- navegador y solo sube los agregados. Nombres y documentos no salen del equipo.
--
-- Ámbitos (scope):
--   programa     sede + facultad + programa, agregado desde los resultados
--                individuales. Los totales por sede, facultad e institución
--                se suman desde aquí.
--   institucion  promedio oficial que publica el ICFES para la UDES. Cuando
--                existe, manda sobre el promedio sumado de los programas.
--   nacional     promedio nacional de referencia.
--
-- Competencias: rc (razonamiento cuantitativo), lc (lectura crítica),
-- cc (competencias ciudadanas), ce (comunicación escrita), ing (inglés) y
-- global (puntaje global).
--
--   levels     {"1": 120, "2": 300, "3": 210, "4": 12}  niveles 1 a 4
--              {"-A1": 40, "A1": 90, "A2": 150, "B1": 80, "B2": 9}  inglés
--              El puntaje global no tiene niveles: {}.
--   histogram  {"140": 55, "150": 61}  evaluados por tramo [140, 150)
--
-- Un puntaje 0 o "-" en el archivo del ICFES es una prueba no presentada o
-- anulada: no cuenta como evaluado ni entra al promedio.
--
-- El bloque "saber_pro" de la ficha dibuja el conjunto. Requiere 0019, 0022,
-- 0024 y 0030. Idempotente.
-- =============================================================================

alter type public.od_block_kind add value if not exists 'saber_pro';

-- -----------------------------------------------------------------------------
-- 1. Conjunto y resultados
-- -----------------------------------------------------------------------------

create table if not exists public.od_saber_pro (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.od_reports (id) on delete cascade,
  key         text not null default 'saber-pro',
  title       text not null default 'Resultados Saber PRO',
  description text not null default '',
  -- Nota metodológica visible bajo el bloque.
  note        text not null default '',
  office_id   uuid references public.od_offices (id) on delete set null,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint od_saber_pro_key_unique unique (report_id, key)
);

comment on table public.od_saber_pro is
  'Resultados Saber PRO de un informe: título, alcance y oficina que reporta.';

drop trigger if exists od_saber_pro_set_updated_at on public.od_saber_pro;
create trigger od_saber_pro_set_updated_at
  before update on public.od_saber_pro
  for each row execute function public.set_updated_at();

create table if not exists public.od_saber_pro_results (
  id          uuid primary key default gen_random_uuid(),
  saber_id    uuid not null references public.od_saber_pro (id) on delete cascade,
  year        smallint not null,
  scope       text not null,
  campus      text not null default '',
  faculty     text not null default '',
  program     text not null default '',
  competency  text not null,
  evaluated   integer,
  mean        numeric(6, 2),
  levels      jsonb not null default '{}'::jsonb,
  histogram   jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint od_saber_pro_results_unique unique (saber_id, year, scope, campus, faculty, program, competency),
  constraint od_saber_pro_results_year check (year between 2000 and 2100),
  constraint od_saber_pro_results_scope check (scope in ('programa', 'institucion', 'nacional')),
  constraint od_saber_pro_results_competency check (competency in ('rc', 'lc', 'cc', 'ce', 'ing', 'global')),
  constraint od_saber_pro_results_where check (
    (scope = 'programa' and campus <> '' and program <> '')
    or (scope <> 'programa' and campus = '' and faculty = '' and program = '')
  ),
  constraint od_saber_pro_results_mean check (mean is null or mean between 0 and 300),
  constraint od_saber_pro_results_evaluated check (evaluated is null or evaluated >= 0),
  constraint od_saber_pro_results_lists check (jsonb_typeof(levels) = 'object' and jsonb_typeof(histogram) = 'object')
);

comment on table public.od_saber_pro_results is
  'Resultado Saber PRO agregado: año × ámbito (programa, institución, nacional) × competencia. Sin datos personales.';

create index if not exists od_saber_pro_results_saber on public.od_saber_pro_results (saber_id, year);

drop trigger if exists od_saber_pro_results_set_updated_at on public.od_saber_pro_results;
create trigger od_saber_pro_results_set_updated_at
  before update on public.od_saber_pro_results
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Permisos: informe por informe, como el resto de UDES en Cifras (0024)
-- -----------------------------------------------------------------------------

alter table public.od_saber_pro enable row level security;
alter table public.od_saber_pro_results enable row level security;

drop policy if exists od_saber_pro_read on public.od_saber_pro;
create policy od_saber_pro_read on public.od_saber_pro for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_saber_pro_write on public.od_saber_pro;
create policy od_saber_pro_write on public.od_saber_pro for all to authenticated
  using (public.od_can_edit_report(report_id)) with check (public.od_can_edit_report(report_id));

drop policy if exists od_saber_pro_results_read on public.od_saber_pro_results;
create policy od_saber_pro_results_read on public.od_saber_pro_results for select to anon, authenticated
  using (public.od_can_read((select sp.report_id from public.od_saber_pro sp where sp.id = saber_id)));

drop policy if exists od_saber_pro_results_write on public.od_saber_pro_results;
create policy od_saber_pro_results_write on public.od_saber_pro_results for all to authenticated
  using (public.od_can_edit_report((select sp.report_id from public.od_saber_pro sp where sp.id = saber_id)))
  with check (public.od_can_edit_report((select sp.report_id from public.od_saber_pro sp where sp.id = saber_id)));

grant select on public.od_saber_pro, public.od_saber_pro_results to anon, authenticated;
grant select, insert, update, delete on public.od_saber_pro, public.od_saber_pro_results to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Abrir el periodo siguiente: igual que en 0030, más Saber PRO. Los
--    resultados son historia del ICFES, no de un periodo: pasan completos.
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
