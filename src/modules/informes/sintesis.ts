/* =============================================================================
   Síntesis de resultados institucionales · se arma sola.

   Junta lo que la unidad ya reportó: las acciones de «Objetivos y metas»
   (plan de trabajo) y las metas con resultado, y los indicadores de
   «Resultados por dimensión» (de la plantilla, escritos a mano o conectados).
   Nada se vuelve a teclear. Además entrega cifras de síntesis ([[sint_…]])
   que se pueden citar en cualquier texto del informe y siguen a los datos.
   Lógica pura, sin React ni Supabase; el resultado es JSON plano.
   ========================================================================== */

import type { CifraVista } from "./cifras-vivas";
import { evaluar } from "./indicadores-manual";
import type { PlanAccion, ResumenDimension } from "./plan-decanatura";
import { resumenPorDimension } from "./plan-decanatura";
import { contarEstados } from "./vista/estados";
import type { Conteo, EstadoMeta } from "./vista/estados";

export interface EntradaIndicador {
  /** Criterio o dimensión a la que pertenece. */
  criterio: string;
  criterioNombre: string;
  vista: CifraVista;
}

export interface GrupoCriterio {
  id: string;
  nombre: string;
  total: number;
  conteo: Conteo;
}

/** Acciones que la unidad describió por criterio: se cuentan aparte, no entran a logro ni semáforo. */
export interface GrupoAcciones {
  id: string;
  nombre: string;
  total: number;
  completas: number;
}

export interface Sintesis {
  plan: {
    total: number;
    completadas: number;
    enProceso: number;
    pendientes: number;
    avance: number | null;
    dimensiones: ResumenDimension[];
  } | null;
  /** Metas con resultado (indicadores del programa y metas adicionales). */
  metas: { total: number; conteo: Conteo } | null;
  criterios: GrupoCriterio[];
  /** Acciones por criterio (Resultados y evidencias). Ausente si no hay ninguna. */
  acciones?: { total: number; completas: number; criterios: GrupoAcciones[] };
  indicadores: {
    total: number;
    conteo: Conteo;
    /** Con meta: cuántos la cumplen o superan. */
    conMeta: number;
    cumplen: number;
    /** Con dato anterior: cuántos mejoraron. */
    conAnterior: number;
    mejoran: number;
  };
}

export interface EntradaAccionManual {
  criterio: string;
  criterioNombre: string;
  completa: boolean;
}

export function armarSintesis(o: { acciones: PlanAccion[]; metas: (EstadoMeta | null)[]; indicadores: EntradaIndicador[]; accionesManuales?: EntradaAccionManual[] }): Sintesis {
  const { acciones } = o;
  const avances = acciones.map((a) => a.avance).filter((v): v is number => typeof v === "number");
  const plan = acciones.length
    ? {
        total: acciones.length,
        completadas: acciones.filter((a) => a.estado === "Completado").length,
        enProceso: acciones.filter((a) => a.estado === "En proceso").length,
        pendientes: acciones.filter((a) => a.estado !== "Completado" && a.estado !== "En proceso").length,
        avance: avances.length ? Math.round(avances.reduce((s, v) => s + v, 0) / avances.length) : null,
        dimensiones: resumenPorDimension(acciones),
      }
    : null;

  const metas = o.metas.length ? { total: o.metas.length, conteo: contarEstados(o.metas) } : null;

  const evaluados = o.indicadores.map((e) => ({ e, ev: evaluar({ actual: e.vista.valor, anterior: e.vista.anterior, meta: e.vista.meta, mayorMejor: e.vista.mayorMejor, unidad: e.vista.unidad }) }));
  const grupos = new Map<string, { nombre: string; estados: (EstadoMeta | null)[] }>();
  for (const { e, ev } of evaluados) {
    const g = grupos.get(e.criterio) ?? { nombre: e.criterioNombre, estados: [] };
    g.estados.push(ev.estado);
    grupos.set(e.criterio, g);
  }
  const criterios = [...grupos.entries()].map(([id, g]) => ({ id, nombre: g.nombre, total: g.estados.length, conteo: contarEstados(g.estados) }));
  const conteo = contarEstados(evaluados.map((x) => x.ev.estado));
  const conMeta = evaluados.filter((x) => x.ev.estado).length;
  const conAnterior = evaluados.filter((x) => x.ev.rumbo).length;

  const porCriterio = new Map<string, GrupoAcciones>();
  for (const a of o.accionesManuales ?? []) {
    const g = porCriterio.get(a.criterio) ?? { id: a.criterio, nombre: a.criterioNombre, total: 0, completas: 0 };
    g.total += 1;
    if (a.completa) g.completas += 1;
    porCriterio.set(a.criterio, g);
  }
  const accionesManuales = [...porCriterio.values()];

  return {
    plan,
    metas,
    criterios,
    ...(accionesManuales.length ? { acciones: { total: accionesManuales.reduce((s, g) => s + g.total, 0), completas: accionesManuales.reduce((s, g) => s + g.completas, 0), criterios: accionesManuales } } : {}),
    indicadores: {
      total: evaluados.length,
      conteo,
      conMeta,
      cumplen: conteo.superada + conteo.cumplida,
      conAnterior,
      mejoran: evaluados.filter((x) => x.ev.rumbo === "mejora").length,
    },
  };
}

export const hayDatosDeSintesis = (s: Sintesis) => Boolean(s.plan || s.metas || s.indicadores.total);

/* ---------- Cifras citables ([[sint_…]]) ---------------------------------------- */

const FUENTE = "Síntesis del informe";

function cifra(clave: string, etiqueta: string, valor: number, unidad = ""): CifraVista {
  return {
    clave,
    etiqueta,
    unidad,
    mayorMejor: true,
    valor,
    anterior: null,
    meta: null,
    fuenteTipo: "aportes",
    fuente: FUENTE,
    corte: null,
    viva: false,
    propia: false,
    congelada: false,
    cambio: null,
    incluida: true,
    justificacion: "",
    condicion: "sugerido",
  };
}

/**
 * Cifras que se calculan de lo reportado y se pueden insertar en el texto.
 * Salen solo las que tienen con qué calcularse; siguen a los datos mientras el
 * informe se escribe y quedan fijas con él al enviarlo.
 */
export function cifrasDeSintesis(s: Sintesis): CifraVista[] {
  const out: CifraVista[] = [];
  if (s.plan) {
    out.push(cifra("sint_acciones", "Acciones del plan de trabajo", s.plan.total));
    out.push(cifra("sint_acciones_completadas", "Acciones completadas", s.plan.completadas));
    out.push(cifra("sint_acciones_proceso", "Acciones en proceso", s.plan.enProceso));
    if (s.plan.avance !== null) out.push(cifra("sint_avance_plan", "Avance promedio del plan de trabajo", s.plan.avance, " %"));
  }
  if (s.metas) {
    out.push(cifra("sint_metas", "Metas con resultado", s.metas.total));
    out.push(cifra("sint_metas_cumplidas", "Metas cumplidas o superadas", s.metas.conteo.superada + s.metas.conteo.cumplida));
  }
  if (s.indicadores.total) {
    out.push(cifra("sint_indicadores", "Indicadores reportados", s.indicadores.total));
    if (s.indicadores.conMeta) {
      out.push(cifra("sint_cumplen", "Indicadores que cumplen o superan la meta", s.indicadores.cumplen));
      out.push(cifra("sint_cumplimiento", "Indicadores que cumplen o superan la meta (%)", Math.round((s.indicadores.cumplen / s.indicadores.conMeta) * 100), " %"));
      out.push(cifra("sint_rezagados", "Indicadores rezagados", s.indicadores.conteo.rezagada));
    }
    if (s.indicadores.conAnterior) out.push(cifra("sint_mejoran", "Indicadores que mejoraron frente al periodo anterior", s.indicadores.mejoran));
  }
  return out;
}

/** Una oración que resume la síntesis, para el PDF y como punto de partida. */
export function resumenEnTexto(s: Sintesis): string {
  const partes: string[] = [];
  if (s.plan) {
    partes.push(`${s.plan.total} ${s.plan.total === 1 ? "acción" : "acciones"} en el plan de trabajo (${s.plan.completadas} completadas, ${s.plan.enProceso} en proceso${s.plan.avance !== null ? `, avance promedio ${s.plan.avance} %` : ""})`);
  }
  if (s.indicadores.total) {
    const { cumplen, conMeta, total } = s.indicadores;
    partes.push(`${total} ${total === 1 ? "indicador" : "indicadores"}${conMeta ? `, de los cuales ${cumplen} de ${conMeta} con meta la cumplen o superan` : ""}`);
  }
  return partes.length ? `${partes.join("; ")}.` : "";
}
