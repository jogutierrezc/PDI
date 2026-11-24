/* =============================================================================
   Impacto · la plantilla de carga de cifras de las vicerrectorías.

   Una sola plantilla para todo: la cifra global de la UDES, la de una sede
   y la de un programa en una sede, siempre apuntando a una ficha del
   catálogo por su código. La hoja «Cifras» trae una fila por ficha de la
   vicerrectoría (alcance Global, año del corte) para empezar; para cargar
   por sede o por programa se copia la fila y se cambian Alcance, Sede y
   Programa. «Listas» alimenta los desplegables.

   Al cargar, cada fila se valida y se dice por su número de fila qué tiene
   mal. Solo entra el archivo si ninguna fila falla.
   ========================================================================== */

import type { Workbook } from "exceljs";
import { parseFigure, type Indicator, type Value } from "../model";
import type { ImportRow } from "../store";

export const DATA_SHEET = "Cifras";
export const LIST_SHEET = "Listas";
export const HEADERS = [
  "Código",
  "Indicador",
  "Año",
  "Alcance",
  "Sede",
  "Programa",
  "Valor",
  "Numerador",
  "Denominador",
  "No aplica",
  "Nota",
  "Evidencia (URL)",
] as const;
export const SCOPES = ["Global", "Sede", "Programa"] as const;

export interface ImportContext {
  /** Las fichas en las que quien carga puede escribir. */
  indicators: Pick<Indicator, "id" | "code" | "name" | "measure" | "fn">[];
  campuses: { id: string; name: string; slug: string }[];
  /** Programa en sede, con los nombres para leerlos en la plantilla. */
  sites: { programId: string; campusId: string; programName: string; campusName: string }[];
  /** Las cifras que ya hay, para decir qué cambia. */
  values: Pick<Value, "indicatorId" | "year" | "programId" | "campusId" | "valueNum" | "valueText" | "notApplicable">[];
}

export type RowState = "nueva" | "cambia" | "igual";

export interface ParsedRow {
  line: number;
  row: ImportRow;
  state: RowState;
  label: string;
}

export interface ImportParse {
  rows: ParsedRow[];
  problems: { line: number; message: string }[];
  /** Filas sin valor: se ignoran. */
  empty: number;
}

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
export const fold = (v: unknown) =>
  clean(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const siteLabel = (s: { programName: string; campusName: string }) => `${s.programName} · ${s.campusName}`;

/* --- La plantilla --------------------------------------------------------------------- */

export function fillTemplate(book: Workbook, ctx: ImportContext, year: number) {
  book.creator = "Intranet PDI · Impacto";
  const sheet = book.addWorksheet(DATA_SHEET);
  sheet.columns = HEADERS.map((header, k) => ({
    header,
    key: `c${k}`,
    width: [10, 48, 8, 11, 18, 40, 12, 12, 13, 10, 36, 30][k],
  }));
  sheet.getRow(1).font = { bold: true };
  const indicators = [...ctx.indicators].sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
  for (const i of indicators) sheet.addRow({ c0: i.code, c1: i.name, c2: year, c3: "Global" });
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];

  const lists = book.addWorksheet(LIST_SHEET);
  lists.columns = [
    { header: "Código", key: "code", width: 10 },
    { header: "Indicador", key: "name", width: 60 },
    { header: "Alcance", key: "scope", width: 12 },
    { header: "Sede", key: "campus", width: 20 },
    { header: "Programa", key: "site", width: 50 },
  ];
  lists.getRow(1).font = { bold: true };
  const campuses = [...ctx.campuses].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const sites = [...ctx.sites].sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es"));
  const longest = Math.max(indicators.length, SCOPES.length, campuses.length, sites.length);
  for (let k = 0; k < longest; k++) {
    lists.addRow({
      code: indicators[k]?.code ?? "",
      name: indicators[k]?.name ?? "",
      scope: SCOPES[k] ?? "",
      campus: campuses[k]?.name ?? "",
      site: sites[k] ? siteLabel(sites[k]) : "",
    });
  }

  // Desplegables en las columnas que se eligen.
  const list = (col: string, count: number) => `${LIST_SHEET}!$${col}$2:$${col}$${Math.max(2, count + 1)}`;
  for (let r = 2; r <= Math.max(indicators.length + 200, 400); r++) {
    sheet.getCell(`A${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [list("A", indicators.length)] };
    sheet.getCell(`D${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [list("C", SCOPES.length)] };
    sheet.getCell(`E${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [list("D", campuses.length)] };
    sheet.getCell(`F${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [list("E", sites.length)] };
    sheet.getCell(`J${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Sí,No"'] };
  }

  const help = book.addWorksheet("Cómo se llena");
  [
    "Una fila es una cifra: una ficha (Código), un año y un alcance.",
    "Alcance Global: la cifra de toda la UDES; deje Sede y Programa vacíos.",
    "Alcance Sede: la cifra de la UDES en una sede; elija la Sede y deje Programa vacío.",
    "Alcance Programa: la de un programa en una sede; elija el Programa (ya dice su sede).",
    "Valor: el número tal cual (78, 78,5, 78 %, $ 1.500.000). Si la ficha se mide con numerador y denominador, llene esos dos y deje Valor vacío: el porcentaje se calcula solo.",
    "No aplica «Sí»: ese año no se mide. No es lo mismo que dejarlo vacío.",
    "Las filas sin valor, sin numerador y sin «No aplica» se ignoran. Copie filas para cargar varias sedes, programas o años.",
    "Si una fila tiene un problema, la intranet dice cuál y no carga nada hasta corregirla.",
  ].forEach((line) => help.addRow([line]));
  help.getColumn(1).width = 120;
}

/* --- La lectura ------------------------------------------------------------------------ */

export function parseImport(table: string[][], ctx: ImportContext): ImportParse {
  const rows: ParsedRow[] = [];
  const problems: ImportParse["problems"] = [];
  let empty = 0;
  const header = (table[0] ?? []).map(fold);
  const col = (name: string) => header.indexOf(fold(name));
  const c = Object.fromEntries(HEADERS.map((h) => [h, col(h)])) as Record<(typeof HEADERS)[number], number>;
  if (c["Código"] < 0 || c["Año"] < 0 || c["Alcance"] < 0) {
    return { rows, problems: [{ line: 1, message: "La primera fila debe traer las columnas de la plantilla (Código, Año, Alcance…)." }], empty };
  }
  const at = (line: string[], name: (typeof HEADERS)[number]) => (c[name] >= 0 ? clean(line[c[name]]) : "");

  const byCode = new Map(ctx.indicators.map((i) => [i.code.toUpperCase(), i]));
  const campusByName = new Map<string, string>();
  for (const k of ctx.campuses) {
    campusByName.set(fold(k.name), k.id);
    campusByName.set(fold(k.slug), k.id);
  }
  const siteByLabel = new Map<string, (typeof ctx.sites)[number]>();
  for (const s of ctx.sites) siteByLabel.set(fold(siteLabel(s)), s);
  const existing = new Map(ctx.values.map((v) => [`${v.indicatorId}|${v.year}|${v.programId ?? ""}|${v.campusId ?? ""}`, v]));
  const seen = new Map<string, number>();

  table.slice(1).forEach((line, index) => {
    const n = index + 2;
    const code = at(line, "Código").toUpperCase();
    const valueText = at(line, "Valor");
    const numText = at(line, "Numerador");
    const denText = at(line, "Denominador");
    const naText = fold(at(line, "No aplica"));
    const notApplicable = ["si", "sí", "x", "1", "true", "n/a", "na"].includes(naText) || ["n/a", "na", "no aplica"].includes(fold(valueText));
    if (!code && !valueText && !numText) return;
    if (!valueText && !numText && !denText && !notApplicable) {
      empty++;
      return;
    }

    const indicator = byCode.get(code);
    if (!indicator) {
      problems.push({ line: n, message: code ? `La ficha ${code} no está entre las suyas.` : "Falta el código de la ficha." });
      return;
    }
    const year = Number(at(line, "Año"));
    if (!Number.isInteger(year) || year < 2015 || year > 2040) {
      problems.push({ line: n, message: `El año «${at(line, "Año")}» no es válido.` });
      return;
    }
    const scope = fold(at(line, "Alcance")) || "global";
    let programId: string | null = null;
    let campusId: string | null = null;
    let where = "UDES";
    if (scope === "sede") {
      campusId = campusByName.get(fold(at(line, "Sede"))) ?? null;
      if (!campusId) {
        problems.push({ line: n, message: at(line, "Sede") ? `No hay sede «${at(line, "Sede")}».` : "Con alcance Sede hay que elegir la sede." });
        return;
      }
      where = ctx.campuses.find((k) => k.id === campusId)?.name ?? "Sede";
    } else if (scope === "programa") {
      const programText = at(line, "Programa");
      let site = siteByLabel.get(fold(programText));
      if (!site && at(line, "Sede")) {
        // También vale «Programa» en una columna y «Sede» en la otra.
        const campus = campusByName.get(fold(at(line, "Sede")));
        site = ctx.sites.find((s) => s.campusId === campus && fold(s.programName) === fold(programText));
      }
      if (!site) {
        problems.push({ line: n, message: programText ? `«${programText}» no es un programa en sede de la lista.` : "Con alcance Programa hay que elegir el programa." });
        return;
      }
      programId = site.programId;
      campusId = site.campusId;
      where = siteLabel(site);
    } else if (scope !== "global") {
      problems.push({ line: n, message: `El alcance «${at(line, "Alcance")}» no existe: es Global, Sede o Programa.` });
      return;
    }

    const numerator = numText ? parseFigure(numText) : null;
    const denominator = denText ? parseFigure(denText) : null;
    if ((numText && numerator === null) || (denText && denominator === null)) {
      problems.push({ line: n, message: "El numerador y el denominador tienen que ser números." });
      return;
    }
    if ((numerator === null) !== (denominator === null)) {
      problems.push({ line: n, message: "Llene numerador y denominador juntos, o ninguno." });
      return;
    }
    if (denominator === 0) {
      problems.push({ line: n, message: "El denominador no puede ser cero." });
      return;
    }
    const figure = notApplicable || numerator !== null ? null : parseFigure(valueText);
    if (!notApplicable && numerator === null && figure === null && indicator.measure !== "texto") {
      problems.push({ line: n, message: `«${valueText}» no es un número.` });
      return;
    }

    const key = `${indicator.id}|${year}|${programId ?? ""}|${campusId ?? ""}`;
    if (seen.has(key)) {
      problems.push({ line: n, message: `Repite la fila ${seen.get(key)}: misma ficha, año y alcance.` });
      return;
    }
    seen.set(key, n);

    const row: ImportRow = {
      indicator_code: indicator.code,
      year,
      program_id: programId,
      campus_id: campusId,
      value_num: notApplicable ? null : figure,
      numerator,
      denominator,
      value_text: notApplicable || figure !== null || numerator !== null ? "" : valueText,
      not_applicable: notApplicable,
      note: at(line, "Nota"),
      evidence_url: at(line, "Evidencia (URL)"),
    };
    if (row.evidence_url && !/^https?:\/\//i.test(row.evidence_url)) {
      problems.push({ line: n, message: "La evidencia tiene que ser un enlace que empiece por http." });
      return;
    }
    const before = existing.get(key);
    const computed = numerator !== null && denominator ? Math.round((numerator / denominator) * 100 * 10000) / 10000 : null;
    const incoming = row.value_num ?? computed;
    const state: RowState = !before
      ? "nueva"
      : before.notApplicable === row.not_applicable && (before.valueNum ?? null) === (incoming ?? null) && before.valueText === row.value_text
        ? "igual"
        : "cambia";
    rows.push({ line: n, row, state, label: `${indicator.code} · ${year} · ${where}` });
  });

  if (!rows.length && !problems.length) problems.push({ line: 2, message: "La hoja no trae cifras: llene al menos un valor." });
  return { rows, problems, empty };
}
