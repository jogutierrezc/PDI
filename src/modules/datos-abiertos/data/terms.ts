/* =============================================================================
   Datos Abiertos · periodos académicos A y B.

   Cada año tiene dos periodos, A y B, y los indicadores se reportan por
   periodo. La cifra del año no se guarda: sale de A y B según la regla anual
   del indicador. Esta es la única implementación de esa regla; la usan el
   catálogo del portal y la rejilla de captura de la intranet, así que lo que
   Planeación ve al cargar es lo que el público ve al consultar.
   ========================================================================== */

export type Term = "A" | "B";
export const TERMS: Term[] = ["A", "B"];

export type AnnualRule = "suma" | "ultimo" | "promedio" | "reportado";

export const ANNUAL_RULE_LABEL: Record<AnnualRule, string> = {
  suma: "Suma de A y B",
  ultimo: "Último periodo reportado",
  promedio: "Promedio de A y B",
  reportado: "Se reporta aparte",
};

/** Para qué sirve cada regla, en una línea (formulario del indicador). */
export const ANNUAL_RULE_HINT: Record<AnnualRule, string> = {
  suma: "Flujos del año: graduados, admitidos, eventos.",
  ultimo: "Existencias al cierre: matrícula, docentes, programas. Si falta B, se toma A.",
  promedio: "Tasas y promedios: retención, deserción, relación estudiantes por docente.",
  reportado: "La cifra del año no se deduce de A y B: se captura en su propia columna.",
};

export interface AnnualFigure {
  value: number | null;
  /** Periodo del que salió la cifra cuando la regla toma uno solo. */
  from?: Term;
}

// Evita arrastrar errores de coma flotante (0,1 + 0,2) a la cifra publicada.
const clean = (value: number) => Math.round(value * 1e6) / 1e6;

export function annualFigure(rule: AnnualRule, a: number | null, b: number | null, reported: number | null): AnnualFigure {
  switch (rule) {
    case "suma":
      return { value: a !== null && b !== null ? clean(a + b) : null };
    case "promedio":
      return { value: a !== null && b !== null ? clean((a + b) / 2) : null };
    case "ultimo":
      if (b !== null) return { value: b, from: "B" };
      if (a !== null) return { value: a, from: "A" };
      return { value: null };
    case "reportado":
      return { value: reported };
  }
}

/**
 * Un corte como número, para las gráficas que ordenan y eligen por número:
 * 2024 es el año; 20241 y 20242 son sus periodos A y B.
 */
export function cutCode(year: number, term: Term | null | undefined): number {
  return term ? year * 10 + (term === "A" ? 1 : 2) : year;
}

export function fromCutCode(code: number): { year: number; term: Term | null } {
  return code > 9999 ? { year: Math.floor(code / 10), term: code % 10 === 1 ? "A" : "B" } : { year: code, term: null };
}

export const cutCodeLabel = (code: number): string => {
  const { year, term } = fromCutCode(code);
  return cutLabel(year, term);
};

/** "2024" o "2024-A". */
export function cutLabel(year: number, term: Term | null | undefined): string {
  return term ? `${year}-${term}` : String(year);
}

/** El corte anterior comparable: el año anterior, o el mismo periodo del año anterior. */
export function previousCutLabel(year: number, term: Term | null | undefined): string {
  return cutLabel(year - 1, term);
}

/** Qué hay detrás de una cifra anual, dicho para el boleto: "A + B", "periodo B". */
export function annualBasis(rule: AnnualRule | undefined, from: Term | undefined): string | null {
  if (!rule) return null;
  if (rule === "suma") return "A + B";
  if (rule === "promedio") return "promedio de A y B";
  if (rule === "ultimo") return from ? `periodo ${from}` : null;
  return null;
}

/** Cómo llega la cifra: por periodo académico (A y B) o una sola cifra por año. */
export type Reporting = "periodo" | "anual";

export const REPORTING_LABEL: Record<Reporting, string> = {
  periodo: "Por periodo (A y B)",
  anual: "Por año",
};

export const REPORTING_HINT: Record<Reporting, string> = {
  periodo: "Se capturan los periodos A y B; la cifra del año sale de la regla.",
  anual: "Se captura una sola cifra por año, sin periodos A y B.",
};
