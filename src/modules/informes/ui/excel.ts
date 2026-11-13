/* Excel del navegador para el informe: plantillas que se descargan y libros que se leen.
   exceljs se carga solo al usarlo, para no pesar en el resto de la aplicación. */

import { downloadBlob } from "../../admin/traslado/transfer";

export interface HojaExcel {
  nombre: string;
  columnas: { titulo: string; ancho?: number }[];
  filas: (string | number | null)[][];
  /** Texto de ayuda sobre la tabla (no se lee al importar). */
  ayuda?: string;
  /**
   * Listas desplegables por columna (índice desde 0). Una lista de textos va escrita en la celda (cabe en 255
   * caracteres); `{ rango }` apunta a una columna de otra hoja («Criterios!$A$2:$A$9»), sin ese límite, y deja
   * escribir un valor que no está en la lista.
   */
  listas?: Record<number, string[] | { rango: string }>;
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function descargarLibro(archivo: string, hojas: HojaExcel[]): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  for (const h of hojas) {
    const hoja = libro.addWorksheet(h.nombre);
    hoja.columns = h.columnas.map((c) => ({ header: c.titulo, width: c.ancho ?? 22 }));
    const cab = hoja.getRow(1);
    cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2A4A" } };
    cab.alignment = { vertical: "middle", wrapText: true };
    for (const f of h.filas) hoja.addRow(f);
    hoja.views = [{ state: "frozen", ySplit: 1 }];
    for (const [col, lista] of Object.entries(h.listas ?? {})) {
      const porRango = !Array.isArray(lista);
      const texto = porRango ? lista.rango : `"${lista.join(",")}"`;
      if (!porRango && texto.length > 255) continue;
      for (let r = 2; r <= Math.max(60, h.filas.length + 1); r++) {
        hoja.getCell(r, Number(col) + 1).dataValidation = { type: "list", allowBlank: true, formulae: [texto], ...(porRango ? { showErrorMessage: false } : {}) };
      }
    }
    if (h.ayuda) {
      const nota = libro.addWorksheet(`Cómo llenar ${h.nombre}`.slice(0, 31));
      nota.getColumn(1).width = 110;
      for (const linea of h.ayuda.split("\n")) nota.addRow([linea]).alignment = { wrapText: true, vertical: "top" };
    }
  }
  const buffer = await libro.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: XLSX }), archivo);
}

/** El valor visible de una celda de exceljs (texto, número, fecha, fórmula o texto con formato). */
function textoDeCelda(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return textoDeCelda(o.result);
    if (o.text !== undefined) return textoDeCelda(o.text);
    if (o.hyperlink) return o.hyperlink;
  }
  return "";
}

/** Lee la hoja indicada (por nombre; si no está, la primera) como filas de texto. */
export async function leerHoja(archivo: File, nombre: string): Promise<string[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const hoja = libro.getWorksheet(nombre) ?? libro.worksheets[0];
  if (!hoja) return [];
  const filas: string[][] = [];
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    const celdas: string[] = [];
    fila.eachCell({ includeEmpty: true }, (c, n) => {
      celdas[n - 1] = textoDeCelda(c.value);
    });
    filas.push(Array.from(celdas, (c) => c ?? ""));
  });
  return filas;
}

/** Los nombres de las hojas de un .xlsx. */
export async function nombresDeHojas(archivo: File): Promise<string[]> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  return libro.worksheets.map((h) => h.name);
}

/** La hoja con sus posiciones (las filas y columnas vacías se conservan, para leer un rango tipo «B2:E20»). Tope: 2000 filas y 60 columnas. */
export async function leerHojaPosicional(archivo: File, nombre: string): Promise<string[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const hoja = libro.getWorksheet(nombre) ?? libro.worksheets[0];
  if (!hoja) return [];
  const filas: string[][] = [];
  const nf = Math.min(hoja.rowCount, 2000);
  const nc = Math.min(hoja.columnCount, 60);
  for (let i = 1; i <= nf; i++) {
    const fila = hoja.getRow(i);
    filas.push(Array.from({ length: nc }, (_, j) => textoDeCelda(fila.getCell(j + 1).value)));
  }
  return filas;
}
