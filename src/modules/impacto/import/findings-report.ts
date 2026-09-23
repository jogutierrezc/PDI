/* =============================================================================
   Reporte de hallazgos del importador: hoja, fila, columna, tipo, valor y
   sugerencia. En Excel (con una hoja de resumen por tipo) o en CSV.
   ========================================================================== */

import type { Workbook } from "exceljs";
import { FINDING_LABEL, countFindings } from "./matrix";
import type { Finding } from "./matrix";

/** Marca de orden de bytes: Excel en español la necesita para leer bien las tildes de un CSV. */
const BOM = String.fromCharCode(0xfeff);

const HEADERS = ["Hoja", "Fila", "Columna", "Tipo de hallazgo", "Valor encontrado", "Sugerencia"] as const;

const row = (f: Finding) => [f.sheet, f.row ?? "", f.column ?? "", FINDING_LABEL[f.kind], f.value, f.suggestion];

/** CSV con separador «;» y BOM, que es como lo abre bien Excel en español. */
export function findingsToCsv(findings: Finding[]): string {
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = [HEADERS, ...findings.map(row)].map((r) => r.map(escape).join(";")).join("\r\n");
  return `${BOM}${body}\r\n`;
}

/** Libro de Excel: hoja «Hallazgos» con filtros y hoja «Resumen» por tipo. */
export async function findingsToWorkbook(findings: Finding[], source: string): Promise<Workbook> {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Planeación Institucional · UDES";
  book.created = new Date();

  const sheet = book.addWorksheet("Hallazgos", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: HEADERS[0], width: 20 },
    { header: HEADERS[1], width: 8 },
    { header: HEADERS[2], width: 10 },
    { header: HEADERS[3], width: 34 },
    { header: HEADERS[4], width: 48 },
    { header: HEADERS[5], width: 70 },
  ];
  findings.forEach((f) => sheet.addRow(row(f)));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2D63" } };
  sheet.autoFilter = { from: "A1", to: "F1" };
  sheet.eachRow((r, n) => {
    if (n > 1) r.alignment = { vertical: "top", wrapText: true };
  });

  const summary = book.addWorksheet("Resumen");
  summary.columns = [
    { header: "Tipo de hallazgo", width: 40 },
    { header: "Cantidad", width: 12 },
  ];
  Object.entries(countFindings(findings))
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .forEach(([kind, n]) => summary.addRow([FINDING_LABEL[kind as keyof typeof FINDING_LABEL], n]));
  summary.addRow([]);
  summary.addRow(["Archivo", source]);
  summary.addRow(["Generado", new Date().toLocaleString("es-CO")]);
  summary.getRow(1).font = { bold: true };
  return book;
}
