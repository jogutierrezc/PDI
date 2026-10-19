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

   Cada módulo ofrece los niveles que la base distingue de verdad y nada más:
   donde solo hay dos (p. ej. Rutas: ver o editar) no se inventa un tercero.
   `seenFrom` es la capacidad mínima para que la pantalla aparezca: un rol de
   Consulta con Warehouse marcado no lo verá, y la matriz lo avisa.

   Impacto es la excepción, y por eso no depende de la capacidad: allí manda
   la pertenencia a una unidad. El rol lleva su nivel (Ver · Editar ·
   Administrar → impact_level none · editor · admin) y su alcance (todas las
   unidades, o las vicerrectorías, oficinas, facultades y programas de
   access_role_units). La base lo traduce a pertenencias efectivas
   (imp_my_memberships, 0154): Editar es lo que hace un Contribuyente de esa
   unidad y Administrar, lo que hace un Gestor.

   El rol va en el perfil de la persona. Lo que hace en cada unidad donde
   trabaja —Gestor, Contribuyente o Consulta— no es un rol de acceso: es su
   función en esa pertenencia (unit_members.role).
   ========================================================================== */

import type { AccessRole, AdminScreen, AppRole, ImpactLevel } from "../../../types/database";
import { UNIT_ROLE } from "../../tableros/model";

export type Level = "none" | "ver" | "editar" | "administrar";
export type ModuleId =
  | "portal" | "plan" | "cifras" | "observatorio" | "impacto" | "tableros" | "reportes" | "informes"
  | "monitor" | "programas-en-cifras" | "warehouse" | "rankings" | "rutas" | "internacionalizacion" | "correos" | "pilo" | "sistema";
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
  /** Capacidad mínima para ver el módulo, si pide más que Consulta. */
  seenFrom?: AppRole;
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
      ver: { hint: "Consulta las fichas y cifras de lo suyo; la vista completa es de Planeación.", needs: "consulta" },
      editar: {
        hint: "Define fichas y captura datos de las vicerrectorías, facultades y programas que se le asignen.",
        needs: "consulta",
      },
      administrar: {
        hint: "Además publica, revisa y emite los informes de las unidades que se le asignen.",
        needs: "consulta",
      },
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
    id: "reportes",
    label: "Reportes Institucionales",
    screens: [{ id: "reportes", label: "SNIES y CNA" }],
    levels: {
      ver: { hint: "Consulta el tablero de entregas y las plantillas, sin cambiarlas.", needs: "consulta" },
      editar: { hint: "Captura y valida plantillas.", needs: "responsable" },
      administrar: { hint: "Catálogos y reapertura.", needs: "planeacion" },
    },
  },
  {
    id: "programas-en-cifras",
    label: "Programas en Cifras",
    screens: [{ id: "programas-en-cifras", label: "Programas en Cifras", note: "director y coordinador entran por pertenencia, sin este rol; Planeación solo observa. Los roles especiales (Director y Coordinador de programa) se nombran dentro de la pantalla, en «Equipo»" }],
    levels: {
      ver: { hint: "Aparece en el menú; Planeación ve todos los programas, sin editar.", needs: "consulta" },
    },
  },
  {
    id: "monitor",
    label: "Monitor de alertas",
    screens: [{ id: "monitor", label: "Alertas tempranas de notas", note: "ve su facultad o programa según la unidad a la que pertenece; Planeación ve todo" }],
    levels: {
      ver: { hint: "Consulta cómo van las notas de lo que su unidad permite, y pide el análisis de Pilo.", needs: "consulta" },
      editar: { hint: "Además asigna a cada persona los programas o facultades que ve.", needs: "planeacion" },
    },
  },
  {
    id: "informes",
    label: "Informes de gestión",
    screens: [{ id: "informes", label: "Informes Institucionales", note: "quien pertenece a una unidad escribe el de su unidad" }],
    levels: {
      ver: { hint: "Abre la pantalla; escribe el informe de su unidad si pertenece a una.", needs: "consulta" },
      editar: { hint: "Abre, revisa y consolida los informes de todas las unidades.", needs: "planeacion" },
    },
  },
  {
    id: "warehouse",
    label: "Warehouse UDES",
    seenFrom: "planeacion",
    screens: [{ id: "warehouse", label: "Datos de las plataformas institucionales" }],
    levels: {
      ver: { hint: "Aparece en el menú; solo se abre con capacidad de Planeación.", needs: "consulta" },
      editar: { hint: "Consulta los datos del almacén y las alertas.", needs: "planeacion" },
      administrar: { hint: "Además configura conexiones y ejecuciones.", needs: "admin" },
    },
  },
  {
    id: "rankings",
    label: "Rankings (THE, GreenMetric)",
    seenFrom: "planeacion",
    screens: [{ id: "rankings", label: "Rankings y recolector de noticias" }],
    levels: {
      ver: { hint: "Aparece en el menú; solo se abre con capacidad de Planeación.", needs: "consulta" },
      editar: { hint: "Prepara y publica informes de ranking y noticias.", needs: "planeacion" },
    },
  },
  {
    id: "rutas",
    label: "Rutas del bus",
    seenFrom: "planeacion",
    screens: [{ id: "rutas", label: "Rutas del bus" }],
    levels: {
      ver: { hint: "Aparece en el menú; solo se abre con capacidad de Planeación.", needs: "consulta" },
      editar: { hint: "Crea y cambia rutas y paradas.", needs: "planeacion" },
    },
  },
  {
    id: "internacionalizacion",
    label: "Internacionalización",
    seenFrom: "admin",
    screens: [{ id: "internacionalizacion", label: "Internacionalización", note: "director, coordinador y gestor entran por pertenencia, sin este rol; Planeación y la administración la ven siempre (0166)" }],
    levels: {
      ver: { hint: "Aparece en el menú de quien sea administrador.", needs: "consulta" },
      administrar: { hint: "Administra el módulo y sus miembros.", needs: "admin" },
    },
  },
  {
    id: "correos",
    label: "Correos de la intranet",
    seenFrom: "planeacion",
    screens: [{ id: "correos", label: "Plantillas y bitácora de correos" }],
    levels: {
      ver: { hint: "Lee la bitácora de envíos; solo se abre con capacidad de Planeación.", needs: "consulta" },
      administrar: { hint: "Cambia plantillas, destinatarios y ajustes de envío.", needs: "admin" },
    },
  },
  {
    id: "pilo",
    label: "Pilo (administración)",
    seenFrom: "admin",
    screens: [
      { id: "pilo", label: "Mr. Pilo" },
      { id: "pilo_ensenanza", label: "Mr. Pilo Enseñanza" },
    ],
    levels: {
      ver: { hint: "Aparece en el menú de quien sea administrador.", needs: "consulta" },
      administrar: { hint: "Administra a Pilo: conocimiento, voz, accesos y cuentas.", needs: "admin" },
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

/** Alcance en Impacto: toda la estructura, o estas unidades (ids de `units`). */
export interface ImpactScope {
  allUnits: boolean;
  units: string[];
}

export interface Matrix {
  modules: Record<ModuleId, ModuleChoice>;
  /** UDES en Cifras: todos los informes o estos. */
  allReports: boolean;
  reports: string[];
  /** Indicadores de Impacto: sobre qué unidades edita o administra. */
  impact: ImpactScope;
}

/** Lo que se guarda en access_roles (más las listas de informes y de unidades). */
export interface RoleColumns {
  base_role: AppRole;
  screens: AdminScreen[];
  all_screens: boolean;
  all_reports: boolean;
  reports: string[];
  impact_level: ImpactLevel;
  all_impact_units: boolean;
  units: string[];
}

const emptyImpact = (): ImpactScope => ({ allUnits: false, units: [] });

/** Nivel de la matriz → columna de la base. Solo Editar y Administrar dan actuar sobre unidades. */
export const impactLevelOf = (level: Level): ImpactLevel =>
  level === "editar" ? "editor" : level === "administrar" ? "admin" : "none";

const levelOfImpact = (impact: ImpactLevel | undefined): Level =>
  impact === "editor" ? "editar" : impact === "admin" ? "administrar" : "ver";

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
  // Mis Tableros no depende de la capacidad: el trabajo se da por unidad. Impacto
  // tampoco, pero su nivel sí es el que se eligió (lo traduce impact_level).
  if (id === "tableros") return "ver";
  if (id === "impacto") return choice.level;
  const capacity = capacityOf(matrix);
  const module = moduleOf(id);
  if (module.seenFrom && RANK[capacity] < RANK[module.seenFrom]) return "none";
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
  const impactChoice = matrix.modules.impacto;
  const impactLevel = impactChoice.screens.length > 0 ? impactLevelOf(impactChoice.level) : "none";
  return {
    base_role: capacityOf(matrix),
    screens: screens.length === ALL_SCREENS.length ? [] : screens,
    all_screens: screens.length === ALL_SCREENS.length,
    all_reports: allReports,
    reports: cifras && !allReports ? [...matrix.reports].sort() : [],
    impact_level: impactLevel,
    all_impact_units: impactLevel !== "none" && matrix.impact.allUnits,
    units: impactLevel !== "none" && !matrix.impact.allUnits ? [...matrix.impact.units].sort() : [],
  };
}

/** Columnas de un rol guardado → matriz, para editarlo. */
export function decompile(
  role: Pick<AccessRole, "base_role" | "screens" | "all_screens" | "all_reports"> &
    Partial<Pick<AccessRole, "impact_level" | "all_impact_units">>,
  reports: string[],
  units: string[] = [],
): Matrix {
  const modules = emptyModules();
  const seen = role.all_screens ? ALL_SCREENS : role.screens;
  const draft: Matrix = {
    modules,
    allReports: role.all_reports,
    reports: [...reports],
    impact: { allUnits: role.all_impact_units ?? false, units: [...units] },
  };
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
  // Impacto no sigue a la capacidad: su nivel es el que guarda impact_level.
  if (modules.impacto.screens.length > 0) modules.impacto.level = levelOfImpact(role.impact_level);
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
  const base: Matrix = { modules, allReports: true, reports: [], impact: emptyImpact() };
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
    modules.reportes = full("reportes", "administrar");
    modules.monitor = full("monitor", "ver");
    modules.informes = full("informes", "editar");
    modules.warehouse = full("warehouse", "editar");
    modules.rankings = full("rankings", "editar");
    modules.rutas = full("rutas", "editar");
    modules.internacionalizacion = full("internacionalizacion", "ver");
    modules.correos = full("correos", "ver");
    modules.pilo = full("pilo", "ver");
    modules.sistema = full("sistema", "ver");
    return base;
  }
  for (const module of MODULES) {
    const levels = Object.keys(module.levels) as Level[];
    // Impacto se queda en «ver»: la administración ya manda sobre todo, y Editar
    // o Administrar allí piden un alcance, que una plantilla no puede adivinar.
    modules[module.id] = full(module.id, module.id === "impacto" ? "ver" : levels[levels.length - 1]);
  }
  return base;
}

const sameColumns = (a: RoleColumns, b: RoleColumns) =>
  a.base_role === b.base_role &&
  a.all_screens === b.all_screens &&
  a.all_reports === b.all_reports &&
  a.impact_level === b.impact_level &&
  a.all_impact_units === b.all_impact_units &&
  [...a.screens].sort().join() === [...b.screens].sort().join() &&
  [...a.reports].sort().join() === [...b.reports].sort().join() &&
  [...a.units].sort().join() === [...b.units].sort().join();

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
export function describe(
  matrix: Matrix,
  reportNames: Map<string, string> = new Map(),
  unitNames: Map<string, string> = new Map(),
): string[] {
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
  const impacto = effectiveLevel(matrix, "impacto");
  if (impacto === "editar" || impacto === "administrar") {
    const does = impacto === "editar" ? "define fichas y captura datos" : "define, captura, publica, revisa y emite informes";
    const names = matrix.impact.units.map((id) => unitNames.get(id) ?? "una unidad retirada");
    lines.push(
      matrix.impact.allUnits
        ? `En Indicadores de Impacto ${does} de toda la estructura.`
        : names.length > 0
          ? `En Indicadores de Impacto ${does} de: ${list(names)}.`
          : "En Indicadores de Impacto no tiene unidades asignadas: no actúa sobre ninguna.",
    );
  }
  return lines;
}
