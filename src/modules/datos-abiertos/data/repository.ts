/* =============================================================================
   Datos Abiertos · lectura desde Supabase.

   Dos pasos separados a propósito:

   1. `fetchOpenDataRows` trae las filas de las tablas `od_*` tal cual, sin
      incrustaciones: una consulta por tabla y en tres oleadas (periodo →
      informes → lo que cuelga de ellos). Las tablas grandes (valores, mapas)
      se paginan de mil en mil, que es el tope por respuesta de la API.
   2. `assembleCatalog` convierte esas filas en el catálogo que consumen las
      pantallas. Es una función pura: la intranet la reutiliza sobre los datos
      que acaba de editar y la prueba de humo la ejercita con fixtures.

   Lo publicado lo filtra la consulta además de RLS: una persona con sesión de
   intranet puede leer borradores, pero el portal público solo los muestra con
   ?vista-previa en la URL.
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import type {
  OdBreakdownRow,
  OdBreakdownValueRow,
  OdHeatmapCellRow,
  OdHeatmapRow,
  OdHistoryRow,
  OdHistoryValueRow,
  OdIndicatorRow,
  OdMapRow,
  OdMapValueRow,
  OdOffice,
  OdPeriod,
  OdPeriodCampus,
  OdPipelineRow,
  OdPipelineValueRow,
  OdReportBlockRow,
  OdReportRow,
  OdSectionRow,
  OdTableRecordRow,
  OdTableRow,
  OdValueRow,
} from "../../../types/database";
import type {
  Breakdown,
  Campus,
  CampusId,
  HeatmapData,
  HistoryData,
  Indicator,
  MapDataset,
  OpenDataCatalog,
  PipelineCohort,
  PipelineData,
  Report,
  ReportBlock,
  ReportSection,
  TableData,
  YearCampusValues,
} from "./types";
import { ALL_CAMPUSES } from "./types";
import type { Term, TermCampusValues } from "./types";
import { annualFigure, TERMS } from "./terms";

export interface OpenDataRows {
  period: OdPeriod;
  campuses: OdPeriodCampus[];
  offices: OdOffice[];
  reports: OdReportRow[];
  indicators: OdIndicatorRow[];
  values: OdValueRow[];
  breakdowns: OdBreakdownRow[];
  breakdownValues: OdBreakdownValueRow[];
  heatmaps: OdHeatmapRow[];
  heatmapCells: OdHeatmapCellRow[];
  maps: OdMapRow[];
  mapValues: OdMapValueRow[];
  pipelines: OdPipelineRow[];
  pipelineValues: OdPipelineValueRow[];
  histories: OdHistoryRow[];
  historyValues: OdHistoryValueRow[];
  sections: OdSectionRow[];
  tables: OdTableRow[];
  tableRows: OdTableRecordRow[];
  blocks: OdReportBlockRow[];
}

const PAGE = 1000;

type Result<T> = { data: T[] | null; error: DatabaseError | null };

function unwrap<T>({ data, error }: Result<T>): T[] {
  if (error) throw describeDatabaseError(error);
  return data ?? [];
}

/** Tablas de una migración posterior (0022): si aún no existen, el portal sigue sin ellas. */
function unwrapOptional<T>({ data, error }: Result<T>): T[] {
  if (error && (error.code === "PGRST205" || error.code === "42P01")) return [];
  return unwrap({ data, error });
}

/** Trae todas las filas de una consulta, página a página. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Result<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const chunk = unwrap(await page(from, from + PAGE - 1));
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
}

interface FetchOptions {
  /** Periodo concreto (intranet). Sin él, el vigente. */
  periodId?: string;
  /** Incluir borradores. El portal público solo lo hace en vista previa. */
  includeDrafts?: boolean;
}

export async function fetchOpenDataRows({ periodId, includeDrafts = false }: FetchOptions = {}): Promise<OpenDataRows | null> {
  let periodQuery = supabase.from("od_periods").select("*");
  periodQuery = periodId ? periodQuery.eq("id", periodId) : periodQuery.eq("is_current", true);
  if (!includeDrafts) periodQuery = periodQuery.eq("status", "publicado");
  const { data: periodRow, error: periodError } = await periodQuery.maybeSingle();
  if (periodError) throw describeDatabaseError(periodError);
  if (!periodRow) return null;
  const period = periodRow as OdPeriod;

  let reportQuery = supabase.from("od_reports").select("*").eq("period_id", period.id).order("position");
  if (!includeDrafts) reportQuery = reportQuery.eq("status", "publicado");

  const [campuses, offices, reports] = await Promise.all([
    supabase.from("od_period_campuses").select("*").eq("period_id", period.id).order("position").then(unwrap<OdPeriodCampus>),
    supabase.from("od_offices").select("*").order("position").then(unwrap<OdOffice>),
    reportQuery.then(unwrap<OdReportRow>),
  ]);

  const reportIds = reports.map((r) => r.id);
  const empty: OpenDataRows = {
    period, campuses, offices, reports, indicators: [], values: [], breakdowns: [], breakdownValues: [],
    heatmaps: [], heatmapCells: [], maps: [], mapValues: [], pipelines: [], pipelineValues: [], histories: [],
    historyValues: [], sections: [], tables: [], tableRows: [], blocks: [],
  };
  if (reportIds.length === 0) return empty;

  const [indicators, breakdowns, heatmaps, maps, pipelines, histories, sections, tables, blocks] = await Promise.all([
    supabase.from("od_indicators").select("*").in("report_id", reportIds).order("position").then(unwrap<OdIndicatorRow>),
    supabase.from("od_breakdowns").select("*").in("report_id", reportIds).order("position").then(unwrap<OdBreakdownRow>),
    supabase.from("od_heatmaps").select("*").in("report_id", reportIds).order("position").then(unwrap<OdHeatmapRow>),
    supabase.from("od_maps").select("*").in("report_id", reportIds).order("position").then(unwrap<OdMapRow>),
    supabase.from("od_pipelines").select("*").in("report_id", reportIds).order("position").then(unwrap<OdPipelineRow>),
    supabase.from("od_histories").select("*").in("report_id", reportIds).order("position").then(unwrap<OdHistoryRow>),
    supabase.from("od_sections").select("*").in("report_id", reportIds).order("position").then(unwrapOptional<OdSectionRow>),
    supabase.from("od_tables").select("*").in("report_id", reportIds).order("position").then(unwrapOptional<OdTableRow>),
    supabase.from("od_report_blocks").select("*").in("report_id", reportIds).order("position").then(unwrap<OdReportBlockRow>),
  ]);

  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  const none = Promise.resolve([] as never[]);

  const [values, breakdownValues, heatmapCells, mapValues, pipelineValues, historyValues, tableRows] = await Promise.all([
    indicators.length
      ? fetchAll<OdValueRow>((from, to) =>
          supabase.from("od_values").select("indicator_id,year,term,campus_id,value,updated_at")
            .in("indicator_id", ids(indicators)).order("id").range(from, to),
        )
      : none,
    breakdowns.length
      ? fetchAll<OdBreakdownValueRow>((from, to) =>
          supabase.from("od_breakdown_values").select("*").in("breakdown_id", ids(breakdowns)).order("position").range(from, to),
        )
      : none,
    heatmaps.length
      ? fetchAll<OdHeatmapCellRow>((from, to) =>
          supabase.from("od_heatmap_cells").select("*").in("heatmap_id", ids(heatmaps)).order("row_index").range(from, to),
        )
      : none,
    maps.length
      ? fetchAll<OdMapValueRow>((from, to) =>
          supabase.from("od_map_values").select("*").in("map_id", ids(maps)).order("department_code").range(from, to),
        )
      : none,
    pipelines.length
      ? fetchAll<OdPipelineValueRow>((from, to) =>
          supabase.from("od_pipeline_values").select("*").in("pipeline_id", ids(pipelines)).order("cohort").range(from, to),
        )
      : none,
    histories.length
      ? fetchAll<OdHistoryValueRow>((from, to) =>
          supabase.from("od_history_values").select("*").in("history_id", ids(histories)).order("period_label").range(from, to),
        )
      : none,
    tables.length
      ? fetchAll<OdTableRecordRow>((from, to) =>
          supabase.from("od_table_rows").select("*").in("table_id", ids(tables)).order("position").range(from, to),
        )
      : none,
  ]);

  return {
    ...empty, indicators, values, breakdowns, breakdownValues, heatmaps, heatmapCells, maps, mapValues, pipelines,
    pipelineValues, histories, historyValues, sections, tables, tableRows, blocks,
  };
}

/* --- Ensamblado -------------------------------------------------------------- */

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

export function assembleCatalog(rows: OpenDataRows): OpenDataCatalog {
  const { period } = rows;
  const years = Array.from({ length: period.end_year - period.start_year + 1 }, (_, i) => period.start_year + i);
  const slugOf = new Map(rows.campuses.map((c) => [c.campus_id, c.slug]));
  const campusSlugs = rows.campuses.map((c) => c.slug);
  const officeName = new Map(rows.offices.map((o) => [o.id, o.name]));
  const source = (officeId: string | null) => (officeId ? officeName.get(officeId) ?? "" : "");
  const campusKey = (id: string | null): CampusId => (id === null ? ALL_CAMPUSES : slugOf.get(id) ?? id);
  /** Años con dato dentro del periodo; sin lista, todos. */
  const yearsOf = (list: number[] | null | undefined) =>
    list && list.length ? list.map(Number).filter((y) => years.includes(y)).sort((a, b) => a - b) : undefined;

  const campuses: Campus[] = [
    { id: ALL_CAMPUSES, name: "Todos los campus" },
    ...rows.campuses.map((c) => ({ id: c.slug, name: c.label, uuid: c.campus_id })),
  ];

  const valuesByIndicator = new Map<string, OdValueRow[]>();
  for (const v of rows.values) {
    const list = valuesByIndicator.get(v.indicator_id) ?? [];
    list.push(v);
    valuesByIndicator.set(v.indicator_id, list);
  }

  const reports: Report[] = rows.reports.map((report) => {
    const indicatorRows = rows.indicators.filter((i) => i.report_id === report.id);

    const indicators: Indicator[] = indicatorRows.map((row) => {
      // Lo reportado: por periodo (A, B) y, con la regla "reportado", la cifra del año.
      const terms: TermCampusValues = {};
      const reported: YearCampusValues = {};
      for (const year of years) {
        terms[year] = { A: {}, B: {} };
        reported[year] = {};
      }
      for (const v of valuesByIndicator.get(row.id) ?? []) {
        if (!terms[v.year]) continue;
        if (v.term === "anual") reported[v.year]![campusKey(v.campus_id)] = num(v.value);
        else terms[v.year]![v.term]![campusKey(v.campus_id)] = num(v.value);
      }

      // El total de lo que se suma, cuando no se capturó, sale de los campus,
      // periodo por periodo.
      const fillTotal = (cell: Partial<Record<CampusId, number | null>>) => {
        if (cell[ALL_CAMPUSES] !== undefined && cell[ALL_CAMPUSES] !== null) return;
        const parts = campusSlugs.map((slug) => cell[slug]);
        cell[ALL_CAMPUSES] = parts.every((p) => p !== undefined && p !== null)
          ? parts.reduce<number>((sum, p) => sum + (p as number), 0)
          : null;
      };
      if (row.aggregation === "suma" && campusSlugs.length > 0) {
        for (const year of years) {
          TERMS.forEach((term) => fillTotal(terms[year]![term]!));
          fillTotal(reported[year]!);
        }
      }

      // Por año: la cifra del año es la reportada y no hay periodos.
      const byYear = row.reporting === "anual";
      const rule = byYear ? "reportado" : row.annual_rule;

      // La cifra del año, campus por campus y para el total.
      const values: YearCampusValues = {};
      const annualFrom: Record<number, Partial<Record<CampusId, Term>>> = {};
      for (const year of years) {
        values[year] = {};
        annualFrom[year] = {};
        for (const key of [ALL_CAMPUSES, ...campusSlugs]) {
          const figure = annualFigure(
            rule,
            terms[year]!.A![key] ?? null,
            terms[year]!.B![key] ?? null,
            reported[year]![key] ?? null,
          );
          values[year]![key] = figure.value;
          if (figure.from) annualFrom[year]![key] = figure.from;
        }
      }
      return {
        id: row.key,
        uuid: row.id,
        label: row.label,
        unit: row.unit,
        format: row.format,
        direction: row.direction,
        aggregation: row.aggregation,
        definition: row.definition,
        source: source(row.office_id),
        officeId: row.office_id,
        isKpi: row.is_kpi,
        kpiPosition: row.kpi_position,
        isHeadline: row.is_headline,
        years: yearsOf(row.years),
        values,
        reporting: byYear ? "anual" : "periodo",
        annualRule: byYear ? undefined : row.annual_rule,
        terms: byYear ? undefined : terms,
        annualFrom,
      };
    });

    const kpis = indicatorRows
      .filter((i) => i.is_kpi)
      .sort((a, b) => (Number(b.is_headline) - Number(a.is_headline)) || ((a.kpi_position ?? 99) - (b.kpi_position ?? 99)) || a.position - b.position)
      .map((i) => i.key);

    const breakdowns: Breakdown[] = rows.breakdowns
      .filter((b) => b.report_id === report.id)
      .map((b) => {
        const values: Breakdown["values"] = {};
        const terms: NonNullable<Breakdown["terms"]> = {};
        const sourceRows = rows.breakdownValues
          .filter((v) => v.breakdown_id === b.id)
          .sort((x, y) => x.position - y.position);
        const byYear = b.reporting === "anual";
        const rule = byYear ? "reportado" : b.annual_rule ?? "reportado";
        for (const year of yearsOf(b.years) ?? years) {
          const yearRows = sourceRows.filter((v) => v.year === year);
          if (!yearRows.length) continue;
          terms[year] = {};
          for (const term of TERMS) {
            terms[year][term] = yearRows.filter((v) => v.term === term).map((v) => ({ label: v.label, value: num(v.value) }));
          }
          values[year] = Array.from(new Set(yearRows.map((v) => v.label))).map((label) => {
            const get = (term: string) => num(yearRows.find((v) => v.label === label && (v.term ?? "anual") === term)?.value);
            return { label, value: annualFigure(rule, get("A"), get("B"), get("anual")).value };
          });
        }
        return {
          id: b.key, uuid: b.id, title: b.title, unit: b.unit, format: b.format,
          source: source(b.office_id), officeId: b.office_id, defaultChart: b.default_chart, years: yearsOf(b.years), values,
          reporting: byYear ? "anual" : "periodo", annualRule: rule, terms: byYear ? undefined : terms,
        };
      });

    const heatmaps: HeatmapData[] = rows.heatmaps
      .filter((h) => h.report_id === report.id)
      .map((h) => {
        const matrix = h.rows.map(() => h.columns.map(() => null as number | null));
        rows.heatmapCells
          .filter((c) => c.heatmap_id === h.id)
          .forEach((c) => {
            if (matrix[c.row_index] && c.column_index < h.columns.length) matrix[c.row_index][c.column_index] = num(c.value);
          });
        return {
          id: h.key, uuid: h.id, title: h.title, description: h.description, rowLabel: h.row_label,
          columnLabel: h.column_label, rows: h.rows, columns: h.columns, values: matrix, unit: h.unit,
          format: h.format, source: source(h.office_id), officeId: h.office_id, emptyMeaning: h.empty_meaning,
        };
      });

    const maps: MapDataset[] = rows.maps
      .filter((m) => m.report_id === report.id)
      .map((m) => {
        const values: MapDataset["values"] = {};
        rows.mapValues
          .filter((v) => v.map_id === m.id)
          .forEach((v) => {
            const byCampus = (values[v.year] ??= {});
            const depts = (byCampus[campusKey(v.campus_id)] ??= {});
            depts[v.department_code] = Number(v.value);
          });
        return {
          id: m.key, uuid: m.id, title: m.title, description: m.description, mode: m.mode, reporting: m.reporting ?? "anual", unit: m.unit,
          source: source(m.office_id), officeId: m.office_id, years: yearsOf(m.years), values,
        };
      });

    const pipelines: PipelineData[] = rows.pipelines
      .filter((p) => p.report_id === report.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((p) => {
        const measure = p.measure ?? "estudiantes";
        const stageCount = p.stages.length;
        const groups = new Map<string, { cohort: string; campus: CampusId; raw: (number | null)[]; mainCause: string[] }>();
        rows.pipelineValues
          .filter((v) => v.pipeline_id === p.id)
          .forEach((v) => {
            const campus = campusKey(v.campus_id);
            const key = `${v.cohort}|${campus}`;
            const group = groups.get(key) ?? {
              cohort: String(v.cohort),
              campus,
              raw: Array.from({ length: stageCount }, () => null),
              mainCause: Array.from({ length: Math.max(0, stageCount - 1) }, () => ""),
            };
            if (v.stage_index < stageCount) group.raw[v.stage_index] = num(v.value);
            if (v.stage_index > 0) group.mainCause[v.stage_index - 1] = v.main_cause;
            groups.set(key, group);
          });

        // Estudiantes: el total de la cohorte, si no se capturó, es la suma de los
        // campus cuando están todos. Los porcentajes no se suman: su total se captura.
        if (measure === "estudiantes") {
          const cohorts = Array.from(new Set(Array.from(groups.values()).map((g) => g.cohort)));
          for (const cohort of cohorts) {
            if (groups.has(`${cohort}|${ALL_CAMPUSES}`)) continue;
            const parts = campusSlugs.map((slug) => groups.get(`${cohort}|${slug}`));
            if (parts.some((part) => !part)) continue;
            groups.set(`${cohort}|${ALL_CAMPUSES}`, {
              cohort,
              campus: ALL_CAMPUSES,
              raw: Array.from({ length: stageCount }, (_, i) => {
                const values = parts.map((part) => part!.raw[i]);
                return values.some((v) => v === null) ? null : values.reduce<number>((a, b) => a + (b as number), 0);
              }),
              mainCause: parts[0]!.mainCause,
            });
          }
        }

        const cohorts: PipelineCohort[] = Array.from(groups.values())
          .sort((a, b) => a.cohort.localeCompare(b.cohort))
          .map((g) => {
            if (measure !== "desercion") return { cohort: g.cohort, campus: g.campus, remaining: g.raw, mainCause: g.mainCause };
            // Deserción del tramo: de los que llegaron, qué % se retira. La
            // cohorte entra al 100 % y cada tramo le quita su parte.
            const remaining: (number | null)[] = [100];
            for (let i = 1; i < stageCount; i += 1) {
              const before = remaining[i - 1];
              const dropout = g.raw[i];
              remaining.push(before === null || dropout === null ? null : Math.round(before * (1 - dropout / 100) * 100) / 100);
            }
            return { cohort: g.cohort, campus: g.campus, remaining, dropout: g.raw, mainCause: g.mainCause };
          });

        return {
          id: p.key, uuid: p.id, title: p.title, description: p.description, measure, stages: p.stages, cohorts,
          source: source(p.office_id), officeId: p.office_id,
        };
      });

    const histories: HistoryData[] = rows.histories
      .filter((h) => h.report_id === report.id)
      .sort((a, b) => a.position - b.position)
      .map((h) => {
        const list = rows.historyValues.filter((v) => v.history_id === h.id);
        const periods = Array.from(new Set(list.map((v) => v.period_label))).sort();
        const categories = Array.from(
          new Map(
            list
              .filter((v) => v.category !== "")
              .sort((a, b) => a.position - b.position)
              .map((v) => [v.category, v.category]),
          ).keys(),
        );
        const values: HistoryData["values"] = {};
        const total: HistoryData["total"] = {};
        for (const category of categories) values[category] = {};
        for (const v of list) {
          if (v.category === "") total[v.period_label] = num(v.value);
          else values[v.category]![v.period_label] = num(v.value);
        }
        // Sin total capturado, la suma de las categorías cuando están todas.
        for (const period of periods) {
          if (total[period] !== undefined && total[period] !== null) continue;
          const parts = categories.map((c) => values[c]![period]);
          total[period] = categories.length && parts.every((part) => part !== undefined && part !== null)
            ? parts.reduce<number>((a, b) => a + (b as number), 0)
            : null;
        }
        return {
          id: h.key, uuid: h.id, title: h.title, description: h.description, unit: h.unit, format: h.format,
          totalLabel: h.total_label, source: source(h.office_id), officeId: h.office_id, periods, categories, total, values,
        };
      });

    const sections: ReportSection[] = (rows.sections ?? [])
      .filter((s) => s.report_id === report.id)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        key: s.key, uuid: s.id, number: s.number, title: s.title, status: s.status, lede: s.lede, warning: s.warning,
        source: s.source, requested: Array.isArray(s.requested) ? s.requested : [], position: s.position,
      }));

    const tables: TableData[] = (rows.tables ?? [])
      .filter((t) => t.report_id === report.id)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({
        id: t.key, uuid: t.id, title: t.title, description: t.description, display: t.display,
        columns: Array.isArray(t.columns) ? t.columns : [],
        rows: (rows.tableRows ?? []).filter((r) => r.table_id === t.id).sort((a, b) => a.position - b.position).map((r) => r.cells ?? {}),
        source: source(t.office_id),
      }));

    const refKey = (refId: string | null) =>
      refId === null
        ? null
        : breakdowns.find((b) => b.uuid === refId)?.id ??
          tables.find((t) => t.uuid === refId)?.id ??
          heatmaps.find((h) => h.uuid === refId)?.id ??
          maps.find((m) => m.uuid === refId)?.id ??
          pipelines.find((p) => p.uuid === refId)?.id ??
          histories.find((h) => h.uuid === refId)?.id ??
          null;

    const blocks: ReportBlock[] = rows.blocks
      .filter((b) => b.report_id === report.id)
      .sort((a, b) => a.position - b.position)
      .map((b) => ({
        uuid: b.id, kind: b.kind, refKey: refKey(b.ref_id), visible: b.visible, position: b.position,
        settings: b.settings ?? {},
        sectionKey: b.section_id ? sections.find((s) => s.uuid === b.section_id)?.key ?? null : null,
      }));

    return {
      uuid: report.id,
      slug: report.slug,
      code: report.code,
      name: report.name,
      summary: report.summary,
      description: report.description,
      image: { src: report.image_url, alt: report.image_alt, credit: report.image_credit },
      line: report.line,
      keyIndicators: kpis,
      indicators,
      breakdowns,
      heatmaps,
      maps,
      pipelines,
      histories,
      sections,
      tables,
      blocks,
      note: report.note || undefined,
      status: report.status,
      position: report.position,
      updatedAt: report.updated_at,
    };
  });

  return {
    period: {
      uuid: period.id,
      label: period.label,
      startYear: period.start_year,
      endYear: period.end_year,
      status: period.status,
    },
    years,
    currentYear: period.end_year,
    campuses,
    illustrative: period.illustrative,
    cutoffDate: period.cutoff_date,
    reports,
  };
}
