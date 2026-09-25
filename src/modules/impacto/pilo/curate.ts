/* =============================================================================
   Mr. Pilo Bot para las vicerrectorías · qué hacer con lo que proponen los
   programas y cómo se usan las fichas.

   Sin IA, como el resto: se compara por palabras del nombre (sin tildes, sin
   palabras vacías, en singular) con el índice de Jaccard, y se cuentan
   adopciones, indicadores propios y cifras. Cada sugerencia dice su porqué.

     Parecido a una ficha   un indicador de programa sin relacionar cuyo
                            nombre comparte ≥ 50 % de palabras con una ficha:
                            relacionarlo.
     Idea que se repite     indicadores sin relacionar, parecidos entre sí, de
                            dos o más programas y sin ficha parecida: crear
                            una ficha nueva que los reúna.
     De un solo programa    lo demás: se deja como está.

     Sin uso                ficha que nadie adopta ni adapta.
     Sin cifras             la siguen, pero menos de la mitad ha reportado.
     Muy adaptada           tres o más indicadores propios cuelgan de ella.
   ========================================================================== */

import type { Indicator } from "../model";

const STOP = new Set([
  "de", "del", "la", "las", "el", "los", "en", "y", "o", "a", "al", "con", "por", "para", "que", "se", "su", "sus",
  "un", "una", "e", "u", "entre", "sobre", "segun", "desde", "numero", "porcentaje", "tasa", "indice", "total",
]);

/** Raíz aproximada: sin la «s» o «es» final y sin la vocal final («estudiantes» = «estudiante»). */
function stem(w: string): string {
  let out = w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w;
  if (out.length > 4 && /[aeo]$/.test(out)) out = out.slice(0, -1);
  return out;
}

/** Las palabras que cuentan de un nombre: sin tildes, sin vacías y en singular aproximado. */
export function words(name: string): Set<string> {
  return new Set(
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem),
  );
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common);
}

export const LINK_THRESHOLD = 0.5;

type Item = Pick<Indicator, "id" | "code" | "name" | "stage" | "programId" | "campusId" | "parentId" | "description">;

export interface LinkSuggestion {
  item: Item;
  ficha: Item;
  score: number;
}

export interface RepeatedIdea {
  /** El nombre más repetido, para la ficha nueva. */
  name: string;
  items: Item[];
  /** Cuántos programas en sede distintos la proponen. */
  sites: number;
}

export interface ProposalAnalysis {
  links: LinkSuggestion[];
  ideas: RepeatedIdea[];
  single: Item[];
  linked: number;
}

export function analyzeProposals(fichas: Item[], proposals: Item[]): ProposalAnalysis {
  const fichaWords = fichas.map((f) => ({ f, w: words(f.name) }));
  const loose = proposals.filter((p) => !p.parentId);
  const links: LinkSuggestion[] = [];
  const rest: { item: Item; w: Set<string> }[] = [];

  for (const item of loose) {
    const w = words(item.name);
    let best: LinkSuggestion | null = null;
    for (const { f, w: fw } of fichaWords) {
      const score = similarity(w, fw);
      if (score >= LINK_THRESHOLD && (!best || score > best.score)) best = { item, ficha: f, score };
    }
    if (best) links.push(best);
    else rest.push({ item, w });
  }

  // Agrupar las que quedan por parecido entre sí (el primero de cada grupo manda).
  const groups: { w: Set<string>; items: Item[] }[] = [];
  for (const r of rest) {
    const group = groups.find((g) => similarity(g.w, r.w) >= LINK_THRESHOLD);
    if (group) group.items.push(r.item);
    else groups.push({ w: r.w, items: [r.item] });
  }
  const siteOf = (i: Item) => `${i.programId}|${i.campusId}`;
  const ideas: RepeatedIdea[] = [];
  const single: Item[] = [];
  for (const g of groups) {
    const sites = new Set(g.items.map(siteOf)).size;
    if (sites >= 2) {
      const counts = new Map<string, number>();
      for (const i of g.items) counts.set(i.name.trim(), (counts.get(i.name.trim()) ?? 0) + 1);
      const name = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
      ideas.push({ name, items: g.items, sites });
    } else {
      single.push(...g.items);
    }
  }

  links.sort((a, b) => b.score - a.score);
  ideas.sort((a, b) => b.sites - a.sites || b.items.length - a.items.length);
  return { links, ideas, single, linked: proposals.length - loose.length };
}

export type UsageFlag = "sin_uso" | "sin_cifras" | "muy_adaptada";

export interface FichaUsage {
  ficha: Item;
  adopted: number;
  reporting: number;
  adapted: number;
  flags: UsageFlag[];
}

export const USAGE_TEXT: Record<UsageFlag, string> = {
  sin_uso: "Nadie la sigue ni la adapta: revise si sigue vigente o si su nombre se entiende.",
  sin_cifras: "La siguen, pero menos de la mitad ha reportado: acompañe la captura.",
  muy_adaptada: "Los programas la adaptan con indicadores propios: revise su definición o cree variantes.",
};

/**
 * Por ficha: cuántos programas en sede la adoptan, cuántos de ellos ya
 * reportaron alguna cifra y cuántos indicadores propios cuelgan de ella.
 */
export function analyzeUsage(
  fichas: Item[],
  adoptions: { indicatorId: string; programId: string; campusId: string; active: boolean }[],
  proposals: Item[],
  reported: Set<string>,
): FichaUsage[] {
  return fichas
    .map((ficha) => {
      const mine = adoptions.filter((a) => a.active && a.indicatorId === ficha.id);
      const reporting = mine.filter((a) => reported.has(`${ficha.id}|${a.programId}|${a.campusId}`)).length;
      const adapted = proposals.filter((p) => p.parentId === ficha.id).length;
      const flags: UsageFlag[] = [];
      if (!mine.length && !adapted) flags.push("sin_uso");
      if (mine.length >= 2 && reporting / mine.length < 0.5) flags.push("sin_cifras");
      if (adapted >= 3) flags.push("muy_adaptada");
      return { ficha, adopted: mine.length, reporting, adapted, flags };
    })
    .sort((a, b) => b.flags.length - a.flags.length || b.adopted + b.adapted - (a.adopted + a.adapted));
}
