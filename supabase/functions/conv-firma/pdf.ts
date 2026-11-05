/* =============================================================================
   conv-firma · PDF: conversión con Gotenberg, unión de páginas y sellado digital.

   · Gotenberg (https://gotenberg.dev) convierte HTML (Chromium) y .docx (LibreOffice). Se llama por
     GOTENBERG_URL (red interna de Coolify, sin exposición pública). Si falta, el error es entendible.
   · pdf-lib 1.17.1 une PDF y arma el marcador de firma. Se guarda SIEMPRE sin flujos de objetos
     (useObjectStreams: false): signpdf necesita la tabla de referencias clásica.
   · Sellado: firma digital PDF (CMS «adbe.pkcs7.detached») con el certificado de la UDES (PKCS#12), de modo
     que cualquier lector de PDF muestre si el archivo fue alterado. Es una firma de CERTIFICACIÓN (DocMDP,
     P = 1: no se permiten cambios), puesta una sola vez al final, cuando ya están todas las firmas de las partes.
   ========================================================================== */

import { Buffer } from "node:buffer";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFInvalidObject, PDFName, PDFNumber, PDFString } from "npm:pdf-lib@1.17.1";
import * as signpdfNs from "npm:@signpdf/signpdf@3.3.0";
import { ENV, ErrorFirma } from "./util.ts";
import { crearFirmanteCms } from "./sello.ts";
import type { InfoCertificadoUdes } from "./sello.ts";

/* ---------- Gotenberg ------------------------------------------------------------------------------- */

const TIEMPO_CONVERSION_MS = 90_000;

function gotenbergUrl(): string {
  const u = ENV("GOTENBERG_URL").trim().replace(/\/+$/, "");
  if (!u) throw new ErrorFirma("sin_gotenberg", "Falta el servicio de conversión a PDF (GOTENBERG_URL). Pida a quien administra el servidor que lo configure.", 503);
  if (!/^https?:\/\//i.test(u)) throw new ErrorFirma("sin_gotenberg", "La dirección del servicio de conversión a PDF (GOTENBERG_URL) no es válida.", 503);
  return u;
}

function cabecerasGotenberg(): Record<string, string> {
  const usuario = ENV("GOTENBERG_USUARIO");
  return usuario ? { Authorization: `Basic ${btoa(`${usuario}:${ENV("GOTENBERG_CLAVE")}`)}` } : {};
}

async function convertir(ruta: string, form: FormData): Promise<Uint8Array> {
  const base = gotenbergUrl();
  let r: Response;
  try {
    r = await fetch(`${base}${ruta}`, { method: "POST", body: form, headers: cabecerasGotenberg(), signal: AbortSignal.timeout(TIEMPO_CONVERSION_MS) });
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new ErrorFirma("pdf_tiempo", "El servicio de conversión a PDF tardó demasiado en responder. Intente de nuevo en unos minutos.", 504);
    }
    throw new ErrorFirma("pdf_conexion", "No se pudo conectar con el servicio de conversión a PDF. Pida que revisen que esté encendido.", 503);
  }
  if (!r.ok) {
    const detalle = (await r.text().catch(() => "")).slice(0, 300);
    console.error("Gotenberg respondió", r.status, ruta, detalle);
    throw new ErrorFirma("pdf_error", `El servicio de conversión a PDF no pudo convertir el documento (código ${r.status}).`, 502);
  }
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length < 100 || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
    throw new ErrorFirma("pdf_error", "El servicio de conversión no devolvió un PDF válido.", 502);
  }
  return bytes;
}

export interface OpcionesHtml {
  /** Pie con paginación (HTML completo con los span pageNumber / totalPages). */
  pie?: string;
  /** Si es verdadero, manda la regla @page del propio HTML (certificado y página de firmas). */
  tamanoCss?: boolean;
  /** Márgenes en pulgadas (Gotenberg usa pulgadas). */
  margenes?: { arriba: number; abajo: number; izq: number; der: number };
}

const MM = 1 / 25.4;

/** HTML → PDF A4 con Chromium. */
export function htmlAPdf(html: string, op: OpcionesHtml = {}): Promise<Uint8Array> {
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");
  if (op.pie) form.append("files", new Blob([op.pie], { type: "text/html" }), "footer.html");
  form.append("paperWidth", "8.27");
  form.append("paperHeight", "11.7");
  form.append("printBackground", "true");
  form.append("emulatedMediaType", "print");
  if (op.tamanoCss) {
    form.append("preferCssPageSize", "true");
  } else {
    const m = op.margenes ?? { arriba: 18 * MM, abajo: 20 * MM, izq: 18 * MM, der: 18 * MM };
    form.append("marginTop", m.arriba.toFixed(3));
    form.append("marginBottom", m.abajo.toFixed(3));
    form.append("marginLeft", m.izq.toFixed(3));
    form.append("marginRight", m.der.toFixed(3));
  }
  return convertir("/forms/chromium/convert/html", form);
}

/** .docx → PDF con LibreOffice. */
export function docxAPdf(docx: Uint8Array): Promise<Uint8Array> {
  const form = new FormData();
  form.append("files", new Blob([docx as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "documento.docx");
  return convertir("/forms/libreoffice/convert", form);
}

/** Estado del servicio de conversión, sin lanzar errores. */
export async function estadoGotenberg(): Promise<{ configurado: boolean; disponible: boolean | null }> {
  const u = ENV("GOTENBERG_URL").trim().replace(/\/+$/, "");
  if (!u) return { configurado: false, disponible: null };
  try {
    const r = await fetch(`${u}/health`, { headers: cabecerasGotenberg(), signal: AbortSignal.timeout(4_000) });
    await r.body?.cancel();
    return { configurado: true, disponible: r.ok };
  } catch {
    return { configurado: true, disponible: false };
  }
}

/* ---------- pdf-lib: unir y contar ------------------------------------------------------------------ */

export async function contarPaginas(pdf: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  return doc.getPageCount();
}

/** Anexa al final de `base` todas las páginas de `extra`. */
export async function anexarPaginas(base: Uint8Array, extra: Uint8Array): Promise<Uint8Array> {
  const a = await PDFDocument.load(base, { updateMetadata: false });
  const b = await PDFDocument.load(extra, { updateMetadata: false });
  const copiadas = await a.copyPages(b, b.getPageIndices());
  for (const p of copiadas) a.addPage(p);
  return await a.save({ useObjectStreams: false });
}

/* ---------- Sellado ----------------------------------------------------------------------------------- */

const MARCADOR = "**********";
const LONGITUD_SIN_TSA = 20_000;
const LONGITUD_CON_TSA = 48_000;

// deno-lint-ignore no-explicit-any
const SignPdfClase = ((signpdfNs as any).SignPdf ?? (signpdfNs as any).default?.SignPdf) as new () => { sign(pdf: Buffer, signer: unknown, time?: Date): Promise<Buffer> };

export interface OpcionesSellado {
  titulo: string;
  autor: string;
  asunto: string;
  razon: string;
  ubicacion: string;
  contacto: string;
}

export interface ResultadoSellado {
  pdf: Uint8Array;
  tsa: string | null;
  tsaError: string | null;
  horaUtc: string;
}

/**
 * Pone el marcador de firma (con DocMDP P=1 y /Perms en el catálogo) y lo firma con el certificado de la UDES.
 * Antes de llamar, `pdf` debe ser un PDF completo sin cifrar. Devuelve el PDF sellado.
 */
export async function sellarPdf(pdf: Uint8Array, cert: InfoCertificadoUdes, op: OpcionesSellado): Promise<ResultadoSellado> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  doc.setTitle(op.titulo);
  doc.setAuthor(op.autor);
  doc.setSubject(op.asunto);
  doc.setProducer("Universidad de Santander · Firma de convenios");
  doc.setCreator("Universidad de Santander · Firma de convenios");
  const conTsa = Boolean(cert.tsaUrl);
  const ahora = new Date();
  agregarMarcador(doc, { ...op, firmadoEn: ahora, longitud: conTsa ? LONGITUD_CON_TSA : LONGITUD_SIN_TSA });
  const guardado = await doc.save({ useObjectStreams: false });
  const firmante = crearFirmanteCms(cert);
  const firmado = await new SignPdfClase().sign(Buffer.from(guardado), firmante, ahora);
  return { pdf: new Uint8Array(firmado), tsa: firmante.tsaUsado, tsaError: firmante.tsaError, horaUtc: ahora.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC") };
}

/**
 * Marcador de firma invisible con firma de certificación (DocMDP, P = 1). Es el de @signpdf/placeholder-pdf-lib 3.3.0
 * (mismo diccionario, mismas banderas) más /Reference y /Perms, que esa librería no agrega.
 * La firma queda como objeto «inválido» para que pdf-lib no la meta en un flujo de objetos.
 */
function agregarMarcador(doc: PDFDocument, o: OpcionesSellado & { firmadoEn: Date; longitud: number }): void {
  const ctx = doc.context;
  const pagina = doc.getPages()[0];
  const rangoBytes = PDFArray.withContext(ctx);
  rangoBytes.push(PDFNumber.of(0));
  rangoBytes.push(PDFName.of(MARCADOR));
  rangoBytes.push(PDFName.of(MARCADOR));
  rangoBytes.push(PDFName.of(MARCADOR));
  const contenido = PDFHexString.of(String.fromCharCode(0).repeat(o.longitud));
  const raiz = ctx.trailerInfo.Root;
  const firmaDict = ctx.obj({
    Type: "Sig",
    Filter: "Adobe.PPKLite",
    SubFilter: "adbe.pkcs7.detached",
    ByteRange: rangoBytes,
    Contents: contenido,
    Reason: PDFString.of(o.razon),
    M: PDFString.fromDate(o.firmadoEn),
    ContactInfo: PDFString.of(o.contacto),
    Name: PDFString.of(o.autor),
    Location: PDFString.of(o.ubicacion),
    Reference: [
      {
        Type: "SigRef",
        TransformMethod: "DocMDP",
        DigestMethod: "SHA256",
        Data: raiz,
        TransformParams: { Type: "TransformParams", P: 1, V: "1.2" },
      },
    ],
    Prop_Build: { Filter: { Name: "Adobe.PPKLite" }, App: { Name: "Universidad de Santander · Firma de convenios" } },
  });
  const bytes = new Uint8Array(firmaDict.sizeInBytes());
  firmaDict.copyBytesInto(bytes, 0);
  const firmaRef = ctx.register(PDFInvalidObject.of(bytes));

  const rect = PDFArray.withContext(ctx);
  for (const c of [0, 0, 0, 0]) rect.push(PDFNumber.of(c));
  const apariencia = ctx.formXObject([], { BBox: [0, 0, 0, 0], Resources: {} });
  const widget = ctx.obj({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Sig",
    Rect: rect,
    V: firmaRef,
    T: PDFString.of("Firma UDES"),
    F: 4,
    P: pagina.ref,
    AP: { N: ctx.register(apariencia) },
  });
  const widgetRef = ctx.register(widget);

  let anotaciones = pagina.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (!anotaciones) {
    anotaciones = ctx.obj([]);
    pagina.node.set(PDFName.of("Annots"), anotaciones);
  }
  anotaciones.push(widgetRef);

  let acro = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (!acro) {
    acro = ctx.obj({ Fields: [] });
    doc.catalog.set(PDFName.of("AcroForm"), ctx.register(acro));
  }
  acro.set(PDFName.of("SigFlags"), PDFNumber.of(3)); // 1 = hay firmas, 2 = solo se agrega al final
  let campos = acro.lookupMaybe(PDFName.of("Fields"), PDFArray);
  if (!campos) {
    campos = ctx.obj([]);
    acro.set(PDFName.of("Fields"), campos);
  }
  campos.push(widgetRef);
  // Firma de certificación: el catálogo la declara como DocMDP.
  doc.catalog.set(PDFName.of("Perms"), ctx.obj({ DocMDP: firmaRef }));
}
