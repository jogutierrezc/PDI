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

/** Un informe plano para el servidor: el JSON de `entradaLibro` completo (todas las secciones y narraciones), aligerado solo si pasa del tope y perdiendo lo menos posible. */
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
  const cortar = (largo: number) => {
    const rec = (v: unknown): unknown => (typeof v === "string" ? (v.length > largo ? `${v.slice(0, largo)}…` : v) : Array.isArray(v) ? v.map(rec) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, rec(x)])) : v);
    informe = rec(informe) as Record<string, unknown>;
  };
  // Se pierde lo menos posible, en este orden: 1. lo que no se dibuja y repite lo demás (matriz, UDrive);
  // 2. el detalle redundante de cada indicador; 3. los textos larguísimos, poco a poco (las narraciones se conservan casi enteras);
  // 4. solo si aún no cabe, el contenido de las secciones libres y de la alineación.
  const pasos: (() => void)[] = [
    () => quitar(["matriz", "drive", "driveLogros", "driveIndicadores"]),
    () => quitar(["anterior", "variacion", "origen", "dim", "dimNombre", "respaldo", "clave"]),
    () => cortar(6000),
    () => cortar(3000),
    () => quitar(["avancesPlan"]),
    () => cortar(1500),
    () => quitar(["bloques", "alineacion"]),
    () => cortar(400),
  ];
  for (const paso of pasos) {
    paso();
    if (tam(informe) <= tope) return { informe, aligerado: true };
  }
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

/* ---------- Gráficas (tipo «grafica»): medidas puras, el SVG las dibuja ---------- */

export const COLORES_GRAFICA = ["#0a47a1", "#1b9ae1", "#12833a", "#d99a00", "#7b61c4", "#c4452d", "#44556d", "#6fa8dc"];

/** Un número como lo escribe el informe en Colombia: «2840», «84,2». */
export const formatoNumero = (n: number): string => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(n);

/** El valor con su unidad: «84,2 %», «12 artículos»; sin unidad, solo el número. */
export function textoValor(n: number, unidad?: string): string {
  const u = (unidad ?? "").trim();
  return u ? `${formatoNumero(n)} ${u}` : formatoNumero(n);
}

/** La etiqueta partida en hasta `lineas` renglones de `max` caracteres (la última con «…» si no cabe). */
export function partirEtiqueta(t: string, max: number, lineas = 2): string[] {
  const out: string[] = [];
  let resto = t.trim();
  while (resto && out.length < lineas) {
    if (resto.length <= max) {
      out.push(resto);
      resto = "";
      break;
    }
    const sp = resto.lastIndexOf(" ", max);
    const corte = sp > max * 0.4 ? sp : max;
    out.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto && out.length) out[out.length - 1] = `${out[out.length - 1].slice(0, Math.max(1, max - 1)).replace(/[\s,;:.]+$/, "")}…`;
  return out;
}

/** El tope de la escala común de barras y columnas: el mayor valor o meta (nunca 0). */
export const topeEscala = (series: { valor: number; meta?: number }[]): number => Math.max(1e-9, ...series.flatMap((s) => [s.valor, s.meta ?? 0]));

/** La fracción (0 a 1) de una barra de progreso: frente a su meta; sin meta, frente a 100 si la unidad es «%» o al mayor valor. */
export function fraccionProgreso(s: { valor: number; meta?: number; unidad?: string }, unidadGeneral: string | undefined, maximo: number): number {
  const base = s.meta && s.meta > 0 ? s.meta : (s.unidad ?? unidadGeneral ?? "").trim() === "%" ? 100 : maximo;
  return base > 0 ? Math.max(0, Math.min(1, s.valor / base)) : 0;
}

/** Los arcos de una dona: cada parte con su inicio y su fracción del total (0 a 1). Valores en cero no dibujan arco. */
export function arcosDona(series: { valor: number }[]): { inicio: number; fraccion: number }[] {
  const total = series.reduce((a, s) => a + s.valor, 0);
  let acumulado = 0;
  return series.map((s) => {
    const fraccion = total > 0 ? s.valor / total : 0;
    const arco = { inicio: acumulado, fraccion };
    acumulado += fraccion;
    return arco;
  });
}

/** Lo que lee una persona que no ve la gráfica: título y cada dato con su valor (y meta). */
export function descripcionGrafica(d: { titulo: string; forma: string; unidad?: string; series: { etiqueta: string; valor: number; meta?: number; unidad?: string }[] }): string {
  const datos = d.series.map((s) => `${s.etiqueta}: ${textoValor(s.valor, s.unidad ?? d.unidad)}${s.meta !== undefined ? ` (meta ${textoValor(s.meta, s.unidad ?? d.unidad)})` : ""}`).join("; ");
  return `Gráfica de ${d.forma}. ${d.titulo}. ${datos}.`;
}
