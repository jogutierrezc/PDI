/* =============================================================================
   UDrive · importar un Word o un PDF como informe (fase 3), sin React.

   Todo se lee en el navegador, sin subir el archivo a ningún lado. Primero un
   parseo determinista a elementos (títulos, párrafos, listas, tablas, imágenes
   pendientes); Pilo entra solo para lo ambiguo (el nivel de los títulos de un
   PDF, texto partido por saltos de línea, nombres de tablas) y nunca agrega
   palabras: ver supabase/functions/pilo-informes/udrive.ts. La persona revisa
   los elementos y quita los que no sirvan antes de crear nada.

   Word (.docx): lib/importarDocx.ts, con listas, negrita, cursiva y enlaces.
   PDF: el lector de Pilo Enseñanza (títulos por tamaño de letra y por patrón,
   encabezados y pies repetidos fuera); sus listas se reagrupan aquí y las
   tablas de un PDF no se reconocen (quedan como texto).
   ========================================================================== */

import { escapar } from "./texto";
import { LIMITES, bloqueNuevo } from "./documento";
import type { Bloque, BTabla } from "./documento";
import { PRESENTACION_VACIA, tablaDesdeMatriz } from "./tabla";
import type { ContenidoTabla } from "../tipos";

export type Elemento =
  | { t: "titulo"; nivel: 1 | 2 | 3; texto: string; dudoso: boolean }
  | { t: "parrafo"; texto: string }
  | { t: "lista"; ordenada: boolean; items: string[] }
  | { t: "tabla"; filas: string[][]; titulo: string }
  | { t: "imagen"; descripcion: string };

export interface Lectura {
  tipo: "docx" | "pdf";
  elementos: Elemento[];
  avisos: string[];
  paginas: number;
}

export const LIMITE_TABLAS = 30;
export const LIMITE_ARCHIVO = 25 * 1024 * 1024;

/* ---------- leer el archivo ------------------------------------------------------------------------ */

export function tipoDeArchivo(f: { name: string; type?: string }): "docx" | "pdf" | null {
  const ext = f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "docx" || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ext === "pdf" || f.type === "application/pdf") return "pdf";
  return null;
}

export async function leerArchivo(archivo: File): Promise<Lectura> {
  const tipo = tipoDeArchivo(archivo);
  if (!tipo) throw new Error("Use un Word (.docx) o un PDF. Un .doc antiguo se guarda primero como .docx desde Word.");
  if (archivo.size > LIMITE_ARCHIVO) throw new Error("El archivo pesa más de 25 MB: divídalo o use una versión más liviana.");
  if (tipo === "docx") {
    const { leerDocx } = await import("./importarDocx");
    const r = leerDocx(new Uint8Array(await archivo.arrayBuffer()));
    return { tipo, elementos: r.elementos, avisos: r.avisos, paginas: 0 };
  }
  const { readDocument } = await import("../../admin/pilo-ensenanza/ingest");
  const { patternLevel } = await import("../../admin/pilo-ensenanza/ingest/pdf");
  const p = await readDocument(archivo);
  if (p.scanned) throw new Error("Este PDF es una imagen: no trae texto que leer. Use el Word original o un PDF con texto.");
  const elementos = desdeBloquesPdf(p.blocks, patternLevel);
  const avisos = [...p.warnings];
  if (p.pages) avisos.push("Las tablas de un PDF no se reconocen como tablas: si hay alguna, queda como texto. Si tiene el Word original, importe ese.");
  return { tipo, elementos, avisos, paginas: p.pages };
}

const VINETA = /^(?:[•●·▪‣◦–-]|\d{1,3}[.)]|[a-z][.)])\s+/;
const ORDENADA = /^(?:\d{1,3}[.)]|[a-z][.)])\s+/;

type BloqueLeido = { type: "heading"; level: number; text: string; page?: number } | { type: "paragraph"; text: string; page?: number } | { type: "table"; rows: string[][] };

/** Los bloques del lector de PDF → elementos: reagrupa las viñetas en listas y marca los títulos que solo se dedujeron por la letra. */
export function desdeBloquesPdf(bloques: readonly BloqueLeido[], nivelPorPatron: (texto: string) => number): Elemento[] {
  const salida: Elemento[] = [];
  for (const b of bloques) {
    if (b.type === "heading") {
      const texto = b.text.replace(/\s+/g, " ").trim();
      if (texto) salida.push({ t: "titulo", nivel: Math.min(Math.max(b.level, 1), 3) as 1 | 2 | 3, texto: texto.slice(0, 300), dudoso: nivelPorPatron(texto) === 0 });
    } else if (b.type === "table") {
      if (b.rows.length) salida.push({ t: "tabla", filas: b.rows, titulo: "" });
    } else {
      const texto = b.text.replace(/\s+/g, " ").trim();
      if (!texto) continue;
      if (VINETA.test(texto)) {
        const ordenada = ORDENADA.test(texto);
        const item = escapar(texto.replace(VINETA, ""));
        const ultimo = salida[salida.length - 1];
        if (ultimo?.t === "lista" && ultimo.ordenada === ordenada) ultimo.items.push(item);
        else salida.push({ t: "lista", ordenada, items: [item] });
      } else salida.push({ t: "parrafo", texto: escapar(texto) });
    }
  }
  return salida;
}

/* ---------- lo que se le pide a Pilo ----------------------------------------------------------------- */

const PARTIDO = /\p{L}-\s+\p{Ll}|\s{2,}|(?:^|\s)(?:\p{L}\s){4,}\p{L}(?:\s|$)/u;

export const hayTitulosDudosos = (e: readonly Elemento[]) => e.some((x) => x.t === "titulo" && x.dudoso);

/** Los índices de los párrafos que parecen mal extraídos (palabras partidas, espacios de más), hasta 40. */
export function candidatosALimpiar(e: readonly Elemento[]): number[] {
  const salida: number[] = [];
  e.forEach((x, i) => {
    if (x.t === "parrafo" && PARTIDO.test(x.texto) && x.texto.length <= 1600 && salida.length < 40) salida.push(i);
  });
  return salida;
}

export const indicesDeTitulos = (e: readonly Elemento[]) => e.flatMap((x, i) => (x.t === "titulo" ? [i] : []));
export const indicesDeTablas = (e: readonly Elemento[]) => e.flatMap((x, i) => (x.t === "tabla" ? [i] : [])).slice(0, 40);

/** Una muestra corta de una tabla para que Pilo le proponga nombre: encabezado y primeras filas. */
export const muestraDeTabla = (filas: readonly string[][]): string =>
  filas
    .slice(0, 4)
    .map((f) => f.map((c) => c.slice(0, 40)).join(" | "))
    .join("\n")
    .slice(0, 600);

/** Aplica lo que respondió Pilo: niveles de título (0 = no es título, pasa a párrafo). */
export function aplicarNiveles(e: readonly Elemento[], niveles: readonly { i: number; nivel: number }[]): Elemento[] {
  const mapa = new Map(niveles.map((n) => [n.i, n.nivel]));
  return e.map((x, i) => {
    const n = mapa.get(i);
    if (n === undefined || x.t !== "titulo") return x;
    if (n === 0) return { t: "parrafo", texto: escapar(x.texto) };
    return { ...x, nivel: Math.min(Math.max(n, 1), 3) as 1 | 2 | 3, dudoso: false };
  });
}

/** Aplica el texto limpio de Pilo (ya verificado en el servidor: las mismas letras y números). */
export function aplicarLimpieza(e: readonly Elemento[], textos: readonly { i: number; texto: string }[]): Elemento[] {
  const mapa = new Map(textos.map((t) => [t.i, t.texto]));
  return e.map((x, i) => (x.t === "parrafo" && mapa.has(i) ? { t: "parrafo", texto: escapar(mapa.get(i)!).slice(0, LIMITES.texto) } : x));
}

export function aplicarNombres(e: readonly Elemento[], tablas: readonly { i: number; titulo: string }[]): Elemento[] {
  const mapa = new Map(tablas.map((t) => [t.i, t.titulo]));
  return e.map((x, i) => (x.t === "tabla" && mapa.has(i) ? { ...x, titulo: mapa.get(i)! } : x));
}

/* ---------- de elementos a bloques ------------------------------------------------------------------------------ */

/** Texto para mostrar en la lista de revisión (sin marcas). */
export function resumenDeElemento(x: Elemento): string {
  const sinMarcas = (t: string) => t.replace(/\\(.)/g, "$1").replace(/\*+/g, "").replace(/\[([^\][]*)\]\([^)]*\)/g, "$1");
  if (x.t === "titulo" || x.t === "parrafo") return sinMarcas(x.texto).slice(0, 170);
  if (x.t === "lista") return sinMarcas(x.items.slice(0, 3).join(" · ")).slice(0, 170);
  if (x.t === "tabla") return x.titulo || `${x.filas.length} filas × ${Math.max(...x.filas.map((f) => f.length))} columnas · ${sinMarcas((x.filas[0] ?? []).join(" | ")).slice(0, 110)}`;
  return x.descripcion ? `Imagen: ${x.descripcion}` : "Imagen del documento original";
}

export function etiquetaDeElemento(x: Elemento): string {
  if (x.t === "titulo") return `Título ${x.nivel}`;
  if (x.t === "parrafo") return "Párrafo";
  if (x.t === "lista") return `${x.ordenada ? "Lista numerada" : "Lista"} · ${x.items.length}`;
  if (x.t === "tabla") return "Tabla";
  return "Imagen pendiente";
}

export interface TablaNueva {
  /** Posición del elemento en la lectura; sirve para unir el id que le dé UDrive. */
  indice: number;
  titulo: string;
  contenido: ContenidoTabla;
}

/** La tabla de UDrive que sale de un elemento de tabla; nula si no tiene encabezados utilizables. */
export function tablaDeElemento(x: Extract<Elemento, { t: "tabla" }>, indice: number, nuevoId: () => string): TablaNueva | null {
  const r = tablaDesdeMatriz(x.filas, nuevoId);
  if (!r.columnas.length || !r.filas.length) return null;
  return { indice, titulo: x.titulo, contenido: { version: 1, columnas: r.columnas, filas: r.filas, presentacion: { ...PRESENTACION_VACIA, titulo: x.titulo }, mapaCalor: false } };
}

export interface ResultadoBloques {
  bloques: Bloque[];
  /** Lo que no entró (tablas sin encabezado, más tablas del tope). */
  avisos: string[];
}

/**
 * Los elementos elegidos → bloques del informe. `idsTabla` da el id de UDrive de cada tabla ya creada
 * (por la posición del elemento); una tabla sin id no entra.
 */
export function aBloques(elementos: readonly Elemento[], idsTabla: ReadonlyMap<number, string>): ResultadoBloques {
  const bloques: Bloque[] = [];
  const avisos: string[] = [];
  let sinTabla = 0;
  elementos.forEach((x, i) => {
    if (x.t === "titulo") bloques.push({ ...bloqueNuevo("capitulo"), nivel: x.nivel, titulo: x.texto.slice(0, LIMITES.titulo) } as Bloque);
    else if (x.t === "parrafo") bloques.push({ ...bloqueNuevo("parrafo"), texto: x.texto.slice(0, LIMITES.texto) } as Bloque);
    else if (x.t === "lista") bloques.push({ ...bloqueNuevo("lista"), ordenada: x.ordenada, items: x.items.slice(0, LIMITES.items).map((t) => t.slice(0, 2000)) } as Bloque);
    else if (x.t === "tabla") {
      const id = idsTabla.get(i);
      if (!id) sinTabla++;
      else bloques.push({ ...(bloqueNuevo("tabla") as BTabla), archivoId: id, titulo: x.titulo });
    } else bloques.push({ ...bloqueNuevo("imagen"), titulo: "Imagen pendiente", nota: x.descripcion ? `Del original: ${x.descripcion}` : "", enIndice: false } as Bloque);
  });
  if (sinTabla) avisos.push(`${sinTabla} ${sinTabla === 1 ? "tabla no entró" : "tablas no entraron"}: no tenían encabezados o filas utilizables.`);
  return { bloques, avisos };
}
