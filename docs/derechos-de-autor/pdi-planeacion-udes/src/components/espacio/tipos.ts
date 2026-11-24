/* =============================================================================
   Espacio de archivos · el contrato entre los componentes compartidos y cada módulo.

   Un módulo (Programas en Cifras, Internacionalización) traduce lo suyo a estas
   formas: sus columnas a EspColumna, sus reglas de validación a Reglas y sus
   filas a FilaLocal. Los componentes no saben de CNA, SNIES, campus ni periodos.
   ========================================================================== */

export type Valor = string | number | null;

/** Datos de una fila: {clave de columna: valor}. */
export type Datos = Record<string, Valor>;

export interface EspColumna {
  clave: string;
  etiqueta: string;
  /** «lista» se elige de un desplegable; «numero» y «porcentaje» se alinean como número. */
  tipo: "texto" | "numero" | "fecha" | "lista" | "porcentaje";
  obligatorio: boolean;
  opciones: string[];
  /** Origen de sistema (p. ej. Warehouse) o «calculada»: la columna no se edita. */
  solo_lectura?: string | null;
  /** Texto de ayuda del encabezado (p. ej. el concepto del catálogo). */
  ayuda?: string;
}

/** Cómo un módulo lee y valida lo que se escribe en una celda. */
export interface Reglas {
  /** De lo escrito al valor que se guarda (número, fecha AAAA-MM-DD, opción de la lista, texto). */
  leer: (columna: EspColumna, escrito: string) => Valor;
  /** Lo que está mal en una celda, en español; vacío si está bien. */
  error: (columnas: readonly EspColumna[], datos: Datos, columna: EspColumna) => string;
  /** Llena las columnas calculadas de una fila (devuelve una copia). */
  completar?: (columnas: readonly EspColumna[], datos: Datos) => Datos;
  /** Cómo se ve un valor en una celda que no se puede editar (p. ej. con datos personales ocultos). */
  textoBloqueado?: (columna: EspColumna, valor: Valor) => string;
}

/** Una fila en el navegador: `k` es estable aunque cambie de lugar; `id` solo existe si ya está guardada. */
export interface FilaLocal {
  k: string;
  id?: string;
  datos: Datos;
  /** Grupo al que pertenece la fila (p. ej. el campus); no se edita. */
  grupo?: string;
}

export interface FilaGuardada {
  id: string;
  datos: Datos;
  grupo?: string;
}

export interface Caja {
  left: number;
  top: number;
  width: number;
  height: number;
}
