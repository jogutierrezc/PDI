/* =============================================================================
   Planeación y Seguimiento · VAF · modelo y reglas puras (sin DOM): evaluación financiera de los planes,
   financiación por línea, libro de presupuesto, vigilancia y formato de pesos. CONTRATO-BD-F3B.md §6 y §7 (0290).
   La VAF (rol `financiero`) y el administrador escriben; las oficinas ven el presupuesto de sus líneas.
   ========================================================================== */

import type { PsNivel } from "../modelo";
import { fechaValida } from "../actividades/reglas";

/* ---------- Pesos ---------- */

const nf = (d = 0) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: d, minimumFractionDigits: 0 });

/** «$ 1.250.000.000» (siempre completo: es lo que se lee con lector de pantalla y se copia). */
export const pesosCompletos = (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n < 0 ? "−" : ""}$ ${nf().format(Math.round(Math.abs(n)))}`);

/**
 * Montos grandes legibles: «$ 12,5 MM» (miles de millones) desde mil millones, «$ 1.250 M» (millones) desde un millón y
 * completo por debajo. MM = miles de millones; M = millones. El rótulo largo va en `title` y `aria-label` de `<Pesos>`.
 */
export function pesosCortos(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1e9) return `${s}$ ${nf(a >= 1e11 ? 0 : 1).format(a / 1e9)} MM`;
  if (a >= 1e6) return `${s}$ ${nf(a >= 1e8 ? 0 : 1).format(a / 1e6)} M`;
  return pesosCompletos(n);
}
export const porcentajeVaf = (n: number | null | undefined, d = 1): string => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${nf(d).format(n)} %`);
/** «+12,5 puntos» / «−3 puntos». */
export const puntos = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf(1).format(Math.abs(n))} ${Math.abs(n) === 1 ? "punto" : "puntos"}`);

/* ---------- Quién puede qué ---------- */

/** Escribe (evalúa, registra y anula): la VAF (`financiero`) y el administrador. */
export const esFinanciero = (n: PsNivel): boolean => n === "financiero" || n === "admin";
/** Ve la pantalla «Financiación y presupuesto» completa: la VAF, el administrador y, en lectura, aprobador y lector. */
export const veFinanciacion = (n: PsNivel): boolean => n === "financiero" || n === "admin" || n === "aprobador" || n === "lector";
/** Gestor y colaborador ven solo el presupuesto de las líneas de sus oficinas (dentro del detalle de la línea). */
export const veSoloSusLineas = (n: PsNivel): boolean => n === "gestor" || n === "colaborador";

/* ---------- Evaluación del plan ---------- */

export type EstadoEvaluacion = "pendiente" | "en_revision" | "aprobada" | "aprobada_con_ajustes" | "no_viable";
export const ROTULO_EVALUACION: Record<EstadoEvaluacion, string> = { pendiente: "Por evaluar", en_revision: "En revisión de la VAF", aprobada: "Aprobada", aprobada_con_ajustes: "Aprobada con ajustes", no_viable: "No viable" };
export const RESUELTAS: readonly EstadoEvaluacion[] = ["aprobada", "aprobada_con_ajustes", "no_viable"];
export const esResuelta = (e: EstadoEvaluacion): boolean => RESUELTAS.includes(e);

export interface PersonaVaf {
  id: string;
  nombre: string;
}

export interface EvaluacionVaf {
  id: string;
  planId: string;
  versionId: string;
  plan: string;
  oficina: { id: string; nombre: string } | null;
  version: string;
  estado: EstadoEvaluacion;
  montoSolicitado: number;
  montoAprobado: number | null;
  fuente: string;
  observaciones: string;
  evaluadoPor: PersonaVaf | null;
  evaluadoEn: string | null;
  creadoEn: string;
}

/** El estado financiero que se muestra como chip en planes y líneas. */
export type EstadoFinanciero = "sin_evaluar" | EstadoEvaluacion;
export const ROTULO_FINANCIERO: Record<EstadoFinanciero, string> = { sin_evaluar: "Sin evaluar", ...ROTULO_EVALUACION };

/** Del historial de evaluaciones de un plan (la más reciente primero), el estado financiero vigente. */
export const estadoFinancieroPlan = (evs: readonly Pick<EvaluacionVaf, "estado" | "creadoEn">[]): EstadoFinanciero => [...evs].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))[0]?.estado ?? "sin_evaluar";
/** A partir de los conteos del tablero (`evaluaciones_vaf`): lo pendiente manda; luego lo peor. */
export function estadoFinancieroDeConteos(c: { pendientes: number; aprobadas: number; ajustadas: number; noViables: number } | null | undefined): EstadoFinanciero {
  if (!c) return "sin_evaluar";
  if (c.pendientes > 0) return "pendiente";
  if (c.noViables > 0) return "no_viable";
  if (c.ajustadas > 0) return "aprobada_con_ajustes";
  if (c.aprobadas > 0) return "aprobada";
  return "sin_evaluar";
}

export interface DatosEvaluacion {
  estado: "aprobada" | "aprobada_con_ajustes" | "no_viable" | "";
  montoAprobado: number | null;
  fuente: string;
  observaciones: string;
}
export const MIN_OBSERVACIONES = 20;
export function validarEvaluacion(d: DatosEvaluacion): { campo: string; mensaje: string }[] {
  const e: { campo: string; mensaje: string }[] = [];
  if (!d.estado) e.push({ campo: "ev-estado", mensaje: "Elija el resultado de la evaluación." });
  if (d.estado && d.estado !== "no_viable") {
    if (d.montoAprobado === null || !Number.isFinite(d.montoAprobado)) e.push({ campo: "ev-monto", mensaje: "Indique el monto aprobado." });
    else if (d.montoAprobado < 0 || d.montoAprobado >= 1e15) e.push({ campo: "ev-monto", mensaje: "El monto aprobado debe ser un número no negativo." });
  }
  if (d.fuente.length > 200) e.push({ campo: "ev-fuente", mensaje: "La fuente admite hasta 200 caracteres." });
  const n = d.observaciones.trim().length;
  if ((d.estado === "aprobada_con_ajustes" || d.estado === "no_viable") && n < MIN_OBSERVACIONES) e.push({ campo: "ev-obs", mensaje: `Explique el resultado con al menos ${MIN_OBSERVACIONES} caracteres (lleva ${n}). Lo verá la oficina dueña.` });
  if (d.observaciones.length > 2000) e.push({ campo: "ev-obs", mensaje: "Las observaciones admiten hasta 2.000 caracteres." });
  return e;
}

/** Días que lleva esperando una evaluación. */
export function antiguedadDias(creadoEn: string, ahora: string): number {
  const ms = Date.parse(ahora) - Date.parse(creadoEn);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : 0;
}
export const textoAntiguedad = (d: number): string => (d <= 0 ? "desde hoy" : d === 1 ? "desde ayer" : `hace ${d} días`);

/* ---------- Financiación por línea ---------- */

export type EstadoFinanciacion = "sin_evaluar" | "aprobada" | "ajustada" | "rechazada";
export const ROTULO_FINANCIACION: Record<EstadoFinanciacion, string> = { sin_evaluar: "Sin evaluar", aprobada: "Aprobada", ajustada: "Ajustada", rechazada: "Rechazada" };

export interface FinanciacionAnio {
  anio: number;
  montoAprobado: number;
  fuente: string;
  estado: EstadoFinanciacion;
  nota: string;
  evaluadoEn: string | null;
}

/** El estado financiero de una línea a partir de lo evaluado en cada año. */
export function estadoFinancieroLinea(f: readonly Pick<FinanciacionAnio, "estado">[]): "sin_evaluar" | "aprobada" | "ajustada" | "rechazada" | "parcial" {
  const ev = f.filter((x) => x.estado !== "sin_evaluar");
  if (!ev.length) return "sin_evaluar";
  if (ev.some((x) => x.estado === "rechazada")) return "rechazada";
  if (ev.some((x) => x.estado === "ajustada")) return "ajustada";
  return ev.length < f.length ? "parcial" : "aprobada";
}

export interface DatosFinanciacion {
  anio: number;
  monto: number | null;
  fuente: string;
  estado: EstadoFinanciacion;
  nota: string;
}
export function validarFinanciacion(d: DatosFinanciacion, vigencia: { ini: number; fin: number }): { campo: string; mensaje: string }[] {
  const e: { campo: string; mensaje: string }[] = [];
  if (!Number.isInteger(d.anio) || d.anio < vigencia.ini || d.anio > vigencia.fin) e.push({ campo: "fn-anio", mensaje: `El año debe estar dentro de la vigencia del plan (${vigencia.ini} a ${vigencia.fin}).` });
  if (d.monto === null || !Number.isFinite(d.monto) || d.monto < 0 || d.monto >= 1e15) e.push({ campo: "fn-monto", mensaje: "El monto aprobado debe ser un número no negativo." });
  if (d.fuente.length > 200) e.push({ campo: "fn-fuente", mensaje: "La fuente admite hasta 200 caracteres." });
  if ((d.estado === "ajustada" || d.estado === "rechazada") && d.nota.trim().length < 10) e.push({ campo: "fn-nota", mensaje: `Explique el ${d.estado === "ajustada" ? "ajuste" : "rechazo"} en la nota (al menos 10 caracteres; lleva ${d.nota.trim().length}).` });
  if (d.nota.length > 1000) e.push({ campo: "fn-nota", mensaje: "La nota admite hasta 1.000 caracteres." });
  return e;
}

/* ---------- Libro de movimientos ---------- */

export type TipoMov = "aprobado" | "modificacion" | "comprometido" | "ejecutado" | "pagado";
export const TIPOS_MOV: readonly TipoMov[] = ["aprobado", "modificacion", "comprometido", "ejecutado", "pagado"];
export const ROTULO_MOV: Record<TipoMov, string> = { aprobado: "Aprobado", modificacion: "Modificación", comprometido: "Comprometido", ejecutado: "Ejecutado", pagado: "Pagado" };
export const AYUDA_MOV: Record<TipoMov, string> = {
  aprobado: "El presupuesto aprobado del año.",
  modificacion: "Un cambio al aprobado: adición (positiva) o reducción (negativa).",
  comprometido: "Lo comprometido con contratos u órdenes.",
  ejecutado: "Lo causado o recibido a satisfacción.",
  pagado: "Lo efectivamente pagado.",
};

export interface MovPresupuesto {
  id: string;
  planId: string;
  lineaId: string;
  lineaClave: string;
  anio: number;
  tipo: TipoMov;
  monto: number;
  fecha: string;
  fuente: string;
  referencia: string;
  nota: string;
  anulaId: string | null;
  anulado: boolean;
  registradoPor: PersonaVaf | null;
  creadoEn: string;
}

export interface DatosMov {
  anio: number;
  tipo: TipoMov | "";
  monto: number | null;
  fecha: string;
  fuente: string;
  referencia: string;
  nota: string;
}
export function validarMovimiento(d: DatosMov, ctx: { hoy: string; ini: number; fin: number }): { campo: string; mensaje: string }[] {
  const e: { campo: string; mensaje: string }[] = [];
  if (!Number.isInteger(d.anio) || d.anio < ctx.ini || d.anio > ctx.fin) e.push({ campo: "mv-anio", mensaje: `El año debe estar entre ${ctx.ini} y ${ctx.fin}.` });
  if (!d.tipo) e.push({ campo: "mv-tipo", mensaje: "Elija el tipo de movimiento." });
  if (d.monto === null || !Number.isFinite(d.monto) || d.monto === 0 || Math.abs(d.monto) >= 1e15) e.push({ campo: "mv-monto", mensaje: "El monto debe ser un número distinto de cero." });
  else if (d.monto < 0 && d.tipo !== "modificacion") e.push({ campo: "mv-monto", mensaje: "Solo una modificación puede ser negativa. Para corregir otro movimiento, anúlelo." });
  if (!d.fecha) e.push({ campo: "mv-fecha", mensaje: "Escriba la fecha del movimiento." });
  else if (!fechaValida(d.fecha)) e.push({ campo: "mv-fecha", mensaje: "La fecha no es válida. Use el selector de fecha." });
  else if (d.fecha > ctx.hoy) e.push({ campo: "mv-fecha", mensaje: "La fecha no puede ser futura." });
  if (d.fuente.length > 200) e.push({ campo: "mv-fuente", mensaje: "La fuente admite hasta 200 caracteres." });
  if (d.referencia.length > 100) e.push({ campo: "mv-referencia", mensaje: "La referencia admite hasta 100 caracteres." });
  if (d.nota.length > 1000) e.push({ campo: "mv-nota", mensaje: "La nota admite hasta 1.000 caracteres." });
  return e;
}
export function validarAnulacion(motivo: string): string | null {
  const n = motivo.trim().length;
  if (n < 10) return `Cuente por qué anula el movimiento con al menos 10 caracteres (lleva ${n}). Queda en el libro.`;
  if (n > 1000) return "El motivo admite hasta 1.000 caracteres.";
  return null;
}

/* ---------- Cifras ---------- */

export interface CifrasPresupuesto {
  aprobado: number;
  modificado: number;
  vigente: number;
  comprometido: number;
  ejecutado: number;
  pagado: number;
  disponible: number;
  /** Nulo sin presupuesto vigente. */
  pctEjecucion: number | null;
}
export const CIFRAS_VACIAS: CifrasPresupuesto = { aprobado: 0, modificado: 0, vigente: 0, comprometido: 0, ejecutado: 0, pagado: 0, disponible: 0, pctEjecucion: null };

export interface CifrasAnio {
  anio: number;
  aprobado: number;
  modificado: number;
  vigente: number;
  comprometido: number;
  ejecutado: number;
  pagado: number;
}

export interface PresupuestoLinea extends CifrasPresupuesto {
  lineaId: string;
  planId: string;
  clave: string;
  nombre?: string;
  pilar?: string;
  oficinaId?: string | null;
  solicitado?: number;
  /** Avance físico validado de las actividades de la línea (0–100); nulo si no hay actividades. */
  avanceFisico: number | null;
  /** % de ejecución − avance físico, en puntos. */
  desviacion: number | null;
  ultimoMovimiento: string | null;
  porAnio: CifrasAnio[];
  financiacion: FinanciacionAnio[];
  movimientos: MovPresupuesto[];
}

export interface GrupoPresupuesto extends CifrasPresupuesto {
  clave: string;
  nombre: string;
}

export interface PresupuestoPlan {
  planId: string;
  totales: CifrasPresupuesto & { solicitado: number };
  porLinea: Omit<PresupuestoLinea, "porAnio" | "financiacion" | "movimientos">[];
  porPilar: GrupoPresupuesto[];
  porOficina: GrupoPresupuesto[];
  porAnio: CifrasAnio[];
}

/** Las cifras de la línea a partir de sus movimientos (el aprobado de la VAF cuenta si no hay movimientos de aprobado en el año). */
export function cifrasDeMovimientos(movs: readonly Pick<MovPresupuesto, "anio" | "tipo" | "monto" | "anulaId">[], aprobadoVaf: Record<number, number> = {}): { total: CifrasPresupuesto; porAnio: CifrasAnio[] } {
  const anios = [...new Set([...movs.map((m) => m.anio), ...Object.keys(aprobadoVaf).map(Number)])].sort((a, b) => a - b);
  const porAnio = anios.map((anio): CifrasAnio => {
    const suma = (t: TipoMov) => movs.filter((m) => m.anio === anio && m.tipo === t).reduce((s, m) => s + (m.anulaId ? -m.monto : m.monto), 0);
    const apr = suma("aprobado") || (aprobadoVaf[anio] ?? 0);
    const mod = suma("modificacion");
    return { anio, aprobado: apr, modificado: mod, vigente: apr + mod, comprometido: suma("comprometido"), ejecutado: suma("ejecutado"), pagado: suma("pagado") };
  });
  const s = (k: keyof CifrasAnio) => porAnio.reduce((t, a) => t + (a[k] as number), 0);
  const vigente = s("vigente");
  const ejecutado = s("ejecutado");
  const comprometido = s("comprometido");
  return { total: { aprobado: s("aprobado"), modificado: s("modificado"), vigente, comprometido, ejecutado, pagado: s("pagado"), disponible: vigente - Math.max(comprometido, ejecutado), pctEjecucion: vigente > 0 ? Math.round((ejecutado / vigente) * 1000) / 10 : null }, porAnio };
}
/** Desviación en puntos: % de ejecución − avance físico validado. Nula si falta alguno. */
export const desviacionDe = (pct: number | null, fisico: number | null): number | null => (pct === null || fisico === null ? null : Math.round((pct - fisico) * 10) / 10);

/* ---------- Vigilancia ---------- */

export type TipoAlertaVigilancia = "sobreejecucion" | "ejecucion_sobre_avance" | "avance_sobre_ejecucion" | "sin_movimientos" | "sin_evaluar_vaf";
export type SeveridadAlerta = "alta" | "media" | "baja";
export const ROTULO_ALERTA: Record<TipoAlertaVigilancia, string> = {
  sobreejecucion: "Sobreejecución",
  ejecucion_sobre_avance: "Ejecuta más de lo que avanza",
  avance_sobre_ejecucion: "Avanza más de lo que ejecuta",
  sin_movimientos: "Sin movimientos",
  sin_evaluar_vaf: "Sin evaluar por la VAF",
};
export const ROTULO_SEVERIDAD: Record<SeveridadAlerta, string> = { alta: "Urgente", media: "Atención", baja: "Aviso" };
export const ORDEN_SEVERIDAD: Record<SeveridadAlerta, number> = { alta: 0, media: 1, baja: 2 };

export interface AlertaVigilancia {
  tipo: TipoAlertaVigilancia;
  severidad: SeveridadAlerta;
  planId: string;
  lineaId: string;
  lineaClave: string;
  linea: string;
  oficinaId: string | null;
  valor: number | null;
  texto: string;
}

export interface Umbrales {
  umbralDesviacion: number;
  umbralSobreejecucion: number;
  mesesSinEjecucion: number;
}
export const UMBRALES_POR_OMISION: Umbrales = { umbralDesviacion: 15, umbralSobreejecucion: 100, mesesSinEjecucion: 3 };
export function validarUmbrales(u: Umbrales): { campo: string; mensaje: string }[] {
  const e: { campo: string; mensaje: string }[] = [];
  if (!Number.isFinite(u.umbralDesviacion) || u.umbralDesviacion < 1 || u.umbralDesviacion > 100) e.push({ campo: "um-desv", mensaje: "La desviación va de 1 a 100 puntos." });
  if (!Number.isFinite(u.umbralSobreejecucion) || u.umbralSobreejecucion < 50 || u.umbralSobreejecucion > 300) e.push({ campo: "um-sobre", mensaje: "La sobreejecución va de 50 a 300 % del vigente." });
  if (!Number.isInteger(u.mesesSinEjecucion) || u.mesesSinEjecucion < 1 || u.mesesSinEjecucion > 24) e.push({ campo: "um-meses", mensaje: "Los meses sin ejecución van de 1 a 24." });
  return e;
}

/** Calcula las alertas de una línea con los umbrales del plan (la base hace lo mismo; la demostración lo usa). */
export function alertasDeLinea(l: { planId: string; lineaId: string; clave: string; nombre: string; oficinaId: string | null; vigente: number; ejecutado: number; aprobado: number; pctEjecucion: number | null; desviacion: number | null; ultimoMovimiento: string | null; tieneFinanciacion: boolean }, u: Umbrales, hoy: string): AlertaVigilancia[] {
  const base = { planId: l.planId, lineaId: l.lineaId, lineaClave: l.clave, linea: l.nombre, oficinaId: l.oficinaId };
  const out: AlertaVigilancia[] = [];
  if (l.ejecutado > 0 && (l.vigente === 0 || l.ejecutado > (l.vigente * u.umbralSobreejecucion) / 100)) out.push({ ...base, tipo: "sobreejecucion", severidad: "alta", valor: l.pctEjecucion, texto: `La línea ${l.clave} supera su presupuesto vigente: ejecutado ${pesosCortos(l.ejecutado)} de ${pesosCortos(l.vigente)}.` });
  if (l.desviacion !== null && l.desviacion > u.umbralDesviacion) out.push({ ...base, tipo: "ejecucion_sobre_avance", severidad: "media", valor: l.desviacion, texto: `La línea ${l.clave} ejecuta ${puntos(l.desviacion).replace("+", "")} más de lo que avanza físicamente.` });
  else if (l.desviacion !== null && l.desviacion < -u.umbralDesviacion) out.push({ ...base, tipo: "avance_sobre_ejecucion", severidad: "baja", valor: l.desviacion, texto: `La línea ${l.clave} avanza ${Math.abs(l.desviacion)} puntos más de lo que ejecuta: posible rezago de registro.` });
  if (l.vigente > 0) {
    const limite = new Date(`${hoy}T00:00:00Z`);
    limite.setUTCMonth(limite.getUTCMonth() - u.mesesSinEjecucion);
    if (!l.ultimoMovimiento || l.ultimoMovimiento < limite.toISOString().slice(0, 10)) out.push({ ...base, tipo: "sin_movimientos", severidad: "media", valor: u.mesesSinEjecucion, texto: `La línea ${l.clave} tiene presupuesto aprobado y lleva ${u.mesesSinEjecucion} meses o más sin movimientos.` });
  }
  if (!l.tieneFinanciacion && l.aprobado === 0) out.push({ ...base, tipo: "sin_evaluar_vaf", severidad: "baja", valor: null, texto: `La línea ${l.clave} aún no tiene evaluación de financiación de la VAF.` });
  return out;
}

export interface ConfigVaf {
  unidad: { id: string; nombre: string; codigo: string } | null;
  destinatarios: number;
}
