/* =============================================================================
   Gestión de convenios · plantillas Word (.docx).

   La idea: CONSERVAR el .docx original (estilos, imágenes, encabezados, logos, tablas) y
   sustituir los campos dentro de su XML, sin reconstruir el documento.

     leerDocx      abre el archivo (zip con fflate), lista los campos que encuentra y arma una
                   vista previa en HTML (propia, sin dependencias: párrafos, títulos, negrita,
                   cursiva, subrayado, tablas, imágenes y el encabezado).
     generarDocx   devuelve un .docx nuevo con los valores en lugar de los campos. Un campo se
                   escribe {{campo}}, [campo] o <<campo>> y Word suele partirlo en varios
                   «w:r» (tramos con formato): se junta el texto del párrafo, se halla el campo
                   y el valor se pone en el primer tramo, vaciando el resto, con el formato del
                   primer tramo. {{logo_udes}} y {{logo_institucion}} se sustituyen por la imagen.

   El archivo es dato NO confiable: nada se ejecuta. Se rechaza si pesa más de 15 MB, se
   descomprime a más de 80 MB, es habilitado para macros o no trae word/document.xml.
   Límite conocido: los campos dentro de cuadros de texto (w:txbxContent) no se reemplazan.
   ========================================================================== */

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { claveDe, esc, hallarMarcadores } from "./logica";

export const DOCX_MAX_BYTES = 15 * 1024 * 1024;
const DESCOMPRIMIDO_MAX = 80 * 1024 * 1024;
const IMAGEN_VISTA_MAX = 1_500_000;
export const TIPO_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class ErrorDocx extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDocx";
  }
}

export interface InformeDocx {
  /** Claves de campo encontradas (normalizadas). */
  marcadores: string[];
  /** Vista previa HTML segura (todo el texto va escapado). */
  vistaHtml: string;
  avisos: string[];
}

export interface ImagenLogo {
  bytes: Uint8Array;
  ext: "png" | "jpg";
  ancho: number;
  alto: number;
}

/* ---------- Abrir el zip con cuidado -------------------------------------------------------- */

function abrir(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.length > DOCX_MAX_BYTES) throw new ErrorDocx("El archivo pesa más de 15 MB.");
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new ErrorDocx("El archivo no es un documento de Word (.docx).");
  let total = 0;
  let nombres: string[] = [];
  try {
    unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        nombres.push(f.name);
        return false;
      },
    });
  } catch {
    throw new ErrorDocx("No se pudo abrir el archivo: no parece un .docx válido.");
  }
  if (total > DESCOMPRIMIDO_MAX) throw new ErrorDocx("El documento descomprimido es demasiado grande.");
  if (nombres.some((n) => /vbaProject\.bin$/i.test(n))) throw new ErrorDocx("El archivo trae macros. Guárdelo como .docx sin macros.");
  if (!nombres.includes("word/document.xml") || !nombres.includes("[Content_Types].xml")) throw new ErrorDocx("El archivo no es un documento de Word (.docx).");
  nombres = [];
  return unzipSync(bytes);
}

const PARTES_TEXTO = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

/* ---------- Texto de los párrafos ----------------------------------------------------------- */

const decodificar = (s: string) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const escXml = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const RE_PARRAFO = /<w:p[ >][\s\S]*?<\/w:p>/g;
const RE_RUN = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
const RE_T = /<w:t(?:\s[^>]*)?\/>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

interface Tramo {
  inicio: number;
  fin: number;
  xml: string;
  texto: string;
}

function tramosDe(parrafo: string): Tramo[] {
  const sal: Tramo[] = [];
  for (const m of parrafo.matchAll(RE_RUN)) {
    let texto = "";
    for (const t of m[0].matchAll(RE_T)) texto += decodificar(t[1] ?? "");
    sal.push({ inicio: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, xml: m[0], texto });
  }
  return sal;
}

/* ---------- Leer ------------------------------------------------------------------------------ */

export function leerDocx(bytes: Uint8Array, conocidos: ReadonlySet<string>): InformeDocx {
  const partes = abrir(bytes);
  const claves = new Set<string>();
  const avisos: string[] = [];
  for (const [nombre, datos] of Object.entries(partes)) {
    if (!PARTES_TEXTO.test(nombre)) continue;
    const xml = strFromU8(datos);
    if (xml.includes("<w:txbxContent")) avisos.push("El documento tiene cuadros de texto: los campos que estén dentro de ellos no se reemplazan.");
    for (const p of xml.match(RE_PARRAFO) ?? []) {
      if (p.includes("<w:txbxContent")) continue;
      const texto = tramosDe(p).map((t) => t.texto).join("");
      for (const h of hallarMarcadores(texto, conocidos)) claves.add(h.clave);
    }
  }
  return { marcadores: [...claves], vistaHtml: vistaPrevia(partes, conocidos), avisos: [...new Set(avisos)] };
}

/* ---------- Vista previa ------------------------------------------------------------------------ */

type Segmento = { t: string; b: boolean; i: boolean; u: boolean } | { img: string };

function vistaPrevia(partes: Record<string, Uint8Array>, conocidos: ReadonlySet<string>): string {
  const analizar = (nombre: string): Document | null => {
    const d = partes[nombre];
    if (!d) return null;
    const doc = new DOMParser().parseFromString(strFromU8(d), "application/xml");
    return doc.getElementsByTagName("parsererror").length ? null : doc;
  };
  const relaciones = (nombre: string): Map<string, string> => {
    const m = new Map<string, string>();
    const doc = analizar(`word/_rels/${nombre}.rels`);
    doc?.querySelectorAll("Relationship").forEach((r) => m.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? ""));
    return m;
  };
  const hijo = (el: Element, nombre: string) => [...el.children].find((c) => c.localName === nombre);
  const activo = (rpr: Element | undefined, nombre: string) => {
    const e = rpr && hijo(rpr, nombre);
    if (!e) return false;
    const v = e.getAttribute("w:val") ?? e.getAttribute("val");
    return v !== "0" && v !== "false" && v !== "none";
  };
  let presupuesto = 600_000;

  const imagenDe = (draw: Element, rels: Map<string, string>): string | null => {
    const blip = draw.getElementsByTagName("a:blip")[0];
    const id = blip?.getAttribute("r:embed");
    const destino = id ? rels.get(id) : undefined;
    if (!destino) return null;
    const ruta = destino.startsWith("/") ? destino.slice(1) : `word/${destino}`;
    const datos = partes[ruta];
    const ext = ruta.split(".").pop()?.toLowerCase() ?? "";
    const tipo = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : "";
    if (!datos || !tipo || datos.length > IMAGEN_VISTA_MAX) return null;
    let bin = "";
    for (let i = 0; i < datos.length; i += 8192) bin += String.fromCharCode(...datos.subarray(i, i + 8192));
    return `data:${tipo};base64,${btoa(bin)}`;
  };

  const parrafo = (p: Element, rels: Map<string, string>): string => {
    const ppr = hijo(p, "pPr");
    const estilo = ppr && hijo(ppr, "pStyle")?.getAttribute("w:val");
    const jc = ppr && hijo(ppr, "jc")?.getAttribute("w:val");
    const lista = Boolean(ppr && hijo(ppr, "numPr"));
    const nivel = estilo && /^(Heading|Ttulo|Title)\s*(\d)?/i.exec(estilo);
    const segs: Segmento[] = [];
    const tramo = (r: Element) => {
      const rpr = hijo(r, "rPr");
      const f = { b: activo(rpr, "b"), i: activo(rpr, "i"), u: activo(rpr, "u") };
      for (const c of r.children) {
        if (c.localName === "t") segs.push({ t: c.textContent ?? "", ...f });
        else if (c.localName === "tab") segs.push({ t: "    ", ...f });
        else if (c.localName === "br") segs.push({ t: "\n", ...f });
        else if (c.localName === "drawing" || c.localName === "pict") {
          const src = imagenDe(c, rels);
          if (src) segs.push({ img: src });
        }
      }
    };
    for (const c of p.children) {
      if (c.localName === "r") tramo(c);
      else if (["hyperlink", "ins", "smartTag", "sdt", "fldSimple"].includes(c.localName)) c.querySelectorAll("r").forEach(tramo);
    }
    const texto = segs.map((s) => ("t" in s ? s.t : "")).join("");
    const marcas = hallarMarcadores(texto, conocidos);
    let pos = 0;
    let html = "";
    const escribir = (s: { t: string; b: boolean; i: boolean; u: boolean }, a: number, b: number) => {
      const trozo = s.t.slice(a, b);
      if (!trozo) return;
      let h = esc(trozo).replace(/\n/g, "<br>");
      if (s.b) h = `<b>${h}</b>`;
      if (s.i) h = `<i>${h}</i>`;
      if (s.u) h = `<u>${h}</u>`;
      const dentro = marcas.some((m) => pos + a >= m.inicio && pos + a < m.fin);
      html += dentro ? `<mark class="gest-campo">${h}</mark>` : h;
    };
    for (const s of segs) {
      if ("img" in s) {
        html += `<img src="${s.img}" alt="" style="max-width:100%;max-height:120px">`;
        continue;
      }
      // Se corta el tramo donde empieza o termina un campo para resaltarlo entero.
      const cortes = [0, s.t.length, ...marcas.flatMap((m) => [m.inicio - pos, m.fin - pos])].filter((x) => x >= 0 && x <= s.t.length).sort((x, y) => x - y);
      for (let k = 0; k < cortes.length - 1; k++) escribir(s, cortes[k], cortes[k + 1]);
      pos += s.t.length;
    }
    if (!html.trim()) return "<p class=\"gest-vacio\">&nbsp;</p>";
    const alinear = jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : jc === "both" ? "justify" : "left";
    const etiqueta = nivel ? `h${Math.min(4, Math.max(1, Number(nivel[2]) || 1))}` : "p";
    return `<${etiqueta} style="text-align:${alinear}">${lista && !nivel ? "• " : ""}${html}</${etiqueta}>`;
  };

  const bloques = (cont: Element, rels: Map<string, string>): string => {
    let html = "";
    for (const c of cont.children) {
      if (presupuesto <= 0) break;
      let h = "";
      if (c.localName === "p") h = parrafo(c, rels);
      else if (c.localName === "tbl") {
        h = "<table>";
        for (const tr of c.children) {
          if (tr.localName !== "tr") continue;
          h += "<tr>";
          for (const tc of tr.children) if (tc.localName === "tc") h += `<td>${bloques(tc, rels)}</td>`;
          h += "</tr>";
        }
        h += "</table>";
      } else if (c.localName === "sdt") {
        const contenido = hijo(c, "sdtContent");
        if (contenido) h = bloques(contenido, rels);
      }
      presupuesto -= h.length;
      html += h;
    }
    return html;
  };

  const salida: string[] = [];
  const cab = Object.keys(partes).filter((n) => /^word\/header\d*\.xml$/.test(n)).sort()[0];
  if (cab) {
    const doc = analizar(cab);
    if (doc) {
      const h = bloques(doc.documentElement, relaciones(cab.slice(5)));
      if (h.replace(/<[^>]+>|&nbsp;/g, "").trim() || h.includes("<img")) salida.push(`<div class="gest-enc">${h}</div>`);
    }
  }
  const principal = analizar("word/document.xml");
  const cuerpo = principal && [...principal.getElementsByTagName("w:body")][0];
  if (cuerpo) salida.push(bloques(cuerpo, relaciones("document.xml")));
  if (presupuesto <= 0) salida.push('<p class="gest-sub">La vista previa se corta aquí por su tamaño; el documento generado sí trae todo.</p>');
  return salida.join("");
}

/* ---------- Generar ------------------------------------------------------------------------------- */

const EMU_CM = 360_000;

function dibujo(rid: string, img: ImagenLogo, n: number): string {
  const maxAlto = 1.6 * EMU_CM;
  const maxAncho = 5 * EMU_CM;
  const k = Math.min(maxAlto / img.alto, maxAncho / img.ancho);
  const cx = Math.round(img.ancho * k);
  const cy = Math.round(img.alto * k);
  return (
    `<w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${9000 + n}" name="Logo ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${9000 + n}" name="logo-${n}.${img.ext}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`
  );
}

const CENTINELA = /(\w+)/;

/** El XML que reemplaza los w:t de un tramo: texto con saltos de línea y, si hay centinelas, las imágenes. */
function textoAXml(texto: string, imagen: (clave: string) => string): string {
  return texto
    .split(/(\w+)/)
    .map((trozo) => {
      const c = CENTINELA.exec(trozo);
      if (c) return imagen(c[1]);
      if (!trozo) return "";
      return trozo
        .split("\n")
        .map((linea) => (linea ? `<w:t xml:space="preserve">${escXml(linea)}</w:t>` : ""))
        .join("<w:br/>");
    })
    .join("");
}

function reescribirTramo(xml: string, nuevo: string, imagen: (clave: string) => string): string {
  let primero = true;
  let sin = xml.replace(RE_T, () => {
    if (primero) {
      primero = false;
      return "";
    }
    return "";
  });
  if (!sin.includes("")) sin = sin.replace(/<\/w:r>$/, "</w:r>");
  return sin.replace("", () => textoAXml(nuevo, imagen));
}

export interface ResultadoGeneracion {
  bytes: Uint8Array;
  /** Campos del documento que no tenían valor. */
  sinValor: string[];
  avisos: string[];
}

export function generarDocx(original: Uint8Array, valores: Record<string, string>, logos: { logo_udes?: ImagenLogo | null; logo_institucion?: ImagenLogo | null }, conocidos: ReadonlySet<string>): ResultadoGeneracion {
  const partes = abrir(original);
  const sinValor = new Set<string>();
  const avisos: string[] = [];
  const salida: Record<string, Uint8Array> = { ...partes };
  let contenido = strFromU8(partes["[Content_Types].xml"]);
  const mediaAgregada = new Set<string>();
  let nImg = 0;

  for (const nombre of Object.keys(partes)) {
    if (!PARTES_TEXTO.test(nombre)) continue;
    let xml = strFromU8(partes[nombre]);
    const usadas = new Map<string, string>(); // clave de logo → rId en esta parte
    const imagen = (clave: string): string => {
      const img = clave === "logo_udes" ? logos.logo_udes : logos.logo_institucion;
      if (!img) return "";
      let rid = usadas.get(clave);
      if (!rid) {
        rid = `rIdConv${clave === "logo_udes" ? "U" : "I"}`;
        usadas.set(clave, rid);
      }
      nImg += 1;
      return dibujo(rid, img, nImg);
    };

    xml = xml.replace(RE_PARRAFO, (p) => {
      if (p.includes("<w:txbxContent")) return p;
      const tramos = tramosDe(p);
      const texto = tramos.map((t) => t.texto).join("");
      const hallazgos = hallarMarcadores(texto, conocidos);
      if (!hallazgos.length) return p;
      const reemplazo = (clave: string): string => {
        if (clave === "logo_udes" || clave === "logo_institucion") return logos[clave] ? `${clave}` : "";
        const v = valores[clave];
        if (v === undefined || !v.trim()) {
          sinValor.add(clave);
          return "________";
        }
        return v;
      };
      let a = 0;
      const nuevos = tramos.map((t) => {
        const b = a + t.texto.length;
        let cursor = a;
        let sal = "";
        for (const h of hallazgos) {
          if (h.fin <= a || h.inicio >= b) continue;
          sal += t.texto.slice(cursor - a, Math.max(h.inicio, a) - a);
          if (h.inicio >= a) sal += reemplazo(h.clave);
          cursor = Math.min(h.fin, b);
        }
        sal += t.texto.slice(cursor - a);
        a = b;
        return sal;
      });
      let res = "";
      let desde = 0;
      tramos.forEach((t, i) => {
        res += p.slice(desde, t.inicio);
        res += nuevos[i] === t.texto ? t.xml : reescribirTramo(t.xml, nuevos[i], imagen);
        desde = t.fin;
      });
      return res + p.slice(desde);
    });
    salida[nombre] = strToU8(xml);

    if (usadas.size) {
      const relRuta = `word/_rels/${nombre.slice(5)}.rels`;
      let rels = partes[relRuta] ? strFromU8(partes[relRuta]) : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      for (const [clave, rid] of usadas) {
        const img = clave === "logo_udes" ? logos.logo_udes : logos.logo_institucion;
        if (!img) continue;
        const medio = `word/media/conv_${clave}.${img.ext}`;
        if (!mediaAgregada.has(medio)) {
          salida[medio] = img.bytes;
          mediaAgregada.add(medio);
        }
        rels = rels.replace(/<\/Relationships>\s*$/, `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/conv_${clave}.${img.ext}"/></Relationships>`);
      }
      salida[relRuta] = strToU8(rels);
      for (const [ext, tipo] of [["png", "image/png"], ["jpg", "image/jpeg"]] as const) {
        if ([...mediaAgregada].some((m) => m.endsWith(`.${ext}`)) && !new RegExp(`<Default[^>]*Extension="${ext}"`, "i").test(contenido)) {
          contenido = contenido.replace(/<Types([^>]*)>/, `<Types$1><Default Extension="${ext}" ContentType="${tipo}"/>`);
        }
      }
    }
  }
  salida["[Content_Types].xml"] = strToU8(contenido);
  if (!(salida["word/document.xml"] instanceof Uint8Array)) throw new ErrorDocx("No se pudo armar el documento.");
  return { bytes: zipSync(salida, { level: 6 }), sinValor: [...sinValor], avisos };
}

/* ---------- Imágenes (logos) ------------------------------------------------------------------------ */

/** Lee un logo PNG, JPG o SVG y lo deja como PNG o JPG con sus medidas (el SVG se dibuja a PNG). */
export async function prepararLogo(blob: Blob): Promise<ImagenLogo> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo leer la imagen."));
      i.src = url;
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (blob.type === "image/png" || blob.type === "image/jpeg") {
      return { bytes, ext: blob.type === "image/png" ? "png" : "jpg", ancho: img.naturalWidth || 1, alto: img.naturalHeight || 1 };
    }
    const ancho0 = img.naturalWidth || 600;
    const alto0 = img.naturalHeight || 200;
    const k = 800 / Math.max(ancho0, 1);
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(ancho0 * k);
    lienzo.height = Math.round(alto0 * k);
    const c = lienzo.getContext("2d");
    if (!c) throw new Error("El navegador no pudo preparar la imagen.");
    c.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const png = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/png"));
    if (!png) throw new Error("No se pudo convertir el SVG a PNG.");
    return { bytes: new Uint8Array(await png.arrayBuffer()), ext: "png", ancho: lienzo.width, alto: lienzo.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

let logoPorDefecto: Promise<ImagenLogo> | null = null;
/** El logo oficial de la UDES (public/logo-udes.svg) como PNG. */
export function logoUdesOficial(): Promise<ImagenLogo> {
  logoPorDefecto ??= fetch("/logo-udes.svg")
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("No se encontró el logo oficial."))))
    .then((b) => prepararLogo(new Blob([b], { type: "image/svg+xml" })))
    .catch((e) => {
      logoPorDefecto = null;
      throw e;
    });
  return logoPorDefecto;
}

export const dataUrlDe = (img: ImagenLogo): string => {
  let bin = "";
  for (let i = 0; i < img.bytes.length; i += 8192) bin += String.fromCharCode(...img.bytes.subarray(i, i + 8192));
  return `data:${img.ext === "png" ? "image/png" : "image/jpeg"};base64,${btoa(bin)}`;
};

export { claveDe };
