/* =============================================================================
   Pilo presentaciones · anti-invención.

   Toda cifra y todo enlace que aparece en las diapositivas debe existir en el
   informe de entrada. Lo que no esté respaldado se reemplaza por «[por completar]»
   (en texto) o se quita (filas de cumplimiento) y se anota en `no_verificado`.
   Módulo puro, en el espíritu del «verified» de pilo-ia (acción analizar):
   el modelo redacta, el servidor comprueba.

   Qué NO comprueba (se dice con franqueza): nombres propios y fechas escritas con
   palabras («quince de marzo») ni cifras escritas con letras («tres pilares»);
   para eso está la prohibición del prompt. Las fechas con dígitos sí pasan por
   aquí (día, mes y año deben aparecer en el informe).
   ========================================================================== */

import { POR_COMPLETAR } from "./esquema.ts";
import type { Diapositiva, Presentacion } from "./esquema.ts";

export interface NoVerificado {
  diapositiva: number;
  campo: string;
  valor: string;
  motivo: "cifra" | "enlace";
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
// 1.234.567,89 · 1 234 · 12,5 · 7.8 · 2026
const NUM_RE = /\d{1,3}(?:[.  ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g;

/** Todas las formas en que una cifra pudo escribirse: «2.840» es 2840 (miles) o 2,84 (decimal). */
export function formasDeNumero(token: string): string[] {
  const t = token.trim();
  const limpio = (s: string) => {
    let x = s.replace(/^0+(?=\d)/, "");
    if (x.includes(".")) x = x.replace(/0+$/, "").replace(/\.$/, "");
    return x;
  };
  const formas = new Set<string>();
  const sinMiles = t.replace(/[.  ](?=\d{3}(?:\D|$))/g, "");
  formas.add(limpio(sinMiles.replace(",", ".")));
  formas.add(limpio(t.replace(",", ".")));
  formas.add(limpio(t.replace(/[.,  ]/g, "")));
  return [...formas].filter(Boolean);
}

/** Los números que trae un texto, sin los que están dentro de un enlace. */
export function numerosDe(texto: string): string[] {
  return (texto.replace(URL_RE, " ").match(NUM_RE) ?? []).map((x) => x.trim());
}

const normalizarUrl = (u: string) => u.trim().replace(/[.,;:!?)\]]+$/, "").replace(/\/+$/, "").toLowerCase();
export const enlacesDe = (texto: string): string[] => (texto.match(URL_RE) ?? []).map(normalizarUrl);

export interface Respaldo {
  numeros: Set<string>;
  enlaces: Set<string>;
}

/** Recorre el informe (JSON plano de cualquier forma) y junta sus cifras y enlaces. */
export function respaldoDelInforme(informe: unknown): Respaldo {
  const numeros = new Set<string>();
  const enlaces = new Set<string>();
  const ver = (v: unknown, hondo: number) => {
    if (hondo > 40 || v === null || v === undefined) return;
    if (typeof v === "number" && Number.isFinite(v)) {
      for (const f of formasDeNumero(String(v))) numeros.add(f);
    } else if (typeof v === "string") {
      for (const n of numerosDe(v)) for (const f of formasDeNumero(n)) numeros.add(f);
      for (const u of enlacesDe(v)) enlaces.add(u);
    } else if (Array.isArray(v)) {
      for (const x of v) ver(x, hondo + 1);
    } else if (typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) ver(x, hondo + 1);
    }
  };
  ver(informe, 0);
  return { numeros, enlaces };
}

const respaldado = (token: string, r: Respaldo) => formasDeNumero(token).some((f) => r.numeros.has(f));

interface Aviso {
  campo: string;
  valor: string;
  motivo: "cifra" | "enlace";
}

/** Un texto revisado: lo no respaldado queda como «[por completar]». */
function limpiar(texto: string, r: Respaldo, campo: string, avisos: Aviso[], extra?: Set<string>): string {
  let t = texto.replace(URL_RE, (u) => {
    if (r.enlaces.has(normalizarUrl(u))) return u;
    avisos.push({ campo, valor: u.slice(0, 120), motivo: "enlace" });
    return POR_COMPLETAR;
  });
  // Los números fuera de los enlaces.
  const partes = t.split(URL_RE);
  const urls = t.match(URL_RE) ?? [];
  t = partes
    .map((p) =>
      p.replace(NUM_RE, (n) => {
        if (respaldado(n, r) || (extra && formasDeNumero(n).some((f) => extra.has(f)))) return n;
        avisos.push({ campo, valor: n, motivo: "cifra" });
        return POR_COMPLETAR;
      }),
    )
    .reduce((acc, p, i) => acc + p + (urls[i] ?? ""), "");
  return t;
}

/** Sumas permitidas en «cumplimiento»: el total de cada fila y el de todas. */
function sumasDeCumplimiento(d: Extract<Diapositiva, { tipo: "cumplimiento" }>): Set<string> {
  const s = new Set<string>();
  let todo = 0;
  for (const f of d.filas) {
    const t = f.completadas + f.en_proceso + f.pendientes;
    s.add(String(t));
    todo += t;
  }
  s.add(String(todo));
  return s;
}

/** Aplica `f` a cada texto de la diapositiva (sin tocar su estructura) y devuelve la diapositiva nueva. */
function mapearTextos(d: Diapositiva, f: (t: string, campo: string) => string): Diapositiva {
  const rec = (v: unknown, campo: string): unknown => {
    if (typeof v === "string") return f(v, campo);
    if (Array.isArray(v)) return v.map((x, i) => rec(x, `${campo}[${i}]`));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, k === "tipo" || k === "animo" ? x : rec(x, campo ? `${campo}.${k}` : k)]));
    return v;
  };
  return rec(d, "") as Diapositiva;
}

/** «numero» (el «01» de una portada de sección) es numeración propia de la diapositiva, no una cifra del informe. */

export function verificarPresentacion(p: Presentacion, informe: unknown): { presentacion: Presentacion; no_verificado: NoVerificado[] } {
  const r = respaldoDelInforme(informe);
  const no: NoVerificado[] = [];
  const diapositivas: Diapositiva[] = [];
  p.diapositivas.forEach((d0, idx) => {
    const avisos: Aviso[] = [];
    let d = d0;
    let extra: Set<string> | undefined;
    if (d.tipo === "cumplimiento") {
      // Un conteo que el informe no respalda quita la fila entera: una barra con medias verdades engaña.
      const filas = d.filas.filter((f) => {
        const ok = [f.completadas, f.en_proceso, f.pendientes].every((n) => respaldado(String(n), r) || n === 0);
        if (!ok) avisos.push({ campo: `filas(${f.dimension})`, valor: `${f.completadas}/${f.en_proceso}/${f.pendientes}`, motivo: "cifra" });
        return ok;
      });
      d = { ...d, filas };
      extra = sumasDeCumplimiento(d);
      if (!filas.length) {
        for (const a of avisos) no.push({ diapositiva: idx + 1, ...a });
        return; // sin filas respaldadas la diapositiva no tiene gráfica: se quita
      }
    }
    if (d.tipo === "grafica") {
      // Cada valor (y su meta) debe estar en el informe: una barra sin respaldo se quita, no se redondea ni se corrige.
      const series = d.series.filter((x) => {
        const ok = [x.valor, ...(x.meta === undefined ? [] : [x.meta])].every((n) => n === 0 || respaldado(String(n), r));
        if (!ok) avisos.push({ campo: `series(${x.etiqueta})`, valor: `${x.valor}${x.meta === undefined ? "" : ` / meta ${x.meta}`}`, motivo: "cifra" });
        return ok;
      });
      const minimo = d.forma === "dona" ? 2 : 1;
      if (series.length < minimo) {
        for (const a of avisos) no.push({ diapositiva: idx + 1, ...a });
        return; // sin valores respaldados no hay gráfica: se quita
      }
      d = { ...d, series };
    }
    d = mapearTextos(d, (t, campo) => (campo === "numero" ? t : limpiar(t, r, campo, avisos, extra)));
    for (const a of avisos) no.push({ diapositiva: idx + 1, ...a });
    diapositivas.push(d);
  });
  return { presentacion: { ...p, diapositivas }, no_verificado: no };
}
