/* =============================================================================
   Mr. Pilo Bot · qué indicadores proponerle a un programa.

   Sin IA, igual que el motor de pilares y ODS: cada propuesta se puede
   explicar. El programa dice qué impactos quiere demostrar (al menos uno por
   función) y cuánto puede reportar; el motor arma la propuesta en dos pasos:

     1. La cadena. En cada función, un indicador por eslabón: insumos,
        procesos, productos e impacto real. Sin los cuatro la cadena de valor
        no explica cómo el programa llega a sus resultados, así que ninguna
        propuesta sale sin ellos. «Lo esencial» es exactamente esto.
     2. El resto del tamaño, parejo entre funciones y rotando entre los
        impactos elegidos.

   Las obligatorias de la vicerrectoría y lo que el programa ya sigue entran
   siempre. Cada ficha se puntúa con pesos que Planeación ajusta sin tocar
   código (imp_pilo_settings, 0085); los de fábrica están en DEFAULT_WEIGHTS.
   Lo que siguen «otros programas» viene también de la hoja anterior una vez
   sincronizada, y las cifras disponibles, de lo capturado y de fuentes
   institucionales como los reportes P1P2P3.
   ========================================================================== */

import type { Stage, SubstantiveFunction } from "../model";

export interface PiloGoal {
  id: string;
  fn: SubstantiveFunction;
  title: string;
  /** Las dimensiones que la responden, por nombre (se comparan sin tildes). */
  dimensions: string[];
  /** Raíces que, en el nombre de la ficha, la delatan: «empleab» → empleabilidad. */
  terms: string[];
  /** Metas que se responden con lo que piden las condiciones de calidad (CESU). */
  cesu?: boolean;
}

/**
 * Los impactos que un programa puede querer demostrar. Hay que elegir al
 * menos uno por función (Enseñanza, Investigación, Extensión) y hasta tres.
 * Cada uno se reconoce por palabras del nombre de la ficha (sin tildes) y,
 * en segundo lugar, por su dimensión.
 */
export const PILO_GOALS: PiloGoal[] = [
  // Enseñanza
  { id: "empleo", fn: "ensenanza", title: "Sus graduados consiguen empleo y lideran", dimensions: [], terms: ["empleab", "empleador", "liderazgo", "reconocimientos a graduados"] },
  { id: "practicas", fn: "ensenanza", title: "Sus prácticas vinculan a los estudiantes con el sector", dimensions: ["Práctica Profesional"], terms: ["practicas empresariales", "vinculacion efectiva", "practica"] },
  { id: "permanencia", fn: "ensenanza", title: "Sus estudiantes se quedan y se gradúan a tiempo", dimensions: ["Permanencia"], terms: ["permanencia", "retencion", "desercion", "graduacion oportuna", "acompanamiento", "becas"] },
  { id: "aprende", fn: "ensenanza", title: "Sus estudiantes aprenden más de lo esperado", dimensions: ["Aprendizaje"], terms: ["saber pro", "valor agregado", "aprendizaje"] },
  { id: "profesores", fn: "ensenanza", title: "Tiene profesores formados y bien evaluados", dimensions: [], terms: ["profesor", "maestria y doctorado", "evaluacion profesoral", "planta profesoral"] },
  { id: "acredita", fn: "ensenanza", title: "Está listo para la acreditación", dimensions: [], terms: ["acreditacion", "autoevaluacion", "planes de mejoramiento", "consejo"], cesu: true },
  { id: "internacional", fn: "ensenanza", title: "Se abre al mundo con movilidad e internacionalización", dimensions: [], terms: ["movilidad", "internacionalizacion"] },
  { id: "innova", fn: "ensenanza", title: "Innova en cómo enseña y en su oferta", dimensions: ["Experiencia del Estudiante"], terms: ["innovaciones pedagogicas", "transdisciplinar", "educacion continuada", "oferta"] },
  // Investigación
  { id: "semilleros", fn: "investigacion", title: "Forma investigadores desde el pregrado", dimensions: ["Formación investigativa"], terms: ["semillero", "jovenes investigadores", "formacion investigativa", "formacion en investigacion"] },
  { id: "proyectos", fn: "investigacion", title: "Formula y ejecuta proyectos, también con otros", dimensions: [], terms: ["proyectos formulados", "proyectos en ejecucion", "convocatoria", "colaboracion", "infraestructura"] },
  { id: "conocimiento", fn: "investigacion", title: "Produce conocimiento nuevo y visible", dimensions: ["Investigación, creación e innovación"], terms: ["nuevo conocimiento", "cienciometric", "rankings", "focos de investigacion"] },
  { id: "transferencia", fn: "investigacion", title: "Su conocimiento se usa fuera de la universidad", dimensions: [], terms: ["transferidos", "desarrollo tecnologico", "consultorias", "emprendimientos", "propiedad intelectual", "politicas publicas"] },
  { id: "reconocimiento", fn: "investigacion", title: "Sus investigadores y grupos son reconocidos", dimensions: [], terms: ["categorizados", "minciencias", "reconocidos", "liderazgo y transferencia"] },
  { id: "apropiacion", fn: "investigacion", title: "Lleva la ciencia a la sociedad y a los ODS", dimensions: ["Apropiación social del conocimiento"], terms: ["apropiacion social", "ods", "creacion artistica"] },
  // Extensión
  { id: "territorio", fn: "extension", title: "Transforma su territorio", dimensions: ["Microsocial Territorial"], terms: ["territori", "municipios", "beneficiarios", "problematicas", "comunidad"] },
  { id: "aliados", fn: "extension", title: "Trabaja con empresas y aliados", dimensions: ["Mesosocial Intersectorial"], terms: ["convenios", "aliados", "intersectorial", "interinstitucional", "sector externo"] },
  { id: "capacidades", fn: "extension", title: "Sus proyectos sociales dejan capacidades", dimensions: [], terms: ["proyeccion social", "capacidades", "lideran procesos", "apropiacion comunitaria", "convivencia", "cuidado"] },
  { id: "egresados", fn: "extension", title: "Acompaña a sus egresados y la educación continua", dimensions: ["Institucional Formativo"], terms: ["educacion continua", "egresados", "posgradual", "estudiantes y graduados"] },
  { id: "tecnologia", fn: "extension", title: "Transfiere tecnología al sector productivo", dimensions: [], terms: ["dtt", "trl", "tecnologia", "licencias", "regalias"] },
  { id: "sostenible", fn: "extension", title: "Aporta a la sostenibilidad, la cultura y el bienestar", dimensions: ["Macrosocial Contextual"], terms: ["ambiental", "patrimonio", "bienestar", "plan regional"] },
];

export const PILO_SIZES = [
  { n: 12, name: "Lo esencial", hint: "La cadena completa: insumos, procesos, productos e impacto real en cada función.", perFn: "4 por función, uno por eslabón" },
  { n: 18, name: "Equilibrado", hint: "La cadena completa y dos más por función en los impactos que eligió.", perFn: "≈ 6 por función", recommended: true },
  { n: 24, name: "Completo", hint: "Para programas en acreditación o con equipo de apoyo.", perFn: "≈ 8 por función" },
] as const;

/** Mínimo y máximo de impactos por función. */
export const GOALS_PER_FN = { min: 1, max: 3 } as const;

export const FNS: SubstantiveFunction[] = ["ensenanza", "investigacion", "extension"];
export const STAGES: Stage[] = ["insumos", "procesos", "productos", "impacto"];

/** ¿Falta elegir en alguna función? Devuelve las que no tienen ningún impacto. */
export function missingFunctions(goalIds: string[]): SubstantiveFunction[] {
  const chosen = PILO_GOALS.filter((g) => goalIds.includes(g.id));
  return FNS.filter((fn) => !chosen.some((g) => g.fn === fn));
}

/* --- Los pesos ---------------------------------------------------------------------- */

export interface PiloWeights {
  goalName: number;
  goalDimension: number;
  cesu: number;
  peersFaculty: number;
  peersAll: number;
  data: number;
  dataNoPrefer: number;
  sourceData: number;
  consultOnly: number;
  impact: number;
}

export const DEFAULT_WEIGHTS: PiloWeights = {
  goalName: 10,
  goalDimension: 6,
  cesu: 3,
  peersFaculty: 6,
  peersAll: 4,
  data: 4,
  dataNoPrefer: 1,
  sourceData: 5,
  consultOnly: -3,
  impact: 0.5,
};

export const WEIGHT_LABELS: Record<keyof PiloWeights, { label: string; hint: string }> = {
  goalName: { label: "Impacto por nombre", hint: "El nombre de la ficha habla del impacto elegido." },
  goalDimension: { label: "Impacto por dimensión", hint: "Solo la dimensión de la ficha corresponde al impacto." },
  cesu: { label: "Condiciones CESU / CNA", hint: "La ficha responde a condiciones de calidad para acreditación." },
  peersFaculty: { label: "Programas de su facultad", hint: "Lo máximo que suma que la sigan todos los programas de la facultad." },
  peersAll: { label: "Programas de la UDES", hint: "Lo máximo cuando la facultad no tiene información." },
  data: { label: "Cifras ya capturadas", hint: "El programa ya reportó cifras de la ficha." },
  dataNoPrefer: { label: "Cifras, sin priorizar", hint: "Lo mismo, cuando el programa pidió no priorizarlo." },
  sourceData: { label: "Fuente institucional (P1P2P3)", hint: "Los reportes de notas ya traen datos del programa para la ficha." },
  consultOnly: { label: "Solo de consulta", hint: "Ficha que reporta la vicerrectoría. Negativo: baja en la lista." },
  impact: { label: "Impacto real", hint: "Empujón a los indicadores del eslabón de impacto." },
};

/** Los pesos guardados, completados con los de fábrica y sin valores fuera de rango. */
export function mergeWeights(saved: Record<string, unknown> | null | undefined): PiloWeights {
  const out = { ...DEFAULT_WEIGHTS };
  for (const key of Object.keys(DEFAULT_WEIGHTS) as (keyof PiloWeights)[]) {
    if (!saved || !(key in saved)) continue;
    const v = Number(saved[key]);
    if (Number.isFinite(v) && v >= -50 && v <= 50) out[key] = v;
  }
  return out;
}

/* --- Entradas y salidas ------------------------------------------------------------- */

export interface PiloIndicator {
  id: string;
  code: string;
  name: string;
  fn: SubstantiveFunction;
  stage: Stage;
  dimensionName: string | null;
  cesu: string[];
  programReports: boolean;
  /** La vicerrectoría la pide a todos los programas. */
  mandatory?: boolean;
}

export interface PeerCount {
  faculty: number;
  totalFaculty: number;
  all: number;
  totalAll: number;
}

export interface PiloInput {
  indicators: PiloIndicator[];
  goals: string[];
  size: number;
  preferData: boolean;
  /** Lo que el programa ya sigue en esa sede. */
  adopted: Set<string>;
  /** Por ficha, los años con cifra del programa en esa sede. */
  years: Map<string, number[]>;
  /** Por ficha, los periodos que una fuente institucional ya trae («2026-1»). */
  sourcePeriods?: Map<string, string[]>;
  peers: Map<string, PeerCount>;
  /** Por ficha, «Pilar 1», «ODS 4»… ya confirmados. */
  alignments?: Map<string, string[]>;
  weights?: PiloWeights;
}

export interface PiloPick {
  indicator: PiloIndicator;
  score: number;
  goalId: string | null;
  /** Ya la sigue: se conserva y no se quita. */
  kept: boolean;
  /** Obligatoria de la vicerrectoría: no se quita. */
  mandatory: boolean;
  /** Entró para completar la cadena de su función. */
  chain: boolean;
  reasons: string[];
}

export interface PiloProposal {
  picks: PiloPick[];
  /**
   * Por «función|eslabón», la mejor ficha que no está en la propuesta: con
   * ella la pantalla ofrece llenar un eslabón que quede vacío.
   */
  fillers: Map<string, PiloPick>;
  /** Eslabones que el catálogo no permite llenar: no hay fichas publicadas. */
  impossible: { fn: SubstantiveFunction; stage: Stage }[];
}

/* --- Puntuar ------------------------------------------------------------------------ */

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Qué tan bien responde una ficha a una meta: 2 por su nombre, 1 solo por su dimensión o sus condiciones CESU, 0 nada. */
function goalStrength(goal: PiloGoal, i: PiloIndicator): 0 | 1 | 2 {
  if (goal.fn !== i.fn) return 0;
  const name = fold(i.name);
  if (goal.terms.some((t) => name.includes(t))) return 2;
  if (goal.cesu && i.cesu.length > 0) return 1;
  if (i.dimensionName !== null && goal.dimensions.some((d) => fold(d) === fold(i.dimensionName!))) return 1;
  return 0;
}

function bestGoal(goals: PiloGoal[], i: PiloIndicator): { goal: PiloGoal; strength: 1 | 2 } | null {
  let best: { goal: PiloGoal; strength: 1 | 2 } | null = null;
  for (const goal of goals) {
    const strength = goalStrength(goal, i);
    if (strength && (!best || strength > best.strength)) best = { goal, strength };
  }
  return best;
}

const listOf = (items: (string | number)[]) => {
  const sorted = [...new Set(items)].sort();
  if (sorted.length <= 2) return sorted.join(" y ");
  return `${sorted.slice(0, -1).join(", ")} y ${sorted[sorted.length - 1]}`;
};

function score(input: PiloInput, w: PiloWeights, i: PiloIndicator, match: { goal: PiloGoal; strength: 1 | 2 } | null): PiloPick {
  const kept = input.adopted.has(i.id);
  const mandatory = Boolean(i.mandatory);
  const years = input.years.get(i.id) ?? [];
  const periods = input.sourcePeriods?.get(i.id) ?? [];
  const reasons: string[] = [];
  let points = 0;
  if (mandatory) reasons.push("Obligatoria de la vicerrectoría");
  if (kept) reasons.push("Ya lo sigue: se conserva");
  if (match) points += match.strength === 2 ? w.goalName : w.goalDimension;
  if (periods.length) {
    points += w.sourceData;
    reasons.push(`Los reportes P1P2P3 ya traen sus datos de ${listOf(periods)}: lo puede reportar hoy`);
  }
  const p = input.peers.get(i.id);
  if (p && p.totalFaculty >= 2 && p.faculty > 0) {
    points += (p.faculty / p.totalFaculty) * w.peersFaculty;
    reasons.push(`Lo siguen ${p.faculty} de ${p.totalFaculty} programas de su facultad`);
  } else if (p && p.totalAll > 0 && p.all > 0) {
    points += (p.all / p.totalAll) * w.peersAll;
    reasons.push(`Lo siguen ${p.all} de ${p.totalAll} programas de la UDES`);
  }
  if (years.length) {
    points += input.preferData ? w.data : w.dataNoPrefer;
    reasons.push(`Ya tiene cifras de ${listOf(years)}`);
  }
  if (i.cesu.length) {
    points += w.cesu;
    reasons.push("Condición de calidad CESU / CNA");
  }
  if (!i.programReports) {
    points += w.consultOnly;
    reasons.push("Solo consulta: lo reporta la vicerrectoría");
  }
  if (i.stage === "impacto") points += w.impact;
  const aligned = input.alignments?.get(i.id);
  if (aligned?.length) reasons.push(`Aporta al ${aligned.slice(0, 2).join(" y al ")}`);
  if (match) reasons.push(`Responde a «${match.goal.title}»`);
  return { indicator: i, score: points, goalId: match?.goal.id ?? null, kept, mandatory, chain: false, reasons };
}

/* --- Proponer ----------------------------------------------------------------------- */

export function recommend(input: PiloInput): PiloProposal {
  const w = input.weights ?? DEFAULT_WEIGHTS;
  const chosen = PILO_GOALS.filter((g) => input.goals.includes(g.id));
  const fns = FNS.filter((fn) => chosen.some((g) => g.fn === fn));
  const order = (a: PiloPick, b: PiloPick) => b.score - a.score || a.indicator.code.localeCompare(b.indicator.code, "es", { numeric: true });
  // Para un eslabón decide el puntaje, que ya lleva el peso del impacto elegido:
  // así los pesos de Planeación (CESU/CNA, fuentes…) también mandan en la cadena.
  const byFit = order;

  const pool: PiloPick[] = [];
  for (const i of input.indicators) {
    if (!fns.includes(i.fn) && !input.adopted.has(i.id) && !i.mandatory) continue;
    pool.push(score(input, w, i, bestGoal(chosen, i)));
  }
  const picks: PiloPick[] = [];
  const taken = new Set<string>();
  const add = (p: PiloPick, chain = false) => {
    if (taken.has(p.indicator.id)) return;
    taken.add(p.indicator.id);
    picks.push(chain ? { ...p, chain: true, reasons: ["Completa la cadena de valor", ...p.reasons] } : p);
  };

  // 0. Lo obligatorio y lo que ya sigue, siempre.
  pool.filter((p) => p.mandatory).sort(order).forEach((p) => add(p));
  pool.filter((p) => p.kept).sort(order).forEach((p) => add(p));

  // 1. La cadena: un indicador de cada eslabón en cada función elegida.
  const impossible: PiloProposal["impossible"] = [];
  for (const fn of fns) {
    for (const stage of STAGES) {
      if (picks.some((p) => p.indicator.fn === fn && p.indicator.stage === stage)) continue;
      const best = pool.filter((p) => p.indicator.fn === fn && p.indicator.stage === stage && !taken.has(p.indicator.id)).sort(byFit)[0];
      if (best) add(best, !best.goalId);
      else impossible.push({ fn, stage });
    }
  }

  // 2. El resto del tamaño: ronda por función y, dentro, rotando entre sus
  //    impactos, con un empujón a lo que llena un eslabón que ese impacto no tiene.
  const byGoal = new Map(chosen.map((g) => [g.id, pool.filter((p) => p.goalId === g.id)]));
  const bestFor = (goalId: string) => {
    const covered = new Set(picks.filter((p) => p.goalId === goalId).map((p) => p.indicator.stage));
    return (byGoal.get(goalId) ?? [])
      .filter((p) => !taken.has(p.indicator.id))
      .map((p) => ({ p, bonus: covered.has(p.indicator.stage) ? 0 : 3 }))
      .sort((a, b) => b.p.score + b.bonus - (a.p.score + a.bonus) || order(a.p, b.p))[0]?.p;
  };
  const goalsOf = fns.map((fn) => chosen.filter((g) => g.fn === fn));
  const turn = fns.map(() => 0);
  for (let round = 0; picks.length < input.size && round < 80; round++) {
    let added = false;
    goalsOf.forEach((list, f) => {
      if (picks.length >= input.size || !list.length) return;
      for (let tries = 0; tries < list.length; tries++) {
        const goal = list[turn[f] % list.length];
        turn[f]++;
        const next = bestFor(goal.id);
        if (next) {
          add(next);
          added = true;
          return;
        }
      }
    });
    if (!added) break;
  }

  // Con qué llenar cada eslabón si la persona quita lo que había.
  const fillers = new Map<string, PiloPick>();
  for (const fn of fns) {
    for (const stage of STAGES) {
      const best = pool.filter((p) => p.indicator.fn === fn && p.indicator.stage === stage && !taken.has(p.indicator.id)).sort(byFit)[0];
      if (best) fillers.set(`${fn}|${stage}`, { ...best, chain: true, reasons: ["Completa la cadena de valor", ...best.reasons] });
    }
  }

  return { picks, fillers, impossible };
}

/**
 * Los eslabones vacíos de una selección, por función. La cadena tiene que
 * quedar completa en cada función elegida antes de adoptar.
 */
export function chainGaps(selected: PiloPick[], fns: SubstantiveFunction[]): { fn: SubstantiveFunction; stage: Stage }[] {
  return fns.flatMap((fn) =>
    STAGES.filter((stage) => !selected.some((p) => p.indicator.fn === fn && p.indicator.stage === stage)).map((stage) => ({ fn, stage })),
  );
}

/** Por función y eslabón, cuántos hay en una selección. */
export function chainCount(selected: PiloPick[]): Record<SubstantiveFunction, Record<Stage, number>> {
  return Object.fromEntries(
    FNS.map((fn) => [fn, Object.fromEntries(STAGES.map((s) => [s, selected.filter((p) => p.indicator.fn === fn && p.indicator.stage === s).length]))]),
  ) as Record<SubstantiveFunction, Record<Stage, number>>;
}
