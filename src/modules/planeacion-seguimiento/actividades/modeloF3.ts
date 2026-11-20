/* =============================================================================
   Planeación y Seguimiento · Fase 3 · modelo de avances, evidencias, riesgos,
   conexión con el PDI y plazos de aviso por oficina (CONTRATO-BD-F3.md). Sin DOM.
   ========================================================================== */

/* ---------- Conexión con el PDI ---------- */

export type ConexionPdi = "sin_definir" | "con_pdi" | "sin_pdi";
export const ROTULO_PDI: Record<ConexionPdi, string> = { sin_definir: "PDI sin definir", con_pdi: "Con PDI", sin_pdi: "Sin conexión con el PDI" };
export const MAX_ITEMS_PDI = 12;

/** Lo que se envía a la base: `{conexion, items:[{pillar_id, action_line_id|null}]}`. */
export interface SeleccionPdi {
  conexion: ConexionPdi;
  items: { pillarId: string; lineaId: string | null }[];
}

/** Lo que devuelve la base en `ActividadJSON.pdi` (con los nombres ya resueltos). */
export interface ItemPdi {
  pillarId: string;
  pilar: string;
  pilarSlug: string | null;
  area: string | null;
  lineaId: string | null;
  lineaCodigo: string | null;
  linea: string | null;
}
export interface PdiActividad {
  conexion: ConexionPdi;
  items: ItemPdi[];
}

export interface LineaCatalogo {
  lineaId: string;
  codigo: string;
  nombre: string;
}
export interface AreaCatalogo {
  areaId: string;
  codigo: string;
  nombre: string;
  lineas: LineaCatalogo[];
}
export interface PilarCatalogo {
  pillarId: string;
  codigo: string;
  nombre: string;
  areas: AreaCatalogo[];
}

export interface ResumenPdi {
  conPdi: number;
  sinPdi: number;
  sinDefinir: number;
  porPilar: { pillarId: string; nombre: string; actividades: number }[];
}

/* ---------- Avances ---------- */

export type EstadoAvance = "pendiente" | "validado" | "devuelto";
export const ROTULO_AVANCE: Record<EstadoAvance, string> = { pendiente: "Por validar", validado: "Validado", devuelto: "Devuelto" };

export interface PersonaAv {
  id: string;
  nombre: string;
}

export interface Evidencia {
  id: string;
  tipo: "archivo" | "enlace";
  nombre: string;
  url: string | null;
  storagePath: string | null;
  mime: string | null;
  bytes: number | null;
  huella: string | null;
  creadaEn: string;
}

export interface Avance {
  id: string;
  actividadId: string;
  fecha: string;
  fisico: number;
  /** Nulo = no aplica. */
  financiero: number | null;
  nota: string;
  estado: EstadoAvance;
  reportadoPor: PersonaAv;
  reportadoEn: string;
  revisadoPor: PersonaAv | null;
  revisadoEn: string | null;
  notaRevision: string | null;
  /** Pasó el plazo de validación sin que nadie lo revisara. */
  vencido: boolean;
  /** Cierre administrativo del gestor: autor y revisor son la misma persona; queda para auditoría. */
  autovalidado?: boolean;
  evidencias: Evidencia[];
}

/** Resumen del avance validado de una actividad (el del último avance `validado`; sin ninguno, 0). */
export interface AvanceActividad {
  fisico: number;
  financiero: number | null;
  validadoEn: string | null;
  pendientes: number;
}
export const SIN_AVANCE: AvanceActividad = { fisico: 0, financiero: null, validadoEn: null, pendientes: 0 };

export interface NuevaEvidencia {
  tipo: "archivo" | "enlace";
  nombre: string;
  storagePath?: string | null;
  url?: string | null;
  mime?: string | null;
  bytes?: number | null;
  huella?: string | null;
}

export type NivelRiesgo = "Crítico" | "Alto" | "Medio" | "Bajo";
export const NIVELES_RIESGO: readonly NivelRiesgo[] = ["Crítico", "Alto", "Medio", "Bajo"];
export type EstadoRiesgo = "abierto" | "mitigando" | "cerrado";
export const ROTULO_RIESGO: Record<EstadoRiesgo, string> = { abierto: "Abierto", mitigando: "Mitigando", cerrado: "Cerrado" };
export type EstadoAccion = "pendiente" | "en_curso" | "hecha";
export const ROTULO_ACCION: Record<EstadoAccion, string> = { pendiente: "Pendiente", en_curso: "En curso", hecha: "Hecha" };

export interface DatosRiesgo {
  titulo: string;
  descripcion: string;
  nivel: NivelRiesgo;
  mitigacion: string;
}

export interface Accion {
  id: string;
  riesgoId: string;
  texto: string;
  responsableId: string | null;
  vence: string | null;
  estado: EstadoAccion;
}

export interface Riesgo {
  id: string;
  actividadId: string;
  titulo: string;
  descripcion: string;
  nivel: NivelRiesgo;
  estado: EstadoRiesgo;
  mitigacion: string;
  creadoPor: PersonaAv;
  creadoEn: string;
  cerradoEn: string | null;
  acciones: Accion[];
}

export interface DatosAccion {
  texto: string;
  responsableId: string | null;
  vence: string | null;
}

export interface Comentario {
  id: string;
  autor: string;
  tipo: "comentario" | "transferencia" | "devolucion" | "asignacion" | "cambio_estado";
  texto: string;
  creadoEn: string;
}

export interface DatosAvance {
  fecha: string;
  fisico: number;
  financiero: number | null;
  nota: string;
  evidencias: NuevaEvidencia[];
  riesgo: DatosRiesgo | null;
}

/** Un avance en la cola «Por validar» (`ps_avances_por_validar`). */
export interface PorValidar {
  avance: Avance;
  actividad: { id: string; titulo: string; oficinaId: string; oficina: string; fin: string | null };
  horasEsperando: number;
  vencido: boolean;
  puedeValidar: boolean;
}

export interface ResultadoLote {
  validados: number;
  /** Cuántas actividades pasaron a «Hecho» con esa validación. */
  completadas: number;
}

/* ---------- Plazos de aviso por oficina ---------- */

export interface ConfigAvisos {
  diasAntes: number[];
  vencidaMaxAvisos: number;
  vencidaGestorHoras: number;
  validarHoras: number;
  activo: boolean;
}
export interface ConfigOficina {
  porDefecto: ConfigAvisos;
  propia: ConfigAvisos | null;
  efectiva: ConfigAvisos;
}
