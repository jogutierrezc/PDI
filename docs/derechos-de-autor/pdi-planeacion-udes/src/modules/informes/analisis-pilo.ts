/* =============================================================================
   Pilo redacta el análisis de cualquier apartado · lo que se le entrega.

   Pilo nunca recibe valores: recibe, de cada cifra, su nombre, su fuente y su
   tendencia en palabras (mayor, menor, por debajo de la meta, estado), y los
   hechos sin cifras que la unidad ya reportó. Las cifras del texto van como
   [[clave]] y se leen del informe. Lógica pura, sin React.
   ========================================================================== */

import type { CifraVista } from "./cifras-vivas";
import { evaluar } from "./indicadores-manual";
import type { PedidoAnalisisPilo } from "./datos";
import type { PlanAccion, PlanActividad } from "./plan-decanatura";
import { ETIQUETA_ESTADO_META } from "./vista/estados";

/** Cómo se mueve una cifra, en palabras. */
export function tendenciaDe(c: CifraVista): string[] {
  const ev = evaluar({ actual: c.valor, anterior: c.anterior, meta: c.meta, mayorMejor: c.mayorMejor, unidad: c.unidad });
  const out: string[] = [];
  if (ev.estado) out.push(`frente a la meta: ${ETIQUETA_ESTADO_META[ev.estado].toLowerCase()}`);
  if (ev.rumbo) out.push(`frente al periodo anterior: ${ev.rumbo === "mejora" ? "mejoró" : ev.rumbo === "empeora" ? "empeoró" : "igual"}`);
  return out;
}

export const citable = (c: CifraVista) => ({ clave: c.clave, etiqueta: c.etiqueta, fuente: c.fuente, tendencia: tendenciaDe(c) });

/** Un apartado con cifras: «Análisis de Gestión académica», la lectura de la matriz… */
export function pedidoDeCifras(tema: string, cifras: CifraVista[], hechos: string[] = []): Omit<PedidoAnalisisPilo, "actual"> {
  return { tema, cifras: cifras.slice(0, 40).map(citable), hechos, largo: "medio" };
}

const AVANCE = (v: number | null) => (v === null ? "sin avance informado" : v >= 100 ? "completo" : v >= 60 ? "avance alto" : v >= 25 ? "avance medio" : v > 0 ? "avance bajo" : "sin avance todavía");

/** El análisis de una acción del plan: estado, responsable y actividades, sin cifras. */
export function pedidoDeAccion(a: PlanAccion, actividades: PlanActividad[]): Omit<PedidoAnalisisPilo, "actual"> {
  const hechos = [
    `Dimensión: ${a.dimension_nombre}`,
    a.meta ? `Meta: ${a.meta}` : "",
    a.responsable ? `Responsable: ${a.responsable}` : "",
    `Estado: ${a.estado ?? "sin estado"}; ${AVANCE(a.avance)}`,
    a.pilar ? `Pilar: ${a.pilar}` : "",
    a.recursos ? `Recursos: ${a.recursos}` : "",
    a.notas ? `Nota de seguimiento: ${a.notas}` : "",
    ...actividades.slice(0, 12).map((x) => `Actividad (${x.estado ?? "pendiente"}): ${x.descripcion}`),
  ].filter(Boolean);
  return { tema: `Acción del plan de trabajo: ${a.accion}`, cifras: [], hechos, largo: "corto" };
}
