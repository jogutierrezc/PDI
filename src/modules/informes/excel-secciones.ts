/* =============================================================================
   Excel de «Logros innovadores o excepcionales» y de «Objetivos y metas anuales».

   Las dos secciones se llenan en tablas cortas; aquí van sus columnas, el paso de
   la tabla del Excel a lo que guarda la sección (y de vuelta) y los ejemplos de la
   plantilla. La lectura del libro la hace ImportarFilas con estas columnas. Lógica
   pura, sin React.
   ========================================================================== */

import { numeroDe } from "./cifras-vivas";
import type { Logro, Meta } from "./types";

/** Cuántos logros caben en la sección (el editor no deja añadir más). */
export const MAX_LOGROS = 3;

export const COLUMNAS_LOGROS = ["Logro", "Contexto y resultado", "N.º de anexo"] as const;
export const COLUMNAS_METAS = ["Objetivo o meta anual", "Programado", "Alcanzado"] as const;

export const EJEMPLO_LOGROS: string[][] = [["Ejemplo: primera convocatoria interna con pares internacionales (borre esta fila)", "Qué se hizo, con quién, qué cambió y en qué cifra se nota.", "1"]];
export const EJEMPLO_METAS: string[][] = [
  ["Ejemplo: graduar 120 estudiantes en el año (borre esta fila)", "120", "104"],
  ["Ejemplo: abrir 4 convenios nuevos (borre esta fila)", "4", "5"],
];

export const AYUDA_LOGROS = [
  `Un logro por fila; la sección admite hasta ${MAX_LOGROS}. Son los innovadores o excepcionales del año, no la actividad ordinaria.`,
  "Logro: el nombre corto. Contexto y resultado: qué se hizo y qué cambió, con la cifra que lo muestra.",
  "N.º de anexo: el número del anexo de «Evidencias» que lo respalda (déjelo vacío y elíjalo en el informe si aún no lo sube).",
];

export const AYUDA_METAS = [
  "Una fila por objetivo o meta anual de la unidad.",
  "Programado y Alcanzado: solo números (puede usar coma decimal). El resultado (Superada, Cumplida o Parcial) lo calcula el informe.",
  "Alcanzado puede quedar vacío si el año aún no termina.",
];

const texto = (v: unknown) => String(v ?? "").trim();

export const logrosAFilas = (logros: Logro[]): string[][] => logros.map((l) => [l.titulo, l.resultado, l.anexo === null ? "" : String(l.anexo)]);

/** Lo que dice la tabla como logros; el anexo que no es un número entero positivo queda vacío. */
export function filasALogros(filas: string[][]): Logro[] {
  return filas.map((f) => {
    const n = numeroDe(texto(f[2]));
    return { titulo: texto(f[0]), resultado: texto(f[1]), anexo: n !== null && Number.isInteger(n) && n > 0 ? n : null };
  });
}

export const metasAFilas = (metas: Meta[]): string[][] => metas.map((m) => [m.meta, m.programado === null ? "" : String(m.programado).replace(".", ","), m.alcanzado === null ? "" : String(m.alcanzado).replace(".", ",")]);

export const filasAMetas = (filas: string[][]): Meta[] => filas.map((f) => ({ meta: texto(f[0]), programado: numeroDe(texto(f[1]).replace(/%/g, "")), alcanzado: numeroDe(texto(f[2]).replace(/%/g, "")) }));
