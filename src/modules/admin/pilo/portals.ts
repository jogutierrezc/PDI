/* =============================================================================
   Mr. Pilo · los portales como vistas de una sola memoria (0121).

   Hay un solo cerebro y cada portal es una vista: `pilo_portals` guarda, por
   portal, su ámbito de casa, para quién fue escrito lo suyo y la MATRIZ —por
   cada fuente, «casa», «visita» o «no»—; `pilo_sources` es el catálogo de
   fuentes. La administración los lee aquí y cambia una celda con
   `pilo_portal_update`, que revisa cada valor y devuelve su efecto.

   Lo puro va arriba (qué opciones tiene una celda, qué dice su estado y cómo se
   cuenta el efecto de un cambio); lo que habla con la base, abajo.

   Hoy cada portal lee solo lo de su casa. «De visita» existe en la matriz y en
   el filtro de la base, pero todavía no se busca ni se puede marcar: llega con
   la lectura entre ámbitos.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { PiloSpace } from "./space";

export type Cell = "casa" | "visita" | "no";
export type SourceKind = "portal" | "documentos" | "moodle";

export interface PiloSource {
  id: string;
  /** Su ámbito de casa: la procedencia de sus pasajes. */
  scope: string;
  name: string;
  kind: SourceKind;
  /** Pide sesión de la intranet en cualquier portal (Impacto). */
  staff_only: boolean;
  /** No sale de su portal (los cursos de Moodle). */
  stays_home: boolean;
  sort: number;
}

export interface PiloPortal {
  id: string;
  scope: string;
  name: string;
  /** Para quién fue escrito lo de su ámbito: «preparado para…». */
  written_for: string;
  matrix: Record<string, Cell>;
  sort: number;
}

export interface PortalsData {
  portals: PiloPortal[];
  sources: PiloSource[];
}

/** El efecto de una celda que cambió, como lo devuelve `pilo_portal_update`. */
export interface CellEffect {
  source: string;
  name: string;
  from: Cell;
  to: Cell;
  passages: number;
  answers: number;
}

/* --- Lo puro ------------------------------------------------------------------------------ */

const isCell = (v: unknown): v is Cell => v === "casa" || v === "visita" || v === "no";
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const whole = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);

/** Las filas de la base, leídas con cuidado: lo que no se reconoce no entra. */
export function parsePortals(portalRows: unknown, sourceRows: unknown): PortalsData {
  const sources: PiloSource[] = (Array.isArray(sourceRows) ? sourceRows : [])
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .filter((r) => typeof r.id === "string" && /^[a-z]{3,30}$/.test(r.id) && typeof r.scope === "string")
    .map((r) => ({
      id: r.id as string,
      scope: r.scope as string,
      name: text(r.name, 80) || (r.id as string),
      kind: (r.kind === "documentos" || r.kind === "moodle" ? r.kind : "portal") as SourceKind,
      staff_only: r.staff_only === true,
      stays_home: r.stays_home === true,
      sort: whole(r.sort),
    }))
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  const portals: PiloPortal[] = (Array.isArray(portalRows) ? portalRows : [])
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .filter((r) => typeof r.id === "string" && typeof r.scope === "string")
    .map((r) => {
      const raw = r.matrix && typeof r.matrix === "object" && !Array.isArray(r.matrix) ? (r.matrix as Record<string, unknown>) : {};
      return {
        id: r.id as string,
        scope: r.scope as string,
        name: text(r.name, 120) || (r.id as string),
        written_for: text(r.written_for, 200),
        matrix: Object.fromEntries(Object.entries(raw).filter(([, v]) => isCell(v))) as Record<string, Cell>,
        sort: whole(r.sort),
      };
    })
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  return { portals, sources };
}

/** Lo que dice la matriz de una celda. Lo que no está escrito es «no». */
export const cellOf = (portal: PiloPortal, source: PiloSource): Cell => portal.matrix[source.id] ?? "no";

/** ¿La fuente es de la casa de ese portal? */
export const atHome = (portal: PiloPortal, source: PiloSource) => source.scope === portal.scope;

/**
 * Lo que ese portal lee DE VERDAD de esa fuente: la celda, pasada por las reglas
 * que la base aplica siempre. «casa» solo vale en lo propio; «visita» todavía
 * no se busca. Así la pantalla no promete lo que el filtro no hace.
 */
export function effectiveCell(portal: PiloPortal, source: PiloSource): "casa" | "no" {
  return cellOf(portal, source) === "casa" && atHome(portal, source) ? "casa" : "no";
}

export interface CellChoice {
  value: Cell;
  label: string;
  enabled: boolean;
  /** Por qué no se puede elegir (o qué hace). */
  note: string;
}

export const CELL_LABEL: Record<Cell, string> = { casa: "De casa", visita: "De visita", no: "No" };

/**
 * Las opciones de una celda. En lo propio: «De casa» o «No». En lo ajeno: «No»
 * y «De visita», que se ve pero aún no se puede marcar (y nunca en lo que no
 * sale de su portal).
 */
export function cellChoices(portal: PiloPortal, source: PiloSource): CellChoice[] {
  if (atHome(portal, source)) {
    return [
      { value: "casa", label: CELL_LABEL.casa, enabled: true, note: source.staff_only ? "Se busca siempre, solo para el personal con sesión de la intranet." : "Se busca siempre y se cita sin aclaración." },
      { value: "no", label: CELL_LABEL.no, enabled: true, note: "Este portal no la lee." },
    ];
  }
  return [
    {
      value: "visita",
      label: CELL_LABEL.visita,
      enabled: false,
      note: source.stays_home ? `${source.name} no sale de su portal.` : "Llega en la siguiente entrega: leer lo de otro ámbito, diciendo de dónde viene.",
    },
    { value: "no", label: CELL_LABEL.no, enabled: true, note: "Este portal no la lee: es de otro ámbito." },
  ];
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? one : many}`;

/** Lo que se pregunta antes de cambiar una celda: nombra la consecuencia. */
export function confirmText(portal: PiloPortal, source: PiloSource, to: Cell): string {
  if (to === "casa") {
    return `¿«${portal.name}» vuelve a leer ${source.name}? Sus pasajes entran de nuevo en las respuestas${source.staff_only ? ", solo para el personal con sesión de la intranet" : ""}.`;
  }
  return `¿«${portal.name}» deja de leer ${source.name}? Sus pasajes siguen guardados, pero no entran en ninguna respuesta de este portal, y las respuestas guardadas que los citan dejan de servirse.`;
}

/** Lo que pasó al cambiar una celda, con los números que devolvió la base. */
export function effectText(portal: PiloPortal, effect: CellEffect): string {
  const passages = count(effect.passages, "pasaje", "pasajes");
  if (effect.to === "casa") {
    return effect.passages
      ? `«${portal.name}» ya lee ${effect.name}: ${passages} ${effect.passages === 1 ? "entra" : "entran"} en sus respuestas desde ahora.`
      : `«${portal.name}» ya lee ${effect.name}, que todavía no tiene pasajes: entrarán en cuanto se carguen.`;
  }
  const answers = effect.answers ? ` ${count(effect.answers, "respuesta guardada que la citaba deja", "respuestas guardadas que la citaban dejan")} de servirse.` : "";
  return `«${portal.name}» ya no lee ${effect.name}: ${effect.passages ? `${passages} ${effect.passages === 1 ? "queda guardado" : "quedan guardados"}, pero no ${effect.passages === 1 ? "entra" : "entran"} en sus respuestas.` : "no tenía pasajes."}${answers}`;
}

/** Los interruptores de siempre (`memory_sources`) que corresponden a la matriz de un portal: sus celdas de casa. */
export function homeFlags(portal: PiloPortal, sources: PiloSource[]): Record<string, boolean> {
  return Object.fromEntries(sources.filter((s) => atHome(portal, s)).map((s) => [s.id, effectiveCell(portal, s) === "casa"]));
}

/** Las colecciones a las que puede ir un documento en un ámbito, con un código de dos letras para su etiqueta. */
export function docCollections(sources: PiloSource[], scope: string): { id: string; code: string; name: string }[] {
  return sources
    .filter((s) => s.scope === scope && s.kind === "documentos")
    .map((s) => ({ id: s.id, code: DOC_CODE[s.id] ?? s.id.slice(0, 2).toUpperCase(), name: s.name }));
}

const DOC_CODE: Record<string, string> = { institucional: "DI", normativa: "NO", lineamientos: "LG", innovacion: "IE", politicas: "PO", global: "GL" };

/** Las colecciones de documentos del Pilo general si la base aún no las da (sin 0121 no se usan: el panel queda apagado). */
export const GENERAL_COLLECTIONS: { id: string; code: string; name: string }[] = [
  { id: "institucional", code: "DI", name: "Documentos institucionales" },
  { id: "normativa", code: "NO", name: "Normativa" },
  { id: "lineamientos", code: "LG", name: "Lineamientos y guías" },
];

/* --- Lo que habla con la base ------------------------------------------------------------- */

export const portalKeys = { all: ["pilo-ia", "portales"] as const };

interface DbError {
  code?: string;
  message?: string;
}

/** ¿El error dice que la tabla o la función no existen? (base sin 0121) */
export const missing0121 = (error: DbError | null | undefined): boolean =>
  Boolean(error) &&
  (["PGRST205", "PGRST202", "42P01", "42883"].includes(error!.code ?? "") || /could not find the (table|function)|does not exist|schema cache/i.test(error!.message ?? ""));

/** La matriz y el catálogo de fuentes. Sin la migración 0121: null. */
export async function fetchPortals(): Promise<PortalsData | null> {
  const [portals, sources] = await Promise.all([
    supabase.from("pilo_portals" as never).select("id, scope, name, written_for, matrix, sort"),
    supabase.from("pilo_sources" as never).select("id, scope, name, kind, staff_only, stays_home, sort"),
  ]);
  const error = portals.error ?? sources.error;
  if (error) {
    if (missing0121(error)) return null;
    throw new Error(error.message);
  }
  return parsePortals(portals.data, sources.data);
}

export function usePortals(enabled = true) {
  return useQuery({ queryKey: portalKeys.all, enabled, retry: false, queryFn: fetchPortals });
}

export interface CellChange {
  portal: PiloPortal;
  source: PiloSource;
  to: Cell;
}

/** Cambia una celda. Se aplica al momento; devuelve el efecto que contó la base. */
export function useSetCell() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ portal, source, to }: CellChange): Promise<{ matrix: Record<string, Cell>; effects: CellEffect[] }> => {
      const { data, error } = await supabase.rpc("pilo_portal_update" as never, { p_portal: portal.id, p_patch: { matrix: { [source.id]: to } } } as never);
      if (error) throw new Error(missing0121(error) ? "Falta aplicar la migración 0121 en la base." : error.message);
      const r = (data ?? {}) as { matrix?: unknown; effects?: unknown };
      const matrix = r.matrix && typeof r.matrix === "object" ? (Object.fromEntries(Object.entries(r.matrix as Record<string, unknown>).filter(([, v]) => isCell(v))) as Record<string, Cell>) : {};
      const effects = (Array.isArray(r.effects) ? r.effects : [])
        .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
        .filter((e) => isCell(e.from) && isCell(e.to) && typeof e.source === "string")
        .map((e) => ({ source: e.source as string, name: text(e.name, 80) || (e.source as string), from: e.from as Cell, to: e.to as Cell, passages: whole(e.passages), answers: whole(e.answers) }));
      return { matrix, effects };
    },
    onSettled: (_data, _error, change) => {
      void client.invalidateQueries({ queryKey: portalKeys.all });
      // La ficha del otro Pilo refleja la matriz en sus interruptores: se vuelve a leer.
      // (La de «Mr. Pilo con IA» no se invalida: su editor se pone al día sin perder lo que está a medio escribir.)
      if (change.portal.id !== "planeacion") void client.invalidateQueries({ queryKey: ["pilo-ia", "espacio", change.portal.id as PiloSpace, "ficha"] });
    },
  });
}
