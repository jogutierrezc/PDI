/* =============================================================================
   Archivo de valores precargados: CSV o Excel sencillo.

   Una fila por registro: indicador, programa (SNIES o código), sede (vacía
   si el indicador se reporta por programa), numerador, denominador y n. Los
   encabezados se reconocen sin importar tildes ni mayúsculas. Lo que no se
   entiende se devuelve como error de esa fila; la base valida el resto.
   ========================================================================== */

import type { Workbook } from "exceljs";
import { cellText, headerKey, parseNumber } from "./matrix";

export interface PreloadItem {
  row: number;
  indicator: string;
  program: string;
  campus: string;
  numerator: number | null;
  denominator: number | null;
  n: number | null;
}

export interface PreloadParse {
  items: PreloadItem[];
  errors: { row: number; message: string }[];
}

/** Marca de orden de bytes: Excel en español la necesita para leer bien las tildes de un CSV. */
const BOM = String.fromCharCode(0xfeff);

export const PRELOAD_HEADERS = ["indicador", "programa_snies", "programa", "sede", "numerador", "denominador", "n"] as const;

type Column = "indicator" | "program" | "campus" | "numerator" | "denominator" | "n" | "ignore";

function columnOf(header: string): Column | null {
  const h = headerKey(header);
  if (/^(INDICADOR|CODIGO|CODIGO INDICADOR)$/.test(h)) return "indicator";
  if (/^(PROGRAMA SNIES|PROGRAMA_SNIES|SNIES|CODIGO PROGRAMA)$/.test(h)) return "program";
  if (h === "PROGRAMA") return "ignore"; // el nombre ayuda a quien llena, pero se empareja por código
  if (/^(SEDE|CAMPUS)$/.test(h)) return "campus";
  if (/^(NUMERADOR|VALOR|PUNTAJE)$/.test(h)) return "numerator";
  if (h === "DENOMINADOR") return "denominator";
  if (/^(N|N RESPUESTAS|EVALUADOS)$/.test(h)) return "n";
  return null;
}

function build(rows: string[][]): PreloadParse {
  const errors: PreloadParse["errors"] = [];
  const items: PreloadItem[] = [];
  const [header, ...body] = rows;
  if (!header) return { items, errors: [{ row: 1, message: "El archivo está vacío." }] };
  const map = header.map((h) => columnOf(h));
  for (const needed of ["indicator", "program", "numerator"] as const) {
    if (!map.includes(needed)) {
      errors.push({ row: 1, message: `Falta la columna «${needed === "indicator" ? "indicador" : needed === "program" ? "programa_snies" : "numerador"}».` });
    }
  }
  if (errors.length) return { items, errors };

  body.forEach((cells, index) => {
    const row = index + 2;
    if (cells.every((c) => !c.trim())) return;
    const get = (col: Column) => cells[map.indexOf(col)]?.trim() ?? "";
    const number = (col: Column) => {
      const raw = get(col);
      if (!raw) return null;
      const n = parseNumber(raw);
      if (n === null) errors.push({ row, message: `«${raw}» no es un número (${col === "numerator" ? "numerador" : col === "denominator" ? "denominador" : "n"}).` });
      return n;
    };
    const item: PreloadItem = {
      row,
      indicator: get("indicator"),
      program: get("program"),
      campus: map.includes("campus") ? get("campus") : "",
      numerator: number("numerator"),
      denominator: map.includes("denominator") ? number("denominator") : null,
      n: map.includes("n") ? number("n") : null,
    };
    if (!item.indicator || !item.program) {
      errors.push({ row, message: "Faltan el indicador o el programa." });
      return;
    }
    items.push(item);
  });
  return { items, errors };
}

/** CSV separado por «;» o «,», con o sin BOM, con comillas. */
export function parsePreloadCsv(text: string): PreloadParse {
  const clean = (text.startsWith(BOM) ? text.slice(1) : text);
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return build(rows);
}

/** La primera hoja de un Excel. */
export function parsePreloadWorkbook(book: Workbook): PreloadParse {
  const sheet = book.worksheets[0];
  if (!sheet) return { items: [], errors: [{ row: 1, message: "El libro no tiene hojas." }] };
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (r) => {
    rows.push((r.values as unknown[]).slice(1).map((v) => cellText(v as never)));
  });
  return build(rows);
}

/** Plantilla CSV con una fila por registro precargado del periodo. */
export function preloadTemplate(rows: { indicator: string; snies: string; program: string; campus: string }[]): string {
  const escape = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [PRELOAD_HEADERS.join(";"), ...rows.map((r) => [r.indicator, r.snies, r.program, r.campus, "", "", ""].map(escape).join(";"))];
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
