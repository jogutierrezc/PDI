/* =============================================================================
   Reporte por oficinas del ranking THE · el contrato entre la base (0149), el
   Excel de THE y las pantallas.

   Un ciclo tiene un catálogo de indicadores (importado del Excel), una
   asignación de cada indicador a una oficina principal y, opcionalmente, a
   oficinas de apoyo, y una respuesta por indicador y oficina con sus
   evidencias. Este archivo no usa red ni React: lo comparten la lógica pura,
   las pantallas y las pruebas.
   ========================================================================== */

/** Nivel de una fila del catálogo: métrica (4.2), indicador (4.3.1) u opción (un campo del indicador). */
export type Nivel = "metric" | "indicator" | "option";

/** ev: evidencia. doc: documento institucional. dato: cifra. inv: investigación que calcula THE. */
export type TipoIndicador = "ev" | "doc" | "dato" | "inv";

export type Prioridad = "alta" | "media" | "baja";

/** Estados de una respuesta. */
export type EstadoRespuesta = "none" | "draft" | "sent" | "back" | "ok";

/** Papel de quien actúa frente a una oficina: Planeación gana siempre; si no, el de su pertenencia. */
export type RolActor = "planeacion" | "jefe" | "editor" | "visor";

export type RolAsignacion = "principal" | "apoyo";

export type EstadoCiclo = "preparacion" | "abierto" | "cerrado";

/** Un indicador del catálogo, tal como está en `ranking_indicators`. */
export interface Indicador {
  /** «4.3.1»; las opciones suman «/n» («4.3.1/2»). */
  id: string;
  ods: number;
  nivel: Nivel;
  /** Métrica de la que cuelga (4.3 para 4.3.1), o indicador de la que cuelga una opción (4.3.1). */
  padre: string | null;
  /** Nulo solo en las métricas. */
  tipo: TipoIndicador | null;
  texto_en: string;
  texto_es: string;
  /** Peso en el ODS, entre 0 y 1 (0,154 = 15,4 %). */
  peso: number | null;
  prioridad: Prioridad | null;
  tipo_requerimiento: string;
  orden: number;
}

/** Una oficina asignada a un indicador. */
export interface Asignacion {
  indicador: string;
  unidad: string;
  rol: RolAsignacion;
}

/** Una respuesta de una oficina a un indicador (`ranking_responses`). */
export interface Respuesta {
  id: string;
  indicador: string;
  unidad: string;
  /** Cifras por campo: clave = id de la opción o del indicador; valor numérico o nulo. */
  valores: Record<string, number | null>;
  si_no: boolean | null;
  estado: EstadoRespuesta;
  comentario_es: string;
  comentario_en: string;
  nota_revision: string;
  /** Marcada por Planeación como la que va a THE (0150). */
  oficial?: boolean;
}

/** Quién aportó a un indicador, sin el contenido (RPC ranking_aportes, 0150): lo ve cualquier oficina. */
export interface AporteRef {
  indicador: string;
  unidad: string;
  unidad_nombre: string;
  estado: EstadoRespuesta;
  oficial: boolean;
}

/** Chequeo de una evidencia (análisis-evidencia.ts). */
export type NivelChequeo = "ok" | "warn" | "risk";

export interface Chequeo {
  nivel: NivelChequeo;
  texto: string;
}

/** Relevancia de una evidencia para el indicador: específica, general o no pertinente. */
export type Relevancia = "s" | "g" | "n";
