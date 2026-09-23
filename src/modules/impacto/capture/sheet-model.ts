/* =============================================================================
   Modo hoja de cálculo · la lógica, sin interfaz.

   Las columnas son las mismas de la plantilla Excel (fase 6), para que
   trabajar en línea y en el archivo se sienta igual. Qué celda se edita
   depende del tipo del indicador y del estado del registro, con las mismas
   reglas de la ficha: lo que no aplica al tipo se ve en gris y no se toca.

   Pegar desde Excel reparte el bloque copiado desde la celda activa hacia la
   derecha y hacia abajo, y salta las celdas bloqueadas sin romper nada.
   ========================================================================== */

import { editable } from "../data/capture-db";
import type { CaptureRow } from "../data/capture-db";
import { parseNumber } from "../import/matrix";
import type { Draft, NoData } from "../data/validate";

export type ColumnKey =
  | "code"
  | "name"
  | "campus"
  | "type"
  | "numerator"
  | "denominator"
  | "n"
  | "numComparison"
  | "denComparison"
  | "confirm"
  | "noData"
  | "justification"
  | "observations"
  | "evidenceUrl"
  | "value"
  | "state";

export interface Column {
  key: ColumnKey;
  label: string;
  width: number;
  /** Numérica: alineada a la derecha y con cifras tabulares. */
  numeric?: boolean;
  choices?: readonly string[];
}

export const COLUMNS: Column[] = [
  { key: "code", label: "Código", width: 70 },
  { key: "name", label: "Indicador", width: 280 },
  { key: "campus", label: "Sede", width: 110 },
  { key: "type", label: "Tipo", width: 100 },
  { key: "numerator", label: "Numerador o valor", width: 120, numeric: true },
  { key: "denominator", label: "Denominador", width: 110, numeric: true },
  { key: "n", label: "n respuestas", width: 100, numeric: true },
  { key: "numComparison", label: "Num. grupo comparación", width: 130, numeric: true },
  { key: "denComparison", label: "Den. grupo comparación", width: 130, numeric: true },
  { key: "confirm", label: "Confirma precargado", width: 120, choices: ["", "Sí", "No"] },
  { key: "noData", label: "No aplica / Sin dato", width: 130, choices: ["", "No aplica", "Sin dato"] },
  { key: "justification", label: "Justificación", width: 240 },
  { key: "observations", label: "Observaciones", width: 200 },
  { key: "evidenceUrl", label: "Enlace de evidencia", width: 200 },
  { key: "value", label: "Valor calculado", width: 110, numeric: true },
  { key: "state", label: "Estado", width: 130 },
];

export const EDITABLE_KEYS: ColumnKey[] = [
  "numerator",
  "denominator",
  "n",
  "numComparison",
  "denComparison",
  "confirm",
  "noData",
  "justification",
  "observations",
  "evidenceUrl",
];

export interface SheetDraft extends Draft {
  observations: string;
  evidenceUrl: string;
}

/** ¿Se escribe en esta celda? Mismas reglas que la ficha de captura. */
export function isEditable(row: CaptureRow, draft: SheetDraft, key: ColumnKey): boolean {
  if (!editable(row.state) || row.period_state !== "abierto") return false;
  if (!EDITABLE_KEYS.includes(key)) return false;
  const locked = Boolean(draft.noAplica) || (row.capture_mode === "precargado" && draft.confirma !== false);
  const ratio = row.calc_type === "razon" || row.calc_type === "comparacion";
  switch (key) {
    case "numerator":
      return !locked;
    case "denominator":
      return ratio && !locked;
    case "n":
      return row.calc_type === "puntaje" && !locked;
    case "numComparison":
    case "denComparison":
      return row.calc_type === "comparacion" && !locked;
    case "confirm":
      return row.capture_mode === "precargado" && !draft.noAplica;
    default:
      return true;
  }
}

/** Lo que muestra una celda. */
export function display(draft: SheetDraft, key: ColumnKey): string {
  const n = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "" : v.toLocaleString("es-CO", { maximumFractionDigits: 4 }));
  switch (key) {
    case "numerator":
      return n(draft.numerador);
    case "denominator":
      return n(draft.denominador);
    case "n":
      return n(draft.n);
    case "numComparison":
      return n(draft.numComparacion);
    case "denComparison":
      return n(draft.denComparacion);
    case "confirm":
      return draft.confirma === true ? "Sí" : draft.confirma === false ? "No" : "";
    case "noData":
      return draft.noAplica === "no_aplica" ? "No aplica" : draft.noAplica === "sin_dato" ? "Sin dato" : "";
    case "justification":
      return draft.justificacion;
    case "observations":
      return draft.observations;
    case "evidenceUrl":
      return draft.evidenceUrl;
    default:
      return "";
  }
}

const norm = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/** Escribe un texto en una celda del borrador. Devuelve el borrador nuevo o el error de la celda. */
export function writeCell(draft: SheetDraft, key: ColumnKey, raw: string): { draft: SheetDraft } | { error: string } {
  const text = raw.trim();
  const number = (): number | null | "error" => {
    if (!text) return null;
    const cleaned = text.replace(/\.(?=\d{3}(\D|$))/g, ""); // 1.200 → 1200
    const v = parseNumber(cleaned);
    return v === null ? "error" : v;
  };
  const numeric = (field: "numerador" | "denominador" | "n" | "numComparacion" | "denComparacion") => {
    const v = number();
    if (v === "error") return { error: `«${text}» no es un número.` };
    return { draft: { ...draft, [field]: v } };
  };
  switch (key) {
    case "numerator":
      return numeric("numerador");
    case "denominator":
      return numeric("denominador");
    case "n":
      return numeric("n");
    case "numComparison":
      return numeric("numComparacion");
    case "denComparison":
      return numeric("denComparacion");
    case "confirm": {
      const v = norm(text);
      if (!v) return { draft: { ...draft, confirma: null } };
      if (["si", "s", "x", "confirmo"].includes(v)) return { draft: { ...draft, confirma: true } };
      if (["no", "n"].includes(v)) return { draft: { ...draft, confirma: false } };
      return { error: "Escriba «Sí» o «No»." };
    }
    case "noData": {
      const v = norm(text);
      let value: NoData = null;
      if (v === "no aplica" || v === "na" || v === "n/a") value = "no_aplica";
      else if (v === "sin dato" || v === "sd") value = "sin_dato";
      else if (v) return { error: "Escriba «No aplica», «Sin dato» o déjela vacía." };
      return { draft: { ...draft, noAplica: value } };
    }
    case "justification":
      return { draft: { ...draft, justificacion: raw } };
    case "observations":
      return { draft: { ...draft, observations: raw } };
    case "evidenceUrl":
      return { draft: { ...draft, evidenceUrl: text } };
    default:
      return { error: "Esta columna no se edita." };
  }
}

/** Texto del portapapeles (Excel copia en TSV) como matriz de celdas. */
export function parseClipboard(text: string): string[][] {
  const rows = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  return rows.map((r) => r.split("\t"));
}

export interface PasteResult {
  drafts: Map<string, SheetDraft>;
  written: number;
  skipped: number;
  errors: string[];
}

/**
 * Pega un bloque desde la celda (fila, columna) hacia la derecha y abajo,
 * sobre las columnas visibles. Las celdas bloqueadas se saltan y se cuentan.
 */
export function paste(
  rows: CaptureRow[],
  drafts: Map<string, SheetDraft>,
  columns: ColumnKey[],
  start: { row: number; col: number },
  block: string[][],
): PasteResult {
  const next = new Map(drafts);
  let written = 0;
  let skipped = 0;
  const errors: string[] = [];
  block.forEach((cells, dr) => {
    const row = rows[start.row + dr];
    if (!row) return;
    cells.forEach((raw, dc) => {
      const key = columns[start.col + dc];
      if (!key) return;
      const current = next.get(row.id)!;
      if (!isEditable(row, current, key)) {
        if (raw.trim()) skipped += 1;
        return;
      }
      const result = writeCell(current, key, raw);
      if ("error" in result) errors.push(`${row.code}${row.campus_name ? ` · ${row.campus_name}` : ""}, ${COLUMNS.find((c) => c.key === key)?.label}: ${result.error}`);
      else {
        next.set(row.id, result.draft);
        written += 1;
      }
    });
  });
  return { drafts: next, written, skipped, errors };
}
