/* =============================================================================
   Analizador de posicionamiento · de las evidencias de los informes a puntos
   del ODS.

   Cada indicador de evidencia (tipo ev o doc de INDICADORES_THE) vale `peso` %
   del ODS y puntúa hasta `maximo`. Lo que vale hoy un indicador sale de la
   nota elegida en el informe (ods_report_indicators):
     · ev   existencia (la respuesta de la persona si el indicador la pide; si
            no, 1) + relevancia de la nota (específica 1, general 0,5) + pública
            (1). Si la nota elegida no tiene valoración de Pilo, cuenta como
            general (0,5).
     · doc  aprobado = el documento está: `maximo` (con el punto de revisión).
            Si solo hay una nota propuesta, cuenta como evidencia (sin el punto
            de revisión). Sin nada, 0.
   «Solo aprobadas» deja fuera lo que nadie ha aprobado todavía.
   Los indicadores dato e inv no entran: los puntúa THE con cifras y Scopus.

   Puntos del ODS de un informe = Σ peso × puntos / maximo (en puntos del ODS,
   0–100, antes del escalamiento de THE).
   ========================================================================== */

import { INDICADORES_EVIDENCIA } from "../informes/the-indicadores";
import { puntosEvidencia, type Candidata, type EleccionIndicador, type IndicadorTHE } from "../informes/tipos";

/** Lo mínimo de una elección que hace falta para contar puntos. */
export type EleccionMin = Pick<EleccionIndicador, "indicator" | "news_id" | "candidates" | "ask" | "approved">;

export interface OpcionesEvidencia {
  /** Contar solo lo aprobado (por defecto, también lo propuesto). */
  soloAprobadas?: boolean;
}

/** La existencia que cuenta (igual que en InformeIndicadores). */
export function existencia(ind: IndicadorTHE, el?: Pick<EleccionIndicador, "ask"> | null): number {
  const p = ind.pregunta_persona;
  if (!p) return 1;
  const v = parseFloat(el?.ask?.[p.clave] ?? p.por_defecto);
  return Number.isFinite(v) ? v : 1;
}

/** Puntos de un indicador con su elección (0..maximo). */
export function puntosIndicador(ind: IndicadorTHE, el: EleccionMin | undefined, op: OpcionesEvidencia = {}): number {
  if (!el || (ind.tipo !== "ev" && ind.tipo !== "doc")) return 0;
  if (op.soloAprobadas && !el.approved) return 0;
  if (ind.tipo === "doc" && el.approved) return ind.maximo;
  if (!el.news_id) return 0;
  const c: Pick<Candidata, "rel"> = el.candidates.find((x) => x.news_id === el.news_id) ?? { rel: "g" };
  const tope = ind.tipo === "doc" ? Math.max(0, ind.maximo - 1) : ind.maximo;
  return Math.min(tope, puntosEvidencia(existencia(ind, el), c.rel).total);
}

export interface CoberturaIndicador {
  id: string;
  ods: number;
  tipo: IndicadorTHE["tipo"];
  peso: number;
  maximo: number;
  puntos: number;
}

export interface CoberturaOds {
  ods: number;
  /** ¿Hay informe de esta edición en la base? */
  hayInforme: boolean;
  /** Σ peso × puntos / maximo. */
  puntos: number;
  /** Σ peso de los indicadores de evidencia: lo máximo que la evidencia aporta. */
  techo: number;
  indicadores: CoberturaIndicador[];
}

/** Cobertura de un ODS a partir de sus elecciones (null = no hay informe). */
export function coberturaOds(ods: number, elecciones: EleccionMin[] | null, op: OpcionesEvidencia = {}, indicadores: IndicadorTHE[] = INDICADORES_EVIDENCIA): CoberturaOds {
  const porId = new Map((elecciones ?? []).map((e) => [e.indicator, e]));
  const lista = indicadores
    .filter((i) => i.ods === ods && (i.tipo === "ev" || i.tipo === "doc") && (i.peso ?? 0) > 0 && i.maximo > 0)
    .map((i) => ({ id: i.id, ods, tipo: i.tipo, peso: i.peso ?? 0, maximo: i.maximo, puntos: puntosIndicador(i, porId.get(i.id), op) }));
  return {
    ods,
    hayInforme: elecciones !== null,
    puntos: lista.reduce((s, x) => s + (x.peso * x.puntos) / x.maximo, 0),
    techo: lista.reduce((s, x) => s + x.peso, 0),
    indicadores: lista,
  };
}

/**
 * Cambio de evidencia de un ODS entre la edición base y la actual, en puntos
 * del ODS (sin k ni rigor). Si la edición actual no tiene informe, se supone
 * igual a la base (delta 0): que no se haya empezado no quiere decir que se
 * vaya a enviar menos. Si la base no tiene informe, se supone igual a la
 * actual (no hay con qué comparar): también delta 0, y la pantalla lo dice.
 */
export function deltaEvidencia(actual: CoberturaOds, base: CoberturaOds | null): { delta: number; motivo: "comparado" | "sin-actual" | "sin-base" } {
  if (!actual.hayInforme) return { delta: 0, motivo: "sin-actual" };
  if (!base || !base.hayInforme) return { delta: 0, motivo: "sin-base" };
  return { delta: actual.puntos - base.puntos, motivo: "comparado" };
}
