/* =============================================================================
   Mr. Pilo en Enseñanza · Memoria · lo que se lee y se escribe.

   Base (0114–0116): pilo_docs y pilo_moodle_courses se leen; todo lo demás se
   escribe por función (pilo_doc_save, _replace, _update, _delete, _outline,
   pilo_moodle_course_set, pilo_space_set_secret). El original va al bucket
   privado pilo-docs, en <espacio>/<id>/<nombre>.

   Función pilo-ia: «comprender» y «moodle» (anexo B del contrato). Sus errores
   llegan con `code`; aquí se convierten en un StepError legible.

   Cada lectura dice si falta su migración en vez de fallar: el panel lo
   cuenta y se apaga sin romper a los demás.
   ========================================================================== */

import { useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../../lib/supabase";
import type { PiloSpace } from "../../pilo/space";
import { indexStep, pendingOf } from "../../pilo/memory";
import type { EmbedStatus } from "../../pilo/memory";
import { spaceKeys } from "../store";
import type { SpaceSource } from "../store";
import { StepError, currentReading, faultFrom, missingMigration, readingReducer } from "./flow";
import type { ComprehendResult, DbError, DocStatus, ReadingJob, ReadingState } from "./flow";
import type { RawEdge, RawNode } from "./map";

export const BUCKET = "pilo-docs";

/* --- Tipos ------------------------------------------------------------------------------ */

export interface DocRow {
  id: string;
  space: string;
  origin: "archivo" | "moodle";
  kind: "docx" | "xlsx" | "csv" | "pdf" | "curso";
  source: SpaceSource;
  title: string;
  file_path: string;
  file_name: string;
  file_size: number;
  file_hash: string;
  external_id: string;
  vis: "publico" | "sesion";
  active: boolean;
  status: DocStatus;
  status_detail: string;
  pages: number;
  passages: number;
  understood_at: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseRow {
  space: string;
  course_id: number;
  category_id: number | null;
  category_name: string;
  shortname: string;
  fullname: string;
  selected: boolean;
  vis: "publico" | "sesion";
  doc_id: string | null;
  synced_at: string | null;
  status: string;
  error: string;
}

export interface MoodleSite {
  name?: string;
  release?: string;
  functions?: Record<string, boolean>;
}

export interface MoodleSetup {
  on: boolean;
  url: string;
  site: MoodleSite;
  checkedAt: string | null;
  token: { has: boolean; last4: string };
  courses: CourseRow[];
}

export interface MapStatus {
  total: number;
  mapped: number;
  pending: number;
  topics: number;
  refs: number;
}

/** Una lectura que puede decir «falta la migración tal». */
export type Loaded<T> = { missing: string | null; data: T };

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Convierte un error de la base en StepError (con la migración que falta, si es eso). */
function dbFail(error: DbError): never {
  const missing = missingMigration(error);
  if (missing) throw new StepError({ ...faultFrom(500, { code: "migracion", error: `Falta la migración ${missing}.` }), title: `Falta la migración ${missing}` });
  throw new StepError(faultFrom(error.code === "42501" ? 403 : 500, { error: error.message }));
}

/* --- Llaves ------------------------------------------------------------------------------ */

export const memoKeys = {
  docs: (space: PiloSpace) => ["pilo-ia", "memoria", "documentos", space] as const,
  moodle: (space: PiloSpace) => ["pilo-ia", "memoria", "moodle", space] as const,
  map: (space: PiloSpace) => ["pilo-ia", "memoria", "mapa", space] as const,
  mapStatus: (space: PiloSpace) => ["pilo-ia", "memoria", "mapa-estado", space] as const,
};

/** Tras cualquier cambio en la memoria: documentos, conteos, índice y mapa se vuelven a leer. */
export function useRefreshMemory(space: PiloSpace) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: memoKeys.docs(space) });
    void client.invalidateQueries({ queryKey: memoKeys.moodle(space) });
    void client.invalidateQueries({ queryKey: memoKeys.map(space) });
    void client.invalidateQueries({ queryKey: memoKeys.mapStatus(space) });
    void client.invalidateQueries({ queryKey: spaceKeys.counts(space) });
    void client.invalidateQueries({ queryKey: spaceKeys.row(space) });
    void client.invalidateQueries({ queryKey: ["pilo-ia", "memoria", "significado"] });
  };
}

/* --- Documentos ------------------------------------------------------------------------ */

export async function fetchDocs(space: PiloSpace): Promise<Loaded<DocRow[]>> {
  const { data, error } = await supabase.from("pilo_docs").select("*").eq("space", space).order("created_at", { ascending: false }).limit(500);
  if (error) {
    const missing = missingMigration(error) ?? (/pilo_docs/i.test(error.message ?? "") ? "0114" : null);
    if (missing) return { missing, data: [] };
    dbFail(error);
  }
  return { missing: null, data: (data ?? []) as unknown as DocRow[] };
}

export function useDocs(space: PiloSpace, enabled = true) {
  return useQuery({ queryKey: memoKeys.docs(space), enabled, queryFn: () => fetchDocs(space) });
}

/** La huella del archivo (SHA-256, en hexadecimal): con ella la base reconoce un archivo repetido. */
export async function hashFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function uploadOriginal(path: string, file: Blob, contentType: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType });
  if (error) {
    if (/bucket not found/i.test(error.message)) dbFail({ code: "PGRST205", message: "pilo-docs bucket not found" });
    throw new StepError(faultFrom(500, { error: error.message }));
  }
}

/** Quita un original del bucket. No lanza: devuelve si quedó borrado. */
export async function removeOriginal(path: string): Promise<boolean> {
  if (!path) return true;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return !error;
}

export async function downloadOriginal(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new StepError(faultFrom(500, { error: error?.message ?? "El original no está en el almacenamiento." }));
  return data;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) dbFail({ code: error.code, message: `${error.message} ${name}` });
  return data as T;
}

export const docSave = (space: PiloSpace, doc: Record<string, unknown>) => rpc<string>("pilo_doc_save", { p_space: space, p_doc: doc });

export const docReplace = (doc: string, rows: { seq: number; title: string; section: string; body: string; path: string; cut: string }[]) =>
  rpc<{ added: number; changed: number; removed: number; total: number; skipped: number }>("pilo_doc_replace", { p_doc: doc, p_rows: rows });

export const docUpdate = (doc: string, patch: Record<string, unknown>) => rpc<unknown>("pilo_doc_update", { p_doc: doc, p_patch: patch });

export const docDelete = (doc: string) =>
  rpc<{ file_path: string; passages: number; answers: number; nodes: number; edges: number; topics: number }>("pilo_doc_delete", { p_doc: doc });

export const docOutlineSave = (doc: string, nodes: unknown[], edges: unknown[]) =>
  rpc<{ nodes: number; edges: number; removed: number; rejected: number }>("pilo_doc_outline", { p_doc: doc, p_nodes: nodes, p_edges: edges });

/** Los pasajes de un documento, para rehacer su estructura o listarlos. */
export async function fetchDocPassages(space: PiloSpace, doc: string): Promise<{ ref: string; seq: number; section: string; body: string }[]> {
  const { data, error } = await supabase.from("pilo_memory").select("ref, section, body").eq("space", space).eq("doc_id", doc).limit(450);
  if (error) dbFail(error);
  return ((data ?? []) as { ref: string; section: string; body: string }[])
    .map((r) => ({ ...r, seq: Number(r.ref.slice(r.ref.lastIndexOf(":") + 1)) || 0 }))
    .sort((a, b) => a.seq - b.seq);
}

export function useDocPassages(space: PiloSpace, doc: string | null) {
  return useQuery({ queryKey: ["pilo-ia", "memoria", "pasajes-de", space, doc], enabled: Boolean(doc), staleTime: 60_000, queryFn: () => fetchDocPassages(space, doc!) });
}

/**
 * Indexa por significado lo pendiente del espacio, lote por lote. Igual que
 * «Indexar por significado»: un lote que no guarda nada detiene la repetición.
 */
export async function indexPending(space: PiloSpace, onProgress?: (pending: number) => void): Promise<number> {
  let left = 0;
  for (let round = 0; round < 200; round++) {
    const r = await indexStep<{ saved?: number; status?: EmbedStatus }>({ step: "lote" }, space);
    const s = (r.status ?? null) as EmbedStatus | null;
    left = pendingOf(s);
    onProgress?.(left);
    if (!left || !r.saved) break;
  }
  return left;
}

/* --- La función pilo-ia ---------------------------------------------------------------- */

/** Un paso de «comprender» o de «moodle». El espacio va siempre en el cuerpo. */
export async function piloStep<T>(action: "comprender" | "moodle", space: PiloSpace, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("pilo-ia", { body: { action, space, ...body } });
  if (!error) return data as T;
  const response = (error as { context?: Response }).context;
  let parsed: { error?: unknown; advice?: unknown; code?: unknown } | null = null;
  let status = 0;
  if (response && typeof response.json === "function") {
    status = response.status;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
  }
  throw new StepError(faultFrom(status, parsed));
}

export const comprehend = (space: PiloSpace, step: "estado" | "lote") => piloStep<ComprehendResult>("comprender", space, { step });

export interface MoodleProbe {
  site?: { name?: string; release?: string; url?: string };
  functions?: Record<string, boolean>;
  usable?: string[];
  missing?: string[];
  ms?: number;
}

export interface MoodleCategory {
  id: number;
  name: string;
  parent: number;
  depth: number;
  courses: number;
}

export interface MoodleCourseRead {
  course?: { id: number; fullname: string; shortname: string };
  selected?: boolean;
  doc?: string;
  unchanged?: boolean;
  empty?: boolean;
  note?: string;
  passages?: number;
  added?: number;
  changed?: number;
  removed?: number;
  mapped?: boolean;
  activities?: number;
  dropped?: number;
  redacted?: number;
  skipped?: string[];
}

export const moodleProbe = (space: PiloSpace) => piloStep<MoodleProbe>("moodle", space, { step: "probar" });
export const moodleCategories = (space: PiloSpace) => piloStep<{ categories?: MoodleCategory[] }>("moodle", space, { step: "categorias" });
export const moodleCourses = (space: PiloSpace, category: number) => piloStep<{ saved?: number; courses?: unknown[] }>("moodle", space, { step: "cursos", category });
export const moodleCourse = (space: PiloSpace, course: number) => piloStep<MoodleCourseRead>("moodle", space, { step: "curso", course });

/* --- Moodle: la conexión y los cursos -------------------------------------------------- */

export async function fetchMoodle(space: PiloSpace): Promise<Loaded<MoodleSetup>> {
  const empty: MoodleSetup = { on: false, url: "", site: {}, checkedAt: null, token: { has: false, last4: "" }, courses: [] };
  const row = await supabase.from("pilo_spaces").select("moodle_on, moodle_url, moodle_site, moodle_checked_at").eq("id", space).maybeSingle();
  if (row.error) {
    const missing = missingMigration(row.error) ?? (/moodle_/i.test(row.error.message ?? "") ? "0116" : null);
    if (missing) return { missing, data: empty };
    dbFail(row.error);
  }
  const courses = await supabase.from("pilo_moodle_courses").select("*").eq("space", space).order("category_name").order("fullname").limit(2000);
  if (courses.error) {
    const missing = missingMigration(courses.error) ?? "0116";
    return { missing, data: empty };
  }
  const secret = await supabase.rpc("pilo_space_secret_status" as never, { p_space: space } as never);
  if (secret.error && missingMigration({ code: secret.error.code, message: `${secret.error.message} pilo_space_secret_status` })) return { missing: "0116", data: empty };
  const r = (row.data ?? {}) as Record<string, unknown>;
  const token = ((secret.data ?? {}) as { moodle?: { has?: boolean; last4?: string } }).moodle ?? {};
  return {
    missing: null,
    data: {
      on: r.moodle_on === true,
      url: typeof r.moodle_url === "string" ? r.moodle_url : "",
      site: r.moodle_site && typeof r.moodle_site === "object" ? (r.moodle_site as MoodleSite) : {},
      checkedAt: typeof r.moodle_checked_at === "string" ? r.moodle_checked_at : null,
      token: { has: token.has === true, last4: typeof token.last4 === "string" ? token.last4 : "" },
      courses: ((courses.data ?? []) as unknown as CourseRow[]).map((c) => ({ ...c, course_id: num(c.course_id) })),
    },
  };
}

export function useMoodle(space: PiloSpace, enabled = true) {
  return useQuery({ queryKey: memoKeys.moodle(space), enabled, queryFn: () => fetchMoodle(space) });
}

/** La dirección y el interruptor viven en la ficha del espacio; se guardan al momento. */
export async function saveMoodleSpace(space: PiloSpace, patch: { moodle_on?: boolean; moodle_url?: string }): Promise<void> {
  const { error } = await supabase.from("pilo_spaces").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", space);
  if (error) dbFail(error);
}

/** Guarda el token (o lo quita, con vacío). Devuelve solo sus cuatro últimos caracteres. */
export const saveMoodleToken = (space: PiloSpace, value: string) => rpc<string>("pilo_space_set_secret", { p_space: space, p_which: "moodle", p_value: value });

export const courseSet = (space: PiloSpace, course: number, patch: { selected?: boolean; vis?: "publico" | "sesion" }) =>
  rpc<unknown>("pilo_moodle_course_set", { p_space: space, p_course: course, p_patch: patch });

/* --- El mapa ----------------------------------------------------------------------------- */

export async function fetchMap(space: PiloSpace): Promise<Loaded<{ nodes: RawNode[]; edges: RawEdge[]; status: MapStatus | null }>> {
  const none = { nodes: [], edges: [], status: null };
  const status = await supabase.rpc("pilo_map_status" as never, { p_space: space } as never);
  if (status.error) {
    const missing = missingMigration({ code: status.error.code, message: `${status.error.message} pilo_map_status` });
    if (missing) return { missing, data: none };
    dbFail(status.error);
  }
  const mesh = await supabase.rpc("pilo_graph_overview" as never, { p_sources: ["mapa"], p_space: space } as never);
  if (mesh.error) dbFail({ code: mesh.error.code, message: `${mesh.error.message} pilo_graph_overview p_space` });
  const m = (mesh.data ?? {}) as { nodes?: RawNode[]; edges?: RawEdge[] };
  const s = (status.data ?? {}) as Record<string, unknown>;
  return {
    missing: null,
    data: {
      nodes: Array.isArray(m.nodes) ? m.nodes : [],
      edges: Array.isArray(m.edges) ? m.edges : [],
      status: { total: num(s.total), mapped: num(s.mapped), pending: num(s.pending), topics: num(s.topics), refs: num(s.refs) },
    },
  };
}

export function useTeachMap(space: PiloSpace, enabled = true) {
  return useQuery({ queryKey: memoKeys.map(space), enabled, queryFn: () => fetchMap(space) });
}

/** Si este Pilo tiene IA para comprender (y el estado del mapa según la función). Un error se queda en `error`. */
export function useComprehendStatus(space: PiloSpace, enabled = true) {
  return useQuery({ queryKey: memoKeys.mapStatus(space), enabled, retry: false, queryFn: () => comprehend(space, "estado") });
}

/** Los pasajes que llegan por el mapa a partir de los que encontró la búsqueda (hasta 3, como al preguntar). */
export async function mapNeighbors(space: PiloSpace, refs: string[]): Promise<{ ref: string; source: string; title: string; section: string; shared: number }[]> {
  if (!refs.length) return [];
  const { data, error } = await supabase.rpc("pilo_graph_neighbors" as never, { p_refs: refs.slice(0, 3), p_space: space, p_sources: null, p_public_only: false, p_limit: 3 } as never);
  if (error) return [];
  return (data ?? []) as { ref: string; source: string; title: string; section: string; shared: number }[];
}

/* --- La franja «Pilo leyendo» y el camino de la prueba --------------------------------- */

interface Shared {
  reading: ReadingState;
  /** El camino de la última prueba de la memoria: lo que halló la búsqueda y lo que llegó por el mapa. */
  probe: { direct: string[]; viaMap: string[]; at: number } | null;
}

let shared: Shared = { reading: { jobs: [] }, probe: null };
const listeners = new Set<() => void>();
const emit = (next: Shared) => {
  shared = next;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Un panel dice qué está leyendo Pilo; al terminar, lo quita. */
export const reading = {
  set: (job: ReadingJob) => emit({ ...shared, reading: readingReducer(shared.reading, { type: "set", job }) }),
  end: (owner: string) => emit({ ...shared, reading: readingReducer(shared.reading, { type: "end", owner }) }),
  probe: (probe: Shared["probe"]) => emit({ ...shared, probe }),
};

export const useReading = (): ReadingJob | null => useSyncExternalStore(subscribe, () => currentReading(shared.reading));
export const useProbePath = () => useSyncExternalStore(subscribe, () => shared.probe);
