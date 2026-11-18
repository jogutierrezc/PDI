/* =============================================================================
   Pilo presentaciones · el esquema de la presentación y su validación.

   Módulo puro (sin red, sin base, sin React): lo usan la función de borde y el
   visor. El modelo devuelve JSON; aquí se lee, se valida contra tipos CERRADOS
   con campos acotados (para que el texto quepa en el lienzo de 1920×1080) y se
   reparan lo que se puede sin inventar nada:
     · texto pasado de largo hasta un 50 %: se recorta en una palabra, con «…»;
     · más del 50 % de largo, tipo desconocido o campos que faltan: error, que
       sirve de mensaje para el reintento;
     · tablas con más de 8 filas: se parten en varias diapositivas.
   Lo que el modelo no sepa se escribe «[por completar]»; nunca se rellena.
   ========================================================================== */

import { TONOS, esTono } from "./tonos.ts";
import type { Tono } from "./tonos.ts";

export const POR_COMPLETAR = "[por completar]";
/** Estados de ánimo de Pilo que el modelo puede pedir; el visor los lleva a imágenes reales. */
export const ANIMOS = ["feliz", "piensa", "idea", "excelente"] as const;
export type Animo = (typeof ANIMOS)[number];
export const TIPOS = ["portada", "agenda", "seccion", "tabla", "tarjetas", "cifras", "cumplimiento", "grafica", "logros", "evidencias", "texto", "cierre"] as const;
export type TipoDiapositiva = (typeof TIPOS)[number];

export const MAX_FILAS_TABLA = 8;
/** Máximo de diapositivas que el modelo puede escribir; las de continuación («parte n de m») se suman después. */
export const MAX_DIAPOSITIVAS = 60;
export const MAX_NOTAS = 900;
/** Cuánto se pasó un texto del límite para anotarlo como «muy por encima» (siempre se recorta; no se pide de nuevo). */
export const HOLGURA = 2;
/** Cuánto cabe en una lámina antes de pasar a una de continuación. */
export const MAX_ELEMENTOS_LAMINA = { tarjetas: 4, cifras: 4, logros: 4, cumplimiento: 6, anexos: 6, barras: 10, columnas: 8, progreso: 8, dona: 8 } as const;
/** Una lámina de texto admite unas 12 líneas de ~68 caracteres: más allá, el texto sigue en otra lámina. */
export const LINEAS_TEXTO = 12;
export const CARACTERES_LINEA = 68;
/** Títulos de la banda de la plantilla: la corta (fondo 4) admite hasta 10 caracteres; la larga, hasta 28. */
export const MAX_BANDA_CORTA = 10;
export const MAX_BANDA = 28;

/** Límites de longitud por campo (caracteres). */
export const LIM = {
  titulopres: 120,
  bandaTitulo: MAX_BANDA,
  titulo: 90,
  subtitulo: 160,
  etiqueta: 40,
  bajada: 240,
  intro: 240,
  nota: 240,
  celdaCabecera: 32,
  celda: 120,
  itemTitulo: 60,
  itemDetalle: 130,
  tarjetaTitulo: 50,
  tarjetaCifra: 16,
  tarjetaTexto: 200,
  tarjetaPie: 80,
  cifraEtiqueta: 80,
  cifraDetalle: 140,
  logroTitulo: 80,
  logroTexto: 320,
  parrafo: 900,
  punto: 260,
  fuente: 120,
  enlaceTexto: 60,
  url: 300,
  contacto: 100,
  dimension: 40,
  serie: 50,
  unidad: 12,
} as const;

export interface Comun {
  animo?: Animo;
  notas?: string;
  /** Lámina de continuación: una narración o lista larga se parte en varias en vez de resumirse. */
  parte?: { n: number; de: number };
}
export interface DPortada extends Comun { tipo: "portada"; titulo: string; subtitulo: string; etiqueta?: string }
export interface DAgenda extends Comun { tipo: "agenda"; titulo: string; items: { titulo: string; detalle?: string }[] }
export interface DSeccion extends Comun { tipo: "seccion"; numero?: string; kicker?: string; titulo: string; bajada?: string }
export interface DTabla extends Comun { tipo: "tabla"; titulo: string; intro?: string; columnas: string[]; filas: string[][]; nota?: string }
export interface DTarjetas extends Comun { tipo: "tarjetas"; titulo: string; intro?: string; tarjetas: { titulo: string; cifra?: string; texto: string; pie?: string }[]; destacado?: { etiqueta: string; valor: string } }
export interface DCifras extends Comun { tipo: "cifras"; titulo: string; intro?: string; cifras: { valor: string; etiqueta: string; detalle?: string }[]; nota?: string }
export interface FilaCumplimiento { dimension: string; completadas: number; en_proceso: number; pendientes: number }
export interface DCumplimiento extends Comun { tipo: "cumplimiento"; titulo: string; filas: FilaCumplimiento[]; resumen?: { valor: string; etiqueta: string }[]; nota?: string }
export const FORMAS_GRAFICA = ["barras", "columnas", "dona", "progreso"] as const;
export type FormaGrafica = (typeof FORMAS_GRAFICA)[number];
export interface SerieGrafica { etiqueta: string; valor: number; meta?: number; unidad?: string }
/** Gráfica con datos del informe: barras horizontales, columnas, dona o barras de progreso (valor frente a meta). */
export interface DGrafica extends Comun { tipo: "grafica"; forma: FormaGrafica; titulo: string; intro?: string; unidad?: string; series: SerieGrafica[]; nota?: string }
export interface DLogros extends Comun { tipo: "logros"; titulo: string; intro?: string; logros: { titulo: string; resultado: string; evidencia?: string }[] }
export interface DEvidencias extends Comun { tipo: "evidencias"; titulo: string; anexos: { n: string; documento: string; descripcion?: string }[]; fuentes: string[]; enlaces?: { texto: string; url: string }[] }
export interface DTexto extends Comun { tipo: "texto"; eyebrow?: string; titulo: string; parrafos?: string[]; puntos?: string[] }
export interface DCierre extends Comun { tipo: "cierre"; titulo: string; contacto?: string }

export type Diapositiva = DPortada | DAgenda | DSeccion | DTabla | DTarjetas | DCifras | DCumplimiento | DGrafica | DLogros | DEvidencias | DTexto | DCierre;

export interface Presentacion {
  titulo: string;
  tono: Tono;
  diapositivas: Diapositiva[];
}

/** La banda de la plantilla que le toca a un título: la corta (fondo 4) solo hasta 10 caracteres. */
export const bandaCorta = (titulo: string) => titulo.trim().length <= MAX_BANDA_CORTA;

/** Qué fondo de la plantilla lleva cada diapositiva (1 portada · 2 franja · 3 banda larga · 4 banda corta · 5 sección · 6 cierre). */
export function fondoDe(d: Diapositiva): 1 | 2 | 3 | 4 | 5 | 6 {
  switch (d.tipo) {
    case "portada": return 1;
    case "cierre": return 6;
    case "seccion": return 5;
    case "agenda":
    case "texto": return 2;
    default: return bandaCorta(d.titulo) ? 4 : 3;
  }
}

/* ---------- Lectura del JSON ---------- */

/** El JSON que el modelo escribió, aunque venga con ```json, con texto antes o después, o con comas finales. */
export function leerJson(crudo: string): { ok: true; valor: unknown } | { ok: false; error: string } {
  let t = String(crudo ?? "").replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "").trim();
  if (!t) return { ok: false, error: "La respuesta vino vacía." };
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) t = cerca[1].trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return { ok: false, error: "La respuesta no trae un objeto JSON." };
  const cuerpo = t.slice(a, b + 1);
  try {
    return { ok: true, valor: JSON.parse(cuerpo) };
  } catch {
    try {
      return { ok: true, valor: JSON.parse(cuerpo.replace(/,\s*([}\]])/g, "$1")) };
    } catch (e) {
      return { ok: false, error: `El JSON no se puede leer (${String((e as Error)?.message ?? e).slice(0, 120)}).` };
    }
  }
}

/* ---------- Validación ---------- */

interface Ctx {
  errores: string[];
  ajustes: string[];
}

const esObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function recortar(t: string, max: number): string {
  const corte = t.slice(0, max - 1);
  const sp = corte.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? corte.slice(0, sp) : corte).replace(/[\s,;:.]+$/, "")}…`;
}

/** El modelo a veces manda una fuente como objeto ({nombre, detalle…}): se une en una línea en vez de rechazar toda la presentación. */
function comoTexto(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const partes = Object.values(v as Record<string, unknown>)
    .filter((x): x is string | number => typeof x === "string" || typeof x === "number")
    .map((x) => String(x).trim())
    .filter(Boolean);
  return partes.length ? partes.join(" · ") : v;
}

/** Una fuente larga se recorta en vez de tumbar toda la presentación: es una referencia, no un dato. */
function acortarFuente(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length > LIM.fuente ? recortar(t, LIM.fuente) : t;
}

/** Un texto: limpio, dentro de su límite (con la holgura) y, si es obligatorio, no vacío. */
function txt(v: unknown, max: number, ruta: string, c: Ctx, obligatorio = true): string {
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
  if (v === undefined || v === null || v === "") {
    if (obligatorio) c.errores.push(`${ruta}: falta (use «${POR_COMPLETAR}» si el informe no lo trae).`);
    return "";
  }
  if (typeof v !== "string") {
    c.errores.push(`${ruta}: debe ser texto.`);
    return "";
  }
  const t = v.replace(/\s+/g, " ").trim();
  if (!t && obligatorio) c.errores.push(`${ruta}: está vacío (use «${POR_COMPLETAR}»).`);
  // El marcador de lo que falta cabe siempre, en cualquier campo.
  if (t === POR_COMPLETAR) return t;
  // Un texto largo se recorta (y se anota) en vez de tumbar la presentación: un reintento cuesta más que una frase cortada.
  if (t.length > max) {
    c.ajustes.push(`${ruta}: recortado de ${t.length} a ${max} caracteres${t.length > max * HOLGURA ? " (muy por encima del límite)" : ""}.`);
    return recortar(t, max);
  }
  return t;
}
const opt = (v: unknown, max: number, ruta: string, c: Ctx): string | undefined => {
  const t = txt(v, max, ruta, c, false);
  return t || undefined;
};

function lista(v: unknown, min: number, max: number, ruta: string, c: Ctx): unknown[] {
  if (!Array.isArray(v)) {
    c.errores.push(`${ruta}: debe ser una lista.`);
    return [];
  }
  if (v.length < min) c.errores.push(`${ruta}: necesita al menos ${min} elemento(s) y trae ${v.length}.`);
  if (v.length > max) {
    c.ajustes.push(`${ruta}: se conservaron los primeros ${max} de ${v.length}.`);
    return v.slice(0, max);
  }
  return v;
}

function entero(v: unknown, ruta: string, c: Ctx): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100000) {
    c.errores.push(`${ruta}: debe ser un entero no negativo.`);
    return 0;
  }
  return n;
}

/** Un valor numérico de una gráfica: número o texto («84,2», «72 %», «1.234»); nunca negativo. */
function numero(v: unknown, ruta: string, c: Ctx): number {
  let n: number | null = null;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const t = v.replace(/[%\s ]/g, "");
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) n = Number(t.replace(/\./g, "").replace(",", "."));
    else if (/^\d+([.,]\d+)?$/.test(t)) n = Number(t.replace(",", "."));
  }
  if (n === null || !Number.isFinite(n) || n < 0 || n > 1e12) {
    c.errores.push(`${ruta}: debe ser un número no negativo (sin texto).`);
    return 0;
  }
  return n;
}

const comun = (d: Record<string, unknown>, ruta: string, c: Ctx): Comun => {
  const out: Comun = {};
  if (d.animo !== undefined && d.animo !== null && d.animo !== "") {
    if ((ANIMOS as readonly string[]).includes(String(d.animo))) out.animo = d.animo as Animo;
    else c.ajustes.push(`${ruta}.animo: «${String(d.animo).slice(0, 20)}» no está en el catálogo (${ANIMOS.join(", ")}); se omitió.`);
  }
  const notas = txt(d.notas, MAX_NOTAS, `${ruta}.notas`, c, false);
  if (notas) out.notas = notas;
  // Una lámina de continuación guardada (o escrita por el modelo) conserva su «parte n de m».
  if (esObj(d.parte)) {
    const n = Number(d.parte.n);
    const de = Number(d.parte.de);
    if (Number.isInteger(n) && Number.isInteger(de) && n >= 1 && de >= 2 && n <= de && de <= 30) out.parte = { n, de };
  }
  return out;
};

const banda = (v: unknown, ruta: string, c: Ctx) => txt(v, LIM.bandaTitulo, `${ruta}.titulo`, c);

function una(d: Record<string, unknown>, ruta: string, c: Ctx): Diapositiva | null {
  const tipo = String(d.tipo ?? "");
  const k = comun(d, ruta, c);
  switch (tipo) {
    case "portada":
      return { tipo, ...k, titulo: txt(d.titulo, LIM.titulo, `${ruta}.titulo`, c), subtitulo: txt(d.subtitulo, LIM.subtitulo, `${ruta}.subtitulo`, c), ...(opt(d.etiqueta, LIM.etiqueta, `${ruta}.etiqueta`, c) ? { etiqueta: opt(d.etiqueta, LIM.etiqueta, `${ruta}.etiqueta`, c) } : {}) };
    case "agenda": {
      const items = lista(d.items, 2, 8, `${ruta}.items`, c).map((x, i) => {
        const o = esObj(x) ? x : { titulo: x };
        const detalle = opt(o.detalle, LIM.itemDetalle, `${ruta}.items[${i}].detalle`, c);
        return { titulo: txt(o.titulo, LIM.itemTitulo, `${ruta}.items[${i}].titulo`, c), ...(detalle ? { detalle } : {}) };
      });
      return { tipo, ...k, titulo: txt(d.titulo, LIM.itemTitulo, `${ruta}.titulo`, c), items };
    }
    case "seccion": {
      const numero = opt(d.numero, 3, `${ruta}.numero`, c);
      const kicker = opt(d.kicker, LIM.etiqueta + 10, `${ruta}.kicker`, c);
      const bajada = opt(d.bajada, LIM.bajada, `${ruta}.bajada`, c);
      return { tipo, ...k, ...(numero ? { numero } : {}), ...(kicker ? { kicker } : {}), titulo: txt(d.titulo, LIM.titulo, `${ruta}.titulo`, c), ...(bajada ? { bajada } : {}) };
    }
    case "tabla": {
      const columnas = lista(d.columnas, 2, 5, `${ruta}.columnas`, c).map((x, i) => txt(x, LIM.celdaCabecera, `${ruta}.columnas[${i}]`, c));
      const filas = lista(d.filas, 1, 120, `${ruta}.filas`, c).map((f0, i) => {
        // El modelo a veces escribe una fila como objeto {columna: valor}: se lee por el nombre de la columna (o en orden).
        let f: unknown = f0;
        if (esObj(f0)) {
          const porNombre = columnas.map((col) => f0[col]);
          f = porNombre.some((x) => x !== undefined) ? porNombre.map((x) => x ?? POR_COMPLETAR) : Object.values(f0);
        }
        if (!Array.isArray(f)) {
          c.errores.push(`${ruta}.filas[${i}]: debe ser una lista de celdas.`);
          return [] as string[];
        }
        // Una fila con celdas de más junta las sobrantes en la última (no se pierde nada); con celdas de menos, lo que falta queda «[por completar]».
        let celdas = f as unknown[];
        if (celdas.length !== columnas.length) {
          c.ajustes.push(`${ruta}.filas[${i}]: tenía ${celdas.length} celdas y la tabla ${columnas.length} columnas; se ajustó.`);
          if (celdas.length > columnas.length) celdas = [...celdas.slice(0, columnas.length - 1), celdas.slice(columnas.length - 1).map((x) => String(x ?? "")).filter(Boolean).join(" · ")];
          else celdas = [...celdas, ...Array.from({ length: columnas.length - celdas.length }, () => POR_COMPLETAR)];
        }
        return celdas.map((x, j) => txt(x === "" || x === null || x === undefined ? POR_COMPLETAR : x, LIM.celda, `${ruta}.filas[${i}][${j}]`, c));
      });
      const intro = opt(d.intro, LIM.intro, `${ruta}.intro`, c);
      const nota = opt(d.nota, LIM.nota, `${ruta}.nota`, c);
      return { tipo, ...k, titulo: banda(d.titulo, ruta, c), ...(intro ? { intro } : {}), columnas, filas, ...(nota ? { nota } : {}) };
    }
    case "tarjetas": {
      const tarjetas = lista(d.tarjetas, 2, 12, `${ruta}.tarjetas`, c).map((x, i) => {
        const o = esObj(x) ? x : {};
        if (!esObj(x)) c.errores.push(`${ruta}.tarjetas[${i}]: debe ser un objeto.`);
        const cifra = opt(o.cifra, LIM.tarjetaCifra, `${ruta}.tarjetas[${i}].cifra`, c);
        const pie = opt(o.pie, LIM.tarjetaPie, `${ruta}.tarjetas[${i}].pie`, c);
        return { titulo: txt(o.titulo, LIM.tarjetaTitulo, `${ruta}.tarjetas[${i}].titulo`, c), ...(cifra ? { cifra } : {}), texto: txt(o.texto, LIM.tarjetaTexto, `${ruta}.tarjetas[${i}].texto`, c), ...(pie ? { pie } : {}) };
      });
      const intro = opt(d.intro, LIM.intro, `${ruta}.intro`, c);
      let destacado: DTarjetas["destacado"];
      if (esObj(d.destacado)) destacado = { etiqueta: txt(d.destacado.etiqueta, LIM.cifraEtiqueta, `${ruta}.destacado.etiqueta`, c), valor: txt(d.destacado.valor, LIM.tarjetaCifra, `${ruta}.destacado.valor`, c) };
      return { tipo, ...k, titulo: banda(d.titulo, ruta, c), ...(intro ? { intro } : {}), tarjetas, ...(destacado ? { destacado } : {}) };
    }
    case "cifras": {
      const cifras = lista(d.cifras, 2, 12, `${ruta}.cifras`, c).map((x, i) => {
        const o = esObj(x) ? x : {};
        if (!esObj(x)) c.errores.push(`${ruta}.cifras[${i}]: debe ser un objeto.`);
        const detalle = opt(o.detalle, LIM.cifraDetalle, `${ruta}.cifras[${i}].detalle`, c);
        return { valor: txt(o.valor, LIM.tarjetaCifra, `${ruta}.cifras[${i}].valor`, c), etiqueta: txt(o.etiqueta, LIM.cifraEtiqueta, `${ruta}.cifras[${i}].etiqueta`, c), ...(detalle ? { detalle } : {}) };
      });
      const intro = opt(d.intro, LIM.intro, `${ruta}.intro`, c);
      const nota = opt(d.nota, LIM.nota, `${ruta}.nota`, c);
      return { tipo, ...k, titulo: banda(d.titulo, ruta, c), ...(intro ? { intro } : {}), cifras, ...(nota ? { nota } : {}) };
    }
    case "cumplimiento": {
      const filas = lista(d.filas, 1, 12, `${ruta}.filas`, c).map((x, i) => {
        const o = esObj(x) ? x : {};
        if (!esObj(x)) c.errores.push(`${ruta}.filas[${i}]: debe ser un objeto.`);
        return {
          dimension: txt(o.dimension, LIM.dimension, `${ruta}.filas[${i}].dimension`, c),
          completadas: entero(o.completadas, `${ruta}.filas[${i}].completadas`, c),
          en_proceso: entero(o.en_proceso, `${ruta}.filas[${i}].en_proceso`, c),
          pendientes: entero(o.pendientes, `${ruta}.filas[${i}].pendientes`, c),
        };
      });
      const resumen = d.resumen === undefined ? undefined : lista(d.resumen, 0, 3, `${ruta}.resumen`, c).map((x, i) => {
        const o = esObj(x) ? x : {};
        return { valor: txt(o.valor, LIM.tarjetaCifra, `${ruta}.resumen[${i}].valor`, c), etiqueta: txt(o.etiqueta, LIM.cifraEtiqueta, `${ruta}.resumen[${i}].etiqueta`, c) };
      });
      const nota = opt(d.nota, LIM.nota, `${ruta}.nota`, c);
      return { tipo, ...k, titulo: banda(d.titulo, ruta, c), filas, ...(resumen?.length ? { resumen } : {}), ...(nota ? { nota } : {}) };
    }
    case "grafica": {
      const f = String(d.forma ?? "barras").toLowerCase().trim();
      const forma: FormaGrafica = (FORMAS_GRAFICA as readonly string[]).includes(f) ? (f as FormaGrafica) : "barras";
      if (forma !== f) c.ajustes.push(`${ruta}.forma: «${f.slice(0, 20)}» no está en el catálogo (${FORMAS_GRAFICA.join(", ")}); se usó «barras».`);
      let series = lista(d.series, 1, 40, `${ruta}.series`, c).map((x, i) => {
        const o = esObj(x) ? x : {};
        if (!esObj(x)) c.errores.push(`${ruta}.series[${i}]: debe ser un objeto {etiqueta, valor}.`);
        const meta = o.meta === undefined || o.meta === null || o.meta === "" ? undefined : numero(o.meta, `${ruta}.series[${i}].meta`, c);
        const unidad = opt(o.unidad, LIM.unidad, `${ruta}.series[${i}].unidad`, c);
        return { etiqueta: txt(o.etiqueta, LIM.serie, `${ruta}.series[${i}].etiqueta`, c), valor: numero(o.valor, `${ruta}.series[${i}].valor`, c), ...(meta !== undefined ? { meta } : {}), ...(unidad ? { unidad } : {}) };
      });
      if (forma === "dona" && series.length > MAX_ELEMENTOS_LAMINA.dona) {
        c.ajustes.push(`${ruta}.series: la dona admite ${MAX_ELEMENTOS_LAMINA.dona} partes; se conservaron las primeras.`);
        series = series.slice(0, MAX_ELEMENTOS_LAMINA.dona);
      }
      if (forma === "dona" && series.length < 2) c.errores.push(`${ruta}.series: una dona necesita al menos 2 partes.`);
      const intro = opt(d.intro, LIM.intro, `${ruta}.intro`, c);
      const unidad = opt(d.unidad, LIM.unidad, `${ruta}.unidad`, c);
      const nota = opt(d.nota, LIM.nota, `${ruta}.nota`, c);
      return { tipo, ...k, forma, titulo: banda(d.titulo, ruta, c), ...(intro ? { intro } : {}), ...(unidad ? { unidad } : {}), series, ...(nota ? { nota } : {}) };
    }
    case "logros": {
      const logros = lista(d.logros, 1, 12, `${ruta}.logros`, c).map((x, i) => {
        const o = esObj(x) ? x : {};
        if (!esObj(x)) c.errores.push(`${ruta}.logros[${i}]: debe ser un objeto.`);
        const evidencia = opt(o.evidencia, LIM.etiqueta, `${ruta}.logros[${i}].evidencia`, c);
        return { titulo: txt(o.titulo, LIM.logroTitulo, `${ruta}.logros[${i}].titulo`, c), resultado: txt(o.resultado, LIM.logroTexto, `${ruta}.logros[${i}].resultado`, c), ...(evidencia ? { evidencia } : {}) };
      });
      const intro = opt(d.intro, LIM.intro, `${ruta}.intro`, c);
      return { tipo, ...k, titulo: banda(d.titulo, ruta, c), ...(intro ? { intro } : {}), logros };
    }
    case "evidencias": {
      const anexos = lista(d.anexos ?? [], 0, 30, `${ruta}.anexos`, c).map((x, i) => {
        const o = esObj(x) ? x : {};
        const descripcion = opt(o.descripcion, LIM.celda, `${ruta}.anexos[${i}].descripcion`, c);
        return { n: txt(o.n, 4, `${ruta}.anexos[${i}].n`, c), documento: txt(o.documento, 90, `${ruta}.anexos[${i}].documento`, c), ...(descripcion ? { descripcion } : {}) };
      });
      const fuentes = lista(d.fuentes ?? [], 0, 8, `${ruta}.fuentes`, c).map((x, i) => txt(acortarFuente(comoTexto(x)), LIM.fuente, `${ruta}.fuentes[${i}]`, c));
      const enlaces = d.enlaces === undefined ? undefined : lista(d.enlaces, 0, 8, `${ruta}.enlaces`, c).map((x, i) => {
        const o = esObj(x) ? x : {};
        return { texto: txt(o.texto, LIM.enlaceTexto, `${ruta}.enlaces[${i}].texto`, c), url: txt(o.url, LIM.url, `${ruta}.enlaces[${i}].url`, c) };
      });
      if (!anexos.length && !fuentes.length && !enlaces?.length) c.errores.push(`${ruta}: una diapositiva de evidencias necesita anexos, fuentes o enlaces.`);
      return { tipo, ...k, titulo: banda(d.titulo, ruta, c), anexos, fuentes, ...(enlaces?.length ? { enlaces } : {}) };
    }
    case "texto": {
      const parrafos = d.parrafos === undefined ? [] : lista(d.parrafos, 0, 30, `${ruta}.parrafos`, c).map((x, i) => txt(x, LIM.parrafo * 3, `${ruta}.parrafos[${i}]`, c));
      const puntos = d.puntos === undefined ? [] : lista(d.puntos, 0, 40, `${ruta}.puntos`, c).map((x, i) => txt(x, LIM.punto * 2, `${ruta}.puntos[${i}]`, c));
      if (!parrafos.length && !puntos.length) c.errores.push(`${ruta}: una diapositiva de texto necesita párrafos o puntos.`);
      const eyebrow = opt(d.eyebrow, LIM.etiqueta, `${ruta}.eyebrow`, c);
      return { tipo, ...k, ...(eyebrow ? { eyebrow } : {}), titulo: txt(d.titulo, 80, `${ruta}.titulo`, c), ...(parrafos.length ? { parrafos } : {}), ...(puntos.length ? { puntos } : {}) };
    }
    case "cierre": {
      const contacto = opt(d.contacto, LIM.contacto, `${ruta}.contacto`, c);
      return { tipo, ...k, titulo: txt(d.titulo, LIM.etiqueta, `${ruta}.titulo`, c), ...(contacto ? { contacto } : {}) };
    }
    default:
      c.errores.push(`${ruta}.tipo: «${tipo.slice(0, 30)}» no existe; use uno de: ${TIPOS.join(", ")}.`);
      return null;
  }
}

/** `total` elementos en lotes de a lo sumo `max`, parejos: 9 con máximo 8 son 5 + 4, no 8 + 1. */
function lotes(total: number, max: number): number[] {
  const partes = Math.max(1, Math.ceil(total / max));
  const base = Math.ceil(total / partes);
  const out: number[] = [];
  for (let i = 0; i < total; i += base) out.push(Math.min(base, total - i));
  return out;
}

/** Quita lo que solo va en la primera lámina (introducción, notas del orador) de las siguientes. */
function continuacion<T extends Diapositiva>(d: T): T {
  const { intro: _i, notas: _n, ...resto } = d as T & { intro?: string; notas?: string };
  return resto as unknown as T;
}

/** Parte una lista larga de una diapositiva en varias (mismo título, `parte` n/de). */
function partirLista<T extends Diapositiva>(d: T, total: number, max: number, poner: (d: T, desde: number, hasta: number) => T): Diapositiva[] {
  if (total <= max || d.parte) return [d];
  const tamanos = lotes(total, max);
  let desde = 0;
  return tamanos.map((t, p) => {
    const trozo = poner(p === 0 ? d : continuacion(d), desde, desde + t);
    desde += t;
    return { ...trozo, parte: { n: p + 1, de: tamanos.length } } as Diapositiva;
  });
}

/** Parte las tablas de más de MAX_FILAS_TABLA filas en varias diapositivas (mismo título, `parte` n/de). */
export function repartirTablas(ds: Diapositiva[], max = MAX_FILAS_TABLA): Diapositiva[] {
  return ds.flatMap((d) => {
    if (d.tipo !== "tabla") return [d];
    // Las notas del orador y la introducción van en la primera parte; la nota al pie, en todas.
    return partirLista(d, d.filas.length, max, (x, i, j) => ({ ...x, filas: x.filas.slice(i, j) }));
  });
}

/* ---------- Texto largo: se reparte, no se resume ---------- */

const lineasDeTexto = (t: string, ancho = CARACTERES_LINEA) => Math.max(1, Math.ceil(t.length / ancho));

/** Un párrafo largo en trozos que caben en una lámina, cortando entre frases (o entre palabras si una frase no cabe). */
function trozosDe(t: string, max: number): string[] {
  if (t.length <= max) return [t];
  const frases = t.split(/(?<=[.;:!?])\s+/);
  const out: string[] = [];
  let actual = "";
  const cerrar = () => {
    if (actual.trim()) out.push(actual.trim());
    actual = "";
  };
  for (const f of frases) {
    if (f.length > max) {
      cerrar();
      let resto = f;
      while (resto.length > max) {
        const sp = resto.lastIndexOf(" ", max);
        const corte = sp > max * 0.5 ? sp : max;
        out.push(resto.slice(0, corte).trim());
        resto = resto.slice(corte).trim();
      }
      actual = resto;
      continue;
    }
    if ((actual ? actual.length + 1 : 0) + f.length > max) cerrar();
    actual = actual ? `${actual} ${f}` : f;
  }
  cerrar();
  return out;
}

/** Las láminas de texto con más de LINEAS_TEXTO líneas siguen en otras («parte n de m»): la narración se conserva completa. */
export function repartirTextos(ds: Diapositiva[], lineasMax = LINEAS_TEXTO): Diapositiva[] {
  return ds.flatMap((d): Diapositiva[] => {
    if (d.tipo !== "texto" || d.parte) return [d];
    const peso = (b: { t: string; punto: boolean }) => lineasDeTexto(b.t, b.punto ? CARACTERES_LINEA - 8 : CARACTERES_LINEA) + 0.6;
    const bloques = [...(d.parrafos ?? []).map((t) => ({ t, punto: false })), ...(d.puntos ?? []).map((t) => ({ t, punto: true }))].flatMap((b) =>
      peso(b) > lineasMax ? trozosDe(b.t, (lineasMax - 1) * CARACTERES_LINEA).map((t) => ({ t, punto: b.punto })) : [b],
    );
    const total = bloques.reduce((a, b) => a + peso(b), 0);
    if (total <= lineasMax) return [d];
    const n = Math.ceil(total / lineasMax);
    const tope = Math.max(total / n, ...bloques.map(peso)) * 1.08;
    const grupos: (typeof bloques)[] = [[]];
    let acum = 0;
    for (const b of bloques) {
      if (acum + peso(b) > tope && grupos[grupos.length - 1].length && grupos.length < n) {
        grupos.push([]);
        acum = 0;
      }
      grupos[grupos.length - 1].push(b);
      acum += peso(b);
    }
    if (grupos.length < 2) return [d];
    return grupos.map((g, p) => {
      const parrafos = g.filter((b) => !b.punto).map((b) => b.t);
      const puntos = g.filter((b) => b.punto).map((b) => b.t);
      const { parrafos: _a, puntos: _b, notas: _n, ...sinCuerpo } = d;
      const base = p === 0 && d.notas ? { ...sinCuerpo, notas: d.notas } : sinCuerpo;
      return { ...base, ...(parrafos.length ? { parrafos } : {}), ...(puntos.length ? { puntos } : {}), parte: { n: p + 1, de: grupos.length } } as Diapositiva;
    });
  });
}

/** Tarjetas, cifras, logros, filas de cumplimiento, anexos y series de las gráficas largas: varias láminas en vez de recortar. */
export function repartirListas(ds: Diapositiva[]): Diapositiva[] {
  const M = MAX_ELEMENTOS_LAMINA;
  return ds.flatMap((d): Diapositiva[] => {
    switch (d.tipo) {
      case "tarjetas": return partirLista(d, d.tarjetas.length, M.tarjetas, (x, i, j) => ({ ...x, tarjetas: x.tarjetas.slice(i, j), ...(i > 0 ? { destacado: undefined } : {}) }));
      case "cifras": return partirLista(d, d.cifras.length, M.cifras, (x, i, j) => ({ ...x, cifras: x.cifras.slice(i, j) }));
      case "logros": return partirLista(d, d.logros.length, M.logros, (x, i, j) => ({ ...x, logros: x.logros.slice(i, j) }));
      case "cumplimiento": return partirLista(d, d.filas.length, M.cumplimiento, (x, i, j) => ({ ...x, filas: x.filas.slice(i, j), ...(i > 0 ? { resumen: undefined } : {}) }));
      case "evidencias": return partirLista(d, d.anexos.length, M.anexos, (x, i, j) => ({ ...x, anexos: x.anexos.slice(i, j), ...(i > 0 ? { fuentes: [], enlaces: undefined } : {}) }));
      case "grafica": return d.forma === "dona" ? [d] : partirLista(d, d.series.length, M[d.forma], (x, i, j) => ({ ...x, series: x.series.slice(i, j) }));
      default: return [d];
    }
  });
}

/** Todo el reparto en láminas: tablas, texto largo y listas. */
export const repartir = (ds: Diapositiva[]): Diapositiva[] => repartirListas(repartirTextos(repartirTablas(ds)));

/**
 * Un texto de tarjeta o de logro mucho más largo que su campo (el modelo metió ahí una narración) no se pierde:
 * la tarjeta lo muestra recortado y el texto completo pasa a una diapositiva «texto» que sigue a la diapositiva.
 */
function desbordes(raw: Record<string, unknown>, d: Diapositiva): Diapositiva[] {
  const limpio = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const items: { titulo: string; texto: string }[] = [];
  if (d.tipo === "tarjetas" && Array.isArray(raw.tarjetas)) {
    d.tarjetas.forEach((t, i) => {
      const o = raw.tarjetas as unknown[];
      const original = esObj(o[i]) ? limpio((o[i] as Record<string, unknown>).texto) : "";
      if (original.length > LIM.tarjetaTexto * 1.5 && original.length <= LIM.parrafo * 3) items.push({ titulo: t.titulo, texto: original });
    });
  }
  if (d.tipo === "logros" && Array.isArray(raw.logros)) {
    d.logros.forEach((l, i) => {
      const o = raw.logros as unknown[];
      const original = esObj(o[i]) ? limpio((o[i] as Record<string, unknown>).resultado) : "";
      if (original.length > LIM.logroTexto * 1.5 && original.length <= LIM.parrafo * 3) items.push({ titulo: l.titulo, texto: original });
    });
  }
  const eyebrow = d.tipo === "tarjetas" || d.tipo === "logros" ? recortar(d.titulo, LIM.etiqueta) : "";
  return items.map((x): Diapositiva => ({ tipo: "texto", eyebrow, titulo: x.titulo.length > 80 ? recortar(x.titulo, 80) : x.titulo, parrafos: [x.texto.length > LIM.parrafo * 3 ? recortar(x.texto, LIM.parrafo * 3) : x.texto] }));
}

export type Validacion = { ok: true; presentacion: Presentacion; ajustes: string[] } | { ok: false; errores: string[] };

/** Valida lo que el modelo devolvió. `tono` es el que pidió la persona: manda sobre lo que el modelo escriba. */
export function validarPresentacion(raw: unknown, tono: Tono): Validacion {
  const c: Ctx = { errores: [], ajustes: [] };
  if (!esObj(raw)) return { ok: false, errores: ["La respuesta debe ser un objeto con «titulo» y «diapositivas»."] };
  const titulo = txt(raw.titulo, LIM.titulopres, "titulo", c);
  const lista0 = Array.isArray(raw.diapositivas) ? raw.diapositivas : null;
  if (!lista0) return { ok: false, errores: [...c.errores, "«diapositivas» debe ser una lista."] };
  if (lista0.length < 3) c.errores.push("Una presentación necesita al menos 3 diapositivas.");
  if (lista0.length > MAX_DIAPOSITIVAS) c.errores.push(`Máximo ${MAX_DIAPOSITIVAS} diapositivas (trae ${lista0.length}).`);
  const ds: Diapositiva[] = [];
  lista0.slice(0, MAX_DIAPOSITIVAS).forEach((x, i) => {
    if (!esObj(x)) {
      c.errores.push(`diapositivas[${i}]: debe ser un objeto con «tipo».`);
      return;
    }
    const d = una(x, `diapositivas[${i}]`, c);
    if (d) ds.push(d, ...desbordes(x, d));
  });
  if (ds.length && ds[0].tipo !== "portada") c.errores.push("La primera diapositiva debe ser de tipo «portada».");
  if (ds.length && ds[ds.length - 1].tipo !== "cierre") c.errores.push("La última diapositiva debe ser de tipo «cierre».");
  if (ds.filter((d) => d.tipo === "portada").length > 1) c.errores.push("Solo puede haber una «portada».");
  if (c.errores.length) return { ok: false, errores: c.errores.slice(0, 12) };
  void TONOS;
  return { ok: true, presentacion: { titulo, tono: esTono(tono) ? tono : "institucional", diapositivas: repartir(ds) }, ajustes: c.ajustes };
}

/** Para el cliente: lee lo guardado (jsonb) con la misma validación; null si no pasa. */
export function leerPresentacion(raw: unknown, tono: Tono): Presentacion | null {
  const v = validarPresentacion(raw, tono);
  return v.ok ? v.presentacion : null;
}
