/* Planeación y Seguimiento · Fase 2 · lo que la interfaz le pide a la capa de datos (PsApi lo extiende).
   Dos implementaciones: memoria.ts (demostración y pruebas) y supabaseAct.ts (PENDIENTE DE CONTRASTAR con CONTRATO-BD-F2). */

import type { Actividad, ActividadDetalle, AvisoPrevio, DatosActividad, EstadoAct, LineaOficina, MiembroEquipo, OficinaVista } from "./modelo";

export interface PersonaRef {
  id: string;
  nombre: string;
  correo: string;
}

/** Una persona con campus propio y una actividad de otro campus: la base no asigna sin que quien asigna lo confirme. */
export interface ConflictoCampus {
  personaId: string;
  nombre: string;
  campusPersona: string | null;
  campusActividad: string | null;
  actividadId?: string;
}

/** Resultado de una acción que avisa por correo. Con `conflictos` NO se cambió nada: hay que confirmar el campus y repetirla. */
export interface ResultadoAccion {
  avisara: AvisoPrevio[];
  conflictos: ConflictoCampus[];
}

export interface ErrorCargaAct {
  /** Posición (desde 1) dentro de lo enviado; nulo si es de toda la carga. */
  fila: number | null;
  campo: string;
  mensaje: string;
  /** El error es una diferencia de campus que se puede confirmar. */
  campus?: boolean;
}

export interface ResultadoCargaAct {
  recibidas: number;
  creadas: number;
  errores: ErrorCargaAct[];
  avisara: AvisoPrevio[];
}

export interface PsApiAct {
  /** «Hoy» para vencimientos: en la intranet, la fecha real; en la demostración, una fija (30 jun 2027). */
  hoy: string;
  /** Los datos son de demostración (se rotulan así en pantalla). */
  demo: boolean;
  /** La persona de la sesión (nula si no hay perfil). */
  yo(): Promise<PersonaRef | null>;
  /** Oficinas que la persona ve, con su papel (con herencia) y poder efectivo. */
  oficinasVisibles(): Promise<OficinaVista[]>;
  /** Directorio de las personas de las oficinas visibles (para los avatares). */
  personas(): Promise<PersonaRef[]>;
  /** Miembros de la oficina con su carga actual. */
  equipo(oficinaId: string): Promise<MiembroEquipo[]>;
  /** Líneas del plan vigente que la oficina tiene a su cargo. */
  lineasDeOficina(oficinaId: string): Promise<LineaOficina[]>;
  actividades(oficinaIds: string[]): Promise<Actividad[]>;
  actividad(id: string): Promise<ActividadDetalle>;
  /** Crea (sin `id`) o edita. Devuelve a quién se avisará por correo (lo envía el servidor). `id` nulo + conflictos: hay que confirmar el campus. */
  guardarActividad(d: DatosActividad, confirmarCampus?: boolean): Promise<ResultadoAccion & { id: string | null }>;
  /** `nota` (≥ 20 caracteres) solo cuando se DEVUELVE una actividad de «En revisión» (contrato: ps_actividad_mover). */
  moverActividad(id: string, estado: EstadoAct, nota?: string): Promise<void>;
  /** Agrega a una persona a varias actividades (asignación masiva, todo o nada). */
  asignar(ids: string[], personaId: string, confirmarCampus?: boolean): Promise<ResultadoAccion>;
  transferir(id: string, de: string, a: string, motivo: string, confirmarCampus?: boolean): Promise<ResultadoAccion>;
  marcarChecklist(id: string, itemId: string, hecho: boolean): Promise<void>;
  agregarItemChecklist(id: string, texto: string): Promise<void>;
  /** Todo o nada: si una fila no pasa, no se crea ninguna. */
  cargarActividades(oficinaId: string, filas: DatosActividad[], nombreArchivo: string, confirmarCampus?: boolean): Promise<ResultadoCargaAct>;
}
