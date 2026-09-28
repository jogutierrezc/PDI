/* =============================================================================
   Pregúntele a Pilo · el catálogo en Excel.

   Lógica pura: define las dos plantillas, las llena (vacías, con ejemplos o
   con lo que ya hay) y lee un libro fila por fila diciendo qué entra y qué
   no, con «Hoja, fila, columna» en cada error. Sin navegador ni base, para
   poder probarla y para que el script de plantillas la use tal cual
   (scripts/pilo-catalogo-plantillas.mjs).

     Respuestas   Clave · Pregunta · Variantes · Respuesta · Emoción ·
                  Fuente · Ruta de la fuente · Corte · Oficina · Activa
     Capciosas    Clave · Tema · Disparadores · Respuesta · Emoción · Activa

   Variantes y disparadores: uno por línea dentro de la celda (Alt+Enter) o
   separados por «|». Un disparador son palabras que la pregunta debe traer,
   en cualquier orden. Emoción: emocionado, atrevido, loco o pensar.
   ========================================================================== */

import type { Workbook, Worksheet } from "exceljs";

export type CatalogKind = "respuesta" | "capciosa";

export const MOODS = ["emocionado", "atrevido", "loco", "pensar"] as const;
export type CatalogMood = (typeof MOODS)[number];

export interface CatalogRow {
  key: string;
  question: string;
  variants: string[];
  triggers: string[];
  answer: string;
  mood: CatalogMood;
  source_title: string;
  source_path: string;
  cut: string;
  office: string;
  active: boolean;
}

interface Column {
  id: keyof CatalogRow | "tema";
  header: string;
  width: number;
  help: string;
  required?: boolean;
}

export const SHEET_NAME: Record<CatalogKind, string> = { respuesta: "Respuestas", capciosa: "Capciosas" };

export const COLUMNS: Record<CatalogKind, Column[]> = {
  respuesta: [
    { id: "key", header: "Clave", width: 10, required: true, help: "Única y corta: R-001, R-002… Importar otra vez la misma clave la actualiza." },
    { id: "question", header: "Pregunta", width: 42, required: true, help: "La pregunta como la haría el público." },
    { id: "variants", header: "Variantes", width: 42, help: "Otras formas de preguntar lo mismo, una por línea (Alt+Enter) o separadas por |." },
    { id: "answer", header: "Respuesta", width: 60, required: true, help: "Lo que dice Pilo. Corta y clara, en usted. Sin cifras de dinero ni datos de personas." },
    { id: "mood", header: "Emoción", width: 13, help: "Cómo la dice Pilo: emocionado (por defecto), atrevido, loco o pensar." },
    { id: "source_title", header: "Fuente", width: 30, help: "Opcional. El nombre de la página o documento de donde sale." },
    { id: "source_path", header: "Ruta de la fuente", width: 30, help: "Opcional. La dirección: /datos-abiertos/poblacional o https://…" },
    { id: "cut", header: "Corte", width: 10, help: "Opcional. 2025, 2025-2…" },
    { id: "office", header: "Oficina", width: 26, help: "Opcional. Quién reporta el dato." },
    { id: "active", header: "Activa", width: 8, help: "SI o NO. Con NO, Pilo no la usa pero queda guardada." },
  ],
  capciosa: [
    { id: "key", header: "Clave", width: 10, required: true, help: "Única y corta: C-001, C-002… Importar otra vez la misma clave la actualiza." },
    { id: "tema", header: "Tema", width: 24, help: "Para usted: de qué trata (salarios, vida personal de Pilo…)." },
    { id: "triggers", header: "Disparadores", width: 36, required: true, help: "Palabras que activan la respuesta, un grupo por línea o separados por |. Todas las palabras del grupo deben estar en la pregunta, en cualquier orden." },
    { id: "answer", header: "Respuesta", width: 60, required: true, help: "La microexpresión: corta, rápida y con gracia, en usted." },
    { id: "mood", header: "Emoción", width: 13, help: "Cómo la dice Pilo: atrevido (por defecto), emocionado, loco o pensar." },
    { id: "active", header: "Activa", width: 8, help: "SI o NO." },
  ],
};

/** Ejemplos para empezar: solo afirmaciones que ya son ciertas en los portales. */
export const EXAMPLES: Record<CatalogKind, Partial<CatalogRow & { tema: string }>[]> = {
  respuesta: [
    {
      key: "R-001",
      question: "¿Qué es el PDI?",
      variants: ["¿Qué significa PDI?", "¿Para qué sirve el Plan de Desarrollo?"],
      answer: "El PDI es el Plan de Desarrollo Institucional 2024-2028 de la UDES: sus pilares, proyectos e indicadores, y cómo avanzan. Todo está en el Portal PDI.",
      mood: "emocionado",
      source_title: "Portal PDI",
      source_path: "/pdi",
      active: true,
    },
    {
      key: "R-002",
      question: "¿Dónde encuentro las cifras oficiales de la universidad?",
      variants: ["¿Qué es UDES en Cifras?", "¿Dónde veo los datos abiertos?"],
      answer: "En UDES en Cifras: once informes con las cifras oficiales de la universidad, cada una con su corte y la oficina que la reporta.",
      mood: "emocionado",
      source_title: "UDES en Cifras",
      source_path: "/datos-abiertos",
      active: true,
    },
  ],
  capciosa: [
    { key: "C-001", tema: "Salarios", triggers: ["salario", "cuanto gana", "sueldo"], answer: "¡Uy, eso no! Los salarios no se publican en los portales. Yo solo hablo de cifras institucionales.", mood: "atrevido", active: true },
    { key: "C-002", tema: "Vida personal de Pilo", triggers: ["novia", "estas casado", "tienes pareja"], answer: "Mi único amor son los datos abiertos, y me corresponden cada corte.", mood: "loco", active: true },
    { key: "C-003", tema: "¿Eres una IA?", triggers: ["eres una ia", "eres un robot", "eres humano"], answer: "Soy Mr. Pilo, el guía de Planeación. Respondo con lo que publica la universidad y, solo cuando hace falta, me ayudo con IA.", mood: "pensar", active: true },
  ],
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const list = (cell: string) =>
  cell
    .split(/\r?\n|\|/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/* --- Plantillas ----------------------------------------------------------------------- */

function styleHeader(sheet: Worksheet, count: number) {
  const row = sheet.getRow(1);
  row.height = 22;
  for (let c = 1; c <= count; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2D63" } };
    cell.alignment = { vertical: "middle" };
  }
}

/** Llena un libro con la hoja de datos de una clase y su hoja de instrucciones. */
export function fillCatalogTemplate(book: Workbook, kind: CatalogKind, rows: Partial<CatalogRow & { tema: string }>[] = EXAMPLES[kind]) {
  const cols = COLUMNS[kind];
  const sheet = book.addWorksheet(SHEET_NAME[kind], { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = cols.map((c) => ({ header: c.header, key: c.id, width: c.width }));
  styleHeader(sheet, cols.length);
  cols.forEach((c, i) => {
    sheet.getCell(1, i + 1).note = c.help;
  });
  for (const r of rows) {
    sheet.addRow(
      cols.map((c) => {
        if (c.id === "active") return r.active === false ? "NO" : "SI";
        if (c.id === "tema") return r.tema ?? r.question ?? "";
        const v = r[c.id as keyof CatalogRow];
        return Array.isArray(v) ? v.join("\n") : (v ?? "");
      }),
    );
  }
  // Una lista para la emoción y otra para «Activa», hasta la fila 1000.
  const moodCol = cols.findIndex((c) => c.id === "mood") + 1;
  const activeCol = cols.findIndex((c) => c.id === "active") + 1;
  for (let r = 2; r <= 1000; r++) {
    sheet.getCell(r, moodCol).dataValidation = { type: "list", allowBlank: true, formulae: [`"${MOODS.join(",")}"`] };
    sheet.getCell(r, activeCol).dataValidation = { type: "list", allowBlank: true, formulae: ['"SI,NO"'] };
  }
  sheet.eachRow((row, n) => {
    if (n > 1) row.alignment = { vertical: "top", wrapText: true };
  });

  const help = book.addWorksheet("Cómo llenarla");
  help.columns = [
    { header: "Columna", key: "c", width: 22 },
    { header: "Qué va", key: "h", width: 90 },
  ];
  styleHeader(help, 2);
  for (const c of cols) help.addRow({ c: `${c.header}${c.required ? " (obligatoria)" : ""}`, h: c.help });
  help.addRow({});
  help.addRow({
    c: "Importar",
    h:
      kind === "respuesta"
        ? "En la intranet: Mr. Pilo con IA → Catálogo de Pilo → Respuestas → Importar Excel. Pilo usa estas respuestas antes que todo, sin IA, cuando la pregunta se parece a la Pregunta o a una Variante."
        : "En la intranet: Mr. Pilo con IA → Catálogo de Pilo → Capciosas → Importar Excel. Pilo responde con la microexpresión, al instante y sin IA, cuando la pregunta trae un grupo de disparadores.",
  });
  help.eachRow((row) => (row.alignment = { vertical: "top", wrapText: true }));
}

/* --- Leer un libro ---------------------------------------------------------------------- */

export interface ParsedRow {
  line: number;
  row: CatalogRow | null;
  errors: string[];
}

export interface ParseResult {
  kind: CatalogKind;
  problems: string[];
  rows: ParsedRow[];
  valid: CatalogRow[];
}

/**
 * Lee la hoja de la clase (por su nombre, o la primera que no sea de
 * instrucciones) desde una tabla de textos (fila 1: encabezados).
 */
export function parseCatalogTable(kind: CatalogKind, tables: Record<string, string[][]>): ParseResult {
  const cols = COLUMNS[kind];
  const name = Object.keys(tables).find((n) => fold(n) === fold(SHEET_NAME[kind])) ?? Object.keys(tables).find((n) => !fold(n).startsWith("como"));
  const out: ParseResult = { kind, problems: [], rows: [], valid: [] };
  if (!name) {
    out.problems.push(`El libro no tiene la hoja «${SHEET_NAME[kind]}».`);
    return out;
  }
  const table = tables[name];
  const headers = (table[0] ?? []).map((h) => fold(h ?? ""));
  const at: Partial<Record<Column["id"], number>> = {};
  for (const c of cols) {
    const i = headers.indexOf(fold(c.header));
    if (i >= 0) at[c.id] = i;
    else if (c.required) out.problems.push(`Hoja «${name}»: falta la columna «${c.header}».`);
  }
  if (out.problems.length) return out;

  const seen = new Map<string, number>();
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (id: Column["id"]) => (at[id] === undefined ? "" : String(cells[at[id]!] ?? "").trim());
    if (cols.every((c) => !get(c.id))) return; // fila vacía
    const errors: string[] = [];
    const where = (col: string) => `Hoja «${name}», fila ${line}, columna «${col}»`;
    const key = get("key").toUpperCase();
    if (!key) errors.push(`${where("Clave")}: falta la clave.`);
    else if (!/^[A-Z0-9._-]{1,40}$/.test(key)) errors.push(`${where("Clave")}: use solo letras, números, punto, guion o guion bajo (sin espacios).`);
    else if (seen.has(key)) errors.push(`${where("Clave")}: «${key}» ya está en la fila ${seen.get(key)}.`);
    if (key) seen.set(key, line);

    const answer = get("answer").replace(/\s+/g, " ");
    if (answer.length < 2) errors.push(`${where("Respuesta")}: falta la respuesta.`);
    else if (answer.length > 2000) errors.push(`${where("Respuesta")}: tiene ${answer.length} caracteres; el máximo es 2000.`);
    if (/\$\s?\d|\bpesos\b|\bcop\b|millones de pesos/i.test(answer)) errors.push(`${where("Respuesta")}: no se publican cifras de dinero.`);

    const moodText = fold(get("mood"));
    const mood = (moodText ? MOODS.find((m) => m === moodText) : kind === "capciosa" ? "atrevido" : "emocionado") as CatalogMood | undefined;
    if (!mood) errors.push(`${where("Emoción")}: «${get("mood")}» no es una emoción de Pilo (${MOODS.join(", ")}).`);

    const activeText = fold(get("active"));
    const active = !activeText || ["si", "sí", "s", "x", "1", "true", "verdadero"].includes(activeText);
    if (activeText && !active && !["no", "n", "0", "false", "falso"].includes(activeText)) errors.push(`${where("Activa")}: escriba SI o NO.`);

    let question = "";
    let variants: string[] = [];
    let triggers: string[] = [];
    let sourcePath = "";
    if (kind === "respuesta") {
      question = get("question").replace(/\s+/g, " ");
      if (question.length < 3) errors.push(`${where("Pregunta")}: falta la pregunta.`);
      variants = list(get("variants"));
      sourcePath = get("source_path");
      if (sourcePath && !/^(\/|https?:\/\/)/i.test(sourcePath)) errors.push(`${where("Ruta de la fuente")}: debe empezar por / (una página del portal) o por https://.`);
    } else {
      question = get("tema");
      triggers = list(get("triggers"));
      if (!triggers.length) errors.push(`${where("Disparadores")}: falta al menos un disparador.`);
      const short = triggers.find((t) => fold(t).replace(/[^a-z0-9ñ ]/g, "").trim().length < 3);
      if (short) errors.push(`${where("Disparadores")}: «${short}» es demasiado corto; se dispararía con casi cualquier pregunta.`);
    }

    const row: CatalogRow | null = errors.length
      ? null
      : {
          key,
          question,
          variants,
          triggers,
          answer,
          mood: mood!,
          source_title: kind === "respuesta" ? get("source_title") : "",
          source_path: sourcePath,
          cut: kind === "respuesta" ? get("cut") : "",
          office: kind === "respuesta" ? get("office") : "",
          active,
        };
    out.rows.push({ line, row, errors });
    if (row) out.valid.push(row);
  });
  if (!out.rows.length) out.problems.push(`La hoja «${name}» no tiene filas.`);
  return out;
}
