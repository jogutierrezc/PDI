/* =============================================================================
   Tipos de la base de datos.
   Escritos a mano para que coincidan con supabase/migrations. Cuando el
   esquema cambie, se pueden regenerar en vez de editarlos:

     supabase gen types typescript --project-id <ref> --schema public \
       > src/types/database.ts

   Mientras tanto, este archivo es el contrato: si una consulta pide una
   columna que no está aquí, TypeScript lo detiene antes de llegar al navegador.
   ========================================================================== */

export type AppRole = "consulta" | "responsable" | "planeacion" | "admin";
export type ActivityStatus = "cumplida" | "curso" | "pendiente" | "riesgo";
export type PublicationStatus = "borrador" | "revision" | "publicado" | "archivado";
export type ParameterCategory = "estado_proyecto" | "nivel_gestion" | "unidad" | "periodicidad";
export type ChangeType = "creacion" | "modificacion" | "reforma" | "eliminacion";
export type PillarIcon = "person" | "chip" | "spark" | "columns" | "leaf" | "community";
export type RepoKind = "github" | "udes";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  unit: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Parameter {
  id: string;
  category: ParameterCategory;
  label: string;
  description: string | null;
  position: number;
  is_active: boolean;
}

export interface ReportPeriod {
  id: string;
  label: string;
  cutoff_date: string;
  is_current: boolean;
  published_at: string | null;
}

export interface Pillar {
  id: string;
  slug: string;
  numeral: string;
  name: string;
  description: string;
  focus: string;
  insight: string | null;
  icon: PillarIcon;
  accent_slot: number;
  impulsor: string;
  contributes: string;
  management_owner: string;
  calculation_owner: string;
  status: PublicationStatus;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PillarProgress {
  pillar_id: string;
  slug: string;
  /** Conteo de indicadores por estado. */
  done: number;
  active: number;
  pending: number;
  risk: number;
  total: number;
  /** Avance en cascada desde las áreas del pilar. */
  progress: number;
  /** Proporción de indicadores cumplidos. Responde a otra pregunta. */
  completion_rate: number;
  area_count: number;
  line_count: number;
  project_count: number;
}

export interface PdiSummary {
  done: number;
  active: number;
  pending: number;
  risk: number;
  total: number;
  /** Promedio del avance de los pilares. */
  progress: number;
  on_track: number;
  need_attention: number;
  pillar_count: number;
  /** Proporción de indicadores cumplidos sobre el total. */
  completion_rate: number;
}

export interface StrategicArea extends TargetFields {
  id: string;
  pillar_id: string;
  code: string | null;
  name: string;
  description: string;
  position: number;
}

export interface ActionLine extends TargetFields {
  id: string;
  area_id: string;
  code: string | null;
  name: string;
  progress: number;
  position: number;
}

/** Vista v_action_lines: la línea con su área y su pilar ya resueltos.
 *  `progress` viene en cascada desde sus proyectos; `reported_progress` es el
 *  número escrito a mano, que solo se usa mientras la línea no tenga ninguno. */
export interface ActionLineWithArea extends Omit<ActionLine, "area_id">, TargetFields {
  area_id: string;
  area_name: string;
  area_code: string | null;
  pillar_id: string;
  reported_progress: number;
  project_count: number;
  activity_count: number;
  activity_done: number;
  is_derived: boolean;
}

/** Meta y avance en valor absoluto. Nulos mientras no se capturen. */
export interface TargetFields {
  target_value: number | null;
  achieved_value: number | null;
  measure_unit: string | null;
}

/** Vista v_area_progress. */
export interface AreaProgress extends TargetFields {
  area_id: string;
  pillar_id: string;
  area_code: string | null;
  area_name: string;
  progress: number;
  line_count: number;
  project_count: number;
  activity_count: number;
  activity_done: number;
}

/** Vista v_project_progress. */
export interface ProjectProgress extends TargetFields {
  project_id: string;
  pillar_id: string;
  action_line_id: string | null;
  name: string;
  reported_progress: number;
  progress: number;
  activity_count: number;
  activity_done: number;
  is_derived: boolean;
}

export interface Indicator {
  id: string;
  pillar_id: string;
  code: string;
  name: string;
  status_label: string;
  level_id: string | null;
  unit_id: string | null;
  periodicity_id: string | null;
  considerations: string;
  budget_amount: number | null;
  budget_progress: number;
  elapsed_label: string | null;
  elapsed_progress: number;
  critical_tasks: number;
  is_primary: boolean;
  position: number;
}

/** Vista v_indicators: añade las etiquetas de los catálogos. */
export interface IndicatorWithLabels extends Indicator {
  level_label: string | null;
  unit_label: string | null;
  periodicity_label: string | null;
}

export interface Project extends TargetFields {
  id: string;
  pillar_id: string;
  action_line_id: string | null;
  indicator_id: string | null;
  name: string;
  owner: string;
  description: string;
  detail: string;
  due_date: string | null;
  progress: number;
  status: ActivityStatus;
  state_id: string | null;
  document_id: string | null;
  position: number;
}

/** Indicador de resultado. La tabla se sigue llamando `activities` por
 *  compatibilidad; en la interfaz es "indicador de resultado". */
export interface Activity {
  id: string;
  pillar_id: string;
  project_id: string | null;
  action_line_id: string | null;
  title: string;
  owner: string;
  due_date: string | null;
  /** Cumplimiento del año más reciente cuando hay serie anual; escrito a mano
   *  mientras no la haya. Es la raíz de la cascada del tablero. */
  progress: number;
  status: ActivityStatus;
  is_featured: boolean;
  position: number;
  /** Unidad de medida, del catálogo global (categoría "unidad"). */
  unit_id: string | null;
  /** Año y valor de la línea base: "Base 2023 · 28 convenios". */
  baseline_year: number | null;
  baseline_value: number | null;
}

/** Una fila de la serie anual: lo comprometido, lo logrado y su relación. */
export interface ActivityTarget {
  id: string;
  activity_id: string;
  year: number;
  target_value: number | null;
  result_value: number | null;
  /** Cumplimiento decidido a mano, para indicadores que no se miden dividiendo. */
  compliance_override: number | null;
  /** Columna generada: el override si lo hay, si no resultado / meta. */
  compliance: number | null;
  note: string;
}

/** El indicador con su unidad resuelta y su serie anual, como lo piden las
 *  tablas de resultados. */
export interface ActivityWithTargets extends Activity {
  unit: { label: string } | null;
  targets: ActivityTarget[];
}

/** Lectura cualitativa del avance de los indicadores de un pilar. */
export interface PillarObservation {
  id: string;
  pillar_id: string;
  /** Nulo = observación vigente, sin anclar a un corte anual. */
  year: number | null;
  title: string;
  body: string;
  author: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PlanningItem {
  id: string;
  pillar_id: string;
  text: string;
  position: number;
}

export interface PdiDocument {
  id: string;
  pillar_id: string | null;
  area_id: string | null;
  action_line_id: string | null;
  title: string;
  description: string;
  kind: string;
  url: string;
  size_label: string | null;
  is_public: boolean;
  published_at: string | null;
  position: number;
}

export interface ChangeLogEntry {
  id: string;
  pillar_id: string;
  indicator_id: string | null;
  /** A qué objeto se refiere el cambio. Nulo si se registró a mano sobre el pilar. */
  project_id: string | null;
  activity_id: string | null;
  area_code: string;
  version: string;
  approved_by: string;
  changed_on: string;
  description: string;
  change_type: ChangeType;
  document_id: string | null;
}

/** Vista v_change_log: la entrada con el objeto al que apunta ya resuelto. */
export interface ChangeLogWithTarget extends ChangeLogEntry {
  project_name: string | null;
  activity_title: string | null;
  indicator_code: string | null;
}

export interface GlossaryTerm {
  id: string;
  pillar_id: string | null;
  term: string;
  definition: string;
  description: string;
  source: string | null;
  position: number;
}

/** Autor de un desarrollo. Vive dentro del proyecto, no en su propia tabla. */
export interface WebProjectAuthor {
  full_name: string;
  role?: string;
}

export interface WebProject {
  id: string;
  name: string;
  description: string;
  public_url: string | null;
  repo_kind: RepoKind;
  repo_url: string | null;
  authors: WebProjectAuthor[];
  status: PublicationStatus;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PillarOwner {
  pillar_id: string;
  profile_id: string;
}

/* --- Inserciones y actualizaciones ---------------------------------------- */

type Writable<T> = Partial<Omit<T, "id" | "created_at" | "updated_at">>;

export type PillarInput = Writable<Pillar>;
export type AreaInput = Writable<StrategicArea>;
export type ActionLineInput = Writable<ActionLine>;
export type IndicatorInput = Writable<Indicator>;
export type ProjectInput = Writable<Project>;
export type ActivityInput = Writable<Activity>;
export type ActivityTargetInput = Writable<Omit<ActivityTarget, "compliance">>;
export type PillarObservationInput = Writable<PillarObservation>;
export type DocumentInput = Writable<PdiDocument>;
export type ChangeLogInput = Writable<ChangeLogEntry>;
export type GlossaryInput = Writable<GlossaryTerm>;
export type ParameterInput = Writable<Parameter>;
export type PlanningItemInput = Writable<PlanningItem>;
export type WebProjectInput = Writable<WebProject>;
