/* =============================================================================
   Datos Abiertos · la lectura por periodo académico.

   El portal se lee primero por periodo (1 o 2) y después por año: la cifra
   principal es la del periodo más reciente con dato, se compara con el periodo
   anterior y con el mismo periodo del año anterior, y la cifra del año queda
   como lectura secundaria.

   Aquí no se inventa cómo se agrega nada: la cifra del año sigue saliendo de
   la regla del indicador (`annualRule`, en terms.ts). Un indicador que solo se
   reporta por año no tiene periodos: se muestra su cifra anual y se dice. Un
   periodo sin dato es un vacío (`null`), nunca un cero.

   Módulo puro: tipos, `terms.ts` y `reserve.ts`. Lo leen el tablero, el boleto
   y los controles de corte, así que todos dicen lo mismo de la misma cifra.
   ========================================================================== */

import { valueOf } from "./reserve";
import { ALL_YEARS, cutLabel, TERMS } from "./terms";
import type { Breakdown, CampusId, Indicator, Term } from "./types";

export interface Cut {
  year: number;
  term: Term | null;
}

/** Lo que hace falta de un informe (o del catálogo entero) para buscar sus periodos. */
export interface CutScope {
  indicators: Pick<Indicator, "terms" | "annualRule" | "values" | "years">[];
  breakdowns?: Pick<Breakdown, "terms" | "values" | "years">[];
}

/** ¿El indicador se reporta por periodo? Sin regla anual o sin periodos, es solo anual. */
export function reportsByTerm(indicator: Pick<Indicator, "terms" | "annualRule">): boolean {
  return Boolean(indicator.terms && indicator.annualRule);
}

const hasNumber = (values: Partial<Record<CampusId, number | null>> | undefined) =>
  Object.values(values ?? {}).some((v) => v !== null && v !== undefined);

/** ¿Hay alguna cifra del periodo `term` de `year` en el alcance? */
export function termHasData(scope: CutScope, year: number, term: Term): boolean {
  return (
    scope.indicators.some(
      (i) => reportsByTerm(i) && (!i.years || i.years.includes(year)) && hasNumber(i.terms?.[year]?.[term]),
    ) ||
    (scope.breakdowns ?? []).some(
      (b) => (!b.years || b.years.includes(year)) && (b.terms?.[year]?.[term] ?? []).some((item) => item.value !== null),
    )
  );
}

/** ¿Hay alguna cifra del año (calculada o reportada) en el alcance? */
export function yearHasData(scope: CutScope, year: number): boolean {
  return (
    scope.indicators.some((i) => (!i.years || i.years.includes(year)) && hasNumber(i.values[year])) ||
    (scope.breakdowns ?? []).some((b) => (!b.years || b.years.includes(year)) && (b.values[year] ?? []).some((item) => item.value !== null))
  );
}

/** El periodo más reciente con dato, o null si el alcance no trae periodos. */
export function latestTermCut(scope: CutScope, years: number[]): Cut | null {
  for (let i = years.length - 1; i >= 0; i -= 1) {
    for (let t = TERMS.length - 1; t >= 0; t -= 1) {
      if (termHasData(scope, years[i], TERMS[t])) return { year: years[i], term: TERMS[t] };
    }
  }
  return null;
}

/** El periodo más reciente con dato dentro de un año, o null si ese año no tiene periodos. */
export function latestTermOfYear(scope: CutScope, year: number): Term | null {
  for (let t = TERMS.length - 1; t >= 0; t -= 1) if (termHasData(scope, year, TERMS[t])) return TERMS[t];
  return null;
}

/**
 * El corte con que abre el tablero: el periodo más reciente con dato; si el
 * alcance solo trae cifras anuales, el último año con dato; si no hay nada,
 * todo el periodo.
 */
export function startingCut(scope: CutScope, years: number[]): Cut {
  const term = latestTermCut(scope, years);
  if (term) return term;
  for (let i = years.length - 1; i >= 0; i -= 1) if (yearHasData(scope, years[i])) return { year: years[i], term: null };
  return { year: ALL_YEARS, term: null };
}

/** El periodo inmediatamente anterior: 2025-2 → 2025-1 → 2024-2. */
export function previousTermCut(cut: { year: number; term: Term }): { year: number; term: Term } {
  return cut.term === "B" ? { year: cut.year, term: "A" } : { year: cut.year - 1, term: "B" };
}

/**
 * Lo que dice la URL, vuelto corte. Sin `corte`, el de partida. `corte=todos`
 * es todo el periodo agrupado. Con un año y sin `periodo`, su periodo más
 * reciente con dato (la lectura por periodo va primero); `periodo=anual` pide
 * la cifra del año. Acepta 1 y 2 además de A y B.
 */
export function cutFromParams(
  raw: { corte: string | null; periodo: string | null },
  scope: CutScope,
  years: number[],
): Cut {
  const start = startingCut(scope, years);
  const corte = raw.corte?.trim().toLowerCase() ?? "";
  if (corte === "todos" || corte === "0") return { year: ALL_YEARS, term: null };
  const year = years.includes(Number(corte)) ? Number(corte) : null;
  if (year === null) return start;
  const periodo = raw.periodo?.trim().toUpperCase() ?? "";
  if (periodo === "ANUAL") return { year, term: null };
  if (periodo === "A" || periodo === "1") return { year, term: "A" };
  if (periodo === "B" || periodo === "2") return { year, term: "B" };
  return { year, term: latestTermOfYear(scope, year) };
}

/** El corte escrito para la URL. El de partida no escribe nada: el enlace limpio abre en él. */
export function cutToParams(cut: Cut, start: Cut): { corte: string | null; periodo: string | null } {
  if (cut.year === start.year && cut.term === start.term) return { corte: null, periodo: null };
  if (cut.year === ALL_YEARS) return { corte: "todos", periodo: null };
  return { corte: String(cut.year), periodo: cut.term ?? "anual" };
}

/** Al cambiar de año se conserva la lectura: el mismo periodo si tiene dato, o el más reciente; la anual sigue anual. */
export function cutForYear(scope: CutScope, year: number, current: Cut): Cut {
  if (year === ALL_YEARS) return { year, term: null };
  if (current.year !== ALL_YEARS && current.term === null && latestTermOfYear(scope, current.year) !== null) {
    return { year, term: null };
  }
  if (current.term && termHasData(scope, year, current.term)) return { year, term: current.term };
  return { year, term: latestTermOfYear(scope, year) };
}

export interface Comparison {
  /** Rótulo del corte con que se compara: "2025-1", "2024". */
  label: string;
  value: number | null;
  /** Para leer la frase: el periodo anterior, el mismo periodo del año anterior o el año anterior. */
  kind: "periodo-anterior" | "mismo-periodo" | "anio-anterior";
}

export interface PeriodReading {
  /**
   * "periodo": la cifra de un periodo. "anual": la cifra del año, porque se
   * pidió o porque el indicador no se reporta por periodo. "todo": todos los
   * años agrupados.
   */
  kind: "periodo" | "anual" | "todo";
  /** El corte que de verdad se lee (un indicador anual lee el año aunque se pida un periodo). */
  cut: Cut;
  label: string;
  value: number | null;
  /** Se pidió un periodo y el indicador solo tiene cifra anual. */
  annualOnly: boolean;
  /** Comparaciones en orden de lectura; vacío en "todo". */
  comparisons: Comparison[];
}

/**
 * La lectura de un indicador en un corte. Con un periodo, primero contra el
 * periodo anterior y después contra el mismo periodo del año anterior (solo si
 * ese periodo existe en el indicador). Con el año, contra el año anterior.
 */
export function periodReading(indicator: Indicator, year: number, term: Term | null, campus: CampusId): PeriodReading {
  if (year === ALL_YEARS) {
    return { kind: "todo", cut: { year, term: null }, label: cutLabel(year, null), value: valueOf(indicator, year, campus), annualOnly: false, comparisons: [] };
  }
  const known = (y: number) => (indicator.years ? indicator.years.includes(y) : y in indicator.values);

  if (term && reportsByTerm(indicator)) {
    const before = previousTermCut({ year, term });
    const comparisons: Comparison[] = [];
    if (known(before.year)) {
      comparisons.push({ kind: "periodo-anterior", label: cutLabel(before.year, before.term), value: valueOf(indicator, before.year, campus, before.term) });
    }
    if (known(year - 1)) {
      comparisons.push({ kind: "mismo-periodo", label: cutLabel(year - 1, term), value: valueOf(indicator, year - 1, campus, term) });
    }
    return { kind: "periodo", cut: { year, term }, label: cutLabel(year, term), value: valueOf(indicator, year, campus, term), annualOnly: false, comparisons };
  }

  return {
    kind: "anual",
    cut: { year, term: null },
    label: cutLabel(year, null),
    value: valueOf(indicator, year, campus),
    annualOnly: term !== null,
    comparisons: known(year - 1) ? [{ kind: "anio-anterior", label: cutLabel(year - 1, null), value: valueOf(indicator, year - 1, campus) }] : [],
  };
}

/** El corte dicho para un rótulo: "periodo 2025-2", "año 2025", "2020–2025". */
export function readingCutText(reading: Pick<PeriodReading, "kind" | "label">): string {
  if (reading.kind === "periodo") return `periodo ${reading.label}`;
  if (reading.kind === "anual") return `año ${reading.label}`;
  return `todo el periodo ${reading.label}`;
}

/** Qué comparación es, en palabras. */
export function comparisonText(comparison: Pick<Comparison, "kind" | "label">): string {
  if (comparison.kind === "mismo-periodo") return `${comparison.label}, mismo periodo del año anterior`;
  if (comparison.kind === "periodo-anterior") return `${comparison.label}, periodo anterior`;
  return `${comparison.label}, año anterior`;
}
