/* =============================================================================
   Las 13 fichas del piloto, propuestas, en columnas de imp_indicators.

   Salen de las fichas del prototipo (catalog.ts, PILOT) y de los supuestos de
   docs/impacto/DECISIONES.md. En la pantalla de Catálogo, «Precargar las
   fichas del piloto» las escribe en el borrador para que Planeación las
   revise; no se publican solas.

   El emparejamiento es por nombre del indicador, no por código: los códigos
   se pueden renumerar y el nombre es lo que trae la matriz.
   ========================================================================== */

import { PILOT, indicatorByCode } from "./catalog";
import type { TechSheet } from "./types";

export interface SheetColumns {
  unit: "numero" | "porcentaje" | "razon" | "puntaje" | "moneda_cop" | "horas";
  calc_type: TechSheet["tipo"];
  numerator_def: string;
  denominator_def: string | null;
  factor: 1 | 100;
  aggregation: TechSheet["agregacion"];
  direction: TechSheet["sentido"];
  periodicity: TechSheet["periodicidad"];
  report_level: TechSheet["nivelReporte"];
  applies_degrees: string[];
  capture_mode: TechSheet["modo"];
  evidence_type: string | null;
  evidence_required: boolean;
  variation_threshold: number;
  range_min: number | null;
  range_max: number | null;
  n_minimum: number | null;
  allows_over_one: boolean;
  in_pilot: true;
}

function unitOf(sheet: TechSheet): SheetColumns["unit"] {
  if (sheet.factor === 100) return "porcentaje";
  if (sheet.tipo === "puntaje") return "puntaje";
  if (sheet.admiteMayorQueUno) return "horas";
  return "numero";
}

export function toColumns(sheet: TechSheet): SheetColumns {
  return {
    unit: unitOf(sheet),
    calc_type: sheet.tipo,
    numerator_def: sheet.numerador,
    denominator_def: sheet.denominador ?? null,
    factor: sheet.factor,
    aggregation: sheet.agregacion,
    direction: sheet.sentido,
    periodicity: sheet.periodicidad,
    report_level: sheet.nivelReporte,
    applies_degrees: sheet.aplicaA,
    capture_mode: sheet.modo,
    evidence_type: sheet.evidencia?.tipo ?? null,
    evidence_required: Boolean(sheet.evidencia?.obligatoria),
    variation_threshold: sheet.umbral,
    range_min: sheet.rango?.[0] ?? null,
    range_max: sheet.rango?.[1] ?? null,
    n_minimum: sheet.nMinimo ?? null,
    allows_over_one: Boolean(sheet.admiteMayorQueUno),
    in_pilot: true,
  };
}

/** Nombre del indicador en la matriz → ficha propuesta. */
export const PILOT_SHEETS: { name: string; columns: SheetColumns; assumption: string | null }[] = Object.entries(PILOT).map(
  ([code, sheet]) => ({
    name: indicatorByCode.get(code)!.nombre,
    columns: toColumns(sheet),
    assumption: sheet.supuesto ?? null,
  }),
);
