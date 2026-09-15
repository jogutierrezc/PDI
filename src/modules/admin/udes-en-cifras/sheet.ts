/* =============================================================================
   UDES en Cifras · números, pegado y plantillas.

   Quien carga cifras las trae de Excel en español: "1.234,5" es mil
   doscientos treinta y cuatro coma cinco. Aquí se interpreta así, y también
   el formato con punto decimal que exportan otros sistemas cuando no hay
   ambigüedad ("1234.5").
   ========================================================================== */

export type Parsed = { ok: true; value: number | null } | { ok: false; reason: string };

export function parseNumber(raw: string): Parsed {
  const text = raw.trim().replace(/\s|%/g, "");
  if (text === "" || text === "—" || text === "-") return { ok: true, value: null };
  let normalized = text;
  if (text.includes(",")) {
    // Coma decimal: los puntos son de miles.
    normalized = text.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    // "12.345" sin coma: punto de miles.
    normalized = text.replace(/\./g, "");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, reason: `"${raw.trim()}" no es un número` };
  if (value < 0) return { ok: false, reason: "No se admiten valores negativos" };
  return { ok: true, value };
}

/** Texto editable de un número: sin separador de miles, coma decimal. */
export function editableText(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(".", ",");
}

/** Filas y columnas de lo que se pegó desde una hoja de cálculo. */
export function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r/g, "")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line.split("\t"));
}

/* --- CSV ------------------------------------------------------------------- */

export function detectSeparator(headerLine: string): string {
  const counts = [";", "\t", ","].map((sep) => [sep, headerLine.split(sep).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** Lector CSV con comillas: suficiente para lo que exporta Excel. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r/g, "");
  const firstLine = clean.split("\n")[0] ?? "";
  const sep = detectSeparator(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function toCsv(rows: (string | number | null)[][]): string {
  const escape = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${rows.map((r) => r.map(escape).join(";")).join("\n")}`;
}
