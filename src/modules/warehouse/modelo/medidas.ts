/* Warehouse UDES · modelo semántico · medidas.

   Una medida tiene nombre de negocio, receta en palabras, descripción y carpeta. Las razones usan división
   segura (vacío si el denominador es cero o no existe). La receta se traduce a lo que entiende `wh_explorar`:
   un agregado por fuente. Las razones y los cambios entre periodos se componen con los resultados. */

import type { TipoRegla } from "./relaciones";
import { fuentePorId } from "./fuentes";

export type OperacionBI = "contar" | "sumar" | "promediar" | "mediana" | "minimo" | "maximo" | "distintos";
export type Formato = "entero" | "decimal" | "porcentaje" | "puntos";

/** El mismo filtro que entiende wh_cumple en la base. Nunca sobre una columna de dato personal. */
export interface FiltroBI {
  col: string;
  op: "eq" | "ne" | "gte" | "lte" | "contiene" | "en";
  val: string | number | string[];
}

export type Calculo =
  | { tipo: "agregado"; fuente: string; op: OperacionBI; columna?: string; filtros?: FiltroBI[] }
  | { tipo: "razon"; numerador: Calculo; denominador: Calculo; porCien: boolean }
  | { tipo: "cambio"; base: string; contra: "periodo_anterior" };

export interface MedidaBI {
  id: string;
  nombre: string;
  /** Carpeta de visualización: agrupa las medidas en la lista. */
  carpeta: string;
  /** La receta, en palabras. */
  receta: string;
  /** Qué significa y cuándo no usarla. */
  descripcion: string;
  formato: Formato;
  calculo: Calculo;
  /** Reglas de reconstrucción que deben estar aprobadas para que la medida sea fiable. */
  reglas: TipoRegla[];
  /** Se marca sola en una pregunta de riesgo académico. */
  recomendada?: boolean;
}

const agg = (fuente: string, op: OperacionBI, columna?: string, filtros?: FiltroBI[]): Calculo => ({ tipo: "agregado", fuente, op, columna, filtros });
/** Periodo de prueba: promedio bajo 3,2 (estudio de la UDES). Con dos decimales, «bajo 3,2» es «3,19 o menos». */
const EN_PRUEBA: FiltroBI[] = [{ col: "promedio_acumulado_poligrafo", op: "lte", val: 3.19 }];
const razon = (numerador: Calculo, denominador: Calculo): Calculo => ({ tipo: "razon", numerador, denominador, porCien: true });

export const MEDIDAS: MedidaBI[] = [
  // Rendimiento por grupo (Master)
  { id: "tasa_reprobacion", nombre: "Tasa de reprobación", carpeta: "Rendimiento", receta: "Reprobados ÷ matriculados, por cien. División segura.", descripcion: "Qué parte de los matriculados reprobó. Se calcula sobre la suma, no como promedio de los porcentajes de cada grupo.", formato: "porcentaje", calculo: razon(agg("ma_rendimiento", "sumar", "reprobados"), agg("ma_rendimiento", "sumar", "matriculados")), reglas: [], recomendada: true },
  { id: "matriculados_grupos", nombre: "Matriculados en grupos", carpeta: "Rendimiento", receta: "Suma de matriculados de los grupos.", descripcion: "Cuenta una persona una vez por cada grupo en que está matriculada: no es el número de estudiantes.", formato: "entero", calculo: agg("ma_rendimiento", "sumar", "matriculados"), reglas: [] },
  { id: "promedio_grupos", nombre: "Promedio de los grupos", carpeta: "Rendimiento", receta: "Promedio simple de la nota media de cada grupo.", descripcion: "Todos los grupos pesan igual, sean de 8 o de 45 estudiantes.", formato: "decimal", calculo: agg("ma_rendimiento", "promediar", "promedio"), reglas: [], recomendada: true },
  { id: "grupos", nombre: "Grupos", carpeta: "Rendimiento", receta: "Cantidad de filas del reporte de rendimiento.", descripcion: "Un grupo es una materia con su letra y su corte.", formato: "entero", calculo: agg("ma_rendimiento", "contar"), reglas: [] },
  { id: "cambio_reprobacion", nombre: "Cambio de reprobación", carpeta: "Rendimiento", receta: "Tasa de reprobación menos la del periodo anterior de la tabla de periodos, en puntos.", descripcion: "Positivo es que reprobó más que el periodo anterior. Compara el mismo corte.", formato: "puntos", calculo: { tipo: "cambio", base: "tasa_reprobacion", contra: "periodo_anterior" }, reglas: [], recomendada: true },
  // Notas por estudiante (Davinci)
  { id: "estudiantes_con_nota", nombre: "Estudiantes con nota", carpeta: "Notas", receta: "Estudiantes distintos con notas en el periodo.", descripcion: "Cuenta personas, no filas. La reserva de 5 oculta los grupos más pequeños.", formato: "entero", calculo: agg("dv_notas", "distintos", "codigo_estudiante"), reglas: [] },
  { id: "promedio_acumulado_notas", nombre: "Promedio acumulado", carpeta: "Notas", receta: "Promedio de la nota acumulada de cada fila de notas.", descripcion: "Es el promedio de las filas de estudiante y materia, no el de cada estudiante.", formato: "decimal", calculo: agg("dv_notas", "promediar", "nota_acumulada"), reglas: [] },
  { id: "promedio_p1", nombre: "Promedio del primer corte", carpeta: "Notas", receta: "Promedio de la nota del primer corte.", descripcion: "Solo cuentan las materias que ya publicaron el primer corte.", formato: "decimal", calculo: agg("dv_notas", "promediar", "p1"), reglas: [] },
  { id: "prueba_academica", nombre: "Estudiantes en prueba académica", carpeta: "Permanencia", receta: "Estudiantes distintos con promedio acumulado menor de 3,2 en Promedios de estudiantes.", descripcion: "El umbral viene del estudio de la UDES (periodo de prueba bajo 3,2) y es editable.", formato: "entero", calculo: agg("dv_prom", "distintos", "codigo", EN_PRUEBA), reglas: [], recomendada: true },
  // Matrícula y permanencia
  { id: "estudiantes_matriculados", nombre: "Estudiantes matriculados", carpeta: "Matrícula", receta: "Estudiantes distintos matriculados en el periodo.", descripcion: "Cuenta personas, no matrículas por materia.", formato: "entero", calculo: agg("dv_matric", "distintos", "codigo"), reglas: [] },
  { id: "promedio_matriculados", nombre: "Promedio acumulado de los matriculados", carpeta: "Matrícula", receta: "Promedio del promedio acumulado de la ficha de matrícula.", descripcion: "Un estudiante, un valor.", formato: "decimal", calculo: agg("dv_matric", "promediar", "promedio_acumulado"), reglas: [] },
  { id: "nuevos_matriculados", nombre: "Nuevos matriculados", carpeta: "Matrícula", receta: "Estudiantes distintos de la lista de nuevos matriculados.", descripcion: "Es la lista de Master; la de Davinci incluye reintegros.", formato: "entero", calculo: agg("ms_nuevos", "distintos", "codigo"), reglas: [] },
  { id: "condicionales", nombre: "Estudiantes condicionales", carpeta: "Permanencia", receta: "Estudiantes distintos con alguna condicionalidad.", descripcion: "Una condicionalidad es una condición académica o financiera abierta.", formato: "entero", calculo: agg("dv_cond", "distintos", "codigo"), reglas: [] },
  { id: "desertores", nombre: "Desertores", carpeta: "Permanencia", receta: "Estudiantes distintos del histórico de deserción, por periodo.", descripcion: "Requiere pasar las columnas de periodo a filas para poder filtrar por periodo.", formato: "entero", calculo: agg("dv_deser", "distintos", "estudiante"), reglas: ["pivotar_periodos"] },
  { id: "tasa_desercion", nombre: "Tasa de deserción", carpeta: "Permanencia", receta: "Desertores ÷ estudiantes matriculados, por cien. División segura.", descripcion: "Cruza dos fuentes por periodo y programa. Si el programa se escribe distinto en cada una, aprobar primero las equivalencias.", formato: "porcentaje", calculo: razon(agg("dv_deser", "distintos", "estudiante"), agg("dv_matric", "distintos", "codigo")), reglas: ["pivotar_periodos"], recomendada: true },
  { id: "graduados", nombre: "Graduados", carpeta: "Resultados", receta: "Estudiantes distintos graduados en el periodo.", descripcion: "El periodo es el de la carga, no el de la fecha de grado.", formato: "entero", calculo: agg("dv_grad", "distintos", "codigo"), reglas: [] },
  { id: "promedio_grado", nombre: "Nota de grado", carpeta: "Resultados", receta: "Promedio de la nota de los graduados.", descripcion: "Solo gradúan con nota las modalidades que la reportan.", formato: "decimal", calculo: agg("dv_grad", "promediar", "nota"), reglas: [] },
  { id: "homologaciones", nombre: "Homologaciones", carpeta: "Resultados", receta: "Estudiantes distintos con homologación.", descripcion: "Una persona con varias homologaciones cuenta una vez.", formato: "entero", calculo: agg("dv_homol", "distintos", "codigo"), reglas: [] },
  // Cruzadas entre fuentes
  { id: "prueba_por_departamento", nombre: "Estudiantes en prueba por departamento", carpeta: "Cruzadas", receta: "Estudiantes en prueba (Promedios) agrupados por el departamento de su programa.", descripcion: "Solo es fiable con la tabla de equivalencias Programa → Departamento aprobada.", formato: "entero", calculo: agg("dv_prom", "distintos", "codigo", EN_PRUEBA), reglas: ["programa_es_departamento"] },
  // Evaluación docente
  { id: "resultado_evaluacion", nombre: "Resultado de la evaluación docente", carpeta: "Docentes", receta: "Promedio de los resultados de la evaluación consolidada.", descripcion: "Un docente, un valor. El docente va como seudónimo.", formato: "decimal", calculo: agg("ms_eval", "promediar", "promedio_de_los_resultados"), reglas: [] },
];

export const medidaPorId = (id: string): MedidaBI | undefined => MEDIDAS.find((m) => m.id === id);

/** División segura: vacío si el denominador no existe o es cero. */
export function razonSegura(numerador: number | null, denominador: number | null, porCien = false): number | null {
  if (numerador === null || denominador === null || denominador === 0) return null;
  const r = numerador / denominador;
  return porCien ? r * 100 : r;
}

/** Las fuentes que necesita un cálculo. */
export function fuentesDe(c: Calculo): string[] {
  if (c.tipo === "agregado") return [c.fuente];
  if (c.tipo === "razon") return [...new Set([...fuentesDe(c.numerador), ...fuentesDe(c.denominador)])];
  const base = medidaPorId(c.base);
  return base ? fuentesDe(base.calculo) : [];
}

/** Por qué una medida no se puede usar con estas fuentes y reglas; null si se puede. */
export function noDisponible(m: MedidaBI, seleccion: string[], aplicadas: TipoRegla[]): string | null {
  const faltan = fuentesDe(m.calculo).filter((id) => !seleccion.includes(id));
  if (faltan.length) return `Requiere ${faltan.map((id) => fuentePorId(id)?.nombre ?? id).join(" y ")}`;
  const sinRegla = m.reglas.filter((r) => !aplicadas.includes(r));
  if (sinRegla.length) return "Falta aprobar la reconstrucción que la hace fiable";
  return null;
}

/** Una medida simple, en la forma que entiende wh_explorar. Las razones y los cambios devuelven sus partes. */
export function partesParaExplorar(c: Calculo): { fuente: string; op: OperacionBI; col?: string; filtros?: FiltroBI[] }[] {
  if (c.tipo === "agregado") return [{ fuente: c.fuente, op: c.op, col: c.columna, filtros: c.filtros }];
  if (c.tipo === "razon") return [...partesParaExplorar(c.numerador), ...partesParaExplorar(c.denominador)];
  const base = medidaPorId(c.base);
  return base ? partesParaExplorar(base.calculo) : [];
}
