/* =============================================================================
   Programas en Cifras · leer un Excel o un CSV en el navegador.

   «Subir plantilla» y «Desde mi plantilla de Excel» entregan la primera hoja
   como una matriz de celdas crudas (texto, número o Date) a lib/inferencia,
   que arma las columnas. Nada sale del navegador. Un .xls antiguo no se lee:
   se pide guardarlo como .xlsx.
   ========================================================================== */

export type Matriz = (string | number | Date | null)[][];

export interface LecturaExcel {
  nombre: string;
  hoja: string;
  matriz: Matriz;
}

export const TOPE_FILAS = 20000;

/** Parte un CSV respetando comillas; detecta coma, punto y coma o tabulación. */
export function leerCsv(texto: string): Matriz {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const cuenta = (c: string) => primera.split(c).length - 1;
  const sep = [";", "\t", ","].sort((a, b) => cuenta(b) - cuenta(a))[0];
  const filas: Matriz = [];
  let fila: string[] = [];
  let celda = "";
  let entre = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entre) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entre = false;
      else celda += c;
    } else if (c === '"') entre = true;
    else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda);
      celda = "";
      filas.push(fila);
      fila = [];
    } else celda += c;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

function valorDeCelda(v: unknown): string | number | Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown; hyperlink?: string };
    if (o.richText) return o.richText.map((x) => x.text).join("");
    if (o.result !== undefined && o.result !== null) return valorDeCelda(o.result);
    if (typeof o.text === "string") return o.text;
    return null;
  }
  return v as string | number;
}

export async function leerArchivoEnNavegador(archivo: File): Promise<LecturaExcel> {
  const nombre = archivo.name;
  if (/\.csv$/i.test(nombre) || archivo.type === "text/csv") return { nombre, hoja: "CSV", matriz: leerCsv(await archivo.text()) };
  if (/\.xls$/i.test(nombre)) throw new Error("Ese Excel es del formato antiguo (.xls). Guárdelo como .xlsx y vuelva a subirlo.");
  if (!/\.xlsx$/i.test(nombre)) throw new Error("El archivo debe ser un Excel .xlsx o un .csv.");
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const hoja = libro.worksheets.find((h) => h.state === "visible" && h.rowCount > 0) ?? libro.worksheets[0];
  if (!hoja) throw new Error("El Excel no tiene hojas.");
  const matriz: Matriz = [];
  const columnas = hoja.columnCount;
  hoja.eachRow({ includeEmpty: true }, (fila, n) => {
    if (n > TOPE_FILAS + 20) return;
    const celdas: (string | number | Date | null)[] = [];
    for (let c = 1; c <= columnas; c++) celdas.push(valorDeCelda(fila.getCell(c).value));
    matriz[n - 1] = celdas;
  });
  for (let i = 0; i < matriz.length; i++) if (!matriz[i]) matriz[i] = [];
  return { nombre, hoja: hoja.name, matriz };
}
