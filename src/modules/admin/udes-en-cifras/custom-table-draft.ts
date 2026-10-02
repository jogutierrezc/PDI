/* =============================================================================
   UDES en Cifras · borrador de una tabla personalizada.

   Lo que la rejilla de la intranet edita (textos tal como se escriben) y cómo
   se convierte en lo que se guarda: las columnas y la vista del conjunto libre
   y sus filas (ver datos-abiertos/data/custom-table.ts). Aquí vive también el
   pegado desde Excel sobre el borrador.

   Módulo puro: la rejilla (CustomTableCapture.tsx) solo pinta y llama.
   ========================================================================== */

import {
  cellToneKey,
  customKind,
  decimalsOf,
  editText,
  isTone,
  MAX_COLUMNS,
  MAX_ROWS,
  manualTone,
  optionOf,
  parseLocalNumber,
  planPaste,
  readCell,
  ROW_TONE_KEY,
  rowTone,
  ruleProblems,
  unitOf,
} from "../../datos-abiertos/data/custom-table";
import type { CustomKind, CustomTable, ManualTone, PastePlan, ToneId, ToneRule } from "../../datos-abiertos/data/custom-table";
import type { FreeCell, FreeColumn, FreeRowKind, FreeView } from "../../datos-abiertos/data/free-sets";
import { slugify } from "../../datos-abiertos/data/slug";

export interface DraftRule {
  id: string;
  op: "menor" | "entre" | "mayor_igual";
  /** El valor (o el primero, en «entre»), como se escribe. */
  a: string;
  /** El segundo valor de «entre». */
  b: string;
  tone: ToneId;
}

export interface DraftColumn {
  /** Identidad en el borrador; la clave guardada (`key`) se asigna al guardar y no cambia después. */
  id: string;
  key: string;
  label: string;
  kind: CustomKind;
  decimals: number;
  unit: string;
  /** Categoría: los valores de la lista. */
  options: string[];
  /** Número: reglas por umbral, en orden. */
  rules: DraftRule[];
  /** Categoría: el tono de cada valor. */
  optionTones: Record<string, ToneId>;
}

export interface DraftRow {
  id: string;
  kind: FreeRowKind;
  /** Solo se conserva: una tabla personalizada no se filtra por año. */
  year: number | null;
  /** Texto de un título de grupo. */
  label: string;
  /** Texto de cada casilla, por id de columna. */
  cells: Record<string, string>;
  /** Color a mano por celda, por id de columna. */
  tones: Record<string, ManualTone>;
  /** Color a mano de toda la fila. */
  tone: ToneId | null;
}

export interface DraftMeta {
  title: string;
  description: string;
  cut: string;
  note: string;
  source: string;
  officeId: string;
  rowHeader: boolean;
  labels: Partial<Record<ToneId, string>>;
}

export interface Draft {
  meta: DraftMeta;
  columns: DraftColumn[];
  rows: DraftRow[];
}

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${(counter += 1)}`;

export const emptyColumn = (kind: CustomKind = "texto", label = ""): DraftColumn => ({
  id: newId("col"), key: "", label, kind, decimals: 0, unit: "", options: [], rules: [], optionTones: {},
});

export const emptyRow = (kind: FreeRowKind = "dato"): DraftRow => ({
  id: newId("fila"), kind, year: null, label: "", cells: {}, tones: {}, tone: null,
});

/** La tabla recién creada: una columna de texto y una de número, para empezar a escribir. */
export const STARTER_COLUMNS: FreeColumn[] = [
  { key: "concepto", label: "Concepto", kind: "texto" },
  { key: "valor", label: "Valor", kind: "cifra", format: "entero", decimals: 0 },
];

export const starterView = (title: string): FreeView => ({
  key: "tabla", title, type: "tabla", table: { cut: "", rowHeader: true },
});

/* --- De lo guardado al borrador ----------------------------------------------------- */

interface StoredRow {
  year: number | null;
  kind?: FreeRowKind;
  label?: string;
  cells: Record<string, FreeCell>;
}

export function draftOf(
  set: { title: string; description: string; office_id: string | null; columns: FreeColumn[] },
  view: FreeView | undefined,
  rows: StoredRow[],
): Draft {
  const table: Partial<CustomTable> = view?.table ?? {};
  const columns = set.columns.map((column): DraftColumn => {
    const kind = customKind(column);
    const rules = table.rules?.[column.key] ?? [];
    return {
      id: newId("col"),
      key: column.key,
      label: column.label,
      kind,
      decimals: kind === "numero" ? decimalsOf(column) : 0,
      unit: kind === "numero" ? unitOf(column) : "",
      options: [...(column.options ?? [])],
      rules: rules.flatMap((rule): DraftRule[] =>
        rule.op === "es"
          ? []
          : [{ id: newId("regla"), op: rule.op, a: editText(rule.op === "entre" ? rule.min : rule.value), b: rule.op === "entre" ? editText(rule.max) : "", tone: rule.tone }],
      ),
      optionTones: Object.fromEntries(rules.flatMap((rule) => (rule.op === "es" && isTone(rule.tone) ? [[rule.option, rule.tone]] : []))),
    };
  });
  return {
    meta: {
      title: view?.title || set.title,
      description: set.description ?? "",
      cut: table.cut ?? "",
      note: table.note ?? "",
      source: table.source ?? "",
      officeId: set.office_id ?? "",
      rowHeader: table.rowHeader ?? false,
      labels: { ...(table.labels ?? {}) },
    },
    columns,
    rows: rows.map((row): DraftRow => {
      const asRow = { year: row.year, kind: row.kind ?? "dato", label: row.label ?? "", cells: row.cells ?? {} };
      const tones: Record<string, ManualTone> = {};
      for (const column of columns) {
        const tone = manualTone(asRow, column.key);
        if (tone) tones[column.id] = tone;
      }
      return {
        id: newId("fila"),
        kind: asRow.kind,
        year: row.year,
        label: asRow.kind === "grupo" ? asRow.label : "",
        cells: Object.fromEntries(columns.map((column) => [column.id, editText(asRow.cells[column.key])])),
        tones,
        tone: rowTone(asRow),
      };
    }),
  };
}

/* --- Del borrador a lo que se guarda -------------------------------------------------- */

/** La columna como se guarda. Con `key` vacía sirve para leer casillas antes de tener clave. */
export function toColumn(column: DraftColumn, key = column.key): FreeColumn {
  const label = column.label.trim();
  if (column.kind === "numero") {
    const unit = column.unit.trim();
    const decimals = Math.max(0, Math.min(4, Math.round(column.decimals) || 0));
    return { key, label, kind: "cifra", format: unit === "%" ? "porcentaje" : decimals ? "decimal" : "entero", decimals, ...(unit ? { unit } : {}) };
  }
  if (column.kind === "categoria") return { key, label, kind: "texto", options: cleanOptions(column.options) };
  return { key, label, kind: "texto" };
}

export const cleanOptions = (options: string[]): string[] => {
  const seen = new Set<string>();
  return options
    .map((option) => option.trim())
    .filter((option) => {
      const id = option.toLowerCase();
      if (!option || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
};

function toRules(column: DraftColumn, stored: FreeColumn): ToneRule[] {
  if (column.kind === "numero") {
    const read = (text: string) => {
      const parsed = parseLocalNumber(text);
      return parsed.ok && parsed.value !== null ? parsed.value : Number.NaN;
    };
    return column.rules.map((rule): ToneRule =>
      rule.op === "entre" ? { op: "entre", min: read(rule.a), max: read(rule.b), tone: rule.tone } : { op: rule.op, value: read(rule.a), tone: rule.tone },
    );
  }
  if (column.kind === "categoria") {
    return (stored.options ?? []).flatMap((option): ToneRule[] => {
      const tone = Object.entries(column.optionTones).find(([name]) => optionOf(stored, name) === option)?.[1];
      return tone && isTone(tone) ? [{ op: "es", option, tone }] : [];
    });
  }
  return [];
}

const uniqueKey = (text: string, taken: Set<string>) => {
  const base = slugify(text) || "columna";
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}-${n}`;
  taken.add(key);
  return key;
};

/** Una fila de datos sin nada escrito ni coloreado: no se guarda. */
export const isBlankRow = (row: DraftRow) =>
  row.kind === "dato" && !row.tone && Object.values(row.cells).every((text) => !text.trim()) && Object.keys(row.tones).length === 0;

export interface DraftOutput {
  columns: FreeColumn[];
  view: FreeView;
  rows: { year: number | null; kind: FreeRowKind; label: string; cells: Record<string, FreeCell> }[];
  /** Lo que impide guardar, en palabras. */
  errors: string[];
  /** Celdas que no se pudieron leer: «<id de fila>|<id de columna>» → motivo. */
  cellErrors: Map<string, string>;
}

/**
 * Lo que se guardaría ahora mismo. `viewKey` es la clave de la vista que ya
 * existe; `reserved`, claves que no se pueden reusar (las de columnas quitadas
 * cuyas casillas siguen en filas guardadas no importan: las filas se reemplazan).
 */
export function buildOutput(draft: Draft, viewKey = "tabla"): DraftOutput {
  const errors: string[] = [];
  const cellErrors = new Map<string, string>();
  const meta = draft.meta;

  const taken = new Set(draft.columns.map((column) => column.key).filter(Boolean));
  const columns = draft.columns.map((column) => toColumn(column, column.key || uniqueKey(column.label, taken)));

  if (!meta.title.trim()) errors.push("Ponle un título a la tabla.");
  if (!meta.cut.trim()) errors.push("Escribe el corte o periodo de la tabla: una cifra sin corte no se publica.");
  if (!columns.length) errors.push("La tabla necesita al menos una columna.");
  if (columns.length > MAX_COLUMNS) errors.push(`La tabla admite hasta ${MAX_COLUMNS} columnas; tiene ${columns.length}.`);
  draft.columns.forEach((column, index) => {
    if (!column.label.trim()) errors.push(`La columna ${index + 1} necesita un nombre.`);
    if (column.kind === "categoria" && cleanOptions(column.options).length === 0) {
      errors.push(`«${column.label.trim() || `Columna ${index + 1}`}» es de categoría: escribe al menos un valor en su lista.`);
    }
  });

  const rules: Record<string, ToneRule[]> = {};
  draft.columns.forEach((column, index) => {
    const list = toRules(column, columns[index]);
    if (!list.length) return;
    rules[columns[index].key] = list;
    errors.push(...ruleProblems(columns[index], list));
  });

  const kept = draft.rows.filter((row) => !isBlankRow(row));
  if (kept.length > MAX_ROWS) errors.push(`La tabla admite hasta ${MAX_ROWS} filas; tiene ${kept.length}.`);

  const rows = kept.map((row) => {
    const number = draft.rows.indexOf(row) + 1;
    if (row.kind === "grupo") {
      if (!row.label.trim()) errors.push(`Fila ${number}: un título necesita su texto.`);
      return { year: row.year, kind: row.kind, label: row.label.trim(), cells: {} as Record<string, FreeCell> };
    }
    const cells: Record<string, FreeCell> = {};
    draft.columns.forEach((column, index) => {
      const stored = columns[index];
      const read = readCell(stored, row.cells[column.id] ?? "");
      if (read.error) {
        cellErrors.set(`${row.id}|${column.id}`, read.error);
        errors.push(`Fila ${number} · ${stored.label || `columna ${index + 1}`}: ${read.error}.`);
      }
      cells[stored.key] = read.value;
      const tone = row.tones[column.id];
      if (tone) cells[cellToneKey(stored.key)] = tone;
    });
    if (row.tone) cells[ROW_TONE_KEY] = row.tone;
    // El rótulo del total lo usa el editor genérico de conjuntos; aquí el total es lo escrito en sus casillas.
    const label = row.kind === "total" ? columns.map((c) => cells[c.key]).find((v): v is string => typeof v === "string" && v !== "") ?? "Total" : "";
    return { year: row.year, kind: row.kind, label, cells };
  });

  const labels = Object.fromEntries(Object.entries(meta.labels).filter(([tone, text]) => isTone(tone) && text?.trim()).map(([tone, text]) => [tone, text!.trim()]));
  const table: CustomTable = {
    cut: meta.cut.trim(),
    ...(meta.note.trim() ? { note: meta.note.trim() } : {}),
    ...(meta.source.trim() ? { source: meta.source.trim() } : {}),
    rowHeader: meta.rowHeader,
    ...(Object.keys(rules).length ? { rules } : {}),
    ...(Object.keys(labels).length ? { labels } : {}),
  };
  const view: FreeView = { key: viewKey, title: meta.title.trim(), type: "tabla", table };
  return { columns, view, rows, errors, cellErrors };
}

/* --- Pegar desde Excel sobre el borrador ----------------------------------------------- */

export interface PasteRequest {
  grid: string[][];
  /** Fila y columna del borrador donde cae la primera celda pegada. */
  atRow: number;
  atColumn: number;
  /** La primera fila pegada trae los nombres de las columnas. */
  header: boolean;
  /** Reemplaza toda la tabla: columnas y filas salen de lo pegado. */
  replace: boolean;
}

/** ¿Parece que la primera fila son encabezados? Todo texto arriba y algún número debajo. */
export function looksLikeHeader(grid: string[][]): boolean {
  if (grid.length < 2) return false;
  const isNumber = (text: string) => {
    const parsed = parseLocalNumber(text);
    return parsed.ok && parsed.value !== null;
  };
  const head = grid[0].filter((cell) => cell.trim());
  return head.length > 0 && head.every((cell) => !isNumber(cell)) && grid.slice(1).some((line) => line.some(isNumber));
}

/** Las filas del borrador que reciben lo pegado: de `atRow` en adelante, saltando los títulos. */
const targetRows = (rows: DraftRow[], atRow: number, count: number): number[] => {
  const out: number[] = [];
  for (let index = atRow; out.length < count; index += 1) {
    if (index < rows.length && rows[index].kind === "grupo") continue;
    out.push(index);
  }
  return out;
};

/** Lo que enseña la vista previa: cómo se lee cada celda pegada y qué columnas se crean. */
export function previewPaste(draft: Draft, request: PasteRequest): PastePlan {
  const base = request.replace ? { columns: [] as DraftColumn[], rows: [] as DraftRow[] } : draft;
  return planPaste({
    columns: base.columns.map((column) => toColumn(column, column.id)),
    grid: request.grid,
    atRow: request.replace ? 0 : request.atRow,
    atColumn: request.replace ? 0 : request.atColumn,
    rowCount: base.rows.length,
    header: request.header,
  });
}

/** El borrador con lo pegado dentro. Nada se guarda: sigue siendo un borrador. */
export function applyPaste(draft: Draft, request: PasteRequest): Draft {
  const plan = previewPaste(draft, request);
  const atRow = request.replace ? 0 : request.atRow;
  const columns = request.replace ? [] : [...draft.columns];
  let rows = request.replace ? [] : [...draft.rows];

  plan.newColumns.forEach((guess, index) => {
    const position = columns.length;
    const offset = plan.targets.indexOf(position);
    const name = plan.headers?.[offset]?.trim() || `Columna ${position + 1}`;
    void index;
    columns.push({
      ...emptyColumn(guess.kind === "cifra" ? "numero" : "texto", name),
      decimals: guess.decimals ?? 0,
      unit: guess.unit ?? "",
    });
  });

  const where = targetRows(rows, atRow, plan.rows.length);
  plan.rows.forEach((line, lineIndex) => {
    const index = where[lineIndex];
    while (rows.length <= index) rows = [...rows, emptyRow()];
    const cells = { ...rows[index].cells };
    plan.targets.forEach((target, offset) => {
      const column = columns[target];
      if (column) cells[column.id] = line[offset]?.raw ?? "";
    });
    rows[index] = { ...rows[index], cells };
  });

  return { meta: draft.meta, columns, rows };
}
