import { FriendlyError } from "../../../data/errors";
/* =============================================================================
   UDES en Cifras · datos de la intranet.

   La intranet lee con el mismo repositorio que el portal (borradores
   incluidos) y escribe tabla por tabla. Cada mutación invalida a la vez la
   caché de la intranet y la del portal: lo que se guarda aquí es lo que el
   público ve al publicar, sin un paso de sincronización intermedio.

   Cada escritura declara qué familias de tablas toca (`touches`) y la
   relectura del periodo pide solo esas (reload-plan.ts): guardar una rejilla
   ya no relee Saber PRO, los mapas y los desgloses. La que no declara nada
   relee todo, como antes.
   ========================================================================== */

import { hashKey, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { REPORT_BUCKET } from "../../datos-abiertos/data/images";
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
  OdMedalBoardRow,
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
import type { OpenDataRows, RowFamily } from "../../datos-abiertos/data/repository";
import { ReloadPlan } from "./reload-plan";
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

/** Qué familias quedan por releer en cada lectura de periodo. */
const reloadPlan = new ReloadPlan();
const PERIOD_DATA = [...odAdminKeys.all, "period"] as const;

export function useOdAdminData(periodId: string | undefined) {
  const client = useQueryClient();
  return useQuery({
    queryKey: odAdminKeys.period(periodId ?? "none"),
    enabled: Boolean(periodId),
    queryFn: async (): Promise<AdminData | null> => {
      const key = odAdminKeys.period(periodId ?? "none");
      const hash = hashKey(key);
      const previous = client.getQueryData<AdminData | null>(key);
      const take = reloadPlan.take(hash, Date.now());
      // Tras guardar, solo las familias tocadas; el resto sale de la lectura anterior.
      const reuse = take.only && previous ? { rows: previous.rows, only: take.only } : undefined;
      const rows = await fetchOpenDataRows({ periodId, includeDrafts: true, reuse });
      reloadPlan.settle(hash, reuse ? take : { ...take, only: null }, Date.now());
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

/**
 * Qué toca una escritura. `families`: las familias de tablas del periodo que
 * hay que releer (vacío: solo el periodo, sus campus, oficinas e informes, que
 * se releen siempre). `also`: las otras lecturas de la intranet que cambian.
 */
interface Touches {
  families: readonly RowFamily[];
  also?: readonly ("periods" | "publications")[];
}

/**
 * Envuelve una escritura: invalida intranet y portal al terminar. Sin
 * `touches` relee todo; con él, solo lo que la escritura pudo cambiar.
 */
function useOdMutation<TInput>(fn: (input: TInput) => Promise<unknown>, touches?: Touches) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      // Se apunta antes de invalidar: la relectura que dispara la invalidación ya lo lee.
      for (const query of client.getQueryCache().findAll({ queryKey: PERIOD_DATA })) {
        const fresh = !query.state.isInvalidated && query.state.data != null;
        reloadPlan.mark(query.queryHash, touches ? touches.families : "all", fresh);
      }
      if (!touches) {
        await Promise.all([
          client.invalidateQueries({ queryKey: odAdminKeys.all }),
          client.invalidateQueries({ queryKey: openDataKeys.all }),
        ]);
        return;
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: PERIOD_DATA }),
        client.invalidateQueries({ queryKey: openDataKeys.all }),
        ...(touches.also ?? []).map((name) => client.invalidateQueries({ queryKey: [...odAdminKeys.all, name] })),
      ]);
    },
  });
}

const run = async <T>(query: PromiseLike<Result<T>>) => unwrap(await query);

export function useSavePeriod() {
  return useOdMutation(async ({ id, patch }: { id: string; patch: Partial<OdPeriod> }) => {
    await run(supabase.from("od_periods").update(patch).eq("id", id));
  }, { families: [], also: ["periods", "publications"] });
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
  }, { families: [] });
}

export function useDeleteOffice() {
  return useOdMutation(async (id: string) => {
    await run(supabase.from("od_offices").delete().eq("id", id));
  });
}

export function useSaveReport() {
  return useOdMutation(async ({ id, patch }: { id: string; patch: Partial<OdReportRow> }) => {
    await run(supabase.from("od_reports").update(patch).eq("id", id));
  }, { families: [] });
}

/**
 * El orden de los informes del periodo.
 *
 * Renumera de uno en adelante todas las filas en vez de tocar solo las que se
 * movieron: `position` es un entero libre y arrastrar sobre una numeración con
 * huecos deja empates que ordenan distinto en cada carga. Once escrituras a
 * la vez y una sola invalidación al final, que es lo que evita que la lista dé
 * saltos mientras se guarda.
 */
export function useReorderReports() {
  return useOdMutation(async (rows: { id: string; position: number }[]) => {
    // Cada fila escribe su propia posición: van a la vez, no una detrás de otra.
    await Promise.all(rows.map((row) => run(supabase.from("od_reports").update({ position: row.position }).eq("id", row.id))));
  }, { families: [] });
}

/* --- Imágenes de un informe (0053) ------------------------------------------ */

export const MAX_REPORT_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Sube una fotografía del grid y devuelve su ruta en el bucket «informes».
 *
 * El sello de tiempo delante evita que subir dos veces «jornada.jpg»
 * sobrescriba la primera, y que el navegador siga enseñando la anterior desde
 * su caché.
 */
export async function uploadReportImage(reportSlug: string, file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new FriendlyError(`«${file.name}» no es una imagen admitida. Sube un JPG, PNG, WebP o AVIF.`);
  }
  if (file.size > MAX_REPORT_IMAGE_BYTES) {
    throw new FriendlyError(
      `«${file.name}» pesa más de 8 MB, el tope del almacenamiento de informes. Redúcela antes de subirla.`,
    );
  }
  const clean =
    file.name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "imagen";
  const path = `${reportSlug}/${Date.now()}-${clean}`;
  const { error } = await supabase.storage.from(REPORT_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    throw new FriendlyError(
      /bucket/i.test(error.message)
        ? 'No existe el bucket "informes" en Storage. Aplica la migración 0053 o créalo a mano: público en lectura, 8 MB por archivo.'
        : `No se pudo subir la imagen: ${error.message}`,
    );
  }
  return path;
}

/** Borra una imagen del bucket. Un fallo aquí no debe tumbar la edición. */
export async function removeReportImage(path: string | null | undefined) {
  const value = (path ?? "").trim();
  if (!value || value.startsWith("/") || /^(https?:)?\/\//i.test(value)) return;
  const { error } = await supabase.storage.from(REPORT_BUCKET).remove([value]);
  if (error) console.warn("No se pudo borrar la imagen:", error.message);
}

export function useSaveIndicator() {
  return useOdMutation(async (row: Partial<OdIndicatorRow> & { report_id: string }) => {
    const { id, ...fields } = row;
    if (id) await run(supabase.from("od_indicators").update(fields).eq("id", id));
    else await run(supabase.from("od_indicators").insert(fields));
  }, { families: ["indicators"] });
}

export function useDeleteIndicator() {
  return useOdMutation(async (id: string) => {
    await run(supabase.from("od_indicators").delete().eq("id", id));
  }, { families: ["indicators"] });
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
      // Con todos los titulares ya apagados, cada fila se escribe sin esperar a la anterior.
      await Promise.all(
        kpis.map((kpi) =>
          run(
            supabase
              .from("od_indicators")
              .update({ is_kpi: kpi.is_kpi, kpi_position: kpi.kpi_position, is_headline: kpi.is_headline })
              .eq("id", kpi.id),
          ),
        ),
      );
    },
    { families: ["indicators"] },
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
  }, { families: ["indicators"] });
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
  | "od_breakdowns" | "od_heatmaps" | "od_maps" | "od_pipelines" | "od_histories" | "od_rankings" | "od_saber_pro" | "od_saber_tyt" | "od_free_sets" | "od_medal_boards";

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
  const shared: OdBlockKind[] = ["desgloses", "rankings", "saber_pro", "saber_tyt", "medallero"];
  await ensureBlock(row.report_id, kind, shared.includes(kind) ? null : created.id);
}

export function useSaveBreakdown() {
  return useOdMutation(async (row: Partial<OdBreakdownRow> & { report_id: string }) => saveDataset("od_breakdowns", "desgloses", row), { families: ["breakdowns", "blocks"] });
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
    { families: ["breakdowns"] },
  );
}

export function useSaveHeatmap() {
  return useOdMutation(async (row: Partial<OdHeatmapRow> & { report_id: string }) => saveDataset("od_heatmaps", "mapa_calor", row), { families: ["heatmaps", "blocks"] });
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
    { families: ["heatmaps"] },
  );
}

export function useSaveMap() {
  return useOdMutation(async (row: Partial<OdMapRow> & { report_id: string }) => saveDataset("od_maps", "mapa", row), { families: ["maps", "blocks"] });
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
    { families: ["maps"] },
  );
}

/**
 * Mapa por municipio (0044): reemplaza de una vez las cifras de los años que
 * trae la carga. Llegan ya contadas en el navegador, con la reserva aplicada
 * (menos de 5 personas: reserved, sin valor); los años que no vienen quedan
 * como estaban.
 */
export function useReplaceMapValues() {
  return useOdMutation(
    async ({ periodId, reportId, mapId, years, rows, fileName, kind }: {
      periodId: string; reportId: string; mapId: string; years: number[];
      rows: { year: number; campus_id: string; department_code: string; value: number | null; reserved: boolean }[];
      fileName: string; kind: OdImportKind;
    }) => {
      if (years.length) await run(supabase.from("od_map_values").delete().eq("map_id", mapId).in("year", years));
      const full = rows.map((r) => ({ map_id: mapId, ...r }));
      for (let i = 0; i < full.length; i += 500) {
        await run(supabase.from("od_map_values").insert(full.slice(i, i + 500)));
      }
      await logImport(periodId, reportId, kind, rows.length, fileName, { tabla: "od_map_values", anios: years });
    },
    { families: ["maps"] },
  );
}

export function useSavePipeline() {
  return useOdMutation(async (row: Partial<OdPipelineRow> & { report_id: string }) => saveDataset("od_pipelines", "tuberia", row), { families: ["pipelines", "blocks"] });
}

export function useSaveHistory() {
  return useOdMutation(async (row: Partial<OdHistoryRow> & { report_id: string }) => saveDataset("od_histories", "historico", row), { families: ["histories", "blocks"] });
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
    { families: ["histories"] },
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
    { families: ["pipelines"] },
  );
}

/* --- Rankings (0030) ---------------------------------------------------------- */

export function useSaveRanking() {
  return useOdMutation(async (row: Partial<OdRankingRow> & { report_id: string }) => saveDataset("od_rankings", "rankings", row), { families: ["rankings", "blocks"] });
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
    { families: ["rankings"] },
  );
}

export function useDeleteRankingEdition() {
  return useOdMutation(async ({ rankingId, year }: { rankingId: string; year: number }) => {
    await run(supabase.from("od_ranking_editions").delete().eq("ranking_id", rankingId).eq("year", year));
  }, { families: ["rankings"] });
}

/* --- Medallero (0056) --------------------------------------------------------- */

export function useSaveMedalBoard() {
  return useOdMutation(async (row: Partial<OdMedalBoardRow> & { report_id: string }) => saveDataset("od_medal_boards", "medallero", row), { families: ["medalBoards", "blocks"] });
}

export function useDeleteMedalBoard() {
  return useOdMutation(async (boardId: string) => {
    await run(supabase.from("od_medal_boards").delete().eq("id", boardId));
  });
}

/**
 * Guarda las filas de un corte de un medallero.
 *
 * Se reemplaza el corte entero —se borra lo que ya no está y se sube lo que
 * queda— porque la captura trabaja con la tabla de un año delante: quitar una
 * fila de la rejilla tiene que quitarla de la base, y una tabla sin esa fila
 * no puede decirlo de otra forma.
 */
export function useSaveMedalEntries() {
  return useOdMutation(
    async ({
      periodId,
      reportId,
      boardId,
      year,
      term,
      entries,
    }: {
      periodId: string;
      reportId: string;
      boardId: string;
      year: number;
      term: "A" | "B" | null;
      entries: { label: string; counts: Record<string, number | null>; note: string; position: number }[];
    }) => {
      const keep = entries.map((e) => e.label);
      let clear = supabase.from("od_medal_entries").delete().eq("board_id", boardId).eq("year", year);
      clear = term === null ? clear.is("term", null) : clear.eq("term", term);
      if (keep.length) clear = clear.not("label", "in", `(${keep.map((l) => `"${l.replace(/"/g, '""')}"`).join(",")})`);
      await run(clear);

      if (entries.length) {
        await run(
          supabase.from("od_medal_entries").upsert(
            entries.map((e) => ({ board_id: boardId, year, term, label: e.label, counts: e.counts, note: e.note, position: e.position })),
            { onConflict: "board_id,year,term,label" },
          ),
        );
      }
      await logImport(periodId, reportId, "rejilla", entries.length, "", { tabla: "od_medal_entries", anio: year });
    },
    { families: ["medalBoards"] },
  );
}

/* --- Saber PRO (0031) ----------------------------------------------------------- */

const SABER_UNIQUE = "saber_id,year,scope,campus,faculty,program,competency";

export function useSaveSaberPro() {
  return useOdMutation(async (row: Partial<OdSaberProRow> & { report_id: string }) => saveDataset("od_saber_pro", "saber_pro", row), { families: ["saberPro", "blocks"] });
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
    { families: ["saberPro"] },
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
    { families: ["saberPro"] },
  );
}

/** Borra un año completo: programas, promedio oficial y nacional. */
export function useDeleteSaberProYear() {
  return useOdMutation(async ({ saberId, year }: { saberId: string; year: number }) => {
    await run(supabase.from("od_saber_pro_results").delete().eq("saber_id", saberId).eq("year", year));
  }, { families: ["saberPro"] });
}

/* --- Motor Beta · Saber TyT (0035) ------------------------------------------------- */

export function useSaveSaberTyt() {
  return useOdMutation(async (row: Partial<OdSaberTytRow> & { report_id: string }) => saveDataset("od_saber_tyt", "saber_tyt", row), { families: ["saberTyt", "blocks"] });
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
    { families: ["saberTyt"] },
  );
}

/** Borra un año completo del Motor Beta; las curvas se quedan hasta la próxima importación. */
export function useDeleteSaberTytYear() {
  return useOdMutation(async ({ tytId, year }: { tytId: string; year: number }) => {
    await run(supabase.from("od_saber_tyt_results").delete().eq("tyt_id", tytId).eq("year", year));
  }, { families: ["saberTyt"] });
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
  }, { families: ["freeSets", "blocks"] });
}

/**
 * Definición y filas de un conjunto libre, de una vez: así la ficha no ve
 * columnas nuevas con filas viejas más que un instante. Las filas se
 * reemplazan todas, en tandas de 500, con su posición en el orden dado. Un
 * título de grupo no lleva casillas; un total conserva las que traiga
 * escritas. Al crearlo entra a la ficha con su bloque, como cualquier conjunto.
 */
async function saveFreeSetAndRows(
  { periodId, set, rows, kind = "rejilla" }: {
    periodId: string;
    set: Partial<OdFreeSetRow> & { report_id: string };
    /** Sin filas, solo se guarda la definición. */
    rows?: Pick<OdFreeSetRecordRow, "year" | "kind" | "label" | "cells">[];
    kind?: OdImportKind;
  },
  detail: Record<string, unknown>,
) {
  const { id, ...fields } = set;
  let setId = id;
  if (setId) {
    await run(supabase.from("od_free_sets").update(fields).eq("id", setId));
  } else {
    setId = unwrap<{ id: string }>(await supabase.from("od_free_sets").insert(fields).select("id").single()).id;
    await ensureBlock(set.report_id, "libre", setId);
  }
  if (!rows) return;
  await run(supabase.from("od_free_set_rows").delete().eq("set_id", setId));
  const records: OdFreeSetRecordRow[] = rows.map((r, position) => ({
    set_id: setId!, position, year: r.year, kind: r.kind ?? "dato", label: r.label ?? "", cells: r.kind === "grupo" ? {} : r.cells,
  }));
  for (let i = 0; i < records.length; i += 500) {
    await run(supabase.from("od_free_set_rows").insert(records.slice(i, i + 500)));
  }
  await logImport(periodId, set.report_id, kind, records.length, "", { tabla: "od_free_set_rows", ...detail });
}

/**
 * Conjunto libre desde Captura: un solo guardado para el título, el tiempo, las
 * columnas y las filas (FreeSetEditor). La fila de total guarda solo las
 * casillas que quien reporta escribió; las vacías las calcula el portal
 * (`freeTotalShown`), como los totales guardados antes de esta regla (0034).
 * Las gráficas no viajan aquí: las guarda `useSaveFreeSet`.
 */
export function useSaveFreeSetWithRows() {
  return useOdMutation((input: Parameters<typeof saveFreeSetAndRows>[0]) => saveFreeSetAndRows(input, {}), { families: ["freeSets", "blocks"] });
}

/**
 * Tabla personalizada: un conjunto libre con su vista de tabla escrita a mano
 * (datos-abiertos/data/custom-table.ts). Se guarda igual que un conjunto libre
 * —definición y filas de una vez—; aquí el total lo escribe entero quien
 * publica, el portal no calcula nada.
 */
export function useSaveCustomTable() {
  return useOdMutation((input: Parameters<typeof saveFreeSetAndRows>[0]) => saveFreeSetAndRows(input, { personalizada: true }), { families: ["freeSets", "blocks"] });
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
    { families: ["blocks"] },
  );
}

export function useSetReportStatus() {
  return useOdMutation(async ({ id, status }: { id: string; status: PublicationStatus }) => {
    await run(supabase.from("od_reports").update({ status }).eq("id", id));
  }, { families: [], also: ["publications"] });
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
