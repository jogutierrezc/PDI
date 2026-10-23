/* =============================================================================
   UDrive · leer un Word (.docx) para importarlo al informe, sin servidor.

   Un .docx es un zip; el contenido vive en word/document.xml. Se recorre en
   orden y se devuelven elementos (lib/importar.ts): títulos (por el estilo
   «Título N» / «Heading N» o por el nivel de esquema), párrafos con negrita,
   cursiva y enlaces ya en las marcas de lib/texto.ts, listas (con o sin
   número, según word/numbering.xml), tablas (como matriz de texto, con las
   celdas combinadas repartidas), imágenes (las de word/media, en el lugar del
   flujo donde estaban) y notas al pie (como «nota» tras su párrafo).

   Se descartan lo que el informe vuelve a generar: la tabla de contenido y los
   índices de tablas y figuras (por su estilo) y una portada corta antes de
   ellos. Los pies de figura («Tabla 3. …», estilo Caption) los une a su figura
   lib/importar.ts (`asociarPies`).

   Se carga con fflate (ya está en el proyecto) y el DOMParser del navegador;
   el texto de la persona pasa siempre por `escapar` antes de ir al informe.
   ========================================================================== */

import { strFromU8, unzipSync } from "fflate";
import { escapar } from "./texto";
import type { Elemento, ImagenExtraida } from "./importar";

const NOMBRES = ["word/document.xml", "word/styles.xml", "word/numbering.xml", "word/_rels/document.xml.rels", "word/footnotes.xml"];
const MAX_IMAGENES = 120;
const MAX_BYTES_IMAGEN = 12 * 1024 * 1024;

const hijos = (el: Element, nombre?: string): Element[] => [...el.children].filter((c) => (nombre ? c.localName === nombre : true));
const hijo = (el: Element | null | undefined, nombre: string): Element | null => (el ? (hijos(el, nombre)[0] ?? null) : null);
const descendientes = (el: Element, nombre: string): Element[] => [...el.getElementsByTagName("*")].filter((x) => x.localName === nombre);
/** El valor del atributo `w:val` (o el que sea) sin importar el prefijo del espacio de nombres. */
const atributo = (el: Element | null | undefined, nombre: string): string => {
  if (!el) return "";
  for (const a of el.attributes) if (a.localName === nombre) return a.value;
  return "";
};

function leerXml(bytes: Uint8Array | undefined): Document | null {
  if (!bytes) return null;
  const d = new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
  return d.getElementsByTagName("parsererror").length ? null : d;
}

/** Título de nivel 1–6 por el nombre de un estilo; 0 si no es título. */
function nivelPorNombre(nombre: string): number {
  const n = nombre.trim().toLowerCase();
  if (n === "title" || n === "título" || n === "titulo") return 1;
  const m = n.match(/^(?:heading|t[ií]tulo)\s*(\d)$/);
  return m ? Math.min(Math.max(Number(m[1]), 1), 6) : 0;
}

const ES_INDICE = /^(toc\s*\d|tdc\s*\d|toc heading|table of figures|tabla de ilustraciones|t[ií]tulo de tdc|encabezado de tdc|[ií]ndice\s*\d)/i;
const ES_PIE = /^(caption|ep[ií]grafe|leyenda|pie de (?:figura|foto|imagen|ilustraci[oó]n|tabla))/i;
const TITULO_INDICE = /^(tabla de contenidos?|contenidos?|[ií]ndice.*|lista de .*)$/i;

interface Estilos {
  nivel: Map<string, number>;
  indice: Set<string>;
  pie: Set<string>;
}

function leerEstilos(doc: Document | null): Estilos {
  const nivel = new Map<string, number>();
  const indice = new Set<string>();
  const pie = new Set<string>();
  if (doc) {
    for (const e of descendientes(doc.documentElement, "style")) {
      const id = atributo(e, "styleId");
      const nombre = atributo(hijo(e, "name"), "val");
      const porNombre = nivelPorNombre(nombre);
      const esquema = atributo(hijo(hijo(e, "pPr"), "outlineLvl"), "val");
      const n = porNombre || (esquema !== "" && Number(esquema) < 9 ? Number(esquema) + 1 : 0);
      if (id && n) nivel.set(id, n);
      if (id && (ES_INDICE.test(nombre) || ES_INDICE.test(id))) indice.add(id);
      if (id && (ES_PIE.test(nombre) || ES_PIE.test(id))) pie.add(id);
    }
  }
  return { nivel, indice, pie };
}

/** numId → «bullet» o el formato numérico del primer nivel, para saber si la lista lleva número. */
function leerNumeracion(doc: Document | null): Map<string, boolean> {
  const ordenada = new Map<string, boolean>();
  if (!doc) return ordenada;
  const abstractos = new Map<string, boolean>();
  for (const a of descendientes(doc.documentElement, "abstractNum")) {
    const nivel0 = hijos(a, "lvl").find((l) => atributo(l, "ilvl") === "0") ?? hijos(a, "lvl")[0];
    const formato = atributo(hijo(nivel0, "numFmt"), "val");
    abstractos.set(atributo(a, "abstractNumId"), Boolean(formato) && formato !== "bullet" && formato !== "none");
  }
  for (const n of descendientes(doc.documentElement, "num")) {
    const abs = atributo(hijo(n, "abstractNumId"), "val");
    ordenada.set(atributo(n, "numId"), abstractos.get(abs) ?? false);
  }
  return ordenada;
}

interface Relaciones {
  enlaces: Map<string, string>;
  imagenes: Map<string, string>;
}

function leerRelaciones(doc: Document | null): Relaciones {
  const enlaces = new Map<string, string>();
  const imagenes = new Map<string, string>();
  if (doc) {
    for (const r of descendientes(doc.documentElement, "Relationship")) {
      const id = r.getAttribute("Id") ?? "";
      const destino = r.getAttribute("Target") ?? "";
      if (r.getAttribute("TargetMode") === "External") enlaces.set(id, destino);
      else if (/\/image$/i.test(r.getAttribute("Type") ?? "")) imagenes.set(id, destino.replace(/^\/?(?:word\/)?/, "word/"));
    }
  }
  return { enlaces, imagenes };
}

/** id de nota al pie → su texto. */
function leerNotasAlPie(doc: Document | null): Map<string, string> {
  const m = new Map<string, string>();
  if (!doc) return m;
  for (const n of descendientes(doc.documentElement, "footnote")) {
    const tipo = atributo(n, "type");
    if (tipo === "separator" || tipo === "continuationSeparator" || tipo === "continuationNotice") continue;
    const texto = descendientes(n, "t")
      .map((t) => t.textContent ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (texto) m.set(atributo(n, "id"), texto);
  }
  return m;
}

/* ---------- párrafos ---------------------------------------------------------------------------------------- */

interface Trozo {
  texto: string;
  b: boolean;
  i: boolean;
  enlace: string;
}

const activo = (rPr: Element | null, nombre: string): boolean => {
  const e = hijo(rPr, nombre);
  if (!e) return false;
  const v = atributo(e, "val").toLowerCase();
  return v !== "false" && v !== "0" && v !== "off";
};

interface Lectura {
  trozos: Trozo[];
  imagenes: { rid: string; descripcion: string }[];
  notas: string[];
}

/** Las imágenes que cuelgan de un nodo de dibujo: moderno (a:blip) o antiguo (v:imagedata). */
function imagenesDe(nodo: Element): { rid: string; descripcion: string }[] {
  const salida: { rid: string; descripcion: string }[] = [];
  const descr = atributo(descendientes(nodo, "docPr")[0], "descr") || atributo(descendientes(nodo, "docPr")[0], "title");
  for (const b of descendientes(nodo, "blip")) {
    const rid = atributo(b, "embed") || atributo(b, "link");
    if (rid) salida.push({ rid, descripcion: descr });
  }
  for (const v of descendientes(nodo, "imagedata")) {
    const rid = atributo(v, "id");
    if (rid) salida.push({ rid, descripcion: atributo(v, "title") });
  }
  return salida;
}

function leerTrozos(p: Element, rel: Relaciones): Lectura {
  const trozos: Trozo[] = [];
  const imagenes: Lectura["imagenes"] = [];
  const notas: string[] = [];
  const recorrer = (nodo: Element, enlace: string) => {
    for (const c of hijos(nodo)) {
      switch (c.localName) {
        case "r": {
          const rPr = hijo(c, "rPr");
          const b = activo(rPr, "b");
          const i = activo(rPr, "i");
          let texto = "";
          for (const x of hijos(c)) {
            if (x.localName === "t") texto += x.textContent ?? "";
            else if (x.localName === "tab") texto += " ";
            else if (x.localName === "br" || x.localName === "cr") texto += " ";
            else if (x.localName === "footnoteReference") notas.push(atributo(x, "id"));
            else if (x.localName === "drawing" || x.localName === "pict" || x.localName === "object") imagenes.push(...imagenesDe(x));
            else if (x.localName === "AlternateContent") {
              // Word guarda el dibujo dos veces (Choice y Fallback): se toma el primero.
              const eleccion = hijo(x, "Choice") ?? hijo(x, "Fallback");
              if (eleccion) imagenes.push(...imagenesDe(eleccion));
            }
          }
          if (texto) trozos.push({ texto, b, i, enlace });
          break;
        }
        case "hyperlink": {
          const id = [...c.attributes].find((a) => a.localName === "id")?.value ?? "";
          recorrer(c, rel.enlaces.get(id) ?? "");
          break;
        }
        case "ins":
        case "smartTag":
        case "fldSimple":
        case "sdt":
        case "sdtContent":
          recorrer(c, enlace);
          break;
        default:
          break; // «del» (borrado con cambios), propiedades, marcadores…
      }
    }
  };
  recorrer(p, "");
  // Una misma imagen citada dos veces en el párrafo (Choice y Fallback) cuenta una vez.
  const vistas = new Set<string>();
  return { trozos, imagenes: imagenes.filter((x) => (vistas.has(x.rid) ? false : (vistas.add(x.rid), true))), notas };
}

const sinCorchetes = (t: string) => t.replace(/\[/g, "(").replace(/\]/g, ")");
const valida = (url: string) => /^https?:\/\/[^\s<>"')]{1,800}$/i.test(url);

/** Los trozos como texto con marcas: **negrita**, *cursiva*, [texto](enlace); lo demás, escapado. */
export function trozosAMarcas(trozos: readonly Trozo[]): string {
  let salida = "";
  let k = 0;
  while (k < trozos.length) {
    const enlace = valida(trozos[k].enlace) ? trozos[k].enlace : "";
    let fin = k;
    while (fin < trozos.length && (valida(trozos[fin].enlace) ? trozos[fin].enlace : "") === enlace) fin++;
    const grupo = trozos.slice(k, fin);
    let b = false;
    let i = false;
    let interior = "";
    for (const t of grupo) {
      if (t.b !== b) (interior += "**"), (b = t.b);
      if (t.i !== i) (interior += "*"), (i = t.i);
      interior += enlace ? sinCorchetes(escapar(t.texto)).replace(/\\\(/g, "(").replace(/\\\)/g, ")") : escapar(t.texto);
    }
    if (b) interior += "**";
    if (i) interior += "*";
    salida += enlace && interior.replace(/[*\s]/g, "") ? `[${interior}](${enlace})` : interior;
    k = fin;
  }
  return salida.replace(/\s{2,}/g, " ").trim();
}

const planoDe = (trozos: readonly Trozo[]): string => trozos.map((t) => t.texto).join("").replace(/\s+/g, " ").trim();

/* ---------- imágenes ------------------------------------------------------------------------------------------- */

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" };

async function aImagen(bytes: Uint8Array, ruta: string): Promise<ImagenExtraida | null> {
  const ext = ruta.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const mime = MIME[ext];
  if (!mime || bytes.byteLength > MAX_BYTES_IMAGEN) return null;
  try {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const mapa = await createImageBitmap(blob);
    const { width, height } = mapa;
    mapa.close();
    if (width < 24 || height < 24) return null;
    return { blob, mime, ancho: width, alto: height };
  } catch {
    return null;
  }
}

/* ---------- el cuerpo ------------------------------------------------------------------------------------------- */

export interface ResultadoDocx {
  elementos: Elemento[];
  avisos: string[];
  descartes: string[];
  portada?: { titulo: string; subtitulo: string };
}

export async function leerDocx(bytes: Uint8Array): Promise<ResultadoDocx> {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(bytes, { filter: (f) => NOMBRES.includes(f.name) || /^word\/media\/[^/]+$/.test(f.name) });
  } catch {
    throw new Error("El archivo no se pudo abrir: no parece un Word (.docx) válido.");
  }
  const cuerpoXml = leerXml(archivos["word/document.xml"]);
  if (!cuerpoXml) throw new Error("El archivo no parece un Word (.docx): no tiene un documento legible.");
  const estilos = leerEstilos(leerXml(archivos["word/styles.xml"]));
  const numeracion = leerNumeracion(leerXml(archivos["word/numbering.xml"]));
  const rel = leerRelaciones(leerXml(archivos["word/_rels/document.xml.rels"]));
  const notasAlPie = leerNotasAlPie(leerXml(archivos["word/footnotes.xml"]));
  const cuerpo = descendientes(cuerpoXml.documentElement, "body")[0];
  if (!cuerpo) throw new Error("El Word no tiene cuerpo.");

  const avisos: string[] = [];
  const descartes: string[] = [];
  const elementos: Elemento[] = [];
  const porResolver: { el: Extract<Elemento, { t: "imagen" }>; ruta: string }[] = [];
  let imagenesTotal = 0;
  let imagenesSinRuta = 0;
  let indices = 0;
  let primerIndice = -1;

  const itemDeLista = (ordenada: boolean, texto: string) => {
    const ultimo = elementos[elementos.length - 1];
    if (ultimo?.t === "lista" && ultimo.ordenada === ordenada) ultimo.items.push(texto);
    else elementos.push({ t: "lista", ordenada, items: [texto] });
  };

  /** Si lo último que se guardó es el título del índice («Contenido»), también se va. */
  const quitarTituloDeIndice = () => {
    const ult = elementos[elementos.length - 1];
    if (ult && (ult.t === "titulo" || ult.t === "parrafo") && TITULO_INDICE.test(planoCorto(ult.texto))) elementos.pop();
  };

  const parrafo = (p: Element) => {
    const pPr = hijo(p, "pPr");
    const estilo = atributo(hijo(pPr, "pStyle"), "val");
    if (estilo && estilos.indice.has(estilo)) {
      quitarTituloDeIndice();
      if (primerIndice < 0) primerIndice = elementos.length;
      indices++;
      return;
    }
    const esquema = atributo(hijo(pPr, "outlineLvl"), "val");
    const nivel = estilos.nivel.get(estilo) || nivelPorNombre(estilo) || (esquema !== "" && Number(esquema) < 9 ? Number(esquema) + 1 : 0);
    const lectura = leerTrozos(p, rel);
    const plano = planoDe(lectura.trozos);

    if (plano) {
      if (nivel) elementos.push({ t: "titulo", nivel: Math.min(nivel, 3) as 1 | 2 | 3, texto: plano.slice(0, 300), dudoso: false });
      else {
        const numPr = hijo(pPr, "numPr");
        const numId = atributo(hijo(numPr, "numId"), "val");
        if (numPr && numId && numId !== "0") itemDeLista(numeracion.get(numId) ?? false, trozosAMarcas(lectura.trozos));
        else elementos.push({ t: "parrafo", texto: trozosAMarcas(lectura.trozos), ...(estilo && estilos.pie.has(estilo) ? { pie: true } : {}) });
      }
    }
    for (const id of lectura.notas) {
      const n = notasAlPie.get(id);
      if (n) elementos.push({ t: "nota", texto: escapar(`[${id}] ${n}`).slice(0, 600) });
    }
    for (const im of lectura.imagenes) {
      imagenesTotal++;
      const ruta = rel.imagenes.get(im.rid);
      const el: Extract<Elemento, { t: "imagen" }> = { t: "imagen", descripcion: im.descripcion.replace(/\s+/g, " ").trim().slice(0, 250), titulo: "", nota: "", imagen: null, origen: "word" };
      elementos.push(el);
      if (ruta && archivos[ruta]) porResolver.push({ el, ruta });
      else imagenesSinRuta++;
    }
  };

  const tabla = (tbl: Element) => {
    const filas: string[][] = [];
    for (const tr of hijos(tbl, "tr")) {
      const fila: string[] = [];
      for (const tc of hijos(tr, "tc")) {
        const tcPr = hijo(tc, "tcPr");
        const salto = atributo(hijo(tcPr, "gridSpan"), "val");
        const span = Math.min(Math.max(Number(salto) || 1, 1), 20);
        const vm = hijo(tcPr, "vMerge");
        const continua = Boolean(vm) && atributo(vm, "val") !== "restart";
        const texto = continua
          ? ""
          : hijos(tc, "p")
              .map((p) => planoDe(leerTrozos(p, rel).trozos))
              .filter(Boolean)
              .join(" ");
        fila.push(texto);
        for (let k = 1; k < span; k++) fila.push("");
      }
      if (fila.some((c) => c.trim() !== "")) filas.push(fila);
    }
    if (filas.length) elementos.push({ t: "tabla", filas, titulo: "", nota: "" });
  };

  const recorrer = (nodo: Element) => {
    for (const c of hijos(nodo)) {
      if (c.localName === "p") parrafo(c);
      else if (c.localName === "tbl") tabla(c);
      else if (c.localName === "sdt") {
        const galeria = atributo(descendientes(hijo(c, "sdtPr") ?? c, "docPartGallery")[0], "val");
        if (/table of contents|tabla de contenido/i.test(galeria)) {
          quitarTituloDeIndice();
          if (primerIndice < 0) primerIndice = elementos.length;
          indices++;
          continue;
        }
        const contenido = hijo(c, "sdtContent");
        if (contenido) recorrer(contenido);
      }
    }
  };
  recorrer(cuerpo);

  // Imágenes: se leen aquí, después del recorrido, porque decodificar es asíncrono.
  let resueltas = 0;
  let noSoportadas = 0;
  for (const { el, ruta } of porResolver.slice(0, MAX_IMAGENES)) {
    const img = await aImagen(archivos[ruta], ruta);
    if (img) {
      el.imagen = img;
      resueltas++;
    } else noSoportadas++;
  }
  const omitidas = Math.max(0, porResolver.length - MAX_IMAGENES);
  if (imagenesTotal) {
    avisos.push(
      `El Word trae ${imagenesTotal} ${imagenesTotal === 1 ? "imagen" : "imágenes"}: ${resueltas} se extrajeron${noSoportadas + imagenesSinRuta + omitidas ? ` y ${noSoportadas + imagenesSinRuta + omitidas} quedan pendientes (formato no compatible como EMF o WMF, vínculo roto o más de ${MAX_IMAGENES}; guárdelas como PNG en Word o elíjalas luego desde UDrive)` : ""}.`,
    );
  }

  // Portada: lo corto que hay antes del índice.
  let portada: ResultadoDocx["portada"];
  if (primerIndice > 0 && primerIndice <= 10) {
    const antes = elementos.slice(0, primerIndice);
    const cortos = antes.every((x) => (x.t === "parrafo" || x.t === "titulo") && planoCorto(x.texto).length <= 160);
    if (cortos && antes.length) {
      const textos = antes.map((x) => (x.t === "parrafo" || x.t === "titulo" ? planoCorto(x.texto) : ""));
      portada = { titulo: textos[0].slice(0, 300), subtitulo: (textos[1] ?? "").slice(0, 300) };
      elementos.splice(0, primerIndice);
      descartes.push("portada");
    }
  }
  if (indices) descartes.push(`${indices === 1 ? "1 entrada de índice" : `${indices} entradas de índice`}`);
  if (!elementos.length) avisos.push("El documento de Word no trae texto.");
  return { elementos, avisos, descartes, portada };
}

function planoCorto(marcado: string): string {
  return marcado
    .replace(/\\(.)/g, "$1")
    .replace(/\[([^\][]*)\]\([^)]*\)/g, "$1")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
