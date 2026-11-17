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
export const TIPOS = ["portada", "agenda", "seccion", "tabla", "tarjetas", "cifras", "cumplimiento", "logros", "evidencias", "texto", "cierre"] as const;
export type TipoDiapositiva = (typeof TIPOS)[number];

export const MAX_FILAS_TABLA = 8;
export const MAX_DIAPOSITIVAS = 40;
export const MAX_NOTAS = 600;
/** Más largo que el límite por esta razón ya no se recorta: se pide de nuevo. */
export const HOLGURA = 1.5;
/** Títulos de la banda de la plantilla: la corta (fondo 4) admite hasta 10 caracteres; la larga, hasta 28. */
export const MAX_BANDA_CORTA = 10;
export const MAX_BANDA = 28;

/** Límites de longitud por campo (caracteres). */
export const LIM = {
  titulopres: 120,
  bandaTitulo: MAX_BANDA,
  titulo: 90,
  subtitulo: 120,
  etiqueta: 40,
  bajada: 160,
  intro: 130,
  nota: 140,
  celdaCabecera: 24,
  celda: 70,
  itemTitulo: 60,
  itemDetalle: 90,
  tarjetaTitulo: 40,
  tarjetaCifra: 16,
  tarjetaTexto: 120,
  tarjetaPie: 50,
  cifraEtiqueta: 60,
  cifraDetalle: 80,
  logroTitulo: 60,
  logroTexto: 150,
  parrafo: 220,
  punto: 110,
  fuente: 80,
  enlaceTexto: 60,
  url: 300,
  contacto: 100,
  dimension: 40,
} as const;

export interface Comun {
  animo?: Animo;
  notas?: string;
}
export interface DPortada extends Comun { tipo: "portada"; titulo: string; subtitulo: string; etiqueta?: string }
export interface DAgenda extends Comun { tipo: "agenda"; titulo: string; items: { titulo: string; detalle?: string }[] }
export interface DSeccion extends Comun { tipo: "seccion"; numero?: string; kicker?: string; titulo: string; bajada?: string }
export interface DTabla extends Comun { tipo: "tabla"; titulo: string; intro?: string; columnas: string[]; filas: string[][]; nota?: string; parte?: { n: number; de: number } }
export interface DTarjetas extends Comun { tipo: "tarjetas"; titulo: string; intro?: string; tarjetas: { titulo: string; cifra?: string; texto: string; pie?: string }[]; destacado?: { etiqueta: string; valor: string } }
export interface DCifras extends Comun { tipo: "cifras"; titulo: string; intro?: string; cifras: { valor: string; etiqueta: string; detalle?: string }[]; nota?: string }
export interface FilaCumplimiento { dimension: string; completadas: number; en_proceso: number; pendientes: number }
export interface DCumplimiento extends Comun { tipo: "cumplimiento"; titulo: string; filas: FilaCumplimiento[]; resumen?: { valor: string; etiqueta: string }[]; nota?: string }
export interface DLogros extends Comun { tipo: "logros"; titulo: string; intro?: string; logros: { titulo: string; resultado: string; evidencia?: string }[] }
export interface DEvidencias extends Comun { tipo: "evidencias"; titulo: string; anexos: { n: string; documento: string; descripcion?: string }[]; fuentes: string[]; enlaces?: { texto: string; url: string }[] }
export interface DTexto extends Comun { tipo: "texto"; eyebrow?: string; titulo: string; parrafos?: string[]; puntos?: string[] }
export interface DCierre extends Comun { tipo: "cierre"; titulo: string; contacto?: string }

export type Diapositiva = DPortada | DAgenda | DSeccion | DTabla | DTarjetas | DCifras | DCumplimiento | DLogros | DEvidencias | DTexto | DCierre;

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
  if (t.length > max * HOLGURA) {
    c.errores.push(`${ruta}: tiene ${t.length} caracteres y el máximo es ${max}.`);
    return "";
  }
  if (t.length > max) {
    c.ajustes.push(`${ruta}: recortado de ${t.length} a ${max} caracteres.`);
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

const comun = (d: Record<string, unknown>, ruta: string, c: Ctx): Comun => {
  const out: Comun = {};
  if (d.animo !== undefined && d.animo !== null && d.animo !== "") {
    if ((ANIMOS as readonly string[]).includes(String(d.animo))) out.animo = d.animo as Animo;
    else c.ajustes.push(`${ruta}.animo: «${String(d.animo).slice(0, 20)}» no está en el catálogo (${ANIMOS.join(", ")}); se omitió.`);
  }
  const notas = txt(d.notas, MAX_NOTAS, `${ruta}.notas`, c, false);
  if (notas) out.notas = notas;
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
      const items = lista(d.items, 2, 7, `${ruta}.items`, c).map((x, i) => {
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
      const filas = lista(d.filas, 1, 60, `${ruta}.filas`, c).map((f, i) => {
        if (!Array.isArray(f)) {
          c.errores.push(`${ruta}.filas[${i}]: debe ser una lista de celdas.`);
          return [] as string[];
        }
        if (f.length !== columnas.length) c.errores.push(`${ruta}.filas[${i}]: tiene ${f.length} celdas y la tabla ${columnas.length} columnas.`);
        return f.slice(0, columnas.length).map((x, j) => txt(x ?? POR_COMPLETAR, LIM.celda, `${ruta}.filas[${i}][${j}]`, c));
      });
      const intro = opt(d.intro, LIM.intro, `${ruta}.intro`, c);
      const nota = opt(d.nota, LIM.nota, `${ruta}.nota`, c);
      return { tipo, ...k, titulo: banda(d.titulo, ruta, c), ...(intro ? { intro } : {}), columnas, filas, ...(nota ? { nota } : {}) };
    }
    case "tarjetas": {
      const tarjetas = lista(d.tarjetas, 2, 4, `${ruta}.tarjetas`, c).map((x, i) => {
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
      const cifras = lista(d.cifras, 2, 4, `${ruta}.cifras`, c).map((x, i) => {
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
      const filas = lista(d.filas, 1, 6, `${ruta}.filas`, c).map((x, i) => {
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
    case "logros": {
      const logros = lista(d.logros, 1, 4, `${ruta}.logros`, c).map((x, i) => {
        const o = esObj(x) ? x : {};
        if (!esObj(x)) c.errores.push(`${ruta}.logros[${i}]: debe ser un objeto.`);
        const evidencia = opt(o.evidencia, LIM.etiqueta, `${ruta}.logros[${i}].evidencia`, c);
        return { titulo: txt(o.titulo, LIM.logroTitulo, `${ruta}.logros[${i}].titulo`, c), resultado: txt(o.resultado, LIM.logroTexto, `${ruta}.logros[${i}].resultado`, c), ...(evidencia ? { evidencia } : {}) };
      });
      const intro = opt(d.intro, LIM.intro, `${ruta}.intro`, c);
      return { tipo, ...k, titulo: banda(d.titulo, ruta, c), ...(intro ? { intro } : {}), logros };
    }
    case "evidencias": {
      const anexos = lista(d.anexos ?? [], 0, 6, `${ruta}.anexos`, c).map((x, i) => {
        const o = esObj(x) ? x : {};
        const descripcion = opt(o.descripcion, LIM.celda, `${ruta}.anexos[${i}].descripcion`, c);
        return { n: txt(o.n, 4, `${ruta}.anexos[${i}].n`, c), documento: txt(o.documento, 70, `${ruta}.anexos[${i}].documento`, c), ...(descripcion ? { descripcion } : {}) };
      });
      const fuentes = lista(d.fuentes ?? [], 0, 4, `${ruta}.fuentes`, c).map((x, i) => txt(x, LIM.fuente, `${ruta}.fuentes[${i}]`, c));
      const enlaces = d.enlaces === undefined ? undefined : lista(d.enlaces, 0, 4, `${ruta}.enlaces`, c).map((x, i) => {
        const o = esObj(x) ? x : {};
        return { texto: txt(o.texto, LIM.enlaceTexto, `${ruta}.enlaces[${i}].texto`, c), url: txt(o.url, LIM.url, `${ruta}.enlaces[${i}].url`, c) };
      });
      if (!anexos.length && !fuentes.length && !enlaces?.length) c.errores.push(`${ruta}: una diapositiva de evidencias necesita anexos, fuentes o enlaces.`);
      return { tipo, ...k, titulo: banda(d.titulo, ruta, c), anexos, fuentes, ...(enlaces?.length ? { enlaces } : {}) };
    }
    case "texto": {
      const parrafos = d.parrafos === undefined ? [] : lista(d.parrafos, 0, 3, `${ruta}.parrafos`, c).map((x, i) => txt(x, LIM.parrafo, `${ruta}.parrafos[${i}]`, c));
      const puntos = d.puntos === undefined ? [] : lista(d.puntos, 0, 5, `${ruta}.puntos`, c).map((x, i) => txt(x, LIM.punto, `${ruta}.puntos[${i}]`, c));
      if (!parrafos.length && !puntos.length) c.errores.push(`${ruta}: una diapositiva de texto necesita párrafos o puntos.`);
      const eyebrow = opt(d.eyebrow, LIM.etiqueta, `${ruta}.eyebrow`, c);
      return { tipo, ...k, ...(eyebrow ? { eyebrow } : {}), titulo: txt(d.titulo, 70, `${ruta}.titulo`, c), ...(parrafos.length ? { parrafos } : {}), ...(puntos.length ? { puntos } : {}) };
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

/** Parte las tablas de más de MAX_FILAS_TABLA filas en varias diapositivas (mismo título, `parte` n/de). */
export function repartirTablas(ds: Diapositiva[], max = MAX_FILAS_TABLA): Diapositiva[] {
  const out: Diapositiva[] = [];
  for (const d of ds) {
    if (d.tipo !== "tabla" || d.filas.length <= max) {
      out.push(d);
      continue;
    }
    const partes = Math.ceil(d.filas.length / max);
    // Reparto parejo: 9 filas son 5 + 4, no 8 + 1.
    const base = Math.ceil(d.filas.length / partes);
    for (let p = 0; p < partes; p++) {
      const filas = d.filas.slice(p * base, (p + 1) * base);
      const parte = { n: p + 1, de: partes };
      if (p === 0) out.push({ ...d, filas, parte });
      else {
        // Las notas del orador y la introducción van en la primera parte.
        const { intro: _i, notas: _n, ...resto } = d;
        out.push({ ...resto, filas, parte });
      }
    }
  }
  return out;
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
    if (d) ds.push(d);
  });
  if (ds.length && ds[0].tipo !== "portada") c.errores.push("La primera diapositiva debe ser de tipo «portada».");
  if (ds.length && ds[ds.length - 1].tipo !== "cierre") c.errores.push("La última diapositiva debe ser de tipo «cierre».");
  if (ds.filter((d) => d.tipo === "portada").length > 1) c.errores.push("Solo puede haber una «portada».");
  if (c.errores.length) return { ok: false, errores: c.errores.slice(0, 12) };
  void TONOS;
  return { ok: true, presentacion: { titulo, tono: esTono(tono) ? tono : "institucional", diapositivas: repartirTablas(ds) }, ajustes: c.ajustes };
}

/** Para el cliente: lee lo guardado (jsonb) con la misma validación; null si no pasa. */
export function leerPresentacion(raw: unknown, tono: Tono): Presentacion | null {
  const v = validarPresentacion(raw, tono);
  return v.ok ? v.presentacion : null;
}
