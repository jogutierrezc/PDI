/* =============================================================================
   UDrive · editar lo detectado antes de crear el informe (fase 3), sin React.

   La revisión de una importación deja cambiar el tipo de un elemento, unirlo
   con el anterior, partirlo en dos, subirlo o bajarlo y pasar una tabla mal
   detectada a texto. Aquí están esas operaciones sobre la lista de elementos.

   Los títulos guardan su texto sin marcas (es el título del capítulo); los
   demás textos guardan la cadena con marcas de lib/texto.ts. Al pasar de uno a
   otro se escapa o se limpia para que nada se confunda con una marca.
   ========================================================================== */

import { LIMITES } from "./documento";
import type { Elemento } from "./importar";
import { sinMarcas } from "./importar";
import { escapar } from "./texto";

/** Una fila de la revisión: el elemento, una llave estable y si entra al informe. */
export interface Fila {
  k: number;
  x: Elemento;
  on: boolean;
}

export type TipoTexto = "t1" | "t2" | "t3" | "parrafo" | "destacado" | "nota" | "lista" | "lista-num";

export const TIPOS_TEXTO: { id: TipoTexto; texto: string }[] = [
  { id: "t1", texto: "Título 1 · Capítulo" },
  { id: "t2", texto: "Título 2 · Sección" },
  { id: "t3", texto: "Título 3 · Apartado" },
  { id: "parrafo", texto: "Párrafo" },
  { id: "destacado", texto: "Cuadro destacado" },
  { id: "nota", texto: "Nota" },
  { id: "lista", texto: "Lista" },
  { id: "lista-num", texto: "Lista numerada" },
];

/** ¿Es un elemento de texto que se puede reclasificar? */
export const esTexto = (x: Elemento): x is Extract<Elemento, { t: "titulo" | "parrafo" | "destacado" | "nota" | "lista" }> =>
  x.t === "titulo" || x.t === "parrafo" || x.t === "destacado" || x.t === "nota" || x.t === "lista";

export function tipoDe(x: Elemento): TipoTexto | null {
  if (x.t === "titulo") return x.nivel === 1 ? "t1" : x.nivel === 2 ? "t2" : "t3";
  if (x.t === "parrafo") return "parrafo";
  if (x.t === "destacado") return "destacado";
  if (x.t === "nota") return "nota";
  if (x.t === "lista") return x.ordenada ? "lista-num" : "lista";
  return null;
}

/** El texto del elemento con marcas (para pasarlo a otro tipo). */
function conMarcas(x: Extract<Elemento, { t: "titulo" | "parrafo" | "destacado" | "nota" | "lista" }>): string {
  if (x.t === "titulo") return escapar(x.texto);
  if (x.t === "lista") return x.items.join(" ");
  return x.texto;
}

export function cambiarTipo(x: Elemento, tipo: TipoTexto): Elemento {
  if (!esTexto(x)) return x;
  const marcado = conMarcas(x);
  if (tipo === "t1" || tipo === "t2" || tipo === "t3") {
    const nivel = (tipo === "t1" ? 1 : tipo === "t2" ? 2 : 3) as 1 | 2 | 3;
    if (x.t === "titulo") return { ...x, nivel, dudoso: false };
    return { t: "titulo", nivel, texto: sinMarcas(marcado).replace(/\s+/g, " ").trim().slice(0, LIMITES.titulo), dudoso: false };
  }
  if (tipo === "lista" || tipo === "lista-num") {
    if (x.t === "lista") return { ...x, ordenada: tipo === "lista-num" };
    return { t: "lista", ordenada: tipo === "lista-num", items: [marcado] };
  }
  if (tipo === "parrafo") return { t: "parrafo", texto: marcado.slice(0, LIMITES.texto) };
  return { t: tipo, texto: marcado.slice(0, LIMITES.texto) };
}

/** ¿Se pueden unir estos dos elementos (el segundo se agrega al primero)? */
export function sePuedenUnir(a: Elemento | undefined, b: Elemento): boolean {
  if (!a) return false;
  if (a.t === "lista" && b.t === "lista") return a.ordenada === b.ordenada;
  const simple = (x: Elemento) => x.t === "parrafo" || x.t === "destacado" || x.t === "nota";
  if (simple(a) && simple(b)) return a.t === b.t;
  return a.t === "titulo" && b.t === "titulo";
}

const unirTexto = (a: string, b: string) => (/\p{L}-$/u.test(a.trim()) && /^\p{Ll}/u.test(b.trim()) ? a.trim().slice(0, -1) + b.trim() : `${a.trim()} ${b.trim()}`);

/** Une `b` al final de `a`; nulo si no se puede. */
export function unir(a: Elemento, b: Elemento): Elemento | null {
  if (!sePuedenUnir(a, b)) return null;
  if (a.t === "lista" && b.t === "lista") return { ...a, items: [...a.items, ...b.items].slice(0, LIMITES.items) };
  if (a.t === "titulo" && b.t === "titulo") return { ...a, texto: unirTexto(a.texto, b.texto).slice(0, LIMITES.titulo) };
  if ((a.t === "parrafo" || a.t === "destacado" || a.t === "nota") && (b.t === "parrafo" || b.t === "destacado" || b.t === "nota")) {
    return { ...a, texto: unirTexto(a.texto, b.texto).slice(0, LIMITES.texto) } as Elemento;
  }
  return null;
}

/** Parte un párrafo (o destacado, o nota) en dos en la posición dada; nulo si no queda texto de un lado. */
export function partir(x: Elemento, posicion: number): [Elemento, Elemento] | null {
  if (x.t !== "parrafo" && x.t !== "destacado" && x.t !== "nota") return null;
  // No se parte en medio de una barra de escape («\*»).
  let pos = posicion;
  if (pos > 0 && x.texto[pos - 1] === "\\") pos--;
  const a = x.texto.slice(0, pos).trim();
  const b = x.texto.slice(pos).trim();
  if (!a || !b) return null;
  return [{ ...x, texto: a } as Elemento, { ...x, texto: b } as Elemento];
}

/** Una tabla mal detectada → un párrafo por fila, con las celdas separadas por « | ». */
export function tablaATexto(x: Extract<Elemento, { t: "tabla" }>): Elemento[] {
  return x.filas
    .map((f) => f.filter((c) => c.trim() !== "").join(" | "))
    .filter(Boolean)
    .map((t) => ({ t: "parrafo", texto: escapar(t).slice(0, LIMITES.texto) }) as Elemento);
}

export function mover<T>(lista: readonly T[], i: number, paso: -1 | 1): T[] {
  const j = i + paso;
  if (j < 0 || j >= lista.length) return [...lista];
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

/** El resumen de lo detectado: «37 párrafos · 6 tablas · 9 figuras». */
export function resumenDeConteo(filas: readonly Fila[]): string {
  const c = { par: 0, tit: 0, tab: 0, fig: 0, lis: 0, otros: 0 };
  for (const f of filas) {
    if (!f.on) continue;
    if (f.x.t === "parrafo") c.par++;
    else if (f.x.t === "titulo") c.tit++;
    else if (f.x.t === "tabla") c.tab++;
    else if (f.x.t === "imagen") c.fig++;
    else if (f.x.t === "lista") c.lis++;
    else c.otros++;
  }
  const parte = (n: number, uno: string, varios: string) => (n ? [`${n} ${n === 1 ? uno : varios}`] : []);
  return [
    ...parte(c.tit, "título", "títulos"),
    ...parte(c.par, "párrafo", "párrafos"),
    ...parte(c.lis, "lista", "listas"),
    ...parte(c.tab, "tabla", "tablas"),
    ...parte(c.fig, "figura", "figuras"),
    ...parte(c.otros, "otro", "otros"),
  ].join(" · ");
}
