/* =============================================================================
   Pilo redacta el análisis de cualquier apartado · lo que se le entrega.

   Pilo nunca recibe valores: recibe, de cada cifra, su nombre, su fuente y su
   tendencia en palabras (mayor, menor, por debajo de la meta, estado), y los
   hechos sin cifras que la unidad ya reportó. Las cifras del texto van como
   [[clave]] y se leen del informe. Lógica pura, sin React.
   ========================================================================== */

import type { CifraVista } from "./cifras-vivas";
import { evaluar } from "./indicadores-manual";
import type { IndicadorManual } from "./indicadores-manual";
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

/** Lo que se conectó con un pilar: cifras (ya como cifra del informe) y acciones, ambas de Resultados y evidencias. */
export interface InsumosDePilar {
  cifras: { ind: IndicadorManual; vista: CifraVista }[];
  acciones: IndicadorManual[];
}

/** Lo conectado con un pilar (por su id) de entre todo lo que reportó la oficina. */
export function insumosDelPilar(todos: InsumosDePilar, pilar: string): InsumosDePilar {
  return { cifras: todos.cifras.filter((x) => x.ind.pilar === pilar), acciones: todos.acciones.filter((x) => x.pilar === pilar) };
}

/** El aporte de la oficina a un pilar, a partir de las cifras y acciones que ella misma conectó con él. */
export function pedidoDeAporte(pilar: string, insumos: InsumosDePilar): Omit<PedidoAnalisisPilo, "actual"> {
  const hechos = insumos.acciones.flatMap((a) => {
    const partes = [
      a.descripcion?.trim() ? `descripción: ${a.descripcion.trim()}` : "",
      a.avance_texto?.trim() ? `lo que se hizo: ${a.avance_texto.trim()}` : "",
      a.finalizacion?.trim() ? `finalización: ${a.finalizacion.trim()}` : "",
      a.proyeccion_texto?.trim() ? `proyección: ${a.proyeccion_texto.trim()}` : "",
    ].filter(Boolean);
    return [`Acción «${a.nombre.trim() || "sin nombre"}»${partes.length ? ` — ${partes.join("; ")}` : ""}`];
  });
  return {
    tema: `Aporte de la oficina al pilar ${pilar}`,
    cifras: insumos.cifras.slice(0, 40).map((x) => citable(x.vista)),
    hechos,
    largo: "medio",
    instruccion: "Redacte el aporte de la oficina a este pilar usando solo estos resultados y acciones. Cite cada cifra con su [[clave]]; no invente datos.",
  };
}
