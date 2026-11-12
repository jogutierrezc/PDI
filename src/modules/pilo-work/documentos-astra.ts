/* =============================================================================
   Pilo at Work · Pilo Astra 1.0 · documentos adjuntos.

   La persona adjunta un documento en el chat y Astra lo lee. El navegador saca el TEXTO
   (PDF, Word, Excel, CSV y texto plano) y lo manda a la función pilo-work, que lo pasa a
   Pilo Astra 1.0 en el servidor propio de la universidad. No se guarda: viaja solo con los
   mensajes de esa conversación, y la bitácora nunca registra contenidos.

   Aquí vive lo que se puede probar aparte (validar, recortar, limpiar) y la extracción por
   formato. Las librerías pesadas (pdf.js, exceljs) entran por import() dinámico: no pesan
   en el chat hasta que alguien adjunta un archivo de ese tipo.
   ========================================================================== */

import { textoDeDocx } from "./archivos";

/** Cuánto texto se le pasa a Astra de un documento (el servidor repite este tope). */
export const MAX_CARACTERES = 40_000;
export const FORMATOS_ACEPTADOS = [".pdf", ".docx", ".xlsx", ".csv", ".tsv", ".txt", ".md", ".json"] as const;
export const ACCEPT = FORMATOS_ACEPTADOS.join(",");

export interface DocumentoAstra {
  nombre: string;
  texto: string;
  /** Tamaño del archivo original, en bytes. */
  tamano: number;
  /** Caracteres que se le pasan a Astra. */
  caracteres: number;
  /** Había más texto que el tope: solo se leyó el comienzo. */
  truncado: boolean;
  paginas?: number;
}

export const extension = (nombre: string): string => {
  const i = nombre.lastIndexOf(".");
  return i < 0 ? "" : nombre.slice(i).toLowerCase();
};

/** Un mensaje claro si el archivo no se puede adjuntar; "" si está bien. */
export function validarArchivo(nombre: string, bytes: number, maxMb: number): string {
  const ext = extension(nombre);
  if (!(FORMATOS_ACEPTADOS as readonly string[]).includes(ext)) {
    return ext === ".doc" || ext === ".xls" || ext === ".ppt" || ext === ".pptx"
      ? `Los archivos ${ext} antiguos no se pueden leer. Guárdelo como .docx, .xlsx o PDF e inténtelo de nuevo.`
      : `Astra lee PDF, Word (.docx), Excel (.xlsx), CSV y texto. «${nombre}» no es de esos formatos.`;
  }
  if (bytes === 0) return `«${nombre}» está vacío.`;
  if (bytes > maxMb * 1024 * 1024) return `«${nombre}» pesa más de ${maxMb} MB, el máximo que permite la administración.`;
  return "";
}

/** Espacios y saltos ordenados: lo que el modelo recibe no lleva basura de formato. */
export function limpiarTexto(t: string): string {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function recortar(texto: string, max = MAX_CARACTERES): { texto: string; truncado: boolean } {
  return texto.length > max ? { texto: texto.slice(0, max), truncado: true } : { texto, truncado: false };
}

/** El valor visible de una celda de Excel (fórmulas, textos con formato, fechas, enlaces). */
export function textoDeCelda(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown; hyperlink?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return textoDeCelda(o.result);
    if (o.text !== undefined) return textoDeCelda(o.text);
    return "";
  }
  return String(v).replace(/[\n\r]+/g, " ");
}

/** Una fila como CSV simple: separadas por coma, con comillas si hace falta. */
export const filaCsv = (celdas: string[]): string => celdas.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");

async function textoDePdf(bytes: Uint8Array): Promise<{ texto: string; paginas: number }> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const tarea = pdfjs.getDocument({ data: bytes });
  const doc = await tarea.promise;
  const partes: string[] = [];
  let largo = 0;
  try {
    for (let n = 1; n <= doc.numPages && largo < MAX_CARACTERES * 1.2; n++) {
      const pagina = await doc.getPage(n);
      const contenido = await pagina.getTextContent();
      let linea = "";
      for (const it of contenido.items) {
        if (!("str" in it)) continue;
        linea += it.str + (it.hasEOL ? "\n" : " ");
      }
      pagina.cleanup();
      partes.push(`--- Página ${n} ---\n${linea}`);
      largo += linea.length;
    }
    return { texto: partes.join("\n"), paginas: doc.numPages };
  } finally {
    await tarea.destroy();
  }
}

async function textoDeExcel(buffer: ArrayBuffer): Promise<string> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  const hojas: string[] = [];
  libro.worksheets.slice(0, 6).forEach((hoja) => {
    const filas: string[] = [`--- Hoja «${hoja.name}» (${hoja.rowCount} filas, ${hoja.columnCount} columnas) ---`];
    let n = 0;
    hoja.eachRow({ includeEmpty: false }, (fila) => {
      if (n++ >= 600) return;
      const celdas: string[] = [];
      fila.eachCell({ includeEmpty: true }, (c, col) => {
        celdas[col - 1] = textoDeCelda(c.value);
      });
      filas.push(filaCsv(Array.from(celdas, (c) => c ?? "")));
    });
    if (hoja.rowCount > 600) filas.push(`(se muestran las primeras 600 de ${hoja.rowCount} filas)`);
    hojas.push(filas.join("\n"));
  });
  return hojas.join("\n\n");
}

/**
 * Lee un archivo y devuelve su texto, listo para adjuntarlo. Lanza un Error con un mensaje
 * claro (en español, para la persona) si no se puede leer.
 */
export async function leerDocumento(archivo: File, maxMb: number): Promise<DocumentoAstra> {
  const problema = validarArchivo(archivo.name, archivo.size, maxMb);
  if (problema) throw new Error(problema);
  const ext = extension(archivo.name);
  let bruto = "";
  let paginas: number | undefined;
  try {
    if (ext === ".pdf") {
      const r = await textoDePdf(new Uint8Array(await archivo.arrayBuffer()));
      bruto = r.texto;
      paginas = r.paginas;
    } else if (ext === ".docx") bruto = await textoDeDocx(await archivo.arrayBuffer());
    else if (ext === ".xlsx") bruto = await textoDeExcel(await archivo.arrayBuffer());
    else bruto = await archivo.text();
  } catch (e) {
    throw new Error(e instanceof Error && e.message && !/^(Invalid|Missing|Unexpected)/i.test(e.message) ? e.message : `No pude leer «${archivo.name}». Compruebe que no esté dañado ni protegido con contraseña.`);
  }
  const limpio = limpiarTexto(bruto);
  if (limpio.replace(/--- [^\n]* ---/g, "").trim().length < 20) {
    throw new Error(ext === ".pdf" ? `«${archivo.name}» no tiene texto seleccionable (parece un escaneo). Pruebe con una versión con texto o un .docx.` : `«${archivo.name}» no tiene texto que leer.`);
  }
  const { texto, truncado } = recortar(limpio);
  return { nombre: archivo.name, texto, tamano: archivo.size, caracteres: texto.length, truncado, paginas };
}
