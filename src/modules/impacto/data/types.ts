/* =============================================================================
   Impacto Institucional · tipos del prototipo.

   Los nombres siguen el modelo de datos acordado (indicador, ficha técnica,
   asignación, registro, transición) para que el paso a Supabase en la fase 1
   no cambie la forma de las pantallas.
   ========================================================================== */

export type FunctionId = "investigacion" | "ensenanza" | "extension";
export type Level = "insumos" | "procesos" | "productos" | "impacto";
export type CatalogState = "oficial" | "sugerido";
export type CampusId = "bucaramanga" | "cucuta" | "valledupar" | "bogota";
export type Degree = "pregrado" | "especializacion" | "maestria" | "doctorado";

/** Una fila de la matriz tal como la trae la vr7. */
export interface MatrixIndicator {
  codigo: string;
  funcion: FunctionId;
  nivel: Level;
  estado: CatalogState;
  nombre: string;
  descripcion: string;
  unidad: string;
  lineaBase: string;
  /** Año de la línea base, cuando viene de la base (cierre de la fase 7). */
  lineaBaseAnio?: number | null;
  meta: { anio: number; valor: string };
  meta2028: string;
  responsable: string;
  fuente: string;
  dimension: string;
  pilares: number[];
  proyectos: string[];
  ods: number[];
  origen: string;
}

export type CalcType = "conteo" | "razon" | "puntaje" | "comparacion" | "texto";
export type Aggregation = "suma" | "razon_de_sumas" | "promedio_ponderado" | "no_agregable";
export type CaptureMode = "manual" | "precargado" | "encuesta" | "calculado";

/** Lo que el administrador completa y la matriz no trae. */
export interface TechSheet {
  tipo: CalcType;
  numerador: string;
  denominador?: string;
  factor: 1 | 100;
  agregacion: Aggregation;
  sentido: "mayor_mejor" | "menor_mejor";
  periodicidad: "semestral" | "anual";
  nivelReporte: "programa_sede" | "programa" | "facultad" | "institucional";
  aplicaA: Degree[];
  modo: CaptureMode;
  evidencia: { tipo: string; obligatoria: boolean } | null;
  umbral: number;
  rango?: [number, number];
  nMinimo?: number;
  /** Razones que pueden pasar de 1, como horas ÷ profesores. */
  admiteMayorQueUno?: boolean;
  enPiloto: boolean;
  /** Supuestos del prototipo, para DECISIONES.md. */
  supuesto?: string;
}

export interface Indicator extends MatrixIndicator {
  ficha: TechSheet | null;
}

export interface Faculty {
  slug: string;
  code: string;
  name: string;
}

export interface Program {
  slug: string;
  name: string;
  faculty: string;
  degree: Degree;
  campus: CampusId[];
}

export type RecordState =
  | "borrador"
  | "enviado"
  | "aprobado_decanatura"
  | "validado"
  | "devuelto_programa"
  | "devuelto_decanatura";

/** Un valor reportado: siempre numerador y denominador, nunca solo el porcentaje. */
export interface Measure {
  numerador: number | null;
  denominador: number | null;
  n?: number | null;
  numComparacion?: number | null;
  denComparacion?: number | null;
}

export interface Assignment {
  id: string;
  codigo: string;
  program: string;
  campus: CampusId | null;
  period: string;
}
