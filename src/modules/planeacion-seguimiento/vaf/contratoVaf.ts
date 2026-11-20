/* Planeación y Seguimiento · VAF · lo que la interfaz le pide a la capa de datos (PsApi lo extiende).
   Dos implementaciones: memoriaVaf.ts (demostración y pruebas) y supabaseVaf.ts (contrato CONTRATO-BD-F3B.md §6, migración 0290). */

import type { AlertaVigilancia, ConfigVaf, DatosEvaluacion, DatosFinanciacion, DatosMov, EvaluacionVaf, MovPresupuesto, PresupuestoLinea, PresupuestoPlan, TipoMov, Umbrales, EstadoFinanciacion } from "./modeloVaf";

/** Una fila de la carga masiva de financiación (`ps_vaf_lineas_cargar`). */
export interface FilaFinanciacion {
  /** La clave (N.º) de la línea. */
  linea: string;
  anio: number;
  montoAprobado: number;
  fuente: string;
  estado: EstadoFinanciacion;
  nota: string;
}
/** Una fila de la carga masiva de ejecución (`ps_presupuesto_cargar`). */
export interface FilaMov {
  linea: string;
  anio: number;
  tipo: TipoMov;
  monto: number;
  fecha: string;
  fuente: string;
  referencia: string;
  nota: string;
}
export interface ErrorCargaVaf {
  /** Posición (desde 1) dentro de lo enviado; nulo si es de toda la carga. */
  fila: number | null;
  campo: string;
  mensaje: string;
}
export interface ResultadoCargaVaf {
  cargadas: number;
  recibidas: number;
  errores: ErrorCargaVaf[];
}

export interface PsApiVaf {
  /** `ps_vaf_pendientes`: la cola (por evaluar y en revisión), la más antigua primero. */
  vafPendientes(): Promise<EvaluacionVaf[]>;
  /** `ps_vaf_evaluaciones`: el historial de un plan, la más reciente primero. */
  vafEvaluaciones(planId: string): Promise<EvaluacionVaf[]>;
  /** `ps_vaf_en_revision`. */
  vafEnRevision(evaluacionId: string): Promise<EvaluacionVaf>;
  /** `ps_vaf_evaluar`. */
  vafEvaluar(planId: string, versionId: string, d: DatosEvaluacion): Promise<EvaluacionVaf>;
  /** `ps_vaf_linea_evaluar`: `lineaId` es `ps_lineas.id` (la identidad estable de la línea). */
  vafLineaEvaluar(lineaId: string, d: DatosFinanciacion): Promise<void>;
  /** `ps_vaf_lineas_cargar`: todo o nada. */
  vafLineasCargar(planId: string, filas: FilaFinanciacion[]): Promise<ResultadoCargaVaf>;
  /** `ps_presupuesto_plan`: solo las líneas que la persona ve. */
  presupuestoPlan(planId: string): Promise<PresupuestoPlan>;
  /** `ps_presupuesto_linea`. */
  presupuestoLinea(lineaId: string): Promise<PresupuestoLinea>;
  /** `ps_presupuesto_registrar`. */
  presupuestoRegistrar(lineaId: string, d: DatosMov): Promise<MovPresupuesto>;
  /** `ps_presupuesto_anular`: motivo de 10 a 1000 caracteres. */
  presupuestoAnular(movId: string, motivo: string): Promise<MovPresupuesto>;
  /** `ps_presupuesto_cargar`: todo o nada. */
  presupuestoCargar(planId: string, filas: FilaMov[]): Promise<ResultadoCargaVaf>;
  /** `ps_vigilancia_plan`. */
  vigilanciaPlan(planId: string): Promise<AlertaVigilancia[]>;
  /** `ps_vigilancia_global`. */
  vigilanciaGlobal(): Promise<AlertaVigilancia[]>;
  /** Umbrales de vigilancia del plan (`ps_plan_config_leer().vigilancia`). */
  umbralesPlan(planId: string): Promise<Umbrales>;
  /** `ps_plan_config_guardar(p_plan, {vigilancia})`. */
  guardarUmbrales(planId: string, u: Umbrales): Promise<Umbrales>;
  /** `ps_vaf_config_leer`. */
  vafConfigLeer(): Promise<ConfigVaf>;
  /** `ps_vaf_config_guardar` (administrador). */
  vafConfigGuardar(unidadId: string | null): Promise<ConfigVaf>;
}
