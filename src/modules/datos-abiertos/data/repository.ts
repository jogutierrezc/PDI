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
  OdValueRow,
} from "../../../types/database";
import type {
  Breakdown,
  Campus,
  CampusId,
  HeatmapData,
  Indicator,
  MapDataset,
  OpenDataCatalog,
  PipelineCohort,
  PipelineData,
  Report,
  ReportBlock,
  YearCampusValues,
} from "./types";
import { ALL_CAMPUSES } from "./types";

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
  blocks: OdReportBlockRow[];
}

const PAGE = 1000;

type Result<T> = { data: T[] | null; error: DatabaseError | null };

function unwrap<T>({ data, error }: Result<T>): T[] {
  if (error) throw describeDatabaseError(error);
  return data ?? [];
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
    heatmaps: [], heatmapCells: [], maps: [], mapValues: [], pipelines: [], pipelineValues: [], blocks: [],
  };
  if (reportIds.length === 0) return empty;

  const [indicators, breakdowns, heatmaps, maps, pipelines, blocks] = await Promise.all([
    supabase.from("od_indicators").select("*").in("report_id", reportIds).order("position").then(unwrap<OdIndicatorRow>),
    supabase.from("od_breakdowns").select("*").in("report_id", reportIds).order("position").then(unwrap<OdBreakdownRow>),
    supabase.from("od_heatmaps").select("*").in("report_id", reportIds).order("position").then(unwrap<OdHeatmapRow>),
    supabase.from("od_maps").select("*").in("report_id", reportIds).order("position").then(unwrap<OdMapRow>),
    supabase.from("od_pipelines").select("*").in("report_id", reportIds).then(unwrap<OdPipelineRow>),
    supabase.from("od_report_blocks").select("*").in("report_id", reportIds).order("position").then(unwrap<OdReportBlockRow>),
  ]);

  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  const none = Promise.resolve([] as never[]);

  const [values, breakdownValues, heatmapCells, mapValues, pipelineValues] = await Promise.all([
    indicators.length
      ? fetchAll<OdValueRow>((from, to) =>
          supabase.from("od_values").select("indicator_id,year,campus_id,value,updated_at")
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
  ]);

  return { ...empty, indicators, values, breakdowns, breakdownValues, heatmaps, heatmapCells, maps, mapValues, pipelines, pipelineValues, blocks };
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
      const values: YearCampusValues = {};
      for (const year of years) values[year] = {};
      for (const v of valuesByIndicator.get(row.id) ?? []) {
        if (!values[v.year]) continue;
        values[v.year]![campusKey(v.campus_id)] = num(v.value);
      }
      // El total de lo que se suma, cuando no se capturó, sale de los campus.
      if (row.aggregation === "suma" && campusSlugs.length > 0) {
        for (const year of years) {
          const cell = values[year]!;
          if (cell[ALL_CAMPUSES] !== undefined && cell[ALL_CAMPUSES] !== null) continue;
          const parts = campusSlugs.map((slug) => cell[slug]);
          cell[ALL_CAMPUSES] = parts.every((p) => p !== undefined && p !== null)
            ? parts.reduce<number>((sum, p) => sum + (p as number), 0)
            : null;
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
        values,
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
        rows.breakdownValues
          .filter((v) => v.breakdown_id === b.id)
          .sort((x, y) => x.position - y.position)
          .forEach((v) => {
            (values[v.year] ??= []).push({ label: v.label, value: num(v.value) });
          });
        return {
          id: b.key, uuid: b.id, title: b.title, unit: b.unit, format: b.format,
          source: source(b.office_id), officeId: b.office_id, defaultChart: b.default_chart, values,
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
          id: m.key, uuid: m.id, title: m.title, description: m.description, mode: m.mode, unit: m.unit,
          source: source(m.office_id), officeId: m.office_id, values,
        };
      });

    const pipelineRow = rows.pipelines.find((p) => p.report_id === report.id);
    let pipeline: PipelineData | undefined;
    if (pipelineRow) {
      const groups = new Map<string, PipelineCohort>();
      const stageCount = pipelineRow.stages.length;
      rows.pipelineValues
        .filter((v) => v.pipeline_id === pipelineRow.id)
        .forEach((v) => {
          const campus = campusKey(v.campus_id);
          const key = `${v.cohort}|${campus}`;
          const group = groups.get(key) ?? {
            cohort: v.cohort,
            campus,
            remaining: Array.from({ length: stageCount }, () => null),
            mainCause: Array.from({ length: Math.max(0, stageCount - 1) }, () => ""),
          };
          group.remaining[v.stage_index] = v.remaining;
          if (v.stage_index > 0) group.mainCause[v.stage_index - 1] = v.main_cause;
          groups.set(key, group);
        });
      // Total de la cohorte cuando no se capturó: suma de campus si están todos.
      const cohorts = Array.from(new Set(Array.from(groups.values()).map((g) => g.cohort)));
      for (const cohort of cohorts) {
        if (groups.has(`${cohort}|${ALL_CAMPUSES}`)) continue;
        const parts = campusSlugs.map((slug) => groups.get(`${cohort}|${slug}`));
        if (parts.some((p) => !p)) continue;
        groups.set(`${cohort}|${ALL_CAMPUSES}`, {
          cohort,
          campus: ALL_CAMPUSES,
          remaining: Array.from({ length: stageCount }, (_, i) => {
            const values = parts.map((p) => p!.remaining[i]);
            return values.some((v) => v === null) ? null : values.reduce<number>((a, b) => a + (b as number), 0);
          }),
          mainCause: parts[0]!.mainCause,
        });
      }
      pipeline = {
        id: "tuberia", uuid: pipelineRow.id, title: pipelineRow.title, description: pipelineRow.description,
        stages: pipelineRow.stages, cohorts: Array.from(groups.values()), source: source(pipelineRow.office_id),
        officeId: pipelineRow.office_id,
      };
    }

    const refKey = (refId: string | null) =>
      refId === null ? null : heatmaps.find((h) => h.uuid === refId)?.id ?? maps.find((m) => m.uuid === refId)?.id ?? null;

    const blocks: ReportBlock[] = rows.blocks
      .filter((b) => b.report_id === report.id)
      .sort((a, b) => a.position - b.position)
      .map((b) => ({
        uuid: b.id, kind: b.kind, refKey: refKey(b.ref_id), visible: b.visible, position: b.position,
        settings: b.settings ?? {},
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
      pipeline,
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
