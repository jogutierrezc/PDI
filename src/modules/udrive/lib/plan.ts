/* =============================================================================
   UDrive · el plan de impresión del documento, sin React.

   Convierte el documento en la lista de unidades que se miden y se reparten
   en páginas: los índices (un título y una línea por entrada), cada bloque y,
   al final de las referencias, una unidad por fuente. El paginado
   (lib/paginado.ts) trabaja sobre esta lista; la pantalla la dibuja.
   ========================================================================== */

import { ordenarFuentes } from "./apa";
import type { Bloque, Documento, Fuente } from "./documento";
import type { ClaveIndice, EntradaIndice } from "./numeracion";
import { fuentesCitadas } from "./texto";

export type ItemPlan =
  | { clave: string; tipo: "titulo-indice"; indice: ClaveIndice }
  | { clave: string; tipo: "entrada-indice"; indice: ClaveIndice; entrada: EntradaIndice }
  | { clave: string; tipo: "bloque"; bloque: Bloque }
  | { clave: string; tipo: "fuente"; fuente: Fuente };

/** Las fuentes de la bibliografía: las citadas en el texto; si no hay citas, todas las definidas. */
export function fuentesDeBibliografia(doc: Pick<Documento, "bloques" | "fuentes">): Fuente[] {
  const citadas = new Set<string>();
  for (const b of doc.bloques) {
    if (b.tipo === "parrafo" || b.tipo === "destacado" || b.tipo === "nota") fuentesCitadas(b.texto).forEach((f) => citadas.add(f));
    else if (b.tipo === "lista") b.items.forEach((i) => fuentesCitadas(i).forEach((f) => citadas.add(f)));
  }
  const usadas = doc.fuentes.filter((f) => citadas.has(f.id));
  return ordenarFuentes(usadas.length ? usadas : doc.fuentes);
}

export function planear(doc: Documento, indices: readonly { clave: ClaveIndice; entradas: EntradaIndice[] }[]): ItemPlan[] {
  const plan: ItemPlan[] = [];
  for (const ind of indices) {
    plan.push({ clave: `i:${ind.clave}`, tipo: "titulo-indice", indice: ind.clave });
    ind.entradas.forEach((e, n) => plan.push({ clave: `i:${ind.clave}:${n}`, tipo: "entrada-indice", indice: ind.clave, entrada: e }));
  }
  for (const b of doc.bloques) {
    plan.push({ clave: `b:${b.id}`, tipo: "bloque", bloque: b });
    if (b.tipo === "referencias") for (const f of fuentesDeBibliografia(doc)) plan.push({ clave: `f:${b.id}:${f.id}`, tipo: "fuente", fuente: f });
  }
  return plan;
}

/** ¿La unidad abre hoja nueva? Índices, saltos de página y capítulos de nivel 1. */
export function abreHoja(it: ItemPlan): boolean {
  if (it.tipo === "titulo-indice") return true;
  if (it.tipo !== "bloque") return false;
  return it.bloque.tipo === "salto" || (it.bloque.tipo === "capitulo" && it.bloque.nivel === 1) || it.bloque.tipo === "referencias";
}

/** ¿Es un título que no puede quedar solo al final de una página? */
export function esTitulo(it: ItemPlan): boolean {
  return it.tipo === "titulo-indice" || (it.tipo === "bloque" && (it.bloque.tipo === "capitulo" || it.bloque.tipo === "referencias"));
}
