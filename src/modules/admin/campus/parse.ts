/* =============================================================================
   Lectura del libro de indicadores por campus.

   Traduce `Indicadores_Campus_Pilares_UDES_2025.xlsx` a filas de
   `campus_facts` y `campus_indicators`. Se hace en el navegador, en la pantalla
   de administración: quien sube el archivo ve qué se va a guardar antes de
   guardarlo, y un archivo con la columna cambiada falla ahí y no a mitad de una
   inserción.

   Por qué `read-excel-file` y no SheetJS: el paquete `xlsx` de npm está
   congelado en 0.18.5 desde 2022 —el proyecto movió su distribución a un CDN
   propio— y esa versión arrastra CVE-2023-30533 (prototype pollution) y
   CVE-2024-22363 (ReDoS), ninguno corregido en npm. El vector es exactamente
   este: alguien sube un .xlsx manipulado. `read-excel-file` está mantenido, es
   MIT y hace justo esto: leer a filas.

   El módulo se carga bajo demanda, así que el portal público no lo descarga.

   ---------------------------------------------------------------------------
   Lo que NO hace este lector, a propósito:

   · No calcula el cumplimiento ni el estado. Eso lo hace el disparador de la
     0017, en la base, para que los tres campus se midan con la misma vara
     aunque alguien inserte filas por otra vía.
   · No recalcula la variación de los indicadores. Misma razón.
   · No decide si una cifra es monetaria: `is_monetary` es columna generada.
   ========================================================================== */

// El paquete no tiene entrada raíz: expone `/browser`, `/node` y `/universal`.
// Aquí va la de navegador, que es donde se sube el archivo.
import readXlsxFile from "read-excel-file/browser";
import type { Sheet } from "read-excel-file/browser";

/* --- Las hojas y sus columnas ----------------------------------------------
   Los nombres son los del libro. Si cambian, el lector avisa con el nombre
   exacto que esperaba en vez de devolver cero filas en silencio.
   -------------------------------------------------------------------------- */

/* Las hojas se buscan por su número de orden, no por su nombre completo.
   Cada vigencia rebautiza las suyas —el libro de 2025 trae
   "06_Hechos_Acciones_Metas" y el de 2024 "06_Hechos_Logros_2024"— pero la
   numeración se mantiene, y es lo único estable entre libros. El nombre
   completo queda como etiqueta para los mensajes. */
const SHEET_FACTS = { prefix: "06_", label: "06_Hechos (acciones y metas)" };
const SHEET_INDICATORS = { prefix: "07_", label: "07_Indicadores comparativos" };
const SHEET_CAMPUS = { prefix: "04_", label: "04_Dim_Campus" };

/** La hoja cuyo nombre empieza por el número pedido. */
function findSheet(
  sheets: Map<string, unknown[][]>,
  spec: { prefix: string; label: string },
): unknown[][] | undefined {
  for (const [name, rows] of sheets) {
    if (name.startsWith(spec.prefix)) return rows;
  }
  return undefined;
}

/**
 * El valor de la primera de estas columnas que exista.
 *
 * Los libros no llaman igual a la misma cosa: la acción es `ACCION_META` en el
 * de 2025 y `LOGRO` en el de 2024, porque ese año los campus reportaron logros
 * sin meta programada. Es el mismo dato con dos nombres, así que se aceptan
 * los dos en vez de obligar a editar el archivo.
 */
function pick(index: Map<string, number>, row: unknown[], names: string[]): unknown {
  for (const name of names) {
    const at = index.get(name);
    if (at !== undefined) return row[at];
  }
  return undefined;
}

/** Al menos una de estas columnas tiene que estar. */
function requireAny(
  index: Map<string, number>,
  names: string[],
  sheet: string,
  issues: ParseIssue[],
): boolean {
  if (names.some((n) => index.has(n))) return true;
  issues.push({
    level: "error",
    sheet,
    row: HEADER_ROW,
    message: `Falta la columna de la acción: se esperaba ${names.join(" o ")}.`,
  });
  return false;
}

/** La fila de encabezados no es la primera: el libro lleva título y subtítulo. */
const HEADER_ROW = 4; // 1-indexado, como lo cuenta Excel

/**
 * `read-excel-file` v9 devuelve siempre el libro entero como `[{sheet, data}]`
 * —su opción `sheet` no filtra— así que se lee una sola vez y las hojas se
 * eligen por nombre. Comprobado contra el libro real: 14 hojas, encabezado en
 * la fila 4, 126 hechos y 60 indicadores.
 */
async function readSheets(file: File): Promise<Map<string, unknown[][]>> {
  const book = (await readXlsxFile(file)) as unknown as Sheet[];
  return new Map(book.map((s) => [s.sheet, s.data as unknown[][]]));
}

export interface ParsedFact {
  source_code: string;
  campus_name: string;
  year: number;
  line_code: string;
  reported_pillar: string;
  reported_axis: string;
  reported_function: string;
  reported_state: string;
  objective: string;
  action: string;
  unit: string;
  target_value: number | null;
  actual_value: number | null;
  confidence: "alta" | "media" | "baja";
  note: string;
  evidence: string;
  source_document: string;
  source_page: number | null;
  position: number;
}

export interface ParsedIndicator {
  source_code: string;
  campus_name: string;
  line_code: string;
  name: string;
  unit: string;
  base_year: number;
  base_value: number | null;
  last_year: number;
  last_value: number | null;
  reported_variation: string;
  evidence: string;
  source_document: string;
  confidence: "alta" | "media" | "baja";
  note: string;
  position: number;
}

export interface ParsedCampus {
  name: string;
  declares_targets: boolean;
  source_document: string;
}

export interface ParseIssue {
  /** `error` impide guardar; `aviso` solo se muestra. */
  level: "error" | "aviso";
  sheet: string;
  row: number | null;
  message: string;
}

export interface ParseResult {
  facts: ParsedFact[];
  indicators: ParsedIndicator[];
  campuses: ParsedCampus[];
  issues: ParseIssue[];
  /** Vigencias encontradas en los hechos. */
  years: number[];
}

/* --- Utilidades de celda ---------------------------------------------------- */

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Un número de la hoja, en cualquiera de las formas en que la gente lo escribe.
 *
 * La versión anterior hacía `Number(String(v).replace(",", "."))`, que solo
 * acierta con el caso simple. Con "1.234,5" —el formato de miles de aquí—
 * producía "1.234.5", que es NaN, y la celda se guardaba como *vacía*: el dato
 * no se perdía con un error, se perdía en silencio, que es peor.
 *
 * Se aceptan además el símbolo de moneda, el porcentaje y el paréntesis
 * contable, que significa negativo. Lo que no se toca es el signo: un valor
 * reportado puede ser negativo con toda legitimidad —una reducción, una
 * variación a la baja— y forzarlo a positivo sería inventarse el dato.
 */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let raw = String(value).trim();
  if (raw === "" || raw === "-" || raw === "—" || raw === "N/A" || raw === "n/a") return null;

  // "(1.234)" es -1234 en notación contable.
  const accounting = /^\((.*)\)$/.exec(raw);
  const negative = accounting !== null || raw.startsWith("-");
  if (accounting) raw = accounting[1];

  // Fuera todo lo que no es dígito ni separador: $, %, espacios, el signo.
  const digits = raw.replace(/[^\d.,]/g, "");
  if (digits === "") return null;

  // Cuál de los dos separadores es el decimal: el último que aparezca, salvo
  // que agrupe de tres en tres —"1.234" son mil doscientos treinta y cuatro,
  // no uno con doscientos treinta y cuatro—.
  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  let normalized: string;

  if (lastComma === -1 && lastDot === -1) {
    normalized = digits;
  } else if (lastComma > lastDot) {
    normalized = digits.replace(/\./g, "").replace(",", ".");
  } else {
    // Solo hay puntos. Tres cifras detrás del último y ninguna coma en la
    // celda: es separador de miles, no decimal. "1.234" son mil doscientos
    // treinta y cuatro —es lo que significa en los informes de aquí—, y leerlo
    // como uno coma doscientos treinta y cuatro convertiría un presupuesto en
    // calderilla sin que nadie lo notara.
    const decimals = digits.length - lastDot - 1;
    normalized =
      decimals === 3 && !digits.includes(",")
        ? digits.replace(/\./g, "")
        : digits.replace(/,/g, "");
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/** "Alta" / "Media" / "Baja" → el enum de la base. Lo desconocido es tentativo. */
function confidence(value: unknown): "alta" | "media" | "baja" {
  const v = text(value).toLowerCase();
  if (v.startsWith("alta")) return "alta";
  if (v.startsWith("media")) return "media";
  return "baja";
}

/**
 * Índice de columnas por nombre de encabezado.
 *
 * Se busca por nombre y no por posición: el libro puede ganar una columna sin
 * que eso rompa la carga, y si pierde una que hace falta, el error dice cuál.
 */
function indexHeaders(header: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((cell, i) => {
    const name = text(cell).toUpperCase();
    if (name) map.set(name, i);
  });
  return map;
}

function requireColumns(
  index: Map<string, number>,
  needed: string[],
  sheet: string,
  issues: ParseIssue[],
): boolean {
  const missing = needed.filter((c) => !index.has(c));
  if (missing.length > 0) {
    issues.push({
      level: "error",
      sheet,
      row: HEADER_ROW,
      message: `Faltan columnas: ${missing.join(", ")}. El libro no tiene la forma esperada.`,
    });
    return false;
  }
  return true;
}

/* --- El lector --------------------------------------------------------------- */

export async function parseWorkbook(file: File): Promise<ParseResult> {
  const issues: ParseIssue[] = [];
  const facts: ParsedFact[] = [];
  const indicators: ParsedIndicator[] = [];
  const campuses: ParsedCampus[] = [];

  const sheets = await readSheets(file);

  /* --- Cómo reporta cada sede ---------------------------------------------- */
  {
    const rows = findSheet(sheets, SHEET_CAMPUS) ?? [];
    const header = rows[HEADER_ROW - 1] ?? [];
    const ix = indexHeaders(header);
    if (requireColumns(ix, ["CAMPUS", "DECLARA_METAS"], SHEET_CAMPUS.label, issues)) {
      for (const row of rows.slice(HEADER_ROW)) {
        const name = text(row[ix.get("CAMPUS")!]);
        if (!name) continue;
        campuses.push({
          name,
          // "Sí" / "No" en el libro. Es el campo que decide si el cumplimiento
          // de esa sede es calculable, así que se lee explícitamente.
          declares_targets: text(row[ix.get("DECLARA_METAS")!]).toLowerCase().startsWith("s"),
          source_document: text(row[ix.get("DOCUMENTO_FUENTE") ?? -1]),
        });
      }
    }
  }

  /* --- Los hechos ----------------------------------------------------------- */
  const factRows = findSheet(sheets, SHEET_FACTS);
  if (!factRows) {
    issues.push({
      level: "error",
      sheet: SHEET_FACTS.label,
      row: null,
      message: `El libro no tiene la hoja "${SHEET_FACTS.label}".`,
    });
  } else {
    const ix = indexHeaders(factRows[HEADER_ROW - 1] ?? []);
    // `ACCION_META` y `LOGRO` son la misma columna con distinto nombre según la
    // vigencia. Las obligatorias se piden por separado de la de la acción, que
    // se acepta con cualquiera de los dos nombres.
    const needed = ["ID", "CAMPUS", "ANIO", "COD_LINEA"];
    const ACTION_COLUMNS = ["ACCION_META", "LOGRO"];

    if (
      requireColumns(ix, needed, SHEET_FACTS.label, issues) &&
      requireAny(ix, ACTION_COLUMNS, SHEET_FACTS.label, issues)
    ) {
      const get = (row: unknown[], col: string) => row[ix.get(col) ?? -1];

      // El libro de 2024 no trae VALOR_PROGRAMADO: ese año los campus
      // reportaron logros sin meta. Se avisa una vez —no por fila— y las filas
      // entran como logro, que es lo que la base hace con una meta nula.
      if (!ix.has("VALOR_PROGRAMADO")) {
        issues.push({
          level: "aviso",
          sheet: SHEET_FACTS.label,
          row: HEADER_ROW,
          message:
            "El libro no trae VALOR_PROGRAMADO: sus filas se guardan como logros sin meta, y no entran en los promedios de cumplimiento.",
        });
      }

      factRows.slice(HEADER_ROW).forEach((row, i) => {
        const excelRow = HEADER_ROW + i + 1;
        const action = text(pick(ix, row, ACTION_COLUMNS));
        if (!action) return; // fila vacía de relleno

        const lineCode = text(get(row, "COD_LINEA"));
        const campusName = text(get(row, "CAMPUS"));
        const year = num(get(row, "ANIO"));

        // La regla del módulo: sin línea no se guarda. Se avisa por fila para
        // que se pueda corregir el libro, no se descarta en silencio.
        if (!lineCode) {
          issues.push({
            level: "error",
            sheet: SHEET_FACTS.label,
            row: excelRow,
            message: `"${action.slice(0, 60)}" no tiene COD_LINEA: no se puede anclar al plan.`,
          });
          return;
        }
        if (!campusName || year === null) {
          issues.push({
            level: "error",
            sheet: SHEET_FACTS.label,
            row: excelRow,
            message: "Falta CAMPUS o ANIO.",
          });
          return;
        }

        facts.push({
          source_code: text(get(row, "ID")),
          campus_name: campusName,
          year,
          line_code: lineCode,
          reported_pillar: text(get(row, "PILAR_REPORTADO")),
          reported_axis: text(get(row, "EJE_REPORTADO")),
          reported_function: text(get(row, "FUNCION")),
          reported_state: text(pick(ix, row, ["ESTADO_REPORTADO"])),
          objective: text(get(row, "OBJETIVO")),
          action,
          unit: text(get(row, "UNIDAD")),
          target_value: num(pick(ix, row, ["VALOR_PROGRAMADO"])),
          actual_value: num(get(row, "VALOR_ALCANZADO")),
          confidence: confidence(get(row, "CONFIANZA_MAPEO")),
          note: text(get(row, "OBSERVACION")),
          evidence: text(get(row, "FUENTE_VERIFICACION")),
          source_document: text(get(row, "DOCUMENTO_FUENTE")),
          source_page: num(get(row, "PAGINA")),
          position: facts.length + 1,
        });
      });
    }
  }

  /* --- Los indicadores comparativos ----------------------------------------- */
  const indRows = findSheet(sheets, SHEET_INDICATORS);
  if (!indRows) {
    issues.push({
      level: "aviso",
      sheet: SHEET_INDICATORS.label,
      row: null,
      message: `El libro no tiene la hoja "${SHEET_INDICATORS.label}": se cargarán solo los hechos.`,
    });
  } else {
    const ix = indexHeaders(indRows[HEADER_ROW - 1] ?? []);
    if (requireColumns(ix, ["ID", "CAMPUS", "INDICADOR", "COD_LINEA"], SHEET_INDICATORS.label, issues)) {
      const get = (row: unknown[], col: string) => row[ix.get(col) ?? -1];

      // Los años viven en el nombre de la columna (VALOR_2024 / VALOR_2025), no
      // en una celda: se leen del encabezado para que el libro de 2026 funcione
      // sin tocar este archivo.
      const yearCols = [...ix.keys()]
        .map((k) => ({ key: k, year: Number(/^VALOR_(\d{4})$/.exec(k)?.[1]) }))
        .filter((c) => Number.isFinite(c.year))
        .sort((a, b) => a.year - b.year);

      if (yearCols.length < 2) {
        issues.push({
          level: "aviso",
          sheet: SHEET_INDICATORS.label,
          row: HEADER_ROW,
          message: "No se encontraron dos columnas VALOR_AAAA: no hay serie que comparar.",
        });
      } else {
        const base = yearCols[0];
        const last = yearCols[yearCols.length - 1];

        indRows.slice(HEADER_ROW).forEach((row, i) => {
          const excelRow = HEADER_ROW + i + 1;
          const name = text(get(row, "INDICADOR"));
          if (!name) return;

          const lineCode = text(get(row, "COD_LINEA"));
          if (!lineCode) {
            issues.push({
              level: "error",
              sheet: SHEET_INDICATORS.label,
              row: excelRow,
              message: `"${name.slice(0, 60)}" no tiene COD_LINEA.`,
            });
            return;
          }

          indicators.push({
            source_code: text(get(row, "ID")),
            campus_name: text(get(row, "CAMPUS")),
            line_code: lineCode,
            name,
            unit: text(get(row, "UNIDAD")),
            base_year: base.year,
            base_value: num(row[ix.get(base.key)!]),
            last_year: last.year,
            last_value: num(row[ix.get(last.key)!]),
            reported_variation: text(get(row, "VARIACION_REPORTADA")),
            evidence: text(get(row, "FUENTE_VERIFICACION")),
            source_document: text(get(row, "DOCUMENTO_FUENTE")),
            confidence: confidence(get(row, "CONFIANZA_MAPEO")),
            note: text(get(row, "OBSERVACION")),
            position: indicators.length + 1,
          });
        });
      }
    }
  }

  const years = [...new Set(facts.map((f) => f.year))].sort();

  // Un libro con varias vigencias mezcladas no se puede cargar como un lote: el
  // lote es (campus, año). Mejor decirlo aquí que fallar contra el UNIQUE.
  if (years.length > 1) {
    issues.push({
      level: "aviso",
      sheet: SHEET_FACTS.label,
      row: null,
      message: `El libro trae varias vigencias (${years.join(", ")}). Se creará un lote por sede y año.`,
    });
  }

  return { facts, indicators, campuses, issues, years };
}
