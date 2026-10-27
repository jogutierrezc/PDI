/* =============================================================================
   UI GreenMetric · leer una plantilla .docx ya diligenciada (en inglés).

   Se abre como zip con fflate y se lee `word/document.xml` con el DOMParser del
   navegador (mismo método que udrive/lib/importarDocx.ts). El archivo es dato NO
   confiable: nunca se ejecuta nada, y se rechaza si
     · pesa más de 15 MB o se descomprime a más de 80 MB (zip bomb);
     · es habilitado para macros (.docm, vbaProject.bin);
     · trae relaciones externas que no sean enlaces (plantillas adjuntas, OLE…).
   Devuelve un informe de lo reconocido con tres estados por elemento (nuevo,
   igual, en conflicto) para que la persona decida qué conservar ANTES de aplicar.
   Los textos de ejemplo de la plantilla oficial (otras universidades) se detectan
   y se descartan.
   ========================================================================== */

import { strFromU8, unzipSync } from "fflate";
import { aNumero } from "./calculo";
import { preguntaBase } from "./catalogo";
import type { CapturaUgm, FilaTabla, PreguntaCatalogo, RespuestaUgm, ValorCampo } from "./tipos";

export const DOCX_MAX_BYTES = 15 * 1024 * 1024;
const DESCOMPRIMIDO_MAX = 80 * 1024 * 1024;
const IMAGEN_MAX = 12 * 1024 * 1024;
const IMAGENES_MAX = 80;

export class ErrorImportacion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorImportacion";
  }
}

export type EstadoItem = "nuevo" | "igual" | "conflicto";

export interface ItemImportacion {
  /** «campo:descripcion», «campo:area», «tabla:edificios», «enlace». */
  clave: string;
  etiqueta: string;
  tipo: "texto" | "numero" | "url" | "tabla";
  actual: string;
  importado: string;
  estado: EstadoItem;
  /** Valor ya convertido, listo para aplicar. */
  valor: string | number | FilaTabla[];
}

export interface ImagenImportada {
  nombre: string;
  tipo: "png" | "jpg";
  bytes: Uint8Array;
}

export interface InformeImportacion {
  q: string;
  /** Cómo se reconoció la pregunta. */
  origenQ: "titulo" | "archivo";
  items: ItemImportacion[];
  /** Pies de figura leídos: [{figura, pie}]. */
  pies: { figura: number; pie: string }[];
  imagenes: ImagenImportada[];
  /** Textos de ejemplo de la plantilla oficial que se descartaron. */
  descartados: string[];
  advertencias: string[];
  enlaces: number;
}

interface Bloque {
  t: "p" | "tabla";
  texto: string;
  filas: string[][];
  imagenes: string[];
}

const ESPACIOS = /\s+/g;
const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const ES_EJEMPLO = /Wageningen|Nottingham|Mahidol|UC Davis|Universitas Indonesia|University X|\bSAMPLE\b|^Example of\b/i;
const INSTRUCCION = /^\(?\s*(please|you can|note|if your|kindly)\b/i;

function hijos(el: Element): Element[] {
  return [...el.children];
}
function desc(el: Element, nombre: string): Element[] {
  return [...el.getElementsByTagName("*")].filter((x) => x.localName === nombre);
}
function atributo(el: Element | null | undefined, nombre: string): string {
  if (!el) return "";
  for (const a of el.attributes) if (a.localName === nombre) return a.value;
  return "";
}
function textoDe(el: Element): string {
  let s = "";
  for (const x of desc(el, "t")) s += x.textContent ?? "";
  // Tabuladores y saltos de línea de Word.
  return s.replace(ESPACIOS, " ").trim();
}

function parsear(bytes: Uint8Array | undefined, nombre: string): Document {
  if (!bytes) throw new ErrorImportacion(`El archivo no trae ${nombre}: no es un Word válido.`);
  const d = new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
  if (d.getElementsByTagName("parsererror").length) throw new ErrorImportacion(`No se pudo leer ${nombre}.`);
  return d;
}

/** Número escrito en inglés («1,234.5», «26.5 %») → número. */
export function numeroDesdeIngles(s: string): number | null {
  const t = s.replace(/[%\s]/g, "").replace(/[A-Za-zµ²³/]+$/u, "");
  if (!t) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : aNumero(t);
}

function abrir(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.byteLength > DOCX_MAX_BYTES) throw new ErrorImportacion("El archivo pesa más de 15 MB.");
  let total = 0;
  let partes: Record<string, Uint8Array>;
  try {
    partes = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > DESCOMPRIMIDO_MAX) throw new ErrorImportacion("El archivo se descomprime a más de 80 MB: se rechaza.");
        return /^(\[Content_Types\]\.xml|word\/(document\.xml|_rels\/document\.xml\.rels|media\/[^/]+|vbaProject\.bin))$/.test(f.name) && f.originalSize <= IMAGEN_MAX;
      },
    });
  } catch (e) {
    if (e instanceof ErrorImportacion) throw e;
    throw new ErrorImportacion("No es un archivo Word (.docx) válido.");
  }
  if ("word/vbaProject.bin" in partes) throw new ErrorImportacion("El archivo trae macros: no se importa.");
  const tipos = partes["[Content_Types].xml"] ? strFromU8(partes["[Content_Types].xml"]) : "";
  if (/macroEnabled/i.test(tipos)) throw new ErrorImportacion("El archivo es un Word con macros (.docm): no se importa.");
  if (!partes["word/document.xml"]) throw new ErrorImportacion("No es un archivo Word (.docx) válido.");
  return partes;
}

/** Relaciones: id → destino, y rechazo de las externas que no sean enlaces. */
function relaciones(partes: Record<string, Uint8Array>): { destino: Map<string, string>; enlaces: number } {
  const destino = new Map<string, string>();
  let enlaces = 0;
  const bytes = partes["word/_rels/document.xml.rels"];
  if (!bytes) return { destino, enlaces };
  const doc = parsear(bytes, "las relaciones del documento");
  for (const r of desc(doc.documentElement, "Relationship")) {
    const externa = r.getAttribute("TargetMode") === "External";
    const tipo = r.getAttribute("Type") ?? "";
    if (externa && !/\/hyperlink$/.test(tipo)) throw new ErrorImportacion("El archivo trae vínculos externos que no son enlaces (plantillas adjuntas u objetos): no se importa.");
    if (externa) enlaces += 1;
    else destino.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");
  }
  return { destino, enlaces };
}

function bloquesDe(doc: Document): Bloque[] {
  const cuerpo = desc(doc.documentElement, "body")[0];
  if (!cuerpo) return [];
  const out: Bloque[] = [];
  for (const el of hijos(cuerpo)) {
    if (el.localName === "p") {
      out.push({ t: "p", texto: textoDe(el), filas: [], imagenes: desc(el, "blip").map((b) => atributo(b, "embed")).filter(Boolean) });
    } else if (el.localName === "tbl") {
      const filas = hijos(el)
        .filter((x) => x.localName === "tr")
        .map((tr) => hijos(tr).filter((c) => c.localName === "tc").map(textoDe));
      out.push({ t: "tabla", texto: "", filas, imagenes: desc(el, "blip").map((b) => atributo(b, "embed")).filter(Boolean) });
    }
  }
  return out;
}

function detectarQ(bloques: Bloque[], nombreArchivo: string | undefined): { q: string; origen: "titulo" | "archivo"; conflicto: string | null } {
  let delTitulo: string | null = null;
  for (const b of bloques.slice(0, 40)) {
    const m = b.t === "p" ? b.texto.match(/^\[(\d{1,2}\.\d{1,2})\]/) : null;
    // La línea de categoría es «[1] Nombre (SI)»: sin punto, no cuenta.
    if (m) {
      delTitulo = m[1];
      break;
    }
  }
  const mf = nombreArchivo?.match(/(?:^|[_\s-])(\d{1,2})_(\d{1,2})(?=[_\s.-])/);
  const delArchivo = mf ? `${Number(mf[1])}.${Number(mf[2])}` : null;
  if (delTitulo) return { q: delTitulo, origen: "titulo", conflicto: delArchivo && delArchivo !== delTitulo ? `El nombre del archivo dice ${delArchivo} pero el título dice ${delTitulo}: se usa el título.` : null };
  if (delArchivo) return { q: delArchivo, origen: "archivo", conflicto: null };
  throw new ErrorImportacion("No se reconoce a qué pregunta pertenece: el título debe empezar por «[n.m]» o el archivo llevar el número en su nombre.");
}

function sinEtiqueta(texto: string, etiqueta: string): string | null {
  const re = new RegExp(`^${etiqueta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:\\([^)]*\\))?\\s*:\\s*`, "i");
  return re.test(texto) ? texto.replace(re, "").trim() : null;
}

const igualTexto = (a: string, b: string): boolean => norm(a) === norm(b);

function estadoDe(actual: string, importado: string): EstadoItem {
  if (!actual.trim()) return "nuevo";
  return igualTexto(actual, importado) ? "igual" : "conflicto";
}

/**
 * Lee la plantilla diligenciada. `actual` es la respuesta de hoy (para comparar). `preguntaDe` resuelve la pregunta
 * (por omisión, el catálogo de la guía 2026; U2 puede pasar la del ciclo).
 */
export function leerPlantillaDiligenciada(
  bytes: Uint8Array,
  opciones: { nombreArchivo?: string; actual?: Pick<RespuestaUgm, "valores" | "tablas_en" | "textos_en">; preguntaDe?: (q: string) => PreguntaCatalogo | undefined } = {},
): InformeImportacion {
  const partes = abrir(bytes);
  const { destino, enlaces } = relaciones(partes);
  const doc = parsear(partes["word/document.xml"], "el documento");
  const bloques = bloquesDe(doc);
  const det = detectarQ(bloques, opciones.nombreArchivo);
  const pregunta = (opciones.preguntaDe ?? preguntaBase)(det.q);
  if (!pregunta) throw new ErrorImportacion(`La pregunta ${det.q} no existe en el catálogo.`);
  if (!pregunta.plantilla) throw new ErrorImportacion(`La pregunta ${det.q} no tiene plantilla: no se importa desde un Word.`);
  const advertencias: string[] = det.conflicto ? [det.conflicto] : [];
  const descartados: string[] = [];
  const items: ItemImportacion[] = [];
  const actual = opciones.actual;

  const parrafos = bloques.map((b, i) => ({ i, b })).filter((x) => x.b.t === "p" && x.b.texto);
  const esFin = (txt: string): boolean => /^(Figure\s*\d+|Additional evidence link|Calculation\s*:)/i.test(txt) || pregunta.esquema.campos.some((c) => c.k !== "descripcion" && sinEtiqueta(txt, c.en) !== null);

  // Description.
  const campoDesc = pregunta.esquema.campos.find((c) => c.k === "descripcion");
  if (campoDesc) {
    const ini = parrafos.find((x) => /^Description\s*:/i.test(x.b.texto));
    if (ini) {
      const lineas: string[] = [];
      const resto = ini.b.texto.replace(/^Description\s*:\s*/i, "").trim();
      if (resto) lineas.push(resto);
      for (let j = ini.i + 1; j < bloques.length; j++) {
        const b = bloques[j];
        if (b.t === "tabla") break;
        const txt = b.texto.trim();
        if (!txt) continue;
        if (esFin(txt)) break;
        if (INSTRUCCION.test(txt)) continue;
        lineas.push(txt);
      }
      const texto = lineas.join("\n").trim();
      if (texto && ES_EJEMPLO.test(texto)) descartados.push(`Description: ${texto.slice(0, 120)}…`);
      else if (texto) items.push({ clave: "campo:descripcion", etiqueta: "Description", tipo: "texto", actual: actual?.textos_en.descripcion ?? "", importado: texto, estado: estadoDe(actual?.textos_en.descripcion ?? "", texto), valor: texto });
    } else advertencias.push("No se encontró el apartado «Description:».");
  }

  // Campos con etiqueta («Etiqueta: valor»).
  for (const c of pregunta.esquema.campos) {
    if (c.k === "descripcion" || c.k === "enlace" || (c.tipo !== "numero" && c.tipo !== "url" && c.tipo !== "texto" && c.tipo !== "texto_largo")) continue;
    for (const x of parrafos) {
      const v = sinEtiqueta(x.b.texto, c.en);
      if (v === null || !v) continue;
      if (ES_EJEMPLO.test(v)) {
        descartados.push(`${c.en}: ${v.slice(0, 100)}`);
        break;
      }
      if (c.tipo === "numero") {
        const n = numeroDesdeIngles(v);
        if (n === null) {
          advertencias.push(`«${c.en}»: no se pudo leer «${v}» como número.`);
          break;
        }
        const act = actual?.valores[c.k];
        const actTxt = typeof act === "number" ? String(act) : "";
        items.push({ clave: `campo:${c.k}`, etiqueta: c.en, tipo: "numero", actual: actTxt, importado: String(n), estado: !actTxt ? "nuevo" : Number(actTxt) === n ? "igual" : "conflicto", valor: n });
      } else if (c.tipo === "url") {
        const u = v.match(/https:\/\/\S+/)?.[0];
        if (u) items.push({ clave: `campo:${c.k}`, etiqueta: c.en, tipo: "url", actual: String(actual?.valores[c.k] ?? ""), importado: u, estado: estadoDe(String(actual?.valores[c.k] ?? ""), u), valor: u });
      } else {
        items.push({ clave: `campo:${c.k}`, etiqueta: c.en, tipo: "texto", actual: actual?.textos_en[c.k] ?? "", importado: v, estado: estadoDe(actual?.textos_en[c.k] ?? "", v), valor: v });
      }
      break;
    }
  }

  // Tablas: se busca la tabla de Word cuyo encabezado se parezca más a las columnas del esquema.
  for (const t of pregunta.esquema.tablas) {
    const etiquetas = t.columnas.map((c) => norm(c.en));
    let mejor: { tabla: Bloque; indices: number[]; puntos: number } | null = null;
    for (const b of bloques) {
      if (b.t !== "tabla" || b.filas.length < 2) continue;
      const enc = b.filas[0].map(norm);
      const indices = etiquetas.map((e) => enc.findIndex((h) => h === e || h.startsWith(e) || e.startsWith(h) && h.length > 2));
      const puntos = indices.filter((i) => i >= 0).length;
      if (puntos >= Math.max(1, Math.ceil(etiquetas.length / 2)) && (!mejor || puntos > mejor.puntos)) mejor = { tabla: b, indices, puntos };
    }
    if (!mejor) continue;
    const filas: FilaTabla[] = [];
    let ejemplo = 0;
    for (const f of mejor.tabla.filas.slice(1)) {
      if (f.every((x) => !x.trim())) continue;
      if (f.some((x) => ES_EJEMPLO.test(x))) {
        ejemplo += 1;
        continue;
      }
      const fila: FilaTabla = {};
      t.columnas.forEach((c, k) => {
        const crudo = mejor!.indices[k] >= 0 ? (f[mejor!.indices[k]] ?? "") : "";
        fila[c.k] = c.tipo === "numero" ? numeroDesdeIngles(crudo) : crudo;
      });
      filas.push(fila);
    }
    if (ejemplo) descartados.push(`Tabla «${t.en}»: ${ejemplo} fila(s) de ejemplo de otra universidad`);
    if (!filas.length) continue;
    const previa = actual?.tablas_en[t.k] ?? [];
    const actTxt = previa.length ? `${previa.length} fila(s)` : "";
    items.push({
      clave: `tabla:${t.k}`,
      etiqueta: t.en,
      tipo: "tabla",
      actual: actTxt,
      importado: `${filas.length} fila(s)`,
      estado: !previa.length ? "nuevo" : JSON.stringify(previa) === JSON.stringify(filas) ? "igual" : "conflicto",
      valor: filas,
    });
  }

  // Enlace adicional.
  const iEnlace = parrafos.find((x) => /^Additional evidence link/i.test(x.b.texto));
  if (iEnlace) {
    const sig = [iEnlace.b.texto, ...bloques.slice(iEnlace.i + 1, iEnlace.i + 4).map((b) => b.texto)];
    const u = sig.join(" ").match(/https:\/\/[^\s)]+/)?.[0];
    if (u) items.push({ clave: "campo:enlace", etiqueta: "Additional evidence link", tipo: "url", actual: String(actual?.valores.enlace ?? ""), importado: u, estado: estadoDe(String(actual?.valores.enlace ?? ""), u), valor: u });
  }

  // Pies de figura e imágenes.
  const pies: { figura: number; pie: string }[] = [];
  for (const x of parrafos) {
    const m = x.b.texto.match(/^Figure\s*(\d+)\s*[.:-]?\s*(.*)$/i);
    if (m && !ES_EJEMPLO.test(m[2])) pies.push({ figura: Number(m[1]), pie: m[2].trim() });
  }
  const imagenes: ImagenImportada[] = [];
  const vistos = new Set<string>();
  for (const b of bloques) {
    for (const id of b.imagenes) {
      const dest = destino.get(id);
      if (!dest || vistos.has(dest)) continue;
      vistos.add(dest);
      const ruta = `word/${dest.replace(/^\/?(word\/)?/, "")}`;
      const datos = partes[ruta];
      const ext = ruta.split(".").pop()?.toLowerCase();
      if (!datos) continue;
      if (ext !== "png" && ext !== "jpg" && ext !== "jpeg") {
        advertencias.push(`La imagen ${ruta.split("/").pop()} no es PNG ni JPG y no se importa.`);
        continue;
      }
      if (imagenes.length >= IMAGENES_MAX) {
        advertencias.push(`Solo se importan las primeras ${IMAGENES_MAX} imágenes.`);
        break;
      }
      imagenes.push({ nombre: ruta.split("/").pop() ?? "imagen", tipo: ext === "png" ? "png" : "jpg", bytes: datos });
    }
  }
  if (!items.length) advertencias.push("No se reconoció ningún campo de la plantilla. ¿Es la plantilla de esta pregunta, en inglés?");
  return { q: det.q, origenQ: det.origen, items, pies, imagenes, descartados, advertencias, enlaces };
}

/**
 * Lo que se guarda al aplicar los elementos elegidos. El inglés importado entra como texto/ filas en inglés (origen
 * «importacion»); si el español de una tabla está vacío, solo se copian sus columnas no textuales.
 * `traducciones` es la lista para ugm_guardar_traducciones (origen «importacion»).
 */
export function construirCaptura(
  informe: InformeImportacion,
  aceptados: readonly string[],
  pregunta: PreguntaCatalogo,
  actual: Pick<RespuestaUgm, "valores" | "tablas" | "tablas_en" | "textos_en">,
): { captura: CapturaUgm; traducciones: { campo: string; en?: string; filas?: FilaTabla[]; origen: "importacion" }[] } {
  const valores: Record<string, ValorCampo> = { ...actual.valores };
  const textosEn = { ...actual.textos_en };
  const tablas = { ...actual.tablas };
  const tablasEn = { ...actual.tablas_en };
  const traducciones: { campo: string; en?: string; filas?: FilaTabla[]; origen: "importacion" }[] = [];
  for (const it of informe.items) {
    if (!aceptados.includes(it.clave)) continue;
    const k = it.clave.split(":")[1];
    if (it.clave === "campo:enlace") valores.enlace = String(it.valor);
    else if (it.tipo === "numero" || it.tipo === "url") valores[k] = it.valor as ValorCampo;
    else if (it.tipo === "texto") {
      const campo = pregunta.esquema.campos.find((c) => c.k === k);
      textosEn[k] = String(it.valor);
      if (campo?.traducible) traducciones.push({ campo: k, en: String(it.valor), origen: "importacion" });
    } else if (it.tipo === "tabla") {
      const t = pregunta.esquema.tablas.find((x) => x.k === k);
      const filas = it.valor as FilaTabla[];
      tablasEn[k] = filas;
      if (t && !(tablas[k]?.length)) {
        tablas[k] = filas.map((f) => Object.fromEntries(t.columnas.map((c) => [c.k, c.tipo === "texto" ? "" : (f[c.k] ?? null)])));
      }
      if (t?.columnas.some((c) => c.tipo === "texto")) traducciones.push({ campo: `tabla:${k}`, filas, origen: "importacion" });
    }
  }
  return { captura: { valores, textos_en: textosEn, tablas, tablas_en: tablasEn }, traducciones };
}
