/* =============================================================================
   Semilla de UDES en Cifras.

   Convierte las cifras ilustrativas de src/modules/datos-abiertos/data/seed/
   en supabase/migrations/0020_udes_en_cifras_datos_iniciales.sql, para que el
   portal y la intranet tengan con qué trabajar desde el primer despliegue.

   · Completa 2020 por extrapolación lineal: el periodo es 2020-2025 y las
     series de ejemplo arrancaban en 2021.
   · Decide la agregación de cada indicador mirando sus datos: si el total es
     la suma de los campus en todos los años, 'suma' (y solo se guardan los
     campus); si no, 'reportado' (y se guarda el total aparte).
   · Reparte cada cifra anual en los periodos A y B según la regla anual del
     indicador (suma, último periodo o promedio), de modo que la cifra del año
     que calcula el portal es la de las fuentes.
   · Todo se enlaza por claves legibles (etiqueta del periodo, slug del informe,
     clave del indicador, slug del campus), así que ejecutar la migración dos
     veces actualiza en vez de duplicar.

   Ejecutar con: node scripts/build-od-seed.mjs
   ========================================================================== */

import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "supabase", "migrations", "0020_udes_en_cifras_datos_iniciales.sql");
const PERIOD = { label: "2020-2025", start: 2020, end: 2025 };
const SITES = ["bucaramanga", "cucuta", "valledupar"];

const entry = path.join(os.tmpdir(), `od-seed-entry-${process.pid}.ts`);
fs.writeFileSync(
  entry,
  `export { baseCatalog } from ${JSON.stringify(path.join(ROOT, "src/modules/datos-abiertos/data/seed/reports.ts").replace(/\\/g, "/"))};
   export { attachVisuals } from ${JSON.stringify(path.join(ROOT, "src/modules/datos-abiertos/data/seed/visual-data.ts").replace(/\\/g, "/"))};`,
);
const bundled = path.join(os.tmpdir(), `od-seed-${process.pid}.mjs`);
await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: bundled, logLevel: "silent" });
const { baseCatalog, attachVisuals } = await import(pathToFileURL(bundled).href);
fs.rmSync(entry);
fs.rmSync(bundled);

/* --- 2020 y agregación -------------------------------------------------------- */

const round = (value, format) => (format === "entero" ? Math.round(value) : Math.round(value * 10) / 10);

const aggregationOf = new Map();
for (const report of baseCatalog.reports) {
  for (const indicator of report.indicators) {
    const years = Object.keys(indicator.values).map(Number);
    let sums = true;
    let anySite = false;
    for (const year of years) {
      const cell = indicator.values[year];
      const parts = SITES.map((s) => cell[s] ?? null);
      if (parts.some((p) => p !== null)) anySite = true;
      if (parts.every((p) => p !== null)) {
        const total = parts.reduce((a, b) => a + b, 0);
        if (cell.todas === null || Math.abs(total - cell.todas) > 1e-6) sums = false;
      } else if (cell.todas !== null) {
        sums = false;
      }
    }
    aggregationOf.set(`${report.slug}/${indicator.id}`, anySite && sums ? "suma" : "reportado");

    // Extrapolación a 2020 con la pendiente 2021-2022.
    const first = indicator.values[2021];
    const second = indicator.values[2022];
    indicator.values[2020] = {};
    for (const key of ["todas", ...SITES]) {
      const a = first?.[key] ?? null;
      const b = second?.[key] ?? null;
      indicator.values[2020][key] = a === null || b === null ? null : Math.max(0, round(a - (b - a), indicator.format));
    }
    if (aggregationOf.get(`${report.slug}/${indicator.id}`) === "suma") {
      const parts = SITES.map((s) => indicator.values[2020][s]);
      indicator.values[2020].todas = parts.some((p) => p === null) ? null : parts.reduce((x, y) => x + y, 0);
    }
  }
}

/* --- Periodos A y B ------------------------------------------------------------- */

// Existencias al cierre (matrícula, docentes, programas…) toman el último
// periodo; los flujos (graduados, eventos, productos…) suman; tasas y
// promedios promedian. Lo que no está en la lista sigue su formato.
const RULE_BY_KEY = {
  matricula: "ultimo", docentes: "ultimo", administrativos: "ultimo", acompanamiento: "ultimo",
  convenios: "ultimo", programas: "ultimo", acreditados: "ultimo", grupos: "ultimo", investigadores: "ultimo",
  semilleros: "ultimo", area: "ultimo", laboratorios: "ultimo", "ancho-banda": "ultimo", "areas-verdes": "ultimo",
  "avance-plan": "ultimo", "indicadores-cumplidos": "ultimo", proyectos: "ultimo", lineas: "ultimo",
};
const annualRuleOf = (indicator) => RULE_BY_KEY[indicator.id] ?? (indicator.format === "entero" ? "suma" : "promedio");

// Reparto determinista: la misma casilla da siempre el mismo reparto, y la
// cifra del año que calcula el portal es exactamente la de las fuentes.
const hash = (text) => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
};
function splitTerms(value, rule, format, seed) {
  if (value === null || value === undefined) return { A: null, B: null };
  const r = hash(seed);
  if (rule === "suma") {
    const A = round(value * (0.44 + r * 0.12), format);
    return { A, B: round(value - A, format) };
  }
  if (rule === "ultimo") return { A: round(value * (0.95 + r * 0.04), format), B: value };
  // promedio: A y B a la misma distancia del año, sin salir de 0-100 en tasas.
  let d = format === "entero" ? Math.round(1 + r * 3) : Math.round((0.2 + r * 1.4) * 10) / 10;
  if (format === "porcentaje") d = Math.min(d, 100 - value, value);
  return { A: round(value + d, format), B: round(value - d, format) };
}

baseCatalog.years = Array.from({ length: PERIOD.end - PERIOD.start + 1 }, (_, i) => PERIOD.start + i);
const catalog = attachVisuals(baseCatalog);

// Evolución histórica de ejemplo en Poblacional: la matrícula total de tres
// periodos (la suma de los campus en ese periodo) repartida en pregrado y
// posgrado. Ilustrativa, como todo lo demás.
const termTotal = (report, key, year, term) => {
  const ind = report.indicators.find((i) => i.id === key);
  if (!ind) return null;
  const parts = SITES.map((site) => splitTerms(ind.values[year]?.[site] ?? null, annualRuleOf(ind), ind.format, `${report.slug}/${ind.id}/${year}/${site}`)[term]);
  return parts.some((p) => p === null) ? null : parts.reduce((a, b) => a + b, 0);
};
const HISTORIES = new Map();
{
  const poblacional = catalog.reports.find((r) => r.slug === "poblacional");
  if (poblacional) {
    const shares = { "2020-A": 0.892, "2022-B": 0.878, "2025-B": 0.861 };
    const values = [];
    Object.entries(shares).forEach(([label, share], position) => {
      const [year, term] = label.split("-");
      const total = termTotal(poblacional, "matricula", Number(year), term);
      if (total === null) return;
      const pregrado = Math.round(total * share);
      values.push({ period: label, category: "", position: 0, value: total });
      values.push({ period: label, category: "Pregrado", position: 1, value: pregrado });
      values.push({ period: label, category: "Posgrado", position: 2, value: total - pregrado });
    });
    HISTORIES.set("poblacional", [{
      key: "poblacion-historica",
      title: "Evolución histórica de la población estudiantil",
      description: "Cuántos estudiantes había en un periodo y cuántos hay en otro, con el peso de pregrado y posgrado en el total.",
      unit: "estudiantes",
      format: "entero",
      totalLabel: "Total de estudiantes",
      source: poblacional.indicators.find((i) => i.id === "matricula")?.source ?? "",
      values,
    }]);
  }
}

/* --- SQL ------------------------------------------------------------------------ */

const q = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`);
const n = (value) => (value === null || value === undefined ? "null" : String(value));
const arr = (list) => `array[${list.map(q).join(", ")}]::text[]`;
const P = `(select id from public.od_periods where label = ${q(PERIOD.label)})`;
const out = [];
const emit = (sql) => out.push(sql.trim(), "");

function valuesInsert(header, rows, chunk = 400) {
  for (let i = 0; i < rows.length; i += chunk) emit(header(rows.slice(i, i + chunk).join(",\n  ")));
}

emit(`-- =============================================================================
-- PDI · 0020 · UDES en Cifras · datos iniciales (ILUSTRATIVOS)
--
-- Generado por scripts/build-od-seed.mjs. No editar a mano: cambiar las fuentes
-- en src/modules/datos-abiertos/data/seed/ y volver a generar.
--
-- Deja el periodo ${PERIOD.label} vigente y publicado, marcado como ilustrativo,
-- con los nueve informes publicados. Cuando lleguen las cifras reales se cargan
-- desde la intranet (UDES en Cifras → Captura) y se desmarca "ilustrativo" en
-- la estación Periodo y campus.
--
-- Requiere 0019_udes_en_cifras.sql. Idempotente.
-- =============================================================================`);

emit(`update public.od_periods set is_current = false where label <> ${q(PERIOD.label)} and is_current;`);
emit(`insert into public.od_periods (label, start_year, end_year, cutoff_date, illustrative, is_current, status)
values (${q(PERIOD.label)}, ${PERIOD.start}, ${PERIOD.end}, ${q(catalog.cutoffDate)}, true, true, 'publicado')
on conflict (label) do update
  set start_year = excluded.start_year, end_year = excluded.end_year, cutoff_date = excluded.cutoff_date,
      is_current = true;`);

emit(`insert into public.od_period_campuses (period_id, campus_id, label, position)
select ${P}, c.id, c.name, c.position
from public.campuses c
where c.slug in (${SITES.map(q).join(", ")})
on conflict (period_id, campus_id) do update set label = excluded.label, position = excluded.position;`);

const offices = new Set();
for (const report of catalog.reports) {
  report.indicators.forEach((i) => offices.add(i.source));
  report.breakdowns.forEach((b) => offices.add(b.source));
  (report.heatmaps ?? []).forEach((h) => offices.add(h.source));
  (report.maps ?? []).forEach((m) => offices.add(m.source));
  if (report.pipeline) offices.add(report.pipeline.source);
}
emit(`insert into public.od_offices (name, position) values
  ${Array.from(offices).map((name, i) => `(${q(name)}, ${i + 1})`).join(",\n  ")}
on conflict (name) do nothing;`);

emit(`insert into public.od_reports
  (period_id, slug, code, name, summary, description, image_url, image_alt, image_credit, line, note, position, status)
values
  ${catalog.reports
    .map(
      (r, i) =>
        `(${P}, ${q(r.slug)}, ${q(r.code)}, ${q(r.name)}, ${q(r.summary)}, ${q(r.description)}, ${q(r.image.src)}, ${q(r.image.alt)}, ${q(r.image.credit)}, ${r.line}, ${q(r.note ?? "")}, ${i + 1}, 'publicado')`,
    )
    .join(",\n  ")}
on conflict (period_id, slug) do update
  set code = excluded.code, name = excluded.name, summary = excluded.summary, description = excluded.description,
      image_url = excluded.image_url, image_alt = excluded.image_alt, image_credit = excluded.image_credit,
      line = excluded.line, note = excluded.note, position = excluded.position;`);

const R = (alias = "r") => `join public.od_reports ${alias} on ${alias}.slug = v.report and ${alias}.period_id = ${P}`;

// El titular es único por informe: se apagan antes de volver a encenderlos.
emit(`update public.od_indicators set is_headline = false
where report_id in (select id from public.od_reports where period_id = ${P});`);

const indicatorRows = [];
for (const report of catalog.reports) {
  report.indicators.forEach((ind, i) => {
    const kpi = report.keyIndicators.indexOf(ind.id);
    indicatorRows.push(
      `(${q(report.slug)}, ${q(ind.id)}, ${q(ind.label)}, ${q(ind.unit)}, ${q(ind.format)}::public.od_value_format, ${q(ind.direction)}::public.od_direction, ${q(aggregationOf.get(`${report.slug}/${ind.id}`))}::public.od_aggregation, ${q(annualRuleOf(ind))}::public.od_annual_rule, ${q(ind.definition)}, ${q(ind.source)}, ${i + 1}, ${kpi >= 0}, ${kpi >= 0 ? kpi + 1 : "null"}::smallint, ${kpi === 0})`,
    );
  });
}
emit(`insert into public.od_indicators
  (report_id, key, label, unit, format, direction, aggregation, annual_rule, definition, office_id, position, is_kpi, kpi_position, is_headline)
select r.id, v.key, v.label, v.unit, v.format, v.direction, v.aggregation, v.annual_rule, v.definition, o.id, v.position, v.is_kpi, v.kpi_position, v.is_headline
from (values
  ${indicatorRows.join(",\n  ")}
) as v(report, key, label, unit, format, direction, aggregation, annual_rule, definition, office, position, is_kpi, kpi_position, is_headline)
${R()}
left join public.od_offices o on o.name = v.office
on conflict (report_id, key) do update
  set label = excluded.label, unit = excluded.unit, format = excluded.format, direction = excluded.direction,
      aggregation = excluded.aggregation, annual_rule = excluded.annual_rule, definition = excluded.definition, office_id = excluded.office_id,
      position = excluded.position, is_kpi = excluded.is_kpi, kpi_position = excluded.kpi_position,
      is_headline = excluded.is_headline;`);

const valueRows = [];
for (const report of catalog.reports) {
  for (const ind of report.indicators) {
    const suma = aggregationOf.get(`${report.slug}/${ind.id}`) === "suma";
    for (const year of catalog.years) {
      const cell = ind.values[year] ?? {};
      const keys = suma ? SITES : ["todas", ...SITES];
      for (const key of keys) {
        const value = cell[key];
        if (value === undefined) continue;
        if (value === null && key !== "todas" && !SITES.some((s) => cell[s] !== null && cell[s] !== undefined)) continue;
        const terms = splitTerms(value, annualRuleOf(ind), ind.format, `${report.slug}/${ind.id}/${year}/${key}`);
        for (const term of ["A", "B"]) {
          valueRows.push(`(${q(report.slug)}, ${q(ind.id)}, ${year}, ${q(term)}, ${key === "todas" ? "null" : q(key)}, ${n(terms[term])}::numeric)`);
        }
      }
    }
  }
}
valuesInsert(
  (rows) => `insert into public.od_values (indicator_id, year, term, campus_id, value)
select i.id, v.year::smallint, v.term::public.od_term, c.id, v.value
from (values
  ${rows}
) as v(report, key, year, term, campus, value)
${R()}
join public.od_indicators i on i.report_id = r.id and i.key = v.key
left join public.campuses c on c.slug = v.campus
on conflict on constraint od_values_term_unique do update set value = excluded.value;`,
  valueRows,
);

emit(`insert into public.od_breakdowns (report_id, key, title, unit, format, office_id, default_chart, position)
select r.id, v.key, v.title, v.unit, v.format, o.id, v.chart, v.position
from (values
  ${catalog.reports
    .flatMap((r) =>
      r.breakdowns.map(
        (b, i) =>
          `(${q(r.slug)}, ${q(b.id)}, ${q(b.title)}, ${q(b.unit)}, ${q(b.format)}::public.od_value_format, ${q(b.source)}, ${q(b.unit === "%" ? "barras" : "circular")}::public.od_chart_kind, ${i + 1})`,
      ),
    )
    .join(",\n  ")}
) as v(report, key, title, unit, format, office, chart, position)
${R()}
left join public.od_offices o on o.name = v.office
on conflict (report_id, key) do update
  set title = excluded.title, unit = excluded.unit, format = excluded.format, office_id = excluded.office_id,
      default_chart = excluded.default_chart, position = excluded.position;`);

const breakdownValueRows = catalog.reports.flatMap((r) =>
  r.breakdowns.flatMap((b) =>
    Object.entries(b.values).flatMap(([year, items]) =>
      items.map((item, i) => `(${q(r.slug)}, ${q(b.id)}, ${year}, ${q(item.label)}, ${i + 1}, ${n(item.value)}::numeric)`),
    ),
  ),
);
valuesInsert(
  (rows) => `insert into public.od_breakdown_values (breakdown_id, year, label, position, value)
select b.id, v.year::smallint, v.label, v.position::smallint, v.value
from (values
  ${rows}
) as v(report, key, year, label, position, value)
${R()}
join public.od_breakdowns b on b.report_id = r.id and b.key = v.key
on conflict on constraint od_breakdown_values_term_unique do update set position = excluded.position, value = excluded.value;`,
  breakdownValueRows,
);

emit(`insert into public.od_heatmaps
  (report_id, key, title, description, row_label, column_label, rows, columns, unit, format, office_id, empty_meaning, position)
select r.id, v.key, v.title, v.description, v.row_label, v.column_label, v.rows, v.columns, v.unit, v.format, o.id, v.empty_meaning, v.position
from (values
  ${catalog.reports
    .flatMap((r) =>
      (r.heatmaps ?? []).map(
        (h, i) =>
          `(${q(r.slug)}, ${q(h.id)}, ${q(h.title)}, ${q(h.description)}, ${q(h.rowLabel)}, ${q(h.columnLabel)}, ${arr(h.rows)}, ${arr(h.columns)}, ${q(h.unit)}, ${q(h.format)}::public.od_value_format, ${q(h.source)}, ${q(h.emptyMeaning)}, ${i + 1})`,
      ),
    )
    .join(",\n  ")}
) as v(report, key, title, description, row_label, column_label, rows, columns, unit, format, office, empty_meaning, position)
${R()}
left join public.od_offices o on o.name = v.office
on conflict (report_id, key) do update
  set title = excluded.title, description = excluded.description, row_label = excluded.row_label,
      column_label = excluded.column_label, rows = excluded.rows, columns = excluded.columns, unit = excluded.unit,
      format = excluded.format, office_id = excluded.office_id, empty_meaning = excluded.empty_meaning,
      position = excluded.position;`);

const cellRows = catalog.reports.flatMap((r) =>
  (r.heatmaps ?? []).flatMap((h) =>
    h.values.flatMap((row, ri) => row.map((value, ci) => `(${q(r.slug)}, ${q(h.id)}, ${ri}, ${ci}, ${n(value)}::numeric)`)),
  ),
);
valuesInsert(
  (rows) => `insert into public.od_heatmap_cells (heatmap_id, row_index, column_index, value)
select h.id, v.ri::smallint, v.ci::smallint, v.value
from (values
  ${rows}
) as v(report, key, ri, ci, value)
${R()}
join public.od_heatmaps h on h.report_id = r.id and h.key = v.key
on conflict (heatmap_id, row_index, column_index) do update set value = excluded.value;`,
  cellRows,
);

emit(`insert into public.od_maps (report_id, key, title, description, mode, unit, office_id, position)
select r.id, v.key, v.title, v.description, v.mode, v.unit, o.id, v.position
from (values
  ${catalog.reports
    .flatMap((r) =>
      (r.maps ?? []).map(
        (m, i) =>
          `(${q(r.slug)}, ${q(m.id)}, ${q(m.title)}, ${q(m.description)}, ${q(m.mode)}::public.od_map_mode, ${q(m.unit)}, ${q(m.source)}, ${i + 1})`,
      ),
    )
    .join(",\n  ")}
) as v(report, key, title, description, mode, unit, office, position)
${R()}
left join public.od_offices o on o.name = v.office
on conflict (report_id, key) do update
  set title = excluded.title, description = excluded.description, mode = excluded.mode, unit = excluded.unit,
      office_id = excluded.office_id, position = excluded.position;`);

const mapRows = catalog.reports.flatMap((r) =>
  (r.maps ?? []).flatMap((m) =>
    Object.entries(m.values).flatMap(([year, bySite]) =>
      Object.entries(bySite).flatMap(([site, depts]) =>
        Object.entries(depts).map(([code, value]) => `(${q(r.slug)}, ${q(m.id)}, ${year}, ${q(site)}, ${q(code)}, ${n(value)}::numeric)`),
      ),
    ),
  ),
);
valuesInsert(
  (rows) => `insert into public.od_map_values (map_id, year, campus_id, department_code, value)
select m.id, v.year::smallint, c.id, v.code, v.value
from (values
  ${rows}
) as v(report, key, year, campus, code, value)
${R()}
join public.od_maps m on m.report_id = r.id and m.key = v.key
join public.campuses c on c.slug = v.campus
on conflict (map_id, year, campus_id, department_code) do update set value = excluded.value;`,
  mapRows,
);

const pipes = catalog.reports.filter((r) => r.pipeline);
emit(`insert into public.od_pipelines (report_id, key, title, description, measure, stages, office_id, position)
select r.id, 'tuberia', v.title, v.description, 'estudiantes', v.stages, o.id, 1
from (values
  ${pipes.map((r) => `(${q(r.slug)}, ${q(r.pipeline.title)}, ${q(r.pipeline.description)}, ${arr(r.pipeline.stages)}, ${q(r.pipeline.source)})`).join(",\n  ")}
) as v(report, title, description, stages, office)
${R()}
left join public.od_offices o on o.name = v.office
on conflict (report_id, key) do update
  set title = excluded.title, description = excluded.description, measure = excluded.measure,
      stages = excluded.stages, office_id = excluded.office_id;`);

// Solo los campus: el total de cada cohorte lo suma el portal.
const pipeRows = pipes.flatMap((r) =>
  r.pipeline.cohorts
    .filter((c) => c.campus !== "todas")
    .flatMap((c) =>
      c.remaining.map(
        (value, stage) =>
          `(${q(r.slug)}, ${q(`${c.cohort}-A`)}, ${q(c.campus)}, ${stage}, ${n(value)}::numeric, ${q(stage > 0 ? c.mainCause[stage - 1] ?? "" : "")})`,
      ),
    ),
);
valuesInsert(
  (rows) => `insert into public.od_pipeline_values (pipeline_id, cohort, campus_id, stage_index, value, main_cause)
select p.id, v.cohort, c.id, v.stage::smallint, v.value, v.cause
from (values
  ${rows}
) as v(report, cohort, campus, stage, value, cause)
${R()}
join public.od_pipelines p on p.report_id = r.id and p.key = 'tuberia'
join public.campuses c on c.slug = v.campus
on conflict on constraint od_pipeline_values_unique do update
  set value = excluded.value, main_cause = excluded.main_cause;`,
  pipeRows,
);

const historyRows = Array.from(HISTORIES).flatMap(([slug, list]) =>
  list.map((h, i) => `(${q(slug)}, ${q(h.key)}, ${q(h.title)}, ${q(h.description)}, ${q(h.unit)}, ${q(h.format)}::public.od_value_format, ${q(h.totalLabel)}, ${q(h.source)}, ${i + 1})`),
);
if (historyRows.length) {
  emit(`insert into public.od_histories (report_id, key, title, description, unit, format, total_label, office_id, position)
select r.id, v.key, v.title, v.description, v.unit, v.format, v.total_label, o.id, v.position
from (values
  ${historyRows.join(",\n  ")}
) as v(report, key, title, description, unit, format, total_label, office, position)
${R()}
left join public.od_offices o on o.name = v.office
on conflict (report_id, key) do update
  set title = excluded.title, description = excluded.description, unit = excluded.unit, format = excluded.format,
      total_label = excluded.total_label, office_id = excluded.office_id, position = excluded.position;`);

  const historyValueRows = Array.from(HISTORIES).flatMap(([slug, list]) =>
    list.flatMap((h) => h.values.map((v) => `(${q(slug)}, ${q(h.key)}, ${q(v.period)}, ${q(v.category)}, ${v.position}, ${n(v.value)}::numeric)`)),
  );
  emit(`insert into public.od_history_values (history_id, period_label, category, position, value)
select s.id, v.period, v.category, v.position::smallint, v.value
from (values
  ${historyValueRows.join(",\n  ")}
) as v(report, key, period, category, position, value)
${R()}
join public.od_histories s on s.report_id = r.id and s.key = v.key
on conflict on constraint od_history_values_unique do update set value = excluded.value, position = excluded.position;`);
}

// Diseño de la ficha: se rehace entero con el orden por defecto.
emit(`delete from public.od_report_blocks where report_id in (select id from public.od_reports where period_id = ${P});`);
const blockRows = catalog.reports.flatMap((r) => {
  const list = [["kpis", null], ["evolucion", null]];
  (HISTORIES.get(r.slug) ?? []).forEach((h) => list.push(["historico", `hist:${h.key}`]));
  (r.maps ?? []).forEach((m) => list.push(["mapa", `map:${m.id}`]));
  if (r.pipeline) list.push(["tuberia", "pipe"]);
  (r.heatmaps ?? []).forEach((h) => list.push(["mapa_calor", `heat:${h.id}`]));
  if (r.breakdowns.length) list.push(["desgloses", null]);
  list.push(["tabla_dinamica", null], ["metodologia", null]);
  return list.map(
    ([kind, ref], i) =>
      `(${q(r.slug)}, ${q(kind)}::public.od_block_kind, ${q(ref)}, ${i + 1}, ${q(kind === "evolucion" ? '{"chart":"lineas"}' : "{}")}::jsonb)`,
  );
});
emit(`insert into public.od_report_blocks (report_id, kind, ref_id, position, visible, settings)
select r.id, v.kind,
  case
    when v.ref like 'map:%' then (select m.id from public.od_maps m where m.report_id = r.id and m.key = substr(v.ref, 5))
    when v.ref like 'heat:%' then (select h.id from public.od_heatmaps h where h.report_id = r.id and h.key = substr(v.ref, 6))
    when v.ref = 'pipe' then (select p.id from public.od_pipelines p where p.report_id = r.id and p.key = 'tuberia')
    when v.ref like 'hist:%' then (select s.id from public.od_histories s where s.report_id = r.id and s.key = substr(v.ref, 6))
  end,
  v.position, true, v.settings
from (values
  ${blockRows.join(",\n  ")}
) as v(report, kind, ref, position, settings)
${R()};`);

emit(`notify pgrst, 'reload schema';`);

fs.writeFileSync(OUT, out.join("\n"));

/* --- Fixtures para la prueba de humo ------------------------------------------
   Las mismas filas que deja la migración, con la forma exacta de las tablas y
   identificadores legibles en lugar de uuid. La prueba de humo sirve con ellas
   el portal y la intranet sin un Supabase levantado. */

const CAMPUS_IDS = { bucaramanga: "campus-buc", cucuta: "campus-cuc", valledupar: "campus-val" };
const CAMPUS_NAMES = { bucaramanga: "Bucaramanga", cucuta: "Cúcuta", valledupar: "Valledupar" };
const PERIOD_ID = "od-periodo-2020-2025";
const officeIds = new Map(Array.from(offices).map((name, i) => [name, `od-oficina-${i + 1}`]));
const now = "2025-12-15T12:00:00Z";
const T = {
  od_periods: [{
    id: PERIOD_ID, label: PERIOD.label, start_year: PERIOD.start, end_year: PERIOD.end, cutoff_date: catalog.cutoffDate,
    illustrative: true, is_current: true, status: "publicado", note: "", created_at: now, updated_at: now,
  }],
  od_period_campuses: SITES.map((slug, i) => ({ period_id: PERIOD_ID, campus_id: CAMPUS_IDS[slug], label: CAMPUS_NAMES[slug], slug, position: i + 1 })),
  od_offices: Array.from(officeIds).map(([name, id], i) => ({ id, name, contact_email: "", position: i + 1 })),
  od_reports: [], od_indicators: [], od_values: [], od_breakdowns: [], od_breakdown_values: [], od_heatmaps: [],
  od_heatmap_cells: [], od_maps: [], od_map_values: [], od_pipelines: [], od_pipeline_values: [], od_histories: [], od_history_values: [], od_report_blocks: [],
  od_imports: [], od_publications: [],
};
let seq = 0;
const uid = (prefix) => `${prefix}-${++seq}`;
catalog.reports.forEach((r, ri) => {
  const reportId = `od-informe-${r.slug}`;
  T.od_reports.push({
    id: reportId, period_id: PERIOD_ID, slug: r.slug, code: r.code, name: r.name, summary: r.summary, description: r.description,
    image_url: r.image.src, image_alt: r.image.alt, image_credit: r.image.credit, line: r.line, note: r.note ?? "",
    position: ri + 1, status: "publicado", updated_at: now,
  });
  r.indicators.forEach((ind, i) => {
    const id = `od-ind-${r.slug}-${ind.id}`;
    const kpi = r.keyIndicators.indexOf(ind.id);
    const aggregation = aggregationOf.get(`${r.slug}/${ind.id}`);
    T.od_indicators.push({
      id, report_id: reportId, key: ind.id, label: ind.label, unit: ind.unit, format: ind.format, direction: ind.direction,
      aggregation, annual_rule: annualRuleOf(ind), definition: ind.definition, office_id: officeIds.get(ind.source), position: i + 1,
      is_kpi: kpi >= 0, kpi_position: kpi >= 0 ? kpi + 1 : null, is_headline: kpi === 0,
    });
    for (const year of catalog.years) {
      const cell = ind.values[year] ?? {};
      for (const key of aggregation === "suma" ? SITES : ["todas", ...SITES]) {
        if (cell[key] === undefined) continue;
        const terms = splitTerms(cell[key], annualRuleOf(ind), ind.format, `${r.slug}/${ind.id}/${year}/${key}`);
        for (const term of ["A", "B"]) {
          T.od_values.push({ id: uid("v"), indicator_id: id, year, term, campus_id: key === "todas" ? null : CAMPUS_IDS[key], value: terms[term], updated_at: now });
        }
      }
    }
  });
  r.breakdowns.forEach((b, i) => {
    const id = `od-desg-${r.slug}-${b.id}`;
    T.od_breakdowns.push({ id, report_id: reportId, key: b.id, title: b.title, unit: b.unit, format: b.format, office_id: officeIds.get(b.source), default_chart: b.unit === "%" ? "barras" : "circular", position: i + 1 });
    Object.entries(b.values).forEach(([year, items]) =>
      items.forEach((item, pos) => T.od_breakdown_values.push({ id: uid("bv"), breakdown_id: id, year: Number(year), term: "anual", label: item.label, position: pos + 1, value: item.value })),
    );
  });
  (r.heatmaps ?? []).forEach((h, i) => {
    const id = `od-calor-${r.slug}-${h.id}`;
    T.od_heatmaps.push({ id, report_id: reportId, key: h.id, title: h.title, description: h.description, row_label: h.rowLabel, column_label: h.columnLabel, rows: h.rows, columns: h.columns, unit: h.unit, format: h.format, office_id: officeIds.get(h.source), empty_meaning: h.emptyMeaning, position: i + 1 });
    h.values.forEach((row, ri2) => row.forEach((value, ci) => T.od_heatmap_cells.push({ heatmap_id: id, row_index: ri2, column_index: ci, value })));
  });
  (r.maps ?? []).forEach((m, i) => {
    const id = `od-mapa-${r.slug}-${m.id}`;
    T.od_maps.push({ id, report_id: reportId, key: m.id, title: m.title, description: m.description, mode: m.mode, unit: m.unit, office_id: officeIds.get(m.source), position: i + 1 });
    Object.entries(m.values).forEach(([year, bySite]) =>
      Object.entries(bySite).forEach(([site, depts]) =>
        Object.entries(depts).forEach(([code, value]) => T.od_map_values.push({ map_id: id, year: Number(year), campus_id: CAMPUS_IDS[site], department_code: code, value })),
      ),
    );
  });
  if (r.pipeline) {
    const id = `od-tuberia-${r.slug}`;
    T.od_pipelines.push({ id, report_id: reportId, key: "tuberia", title: r.pipeline.title, description: r.pipeline.description, measure: "estudiantes", stages: r.pipeline.stages, office_id: officeIds.get(r.pipeline.source), position: 1 });
    r.pipeline.cohorts.filter((c) => c.campus !== "todas").forEach((c) =>
      c.remaining.forEach((value, stage) => T.od_pipeline_values.push({ id: uid("pv"), pipeline_id: id, cohort: `${c.cohort}-A`, campus_id: CAMPUS_IDS[c.campus], stage_index: stage, value, main_cause: stage > 0 ? c.mainCause[stage - 1] ?? "" : "" })),
    );
  }
  (HISTORIES.get(r.slug) ?? []).forEach((h, i) => {
    const id = `od-historico-${r.slug}-${h.key}`;
    T.od_histories.push({ id, report_id: reportId, key: h.key, title: h.title, description: h.description, unit: h.unit, format: h.format, total_label: h.totalLabel, office_id: officeIds.get(h.source), position: i + 1 });
    h.values.forEach((v) => T.od_history_values.push({ id: uid("hv"), history_id: id, period_label: v.period, category: v.category, position: v.position, value: v.value }));
  });
  const kinds = [["kpis", null], ["evolucion", null]];
  (HISTORIES.get(r.slug) ?? []).forEach((h) => kinds.push(["historico", `od-historico-${r.slug}-${h.key}`]));
  (r.maps ?? []).forEach((m) => kinds.push(["mapa", `od-mapa-${r.slug}-${m.id}`]));
  if (r.pipeline) kinds.push(["tuberia", `od-tuberia-${r.slug}`]);
  (r.heatmaps ?? []).forEach((h) => kinds.push(["mapa_calor", `od-calor-${r.slug}-${h.id}`]));
  if (r.breakdowns.length) kinds.push(["desgloses", null]);
  kinds.push(["tabla_dinamica", null], ["metodologia", null]);
  kinds.forEach(([kind, ref], i) => T.od_report_blocks.push({ id: uid("blk"), report_id: reportId, kind, ref_id: ref, position: i + 1, visible: true, settings: kind === "evolucion" ? { chart: "lineas" } : {} }));
});
const FIXTURE_OUT = path.join(ROOT, "scripts", "fixtures", "udes-en-cifras.json");
fs.mkdirSync(path.dirname(FIXTURE_OUT), { recursive: true });
fs.writeFileSync(FIXTURE_OUT, JSON.stringify(T));

console.log(
  `0020 escrita: ${catalog.reports.length} informes, ${indicatorRows.length} indicadores, ${valueRows.length} valores, ` +
    `${cellRows.length} casillas de calor, ${mapRows.length} valores de mapa, ${pipeRows.length} valores de tubería · ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`,
);
