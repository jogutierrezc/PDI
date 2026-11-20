/* Planeación y Seguimiento · proyectos · lo que la interfaz le pide a la capa de datos (PsApi lo extiende).
   Dos implementaciones: memoriaProy.ts (demostración y pruebas) y supabaseProy.ts (migración 0291; ver el contrato de la base). */

import type { LineaOficina } from "../actividades/modelo";
import type { Linea } from "../modelo";
import type { DatosEvaluacionProyecto, DatosProyecto, EvaluacionProyecto, ResumenAprobacion } from "./modeloProy";

/** Un proyecto de otra oficina al que se puede aportar con una actividad (`ps_lineas_para_actividad`). */
export interface LineaDeOtraOficina extends LineaOficina {
  oficinaId: string;
  oficinaNombre: string;
}
export interface LineasParaActividad {
  /** Las que la oficina tiene a su cargo. */
  propias: LineaOficina[];
  /** Las de otras oficinas del plan (aportar a otra oficina avisa a su gestor). */
  otras: LineaDeOtraOficina[];
  /** Cuántos proyectos del plan tienen oficina asignada, y cuántos hay. */
  conOficina: number;
  total: number;
}

export interface PsApiProy {
  /** Evaluar un proyecto (`ps_proyecto_evaluar`): solo financiero y administrador. */
  proyectoEvaluar(planId: string, no: string, d: DatosEvaluacionProyecto): Promise<EvaluacionProyecto>;
  /** Historial de evaluaciones de un proyecto, la más reciente primero. */
  proyectoEvaluaciones(planId: string, no: string): Promise<EvaluacionProyecto[]>;
  /** `ps_resumen_aprobacion`: solicitado vs aprobado del plan. */
  resumenAprobacion(planId: string): Promise<ResumenAprobacion>;
  /** `ps_vaf_abrir_pendientes`: abre la evaluación de los planes ya publicados que no la tienen (administrador y financiero). */
  vafAbrirPendientes(): Promise<{ abiertas: number; planes: string[] }>;
  /** Alta (sin `no`) o edición de un proyecto de la versión borrador; si el plan no tiene borrador, lo crea. */
  proyectoGuardar(planId: string, d: DatosProyecto, no?: string): Promise<Linea>;
  proyectoEliminar(planId: string, no: string): Promise<void>;
  /** `ps_plan_enviar_a_evaluacion`: revalida, publica la versión y abre la evaluación de la VAF. Con errores lanza el primero. */
  planEnviarEvaluacion(planId: string, nota: string): Promise<{ etiqueta: string }>;
  /** `ps_asignar_oficinas_lineas`: la oficina responsable de varios proyectos (nula la quita). Solo el administrador. */
  proyectosAsignarOficina(planId: string, claves: string[], oficinaId: string | null): Promise<{ asignadas: number }>;
  /** `ps_lineas_para_actividad`. */
  lineasParaActividad(oficinaId: string): Promise<LineasParaActividad>;
}
