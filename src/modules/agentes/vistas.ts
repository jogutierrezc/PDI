/* =============================================================================
   Portal de agentes · las vistas de la bandeja y lo que se ve de cada fila.
   ========================================================================== */

import type { ConversationStatus } from "../soporte/estados";

export type Vista = "mias" | "sin" | "todas" | "resueltas";

export const VISTAS: { key: Vista; label: string }[] = [
  { key: "mias", label: "Mías" },
  { key: "sin", label: "Sin asignar" },
  { key: "todas", label: "Todas" },
  { key: "resueltas", label: "Resueltas" },
];

export const TITULO: Record<Vista, string> = {
  mias: "Mis conversaciones",
  sin: "Sin asignar",
  todas: "Todas las conversaciones",
  resueltas: "Resueltas",
};

interface Fila {
  status: ConversationStatus;
  assignee_id: string | null;
  offered_to: string | null;
}

export const isVista = (v: unknown): v is Vista => VISTAS.some((x) => x.key === v);

/** ¿Esta conversación va en esta vista, para este agente? */
export function enVista(c: Fila, vista: Vista, yo: string): boolean {
  switch (vista) {
    case "mias":
      return (c.assignee_id === yo && (c.status === "open" || c.status === "snoozed")) || (c.status === "offered" && c.offered_to === yo);
    case "sin":
      return (c.status === "queued" || c.status === "offered") && !c.assignee_id;
    case "todas":
      return c.status !== "resolved" && c.status !== "pending";
    case "resueltas":
      return c.status === "resolved";
  }
}

/** Qué le pasa a esta conversación respecto a quien la mira: para la etiqueta de la fila. */
export function relacion(c: Fila, yo: string): "oferta" | "mia" | "otro" | "sin" | "resuelta" {
  if (c.status === "resolved") return "resuelta";
  if (c.status === "offered" && c.offered_to === yo) return "oferta";
  if (c.assignee_id === yo) return "mia";
  if (c.assignee_id) return "otro";
  return "sin";
}

/** «3:05» para una espera en segundos. */
export function reloj(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Los pares de «extensión → color de la ficha» del adjunto. */
export function fichaDe(mime: string): { lab: string; bg: string; fg: string; kind: string } {
  if (mime.startsWith("image/")) return { lab: "IMG", bg: "#eaf1fd", fg: "#1b52ad", kind: "Imagen" };
  if (mime === "application/pdf") return { lab: "PDF", bg: "#fde8e6", fg: "#8f1d14", kind: "Documento PDF" };
  if (mime.includes("word")) return { lab: "DOC", bg: "#e6eefc", fg: "#1b52ad", kind: "Documento de Word" };
  return { lab: "XLS", bg: "#e3f4e8", fg: "#0d6b2f", kind: "Hoja de Excel" };
}

/** «184 KB», «1,2 MB». */
export function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
