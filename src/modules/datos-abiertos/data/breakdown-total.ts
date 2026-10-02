/* =============================================================================
   Desgloses · el total de «Ver datos por corte».

   La tabla lleva una columna «Total»: la suma de las categorías de cada corte.
   No siempre tiene sentido (porcentajes, promedios, tasas, categorías que se
   solapan), así que cada desglose decide en la intranet si la muestra
   (od_breakdowns.show_total, 0124). Un desglose que no trae la opción queda
   como estaba: con total.

   Módulo puro: la tabla y la sugerencia de la intranet salen de aquí.
   ========================================================================== */

import type { AnnualRule } from "./terms";
import type { Breakdown, ValueFormat } from "./types";

/** ¿El desglose muestra su total? Sin la opción guardada, sí. */
export const showsTotal = (breakdown: Pick<Breakdown, "showTotal">): boolean => breakdown.showTotal !== false;

/** Suma de las categorías con dato de un corte; null si ninguna se reportó. */
export function sumOfParts(values: (number | null)[]): number | null {
  const parts = values.filter((v): v is number => v !== null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

export interface CutRow {
  label: string;
  values: (number | null)[];
  /** Solo con total: la suma de las categorías del corte. */
  total?: number | null;
}

export interface CutTable {
  header: string[];
  rows: CutRow[];
}

/** La tabla «Ver datos por corte»: un corte por fila, una categoría por columna y, si se pide, el total. */
export function cutTable(labels: string[], cuts: { label: string; values: (number | null)[] }[], withTotal: boolean): CutTable {
  return {
    header: ["Corte", ...labels, ...(withTotal ? ["Total"] : [])],
    rows: cuts.map((cut) => ({ label: cut.label, values: cut.values, ...(withTotal ? { total: sumOfParts(cut.values) } : {}) })),
  };
}

/**
 * Sugerencia para la intranet: cuándo sumar las categorías probablemente no
 * dice nada. Solo avisa; el interruptor lo mueve quien administra.
 */
export function totalAdvice({ unit, format, annualRule }: { unit: string; format: ValueFormat; annualRule?: AnnualRule }): string | null {
  if (format === "porcentaje" || unit.includes("%")) return "Este desglose está en porcentaje: quizá no conviene mostrar total.";
  if (annualRule === "promedio") return "La cifra del año de este desglose es un promedio: quizá no conviene mostrar total.";
  return null;
}
