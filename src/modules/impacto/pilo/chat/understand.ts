/* =============================================================================
   Mr. Pilo Bot conversacional · entender lo que escribe el programa.

   Lógica pura, sin IA ni base, en tres partes:
     · los impactos (los 20 del motor): se reconocen por las raíces del motor
       (PILO_GOALS.terms) y por cómo lo dice la gente («que consigan empleo»);
     · las fichas ya construidas: las que comparten palabras con lo escrito,
       por nombre (pesa el doble) y por descripción, con la misma comparación
       de palabras que usa el análisis de las vicerrectorías (curate.words);
     · las preguntas de análisis («¿cómo va mi programa?»).
   Lo que esto encuentra va primero; la IA (acción «entender» de pilo-ia) solo
   afina, y solo puede elegir entre estas listas.
   ========================================================================== */

import { words } from "../curate";
import { PILO_GOALS, type PiloGoal } from "../recommend";
import type { Stage, SubstantiveFunction } from "../../model";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Cómo dice la gente cada impacto, además de las raíces del motor. */
export const GOAL_WORDS: Record<string, string[]> = {
  empleo: ["empleo", "emplead", "trabaj", "laboral", "consigan", "vinculacion laboral"],
  practicas: ["practica", "pasantia", "rotacion", "escenario"],
  permanencia: ["desercion", "se quedan", "retencion", "graduen a tiempo", "abandon", "a tiempo", "permanezcan"],
  aprende: ["aprend", "saber pro", "pruebas", "calidad academica", "competencias"],
  profesores: ["profesor", "docente", "doctor", "maestria", "planta"],
  acredita: ["acredit", "registro calificado", "cna", "autoevaluacion"],
  internacional: ["internacional", "movilidad", "intercambio", "extranjer", "bilingu", "idioma"],
  innova: ["innov", "pedagog", "simulacion", "virtual", "curricul", "flexib"],
  semilleros: ["semiller", "investiguen", "investigador", "formacion investigativa"],
  proyectos: ["proyectos de investigacion", "convocatoria", "financiad", "colabora"],
  conocimiento: ["public", "articulo", "revista", "citas", "visibil"],
  transferencia: ["transfer", "consultor", "patente", "politica publica", "se use"],
  reconocimiento: ["categoriz", "minciencias", "grupo de investigacion", "grupos"],
  apropiacion: ["apropiacion", "divulga", "ods", "sociedad"],
  territorio: ["territori", "municipio", "region", "rural", "comunidad", "beneficiar"],
  aliados: ["aliad", "convenio", "empresa", "hospital", "alianza", "sector externo"],
  capacidades: ["proyeccion social", "capacidad", "salud publica", "brigada", "promocion", "prevencion"],
  egresados: ["egresad", "educacion continua", "diplomado", "posgrado"],
  tecnologia: ["tecnolog", "licencia", "trl", "software", "dispositivo"],
  sostenible: ["sostenib", "ambient", "bienestar", "cultura", "patrimonio"],
};

/** Los impactos que se reconocen en lo que escribió el programa. */
export function matchGoals(text: string): PiloGoal[] {
  const t = fold(text);
  return PILO_GOALS.filter((g) => [...g.terms, ...(GOAL_WORDS[g.id] ?? [])].some((k) => t.includes(fold(k))));
}

export interface Candidate {
  id: string;
  code: string;
  name: string;
  description: string;
  fn: SubstantiveFunction;
  stage: Stage;
  dimensionName: string | null;
}

export interface IndicatorMatch<T extends Candidate = Candidate> {
  item: T;
  score: number;
  /** Las palabras de lo escrito que aparecen en el nombre de la ficha. */
  hits: string[];
}

/**
 * Las fichas que comparten palabras con lo escrito. Cuenta el doble si la
 * palabra está en el nombre; con una sola palabra en la descripción no basta.
 */
export function matchIndicators<T extends Candidate>(text: string, list: T[], limit = 8): IndicatorMatch<T>[] {
  const said = words(text);
  if (!said.size) return [];
  const out: IndicatorMatch<T>[] = [];
  for (const item of list) {
    const name = words(`${item.name} ${item.dimensionName ?? ""}`);
    const desc = words(item.description ?? "");
    const hits = [...said].filter((w) => name.has(w));
    const inDesc = [...said].filter((w) => !name.has(w) && desc.has(w)).length;
    const score = hits.length * 2 + inDesc;
    if (hits.length === 0 && inDesc < 2) continue;
    out.push({ item, score: score / Math.sqrt(name.size + 1), hits });
  }
  return out.sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code)).slice(0, limit);
}

export type Intent = "estado" | "cadena" | "pares" | "p1p2p3" | "liviana" | "adoptar" | "porque" | `mas:${SubstantiveFunction}`;

/** Lo que suena a pregunta de análisis o a ajuste de la propuesta. */
export function detectIntent(text: string): Intent | null {
  const t = fold(text);
  if (/\b(como va|como vamos|como estamos|cumplimiento|rezagad|avance del programa)/.test(t)) return "estado";
  if (/\b(me falta|que falta|hueco|cadena)/.test(t)) return "cadena";
  if (/\b(parecid|otros programas|que hacen los demas|que siguen)/.test(t)) return "pares";
  if (/\b(p1p2p3|notas|cortes|reprob|aprobacion|promedio)/.test(t)) return "p1p2p3";
  if (/\b(liviana|menos indicadores|mas corta|mas corto|lo esencial)/.test(t)) return "liviana";
  if (/\b(adopt|guardar|confirmo|aceptar la propuesta)/.test(t)) return "adoptar";
  if (/\b(por que|porque estos|explica)/.test(t)) return "porque";
  const more = t.match(/\bmas (de |en )?(ensenanza|investigacion|extension)/);
  if (more) return `mas:${more[2] as SubstantiveFunction}`;
  return null;
}
