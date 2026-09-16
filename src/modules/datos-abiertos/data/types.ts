/* =============================================================================
   Datos Abiertos · contrato de datos del portal.

   Es lo que las pantallas consumen. Lo arma `repository.ts` a partir de las
   tablas `od_*` de Supabase (0019_udes_en_cifras.sql): un periodo global, sus
   campus y sus informes, cada uno con indicadores, desgloses, mapas de calor,
   mapas, tubería y el diseño de su ficha.

   Un valor ausente es `null`, nunca 0: "no reportado" y "cero" son
   afirmaciones distintas y la interfaz las pinta distinto.

   Los `uuid` opcionales solo los rellena la carga de la intranet: el portal
   público identifica todo por clave legible (slug de informe, clave de
   indicador, slug de campus).
   ========================================================================== */

import type { PublicationStatus } from "../../../types/database";
import type { AnnualRule, Term } from "./terms";

export type { AnnualRule, Term } from "./terms";

export type ReportSlug = string;

/** Slug del campus. "todas" es el total institucional. */
export type CampusId = string;
export const ALL_CAMPUSES: CampusId = "todas";

export type ValueFormat = "entero" | "porcentaje" | "decimal";

/** Si subir es bueno o malo: decide cómo se lee la variación, no su color. */
export type Direction = "sube" | "baja" | "neutro";

/** "suma": el total institucional es la suma de los campus. "reportado": se captura aparte. */
export type Aggregation = "suma" | "reportado";

export type ChartKind = "circular" | "barras" | "lineas";

export type BlockKind =
  | "kpis"
  | "evolucion"
  | "mapa"
  | "tuberia"
  | "mapa_calor"
  | "desgloses"
  | "tabla_dinamica"
  | "metodologia"
  | "historico"
  | "tabla";

export interface Campus {
  id: CampusId;
  name: string;
  uuid?: string;
}

/** valores[año][campus] */
export type YearCampusValues = Record<number, Partial<Record<CampusId, number | null>>>;

/** valores[año][periodo][campus] */
export type TermCampusValues = Record<number, Partial<Record<Term, Partial<Record<CampusId, number | null>>>>>;

export interface Indicator {
  id: string;
  uuid?: string;
  label: string;
  /** Unidad que acompaña a la cifra: "estudiantes", "%", "m²". */
  unit: string;
  format: ValueFormat;
  direction: Direction;
  aggregation?: Aggregation;
  /** Qué se cuenta y cómo, en una frase. */
  definition: string;
  /** Oficina que reporta la cifra. */
  source: string;
  officeId?: string | null;
  isKpi?: boolean;
  kpiPosition?: number | null;
  isHeadline?: boolean;
  /** Años con dato. Sin lista, todos los del periodo. */
  years?: number[];
  /** Cifra del año: sale de los periodos A y B según `annualRule`. */
  values: YearCampusValues;
  /** Por periodo (A y B) o por año. */
  reporting?: "periodo" | "anual";
  /** Cómo se obtiene la cifra del año. Sin ella, la serie es solo anual. */
  annualRule?: AnnualRule;
  /** Cifras por periodo académico, tal como se reportaron. */
  terms?: TermCampusValues;
  /** Todo el periodo: cómo salió la cifra agrupada de cada campus ("promedio anual de 6 años"). */
  periodBasis?: Partial<Record<CampusId, string>>;
  /** Con la regla "ultimo": de qué periodo salió cada cifra anual. */
  annualFrom?: Record<number, Partial<Record<CampusId, Term>>>;
}

export interface BreakdownItem {
  label: string;
  value: number | null;
}

export interface Breakdown {
  id: string;
  uuid?: string;
  title: string;
  unit: string;
  format: ValueFormat;
  source: string;
  officeId?: string | null;
  defaultChart?: ChartKind;
  /** Años con dato. Sin lista, todos los del periodo. */
  years?: number[];
  /** Se publica para el total institucional; por campus no se desagrega. */
  values: Record<number, BreakdownItem[]>;
  reporting?: "periodo" | "anual";
  annualRule?: AnnualRule;
  terms?: Record<number, Partial<Record<Term, BreakdownItem[]>>>;
}

/** Matriz para mapa de calor. `values[fila][columna]`; null = no aplica o sin reportar. */
export interface HeatmapData {
  id: string;
  uuid?: string;
  title: string;
  description: string;
  rowLabel: string;
  columnLabel: string;
  rows: string[];
  columns: string[];
  values: (number | null)[][];
  unit: string;
  format: ValueFormat;
  source: string;
  officeId?: string | null;
  /** Qué significa una casilla vacía en esta matriz. */
  emptyMeaning: string;
}

/** Qué se captura en cada etapa: estudiantes, % de la cohorte que sigue o % que se retira en el tramo. */
export type PipelineMeasure = "estudiantes" | "permanencia" | "desercion";

/** Cohorte que avanza por etapas y pierde estudiantes entre una y otra. */
export interface PipelineCohort {
  /** Periodo de ingreso ("2014-A"). La semilla antigua usaba el año. */
  cohort: string | number;
  campus: CampusId;
  /**
   * Lo que sigue al llegar a cada etapa. El primero es el ingreso. En
   * estudiantes, personas; en permanencia y deserción, % de la cohorte.
   */
  remaining: (number | null)[];
  /** Solo con deserción: % que se retira en el tramo que termina en cada etapa. */
  dropout?: (number | null)[];
  /** Causa principal de retiro en cada tramo (entre etapa i e i+1). */
  mainCause: string[];
}

export interface PipelineData {
  id: string;
  uuid?: string;
  title: string;
  description: string;
  measure?: PipelineMeasure;
  stages: string[];
  cohorts: PipelineCohort[];
  source: string;
  officeId?: string | null;
}

/** La cifra en los periodos elegidos, con sus categorías y su peso en el total. */
export interface HistoryData {
  id: string;
  uuid?: string;
  title: string;
  description: string;
  unit: string;
  format: ValueFormat;
  totalLabel: string;
  source: string;
  officeId?: string | null;
  /** Periodos en orden cronológico ("2020-A"). */
  periods: string[];
  /** Categorías en su orden (Pregrado, Posgrado…). */
  categories: string[];
  /** total[periodo] */
  total: Record<string, number | null>;
  /** values[categoría][periodo] */
  values: Record<string, Record<string, number | null>>;
}

export type MapMode = "origen" | "cobertura" | "entrante" | "saliente" | "convenios";

/** Mapa del mundo: la clave es el país (ISO alfa-3). */
export const isWorldMap = (mode: MapMode) => mode === "entrante" || mode === "saliente" || mode === "convenios";

/** Movilidad: rutas entre un país y los campus. */
export const isMobilityMap = (mode: MapMode) => mode === "entrante" || mode === "saliente";

/** Nombre de cada tipo de mapa, para la intranet y el rótulo de la gráfica. */
export const MAP_MODE_TITLE: Record<MapMode, string> = {
  origen: "Mapa por departamento",
  cobertura: "Mapa por departamento",
  entrante: "Movilidad entrante por país",
  saliente: "Movilidad saliente por país",
  convenios: "Convenios internacionales por país",
};

/**
 * Valores por territorio para un año y un campus. En los mapas por departamento
 * la clave es el código DANE; en los mundiales, el país en ISO 3166-1 alfa-3.
 */
export interface MapDataset {
  id: string;
  uuid?: string;
  title: string;
  description: string;
  /**
   * "origen": de dónde vienen las personas que atiende cada campus, con flujos.
   * "cobertura": solo color por departamento.
   * "entrante": participantes que llegan de otro país a un campus.
   * "saliente": participantes que salen de un campus a otro país.
   * "convenios": convenios internacionales por país, como mapa de calor.
   */
  mode: MapMode;
  /** "global": una sola cifra sin año, guardada en la clave ALL_YEARS (0). "anual": por año. */
  reporting?: "anual" | "global";
  unit: string;
  source: string;
  officeId?: string | null;
  /** Años con dato. Sin lista, todos los del periodo. */
  years?: number[];
  values: Record<number, Partial<Record<CampusId, Record<string, number>>>>;
}

export interface ReportBlock {
  uuid?: string;
  kind: BlockKind;
  /** Clave del conjunto (mapa, mapa de calor) al que apunta el bloque. */
  refKey?: string | null;
  visible: boolean;
  position: number;
  settings: {
    chart?: ChartKind;
    title?: string;
    indicators?: string[];
    /** Mapas: clave (no id) del otro mapa que se muestra con este. La clave sobrevive a la copia de periodo. */
    mapWith?: string;
    /** "combinado": entrante y saliente en un solo mapa; "lado_a_lado": dos mapas en una fila. */
    mapLayout?: "combinado" | "lado_a_lado";
    /** Mapa con panel denso y encuadre a los países con datos. */
    compact?: boolean;
  };
  /** Punto del informe al que pertenece. Sin punto, el bloque es de toda la ficha. */
  sectionKey?: string | null;
}

export interface ReportImage {
  src: string;
  alt: string;
  /** Procedencia visible: la imagen es provisional hasta tener fotografía oficial. */
  credit: string;
}

export interface Report {
  uuid?: string;
  slug: ReportSlug;
  /** Código de dos letras del tablero. */
  code: string;
  name: string;
  /** Una línea para el tablero. */
  summary: string;
  /** Párrafo de la ficha. */
  description: string;
  image: ReportImage;
  /** Índice 1-9 de la franja de línea (color de la insignia del código). */
  line: number;
  /** Indicadores del tablero de KPI, en orden. El primero es el titular. */
  keyIndicators: string[];
  indicators: Indicator[];
  breakdowns: Breakdown[];
  heatmaps?: HeatmapData[];
  /** Semilla ilustrativa: una sola tubería. La base puede tener varias (`pipelines`). */
  pipeline?: PipelineData;
  pipelines?: PipelineData[];
  histories?: HistoryData[];
  maps?: MapDataset[];
  /** Puntos del informe, en orden. Sin puntos, la ficha es una sola columna de bloques. */
  sections?: ReportSection[];
  tables?: TableData[];
  /** Orden y visibilidad de los bloques de la ficha. Sin bloques, el orden por defecto. */
  blocks?: ReportBlock[];
  /** Nota metodológica o de alcance. */
  note?: string;
  status?: PublicationStatus;
  position?: number;
  updatedAt?: string;
}

export interface PeriodInfo {
  uuid?: string;
  label: string;
  startYear: number;
  endYear: number;
  status?: PublicationStatus;
}

export interface OpenDataCatalog {
  period?: PeriodInfo;
  years: number[];
  currentYear: number;
  campuses: Campus[];
  /** Mientras sea true, cada cifra lleva la marca "Dato ilustrativo". */
  illustrative: boolean;
  /** Fecha de corte publicada, ISO. */
  cutoffDate: string;
  reports: Report[];
}

/** Orden de la ficha cuando el informe no declara bloques. */
export const DEFAULT_BLOCK_ORDER: BlockKind[] = [
  "kpis",
  "evolucion",
  "historico",
  "mapa",
  "tuberia",
  "mapa_calor",
  "desgloses",
  "tabla_dinamica",
  "metodologia",
];

export type SectionStatus = "completo" | "parcial" | "no_recibido" | "no_oficial" | "abierto";

/** Un punto de un informe institucional: su texto, su estado y su fuente. */
export interface ReportSection {
  key: string;
  uuid?: string;
  number: number | null;
  title: string;
  status: SectionStatus;
  lede: string;
  warning: string;
  source: string;
  requested: { dato: string; responsable: string; periodicidad: string }[];
  position: number;
}

export type TableDisplay = "tabla" | "ranking" | "fichas" | "cifras";

export interface TableData {
  id: string;
  uuid?: string;
  title: string;
  description: string;
  display: TableDisplay;
  columns: { key: string; label: string; format: ValueFormat | "texto" | "enlace" }[];
  rows: Record<string, string | number | null>[];
  source: string;
}

/** Bloques que apuntan a un conjunto concreto del informe. */
export const DATASET_BLOCKS: BlockKind[] = ["mapa", "mapa_calor", "tuberia", "historico", "tabla"];

export const BLOCK_LABELS: Record<BlockKind, string> = {
  kpis: "Tablero de indicadores",
  evolucion: "Evolución por campus",
  mapa: "Mapa por departamento",
  tuberia: "Tubería de permanencia",
  historico: "Evolución histórica",
  tabla: "Tabla",
  mapa_calor: "Mapa de calor",
  desgloses: "Desgloses",
  tabla_dinamica: "Tabla dinámica",
  metodologia: "Qué mide cada cifra",
};
