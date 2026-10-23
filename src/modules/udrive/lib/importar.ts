/* =============================================================================
   UDrive · importar un Word o un PDF como informe (fase 3), sin React.

   Todo se lee en el navegador, sin subir el archivo a ningún lado. Primero un
   parseo determinista a elementos (títulos, párrafos, listas, tablas, figuras,
   notas, referencias); Pilo entra solo para lo ambiguo (el nivel de los
   títulos, texto partido por saltos de línea, nombres de tablas) y nunca
   agrega palabras: ver supabase/functions/pilo-informes/udrive.ts. La persona
   revisa los elementos antes de crear nada.

   Word (.docx): lib/importarDocx.ts (estilos, listas, tablas, imágenes de
   word/media). PDF: lib/importarPdf.ts (orden de lectura, columnas, tablas,
   figuras) sobre lib/importarPdfCarga.ts (el único que nombra pdfjs).

   Los pasos que sirven a los dos formatos viven aquí: pies de figura y notas
   (`asociarPies`), índices propios del informe (`quitarIndicesTexto`) y la
   sección de referencias (`agruparReferencias`).
   ========================================================================== */

import { fuenteNueva } from "./apa";
import { escapar } from "./texto";
import { LIMITES, bloqueNuevo } from "./documento";
import type { Bloque, BImagen, BTabla, Fuente } from "./documento";
import { PRESENTACION_VACIA, tablaDesdeMatriz } from "./tabla";
import type { ContenidoTabla } from "../tipos";

/** Una imagen sacada del archivo, lista para subirla a UDrive. */
export interface ImagenExtraida {
  blob: Blob;
  mime: string;
  ancho: number;
  alto: number;
}

export type OrigenFigura = "word" | "pdf-imagen" | "pdf-dibujo";

export type Elemento =
  | { t: "titulo"; nivel: 1 | 2 | 3; texto: string; dudoso: boolean }
  /** `pie`: el estilo del Word lo marca como pie de figura («Caption»). */
  | { t: "parrafo"; texto: string; pie?: boolean }
  | { t: "destacado"; texto: string }
  | { t: "nota"; texto: string }
  | { t: "lista"; ordenada: boolean; items: string[] }
  | { t: "tabla"; filas: string[][]; titulo: string; nota: string; pagina?: number }
  | { t: "imagen"; descripcion: string; titulo: string; nota: string; imagen: ImagenExtraida | null; origen: OrigenFigura; pagina?: number }
  | { t: "referencias"; titulo: string; items: string[] };

export type TipoElemento = Elemento["t"];

export interface Lectura {
  tipo: "docx" | "pdf";
  elementos: Elemento[];
  avisos: string[];
  paginas: number;
  /** Lo que se dejó fuera a propósito: «portada», «3 índices», «41 encabezados o pies». */
  descartes: string[];
  portada?: { titulo: string; subtitulo: string };
}

export const LIMITE_TABLAS = 30;
export const LIMITE_FIGURAS = 80;
export const LIMITE_ARCHIVO = 25 * 1024 * 1024;

/* ---------- leer el archivo ------------------------------------------------------------------------ */

export function tipoDeArchivo(f: { name: string; type?: string }): "docx" | "pdf" | null {
  const ext = f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "docx" || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ext === "pdf" || f.type === "application/pdf") return "pdf";
  return null;
}

export async function leerArchivo(archivo: File, alProgreso?: (texto: string) => void): Promise<Lectura> {
  const tipo = tipoDeArchivo(archivo);
  if (!tipo) throw new Error("Use un Word (.docx) o un PDF. Un .doc antiguo se guarda primero como .docx desde Word.");
  if (archivo.size > LIMITE_ARCHIVO) throw new Error("El archivo pesa más de 25 MB: divídalo o use una versión más liviana.");
  if (tipo === "docx") {
    alProgreso?.("Abriendo el Word…");
    const { leerDocx } = await import("./importarDocx");
    const r = await leerDocx(new Uint8Array(await archivo.arrayBuffer()));
    return cerrarLectura({ tipo, elementos: r.elementos, avisos: r.avisos, paginas: 0, descartes: r.descartes, portada: r.portada });
  }
  const { leerPdf } = await import("./importarPdfCarga");
  const r = await leerPdf(archivo, alProgreso);
  return cerrarLectura({ tipo, elementos: r.elementos, avisos: r.avisos, paginas: r.paginas, descartes: r.descartes, portada: r.portada });
}

/** Los pasos comunes a los dos formatos, en orden. */
function cerrarLectura(l: Lectura): Lectura {
  let elementos = l.elementos;
  const descartes = [...l.descartes];
  const sinIndices = quitarIndicesTexto(elementos);
  elementos = sinIndices.elementos;
  if (sinIndices.quitados) descartes.push(`${sinIndices.quitados} ${sinIndices.quitados === 1 ? "entrada de índice" : "entradas de índice"}`);
  elementos = asociarPies(elementos);
  elementos = agruparReferencias(elementos);
  elementos = elementos.filter((x) => !(x.t === "parrafo" && !x.texto.trim()));
  return { ...l, elementos, descartes };
}

/* ---------- texto ------------------------------------------------------------------------------------ */

/** El texto sin las marcas de lib/texto.ts. */
export const sinMarcas = (t: string): string =>
  t
    .replace(/\\(.)/g, "$1")
    .replace(/\[([^\][]*)\]\([^)]*\)/g, "$1")
    .replace(/\*+/g, "");

const colapsar = (t: string): string => t.replace(/\s+/g, " ").trim();

/* ---------- pies de figura y notas ----------------------------------------------------------------- */

const PIE = /^(tabla|cuadro|gr[aá]fica|gr[aá]fico|figura|ilustraci[oó]n|imagen|mapa|esquema|diagrama|foto|fotograf[ií]a)\s+(\d{1,3})\s*[.:\-–—]?\s*(.*)$/is;
const NOTA = /^(notas?|fuentes?)\s*[.:]\s*(.*)$/is;

type Objeto = Extract<Elemento, { t: "tabla" | "imagen" }>;
const esObjeto = (x: Elemento | undefined): x is Objeto => x?.t === "tabla" || x?.t === "imagen";

/**
 * «Tabla 3. Matrícula» junto a una tabla o «Gráfica 2. …» junto a una imagen pasan a ser el título de esa
 * figura; el párrafo «Nota. …» o «Fuente: …» que le sigue pasa a ser su nota. Los pies se buscan primero
 * debajo (el pie de APA va arriba, así que "el siguiente" es la figura) y luego arriba.
 */
export function asociarPies(el: readonly Elemento[]): Elemento[] {
  const salida: Elemento[] = el.map((x) => ({ ...x }) as Elemento);
  const quitar = new Set<number>();
  const vecino = (desde: number, paso: 1 | -1): number => {
    for (let k = desde + paso; k >= 0 && k < salida.length; k += paso) if (!quitar.has(k)) return k;
    return -1;
  };

  for (let i = 0; i < salida.length; i++) {
    const x = salida[i];
    if (x.t !== "parrafo" || quitar.has(i)) continue;
    const plano = colapsar(sinMarcas(x.texto));
    const m = PIE.exec(plano);
    if (!m && !x.pie) continue;
    if (!m && plano.length > 220) continue;
    const etiqueta = (m?.[1] ?? "").toLowerCase();
    const resto = (m ? m[3] : plano).replace(/[.\s]+$/, "");
    const quiereTabla = /^(tabla|cuadro)/.test(etiqueta);
    const sig = vecino(i, 1);
    const ant = vecino(i, -1);
    const libre = (k: number): k is number => k >= 0 && esObjeto(salida[k]) && !(salida[k] as Objeto).titulo;
    const encaja = (k: number) => (salida[k].t === "tabla") === quiereTabla || !m;
    let destino = -1;
    if (libre(sig) && encaja(sig)) destino = sig;
    else if (libre(ant) && encaja(ant)) destino = ant;
    else if (libre(sig)) destino = sig;
    else if (libre(ant)) destino = ant;
    if (destino < 0) continue;
    (salida[destino] as Objeto).titulo = escapar(resto).slice(0, 300);
    quitar.add(i);
  }

  // Notas: los párrafos «Nota. …» / «Fuente: …» que siguen a una figura.
  for (let i = 0; i < salida.length; i++) {
    if (quitar.has(i) || !esObjeto(salida[i])) continue;
    const obj = salida[i] as Objeto;
    for (let k = vecino(i, 1); k >= 0; k = vecino(k, 1)) {
      const y = salida[k];
      if (y.t !== "parrafo") break;
      const m = NOTA.exec(colapsar(sinMarcas(y.texto)));
      if (!m) break;
      const texto = /^fuentes?$/i.test(m[1]) ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}: ${m[2]}` : m[2];
      obj.nota = escapar(`${obj.nota ? `${sinMarcas(obj.nota)} ` : ""}${texto}`.trim()).slice(0, LIMITES.nota);
      quitar.add(k);
    }
  }
  return salida.filter((_, i) => !quitar.has(i));
}

/* ---------- índices del propio informe ------------------------------------------------------------- */

const TITULO_INDICE = /^(tabla de contenidos?|contenidos?|[ií]ndice(?: general)?|[ií]ndice de (?:tablas|gr[aá]ficas?|gr[aá]ficos|figuras|ilustraciones|cuadros|mapas)|lista de (?:tablas|figuras|gr[aá]ficas?|ilustraciones|cuadros|siglas|abreviaturas))\s*$/i;
const ENTRADA_INDICE = /(?:\.{2,}|…|·{2,}|\s)\s*(?:\d{1,4}|[ivxlcdm]{1,6})\s*$/i;

/** Quita los índices que el informe original trae (UDrive los genera): un título de índice y las entradas que siguen. */
export function quitarIndicesTexto(el: readonly Elemento[]): { elementos: Elemento[]; quitados: number } {
  const salida: Elemento[] = [];
  let quitados = 0;
  let i = 0;
  const textoDe = (x: Elemento | undefined): string[] => (x?.t === "parrafo" ? [x.texto] : x?.t === "lista" ? x.items : []);
  const esEntrada = (t: string) => {
    const p = colapsar(sinMarcas(t));
    return p.length >= 4 && p.length <= 200 && ENTRADA_INDICE.test(p) && /\p{L}/u.test(p);
  };
  while (i < el.length) {
    const x = el[i];
    const titulo = (x.t === "titulo" || x.t === "parrafo") && TITULO_INDICE.test(colapsar(sinMarcas(x.texto)));
    if (titulo) {
      let k = i + 1;
      let entradas = 0;
      while (k < el.length) {
        const piezas = textoDe(el[k]);
        if (!piezas.length || !piezas.every(esEntrada)) break;
        entradas += piezas.length;
        k++;
      }
      if (entradas >= 3) {
        quitados += entradas;
        i = k;
        continue;
      }
    }
    salida.push(x);
    i++;
  }
  return { elementos: salida, quitados };
}

/* ---------- referencias ---------------------------------------------------------------------------- */

const TITULO_REFERENCIAS = /^(referencias(?: bibliogr[aá]ficas)?|bibliograf[ií]a|fuentes consultadas|obras citadas)\s*$/i;

/** Bajo el título «Referencias», los párrafos y listas hasta el título siguiente pasan a ser un solo elemento. */
export function agruparReferencias(el: readonly Elemento[]): Elemento[] {
  const salida: Elemento[] = [];
  let i = 0;
  while (i < el.length) {
    const x = el[i];
    if (x.t === "titulo" && TITULO_REFERENCIAS.test(colapsar(sinMarcas(x.texto)))) {
      const items: string[] = [];
      let k = i + 1;
      for (; k < el.length; k++) {
        const y = el[k];
        if (y.t === "parrafo") items.push(y.texto);
        else if (y.t === "lista") items.push(...y.items);
        else break;
      }
      if (items.length) {
        salida.push({ t: "referencias", titulo: x.texto.slice(0, 120), items: items.slice(0, LIMITES.fuentes) });
        i = k;
        continue;
      }
    }
    salida.push(x);
    i++;
  }
  return salida;
}

const ANIO = /\(\s*(\d{4}[a-z]?|s\.\s?f\.|n\.\s?d\.)\s*(?:,[^)]*)?\)/i;

/** Una referencia en texto → fuente de UDrive; lo que no se separa queda como fuente con el texto completo de título. */
export function fuenteDeReferencia(marcado: string, id: string): { fuente: Fuente; separada: boolean } {
  const f = fuenteNueva(id);
  const plano = colapsar(sinMarcas(marcado));
  const url = plano.match(/https?:\/\/[^\s<>"')]+/i)?.[0].replace(/[.,;]+$/, "") ?? "";
  const m = ANIO.exec(plano);
  if (!m || m.index < 3) return { fuente: { ...f, tipo: "informe", titulo: plano.slice(0, 300), url: url.slice(0, 800) }, separada: false };
  const autores = plano.slice(0, m.index).replace(/[.,\s]+$/, "").trim();
  const despues = plano.slice(m.index + m[0].length).replace(/^[.\s]+/, "");
  const sinUrl = despues.replace(/(?:Recuperado de|Disponible en|Retrieved from)?\s*https?:\/\/\S+/i, "").trim();
  const partes = sinUrl.split(/\.\s+/);
  const titulo = (partes[0] ?? "").replace(/[.\s]+$/, "");
  const origenBruto = (partes[1] ?? "").replace(/[.\s]+$/, "");
  const vol = origenBruto.match(/,\s*(\d+(?:\s*\(\s*\d+\s*\))?)(?:,\s*([\d]+\s*[-–]\s*[\d]+))?\s*$/);
  const origen = (vol ? origenBruto.slice(0, vol.index) : origenBruto).replace(/[,\s]+$/, "");
  const esArticulo = Boolean(vol) || /\bvol\b|\brevista\b|\bjournal\b/i.test(origenBruto);
  const anio = /^\d/.test(m[1]) ? m[1].slice(0, 5) : "s. f.";
  return {
    fuente: {
      ...f,
      tipo: url && !esArticulo && !origen ? "web" : esArticulo ? "articulo" : origen ? "informe" : "libro",
      autores: autores.slice(0, 400),
      anio,
      titulo: titulo.slice(0, 400),
      origen: origen.slice(0, 200),
      volumen: vol?.[1]?.replace(/\s+/g, "") ?? "",
      paginas: vol?.[2]?.replace(/\s+/g, "") ?? "",
      url: url.slice(0, 800),
    },
    separada: Boolean(autores && titulo),
  };
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
export const indicesDeTablas = (e: readonly Elemento[]) => e.flatMap((x, i) => (x.t === "tabla" && !x.titulo ? [i] : [])).slice(0, 40);

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
  return e.map((x, i) => (x.t === "tabla" && mapa.has(i) && !x.titulo ? { ...x, titulo: mapa.get(i)! } : x));
}

/* ---------- de elementos a bloques ------------------------------------------------------------------------------ */

/** Texto para mostrar en la lista de revisión (sin marcas). */
export function resumenDeElemento(x: Elemento): string {
  if (x.t === "titulo" || x.t === "parrafo" || x.t === "destacado" || x.t === "nota") return sinMarcas(x.texto).slice(0, 170);
  if (x.t === "lista") return sinMarcas(x.items.slice(0, 3).join(" · ")).slice(0, 170);
  if (x.t === "tabla") return x.titulo ? sinMarcas(x.titulo) : `${x.filas.length} filas × ${Math.max(0, ...x.filas.map((f) => f.length))} columnas · ${sinMarcas((x.filas[0] ?? []).join(" | ")).slice(0, 110)}`;
  if (x.t === "referencias") return `${x.items.length} ${x.items.length === 1 ? "referencia" : "referencias"}: ${sinMarcas(x.items[0] ?? "").slice(0, 110)}`;
  return x.titulo ? sinMarcas(x.titulo) : x.descripcion ? `Imagen: ${x.descripcion}` : "Imagen del documento original";
}

export function etiquetaDeElemento(x: Elemento): string {
  if (x.t === "titulo") return `Título ${x.nivel}`;
  if (x.t === "parrafo") return "Párrafo";
  if (x.t === "destacado") return "Destacado";
  if (x.t === "nota") return "Nota";
  if (x.t === "lista") return `${x.ordenada ? "Lista numerada" : "Lista"} · ${x.items.length}`;
  if (x.t === "tabla") return "Tabla";
  if (x.t === "referencias") return "Referencias";
  return x.imagen ? (x.origen === "pdf-dibujo" ? "Gráfica" : "Imagen") : "Imagen pendiente";
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
  return {
    indice,
    titulo: x.titulo,
    contenido: { version: 1, columnas: r.columnas, filas: r.filas, presentacion: { ...PRESENTACION_VACIA, titulo: x.titulo, nota: x.nota }, mapaCalor: false },
  };
}

export interface IdsCreados {
  tablas: ReadonlyMap<number, string>;
  imagenes: ReadonlyMap<number, string>;
}

export interface ResultadoBloques {
  bloques: Bloque[];
  /** Las fuentes que salen de la sección de referencias. */
  fuentes: Fuente[];
  /** Lo que no entró (tablas sin encabezado, más tablas del tope). */
  avisos: string[];
}

/**
 * Los elementos elegidos → bloques del informe. `ids` da el id de UDrive de cada tabla e imagen ya creadas
 * (por la posición del elemento); una tabla sin id no entra, y una imagen sin id queda como imagen pendiente.
 */
export function aBloques(elementos: readonly Elemento[], ids: IdsCreados): ResultadoBloques {
  const bloques: Bloque[] = [];
  const fuentes: Fuente[] = [];
  const avisos: string[] = [];
  let sinTabla = 0;
  let pendientes = 0;
  let sinSeparar = 0;
  elementos.forEach((x, i) => {
    if (x.t === "titulo") bloques.push({ ...bloqueNuevo("capitulo"), nivel: x.nivel, titulo: x.texto.slice(0, LIMITES.titulo) } as Bloque);
    else if (x.t === "parrafo") bloques.push({ ...bloqueNuevo("parrafo"), texto: x.texto.slice(0, LIMITES.texto) } as Bloque);
    else if (x.t === "destacado") bloques.push({ ...bloqueNuevo("destacado"), texto: x.texto.slice(0, LIMITES.texto) } as Bloque);
    else if (x.t === "nota") bloques.push({ ...bloqueNuevo("nota"), texto: x.texto.slice(0, LIMITES.texto) } as Bloque);
    else if (x.t === "lista") bloques.push({ ...bloqueNuevo("lista"), ordenada: x.ordenada, items: x.items.slice(0, LIMITES.items).map((t) => t.slice(0, 2000)) } as Bloque);
    else if (x.t === "tabla") {
      const id = ids.tablas.get(i);
      if (!id) sinTabla++;
      else bloques.push({ ...(bloqueNuevo("tabla") as BTabla), archivoId: id, titulo: x.titulo.slice(0, LIMITES.titulo), nota: x.nota.slice(0, LIMITES.nota) });
    } else if (x.t === "imagen") {
      const id = ids.imagenes.get(i) ?? "";
      if (!id) pendientes++;
      bloques.push({
        ...(bloqueNuevo("imagen") as BImagen),
        archivoId: id,
        titulo: (x.titulo || (id ? "" : "Imagen pendiente")).slice(0, LIMITES.titulo),
        nota: (x.nota || (!id && x.descripcion ? `Del original: ${x.descripcion}` : "")).slice(0, LIMITES.nota),
        alt: x.descripcion.slice(0, 250),
        enIndice: Boolean(x.titulo),
      });
    } else {
      bloques.push({ ...bloqueNuevo("referencias"), titulo: x.titulo.slice(0, 120) || "Referencias" } as Bloque);
      x.items.forEach((t) => {
        const r = fuenteDeReferencia(t, `r${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 10)}`);
        if (!r.separada) sinSeparar++;
        if (fuentes.length < LIMITES.fuentes) fuentes.push(r.fuente);
      });
    }
  });
  if (sinTabla) avisos.push(`${sinTabla} ${sinTabla === 1 ? "tabla no entró" : "tablas no entraron"}: no tenían encabezados o filas utilizables.`);
  if (pendientes) avisos.push(`${pendientes} ${pendientes === 1 ? "imagen quedó pendiente" : "imágenes quedaron pendientes"}: elíjalas después desde UDrive.`);
  if (sinSeparar) avisos.push(`${sinSeparar} ${sinSeparar === 1 ? "referencia no se pudo separar" : "referencias no se pudieron separar"} en autor, año y título: revise las fuentes del informe.`);
  return { bloques, fuentes, avisos };
}
