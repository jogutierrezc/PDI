/* =============================================================================
   UI GreenMetric · cálculos de la guía (puros).

   · Las razones de cada indicador con sus entradas, que pueden venir de OTRAS
     preguntas (p. ej. SI1 usa 1.5 y 1.6). La base repite en SQL solo los siete
     indicadores calculados (ugm_calculados, 0210); estas funciones sirven al
     formulario para mostrar el resultado mientras se escribe.
   · Las bandas 1–5 del Apéndice 1 y la estimación interna de puntos (USO
     INTERNO de la administración: la web pública no muestra puntos ni pesos).
   · «Cuál manda»: el valor de una tabla de Datos de Sostenibilidad frente al
     escrito a mano.

   Población del campus = 1.11 (estudiantes regulares) + 1.13 (personal). Los
   estudiantes en línea (1.12) no cuentan.
   ========================================================================== */

import type { Bandas, CalculadoUgm, CategoriaId, EstadoRespuesta, FilaTabla, PreguntaCatalogo, RespuestaUgm, ValorCampo, VinculoDato } from "./tipos";

export type RespuestaLigera = Pick<RespuestaUgm, "valores" | "tablas" | "opcion"> & Partial<Pick<RespuestaUgm, "estado">>;
export type RespuestasPorQ = Record<string, RespuestaLigera | undefined>;

const esNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Convierte lo que escribe una persona («1.234,5», «12 %») en número, o null. */
export function aNumero(v: unknown): number | null {
  if (esNum(v)) return v;
  if (typeof v !== "string") return null;
  const t = v.replace(/[%\s]/g, "");
  if (!t) return null;
  // Coma decimal si hay una sola coma y ningún punto después; si no, los puntos son miles.
  const normal = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : /^-?\d+,\d+$/.test(t) ? t.replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Promedio de los años 1–3 que estén escritos (para las preguntas «de tres años»). */
export function promedioTresAnios(valores: Record<string, ValorCampo> | undefined): number | null {
  const xs = ["y1", "y2", "y3"].map((k) => valores?.[k]).filter(esNum);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Banda 1–5 de un valor. asc: x ≤ c0 → 1 … > c3 → 5. desc: x ≥ c0 → 1 … ≤ c3 → 5. */
export function banda(valor: number | null | undefined, bandas: Bandas | null): number | null {
  if (!esNum(valor) || !bandas) return null;
  const c = bandas.cortes;
  if (bandas.sentido === "desc") return valor >= c[0] ? 1 : valor > c[1] ? 2 : valor > c[2] ? 3 : valor > c[3] ? 4 : 5;
  return valor <= c[0] ? 1 : valor <= c[1] ? 2 : valor <= c[2] ? 3 : valor <= c[3] ? 4 : 5;
}

/** Opción 1–5 por el número de ODS que apoyan los programas (1–2, 3–5, 6–9, 10–13, 14–17). */
export function bandaPorOds(n: number): number | null {
  return n <= 0 ? null : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : n <= 13 ? 4 : 5;
}

export const listaOds = (valores: Record<string, ValorCampo> | undefined): number[] => {
  const v = valores?.ods;
  return Array.isArray(v) ? [...new Set(v.filter((n): n is number => esNum(n) && n >= 1 && n <= 17))].sort((a, b) => a - b) : [];
};

/* --- Entradas de un cálculo --------------------------------------------------------------------- */

function sumaTabla(filas: FilaTabla[] | undefined, columna: string, condicion?: (f: FilaTabla) => boolean): number | null {
  if (!filas?.length) return null;
  let suma = 0;
  let hay = false;
  for (const f of filas) {
    if (condicion && !condicion(f)) continue;
    const n = aNumero(f[columna]);
    if (n !== null) {
      suma += n;
      hay = true;
    }
  }
  return hay ? suma : null;
}

/**
 * Lee una entrada. Formas: «1.5.valor», «6.5.promedio», «poblacion», «own.area»,
 * «own.<tabla>.<col>.suma» y «own.<tabla>.<col>.suma_si.<col2>>=<n>».
 */
export function leerEntrada(desde: string, propia: RespuestaLigera | undefined, todas: RespuestasPorQ): number | null {
  if (desde === "poblacion") {
    const a = leerEntrada("1.11.valor", undefined, todas);
    const b = leerEntrada("1.13.valor", undefined, todas);
    return a === null || b === null ? null : a + b;
  }
  if (desde.startsWith("own.")) {
    const partes = desde.slice(4).split(".");
    if (partes.length === 1) return aNumero(propia?.valores[partes[0]]);
    const [tabla, columna, op, ...resto] = partes;
    const filas = propia?.tablas[tabla];
    if (op === "suma") return sumaTabla(filas, columna);
    if (op === "suma_si") {
      const m = resto.join(".").match(/^([a-z_]+)>=(\d+(?:\.\d+)?)$/);
      if (!m) return null;
      return sumaTabla(filas, columna, (f) => (aNumero(f[m[1]]) ?? -Infinity) >= Number(m[2]));
    }
    return null;
  }
  const m = desde.match(/^(\d+\.\d+)\.(.+)$/);
  if (!m) return null;
  const r = todas[m[1]];
  if (!r) return null;
  if (m[2] === "promedio") return promedioTresAnios(r.valores);
  return aNumero(r.valores[m[2]]);
}

/* --- Fórmulas ------------------------------------------------------------------------------------ */

type Entradas = Record<string, number | null>;
interface Formula {
  fn: (e: Entradas) => number | null;
  texto: string;
}
const razon = (a: number | null, b: number | null, k = 1): number | null => (a !== null && b !== null && b > 0 ? (a / b) * k : null);
const porcentaje: Formula["fn"] = (e) => razon(e.a, e.b, 100);

/** Las fórmulas de la guía por código de indicador. */
const FORMULAS: Record<string, Formula> = {
  SI1: { fn: (e) => (e.a !== null && e.b !== null && e.a > 0 ? ((e.a - e.b) / e.a) * 100 : null), texto: "((1.5 − 1.6) ÷ 1.5) × 100" },
  SI2: { fn: porcentaje, texto: "área forestal ÷ área total del campus (1.5) × 100" },
  SI3: { fn: porcentaje, texto: "área plantada ÷ área total del campus (1.5) × 100" },
  SI4: { fn: (e) => (e.a !== null && e.b !== null && e.p !== null && e.p > 0 ? (e.a - e.b) / e.p : null), texto: "(1.5 − 1.6) ÷ (1.11 + 1.13)" },
  EC1: { fn: porcentaje, texto: "aparatos eficientes ÷ total de aparatos × 100" },
  EC2: { fn: porcentaje, texto: "área de edificios con 5 requisitos o más ÷ área construida (1.7) × 100" },
  EC4: { fn: (e) => razon(e.a, e.p), texto: "2.6 ÷ (1.11 + 1.13)" },
  EC5: { fn: porcentaje, texto: "producción renovable (2.5) ÷ consumo de electricidad (2.6) × 100" },
  EC8: { fn: (e) => razon(e.a, e.p), texto: "2.11 ÷ (1.11 + 1.13)" },
  WR1: { fn: porcentaje, texto: "área de absorción ÷ área total del campus (1.5) × 100" },
  WR4: { fn: porcentaje, texto: "aparatos eficientes en agua ÷ total × 100" },
  WR5: { fn: porcentaje, texto: "agua tratada consumida ÷ agua consumida de todas las fuentes × 100" },
  TR1: { fn: (e) => (e.a !== null && e.b !== null && e.c !== null ? razon(e.a + e.b + e.c, e.p) : null), texto: "(5.1 + 5.2 + 5.3) ÷ (1.11 + 1.13)" },
  TR4: { fn: (e) => razon(e.a, e.p), texto: "5.10 ÷ (1.11 + 1.13)" },
  TR5: { fn: porcentaje, texto: "área de estacionamiento (5.12) ÷ área total del campus (1.5) × 100" },
  ED1: { fn: porcentaje, texto: "6.1 ÷ 6.2 × 100" },
  ED2: { fn: porcentaje, texto: "promedio de 6.5 ÷ promedio de 6.6 × 100" },
  ED3: { fn: (e) => razon(e.a, e.b), texto: "publicaciones (6.9) ÷ docentes e investigadores (6.8)" },
  ED10: { fn: porcentaje, texto: "egresados con empleo verde (6.17) ÷ total de egresados (6.18) × 100" },
  GD1: { fn: porcentaje, texto: "promedio de 7.2 ÷ promedio de 7.1 × 100" },
  GD8: { fn: porcentaje, texto: "mujeres líderes (7.16) ÷ total de líderes (7.15) × 100" },
};

export interface ResultadoCalculo {
  id: string;
  valor: number | null;
  unidad: string;
  /** Banda 1–5 (USO INTERNO). */
  opcion: number | null;
  formula: string;
  entradas: Entradas;
  /** Las entradas que aún no tienen dato. */
  faltan: string[];
}

/** Calcula la razón de una pregunta con `esquema.calculo`. Nulo si la pregunta no se calcula. */
export function calcularPregunta(pregunta: PreguntaCatalogo, propia: RespuestaLigera | undefined, todas: RespuestasPorQ): ResultadoCalculo | null {
  const c = pregunta.esquema.calculo;
  if (!c) return null;
  const f = FORMULAS[c.id];
  if (!f) return null;
  const entradas: Entradas = {};
  const faltan: string[] = [];
  for (const e of c.entradas) {
    const v = leerEntrada(e.desde, propia, todas);
    entradas[e.k] = v;
    if (v === null) faltan.push(e.desde);
  }
  const valor = faltan.length ? null : f.fn(entradas);
  return { id: c.id, valor, unidad: c.unidad, opcion: banda(valor, pregunta.bandas), formula: f.texto, entradas, faltan };
}

/**
 * La opción 1–5 de una pregunta: la de las bandas (razones y ED4), el conteo de ODS (impacto) o la que eligió la persona.
 * `calculo` es el resultado de calcularPregunta si lo hay.
 */
export function opcionDe(pregunta: PreguntaCatalogo, respuesta: RespuestaLigera | undefined, calculo: ResultadoCalculo | null): number | null {
  if (calculo) return calculo.opcion;
  if (pregunta.tipo === "impacto_ods") return bandaPorOds(listaOds(respuesta?.valores).length);
  if (pregunta.bandas) return banda(promedioTresAnios(respuesta?.valores), pregunta.bandas);
  return respuesta?.opcion ?? null;
}

/** Calcula todas las preguntas con cálculo del catálogo. */
export function calcularTodas(preguntas: readonly PreguntaCatalogo[], respuestas: RespuestasPorQ): Map<string, ResultadoCalculo> {
  const out = new Map<string, ResultadoCalculo>();
  for (const p of preguntas) {
    const r = calcularPregunta(p, respuestas[p.q], respuestas);
    if (r) out.set(p.q, r);
  }
  return out;
}

/* --- Estimación interna de puntos (USO INTERNO) ------------------------------------------------------ */

/** Factor × puntos del indicador para una opción 1–5. Nulo si la pregunta no puntúa. */
export function puntosEstimados(pregunta: Pick<PreguntaCatalogo, "puntos" | "factores">, opcion: number | null): number | null {
  if (!pregunta.puntos || !pregunta.factores || opcion === null || opcion < 1 || opcion > 5) return null;
  return Math.round(pregunta.factores[opcion - 1] * pregunta.puntos * 100) / 100;
}

export interface AvanceCategoria {
  categoria: CategoriaId;
  estimados: number;
  maximos: number;
  /** Indicadores con puntos que ya tienen opción. */
  conOpcion: number;
  indicadores: number;
}

/**
 * Estimación por categoría con lo que hay hoy. `soloAprobadas` cuenta solo respuestas aprobadas (y los calculados que
 * la base ya resolvió). Es para priorizar: el puntaje oficial lo asigna UI GreenMetric tras su revisión.
 */
export function estimarAvance(
  preguntas: readonly PreguntaCatalogo[],
  respuestas: Record<string, (RespuestaLigera & { estado?: EstadoRespuesta }) | undefined>,
  calculadosBase: readonly CalculadoUgm[] = [],
  soloAprobadas = false,
): AvanceCategoria[] {
  const calculos = calcularTodas(preguntas, respuestas);
  const base = new Map(calculadosBase.map((c) => [c.q, c]));
  const out = new Map<CategoriaId, AvanceCategoria>();
  for (const p of preguntas) {
    if (!p.puntos) continue;
    const a = out.get(p.categoria) ?? { categoria: p.categoria, estimados: 0, maximos: 0, conOpcion: 0, indicadores: 0 };
    a.maximos += p.puntos;
    a.indicadores += 1;
    const r = respuestas[p.q];
    let opcion: number | null;
    if (p.calculada) opcion = base.get(p.q)?.opcion ?? calculos.get(p.q)?.opcion ?? null;
    else if (soloAprobadas && r?.estado !== "aprobado") opcion = null;
    else opcion = opcionDe(p, r, calculos.get(p.q) ?? null);
    const pts = puntosEstimados(p, opcion);
    if (pts !== null) {
      a.estimados += pts;
      a.conOpcion += 1;
    }
    out.set(p.categoria, a);
  }
  return [...out.values()];
}

/* --- Cuál manda: la tabla o lo escrito a mano ---------------------------------------------------------- */

export interface DecisionManda {
  manda: "tabla" | "manual";
  /** El valor que se usa. */
  valor: number | null;
  valorTabla: number | null;
  valorManual: number | null;
  /** El campo no se edita (manda la tabla). */
  soloLectura: boolean;
  /** Lo escrito a mano y la tabla dan distinto: ofrecer «Usar la de la tabla». */
  ofrecerTabla: boolean;
  /** Hay un vínculo conectado pero la tabla no da dato (columna vacía, sin ese año…). */
  sinDatoEnTabla: boolean;
  /** La tabla conectada no está publicada: el indicador no puede salir en la web. */
  tablaSinPublicar: boolean;
}

export function quienManda(vinculo: VinculoDato | undefined, valorManual: number | null): DecisionManda {
  const valorTabla = vinculo?.dato?.valor ?? null;
  if (!vinculo) {
    return { manda: "manual", valor: valorManual, valorTabla: null, valorManual, soloLectura: false, ofrecerTabla: false, sinDatoEnTabla: false, tablaSinPublicar: false };
  }
  const tablaSinPublicar = vinculo.modo === "conectado" && !vinculo.publicada;
  if (vinculo.modo === "conectado") {
    return {
      manda: valorTabla !== null ? "tabla" : "manual",
      valor: valorTabla !== null ? valorTabla : valorManual,
      valorTabla,
      valorManual,
      soloLectura: valorTabla !== null,
      ofrecerTabla: false,
      sinDatoEnTabla: valorTabla === null,
      tablaSinPublicar,
    };
  }
  return {
    manda: "manual",
    valor: valorManual,
    valorTabla,
    valorManual,
    soloLectura: false,
    ofrecerTabla: valorTabla !== null && valorManual !== valorTabla,
    sinDatoEnTabla: false,
    tablaSinPublicar: false,
  };
}

/* --- Formato ---------------------------------------------------------------------------------------------- */

export function formatearNumero(v: number | null | undefined, decimales = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : new Intl.NumberFormat("es-CO", { maximumFractionDigits: decimales }).format(v);
}

/** Lo que se escribe en la plantilla: «26.500 ÷ 100.000 × 100 = 26,5 %». */
export function textoDelCalculo(r: ResultadoCalculo | null): string {
  if (!r || r.valor === null) return "";
  const dec = r.unidad === "%" ? 2 : 4;
  return `${r.formula} = ${formatearNumero(r.valor, dec)} ${r.unidad}`.trim();
}
