// ─── model.ts (extensión) ────────────────────────────────────────────────────
// Añade el concepto de "actor" que usa Mr. Pilo.
// Un actor puede ser una Vicerrectoría o un Programa.

export type ActorKind = "vicerectoria" | "programa";

/** Contexto de quien abre Mr. Pilo */
export interface PiloActor {
  kind: ActorKind;
  id: string;           // vicerrectoriaId o programId
  name: string;         // nombre para mostrar
  campusId?: string;    // solo programas (puede ser multi-campus para vices)
}

/** Un indicador en el catálogo, con su origen */
export type IndicatorOrigin =
  | "institucional"     // lo creó PLI / vicerrectoría raíz
  | "vicerectoria"      // lo creó una vicerrectoría específica
  | "programa";         // lo creó un programa, solo visible para él

export interface CatalogIndicator {
  id: string;
  code: string;
  name: string;
  fn: SubstantiveFunction;
  stage: Stage;
  dimensionId: string | null;
  cesu: boolean;
  programReports: boolean;
  status: "borrador" | "publicado";
  origin: IndicatorOrigin;
  createdBy: string;      // actorId que lo creó
  mandatory: boolean;     // la vice lo forzó a todos sus programas
  mandatoryFor?: string[];// o solo para ciertos programIds
}

/** Adaptación que hace una vicerrectoría sobre un indicador existente */
export interface IndicatorAdaptation {
  indicatorId: string;
  vicerrectoriaId: string;
  targetGoal?: number;    // redefine la meta
  weight?: number;        // redefine el peso en el scoring
  periodicity?: "anual" | "semestral" | "trimestral";
  note?: string;          // instrucción para los programas
}

/** Señal de necesidad institucional derivada de datos de reporte */
export interface InstitutionalNeed {
  indicatorId: string;
  severity: "critica" | "importante" | "oportunidad";
  coverageRate: number;   // % de programas que reportan este indicador
  cnaLinked: boolean;     // está vinculado a condición CNA
  reason: string;         // texto para mostrar en Mr. Pilo
}

// Re-exporta los tipos base que ya existían
export type { Stage, SubstantiveFunction, ProgramSite } from "./model_base";
