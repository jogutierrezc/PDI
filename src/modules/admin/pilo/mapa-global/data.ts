/* =============================================================================
   Mr. Pilo · el mapa global: lo que se lee.

   Solo lectura y solo administración: las mismas funciones de siempre, una vez
   por espacio. Nada se escribe y ningún Pilo ve lo del otro al buscar.

     pilo_graph_overview(null)                       la malla de Pregúntele a Pilo (0097)
     pilo_graph_overview(['mapa'], 'ensenanza')      el mapa de Pilo en Enseñanza (0113, 0115)
     pilo_docs (id, origin)                          qué documentos son cursos de Moodle (0114)
     pilo_map_status('ensenanza')                    cuánto se ha comprendido (0115)

   Cada lado dice por su cuenta si le falta una migración: el otro se dibuja igual.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import type { MeshEdge } from "../../../../components/pilo/ai/logic";
import { supabase } from "../../../../lib/supabase";
import type { ViewNode } from "../mesh-view";
import type { RawEdge, RawNode } from "../../pilo-ensenanza/memoria/map";

export interface SideState<T> {
  /** Lo leído; null si no se pudo. */
  data: T | null;
  /** La migración que falta, si es eso. */
  missing: string | null;
  /** Otro error, en palabras. */
  error: string | null;
}

export interface GlobalStatus {
  total: number;
  mapped: number;
  pending: number;
  topics: number;
  refs: number;
}

export interface GlobalData {
  planeacion: SideState<{ nodes: ViewNode[]; edges: MeshEdge[] }>;
  ensenanza: SideState<{ nodes: RawNode[]; edges: RawEdge[]; courses: string[]; status: GlobalStatus | null }>;
}

interface DbError {
  code?: string;
  message?: string;
}

const GONE = ["PGRST202", "PGRST205", "PGRST204", "42P01", "42883", "42703"];

/** ¿El error dice «eso no existe»? Entonces falta una migración. */
export const isMissing = (error: DbError | null | undefined) =>
  Boolean(error) && (GONE.includes(error!.code ?? "") || /could not find the (table|function)|does not exist/i.test(error!.message ?? ""));

const fail = <T,>(error: DbError, migration: string): SideState<T> =>
  isMissing(error) ? { data: null, missing: migration, error: null } : { data: null, missing: null, error: error.code === "42501" ? "Solo la administración ve el mapa." : error.message || "No se pudo leer." };

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function readPlaneacion(): Promise<GlobalData["planeacion"]> {
  const { data, error } = await supabase.rpc("pilo_graph_overview" as never, { p_sources: null } as never);
  if (error) return fail(error, "0097");
  const m = (data ?? {}) as { nodes?: unknown; edges?: unknown };
  return { data: { nodes: list<ViewNode>(m.nodes), edges: list<MeshEdge>(m.edges) }, missing: null, error: null };
}

async function readEnsenanza(): Promise<GlobalData["ensenanza"]> {
  const mesh = await supabase.rpc("pilo_graph_overview" as never, { p_sources: ["mapa"], p_space: "ensenanza" } as never);
  if (mesh.error) return fail(mesh.error, "0113");
  const m = (mesh.data ?? {}) as { nodes?: unknown; edges?: unknown };
  // Los cursos y el estado son un adorno del mapa: si no se pueden leer, el mapa se dibuja igual.
  const docs = await supabase.from("pilo_docs").select("id, origin").eq("space", "ensenanza").eq("origin", "moodle").limit(2000);
  const status = await supabase.rpc("pilo_map_status" as never, { p_space: "ensenanza" } as never);
  const s = (status.data ?? null) as Record<string, unknown> | null;
  return {
    data: {
      nodes: list<RawNode>(m.nodes),
      edges: list<RawEdge>(m.edges),
      courses: list<{ id: string }>(docs.data).map((d) => `doc:${String(d.id).toLowerCase()}`),
      status: status.error || !s ? null : { total: num(s.total), mapped: num(s.mapped), pending: num(s.pending), topics: num(s.topics), refs: num(s.refs) },
    },
    missing: status.error && isMissing(status.error) ? "0115" : null,
    error: null,
  };
}

export const GLOBAL_MAP_KEY = ["pilo-ia", "memoria", "mapa-global"] as const;

/** Las dos mallas, leídas a la vez. */
export function useGlobalMap(enabled = true) {
  return useQuery({
    queryKey: GLOBAL_MAP_KEY,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<GlobalData> => {
      const [planeacion, ensenanza] = await Promise.all([readPlaneacion(), readEnsenanza()]);
      return { planeacion, ensenanza };
    },
  });
}

/** Los pasajes de un documento de Enseñanza, en orden. Solo lectura, dentro de su espacio. */
export function useDocRefs(doc: string | null) {
  return useQuery({
    queryKey: ["pilo-ia", "memoria", "mapa-global", "pasajes-de", doc],
    enabled: Boolean(doc),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("pilo_memory").select("ref, section").eq("space", "ensenanza").eq("doc_id", doc!).limit(450);
      if (error) throw error;
      const seq = (ref: string) => Number(ref.slice(ref.lastIndexOf(":") + 1)) || 0;
      return ((data ?? []) as { ref: string; section: string }[]).map((r) => ({ ref: r.ref, section: r.section, seq: seq(r.ref) })).sort((a, b) => a.seq - b.seq);
    },
  });
}
