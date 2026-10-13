/* =============================================================================
   Analizador de posicionamiento · calibración puntaje → puesto.

   Con TODAS las filas publicadas se arma la curva empírica que convierte un
   puntaje en un puesto mundial:
     · general:  el puntaje general de las 1.603 universidades contra su banda;
     · ODS 17:   la columna del ODS 17 (todas las universidades la tienen);
     · otro ODS: los «tres mejores ODS» de cada universidad dan pares
                 puntaje ↔ banda de ese ODS. No es la tabla completa del ODS
                 (THE no la trae en esta página), pero el rango de puntaje que
                 se publica para una banda es el de toda la banda.
   Hasta el puesto 100 THE publica valores exactos; se interpola entre ellos.
   Desde ahí cada banda tiene su rango de puntaje; dentro de la banda el puesto
   se estima en línea recta (monótona) y el intervalo es la banda misma.
   Si dos variantes de una banda difieren («77.5–82.2» y «77.8–82.2»), se toma
   la unión. Si las bandas se solapan, se fuerzan monótonas (cummin).
   ========================================================================== */

import { centro, textoBanda } from "./bandas";
import type { FilaTHE } from "./tipos";

export interface UmbralBanda {
  label: string;
  rank_lo: number;
  rank_hi: number | null;
  /** Rango de puntaje de la banda. */
  lo: number;
  hi: number;
  /** Cuántas universidades (o pares) la sostienen. */
  n: number;
}

export interface PuntoExacto {
  score: number;
  rank: number;
}

export interface Calibracion {
  /** «overall», o el número del ODS. */
  clave: "overall" | number;
  /** Puestos 1..100 con puntaje exacto, de mayor a menor puntaje. */
  exactos: PuntoExacto[];
  /** Bandas desde la 101, en orden de puesto. */
  bandas: UmbralBanda[];
  /** Universidades en la tabla (o pares, en un ODS). */
  total: number;
}

export interface Ubicacion {
  label: string;
  rank_lo: number;
  rank_hi: number | null;
  /** Puesto estimado dentro de la banda (línea recta); exacto si es del top 100. */
  puesto: number;
  /** El puntaje cae fuera de toda banda observada (por encima o por debajo). */
  extrapolado: boolean;
}

interface Par {
  lo: number;
  hi: number;
  rank_lo: number;
  rank_hi: number | null;
  label: string;
}

function construir(clave: Calibracion["clave"], pares: Par[], total: number): Calibracion {
  const exactos: PuntoExacto[] = [];
  const porBanda = new Map<string, UmbralBanda>();
  for (const p of pares) {
    if (p.rank_hi === p.rank_lo && p.lo === p.hi) {
      exactos.push({ score: p.lo, rank: p.rank_lo });
      continue;
    }
    const k = `${p.rank_lo}-${p.rank_hi ?? "+"}`;
    const b = porBanda.get(k);
    if (b) {
      b.lo = Math.min(b.lo, p.lo);
      b.hi = Math.max(b.hi, p.hi);
      b.n++;
    } else {
      porBanda.set(k, { label: textoBanda({ lo: p.rank_lo, hi: p.rank_hi }), rank_lo: p.rank_lo, rank_hi: p.rank_hi, lo: p.lo, hi: p.hi, n: 1 });
    }
  }
  // Exactos: un puntaje por puesto (el promedio si hay empates), de mayor a menor.
  const porPuesto = new Map<number, number[]>();
  for (const e of exactos) porPuesto.set(e.rank, [...(porPuesto.get(e.rank) ?? []), e.score]);
  const exactosUnicos = [...porPuesto.entries()].map(([rank, s]) => ({ rank, score: s.reduce((a, b) => a + b, 0) / s.length })).sort((a, b) => a.rank - b.rank);
  // Monótonos: un puesto peor nunca tiene más puntaje.
  for (let i = 1; i < exactosUnicos.length; i++) exactosUnicos[i].score = Math.min(exactosUnicos[i].score, exactosUnicos[i - 1].score);

  const bandas = [...porBanda.values()].sort((a, b) => a.rank_lo - b.rank_lo);
  let techo = exactosUnicos.length ? exactosUnicos[exactosUnicos.length - 1].score : Infinity;
  for (const b of bandas) {
    b.hi = Math.min(b.hi, techo);
    b.lo = Math.min(b.lo, b.hi);
    techo = b.hi;
  }
  return { clave, exactos: exactosUnicos, bandas, total };
}

/** La curva de la puntuación general. */
export function calibrarGeneral(filas: FilaTHE[]): Calibracion {
  return construir(
    "overall",
    filas.map((f) => ({ lo: f.overall_lo, hi: f.overall_hi, rank_lo: f.rank_lo, rank_hi: f.rank_hi, label: f.rank_label })),
    filas.length,
  );
}

/** La curva de un ODS: el 17 con su columna; los demás con los «tres mejores». */
export function calibrarOds(filas: FilaTHE[], sdg: number): Calibracion {
  const pares: Par[] = [];
  for (const f of filas) {
    if (sdg === 17 && f.sdg17_lo !== null && f.sdg17_hi !== null && f.sdg17_rank_lo !== null) {
      pares.push({ lo: f.sdg17_lo, hi: f.sdg17_hi, rank_lo: f.sdg17_rank_lo, rank_hi: f.sdg17_rank_hi, label: f.sdg17_rank_label ?? "" });
    }
    for (const b of f.best) if (b.sdg === sdg) pares.push({ lo: b.lo, hi: b.hi, rank_lo: b.rank_lo, rank_hi: b.rank_hi, label: b.rank_label });
  }
  return construir(sdg, pares, pares.length);
}

export interface CalibracionCompleta {
  general: Calibracion;
  ods: Record<number, Calibracion>;
}

export function calibrarTodo(filas: FilaTHE[]): CalibracionCompleta {
  const ods: Record<number, Calibracion> = {};
  for (let n = 1; n <= 17; n++) ods[n] = calibrarOds(filas, n);
  return { general: calibrarGeneral(filas), ods };
}

/** Las bandas con su rango de puntaje (para la pantalla y las metas). */
export const umbralesDeBanda = (c: Calibracion): UmbralBanda[] => c.bandas;

/** Interpola el puesto entre los exactos (puntaje de mayor a menor). */
function puestoExacto(c: Calibracion, s: number): number {
  const e = c.exactos;
  if (s >= e[0].score) return e[0].rank;
  for (let i = 1; i < e.length; i++) {
    if (s >= e[i].score) {
      const a = e[i - 1];
      const b = e[i];
      const t = a.score === b.score ? 0 : (a.score - s) / (a.score - b.score);
      return a.rank + t * (b.rank - a.rank);
    }
  }
  return e[e.length - 1].rank;
}

function enBanda(b: UmbralBanda, s: number, total: number, extrapolado: boolean): Ubicacion {
  const hiRank = b.rank_hi ?? Math.max(b.rank_lo, total);
  const t = b.hi === b.lo ? 0.5 : Math.min(1, Math.max(0, (b.hi - s) / (b.hi - b.lo)));
  return { label: b.label, rank_lo: b.rank_lo, rank_hi: b.rank_hi, puesto: Math.round(b.rank_lo + t * (hiRank - b.rank_lo)), extrapolado };
}

/** El puesto (o la banda) que corresponde a un puntaje en una curva. */
export function ubicar(c: Calibracion, s: number): Ubicacion {
  const primera = c.bandas[0];
  if (c.exactos.length && (!primera || s > primera.hi)) {
    const p = Math.round(puestoExacto(c, s));
    return { label: String(p), rank_lo: p, rank_hi: p, puesto: p, extrapolado: s > c.exactos[0].score };
  }
  if (!c.bandas.length) return { label: "—", rank_lo: 0, rank_hi: null, puesto: 0, extrapolado: true };
  if (s > primera.hi) return enBanda(primera, primera.hi, c.total, true);
  for (let i = 0; i < c.bandas.length; i++) {
    const b = c.bandas[i];
    if (s >= b.lo) return enBanda(b, s, c.total, false);
    const sig = c.bandas[i + 1];
    // Hueco entre bandas (66,1 → 66,2): a la más cercana.
    if (sig && s > sig.hi) return b.lo - s <= s - sig.hi ? enBanda(b, b.lo, c.total, false) : enBanda(sig, sig.hi, c.total, false);
  }
  const ultima = c.bandas[c.bandas.length - 1];
  return enBanda(ultima, ultima.lo, c.total, true);
}

export const bandaParaPuntaje = (cal: CalibracionCompleta, overall: number) => ubicar(cal.general, overall);
export const bandaParaOds = (cal: CalibracionCompleta, sdg: number, puntaje: number) => ubicar(cal.ods[sdg], puntaje);

/**
 * Lo mínimo que hay que sacar para quedar en una banda dada o mejor
 * (`rank_lo` de la banda: 401 para «401–600»). null si la banda no se conoce.
 */
export function puntajeParaBanda(c: Calibracion, rank_lo: number): number | null {
  if (rank_lo <= 100) {
    const e = c.exactos.filter((x) => x.rank <= rank_lo);
    return e.length ? e[e.length - 1].score : null;
  }
  const b = c.bandas.find((x) => x.rank_lo === rank_lo);
  return b ? b.lo : null;
}

/** La banda siguiente (mejor) a la de un puesto: la que hay que alcanzar para «subir». */
export function bandaSiguiente(c: Calibracion, rank_lo: number): UmbralBanda | { label: string; rank_lo: number; rank_hi: number; lo: number; hi: number; n: number } | null {
  const i = c.bandas.findIndex((x) => x.rank_lo === rank_lo);
  if (i > 0) return c.bandas[i - 1];
  if (i === 0 && c.exactos.length) {
    const ult = c.exactos[c.exactos.length - 1];
    return { label: `top ${ult.rank}`, rank_lo: 1, rank_hi: ult.rank, lo: ult.score, hi: c.exactos[0].score, n: c.exactos.length };
  }
  return null;
}

/** Centro de un rango publicado; atajo para la escalera. */
export const centroFila = (f: Pick<FilaTHE, "overall_lo" | "overall_hi">) => centro({ lo: f.overall_lo, hi: f.overall_hi });
