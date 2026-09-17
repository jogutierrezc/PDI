/* =============================================================================
   UDES en Cifras · datos de la intranet.

   La intranet lee con el mismo repositorio que el portal (borradores
   incluidos) y escribe tabla por tabla. Cada mutación invalida a la vez la
   caché de la intranet y la del portal: lo que se guarda aquí es lo que el
   público ve al publicar, sin un paso de sincronización intermedio.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import type {
  Campus as CampusRow,
  OdBreakdownRow,
  OdBreakdownValueRow,
  OdBlockKind,
  OdFreeSetRecordRow,
  OdFreeSetRow,
  OdHeatmapCellRow,
  OdHeatmapRow,
  OdHistoryRow,
  OdHistoryValueRow,
  OdImportKind,
  OdIndicatorRow,
  OdMapRow,
  OdMapValueRow,
  OdOffice,
  OdPeriod,
  OdPeriodCampus,
  OdPipelineRow,
  OdPipelineValueRow,
  OdPublicationRow,
  OdRankingEditionRow,
  OdRankingRow,
  OdReportBlockRow,
  OdReportRow,
  OdSaberProResultRow,
  OdSaberProRow,
  OdSaberTytResultRow,
  OdSaberTytRow,
  OdValueRow,
  PublicationStatus,
} from "../../../types/database";
import { assembleCatalog, fetchOpenDataRows } from "../../datos-abiertos/data/repository";
import type { OpenDataRows } from "../../datos-abiertos/data/repository";
import { openDataKeys } from "../../datos-abiertos/data/open-data";
import type { TytBenchmarks } from "../../datos-abiertos/data/saber-tyt";
import type { AlphaData } from "../../datos-abiertos/data/saber-alpha";
import type { OpenDataCatalog } from "../../datos-abiertos/data/types";

export const odAdminKeys = {
  all: ["od-admin"] as const,
  periods: () => [...odAdminKeys.all, "periods"] as const,
  period: (id: string) => [...odAdminKeys.all, "period", id] as const,
  campuses: () => [...odAdminKeys.all, "campuses"] as const,
  publications: (periodId: string) => [...odAdminKeys.all, "publications", periodId] as const,
};

type Result<T> = { data: T | null; error: DatabaseError | null };

function unwrap<T>({ data, error }: Result<T>): T {
  if (error) throw describeDatabaseError(error);
  return data as T;
}

/* --- Lectura ---------------------------------------------------------------- */

export function useOdPeriods() {
  return useQuery({
    queryKey: odAdminKeys.periods(),
    queryFn: async () =>
      unwrap<OdPeriod[]>(await supabase.from("od_periods").select("*").order("start_year", { ascending: false })),
  });
}

export interface AdminData {
  rows: OpenDataRows;
  catalog: OpenDataCatalog;
}

export function useOdAdminData(periodId: string | undefined) {
  return useQuery({
    queryKey: odAdminKeys.period(periodId ?? "none"),
    enabled: Boolean(periodId),
    queryFn: async (): Promise<AdminData | null> => {
      const rows = await fetchOpenDataRows({ periodId, includeDrafts: true });
      return rows ? { rows, catalog: assembleCatalog(rows) } : null;
    },
  });
}

/** Todos los campus de la universidad, para elegir cuáles cubre el periodo. */
export function useAllCampuses() {
  return useQuery({
    queryKey: odAdminKeys.campuses(),
    queryFn: async () =>
      unwrap<CampusRow[]>(await supabase.from("campuses").select("*").order("position")),
  });
}

export function useOdPublications(periodId: string | undefined) {
  return useQuery({
    queryKey: odAdminKeys.publications(periodId ?? "none"),
    enabled: Boolean(periodId),
    queryFn: async () =>
      unwrap<OdPublicationRow[]>(
        await supabase.from("od_publications").select("*").eq("period_id", periodId!).order("published_at", { ascending: false }),
      ),
  });
}

/* --- Escritura -------------------------------------------------------------- */

/** Envuelve una escritura: invalida intranet y portal al terminar. */
function useOdMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: odAdminKeys.all }),
        client.invalidateQueries({ queryKey: openDataKeys.all }),
      ]);
    },
  });
}

const run = async <T>(query: PromiseLike<Result<T>>) => unwrap(await query);

export function useSavePeriod() {
  return useOdMutation(async ({ id, patch }: { id: string; patch: Partial<OdPeriod> }) => {
    await run(supabase.from("od_periods").update(patch).eq("id", id));
  });
}

/** Solo un periodo vigente: primero se apaga el anterior, después se enciende este. */
export function useMakeCurrentPeriod() {
  return useOdMutation(async (id: string) => {
    await run(supabase.from("od_periods").update({ is_current: false }).eq("is_current", true).neq("id", id));
    await run(supabase.from("od_periods").update({ is_current: true }).eq("id", id));
  });
}

export function useCopyPeriod() {
  return useOdMutation(
    async ({ source, label, start, end }: { source: string; label: string; start: number; end: number }) =>
      run(supabase.rpc("od_copy_period", { source, new_label: label, new_start: start, new_end: end })),
  );
}

/** Aplica el plan de un informe completo en una sola transacción: reemplaza todo su contenido. */
export function useImportReport() {
  return useOdMutation(async ({ reportId, plan }: { reportId: string; plan: unknown }) =>
    run(supabase.rpc("od_import_report", { target: reportId, plan })) as Promise<Record<string, number>>,
  );
}

export function useSavePeriodCampuses() {
  return useOdMutation(
    async ({ periodId, keep, remove }: { periodId: string; keep: Omit<OdPeriodCampus, "slug">[]; remove: string[] }) => {
      if (remove.length) {
        await run(supabase.from("od_period_campuses").delete().eq("period_id", periodId).in("campus_id", remove));
      }
      if (keep.length) {
        await run(supabase.from("od_period_campuses").upsert(keep, { onConflict: "period_id,campus_id" }));
      }
    },
  );
}

export function useSaveOffice() {
  return useOdMutation(async (office: Partial<OdOffice> & { name: string }) => {
    if (office.id) await run(supabase.from("od_offices").update({ name: office.name, contact_email: office.contact_email ?? "" }).eq("id", office.id));
    else await run(supabase.from("od_offices").insert({ name: office.name, contact_email: office.contact_email ?? "", position: office.position ?? 99 }));
  });
}

export function useDeleteOffice() {
  return useOdMutation(async (id: string) => {
    await run(supabase.from("od_offices").delete().eq("id", id));
  });
}

export function useSaveReport() {
  return useOdMutation(async ({ id, patch }: { id: string; patch: Partial<OdReportRow> }) => {
    await run(supabase.from("od_reports").update(patch).eq("id", id));
  });
}

export function useSaveIndicator() {
  return useOdMutation(async (row: Partial<OdIndicatorRow> & { report_id: string }) => {
    const { id, ...fields } = row;
    if (id) await run(supabase.from("od_indicators").update(fields).eq("id", id));
    else await run(supabase.from("od_indicators").insert(fields));
  });
}

export function useDeleteIndicator() {
  return useOdMutation(async (id: string) => {
    await run(supabase.from("od_indicators").delete().eq("id", id));
  });
}

/**
 * Tablero de KPI de un informe. El titular es único por informe en la base:
 * se apagan todos antes de encender el elegido, o la segunda escritura chocaría
 * con el índice único.
 */
export function useSaveKpis() {
  return useOdMutation(
    async ({ reportId, kpis }: { reportId: string; kpis: { id: string; is_kpi: boolean; kpi_position: number | null; is_headline: boolean }[] }) => {
      await run(supabase.from("od_indicators").update({ is_headline: false }).eq("report_id", reportId));
      for (const kpi of kpis) {
        await run(
          supabase
            .from("od_indicators")
            .update({ is_kpi: kpi.is_kpi, kpi_position: kpi.kpi_position, is_headline: kpi.is_headline })
            .eq("id", kpi.id),
        );
      }
    },
  );
}

/** Registro de la carga, para responder "de dónde salió esta cifra". */
async function logImport(periodId: string, reportId: string | null, kind: OdImportKind, cells: number, fileName = "", summary: Record<string, unknown> = {}) {
  await run(
    supabase.from("od_imports").insert({ period_id: periodId, report_id: reportId, kind, cells_changed: cells, file_name: fileName, summary }),
  );
}

export interface SaveValuesInput {
  periodId: string;
  reportId: string;
  kind: OdImportKind;
  fileName?: string;
  values: OdValueRow[];
}

export function useSaveValues() {
  return useOdMutation(async ({ periodId, reportId, kind, fileName, values }: SaveValuesInput) => {
    for (let i = 0; i < values.length; i += 500) {
      await run(supabase.from("od_values").upsert(values.slice(i, i + 500), { onConflict: "indicator_id,year,term,campus_id" }));
    }
    await logImport(periodId, reportId, kind, values.length, fileName, { tabla: "od_values" });
  });
}

/**
 * Un conjunto recién creado entra a la ficha como bloque visible, al final.
 * Sin esto, lo cargado no se veía en el portal hasta añadir el bloque a mano
 * en Diseño visual. Los desgloses comparten un solo bloque.
 */
async function ensureBlock(reportId: string, kind: OdBlockKind, refId: string | null) {
  const existing = unwrap<{ id: string; kind: OdBlockKind; ref_id: string | null; position: number }[]>(
    await supabase.from("od_report_blocks").select("id,kind,ref_id,position").eq("report_id", reportId),
  );
  if (existing.some((b) => b.kind === kind && (refId === null || b.ref_id === refId))) return;
  const position = existing.reduce((max, b) => Math.max(max, b.position), 0) + 1;
  await run(supabase.from("od_report_blocks").insert({ report_id: reportId, kind, ref_id: refId, position, visible: true, settings: {} }));
}

type DatasetTable =
  | "od_breakdowns" | "od_heatmaps" | "od_maps" | "od_pipelines" | "od_histories" | "od_rankings" | "od_saber_pro" | "od_saber_tyt" | "od_free_sets";

/** Inserta o actualiza un conjunto; al insertarlo, le crea su bloque. */
async function saveDataset(
  table: DatasetTable,
  kind: OdBlockKind,
  row: { id?: string; report_id: string } & Record<string, unknown>,
) {
  const { id, ...fields } = row;
  if (id) {
    await run(supabase.from(table).update(fields).eq("id", id));
    return;
  }
  const created = unwrap<{ id: string }>(await supabase.from(table).insert(fields).select("id").single());
  // Desgloses, rankings, Saber PRO y el Motor Beta comparten un bloque del informe; los demás, uno por conjunto.
  const shared: OdBlockKind[] = ["desgloses", "rankings", "saber_pro", "saber_tyt"];
  await ensureBlock(row.report_id, kind, shared.includes(kind) ? null : created.id);
}

export function useSaveBreakdown() {
  return useOdMutation(async (row: Partial<OdBreakdownRow> & { report_id: string }) => saveDataset("od_breakdowns", "desgloses", row));
}

export function useSaveBreakdownValues() {
  return useOdMutation(
    async ({ periodId, reportId, breakdownId, values, removeLabels, kind }: {
      periodId: string; reportId: string; breakdownId: string; values: OdBreakdownValueRow[]; removeLabels: string[]; kind: OdImportKind;
    }) => {
      if (removeLabels.length) {
        await run(supabase.from("od_breakdown_values").delete().eq("breakdown_id", breakdownId).in("label", removeLabels));
      }
      if (values.length) {
        await run(supabase.from("od_breakdown_values").upsert(values, { onConflict: "breakdown_id,year,term,label" }));
      }
      await logImport(periodId, reportId, kind, values.length, "", { tabla: "od_breakdown_values" });
    },
  );
}

export function useSaveHeatmap() {
  return useOdMutation(async (row: Partial<OdHeatmapRow> & { report_id: string }) => saveDataset("od_heatmaps", "mapa_calor", row));
}

export function useSaveHeatmapCells() {
  return useOdMutation(
    async ({ periodId, reportId, cells, kind, structure }: {
      periodId: string; reportId: string; cells: OdHeatmapCellRow[]; kind: OdImportKind;
      /** Tabla pegada con otra estructura: se guardan filas y columnas y se rehace la matriz entera. */
      structure?: { heatmapId: string; rows: string[]; columns: string[] };
    }) => {
      if (structure) {
        await run(supabase.from("od_heatmaps").update({ rows: structure.rows, columns: structure.columns }).eq("id", structure.heatmapId));
        await run(supabase.from("od_heatmap_cells").delete().eq("heatmap_id", structure.heatmapId));
      }
      if (cells.length) {
        await run(supabase.from("od_heatmap_cells").upsert(cells, { onConflict: "heatmap_id,row_index,column_index" }));
      }
      await logImport(periodId, reportId, kind, cells.length, "", { tabla: "od_heatmap_cells" });
    },
  );
}

export function useSaveMap() {
  return useOdMutation(async (row: Partial<OdMapRow> & { report_id: string }) => saveDataset("od_maps", "mapa", row));
}

export function useSaveMapValues() {
  return useOdMutation(
    async ({ periodId, reportId, mapId, year, campusId, values, remove, kind }: {
      periodId: string; reportId: string; mapId: string; year: number; campusId: string;
      values: OdMapValueRow[]; remove: string[]; kind: OdImportKind;
    }) => {
      if (remove.length) {
        await run(
          supabase.from("od_map_values").delete().eq("map_id", mapId).eq("year", year).eq("campus_id", campusId).in("department_code", remove),
        );
      }
      if (values.length) {
        await run(supabase.from("od_map_values").upsert(values, { onConflict: "map_id,year,campus_id,department_code" }));
      }
      await logImport(periodId, reportId, kind, values.length + remove.length, "", { tabla: "od_map_values" });
    },
  );
}

export function useSavePipeline() {
  return useOdMutation(async (row: Partial<OdPipelineRow> & { report_id: string }) => saveDataset("od_pipelines", "tuberia", row));
}

export function useSaveHistory() {
  return useOdMutation(async (row: Partial<OdHistoryRow> & { report_id: string }) => saveDataset("od_histories", "historico", row));
}

/** Cifras de una evolución histórica: periodos × categorías. Quitar un periodo o una categoría borra sus cifras. */
export function useSaveHistoryValues() {
  return useOdMutation(
    async ({ periodId, reportId, historyId, values, removePeriods, removeCategories, kind }: {
      periodId: string; reportId: string; historyId: string; values: OdHistoryValueRow[];
      removePeriods: string[]; removeCategories: string[]; kind: OdImportKind;
    }) => {
      if (removePeriods.length) {
        await run(supabase.from("od_history_values").delete().eq("history_id", historyId).in("period_label", removePeriods));
      }
      if (removeCategories.length) {
        await run(supabase.from("od_history_values").delete().eq("history_id", historyId).in("category", removeCategories));
      }
      if (values.length) {
        await run(supabase.from("od_history_values").upsert(values, { onConflict: "history_id,period_label,category" }));
      }
      await logImport(periodId, reportId, kind, values.length, "", { tabla: "od_history_values" });
    },
  );
}

export function useSavePipelineValues() {
  return useOdMutation(
    async ({ periodId, reportId, values, removeCohorts = [], pipelineId, kind }: {
      periodId: string; reportId: string; values: OdPipelineValueRow[]; removeCohorts?: string[]; pipelineId?: string; kind: OdImportKind;
    }) => {
      if (removeCohorts.length && pipelineId) {
        await run(supabase.from("od_pipeline_values").delete().eq("pipeline_id", pipelineId).in("cohort", removeCohorts));
      }
      if (values.length) {
        await run(supabase.from("od_pipeline_values").upsert(values, { onConflict: "pipeline_id,cohort,campus_id,stage_index" }));
      }
      await logImport(periodId, reportId, kind, values.length, "", { tabla: "od_pipeline_values" });
    },
  );
}

/* --- Rankings (0030) ---------------------------------------------------------- */

export function useSaveRanking() {
  return useOdMutation(async (row: Partial<OdRankingRow> & { report_id: string }) => saveDataset("od_rankings", "rankings", row));
}

/** Guarda una edición completa (posiciones y listas); sin fila previa, la crea. */
export function useSaveRankingEdition() {
  return useOdMutation(
    async ({ periodId, reportId, edition }: { periodId: string; reportId: string; edition: OdRankingEditionRow }) => {
      const { id, ...fields } = edition;
      void id;
      await run(supabase.from("od_ranking_editions").upsert(fields, { onConflict: "ranking_id,year" }));
      await logImport(periodId, reportId, "rejilla", 1, "", { tabla: "od_ranking_editions", anio: edition.year });
    },
  );
}

export function useDeleteRankingEdition() {
  return useOdMutation(async ({ rankingId, year }: { rankingId: string; year: number }) => {
    await run(supabase.from("od_ranking_editions").delete().eq("ranking_id", rankingId).eq("year", year));
  });
}

/* --- Saber PRO (0031) ----------------------------------------------------------- */

const SABER_UNIQUE = "saber_id,year,scope,campus,faculty,program,competency";

export function useSaveSaberPro() {
  return useOdMutation(async (row: Partial<OdSaberProRow> & { report_id: string }) => saveDataset("od_saber_pro", "saber_pro", row));
}

/**
 * Resultados por programa agregados en el navegador desde el Excel del ICFES.
 * Reemplaza los años del archivo: borra sus filas de ámbito programa y sube
 * las nuevas en tandas de 500. Los promedios oficial y nacional no se tocan.
 */
export function useReplaceSaberProResults() {
  return useOdMutation(
    async ({ periodId, reportId, saberId, years, rows, fileName = "" }: {
      periodId: string; reportId: string; saberId: string; years: number[]; rows: OdSaberProResultRow[]; fileName?: string;
    }) => {
      if (years.length) {
        await run(supabase.from("od_saber_pro_results").delete().eq("saber_id", saberId).eq("scope", "programa").in("year", years));
      }
      for (let i = 0; i < rows.length; i += 500) {
        await run(supabase.from("od_saber_pro_results").insert(rows.slice(i, i + 500)));
      }
      await logImport(periodId, reportId, "plantilla", rows.length, fileName, { tabla: "od_saber_pro_results", anios: years });
    },
  );
}

/** Promedio oficial de la institución y nacional: se escriben las casillas con cifra y se borran las vaciadas. */
export function useSaveSaberProReference() {
  return useOdMutation(
    async ({ periodId, reportId, saberId, rows, remove }: {
      periodId: string; reportId: string; saberId: string; rows: OdSaberProResultRow[];
      remove: { year: number; scope: "institucion" | "nacional"; competency: OdSaberProResultRow["competency"] }[];
    }) => {
      for (const cell of remove) {
        await run(
          supabase.from("od_saber_pro_results").delete()
            .eq("saber_id", saberId).eq("year", cell.year).eq("scope", cell.scope).eq("competency", cell.competency),
        );
      }
      if (rows.length) await run(supabase.from("od_saber_pro_results").upsert(rows, { onConflict: SABER_UNIQUE }));
      await logImport(periodId, reportId, "rejilla", rows.length + remove.length, "", { tabla: "od_saber_pro_results" });
    },
  );
}

/** Borra un año completo: programas, promedio oficial y nacional. */
export function useDeleteSaberProYear() {
  return useOdMutation(async ({ saberId, year }: { saberId: string; year: number }) => {
    await run(supabase.from("od_saber_pro_results").delete().eq("saber_id", saberId).eq("year", year));
  });
}

/* --- Motor Beta · Saber TyT (0035) ------------------------------------------------- */

export function useSaveSaberTyt() {
  return useOdMutation(async (row: Partial<OdSaberTytRow> & { report_id: string }) => saveDataset("od_saber_tyt", "saber_tyt", row));
}

/**
 * Resultados de los dos motores: el cruce Saber 11 → Saber TyT se agrega en el
 * navegador y aquí solo llegan las filas por año, nivel, programa y competencia.
 * Reemplaza los años del archivo y escribe de nuevo, en el conjunto, las curvas
 * de percentil (Motor Beta) y los coeficientes del modelo (Motor Alpha): unas y
 * otros se calculan sobre toda la cohorte, así que no se pueden mezclar con los
 * viejos. Los promedios nacionales que ya tenga el conjunto se respetan.
 */
export function useReplaceSaberTytResults() {
  return useOdMutation(
    async ({ periodId, reportId, tytId, years, rows, benchmarks, alpha, fileName = "" }: {
      periodId: string; reportId: string; tytId: string; years: number[];
      rows: OdSaberTytResultRow[]; benchmarks: TytBenchmarks; alpha?: AlphaData; fileName?: string;
    }) => {
      if (years.length) {
        await run(supabase.from("od_saber_tyt_results").delete().eq("tyt_id", tytId).in("year", years));
      }
      for (let i = 0; i < rows.length; i += 500) {
        await run(supabase.from("od_saber_tyt_results").insert(rows.slice(i, i + 500)));
      }
      await run(supabase.from("od_saber_tyt").update(alpha ? { benchmarks, alpha } : { benchmarks }).eq("id", tytId));
      await logImport(periodId, reportId, "plantilla", rows.length, fileName, { tabla: "od_saber_tyt_results", anios: years });
    },
  );
}

/** Borra un año completo del Motor Beta; las curvas se quedan hasta la próxima importación. */
export function useDeleteSaberTytYear() {
  return useOdMutation(async ({ tytId, year }: { tytId: string; year: number }) => {
    await run(supabase.from("od_saber_tyt_results").delete().eq("tyt_id", tytId).eq("year", year));
  });
}

/* --- Conjuntos libres (0033) ------------------------------------------------------ */

/**
 * Definición de un conjunto libre: título, temporalidad, columnas y vistas.
 * Al crearlo entra a la ficha con un bloque que muestra todas sus vistas.
 * Si se guardan las vistas, los bloques que apuntaban a una vista que ya no
 * existe se ajustan: se borran, salvo que sean los únicos del conjunto, que
 * pasan a mostrar todas las vistas en vez de quedar vacíos.
 */
export function useSaveFreeSet() {
  return useOdMutation(async (row: Partial<OdFreeSetRow> & { report_id: string }) => {
    await saveDataset("od_free_sets", "libre", row);
    if (!row.id || !row.views) return;
    const keys = row.views.map((v) => v.key);
    const blocks = unwrap<Pick<OdReportBlockRow, "id" | "settings">[]>(
      await supabase.from("od_report_blocks").select("id,settings").eq("kind", "libre").eq("ref_id", row.id),
    );
    const stale = blocks.filter((b) => b.settings?.view && !keys.includes(b.settings.view));
    if (!stale.length) return;
    let drop = stale;
    if (stale.length === blocks.length) {
      const [first, ...others] = stale;
      const { view, ...settings } = first.settings;
      void view;
      await run(supabase.from("od_report_blocks").update({ settings }).eq("id", first.id));
      drop = others;
    }
    if (drop.length) await run(supabase.from("od_report_blocks").delete().in("id", drop.map((b) => b.id)));
  });
}

/**
 * Filas de un conjunto libre: se reemplazan todas. Se borran las del conjunto
 * y se suben las nuevas en tandas de 500, con su posición en el orden dado.
 * Cada fila lleva su tipo (dato, título de grupo o total) y su texto; el total
 * se guarda sin casillas, que lo calcula el portal (0034).
 */
export function useReplaceFreeSetRows() {
  return useOdMutation(
    async ({ periodId, reportId, setId, rows, kind = "rejilla" }: {
      periodId: string; reportId: string; setId: string; rows: Pick<OdFreeSetRecordRow, "year" | "kind" | "label" | "cells">[]; kind?: OdImportKind;
    }) => {
      await run(supabase.from("od_free_set_rows").delete().eq("set_id", setId));
      const records: OdFreeSetRecordRow[] = rows.map((r, position) => ({
        set_id: setId, position, year: r.year, kind: r.kind ?? "dato", label: r.label ?? "", cells: r.kind === "total" ? {} : r.cells,
      }));
      for (let i = 0; i < records.length; i += 500) {
        await run(supabase.from("od_free_set_rows").insert(records.slice(i, i + 500)));
      }
      await logImport(periodId, reportId, kind, records.length, "", { tabla: "od_free_set_rows" });
    },
  );
}

export function useDeleteDataset() {
  return useOdMutation(async ({ table, id }: { table: DatasetTable; id: string }) => {
    await run(supabase.from(table).delete().eq("id", id));
  });
}

export function useSaveBlocks() {
  return useOdMutation(
    async ({ reportId, blocks, remove }: { reportId: string; blocks: (Omit<OdReportBlockRow, "id"> & { id?: string })[]; remove: string[] }) => {
      if (remove.length) await run(supabase.from("od_report_blocks").delete().in("id", remove));
      for (const block of blocks) {
        const { id, ...fields } = block;
        if (id) await run(supabase.from("od_report_blocks").update(fields).eq("id", id));
        else await run(supabase.from("od_report_blocks").insert({ ...fields, report_id: reportId }));
      }
    },
  );
}

export function useSetReportStatus() {
  return useOdMutation(async ({ id, status }: { id: string; status: PublicationStatus }) => {
    await run(supabase.from("od_reports").update({ status }).eq("id", id));
  });
}

/** Informe nuevo: nace en borrador con los bloques básicos de la ficha. */
export function useCreateReport() {
  return useOdMutation(
    async ({ periodId, name, slug, code, line, position }: { periodId: string; name: string; slug: string; code: string; line: number; position: number }) => {
      const created = unwrap<{ id: string }>(
        await supabase
          .from("od_reports")
          .insert({ period_id: periodId, name, slug, code, line, position, status: "borrador" })
          .select("id")
          .single(),
      );
      const kinds = ["kpis", "evolucion", "tabla_dinamica", "metodologia"] as const;
      await run(
        supabase.from("od_report_blocks").insert(
          kinds.map((kind, index) => ({ report_id: created.id, kind, position: index + 1, visible: true, settings: kind === "evolucion" ? { chart: "lineas" } : {} })),
        ),
      );
      return slug;
    },
  );
}
