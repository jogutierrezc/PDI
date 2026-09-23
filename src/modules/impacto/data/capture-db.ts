/* =============================================================================
   Captura en línea de Impacto sobre la base (0069).

   Guardar un registro compara su versión: si alguien guardó antes (otra
   persona, u otra pestaña), no se pisa su cambio y se avisa. Las
   validaciones corren en el navegador con el servicio único (validate.ts);
   aquí se traduce cada fila de la base a lo que ese servicio espera.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import { emptyDraft, validate } from "./validate";
import type { Draft, Issue, NoData } from "./validate";
import type { FunctionId, Indicator, Level, RecordState } from "./types";

export interface MyProgram {
  program_id: string;
  program_name: string;
  program_code: string;
  faculty_name: string | null;
  can_send: boolean;
}

export interface CaptureRow {
  id: string;
  assignment_id: string;
  numerator: number | null;
  denominator: number | null;
  value: number | null;
  comparison_value: number | null;
  n_responses: number | null;
  num_comparison: number | null;
  den_comparison: number | null;
  text_value: string | null;
  confirms_preloaded: boolean | null;
  preloaded: { numerator: number | null; denominator: number | null; n: number | null; file: string; at: string } | null;
  no_data: NoData;
  justification: string;
  observations: string;
  state: RecordState;
  channel: "en_linea" | "excel";
  version: number;
  captured_by: string | null;
  updated_at: string;
  program_id: string;
  campus_id: string | null;
  period_id: string;
  period_code: string;
  period_state: "abierto" | "cerrado";
  cutoff_program: string;
  program_name: string;
  campus_name: string | null;
  indicator_id: string;
  code: string;
  name: string;
  description: string;
  function_id: FunctionId;
  level: Level;
  unit: string | null;
  calc_type: "conteo" | "razon" | "puntaje" | "comparacion" | "texto";
  numerator_def: string | null;
  denominator_def: string | null;
  factor: 1 | 100;
  aggregation: "suma" | "razon_de_sumas" | "promedio_ponderado" | "no_agregable";
  direction: "mayor_mejor" | "menor_mejor";
  periodicity: "semestral" | "anual";
  capture_mode: "manual" | "precargado" | "encuesta" | "calculado";
  evidence_type: string | null;
  evidence_required: boolean;
  variation_threshold: number;
  range_min: number | null;
  range_max: number | null;
  n_minimum: number | null;
  allows_over_one: boolean;
  target_numeric: number | null;
  target_text: string | null;
  previous_value: number | null;
  previous_period: string | null;
  return_reason: string | null;
  return_comment: string | null;
  evidence_count: number;
}

export interface Evidence {
  id: string;
  kind: "archivo" | "url";
  url: string | null;
  storage_path: string | null;
  file_name: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface HistoryEntry {
  kind: "transicion" | "lote";
  at: string;
  from_state?: string;
  to_state?: string;
  reason?: string | null;
  comment?: string;
  actor?: string | null;
  file_name?: string;
}

export const editable = (state: RecordState) => state === "borrador" || state === "devuelto_programa";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

const UNIT_LABEL: Record<string, string> = {
  numero: "número",
  porcentaje: "porcentaje",
  razon: "razón",
  puntaje: "puntos",
  moneda_cop: "pesos",
  horas: "horas",
};

/** La fila de la base, como la ficha que espera el servicio de validación. */
export function indicatorOf(row: CaptureRow): Indicator {
  return {
    codigo: row.code,
    funcion: row.function_id,
    nivel: row.level,
    estado: "oficial",
    nombre: row.name,
    descripcion: row.description,
    unidad: UNIT_LABEL[row.unit ?? ""] ?? row.unit ?? "",
    lineaBase: "",
    meta: { anio: Number(row.period_code.slice(0, 4)), valor: row.target_text ?? (row.target_numeric === null ? "" : String(row.target_numeric)) },
    meta2028: "",
    responsable: "",
    fuente: "",
    dimension: "",
    pilares: [],
    proyectos: [],
    ods: [],
    origen: "",
    ficha: {
      tipo: row.calc_type,
      numerador: row.numerator_def ?? "",
      denominador: row.denominator_def ?? undefined,
      factor: row.factor,
      agregacion: row.aggregation,
      sentido: row.direction,
      periodicidad: row.periodicity,
      nivelReporte: row.campus_id ? "programa_sede" : "programa",
      aplicaA: [],
      modo: row.capture_mode,
      evidencia: row.evidence_required || row.evidence_type ? { tipo: row.evidence_type ?? "", obligatoria: row.evidence_required } : null,
      umbral: Number(row.variation_threshold),
      rango: row.range_min !== null && row.range_max !== null ? [Number(row.range_min), Number(row.range_max)] : undefined,
      nMinimo: row.n_minimum ?? undefined,
      admiteMayorQueUno: row.allows_over_one,
      enPiloto: true,
    },
  };
}

/** Lo guardado de un registro, como borrador editable. Las evidencias ya guardadas cuentan para V07. */
export function draftOf(row: CaptureRow): Draft {
  return {
    ...emptyDraft(),
    numerador: num(row.numerator),
    denominador: num(row.denominator),
    n: num(row.n_responses),
    numComparacion: num(row.num_comparison),
    denComparacion: num(row.den_comparison),
    noAplica: row.no_data,
    confirma: row.confirms_preloaded,
    justificacion: row.justification ?? "",
    evidencias: Array.from({ length: Number(row.evidence_count) }, (_, i) => ({ nombre: `evidencia ${i + 1}` })),
    texto: row.text_value ?? undefined,
  };
}

/** Validar una fila con el servicio único. `sending` exige además la evidencia. */
export function issuesOf(row: CaptureRow, draft: Draft = draftOf(row), sending = true): Issue[] {
  return validate(indicatorOf(row), draft, {
    sending,
    previous: row.previous_period ? { period: row.previous_period, value: num(row.previous_value) } : undefined,
  });
}

/** Lo que se escribe en la base desde un borrador (con sus observaciones, si las trae). */
export function patchOf(draft: Draft & { observations?: string }) {
  return {
    ...(draft.observations === undefined ? {} : { observations: draft.observations }),
    numerator: draft.numerador,
    denominator: draft.denominador,
    n_responses: draft.n,
    num_comparison: draft.numComparacion,
    den_comparison: draft.denComparacion,
    no_data: draft.noAplica,
    confirms_preloaded: draft.confirma,
    justification: draft.justificacion,
    text_value: draft.texto ?? null,
  };
}

export class ConflictError extends Error {}

function fail(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01") {
    throw new Error("La base aún no tiene la captura de Impacto: aplique la migración 0069_impacto_captura.sql.");
  }
  if (["23514", "55000", "42501", "P0001"].includes(error.code ?? "")) throw new Error(error.message);
  const friendly = describeDatabaseError(error as DatabaseError);
  throw new Error(`${friendly.message}${friendly.advice ? ` ${friendly.advice}` : ""}`);
}

const KEY = ["impacto", "captura"] as const;

export function useMyPrograms() {
  return useQuery({
    queryKey: [...KEY, "programas"],
    queryFn: async (): Promise<MyProgram[]> => {
      const { data, error } = await supabase.rpc("imp_my_programs");
      if (error && (error.code === "PGRST202" || error.code === "42883")) return [];
      fail(error);
      return (data ?? []) as MyProgram[];
    },
  });
}

export function useOpenPeriods() {
  return useQuery({
    queryKey: [...KEY, "periodos"],
    queryFn: async (): Promise<{ id: string; code: string; cutoff_program: string }[]> => {
      const { data, error } = await supabase.from("imp_periods").select("id, code, cutoff_program").eq("state", "abierto").order("code", { ascending: false });
      fail(error);
      return data ?? [];
    },
  });
}

export function useCaptureRows(periodId: string | null, programId: string | null) {
  return useQuery({
    queryKey: [...KEY, "filas", periodId, programId],
    enabled: Boolean(periodId && programId),
    queryFn: async (): Promise<CaptureRow[]> => {
      const { data, error } = await supabase
        .from("imp_capture_rows")
        .select("*")
        .eq("period_id", periodId!)
        .eq("program_id", programId!)
        .order("code")
        .order("campus_name", { nullsFirst: true });
      fail(error);
      return (data ?? []) as CaptureRow[];
    },
  });
}

export function useEvidence(recordId: string | null) {
  return useQuery({
    queryKey: [...KEY, "evidencias", recordId],
    enabled: Boolean(recordId),
    queryFn: async (): Promise<Evidence[]> => {
      const { data, error } = await supabase
        .from("imp_evidence")
        .select("id, kind, url, storage_path, file_name, size_bytes, created_at")
        .eq("record_id", recordId!)
        .order("created_at");
      fail(error);
      return (data ?? []) as Evidence[];
    },
  });
}

export function useRecordHistory(recordId: string | null) {
  return useQuery({
    queryKey: [...KEY, "historial", recordId],
    enabled: Boolean(recordId),
    queryFn: async (): Promise<HistoryEntry[]> => {
      const [transitions, batches] = await Promise.all([
        supabase
          .from("imp_transitions")
          .select("at, from_state, to_state, reason, comment, actor:profiles(full_name, email)")
          .eq("record_id", recordId!)
          .order("at"),
        supabase.from("imp_import_batch_records").select("batch:imp_import_batches(at, file_name, actor:profiles(full_name, email))").eq("record_id", recordId!),
      ]);
      fail(transitions.error);
      fail(batches.error);
      const who = (a: { full_name: string; email: string } | null) => (a ? a.full_name || a.email : null);
      const out: HistoryEntry[] = [
        ...((transitions.data ?? []) as unknown as { at: string; from_state: string; to_state: string; reason: string | null; comment: string; actor: { full_name: string; email: string } | null }[]).map(
          (t) => ({ kind: "transicion" as const, at: t.at, from_state: t.from_state, to_state: t.to_state, reason: t.reason, comment: t.comment, actor: who(t.actor) }),
        ),
        ...((batches.data ?? []) as unknown as { batch: { at: string; file_name: string; actor: { full_name: string; email: string } | null } }[]).map((b) => ({
          kind: "lote" as const,
          at: b.batch.at,
          file_name: b.batch.file_name,
          actor: who(b.batch.actor),
        })),
      ];
      return out.sort((a, b) => a.at.localeCompare(b.at));
    },
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: KEY });
}

async function saveOne(row: CaptureRow, draft: Draft & { observations?: string }) {
  const { data, error } = await supabase
    .from("imp_records")
    .update({ ...patchOf(draft), channel: "en_linea" })
    .eq("id", row.id)
    .eq("version", row.version)
    .select("id");
  fail(error);
  if (!data || data.length === 0) {
    throw new ConflictError(
      `${row.code}${row.campus_name ? ` (${row.campus_name})` : ""}: alguien guardó este registro después de que usted lo abrió, o ya no es editable. Recargue para ver el cambio.`,
    );
  }
}

export function useSaveRecord() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ row, draft }: { row: CaptureRow; draft: Draft & { observations?: string } }) => saveOne(row, draft),
    onSuccess: invalidate,
  });
}

/** Guarda varias filas (modo hoja). Devuelve cuántas guardó y los conflictos. */
export function useSaveMany() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (items: { row: CaptureRow; draft: Draft & { observations?: string }; evidenceUrl?: string }[]) => {
      let saved = 0;
      const problems: string[] = [];
      for (const { row, draft, evidenceUrl } of items) {
        try {
          await saveOne(row, draft);
          if (evidenceUrl) await addUrl(row.id, evidenceUrl);
          saved += 1;
        } catch (cause) {
          problems.push(cause instanceof Error ? cause.message : String(cause));
        }
      }
      return { saved, problems };
    },
    onSettled: invalidate,
  });
}

async function addUrl(recordId: string, url: string) {
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase.from("imp_evidence").insert({ record_id: recordId, kind: "url", url, file_name: url, created_by: user.user?.id ?? null });
  fail(error);
}

const safeName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .toLowerCase();

export function useAddEvidence() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { recordId: string; file?: File; url?: string }) => {
      if (input.url) return addUrl(input.recordId, input.url.trim());
      const file = input.file!;
      const path = `${input.recordId}/${Date.now()}-${safeName(file.name)}`;
      const upload = await supabase.storage.from("impacto").upload(path, file, { contentType: file.type || undefined });
      if (upload.error) throw new Error(`No se pudo subir el archivo: ${upload.error.message}`);
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("imp_evidence").insert({
        record_id: input.recordId,
        kind: "archivo",
        storage_path: path,
        file_name: file.name,
        size_bytes: file.size,
        mime_type: file.type || null,
        created_by: user.user?.id ?? null,
      });
      if (error) {
        await supabase.storage.from("impacto").remove([path]);
        fail(error);
      }
    },
    onSuccess: invalidate,
  });
}

export function useRemoveEvidence() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (evidence: Evidence) => {
      const { error } = await supabase.from("imp_evidence").delete().eq("id", evidence.id);
      fail(error);
      if (evidence.storage_path) await supabase.storage.from("impacto").remove([evidence.storage_path]);
    },
    onSuccess: invalidate,
  });
}

export async function evidenceLink(evidence: Evidence): Promise<string | null> {
  if (evidence.url) return evidence.url;
  if (!evidence.storage_path) return null;
  const { data } = await supabase.storage.from("impacto").createSignedUrl(evidence.storage_path, 300);
  return data?.signedUrl ?? null;
}

export function useSubmitProgram() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { periodId: string; programId: string }) => {
      const { data, error } = await supabase.rpc("imp_submit_program", { period: input.periodId, program: input.programId, certified: true });
      fail(error);
      return data as number;
    },
    onSuccess: invalidate,
  });
}
