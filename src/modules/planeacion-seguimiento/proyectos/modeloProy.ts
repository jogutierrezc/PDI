/* =============================================================================
   Planeación y Seguimiento · proyectos · reglas PURAS (sin DOM ni base):
   evaluar un proyecto (aprobar o rechazar), el alta y edición de proyectos de un plan en borrador,
   la validación para enviar el plan a la VAF y el resumen «solicitado vs aprobado».
   Las usan la interfaz, el adaptador de memoria y las pruebas; la base repite lo que importa (migración 0291).
   ========================================================================== */

import { leerNumero } from "../importar";
import type { LineasParaActividad } from "./contratoProy";
import { listaDeConfig, pilaresDeConfig, resolverPilar, type ConfigPlan, type PlanResumen } from "../modeloPlanes";
import {
  CAMPUS_TODOS, CRITERIOS, aniosDe, llano, pilarCodigo, pilarNombre, rotuloCampus,
  type ClaveCriterio, type Linea, type PsNivel,
} from "../modelo";

/* ---------- Estado y permisos ---------- */

export type EstadoProyecto = "sin_evaluar" | "aprobado" | "rechazado";
export type DecisionProyecto = "aprobado" | "rechazado";
export const ROTULO_ESTADO_PROYECTO: Record<EstadoProyecto, string> = { sin_evaluar: "Sin evaluar", aprobado: "Aprobado", rechazado: "Rechazado" };
export const RESULTADO_RECHAZADO = "Rechazado";

/** El estado de un proyecto según su resultado (`resultado` nulo = sin evaluar). */
export function estadoProyecto(l: Pick<Linea, "resultado">): EstadoProyecto {
  if (!l.resultado) return "sin_evaluar";
  return llano(l.resultado).startsWith("rechaz") ? "rechazado" : "aprobado";
}

/** Solo el rol financiero (VAF) y el administrador aprueban o rechazan; el resto lo ve en solo lectura. */
export const puedeEvaluarProyecto = (nivel: PsNivel): boolean => nivel === "financiero" || nivel === "admin";

/** ¿Puede crear, editar o eliminar proyectos del plan? Administrador, o gestor de la oficina dueña; nunca en una versión publicada. */
export function puedeEditarProyectos(nivel: PsNivel, poder: PlanResumen["poder"], versionEstado: "borrador" | "publicada" | null): boolean {
  if (versionEstado === "publicada") return false;
  return nivel === "admin" || poder === "admin" || (poder === "gestor" && nivel !== "aprobador" && nivel !== "lector" && nivel !== "none");
}

/** ¿Puede enviar el plan a la VAF (publicar la versión)? Mismo permiso: administrador o gestor de la oficina dueña. */
export const puedeEnviarPlan = puedeEditarProyectos;

/* ---------- Números ---------- */

export const MIN_NOTA_PROYECTO = 20;
export const TOLERANCIA_PCT = 0.01;
const redondear2 = (n: number): number => Math.round(n * 100) / 100;

/** Una caja de texto en pesos («6.971.769.559») o puntos («12,5») → número; nulo si está vacía o no es un número. */
export const numeroDeTexto = (t: string): number | null => (t.trim() === "" ? null : leerNumero(t));

/** La suma de los porcentajes (0 a 100) de la distribución anual. */
export const sumaPorcentajes = (pct: Record<string, number | null | undefined>): number => redondear2(Object.values(pct).reduce<number>((s, v) => s + (v ?? 0), 0));
export const sumaEs100 = (suma: number): boolean => Math.abs(suma - 100) <= TOLERANCIA_PCT;

/** «Faltan 12,5 puntos» / «Sobran 3 puntos» / «Suma 100 %»: lo que se anuncia al lector de pantalla junto al total. */
export function textoTotalPct(suma: number): string {
  const f = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  if (sumaEs100(suma)) return `Suma ${f(suma)} %: está completa.`;
  return suma < 100 ? `Suma ${f(suma)} %: faltan ${f(redondear2(100 - suma))} puntos para 100 %.` : `Suma ${f(suma)} %: sobran ${f(redondear2(suma - 100))} puntos sobre 100 %.`;
}

/** Reparte 100 % parejo entre los años dados (el último absorbe el redondeo). */
export function distribuirParejo(anios: readonly number[]): Record<string, number> {
  const n = anios.length;
  const out: Record<string, number> = {};
  if (!n) return out;
  const base = Math.floor((100 / n) * 100) / 100;
  anios.forEach((a, i) => (out[String(a)] = i === n - 1 ? redondear2(100 - base * (n - 1)) : base));
  return out;
}

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
export function esFechaValida(s: string): boolean {
  const m = FECHA.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(y, mo - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === mo - 1 && f.getUTCDate() === d;
}

export interface ErrorProy {
  /** El id del campo en pantalla (el que enlaza el resumen de errores). */
  campo: string;
  mensaje: string;
}

/* ---------- Evaluar un proyecto ---------- */

export interface DatosEvaluacionProyecto {
  decision: DecisionProyecto;
  criterios: Record<ClaveCriterio, boolean | null>;
  viabilidad: Record<ClaveViabilidadEvaluada, boolean | null>;
  prioridad: string;
  /** AAAA-MM-DD */
  inicio: string;
  fin: string;
  /** Porcentaje (0 a 100) de cada año; la clave es el año. */
  pct: Record<string, number | null>;
  montoAprobado: number | null;
  nota: string;
}

export interface ContextoEvaluacion {
  montoSolicitado: number | null;
  anioIni: number;
  anioFin: number;
  prioridades: readonly string[];
}

/** La base guarda tres viabilidades en la evaluación (`ps_proyecto_evaluar`): técnica, financiera y operativa. */
export const VIABILIDADES_EVALUADAS = { tec: "Técnica", fin: "Financiera", op: "Operativa" } as const;
export type ClaveViabilidadEvaluada = keyof typeof VIABILIDADES_EVALUADAS;

const faltan = (o: Record<string, boolean | null>, rot: Record<string, string>) => Object.entries(o).filter(([, v]) => v === null).map(([k]) => rot[k]);

/**
 * Valida la evaluación de un proyecto. Rechazar pide solo una nota de al menos 20 caracteres.
 * Aprobar pide criterios y viabilidades respondidos, prioridad, fechas, distribución anual que sume 100 y monto;
 * si el monto aprobado difiere del solicitado, una nota de al menos 20 caracteres que lo explique.
 */
export function validarEvaluacionProyecto(d: DatosEvaluacionProyecto, ctx: ContextoEvaluacion): ErrorProy[] {
  const e: ErrorProy[] = [];
  const nota = d.nota.trim();
  if (d.decision === "rechazado") {
    if (nota.length < MIN_NOTA_PROYECTO) e.push({ campo: "pe-nota", mensaje: `Para rechazar escriba la razón en la nota (al menos ${MIN_NOTA_PROYECTO} caracteres; lleva ${nota.length}).` });
    return e;
  }
  const sinCrit = faltan(d.criterios, CRITERIOS);
  if (sinCrit.length) e.push({ campo: "pe-criterios", mensaje: `Responda sí o no en cada criterio de priorización. Falta: ${sinCrit.join(", ")}.` });
  const sinViab = faltan(d.viabilidad, VIABILIDADES_EVALUADAS);
  if (sinViab.length) e.push({ campo: "pe-viabilidad", mensaje: `Responda sí o no en cada viabilidad. Falta: ${sinViab.join(", ")}.` });
  if (!d.prioridad) e.push({ campo: "pe-prioridad", mensaje: "Elija la prioridad del proyecto." });
  else if (!ctx.prioridades.includes(d.prioridad)) e.push({ campo: "pe-prioridad", mensaje: `La prioridad «${d.prioridad}» no es una de las del plan: ${ctx.prioridades.join(", ")}.` });

  const iniOk = esFechaValida(d.inicio);
  const finOk = esFechaValida(d.fin);
  if (!d.inicio) e.push({ campo: "pe-inicio", mensaje: "Escriba la fecha de inicio." });
  else if (!iniOk) e.push({ campo: "pe-inicio", mensaje: "La fecha de inicio no es válida. Use el calendario o escriba año-mes-día (2027-03-15)." });
  else if (Number(d.inicio.slice(0, 4)) < ctx.anioIni || Number(d.inicio.slice(0, 4)) > ctx.anioFin) e.push({ campo: "pe-inicio", mensaje: `El inicio debe caer entre ${ctx.anioIni} y ${ctx.anioFin}, los años del plan.` });
  if (!d.fin) e.push({ campo: "pe-fin", mensaje: "Escriba la fecha de fin." });
  else if (!finOk) e.push({ campo: "pe-fin", mensaje: "La fecha de fin no es válida. Use el calendario o escriba año-mes-día (2028-12-15)." });
  else if (Number(d.fin.slice(0, 4)) < ctx.anioIni || Number(d.fin.slice(0, 4)) > ctx.anioFin) e.push({ campo: "pe-fin", mensaje: `El fin debe caer entre ${ctx.anioIni} y ${ctx.anioFin}, los años del plan.` });
  else if (iniOk && d.fin < d.inicio) e.push({ campo: "pe-fin", mensaje: "El fin no puede ser anterior al inicio." });

  const malo = Object.entries(d.pct).find(([, v]) => v !== null && (!Number.isFinite(v) || v < 0 || v > 100));
  const suma = sumaPorcentajes(d.pct);
  if (malo) e.push({ campo: "pe-pct", mensaje: `El porcentaje de ${malo[0]} debe estar entre 0 y 100.` });
  else if (!sumaEs100(suma)) e.push({ campo: "pe-pct", mensaje: `La distribución anual ${textoTotalPct(suma).replace(/^Suma/, "suma").replace(":", ",")} Debe sumar exactamente 100 %.` });
  else if (iniOk && finOk && d.fin >= d.inicio) {
    const fuera = Object.entries(d.pct).filter(([a, v]) => (v ?? 0) > 0 && (Number(a) < Number(d.inicio.slice(0, 4)) || Number(a) > Number(d.fin.slice(0, 4)))).map(([a]) => a);
    if (fuera.length) e.push({ campo: "pe-pct", mensaje: `Hay porcentaje en ${fuera.join(", ")}, fuera de las fechas del proyecto (${d.inicio.slice(0, 4)} a ${d.fin.slice(0, 4)}). Ajuste las fechas o mueva ese porcentaje.` });
  }

  if (d.montoAprobado === null) e.push({ campo: "pe-monto", mensaje: "Escriba el monto aprobado (solo el número, en pesos)." });
  else if (!Number.isFinite(d.montoAprobado) || d.montoAprobado <= 0) e.push({ campo: "pe-monto", mensaje: "El monto aprobado debe ser mayor que cero. Si no hay recursos, rechace el proyecto." });
  else if (ctx.montoSolicitado !== null && Math.round(d.montoAprobado) !== Math.round(ctx.montoSolicitado) && nota.length < MIN_NOTA_PROYECTO) {
    e.push({ campo: "pe-nota", mensaje: `El monto aprobado difiere del solicitado: explique por qué en la nota (al menos ${MIN_NOTA_PROYECTO} caracteres; lleva ${nota.length}).` });
  }
  return e;
}

/** Los valores iniciales del formulario de evaluación: lo que ya trae el proyecto y el monto solicitado precargado. */
export function datosInicialesEvaluacion(l: Linea, anios: readonly number[]): DatosEvaluacionProyecto {
  const pct: Record<string, number | null> = {};
  for (const a of anios) pct[String(a)] = l.pct[String(a)] ? redondear2(l.pct[String(a)] * 100) : null;
  return {
    decision: "aprobado",
    criterios: { ...l.criterios },
    viabilidad: { tec: l.viabilidad.tec, fin: l.viabilidad.fin, op: l.viabilidad.op },
    prioridad: l.prioridad,
    inicio: l.inicio ?? "",
    fin: l.fin ?? "",
    pct,
    montoAprobado: l.montoAprobado ? l.montoAprobado : l.monto,
    nota: "",
  };
}

/** Aplica una evaluación a una línea (lo hace la base en producción; la memoria y las pruebas, esto). */
export function aplicarEvaluacion(l: Linea, d: DatosEvaluacionProyecto): Linea {
  if (d.decision === "rechazado") {
    return { ...l, resultado: RESULTADO_RECHAZADO, montoAprobado: 0, notaEvaluacion: d.nota.trim(), criterios: { ...d.criterios }, viabilidad: { ...l.viabilidad, ...d.viabilidad } };
  }
  const pct = Object.fromEntries(Object.entries(d.pct).map(([a, v]) => [a, (v ?? 0) / 100]));
  return { ...l, resultado: "Aprobado", prioridad: d.prioridad, inicio: d.inicio, fin: d.fin, pct, criterios: { ...d.criterios }, viabilidad: { ...l.viabilidad, ...d.viabilidad }, montoAprobado: d.montoAprobado, notaEvaluacion: d.nota.trim() || null };
}

/** Una evaluación registrada (`ps_evaluaciones_proyecto`): el historial de un proyecto. */
export interface EvaluacionProyecto {
  id: string;
  planId: string;
  /** La clave (N.º) del proyecto. */
  no: string;
  decision: DecisionProyecto;
  montoSolicitado: number | null;
  montoAprobado: number | null;
  nota: string;
  evaluadoPor: { id: string; nombre: string } | null;
  evaluadoEn: string;
  version: string;
}

/* ---------- Alta y edición de proyectos de un plan en borrador ---------- */

export interface DatosProyecto {
  nombre: string;
  descripcion: string;
  campus: string;
  pilar: string;
  /** Monto solicitado en pesos; nulo si aún no se sabe. */
  monto: number | null;
  prioridad: string;
  /** Nombre de la oficina responsable (de las unidades del portal). */
  oficina: string;
  fuente: string;
  clasif: string;
}

export const DATOS_PROYECTO_VACIOS: DatosProyecto = { nombre: "", descripcion: "", campus: "", pilar: "", monto: null, prioridad: "", oficina: "", fuente: "", clasif: "" };

export const datosDeLinea = (l: Linea): DatosProyecto => ({ nombre: l.nombre, descripcion: l.descripcion ?? "", campus: l.campus, pilar: l.pilar, monto: l.monto, prioridad: l.prioridad, oficina: l.oficina ?? "", fuente: l.fuente ?? "", clasif: l.clasif });

export interface ContextoProyecto {
  config: ConfigPlan;
  campus: readonly string[];
  oficinas: readonly string[];
}

/** El nombre y el monto solicitado siempre son obligatorios en la app (el monto es lo que evalúa la VAF). */
const obligatoria = (cfg: ConfigPlan, clave: string): boolean => clave === "nombre" || clave === "monto" || cfg.columnas.some((c) => c.clave === clave && c.obligatoria);
const incluida = (cfg: ConfigPlan, clave: string): boolean => clave === "nombre" || cfg.columnas.length === 0 || cfg.columnas.some((c) => c.clave === clave);

/** Valida un proyecto con las mismas reglas de la carga Excel: columnas obligatorias del plan, listas y pilares del plan. Los ids de campo son los del formulario (`pr-…`). */
export function validarProyecto(d: DatosProyecto, ctx: ContextoProyecto): ErrorProy[] {
  const e: ErrorProy[] = [];
  const cfg = ctx.config;
  const falta = (clave: string, valor: string | number | null) => obligatoria(cfg, clave) && (valor === null || String(valor).trim() === "");
  const nombre = d.nombre.trim();
  if (nombre.length < 3) e.push({ campo: "pr-nombre", mensaje: "Escriba el nombre del proyecto (al menos 3 letras)." });
  else if (nombre.length > 300) e.push({ campo: "pr-nombre", mensaje: `El nombre tiene ${nombre.length} caracteres y el máximo es 300. Acórtelo.` });
  if (d.descripcion.length > 1000) e.push({ campo: "pr-descripcion", mensaje: `La descripción tiene ${d.descripcion.length} caracteres y el máximo es 1.000. Acórtela.` });
  else if (falta("descripcion", d.descripcion.trim())) e.push({ campo: "pr-descripcion", mensaje: "Este plan pide la descripción del proyecto." });

  const listaCampus = [...ctx.campus, CAMPUS_TODOS];
  if (falta("campus", d.campus)) e.push({ campo: "pr-campus", mensaje: "Elija el campus del proyecto (o «Todos los campus»)." });
  else if (d.campus && !listaCampus.some((c) => llano(c) === llano(d.campus))) e.push({ campo: "pr-campus", mensaje: `El campus «${d.campus}» no existe en la lista de campus del portal.` });

  const pilares = pilaresDeConfig(cfg);
  if (falta("pilar", d.pilar)) e.push({ campo: "pr-pilar", mensaje: "Elija el pilar del proyecto; es obligatorio en este plan." });
  else if (d.pilar && pilares && !resolverPilar(cfg, d.pilar)) e.push({ campo: "pr-pilar", mensaje: `«${d.pilar}» no es un pilar de este plan. Elija uno de la lista: ${pilares.join("; ")}.` });

  if (d.monto === null) {
    if (falta("monto", null)) e.push({ campo: "pr-monto", mensaje: "Escriba el monto solicitado en pesos (solo el número)." });
  } else if (!Number.isFinite(d.monto) || d.monto < 0) e.push({ campo: "pr-monto", mensaje: "El monto solicitado debe ser un número de cero en adelante." });

  const prioridades = listaDeConfig(cfg, "prioridad");
  if (falta("prioridad", d.prioridad)) e.push({ campo: "pr-prioridad", mensaje: "Elija la prioridad del proyecto." });
  else if (d.prioridad && !prioridades.some((p) => llano(p) === llano(d.prioridad))) e.push({ campo: "pr-prioridad", mensaje: `La prioridad «${d.prioridad}» no es válida. Elija una de: ${prioridades.join(", ")}.` });

  const clasifs = listaDeConfig(cfg, "clasif");
  if (falta("clasif", d.clasif)) e.push({ campo: "pr-clasif", mensaje: "Elija la clasificación del proyecto." });
  else if (d.clasif && !clasifs.some((p) => llano(p) === llano(d.clasif))) e.push({ campo: "pr-clasif", mensaje: `La clasificación «${d.clasif}» no es válida. Elija una de: ${clasifs.join(", ")}.` });

  const fuentes = listaDeConfig(cfg, "fuente");
  if (falta("fuente", d.fuente)) e.push({ campo: "pr-fuente", mensaje: "Elija la fuente de financiación." });
  else if (d.fuente && !fuentes.some((p) => llano(p) === llano(d.fuente))) e.push({ campo: "pr-fuente", mensaje: `La fuente «${d.fuente}» no es válida. Elija una de la lista.` });

  if (falta("oficina", d.oficina)) e.push({ campo: "pr-oficina", mensaje: "Elija la oficina responsable del proyecto." });
  else if (d.oficina && !ctx.oficinas.some((o) => llano(o) === llano(d.oficina))) e.push({ campo: "pr-oficina", mensaje: `La oficina «${d.oficina}» no está entre las unidades del portal.` });
  return e;
}

/** Qué campos del formulario muestra este plan (los de la plantilla del plan; `nombre` siempre). */
export const camposDelPlan = (cfg: ConfigPlan): Record<"descripcion" | "campus" | "pilar" | "monto" | "prioridad" | "clasif" | "fuente" | "oficina", boolean> => ({
  descripcion: incluida(cfg, "descripcion"), campus: incluida(cfg, "campus"), pilar: incluida(cfg, "pilar"), monto: incluida(cfg, "monto"),
  prioridad: incluida(cfg, "prioridad"), clasif: incluida(cfg, "clasif"), fuente: incluida(cfg, "fuente"), oficina: incluida(cfg, "oficina"),
});
export const esObligatorio = obligatoria;

/** El siguiente N.º libre de un plan: el mayor número + 1 (conserva el prefijo si todos lo tienen, como «T»). */
export function siguienteClave(existentes: readonly string[]): string {
  if (!existentes.length) return "1";
  const prefijo = /^\D+/.exec(existentes[0])?.[0] ?? "";
  const mismos = existentes.filter((n) => n.startsWith(prefijo));
  const max = Math.max(0, ...mismos.map((n) => Number(n.slice(prefijo.length)) || 0));
  return `${prefijo}${max + 1}`;
}

/** Una línea nueva a partir de los datos del formulario. */
export function lineaDeDatos(no: string, d: DatosProyecto, previa?: Linea): Linea {
  const vacia: Linea = {
    no, clasif: "", nombre: "", descripcion: null, campus: "", pilar: "", monto: null, prioridad: "", resultado: null, fuente: null,
    criterios: { alin: null, deficit: null, norm: null, pdi: null, sost: null }, viabilidad: { tec: null, fin: null, op: null, nor: null, est: null },
    inicio: null, fin: null, pct: {}, origen: null, oficina: null, gestorCorreo: null,
  };
  const base = previa ?? vacia;
  return { ...base, no, nombre: d.nombre.trim(), descripcion: d.descripcion.trim() || null, campus: d.campus, pilar: d.pilar.trim(), monto: d.monto, prioridad: d.prioridad, fuente: d.fuente.trim() || null, clasif: d.clasif, oficina: d.oficina.trim() || null };
}

/**
 * Valida el plan completo antes de enviarlo a la VAF (publicar la versión), con las mismas reglas de la carga Excel:
 * al menos un proyecto, cada proyecto válido y sin claves repetidas.
 */
export interface ProblemaEnvio {
  no: string | null;
  nombre: string;
  campo: string | null;
  mensaje: string;
}
export function validarPlanParaEnviar(lineas: readonly Linea[], ctx: ContextoProyecto): ProblemaEnvio[] {
  const out: ProblemaEnvio[] = [];
  if (lineas.length === 0) return [{ no: null, nombre: "", campo: null, mensaje: "El plan no tiene proyectos. Agregue al menos uno antes de enviarlo a la VAF." }];
  const vistos = new Map<string, number>();
  for (const l of lineas) vistos.set(l.no, (vistos.get(l.no) ?? 0) + 1);
  for (const l of lineas) {
    if ((vistos.get(l.no) ?? 0) > 1) out.push({ no: l.no, nombre: l.nombre, campo: null, mensaje: `La clave «${l.no}» está repetida.` });
    for (const x of validarProyecto(datosDeLinea(l), ctx)) out.push({ no: l.no, nombre: l.nombre, campo: x.campo, mensaje: x.mensaje });
  }
  return out;
}

/* ---------- Resumen «solicitado vs aprobado» ---------- */

export interface CifraMonto {
  monto: number;
  n: number;
}
export interface GrupoAprobacion {
  clave: string;
  nombre: string;
  solicitado: number;
  aprobado: number;
  n: number;
}
export interface FilaAprobacion {
  no: string;
  nombre: string;
  pilar: string;
  campus: string;
  oficina: string | null;
  estado: EstadoProyecto;
  solicitado: number;
  aprobado: number | null;
  /** aprobado − solicitado; nulo si el proyecto no está aprobado. */
  diferencia: number | null;
}
export interface ResumenAprobacion {
  solicitado: CifraMonto;
  aprobado: CifraMonto;
  rechazado: CifraMonto;
  sinEvaluar: CifraMonto;
  porPilar: GrupoAprobacion[];
  porCampus: GrupoAprobacion[];
  porOficina: GrupoAprobacion[];
  /** Solo de los proyectos aprobados (los demás no traen distribución anual). */
  porAnio: GrupoAprobacion[];
  proyectos: FilaAprobacion[];
  /** Monto solicitado de los proyectos sin distribución anual programada: no entra en «por año». */
  solicitadoSinDistribuir?: number;
}

export const SIN_OFICINA_APROB = "Sin oficina";

/** El monto aprobado de una línea: lo registrado o, en una anterior a esta función, el monto solicitado. */
export const montoAprobadoDe = (l: Linea): number => (estadoProyecto(l) === "aprobado" ? (l.montoAprobado ?? l.monto ?? 0) : 0);

export function resumenAprobacion(lineas: readonly Linea[], anios: readonly number[] = aniosDe()): ResumenAprobacion {
  const sum = (xs: readonly Linea[], f: (l: Linea) => number): CifraMonto => ({ monto: xs.reduce((s, l) => s + f(l), 0), n: xs.length });
  const por = (estado: EstadoProyecto) => lineas.filter((l) => estadoProyecto(l) === estado);
  const grupos = (clave: (l: Linea) => string, nombre: (c: string) => string, orden?: (a: GrupoAprobacion, b: GrupoAprobacion) => number): GrupoAprobacion[] => {
    const m = new Map<string, GrupoAprobacion>();
    for (const l of lineas) {
      const k = clave(l);
      const g = m.get(k) ?? { clave: k, nombre: nombre(k), solicitado: 0, aprobado: 0, n: 0 };
      g.solicitado += l.monto ?? 0;
      g.aprobado += montoAprobadoDe(l);
      g.n += 1;
      m.set(k, g);
    }
    return [...m.values()].sort(orden ?? ((a, b) => b.solicitado - a.solicitado || a.nombre.localeCompare(b.nombre, "es")));
  };
  const aprobadas = por("aprobado");
  const porAnio: GrupoAprobacion[] = anios.map((a) => ({
    clave: String(a), nombre: String(a), n: aprobadas.filter((l) => (l.pct[String(a)] ?? 0) > 0).length,
    solicitado: aprobadas.reduce((s, l) => s + (l.monto ?? 0) * (l.pct[String(a)] ?? 0), 0),
    aprobado: aprobadas.reduce((s, l) => s + montoAprobadoDe(l) * (l.pct[String(a)] ?? 0), 0),
  }));
  return {
    solicitado: sum(lineas, (l) => l.monto ?? 0),
    aprobado: sum(aprobadas, montoAprobadoDe),
    rechazado: sum(por("rechazado"), (l) => l.monto ?? 0),
    sinEvaluar: sum(por("sin_evaluar"), (l) => l.monto ?? 0),
    porPilar: grupos((l) => l.pilar || "Sin pilar", (c) => (c === "Sin pilar" ? c : `${pilarCodigo(c)} · ${pilarNombre(c)}`), (a, b) => a.clave.localeCompare(b.clave, "es", { numeric: true })),
    porCampus: grupos((l) => l.campus || "Sin campus", rotuloCampus),
    porOficina: grupos((l) => l.oficina ?? SIN_OFICINA_APROB, (c) => c),
    porAnio,
    solicitadoSinDistribuir: lineas.filter((l) => !Object.values(l.pct).some((x) => x > 0)).reduce((s, l) => s + (l.monto ?? 0), 0),
    proyectos: lineas.map((l): FilaAprobacion => {
      const estado = estadoProyecto(l);
      const aprobado = estado === "aprobado" ? montoAprobadoDe(l) : null;
      return { no: l.no, nombre: l.nombre, pilar: l.pilar, campus: l.campus, oficina: l.oficina, estado, solicitado: l.monto ?? 0, aprobado, diferencia: aprobado === null ? null : aprobado - (l.monto ?? 0) };
    }),
  };
}

/* ---------- Proyectos a los que puede contribuir una actividad ---------- */

/** Filtra por nombre, número u oficina; la línea elegida se conserva siempre para que no desaparezca del selector. */
export function filtrarLineasParaActividad(d: LineasParaActividad, q: string, elegida = ""): Pick<LineasParaActividad, "propias" | "otras"> {
  const t = llano(q);
  const ok = (l: { no: string; nombre: string }, extra = "") => l.no === elegida || !t || llano(`${l.no} ${l.nombre} ${extra}`).includes(t);
  return { propias: d.propias.filter((l) => ok(l)), otras: d.otras.filter((l) => ok(l, l.oficinaNombre)) };
}

/** Las otras oficinas agrupadas, ordenadas por nombre; dentro de cada una, por número. */
export function agruparPorOficina<T extends { oficinaId: string; oficinaNombre: string; no: string }>(xs: readonly T[]): { oficinaId: string; oficinaNombre: string; lineas: T[] }[] {
  const m = new Map<string, { oficinaId: string; oficinaNombre: string; lineas: T[] }>();
  for (const x of xs) {
    const g = m.get(x.oficinaId) ?? { oficinaId: x.oficinaId, oficinaNombre: x.oficinaNombre, lineas: [] };
    g.lineas.push(x);
    m.set(x.oficinaId, g);
  }
  return [...m.values()].map((g) => ({ ...g, lineas: g.lineas.sort((a, b) => a.no.localeCompare(b.no, "es", { numeric: true })) })).sort((a, b) => a.oficinaNombre.localeCompare(b.oficinaNombre, "es"));
}

/** Qué decirle a quien crea una actividad según los proyectos disponibles; para el administrador, enlaza a «Asignar oficinas». */
export function ayudaLineasParaActividad(d: LineasParaActividad, oficina: string, esAdmin: boolean): { texto: string; asignar: boolean } {
  if (d.total === 0) return { texto: "Este plan todavía no tiene proyectos: puede crear una actividad propia de la oficina.", asignar: false };
  if (d.conOficina === 0) return { texto: `Ningún proyecto del plan tiene oficina responsable todavía, y por eso no hay proyectos para elegir. ${esAdmin ? "Asígneles una oficina." : "Pida al administrador de planeación que se la asigne."} Mientras tanto puede crear una actividad propia de la oficina.`, asignar: esAdmin };
  if (d.propias.length === 0) return { texto: `${oficina} no tiene proyectos asignados. Puede aportar a un proyecto de otra oficina (se avisa a su gestor) o crear una actividad propia.`, asignar: esAdmin };
  return { texto: `Primero los proyectos que ${oficina} tiene a su cargo; debajo, los de otras oficinas del plan.`, asignar: false };
}
