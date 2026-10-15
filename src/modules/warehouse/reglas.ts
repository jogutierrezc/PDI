/* =============================================================================
   Warehouse UDES · alertas tempranas (lógica pura).

   Dos familias, según lo que los reportes de verdad traen:

   · POR GRUPO — «Rendimiento académico» de Master: por cada grupo y corte,
     cuántos matriculados, aprobados, reprobados y no presentaron, y el
     promedio. Es lo que hay por corte (1, 2, 3 y definitiva). No trae notas
     por estudiante.
   · POR ESTUDIANTE — «Estudiantes matriculados» de Davinci: promedio
     acumulado, promedio del último polígrafo y créditos. Un solo corte en el
     tiempo (el de la descarga), sin notas por materia.

   Las reglas y sus umbrales son valores de partida que Planeación ajusta en
   pantalla; nada aquí es una norma de la Universidad. El nivel sale de
   cuántas reglas se cumplen: 1 = Atención, 2 = Riesgo, 3 o más = Crítico.
   ========================================================================== */

import type { GrupoRendimiento, ResumenNotas } from "./store";

export type Nivel = 0 | 1 | 2 | 3;
export const NIVELES = ["Sin alerta", "Atención", "Riesgo", "Crítico"] as const;

export const nivelDe = (reglas: number): Nivel => (reglas >= 3 ? 3 : (reglas as Nivel));

/* --- Por grupo -------------------------------------------------------------- */

export interface UmbralesGrupo {
  /** % de reprobados desde el cual el grupo alerta. */
  reprobados: number;
  /** % de «no presenta» desde el cual alerta. */
  noPresenta: number;
  /** Promedio por debajo del cual alerta. */
  promedio: number;
  /** Caída del promedio frente al corte anterior que alerta. */
  caida: number;
  /** Menos matriculados que esto no se evalúan: un grupo de 3 no dice nada. */
  minimo: number;
}

export const UMBRALES_GRUPO: UmbralesGrupo = { reprobados: 25, noPresenta: 15, promedio: 3.2, caida: 0.4, minimo: 5 };

export type ReglaGrupo = "reprobados" | "noPresenta" | "promedio" | "caida";

export const REGLAS_GRUPO: Record<ReglaGrupo, { nombre: string; descripcion: (u: UmbralesGrupo) => string }> = {
  reprobados: { nombre: "Reprobación alta", descripcion: (u) => `${u.reprobados} % o más de los matriculados reprobó` },
  noPresenta: { nombre: "Inasistencia a evaluaciones", descripcion: (u) => `${u.noPresenta} % o más no presentó` },
  promedio: { nombre: "Promedio bajo", descripcion: (u) => `Promedio del grupo menor a ${String(u.promedio).replace(".", ",")}` },
  caida: { nombre: "Caída frente al corte anterior", descripcion: (u) => `El promedio bajó ${String(u.caida).replace(".", ",")} o más desde el corte anterior` },
};

export interface AlertaGrupo {
  grupo: GrupoRendimiento;
  /** Promedio del corte anterior del mismo grupo, si se cargó. */
  anterior: number | null;
  reglas: ReglaGrupo[];
  nivel: Nivel;
}

/** El orden de los cortes en el semestre. */
export const ORDEN_CORTES = ["1", "2", "3", "f"];

const claveGrupo = (g: GrupoRendimiento) => `${g.codigo}|${g.letra}|${g.plan}|${g.docente}`;

/**
 * Evalúa los grupos de UN corte. `todos` trae los grupos de todos los cortes
 * cargados del periodo, para comparar con el corte anterior.
 */
export function evaluarGrupos(todos: GrupoRendimiento[], corte: string, umbrales: UmbralesGrupo = UMBRALES_GRUPO): AlertaGrupo[] {
  const posicion = ORDEN_CORTES.indexOf(corte);
  const previos = new Map<string, number>();
  if (posicion > 0) {
    // El corte anterior más cercano que sí esté cargado.
    for (let i = posicion - 1; i >= 0; i--) {
      for (const g of todos) if (g.corte === ORDEN_CORTES[i] && !previos.has(claveGrupo(g))) previos.set(claveGrupo(g), g.promedio);
    }
  }
  return todos
    .filter((g) => g.corte === corte && g.matriculados >= umbrales.minimo)
    .map((grupo): AlertaGrupo => {
      const anterior = previos.get(claveGrupo(grupo)) ?? null;
      const reglas: ReglaGrupo[] = [];
      if (grupo.pct_reprobados >= umbrales.reprobados) reglas.push("reprobados");
      if (grupo.pct_no_presenta >= umbrales.noPresenta) reglas.push("noPresenta");
      if (grupo.promedio > 0 && grupo.promedio < umbrales.promedio) reglas.push("promedio");
      if (anterior !== null && anterior - grupo.promedio >= umbrales.caida) reglas.push("caida");
      return { grupo, anterior, reglas, nivel: nivelDe(reglas.length) };
    });
}

export interface ResumenDepartamento {
  departamento: string;
  grupos: number;
  matriculados: number;
  /** Aprobados sobre matriculados, en %. */
  aprobacion: number;
  reprobacion: number;
  noPresenta: number;
  /** Promedio ponderado por matriculados. */
  promedio: number;
  enAlerta: number;
}

/** Cifras por departamento de un corte. La columna «Programa» del reporte es, en realidad, el departamento. */
export function resumenPorDepartamento(alertas: AlertaGrupo[]): ResumenDepartamento[] {
  const mapa = new Map<string, { g: number; m: number; a: number; r: number; n: number; p: number; alerta: number }>();
  for (const { grupo, nivel } of alertas) {
    const d = mapa.get(grupo.departamento) ?? { g: 0, m: 0, a: 0, r: 0, n: 0, p: 0, alerta: 0 };
    d.g += 1;
    d.m += grupo.matriculados;
    d.a += grupo.aprobados;
    d.r += grupo.reprobados;
    d.n += grupo.no_presenta;
    d.p += grupo.promedio * grupo.matriculados;
    if (nivel > 0) d.alerta += 1;
    mapa.set(grupo.departamento, d);
  }
  return [...mapa.entries()]
    .map(([departamento, d]) => ({
      departamento,
      grupos: d.g,
      matriculados: d.m,
      aprobacion: d.m ? (100 * d.a) / d.m : 0,
      reprobacion: d.m ? (100 * d.r) / d.m : 0,
      noPresenta: d.m ? (100 * d.n) / d.m : 0,
      promedio: d.m ? d.p / d.m : 0,
      enAlerta: d.alerta,
    }))
    .sort((a, b) => b.enAlerta - a.enAlerta || a.aprobacion - b.aprobacion);
}

export interface PuntoCorte {
  corte: string;
  grupos: number;
  matriculados: number;
  aprobacion: number;
  reprobacion: number;
  noPresenta: number;
  promedio: number;
}

/** La evolución del semestre: una cifra por corte cargado. */
export function evolucionPorCorte(todos: GrupoRendimiento[], minimo = UMBRALES_GRUPO.minimo): PuntoCorte[] {
  return ORDEN_CORTES.map((corte) => {
    const g = todos.filter((x) => x.corte === corte && x.matriculados >= minimo);
    const m = g.reduce((s, x) => s + x.matriculados, 0);
    const suma = (f: (x: GrupoRendimiento) => number) => g.reduce((s, x) => s + f(x), 0);
    return {
      corte,
      grupos: g.length,
      matriculados: m,
      aprobacion: m ? (100 * suma((x) => x.aprobados)) / m : 0,
      reprobacion: m ? (100 * suma((x) => x.reprobados)) / m : 0,
      noPresenta: m ? (100 * suma((x) => x.no_presenta)) / m : 0,
      promedio: m ? suma((x) => x.promedio * x.matriculados) / m : 0,
    };
  }).filter((p) => p.grupos > 0);
}

/* --- Por estudiante --------------------------------------------------------- */

export interface UmbralesEstudiante {
  /** Promedio acumulado por debajo del cual alerta. */
  acumulado: number;
  /** Caída del último polígrafo frente al acumulado que alerta. */
  caida: number;
  /** Fracción de los créditos esperados por su ubicación que debe tener aprobados. */
  avance: number;
}

export const UMBRALES_ESTUDIANTE: UmbralesEstudiante = { acumulado: 3.2, caida: 0.4, avance: 0.75 };

export type ReglaEstudiante = "acumulado" | "caida" | "avance";

export const REGLAS_ESTUDIANTE: Record<ReglaEstudiante, { nombre: string; descripcion: (u: UmbralesEstudiante) => string; sugerencia: string }> = {
  acumulado: {
    nombre: "Promedio acumulado bajo",
    descripcion: (u) => `Acumulado menor a ${String(u.acumulado).replace(".", ",")}`,
    sugerencia: "Citar a una tutoría académica y revisar las materias con nota baja.",
  },
  caida: {
    nombre: "Caída en el último polígrafo",
    descripcion: (u) => `El último semestre quedó ${String(u.caida).replace(".", ",")} o más por debajo de su acumulado`,
    sugerencia: "Preguntar qué cambió este semestre: carga, trabajo, salud o situación económica.",
  },
  avance: {
    nombre: "Créditos aprobados por debajo de lo esperado",
    descripcion: (u) => `Aprobó menos del ${Math.round(u.avance * 100)} % de los créditos que corresponden a su ubicación`,
    sugerencia: "Revisar con el programa un plan de nivelación o de reducción de carga.",
  },
};

export interface AlertaEstudiante {
  /** Seudónimo del código (x-…): el nombre nunca se guarda. */
  id: string;
  programa: string;
  jornada: string;
  acumulado: number | null;
  ultimo: number | null;
  creditosAprobados: number | null;
  creditosEsperados: number | null;
  reglas: ReglaEstudiante[];
  nivel: Nivel;
}

/** Un número de un Excel: acepta «3,4», «3.4», un número, o nada. */
export function numero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const t = valor.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Evalúa las filas de «Estudiantes matriculados» (columnas normalizadas por el motor). */
export function evaluarEstudiantes(filas: Record<string, unknown>[], umbrales: UmbralesEstudiante = UMBRALES_ESTUDIANTE): AlertaEstudiante[] {
  return filas.map((f): AlertaEstudiante => {
    const acumulado = numero(f.promedio_acumulado);
    const ultimo = numero(f.promedio_semestre_ultimo_poligrafo);
    const aprobados = numero(f.cred_aprobados);
    const esperados = numero(f.cred_segun_ubicacion);
    const reglas: ReglaEstudiante[] = [];
    // Un acumulado en 0 es un estudiante nuevo sin notas, no un estudiante con mal promedio.
    if (acumulado !== null && acumulado > 0 && acumulado < umbrales.acumulado) reglas.push("acumulado");
    if (acumulado !== null && acumulado > 0 && ultimo !== null && ultimo > 0 && acumulado - ultimo >= umbrales.caida) reglas.push("caida");
    if (aprobados !== null && esperados !== null && esperados > 0 && aprobados < esperados * umbrales.avance) reglas.push("avance");
    return {
      id: String(f.codigo ?? ""),
      programa: String(f.programa ?? ""),
      jornada: String(f.jornada ?? ""),
      acumulado,
      ultimo,
      creditosAprobados: aprobados,
      creditosEsperados: esperados,
      reglas,
      nivel: nivelDe(reglas.length),
    };
  });
}

export interface ResumenNiveles {
  total: number;
  porNivel: [number, number, number, number];
}

export function contarNiveles(items: { nivel: Nivel }[]): ResumenNiveles {
  const porNivel: [number, number, number, number] = [0, 0, 0, 0];
  for (const i of items) porNivel[i.nivel] += 1;
  return { total: items.length, porNivel };
}

/* --- Por notas de cada estudiante (P1, P2, P3) -------------------------------------- */

export interface UmbralesNotas {
  /** Nota por debajo de la cual una materia va perdida (la escala va de 0 a 5; aprobar es 3,0). */
  aprueba: number;
  /** Cuántas materias por debajo de la nota de aprobar bastan para alertar. */
  materias: number;
  /** Promedio del último corte por debajo del cual alerta. */
  promedio: number;
  /** Caída del promedio entre el corte anterior y el último que alerta. */
  caida: number;
}

export const UMBRALES_NOTAS: UmbralesNotas = { aprueba: 3.0, materias: 2, promedio: 3.2, caida: 0.5 };

export type ReglaNotas = "materias" | "promedio" | "caida";

export const REGLAS_NOTAS: Record<ReglaNotas, { nombre: string; descripcion: (u: UmbralesNotas) => string; sugerencia: string }> = {
  materias: {
    nombre: "Materias por debajo de la nota de aprobar",
    descripcion: (u) => `${u.materias} o más materias con nota menor a ${String(u.aprueba).replace(".", ",")} en el último corte`,
    sugerencia: "Revisar con el estudiante cuáles materias y ofrecer tutoría antes del siguiente corte.",
  },
  promedio: {
    nombre: "Promedio del corte bajo",
    descripcion: (u) => `Promedio del último corte menor a ${String(u.promedio).replace(".", ",")}`,
    sugerencia: "Citar a consejería académica: el promedio del corte no alcanza para mantener el semestre.",
  },
  caida: {
    nombre: "Caída entre cortes",
    descripcion: (u) => `El promedio bajó ${String(u.caida).replace(".", ",")} o más frente al corte anterior`,
    sugerencia: "Preguntar qué cambió entre un corte y otro: asistencia, carga laboral, salud o situación económica.",
  },
};

export interface AlertaNotas {
  /** Seudónimo del código (x-…). */
  id: string;
  programa: string;
  materias: number;
  /** El último corte con notas (1, 2 o 3). */
  corte: 1 | 2 | 3 | null;
  promedio: number | null;
  anterior: number | null;
  enRiesgo: number;
  reglas: ReglaNotas[];
  nivel: Nivel;
}

/**
 * Evalúa a cada estudiante con sus notas del último corte que ya tiene casi todas las materias calificadas
 * (un corte con unas pocas notas sueltas no cuenta). Un estudiante sin ninguna nota todavía no alerta.
 *
 * `riesgo_pN` ya viene contado con la nota de aprobar de la base (3,0); si se cambia la nota de aprobar
 * aquí solo se puede ser más exigente para el promedio, no recontar materias: por eso la nota de aprobar
 * no es un umbral editable de esta pantalla.
 */
export function evaluarNotas(resumen: ResumenNotas[], umbrales: UmbralesNotas = UMBRALES_NOTAS): AlertaNotas[] {
  return resumen.map((r): AlertaNotas => {
    const completo = (con: number) => r.materias > 0 && con / r.materias >= 0.5;
    const cortes = [
      { n: 3 as const, con: r.con_p3, prom: r.prom_p3, riesgo: r.riesgo_p3 },
      { n: 2 as const, con: r.con_p2, prom: r.prom_p2, riesgo: r.riesgo_p2 },
      { n: 1 as const, con: r.con_p1, prom: r.prom_p1, riesgo: r.riesgo_p1 },
    ];
    const ultimo = cortes.find((c) => c.con > 0 && completo(c.con)) ?? cortes.find((c) => c.con > 0) ?? null;
    const previo = ultimo ? cortes.find((c) => c.n < ultimo.n && c.con > 0 && c.prom !== null) ?? null : null;
    const reglas: ReglaNotas[] = [];
    if (ultimo) {
      if (ultimo.riesgo >= umbrales.materias) reglas.push("materias");
      if (ultimo.prom !== null && ultimo.prom < umbrales.promedio) reglas.push("promedio");
      if (previo && ultimo.prom !== null && previo.prom !== null && previo.prom - ultimo.prom >= umbrales.caida) reglas.push("caida");
    }
    return {
      id: r.estudiante,
      programa: r.programa,
      materias: r.materias,
      corte: ultimo ? ultimo.n : null,
      promedio: ultimo?.prom ?? null,
      anterior: previo?.prom ?? null,
      enRiesgo: ultimo?.riesgo ?? 0,
      reglas,
      nivel: nivelDe(reglas.length),
    };
  });
}
