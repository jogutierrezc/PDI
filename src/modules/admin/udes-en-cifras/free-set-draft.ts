/* =============================================================================
   UDES en Cifras · borrador de un conjunto libre.

   Quien crea un conjunto libre define su estructura mientras lo llena: el
   título, el tiempo, las columnas y las filas se editan en la misma rejilla
   (FreeSetEditor.tsx) y se guardan de una vez. Aquí vive lo que esa rejilla
   edita —textos tal como se escriben— y cómo se convierte en lo que se guarda.

   Tres reglas que este módulo sostiene:

   · El tipo orienta, no bloquea. Una casilla que no encaja con su columna (un
     texto en una cifra, una fecha rara, un territorio que no se reconoce) se
     guarda tal cual y se avisa: cuántas son y en qué filas. Lo único que
     impide guardar es lo que no tiene dónde guardarse: un conjunto sin título
     o sin columnas, una columna sin nombre, un año que no es un año.
   · La clave de una columna nace de su nombre y no cambia al renombrarla:
     enlaza las casillas guardadas y las gráficas.
   · Un total se escribe o se calcula, casilla por casilla: la que se deja
     vacía la calcula el portal (`freeTotalShown`), y por eso no se guarda.

   Lo que se pega desde Excel reutiliza la lectura de las tablas personalizadas
   (`parsePaste`, `guessColumn`, `parseLocalNumber`), sin su tope de 300 filas:
   un conjunto libre es una fuente de datos.

   Módulo puro: sin React ni Supabase.
   ========================================================================== */

import { editText, guessColumn, parseLocalNumber } from "../../datos-abiertos/data/custom-table";
import { freeTotalAt, territoryCode, viewColumnKeys, viewLostColumns, viewProblems } from "../../datos-abiertos/data/free-sets";
import type {
  FreeCell,
  FreeColumn,
  FreeColumnKind,
  FreeRow,
  FreeRowKind,
  FreeSet,
  FreeTemporality,
  FreeTerritory,
  FreeView,
} from "../../datos-abiertos/data/free-sets";
import { slugify } from "../../datos-abiertos/data/slug";
import type { ValueFormat } from "../../datos-abiertos/data/types";

export interface FreeDraftColumn {
  /** Identidad en el borrador; la clave guardada (`key`) se asigna al guardar y no cambia después. */
  id: string;
  key: string;
  label: string;
  kind: FreeColumnKind;
  /** Cifra: cómo se escribe y su unidad. Se conservan aunque la columna pase un rato por otro tipo. */
  format: ValueFormat;
  unit: string;
  /** Territorio: departamento o país. */
  territory: FreeTerritory;
  /** Lo que una tabla personalizada pudo dejar en la columna: se conserva sin editarlo. */
  decimals?: number;
  options?: string[];
}

export interface FreeDraftRow {
  id: string;
  kind: FreeRowKind;
  /** Texto del año. Si el conjunto no es anual se conserva el guardado, sin mostrarlo. */
  year: string;
  /** Texto del título de grupo o del total. */
  label: string;
  /** Texto de cada casilla, por id de columna. */
  cells: Record<string, string>;
}

export interface FreeDraftMeta {
  title: string;
  description: string;
  officeId: string;
  temporality: FreeTemporality;
  periodLabel: string;
}

export interface FreeDraft {
  meta: FreeDraftMeta;
  columns: FreeDraftColumn[];
  rows: FreeDraftRow[];
}

let counter = 0;
const newId = (prefix: string) => `${prefix}-libre-${(counter += 1)}`;

export const emptyFreeColumn = (kind: FreeColumnKind = "texto", label = ""): FreeDraftColumn => ({
  id: newId("col"), key: "", label, kind, format: "entero", unit: "", territory: "departamento",
});

export const emptyFreeRow = (kind: FreeRowKind = "dato"): FreeDraftRow => ({ id: newId("fila"), kind, year: "", label: "", cells: {} });

/**
 * El conjunto que todavía no existe. En blanco nace con una columna de texto y
 * una de cifra para empezar a escribir; para pegar desde Excel nace sin
 * columnas, que las trae lo pegado.
 */
export const blankFreeDraft = (start: "blanco" | "pegar" = "blanco"): FreeDraft => ({
  meta: { title: "", description: "", officeId: "", temporality: "sin_tiempo", periodLabel: "" },
  columns: start === "blanco" ? [emptyFreeColumn("texto", "Concepto"), emptyFreeColumn("cifra", "Valor")] : [],
  rows: start === "blanco" ? [emptyFreeRow(), emptyFreeRow(), emptyFreeRow()] : [],
});

/* --- De lo guardado al borrador ----------------------------------------------------- */

export interface StoredFreeRow {
  year: number | null;
  kind?: FreeRowKind;
  label?: string;
  cells: Record<string, FreeCell>;
}

export function freeDraftOf(
  set: { title: string; description: string; office_id: string | null; temporality: FreeTemporality; period_label: string; columns: FreeColumn[] },
  rows: StoredFreeRow[],
): FreeDraft {
  const columns = set.columns.map((column): FreeDraftColumn => ({
    id: newId("col"),
    key: column.key,
    label: column.label,
    kind: column.kind,
    format: column.format ?? "entero",
    unit: column.unit ?? "",
    territory: column.territory ?? "departamento",
    ...(typeof column.decimals === "number" ? { decimals: column.decimals } : {}),
    ...(Array.isArray(column.options) ? { options: column.options } : {}),
  }));
  return {
    meta: {
      title: set.title,
      description: set.description ?? "",
      officeId: set.office_id ?? "",
      temporality: set.temporality,
      periodLabel: set.period_label ?? "",
    },
    columns,
    rows: rows.map((row): FreeDraftRow => {
      const kind = row.kind ?? "dato";
      return {
        id: newId("fila"),
        kind,
        year: row.year === null || row.year === undefined ? "" : String(row.year),
        label: kind === "dato" ? "" : row.label ?? "",
        cells: kind === "grupo" ? {} : Object.fromEntries(columns.map((column) => [column.id, editText(row.cells?.[column.key])])),
      };
    }),
  };
}

/* --- Lectura permisiva de una casilla -------------------------------------------------- */

export interface FreeCellRead {
  value: FreeCell;
  /** La casilla no encaja con el tipo de su columna: se guarda tal cual y se avisa. Nunca bloquea. */
  warning?: string;
}

const ISO_DATE = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/;
const LOCAL_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** «2025-03-01» si el texto es una fecha de verdad; null si no. */
function isoDate(text: string): string | null {
  const iso = text.match(ISO_DATE);
  const local = text.match(LOCAL_DATE);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3] ?? "1"] : local ? [local[3], local[2], local[1]] : ["", "", ""];
  if (!y) return null;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Lee lo escrito en una casilla según el tipo de su columna. Si encaja, se
 * guarda limpio (la cifra como número, la fecha como 2025-03-01); si no, se
 * guarda el texto tal como está, con el aviso de qué deja de hacer el portal
 * con él. Vacío es `null`, nunca cero.
 */
export function readFreeCell(column: Pick<FreeColumn, "kind" | "territory">, raw: string): FreeCellRead {
  const text = raw.trim();
  if (!text) return { value: null };
  if (column.kind === "texto") return { value: text };
  if (column.kind === "cifra") {
    const parsed = parseLocalNumber(text);
    return parsed.ok ? { value: parsed.value } : { value: text, warning: `«${text}» no es un número: se guarda como texto y las gráficas no lo cuentan` };
  }
  if (column.kind === "fecha") {
    if (/^\d{4}$/.test(text)) return { value: text };
    const date = isoDate(text);
    return date
      ? { value: date }
      : { value: text, warning: `«${text}» no es una fecha (2025-03-01, 01/03/2025 o el año): se guarda como texto y el Gantt no la usa` };
  }
  const territory = column.territory ?? "departamento";
  return territoryCode(territory, text)
    ? { value: text }
    : { value: text, warning: `«${text}» no es un ${territory === "pais" ? "país" : "departamento"} conocido: se guarda el texto, pero no se ubica en el mapa` };
}

/** El año de una fila: vacío es «sin año»; lo que no es un año no tiene dónde guardarse. */
export function readFreeYear(raw: string): { value: number | null; error?: string } {
  const text = raw.trim();
  if (!text) return { value: null };
  const year = Number(text);
  if (!/^\d{4}$/.test(text) || year < 1900 || year > 2200) return { value: null, error: `«${text}» no es un año` };
  return { value: year };
}

/* --- Columnas ---------------------------------------------------------------------------- */

/** La columna como se guarda: solo los campos que usa su tipo. */
export function toFreeColumn(column: FreeDraftColumn, key = column.key): FreeColumn {
  return {
    key,
    label: column.label.trim(),
    kind: column.kind,
    ...(column.kind === "cifra" ? { format: column.format, ...(column.unit.trim() ? { unit: column.unit.trim() } : {}) } : {}),
    ...(column.kind === "territorio" ? { territory: column.territory } : {}),
    ...(column.kind === "cifra" && typeof column.decimals === "number" ? { decimals: column.decimals } : {}),
    ...(column.kind === "texto" && Array.isArray(column.options) ? { options: column.options } : {}),
  };
}

export interface Misfit {
  /** Número de la fila en la rejilla, desde 1. */
  row: number;
  text: string;
}

/** Los títulos no tienen casillas; un total sí puede traerlas escritas. */
const hasCells = (row: FreeDraftRow) => row.kind !== "grupo";

/**
 * Las casillas de una columna que no encajan con un tipo: el que tiene, o el
 * que se le quiere poner (`as`). Es lo que se le dice a quien cambia el tipo
 * de una columna con datos, antes y después de cambiarlo.
 */
export function misfitsOf(draft: FreeDraft, columnId: string, as?: Pick<FreeColumn, "kind" | "territory">): Misfit[] {
  const index = draft.columns.findIndex((c) => c.id === columnId);
  const column = draft.columns[index];
  if (!column) return [];
  const type = as ?? column;
  const out: Misfit[] = [];
  draft.rows.forEach((row, ri) => {
    if (!hasCells(row) || (row.kind === "total" && labelColumn(draft.columns) === column.id)) return;
    const text = (row.cells[columnId] ?? "").trim();
    if (text && readFreeCell(type, text).warning) out.push({ row: ri + 1, text });
  });
  return out;
}

/** «filas 3, 7 y 12» o «filas 3, 7, 12… y 40 más». */
export function rowsText(rows: number[], max = 8): string {
  if (rows.length === 1) return `fila ${rows[0]}`;
  if (rows.length <= max) return `filas ${rows.slice(0, -1).join(", ")} y ${rows[rows.length - 1]}`;
  return `filas ${rows.slice(0, max).join(", ")}… y ${rows.length - max} más`;
}

const MISFIT_TEXT: Record<FreeColumnKind, [one: string, many: string]> = {
  texto: ["", ""],
  cifra: ["no es un número: se guarda como texto y las gráficas no la cuentan", "no son números: se guardan como texto y las gráficas no las cuentan"],
  fecha: ["no es una fecha: se guarda como texto y el Gantt no la usa", "no son fechas: se guardan como texto y el Gantt no las usa"],
  territorio: ["no se reconoce: se guarda el texto, pero no se ubica en el mapa", "no se reconocen: se guarda el texto, pero no se ubican en el mapa"],
};

/** El aviso de una columna con casillas que no encajan, en una frase. */
export function misfitMessage(label: string, kind: FreeColumnKind, list: Misfit[]): string {
  const one = list.length === 1;
  return `«${label}»: ${list.length.toLocaleString("es-CO")} ${one ? "casilla" : "casillas"} (${rowsText(list.map((m) => m.row))}) ${MISFIT_TEXT[kind][one ? 0 : 1]}.`;
}

/**
 * En una fila de total, la primera columna —si no es de cifra— lleva el rótulo
 * del total («Total Bucaramanga»), que es donde lo pinta el portal. Devuelve el
 * id de esa columna, o null si la primera es una cifra.
 */
export const labelColumn = (columns: FreeDraftColumn[]): string | null => (columns[0] && columns[0].kind !== "cifra" ? columns[0].id : null);

/** Quitar una columna se lleva sus casillas del borrador. */
export function removeFreeColumn(draft: FreeDraft, columnId: string): FreeDraft {
  return {
    ...draft,
    columns: draft.columns.filter((c) => c.id !== columnId),
    rows: draft.rows.map((row) => {
      if (!(columnId in row.cells)) return row;
      const { [columnId]: _gone, ...cells } = row.cells;
      void _gone;
      return { ...row, cells };
    }),
  };
}

export function moveFreeColumn(draft: FreeDraft, columnId: string, delta: number): FreeDraft {
  const index = draft.columns.findIndex((c) => c.id === columnId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= draft.columns.length) return draft;
  const columns = [...draft.columns];
  const [item] = columns.splice(index, 1);
  columns.splice(target, 0, item);
  return { ...draft, columns };
}

/** Casillas con algo escrito en una columna. */
export const filledIn = (draft: FreeDraft, columnId: string): number =>
  draft.rows.filter((row) => hasCells(row) && (row.cells[columnId] ?? "").trim()).length;

/** Las gráficas que nombran una columna. */
export const viewsUsing = (views: FreeView[], key: string): FreeView[] => (key ? views.filter((view) => viewColumnKeys(view).includes(key)) : []);

/* --- Tiempo ------------------------------------------------------------------------------- */

/** Filas que se guardarían y no tienen año (números de fila, desde 1). */
export const rowsWithoutYear = (draft: FreeDraft): number[] =>
  draft.rows.flatMap((row, index) => (!isBlankFreeRow(row, true) && !row.year.trim() ? [index + 1] : []));

/** Pone el año a las filas que no lo tienen; las que ya lo tienen no se tocan. */
export function fillYears(draft: FreeDraft, year: string): FreeDraft {
  const text = year.trim();
  if (readFreeYear(text).value === null) return draft;
  return { ...draft, rows: draft.rows.map((row) => (!isBlankFreeRow(row, true) && !row.year.trim() ? { ...row, year: text } : row)) };
}

/* --- Del borrador a lo que se guarda -------------------------------------------------- */

/** Una fila de datos sin nada escrito: no se guarda. Los títulos y los totales nunca están en blanco. */
export const isBlankFreeRow = (row: FreeDraftRow, anual: boolean) =>
  row.kind === "dato" && (!anual || !row.year.trim()) && Object.values(row.cells).every((text) => !text.trim());

const uniqueKey = (text: string, taken: Set<string>) => {
  const base = slugify(text) || "columna";
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}-${n}`;
  taken.add(key);
  return key;
};

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export interface FreeDraftOutput {
  columns: FreeColumn[];
  rows: { year: number | null; kind: FreeRowKind; label: string; cells: Record<string, FreeCell> }[];
  /** Lo que impide guardar, en palabras. */
  errors: string[];
  /** Lo que se guarda igual, pero conviene saber. */
  warnings: string[];
  /** Casillas marcadas: «<id de fila>|<id de columna>» (o «|anio») → motivo. */
  cellWarnings: Map<string, string>;
  cellErrors: Map<string, string>;
  /** Cada fila del borrador como la leería el portal, en el mismo orden: para calcular los totales en vivo. */
  shown: FreeRow[];
  /** Si cada fila del borrador se guarda (las de datos en blanco, no). */
  kept: boolean[];
}

/** Lo que se guardaría ahora mismo, con lo que impide guardar y lo que solo se avisa. */
export function buildFreeOutput(draft: FreeDraft): FreeDraftOutput {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cellWarnings = new Map<string, string>();
  const cellErrors = new Map<string, string>();
  const { meta } = draft;
  const anual = meta.temporality === "anual";

  const taken = new Set(draft.columns.map((column) => column.key).filter(Boolean));
  const columns = draft.columns.map((column) => toFreeColumn(column, column.key || uniqueKey(column.label, taken)));
  const nameOf = (index: number) => columns[index].label || `Columna ${index + 1}`;
  const labelId = labelColumn(draft.columns);

  if (!meta.title.trim()) errors.push("Ponle un título al conjunto.");
  if (!columns.length) errors.push("El conjunto necesita al menos una columna: pega una tabla de Excel o añade una.");
  draft.columns.forEach((column, index) => {
    if (!column.label.trim()) errors.push(`La columna ${index + 1} necesita un nombre.`);
  });
  const names = draft.columns.map((column) => fold(column.label)).filter(Boolean);
  if (names.some((name, index) => names.indexOf(name) !== index)) {
    warnings.push("Dos columnas se llaman igual: al pegar desde Excel con encabezados, lo pegado irá a la primera.");
  }
  if (meta.temporality === "periodo" && !meta.periodLabel.trim()) {
    warnings.push("Falta escribir el periodo que cubre («2020–2025»): el portal dirá solo «Dato del periodo».");
  }

  const misfits = draft.columns.map((): Misfit[] => []);
  const shown: FreeRow[] = [];
  const kept: boolean[] = [];
  const rows: FreeDraftOutput["rows"] = [];

  draft.rows.forEach((row, ri) => {
    const number = ri + 1;
    const year = readFreeYear(row.year);
    // En un conjunto que no es anual el año guardado se conserva tal cual, sin mostrarlo.
    const blank = isBlankFreeRow(row, anual);
    if (anual && !blank && year.error) {
      cellErrors.set(`${row.id}|anio`, year.error);
      errors.push(`Fila ${number} · Año: ${year.error}.`);
    }

    const cells: Record<string, FreeCell> = {};
    if (hasCells(row)) {
      draft.columns.forEach((column, ci) => {
        // En un total, la primera columna de texto es su rótulo, no una casilla.
        if (row.kind === "total" && column.id === labelId) return;
        const read = readFreeCell(columns[ci], row.cells[column.id] ?? "");
        if (read.warning) {
          cellWarnings.set(`${row.id}|${column.id}`, read.warning);
          misfits[ci].push({ row: number, text: (row.cells[column.id] ?? "").trim() });
        }
        // Un total solo guarda lo escrito: la casilla vacía la calcula el portal.
        if (row.kind === "dato" || read.value !== null) cells[columns[ci].key] = read.value;
      });
    }
    const label = row.kind === "dato" ? "" : row.kind === "total" ? row.label.trim() || "Total" : row.label.trim();
    const stored = { year: year.value, kind: row.kind, label, cells };
    shown.push(stored);
    kept.push(!blank);
    if (blank) return;
    if (row.kind === "grupo" && !label) warnings.push(`Fila ${number}: el título de grupo no tiene texto; el portal dirá «Sin título».`);
    rows.push(stored);
  });

  draft.rows.forEach((row, ri) => {
    if (row.kind !== "total") return;
    if (totalPreview({ shown, kept, columns, anual }, ri).count === 0 && Object.keys(shown[ri].cells).length === 0) {
      warnings.push(`Fila ${ri + 1}: el total no tiene filas de datos encima ni cifras escritas; saldrá vacío.`);
    }
  });

  if (anual) {
    const missing = rowsWithoutYear(draft);
    missing.forEach((number) => cellWarnings.set(`${draft.rows[number - 1].id}|anio`, "sin año: la fila no se ve en el portal al elegir un año"));
    if (missing.length) {
      warnings.push(
        `${missing.length === 1 ? "1 fila no tiene" : `${missing.length.toLocaleString("es-CO")} filas no tienen`} año (${rowsText(missing)}): se ${missing.length === 1 ? "guarda" : "guardan"}, pero no se ${missing.length === 1 ? "ve" : "ven"} en el portal al elegir un año.`,
      );
    }
  }
  misfits.forEach((list, ci) => {
    if (list.length) warnings.push(misfitMessage(nameOf(ci), columns[ci].kind, list));
  });

  return { columns, rows, errors, warnings, cellWarnings, cellErrors, shown, kept };
}

/**
 * Lo que el portal calcularía en una fila de total, para sugerirlo en sus
 * casillas vacías. En un conjunto anual el total es de las filas de su año,
 * que es lo que la ficha tiene delante al dibujarlo.
 */
export function totalPreview(output: Pick<FreeDraftOutput, "shown" | "kept" | "columns"> & { anual: boolean }, index: number) {
  const row = output.shown[index];
  const scope = output.shown.filter((other, i) => output.kept[i] && (!output.anual || other.year === row.year));
  return freeTotalAt(scope, scope.indexOf(row), output.columns);
}

/* --- Gráficas que el cambio deja incompletas ---------------------------------------------- */

export interface ViewImpact {
  view: FreeView;
  /** Lo que le falta, en palabras. */
  problems: string[];
}

/**
 * Las gráficas a las que les falta algo con las columnas y el tiempo del
 * borrador: una columna que ya no está, o que cambió de tipo, o un tiempo que
 * ya no les sirve. No se borran solas: quedan marcadas con lo que les falta.
 */
export function viewImpacts(set: Pick<FreeSet, "temporality" | "columns">, views: FreeView[], labels: Record<string, string> = {}): ViewImpact[] {
  const asSet: FreeSet = { id: "", title: "", description: "", source: "", periodLabel: "", rows: [], views, temporality: set.temporality, columns: set.columns };
  return views.flatMap((view): ViewImpact[] => {
    const lost = viewLostColumns(asSet, view).map((key) => `Ya no está la columna «${labels[key] ?? key}».`);
    const problems = [...lost, ...viewProblems(asSet, view)];
    return problems.length ? [{ view, problems }] : [];
  });
}

/* --- Pegar desde Excel sobre el borrador ----------------------------------------------- */

export interface FreePasteRequest {
  grid: string[][];
  /** Fila del borrador y campo (el año cuenta como primer campo en un conjunto anual) donde cae la primera celda. */
  atRow: number;
  atField: number;
  /** La primera fila pegada trae los nombres de las columnas. */
  header: boolean;
  /** Reemplaza todas las filas; las columnas que ya existen se conservan, con su clave. */
  replace: boolean;
}

export type FreePasteTarget =
  | { to: "anio"; label: string }
  | { to: "columna"; index: number; label: string; kind: FreeColumnKind }
  | { to: "nueva"; label: string; column: Pick<FreeDraftColumn, "kind" | "format" | "unit" | "territory"> };

export interface FreePastePlan {
  /** Adónde va cada columna pegada. */
  targets: FreePasteTarget[];
  /** Las filas de datos que se pegan (sin la de encabezados). */
  body: string[][];
  /** El conjunto pasa a ser anual: lo pegado trae la columna «Año». */
  becomesAnnual: boolean;
  /** Casillas pegadas que no encajan con el tipo de su columna, por columna pegada. */
  misfits: number[];
}

const isYear = (text: string) => /^\d{4}$/.test(text.trim()) && Number(text) >= 1900 && Number(text) <= 2200;

/**
 * El tipo que mejor describe una columna pegada. Cifra si todo lo escrito es
 * número (con su formato); fecha si todo son fechas; territorio si todo son
 * departamentos o países conocidos. En la duda, texto: es una propuesta que se
 * corrige en la rejilla.
 */
export function guessFreeColumn(values: string[]): Pick<FreeDraftColumn, "kind" | "format" | "unit" | "territory"> {
  const base = { format: "entero" as ValueFormat, unit: "", territory: "departamento" as FreeTerritory };
  const filled = values.map((v) => v.trim()).filter(Boolean);
  const guess = guessColumn(filled);
  if (guess.kind === "cifra") return { ...base, kind: "cifra", format: guess.format ?? "entero" };
  if (!filled.length) return { ...base, kind: "texto" };
  if (filled.every((text) => isoDate(text) !== null)) return { ...base, kind: "fecha" };
  // Un solo valor repetido no dice nada: «Santander» puede ser un banco.
  if (new Set(filled.map(fold)).size >= 2) {
    if (filled.every((text) => territoryCode("departamento", text))) return { ...base, kind: "territorio", territory: "departamento" };
    if (filled.every((text) => territoryCode("pais", text))) return { ...base, kind: "territorio", territory: "pais" };
  }
  return { ...base, kind: "texto" };
}

/** ¿Parece que la primera fila son encabezados? Todo texto arriba, y debajo algún número o algún nombre de columna que ya existe. */
export function looksLikeFreeHeader(draft: FreeDraft, grid: string[][]): boolean {
  if (grid.length < 2) return false;
  const isNumber = (text: string) => {
    const parsed = parseLocalNumber(text);
    return parsed.ok && parsed.value !== null;
  };
  const head = grid[0].filter((cell) => cell.trim());
  if (!head.length || head.some(isNumber)) return false;
  const known = new Set(["ano", ...draft.columns.map((column) => fold(column.label))]);
  return head.some((cell) => known.has(fold(cell))) || grid.slice(1).some((line) => line.some(isNumber));
}

/**
 * Qué pasaría al pegar, sin tocar nada: es lo que enseña la vista previa.
 *
 * Con encabezados, cada columna pegada va a la que se llama igual; las que no
 * existen se crean con ese nombre y el tipo que se deduce de lo pegado. Sin
 * encabezados, van en orden desde el campo de partida, y las que sobran se
 * crean. Una columna «Año» va al año de la fila si el conjunto es anual —o lo
 * vuelve anual, si el conjunto todavía no tiene columnas—.
 */
export function planFreePaste(draft: FreeDraft, request: FreePasteRequest): FreePastePlan {
  const lines = request.grid.filter((line) => line.some((cell) => cell.trim() !== ""));
  const header = request.header && lines.length > 0 ? lines[0] : null;
  const body = header ? lines.slice(1) : lines;
  const width = Math.max(0, ...lines.map((line) => line.length));
  const anual = draft.meta.temporality === "anual";
  const valuesOf = (i: number) => body.map((line) => line[i] ?? "");
  const fresh = (i: number, label: string): FreePasteTarget => ({ to: "nueva", label, column: guessFreeColumn(valuesOf(i)) });
  const existing = (index: number): FreePasteTarget => ({
    to: "columna", index, label: draft.columns[index].label.trim() || `Columna ${index + 1}`, kind: draft.columns[index].kind,
  });

  let becomesAnnual = false;
  let created = 0;
  const nextName = () => `Columna ${draft.columns.length + (created += 1)}`;
  const targets: FreePasteTarget[] = [];

  if (header) {
    const used = new Set<number>();
    let yearTaken = false;
    for (let i = 0; i < width; i += 1) {
      const name = (header[i] ?? "").trim();
      const folded = fold(name);
      const filled = valuesOf(i).filter((v) => v.trim());
      if (folded === "ano" && !yearTaken && (anual || (draft.columns.length === 0 && filled.length > 0 && filled.every(isYear)))) {
        yearTaken = true;
        becomesAnnual = !anual;
        targets.push({ to: "anio", label: "Año" });
        continue;
      }
      const match = folded ? draft.columns.findIndex((column, index) => !used.has(index) && fold(column.label) === folded) : -1;
      if (match >= 0) {
        used.add(match);
        targets.push(existing(match));
      } else {
        targets.push(fresh(i, name || nextName()));
      }
    }
  } else {
    const offset = anual ? 1 : 0;
    for (let i = 0; i < width; i += 1) {
      const field = request.atField + i;
      if (anual && field === 0) targets.push({ to: "anio", label: "Año" });
      else if (field - offset < draft.columns.length) targets.push(existing(field - offset));
      else targets.push(fresh(i, nextName()));
    }
  }

  const misfits = targets.map((target, i) => {
    if (target.to === "anio") return valuesOf(i).filter((text) => text.trim() && !isYear(text)).length;
    const type = target.to === "columna" ? draft.columns[target.index] : target.column;
    return valuesOf(i).filter((text) => readFreeCell(type, text).warning).length;
  });

  return { targets, body, becomesAnnual, misfits };
}

/** El borrador con lo pegado dentro. Nada se guarda: sigue siendo un borrador. */
export function applyFreePaste(draft: FreeDraft, request: FreePasteRequest): FreeDraft {
  const plan = planFreePaste(draft, request);
  const columns = [...draft.columns];
  const ids = plan.targets.map((target): string | "anio" => {
    if (target.to === "anio") return "anio";
    if (target.to === "columna") return columns[target.index].id;
    const column = { ...emptyFreeColumn(target.column.kind, target.label), ...target.column };
    columns.push(column);
    return column.id;
  });

  // Lo pegado siempre son filas de datos: los títulos y los totales que haya en medio se saltan.
  const rows = request.replace ? [] : [...draft.rows];
  let cursor = request.replace ? 0 : Math.min(request.atRow, rows.length);
  for (const line of plan.body) {
    while (rows[cursor] && rows[cursor].kind !== "dato") cursor += 1;
    while (rows.length <= cursor) rows.push(emptyFreeRow());
    let row = rows[cursor];
    const cells = { ...row.cells };
    ids.forEach((id, i) => {
      const text = (line[i] ?? "").trim();
      if (id === "anio") row = { ...row, year: text };
      else cells[id] = text;
    });
    rows[cursor] = { ...row, cells };
    cursor += 1;
  }

  return {
    meta: plan.becomesAnnual ? { ...draft.meta, temporality: "anual" } : draft.meta,
    columns,
    rows,
  };
}
