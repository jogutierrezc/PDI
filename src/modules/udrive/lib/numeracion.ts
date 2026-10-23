/* =============================================================================
   UDrive · numeración automática e índices del documento, sin React.

   «Ilustración N» (imágenes), «Tabla N» y «Gráfica N» se numeran solas por
   orden de aparición, cada clase con su propia cuenta. Las referencias
   cruzadas ({{ref:bloque}}) se resuelven a esos números, de modo que mover un
   bloque corrige todos los números del texto. Los índices (contenido,
   ilustraciones, tablas y gráficas) salen de los títulos de capítulo y de los
   pies de figura; los números de página los pone el paginado al exportar
   (lib/paginado.ts), no esta capa.
   ========================================================================== */

import type { Bloque, BCapitulo, Documento } from "./documento";
import { esFigura } from "./documento";
import { aPlano } from "./texto";
import type { ContextoTexto } from "./texto";
import { citaEnTexto } from "./apa";

export type ClaseFigura = "Ilustración" | "Tabla" | "Gráfica";
export type ClaveIndice = "contenido" | "ilustraciones" | "tablas" | "graficas";

export const TITULO_INDICE: Record<ClaveIndice, string> = {
  contenido: "Contenido",
  ilustraciones: "Índice de ilustraciones",
  tablas: "Índice de tablas",
  graficas: "Índice de gráficas",
};

const CLASE_DE: Record<"imagen" | "mapa" | "tabla" | "grafica", ClaseFigura> = { imagen: "Ilustración", mapa: "Ilustración", tabla: "Tabla", grafica: "Gráfica" };
const INDICE_DE: Record<ClaseFigura, ClaveIndice> = { Ilustración: "ilustraciones", Tabla: "tablas", Gráfica: "graficas" };

export interface Figura {
  bloqueId: string;
  clase: ClaseFigura;
  numero: number;
  /** «Gráfica 3». */
  etiqueta: string;
  /** El título tal como va en el pie, con sus marcas. */
  titulo: string;
  enIndice: boolean;
}

/** Numera las figuras por orden. `titulo` da el título final de cada una (el del bloque o el de su tabla/gráfica). */
export function numerarFiguras(doc: Pick<Documento, "bloques">, titulo: (b: Bloque) => string): Map<string, Figura> {
  const cuentas: Record<ClaseFigura, number> = { Ilustración: 0, Tabla: 0, Gráfica: 0 };
  const salida = new Map<string, Figura>();
  for (const b of doc.bloques) {
    if (!esFigura(b)) continue;
    const clase = CLASE_DE[b.tipo];
    const numero = ++cuentas[clase];
    salida.set(b.id, { bloqueId: b.id, clase, numero, etiqueta: `${clase} ${numero}`, titulo: titulo(b), enIndice: b.enIndice });
  }
  return salida;
}

export interface EntradaIndice {
  /** Id del bloque al que apunta. */
  bloqueId: string;
  /** 1–3 en el contenido; 1 en los demás índices. */
  nivel: 1 | 2 | 3;
  /** Lo que va antes del título: «Gráfica 3». Vacío en el contenido. */
  etiqueta: string;
  texto: string;
}

/** Los capítulos con título, en orden. */
export function entradasContenido(doc: Pick<Documento, "bloques">): EntradaIndice[] {
  return doc.bloques
    .filter((b): b is BCapitulo => b.tipo === "capitulo" && b.titulo.trim() !== "")
    .map((b) => ({ bloqueId: b.id, nivel: b.nivel, etiqueta: "", texto: b.titulo.trim() }));
}

/** Las figuras de una clase que piden aparecer en su índice. */
export function entradasFiguras(figuras: ReadonlyMap<string, Figura>, clave: Exclude<ClaveIndice, "contenido">, ctx: ContextoTexto): EntradaIndice[] {
  return [...figuras.values()]
    .filter((f) => INDICE_DE[f.clase] === clave && f.enIndice)
    .map((f) => ({ bloqueId: f.bloqueId, nivel: 1 as const, etiqueta: `${f.etiqueta}.`, texto: aPlano(f.titulo, ctx).trim() || "(sin título)" }));
}

/** Los índices que el documento pide y tienen algo que listar, en el orden de la portada. */
export function indicesActivos(doc: Pick<Documento, "indices" | "bloques">, figuras: ReadonlyMap<string, Figura>, ctx: ContextoTexto): { clave: ClaveIndice; entradas: EntradaIndice[] }[] {
  const salida: { clave: ClaveIndice; entradas: EntradaIndice[] }[] = [];
  if (doc.indices.contenido) salida.push({ clave: "contenido", entradas: entradasContenido(doc) });
  for (const c of ["ilustraciones", "tablas", "graficas"] as const) if (doc.indices[c]) salida.push({ clave: c, entradas: entradasFiguras(figuras, c, ctx) });
  return salida.filter((i) => i.entradas.length > 0);
}

/** El contexto de resolución de un texto: cifras, citas APA y referencias a figuras. */
export function contextoDe(doc: Pick<Documento, "fuentes">, figuras: ReadonlyMap<string, Figura>, cifra: ContextoTexto["cifra"]): ContextoTexto {
  return {
    cifra,
    cita: (id, extra) => {
      const f = doc.fuentes.find((x) => x.id === id);
      return f ? citaEnTexto(f, extra) : null;
    },
    ref: (id) => figuras.get(id)?.etiqueta ?? null,
  };
}

/** Referencias cruzadas rotas: textos que apuntan a un bloque que ya no es una figura. */
export function referenciasRotas(doc: Pick<Documento, "bloques">, figuras: ReadonlyMap<string, Figura>, refsDe: (texto: string) => string[]): { bloqueId: string; destino: string }[] {
  const rotas: { bloqueId: string; destino: string }[] = [];
  for (const b of doc.bloques) {
    const textos = b.tipo === "parrafo" || b.tipo === "destacado" || b.tipo === "nota" ? [b.texto] : b.tipo === "lista" ? b.items : [];
    for (const t of textos) for (const d of refsDe(t)) if (!figuras.has(d)) rotas.push({ bloqueId: b.id, destino: d });
  }
  return rotas;
}

/** Los capítulos con su nivel, para la lista de estructura del editor. */
export const capitulos = (bloques: readonly Bloque[]): BCapitulo[] => bloques.filter((b): b is BCapitulo => b.tipo === "capitulo");
