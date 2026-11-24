/* =============================================================================
   Warehouse UDES · lo que dice el estudio de la UDES sobre alertas tempranas.

   «Estrategias de intervención preventiva para fomentar la permanencia y éxito
   estudiantil: alertas tempranas» (Pérez, Mejía, Serrano, Suescún y León,
   Universidad de Santander, 2023; DOI 10.37885/230914480). Las cifras son del
   estudio (cohortes 2017–2020, regresión logística), no de los datos de esta
   pantalla: sirven para ordenar el riesgo y explicarlo, y no son una predicción
   de nadie en particular. Lógica pura.
   ========================================================================== */

export const ESTUDIO_UDES = {
  /** Nota de aprobar; en Medicina es 3,5. */
  aprueba: 3.0,
  apruebaMedicina: 3.5,
  /** Promedio por debajo del cual, al cerrar el periodo, se entra en periodo de prueba académica. */
  pruebaAcademica: 3.2,
  /** El éxito estudiantil se mide con un promedio superior a este. */
  exito: 3.8,
  /** Promedio bajo (< 3,3), medio (3,3 a 4,3) y alto (> 4,3). */
  bajo: 3.3,
  alto: 4.3,
  /** Cuántas veces más probable es desertar, frente a un promedio alto. */
  rrBajo: 16.7,
  rrMedio: 2.2,
  /** Frente a los menores de 20 años. */
  rrEtario: { "≤20": 1, "21–25": 3.1, "26+": 5.1 } as Record<string, number>,
  /** Venir de fuera de Santander. */
  rrFuera: 1.4,
  /** Quien asiste a 7 o más tutorías tiene 3,8 veces más probabilidad de un promedio alto. */
  tutorias: 3.8,
} as const;

export type Banda = "bajo" | "medio" | "alto";
export const NOMBRE_BANDA: Record<Banda, string> = { bajo: "Promedio bajo (< 3,3)", medio: "Promedio medio (3,3 a 4,3)", alto: "Promedio alto (> 4,3)" };

export function bandaDe(promedio: number | null): Banda | null {
  if (promedio === null) return null;
  return promedio < ESTUDIO_UDES.bajo ? "bajo" : promedio <= ESTUDIO_UDES.alto ? "medio" : "alto";
}

/** Cuántas veces más probable es desertar con este promedio que con uno alto, según el estudio. */
export function riesgoRelativoDe(promedio: number | null): number | null {
  const b = bandaDe(promedio);
  return b === null ? null : b === "bajo" ? ESTUDIO_UDES.rrBajo : b === "medio" ? ESTUDIO_UDES.rrMedio : 1;
}

/** Los tres niveles de desempeño del Monitor: Nivel Esperado, En Desarrollo y Requiere Seguimiento. */
export type Desempeno = "NE" | "ED" | "RS";
export const NOMBRE_DESEMPENO: Record<Desempeno, string> = { NE: "Nivel Esperado", ED: "En Desarrollo", RS: "Requiere Seguimiento" };

/** NE: promedio de 3,5 o más y ninguna materia perdida. ED: entre 3,0 y 3,49, o una materia perdida. RS: promedio < 3,0, dos o más materias perdidas o una caída de 0,5 o más. */
export function desempenoDe(promedio: number | null, materiasPerdidas: number, caida: number | null = null): Desempeno | null {
  if (promedio === null) return null;
  if (promedio < 3.0 || materiasPerdidas >= 2 || (caida !== null && caida >= 0.5)) return "RS";
  if (promedio < 3.5 || materiasPerdidas === 1) return "ED";
  return "NE";
}

export interface ResumenGrupoNotas {
  codigo_materia: string;
  materia: string;
  grupo: string;
  programa: string;
  estudiantes: number;
  con_p1: number;
  con_p2: number;
  con_p3: number;
  prom_p1: number | null;
  prom_p2: number | null;
  prom_p3: number | null;
  bajo_p1: number;
  bajo_p2: number;
  bajo_p3: number;
}

export interface MateriaCritica {
  codigo: string;
  materia: string;
  programas: string[];
  grupos: number;
  /** Con nota en el corte evaluado. */
  estudiantes: number;
  /** El último corte en que la mayoría ya tiene nota. */
  corte: 1 | 2 | 3;
  promedio: number | null;
  /** De quienes ya tienen nota, el % que va por debajo de la nota de aprobar. */
  pctBajo: number;
}

/**
 * «Alerta Temprana 4» del estudio: cursos con alta reprobación. Junta los grupos de cada materia y mide, en el
 * último corte con notas, qué parte de quienes ya tienen nota va por debajo de la de aprobar.
 */
export function materiasCriticas(grupos: ResumenGrupoNotas[], opciones: { minimoEstudiantes?: number; umbralPct?: number } = {}): MateriaCritica[] {
  const minimo = opciones.minimoEstudiantes ?? 15;
  const umbral = opciones.umbralPct ?? 30;
  const por = new Map<string, ResumenGrupoNotas[]>();
  for (const g of grupos) por.set(g.codigo_materia, [...(por.get(g.codigo_materia) ?? []), g]);
  const salida: MateriaCritica[] = [];
  for (const [codigo, gs] of por) {
    const total = gs.reduce((s, g) => s + g.estudiantes, 0);
    if (total === 0) continue;
    const suma = (f: (g: ResumenGrupoNotas) => number) => gs.reduce((s, g) => s + f(g), 0);
    const corte: 1 | 2 | 3 = suma((g) => g.con_p3) / total >= 0.5 ? 3 : suma((g) => g.con_p2) / total >= 0.5 ? 2 : 1;
    const con = (g: ResumenGrupoNotas) => (corte === 3 ? g.con_p3 : corte === 2 ? g.con_p2 : g.con_p1);
    const bajo = (g: ResumenGrupoNotas) => (corte === 3 ? g.bajo_p3 : corte === 2 ? g.bajo_p2 : g.bajo_p1);
    const prom = (g: ResumenGrupoNotas) => (corte === 3 ? g.prom_p3 : corte === 2 ? g.prom_p2 : g.prom_p1);
    const conNota = suma(con);
    if (conNota < minimo) continue;
    const pct = (100 * suma(bajo)) / conNota;
    if (pct < umbral) continue;
    const pesado = suma((g) => (prom(g) ?? 0) * con(g));
    salida.push({
      codigo,
      materia: gs[0].materia,
      programas: [...new Set(gs.map((g) => g.programa).filter(Boolean))],
      grupos: gs.length,
      estudiantes: conNota,
      corte,
      promedio: Math.round((pesado / conNota) * 100) / 100,
      pctBajo: Math.round(pct * 10) / 10,
    });
  }
  return salida.sort((a, b) => b.pctBajo - a.pctBajo || b.estudiantes - a.estudiantes);
}
