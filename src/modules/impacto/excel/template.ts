/* =============================================================================
   Plantilla Excel de un programa y un periodo.

   Cuatro hojas, como pide la especificación:
     · INSTRUCCIONES  solo lectura: programa, periodo, corte, pasos y colores.
     · REGISTROS      una fila por asignación, prellenada con lo que ya está
                      en la base. Amarillo lo que se escribe, gris lo demás.
     · CATALOGOS      oculta: las listas de «Sí/No» y «No aplica/Sin dato».
     · CONTROL        muy oculta y protegida: id de la plantilla, programa,
                      periodo, versión del catálogo, fecha, asignaciones y la
                      huella HMAC que calcula la base. Si alguien la toca, la
                      importación se rechaza.

   Qué celda se desbloquea sale de las mismas reglas que la captura en línea
   (sheet-model.ts): una fila enviada o validada queda toda bloqueada; una
   razón abre numerador y denominador; un puntaje, valor y n.

   ExcelJS se recibe como parámetro: el navegador lo carga en caliente y las
   pruebas lo importan directo, y así este módulo no lo arrastra al bundle.
   ========================================================================== */

import type ExcelJSType from "exceljs";
import type { Workbook, Worksheet } from "exceljs";
import { draftOf } from "../data/capture-db";
import type { CaptureRow } from "../data/capture-db";
import { isEditable } from "../capture/sheet-model";
import type { ColumnKey, SheetDraft } from "../capture/sheet-model";

export type ExcelJSModule = typeof ExcelJSType;

/** Lo que devuelve la base al firmar (imp_sign_template). */
export interface SignedTemplate {
  templateId: string;
  programId: string;
  periodId: string;
  periodCode: string;
  cutoffProgram: string;
  catalogVersionId: string;
  catalogVersion: number;
  generatedAt: string;
  assignmentIds: string[];
  signature: string;
  password: string;
}

export const SHEET = {
  instructions: "INSTRUCCIONES",
  records: "REGISTROS",
  catalogs: "CATALOGOS",
  control: "CONTROL",
} as const;

/** Las columnas A–U de REGISTROS, en el orden de la especificación. */
export const TEMPLATE_COLUMNS: { letter: string; header: string; width: number; key?: ColumnKey }[] = [
  { letter: "A", header: "id_asignacion", width: 38 },
  { letter: "B", header: "Código", width: 9 },
  { letter: "C", header: "Indicador", width: 48 },
  { letter: "D", header: "Función · Nivel", width: 24 },
  { letter: "E", header: "Sede", width: 14 },
  { letter: "F", header: "Tipo", width: 14 },
  { letter: "G", header: "Qué va en el numerador", width: 36 },
  { letter: "H", header: "Qué va en el denominador", width: 36 },
  { letter: "I", header: "Valor periodo anterior", width: 14 },
  { letter: "J", header: "Numerador o valor", width: 14, key: "numerator" },
  { letter: "K", header: "Denominador", width: 14, key: "denominator" },
  { letter: "L", header: "n respuestas", width: 12, key: "n" },
  { letter: "M", header: "Numerador grupo comparación", width: 16, key: "numComparison" },
  { letter: "N", header: "Denominador grupo comparación", width: 16, key: "denComparison" },
  { letter: "O", header: "Confirma precargado (Sí/No)", width: 16, key: "confirm" },
  { letter: "P", header: "No aplica / Sin dato", width: 16, key: "noData" },
  { letter: "Q", header: "Justificación", width: 40, key: "justification" },
  { letter: "R", header: "Observaciones", width: 32, key: "observations" },
  { letter: "S", header: "Enlace de evidencia", width: 32, key: "evidenceUrl" },
  { letter: "T", header: "Valor calculado", width: 14 },
  { letter: "U", header: "Estado actual", width: 22 },
];

/** La columna de la plantilla de cada campo editable. */
export const LETTER_OF: Partial<Record<ColumnKey, string>> = Object.fromEntries(
  TEMPLATE_COLUMNS.filter((c) => c.key).map((c) => [c.key, c.letter]),
);

export const CONTROL_KEYS = ["id_plantilla", "programa_id", "periodo_id", "version_catalogo_id", "generada_en", "asignaciones", "huella"] as const;

const YELLOW = "FFFFF2CC";
const GRAY = "FFE7E6E6";
const HEADER = "FF0A2D63";
const STATE_LABEL: Record<string, string> = {
  borrador: "Borrador",
  enviado: "Enviado a decanatura",
  aprobado_decanatura: "Aprobado por decanatura",
  validado: "Validado",
  devuelto_programa: "Devuelto al programa",
  devuelto_decanatura: "Devuelto a decanatura",
};
const FUNCTION_LABEL = { investigacion: "Investigación", ensenanza: "Enseñanza", extension: "Extensión" } as const;
const LEVEL_LABEL = { insumos: "Insumos", procesos: "Procesos", productos: "Productos", impacto: "Impacto real" } as const;
const CALC_LABEL = { conteo: "Conteo", razon: "Razón", puntaje: "Puntaje", comparacion: "Comparación", texto: "Texto" } as const;

/**
 * Las celdas que la plantilla deja abiertas en una fila. En Excel no hay
 * «bloquear si marcó No aplica»: se abre todo lo que el tipo permite, y la
 * importación valida el resultado con el mismo servicio de la captura.
 */
export function openKeys(row: CaptureRow): ColumnKey[] {
  const potential: SheetDraft = { ...draftOf(row), noAplica: null, confirma: false, observations: "", evidenceUrl: "" };
  return TEMPLATE_COLUMNS.flatMap((c) => (c.key && isEditable(row, potential, c.key) ? [c.key] : []));
}

function valueCell(row: CaptureRow, key: ColumnKey): string | number | null {
  const n = (v: number | null) => (v === null || v === undefined ? null : Number(v));
  switch (key) {
    case "numerator":
      return n(row.numerator);
    case "denominator":
      return n(row.denominator);
    case "n":
      return n(row.n_responses);
    case "numComparison":
      return n(row.num_comparison);
    case "denComparison":
      return n(row.den_comparison);
    case "confirm":
      return row.confirms_preloaded === true ? "Sí" : row.confirms_preloaded === false ? "No" : null;
    case "noData":
      return row.no_data === "no_aplica" ? "No aplica" : row.no_data === "sin_dato" ? "Sin dato" : null;
    case "justification":
      return row.justification || null;
    case "observations":
      return row.observations || null;
    default:
      return null;
  }
}

/** La fórmula del valor calculado de la fila r (columna T). */
function formulaFor(row: CaptureRow, r: number): string {
  if (row.calc_type === "razon" || row.calc_type === "comparacion") {
    return `IF(P${r}<>"","",IF(AND(ISNUMBER(J${r}),ISNUMBER(K${r}),K${r}>0),J${r}/K${r}*${Number(row.factor) || 1},""))`;
  }
  if (row.calc_type === "texto") return `""`;
  return `IF(P${r}<>"","",IF(ISNUMBER(J${r}),J${r},""))`;
}

function protect(sheet: Worksheet, password: string) {
  return sheet.protect(password, {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: true,
    formatRows: true,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  });
}

export interface TemplateInput {
  signed: SignedTemplate;
  programName: string;
  rows: CaptureRow[];
}

/** Arma el libro. Las filas van en el orden de las asignaciones firmadas. */
export async function buildTemplate(ExcelJS: ExcelJSModule, { signed, programName, rows }: TemplateInput): Promise<Workbook> {
  const book = new ExcelJS.Workbook();
  book.creator = "Planeación Institucional · UDES";
  book.created = new Date();

  const ordered = rows
    .filter((r) => signed.assignmentIds.includes(r.assignment_id))
    .sort((a, b) => a.function_id.localeCompare(b.function_id) || a.code.localeCompare(b.code) || (a.campus_name ?? "").localeCompare(b.campus_name ?? ""));

  // --- INSTRUCCIONES ----------------------------------------------------------
  const intro = book.addWorksheet(SHEET.instructions, { properties: { tabColor: { argb: HEADER } } });
  intro.columns = [{ width: 30 }, { width: 90 }];
  const cutoff = new Date(`${signed.cutoffProgram}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const lines: [string, string][] = [
    ["Plantilla de reporte de impacto", ""],
    ["Programa", programName],
    ["Periodo", signed.periodCode],
    ["Fecha de corte para programas", cutoff],
    ["Versión del catálogo", `Versión ${signed.catalogVersion}`],
    ["Generada", new Date(signed.generatedAt).toLocaleString("es-CO")],
    ["", ""],
    ["Pasos", "1. Llene las celdas amarillas de la hoja REGISTROS. Las grises no se pueden modificar."],
    ["", "2. En razones, escriba el numerador y el denominador: el valor lo calcula el sistema."],
    ["", "3. Si un indicador no aplica al programa o no hay dato, elíjalo en la columna P y justifíquelo en la Q."],
    ["", "4. Si un dato precargado no coincide, escriba «No» en la columna O, corrija el valor y justifique."],
    ["", "5. Guarde el archivo e impórtelo en el sistema (Mi reporte → Importar Excel). Revise la vista previa antes de cargar."],
    ["", "6. Importar no envía: los archivos de evidencia se adjuntan en el sistema y el envío a decanatura se hace allí."],
    ["", "Una celda vacía no borra lo que ya está guardado en el sistema."],
    ["", ""],
    ["Colores", "Amarillo: se puede escribir."],
    ["", "Gris: no se puede modificar (no aplica al tipo del indicador, o el registro ya fue enviado)."],
    ["", "No modifique la estructura del libro ni las hojas ocultas: si cambia, el sistema rechaza el archivo."],
  ];
  lines.forEach(([a, b]) => intro.addRow([a, b]));
  intro.getRow(1).font = { bold: true, size: 14, color: { argb: HEADER } };
  intro.getColumn(1).font = { bold: true };
  intro.getCell("A1").font = { bold: true, size: 14, color: { argb: HEADER } };
  intro.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  const legendYellow = intro.getCell(`A${lines.findIndex(([a]) => a === "Colores") + 1}`);
  legendYellow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
  await protect(intro, signed.password);

  // --- REGISTROS ------------------------------------------------------------------
  const sheet = book.addWorksheet(SHEET.records, { views: [{ state: "frozen", xSplit: 3, ySplit: 1 }] });
  sheet.columns = TEMPLATE_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  sheet.getColumn(1).hidden = true;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { wrapText: true, vertical: "middle" };
  header.height = 36;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER } };
  });

  ordered.forEach((row, index) => {
    const r = index + 2;
    const open = new Set(openKeys(row));
    const values: (string | number | null)[] = [
      row.assignment_id,
      row.code,
      row.name,
      `${FUNCTION_LABEL[row.function_id]} · ${LEVEL_LABEL[row.level]}`,
      row.campus_name ?? "Todas",
      `${CALC_LABEL[row.calc_type]}${row.capture_mode === "precargado" ? " (precargado)" : ""}`,
      row.numerator_def ?? "",
      row.denominator_def ?? "",
      row.previous_value === null ? null : Number(row.previous_value),
    ];
    for (const c of TEMPLATE_COLUMNS.slice(9, 19)) values.push(c.key ? valueCell(row, c.key) : null);
    values.push(null, STATE_LABEL[row.state] ?? row.state);
    const excelRow = sheet.addRow(values);
    excelRow.getCell(20).value = { formula: formulaFor(row, r) };

    TEMPLATE_COLUMNS.forEach((c, i) => {
      const cell = excelRow.getCell(i + 1);
      const editable = Boolean(c.key && open.has(c.key));
      cell.protection = { locked: !editable };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: editable ? YELLOW : GRAY } };
      cell.alignment = { vertical: "top", wrapText: c.letter === "C" || c.letter === "G" || c.letter === "H" || c.letter === "Q" };
      if (!editable) return;
      // Validación de datos, la misma del sistema en su versión de Excel.
      if (c.key === "numerator" || c.key === "denominator" || c.key === "numComparison" || c.key === "denComparison") {
        const scored = c.key === "numerator" && row.calc_type === "puntaje" && row.range_min !== null && row.range_max !== null;
        cell.dataValidation = scored
          ? {
              type: "decimal",
              operator: "between",
              formulae: [Number(row.range_min), Number(row.range_max)],
              allowBlank: true,
              showErrorMessage: true,
              errorTitle: "Puntaje fuera de rango",
              error: `El valor debe estar entre ${row.range_min} y ${row.range_max}.`,
            }
          : {
              type: "decimal",
              operator: "greaterThanOrEqual",
              formulae: [0],
              allowBlank: true,
              showErrorMessage: true,
              errorTitle: "Número no válido",
              error: "Escriba un número mayor o igual a cero.",
            };
      } else if (c.key === "n") {
        cell.dataValidation = {
          type: "whole",
          operator: "greaterThanOrEqual",
          formulae: [0],
          allowBlank: true,
          showErrorMessage: true,
          errorTitle: "Número no válido",
          error: "Escriba un número entero mayor o igual a cero.",
        };
      } else if (c.key === "confirm") {
        cell.dataValidation = { type: "list", allowBlank: true, formulae: [`${SHEET.catalogs}!$A$2:$A$3`], showErrorMessage: true, error: "Elija «Sí» o «No»." };
      } else if (c.key === "noData") {
        cell.dataValidation = { type: "list", allowBlank: true, formulae: [`${SHEET.catalogs}!$B$2:$B$3`], showErrorMessage: true, error: "Elija «No aplica», «Sin dato» o deje la celda vacía." };
      }
    });
  });
  await protect(sheet, signed.password);

  // --- CATALOGOS (oculta) -------------------------------------------------------
  const catalogs = book.addWorksheet(SHEET.catalogs, { state: "hidden" });
  catalogs.addRow(["Confirma precargado", "No aplica / Sin dato"]);
  catalogs.addRow(["Sí", "No aplica"]);
  catalogs.addRow(["No", "Sin dato"]);
  await protect(catalogs, signed.password);

  // --- CONTROL (muy oculta y protegida) ----------------------------------------------
  const control = book.addWorksheet(SHEET.control, { state: "veryHidden" });
  control.columns = [{ width: 22 }, { width: 80 }];
  const controlValues: Record<(typeof CONTROL_KEYS)[number], string> = {
    id_plantilla: signed.templateId,
    programa_id: signed.programId,
    periodo_id: signed.periodId,
    version_catalogo_id: signed.catalogVersionId,
    generada_en: signed.generatedAt,
    asignaciones: signed.assignmentIds.join(","),
    huella: signed.signature,
  };
  CONTROL_KEYS.forEach((key) => control.addRow([key, controlValues[key]]));
  control.addRow(["programa", programName]);
  control.addRow(["periodo", signed.periodCode]);
  await protect(control, signed.password);

  return book;
}

export const templateFileName = (programCode: string, periodCode: string) =>
  `plantilla-impacto-${programCode.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${periodCode}.xlsx`;
