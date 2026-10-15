/* =============================================================================
   Warehouse UDES · el resumen que se le entrega a Pilo (lógica pura).

   Pilo NO recibe códigos de estudiante ni notas individuales: solo conteos por
   nivel de desempeño (NE, ED, RS), por programa y por materia, y la evolución
   por corte. Con ese resumen —y con lo que dice el estudio de la UDES— escribe
   su análisis (función warehouse-pilo).
   ========================================================================== */

import type { MateriaCritica } from "./estudio";
import type { AlertaNotas } from "./reglas";

export interface DatosParaPilo {
  periodo: string;
  sede: string;
  corte: number;
  alcance: { nivel: "institucion" | "facultad" | "programa"; nombre?: string };
  totales: { estudiantes: number; NE: number; ED: number; RS: number };
  evolucion?: { corte: number; promedio: number | null; pctRS: number | null }[];
  programas?: { nombre: string; estudiantes: number; NE: number; ED: number; RS: number; promedio: number | null }[];
  materias?: { nombre: string; estudiantes: number; pctBajo: number; promedio: number | null }[];
  umbrales?: Record<string, number>;
}

const redondea = (n: number | null, d = 2) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

/**
 * Arma el resumen de las alertas por notas. `programa` limita el alcance a un programa; sin él, es toda la
 * institución (de la sede). Solo salen los 12 programas con más estudiantes en RS y las 10 materias más críticas.
 */
export function resumenParaPilo(
  alertas: AlertaNotas[],
  materias: MateriaCritica[],
  contexto: { periodo: string; sede: string; programa?: string; umbrales?: Record<string, number> },
): DatosParaPilo | null {
  const evaluados = alertas.filter((a) => a.corte !== null && a.desempeno !== null && (!contexto.programa || a.programa === contexto.programa));
  if (evaluados.length === 0) return null;
  const corte = evaluados.reduce((m, a) => Math.max(m, a.corte ?? 0), 0);
  const cuenta = (lista: AlertaNotas[]) => ({
    estudiantes: lista.length,
    NE: lista.filter((a) => a.desempeno === "NE").length,
    ED: lista.filter((a) => a.desempeno === "ED").length,
    RS: lista.filter((a) => a.desempeno === "RS").length,
  });
  const prom = (lista: AlertaNotas[]) => {
    const v = lista.map((a) => a.promedio).filter((x): x is number => x !== null);
    return v.length ? redondea(v.reduce((s, x) => s + x, 0) / v.length) : null;
  };

  const porPrograma = new Map<string, AlertaNotas[]>();
  for (const a of evaluados) porPrograma.set(a.programa || "Sin programa", [...(porPrograma.get(a.programa || "Sin programa") ?? []), a]);

  return {
    periodo: contexto.periodo,
    sede: contexto.sede,
    corte,
    alcance: contexto.programa ? { nivel: "programa", nombre: contexto.programa } : { nivel: "institucion" },
    totales: cuenta(evaluados),
    programas: [...porPrograma.entries()]
      .map(([nombre, lista]) => ({ nombre, ...cuenta(lista), promedio: prom(lista) }))
      .sort((a, b) => b.RS - a.RS || b.estudiantes - a.estudiantes)
      .slice(0, 12),
    materias: materias
      .filter((m) => !contexto.programa || m.programas.includes(contexto.programa))
      .slice(0, 10)
      .map((m) => ({ nombre: m.materia, estudiantes: m.estudiantes, pctBajo: m.pctBajo, promedio: m.promedio })),
    umbrales: contexto.umbrales,
  };
}
