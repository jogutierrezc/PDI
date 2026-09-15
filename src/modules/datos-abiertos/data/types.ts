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
  | "metodologia";

export interface Campus {
  id: CampusId;
  name: string;
  uuid?: string;
}

/** valores[año][campus] */
export type YearCampusValues = Record<number, Partial<Record<CampusId, number | null>>>;

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
  values: YearCampusValues;
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
  /** Se publica para el total institucional; por campus no se desagrega. */
  values: Record<number, BreakdownItem[]>;
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

/** Cohorte que avanza por etapas y pierde estudiantes entre una y otra. */
export interface PipelineCohort {
  cohort: number;
  campus: CampusId;
  /** Estudiantes que siguen al llegar a cada etapa. El primero es el ingreso. */
  remaining: (number | null)[];
  /** Causa principal de retiro en cada tramo (entre etapa i e i+1). */
  mainCause: string[];
}

export interface PipelineData {
  id: string;
  uuid?: string;
  title: string;
  description: string;
  stages: string[];
  cohorts: PipelineCohort[];
  source: string;
  officeId?: string | null;
}

/** Valores por departamento (código DANE) para un año y un campus. */
export interface MapDataset {
  id: string;
  uuid?: string;
  title: string;
  description: string;
  /** "origen": de dónde vienen las personas que atiende cada campus, con flujos. */
  mode: "origen" | "cobertura";
  unit: string;
  source: string;
  officeId?: string | null;
  values: Record<number, Partial<Record<CampusId, Record<string, number>>>>;
}

export interface ReportBlock {
  uuid?: string;
  kind: BlockKind;
  /** Clave del conjunto (mapa, mapa de calor) al que apunta el bloque. */
  refKey?: string | null;
  visible: boolean;
  position: number;
  settings: { chart?: ChartKind; title?: string };
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
  pipeline?: PipelineData;
  maps?: MapDataset[];
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
  "mapa",
  "tuberia",
  "mapa_calor",
  "desgloses",
  "tabla_dinamica",
  "metodologia",
];

export const BLOCK_LABELS: Record<BlockKind, string> = {
  kpis: "Tablero de indicadores",
  evolucion: "Evolución por campus",
  mapa: "Mapa por departamento",
  tuberia: "Tubería de permanencia",
  mapa_calor: "Mapa de calor",
  desgloses: "Desgloses",
  tabla_dinamica: "Tabla dinámica",
  metodologia: "Qué mide cada cifra",
};
