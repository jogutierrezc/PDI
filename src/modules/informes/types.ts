/* =============================================================================
   Informes Institucionales · tipos del módulo (contrato en README.md).

   Las filas `*Row` son las tablas `informe_*` de la migración 0153 tal como
   las lee datos.ts; lo demás es el modelo de las plantillas y del editor.
   ========================================================================== */

export type { RolActor } from "../rankings/reporte/tipos";
import type { PlanLocal } from "./plan-importar";
import type { CriterioPropio, IndicadorManual } from "./indicadores-manual";

/** «A»–«D» (las del código) o «X1», «X2»… (estructuras propias que crea Planeación, 0279). */
export type Plantilla = string;
export type TipoSeccion = "narr" | "pdi" | "metas" | "dim" | "matriz" | "filas" | "logros" | "evid" | "anexos" | "libre";
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
  /** Planeación la dejó en solo lectura para la unidad (0276): se muestra lo ya definido, sin edición. */
  soloLectura?: boolean;
  /** Sección «libre» creada por Planeación en el ciclo (clave x1, x2…). */
  libre?: boolean;
}

export interface PlantillaDef {
  id: Plantilla;
  nombre: string;
  /** Quién la diligencia. */
  quien: string;
  /** A quién se envía. */
  destino: string;
  secciones: SeccionDef[];
  /** Estructura creada por Planeación (X1…), no del código. */
  propia?: boolean;
  descripcion?: string;
  /** Una estructura propia desactivada no se ofrece para informes nuevos; los abiertos siguen. */
  activa?: boolean;
}

/** Una sección de una estructura propia tal como se guarda en `informe_estructuras.secciones` (la clave s1, s2… sale de la posición). */
export interface SeccionEstructuraJson {
  titulo: string;
  tipo: Exclude<TipoSeccion, "libre">;
  extension?: string;
  minimo?: number;
  columnas?: string[];
  dims?: DimId[];
  borrador?: boolean;
  consolida?: boolean;
  funcion?: string;
}

/** Fila de informe_estructuras (0279). */
export interface EstructuraRow {
  plantilla: Plantilla;
  nombre: string;
  quien: string;
  destino: string;
  descripcion: string;
  /** La plantilla A–D de la que se copió, si se copió. */
  base: Plantilla | null;
  secciones: SeccionEstructuraJson[];
  activa: boolean;
  created_at?: string;
  updated_at?: string;
}

/** A qué oficinas se limita una plantilla (informe_plantilla_unidades, 0279). Sin filas, la usan todas. */
export interface PlantillaUnidadRow {
  plantilla: Plantilla;
  unit_id: string;
}

export type PapelResponsable = "jefe" | "editor" | "visor";

/** Quién escribe el informe de una unidad (informe_responsables, 0279). */
export interface ResponsableRow {
  profile_id: string;
  nombre: string;
  correo: string;
  rol: PapelResponsable;
  /** Lo asignó este módulo (se puede restablecer). */
  asignado: boolean;
  asignado_en: string | null;
}

export interface PersonaRef {
  id: string;
  nombre: string;
  correo: string;
}

/** Un aporte a un pilar del PDI en «Alineación estratégica»: texto libre y las acciones con que se articula, cada una con sus tablas y gráficas. */
export interface AporteAPilar {
  /** id del pilar (PilarRef.id). */
  pilar: string;
  /** Lo que la oficina aporta a ese pilar. Texto libre, admite [[clave]]. */
  aporte: string;
  acciones: AccionDePilar[];
}

export interface AccionDePilar {
  id: string;
  titulo: string;
  descripcion: string;
  /** Tablas (pegadas de Excel), gráficas y tablas de UDrive y texto de apoyo de esta acción. */
  bloques: BloqueLibre[];
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
  /** Sede del informe (0272); nulo: sin sede, o anterior a las sedes. */
  campus_id?: string | null;
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
  /** Tablas y gráficas de UDrive que respaldan este logro (opcional). */
  drive?: ElementoDrive[];
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

/** Un bloque de una sección libre. Para sumar otro tipo (p. ej. una tabla pegada de Excel) se agrega aquí y en BloquesLibres. */
export type BloqueLibre =
  | { id: string; tipo: "texto"; texto: string }
  | { id: string; tipo: "drive"; drive: ElementoDrive[] }
  /** Copia fija de una tabla pegada o subida desde Excel (tabla-libre.ts). */
  | { id: string; tipo: "tabla"; titulo: string; nota: string; origen: string; cargada: string; encabezados: string[]; filas: string[][] };

/** Fila de informe_secciones_config (0276): cómo Planeación arma una plantilla en un ciclo. */
export interface SeccionConfigRow {
  ciclo_id: string;
  plantilla: Plantilla;
  clave: string;
  activa: boolean;
  /** Posición explícita; nulo: la de la plantilla. */
  orden: number | null;
  /** Título propio; nulo: el de la plantilla. */
  titulo: string | null;
  editable_por_unidad: boolean;
  /** Sección nueva (clave x1…), no de la plantilla. */
  libre: boolean;
  /** Palabras mínimas del texto de una sección libre. */
  minimo: number | null;
}

export interface ContenidoSeccion {
  texto?: string;
  /** Sección libre: bloques de texto y de UDrive en orden. */
  bloques?: BloqueLibre[];
  /** Pilares del PDI con los que se articula (id del pilar). */
  pilares?: string[];
  /** Alineación estratégica: un aporte por pilar con sus acciones, tablas y gráficas. Si falta, vale `pilares` + `texto` (informes anteriores). */
  alineacion?: AporteAPilar[];
  /** Resultados y evidencias: los criterios a los que esta oficina decidió reportar (ninguno es obligatorio). */
  criterios_reporta?: string[];
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
  /** Objetivos y metas: plan propio (importado de JSON o PDF, o escrito a mano). Manda sobre la sincronización. */
  plan?: PlanLocal;
  /** Resultados por dimensión: indicadores que escribe la unidad (actual, anterior y meta). */
  indicadores?: IndicadorManual[];
  /** Criterios que la unidad creó para su propio informe (además de los base y los aprobados). */
  criterios_propios?: CriterioPropio[];
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

/** Una sede (Bucaramanga, Cúcuta, Valledupar, Bogotá) de la tabla campuses. */
export interface SedeInforme {
  id: string;
  slug: string;
  name: string;
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
