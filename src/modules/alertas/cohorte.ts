/* =============================================================================
   Portal de alertas · trayectorias y cohortes (lógica pura).

   Arma, desde las filas de wh_monitor_historial (una por estudiante y periodo), la trayectoria de
   cada persona y las cifras de una cohorte (un programa en un semestre). Reutiliza la
   clasificación NE · ED · RS del Monitor: cada periodo se clasifica en su último corte con notas.
   ========================================================================== */

import { clasificar, type Corte, type FilaMonitor, type Nivel } from "../monitor/logica";
import { PRUEBA, proyectarPromedio, suma, type Factores, type PersonaEscenario } from "./estimacion";

/** Una fila de wh_monitor_historial: lo del resumen del Monitor, más periodo, semestre y perfil. */
export interface FilaHistorial extends FilaMonitor {
  periodo: string;
  semestre: number | null;
  grupo_etario: string | null;
  origen: string | null;
  con_fin: number;
  prom_fin: number | null;
  riesgo_fin: number;
}

export interface PuntoPeriodo {
  periodo: string;
  /** El promedio del periodo: la nota final si ya llegó; si no, el del último corte con notas. */
  promedio: number;
  perdidas: number;
  nivel: Nivel;
  /** El último corte con notas suficientes. */
  corte: Corte;
  /** Faltan cortes (P3 o la nota final): lo del periodo todavía no está completo. */
  parcial: boolean;
  fila: FilaHistorial;
}

export interface Trayectoria {
  codigo: string;
  codigo_programa: string;
  programa: string;
  semestre: number | null;
  etario: string | null;
  origen: string | null;
  /** Del periodo más antiguo al elegido. */
  puntos: PuntoPeriodo[];
  actual: PuntoPeriodo;
  anterior: PuntoPeriodo | null;
}

/** El punto de un periodo; null si la persona no tiene notas suficientes en ningún corte. */
export function puntoDe(f: FilaHistorial): PuntoPeriodo | null {
  for (const c of [3, 2, 1] as Corte[]) {
    const cl = clasificar(f, c);
    if (!cl) continue;
    const final = f.con_fin > 0 && f.prom_fin !== null;
    return { periodo: f.periodo, promedio: final ? (f.prom_fin as number) : cl.promedio, perdidas: final ? f.riesgo_fin : cl.perdidas, nivel: cl.nivel, corte: c, parcial: !final && c < 3, fila: f };
  }
  return null;
}

/** Las trayectorias de quienes tienen notas en `periodo` (y, si se pide, estaban en ese semestre). */
export function trayectorias(filas: FilaHistorial[], periodo: string, semestre: number | null): Trayectoria[] {
  const por = new Map<string, FilaHistorial[]>();
  for (const f of filas) if (f.periodo <= periodo) por.set(f.estudiante, [...(por.get(f.estudiante) ?? []), f]);
  const out: Trayectoria[] = [];
  for (const [codigo, fs] of por) {
    const ordenadas = fs.slice().sort((a, b) => a.periodo.localeCompare(b.periodo));
    const puntos = ordenadas.map(puntoDe).filter((p): p is PuntoPeriodo => p !== null);
    const actual = puntos[puntos.length - 1];
    if (!actual || actual.periodo !== periodo) continue;
    if (semestre !== null && actual.fila.semestre !== semestre) continue;
    const ultimo = (k: "grupo_etario" | "origen") => [...ordenadas].reverse().find((f) => f[k])?.[k] ?? null;
    out.push({ codigo, codigo_programa: actual.fila.codigo_programa, programa: actual.fila.programa, semestre: actual.fila.semestre, etario: ultimo("grupo_etario"), origen: ultimo("origen"), puntos, actual, anterior: puntos.length > 1 ? puntos[puntos.length - 2] : null });
  }
  return out;
}

export interface ResumenCohorte {
  n: number;
  NE: number;
  ED: number;
  RS: number;
  /** Proporción en RS (0 a 1). */
  pctRS: number;
  /** Cuántos de los que ya estaban el periodo anterior estaban en RS (0 a 1); null si no hay anterior. */
  pctRSAnterior: number | null;
  bajo33: number;
  prueba: number;
  mayores: number;
  fuera: number;
}

export function resumenDe(t: Trayectoria[]): ResumenCohorte {
  const n = t.length;
  const cuenta = (k: Nivel) => t.filter((x) => x.actual.nivel === k).length;
  const conAnt = t.filter((x) => x.anterior);
  const rsAnt = conAnt.filter((x) => x.anterior?.nivel === "RS").length;
  return {
    n,
    NE: cuenta("NE"),
    ED: cuenta("ED"),
    RS: cuenta("RS"),
    pctRS: n ? cuenta("RS") / n : 0,
    pctRSAnterior: conAnt.length ? rsAnt / conAnt.length : null,
    bajo33: t.filter((x) => x.actual.promedio < 3.3).length,
    prueba: t.filter((x) => x.actual.promedio < PRUEBA).length,
    mayores: t.filter((x) => x.etario?.includes("26")).length,
    fuera: t.filter((x) => x.origen && x.origen !== "Santander").length,
  };
}

export interface ColumnaPeriodo {
  periodo: string;
  n: number;
  NE: number;
  ED: number;
  RS: number;
  parcial: boolean;
}

/** La misma cohorte en cada periodo que lleva: cuántos en cada nivel. */
export function composicion(t: Trayectoria[]): ColumnaPeriodo[] {
  const periodos = [...new Set(t.flatMap((x) => x.puntos.map((p) => p.periodo)))].sort();
  return periodos.map((periodo) => {
    const ps = t.map((x) => x.puntos.find((p) => p.periodo === periodo)).filter((p): p is PuntoPeriodo => !!p);
    return { periodo, n: ps.length, NE: ps.filter((p) => p.nivel === "NE").length, ED: ps.filter((p) => p.nivel === "ED").length, RS: ps.filter((p) => p.nivel === "RS").length, parcial: ps.some((p) => p.parcial) };
  });
}

export interface CeldaCalor {
  n: number;
  pctRS: number;
  parcial: boolean;
}

/** Semestre por periodo: el porcentaje en RS de quienes estaban en ese semestre ese periodo. Con menos de `min`, sin dato. */
export function calorSemestres(filas: FilaHistorial[], periodos: string[], min = 5) {
  const celdas = new Map<string, CeldaCalor>();
  const acum = new Map<string, { n: number; rs: number; parcial: boolean }>();
  for (const f of filas) {
    if (f.semestre === null) continue;
    const p = puntoDe(f);
    if (!p) continue;
    const k = `${f.semestre}|${f.periodo}`;
    const a = acum.get(k) ?? { n: 0, rs: 0, parcial: false };
    a.n += 1;
    if (p.nivel === "RS") a.rs += 1;
    if (p.parcial) a.parcial = true;
    acum.set(k, a);
  }
  for (const [k, a] of acum) if (a.n >= min) celdas.set(k, { n: a.n, pctRS: a.rs / a.n, parcial: a.parcial });
  const semestres = [...new Set([...acum.keys()].map((k) => Number(k.split("|")[0])))].sort((a, b) => a - b);
  return { semestres, periodos, celdas };
}

export interface Esperado {
  central: number;
  bajo: number;
  alto: number;
}

/** Cuántos estudiantes se espera que cierren por debajo de 3,2 el próximo periodo, con su banda del 80 %. */
export function esperadoProximo(t: Trayectoria[]): Esperado {
  const ps = t.map((x) => proyectarPromedio(x.puntos.map((p) => p.promedio))?.pPrueba ?? 0);
  const central = suma(ps);
  const sd = Math.sqrt(suma(ps.map((p) => p * (1 - p))));
  return { central, bajo: Math.max(0, central - 1.28 * sd), alto: central + 1.28 * sd };
}

export const factoresDe = (t: Trayectoria, facultad: string | null): Factores => ({ facultad, promedio: t.actual.promedio, etario: t.etario, origen: t.origen });

export const personaEscenario = (t: Trayectoria, facultad: string | null): PersonaEscenario => ({ nivel: t.actual.nivel, promedios: t.puntos.map((p) => p.promedio), factores: factoresDe(t, facultad) });

const ORDEN: Record<Nivel, number> = { RS: 0, ED: 1, NE: 2 };
/** Primero quienes requieren seguimiento; dentro de cada nivel, el de menor promedio. */
export const porPrioridad = (a: Trayectoria, b: Trayectoria) => ORDEN[a.actual.nivel] - ORDEN[b.actual.nivel] || a.actual.promedio - b.actual.promedio;

/** El periodo que sigue: 2026a → 2026b → 2027a. */
export const siguientePeriodo = (p: string) => (p.endsWith("a") ? `${p.slice(0, 4)}b` : `${Number(p.slice(0, 4)) + 1}a`);

/** Los periodos del historial: `n` periodos hasta el elegido (el elegido incluido), del más antiguo al más reciente. */
export function periodosHasta(todos: string[], periodo: string, n = 6): string[] {
  const i = todos.indexOf(periodo);
  return (i < 0 ? [periodo] : todos.slice(i, i + n)).slice().reverse();
}
