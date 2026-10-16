/* =============================================================================
   Programas en Cifras · el contrato del módulo.

   Las filas de la base (migración 0164) viven en src/types/database.ts y se
   reexportan aquí. Lo demás son los tipos que comparten la lógica pura (lib/),
   los hooks (datos.ts) y, después, las pantallas.

   Vocabulario: un PROGRAMA es una unidad `units.kind = 'programa'`; un CAMPUS
   es una fila de `public.campuses`. Trabajan por pareja programa × campus.
   ========================================================================== */

import type { PcArchivoRow, PcColumnaRow, PcDestinoColumnaRow, PcDestinoRow, PcDominioRow, PcRol, PcTipo, PcValor } from "../../types/database";

export type {
  PcActividadRow,
  PcArchivoRow,
  PcArchivoTipo,
  PcCarpetaRow,
  PcColumnaRow,
  PcDestinoColumnaRow,
  PcDestinoRow,
  PcDominioRow,
  PcEstado,
  PcFilaRow,
  PcMapa,
  PcMiembroRow,
  PcPeriodoCerradoRow,
  PcRespuestaRow,
  PcRol,
  PcSistema,
  PcTipo,
  PcValor,
  PcVentanaRow,
} from "../../types/database";

/** Un campus, tal como está en public.campuses. */
export interface Campus {
  id: string;
  slug: string;
  code: string;
  name: string;
}

/** Papel frente a un programa y campus. «planeacion» solo lee. */
export type PcRolEfectivo = PcRol | "planeacion" | null;

/** Una pareja programa × campus a la que la persona tiene acceso (RPC pc_yo). */
export interface ProgramaCampus {
  programa_id: string;
  campus_id: string;
  rol: Exclude<PcRolEfectivo, null>;
  programa: string;
  programa_codigo: string;
  campus: string;
}

/** Mis papeles en el módulo (RPC pc_yo). */
export interface Yo {
  /** Rol de Planeación (o administración de la intranet): lee todo, no edita nada. */
  planeacion: boolean;
  /** Las parejas a las que accedo: las mías como Director o Coordinador y, para Planeación, todas las demás. */
  programas: ProgramaCampus[];
}

/** Datos de una fila: {clave de columna: valor}. */
export type Datos = Record<string, PcValor>;

/** Lo mínimo de una columna que usa la lógica pura (la de la base o la que arma un asistente). */
export type Columna = Pick<PcColumnaRow, "clave" | "etiqueta" | "tipo" | "obligatorio" | "opciones"> &
  Partial<Pick<PcColumnaRow, "solo_lectura" | "posterior_a" | "personal">>;

/** Un error de una celda, en español, para mostrar junto a ella. */
export interface ErrorCelda {
  /** Índice de la fila en la grilla (0 = primera) o número de fila del Excel. */
  fila: number;
  /** Clave de la columna; nulo si el error es de toda la fila. */
  columna: string | null;
  mensaje: string;
}

/** Un archivo con sus columnas, ya armado (lo devuelve useEstructuraArchivos). */
export interface ArchivoCompleto extends PcArchivoRow {
  columnas: PcColumnaRow[];
}

/** Un destino con sus columnas y su lista de dominio resuelta. */
export interface DestinoCompleto extends PcDestinoRow {
  columnas: (PcDestinoColumnaRow & { opciones: string[] })[];
}

/** Un destino del catálogo local (espejo de la semilla de 0164). */
export interface DestinoLocal extends Omit<PcDestinoRow, "tipo_archivo"> {
  tipo_archivo: PcDestinoRow["tipo_archivo"];
  columnas: ColumnaDestino[];
}

export interface ColumnaDestino {
  clave: string;
  etiqueta: string;
  tipo: PcTipo;
  obligatorio: boolean;
  /** Id del dominio (lista cerrada) que acepta; solo si tipo = lista. */
  dominio?: string;
  /** Origen de sistema; la columna no se edita. */
  solo_lectura?: string;
  /** Clave de la fecha que esta debe igualar o superar. */
  posterior_a?: string;
  personal?: boolean;
  /** Otros nombres con que suele llegar en un Excel (para el emparejamiento). */
  sinonimos?: string[];
  nota?: string;
}

export type DominioLocal = Pick<PcDominioRow, "id" | "nombre" | "opciones" | "numerado">;

/** Resumen de un archivo en el explorador (RPC pc_resumen_archivos). */
export interface ResumenArchivo {
  archivo_id: string;
  filas: number;
  errores: number;
}

/** Estado de la ventana de observación (RPC pc_estado_periodos). */
export interface EstadoPeriodos {
  ventana: { anios: 5 | 6 | 8 | 10; hasta: string } | null;
  periodos: { codigo: string; cerrado: boolean; cerrado_en: string | null }[];
  /** El próximo periodo que se puede cerrar, o nulo si está completa o no hay ventana. */
  siguiente: string | null;
  completa: boolean;
  cerrados: number;
  total: number;
}

/** Un error de validación de una celda tal como lo devuelve la base (pc_errores_archivo). */
export interface ErrorArchivo {
  fila_id: string;
  orden: number;
  clave: string;
  mensaje: string;
}
