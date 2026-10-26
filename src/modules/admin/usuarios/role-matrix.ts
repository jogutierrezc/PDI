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
   Administrar → impact_level none · editor · admin). Las unidades y la sede ya
   no se eligen en el rol: se asignan en la ficha de la persona (función
   Gestor o Contribuyente por unidad). Un rol guardado con alcance antiguo
   (all_impact_units / access_role_units, 0154) lo conserva: el editor no lo
   muestra pero lo respeta al guardar, y la base lo sigue sumando.

   Informes de gestión sigue el mismo camino en pequeño (0169): quien pertenece a
   una unidad escribe el informe de su unidad; el rol puede además darle el de
   otras (informe_level none · editor · jefe, y su alcance en
   access_role_informe_units). La base lo une a la pertenencia en informe_actor().

   La GESTIÓN de Informes (tablero del ciclo, revisión, consolidador,
   capacitación de Pilo, el informe de cualquier unidad) ya no sale de la
   capacidad (0192): la concede access_roles.informe_gestion, que se escribe
   cuando el nivel ELEGIDO en Informes de gestión es Editar. «Ver» no gestiona
   aunque otro módulo suba la capacidad del rol; por eso effectiveLevel no
   eleva Informes. La decide informe_gestiona() en la base.

   El rol va en el perfil de la persona. Lo que hace en cada unidad donde
   trabaja —Gestor, Contribuyente o Consulta— no es un rol de acceso: es su
   función en esa pertenencia (unit_members.role).
   ========================================================================== */

import type { AccessRole, AdminScreen, AppRole, GmNivel, ImpactLevel, InformeLevel } from "../../../types/database";
import { UNIT_ROLE } from "../../tableros/model";

export type Level = "none" | "ver" | "editar" | "administrar";
export type ModuleId =
  | "portal" | "plan" | "cifras" | "observatorio" | "impacto" | "tableros" | "reportes" | "informes"
  | "monitor" | "programas-en-cifras" | "warehouse" | "rankings" | "rutas" | "cms" | "internacionalizacion" | "correos" | "encuestas" | "udrive" | "gestion-master" | "pilo" | "sistema";
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
        hint: "Define fichas y captura datos de las unidades donde se le asigne Contribuyente. Las unidades y la sede se asignan en la ficha de la persona.",
        needs: "consulta",
      },
      administrar: {
        hint: "Además publica, revisa y emite los informes de las unidades donde se le asigne Gestor. Las unidades y la sede se asignan en la ficha de la persona.",
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
    screens: [{ id: "programas-en-cifras", label: "Programas en Cifras", note: "edita quien sea Director o Coordinador de un programa en una sede: se nombra al crear o editar a la persona (unidad y sede), o en «Equipo» dentro de la pantalla. Planeación solo observa"}],
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
    screens: [{ id: "informes", label: "Informes Institucionales", note: "quien pertenece a una unidad escribe el de su unidad; el rol puede darle además el de otras (0169)" }],
    levels: {
      ver: {
        hint: "Solo Mi informe y la Vista del informe: el de su unidad y el de las unidades que se le asignen aquí abajo. No ve el tablero, la revisión, el consolidador ni la capacitación de Pilo.",
        needs: "consulta",
      },
      editar: {
        hint: "Gestiona los informes de todas las unidades: tablero del ciclo, revisión (aprobar o devolver), consolidador y capacitación de Pilo. Pide capacidad de Planeación.",
        needs: "planeacion",
      },
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
    id: "gestion-master",
    label: "Gestión Master",
    screens: [{ id: "gestion_master", label: "Gestión de Actividades", note: "el acceso lo da el nivel del rol, no la capacidad; quien aprueba lo hace por la función del rol" }],
    levels: {
      ver: { hint: "Aparece en el menú, pero sin acceso al módulo: elija Editar o Administrar para dar un papel en Gestión Master.", needs: "consulta" },
      editar: { hint: "Solicita actividades (directivo o vicerrector) o revisa y decide el paso que le toca por su función, según el papel que elija abajo.", needs: "consulta" },
      administrar: { hint: "Además configura flujos y funciones, aplica los cambios en el Master, concilia con el Warehouse, cierra el corte e importa Rua.", needs: "consulta" },
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
    id: "cms",
    label: "CMS Portales",
    seenFrom: "planeacion",
    screens: [{ id: "cms", label: "CMS Portales" }],
    levels: {
      ver: { hint: "Aparece en el menú; solo se abre con capacidad de Planeación.", needs: "consulta" },
      editar: { hint: "Escribe, ordena y publica las páginas y micrositios de la landing, Planeación y UDES Sostenible.", needs: "planeacion" },
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
    id: "udrive",
    label: "UDrive",
    screens: [{ id: "udrive", label: "UDrive", note: "cada persona ve lo suyo y lo que le comparten; la base (0187) lo hace cumplir" }],
    levels: {
      ver: { hint: "Abre UDrive: archivos, tablas y gráficas propias y compartidas.", needs: "consulta" },
    },
  },
  {
    id: "encuestas",
    label: "Encuestas con Pilo",
    screens: [{ id: "encuestas", label: "Encuestas públicas y sus respuestas" }],
    levels: {
      ver: { hint: "Lee la tabla de respuestas; pide capacidad de Responsable.", needs: "responsable" },
      editar: { hint: "Cambia título y mensajes de Pilo, abre o cierra la encuesta y marca el estado de cada aporte.", needs: "planeacion" },
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
      { id: "pilo_capacitacion", label: "Capacitación de Pilo" },
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

/** Alcance heredado en Impacto (ya no se edita en el rol, pero se conserva): toda la estructura, o estas unidades (ids de `units`). */
export interface ImpactScope {
  allUnits: boolean;
  units: string[];
}

/** Informes de gestión: qué papel da el rol y sobre qué unidades (ids de `units`). */
export interface InformeScope {
  level: InformeLevel;
  allUnits: boolean;
  units: string[];
}

/** Gestión Master con «Editar»: el papel (solicita o revisa) y, si revisa, la función que firma (gm_funciones). */
export interface GmScope {
  papel: "solicitante" | "revisor";
  funcion: string;
}

export interface Matrix {
  modules: Record<ModuleId, ModuleChoice>;
  /** UDES en Cifras: todos los informes o estos. */
  allReports: boolean;
  reports: string[];
  /** Indicadores de Impacto: alcance heredado de roles guardados antes; el editor lo conserva sin mostrarlo. */
  impact: ImpactScope;
  /** Informes de gestión: las unidades cuyo informe escribe el rol. */
  informe: InformeScope;
  /** Gestión Master (0194). */
  gm: GmScope;
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
  informe_level: InformeLevel;
  all_informe_units: boolean;
  informe_units: string[];
  /** Gestiona los informes de todas las unidades (0192): el nivel elegido en Informes es Editar o más. */
  informe_gestion: boolean;
  /** Gestión Master (0194): none con «Ver»; solicitante o revisor con «Editar»; gestor con «Administrar». */
  gm_nivel: GmNivel;
  /** La función que firma (vaf, planeacion…); solo si el nivel es revisor o gestor. */
  gm_funcion: string | null;
}

const emptyImpact = (): ImpactScope => ({ allUnits: false, units: [] });
const emptyInforme = (): InformeScope => ({ level: "none", allUnits: false, units: [] });
const emptyGm = (): GmScope => ({ papel: "solicitante", funcion: "" });

/** Nivel de la matriz → gm_nivel. «Ver» no da acceso (como Impacto): el permiso es explícito. */
const gmNivelOf = (level: Level, gm: GmScope): GmNivel => (level === "editar" ? gm.papel : level === "administrar" ? "gestor" : "none");

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
  // Informes de gestión tampoco: la gestión no sale de la capacidad sino del nivel elegido (0192).
  if (id === "informes") return choice.level;
  // Gestión Master: el nivel es el elegido (gm_nivel), nunca la capacidad (0194).
  if (id === "gestion-master") return choice.level;
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
  const informeOn = matrix.modules.informes.level !== "none" && matrix.modules.informes.screens.length > 0;
  // Con «Editar» el rol gestiona todos los informes: el papel por unidad sobra y se guarda vacío.
  const informeGestion = informeOn && LEVEL_RANK[matrix.modules.informes.level] >= LEVEL_RANK.editar;
  const informeLevel: InformeLevel = informeOn && !informeGestion ? matrix.informe.level : "none";
  const gmOn = matrix.modules["gestion-master"].level !== "none" && matrix.modules["gestion-master"].screens.length > 0;
  const gmNivel: GmNivel = gmOn ? gmNivelOf(matrix.modules["gestion-master"].level, matrix.gm) : "none";
  return {
    base_role: capacityOf(matrix),
    screens: screens.length === ALL_SCREENS.length ? [] : screens,
    all_screens: screens.length === ALL_SCREENS.length,
    all_reports: allReports,
    reports: cifras && !allReports ? [...matrix.reports].sort() : [],
    impact_level: impactLevel,
    all_impact_units: impactLevel !== "none" && matrix.impact.allUnits,
    units: impactLevel !== "none" && !matrix.impact.allUnits ? [...matrix.impact.units].sort() : [],
    informe_level: informeLevel,
    all_informe_units: informeLevel !== "none" && matrix.informe.allUnits,
    informe_units: informeLevel !== "none" && !matrix.informe.allUnits ? [...matrix.informe.units].sort() : [],
    informe_gestion: informeGestion,
    gm_nivel: gmNivel,
    gm_funcion: (gmNivel === "revisor" || gmNivel === "gestor") && matrix.gm.funcion ? matrix.gm.funcion : null,
  };
}

/** Columnas de un rol guardado → matriz, para editarlo. */
export function decompile(
  role: Pick<AccessRole, "base_role" | "screens" | "all_screens" | "all_reports"> &
    Partial<Pick<AccessRole, "impact_level" | "all_impact_units" | "informe_level" | "all_informe_units" | "informe_gestion" | "gm_nivel" | "gm_funcion">>,
  reports: string[],
  units: string[] = [],
  informeUnits: string[] = [],
): Matrix {
  const modules = emptyModules();
  const seen = role.all_screens ? ALL_SCREENS : role.screens;
  const draft: Matrix = {
    modules,
    allReports: role.all_reports,
    reports: [...reports],
    impact: { allUnits: role.all_impact_units ?? false, units: [...units] },
    informe: { level: role.informe_level ?? "none", allUnits: role.all_informe_units ?? false, units: [...informeUnits] },
    gm: { papel: role.gm_nivel === "revisor" ? "revisor" : "solicitante", funcion: role.gm_funcion ?? "" },
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
    if (modules[module.id].level === "none" || module.id === "tableros" || module.id === "impacto" || module.id === "informes" || module.id === "gestion-master") continue;
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
  // Informes tampoco: gestiona solo si el rol lo guarda (informe_gestion, 0192) y tiene capacidad para ello.
  if (modules.informes.screens.length > 0) {
    modules.informes.level = role.informe_gestion && RANK[capacity] >= RANK.planeacion ? "editar" : "ver";
  }
  // Gestión Master tampoco sigue a la capacidad: su nivel es el que guarda gm_nivel. Con la pantalla marcada y sin nivel, queda en «Ver» (sin acceso).
  if (modules["gestion-master"].screens.length > 0) {
    modules["gestion-master"].level = role.gm_nivel === "gestor" ? "administrar" : role.gm_nivel === "solicitante" || role.gm_nivel === "revisor" ? "editar" : "ver";
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
  const base: Matrix = { modules, allReports: true, reports: [], impact: emptyImpact(), informe: emptyInforme(), gm: emptyGm() };
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
    modules.cms = full("cms", "editar");
    modules.internacionalizacion = full("internacionalizacion", "ver");
    modules.correos = full("correos", "ver");
    modules.encuestas = full("encuestas", "editar");
    modules.udrive = full("udrive", "ver");
    modules.pilo = full("pilo", "ver");
    modules.sistema = full("sistema", "ver");
    return base;
  }
  for (const module of MODULES) {
    const levels = Object.keys(module.levels) as Level[];
    // Impacto se queda en «ver»: sus unidades se asignan en la ficha de cada
    // persona, y una plantilla no puede adivinarlas.
    modules[module.id] = full(module.id, module.id === "impacto" || module.id === "gestion-master" ? "ver" : levels[levels.length - 1]);
  }
  return base;
}

const sameColumns = (a: RoleColumns, b: RoleColumns) =>
  a.base_role === b.base_role &&
  a.all_screens === b.all_screens &&
  a.all_reports === b.all_reports &&
  a.impact_level === b.impact_level &&
  a.all_impact_units === b.all_impact_units &&
  a.informe_level === b.informe_level &&
  a.informe_gestion === b.informe_gestion &&
  a.gm_nivel === b.gm_nivel &&
  (a.gm_funcion ?? "") === (b.gm_funcion ?? "") &&
  a.all_informe_units === b.all_informe_units &&
  [...a.informe_units].sort().join() === [...b.informe_units].sort().join() &&
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
    const own = `En Indicadores de Impacto ${does} en las unidades donde se le asigne ${impacto === "editar" ? "Contribuyente" : "Gestor"} (se asignan en su ficha).`;
    lines.push(own);
    if (matrix.impact.allUnits) lines.push("Además, por el alcance que ya traía el rol, actúa sobre toda la estructura.");
    else if (names.length > 0) lines.push(`Además, por el alcance que ya traía el rol, actúa sobre: ${list(names)}.`);
  }
  const informes = effectiveLevel(matrix, "informes");
  if (informes === "editar" || informes === "administrar") {
    lines.push("En Informes de gestión gestiona los de todas las unidades: tablero del ciclo, revisión, consolidador y capacitación de Pilo.");
  } else if (informes === "ver") {
    lines.push("En Informes de gestión solo tiene Mi informe y la Vista del informe, del de su unidad y de las unidades que se le asignen.");
  }
  if (informes === "ver" && matrix.informe.level !== "none") {
    const does = matrix.informe.level === "jefe" ? "escribe y envía" : "escribe";
    const names = matrix.informe.units.map((id) => unitNames.get(id) ?? "una unidad retirada");
    lines.push(
      matrix.informe.allUnits
        ? `En Informes de gestión ${does} el informe de toda la estructura.`
        : names.length > 0
          ? `En Informes de gestión ${does} el informe de: ${list(names)}.`
          : "En Informes de gestión no tiene unidades asignadas: solo escribe el de su unidad, si pertenece a una.",
    );
  }
  const gm = effectiveLevel(matrix, "gestion-master");
  if (gm === "editar") {
    lines.push(
      matrix.gm.papel === "revisor"
        ? `En Gestión Master revisa y decide el paso que le toca por su función${matrix.gm.funcion ? ` («${matrix.gm.funcion}»)` : ""}.`
        : "En Gestión Master solicita actividades del Master y sigue sus solicitudes.",
    );
  } else if (gm === "administrar") {
    lines.push("En Gestión Master gestiona: configura flujos y funciones, aplica en el Master, concilia con el Warehouse y cierra el corte.");
  } else if (gm === "ver") {
    lines.push("En Gestión Master la pantalla aparece, pero sin acceso al módulo (falta elegir un papel).");
  }
  return lines;
}
