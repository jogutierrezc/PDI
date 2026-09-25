/* =============================================================================
   La matriz de un rol: qué hace en cada módulo.

   Es una forma de MIRAR lo que la base ya guarda y ya hace cumplir, no un
   permiso nuevo. Las columnas de siempre siguen mandando:

     base_role     la capacidad (consulta < responsable < planeación < admin).
                   Editar en el Portal, el Plan, UDES en Cifras o el
                   Observatorio pide capacidad; la base no distingue módulos.
     screens /     qué pantallas de la intranet ve.
     all_screens
     all_reports / qué informes de UDES en Cifras alcanza.
     reports

   Por eso la capacidad del rol es la MAYOR que pide alguno de sus módulos, y
   un módulo que se marcó «Ver» puede acabar editando si otro pidió más: la
   matriz lo dice (`effectiveLevel` y `raisedModules`) en vez de esconderlo.
   Separar ver de editar por módulo pediría cambiar las políticas RLS; se
   acordó no hacerlo.

   El rol va en el perfil de la persona. Lo que hace en cada unidad donde
   trabaja —Gestor, Contribuyente o Consulta— no es un rol de acceso: es su
   función en esa pertenencia (unit_members.role).
   ========================================================================== */

import type { AccessRole, AdminScreen, AppRole } from "../../../types/database";
import { UNIT_ROLE } from "../../tableros/model";

export type Level = "none" | "ver" | "editar" | "administrar";
export type ModuleId = "portal" | "plan" | "cifras" | "observatorio" | "impacto" | "tableros" | "sistema";
export type TemplateId = "consulta" | "editor" | "administrador" | "personalizada";
export type BoardRole = "visor" | "editor" | "jefe";

export const LEVEL_LABEL: Record<Level, string> = {
  none: "Sin acceso",
  ver: "Ver",
  editar: "Editar",
  administrar: "Administrar",
};

const RANK: Record<AppRole, number> = { consulta: 0, responsable: 1, planeacion: 2, admin: 3 };
const LEVEL_RANK: Record<Level, number> = { none: 0, ver: 1, editar: 2, administrar: 3 };

export interface ModuleDef {
  id: ModuleId;
  label: string;
  screens: { id: AdminScreen; label: string; note?: string }[];
  /** Niveles que tiene sentido elegir, con lo que significa cada uno. */
  levels: Partial<Record<Exclude<Level, "none">, { hint: string; needs: AppRole }>>;
}

/** Los módulos de la intranet, en el orden del menú. */
export const MODULES: ModuleDef[] = [
  {
    id: "portal",
    label: "Portal de Planeación",
    screens: [
      { id: "office", label: "Página de la oficina" },
      { id: "documents", label: "Documentos" },
    ],
    levels: {
      ver: { hint: "Ve los borradores de la página y los documentos.", needs: "consulta" },
      editar: { hint: "Escribe y publica la página y los documentos.", needs: "planeacion" },
    },
  },
  {
    id: "plan",
    label: "Plan de Desarrollo",
    screens: [
      { id: "pillars", label: "Gestión de pilares" },
      { id: "projects", label: "Proyectos" },
      { id: "faculties", label: "PDI por facultad" },
      { id: "campus", label: "PDI por campus" },
      { id: "budget", label: "Presupuesto" },
      { id: "repository", label: "Repositorio" },
    ],
    levels: {
      ver: { hint: "Consulta el avance del plan.", needs: "consulta" },
      editar: { hint: "Reporta el avance de los pilares que tenga asignados.", needs: "responsable" },
      administrar: { hint: "Edita cualquier pilar y decide qué se publica.", needs: "planeacion" },
    },
  },
  {
    id: "cifras",
    label: "UDES en Cifras",
    screens: [{ id: "cifras", label: "Estaciones del periodo" }],
    levels: {
      ver: { hint: "Ve los informes en borrador, sin cambiarlos.", needs: "consulta" },
      editar: { hint: "Carga y publica los informes que se le asignen.", needs: "planeacion" },
      administrar: { hint: "Todos los informes, además del periodo, sus campus y los informes nuevos.", needs: "planeacion" },
    },
  },
  {
    id: "observatorio",
    label: "Observatorio de Analítica",
    screens: [{ id: "observatorio", label: "Taller del Observatorio" }],
    levels: {
      ver: { hint: "Ve los temas y boletines en preparación.", needs: "consulta" },
      editar: { hint: "Prepara y publica temas y boletines.", needs: "planeacion" },
    },
  },
  {
    id: "impacto",
    label: "Indicadores de Impacto",
    screens: [{ id: "impacto", label: "Indicadores de impacto", note: "vicerrectorías, oficinas y programas lo ven por su pertenencia" }],
    levels: {
      ver: { hint: "Consulta las fichas y cifras de todas las funciones (con capacidad de Planeación).", needs: "consulta" },
    },
  },
  {
    id: "tableros",
    label: "Mis Tableros",
    screens: [{ id: "tableros", label: "Unidades y tableros", note: "quien pertenece a una unidad lo ve de todos modos" }],
    levels: {
      ver: { hint: "Ve la lista de unidades y tableros; el trabajo se da por unidad.", needs: "consulta" },
    },
  },
  {
    id: "sistema",
    label: "Sistema",
    screens: [
      { id: "structure", label: "Normalizar estructura" },
      { id: "parameters", label: "Parámetros globales" },
      { id: "development", label: "Desarrollo tecnológico" },
      { id: "institution", label: "Estructura institucional", note: "pide administrar" },
      { id: "users", label: "Usuarios y roles", note: "pide administrar" },
      { id: "transfer", label: "Traslado de datos", note: "pide administrar" },
    ],
    levels: {
      ver: { hint: "Consulta parámetros y desarrollo tecnológico.", needs: "consulta" },
      administrar: { hint: "Gestiona la estructura institucional, las personas y los roles.", needs: "admin" },
    },
  },
];

export const ALL_SCREENS: AdminScreen[] = MODULES.flatMap((module) => module.screens.map((screen) => screen.id));

export const SCREEN_LABELS = Object.fromEntries(
  MODULES.flatMap((module) => module.screens.map((screen) => [screen.id, screen.label])),
) as Record<AdminScreen, string>;

/** Función en la unidad (Mis Tableros), con las etiquetas de tableros/model.ts. */
export const BOARD_ROLE_LABEL: Record<BoardRole, { level: Level; label: string; hint: string }> = {
  visor: { level: "ver", ...UNIT_ROLE.visor },
  editor: { level: "editar", ...UNIT_ROLE.editor },
  jefe: { level: "administrar", ...UNIT_ROLE.jefe },
};

/* --- La matriz ------------------------------------------------------------------ */

export interface ModuleChoice {
  level: Level;
  /** Pantallas del módulo que ve. Todas, si coincide con las del módulo. */
  screens: AdminScreen[];
}

export interface Matrix {
  modules: Record<ModuleId, ModuleChoice>;
  /** UDES en Cifras: todos los informes o estos. */
  allReports: boolean;
  reports: string[];
}

/** Lo que se guarda en access_roles (más la lista de informes). */
export interface RoleColumns {
  base_role: AppRole;
  screens: AdminScreen[];
  all_screens: boolean;
  all_reports: boolean;
  reports: string[];
}

const moduleOf = (id: ModuleId) => MODULES.find((module) => module.id === id)!;
const allOf = (id: ModuleId) => moduleOf(id).screens.map((screen) => screen.id);

function emptyModules(): Record<ModuleId, ModuleChoice> {
  return Object.fromEntries(MODULES.map((module) => [module.id, { level: "none", screens: [] }])) as unknown as Record<
    ModuleId,
    ModuleChoice
  >;
}

/** Capacidad que pide un rol: la mayor de sus módulos. */
export function capacityOf(matrix: Matrix): AppRole {
  let best: AppRole = "consulta";
  for (const module of MODULES) {
    const choice = matrix.modules[module.id];
    if (choice.level === "none" || choice.screens.length === 0) continue;
    const needs = module.levels[choice.level as Exclude<Level, "none">]?.needs ?? "consulta";
    if (RANK[needs] > RANK[best]) best = needs;
  }
  return best;
}

/**
 * Lo que de verdad podrá hacer en un módulo, con la capacidad que pide el rol
 * entero. Nunca es menos que lo elegido; puede ser más.
 */
export function effectiveLevel(matrix: Matrix, id: ModuleId): Level {
  const choice = matrix.modules[id];
  if (choice.level === "none" || choice.screens.length === 0) return "none";
  // Mis Tableros e Impacto no dependen de la capacidad: el trabajo se da por unidad.
  if (id === "tableros" || id === "impacto") return "ver";
  const capacity = capacityOf(matrix);
  const module = moduleOf(id);
  let best: Level = choice.level;
  for (const [level, def] of Object.entries(module.levels) as [Exclude<Level, "none">, { needs: AppRole }][]) {
    if (id === "cifras" && level === "administrar" && !matrix.allReports) continue;
    if (id === "cifras" && level === "editar" && matrix.allReports) continue;
    if (RANK[def.needs] <= RANK[capacity] && LEVEL_RANK[level] > LEVEL_RANK[best]) best = level;
  }
  // Con todos los informes y capacidad para editarlos, UDES en Cifras se administra.
  if (id === "cifras" && best === "editar" && matrix.allReports) best = "administrar";
  return best;
}

/** Módulos en los que podrá hacer más de lo que se eligió, por la capacidad del rol. */
export function raisedModules(matrix: Matrix): ModuleId[] {
  return MODULES.filter((module) => {
    const chosen = matrix.modules[module.id].level;
    return chosen !== "none" && LEVEL_RANK[effectiveLevel(matrix, module.id)] > LEVEL_RANK[chosen];
  }).map((module) => module.id);
}

/** Matriz → columnas de access_roles. */
export function compile(matrix: Matrix): RoleColumns {
  const screens = MODULES.flatMap((module) => {
    const choice = matrix.modules[module.id];
    if (choice.level === "none") return [];
    return module.screens.map((screen) => screen.id).filter((screen) => choice.screens.includes(screen));
  });
  const cifras = matrix.modules.cifras.level !== "none" && matrix.modules.cifras.screens.length > 0;
  const allReports = cifras && (matrix.allReports || matrix.modules.cifras.level === "administrar");
  return {
    base_role: capacityOf(matrix),
    screens: screens.length === ALL_SCREENS.length ? [] : screens,
    all_screens: screens.length === ALL_SCREENS.length,
    all_reports: allReports,
    reports: cifras && !allReports ? [...matrix.reports].sort() : [],
  };
}

/** Columnas de un rol guardado → matriz, para editarlo. */
export function decompile(role: Pick<AccessRole, "base_role" | "screens" | "all_screens" | "all_reports">, reports: string[]): Matrix {
  const modules = emptyModules();
  const seen = role.all_screens ? ALL_SCREENS : role.screens;
  const draft: Matrix = { modules, allReports: role.all_reports, reports: [...reports] };
  for (const module of MODULES) {
    const screens = module.screens.map((screen) => screen.id).filter((screen) => seen.includes(screen));
    if (screens.length === 0) continue;
    modules[module.id] = { level: "ver", screens };
  }
  // La capacidad guardada se reparte: cada módulo toma el nivel más alto que
  // esa capacidad le permite. Es lo que la base hace cumplir.
  const capacity = role.base_role;
  for (const module of MODULES) {
    if (modules[module.id].level === "none" || module.id === "tableros" || module.id === "impacto") continue;
    let best: Level = "ver";
    for (const [level, def] of Object.entries(module.levels) as [Exclude<Level, "none">, { needs: AppRole }][]) {
      if (module.id === "cifras" && level === "administrar" && !role.all_reports) continue;
      if (module.id === "cifras" && level === "editar" && role.all_reports) continue;
      if (RANK[def.needs] <= RANK[capacity] && LEVEL_RANK[level] > LEVEL_RANK[best]) best = level;
    }
    modules[module.id].level = best;
  }
  return draft;
}

/* --- Plantillas ------------------------------------------------------------------ */

export const TEMPLATES: { id: Exclude<TemplateId, "personalizada">; label: string; hint: string }[] = [
  { id: "consulta", label: "Consulta", hint: "Ve toda la intranet y no cambia nada." },
  { id: "editor", label: "Editor", hint: "Escribe y publica en el Portal, el Plan, UDES en Cifras y el Observatorio." },
  { id: "administrador", label: "Administrador", hint: "Todo, incluidas la estructura institucional, las personas y los roles." },
];

function full(id: ModuleId, level: Level): ModuleChoice {
  return { level, screens: allOf(id) };
}

/** La matriz de una plantilla. */
export function templateMatrix(template: Exclude<TemplateId, "personalizada">): Matrix {
  const modules = emptyModules();
  const base: Matrix = { modules, allReports: true, reports: [] };
  if (template === "consulta") {
    for (const module of MODULES) modules[module.id] = full(module.id, "ver");
    return base;
  }
  if (template === "editor") {
    modules.portal = full("portal", "editar");
    modules.plan = full("plan", "administrar");
    modules.cifras = full("cifras", "administrar");
    modules.observatorio = full("observatorio", "editar");
    modules.impacto = full("impacto", "ver");
    modules.tableros = full("tableros", "ver");
    modules.sistema = full("sistema", "ver");
    return base;
  }
  for (const module of MODULES) {
    const levels = Object.keys(module.levels) as Level[];
    modules[module.id] = full(module.id, levels[levels.length - 1]);
  }
  return base;
}

const sameColumns = (a: RoleColumns, b: RoleColumns) =>
  a.base_role === b.base_role &&
  a.all_screens === b.all_screens &&
  a.all_reports === b.all_reports &&
  [...a.screens].sort().join() === [...b.screens].sort().join() &&
  [...a.reports].sort().join() === [...b.reports].sort().join();

/** Qué plantilla es una matriz; «personalizada» si no coincide con ninguna. */
export function templateOf(matrix: Matrix): TemplateId {
  const columns = compile(matrix);
  for (const template of TEMPLATES) {
    if (sameColumns(columns, compile(templateMatrix(template.id)))) return template.id;
  }
  return "personalizada";
}

/* --- En palabras -------------------------------------------------------------------- */

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

/** Lo que podrá hacer quien lleve el rol, en frases cortas. */
export function describe(matrix: Matrix, reportNames: Map<string, string> = new Map()): string[] {
  const byLevel: Record<Exclude<Level, "none">, string[]> = { ver: [], editar: [], administrar: [] };
  for (const module of MODULES) {
    const level = effectiveLevel(matrix, module.id);
    if (level === "none") continue;
    const partial = matrix.modules[module.id].screens.length < module.screens.length;
    byLevel[level].push(partial ? `${module.label} (en parte)` : module.label);
  }
  const lines: string[] = [];
  if (byLevel.administrar.length) lines.push(`Administra ${list(byLevel.administrar)}.`);
  if (byLevel.editar.length) lines.push(`Edita ${list(byLevel.editar)}.`);
  if (byLevel.ver.length) lines.push(`Consulta ${list(byLevel.ver)}.`);
  if (lines.length === 0) lines.push("No ve ninguna pantalla de la intranet.");
  const cifras = effectiveLevel(matrix, "cifras");
  if (cifras === "editar") {
    lines.push(
      matrix.reports.length > 0
        ? `En UDES en Cifras escribe: ${list(matrix.reports.map((slug) => reportNames.get(slug) ?? slug))}.`
        : "En UDES en Cifras no tiene informes asignados: no escribe ninguno.",
    );
  }
  return lines;
}
