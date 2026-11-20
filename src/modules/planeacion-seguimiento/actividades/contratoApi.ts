/* Planeación y Seguimiento · Fase 2 · lo que la interfaz le pide a la capa de datos (PsApi lo extiende).
   Dos implementaciones: memoria.ts (demostración y pruebas) y supabaseAct.ts (PENDIENTE DE CONTRASTAR con CONTRATO-BD-F2). */

import type { Actividad, ActividadDetalle, AvisoPrevio, DatosActividad, EstadoAct, LineaOficina, MiembroEquipo, OficinaVista } from "./modelo";
import type { Accion, Avance, ConfigAvisos, ConfigOficina, DatosAccion, DatosAvance, DatosRiesgo, EstadoAccion, EstadoRiesgo, Evidencia, NuevaEvidencia, PilarCatalogo, PorValidar, ResultadoLote, ResumenPdi, Riesgo } from "./modeloF3";

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

  /* ---------- Fase 3 (CONTRATO-BD-F3.md) ---------- */
  /** `ps_pdi_catalogo`: pilares publicados → áreas → líneas de acción. */
  catalogoPdi(): Promise<PilarCatalogo[]>;
  /** `ps_resumen_pdi_oficina`. */
  resumenPdi(oficinaId: string): Promise<ResumenPdi>;
  /** `ps_avance_reportar`: crea el avance `pendiente`, enlaza las evidencias, mueve la actividad a «En revisión» y avisa al gestor. */
  reportarAvance(actividadId: string, datos: DatosAvance): Promise<{ avance: Avance; avisara: AvisoPrevio[] }>;
  /** Sube un archivo al bucket privado `ps-evidencias` (`<oficina>/<actividad>/<uuid>-<nombre>`); la huella SHA-256 la calcula el navegador. */
  subirEvidencia(oficinaId: string, actividadId: string, archivo: File, huella: string): Promise<NuevaEvidencia>;
  /** URL firmada (corta) de una evidencia de tipo archivo; para un enlace, su propia URL. */
  urlEvidencia(e: Pick<Evidencia, "tipo" | "url" | "storagePath" | "nombre">): Promise<string>;
  /** `ps_avance_validar`. `nota` opcional. */
  validarAvance(id: string, nota?: string): Promise<void>;
  /** `ps_avance_devolver`: nota de al menos 20 caracteres. */
  devolverAvance(id: string, nota: string): Promise<void>;
  /** `ps_avances_validar_lote`: hasta 50, todo o nada. */
  validarLote(ids: string[]): Promise<ResultadoLote>;
  /** `ps_actividad_cerrar`: cierre administrativo del gestor (queda auditado). */
  cerrarActividad(id: string, nota: string): Promise<{ autovalidado: boolean }>;
  /** `ps_avances_por_validar`: la cola del gestor, la más antigua primero; sin oficina, todas en las que es gestor. */
  avancesPorValidar(oficinaId?: string | null): Promise<PorValidar[]>;
  /** `ps_mis_avances`: lo que la persona reportó, con su estado y la nota de revisión. */
  misAvances(): Promise<Avance[]>;
  crearRiesgo(actividadId: string, d: DatosRiesgo): Promise<Riesgo>;
  editarRiesgo(id: string, cambios: Partial<DatosRiesgo> & { estado?: EstadoRiesgo }): Promise<void>;
  cerrarRiesgo(id: string, nota: string): Promise<void>;
  crearAccion(riesgoId: string, d: DatosAccion): Promise<Accion>;
  editarAccion(id: string, cambios: Partial<DatosAccion>): Promise<void>;
  marcarAccion(id: string, estado: EstadoAccion): Promise<void>;
  /** `ps_comentar`. */
  comentar(actividadId: string, texto: string): Promise<void>;
  /** `ps_config_oficina_leer`. */
  leerConfigAvisos(oficinaId: string): Promise<ConfigOficina>;
  /** `ps_config_oficina_guardar`. */
  guardarConfigAvisos(oficinaId: string, c: ConfigAvisos): Promise<ConfigOficina>;
  /** `ps_config_oficina_quitar`: vuelve al general. */
  quitarConfigAvisos(oficinaId: string): Promise<ConfigOficina>;
}
