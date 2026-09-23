/* =============================================================================
   Estructura institucional · tipos y etiquetas.

   Sin Supabase: lo usan también la hoja de carga masiva y sus pruebas.
   ========================================================================== */

import type { UnitKind, UnitRole } from "../../tableros/model";

export type DegreeLevel = "pregrado" | "especializacion" | "maestria" | "doctorado";
export type Modality = "presencial" | "virtual" | "distancia" | "dual" | "hibrida";
export type SubstantiveFunction = "investigacion" | "ensenanza" | "extension";

export const DEGREE_LABEL: Record<DegreeLevel, string> = {
  pregrado: "Pregrado",
  especializacion: "Especialización",
  maestria: "Maestría",
  doctorado: "Doctorado",
};

export const MODALITY_LABEL: Record<Modality, string> = {
  presencial: "Presencial",
  virtual: "Virtual",
  distancia: "A distancia",
  dual: "Dual",
  hibrida: "Híbrida",
};

export const FUNCTION_LABEL: Record<SubstantiveFunction, string> = {
  investigacion: "Investigación",
  ensenanza: "Enseñanza",
  extension: "Extensión",
};

export interface InstUnit {
  id: string;
  parentId: string | null;
  kind: UnitKind;
  code: string;
  name: string;
  slug: string;
  description: string;
  position: number;
  sniesCode: string | null;
  degreeLevel: DegreeLevel | null;
  modality: Modality | null;
  substantiveFunction: SubstantiveFunction | null;
  reportsTo: string | null;
}

export interface Campus {
  id: string;
  slug: string;
  code: string;
  name: string;
}

export interface ProgramCampus {
  programId: string;
  campusId: string;
  active: boolean;
}

export interface InstMember {
  id: string;
  unitId: string;
  profileId: string;
  role: UnitRole;
  accessRoleId: string | null;
  /** Cargo en la unidad (0074), texto libre. */
  title: string | null;
  name: string;
  email: string;
}

export interface Institution {
  units: InstUnit[];
  campuses: Campus[];
  offer: ProgramCampus[];
  members: InstMember[];
  /** false cuando la base no tiene todavía la 0073 (sin reports_to). */
  ready: boolean;
}

/** Clases que entran por la carga masiva. «otra» se carga como oficina. */
export type ImportKind = "vicerrectoria" | "facultad" | "oficina" | "programa";

/** Fila que espera admin_import_units (0074). */
export interface UnitImportRow {
  sheet: string;
  line: number;
  kind: ImportKind;
  code: string;
  name: string;
  slug: string;
  substantive_function?: SubstantiveFunction | null;
  vice_code?: string | null;
  parent_code?: string | null;
  snies_code?: string | null;
  faculty_code?: string;
  degree_level?: DegreeLevel;
  modality?: Modality;
  campuses?: string[];
}

/** Cómo se nombra cada clase en esta pantalla: la rama administrativa habla de dependencias. */
export const KIND_LABEL: Record<UnitKind, { label: string; plural: string }> = {
  vicerrectoria: { label: "Vicerrectoría", plural: "Vicerrectorías" },
  facultad: { label: "Facultad", plural: "Facultades" },
  programa: { label: "Programa", plural: "Programas" },
  oficina: { label: "Oficina o dependencia", plural: "Oficinas y dependencias" },
  otra: { label: "Otra dependencia", plural: "Otras dependencias" },
};
