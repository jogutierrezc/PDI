/* =============================================================================
   UDES en Cifras · importar un informe completo.

   Un informe llega como lo produce la oficina: un Word con sus puntos (texto,
   estado, fuente) y una carpeta de CSV con las cifras de cada punto. El
   importador los convierte en un plan: la lista exacta de secciones,
   indicadores, desgloses, mapas de calor, evoluciones históricas y tablas que
   quedará en la base, con los avisos de calidad que encontró.

   El plan es datos puros (JSON). La intranet lo muestra para revisarlo y lo
   aplica en una sola transacción con od_import_report(); el script de semilla
   lo convierte en migración. Así el mismo informe carga igual por las dos vías.
   ========================================================================== */

import type { OdAnnualRule, OdChartKind, OdValueFormat } from "../../../../types/database";

export type SectionStatus = "completo" | "parcial" | "no_recibido" | "no_oficial" | "abierto";
export type TableDisplay = "tabla" | "ranking" | "fichas" | "cifras";
export type ColumnFormat = OdValueFormat | "texto" | "enlace";
export type PlanTerm = "A" | "B" | "anual";

export interface RequestedData {
  dato: string;
  responsable: string;
  periodicidad: string;
}

/** Un punto del informe: su texto, su estado y su fuente. */
export interface PlanSection {
  key: string;
  number: number;
  title: string;
  status: SectionStatus;
  lede: string;
  warning: string;
  source: string;
  requested: RequestedData[];
}

export interface PlanIndicator {
  key: string;
  label: string;
  unit: string;
  format: OdValueFormat;
  direction: "sube" | "baja" | "neutro";
  aggregation: "suma" | "reportado";
  /** Por periodo (A y B) o por año. Sin él, se deduce de los valores. */
  reporting?: "periodo" | "anual";
  annual_rule: OdAnnualRule;
  definition: string;
  section: string;
  is_kpi: boolean;
  /** Años con dato; null = todos los del periodo. */
  years: number[] | null;
  values: { year: number; term: PlanTerm; campus: string | null; value: number | null }[];
}

export interface PlanBreakdown {
  key: string;
  title: string;
  unit: string;
  format: OdValueFormat;
  chart: OdChartKind;
  reporting?: "periodo" | "anual";
  annual_rule: OdAnnualRule;
  section: string;
  values: { year: number; term: PlanTerm; label: string; position: number; value: number | null }[];
}

export interface PlanHeatmap {
  key: string;
  title: string;
  description: string;
  row_label: string;
  column_label: string;
  rows: string[];
  columns: string[];
  unit: string;
  format: OdValueFormat;
  empty_meaning: string;
  section: string;
  cells: { row: number; column: number; value: number | null }[];
}

export interface PlanHistory {
  key: string;
  title: string;
  description: string;
  unit: string;
  format: OdValueFormat;
  total_label: string;
  section: string;
  values: { period: string; category: string; position: number; value: number | null }[];
}

export interface PlanTable {
  key: string;
  title: string;
  description: string;
  display: TableDisplay;
  columns: { key: string; label: string; format: ColumnFormat }[];
  rows: Record<string, string | number | null>[];
  section: string;
}

export type BlockRef = `${"desglose" | "calor" | "historico" | "tabla"}:${string}`;

export interface PlanBlock {
  kind: "kpis" | "evolucion" | "desgloses" | "mapa_calor" | "historico" | "tabla" | "tabla_dinamica" | "metodologia";
  ref: BlockRef | null;
  section: string | null;
  settings: { title?: string; indicators?: string[]; chart?: OdChartKind };
}

export interface PlanWarning {
  section: string | null;
  level: "aviso" | "error";
  message: string;
}

export interface ImportPlan {
  profile: string;
  report: string;
  office: string;
  title: string;
  scope: string;
  corte: string;
  sections: PlanSection[];
  indicators: PlanIndicator[];
  breakdowns: PlanBreakdown[];
  heatmaps: PlanHeatmap[];
  histories: PlanHistory[];
  tables: PlanTable[];
  blocks: PlanBlock[];
  warnings: PlanWarning[];
  files: { name: string; section: string | null; used: boolean }[];
}

/** Un archivo subido: CSV como texto, Word como bytes. */
export interface ImportFile {
  name: string;
  /** Ruta relativa dentro de la carpeta, si se subió una carpeta. */
  path: string;
  text?: string;
  bytes?: Uint8Array;
}

/** Lo que el importador necesita saber del periodo al que carga. */
export interface ImportContext {
  /** Años del periodo: las cifras por año fuera de ellos no se cargan como indicador. */
  years: number[];
  /** Campus del periodo, por slug. */
  campuses: { slug: string; label: string }[];
}

export interface ImportProfile {
  id: string;
  /** Slug del informe que alimenta. */
  report: string;
  name: string;
  description: string;
  /** Archivos que espera, para mostrarlos antes de subir. */
  expected: { name: string; section: string }[];
  build: (files: ImportFile[], context: ImportContext) => ImportPlan;
}
