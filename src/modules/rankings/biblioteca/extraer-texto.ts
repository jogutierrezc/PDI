/* =============================================================================
   Biblioteca de evidencias · texto de cada archivo, sin IA y en el navegador.

     · Word (.docx): el lector de UDES en Cifras (word/document.xml).
     · PowerPoint (.pptx), Excel (.xlsx) y OpenDocument (.odt/.odp/.ods): se
       descomprimen solo sus XML de texto (fflate) y se quitan las etiquetas.
       Para Excel basta con las cadenas compartidas y los valores: no hace
       falta exceljs, que pesa y usa mucha memoria.
     · PDF: pdf.js cargado bajo demanda (pdf-load de Pilo Enseñanza, con tope
       de páginas). Uno escaneado queda «sin texto: revisar a mano»: no hay OCR.
     · txt, csv, md, html: se decodifican (UTF-8 o Windows-1252) y, el html,
       sin etiquetas ni scripts.
     · Imágenes, videos y lo demás: no se leen; se clasifican por nombre,
       carpeta y metadatos.

   Cada lectura tiene tope de tiempo y de tamaño, y el texto que se guarda va
   recortado (TEXTO_MAX): sirve para reclasificar sin volver a leer el archivo.
   ========================================================================== */

import { strFromU8, unzipSync } from "fflate";
import { readDocx } from "../../admin/udes-en-cifras/import/docx";
import { readPdfPages } from "../../admin/pilo-ensenanza/ingest/pdf";
import { importFresh } from "../../../lib/stale-chunk";

export const TEXTO_MAX = 20_000;
export const PAGINAS_PDF = 30;
/** Archivos más pesados que esto no se leen (se clasifican por nombre). */
export const LIMITE_LECTURA = 25 * 1024 * 1024;
export const TIEMPO_LECTURA_MS = 20_000;

export type EstadoTexto = "ok" | "sin_texto" | "no_aplica" | "error";

export interface TextoExtraido {
  texto: string;
  estado: EstadoTexto;
  /** Qué pasó, en español, cuando no es «ok». */
  nota: string | null;
}

export const IMAGENES = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic", "svg"]);
export const VIDEOS = new Set(["mp4", "mov", "avi", "mkv", "webm", "wmv", "m4v", "mp3", "wav", "m4a"]);
const TEXTO_PLANO = new Set(["txt", "csv", "md", "tsv", "json", "xml"]);
const HTML = new Set(["html", "htm"]);
const OFFICE_XML: Record<string, RegExp> = {
  pptx: /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/,
  xlsx: /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/,
  odt: /^content\.xml$/,
  odp: /^content\.xml$/,
  ods: /^content\.xml$/,
};

/** ¿Qué lector le toca? */
export function lectorDe(ext: string): "docx" | "office" | "pdf" | "plano" | "html" | null {
  if (ext === "docx") return "docx";
  if (ext in OFFICE_XML) return "office";
  if (ext === "pdf") return "pdf";
  if (TEXTO_PLANO.has(ext)) return "plano";
  if (HTML.has(ext)) return "html";
  return null;
}

const ENTIDADES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&", nbsp: " " };

export function decodificarEntidades(t: string): string {
  return t
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTIDADES[n.toLowerCase()] ?? m);
}

/** Texto de un XML: cada etiqueta de párrafo o celda cierra con espacio. */
export function xmlATexto(xml: string): string {
  return decodificarEntidades(xml.replace(/<\/(a:p|w:p|text:p|text:h|c|si|row|table:table-cell)>/g, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto visible de un HTML: sin scripts, estilos ni etiquetas. */
export function htmlATexto(html: string): string {
  return xmlATexto(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, " "));
}

export function decodificar(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

/** pptx, xlsx y OpenDocument: solo los XML con texto. */
export function textoOffice(bytes: Uint8Array, ext: string): string {
  const patron = OFFICE_XML[ext];
  const archivos = unzipSync(bytes, { filter: (f) => patron.test(f.name) && f.originalSize < 40 * 1024 * 1024 });
  const nombres = Object.keys(archivos).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return nombres.map((n) => xmlATexto(strFromU8(archivos[n]))).join(" ");
}

export function recortar(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > TEXTO_MAX ? t.slice(0, TEXTO_MAX) : t;
}

function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((ok, mal) => {
    const reloj = setTimeout(() => mal(new Error(`La lectura pasó de ${Math.round(ms / 1000)} s`)), ms);
    p.then(
      (v) => (clearTimeout(reloj), ok(v)),
      (e) => (clearTimeout(reloj), mal(e)),
    );
  });
}

async function leerPdf(bytes: Uint8Array): Promise<TextoExtraido> {
  const { loadPdfPages } = await importFresh(() => import("../../admin/pilo-ensenanza/ingest/pdf-load"));
  // pdf.js se queda con el buffer: se le pasa una copia.
  const doc = readPdfPages(await loadPdfPages(bytes.slice(), PAGINAS_PDF));
  if (doc.scanned) return { texto: "", estado: "sin_texto", nota: "PDF escaneado, sin texto: revisar a mano." };
  const texto = doc.blocks.map((b) => (b.type === "table" ? b.rows.map((r) => r.join(" ")).join(" ") : b.text)).join(" ");
  return { texto: recortar(texto), estado: texto.trim() ? "ok" : "sin_texto", nota: doc.pages >= PAGINAS_PDF ? `Se leyeron las primeras ${PAGINAS_PDF} páginas.` : null };
}

/** Lectura síncrona de lo que no es PDF. Pura: la usan las pruebas. */
export function extraerTextoSync(bytes: Uint8Array, ext: string): TextoExtraido {
  const lector = lectorDe(ext);
  if (!lector || lector === "pdf") {
    const que = IMAGENES.has(ext) ? "Imagen" : VIDEOS.has(ext) ? "Video o audio" : "Formato sin lector";
    return { texto: "", estado: "no_aplica", nota: `${que}: se clasifica por nombre y carpeta.` };
  }
  let texto = "";
  if (lector === "docx") {
    texto = readDocx(bytes)
      .map((b) => (b.type === "table" ? b.rows.map((r) => r.join(" ")).join(" ") : b.text))
      .join(" ");
  } else if (lector === "office") texto = textoOffice(bytes, ext);
  else if (lector === "html") texto = htmlATexto(decodificar(bytes));
  else texto = decodificar(bytes);
  const t = recortar(texto);
  return t ? { texto: t, estado: "ok", nota: null } : { texto: "", estado: "sin_texto", nota: "El archivo no trae texto: revisar a mano." };
}

/** Lee el texto de un archivo con tope de tamaño y de tiempo. Nunca lanza: los errores vuelven como estado. */
export async function extraerTexto(bytes: Uint8Array, ext: string, ms = TIEMPO_LECTURA_MS): Promise<TextoExtraido> {
  if (bytes.length > LIMITE_LECTURA && lectorDe(ext)) {
    return { texto: "", estado: "no_aplica", nota: "Muy pesado para leerlo en el navegador: se clasifica por nombre y carpeta." };
  }
  try {
    if (ext === "pdf") return await conTope(leerPdf(bytes), ms);
    // Se cede el hilo antes de leer: la pantalla no se congela entre archivos.
    await new Promise((r) => setTimeout(r, 0));
    return extraerTextoSync(bytes, ext);
  } catch (e) {
    return { texto: "", estado: "error", nota: `No se pudo leer el texto (${e instanceof Error ? e.message : "error"}): se clasifica por nombre.` };
  }
}
