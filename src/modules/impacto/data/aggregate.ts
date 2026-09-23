/* =============================================================================
   Consolidación por facultad, sede o institución.

   Un porcentaje de facultad es Σ numeradores ÷ Σ denominadores × factor,
   nunca el promedio de los porcentajes de sus programas: un programa de 20
   estudiantes no pesa lo mismo que uno de 900.
   ========================================================================== */

import type { Aggregation, Measure } from "./types";

export interface Consolidated {
  /** null cuando no hay nada que consolidar o la regla es no_agregable. */
  valor: number | null;
  numerador: number | null;
  denominador: number | null;
  n: number | null;
  /** Cuántos registros entraron. */
  registros: number;
}

const sum = (values: (number | null | undefined)[]) =>
  values.reduce<number>((total, v) => total + (typeof v === "number" ? v : 0), 0);

export function consolidate(rows: Measure[], rule: Aggregation, factor: number): Consolidated {
  const usable = rows.filter((r) => typeof r.numerador === "number");
  const empty: Consolidated = { valor: null, numerador: null, denominador: null, n: null, registros: usable.length };
  if (usable.length === 0 || rule === "no_agregable") return empty;

  if (rule === "suma") {
    const total = sum(usable.map((r) => r.numerador));
    return { valor: total, numerador: total, denominador: null, n: null, registros: usable.length };
  }

  if (rule === "razon_de_sumas") {
    const withDen = usable.filter((r) => typeof r.denominador === "number" && r.denominador > 0);
    const num = sum(withDen.map((r) => r.numerador));
    const den = sum(withDen.map((r) => r.denominador));
    if (den === 0) return { ...empty, registros: withDen.length };
    return { valor: (num / den) * factor, numerador: num, denominador: den, n: null, registros: withDen.length };
  }

  // promedio_ponderado: el valor es el puntaje y el peso son las respuestas.
  const weighted = usable.filter((r) => typeof r.n === "number" && r.n > 0);
  const n = sum(weighted.map((r) => r.n));
  if (n === 0) return { ...empty, registros: weighted.length };
  const total = sum(weighted.map((r) => (r.numerador ?? 0) * (r.n ?? 0)));
  return { valor: total / n, numerador: null, denominador: null, n, registros: weighted.length };
}

/** Valor de un solo registro, con la misma regla que la consolidación. */
export function valueOf(measure: Measure, rule: Aggregation, factor: number): number | null {
  return consolidate([measure], rule, factor).valor;
}
