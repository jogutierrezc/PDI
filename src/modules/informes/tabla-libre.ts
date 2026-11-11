/* =============================================================================
   Tablas pegadas o subidas desde Excel en una sección libre (fase 3).
   Es una COPIA FIJA guardada en el JSON del bloque: no sigue al archivo de origen.
   Lógica pura: lectura del portapapeles y de CSV, rangos y límites.
   ========================================================================== */

import type { BloqueLibre } from "./types";

export type BloqueTabla = Extract<BloqueLibre, { tipo: "tabla" }>;

export const MAX_FILAS = 200;
export const MAX_COLUMNAS = 20;

/** Separa texto en filas y celdas. Respeta celdas entre comillas (con saltos, separadores y «""»). */
export function leerDelimitado(texto: string, sep: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  const t = texto.replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          celda += '"';
          i++;
        } else comillas = false;
      } else celda += c;
    } else if (c === '"' && celda === "") comillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

/** Lo que Excel deja en el portapapeles: tabuladores. Si no hay ninguno, un CSV con «;» o «,». */
export function leerPegado(texto: string): string[][] {
  const sep = texto.includes("\t") ? "\t" : texto.includes(";") ? ";" : texto.includes(",") ? "," : "\t";
  return leerDelimitado(texto, sep);
}

export interface Rango {
  f0: number;
  c0: number;
  f1: number;
  c1: number;
}

/** «A1:D20» o «B2» como índices desde 0, o null si no se entiende. */
export function leerRango(r: string): Rango | null {
  const m = /^\s*([A-Za-z]{1,3})(\d{1,6})(?:\s*:\s*([A-Za-z]{1,3})(\d{1,6}))?\s*$/.exec(r);
  if (!m) return null;
  const col = (s: string) => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const [c0, f0] = [col(m[1]), Number(m[2]) - 1];
  const [c1, f1] = m[3] ? [col(m[3]), Number(m[4]) - 1] : [c0, f0];
  return { f0: Math.min(f0, f1), f1: Math.max(f0, f1), c0: Math.min(c0, c1), c1: Math.max(c0, c1) };
}

export function recortar(filas: string[][], rango: Rango): string[][] {
  return filas.slice(rango.f0, rango.f1 + 1).map((f) => Array.from({ length: rango.c1 - rango.c0 + 1 }, (_, i) => f[rango.c0 + i] ?? ""));
}

export interface ResultadoTabla {
  encabezados: string[];
  filas: string[][];
  avisos: string[];
}

/** Filas crudas → encabezados y filas rectangulares, dentro de los límites. */
export function armarTabla(crudas: string[][], primeraEsEncabezado: boolean): ResultadoTabla {
  const avisos: string[] = [];
  let filas = crudas.map((f) => f.map((c) => c.replace(/\s+$/g, ""))).filter((f) => f.some((c) => c.trim() !== ""));
  const ancho = Math.max(0, ...filas.map((f) => f.length));
  let columnas = ancho;
  if (columnas > MAX_COLUMNAS) {
    avisos.push(`La tabla tiene ${ancho} columnas y el máximo es ${MAX_COLUMNAS}: se dejaron las primeras ${MAX_COLUMNAS}.`);
    columnas = MAX_COLUMNAS;
  }
  filas = filas.map((f) => Array.from({ length: columnas }, (_, i) => f[i] ?? ""));
  let encabezados = primeraEsEncabezado && filas.length ? filas[0] : Array.from({ length: columnas }, (_, i) => `Columna ${i + 1}`);
  if (primeraEsEncabezado) filas = filas.slice(1);
  if (filas.length > MAX_FILAS) {
    avisos.push(`La tabla tiene ${filas.length} filas y el máximo es ${MAX_FILAS}: se dejaron las primeras ${MAX_FILAS}. Para una tabla grande use una tabla de UDrive.`);
    filas = filas.slice(0, MAX_FILAS);
  }
  encabezados = encabezados.map((e, i) => e.trim() || `Columna ${i + 1}`);
  return { encabezados, filas, avisos };
}

/** ¿Tiene datos? Una tabla sin filas con algo escrito no cuenta como contenido. */
export const tablaConDatos = (b: Pick<BloqueTabla, "filas">): boolean => b.filas.some((f) => f.some((c) => c.trim() !== ""));
