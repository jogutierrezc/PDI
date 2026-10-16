/* =============================================================================
   Datos Abiertos · cómo se lee cada KPI del tablero.

   Hasta ahora la cifra de «todo el periodo» era siempre el promedio anual. Cada
   KPI puede elegir otra lectura, y la elección vive en los ajustes del bloque
   (`settings.kpiModes`, por clave de indicador), sin migración:

   · «promedio»  (por defecto): lo de siempre, nada cambia.
   · «ultima»    la cifra más reciente que tenga dato dentro del rango visible.
   · «variacion» ((final − inicial) / inicial) × 100, con inicial = primera cifra
                 reportada y final = última del rango visible.
   · «evolucion» en lugar del número, la serie con su cifra inicial y final.

   Un hueco sin reportar (null) nunca cuenta como cero: no es inicial, ni final,
   ni entra en ninguna cuenta. Módulo puro, sin React ni Supabase.
   ========================================================================== */

import { ALL_YEARS } from "./terms";
import type { Term } from "./types";

export type KpiMode = "promedio" | "ultima" | "variacion" | "evolucion";

export const KPI_MODES: KpiMode[] = ["promedio", "ultima", "variacion", "evolucion"];
export const DEFAULT_KPI_MODE: KpiMode = "promedio";

export const KPI_MODE_LABEL: Record<KpiMode, string> = {
  promedio: "Promedio",
  ultima: "Última cifra reportada",
  variacion: "Variación porcentual",
  evolucion: "Gráfica de evolución",
};

export const KPI_MODE_HINT: Record<KpiMode, string> = {
  promedio: "Como hasta ahora: la cifra del corte elegido y, en «todo el periodo», el promedio anual.",
  ultima: "La cifra más reciente que tenga dato. Si hay 2020 y 2025, muestra 2025. Un año sin reportar no cuenta como cero.",
  variacion: "((final − inicial) / inicial) × 100, con la primera cifra reportada como inicial y la última del rango como final.",
  evolucion: "Sin número: la gráfica de evolución con la cifra inicial y la final rotuladas, con su año o periodo.",
};

/** Un corte de la serie de un indicador: un año o un periodo, con su cifra (o el vacío). */
export interface KpiPoint {
  year: number;
  term: Term | null;
  /** «2025» o «2025-1». */
  label: string;
  value: number | null;
}

const isNumber = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/** La opción de un KPI. Lo que falta o no se reconoce es el promedio. */
export function kpiModeOf(modes: Record<string, KpiMode> | undefined, id: string): KpiMode {
  const mode = modes?.[id];
  return mode && KPI_MODES.includes(mode) ? mode : DEFAULT_KPI_MODE;
}

/** Lo que se guarda: solo las elecciones distintas del promedio; sin ninguna, nada (el bloque queda como estaba). */
export function cleanKpiModes(modes: Record<string, KpiMode | string> | undefined): Record<string, KpiMode> | undefined {
  const kept: Record<string, KpiMode> = {};
  for (const [id, mode] of Object.entries(modes ?? {})) {
    if (mode !== DEFAULT_KPI_MODE && KPI_MODES.includes(mode as KpiMode)) kept[id] = mode as KpiMode;
  }
  return Object.keys(kept).length ? kept : undefined;
}

/** Cambia la opción de un KPI y devuelve las elecciones listas para guardar. */
export function withKpiMode(modes: Record<string, KpiMode> | undefined, id: string, mode: KpiMode): Record<string, KpiMode> | undefined {
  return cleanKpiModes({ ...modes, [id]: mode });
}

/** Solo los cortes con cifra, en su orden. */
export function reportedPoints(points: KpiPoint[]): KpiPoint[] {
  return points.filter((p) => isNumber(p.value));
}

/**
 * El rango visible: los cortes hasta el elegido, inclusive. En «todo el periodo»
 * son todos. Un corte anual incluye los periodos de ese año, y uno por periodo
 * llega hasta ese periodo.
 */
export function pointsUpToCut(points: KpiPoint[], cut: { year: number; term: Term | null }): KpiPoint[] {
  if (cut.year === ALL_YEARS) return points;
  return points.filter((p) => p.year < cut.year || (p.year === cut.year && (cut.term === null || p.term === null || p.term <= cut.term)));
}

/** La cifra más reciente con dato, o null si no hay ninguna. */
export function lastReported(points: KpiPoint[]): KpiPoint | null {
  for (let i = points.length - 1; i >= 0; i -= 1) if (isNumber(points[i].value)) return points[i];
  return null;
}

/** La primera cifra con dato, o null si no hay ninguna. */
export function firstReported(points: KpiPoint[]): KpiPoint | null {
  return points.find((p) => isNumber(p.value)) ?? null;
}

export interface KpiVariation {
  from: KpiPoint | null;
  to: KpiPoint | null;
  /** El porcentaje, solo cuando se puede calcular de verdad. */
  pct: number | null;
  /** Por qué no hay porcentaje. */
  reason: "calculada" | "sin-datos" | "un-solo-dato" | "sin-base";
}

/** ((final − inicial) / inicial) × 100. Con inicial en cero o sin dos cifras, no se inventa el número. */
export function variationOf(points: KpiPoint[]): KpiVariation {
  const reported = reportedPoints(points);
  if (!reported.length) return { from: null, to: null, pct: null, reason: "sin-datos" };
  const from = reported[0];
  const to = reported[reported.length - 1];
  if (reported.length < 2) return { from, to, pct: null, reason: "un-solo-dato" };
  if (from.value === 0) return { from, to, pct: null, reason: "sin-base" };
  return { from, to, pct: (((to.value as number) - (from.value as number)) / (from.value as number)) * 100, reason: "calculada" };
}

const oneDecimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** «+12,5 %», «−3,0 %», «0,0 %». Sin porcentaje, la raya. */
export function formatVariation(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  const rounded = Math.round(Math.abs(pct) * 10) / 10;
  if (rounded === 0) return `${oneDecimal.format(0)} %`;
  return `${pct > 0 ? "+" : "−"}${oneDecimal.format(rounded)} %`;
}

/** Lo que se dice cuando no hay porcentaje. */
export const VARIATION_REASON_TEXT: Record<Exclude<KpiVariation["reason"], "calculada">, string> = {
  "sin-datos": "sin cifras reportadas",
  "un-solo-dato": "sin base de comparación: solo hay una cifra reportada",
  "sin-base": "sin base de comparación: la cifra inicial es cero",
};
