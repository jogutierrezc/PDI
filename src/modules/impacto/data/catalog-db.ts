/* =============================================================================
   Catálogo de Impacto en la base: lecturas y cambios.

   Todo pasa por RLS: leer el catálogo pide sesión; escribirlo, la capacidad
   impacto.catalogo. Publicar, abrir una versión y renumerar van por RPC
   (0067) porque tienen reglas que no caben en una política.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import type { FunctionId, Level } from "./types";

export interface CatalogVersion {
  id: string;
  number: number;
  state: "borrador" | "publicada";
  source_file: string;
  notes: string;
  created_at: string;
  published_at: string | null;
}

export interface DbIndicator {
  id: string;
  version_id: string;
  code: string;
  function_id: FunctionId;
  level: Level;
  catalog_state: "oficial" | "sugerido";
  name: string;
  description: string;
  matrix_sheet: string | null;
  matrix_row: number | null;
  unit_original: string;
  responsible_original: string;
  source: string;
  unit: "numero" | "porcentaje" | "razon" | "puntaje" | "moneda_cop" | "horas" | null;
  calc_type: "conteo" | "razon" | "puntaje" | "comparacion" | "texto" | null;
  numerator_def: string | null;
  denominator_def: string | null;
  factor: 1 | 100 | null;
  aggregation: "suma" | "razon_de_sumas" | "promedio_ponderado" | "no_agregable" | null;
  direction: "mayor_mejor" | "menor_mejor" | null;
  periodicity: "semestral" | "anual" | null;
  report_level: "programa_sede" | "programa" | "facultad" | "institucional" | null;
  applies_degrees: string[];
  applies_modalities: string[];
  capture_mode: "manual" | "precargado" | "encuesta" | "calculado" | null;
  evidence_type: string | null;
  evidence_required: boolean;
  variation_threshold: number;
  range_min: number | null;
  range_max: number | null;
  n_minimum: number | null;
  allows_over_one: boolean;
  validator_function: FunctionId | null;
  in_pilot: boolean;
  sheet_complete: boolean;
  open_findings: number;
  version_state: "borrador" | "publicada";
}

export interface DbFinding {
  id: string;
  version_id: string;
  sheet: string;
  row_number: number | null;
  column_name: string | null;
  kind: string;
  value: string | null;
  suggestion: string | null;
  state: "abierto" | "resuelto" | "aceptado";
  note: string;
  resolved_at: string | null;
}

export interface IndicatorDetail {
  targets: { year: number; numeric_value: number | null; text_value: string | null }[];
  baselines: { year: number; value: number; unit_id: string | null }[];
  alignments: { kind: string; code: string }[];
  missing: string[];
}

/** Los campos de la ficha técnica que se editan desde la pantalla. */
export type SheetPatch = Partial<
  Pick<
    DbIndicator,
    | "code"
    | "unit"
    | "calc_type"
    | "numerator_def"
    | "denominator_def"
    | "factor"
    | "aggregation"
    | "direction"
    | "periodicity"
    | "report_level"
    | "applies_degrees"
    | "applies_modalities"
    | "capture_mode"
    | "evidence_type"
    | "evidence_required"
    | "variation_threshold"
    | "range_min"
    | "range_max"
    | "n_minimum"
    | "allows_over_one"
    | "validator_function"
    | "in_pilot"
  >
>;

export class CatalogError extends Error {}

function fail(error: { code?: string; message: string } | null, missingMigration: string): never | void {
  if (!error) return;
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01") {
    throw new CatalogError(`La base aún no tiene esta parte de Impacto: aplique la migración ${missingMigration}.`);
  }
  const friendly = describeDatabaseError(error as DatabaseError);
  // Los mensajes de las funciones de Impacto ya vienen en español y dicen qué hacer.
  throw new CatalogError(error.code === "P0001" || error.code === "23514" || error.code === "55000" ? error.message : `${friendly.message}${friendly.advice ? ` ${friendly.advice}` : ""}`);
}

const KEY = ["impacto", "catalogo"] as const;
export const catalogKeys = {
  versions: [...KEY, "versiones"] as const,
  indicators: (versionId: string) => [...KEY, "indicadores", versionId] as const,
  findings: (versionId: string) => [...KEY, "hallazgos", versionId] as const,
  detail: (indicatorId: string) => [...KEY, "detalle", indicatorId] as const,
};

export function useCatalogVersions() {
  return useQuery({
    queryKey: catalogKeys.versions,
    queryFn: async (): Promise<CatalogVersion[]> => {
      const { data, error } = await supabase
        .from("imp_catalog_versions")
        .select("id, number, state, source_file, notes, created_at, published_at")
        .order("number", { ascending: false });
      fail(error, "0064_impacto_modelo.sql");
      return (data ?? []) as CatalogVersion[];
    },
  });
}

export function useCatalogIndicators(versionId: string | null) {
  return useQuery({
    queryKey: catalogKeys.indicators(versionId ?? "-"),
    enabled: Boolean(versionId),
    queryFn: async (): Promise<DbIndicator[]> => {
      const { data, error } = await supabase
        .from("imp_indicators_admin")
        .select("*")
        .eq("version_id", versionId!)
        .order("function_id")
        .order("matrix_row");
      fail(error, "0067_impacto_catalogo_admin.sql");
      const order = { investigacion: 0, ensenanza: 1, extension: 2 } as const;
      return ((data ?? []) as DbIndicator[]).sort(
        (a, b) => order[a.function_id] - order[b.function_id] || a.code.localeCompare(b.code, "es", { numeric: true }),
      );
    },
  });
}

export function useCatalogFindings(versionId: string | null) {
  return useQuery({
    queryKey: catalogKeys.findings(versionId ?? "-"),
    enabled: Boolean(versionId),
    queryFn: async (): Promise<DbFinding[]> => {
      const { data, error } = await supabase
        .from("imp_import_findings")
        .select("id, version_id, sheet, row_number, column_name, kind, value, suggestion, state, note, resolved_at")
        .eq("version_id", versionId!)
        .order("sheet")
        .order("row_number", { nullsFirst: true });
      fail(error, "0064_impacto_modelo.sql");
      return (data ?? []) as DbFinding[];
    },
  });
}

export function useIndicatorDetail(indicatorId: string | null) {
  return useQuery({
    queryKey: catalogKeys.detail(indicatorId ?? "-"),
    enabled: Boolean(indicatorId),
    queryFn: async (): Promise<IndicatorDetail> => {
      const [targets, baselines, alignments, missing] = await Promise.all([
        supabase.from("imp_targets").select("year, numeric_value, text_value").eq("indicator_id", indicatorId!).order("year"),
        supabase.from("imp_baselines").select("year, value, unit_id").eq("indicator_id", indicatorId!).order("year"),
        supabase.from("imp_alignments").select("kind, code").eq("indicator_id", indicatorId!),
        supabase.rpc("imp_indicator_missing", { target: indicatorId! }),
      ]);
      fail(targets.error, "0064_impacto_modelo.sql");
      fail(baselines.error, "0064_impacto_modelo.sql");
      fail(alignments.error, "0064_impacto_modelo.sql");
      fail(missing.error, "0067_impacto_catalogo_admin.sql");
      return {
        targets: (targets.data ?? []) as IndicatorDetail["targets"],
        baselines: (baselines.data ?? []) as IndicatorDetail["baselines"],
        alignments: (alignments.data ?? []) as IndicatorDetail["alignments"],
        missing: (missing.data ?? []) as string[],
      };
    },
  });
}

function useInvalidateCatalog() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: KEY });
}

export function useSaveSheet() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SheetPatch }) => {
      const { error } = await supabase.from("imp_indicators").update(patch).eq("id", id);
      fail(error, "0064_impacto_modelo.sql");
    },
    onSuccess: invalidate,
  });
}

/** Escribe varias fichas a la vez (precargar el piloto). */
export function useSaveSheets() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (items: { id: string; patch: SheetPatch }[]) => {
      for (const { id, patch } of items) {
        const { error } = await supabase.from("imp_indicators").update(patch).eq("id", id);
        fail(error, "0064_impacto_modelo.sql");
      }
      return items.length;
    },
    onSuccess: invalidate,
  });
}

export function usePublishCatalog() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (versionId: string) => {
      const { data, error } = await supabase.rpc("imp_publish_catalog", { target: versionId });
      fail(error, "0067_impacto_catalogo_admin.sql");
      return data as { number: number; indicators: number; pilot: number };
    },
    onSuccess: invalidate,
  });
}

export function useNewDraft() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("imp_new_draft");
      fail(error, "0067_impacto_catalogo_admin.sql");
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useDiscardDraft() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("imp_discard_draft");
      fail(error, "0066_impacto_importar_catalogo.sql");
    },
    onSuccess: invalidate,
  });
}

export function useRenumberCodes() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (versionId: string) => {
      const { data, error } = await supabase.rpc("imp_renumber_codes", { target: versionId });
      fail(error, "0067_impacto_catalogo_admin.sql");
      return data as number;
    },
    onSuccess: invalidate,
  });
}

export function useResolveFinding() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, state, note }: { id: string; state: DbFinding["state"]; note: string }) => {
      const { error } = await supabase.from("imp_import_findings").update({ state, note }).eq("id", id);
      fail(error, "0067_impacto_catalogo_admin.sql");
    },
    onSuccess: invalidate,
  });
}
