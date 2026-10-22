/* =============================================================================
   UDrive · tipos (migración 0187).

   Las filas de las tablas de la base y la forma de `contenido` de cada tipo de
   archivo. Una tabla, una gráfica o un cruce se identifican por su id: la fase
   siguiente (documento por bloques) los insertará como bloques que apuntan a él.
   ========================================================================== */

export type TipoItem = "archivo" | "tabla" | "grafica" | "cruce" | "documento";
export type EstadoItem = "borrador" | "listo";
export type RolDrive = "propietario" | "editor" | "lector";

export interface CarpetaRow {
  id: string;
  padre_id: string | null;
  nombre: string;
  creada_por: string;
  borrado_en: string | null;
  created_at: string;
  updated_at: string;
}

/** Un archivo sin su `contenido` (que puede pesar mucho): lo que el explorador lista. */
export interface ArchivoRow {
  id: string;
  carpeta_id: string | null;
  tipo: TipoItem;
  nombre: string;
  mime: string | null;
  tamano: number | null;
  ruta_storage: string | null;
  resumen: { filas?: number; columnas?: number };
  estado: EstadoItem;
  creada_por: string;
  borrado_en: string | null;
  created_at: string;
  updated_at: string;
}

export interface DuenoRow {
  id: string;
  correo: string;
  nombre: string;
  mi_rol: RolDrive;
}

export interface PermisoRow {
  usuario_id: string;
  correo: string;
  nombre: string;
  rol: RolDrive;
}

/* ---------- Tablas ------------------------------------------------------------ */

export type TipoColumna = "texto" | "numero" | "porcentaje" | "fecha" | "lista";
export type Valor = string | number | null;

/** Un tramo del mapa de calor: hasta `hasta` (sin incluirlo); el último, con `hasta` nulo, es «de ahí en adelante». */
export interface TramoCalor {
  hasta: number | null;
  color: string;
}

export interface ColumnaUd {
  clave: string;
  etiqueta: string;
  tipo: TipoColumna;
  obligatorio: boolean;
  /** Opciones de una columna de lista. */
  opciones: string[];
  min: number | null;
  max: number | null;
  /** Mapa de calor de la columna; nulo si no lleva. */
  calor: TramoCalor[] | null;
}

export interface FilaUd {
  id: string;
  datos: Record<string, Valor>;
}

/** Cómo se ve la tabla en el documento (fase 2): solo estos textos se guardan desde el panel. */
export interface Presentacion {
  titulo: string;
  nota: string;
  enIndice: boolean;
  repetirEncabezado: boolean;
}

export interface ContenidoTabla {
  version: 1;
  columnas: ColumnaUd[];
  filas: FilaUd[];
  presentacion: Presentacion;
  /** ¿Se pintan los mapas de calor de las columnas que tienen tramos? */
  mapaCalor: boolean;
}

/** Lo que la lógica necesita de una tabla para graficar o cruzar. */
export interface TablaDatos {
  columnas: ColumnaUd[];
  filas: FilaUd[];
}

/* ---------- Gráficas ------------------------------------------------------------ */

export type TipoGrafica =
  | "linea"
  | "area"
  | "barras"
  | "barras-h"
  | "agrupadas"
  | "apiladas"
  | "dispersion"
  | "burbujas"
  | "calor"
  | "torta"
  | "dona"
  | "barras-linea"
  | "dos-lineas";

export interface SerieGrafica {
  /** Clave de la columna de la tabla. */
  clave: string;
  /** Color de la paleta institucional (índice). */
  color: number;
  /** En las combinadas: ¿va al eje derecho? */
  eje?: "izquierdo" | "derecho";
}

export interface ConfigGrafica {
  tipo: TipoGrafica;
  titulo: string;
  nota: string;
  /** Columna del eje horizontal (categorías, periodos o, en dispersión, el valor X). */
  x: string;
  series: SerieGrafica[];
  /** Burbujas: columna que da el tamaño. */
  tamano: string | null;
  /** Mapa de calor: columna de las filas (eje vertical). */
  filaCalor: string | null;
  ejeX: string;
  ejeY: string;
  ejeY2: string;
  min: number | null;
  max: number | null;
  tendencia: boolean;
  rotular: "ninguno" | "ultimo" | "todos";
}

export interface ContenidoGrafica {
  version: 1;
  /** La tabla de UDrive de donde salen los datos. */
  tabla_id: string | null;
  config: ConfigGrafica;
}

/* ---------- Cruces ------------------------------------------------------------ */

export type ConservarFilas = "coinciden" | "todas_a";

export interface ContenidoCruce {
  version: 1;
  /** «dos»: dos tablas unidas por una columna; «una»: columnas de la misma tabla. */
  modo: "dos" | "una";
  tabla_a: string | null;
  tabla_b: string | null;
  columna_a: string | null;
  columna_b: string | null;
  conservar: ConservarFilas;
  /** La gráfica combinada sobre el resultado; sus claves son las de `unirTablas`. */
  grafica: ConfigGrafica;
  /** Id de la tabla en que se guardó el resultado, si se guardó. */
  resultado_id: string | null;
}

export const MAX_BYTES = 100 * 1024 * 1024;
export const DIAS_PAPELERA = 30;
