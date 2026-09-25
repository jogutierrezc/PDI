/* =============================================================================
   Mr. Pilo Bot · lo que dice, según con quién habla y qué ve.

   La voz cambia con el programa (su nombre y su sede), con lo que ya sigue,
   con lo que las fuentes institucionales ya traen de él y, sobre todo, con
   los eslabones que faltan: si la cadena de una función queda incompleta,
   lo dice con nombre y apellido. Sin emojis: es la intranet.
   ========================================================================== */

import { FUNCTION_LABEL, STAGE_LABEL, type Stage, type SubstantiveFunction } from "../model";

export interface SpeechContext {
  programName: string;
  campusName: string;
  goalsCount: number;
  missingFns: SubstantiveFunction[];
  kept: number;
  mandatory: number;
  /** Periodos que P1P2P3 ya trae del programa. */
  sourcePeriods: string[];
  /** Cuántos de la propuesta ya se pueden reportar con datos disponibles. */
  readyToReport: number;
  gaps: { fn: SubstantiveFunction; stage: Stage }[];
  /** Eslabones que el catálogo no permite llenar. */
  impossible: { fn: SubstantiveFunction; stage: Stage }[];
  selected: number;
  added: number;
  total: number;
}

const join = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

/** «insumos de Investigación y procesos de Extensión». */
export function describeGaps(gaps: { fn: SubstantiveFunction; stage: Stage }[]): string {
  return join(gaps.map((g) => `${STAGE_LABEL[g.stage].toLowerCase()} de ${FUNCTION_LABEL[g.fn]}`));
}

export function piloSpeech(step: 1 | 2 | 3 | 4, c: SpeechContext): string {
  const who = `${c.programName} en ${c.campusName}`;
  switch (step) {
    case 1: {
      const start = `Hola, equipo de ${who}. Soy Mr. Pilo.`;
      const kept = c.kept ? ` Ya siguen ${c.kept} indicadores: esos los conservo.` : "";
      if (c.goalsCount === 0) {
        return `${start}${kept} Empecemos por los impactos que quieren demostrar: al menos uno en Enseñanza, otro en Investigación y otro en Extensión.`;
      }
      if (c.missingFns.length) {
        return `Vamos bien. Me falta que elijan un impacto de ${join(c.missingFns.map((f) => FUNCTION_LABEL[f]))}: sin él, esa función queda sin cadena de valor.`;
      }
      return `Perfecto: ${c.goalsCount} impactos repartidos en las tres funciones. Con eso ya sé dónde buscar.`;
    }
    case 2: {
      const source = c.sourcePeriods.length
        ? ` Además, los reportes P1P2P3 ya traen datos de ${c.programName} de ${join(c.sourcePeriods)}: pondré primero lo que ya pueden reportar.`
        : "";
      return `¿Cuánto pueden reportar cada año? Cualquier opción deja la cadena completa —insumos, procesos, productos e impacto real— en cada función.${source}`;
    }
    case 3: {
      if (c.gaps.length) {
        return `Ojo, a la cadena de ${who} le falta ${describeGaps(c.gaps)}. Sin ese eslabón no se ve cómo el programa llega a sus resultados. Lo agrego con un clic.`;
      }
      const parts = [`Propuesta lista para ${who}: la cadena queda completa en las tres funciones.`];
      if (c.readyToReport) parts.push(`${c.readyToReport} ya tienen datos para reportar hoy.`);
      if (c.mandatory) parts.push(`${c.mandatory} ${c.mandatory === 1 ? "es obligatoria" : "son obligatorias"} de la vicerrectoría.`);
      if (c.impossible.length) {
        parts.push(`El catálogo aún no tiene fichas de ${describeGaps(c.impossible)}: pueden crear un indicador propio de ese eslabón.`);
      }
      return parts.join(" ");
    }
    case 4:
      return c.added
        ? `Listo: ${who} sigue ahora ${c.total} indicadores. El siguiente paso es poner la línea base y las metas de cada uno.`
        : `No hacía falta añadir nada: ${c.programName} ya seguía todo lo propuesto. Cuando quieran ajustar, llámenme.`;
  }
}
