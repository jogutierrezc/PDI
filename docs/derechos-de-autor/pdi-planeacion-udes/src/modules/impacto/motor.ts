/* =============================================================================
   Motor de alineación: a qué pilares del PDI y a qué ODS apunta un indicador.

   Sin IA a propósito: tiene que poder explicarse y estandarizarse. Lee la
   ficha (nombre, qué mide, dimensión, objetivo, función) y busca en ella los
   criterios del diccionario (`imp_criteria`): términos o frases con un peso,
   cada uno apuntando a un pilar o a un ODS. Suma los pesos hallados por
   destino y sugiere los que pasan el umbral, con los términos que lo
   justifican.

   El texto se compara normalizado —sin tildes, en minúscula, en singular— para
   que «Graduados», «graduado» y «GRADUADOS» sean lo mismo, y una frase solo
   cuenta si sus palabras aparecen seguidas.

   El motor sugiere; una persona confirma. Lo confirmado o puesto a mano no lo
   toca nunca.
   ========================================================================== */

export type AlignmentTarget = "pilar" | "ods";

export interface Criterion {
  target: AlignmentTarget;
  /** Id del pilar, o el número del ODS en texto ("4"). */
  key: string;
  term: string;
  weight: number;
}

export interface IndicatorText {
  name: string;
  description?: string;
  dimension?: string | null;
  objective?: string;
  /** Etiqueta legible de la función: "Enseñanza". */
  functionLabel?: string;
}

export interface Suggestion {
  target: AlignmentTarget;
  key: string;
  score: number;
  confidence: "alta" | "media" | "baja";
  /** Los términos del diccionario que se hallaron, tal como están escritos allí. */
  terms: string[];
}

export interface MotorOptions {
  /** Puntaje mínimo para sugerir. */
  threshold?: number;
  /** Fracción del mejor puntaje del mismo tipo que hace falta para acompañarlo. */
  relative?: number;
  /** Tope de sugerencias por tipo. */
  max?: number;
}

const DEFAULTS: Required<MotorOptions> = { threshold: 2, relative: 0.34, max: 3 };

/** El nombre pesa el doble: dice qué es; la descripción, cómo se mide. */
const NAME_WEIGHT = 2;

const STOPWORDS = new Set(
  "a al ante con de del desde el en entre la las lo los o para por que se sin sobre su sus un una uno y e u es son como mas o numero n nº no".split(" "),
);

/** Minúscula, sin tildes, solo letras y dígitos separados por un espacio. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Raíz liviana en español: basta con juntar singular y plural y las formas
 * más comunes de un mismo término. No pretende ser un lematizador.
 */
export function stem(word: string): string {
  let w = word;
  // El plural en -s y en -es cae en la misma raíz si también se quita la -e
  // tras consonante: profesor(es) → profesor, estudiante(s) → estudiant.
  if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1);
  if (w.length > 4 && /[^aeiou]e$/.test(w)) w = w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w))
    .map(stem);
}

/** ¿Aparece la frase (ya en raíces) seguida dentro del texto? */
function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function suggest(indicator: IndicatorText, criteria: Criterion[], options: MotorOptions = {}): Suggestion[] {
  const opts = { ...DEFAULTS, ...options };
  const name = tokens(indicator.name);
  const rest = tokens(
    [indicator.description, indicator.dimension, indicator.objective, indicator.functionLabel].filter(Boolean).join(" "),
  );

  const scores = new Map<string, { target: AlignmentTarget; key: string; score: number; terms: string[] }>();
  for (const criterion of criteria) {
    const needle = tokens(criterion.term);
    const multiplier = containsSequence(name, needle) ? NAME_WEIGHT : containsSequence(rest, needle) ? 1 : 0;
    if (!multiplier) continue;
    const id = `${criterion.target}:${criterion.key}`;
    const entry = scores.get(id) ?? { target: criterion.target, key: criterion.key, score: 0, terms: [] };
    entry.score += criterion.weight * multiplier;
    if (!entry.terms.includes(criterion.term)) entry.terms.push(criterion.term);
    scores.set(id, entry);
  }

  const out: Suggestion[] = [];
  for (const target of ["pilar", "ods"] as const) {
    const ranked = [...scores.values()].filter((s) => s.target === target).sort((a, b) => b.score - a.score);
    const best = ranked[0]?.score ?? 0;
    for (const s of ranked) {
      if (s.score < opts.threshold || s.score < best * opts.relative) continue;
      if (out.filter((o) => o.target === target).length >= opts.max) break;
      out.push({ ...s, score: Math.round(s.score * 100) / 100, confidence: s.score >= 6 ? "alta" : s.score >= 3.5 ? "media" : "baja" });
    }
  }
  return out;
}
