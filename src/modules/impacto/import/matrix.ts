/* =============================================================================
   Importador de la matriz de impacto (vr7 y siguientes).

   Lee las hojas de Investigación, Enseñanza y Extensión y devuelve dos cosas:
   los indicadores normalizados y la lista de hallazgos. La regla es una sola:
   **nada se corrige en silencio**. Lo que se puede normalizar sin perder
   información («2. PROCESO» → procesos, «Proyecto 1» → Pr1) se normaliza y
   además se reporta; lo que no («Por definir», una unidad que no encaja, un
   número donde va la unidad) queda vacío y se reporta con una sugerencia.

   Funciona igual en el navegador (la pantalla de Catálogo) y en Node (las
   pruebas): recibe un libro de ExcelJS ya cargado.

   Estructura que espera, según la especificación:
     · El encabezado es la fila cuya primera celda con contenido empieza por
       «NIVEL»; los datos empiezan en la columna B.
     · Una fila es un indicador si su primera celda con datos empieza por un
       dígito. Las filas de «NOTA» se ignoran.
     · PORTADA alimenta los catálogos (0065) y CONSOLIDADO no se importa.
   ========================================================================== */

import type { Workbook, Worksheet, CellValue } from "exceljs";
import type { FunctionId, Level } from "../data/types";

export type CatalogUnit = "numero" | "porcentaje" | "razon" | "puntaje" | "moneda_cop" | "horas";

export interface Finding {
  sheet: string;
  row: number | null;
  column: string | null;
  kind: FindingKind;
  value: string;
  suggestion: string;
}

export type FindingKind =
  | "hoja_faltante"
  | "encabezado_no_encontrado"
  | "columna_faltante"
  | "columna_desconocida"
  | "nivel_variante"
  | "nivel_no_reconocido"
  | "unidad_numerica"
  | "unidad_ambigua"
  | "unidad_no_mapeada"
  | "unidades_variantes"
  | "linea_base_por_definir"
  | "linea_base_no_existe"
  | "linea_base_texto"
  | "porcentaje_como_fraccion"
  | "anio_meta_distinto"
  | "meta_por_definir"
  | "responsable_multiple"
  | "pilar_por_definir"
  | "pilar_no_reconocido"
  | "dimension_por_definir"
  | "proyecto_formato"
  | "proyecto_por_definir"
  | "proyecto_no_reconocido"
  | "ods_por_definir"
  | "ods_fuera_de_portada"
  | "cesu_no_reconocido";

export const FINDING_LABEL: Record<FindingKind, string> = {
  hoja_faltante: "Hoja faltante",
  encabezado_no_encontrado: "Encabezado no encontrado",
  columna_faltante: "Columna faltante",
  columna_desconocida: "Columna desconocida",
  nivel_variante: "Nivel escrito de otra forma",
  nivel_no_reconocido: "Nivel no reconocido",
  unidad_numerica: "Número en la columna de unidad",
  unidad_ambigua: "Unidad con dos medidas",
  unidad_no_mapeada: "Unidad sin equivalente en el catálogo",
  unidades_variantes: "Variantes de unidad de medida",
  linea_base_por_definir: "Línea base «Por definir»",
  linea_base_no_existe: "Línea base «No existe»",
  linea_base_texto: "Línea base con texto",
  porcentaje_como_fraccion: "Porcentaje escrito como fracción",
  anio_meta_distinto: "Año de meta distinto",
  meta_por_definir: "Meta «Por definir»",
  responsable_multiple: "Varios responsables en una celda",
  pilar_por_definir: "Pilar «Por definir»",
  pilar_no_reconocido: "Pilar no reconocido",
  dimension_por_definir: "Dimensión «Por definir»",
  proyecto_formato: "Proyecto en otro formato",
  proyecto_por_definir: "Proyecto «Por definir»",
  proyecto_no_reconocido: "Proyecto no reconocido",
  ods_por_definir: "ODS «Por definir»",
  ods_fuera_de_portada: "ODS que no está en PORTADA",
  cesu_no_reconocido: "Referencia CESU no reconocida",
};

export interface ImportedIndicator {
  code: string;
  functionId: FunctionId;
  level: Level;
  catalogState: "oficial" | "sugerido";
  name: string;
  description: string;
  sheet: string;
  row: number;
  unitOriginal: string;
  unit: CatalogUnit | null;
  baseline: { year: number; value: number } | null;
  targets: { year: number; numeric: number | null; text: string | null }[];
  responsible: string;
  source: string;
  origin: string;
  dfmaPillarsReview: string;
  dfmaProjectsReview: string;
  dimension: string | null;
  alignments: { kind: "pilar" | "proyecto" | "ods" | "cesu" | "dimension"; code: string }[];
}

export interface MatrixImport {
  indicators: ImportedIndicator[];
  findings: Finding[];
  /** Fuentes de verificación distintas, para su catálogo. */
  sources: string[];
  /** Dimensiones distintas por función, para su catálogo. */
  dimensions: { functionId: FunctionId; name: string }[];
}

export const SHEETS: { match: RegExp; functionId: FunctionId; prefix: "I" | "E" | "X"; label: string }[] = [
  { match: /INVESTIGACI/i, functionId: "investigacion", prefix: "I", label: "Investigación" },
  { match: /ENSE[NÑ]ANZA/i, functionId: "ensenanza", prefix: "E", label: "Enseñanza" },
  { match: /EXTENSI/i, functionId: "extension", prefix: "X", label: "Extensión" },
];

/** Los ODS que la UDES declara prioritarios en PORTADA (0065). */
export const PORTADA_ODS = new Set([1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14, 15, 16, 17]);

const LEVELS: Record<string, Level> = { "1": "insumos", "2": "procesos", "3": "productos", "4": "impacto" };

/* --- Lectura de celdas ----------------------------------------------------------- */

/** El texto de una celda de ExcelJS, venga como texto enriquecido, fórmula o enlace. */
export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellText(value.result as CellValue);
    if ("text" in value) return String(value.text);
    if ("error" in value) return "";
  }
  return String(value);
}

/** Sin saltos de línea ni espacios dobles. */
export const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** Para comparar encabezados: sin tildes, en mayúsculas y en una línea. */
export const headerKey = (text: string) =>
  oneLine(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

const isUndefined = (text: string) => /^por definir$/i.test(oneLine(text));
const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map(oneLine)
    .filter(Boolean);

/** Un número de la matriz: acepta coma o punto decimal. Texto → null. */
export function parseNumber(text: string): number | null {
  const clean = oneLine(text).replace(/\s/g, "");
  if (!/^-?\d+([.,]\d+)?$/.test(clean)) return null;
  return Number(clean.replace(",", "."));
}

/* --- Columnas ----------------------------------------------------------------------- */

type Field =
  | "nivel"
  | "nombre"
  | "descripcion"
  | "unidad"
  | "lineaBase"
  | "meta"
  | "responsable"
  | "fuente"
  | "semaforo"
  | "dfmaPilares"
  | "pilares"
  | "dimension"
  | "dfmaProyectos"
  | "proyectos"
  | "ods"
  | "cesu"
  | "origen";

function fieldOf(header: string): Field | null {
  const h = headerKey(header);
  if (h.startsWith("NIVEL")) return "nivel";
  if (h === "INDICADOR") return "nombre";
  if (h.startsWith("DESCRIPCION")) return "descripcion";
  if (h.startsWith("UNIDAD")) return "unidad";
  if (h.startsWith("LINEA BASE")) return "lineaBase";
  if (/^META \d{4}$/.test(h)) return "meta";
  if (h.startsWith("RESPONSABLE")) return "responsable";
  if (h.startsWith("FUENTE")) return "fuente";
  if (h.startsWith("ESTADO")) return "semaforo";
  if (h.startsWith("REVISION DE LOS PILARES")) return "dfmaPilares";
  if (h.startsWith("PILARES")) return "pilares";
  if (h.startsWith("DIMENSION")) return "dimension";
  if (h.startsWith("REVISION DE PR")) return "dfmaProyectos";
  if (h.startsWith("PROYECTOS")) return "proyectos";
  if (h.startsWith("ODS")) return "ods";
  if (h.startsWith("REFERENCIA CESU")) return "cesu";
  if (h.startsWith("ORIGEN")) return "origen";
  return null;
}

const REQUIRED: Field[] = ["nivel", "nombre", "descripcion", "unidad", "lineaBase", "meta", "responsable", "fuente", "pilares", "dimension", "proyectos", "ods"];

/** Letra de columna de Excel: 2 → B. */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/* --- Unidad de medida --------------------------------------------------------------- */

export function mapUnit(original: string): { unit: CatalogUnit | null; problem: "numerica" | "ambigua" | "no_mapeada" | null } {
  const text = oneLine(original);
  if (!text) return { unit: null, problem: "no_mapeada" };
  if (parseNumber(text) !== null) return { unit: null, problem: "numerica" };
  const t = text.toLowerCase();
  // Dos medidas en una celda («N° proyectos / proporción»): no se elige una.
  const kinds = new Set<CatalogUnit>();
  for (const part of t.split("/")) {
    const p = part.trim();
    if (/^(%|porcentaje|proporci|puntos porcentuales)/.test(p)) kinds.add("porcentaje");
    else if (/horas/.test(p)) kinds.add("horas");
    else if (/^(puntaje|puntos de diferencia)/.test(p)) kinds.add("puntaje");
    else if (/(cop|pesos)/.test(p)) kinds.add("moneda_cop");
    else if (/^(n°|nº|número|numero)/.test(p)) kinds.add("numero");
    else if (/^(docente|año|semestre|posición nacional|categoría men)/.test(p) && kinds.size > 0) continue;
    else return { unit: null, problem: "no_mapeada" };
  }
  if (kinds.size === 1) return { unit: [...kinds][0], problem: null };
  return { unit: null, problem: "ambigua" };
}

/* --- Lectura de una hoja --------------------------------------------------------------- */

interface SheetResult {
  indicators: ImportedIndicator[];
  findings: Finding[];
  metaYear: number | null;
  headerRow: number | null;
}

function readSheet(sheet: Worksheet, spec: (typeof SHEETS)[number]): SheetResult {
  const findings: Finding[] = [];
  const indicators: ImportedIndicator[] = [];
  const name = sheet.name;
  const add = (row: number | null, column: string | null, kind: FindingKind, value: string, suggestion: string) =>
    findings.push({ sheet: name, row, column, kind, value, suggestion });

  // 1. El encabezado.
  let headerRow: number | null = null;
  const columns = new Map<number, { field: Field; header: string; year: number | null }>();
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (headerRow !== null) return;
    const values = (row.values as CellValue[]).slice(2);
    const first = values.map(cellText).find((v) => v.trim());
    if (!first || !headerKey(first).startsWith("NIVEL")) return;
    headerRow = rowNumber;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (col < 2) return;
      const header = cellText(cell.value);
      if (!header.trim()) return;
      const field = fieldOf(header);
      const year = Number(headerKey(header).match(/(20\d{2})/)?.[1] ?? NaN);
      if (field) columns.set(col, { field, header: oneLine(header), year: Number.isNaN(year) ? null : year });
      else add(rowNumber, columnLetter(col), "columna_desconocida", oneLine(header), "Revisar si es un campo nuevo de la matriz; no se importa.");
    });
  });

  if (headerRow === null) {
    add(null, null, "encabezado_no_encontrado", "", "La hoja debe tener una fila cuya primera celda con contenido empiece por «NIVEL».");
    return { indicators, findings, metaYear: null, headerRow };
  }
  for (const field of REQUIRED) {
    if (![...columns.values()].some((c) => c.field === field)) {
      add(headerRow, null, "columna_faltante", field, "Agregar la columna o revisar su encabezado.");
    }
  }

  const colOf = (field: Field) => [...columns.entries()].filter(([, c]) => c.field === field);
  const metaColumns = colOf("meta").map(([col, c]) => ({ col, year: c.year! })).sort((a, b) => a.year - b.year);
  const baseCol = colOf("lineaBase")[0];
  const baseYear = baseCol?.[1].year ?? 2023;

  // 2. Las filas.
  let count = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (headerRow === null || rowNumber <= headerRow) return;
    const firstValue = (row.values as CellValue[]).slice(2).map(cellText).find((v) => v.trim()) ?? "";
    const first = oneLine(firstValue);
    if (!/^\d/.test(first)) return; // títulos y notas: no son indicadores
    const get = (field: Field) => {
      const entry = colOf(field)[0];
      return entry ? cellText(row.getCell(entry[0]).value) : "";
    };
    const letter = (field: Field) => {
      const entry = colOf(field)[0];
      return entry ? columnLetter(entry[0]) : null;
    };

    count += 1;
    const code = `${spec.prefix}${String(count).padStart(2, "0")}`;

    // Nivel y estado.
    const levelRaw = oneLine(get("nivel"));
    const level = LEVELS[levelRaw.charAt(0)];
    if (!level) add(rowNumber, letter("nivel"), "nivel_no_reconocido", levelRaw, "Usar 1. INSUMOS, 2. PROCESOS, 3. PRODUCTOS o 4. IMPACTO REAL.");
    if (/^2\.\s*PROCESO\b/i.test(levelRaw) && !/PROCESOS/i.test(levelRaw)) {
      add(rowNumber, letter("nivel"), "nivel_variante", levelRaw, "Escribirlo «2. PROCESOS» como en el resto de la matriz. Se importó como procesos.");
    }
    const catalogState = /SUGERIDO/i.test(levelRaw) ? "sugerido" : "oficial";

    // Unidad.
    const unitOriginal = oneLine(get("unidad"));
    const mapped = mapUnit(unitOriginal);
    if (mapped.problem === "numerica") {
      add(rowNumber, letter("unidad"), "unidad_numerica", unitOriginal,
        "Es un número donde va la unidad: probablemente la línea base desplazada de columna. Definir la unidad y revisar la línea base.");
    } else if (mapped.problem === "ambigua") {
      add(rowNumber, letter("unidad"), "unidad_ambigua", unitOriginal, "La celda trae dos medidas: elegir una en la ficha técnica.");
    } else if (mapped.problem === "no_mapeada") {
      add(rowNumber, letter("unidad"), "unidad_no_mapeada", unitOriginal,
        "Elegir en la ficha: número, porcentaje, razón, puntaje, pesos o horas.");
    }

    // Línea base.
    const baseRaw = oneLine(get("lineaBase"));
    let baseline: ImportedIndicator["baseline"] = null;
    if (isUndefined(baseRaw)) {
      add(rowNumber, letter("lineaBase"), "linea_base_por_definir", baseRaw, "Registrar la línea base cuando exista; queda vacía.");
    } else if (/^no existe$/i.test(baseRaw)) {
      add(rowNumber, letter("lineaBase"), "linea_base_no_existe", baseRaw, "El indicador es nuevo: la primera medición servirá de línea base.");
    } else if (baseRaw) {
      const n = parseNumber(baseRaw);
      if (n === null) {
        add(rowNumber, letter("lineaBase"), "linea_base_texto", baseRaw, "Registrar el número solo; el texto no se importa como línea base.");
      } else {
        baseline = { year: baseYear, value: n };
        if (mapped.unit === "porcentaje" && n > 0 && n <= 1) {
          add(rowNumber, letter("lineaBase"), "porcentaje_como_fraccion", baseRaw,
            `La unidad es un porcentaje y el valor parece una fracción: ¿${(n * 100).toLocaleString("es-CO")} %? Se importó tal cual.`);
        }
      }
    }

    // Metas.
    const targets: ImportedIndicator["targets"] = [];
    for (const { col, year } of metaColumns) {
      const raw = oneLine(cellText(row.getCell(col).value));
      if (!raw) continue;
      if (isUndefined(raw)) {
        add(rowNumber, columnLetter(col), "meta_por_definir", raw, `Registrar la meta ${year} cuando exista.`);
        continue;
      }
      const n = parseNumber(raw);
      targets.push({ year, numeric: n, text: n === null ? raw : null });
    }

    // Responsable.
    const responsible = oneLine(get("responsable"));
    if (/[\/,;]|\sy\s/.test(responsible)) {
      add(rowNumber, letter("responsable"), "responsable_multiple", responsible,
        "Asignar en la ficha una sola vicerrectoría validadora; el texto se conserva como referencia.");
    }

    // Alineaciones.
    const alignments: ImportedIndicator["alignments"] = [];
    const pillarsRaw = get("pilares");
    for (const item of lines(pillarsRaw)) {
      if (isUndefined(item)) {
        add(rowNumber, letter("pilares"), "pilar_por_definir", item, "Alinear con al menos un pilar del PDI.");
        continue;
      }
      const digit = item.match(/^(\d)\s*[.)-]?/);
      if (digit && Number(digit[1]) >= 1 && Number(digit[1]) <= 6) alignments.push({ kind: "pilar", code: digit[1] });
      else add(rowNumber, letter("pilares"), "pilar_no_reconocido", item, "Escribir el pilar como «N. Nombre», con N de 1 a 6.");
    }

    const dimensionRaw = oneLine(get("dimension"));
    let dimension: string | null = null;
    if (isUndefined(dimensionRaw)) {
      add(rowNumber, letter("dimension"), "dimension_por_definir", dimensionRaw, "Elegir la dimensión de impacto de la función.");
    } else if (dimensionRaw) {
      dimension = dimensionRaw;
      alignments.push({ kind: "dimension", code: dimensionRaw });
    }

    for (const item of lines(get("proyectos"))) {
      if (isUndefined(item)) {
        add(rowNumber, letter("proyectos"), "proyecto_por_definir", item, "Alinear con un proyecto estratégico (Pr1 a Pr7).");
        continue;
      }
      const canonical = item.match(/^Pr\s*(\d)\s*[:.]/i);
      const long = item.match(/^Proyecto\s*(\d)/i);
      const n = Number((canonical ?? long)?.[1] ?? NaN);
      if (!Number.isNaN(n) && n >= 1 && n <= 7) {
        alignments.push({ kind: "proyecto", code: `Pr${n}` });
        if (long) add(rowNumber, letter("proyectos"), "proyecto_formato", item, `Se normalizó a Pr${n}. Usar un solo formato en la matriz.`);
      } else {
        const typo = item.match(/^r\s*(\d)\b/i);
        const suggestion = !Number.isNaN(n)
          ? `PORTADA define siete proyectos estratégicos (Pr1 a Pr7): «${item}» no existe. Corregir la alineación.`
          : typo
            ? `¿Falta la P? Parece Pr${typo[1]}. No se importó: corregirlo en la matriz.`
            : "No se reconoce el proyecto: escribirlo como «PrN: nombre», con N de 1 a 7.";
        add(rowNumber, letter("proyectos"), "proyecto_no_reconocido", item, suggestion);
      }
    }

    const odsRaw = oneLine(get("ods"));
    if (isUndefined(odsRaw)) {
      add(rowNumber, letter("ods"), "ods_por_definir", odsRaw, "Alinear con los ODS que correspondan.");
    } else {
      for (const match of odsRaw.matchAll(/ODS\s*(\d{1,2})/gi)) {
        const n = Number(match[1]);
        if (!alignments.some((a) => a.kind === "ods" && a.code === String(n))) alignments.push({ kind: "ods", code: String(n) });
        if (!PORTADA_ODS.has(n)) {
          add(rowNumber, letter("ods"), "ods_fuera_de_portada", `ODS ${n}`, "No está en la lista de ODS prioritarios de PORTADA: agregarlo allí o revisar la alineación.");
        }
      }
    }

    for (const item of lines(get("cesu"))) {
      if (isUndefined(item)) continue;
      const f = item.match(/Factor\s*(\d+)/i)?.[1];
      const c = item.match(/Caracter[ií]stica\s*(\d+)/i)?.[1];
      const a = item.match(/Aspecto\s*(\d+)/i)?.[1];
      if (f) alignments.push({ kind: "cesu", code: [`F${f}`, c && `C${c}`, a && `A${a}`].filter(Boolean).join("·") });
      else add(rowNumber, letter("cesu"), "cesu_no_reconocido", item, "Escribir la referencia como «Factor N · Característica N · Aspecto N».");
    }

    indicators.push({
      code,
      functionId: spec.functionId,
      level: level ?? "procesos",
      catalogState,
      name: oneLine(get("nombre")),
      description: get("descripcion").trim(),
      sheet: name,
      row: rowNumber,
      unitOriginal,
      unit: mapped.unit,
      baseline,
      targets,
      responsible,
      source: oneLine(get("fuente")),
      origin: oneLine(get("origen")),
      dfmaPillarsReview: get("dfmaPilares").trim(),
      dfmaProjectsReview: get("dfmaProyectos").trim(),
      dimension,
      alignments,
    });
  });

  return { indicators, findings, metaYear: metaColumns.find((m) => m.year !== 2028)?.year ?? null, headerRow };
}

/* --- El libro completo ------------------------------------------------------------------ */

export function importMatrix(book: Workbook): MatrixImport {
  const indicators: ImportedIndicator[] = [];
  const findings: Finding[] = [];
  const years: { sheet: string; year: number; headerRow: number | null }[] = [];

  for (const spec of SHEETS) {
    const sheet = book.worksheets.find((s) => spec.match.test(s.name) && !/CONSOLIDADO|PORTADA/i.test(s.name));
    if (!sheet) {
      findings.push({ sheet: spec.label, row: null, column: null, kind: "hoja_faltante", value: spec.label, suggestion: "El libro debe traer la hoja de la función." });
      continue;
    }
    const result = readSheet(sheet, spec);
    indicators.push(...result.indicators);
    findings.push(...result.findings);
    if (result.metaYear) years.push({ sheet: sheet.name, year: result.metaYear, headerRow: result.headerRow });
  }

  // Años de meta: se reporta la hoja que se aparta de la mayoría.
  const tally = new Map<number, number>();
  years.forEach((y) => tally.set(y.year, (tally.get(y.year) ?? 0) + 1));
  const usual = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const y of years) {
    if (y.year !== usual) {
      findings.push({
        sheet: y.sheet,
        row: y.headerRow,
        column: null,
        kind: "anio_meta_distinto",
        value: `META ${y.year}`,
        suggestion: `Las otras hojas usan META ${usual}. Se importó con el año del encabezado (${y.year}).`,
      });
    }
  }

  // Variantes de unidad: un solo hallazgo resumen con la lista.
  const units = [...new Set(indicators.map((i) => i.unitOriginal).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  findings.push({
    sheet: "Todas",
    row: null,
    column: "UNIDAD DE MEDIDA",
    kind: "unidades_variantes",
    value: `${units.length} variantes: ${units.join(" | ")}`,
    suggestion: "Cada indicador debe quedar con una de seis unidades: número, porcentaje, razón, puntaje, pesos u horas.",
  });

  const sources = [...new Set(indicators.map((i) => i.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const dimensionKeys = new Set<string>();
  const dimensions: MatrixImport["dimensions"] = [];
  for (const i of indicators) {
    if (!i.dimension) continue;
    const key = `${i.functionId}|${i.dimension}`;
    if (dimensionKeys.has(key)) continue;
    dimensionKeys.add(key);
    dimensions.push({ functionId: i.functionId, name: i.dimension });
  }

  return { indicators, findings, sources, dimensions };
}

/** Conteo de hallazgos por tipo, para la pantalla y las pruebas. */
export function countFindings(findings: Finding[]): Partial<Record<FindingKind, number>> {
  const out: Partial<Record<FindingKind, number>> = {};
  for (const f of findings) out[f.kind] = (out[f.kind] ?? 0) + 1;
  return out;
}
