/* =============================================================================
   Dominio del PDI: lo que no son datos.

   Este archivo contenía los seis pilares y sus cifras escritos a mano. Ahora
   los datos viven en Supabase y aquí solo queda lo que traduce la base de
   datos a la interfaz: colores, glifos, formatos y etiquetas.
   ========================================================================== */

import type { ActivityStatus, PdiSummary, PillarProgress, PublicationStatus } from "../types/database";

/* --- Estados -------------------------------------------------------------- */

export interface StatusMeta {
  id: ActivityStatus;
  label: string;
  /** Codificación secundaria: el estado nunca se comunica solo con color. */
  glyph: string;
  color: string;
}

export const statusMeta: Record<ActivityStatus, StatusMeta> = {
  cumplida: { id: "cumplida", label: "Cumplida", glyph: "✓", color: "var(--status-done)" },
  curso: { id: "curso", label: "En curso", glyph: "◐", color: "var(--status-active)" },
  pendiente: { id: "pendiente", label: "Pendiente", glyph: "○", color: "var(--status-pending)" },
  riesgo: { id: "riesgo", label: "En riesgo", glyph: "▲", color: "var(--status-risk)" },
};

/** Orden fijo de los segmentos del avance: cumplido → en curso → pendiente → riesgo. */
export const statusOrder: ActivityStatus[] = ["cumplida", "curso", "pendiente", "riesgo"];

export const publicationLabels: Record<PublicationStatus, string> = {
  borrador: "Borrador",
  revision: "En revisión",
  publicado: "Publicado",
  archivado: "Archivado",
};

/* --- Color ---------------------------------------------------------------- */

/**
 * La base de datos guarda un índice de 1 a 6, no un color. El color vive en
 * tokens.css, donde el tema oscuro tiene su propia paleta validada: si se
 * guardara el hex, el modo oscuro heredaría colores pensados para fondo claro.
 */
export function accentFor(slot: number | null | undefined): string {
  const index = Math.min(Math.max(slot ?? 1, 1), 6);
  return `var(--pillar-${index})`;
}

/* --- Formatos ------------------------------------------------------------- */

const monthFormatter = new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric" });
const longDateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Las fechas de Postgres llegan como "2026-08-31". Interpretarlas en UTC
  // evita que un huso al oeste las muestre un día antes.
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

/** "2026-08-31" → "ago 2026" */
export function formatMonth(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? monthFormatter.format(date).replace(".", "") : "Sin fecha";
}

/** "2026-08-28" → "28 ago 2026" */
export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? longDateFormatter.format(date).replace(".", "") : "—";
}

/** 4200000 → "$4,2 M" */
export function formatBudget(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toLocaleString("es-CO", { maximumFractionDigits: 0 })} K`;
  }
  return `$${value.toLocaleString("es-CO")}`;
}

/* --- Derivados ------------------------------------------------------------ */

export const emptyProgress: PillarProgress = {
  pillar_id: "",
  slug: "",
  done: 0,
  active: 0,
  pending: 0,
  risk: 0,
  total: 0,
  progress: 0,
  completion_rate: 0,
  area_count: 0,
  line_count: 0,
};

export const emptySummary: PdiSummary = {
  done: 0,
  active: 0,
  pending: 0,
  risk: 0,
  total: 0,
  progress: 0,
  on_track: 0,
  need_attention: 0,
  pillar_count: 0,
  completion_rate: 0,
};

/** Cuenta de un estado dentro de un resumen, para no repetir el switch. */
export function countFor(summary: PdiSummary | PillarProgress, status: ActivityStatus): number {
  switch (status) {
    case "cumplida":
      return summary.done;
    case "curso":
      return summary.active;
    case "pendiente":
      return summary.pending;
    case "riesgo":
      return summary.risk;
  }
}

/** Suma varios avances por pilar en un resumen, para el filtro del tablero. */
export function summarizeProgress(rows: PillarProgress[]): PdiSummary {
  const totals = rows.reduce(
    (acc, row) => ({
      done: acc.done + row.done,
      active: acc.active + row.active,
      pending: acc.pending + row.pending,
      risk: acc.risk + row.risk,
      total: acc.total + row.total,
    }),
    { done: 0, active: 0, pending: 0, risk: 0, total: 0 },
  );

  return {
    ...totals,
    // Promedio de los pilares, igual que v_pdi_summary: cada pilar pesa lo
    // mismo. Sumar actividades daría más peso a los pilares con más filas.
    progress:
      rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length),
    completion_rate: totals.total === 0 ? 0 : Math.round((totals.done / totals.total) * 100),
    on_track: rows.filter((row) => row.progress >= 80).length,
    need_attention: rows.filter((row) => row.risk > 0).length,
    pillar_count: rows.length,
  };
}

/** Etiqueta de estado a partir del avance, no de un texto escrito a mano. */
export function toneForProgress(progress: number) {
  if (progress >= 90) return { label: "Consolidado", tone: "done" as const, glyph: "✓" };
  if (progress >= 70) return { label: "En progreso", tone: "active" as const, glyph: "◐" };
  if (progress >= 45) return { label: "En desarrollo", tone: "pending" as const, glyph: "○" };
  return { label: "Atención requerida", tone: "risk" as const, glyph: "▲" };
}
