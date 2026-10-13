/* =============================================================================
   Analizador de posicionamiento · escenario 2027 y Monte Carlo.

   Lo que se sabe (THE 2026, publicado): la banda y el rango del puntaje general
   de cada universidad, el rango del ODS 17 y el de sus tres mejores ODS.

   El modelo, por cada sorteo (PRNG con semilla: el mismo resultado cada vez):
     1. Puntaje general 2026 de la UDES: O26 ~ Uniforme(rango publicado).
     2. Línea base de cada ODS:
          · publicado (17 y los tres mejores): Normal(centro, σ), con
            σ = max(media amplitud de la banda, σmín = 2);
          · no publicado: THE solo muestra los tres mejores, así que los demás
            están por debajo del tercero. Se sortea una fracción Uniforme(0,6–1)
            del tercer mejor sorteado (entre el 60 % y el 100 % de él).
     3. Año 2027 de cada ODS enviado: base + cambio, con
          cambio = Δevidencia × k × rigor
        (Δevidencia en puntos del ODS, de evidencia.ts; k convierte puntos del
        ODS a la escala de 0 a 100 que THE usa para el general; rigor descuenta
        lo que el evaluador de THE no reconozca).
     4. Puntaje del año: F = 0,22 × ODS 17 + 0,26 × (los tres mejores enviados,
        sin el 17). Como la puntuación general de THE se calcula con puntajes
        ESCALADOS que no se publican, F con los puntajes visibles no reproduce
        el general (en la tabla 2026 queda unos 3–4 puntos por debajo, en
        promedio). Por eso el modelo se ancla: el año 2027 es
          Y27 = O26 + (F27 − F26) + deriva,
        donde F26 es F con la línea base y los tres mejores publicados. Así, sin
        cambios, la UDES queda donde está y solo cuenta lo que se mueve.
        deriva ~ Normal(0, δ): lo que el año cambia por el reescalamiento y por
        las demás universidades (δ = 2 por defecto).
     5. General publicado 2027 = promedio de 2026 y 2027 = (O26 + Y27) / 2.
     6. Rivales colombianos: igual, sin cambios propios:
          O26 ~ Uniforme(rango publicado), Y27 = O26 + Normal(0, δ).
     7. La banda mundial de cada sorteo sale de la curva de calibración 2026
        (supone que las bandas de 2027 quedan en los mismos puntajes).
   Resultados: distribución del general de la UDES, probabilidad de cada banda,
   de subir, de cada meta y posición en Colombia (por puntaje y por banda).
   ========================================================================== */

import { centro, sigmaDe, type Rango } from "./bandas";
import { ubicar, type CalibracionCompleta } from "./calibracion";
import { esUdes } from "./colombia";
import { PESO_MEJOR, PESO_ODS17, type FilaTHE } from "./tipos";

/* ---------- PRNG ------------------------------------------------------------ */

/** mulberry32: rápido, 32 bits, reproducible con la semilla. */
export function prng(semilla: number): () => number {
  let a = semilla >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal(0, 1) por Box-Muller. */
export function normal(r: () => number): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

const entre = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/* ---------- Entradas -------------------------------------------------------- */

export interface Supuestos {
  /** Puntos del ODS → puntos escalados (1 = igual). */
  k: number;
  /** Lo que el evaluador de THE reconoce de la evidencia (0,9 = el 90 %). */
  rigor: number;
  /** Desviación de un año a otro del puntaje anual, en puntos. */
  deriva: number;
  /** σ mínima de la línea base de un ODS. */
  sigmaMin: number;
  /** Fracción del tercer mejor ODS para los no publicados [mín, máx]. */
  fraccionNoPublicado: [number, number];
  sorteos: number;
  semilla: number;
}

export const SUPUESTOS_BASE: Supuestos = { k: 1, rigor: 0.9, deriva: 2, sigmaMin: 2, fraccionNoPublicado: [0.6, 1], sorteos: 4000, semilla: 2027 };

export interface OdsEscenario {
  sdg: number;
  /** ¿Se envía en 2027? (el 17 siempre). */
  enviado: boolean;
  /** Δ de evidencia en puntos del ODS (sin k ni rigor). */
  deltaEvidencia: number;
}

export interface LineaBaseOds {
  sdg: number;
  /** Rango publicado 2026 (null = no publicado). */
  publicado: Rango | null;
  /** Banda publicada del ODS. */
  banda: string | null;
  /** ¿Es uno de los tres mejores publicados? */
  mejor: boolean;
}

/** La línea base 2026 de los 17 ODS de una universidad. */
export function lineaBase(f: FilaTHE): LineaBaseOds[] {
  return Array.from({ length: 17 }, (_, i) => {
    const sdg = i + 1;
    if (sdg === 17)
      return {
        sdg,
        publicado: f.sdg17_lo !== null && f.sdg17_hi !== null ? { lo: f.sdg17_lo, hi: f.sdg17_hi } : null,
        banda: f.sdg17_rank_label,
        mejor: false,
      };
    const b = f.best.find((x) => x.sdg === sdg);
    return { sdg, publicado: b ? { lo: b.lo, hi: b.hi } : null, banda: b?.rank_label ?? null, mejor: Boolean(b) };
  });
}

/** Los ODS que la UDES envió (al menos): el 17 y los tres publicados. */
export const enviadosPublicados = (f: FilaTHE) => [17, ...f.best.map((b) => b.sdg)];

/** El cambio que se aplica a un ODS: Δevidencia × k × rigor. */
export const cambioOds = (o: Pick<OdsEscenario, "deltaEvidencia">, s: Pick<Supuestos, "k" | "rigor">) => o.deltaEvidencia * s.k * s.rigor;

/** Puntaje esperado (sin sorteo) de un ODS en 2027 y su incertidumbre. */
export function esperadoOds(base: LineaBaseOds, tercero: Rango | null, o: OdsEscenario, s: Supuestos): { centro: number; sigma: number } {
  const d = cambioOds(o, s);
  if (base.publicado) return { centro: entre(centro(base.publicado) + d, 0, 100), sigma: Math.sqrt(sigmaDe(base.publicado, s.sigmaMin) ** 2 + s.deriva ** 2) };
  const t = tercero ? centro(tercero) : 30;
  const [a, b] = s.fraccionNoPublicado;
  const media = t * ((a + b) / 2);
  const sdU = (t * (b - a)) / Math.sqrt(12);
  return { centro: entre(media + d, 0, 100), sigma: Math.sqrt(sdU ** 2 + s.deriva ** 2) };
}

/** F = 0,22 × ODS 17 + 0,26 × los tres mejores (sin el 17) de `enviados`. */
export function puntajeAnual(puntajes: Record<number, number>, enviados: number[]): number {
  const otros = enviados
    .filter((n) => n !== 17)
    .map((n) => puntajes[n] ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 3);
  while (otros.length < 3) otros.push(0);
  return PESO_ODS17 * (puntajes[17] ?? 0) + PESO_MEJOR * (otros[0] + otros[1] + otros[2]);
}

/** ¿El envío es válido para el general? Al menos 4 ODS, el 17 entre ellos. */
export const envioValido = (enviados: number[]) => enviados.includes(17) && new Set(enviados).size >= 4;

/* ---------- Simulación ------------------------------------------------------ */

export interface EntradaModelo {
  udes: FilaTHE;
  /** Las demás universidades colombianas (la UDES se excluye sola). */
  rivales: FilaTHE[];
  ods: OdsEscenario[];
  supuestos: Supuestos;
  cal: CalibracionCompleta;
}

export interface Simulacion {
  n: number;
  /** General publicado 2027 de la UDES, por sorteo. */
  general: Float64Array;
  /** rank_lo de su banda mundial, por sorteo. */
  bandaLo: Int32Array;
  /** Puesto en Colombia por puntaje (1 + las que sacan más). */
  puestoPuntaje: Int32Array;
  /** Puesto en Colombia por banda (1 + las que quedan en una banda mejor; empates comparten). */
  puestoBanda: Int32Array;
  /** Año 2027 de cada ODS enviado, por sorteo. */
  ods: Record<number, Float64Array>;
  /** Banda 2026 publicada de la UDES. */
  bandaActual: { label: string; rank_lo: number };
  /** Etiquetas de banda por rank_lo. */
  etiquetas: Map<number, string>;
  enviados: number[];
  valido: boolean;
}

export function simular(e: EntradaModelo): Simulacion {
  const s = e.supuestos;
  const r = prng(s.semilla);
  const n = Math.max(1, Math.round(s.sorteos));
  const base = lineaBase(e.udes);
  const publicados = enviadosPublicados(e.udes);
  const enviados = [...new Set([17, ...e.ods.filter((o) => o.enviado).map((o) => o.sdg)])].sort((a, b) => a - b);
  const valido = envioValido(enviados);
  const cambio: Record<number, number> = {};
  for (const o of e.ods) cambio[o.sdg] = cambioOds(o, s);
  const tercero = e.udes.best.length ? e.udes.best.reduce((m, b) => (b.lo + b.hi < m.lo + m.hi ? b : m), e.udes.best[0]) : null;
  const rivales = e.rivales.filter((f) => !esUdes(f) && f.iid !== e.udes.iid);

  const out: Simulacion = {
    n,
    general: new Float64Array(n),
    bandaLo: new Int32Array(n),
    puestoPuntaje: new Int32Array(n),
    puestoBanda: new Int32Array(n),
    ods: Object.fromEntries(enviados.map((x) => [x, new Float64Array(n)])),
    bandaActual: { label: e.udes.rank_label, rank_lo: e.udes.rank_lo },
    etiquetas: new Map(),
    enviados,
    valido,
  };

  const b0: Record<number, number> = {};
  const b1: Record<number, number> = {};
  for (let i = 0; i < n; i++) {
    // 1. General 2026 de la UDES.
    const o26 = e.udes.overall_lo + r() * (e.udes.overall_hi - e.udes.overall_lo);
    // 2. Línea base de los ODS publicados, luego la de los no publicados.
    for (const lb of base) {
      if (!lb.publicado) continue;
      b0[lb.sdg] = entre(centro(lb.publicado) + sigmaDe(lb.publicado, s.sigmaMin) * normal(r), 0, 100);
    }
    const t = tercero ? b0[tercero.sdg] : 30;
    for (const lb of base) {
      if (lb.publicado) continue;
      const [a, b] = s.fraccionNoPublicado;
      b0[lb.sdg] = t * (a + r() * (b - a));
    }
    // 3. Año 2027 de cada ODS (sin la deriva, que va al total; para las metas por ODS, con su propia deriva).
    for (let sdg = 1; sdg <= 17; sdg++) b1[sdg] = entre(b0[sdg] + (cambio[sdg] ?? 0), 0, 100);
    for (const x of enviados) out.ods[x][i] = entre(b1[x] + s.deriva * normal(r), 0, 100);
    // 4. Puntaje del año, anclado al general 2026.
    const f26 = puntajeAnual(b0, publicados);
    const f27 = valido ? puntajeAnual(b1, enviados) : 0;
    const y27 = valido ? o26 + (f27 - f26) + s.deriva * normal(r) : 0;
    // 5. General publicado 2027.
    const g = valido ? (o26 + y27) / 2 : 0;
    out.general[i] = g;
    const u = ubicar(e.cal.general, g);
    out.bandaLo[i] = u.rank_lo;
    out.etiquetas.set(u.rank_lo, u.label);
    // 6. Rivales.
    let porPuntaje = 1;
    let porBanda = 1;
    for (const f of rivales) {
      const r26 = f.overall_lo + r() * (f.overall_hi - f.overall_lo);
      const gr = (r26 + (r26 + s.deriva * normal(r))) / 2;
      if (gr > g) porPuntaje++;
      if (ubicar(e.cal.general, gr).rank_lo < u.rank_lo) porBanda++;
    }
    out.puestoPuntaje[i] = porPuntaje;
    out.puestoBanda[i] = porBanda;
  }
  return out;
}

/* ---------- Lectura de la simulación -------------------------------------- */

/** Cuantil q (0..1) de una muestra. */
export function cuantil(xs: ArrayLike<number>, q: number): number {
  const a = Array.from(xs).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const p = entre(q, 0, 1) * (a.length - 1);
  const i = Math.floor(p);
  return a[i] + (a[Math.min(i + 1, a.length - 1)] - a[i]) * (p - i);
}

export const media = (xs: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return xs.length ? s / xs.length : NaN;
};

const fraccion = (n: number, pred: (i: number) => boolean) => {
  let c = 0;
  for (let i = 0; i < n; i++) if (pred(i)) c++;
  return c / n;
};

/** Probabilidad de cada banda mundial, de la mejor a la peor. */
export function probBandas(sim: Simulacion): { rank_lo: number; label: string; p: number }[] {
  const c = new Map<number, number>();
  for (let i = 0; i < sim.n; i++) c.set(sim.bandaLo[i], (c.get(sim.bandaLo[i]) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => a[0] - b[0]).map(([rank_lo, k]) => ({ rank_lo, label: sim.etiquetas.get(rank_lo) ?? String(rank_lo), p: k / sim.n }));
}

/** Las metas que se pueden evaluar. «Destacar» lo decide quien usa la pantalla. */
export type Meta =
  | { tipo: "subir" }
  | { tipo: "banda"; rank_lo: number }
  | { tipo: "colombia"; top: number; criterio: "banda" | "puntaje" }
  | { tipo: "ods"; sdg: number; rank_lo: number }
  | { tipo: "puntaje"; minimo: number };

/**
 * Probabilidad de una meta.
 *   subir     quedar en una banda mejor que la de 2026;
 *   banda     quedar en esa banda o mejor (rank_lo ≤ el de la meta);
 *   colombia  quedar entre las `top` primeras de Colombia: por banda, una
 *             empatada en la banda del puesto `top` cuenta (comparte el puesto);
 *             por puntaje, un sorteo continuo no empata;
 *   ods       ese ODS en esa banda o mejor, con la curva del ODS;
 *   puntaje   general publicado 2027 de al menos `minimo`.
 */
export function probMeta(sim: Simulacion, meta: Meta, cal: CalibracionCompleta): number {
  if (!sim.valido) return 0;
  switch (meta.tipo) {
    case "subir":
      return fraccion(sim.n, (i) => sim.bandaLo[i] < sim.bandaActual.rank_lo);
    case "banda":
      return fraccion(sim.n, (i) => sim.bandaLo[i] <= meta.rank_lo);
    case "colombia":
      return fraccion(sim.n, (i) => (meta.criterio === "banda" ? sim.puestoBanda[i] : sim.puestoPuntaje[i]) <= meta.top);
    case "puntaje":
      return fraccion(sim.n, (i) => sim.general[i] >= meta.minimo);
    case "ods": {
      const xs = sim.ods[meta.sdg];
      if (!xs) return 0;
      return fraccion(sim.n, (i) => ubicar(cal.ods[meta.sdg], xs[i]).rank_lo <= meta.rank_lo);
    }
  }
}

export interface Resumen {
  media: number;
  p10: number;
  p90: number;
  bandas: { rank_lo: number; label: string; p: number }[];
  subir: number;
  bajar: number;
  quedarse: number;
  /** Posición en Colombia por puntaje: media y rango al 80 %. */
  puesto: { media: number; p10: number; p90: number };
  puestoBanda: { media: number; p10: number; p90: number };
  top: Record<3 | 5 | 10, { banda: number; puntaje: number }>;
}

export function resumir(sim: Simulacion, cal: CalibracionCompleta): Resumen {
  const top = {} as Resumen["top"];
  for (const t of [3, 5, 10] as const)
    top[t] = { banda: probMeta(sim, { tipo: "colombia", top: t, criterio: "banda" }, cal), puntaje: probMeta(sim, { tipo: "colombia", top: t, criterio: "puntaje" }, cal) };
  return {
    media: media(sim.general),
    p10: cuantil(sim.general, 0.1),
    p90: cuantil(sim.general, 0.9),
    bandas: probBandas(sim),
    subir: fraccion(sim.n, (i) => sim.bandaLo[i] < sim.bandaActual.rank_lo),
    bajar: fraccion(sim.n, (i) => sim.bandaLo[i] > sim.bandaActual.rank_lo),
    quedarse: fraccion(sim.n, (i) => sim.bandaLo[i] === sim.bandaActual.rank_lo),
    puesto: { media: media(sim.puestoPuntaje), p10: cuantil(sim.puestoPuntaje, 0.1), p90: cuantil(sim.puestoPuntaje, 0.9) },
    puestoBanda: { media: media(sim.puestoBanda), p10: cuantil(sim.puestoBanda, 0.1), p90: cuantil(sim.puestoBanda, 0.9) },
    top,
  };
}

/** Histograma de una muestra en cubos de `ancho` puntos. */
export function histograma(xs: ArrayLike<number>, ancho = 0.5): { desde: number; hasta: number; n: number }[] {
  if (!xs.length) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    lo = Math.min(lo, xs[i]);
    hi = Math.max(hi, xs[i]);
  }
  const a = Math.floor(lo / ancho) * ancho;
  const m = Math.max(1, Math.ceil((hi - a) / ancho + 1e-9));
  const cubos = Array.from({ length: m }, (_, i) => ({ desde: a + i * ancho, hasta: a + (i + 1) * ancho, n: 0 }));
  for (let i = 0; i < xs.length; i++) cubos[Math.min(m - 1, Math.floor((xs[i] - a) / ancho))].n++;
  return cubos;
}

/** Redondea una probabilidad a 5 % (nada de falsa precisión): «≈ 35 %», «< 5 %», «> 95 %». */
export function textoProb(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.025) return "< 5 %";
  if (p > 0.975) return "> 95 %";
  return `≈ ${Math.round(p * 20) * 5} %`;
}
