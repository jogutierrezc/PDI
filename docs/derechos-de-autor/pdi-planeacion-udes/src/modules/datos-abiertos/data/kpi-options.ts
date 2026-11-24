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

/* =============================================================================
   Desgloses · cómo se lee la cifra de «todo el periodo».

   Con el corte «Todos» un desglose mostraba siempre el promedio anual de cada
   categoría. Cada desglose puede elegir otra lectura
   (`settings.breakdownModes`, por clave de desglose, sin migración):

   · «promedio»  (por defecto): lo de siempre, nada cambia.
   · «ultima»    cada categoría toma su cifra más reciente con dato; el reparto
                 (%) se calcula sobre esas cifras.
   · «variacion» ((final − inicial) / inicial) × 100 por categoría, con inicial =
                 su primera cifra reportada. Sin base (cero o una sola cifra): «—».

   Un hueco (null) nunca es cero. Una celda reservada («< 5») cuenta como dato
   presente pero no se lee: no se calcula nada con ella.
   ========================================================================== */

export type BreakdownMode = "promedio" | "ultima" | "variacion";

export const BREAKDOWN_MODES: BreakdownMode[] = ["promedio", "ultima", "variacion"];

export const BREAKDOWN_MODE_LABEL: Record<BreakdownMode, string> = {
  promedio: "Promedio",
  ultima: "Última cifra reportada",
  variacion: "Variación porcentual",
};

export const BREAKDOWN_MODE_HINT: Record<BreakdownMode, string> = {
  promedio: "Como hasta ahora: en «todo el periodo», el promedio anual de cada categoría.",
  ultima: "Cada categoría toma su cifra más reciente con dato; el rótulo dice el corte (p. ej. 2025-2). Los % se calculan sobre esas cifras.",
  variacion: "((final − inicial) / inicial) × 100 por categoría, con su primera cifra reportada como inicial. Si el inicial es cero, «—».",
};

/** La lectura de un desglose. Lo que falta o no se reconoce es el promedio. */
export function breakdownModeOf(modes: Record<string, BreakdownMode> | undefined, id: string): BreakdownMode {
  const mode = modes?.[id];
  return mode && BREAKDOWN_MODES.includes(mode) ? mode : "promedio";
}

/** Lo que se guarda: solo las elecciones distintas del promedio; sin ninguna, nada. */
export function cleanBreakdownModes(modes: Record<string, BreakdownMode | string> | undefined): Record<string, BreakdownMode> | undefined {
  const kept: Record<string, BreakdownMode> = {};
  for (const [id, mode] of Object.entries(modes ?? {})) {
    if (mode !== "promedio" && BREAKDOWN_MODES.includes(mode as BreakdownMode)) kept[id] = mode as BreakdownMode;
  }
  return Object.keys(kept).length ? kept : undefined;
}

export function withBreakdownMode(modes: Record<string, BreakdownMode> | undefined, id: string, mode: BreakdownMode): Record<string, BreakdownMode> | undefined {
  return cleanBreakdownModes({ ...modes, [id]: mode });
}

/** Un corte del desglose (un año o un periodo) con sus categorías, en orden cronológico. */
export interface BreakdownCut {
  label: string;
  items: { label: string; value: number | null; reserved?: boolean }[];
}

export interface BreakdownReadItem {
  label: string;
  /** «ultima»: la cifra; «variacion»: el porcentaje. null = sin cifra o sin base. */
  value: number | null;
  reserved?: boolean;
  /** Corte del que sale la cifra (el final, en la variación). */
  at?: string;
  /** Solo en la variación: corte y cifra inicial y final. */
  from?: string;
  fromValue?: number | null;
  toValue?: number | null;
}

export interface BreakdownReading {
  mode: Exclude<BreakdownMode, "promedio">;
  items: BreakdownReadItem[];
  /** «última cifra · 2025-2» o «variación 2020-1 → 2025-2». */
  caption: string;
}

/**
 * Lee un desglose por todo el periodo con la lectura elegida. Con el promedio
 * devuelve null: quien llama sigue con su cifra de siempre.
 */
export function readBreakdown(cuts: BreakdownCut[], labels: string[], mode: BreakdownMode): BreakdownReading | null {
  if (mode === "promedio") return null;
  const find = (cut: BreakdownCut, label: string) => cut.items.find((i) => i.label === label);
  const index = (label: string | undefined) => (label === undefined ? -1 : cuts.findIndex((c) => c.label === label));

  if (mode === "ultima") {
    const items: BreakdownReadItem[] = labels.map((label) => {
      for (let i = cuts.length - 1; i >= 0; i -= 1) {
        const item = find(cuts[i], label);
        if (item && (isNumber(item.value) || item.reserved)) {
          return item.reserved ? { label, value: null, reserved: true, at: cuts[i].label } : { label, value: item.value, at: cuts[i].label };
        }
      }
      return { label, value: null };
    });
    const latest = items.reduce((best, i) => Math.max(best, index(i.at)), -1);
    const mixed = items.some((i) => i.at !== undefined && index(i.at) !== latest);
    const where = latest >= 0 ? cuts[latest].label : "sin cifras";
    return { mode, items, caption: `última cifra · ${where}${mixed ? " (algunas categorías, de un corte anterior)" : ""}` };
  }

  let first = -1;
  let last = -1;
  const items: BreakdownReadItem[] = labels.map((label) => {
    const reported: { i: number; value: number }[] = [];
    cuts.forEach((cut, i) => {
      const item = find(cut, label);
      if (item && !item.reserved && isNumber(item.value)) reported.push({ i, value: item.value });
    });
    if (!reported.length) return { label, value: null };
    const from = reported[0];
    const to = reported[reported.length - 1];
    first = first === -1 ? from.i : Math.min(first, from.i);
    last = Math.max(last, to.i);
    const base = { label, at: cuts[to.i].label, from: cuts[from.i].label, fromValue: from.value, toValue: to.value };
    if (reported.length < 2 || from.value === 0) return { ...base, value: null };
    return { ...base, value: ((to.value - from.value) / from.value) * 100 };
  });
  return { mode, items, caption: first >= 0 ? `variación ${cuts[first].label} → ${cuts[last].label}` : "variación · sin cifras" };
}
