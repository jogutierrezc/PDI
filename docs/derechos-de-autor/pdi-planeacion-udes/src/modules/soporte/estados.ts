/* =============================================================================
   Portal de agentes · el ciclo de una conversación (0181/0182).

   La base es la dueña de las reglas (support_transition_ok); esto es la misma
   tabla para que la pantalla sepa qué botones ofrecer. Una prueba compara las
   dos para que no se separen.
   ========================================================================== */

export type ConversationStatus = "pending" | "queued" | "offered" | "open" | "snoozed" | "resolved";

export const TRANSITIONS: Record<ConversationStatus, readonly ConversationStatus[]> = {
  pending: ["queued", "resolved"],
  queued: ["offered", "resolved"],
  offered: ["open", "queued", "resolved"],
  open: ["resolved", "snoozed", "queued"],
  snoozed: ["open", "resolved"],
  resolved: ["open"],
};

export const STATUSES = Object.keys(TRANSITIONS) as ConversationStatus[];

export const canMove = (from: ConversationStatus, to: ConversationStatus): boolean => TRANSITIONS[from].includes(to);

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  pending: "Con Pilo",
  queued: "En cola",
  offered: "Ofrecida",
  open: "En chat",
  snoozed: "Pospuesta",
  resolved: "Cerrada",
};

/** Etiqueta de color del diseño (azul, amarillo, turquesa, verde, gris). */
export const STATUS_TONE: Record<ConversationStatus, "b" | "y" | "t" | "g" | "n"> = {
  pending: "b",
  queued: "y",
  offered: "t",
  open: "g",
  snoozed: "n",
  resolved: "n",
};

export const isStatus = (v: unknown): v is ConversationStatus => typeof v === "string" && v in TRANSITIONS;

/** Segundos que le quedan a una oferta (0 si venció o no hay oferta). */
export function offerSecondsLeft(expiresAt: string | null | undefined, now: number = Date.now()): number {
  if (!expiresAt) return 0;
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.ceil((t - now) / 1000));
}

/** ¿Lleva esperando más de lo que la regla de «espera larga» tolera? */
export function isLongWait(since: string | null | undefined, minutes: number, now: number = Date.now()): boolean {
  if (!since) return false;
  const t = Date.parse(since);
  return !Number.isNaN(t) && now - t > minutes * 60_000;
}

/** «hace 3 min», «hace 2 h», «ayer». */
export function ago(iso: string | null | undefined, now: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "ahora";
  if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

/** Iniciales para la foto que aún no existe. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}
