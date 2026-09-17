-- =============================================================================
-- PDI · 0035 · Motor Beta: Saber 11 → Saber TyT
--
-- El segundo modelo de análisis del portal. El de Saber PRO (0031) mira una
-- prueba contra el promedio del país; este mira dos pruebas de la misma
-- persona —la de entrada (Saber 11) y la de salida (Saber TyT)— y mide lo que
-- la universidad agregó entre una y otra.
--
--   od_saber_tyt          el conjunto de un informe: título, alcance, la curva
--                         de percentiles de cada prueba y la oficina que reporta
--   od_saber_tyt_results  una fila por año × nivel × programa × competencia
--
-- Nunca se guardan estudiantes: la intranet cruza y agrega en el navegador y
-- solo sube los agregados.
--
-- CÓMO FUNCIONA EL MOTOR
--
-- 1. Rango percentil. Los puntajes crudos no se pueden comparar entre pruebas
--    (Saber 11 califica cada módulo de 0 a 100 y su global de 0 a 500; Saber
--    TyT, de 0 a 200). Cada puntaje se convierte en su percentil dentro de la
--    cohorte histórica de la universidad en esa prueba y esa competencia: 0 es
--    el más bajo del grupo y 100 el más alto. La curva que traduce puntaje a
--    percentil se guarda en od_saber_tyt.benchmarks, así que la lectura es
--    reproducible y se rehace cuando llega un año nuevo.
--
-- 2. Homologación de nodos. Las competencias equivalentes quedan atadas:
--      lc      lectura crítica        ↔ lectura crítica
--      rc      matemáticas            ↔ razonamiento cuantitativo
--      cc      sociales y ciudadanas  ↔ competencias ciudadanas
--      ing     inglés                 ↔ inglés
--      global  puntaje global         ↔ puntaje global
--      ce      comunicación escrita: solo en la prueba de salida
--      cn      ciencias naturales:   solo en el Saber 11
--
-- 3. Valor agregado institucional (VAI). Es el delta de rendimiento: percentil
--    de salida menos percentil de entrada, promediado sobre quienes tienen las
--    dos pruebas. Quien entró en el percentil 30 y salió en el 60 aporta +30,
--    aunque su puntaje bruto no sea el más alto del país.
--
-- 4. Tránsito. transitions cuenta cuántos pasaron de cada cuarto de la
--    distribución de entrada a cada cuarto de la de salida (1 es el más bajo).
--    scatter guarda la nube entrada × salida en celdas de 5 percentiles, para
--    dibujarla con su diagonal de 45° sin guardar a nadie.
--
-- Niveles de formación (level), como los nombra el SNIES:
--   tecnologico | tecnico_profesional | universitario
--
--   benchmarks   {"lc": {"entrada": [p0, p5, … p100], "salida": [...]}}
--                el puntaje crudo en cada percentil, de 5 en 5 (21 valores)
--   transitions  {"1": {"1": 12, "2": 8, …}, …}
--   histogram    {"-10": 24, "-5": 60, "0": 91, …}  VAI en tramos de 5
--   scatter      {"30|55": 7, …}  celdas de 5 percentiles (entrada|salida)
--
-- El bloque "saber_tyt" de la ficha dibuja el conjunto. Requiere 0019, 0022,
-- 0024, 0031 y 0033. Idempotente.
-- =============================================================================

alter type public.od_block_kind add value if not exists 'saber_tyt';

-- -----------------------------------------------------------------------------
-- 1. Conjunto y resultados
-- -----------------------------------------------------------------------------

create table if not exists public.od_saber_tyt (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.od_reports (id) on delete cascade,
  key         text not null default 'saber-tyt',
  title       text not null default 'Saber TyT · Motor Beta',
  description text not null default '',
  note        text not null default '',
  -- Curva de percentiles por competencia y prueba: el puntaje crudo de 5 en 5 percentiles.
  benchmarks  jsonb not null default '{}'::jsonb,
  office_id   uuid references public.od_offices (id) on delete set null,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint od_saber_tyt_key_unique unique (report_id, key),
  constraint od_saber_tyt_benchmarks check (jsonb_typeof(benchmarks) = 'object')
);

comment on table public.od_saber_tyt is
  'Motor Beta: Saber TyT cruzado con Saber 11 en rango percentil, por año, nivel, programa y competencia. Sin datos personales.';

drop trigger if exists od_saber_tyt_set_updated_at on public.od_saber_tyt;
create trigger od_saber_tyt_set_updated_at
  before update on public.od_saber_tyt
  for each row execute function public.set_updated_at();

create table if not exists public.od_saber_tyt_results (
  id           uuid primary key default gen_random_uuid(),
  tyt_id       uuid not null references public.od_saber_tyt (id) on delete cascade,
  year         smallint not null,
  level        text not null default 'tecnologico',
  program      text not null default '',
  competency   text not null,
  -- Evaluados en la prueba de salida (TyT).
  evaluated    integer,
  -- Percentil medio de salida (0-100).
  mean_exit    numeric(5, 2),
  -- Evaluados con las dos pruebas: el universo del valor agregado.
  paired       integer,
  -- Percentil medio de entrada (Saber 11) de esos mismos evaluados.
  mean_entry   numeric(5, 2),
  -- Valor agregado: percentil de salida menos percentil de entrada.
  mean_delta   numeric(5, 2),
  -- Cuántos de los pareados salieron en un percentil más alto que el de entrada.
  improved     integer,
  -- Puntajes crudos promedio, para leer la cifra tal como la publica el ICFES.
  raw_entry    numeric(6, 2),
  raw_exit     numeric(6, 2),
  transitions  jsonb not null default '{}'::jsonb,
  histogram    jsonb not null default '{}'::jsonb,
  scatter      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  constraint od_saber_tyt_results_unique unique (tyt_id, year, level, program, competency),
  constraint od_saber_tyt_results_year check (year between 2000 and 2100),
  constraint od_saber_tyt_results_level check (level in ('tecnologico', 'tecnico_profesional', 'universitario')),
  constraint od_saber_tyt_results_competency check (competency in ('global', 'lc', 'rc', 'cc', 'ce', 'ing', 'cn')),
  constraint od_saber_tyt_results_percentiles check (
    (mean_exit is null or mean_exit between 0 and 100)
    and (mean_entry is null or mean_entry between 0 and 100)
    and (mean_delta is null or mean_delta between -100 and 100)
  ),
  constraint od_saber_tyt_results_counts check (
    (evaluated is null or evaluated >= 0) and (paired is null or paired >= 0) and (improved is null or improved >= 0)
  ),
  constraint od_saber_tyt_results_lists check (
    jsonb_typeof(transitions) = 'object' and jsonb_typeof(histogram) = 'object' and jsonb_typeof(scatter) = 'object'
  )
);

comment on table public.od_saber_tyt_results is
  'Resultado pareado Saber 11 → Saber TyT en rango percentil: año × nivel × programa × competencia.';

create index if not exists od_saber_tyt_results_tyt on public.od_saber_tyt_results (tyt_id, year);

drop trigger if exists od_saber_tyt_results_set_updated_at on public.od_saber_tyt_results;
create trigger od_saber_tyt_results_set_updated_at
  before update on public.od_saber_tyt_results
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Permisos: informe por informe, como el resto de UDES en Cifras (0024)
-- -----------------------------------------------------------------------------

alter table public.od_saber_tyt enable row level security;
alter table public.od_saber_tyt_results enable row level security;

drop policy if exists od_saber_tyt_read on public.od_saber_tyt;
create policy od_saber_tyt_read on public.od_saber_tyt for select to anon, authenticated
  using (public.od_can_read(report_id));

drop policy if exists od_saber_tyt_write on public.od_saber_tyt;
create policy od_saber_tyt_write on public.od_saber_tyt for all to authenticated
  using (public.od_can_edit_report(report_id)) with check (public.od_can_edit_report(report_id));

drop policy if exists od_saber_tyt_results_read on public.od_saber_tyt_results;
create policy od_saber_tyt_results_read on public.od_saber_tyt_results for select to anon, authenticated
  using (public.od_can_read((select t.report_id from public.od_saber_tyt t where t.id = tyt_id)));

drop policy if exists od_saber_tyt_results_write on public.od_saber_tyt_results;
create policy od_saber_tyt_results_write on public.od_saber_tyt_results for all to authenticated
  using (public.od_can_edit_report((select t.report_id from public.od_saber_tyt t where t.id = tyt_id)))
  with check (public.od_can_edit_report((select t.report_id from public.od_saber_tyt t where t.id = tyt_id)));

grant select on public.od_saber_tyt, public.od_saber_tyt_results to anon, authenticated;
grant select, insert, update, delete on public.od_saber_tyt, public.od_saber_tyt_results to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Abrir el periodo siguiente: la definición y los resultados pasan
--    completos, como en Saber PRO: son historia del ICFES, no de un periodo.
-- -----------------------------------------------------------------------------

create or replace function public.od_copy_saber_tyt(source_report uuid, target_report uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  t record;
  new_tyt uuid;
begin
  for t in select * from public.od_saber_tyt where report_id = source_report loop
    insert into public.od_saber_tyt (report_id, key, title, description, note, benchmarks, office_id, position)
    values (target_report, t.key, t.title, t.description, t.note, t.benchmarks, t.office_id, t.position)
    returning id into new_tyt;

    insert into public.od_saber_tyt_results
      (tyt_id, year, level, program, competency, evaluated, mean_exit, paired, mean_entry, mean_delta, improved, raw_entry, raw_exit, transitions, histogram, scatter)
    select new_tyt, year, level, program, competency, evaluated, mean_exit, paired, mean_entry, mean_delta, improved, raw_entry, raw_exit, transitions, histogram, scatter
    from public.od_saber_tyt_results where tyt_id = t.id;
  end loop;
end;
$$;

comment on function public.od_copy_saber_tyt(uuid, uuid) is
  'Copia el conjunto Saber TyT de un informe a otro al abrir periodo; la llama od_copy_period.';

grant execute on function public.od_copy_saber_tyt(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. La copia de periodo, otra vez completa: 0031 (Saber PRO), 0033 (conjuntos
--    libres) y este conjunto.
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

    -- Conjuntos libres (0033): columnas y vistas pasan; las filas no.
    insert into public.od_free_sets (report_id, key, title, description, temporality, period_label, columns, views, office_id, position)
    select new_report, key, title, description, temporality, period_label, columns, views, office_id, position
    from public.od_free_sets where report_id = r.id;

    -- Motor Beta (0035): conjunto y resultados completos.
    perform public.od_copy_saber_tyt(r.id, new_report);

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
