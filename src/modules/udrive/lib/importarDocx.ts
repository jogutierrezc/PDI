/* =============================================================================
   UDrive · leer un Word (.docx) para importarlo al informe, sin servidor.

   Un .docx es un zip; el contenido vive en word/document.xml. Se recorre en
   orden y se devuelven elementos (lib/importar.ts): títulos (por el estilo
   «Título N» / «Heading N» o por el nivel de esquema), párrafos con negrita,
   cursiva y enlaces ya en las marcas de lib/texto.ts, listas (con o sin
   número, según word/numbering.xml), tablas (como matriz de texto) e imágenes
   (solo se anotan: el archivo no se sube a ningún lado).

   Se carga con fflate (ya está en el proyecto) y el DOMParser del navegador;
   el texto de la persona pasa siempre por `escapar` antes de ir al informe.
   ========================================================================== */

import { strFromU8, unzipSync } from "fflate";
import { escapar } from "./texto";
import type { Elemento } from "./importar";

const NOMBRES = ["word/document.xml", "word/styles.xml", "word/numbering.xml", "word/_rels/document.xml.rels"];

const hijos = (el: Element, nombre?: string): Element[] => [...el.children].filter((c) => (nombre ? c.localName === nombre : true));
const hijo = (el: Element | null | undefined, nombre: string): Element | null => (el ? (hijos(el, nombre)[0] ?? null) : null);
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

interface Estilos {
  nivel: Map<string, number>;
}

function leerEstilos(doc: Document | null): Estilos {
  const nivel = new Map<string, number>();
  if (doc) {
    for (const e of [...doc.getElementsByTagName("*")].filter((x) => x.localName === "style")) {
      const id = atributo(e, "styleId");
      const porNombre = nivelPorNombre(atributo(hijo(e, "name"), "val"));
      const esquema = atributo(hijo(hijo(e, "pPr"), "outlineLvl"), "val");
      const n = porNombre || (esquema !== "" && Number(esquema) < 9 ? Number(esquema) + 1 : 0);
      if (id && n) nivel.set(id, n);
    }
  }
  return { nivel };
}

/** numId → «bullet» o el formato numérico del primer nivel, para saber si la lista lleva número. */
function leerNumeracion(doc: Document | null): Map<string, boolean> {
  const ordenada = new Map<string, boolean>();
  if (!doc) return ordenada;
  const todos = [...doc.getElementsByTagName("*")];
  const abstractos = new Map<string, boolean>();
  for (const a of todos.filter((x) => x.localName === "abstractNum")) {
    const nivel0 = hijos(a, "lvl").find((l) => atributo(l, "ilvl") === "0") ?? hijos(a, "lvl")[0];
    const formato = atributo(hijo(nivel0, "numFmt"), "val");
    abstractos.set(atributo(a, "abstractNumId"), Boolean(formato) && formato !== "bullet" && formato !== "none");
  }
  for (const n of todos.filter((x) => x.localName === "num")) {
    const abs = atributo(hijo(n, "abstractNumId"), "val");
    ordenada.set(atributo(n, "numId"), abstractos.get(abs) ?? false);
  }
  return ordenada;
}

function leerEnlaces(doc: Document | null): Map<string, string> {
  const m = new Map<string, string>();
  if (doc) for (const r of [...doc.getElementsByTagName("*")].filter((x) => x.localName === "Relationship")) if (r.getAttribute("TargetMode") === "External") m.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");
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
  imagen: boolean;
}

function leerTrozos(p: Element, enlaces: Map<string, string>): Lectura {
  const trozos: Trozo[] = [];
  let imagen = false;
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
            else if (x.localName === "drawing" || x.localName === "pict" || x.localName === "object") imagen = true;
          }
          if (texto) trozos.push({ texto, b, i, enlace });
          break;
        }
        case "hyperlink": {
          const id = [...c.attributes].find((a) => a.localName === "id")?.value ?? "";
          recorrer(c, enlaces.get(id) ?? "");
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
  return { trozos, imagen };
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

/* ---------- el cuerpo ------------------------------------------------------------------------------------------- */

export function leerDocx(bytes: Uint8Array): { elementos: Elemento[]; avisos: string[] } {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(bytes, { filter: (f) => NOMBRES.includes(f.name) });
  } catch {
    throw new Error("El archivo no se pudo abrir: no parece un Word (.docx) válido.");
  }
  const cuerpoXml = leerXml(archivos["word/document.xml"]);
  if (!cuerpoXml) throw new Error("El archivo no parece un Word (.docx): no tiene un documento legible.");
  const estilos = leerEstilos(leerXml(archivos["word/styles.xml"]));
  const numeracion = leerNumeracion(leerXml(archivos["word/numbering.xml"]));
  const enlaces = leerEnlaces(leerXml(archivos["word/_rels/document.xml.rels"]));
  const cuerpo = [...cuerpoXml.getElementsByTagName("*")].find((e) => e.localName === "body");
  if (!cuerpo) throw new Error("El Word no tiene cuerpo.");

  const avisos: string[] = [];
  const elementos: Elemento[] = [];
  let imagenes = 0;

  const itemDeLista = (ordenada: boolean, texto: string) => {
    const ultimo = elementos[elementos.length - 1];
    if (ultimo?.t === "lista" && ultimo.ordenada === ordenada) ultimo.items.push(texto);
    else elementos.push({ t: "lista", ordenada, items: [texto] });
  };

  const parrafo = (p: Element) => {
    const pPr = hijo(p, "pPr");
    const estilo = atributo(hijo(pPr, "pStyle"), "val");
    const esquema = atributo(hijo(pPr, "outlineLvl"), "val");
    const nivel = estilos.nivel.get(estilo) || nivelPorNombre(estilo) || (esquema !== "" && Number(esquema) < 9 ? Number(esquema) + 1 : 0);
    const lectura = leerTrozos(p, enlaces);
    const plano = planoDe(lectura.trozos);
    if (lectura.imagen) {
      imagenes++;
      elementos.push({ t: "imagen", descripcion: plano.slice(0, 120) });
      if (!plano) return;
    }
    if (!plano) return;
    if (nivel) {
      elementos.push({ t: "titulo", nivel: Math.min(nivel, 3) as 1 | 2 | 3, texto: plano.slice(0, 300), dudoso: false });
      return;
    }
    const numPr = hijo(pPr, "numPr");
    const numId = atributo(hijo(numPr, "numId"), "val");
    if (numPr && numId && numId !== "0") {
      itemDeLista(numeracion.get(numId) ?? false, trozosAMarcas(lectura.trozos));
      return;
    }
    elementos.push({ t: "parrafo", texto: trozosAMarcas(lectura.trozos) });
  };

  const tabla = (tbl: Element) => {
    const filas = hijos(tbl, "tr")
      .map((tr) =>
        hijos(tr, "tc").map((tc) =>
          hijos(tc, "p")
            .map((p) => planoDe(leerTrozos(p, enlaces).trozos))
            .filter(Boolean)
            .join(" "),
        ),
      )
      .filter((f) => f.some((c) => c.trim() !== ""));
    if (filas.length) elementos.push({ t: "tabla", filas, titulo: "" });
  };

  const recorrer = (nodo: Element) => {
    for (const c of hijos(nodo)) {
      if (c.localName === "p") parrafo(c);
      else if (c.localName === "tbl") tabla(c);
      else if (c.localName === "sdt") {
        const contenido = hijo(c, "sdtContent");
        if (contenido) recorrer(contenido);
      }
    }
  };
  recorrer(cuerpo);

  if (imagenes) avisos.push(`El Word trae ${imagenes} ${imagenes === 1 ? "imagen" : "imágenes"}: quedan como bloques de imagen pendientes, para elegirlas después desde UDrive.`);
  if (!elementos.length) avisos.push("El documento de Word no trae texto.");
  return { elementos, avisos };
}
