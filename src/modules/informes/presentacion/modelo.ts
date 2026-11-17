/* =============================================================================
   Presentación con Pilo · utilidades puras del visor (sin React ni red).
   ========================================================================== */

import type { Animo, Diapositiva, Presentacion } from "../../../../supabase/functions/pilo-presentaciones/esquema";
import { MAX_INFORME_BYTES } from "../../../../supabase/functions/pilo-presentaciones/pedido";
import { INFO_TONOS, TONOS } from "../../../../supabase/functions/pilo-presentaciones/tonos";
import type { Tono } from "../../../../supabase/functions/pilo-presentaciones/tonos";

export { INFO_TONOS, TONOS };
export type { Animo, Diapositiva, Presentacion, Tono };

/** Del estado de ánimo que pide el modelo (catálogo cerrado) a una imagen real de Pilo. */
export const IMAGEN_ANIMO: Record<Animo, string> = {
  feliz: "/pilo-moods/feliz-320.webp",
  piensa: "/pilo-moods/piensa-320.webp",
  idea: "/pilo-moods/idea-320.webp",
  excelente: "/pilo-moods/excelente-320.webp",
};
export const TEXTO_ANIMO: Record<Animo, string> = {
  feliz: "Pilo sonriendo",
  piensa: "Pilo pensando",
  idea: "Pilo con una idea",
  excelente: "Pilo celebrando",
};

export const fondoUrl = (n: number) => `/presentaciones/fondo${n}.jpg`;

/** Un informe plano para el servidor: el JSON de `entradaLibro`, aligerado si pasa del tope (primero lo que no se dibuja). */
export function informeParaPresentacion(entrada: unknown, tope = MAX_INFORME_BYTES): { informe: Record<string, unknown>; aligerado: boolean } {
  const tam = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
  let informe = JSON.parse(JSON.stringify(entrada ?? {})) as Record<string, unknown>;
  if (tam(informe) <= tope) return { informe, aligerado: false };
  const quitar = (claves: string[]) => {
    const rec = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(rec);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !claves.includes(k)).map(([k, x]) => [k, rec(x)]));
      return v;
    };
    informe = rec(informe) as Record<string, unknown>;
  };
  // 1. lo que no se dibuja ni aporta cifras nuevas; 2. el detalle largo.
  for (const paso of [["matriz", "drive", "driveLogros", "driveIndicadores"], ["bloques", "avancesPlan"], ["filas", "alineacion"]]) {
    quitar(paso);
    if (tam(informe) <= tope) return { informe, aligerado: true };
  }
  // Último recurso: recorta los textos largos.
  const corto = (v: unknown): unknown => (typeof v === "string" ? (v.length > 400 ? `${v.slice(0, 400)}…` : v) : Array.isArray(v) ? v.map(corto) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, corto(x)])) : v);
  informe = corto(informe) as Record<string, unknown>;
  return { informe, aligerado: true };
}

export type Ruta = (string | number)[];

/** Copia de la diapositiva con el texto de `ruta` cambiado (edición en línea). No toca nada más. */
export function ponerEn<T extends Diapositiva>(d: T, ruta: Ruta, valor: string): T {
  const rec = (nodo: unknown, i: number): unknown => {
    const k = ruta[i];
    if (i === ruta.length - 1) {
      if (Array.isArray(nodo)) return nodo.map((x, j) => (j === k ? valor : x));
      return { ...(nodo as object), [k]: valor };
    }
    if (Array.isArray(nodo)) return nodo.map((x, j) => (j === k ? rec(x, i + 1) : x));
    const o = nodo as Record<string, unknown>;
    return { ...o, [k]: rec(o[k as string], i + 1) };
  };
  return ruta.length ? (rec(d, 0) as T) : d;
}

export const reemplazarDiapositiva = (p: Presentacion, i: number, d: Diapositiva): Presentacion => ({ ...p, diapositivas: p.diapositivas.map((x, j) => (j === i ? d : x)) });

/** Partes de la barra de una fila de cumplimiento, en porcentaje del total (0 si no hay nada). */
export function partesBarra(f: { completadas: number; en_proceso: number; pendientes: number }) {
  const total = f.completadas + f.en_proceso + f.pendientes;
  const p = (n: number) => (total ? (n / total) * 100 : 0);
  return { total, ok: p(f.completadas), pr: p(f.en_proceso), pe: p(f.pendientes) };
}

/** La fila «Total» de la gráfica: suma de todas las dimensiones (solo si hay más de una y no trae ya una «Total»). */
export function filaTotal(filas: { dimension: string; completadas: number; en_proceso: number; pendientes: number }[]) {
  if (filas.length < 2 || filas.some((f) => /^total$/i.test(f.dimension.trim()))) return null;
  return filas.reduce((a, f) => ({ ...a, completadas: a.completadas + f.completadas, en_proceso: a.en_proceso + f.en_proceso, pendientes: a.pendientes + f.pendientes }), { dimension: "Total", completadas: 0, en_proceso: 0, pendientes: 0 });
}

/** Palabra del estado de una celda de la tabla, para pintarla con su color (siempre sigue su palabra). */
export function claseEstado(t: string): "ok" | "proc" | "pend" | "" {
  const x = t.trim().toLowerCase();
  if (/^(completad[oa]s?|cumplid[oa]s?|logrado|ok)$/.test(x)) return "ok";
  if (/^(en proceso|en curso|en ejecuci[oó]n|parcial)$/.test(x)) return "proc";
  if (/^(sin iniciar|pendiente|no iniciad[oa])$/.test(x)) return "pend";
  return "";
}

/** Los anchos de columna de una tabla: la primera, más ancha; las cortas, menos. */
export function anchosColumnas(columnas: string[], filas: string[][]): number[] {
  const pesos = columnas.map((c, i) => Math.min(40, Math.max(c.length, ...filas.map((f) => (f[i] ?? "").length), 4)) ** 0.85);
  const suma = pesos.reduce((a, b) => a + b, 0) || 1;
  return pesos.map((p) => Math.round((p / suma) * 100));
}

export function nombreArchivoPresentacion(p: Presentacion): string {
  return (p.titulo || "Presentación").replace(/[\/:*?"<>|]+/g, "-").slice(0, 120);
}

/** Los textos de las notas, para la ayuda del orador (vacías se omiten). */
export const notasDe = (d: Diapositiva): string => d.notas ?? "";

/** El siguiente tono distinto al actual (para «Regenerar con otro tono»). */
export const otroTono = (t: Tono): Tono => TONOS[(TONOS.indexOf(t) + 1) % TONOS.length];

/* ---------- Medidas para que el texto quepa en el lienzo (1920×1080) ---------- */

const ANCHO_CARACTER = 0.56; // Montserrat, promedio de un carácter en proporción al cuerpo

/** Líneas que ocupa un texto de `n` caracteres con ese cuerpo y ese ancho (px). */
export const lineasDe = (n: number, cuerpo: number, ancho: number) => Math.max(1, Math.ceil((n * cuerpo * ANCHO_CARACTER) / Math.max(40, ancho)));

/**
 * El cuerpo de letra de una tabla: el mayor que hace caber todas sus filas en `alto` px.
 * Devuelve también el relleno vertical de las celdas.
 */
export function medidasTabla(columnas: string[], filas: string[][], ancho = 1630, alto = 560): { cuerpo: number; relleno: number; anchos: number[] } {
  const anchos = anchosColumnas(columnas, filas);
  for (const cuerpo of [32, 29, 26, 24, 22, 20]) {
    const relleno = cuerpo >= 29 ? 16 : cuerpo >= 24 ? 11 : 8;
    const celda = (c: string, i: number) => lineasDe(c.length, cuerpo, ((anchos[i] ?? 20) / 100) * ancho - 48);
    const alturaFila = (f: string[]) => Math.max(...f.map(celda), 1) * cuerpo * 1.25 + relleno * 2;
    const total = alturaFila(columnas) + filas.reduce((a, f) => a + alturaFila(f), 0);
    if (total <= alto) return { cuerpo, relleno, anchos };
  }
  return { cuerpo: 20, relleno: 8, anchos };
}

/** Cuerpo de una cifra grande para que quepa en su tarjeta (px de ancho útil). */
export const cuerpoCifra = (texto: string, ancho: number, max = 104, min = 22) => Math.max(min, Math.min(max, Math.floor((ancho * 0.92) / (Math.max(texto.length, 1) * 0.66))));

/** Cuerpo de un título grande (portada, sección) según su largo. */
export function cuerpoTitulo(n: number, niveles: [number, number][], min: number): number {
  for (const [hasta, cuerpo] of niveles) if (n <= hasta) return cuerpo;
  return min;
}
