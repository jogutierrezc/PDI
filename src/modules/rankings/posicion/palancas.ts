/* =============================================================================
   Analizador de posicionamiento · qué mover.

   Por cada indicador de evidencia (ev o doc) que no tiene sus puntos
   completos, cuánto subiría:
     · el ODS:     peso × (maximo − puntos) / maximo × k × rigor;
     · el general: lo que eso suma a F = 0,22 × ODS 17 + 0,26 × (tres mejores):
         ODS 17                   × 0,22
         ODS entre los tres       × 0,26
         ODS fuera de los tres    × 0,26 × lo que pase al tercero (0 si no llega)
       y en el general PUBLICADO de 2027 cuenta la mitad (es el promedio de
       2026 y 2027); si se mantiene, en 2028 cuenta entero.
   Los puntajes esperados de cada ODS son los del escenario (modelo.ts:
   esperadoOds), sin sorteo.

   «Puntos actuales» son los de la nota elegida en el informe de la edición
   actual (o la base, si es mayor). Si un ODS no tiene informe en el sistema,
   todos sus indicadores parten de 0: la ganancia es un techo (lo que se
   ganaría si en 2026 no se envió nada para ese indicador).
   ========================================================================== */

import type { CoberturaOds } from "./evidencia";
import { PESO_MEJOR, PESO_ODS17 } from "./tipos";
import type { EleccionMin } from "./evidencia";

export type Esfuerzo = "elegir-nota" | "aprobar" | "mejorar-nota" | "falta-documento" | "falta-evidencia";

export const ESFUERZO_TEXTO: Record<Esfuerzo, string> = {
  "elegir-nota": "Ya hay una nota que lo cubre: elegirla",
  aprobar: "Hay una nota propuesta: revisarla y aprobarla",
  "mejorar-nota": "La nota elegida es general: buscar una específica",
  "falta-documento": "Falta el documento institucional",
  "falta-evidencia": "Falta evidencia: no hay nota que lo cubra",
};

/** De menos a más trabajo. */
const ORDEN_ESFUERZO: Esfuerzo[] = ["aprobar", "elegir-nota", "mejorar-nota", "falta-documento", "falta-evidencia"];

export interface Palanca {
  id: string;
  ods: number;
  tipo: "ev" | "doc";
  titulo: string;
  peso: number;
  puntos: number;
  maximo: number;
  /** Ganancia en puntos del ODS. */
  ganaOds: number;
  /** Ganancia en el puntaje del año (F). */
  ganaAnual: number;
  /** Ganancia en el general publicado 2027 (la mitad de la anual). */
  gana2027: number;
  /** Cómo entra el ODS: «17», «top3», «entra» (pasa al tercero), «fuera». */
  papel: "17" | "top3" | "entra" | "fuera";
  esfuerzo: Esfuerzo;
}

export interface EntradaPalancas {
  /** Cobertura actual por ODS (la mejor entre la edición actual y la base). */
  cobertura: Record<number, CoberturaOds>;
  /** Elecciones actuales por ODS, para saber el esfuerzo. */
  elecciones: Record<number, EleccionMin[]>;
  /** Puntaje esperado 2027 de cada ODS enviado (sin sorteo). */
  esperado: Record<number, number>;
  /** ODS enviados (el 17 incluido). */
  enviados: number[];
  k: number;
  rigor: number;
  titulos: Record<string, string>;
  soloAprobadas?: boolean;
}

function esfuerzoDe(ind: { id: string; tipo: "ev" | "doc"; puntos: number }, el: EleccionMin | undefined, soloAprobadas: boolean): Esfuerzo {
  if (el?.news_id && soloAprobadas && !el.approved) return "aprobar";
  if (ind.tipo === "doc") return el?.news_id && !el.approved ? "aprobar" : "falta-documento";
  if (el?.news_id) {
    const elegida = el.candidates.find((c) => c.news_id === el.news_id);
    if (el.candidates.some((c) => c.rel === "s" && c.news_id !== el.news_id) && elegida?.rel !== "s") return "elegir-nota";
    if (!el.approved) return "aprobar";
    return "mejorar-nota";
  }
  return el?.candidates.some((c) => c.rel !== "n") ? "elegir-nota" : "falta-evidencia";
}

/** Lo que pasa al tercero del top 3 cuando un ODS de fuera sube `g`. */
function pasoAlTop(enviados: number[], esperado: Record<number, number>, ods: number, g: number): { papel: Palanca["papel"]; suma: number } {
  if (ods === 17) return { papel: "17", suma: PESO_ODS17 * g };
  if (!enviados.includes(ods)) return { papel: "fuera", suma: 0 };
  const otros = enviados.filter((n) => n !== 17);
  const orden = otros.slice().sort((a, b) => (esperado[b] ?? 0) - (esperado[a] ?? 0));
  if (orden.slice(0, 3).includes(ods)) return { papel: "top3", suma: PESO_MEJOR * g };
  const tercero = esperado[orden[2]] ?? 0;
  const nuevo = (esperado[ods] ?? 0) + g;
  return nuevo > tercero ? { papel: "entra", suma: PESO_MEJOR * (nuevo - tercero) } : { papel: "fuera", suma: 0 };
}

export function palancas(e: EntradaPalancas): Palanca[] {
  const out: Palanca[] = [];
  for (const [odsTxt, cov] of Object.entries(e.cobertura)) {
    const ods = Number(odsTxt);
    const porId = new Map((e.elecciones[ods] ?? []).map((x) => [x.indicator, x]));
    for (const ind of cov.indicadores) {
      if (ind.tipo !== "ev" && ind.tipo !== "doc") continue;
      if (ind.puntos >= ind.maximo) continue;
      const ganaOds = ((ind.peso * (ind.maximo - ind.puntos)) / ind.maximo) * e.k * e.rigor;
      const { papel, suma } = pasoAlTop(e.enviados, e.esperado, ods, ganaOds);
      out.push({
        id: ind.id,
        ods,
        tipo: ind.tipo,
        titulo: e.titulos[ind.id] ?? ind.id,
        peso: ind.peso,
        puntos: ind.puntos,
        maximo: ind.maximo,
        ganaOds,
        ganaAnual: suma,
        gana2027: suma / 2,
        papel,
        esfuerzo: esfuerzoDe({ ...ind, tipo: ind.tipo }, porId.get(ind.id), Boolean(e.soloAprobadas)),
      });
    }
  }
  return out.sort(
    (a, b) => b.ganaAnual - a.ganaAnual || b.ganaOds - a.ganaOds || ORDEN_ESFUERZO.indexOf(a.esfuerzo) - ORDEN_ESFUERZO.indexOf(b.esfuerzo) || a.id.localeCompare(b.id, "es", { numeric: true }),
  );
}

/** Suma de lo que darían todas las palancas de un ODS (en el general anual), sin contar interacciones entre ODS. */
export function totalPorOds(ps: Palanca[]): { ods: number; anual: number; odsPts: number; n: number }[] {
  const m = new Map<number, { ods: number; anual: number; odsPts: number; n: number }>();
  for (const p of ps) {
    const x = m.get(p.ods) ?? { ods: p.ods, anual: 0, odsPts: 0, n: 0 };
    x.anual += p.ganaAnual;
    x.odsPts += p.ganaOds;
    x.n++;
    m.set(p.ods, x);
  }
  return [...m.values()].sort((a, b) => b.anual - a.anual);
}
