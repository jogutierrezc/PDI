/* =============================================================================
   Importar una plantilla diligenciada.

   Tres pasos, en este orden, y cada uno puede rechazar:
     1. Estructura: están las cuatro hojas, REGISTROS conserva sus columnas y
        CONTROL sus campos. Si no, se rechaza el archivo completo.
     2. Firma: la base recalcula la huella (imp_verify_template). Plantilla
        alterada, de otro programa, periodo cerrado o catálogo no vigente:
        se rechaza el archivo completo, con el motivo.
     3. Filas: cada una se valida con el mismo servicio de la captura en
        línea (validate.ts) y se clasifica para la vista previa.

   REGLAS
     · Una celda vacía NO borra un valor existente: solo se aplica lo escrito.
     · Solo se modifican registros en borrador o devueltos al programa; los
       demás quedan «omitidos».
     · Conflicto: el registro cambió en línea después de generar la plantilla
       y el Excel trae otro valor. Quien importa elige qué conservar.
     · La evidencia obligatoria (V07) se exige al enviar, no al importar: los
       archivos se suben después en el sistema.
   ========================================================================== */

import type { Workbook } from "exceljs";
import { draftOf, editable, indicatorOf } from "../data/capture-db";
import type { CaptureRow } from "../data/capture-db";
import { validate } from "../data/validate";
import type { Issue } from "../data/validate";
import { writeCell } from "../capture/sheet-model";
import type { ColumnKey, SheetDraft } from "../capture/sheet-model";
import { cellText, oneLine } from "../import/matrix";
import { CONTROL_KEYS, LETTER_OF, SHEET, TEMPLATE_COLUMNS } from "./template";

export interface TemplateControl {
  templateId: string;
  programId: string;
  periodId: string;
  catalogVersionId: string;
  generatedAt: string;
  assignmentIds: string[];
  signature: string;
}

export interface ParsedRow {
  rowNumber: number;
  assignmentId: string;
  /** Solo las celdas editables con algo escrito. */
  cells: Partial<Record<ColumnKey, string>>;
}

export interface ReadResult {
  control: TemplateControl | null;
  rows: ParsedRow[];
  /** Si hay algo aquí, el archivo se rechaza completo. */
  structure: string[];
}

export type RowStatus = "nueva" | "actualizada" | "sin_cambio" | "omitida" | "error" | "conflicto";

export const STATUS_LABEL: Record<RowStatus, string> = {
  nueva: "Nuevas",
  actualizada: "Actualizadas",
  sin_cambio: "Sin cambio",
  omitida: "Omitidas",
  error: "Con error",
  conflicto: "En conflicto",
};

/** Los campos de la base que se escriben desde cada columna. */
const FIELD_OF: Partial<Record<ColumnKey, string>> = {
  numerator: "numerator",
  denominator: "denominator",
  n: "n_responses",
  numComparison: "num_comparison",
  denComparison: "den_comparison",
  confirm: "confirms_preloaded",
  noData: "no_data",
  justification: "justification",
  observations: "observations",
  evidenceUrl: "evidence_url",
};

export interface PreviewRow {
  rowNumber: number;
  record: CaptureRow | null;
  status: RowStatus;
  /** Lo que quedaría en el registro si se carga la fila. */
  draft: SheetDraft | null;
  /** Campos de la base que la fila cambia, con su valor nuevo. */
  fields: Record<string, unknown>;
  errors: { column: string | null; message: string }[];
  warnings: string[];
}

/* --- 1. Estructura ---------------------------------------------------------------- */

export function readTemplate(book: Workbook): ReadResult {
  const structure: string[] = [];
  for (const name of Object.values(SHEET)) {
    if (!book.getWorksheet(name)) structure.push(`Falta la hoja ${name}.`);
  }
  const records = book.getWorksheet(SHEET.records);
  const controlSheet = book.getWorksheet(SHEET.control);
  if (!records || !controlSheet) return { control: null, rows: [], structure };

  const header = records.getRow(1);
  TEMPLATE_COLUMNS.forEach((c, i) => {
    const found = oneLine(cellText(header.getCell(i + 1).value));
    if (found !== c.header) structure.push(`La columna ${c.letter} de REGISTROS debía llamarse «${c.header}» y dice «${found || "(vacía)"}».`);
  });
  const extra = oneLine(cellText(header.getCell(TEMPLATE_COLUMNS.length + 1).value));
  if (extra && extra !== "Errores") structure.push(`REGISTROS tiene una columna de más («${extra}»): no agregue ni quite columnas.`);

  const map = new Map<string, string>();
  controlSheet.eachRow((row) => map.set(oneLine(cellText(row.getCell(1).value)), oneLine(cellText(row.getCell(2).value))));
  const missing = CONTROL_KEYS.filter((k) => !map.get(k));
  if (missing.length) structure.push(`La hoja CONTROL fue modificada: faltan ${missing.join(", ")}.`);

  const control: TemplateControl | null = missing.length
    ? null
    : {
        templateId: map.get("id_plantilla")!,
        programId: map.get("programa_id")!,
        periodId: map.get("periodo_id")!,
        catalogVersionId: map.get("version_catalogo_id")!,
        generatedAt: map.get("generada_en")!,
        assignmentIds: map.get("asignaciones")!.split(",").map((s) => s.trim()).filter(Boolean),
        signature: map.get("huella")!,
      };

  const rows: ParsedRow[] = [];
  records.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const assignmentId = oneLine(cellText(row.getCell(1).value));
    if (!assignmentId) return;
    const cells: ParsedRow["cells"] = {};
    TEMPLATE_COLUMNS.forEach((c, i) => {
      if (!c.key) return;
      const value = row.getCell(i + 1).value;
      // Un número de Excel llega con punto decimal; la hoja entiende coma decimal
      // y punto de miles, así que se pasa a coma para no leer 0.125 como 125.
      const text = (typeof value === "number" ? String(value).replace(".", ",") : cellText(value)).trim();
      if (text) cells[c.key] = text;
    });
    rows.push({ rowNumber, assignmentId, cells });
  });
  if (control) {
    const known = new Set(control.assignmentIds);
    const stray = rows.filter((r) => !known.has(r.assignmentId));
    if (stray.length) structure.push(`REGISTROS tiene ${stray.length} filas que no son de esta plantilla (filas ${stray.map((r) => r.rowNumber).join(", ")}).`);
  }
  return { control, rows, structure };
}

/* --- 3. Filas ------------------------------------------------------------------------ */

const LETTER_OF_FIELD: Partial<Record<Issue["field"], string>> = {
  numerador: "J",
  valor: "J",
  denominador: "K",
  n: "L",
  numComparacion: "M",
  denComparacion: "N",
  confirma: "O",
  noAplica: "P",
  justificacion: "Q",
  evidencias: "S",
};

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9);

/** El valor de un campo de la base en un borrador, para comparar y enviar. */
function fieldValue(draft: SheetDraft, key: ColumnKey): unknown {
  switch (key) {
    case "numerator":
      return draft.numerador;
    case "denominator":
      return draft.denominador;
    case "n":
      return draft.n;
    case "numComparison":
      return draft.numComparacion;
    case "denComparison":
      return draft.denComparacion;
    case "confirm":
      return draft.confirma;
    case "noData":
      return draft.noAplica;
    case "justification":
      return draft.justificacion;
    case "observations":
      return draft.observations;
    case "evidenceUrl":
      return draft.evidenceUrl || null;
    default:
      return null;
  }
}

const hasData = (r: CaptureRow) =>
  r.numerator !== null || r.denominator !== null || r.n_responses !== null || r.no_data !== null || Boolean(r.justification?.trim());

/**
 * Clasifica cada fila frente a lo que hay hoy en la base. `generatedAt` es la
 * fecha de la plantilla: un registro guardado después, con otro valor, está
 * en conflicto.
 */
export function classify(parsed: ParsedRow[], current: CaptureRow[], generatedAt: string): PreviewRow[] {
  const byAssignment = new Map(current.map((r) => [r.assignment_id, r]));
  const generated = new Date(generatedAt).getTime();

  return parsed.map((p) => {
    const record = byAssignment.get(p.assignmentId) ?? null;
    if (!record) {
      return {
        rowNumber: p.rowNumber,
        record,
        status: "error" as const,
        draft: null,
        fields: {},
        errors: [{ column: "A", message: `Fila ${p.rowNumber}: la asignación ya no está activa para el programa.` }],
        warnings: [],
      };
    }
    const base: SheetDraft = { ...draftOf(record), observations: record.observations ?? "", evidenceUrl: "" };
    let draft = base;
    const errors: PreviewRow["errors"] = [];
    for (const [key, raw] of Object.entries(p.cells) as [ColumnKey, string][]) {
      const result = writeCell(draft, key, raw);
      if ("error" in result) errors.push({ column: LETTER_OF[key] ?? null, message: `Fila ${p.rowNumber}, columna ${LETTER_OF[key]}: ${result.error}` });
      else draft = result.draft;
    }

    const fields: Record<string, unknown> = {};
    for (const key of Object.keys(p.cells) as ColumnKey[]) {
      const now = fieldValue(draft, key);
      if (!same(now, fieldValue(base, key))) fields[FIELD_OF[key]!] = now;
    }
    const changed = Object.keys(fields).length > 0;

    if (!editable(record.state) || record.period_state !== "abierto") {
      return { rowNumber: p.rowNumber, record, status: "omitida" as const, draft, fields: {}, errors: [], warnings: changed ? ["El registro ya no es editable: la fila no se carga."] : [] };
    }
    if (errors.length) return { rowNumber: p.rowNumber, record, status: "error" as const, draft, fields, errors, warnings: [] };
    if (!changed) return { rowNumber: p.rowNumber, record, status: "sin_cambio" as const, draft, fields, errors: [], warnings: [] };

    // El mismo servicio de la captura en línea, con el prefijo de la fila y
    // la columna. La evidencia se exige al enviar, no aquí.
    const evidence = draft.evidenceUrl ? [...draft.evidencias, { nombre: draft.evidenceUrl, url: draft.evidenceUrl }] : draft.evidencias;
    const issues = validate(indicatorOf(record), { ...draft, evidencias: evidence }, {
      sending: false,
      previous: record.previous_period ? { period: record.previous_period, value: record.previous_value === null ? null : Number(record.previous_value) } : undefined,
    });
    for (const issue of issues) {
      const letter = LETTER_OF_FIELD[issue.field] ?? null;
      const message = `Fila ${p.rowNumber}${letter ? `, columna ${letter}` : ""}: ${issue.message}`;
      if (issue.level === "error") errors.push({ column: letter, message });
    }
    const warnings = issues
      .filter((i) => i.level === "alerta")
      .map((i) => `Fila ${p.rowNumber}${LETTER_OF_FIELD[i.field] ? `, columna ${LETTER_OF_FIELD[i.field]}` : ""}: ${i.message}`);
    if (errors.length) return { rowNumber: p.rowNumber, record, status: "error" as const, draft, fields, errors, warnings };

    const conflict = new Date(record.updated_at).getTime() > generated && hasData(record);
    return {
      rowNumber: p.rowNumber,
      record,
      status: conflict ? ("conflicto" as const) : hasData(record) ? ("actualizada" as const) : ("nueva" as const),
      draft,
      fields,
      errors,
      warnings,
    };
  });
}

export function countByStatus(rows: PreviewRow[]): Record<RowStatus, number> {
  const out: Record<RowStatus, number> = { nueva: 0, actualizada: 0, sin_cambio: 0, omitida: 0, error: 0, conflicto: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}

/**
 * Lo que se manda a imp_import_template: las filas nuevas y actualizadas, y
 * las en conflicto donde quien importa eligió el valor del Excel.
 */
export function payloadOf(rows: PreviewRow[], keepExcel: Set<number>) {
  return rows
    .filter((r) => r.record && (r.status === "nueva" || r.status === "actualizada" || (r.status === "conflicto" && keepExcel.has(r.rowNumber))))
    .map((r) => ({ row: r.rowNumber, recordId: r.record!.id, fields: r.fields }));
}

/* --- La misma plantilla, de vuelta con sus errores ------------------------------------------ */

/** Agrega la columna «Errores» y pinta de rojo las celdas con error. */
export function annotate(book: Workbook, rows: PreviewRow[]) {
  const sheet = book.getWorksheet(SHEET.records);
  if (!sheet) return book;
  const col = TEMPLATE_COLUMNS.length + 1;
  const head = sheet.getRow(1).getCell(col);
  head.value = "Errores";
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB42318" } };
  sheet.getColumn(col).width = 70;
  const byRow = new Map(rows.map((r) => [r.rowNumber, r]));
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const p = byRow.get(n);
    const cell = row.getCell(col);
    cell.value = p && p.errors.length ? p.errors.map((e) => e.message).join("\n") : null;
    cell.alignment = { wrapText: true, vertical: "top" };
    for (const e of p?.errors ?? []) {
      if (!e.column) continue;
      const target = row.getCell(e.column);
      target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8D7DA" } };
      target.font = { color: { argb: "FFB42318" }, bold: true };
    }
  });
  return book;
}
