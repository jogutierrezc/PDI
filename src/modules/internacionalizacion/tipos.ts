/* =============================================================================
   Internacionalización · el contrato del módulo.

   Las filas de la base (migración 0151) viven en src/types/database.ts y se
   reexportan aquí. Lo demás son los tipos que comparten la lógica pura (lib/),
   los hooks (datos.ts) y, después, las pantallas.
   ========================================================================== */

import type {
  IntCalculo,
  IntColumnaRow,
  IntConceptoRow,
  IntEstado,
  IntFilaRow,
  IntHojaRow,
  IntLibroRow,
  IntRol,
  IntValor,
} from "../../types/database";

export type {
  IntAportanteRow,
  IntCalculo,
  IntCarpetaRow,
  IntColumnaRow,
  IntConceptoRow,
  IntEnvioHistorialRow,
  IntEnvioRow,
  IntEnvioSniesRow,
  IntEstado,
  IntFilaRow,
  IntHojaRow,
  IntInvitacionRow,
  IntLibroRow,
  IntMiembroRow,
  IntPeriodoRow,
  IntPlantillaColumnaRow,
  IntPlantillaRow,
  IntReaperturaRow,
  IntRol,
  IntTipo,
  IntValor,
  IntVentanaRow,
} from "../../types/database";

/** Un campus, tal como está en public.campuses (la fuente de siempre). */
export interface Campus {
  id: string;
  slug: string;
  code: string;
  name: string;
}

/** Mis papeles en el módulo (RPC int_yo). La administración de la intranet llega como director. */
export interface Yo {
  director: boolean;
  /** Campus donde coordina. */
  coordinador: string[];
  /** Campus donde es gestor. */
  gestor: string[];
  /** Planeación (0166): ve y administra el módulo sin ser Director. */
  planeacion?: boolean;
  /** Puede crear carpetas y tablas por campus (Director, Planeación o un Coordinador). */
  crea?: boolean;
  /** Controla las tablas Multicampus (Director, Planeación o el Coordinador de Bucaramanga). */
  multicampus?: boolean;
  /** El campus central (Bucaramanga): sus Gestores y Coordinador editan las filas de todos en Multicampus. */
  central?: string | null;
}

/** Lo mínimo de un concepto que usa la lógica pura (el catálogo de la base o CONCEPTOS_BASE). */
export type Concepto = Pick<IntConceptoRow, "id" | "nombre" | "tipo" | "opciones" | "sinonimos"> &
  Partial<Pick<IntConceptoRow, "implicito" | "personal">>;

/** Lo mínimo de una columna que usa la lógica pura. */
export type Columna = Pick<IntColumnaRow, "clave" | "etiqueta" | "tipo" | "concepto_id" | "obligatorio" | "opciones"> & {
  calculo?: IntCalculo | null;
};

/** Datos de una fila: {clave de columna: valor}. */
export type Datos = Record<string, IntValor>;

/** Un error de una fila, en español, para mostrar junto a la celda. */
export interface ErrorCelda {
  /** Fila en la hoja de Excel (1 = primera fila del archivo) o índice en la grilla. */
  fila: number;
  /** Clave de la columna; nulo si el error es de la fila entera. */
  columna: string | null;
  mensaje: string;
}

/** Libro con sus hojas y columnas, ya armado (lo devuelve useEstructura). */
export interface LibroCompleto extends IntLibroRow {
  hojas: (IntHojaRow & { columnas: IntColumnaRow[] })[];
}

/** Una fila con lo que la lógica pura necesita saber de su hoja y su estado. */
export interface FilaConEstado extends Pick<IntFilaRow, "id" | "hoja_id" | "campus_id" | "datos"> {
  estado: IntEstado;
}

/** Contexto mínimo de permisos de una persona frente a un campus. */
export type RolEnCampus = IntRol | null;
