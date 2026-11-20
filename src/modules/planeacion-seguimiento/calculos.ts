/* =============================================================================
   Planeación y Seguimiento · cálculos del plan (puros, sin DOM).

   Resumen, filtros, inversión por año y calidad de datos. Las cifras salen de
   las líneas de UNA versión; aquí no hay avances (llegan en fases siguientes).
   ========================================================================== */

import { ANIOS, CAMPUS_LISTA, CAMPUS_TODOS, PRIORIDADES, aniosDe, clavePilar, llano, pilarCodigo, pilarNombre, rotuloCampus, type Linea } from "./modelo";

export const SIN_FUENTE = "Sin definir";
export const SIN_OFICINA = "Sin oficina";
export const EVALUADO = "Evaluado";
export const SIN_EVALUAR = "Sin evaluar";

export const sinEvaluar = (l: Linea): boolean => !l.resultado;
export const sumaMonto = (ls: readonly Linea[]): number => ls.reduce((s, l) => s + (l.monto ?? 0), 0);

/* ---------- Filtros ---------- */

export interface DefFiltro {
  clave: string;
  rotulo: string;
  valor: (l: Linea) => string;
  /** Orden fijo de los valores; sin él, de más a menos líneas. */
  orden?: readonly string[];
  etiqueta?: (v: string) => string;
}

export const FILTROS: DefFiltro[] = [
  { clave: "campus", rotulo: "Campus", valor: (l) => l.campus, orden: CAMPUS_LISTA, etiqueta: rotuloCampus },
  { clave: "pilar", rotulo: "Pilar", valor: (l) => l.pilar, etiqueta: (v) => `${pilarCodigo(v)} · ${pilarNombre(v)}` },
  { clave: "prioridad", rotulo: "Prioridad", valor: (l) => l.prioridad, orden: PRIORIDADES },
  { clave: "clasif", rotulo: "Clasificación", valor: (l) => l.clasif },
  { clave: "fuente", rotulo: "Fuente", valor: (l) => l.fuente ?? SIN_FUENTE },
  { clave: "evaluacion", rotulo: "Evaluación", valor: (l) => (sinEvaluar(l) ? SIN_EVALUAR : EVALUADO), orden: [EVALUADO, SIN_EVALUAR] },
  { clave: "oficina", rotulo: "Oficina", valor: (l) => l.oficina ?? SIN_OFICINA },
];

export type SeleccionFiltros = Record<string, string[]>;

export function opcionesFiltro(def: DefFiltro, lineas: readonly Linea[]): { v: string; n: number; l: string }[] {
  const cuenta = new Map<string, number>();
  for (const l of lineas) cuenta.set(def.valor(l), (cuenta.get(def.valor(l)) ?? 0) + 1);
  let claves = [...cuenta.keys()];
  claves = def.orden ? def.orden.filter((k) => cuenta.has(k)) : claves.sort((a, b) => (cuenta.get(b) ?? 0) - (cuenta.get(a) ?? 0) || a.localeCompare(b, "es"));
  if (def.clave === "pilar") claves.sort((a, b) => clavePilar(a) - clavePilar(b));
  return claves.map((v) => ({ v, n: cuenta.get(v) ?? 0, l: def.etiqueta ? def.etiqueta(v) : v }));
}

export function filtrar(lineas: readonly Linea[], sel: SeleccionFiltros): Linea[] {
  return lineas.filter((l) => FILTROS.every((f) => !sel[f.clave]?.length || sel[f.clave].includes(f.valor(l))));
}

export const totalFiltros = (sel: SeleccionFiltros): number => FILTROS.reduce((a, f) => a + (sel[f.clave]?.length ?? 0), 0);

/** Deja solo lo que existe en los filtros y en las líneas (lo guardado puede venir de otra versión). */
export function sanearSeleccion(sel: unknown, lineas: readonly Linea[]): SeleccionFiltros {
  const salida: SeleccionFiltros = {};
  if (!sel || typeof sel !== "object") return salida;
  for (const f of FILTROS) {
    const v = (sel as Record<string, unknown>)[f.clave];
    if (!Array.isArray(v)) continue;
    const validos = new Set(lineas.map(f.valor));
    const lista = v.filter((x): x is string => typeof x === "string" && validos.has(x));
    if (lista.length) salida[f.clave] = lista;
  }
  return salida;
}

/* ---------- Totales ---------- */

export interface Reparto {
  clave: string;
  etiqueta: string;
  n: number;
  monto: number;
}

export function repartir(lineas: readonly Linea[], clave: (l: Linea) => string, etiqueta: (k: string) => string = (k) => k, orden?: readonly string[]): Reparto[] {
  const m = new Map<string, Reparto>();
  for (const l of lineas) {
    const k = clave(l);
    const r = m.get(k) ?? { clave: k, etiqueta: etiqueta(k), n: 0, monto: 0 };
    r.n += 1;
    r.monto += l.monto ?? 0;
    m.set(k, r);
  }
  const lista = [...m.values()];
  return orden ? [...orden.filter((k) => m.has(k)).map((k) => m.get(k)!), ...lista.filter((r) => !orden.includes(r.clave))] : lista.sort((a, b) => b.monto - a.monto);
}

/** Inversión programada por año: monto de la línea × su porcentaje de ese año (solo evaluadas, que son las que lo traen). */
export function inversionPorAnio(lineas: readonly Linea[], anios: number[] = ANIOS): { anio: number; monto: number; parte: number }[] {
  const vals = anios.map((a) => lineas.reduce((s, l) => s + (l.monto ?? 0) * (l.pct[String(a)] ?? 0), 0));
  const total = vals.reduce((a, b) => a + b, 0);
  return anios.map((anio, i) => ({ anio, monto: vals[i], parte: total ? vals[i] / total : 0 }));
}

export interface Resumen {
  n: number;
  monto: number;
  evaluados: number;
  montoEvaluado: number;
  sinEvaluar: number;
  montoSinEvaluar: number;
  conOficina: number;
  porCampus: Reparto[];
  porPilar: Reparto[];
  porPrioridad: Reparto[];
  porFuente: Reparto[];
  porAnio: { anio: number; monto: number; parte: number }[];
}

export function resumir(lineas: readonly Linea[], anios?: number[]): Resumen {
  const ev = lineas.filter((l) => !sinEvaluar(l));
  const sin = lineas.filter(sinEvaluar);
  return {
    n: lineas.length,
    monto: sumaMonto(lineas),
    evaluados: ev.length,
    montoEvaluado: sumaMonto(ev),
    sinEvaluar: sin.length,
    montoSinEvaluar: sumaMonto(sin),
    conOficina: lineas.filter((l) => l.oficina).length,
    porCampus: repartir(lineas, (l) => l.campus, rotuloCampus, CAMPUS_LISTA),
    porPilar: repartir(lineas, (l) => l.pilar, (k) => `${pilarCodigo(k)} · ${pilarNombre(k)}`).sort((a, b) => clavePilar(a.clave) - clavePilar(b.clave)),
    porPrioridad: repartir(lineas, (l) => l.prioridad, (k) => k, PRIORIDADES),
    porFuente: repartir(lineas, (l) => l.fuente ?? SIN_FUENTE),
    porAnio: inversionPorAnio(ev, anios),
  };
}

/** Resumen por oficina (cobertura): cuántas líneas tienen responsable. */
export function porOficina(lineas: readonly Linea[]): Reparto[] {
  return repartir(lineas, (l) => l.oficina ?? SIN_OFICINA).sort((a, b) => (a.clave === SIN_OFICINA ? 1 : b.clave === SIN_OFICINA ? -1 : b.monto - a.monto));
}

export { aniosDe, CAMPUS_TODOS };

/* ---------- Calidad de datos ---------- */

export type EstadoCalidad = "ok" | "pend" | "na" | "warn";

export interface HallazgoCalidad {
  clave: string;
  titulo: string;
  estado: EstadoCalidad;
  detalle: string;
  /** Líneas alcanzadas (pendientes, no aplican o inconsistentes). */
  lineas: Linea[];
  /** De ellas, las inconsistentes (lo que sí hay que corregir). */
  inconsistentes: Linea[];
}

const sumaPct = (l: Linea) => Object.values(l.pct).reduce((a, b) => a + b, 0);

/** Un proyecto que la VAF rechazó: no lleva fechas ni distribución, y no es una inconsistencia. */
const rechazada = (l: Linea): boolean => llano(l.resultado ?? "").startsWith("rechaz");

export function calidadDeDatos(lineas: readonly Linea[]): HallazgoCalidad[] {
  const ev = lineas.filter((l) => !sinEvaluar(l) && !rechazada(l));
  const sin = lineas.filter(sinEvaluar);
  const nombres = new Map<string, number>();
  for (const l of lineas) nombres.set(l.nombre, (nombres.get(l.nombre) ?? 0) + 1);
  const h = (clave: string, titulo: string, estado: EstadoCalidad, detalle: string, ls: Linea[], inconsistentes: Linea[] = []): HallazgoCalidad => ({ clave, titulo, estado, detalle, lineas: ls, inconsistentes });
  return [
    h("sin-evaluar", "Proyectos sin evaluar", "pend", "No pasaron a la etapa de evaluación por el resultado de la priorización. Se diligencian cuando se evalúen.", sin),
    h("sin-monto", "Sin monto", "warn", "Toda línea necesita un monto en pesos para entrar en las sumas.", lineas.filter((l) => l.monto === null)),
    h("sin-fuente", "Sin fuente de financiación", "na", "En los sin evaluar aún no corresponde; en los evaluados sí es un vacío.", sin.filter((l) => !l.fuente), ev.filter((l) => !l.fuente)),
    h("sin-fechas", "Sin fechas de inicio y fin", "na", "En los sin evaluar aún no hay cronograma; en los evaluados sí es un vacío.", sin.filter((l) => !l.inicio || !l.fin), ev.filter((l) => !l.inicio || !l.fin)),
    h("pct", "Distribución anual que no suma 100 %", "ok", "Se revisa solo en los evaluados; los sin evaluar no traen distribución.", [], ev.filter((l) => Math.abs(sumaPct(l) - 1) > 0.0005)),
    h("fechas", "Fin anterior al inicio", "ok", "Coherencia entre la fecha de inicio y la de fin.", [], ev.filter((l) => l.inicio && l.fin && l.fin < l.inicio)),
    h("nombres", "Nombres repetidos", "warn", "Varias líneas con el mismo nombre. Pueden ser válidas, pero conviene diferenciarlas.", lineas.filter((l) => (nombres.get(l.nombre) ?? 0) > 1)),
    h("oficina", "Sin oficina responsable", "pend", "La matriz no trae responsables. Se asignan con la columna «Oficina responsable» de la plantilla; sin ella no hay seguimiento por oficina (fase 2).", lineas.filter((l) => !l.oficina)),
  ].map((x) => {
    const malas = x.inconsistentes.length;
    const estado: EstadoCalidad = malas ? "warn" : x.lineas.length ? x.estado : "ok";
    return { ...x, estado: x.clave === "nombres" && !x.lineas.length ? "ok" : estado };
  });
}

/* ---------- Cronograma ---------- */

const MS_DIA = 86400000;
const dia = (s: string): number => Math.round(Date.parse(`${s.slice(0, 10)}T00:00:00Z`) / MS_DIA);

/** Posición de una barra en el cronograma, en % del ancho (de 1 de enero de `anioIni` a 31 de diciembre de `anioFin`). */
export function posicionBarra(inicio: string, fin: string, anioIni: number, anioFin: number): { izquierda: number; ancho: number } {
  const d0 = dia(`${anioIni}-01-01`);
  const d1 = dia(`${anioFin + 1}-01-01`);
  const a = Math.min(Math.max(dia(inicio), d0), d1);
  const b = Math.min(Math.max(dia(fin) + 1, d0), d1);
  return { izquierda: ((a - d0) / (d1 - d0)) * 100, ancho: Math.max(0.6, ((b - a) / (d1 - d0)) * 100) };
}
