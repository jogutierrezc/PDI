/* =============================================================================
   Contactos · leer y escribir archivos en el navegador (Excel y CSV).

   Nada de esto sale de la máquina de la persona hasta que ella envía: el archivo se
   lee aquí, se valida aquí y solo se mandan las filas que están bien. ExcelJS se
   carga cuando hace falta (pesa), no con la página.
   ========================================================================== */

import { aCsv, leerMatriz, limpiar, parsearCsv } from "../../../../supabase/functions/int-contactos/contactos";
import type { DefinicionPlantilla, LecturaMatriz } from "../../../../supabase/functions/int-contactos/contactos";
import type { Exportacion } from "../lib/exportar-contactos";

export const MENSAJE_XLS_ANTIGUO = "Ese es un Excel antiguo (.xls). Ábralo y guárdelo como «Libro de Excel (.xlsx)», o como CSV, y súbalo de nuevo.";
const MAX_BYTES = 8 * 1024 * 1024;

/** Descarga un contenido como archivo. */
export function descargar(contenido: Blob, nombre: string): void {
  const url = URL.createObjectURL(contenido);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** El valor de una celda de ExcelJS como texto: número, fecha, enlace, texto enriquecido o resultado de fórmula. */
export function textoDeCelda(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return limpiar(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text?: string }[]; hyperlink?: unknown };
    if (Array.isArray(o.richText)) return limpiar(o.richText.map((r) => r.text ?? "").join(""));
    if (o.text != null) return textoDeCelda(o.text);
    if (o.result != null) return textoDeCelda(o.result);
    if (typeof o.hyperlink === "string") return limpiar(o.hyperlink.replace(/^mailto:/i, ""));
  }
  return "";
}

export interface ArchivoLeido {
  nombre: string;
  lectura: LecturaMatriz;
  /** Si el libro tenía varias hojas, la que se usó. */
  hoja: string | null;
}

/** Lee un .xlsx o un .csv y lo empareja con la plantilla. Lanza un Error con un mensaje para la persona. */
export async function leerArchivo(archivo: File, plantilla: DefinicionPlantilla): Promise<ArchivoLeido> {
  const nombre = archivo.name;
  if (archivo.size > MAX_BYTES) throw new Error("El archivo pesa más de 8 MB. Divídalo en partes.");
  if (/\.xls$/i.test(nombre)) throw new Error(MENSAJE_XLS_ANTIGUO);
  if (/\.csv$|\.txt$/i.test(nombre)) {
    const buffer = await archivo.arrayBuffer();
    // Excel guarda los CSV en Windows-1252 cuando no se pide UTF-8: si hay caracteres de reemplazo, se intenta así.
    let texto = new TextDecoder("utf-8").decode(buffer);
    if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(buffer);
    return { nombre, lectura: leerMatriz(parsearCsv(texto), plantilla), hoja: null };
  }
  if (!/\.xlsx$/i.test(nombre)) throw new Error("Suba un archivo de Excel (.xlsx) o un CSV.");

  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(await archivo.arrayBuffer());
  } catch {
    throw new Error("No se pudo abrir el archivo. Compruebe que no esté dañado ni protegido con contraseña.");
  }
  let mejor: ArchivoLeido | null = null;
  let aciertos = -1;
  for (const hoja of libro.worksheets) {
    const matriz: string[][] = [];
    hoja.eachRow({ includeEmpty: true }, (fila, n) => {
      const celdas = (fila.values as unknown[]).slice(1).map(textoDeCelda);
      matriz[n - 1] = celdas;
    });
    for (let i = 0; i < matriz.length; i++) matriz[i] ??= [];
    const lectura = leerMatriz(matriz, plantilla);
    const puntos = Object.keys(lectura.emparejo.indice).length * 1000 + lectura.filas.length;
    if (lectura.filaEncabezado > 0 && puntos > aciertos) {
      aciertos = puntos;
      mejor = { nombre, lectura, hoja: libro.worksheets.length > 1 ? hoja.name : null };
    }
  }
  if (!mejor) return { nombre, lectura: { filaEncabezado: 0, emparejo: leerMatriz([], plantilla).emparejo, filas: [] }, hoja: null };
  return mejor;
}

/** La plantilla para rellenar: una hoja con las cabeceras originales y otra de instrucciones con un ejemplo. */
export async function descargarPlantillaXlsx(p: DefinicionPlantilla): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(p.hoja.slice(0, 31));
  hoja.addRow(p.columnas.map((c) => c.encabezado));
  p.columnas.forEach((c, i) => (hoja.getColumn(i + 1).width = c.ancho));
  encabezadoEnNegrita(hoja.getRow(1));
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  hoja.getRow(1).commit();
  const ayuda = libro.addWorksheet("Instrucciones");
  ayuda.addRow(["Columna", "¿Obligatoria?", "Qué escribir", "Ejemplo"]);
  encabezadoEnNegrita(ayuda.getRow(1));
  for (const c of p.columnas) ayuda.addRow([c.encabezado, c.obligatoria ? "Sí" : "No", c.nota, p.ejemplo[c.encabezado] ?? ""]);
  [24, 14, 80, 40].forEach((w, i) => (ayuda.getColumn(i + 1).width = w));
  ayuda.eachRow((fila) => fila.eachCell((celda) => (celda.alignment = { vertical: "top", wrapText: true })));
  descargar(new Blob([await libro.xlsx.writeBuffer()], { type: MIME_XLSX }), `${p.archivo}.xlsx`);
}

export function descargarPlantillaCsv(p: DefinicionPlantilla): void {
  descargar(new Blob([aCsv(p.columnas.map((c) => c.encabezado), [])], { type: "text/csv;charset=utf-8" }), `${p.archivo}.csv`);
}

function encabezadoEnNegrita(fila: import("exceljs").Row) {
  fila.font = { bold: true, color: { argb: "FFFFFFFF" } };
  fila.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2D63" } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  fila.height = 22;
}

/** Escribe una exportación como .xlsx (la hoja con el nombre de la plantilla) o .csv UTF-8 con BOM. */
export async function descargarExportacion(x: Exportacion, formato: "xlsx" | "csv"): Promise<void> {
  if (formato === "csv") {
    descargar(new Blob([aCsv(x.encabezados, x.filas)], { type: "text/csv;charset=utf-8" }), `${x.archivo}.csv`);
    return;
  }
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(x.hoja.slice(0, 31));
  hoja.addRow(x.encabezados);
  encabezadoEnNegrita(hoja.getRow(1));
  x.filas.forEach((f) => hoja.addRow(f));
  x.anchos.forEach((w, i) => (hoja.getColumn(i + 1).width = w));
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: x.encabezados.length } };
  descargar(new Blob([await libro.xlsx.writeBuffer()], { type: MIME_XLSX }), `${x.archivo}.xlsx`);
}
