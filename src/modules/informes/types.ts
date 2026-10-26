/* =============================================================================
   Informes Institucionales · tipos del módulo (contrato en README.md).

   Las filas `*Row` son las tablas `informe_*` de la migración 0153 tal como
   las lee datos.ts; lo demás es el modelo de las plantillas y del editor.
   ========================================================================== */

export type { RolActor } from "../rankings/reporte/tipos";

export type Plantilla = "A" | "B" | "C" | "D";
export type TipoSeccion = "narr" | "pdi" | "metas" | "dim" | "matriz" | "filas" | "logros" | "evid" | "anexos";
export type EstadoInstancia = "draft" | "sent" | "ok" | "back";
export type EstadoCiclo = "preparacion" | "abierto" | "cerrado";
export type Condicion = "justificar" | "sugerido" | "no";
export type FuenteTipo = "auto" | "pdi" | "aportes" | "excel" | "manual" | "url";
export type DimId = "acad" | "prof" | "cal" | "inv" | "ext" | "fin";

/* ---------- Plantillas -------------------------------------------------------- */

export interface SeccionDef {
  /** «s1», «s2»… en el orden de la plantilla. */
  clave: string;
  titulo: string;
  tipo: TipoSeccion;
  /** Extensión que pide la plantilla («1 a 3 párrafos»). */
  extension?: string;
  /** Pilo puede redactar un borrador de esta sección. */
  borrador?: boolean;
  /** Palabras mínimas (secciones de texto). */
  minimo?: number;
  dims?: DimId[];
  /** Recibe aportes aprobados de las unidades de abajo (consolidador). */
  consolida?: boolean;
  funcion?: string;
  /** Columnas de las secciones de filas. */
  columnas?: string[];
}

export interface PlantillaDef {
  id: Plantilla;
  nombre: string;
  /** Quién la diligencia. */
  quien: string;
  /** A quién se envía. */
  destino: string;
  secciones: SeccionDef[];
}

export interface CifraDef {
  clave: string;
  etiqueta: string;
  /** «», « %»… se pega al valor. */
  unidad: string;
  /** ¿Más es mejor? Decide el semáforo frente a la meta. */
  mayorMejor: boolean;
  dim: DimId;
  /** Fuente por defecto, para mostrar mientras no hay catálogo. */
  fuente: string;
}

export interface DimDef {
  id: DimId;
  titulo: string;
  funcion: string;
  cifras: string[];
}

/* ---------- Filas de la base (0153) ------------------------------------------- */

export interface ConfigCiclo {
  limite_propios: number;
  exigir_fuente: boolean;
  exigir_pilar: boolean;
}

export interface CicloRow {
  id: string;
  anio: number;
  nombre: string;
  fecha_limite: string | null;
  corte: string | null;
  estado: EstadoCiclo;
  config: Partial<ConfigCiclo> | null;
}

export interface RequisitoRow {
  ciclo_id: string;
  plantilla: Plantilla;
  clave: string;
  condicion: Condicion;
}

export interface InstanciaRow {
  id: string;
  ciclo_id: string;
  unit_id: string;
  plantilla: Plantilla;
  /** Unidad que lo consolida. */
  destino: string | null;
  estado: EstadoInstancia;
  nota_revision: string | null;
  enviado_en: string | null;
  enviado_por: string | null;
  aprobado_en: string | null;
  aprobado_por: string | null;
}

export interface Meta {
  meta: string;
  programado: number | null;
  alcanzado: number | null;
}

export interface Logro {
  titulo: string;
  resultado: string;
  /** Número del anexo que lo respalda. */
  anexo: number | null;
}

/** Lo que guarda `informe_secciones.contenido` según el tipo de la sección. */
/** Una tabla o gráfica de UDrive que la unidad puso en una sección (referencia, no copia). */
export interface ElementoDrive {
  archivoId: string;
  tipo: "tabla" | "grafica";
  /** Vacío: el que trae el archivo en UDrive. */
  titulo: string;
  nota: string;
}

export interface ContenidoSeccion {
  texto?: string;
  /** Pilares del PDI con los que se articula (id del pilar). */
  pilares?: string[];
  /** Metas adicionales que escribe la unidad (las de sus indicadores no se guardan aquí). */
  metas?: Meta[];
  /** Análisis por meta de los indicadores del programa, por clave de la cifra. */
  observaciones?: Record<string, string>;
  filas?: string[][];
  logros?: Logro[];
  /** Último borrador de Pilo sin tocar: sirve para medir cuánto lo cambió la unidad. */
  borrador_pilo?: string | null;
  /** Tablas y gráficas de UDrive de esta sección. */
  drive?: ElementoDrive[];
}

export interface SeccionRow {
  instancia_id: string;
  clave: string;
  orden: number;
  contenido: ContenidoSeccion | null;
  listo: boolean;
}

export interface CifraRow {
  instancia_id: string;
  clave: string;
  etiqueta: string;
  /** Sección a la que pertenece (cuenta los datos propios por sección). */
  seccion_clave: string | null;
  fuente_tipo: FuenteTipo;
  fuente_nombre: string;
  /** Solo excel, manual y url (y la foto al enviar). */
  valor: number | null;
  unidad: string;
  meta: number | null;
  anterior: number | null;
  incluida: boolean;
  justificacion: string;
  propia: boolean;
  pilar: string | null;
  /** Último valor vivo que la unidad aceptó. */
  visto: number | null;
  foto_valor: number | null;
  foto_en: string | null;
  foto_fuente: string | null;
  /** Programa, sede y dirección del indicador (filas «meta_…», 0165). */
  consulta?: Record<string, unknown> | null;
}

export interface FuenteRow {
  clave: string;
  nombre: string;
  tipo: "auto" | "pdi";
  consulta: Record<string, unknown> | null;
  activa: boolean;
}

export interface AnexoRow {
  id: string;
  instancia_id: string;
  n: number;
  nombre: string;
  tipo: "archivo" | "url";
  ruta: string;
  descripcion: string;
  created_at?: string;
}

export interface RevisionRow {
  id: string;
  instancia_id: string;
  seccion_clave: string | null;
  decision: "aprobado" | "devuelto";
  nota: string;
  por: string | null;
  en: string;
}

export interface UnidadRef {
  id: string;
  name: string;
  kind: string;
  code: string | null;
  parent_id: string | null;
}

export interface PilarRef {
  id: string;
  numeral: string;
  name: string;
  progress: number | null;
}

/** Valor vivo de una cifra para la unidad y el año (fila de informe_cifras_vivas). */
export interface LecturaViva {
  valor: number | null;
  fuente: string;
  corte: string | null;
}

export type Nivel = "ok" | "warn";
export interface Control {
  nivel: Nivel;
  texto: string;
}
