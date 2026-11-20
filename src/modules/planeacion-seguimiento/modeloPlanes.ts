/* =============================================================================
   Planeación y Seguimiento · Fase 3B · varios planes. Modelo y reglas puras (sin DOM):
   el plan con su oficina dueña y alcance, la configuración de la plantilla (columnas y listas),
   los pilares del plan y el tablero de todos los planes. CONTRATO-BD-F3B.md.
   ========================================================================== */

import { COLUMNAS, type CampoId, type Columna } from "./columnas";
import { CLASIFICACIONES, FUENTES, PILARES, PRIORIDADES, RESULTADOS, llano, type PsNivel } from "./modelo";

export type EstadoPlan = "activo" | "archivado";
export type AlcancePlan = "institucional" | "oficina";
export type SaludPlan = "verde" | "ambar" | "rojo" | "sin_datos";
export const ROTULO_SALUD: Record<SaludPlan, string> = { verde: "En buen estado", ambar: "Con atención", rojo: "En riesgo", sin_datos: "Sin datos" };
export const ROTULO_ALCANCE: Record<AlcancePlan, string> = { institucional: "Institucional", oficina: "De una oficina" };

export interface OficinaRef {
  id: string;
  nombre: string;
}

/** Un plan tal como lo lista `ps_planes_visibles`, con sus cifras. */
export interface PlanResumen {
  id: string;
  nombre: string;
  anioIni: number;
  anioFin: number;
  descripcion: string;
  estado: EstadoPlan;
  alcance: AlcancePlan;
  oficina: OficinaRef | null;
  /** Etiqueta de la versión vigente (v1.0), si la hay. */
  versionVigente: string | null;
  poder: "admin" | "gestor" | "colaborador" | "lector" | null;
  lineas: number;
  actividades: number;
  vencidas: number;
  porValidar: number;
  /** 0 a 100. */
  avanceFisico: number;
  avanceFinanciero: number | null;
  salud: SaludPlan;
  /** Es el plan activo de la persona. */
  activo: boolean;
}

/* ---------- Configuración de la plantilla ---------- */

export type TipoColumnaPlan = "texto" | "numero" | "fecha" | "lista";

export interface ColumnaPlan {
  /** Clave del catálogo de `columnas.ts` (`no`, `nombre`, `monto`, `crit:alin`, `pct:2027`…). */
  clave: string;
  etiqueta: string;
  tipo: TipoColumnaPlan;
  obligatoria: boolean;
  lista?: string[];
  ayuda?: string;
}

export interface PilarPlan {
  id?: string;
  codigo: string;
  nombre: string;
  /** Del PDI institucional (`pillars`); nulo = pilar propio del plan. */
  pillarId: string | null;
  activo: boolean;
}

export interface ConfigPlan {
  columnas: ColumnaPlan[];
  listas: Record<string, string[]>;
  pilares: PilarPlan[];
}

/** Las claves que no se pueden quitar ni volver opcionales. */
export const CLAVES_SIEMPRE = ["no", "nombre"] as const;
/** Las listas que se editan por plan. */
export const CLAVES_LISTA = ["clasif", "prioridad", "resultado", "fuente"] as const;
export type ClaveLista = (typeof CLAVES_LISTA)[number];
export const ROTULO_LISTA: Record<ClaveLista, string> = { clasif: "Clasificación", prioridad: "Prioridad", resultado: "Resultado de la evaluación", fuente: "Fuente de financiación" };

export const LISTAS_PDIFYT: Record<ClaveLista, string[]> = { clasif: [...CLASIFICACIONES], prioridad: [...PRIORIDADES], resultado: [...RESULTADOS], fuente: [...FUENTES] };

/** El catálogo de columnas con los «% de inversión» de los años dados (por omisión, los del PDIFyT), en el orden de `columnas.ts`. */
export function columnasBase(anios?: readonly number[]): Columna[] {
  const out: Columna[] = [];
  let puesto = false;
  for (const c of COLUMNAS) {
    if (!c.id.startsWith("pct:")) { out.push(c); continue; }
    if (puesto) continue;
    puesto = true;
    if (!anios) { out.push(...COLUMNAS.filter((x) => x.id.startsWith("pct:"))); continue; }
    for (const a of anios) out.push({ id: `pct:${a}`, base: `% de inversión ${a}`, pista: "de 0 a 100", ancho: 12, tipo: "diligenciar" });
  }
  return out;
}

/** Las claves que la base (`ps_plan_config`) conoce. Criterios, viabilidades, «% de inversión» y correo del gestor viajan siempre como opcionales: no se configuran. */
export const CLAVES_CATALOGO = ["no", "clasif", "nombre", "descripcion", "campus", "pilar", "monto", "prioridad", "resultado", "fuente", "origen", "inicio", "fin", "oficina"] as const;
/** Las obligatorias por omisión de un plan nuevo (las del contrato: el PDIFyT sin configuración sigue con las suyas). */
export const OBLIGATORIAS_POR_OMISION = ["no", "nombre", "campus", "pilar", "prioridad"] as const;
const esExtra = (id: string): boolean => id.startsWith("crit:") || id.startsWith("viab:") || id.startsWith("pct:") || id === "gestorCorreo";

const tipoDe = (c: Columna): TipoColumnaPlan => {
  if (c.id === "monto") return "numero";
  if (c.id === "inicio" || c.id === "fin") return "fecha";
  if (["clasif", "campus", "pilar", "prioridad", "resultado", "fuente", "oficina"].includes(c.id)) return "lista";
  return "texto";
};

/** El catálogo completo de columnas posibles (las de `columnas.ts`), para la pantalla de la plantilla. */
export function catalogoColumnas(anios?: readonly number[]): ColumnaPlan[] {
  void anios;
  return COLUMNAS.filter((c) => (CLAVES_CATALOGO as readonly string[]).includes(c.id)).map((c) => ({ clave: c.id, etiqueta: c.base, tipo: tipoDe(c), obligatoria: (OBLIGATORIAS_POR_OMISION as readonly string[]).includes(c.id), ayuda: c.pista }));
}

/** La configuración por omisión: el conjunto actual del PDIFyT. */
export function configPorOmision(): ConfigPlan {
  return {
    columnas: catalogoColumnas(),
    listas: structuredClone(LISTAS_PDIFYT) as Record<string, string[]>,
    pilares: Object.entries(PILARES).map(([k, v], i) => ({ id: `pl-${i + 1}`, codigo: k, nombre: v, pillarId: null, activo: true })),
  };
}

/** Las columnas de la plantilla de un plan, como las entiende `plantilla.ts`/`importar.ts` (mismo orden del catálogo). */
export function columnasDeConfig(cfg: ConfigPlan | null | undefined, anios?: readonly number[]): Columna[] {
  if (!cfg || !cfg.columnas.length) return columnasBase(anios);
  const porClave = new Map(cfg.columnas.map((c) => [c.clave, c]));
  return columnasBase(anios).filter((c) => esExtra(c.id) || porClave.has(c.id)).map((c) => {
    const p = porClave.get(c.id);
    if (!p) return { ...c, tipo: "diligenciar" as const };
    const obligatoria = p.obligatoria || (CLAVES_SIEMPRE as readonly string[]).includes(c.id);
    return { ...c, base: p.etiqueta.trim() || c.base, pista: p.ayuda?.trim() || c.pista, tipo: obligatoria ? "obligatoria" : "diligenciar" };
  });
}

/** Una lista del plan (con la del PDIFyT por omisión). */
export const listaDeConfig = (cfg: ConfigPlan | null | undefined, k: ClaveLista): string[] => (cfg?.listas?.[k]?.length ? cfg.listas[k] : LISTAS_PDIFYT[k]);

/** Los pilares activos como los ofrece la lista del Excel: «P2. Ambiente tecnológico». */
export const textoPilar = (p: Pick<PilarPlan, "codigo" | "nombre">): string => (p.codigo ? `${p.codigo}. ${p.nombre}` : p.nombre);
export function pilaresDeConfig(cfg: ConfigPlan | null | undefined): string[] | null {
  const a = (cfg?.pilares ?? []).filter((p) => p.activo);
  return a.length ? a.map(textoPilar) : null;
}
/** Resuelve lo que escribió la persona («P2», «Ambiente tecnológico», «P2. Ambiente…») contra los pilares del plan. */
export function resolverPilar(cfg: ConfigPlan | null | undefined, t: string): string | null {
  const ps = (cfg?.pilares ?? []).filter((p) => p.activo);
  if (!ps.length) return null;
  const k = llano(t);
  const cod = llano(t.split(/[.\s·-]/)[0]);
  const p = ps.find((x) => llano(textoPilar(x)) === k || llano(x.nombre) === k || (x.codigo && (llano(x.codigo) === k || llano(x.codigo) === cod)));
  return p ? textoPilar(p) : null;
}

/* ---------- Validación de los datos de un plan ---------- */

export interface DatosPlan {
  id?: string;
  nombre: string;
  anioIni: number;
  anioFin: number;
  descripcion: string;
  oficinaId: string | null;
  alcance: AlcancePlan;
  config: ConfigPlan;
}

export interface ErrorPlan {
  campo: string;
  mensaje: string;
  paso: "datos" | "oficina" | "plantilla" | "pilares";
}

export function validarDatosPlan(d: DatosPlan, ctx: { nivel: PsNivel; oficinasPermitidas: readonly string[]; editando?: boolean }): ErrorPlan[] {
  const e: ErrorPlan[] = [];
  const n = d.nombre.trim();
  if (n.length < 3) e.push({ campo: "plan-nombre", paso: "datos", mensaje: "Escriba el nombre del plan (al menos 3 letras)." });
  else if (n.length > 120) e.push({ campo: "plan-nombre", paso: "datos", mensaje: "El nombre admite hasta 120 caracteres." });
  const rango = (x: number) => Number.isInteger(x) && x >= 2000 && x <= 2100;
  if (!rango(d.anioIni)) e.push({ campo: "plan-anioIni", paso: "datos", mensaje: "Escriba un año entre 2000 y 2100." });
  if (!rango(d.anioFin)) e.push({ campo: "plan-anioFin", paso: "datos", mensaje: "Escriba un año entre 2000 y 2100." });
  else if (rango(d.anioIni) && d.anioFin < d.anioIni) e.push({ campo: "plan-anioFin", paso: "datos", mensaje: "El año final no puede ser anterior al inicial." });
  if (d.anioFin - d.anioIni > 30) e.push({ campo: "plan-anioFin", paso: "datos", mensaje: "Un plan cubre hasta 30 años." });
  if (d.descripcion.length > 2000) e.push({ campo: "plan-descripcion", paso: "datos", mensaje: "La descripción admite hasta 2.000 caracteres." });
  if (!d.oficinaId) e.push({ campo: "plan-oficina", paso: "oficina", mensaje: "Elija la oficina dueña del plan. Es obligatoria." });
  else if (ctx.nivel !== "admin" && !ctx.oficinasPermitidas.includes(d.oficinaId)) e.push({ campo: "plan-oficina", paso: "oficina", mensaje: "Solo puede crear planes de una oficina en la que usted es gestor." });
  if (d.alcance === "institucional" && ctx.nivel !== "admin") e.push({ campo: "plan-alcance", paso: "oficina", mensaje: "Un plan institucional lo crea solo el administrador de planeación; el suyo es un plan de oficina." });
  for (const k of CLAVES_SIEMPRE) {
    const c = d.config.columnas.find((x) => x.clave === k);
    if (!c || !c.obligatoria) e.push({ campo: "plan-columnas", paso: "plantilla", mensaje: `La columna «${k === "no" ? "N.º" : "Nombre"}» es siempre obligatoria.` });
  }
  const conocidas = new Set<string>(CLAVES_CATALOGO);
  const desconocida = d.config.columnas.find((c) => !conocidas.has(c.clave));
  if (desconocida) e.push({ campo: "plan-columnas", paso: "plantilla", mensaje: `La columna «${desconocida.clave}» no existe en el catálogo.` });
  for (const k of CLAVES_LISTA) {
    const activa = d.config.columnas.some((c) => c.clave === k);
    const l = d.config.listas[k] ?? [];
    if (activa && l.filter((x) => x.trim()).length === 0) e.push({ campo: `plan-lista-${k}`, paso: "plantilla", mensaje: `La lista «${ROTULO_LISTA[k]}» no puede quedar vacía.` });
    if (new Set(l.map((x) => llano(x))).size !== l.length) e.push({ campo: `plan-lista-${k}`, paso: "plantilla", mensaje: `La lista «${ROTULO_LISTA[k]}» tiene un valor repetido.` });
  }
  const pil = d.config.pilares.filter((p) => p.activo);
  if (d.config.columnas.some((c) => c.clave === "pilar" && c.obligatoria) && pil.length === 0) e.push({ campo: "plan-pilares", paso: "pilares", mensaje: "La columna «Pilar» es obligatoria: defina al menos un pilar, o hágala opcional en el paso anterior." });
  const claves = new Set(pil.map((p) => llano(p.codigo || p.nombre)));
  if (claves.size !== pil.length) e.push({ campo: "plan-pilares", paso: "pilares", mensaje: "Hay un pilar con el mismo código o nombre repetido." });
  if (pil.some((p) => p.nombre.trim().length < 3)) e.push({ campo: "plan-pilares", paso: "pilares", mensaje: "Cada pilar necesita un nombre (al menos 3 letras)." });
  return e;
}

/* ---------- Tablero de todos los planes ---------- */

export interface PlanOficinaCelda {
  unitId: string;
  nombre: string;
  lineas: number;
  actividades: number;
  /** 0 a 100. */
  avance: number;
  vencidas: number;
  porValidar: number;
  salud: SaludPlan;
}

export interface AlertaTablero {
  /** plan_sin_version, plan_borrador_antiguo, oficina_sin_responsable, actividades_vencidas, avances_por_validar_vencidos y las de vigilancia del presupuesto. */
  tipo: string;
  planId: string;
  oficinaId: string | null;
  texto: string;
  severidad: "alta" | "media" | "baja";
}

export interface PlanTablero extends PlanResumen {
  porOficina: PlanOficinaCelda[];
  porEstado: Record<string, number>;
  porPilar: { nombre: string; actividades: number }[];
  /** Avances validados por semana (la más antigua primero). */
  ritmoSemanas: { semana: string; avancesValidados: number }[];
  monto: number;
}

export interface TableroAdmin {
  generadoEn: string;
  totales: { planes: number; activos: number; lineas: number; actividades: number; vencidas: number; enRiesgo: number; porValidar: number; avanceFisico: number; avanceFinanciero: number | null; monto: number };
  planes: PlanTablero[];
  alertas: AlertaTablero[];
}

export interface FiltrosTablero {
  estado?: EstadoPlan | "";
  oficinaId?: string;
  anio?: number;
  salud?: SaludPlan | "";
}

/** Salud de un plan a partir de sus cifras: rojo si hay mucho vencido o por validar vencido; ámbar si hay algo. */
export function saludDe(x: { actividades: number; vencidas: number; porValidar: number; enRiesgo?: number }): SaludPlan {
  if (x.actividades === 0) return "sin_datos";
  const frac = x.vencidas / x.actividades;
  if (frac >= 0.2 || (x.enRiesgo ?? 0) / x.actividades >= 0.25) return "rojo";
  if (frac > 0 || x.porValidar > 0 || (x.enRiesgo ?? 0) > 0) return "ambar";
  return "verde";
}

export const ORDEN_SALUD: Record<SaludPlan, number> = { rojo: 0, ambar: 1, verde: 2, sin_datos: 3 };
export type OrdenPlanes = "nombre" | "avance" | "salud" | "vencidas";
export function ordenarPlanes<T extends PlanResumen>(l: readonly T[], o: OrdenPlanes): T[] {
  const c: Record<OrdenPlanes, (a: T, b: T) => number> = {
    nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
    avance: (a, b) => b.avanceFisico - a.avanceFisico,
    salud: (a, b) => ORDEN_SALUD[a.salud] - ORDEN_SALUD[b.salud] || b.vencidas - a.vencidas,
    vencidas: (a, b) => b.vencidas - a.vencidas,
  };
  return [...l].sort((a, b) => c[o](a, b) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Filtra el tablero por estado, año, salud y oficina (la base ya lo hace; esto sirve a la demostración). */
export function filtrarTablero(t: TableroAdmin, f: FiltrosTablero): TableroAdmin {
  const planes = t.planes.filter((p) => (!f.estado || p.estado === f.estado) && (!f.salud || p.salud === f.salud) && (!f.anio || (p.anioIni <= f.anio && p.anioFin >= f.anio)) && (!f.oficinaId || p.oficina?.id === f.oficinaId || p.porOficina.some((o) => o.unitId === f.oficinaId)));
  return { ...t, planes, alertas: t.alertas.filter((a) => planes.some((p) => p.id === a.planId)) };
}

/** Totales a partir de los planes. */
export function totalesDe(planes: readonly PlanTablero[]): TableroAdmin["totales"] {
  const lineas = planes.reduce((s, p) => s + p.lineas, 0);
  const actividades = planes.reduce((s, p) => s + p.actividades, 0);
  const pond = planes.reduce((s, p) => s + p.avanceFisico * p.actividades, 0);
  const fin = planes.filter((p) => p.avanceFinanciero !== null);
  return {
    planes: planes.length, activos: planes.filter((p) => p.estado === "activo").length, lineas, actividades,
    vencidas: planes.reduce((s, p) => s + p.vencidas, 0), enRiesgo: planes.reduce((s, p) => s + (p.porEstado.en_riesgo ?? 0), 0), porValidar: planes.reduce((s, p) => s + p.porValidar, 0),
    avanceFisico: actividades ? Math.round(pond / actividades) : 0, avanceFinanciero: fin.length ? Math.round(fin.reduce((s, p) => s + (p.avanceFinanciero ?? 0), 0) / fin.length) : null,
    monto: planes.reduce((s, p) => s + p.monto, 0),
  };
}

/** Color de calor 0..4 para la matriz plan × oficina (no solo color: la celda lleva el número). */
export const nivelCalor = (avance: number, actividades: number): 0 | 1 | 2 | 3 | 4 => (actividades === 0 ? 0 : avance >= 75 ? 4 : avance >= 50 ? 3 : avance >= 25 ? 2 : 1);

/** Quién ve «Todos los planes»: administrador (opera); aprobador, lector y financiero (VAF) solo miran. */
export const puedeVerTodosLosPlanes = (n: PsNivel): boolean => n === "admin" || n === "aprobador" || n === "lector" || n === "financiero";
export const puedeCrearPlanes = (n: PsNivel, esGestorDeOficina: boolean): boolean => n === "admin" || (n === "gestor" && esGestorDeOficina);

export type { CampoId };
