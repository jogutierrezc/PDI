/* =============================================================================
   Portal de alertas · lo que se estima (lógica pura).

   Tres cosas, siempre rotuladas como estimación en pantalla:
   1. Las notas de los cortes que todavía no existen (P2, P3 o la nota final), a partir de las
      notas previas de la misma persona (o del mismo grupo).
   2. El promedio del próximo periodo, con una banda del 80 %.
   3. La probabilidad de desertar, con el modelo de regresión logística del estudio de la UDES
      (Pérez et al., 2023, Tabla 2, cohortes 2017 a 2020, 4.900 casos). Solo usa lo que el
      Warehouse tiene (facultad, promedio, grupo etario y origen); estrato y trabajo quedan en su
      categoría de referencia.
   Nada de esto es una predicción de una persona: es una asociación entre cohortes.
   ========================================================================== */

import type { CorteRiesgo, FilaRiesgo, Nivel } from "../monitor/logica";

export const acota = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const media = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const suma = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const desviacion = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = media(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
/** Pendiente de la recta por mínimos cuadrados de una serie con pasos iguales. */
export const pendiente = (a: number[]) => {
  const mx = (a.length - 1) / 2;
  const my = media(a);
  let n = 0;
  let d = 0;
  a.forEach((v, i) => {
    n += (i - mx) * (v - my);
    d += (i - mx) ** 2;
  });
  return d ? n / d : 0;
};
/** Probabilidad acumulada de la normal estándar (aproximación de Abramowitz y Stegun). */
export const normal = (z: number) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};

/** Valor de la banda del 80 % para una desviación. */
const Z80 = 1.28;

/* --- 1. Notas de cortes que faltan ------------------------------------------------------------ */

export interface Banda {
  bajo: number;
  alto: number;
}

export interface CortesCompletos {
  /** P1, P2, P3: la nota real o la estimada. */
  valores: (number | null)[];
  estimado: boolean[];
  bandas: (Banda | null)[];
  /** La nota final: la real, o el promedio de los tres cortes cuando todavía no llega. */
  final: number | null;
  finalEstimado: boolean;
  bandaFinal: Banda | null;
}

/**
 * Completa P1, P2 y P3 de una persona. Cada corte que falta se estima desde el anterior (con la
 * mitad de su tendencia) mezclado con el promedio del periodo anterior; la banda crece con cada
 * paso. Sin ninguna nota no se estima nada.
 */
export function completarCortes(p: (number | null)[], anterior: number | null, final: number | null): CortesCompletos {
  const valores = [...p];
  const estimado = [false, false, false];
  const bandas: (Banda | null)[] = [null, null, null];
  const ultimo = p.reduce<number>((k, v, i) => (v !== null ? i : k), -1);
  if (ultimo >= 0) {
    for (let i = ultimo + 1; i < 3; i++) {
      const previo = valores[i - 1] as number;
      const antes = i >= 2 ? valores[i - 2] : null;
      const tendencia = antes !== null ? previo - antes : 0;
      const v = acota(0.6 * (previo + 0.5 * tendencia) + 0.4 * (0.5 * previo + 0.5 * (anterior ?? previo)), 1, 5);
      const sd = 0.32 * 1.15 ** (i - ultimo - 1);
      valores[i] = v;
      estimado[i] = true;
      bandas[i] = { bajo: acota(v - Z80 * sd, 1, 5), alto: acota(v + Z80 * sd, 1, 5) };
    }
  }
  const completos = valores.filter((v): v is number => v !== null);
  const nEst = estimado.filter(Boolean).length;
  if (final !== null && final > 0) return { valores, estimado, bandas, final, finalEstimado: false, bandaFinal: null };
  if (completos.length === 0) return { valores, estimado, bandas, final: null, finalEstimado: false, bandaFinal: null };
  const f = media(completos);
  const sd = 0.1 + 0.2 * Math.sqrt(nEst);
  return { valores, estimado, bandas, final: f, finalEstimado: true, bandaFinal: { bajo: acota(f - Z80 * sd, 1, 5), alto: acota(f + Z80 * sd, 1, 5) } };
}

/** Una nota suelta de una materia: si falta P3 se estima con P1, P2 y el promedio anterior de la persona. */
export function completarMateria(p1: number | null, p2: number | null, p3: number | null, anterior: number | null) {
  const c = completarCortes([p1, p2, p3], anterior, null);
  return { valores: c.valores, estimado: c.estimado };
}

/* --- 2. El promedio del próximo periodo --------------------------------------------------------- */

export interface Proyeccion {
  mu: number;
  sd: number;
  bajo: number;
  alto: number;
  /** Probabilidad de cerrar por debajo de 3,2 (periodo de prueba). */
  pPrueba: number;
}

export const PRUEBA = 3.2;

/**
 * El promedio del próximo periodo: la tendencia de los últimos cuatro, suavizada a la mitad, y la
 * variación propia como ancho de la banda del 80 %. Con un solo periodo se mezcla con el promedio
 * de partida (3,4). `d` mueve el resultado (escenarios).
 */
export function proyectarPromedio(promedios: number[], d = 0): Proyeccion | null {
  if (promedios.length === 0) return null;
  let mu: number;
  let sd: number;
  if (promedios.length >= 2) {
    const w = promedios.slice(-4);
    mu = w[w.length - 1] + pendiente(w) * 0.5;
    sd = Math.max(0.2, desviacion(w.slice(1).map((x, i) => x - w[i])) || 0.25);
  } else {
    mu = 0.7 * promedios[0] + 0.3 * 3.4;
    sd = 0.35;
  }
  mu = acota(mu + d, 1.5, 4.9);
  return { mu, sd, bajo: acota(mu - Z80 * sd, 1, 5), alto: acota(mu + Z80 * sd, 1, 5), pPrueba: normal((PRUEBA - mu) / sd) };
}

/* --- 3. El modelo de deserción del estudio ------------------------------------------------------ */

export const MODELO = {
  constante: -3.47,
  promedioBajo: 2.814,
  promedioMedio: 0.792,
  edad2125: 1.12,
  edad26: 1.634,
  fuera: 0.305,
  casos: 4900,
  nagelkerke: 0.272,
  acierto: 79.9,
} as const;

/** Las facultades del estudio (referencia: Agrícolas) y su peso. Se reconocen por el nombre. */
const FACULTADES_ESTUDIO: { patron: RegExp; nombre: string; b: number }[] = [
  { patron: /ECONOM|ADMINISTRA|CONTAB|NEGOCIO/, nombre: "Económicas", b: 0.75 },
  { patron: /INGENIER/, nombre: "Ingeniería", b: 0.387 },
  { patron: /SOCIAL|DERECHO|HUMAN|EDUCACION|POLITIC/, nombre: "Sociales", b: 0.5 },
  { patron: /TECNOLOG/, nombre: "Centro de estudios tecnológicos", b: 0.603 },
  { patron: /SALUD|MEDIC|ENFERM/, nombre: "Salud", b: -0.074 },
  { patron: /NATURAL|EXACTAS|BASICA/, nombre: "Naturales", b: -0.043 },
];

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export function pesoFacultad(nombre: string | null | undefined): { b: number; equivale: string | null } {
  const t = sinTildes(nombre ?? "");
  const f = FACULTADES_ESTUDIO.find((x) => x.patron.test(t));
  return f ? { b: f.b, equivale: f.nombre } : { b: 0, equivale: null };
}

export interface Factores {
  facultad: string | null;
  promedio: number;
  /** «≤20», «21–25» o «26+» (lo deriva el Warehouse). */
  etario: string | null;
  /** «Santander» u «Otro departamento». */
  origen: string | null;
}

export interface LineaFactor {
  factor: string;
  /** El peso B del modelo; 0 es la categoría de referencia. */
  peso: number;
  nota?: string;
}

export const bandaDePromedio = (p: number): "bajo" | "medio" | "alto" => (p < 3.3 ? "bajo" : p <= 4.3 ? "medio" : "alto");
const pesoEtario = (e: string | null) => (e && e.includes("26") ? MODELO.edad26 : e && e.includes("21") ? MODELO.edad2125 : 0);
const pesoOrigen = (o: string | null) => (o && o !== "Santander" ? MODELO.fuera : 0);

export function lineasDelModelo(f: Factores): LineaFactor[] {
  const banda = bandaDePromedio(f.promedio);
  const fac = pesoFacultad(f.facultad);
  return [
    { factor: `Promedio ${banda === "bajo" ? "bajo (menor de 3,3)" : banda === "medio" ? "medio (3,3 a 4,3)" : "alto (más de 4,3)"}`, peso: banda === "bajo" ? MODELO.promedioBajo : banda === "medio" ? MODELO.promedioMedio : 0 },
    { factor: `Facultad: ${f.facultad ?? "sin dato"}`, peso: fac.b, nota: fac.equivale ? `equivale a ${fac.equivale} del estudio` : "no equivale a una del estudio: referencia" },
    { factor: `Grupo de edad: ${f.etario ?? "sin dato"}`, peso: pesoEtario(f.etario), nota: f.etario ? undefined : "sin dato: referencia" },
    { factor: `Origen: ${f.origen ?? "sin dato"}`, peso: pesoOrigen(f.origen), nota: f.origen ? undefined : "sin dato: referencia" },
    { factor: "Estrato y trabajo", peso: 0, nota: "no están en el Warehouse: referencia" },
  ];
}

/** Probabilidad de desertar según el modelo del estudio: 1 / (1 + e^-Z), con Z = constante + pesos. */
export function riesgoDesercion(f: Factores, promedio = f.promedio): number {
  const z = MODELO.constante + lineasDelModelo({ ...f, promedio }).reduce((s, l) => s + l.peso, 0);
  return 1 / (1 + Math.exp(-z));
}

/** Cuántas veces más probable es desertar frente al promedio alto, según el estudio. */
export const riesgoRelativo = (promedio: number) => (promedio < 3.3 ? 16.7 : promedio <= 4.3 ? 2.2 : 1);

/* --- Escenarios de un programa ------------------------------------------------------------------- */

export type Quien = "rs" | "rsed" | "todos";
export const NOMBRE_QUIEN: Record<Quien, string> = { rs: "quienes requieren seguimiento", rsed: "quienes requieren seguimiento o están en desarrollo", todos: "todos los estudiantes" };

export interface PersonaEscenario {
  nivel: Nivel;
  /** Promedios de sus periodos, del más antiguo al más reciente. */
  promedios: number[];
  factores: Factores;
}

export interface ResultadoEscenario {
  /** Estudiantes que se espera que cierren por debajo de 3,2, con su banda del 80 %. */
  prueba: number;
  pruebaBajo: number;
  pruebaAlto: number;
  /** Deserciones esperadas según el modelo del estudio. */
  deserciones: number;
}

/** ¿Qué pasa si el promedio de un grupo de personas cambia `d`? Recalcula con las proyecciones y el modelo. */
export function escenarioPrograma(personas: PersonaEscenario[], d: number, quien: Quien | null): ResultadoEscenario {
  const aplica = (p: PersonaEscenario) => quien === "todos" || (quien === "rs" && p.nivel === "RS") || (quien === "rsed" && p.nivel !== "NE");
  let prueba = 0;
  let varianza = 0;
  let deserciones = 0;
  for (const p of personas) {
    const delta = quien && aplica(p) ? d : 0;
    const pr = proyectarPromedio(p.promedios, delta);
    if (!pr) continue;
    prueba += pr.pPrueba;
    varianza += pr.pPrueba * (1 - pr.pPrueba);
    const actual = p.promedios[p.promedios.length - 1];
    deserciones += riesgoDesercion(p.factores, actual + delta);
  }
  const sd = Math.sqrt(varianza);
  return { prueba, pruebaBajo: Math.max(0, prueba - Z80 * sd), pruebaAlto: prueba + Z80 * sd, deserciones };
}

/* --- Cortes sin notas en el mapa de riesgo ------------------------------------------------------- */

export interface FilaRiesgoEst extends FilaRiesgo {
  /** Verdadero si la fila no viene de notas: es una estimación. */
  est?: boolean;
}

const tasaDe = (f: FilaRiesgo) => (f.con > 0 ? f.bajo / f.con : 0);

/**
 * Si un corte todavía no tiene notas en el alcance pero uno anterior sí, agrega filas estimadas por
 * grupo: P3 con la tendencia de P1 a P2 (la mitad), y la nota final como el promedio de las tasas de
 * los tres cortes. Solo grupos de plan «tres cortes». Lo estimado queda marcado con `est`.
 */
export function completarRiesgo(filas: FilaRiesgo[]): FilaRiesgoEst[] {
  const hay = (c: CorteRiesgo) => filas.some((f) => f.corte === c);
  const out: FilaRiesgoEst[] = filas.map((f) => ({ ...f }));
  const por = new Map<string, Partial<Record<CorteRiesgo, FilaRiesgo>>>();
  for (const f of filas) {
    if (f.plan !== "tres_cortes") continue;
    const g = por.get(f.grupo_clave) ?? {};
    g[f.corte as CorteRiesgo] = f;
    por.set(f.grupo_clave, g);
  }
  for (const g of por.values()) {
    const p1 = g[1];
    const p2 = g[2];
    const base = p2 ?? p1;
    if (!base) continue;
    let r3: number | null = g[3] ? tasaDe(g[3]) : null;
    if (!hay(3) && !g[3]) {
      const r2 = tasaDe(base);
      const r1 = p1 && p2 ? tasaDe(p1) : r2;
      r3 = acota(r2 + 0.5 * (r2 - r1), 0, 0.95);
      out.push({ ...base, corte: 3, bajo: Math.round(base.con * r3), promedio: null, est: true });
    }
    if (!hay(4) && !g[4] && r3 !== null) {
      const tasas = [p1, p2].filter((x): x is FilaRiesgo => !!x).map(tasaDe).concat(r3);
      out.push({ ...base, corte: 4, bajo: Math.round(base.con * media(tasas)), promedio: null, est: true });
    }
  }
  return out;
}
