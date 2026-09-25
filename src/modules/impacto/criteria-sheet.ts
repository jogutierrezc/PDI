/* =============================================================================
   Impacto · el diccionario del motor en Excel.

   Una hoja «Criterios» con cuatro columnas: Destino (Pilar u ODS), Número (el
   pilar por su posición 1–6 o su numeral I–VI; el ODS de 1 a 17), Término y
   Peso (de 0,5 a 10; vacío es 1). Se descarga el diccionario vigente, se
   corrige y se vuelve a cargar: la carga reemplaza el diccionario entero.

   Cada fila con problema se dice con su número de fila y no entra; si alguna
   falla, no se reemplaza nada.
   ========================================================================== */

import type { Workbook } from "exceljs";
import type { CriterionRow, Pillar } from "./model";

export const CRITERIA_SHEET = "Criterios";
export const CRITERIA_HEADERS = ["Destino", "Número", "Término", "Peso"];

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface CriteriaParse {
  criteria: Omit<CriterionRow, "id">[];
  problems: { row: number; message: string }[];
}

export function parseCriteriaTable(table: string[][], pillars: Pillar[]): CriteriaParse {
  const criteria: Omit<CriterionRow, "id">[] = [];
  const problems: CriteriaParse["problems"] = [];
  const header = (table[0] ?? []).map((h) => fold(clean(h)));
  const col = (name: string) => header.indexOf(fold(name));
  const [cTarget, cKey, cTerm, cWeight] = CRITERIA_HEADERS.map(col);
  if ([cTarget, cKey, cTerm].some((c) => c < 0)) {
    return { criteria, problems: [{ row: 1, message: `La primera fila debe traer las columnas ${CRITERIA_HEADERS.join(", ")}.` }] };
  }
  const seen = new Set<string>();
  table.slice(1).forEach((line, index) => {
    const row = index + 2;
    const target = fold(clean(line[cTarget]));
    const keyText = clean(line[cKey]).toUpperCase();
    const term = clean(line[cTerm]);
    const weightText = clean(cWeight >= 0 ? line[cWeight] : "").replace(",", ".");
    if (!target && !keyText && !term) return;
    if (target !== "pilar" && target !== "ods") {
      problems.push({ row, message: "El destino tiene que ser «Pilar» u «ODS»." });
      return;
    }
    const weight = weightText ? Number(weightText) : 1;
    if (!Number.isFinite(weight) || weight <= 0 || weight > 10) {
      problems.push({ row, message: "El peso va de 0,5 a 10." });
      return;
    }
    if (term.length < 2 || term.length > 120) {
      problems.push({ row, message: "El término tiene que tener entre 2 y 120 caracteres." });
      return;
    }
    let pillarId: string | null = null;
    let sdg: number | null = null;
    if (target === "pilar") {
      const position = ROMAN[keyText] ?? Number(keyText);
      const pillar = pillars.find((p) => p.position === position);
      if (!pillar) {
        problems.push({ row, message: `No hay pilar «${keyText}»: van del 1 al 6 (o I a VI).` });
        return;
      }
      pillarId = pillar.id;
    } else {
      sdg = Number(keyText);
      if (!Number.isInteger(sdg) || sdg < 1 || sdg > 17) {
        problems.push({ row, message: `No hay ODS «${keyText}»: van del 1 al 17.` });
        return;
      }
    }
    const id = `${target}:${pillarId ?? sdg}:${fold(term)}`;
    if (seen.has(id)) {
      problems.push({ row, message: `«${term}» ya está para ese mismo destino.` });
      return;
    }
    seen.add(id);
    criteria.push({ target: target as "pilar" | "ods", pillarId, sdg, term, weight });
  });
  if (!criteria.length && !problems.length) problems.push({ row: 2, message: "La hoja no trae criterios." });
  return { criteria, problems };
}

/** Llena un libro con el diccionario vigente, listo para corregir y volver a cargar. */
export function fillCriteriaWorkbook(book: Workbook, criteria: CriterionRow[], pillars: Pillar[]) {
  const sheet = book.addWorksheet(CRITERIA_SHEET);
  sheet.columns = [
    { header: CRITERIA_HEADERS[0], key: "target", width: 10 },
    { header: CRITERIA_HEADERS[1], key: "key", width: 9 },
    { header: CRITERIA_HEADERS[2], key: "term", width: 42 },
    { header: CRITERIA_HEADERS[3], key: "weight", width: 8 },
  ];
  sheet.getRow(1).font = { bold: true };
  const sorted = [...criteria].sort((a, b) => {
    const ka = a.target === "pilar" ? pillars.find((p) => p.id === a.pillarId)?.position ?? 0 : a.sdg ?? 0;
    const kb = b.target === "pilar" ? pillars.find((p) => p.id === b.pillarId)?.position ?? 0 : b.sdg ?? 0;
    return a.target.localeCompare(b.target) * -1 || ka - kb || b.weight - a.weight || a.term.localeCompare(b.term, "es");
  });
  for (const c of sorted) {
    sheet.addRow({
      target: c.target === "pilar" ? "Pilar" : "ODS",
      key: c.target === "pilar" ? pillars.find((p) => p.id === c.pillarId)?.position ?? "" : c.sdg,
      term: c.term,
      weight: c.weight,
    });
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const help = book.addWorksheet("Cómo se usa");
  [
    "Cada fila es un criterio: si el término aparece en la ficha del indicador, suma su peso al destino.",
    "Destino: Pilar u ODS. Número: el pilar del 1 al 6 (o I a VI); el ODS del 1 al 17.",
    "Peso: 3 lo define, 2 lo sugiere, 1 lo acompaña (hasta 10). Vacío cuenta como 1.",
    "Una frase de varias palabras solo cuenta si aparecen seguidas. No importan tildes, mayúsculas ni plurales.",
    "Cargar esta hoja reemplaza el diccionario entero. Si alguna fila tiene un problema, no se reemplaza nada.",
  ].forEach((line) => help.addRow([line]));
  help.getColumn(1).width = 110;
}
