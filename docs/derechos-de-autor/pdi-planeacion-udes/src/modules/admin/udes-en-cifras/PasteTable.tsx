/* =============================================================================
   Pegar una tabla completa.

   Quien ya tiene la tabla armada en Excel (categorías por año, o la matriz de
   un mapa de calor) no debería tener que escribir la estructura a mano y luego
   pegar las cifras. Aquí se pega la tabla entera, con sus encabezados:
   · primera fila: encabezados de columna (cortes o columnas de la matriz);
   · primera columna: rótulos de fila (categorías o filas de la matriz);
   · el resto: las cifras, en formato de Excel en español ("1.234,5").

   El componente solo lee y muestra la vista previa; cada captura decide qué
   significa la tabla (ver breakdownFromTable y heatmapFromTable) y qué hace al
   aplicarla.
   ========================================================================== */

import { useState } from "react";
import type { ClipboardEvent, ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { cutLabel } from "../../datos-abiertos/data/terms";
import type { OdTerm } from "../../../types/database";
import { parseClipboardGrid, parseCsv, parseNumber } from "./sheet";

export interface PastedTable {
  /** Encabezado de la primera columna ("Categoría", "Nivel"…). */
  corner: string;
  /** Encabezados de las columnas de cifras. */
  head: string[];
  rows: { label: string; cells: string[] }[];
}

/** Lee lo pegado: tabulado (Excel, Google Sheets) o CSV con ; o ,. Quita filas y columnas vacías de los bordes. */
export function parsePastedTable(text: string): PastedTable | null {
  const raw = text.includes("\t") ? parseClipboardGrid(text) : parseCsv(text);
  let grid = raw.map((row) => row.map((cell) => cell.trim()));
  grid = grid.filter((row) => row.some((cell) => cell !== ""));
  if (grid.length < 2) return null;
  const width = Math.max(...grid.map((row) => row.length));
  grid = grid.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ""));
  // Columnas vacías al final (Excel copia a veces una de más).
  let last = width - 1;
  while (last > 0 && grid.every((row) => row[last] === "")) last -= 1;
  grid = grid.map((row) => row.slice(0, last + 1));
  if (grid[0].length < 2) return null;
  const [header, ...body] = grid;
  return {
    corner: header[0],
    head: header.slice(1),
    rows: body.filter((row) => row[0] !== "").map((row) => ({ label: row[0], cells: row.slice(1) })),
  };
}

/* --- Desgloses -------------------------------------------------------------- */

/** Corte de un encabezado: "2024", "2024-1", "2024-2", "2024-A", "2024 (año)", "2024-anual". */
export function cutFromHeader(text: string): { year: number; term: OdTerm } | null {
  const clean = text.trim().toLowerCase().replace(/\s+/g, " ");
  let match = clean.match(/^(\d{4})$/);
  if (match) return { year: Number(match[1]), term: "anual" };
  match = clean.match(/^(\d{4}) ?[-–/ ] ?(1|2|a|b|i|ii|s1|s2)$/);
  if (match) return { year: Number(match[1]), term: ["1", "a", "i", "s1"].includes(match[2]) ? "A" : "B" };
  match = clean.match(/^(\d{4}) ?[-–(]? ?(anual|año|total)\)?$/);
  if (match) return { year: Number(match[1]), term: "anual" };
  return null;
}

export interface BreakdownPaste {
  labels: string[];
  /** Cifra por categoría y columna de la rejilla ("2024-A"). */
  values: { label: string; column: string; value: number | null }[];
  errors: string[];
  warnings: string[];
  /** La tabla venía con los cortes en filas y las categorías en columnas. */
  transposed: boolean;
}

/**
 * Tabla de un desglose: categorías en filas y cortes en columnas. Si los cortes
 * vienen en la primera columna (años hacia abajo), se gira.
 */
export function breakdownFromTable(
  table: PastedTable,
  { years, reporting, calculated }: { years: number[]; reporting: "periodo" | "anual"; calculated: boolean },
): BreakdownPaste {
  const headCuts = table.head.map(cutFromHeader);
  const rowCuts = table.rows.map((row) => cutFromHeader(row.label));
  const transposed = headCuts.every((c) => c === null) && rowCuts.length > 0 && rowCuts.every((c) => c !== null);
  // Normalizada: categorías en filas, cortes en columnas.
  const cuts = transposed ? rowCuts : headCuts;
  const categories = transposed ? table.head : table.rows.map((row) => row.label);
  const cellAt = (category: number, cut: number) => (transposed ? table.rows[cut]?.cells[category] : table.rows[category]?.cells[cut]) ?? "";

  const errors: string[] = [];
  const warnings: string[] = [];
  const values: BreakdownPaste["values"] = [];
  const labels = categories.map((label) => label.trim()).filter(Boolean);
  const duplicated = labels.filter((label, i) => labels.indexOf(label) !== i);
  if (duplicated.length) errors.push(`Categorías repetidas: ${Array.from(new Set(duplicated)).join(", ")}.`);

  const usable = cuts.map((cut, i) => {
    const name = (transposed ? table.rows[i]?.label : table.head[i]) ?? "";
    if (!cut) {
      errors.push(`"${name}" no es un corte: usa 2024, 2024-1 o 2024-2.`);
      return null;
    }
    if (!years.includes(cut.year)) {
      warnings.push(`${name}: ${cut.year} no es un año de este desglose; se ignora.`);
      return null;
    }
    if (reporting === "anual" && cut.term !== "anual") {
      errors.push(`${name}: este desglose se reporta por año, sin periodos 1 y 2.`);
      return null;
    }
    if (reporting === "periodo" && cut.term === "anual" && calculated) {
      warnings.push(`${name}: la cifra del año se calcula con los periodos 1 y 2; se ignora.`);
      return null;
    }
    return cut;
  });

  categories.forEach((label, c) => {
    if (!label.trim()) return;
    usable.forEach((cut, k) => {
      if (!cut) return;
      const parsed = parseNumber(cellAt(c, k));
      const where = `${label.trim()} · ${cut.term === "anual" ? cut.year : cutLabel(cut.year, cut.term)}`;
      if (!parsed.ok) errors.push(`${where}: ${parsed.reason}.`);
      else values.push({ label: label.trim(), column: `${cut.year}-${cut.term}`, value: parsed.value });
    });
  });
  if (!usable.some(Boolean)) errors.push("La tabla no trae ninguna columna de corte que se pueda cargar.");
  return { labels: Array.from(new Set(labels)), values, errors, warnings, transposed };
}

/* --- Mapas de calor ---------------------------------------------------------- */

export interface HeatmapPaste {
  rows: string[];
  columns: string[];
  values: (number | null)[][];
  errors: string[];
}

export function heatmapFromTable(table: PastedTable): HeatmapPaste {
  const errors: string[] = [];
  const rows = table.rows.map((row) => row.label);
  const columns = table.head.map((head, i) => head || `Columna ${i + 1}`);
  const repeated = (list: string[]) => Array.from(new Set(list.filter((x, i) => list.indexOf(x) !== i)));
  if (repeated(rows).length) errors.push(`Filas repetidas: ${repeated(rows).join(", ")}.`);
  if (repeated(columns).length) errors.push(`Columnas repetidas: ${repeated(columns).join(", ")}.`);
  const values = table.rows.map((row) =>
    columns.map((column, c) => {
      const parsed = parseNumber(row.cells[c] ?? "");
      if (!parsed.ok) {
        errors.push(`${row.label} · ${column}: ${parsed.reason}.`);
        return null;
      }
      return parsed.value;
    }),
  );
  return { rows, columns, values, errors };
}

/* --- Interfaz ----------------------------------------------------------------- */

export function PasteTable({
  hint,
  disabled = false,
  render,
}: {
  hint: ReactNode;
  disabled?: boolean;
  /** Vista previa y acciones para la tabla leída; `reset` limpia lo pegado. */
  render: (table: PastedTable, reset: () => void) => ReactNode;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const table = text ? parsePastedTable(text) : null;
  const reset = () => setText("");

  return (
    <details className="oda-paste" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <Icon name="table" size={15} /> Pegar una tabla completa
      </summary>
      <div className="oda-paste__body">
        <p className="oda-muted">{hint}</p>
        <textarea
          className="oda-paste__area"
          aria-label="Tabla copiada de Excel"
          placeholder={"Copia la tabla en Excel, con sus encabezados, y pégala aquí (Ctrl+V)."}
          value={text}
          disabled={disabled}
          rows={text ? 4 : 3}
          spellCheck={false}
          onPaste={(e: ClipboardEvent<HTMLTextAreaElement>) => {
            const pasted = e.clipboardData.getData("text/plain");
            if (!pasted) return;
            e.preventDefault();
            setText(pasted);
          }}
          onChange={(e) => setText(e.target.value)}
        />
        {text && !table && <p className="oda-paste__error">No se reconoce una tabla: hacen falta al menos una fila de encabezados, una fila de cifras y dos columnas.</p>}
        {table && render(table, reset)}
      </div>
    </details>
  );
}

/** Mensajes de la vista previa: errores bloquean, avisos no. */
export function PasteMessages({ errors, warnings = [] }: { errors: string[]; warnings?: string[] }) {
  if (!errors.length && !warnings.length) return null;
  const shown = (list: string[]) => [...list.slice(0, 6), ...(list.length > 6 ? [`Y ${list.length - 6} más.`] : [])];
  return (
    <div className="oda-paste__messages">
      {errors.length > 0 && (
        <ul className="oda-paste__error" role="alert">
          {shown(errors).map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="oda-paste__warning">
          {shown(warnings).map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
    </div>
  );
}
