/* =============================================================================
   Validaciones del registro · servicio único.

   Lo usan la captura en línea y, en la fase 6, la importación de Excel. Los
   errores bloquean el envío; las alertas no. «Guardar» nunca bloquea: deja el
   registro en borrador aunque esté incompleto.
   ========================================================================== */

import { valueOf } from "./aggregate";
import type { Indicator, Measure } from "./types";

export type NoData = "no_aplica" | "sin_dato" | null;

export interface Draft extends Measure {
  noAplica: NoData;
  /** Precargados: true confirma, false declara discrepancia. */
  confirma: boolean | null;
  justificacion: string;
  evidencias: { nombre: string; url?: string }[];
  texto?: string;
}

export interface Issue {
  code: `V${string}`;
  level: "error" | "alerta";
  field: keyof Draft | "valor";
  message: string;
}

export interface Context {
  /** Valor del mismo registro en el periodo anterior. */
  previous?: { period: string; value: number | null };
  /** Al enviar se exige también la evidencia (V07). */
  sending: boolean;
  /** Dato maestro del denominador, si existe (V11). */
  masterDenominator?: number | null;
  /** Prefijo que añade la importación: "Fila 7, columna J: ". */
  where?: string;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const fmt = (v: number) => v.toLocaleString("es-CO", { maximumFractionDigits: 1 });

export function computedValue(indicator: Indicator, draft: Measure): number | null {
  const sheet = indicator.ficha;
  if (!sheet) return null;
  if (sheet.tipo === "comparacion") return valueOf(draft, "razon_de_sumas", sheet.factor);
  return valueOf(draft, sheet.agregacion === "no_agregable" ? "suma" : sheet.agregacion, sheet.factor);
}

/** Variación porcentual frente al periodo anterior, si se puede calcular. */
export function variation(current: number | null, previous: number | null | undefined): number | null {
  if (!isNumber(current) || !isNumber(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function validate(indicator: Indicator, draft: Draft, context: Context): Issue[] {
  const sheet = indicator.ficha;
  if (!sheet) return [];
  const issues: Issue[] = [];
  const add = (issue: Issue) => issues.push({ ...issue, message: `${context.where ?? ""}${issue.message}` });
  const needsDen = sheet.tipo === "razon" || sheet.tipo === "comparacion";

  // Sin dato o no aplica: basta con justificarlo.
  if (draft.noAplica) {
    if (!draft.justificacion.trim()) {
      add({ code: "V06", level: "error", field: "justificacion", message: "Justifique por qué este indicador no aplica al programa." });
    }
    return issues;
  }

  // Precargado confirmado: el dato ya viene de la fuente.
  if (sheet.modo === "precargado" && draft.confirma === false && !draft.justificacion.trim()) {
    add({ code: "V06", level: "error", field: "justificacion", message: "Explique la discrepancia con el dato precargado." });
  }

  if (sheet.tipo === "texto") {
    if (!draft.texto?.trim()) add({ code: "V01", level: "error", field: "texto", message: `Falta el valor de ${indicator.codigo}. Si no aplica, márquelo y justifique.` });
    return issues;
  }

  if (draft.numerador === null || (needsDen && draft.denominador === null)) {
    add({ code: "V01", level: "error", field: "numerador", message: `Falta el valor de ${indicator.codigo}. Si no aplica, márquelo y justifique.` });
  }

  const numeric: [keyof Draft, string][] = [
    ["numerador", sheet.tipo === "conteo" || sheet.tipo === "puntaje" ? "valor" : "numerador"],
    ["denominador", "denominador"],
    ["n", "número de respuestas"],
    ["numComparacion", "numerador del grupo de comparación"],
    ["denComparacion", "denominador del grupo de comparación"],
  ];
  for (const [field, label] of numeric) {
    const v = draft[field];
    if (v !== null && v !== undefined && (!isNumber(v) || v < 0)) {
      add({ code: "V02", level: "error", field, message: `El ${label} debe ser un número mayor o igual a cero.` });
    }
  }

  if (needsDen && isNumber(draft.numerador) && isNumber(draft.denominador)) {
    if (draft.denominador <= 0) {
      add({ code: "V03", level: "error", field: "denominador", message: "El denominador debe ser mayor que cero." });
    } else if (!sheet.admiteMayorQueUno && draft.numerador > draft.denominador) {
      add({ code: "V03", level: "error", field: "numerador", message: `El numerador (${fmt(draft.numerador)}) no puede ser mayor que el denominador (${fmt(draft.denominador)}).` });
    }
  }

  const value = computedValue(indicator, draft);
  if (sheet.rango && isNumber(value) && (value < sheet.rango[0] || value > sheet.rango[1])) {
    add({ code: "V04", level: "error", field: "valor", message: `El valor debe estar entre ${fmt(sheet.rango[0])} y ${fmt(sheet.rango[1])}.` });
  }

  const change = variation(value, context.previous?.value);
  if (change !== null && Math.abs(change) > sheet.umbral && !draft.justificacion.trim()) {
    add({ code: "V05", level: "error", field: "justificacion", message: `El valor cambió ${fmt(change)} % frente a ${context.previous?.period}. Explique la variación.` });
  }

  if (context.sending && sheet.evidencia?.obligatoria && draft.evidencias.length === 0) {
    add({ code: "V07", level: "error", field: "evidencias", message: "Este indicador exige evidencia: adjunte un archivo o un enlace." });
  }

  if (sheet.tipo === "comparacion" && (draft.numComparacion == null || draft.denComparacion == null)) {
    add({ code: "V08", level: "error", field: "numComparacion", message: "Registre también el grupo de comparación." });
  }

  for (const ev of draft.evidencias) {
    if (ev.url !== undefined && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(ev.url)) {
      add({ code: "V09", level: "error", field: "evidencias", message: "El enlace de evidencia no es una URL válida." });
      break;
    }
  }

  if (sheet.nMinimo && isNumber(draft.n) && draft.n < sheet.nMinimo) {
    add({ code: "V10", level: "alerta", field: "n", message: `Solo hay ${draft.n} respuestas; el mínimo recomendado es ${sheet.nMinimo}.` });
  }

  if (isNumber(context.masterDenominator) && isNumber(draft.denominador) && draft.denominador !== context.masterDenominator) {
    add({ code: "V11", level: "alerta", field: "denominador", message: `El denominador (${fmt(draft.denominador)}) difiere del dato maestro (${fmt(context.masterDenominator)}).` });
  }

  return issues;
}

/** Solo lo que sirve para decidir: ¿hay algo que bloquee? */
export const blocking = (issues: Issue[]) => issues.filter((i) => i.level === "error");

export const emptyDraft = (): Draft => ({
  numerador: null,
  denominador: null,
  n: null,
  numComparacion: null,
  denComparacion: null,
  noAplica: null,
  confirma: null,
  justificacion: "",
  evidencias: [],
});
