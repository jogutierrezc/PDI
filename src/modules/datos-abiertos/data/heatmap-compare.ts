/* =============================================================================
   Comparativa de un mapa de calor.

   La misma matriz leída como cambio: por cada fila, la primera columna con
   dato contra la última, su diferencia y su variación. La usan la ficha (como
   segunda vista del bloque) y el boletín (debajo de la matriz), así que las
   dos dicen la misma cifra.

   Una matriz de conteos (enteros, sin %) cierra con la fila Total; una de
   tasas no, porque sumar porcentajes no da nada. En una tasa la diferencia
   son puntos porcentuales.
   ========================================================================== */

import { formatValue } from "./open-data";
import type { HeatmapData, ValueFormat } from "./types";

export interface HeatmapCompareRow {
  label: string;
  from: number | null;
  to: number | null;
  /** to − from; null si falta alguno de los dos. */
  diff: number | null;
  /** Variación en %; null si falta un extremo o el inicio es cero. */
  change: number | null;
  total?: boolean;
}

export interface HeatmapCompare {
  fromLabel: string;
  toLabel: string;
  /** La diferencia se lee en puntos porcentuales. */
  points: boolean;
  rows: HeatmapCompareRow[];
}

const rowOf = (label: string, from: number | null, to: number | null, total?: boolean): HeatmapCompareRow => ({
  label,
  from,
  to,
  diff: from !== null && to !== null ? to - from : null,
  change: from !== null && to !== null && from !== 0 ? ((to - from) / Math.abs(from)) * 100 : null,
  total,
});

/** Null si la matriz no tiene dos columnas con dato que comparar. */
export function heatmapCompare(h: HeatmapData): HeatmapCompare | null {
  const filled = h.columns.map((_, c) => h.values.some((row) => row[c] !== null && row[c] !== undefined));
  const first = filled.indexOf(true);
  const last = filled.lastIndexOf(true);
  if (first < 0 || first === last) return null;
  const at = (r: number, c: number) => h.values[r]?.[c] ?? null;
  const rows = h.rows.map((label, r) => rowOf(label, at(r, first), at(r, last)));
  const rate = h.unit === "%" || h.format === "porcentaje";
  if (!rate && h.format === "entero" && rows.length > 1) {
    const sum = (key: "from" | "to") => {
      const list = rows.map((row) => row[key]).filter((v): v is number => v !== null);
      return list.length ? list.reduce((a, b) => a + b, 0) : null;
    };
    rows.push(rowOf("Total", sum("from"), sum("to"), true));
  }
  return { fromLabel: h.columns[first], toLabel: h.columns[last], points: rate, rows };
}

/** Con signo: «+60», «−9». */
export function signed(value: number | null, format: ValueFormat): string {
  if (value === null) return "—";
  const text = formatValue(Math.abs(value), format);
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

/** La variación en %, con su flecha: «▲ +50,0 %». */
export const changeText = (change: number | null) =>
  change === null ? "—" : `${change > 0 ? "▲" : change < 0 ? "▼" : "="} ${signed(change, "decimal")} %`;
