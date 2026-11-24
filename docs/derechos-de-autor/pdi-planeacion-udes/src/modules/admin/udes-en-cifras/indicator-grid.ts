/* =============================================================================
   UDES en Cifras · las reglas de la rejilla de indicadores.

   Una sola implementación para Captura (vista clásica) y para el taller: qué
   casilla se escribe y cuál no, con su motivo; el total institucional de lo
   que se suma; y la cifra del año, que sale de `annualFigure` (terms.ts), la
   misma función que usa el portal. Lo que Planeación ve al cargar es lo que
   el público ve al consultar.

   Módulo puro: no conoce React ni la base. Las casillas se nombran igual que
   en DataGrid: fila «<indicador>::<campus|total>», columna «<año>-<A|B|anual>».
   ========================================================================== */

import type { OdIndicatorRow, OdTerm, OdValueRow } from "../../../types/database";
import { ANNUAL_RULE_LABEL, annualFigure } from "../../datos-abiertos/data/terms";
import type { GridColumn } from "./DataGrid";
import type { CellKey } from "./sheet";
import { cellKey } from "./sheet";

/** Fila del total institucional (en la base, campus_id nulo). */
export const TOTAL = "total";

/** ¿El indicador se reporta con una sola cifra por año? */
export const byYear = (indicator: Pick<OdIndicatorRow, "reporting">) => indicator.reporting === "anual";

export const rowKeyOf = (indicatorId: string, campus: string) => `${indicatorId}::${campus}`;
export const columnKeyOf = (year: number | string, term: OdTerm) => `${year}-${term}`;
/** Clave del índice de lo guardado: indicador|año|periodo|campus. */
export const storedKeyOf = (indicatorId: string, year: number | string, term: OdTerm, campus: string) =>
  `${indicatorId}|${year}|${term}|${campus}`;

export const splitRowKey = (rowKey: string) => {
  const [indicatorId, campus] = rowKey.split("::");
  return { indicatorId, campus };
};
export const splitColumnKey = (column: string) => {
  const [year, term] = column.split("-");
  return { year, term: term as OdTerm };
};

/** Índice de lo guardado en la base. Un valor ausente y uno nulo son lo mismo: sin reportar. */
export function indexValues(values: Pick<OdValueRow, "indicator_id" | "year" | "term" | "campus_id" | "value">[]): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const v of values) {
    map.set(storedKeyOf(v.indicator_id, v.year, v.term, v.campus_id ?? TOTAL), v.value === null ? null : Number(v.value));
  }
  return map;
}

/**
 * Columnas de la rejilla: por cada año, periodo 1, periodo 2 y la cifra del
 * año; o una sola por año cuando nada se reporta por periodo.
 */
export function indicatorColumns(
  years: number[],
  { byTerm, annual, labels = { A: "1", B: "2", anual: "Año" } }: { byTerm: boolean; annual: boolean; labels?: Record<OdTerm, string> },
): GridColumn[] {
  return years.flatMap((y) => [
    ...(byTerm
      ? [
          { key: columnKeyOf(y, "A"), label: labels.A, group: String(y), ariaLabel: `${y}, periodo 1` },
          { key: columnKeyOf(y, "B"), label: labels.B, group: String(y), ariaLabel: `${y}, periodo 2` },
        ]
      : []),
    ...(annual ? [{ key: columnKeyOf(y, "anual"), label: labels.anual, group: String(y), ariaLabel: `${y}, cifra del año` }] : []),
  ]);
}

/** Por qué una casilla no se escribe, dicho para quien la mira. */
export interface LockTexts {
  noYear: (indicator: OdIndicatorRow, year: string) => string;
  byYear: (indicator: OdIndicatorRow) => string;
  annualRule: (indicator: OdIndicatorRow) => string;
  summed: string;
}

/** Los motivos de Captura, tal como los dice la vista clásica. */
export const CAPTURE_LOCK_TEXTS: LockTexts = {
  noYear: (indicator, year) => `${indicator.label} no se reporta en ${year}. Cámbialo en "Años con dato".`,
  byYear: (indicator) => `${indicator.label} se reporta por año: sin periodos 1 y 2. Se cambia en Estructura y KPI.`,
  annualRule: (indicator) => `Cifra del año: ${ANNUAL_RULE_LABEL[indicator.annual_rule].toLowerCase()}. Se cambia en Estructura y KPI.`,
  summed: "Se calcula sumando los campus",
};

export type LockKind = "sin-ano" | "por-ano" | "regla" | "suma";

export interface IndicatorGridModel {
  split: (rowKey: string) => { indicator: OdIndicatorRow; campus: string };
  storedValue: (rowKey: string, column: string) => number | null;
  /** Lo que se ve en la casilla: el cambio sin guardar o lo guardado. */
  currentValue: (indicatorId: string, campus: string, year: number | string, term: OdTerm) => number | null;
  /** Total institucional de lo que se suma: la suma de los campus, o nada si falta uno. */
  sumFor: (indicator: OdIndicatorRow, year: number | string, term: OdTerm) => number | null;
  cellValue: (indicator: OdIndicatorRow, campus: string, year: number | string, term: OdTerm) => number | null;
  lockKind: (rowKey: string, column: string) => LockKind | null;
  lockedReason: (rowKey: string, column: string) => string | null;
  lockedValue: (rowKey: string, column: string) => number | null;
}

export function indicatorGridModel({
  indicators,
  campusIds,
  stored,
  draft,
  texts = CAPTURE_LOCK_TEXTS,
}: {
  indicators: OdIndicatorRow[];
  /** Campus del periodo, en su orden (campus_id). */
  campusIds: string[];
  stored: Map<string, number | null>;
  draft: Record<CellKey, number | null>;
  texts?: LockTexts;
}): IndicatorGridModel {
  const byId = new Map(indicators.map((i) => [i.id, i]));
  const split = (rowKey: string) => {
    const { indicatorId, campus } = splitRowKey(rowKey);
    return { indicator: byId.get(indicatorId)!, campus };
  };
  const storedValue = (rowKey: string, column: string) => {
    const { indicatorId, campus } = splitRowKey(rowKey);
    const { year, term } = splitColumnKey(column);
    return stored.get(storedKeyOf(indicatorId, year, term, campus)) ?? null;
  };
  const currentValue = (indicatorId: string, campus: string, year: number | string, term: OdTerm) => {
    const key = cellKey(rowKeyOf(indicatorId, campus), columnKeyOf(year, term));
    return key in draft ? draft[key] : stored.get(storedKeyOf(indicatorId, year, term, campus)) ?? null;
  };
  const sumFor = (indicator: OdIndicatorRow, year: number | string, term: OdTerm) => {
    const parts = campusIds.map((id) => currentValue(indicator.id, id, year, term));
    return parts.every((p) => p !== null && p !== undefined) ? parts.reduce<number>((a, b) => a + (b as number), 0) : null;
  };
  const cellValue = (indicator: OdIndicatorRow, campus: string, year: number | string, term: OdTerm) =>
    campus === TOTAL && indicator.aggregation === "suma" ? sumFor(indicator, year, term) : currentValue(indicator.id, campus, year, term);

  const outOfYears = (indicator: OdIndicatorRow, year: string) =>
    Boolean(indicator.years && indicator.years.length && !indicator.years.includes(Number(year)));

  const lockKind = (rowKey: string, column: string): LockKind | null => {
    const { indicator, campus } = split(rowKey);
    const { year, term } = splitColumnKey(column);
    if (outOfYears(indicator, year)) return "sin-ano";
    if (byYear(indicator) && term !== "anual") return "por-ano";
    if (term === "anual" && indicator.annual_rule !== "reportado" && !byYear(indicator)) return "regla";
    return campus === TOTAL && indicator.aggregation === "suma" ? "suma" : null;
  };
  const lockedReason = (rowKey: string, column: string) => {
    const kind = lockKind(rowKey, column);
    if (!kind) return null;
    const { indicator } = split(rowKey);
    if (kind === "sin-ano") return texts.noYear(indicator, splitColumnKey(column).year);
    if (kind === "por-ano") return texts.byYear(indicator);
    if (kind === "regla") return texts.annualRule(indicator);
    return texts.summed;
  };
  const lockedValue = (rowKey: string, column: string) => {
    const { indicator, campus } = split(rowKey);
    const { year, term } = splitColumnKey(column);
    if (outOfYears(indicator, year)) return null;
    if (byYear(indicator)) return term === "anual" ? cellValue(indicator, campus, year, "anual") : null;
    if (term !== "anual") return cellValue(indicator, campus, year, term);
    return annualFigure(
      indicator.annual_rule,
      cellValue(indicator, campus, year, "A"),
      cellValue(indicator, campus, year, "B"),
      cellValue(indicator, campus, year, "anual"),
    ).value;
  };

  return { split, storedValue, currentValue, sumFor, cellValue, lockKind, lockedReason, lockedValue };
}

/** Los cambios sin guardar, vueltos filas de `od_values` para la mutación de siempre. */
export function draftToValues(draft: Record<CellKey, number | null>): OdValueRow[] {
  return Object.entries(draft).map(([key, value]) => {
    const [rowKey, column] = key.split("|");
    const { indicatorId, campus } = splitRowKey(rowKey);
    const { year, term } = splitColumnKey(column);
    return { indicator_id: indicatorId, year: Number(year), term, campus_id: campus === TOTAL ? null : campus, value };
  });
}
