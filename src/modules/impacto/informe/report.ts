/* =============================================================================
   Indicadores de Impacto · el informe con Mr. Pilo (las cuentas, sin IA).

   El mismo modelo del «Análisis de los datos» de UDES en Cifras, para una
   unidad: un programa (en una sede o en todas), una facultad o una
   vicerrectoría (una función sustantiva).

   Aquí se decide, sin IA y con la misma foto del Portal de Impacto:
   · de qué unidades puede pedir el informe quien mira (`reportChoices`, espejo
     de imp_report_allowed en 0100; la base vuelve a decidir);
   · en qué capítulos se parte (`reportPlan`): un programa y una facultad, un
     capítulo por función sustantiva; una vicerrectoría, un panorama de la
     función y un capítulo por facultad;
   · las cifras de cada capítulo, una línea numerada por indicador («[2]»):
     serie por año, última cifra frente a la meta 2026 y 2028, avance y estado
     (regla del 70 %), eslabón de la cadena de valor y la comparación con los
     demás programas (medianas). Son los únicos números que la IA puede
     escribir; los que no estén quedan «para revisar».
   ========================================================================== */

import type { AnalysisBrief, ReportKind } from "../../../components/pilo/ai/logic";
import type { AnalysisChapter } from "../../boletin/analysis";
import { FUNCTIONS, FUNCTION_LABEL, STAGES, STAGE_LABEL, formatFigure } from "../model";
import type { SubstantiveFunction } from "../model";
import { globalFigure, programsOf } from "../portal/analysis";
import type { PortalProgram } from "../portal/analysis";
import type { PortalData, PortalIndicator } from "../portal/data";
import {
  LAGGING_BELOW,
  STANDING_LABEL,
  countStandings,
  cutYear,
  median,
  metShare,
  ownStandings,
  programStandings,
  sortByAttention,
  spreads,
  standingsOf,
  withTarget,
} from "../portal/standing";
import type { IndicatorStanding, Spread, Standing, StandingsByProgram } from "../portal/standing";

export type { ReportKind };

export const KIND_LABEL: Record<ReportKind, string> = {
  programa: "Programa",
  facultad: "Facultad",
  vicerrectoria: "Vicerrectoría",
};

/** De qué es el informe. En un programa, la sede (null: todas); `ref` es el id o la función. */
export interface ReportScope {
  kind: ReportKind;
  ref: string;
  campusId: string | null;
}

/* --- Quién puede pedir qué ------------------------------------------------------------ */

export interface ReportSwitches {
  enabled: boolean;
  programa: boolean;
  facultad: boolean;
  vicerrectoria: boolean;
}

export interface ReportChoices {
  programs: { id: string; name: string; faculty: string; campuses: { id: string; name: string }[]; allCampuses: boolean }[];
  faculties: { id: string; name: string }[];
  functions: SubstantiveFunction[];
}

interface ChoiceBase {
  units: { id: string; parentId: string | null; kind: string; name: string }[];
  campuses: { id: string; name: string }[];
  offer: { programId: string; campusId: string }[];
  unitFunctions: { unitId: string; fn: SubstantiveFunction }[];
  memberships: { unitId: string; campusId: string | null; viaRole?: boolean }[];
}

/**
 * Las unidades de las que quien mira puede pedir un informe. La administración,
 * todas; los demás, las suyas y solo en los tipos que la administración abrió
 * (como imp_report_allowed: el programa o su facultad; la facultad a la que
 * pertenece; la función de su vicerrectoría u oficina). Lo que le da su rol de
 * acceso (viaRole, 0154) vale aunque el tipo siga cerrado.
 */
export function reportChoices(base: ChoiceBase, admin: boolean, open: Pick<ReportSwitches, ReportKind>): ReportChoices {
  const byId = new Map(base.units.map((u) => [u.id, u]));
  const chain = (id: string) => {
    const out: string[] = [];
    let walker: string | null = id;
    while (walker && out.length < 64) {
      out.push(walker);
      walker = byId.get(walker)?.parentId ?? null;
    }
    return out;
  };
  const facultyOf = (id: string) => chain(id).map((x) => byId.get(x)).find((u) => u?.kind === "facultad")?.name ?? "";
  const campusName = new Map(base.campuses.map((c) => [c.id, c.name]));
  const sitesOf = (programId: string) =>
    base.offer
      .filter((o) => o.programId === programId)
      .map((o) => ({ id: o.campusId, name: campusName.get(o.campusId) ?? "Sede" }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const programs = base.units
    .filter((u) => u.kind === "programa")
    .map((u) => {
      const sites = sitesOf(u.id);
      if (admin) return { id: u.id, name: u.name, faculty: facultyOf(u.id), campuses: sites, allCampuses: true };
      const ids = chain(u.id);
      const mine = base.memberships.filter((m) => ids.includes(m.unitId) && (open.programa || m.viaRole));
      if (!mine.length) return null;
      const everywhere = mine.some((m) => m.campusId === null);
      const campuses = everywhere ? sites : sites.filter((s) => mine.some((m) => m.campusId === s.id));
      return campuses.length || everywhere ? { id: u.id, name: u.name, faculty: facultyOf(u.id), campuses, allCampuses: everywhere } : null;
    })
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const faculties = base.units
    .filter((u) => u.kind === "facultad" && (admin || base.memberships.some((m) => m.unitId === u.id && (open.facultad || m.viaRole))))
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const mineFns = new Set(
    base.unitFunctions
      .filter((f) => base.memberships.some((m) => m.unitId === f.unitId && (open.vicerrectoria || m.viaRole)))
      .map((f) => f.fn),
  );
  const functions = FUNCTIONS.filter((fn) => admin || mineFns.has(fn));
  return { programs, faculties, functions };
}

export const hasChoices = (c: ReportChoices) => c.programs.length + c.faculties.length + c.functions.length > 0;

/* --- El plan: capítulos y cifras ------------------------------------------------------- */

export interface ReportSource {
  n: number;
  code: string;
  name: string;
  /** Quién reporta la cifra, según la ficha. */
  source: string;
  /** «2024–2025», o vacío si aún no hay cifras. */
  years: string;
}

export interface ReportFigure {
  label: string;
  value: string;
  note: string;
  tone?: "bien" | "mal";
}

/** Una barra de la gráfica de avance de un capítulo. */
export interface ReportBar {
  code: string;
  name: string;
  pct: number | null;
  standing: Standing;
}

export interface ReportPart {
  key: string;
  kicker: string;
  title: string;
  figures: ReportFigure[];
  bars: ReportBar[];
  sources: ReportSource[];
}

export interface PlannedPart extends ReportPart {
  /** Las cifras que lee la IA (no se guardan: se recalculan). */
  facts: string;
}

export interface ReportPlan {
  scope: ReportScope;
  unitName: string;
  /** El título del documento: «Informe de impacto · Enfermería». */
  title: string;
  /** «Programa · Bucaramanga · Corte 2025». */
  subtitle: string;
  cut: number | null;
  parts: PlannedPart[];
}

/** El documento escrito, tal como se guarda en imp_ai_reports.content. */
export interface ReportDoc {
  version: 1;
  scope: ReportScope;
  unitName: string;
  title: string;
  subtitle: string;
  cut: number | null;
  brief: AnalysisBrief;
  pdi: boolean;
  parts: (ReportPart & { chapter: AnalysisChapter | null })[];
  closing: AnalysisChapter | null;
  createdAt: string;
}

const DIRECTION = { sube: "más alto es mejor", baja: "más bajo es mejor" } as const;
const HOW_TO_READ = `Cómo se lee: avance = última cifra ÷ meta 2026 (se invierte si el indicador debe bajar); cumplida desde el 100 %, en camino desde el ${LAGGING_BELOW} %, rezagada por debajo del ${LAGGING_BELOW} %. Sin cifra no es cero.`;

const round = (v: number) => Math.round(v * 100) / 100;
const fig = (v: number | null, i: PortalIndicator) => (v === null ? "sin cifra" : formatFigure(round(v), i.measure));
const pctText = (p: number | null) => (p === null ? "sin avance" : `${Math.round(p)} %`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const yearsOf = (trend: { year: number }[]) =>
  trend.length ? (trend.length === 1 ? String(trend[0].year) : `${trend[0].year}–${trend[trend.length - 1].year}`) : "";

const sourceOf = (n: number, i: PortalIndicator, years: string): ReportSource => ({
  n,
  code: i.code,
  name: i.name,
  source: i.source || i.responsible || "Unidad responsable",
  years,
});

/** «3 cumplidas, 2 en camino, 1 rezagada…», solo lo que hay. */
function statesLine(rows: { standing: Standing }[]): string {
  const c = countStandings(rows);
  const parts = [
    c.cumplida && plural(c.cumplida, "cumplida", "cumplidas"),
    c.en_camino && `${c.en_camino} en camino`,
    c.rezagada && plural(c.rezagada, "rezagada", "rezagadas"),
    c.sin_cifra && `${c.sin_cifra} sin cifra`,
    c.sin_meta && `${c.sin_meta} con meta sin número`,
  ].filter(Boolean);
  return parts.join(", ");
}

const medianPct = (rows: { pct: number | null }[]) => median(rows.map((r) => r.pct).filter((p): p is number => p !== null));

function figuresOf(rows: IndicatorStanding[]): ReportFigure[] {
  const c = countStandings(rows);
  const m = medianPct(rows);
  return [
    { label: "Metas cumplidas", value: `${c.cumplida}`, note: `de ${withTarget(c)} con meta numérica`, tone: c.cumplida > 0 ? "bien" : undefined },
    { label: "Avance mediano", value: m === null ? "—" : `${Math.round(m)} %`, note: "frente a la meta 2026" },
    c.rezagada > 0 || c.sin_cifra === 0
      ? { label: "Rezagadas", value: `${c.rezagada}`, note: `por debajo del ${LAGGING_BELOW} %`, tone: c.rezagada > 0 ? "mal" : undefined }
      : { label: "Sin cifra", value: `${c.sin_cifra}`, note: "falta reportar", tone: "mal" },
  ];
}

const barsOf = (rows: IndicatorStanding[], limit = 10): ReportBar[] =>
  rows.slice(0, limit).map((r) => ({ code: r.indicator.code, name: r.indicator.name, pct: r.pct, standing: r.standing }));

/** La cadena de valor de unos indicadores: cuántos hay en cada eslabón y cuáles faltan. */
function chainLine(indicators: PortalIndicator[]): string {
  const counts = STAGES.map((s) => ({ s, n: new Set(indicators.filter((i) => i.stage === s).map((i) => i.id)).size }));
  const missing = counts.filter((c) => c.n === 0).map((c) => STAGE_LABEL[c.s].toLowerCase());
  return `Cadena de valor (indicadores por eslabón): ${counts.map((c) => `${STAGE_LABEL[c.s]} ${c.n}`).join(", ")}${missing.length ? `; sin indicador en ${missing.join(" y ")}` : "; cubre los cuatro eslabones"}.`;
}

/** La meta 2028 de un programa: la que fijó en sus sedes (promedio) o la de la ficha. */
function target2028(data: PortalData, programId: string, campusId: string | null, i: PortalIndicator): string {
  const own = data.adoptions
    .filter((a) => a.indicatorId === i.id && a.programId === programId && (!campusId || a.campusId === campusId))
    .map((a) => a.target2028Num)
    .filter((t): t is number => t !== null);
  if (own.length) return fig(own.reduce((t, x) => t + x, 0) / own.length, i);
  if (i.target2028Num !== null) return fig(i.target2028Num, i);
  return i.target2028.trim();
}

/** Una línea por indicador de un programa, con la mediana de los demás programas que lo siguen. */
function programLine(n: number, r: IndicatorStanding, data: PortalData, campusId: string | null, peers: Map<string, number[]>, own: boolean): string {
  const i = r.indicator;
  const head = `[${n}] ${i.code} · ${i.name} (${i.unitLabel || "valor"}; ${DIRECTION[i.direction]}; eslabón ${STAGE_LABEL[i.stage].toLowerCase()}${own ? "; indicador propio del programa" : ""})`;
  const parts = [head];
  const base = i.baselineNum !== null ? fig(i.baselineNum, i) : i.baselineText.trim();
  if (base) parts.push(`línea base ${i.baselineYear}: ${base}`);
  if (r.trend.length) parts.push(`por año: ${r.trend.map((p) => `${p.year}: ${fig(p.value, i)}`).join(", ")}`);
  parts.push(r.value === null ? "sin cifra reportada" : `última cifra ${r.year}: ${fig(r.value, i)}`);
  if (r.target !== null) {
    parts.push(`meta 2026: ${fig(r.target, i)} (${r.pct === null ? "sin cifra para medir el avance" : `avance ${pctText(r.pct)}, ${STANDING_LABEL[r.standing].toLowerCase()}`})`);
  }
  else parts.push(`meta 2026 sin número${i.target2026.trim() ? `: ${i.target2026.trim()}` : ""}`);
  const t28 = own ? (i.target2028Num !== null ? fig(i.target2028Num, i) : i.target2028.trim()) : target2028(data, r.programId, campusId, i);
  if (t28) parts.push(`meta 2028: ${t28}`);
  if (r.campuses > 1) parts.push(`sedes con cifra: ${r.reportedCampuses} de ${r.campuses}`);
  const others = peers.get(i.id) ?? [];
  if (others.length >= 2) {
    const m = median(others);
    if (m !== null) parts.push(`avance mediano de los ${others.length} programas que lo siguen: ${Math.round(m)} %`);
  }
  return parts.join("; ");
}

/** Una línea por indicador de un grupo de programas: cuántos lo siguen, cuántos cumplen y el reparto. */
function spreadLine(n: number, s: Spread, data: PortalData, institution = false): string {
  const i = s.indicator;
  const parts = [`[${n}] ${i.code} · ${i.name} (${DIRECTION[i.direction]}; eslabón ${STAGE_LABEL[i.stage].toLowerCase()})`];
  parts.push(`${s.adopters === 1 ? "lo sigue 1 programa" : `lo siguen ${s.adopters} programas`}, ${s.reported} con cifra`);
  if (s.withTarget) parts.push(`${s.met} de ${s.withTarget} cumplen la meta 2026`);
  if (s.box) {
    parts.push(`avance mediano ${Math.round(s.box.median)} %`);
    if (s.points.length >= 2) {
      const sorted = [...s.points].sort((a, b) => a.pct - b.pct);
      const low = sorted[0];
      const high = sorted[sorted.length - 1];
      parts.push(`el más alto, ${high.name} (${Math.round(high.pct)} %); el más bajo, ${low.name} (${Math.round(low.pct)} %)`);
    }
  }
  if (i.target2026Num !== null) parts.push(`meta 2026 de la ficha: ${fig(i.target2026Num, i)}`);
  if (i.target2028Num !== null) parts.push(`meta 2028 de la ficha: ${fig(i.target2028Num, i)}`);
  if (institution) {
    const global = globalFigure(data, i.id);
    if (global) parts.push(`cifra de la universidad ${global.year}: ${fig(global.valueNum, i)}`);
  }
  return parts.join("; ");
}

function spreadSource(n: number, s: Spread, standings: StandingsByProgram): ReportSource {
  const years = new Set<number>();
  for (const rows of standings.values()) for (const r of rows) if (r.indicator.id === s.indicator.id) r.trend.forEach((p) => years.add(p.year));
  const sorted = [...years].sort((a, b) => a - b);
  return sourceOf(n, s.indicator, yearsOf(sorted.map((year) => ({ year }))));
}

/** El avance de cada programa que sigue un indicador (toda la universidad): para comparar. */
function peerProgress(data: PortalData, programs: PortalProgram[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const rows of standingsOf(data, programs).values()) {
    for (const r of rows) if (r.pct !== null) out.set(r.indicator.id, [...(out.get(r.indicator.id) ?? []), r.pct]);
  }
  return out;
}

const programGroupLine = (name: string, rows: IndicatorStanding[]) => {
  const m = medianPct(rows);
  return `${name}: ${plural(rows.length, "indicador", "indicadores")} (${statesLine(rows) || "sin estado"})${m === null ? "" : `; avance mediano ${Math.round(m)} %`}.`;
};

function programPlan(data: PortalData, scope: ReportScope, limit: number): Omit<ReportPlan, "title" | "subtitle"> | null {
  const programs = programsOf(data);
  const program = programs.find((p) => p.id === scope.ref);
  if (!program) return null;
  const campus = scope.campusId ? data.campuses.find((c) => c.id === scope.campusId) : null;
  const catalog = programStandings(data, program.id, scope.campusId);
  const own = ownStandings(data, program.id, scope.campusId);
  const peers = peerProgress(data, programs);
  const parts: PlannedPart[] = [];
  for (const fn of FUNCTIONS) {
    const rows = sortByAttention([...catalog, ...own].filter((r) => r.indicator.fn === fn)).slice(0, limit);
    if (!rows.length) continue;
    const ownIds = new Set(own.map((r) => r.indicator.id));
    const lines = [
      `Programa: ${program.name}${program.faculty ? ` (${program.faculty.name})` : ""}. Sede: ${campus ? campus.name : "todas sus sedes (la cifra del programa es el promedio de la última cifra de cada sede)"}.`,
      `Función sustantiva: ${FUNCTION_LABEL[fn]}.`,
      HOW_TO_READ,
      `Estado: ${plural(rows.length, "indicador", "indicadores")}; ${statesLine(rows)}.${medianPct(rows) === null ? "" : ` Avance mediano: ${Math.round(medianPct(rows)!)} %.`}`,
      chainLine(rows.map((r) => r.indicator)),
      ...rows.map((r, k) => programLine(k + 1, r, data, scope.campusId, peers, ownIds.has(r.indicator.id))),
    ];
    parts.push({
      key: fn,
      kicker: `Capítulo ${parts.length + 1} · ${FUNCTION_LABEL[fn]}`,
      title: FUNCTION_LABEL[fn],
      facts: lines.join("\n"),
      figures: figuresOf(rows),
      bars: barsOf(rows),
      sources: rows.map((r, k) => sourceOf(k + 1, r.indicator, yearsOf(r.trend))),
    });
  }
  return { scope, unitName: program.name, cut: cutYear([...catalog, ...own]), parts };
}

/** Un capítulo de un grupo de programas (una facultad en una función, o toda la universidad). */
function groupPart(
  data: PortalData,
  key: string,
  kicker: string,
  title: string,
  intro: string[],
  programs: PortalProgram[],
  fn: SubstantiveFunction,
  limit: number,
  institution: boolean,
): PlannedPart | null {
  const standings = standingsOf(data, programs);
  for (const [id, list] of standings) standings.set(id, list.filter((r) => r.indicator.fn === fn));
  const all = [...standings.values()].flat();
  if (!all.length) return null;
  const names = new Map(programs.map((p) => [p.id, p.name]));
  const rows = spreads(standings, names).slice(0, limit);
  const following = programs.filter((p) => (standings.get(p.id) ?? []).length > 0);
  const lines = [
    ...intro,
    HOW_TO_READ,
    `Estado (programa × indicador): ${plural(all.length, "meta", "metas")}; ${statesLine(all)}.${medianPct(all) === null ? "" : ` Avance mediano: ${Math.round(medianPct(all)!)} %.`} ${plural(following.length, "programa sigue", "programas siguen")} indicadores de ${FUNCTION_LABEL[fn].toLowerCase()}.`,
    chainLine(rows.map((s) => s.indicator)),
    "Por programa:",
    ...following.slice(0, 16).map((p) => programGroupLine(p.name, standings.get(p.id) ?? [])),
    "Por indicador:",
    ...rows.map((s, k) => spreadLine(k + 1, s, data, institution)),
  ];
  const share = metShare(countStandings(all));
  return {
    key,
    kicker,
    title,
    facts: lines.join("\n"),
    figures: [
      { label: "Programas", value: `${following.length}`, note: `siguen indicadores de ${FUNCTION_LABEL[fn].toLowerCase()}` },
      { label: "Metas cumplidas", value: share === null ? "—" : `${share} %`, note: `de ${withTarget(countStandings(all))} con meta numérica`, tone: share !== null && share >= 50 ? "bien" : undefined },
      { label: "Rezagadas", value: `${countStandings(all).rezagada}`, note: `por debajo del ${LAGGING_BELOW} %`, tone: countStandings(all).rezagada > 0 ? "mal" : undefined },
    ],
    bars: rows
      .filter((s) => s.box)
      .slice(0, 10)
      .map((s) => ({
        code: s.indicator.code,
        name: s.indicator.name,
        pct: s.box ? Math.round(s.box.median) : null,
        standing: s.box ? (s.box.median >= 100 ? "cumplida" : s.box.median >= LAGGING_BELOW ? "en_camino" : "rezagada") : "sin_cifra",
      })),
    sources: rows.map((s, k) => spreadSource(k + 1, s, standings)),
  };
}

function facultyPlan(data: PortalData, scope: ReportScope, limit: number): Omit<ReportPlan, "title" | "subtitle"> | null {
  const faculty = data.units.find((u) => u.id === scope.ref && u.kind === "facultad");
  if (!faculty) return null;
  const programs = programsOf(data).filter((p) => p.faculty?.id === faculty.id);
  const parts: PlannedPart[] = [];
  for (const fn of FUNCTIONS) {
    const part = groupPart(
      data,
      fn,
      `Capítulo ${parts.length + 1} · ${FUNCTION_LABEL[fn]}`,
      FUNCTION_LABEL[fn],
      [`Facultad: ${faculty.name}, con ${plural(programs.length, "programa", "programas")}.`, `Función sustantiva: ${FUNCTION_LABEL[fn]}.`],
      programs,
      fn,
      limit,
      false,
    );
    if (part) parts.push(part);
  }
  const cut = cutYear(programs.flatMap((p) => programStandings(data, p.id)));
  return { scope, unitName: faculty.name, cut, parts };
}

function vicerrectoriaPlan(data: PortalData, scope: ReportScope, limit: number): Omit<ReportPlan, "title" | "subtitle"> | null {
  const fn = FUNCTIONS.find((f) => f === scope.ref);
  if (!fn) return null;
  const vr = data.units.find((u) => u.kind === "vicerrectoria" && data.unitFunctions.some((f) => f.unitId === u.id && f.fn === fn));
  const unitName = vr?.name ?? `Vicerrectoría de ${FUNCTION_LABEL[fn]}`;
  const programs = programsOf(data);
  const parts: PlannedPart[] = [];
  const catalog = data.indicators.filter((i) => i.fn === fn);
  const panorama = groupPart(
    data,
    "panorama",
    `Capítulo 1 · ${FUNCTION_LABEL[fn]}`,
    "Panorama de la función",
    [`${unitName}: función sustantiva de ${FUNCTION_LABEL[fn].toLowerCase()}, en toda la universidad.`, `Catálogo de la función: ${plural(catalog.length, "ficha publicada", "fichas publicadas")}.`],
    programs,
    fn,
    limit,
    true,
  );
  if (panorama) parts.push(panorama);
  // Un capítulo por facultad, de la que más programas siguen la función a la que menos (hasta ocho).
  const faculties = new Map<string, { name: string; programs: PortalProgram[] }>();
  for (const p of programs) {
    if (!p.faculty) continue;
    const entry = faculties.get(p.faculty.id) ?? { name: p.faculty.name, programs: [] };
    entry.programs.push(p);
    faculties.set(p.faculty.id, entry);
  }
  const following = (list: PortalProgram[]) => list.filter((p) => programStandings(data, p.id).some((r) => r.indicator.fn === fn)).length;
  const ranked = [...faculties.entries()]
    .map(([id, f]) => ({ id, ...f, n: following(f.programs) }))
    .filter((f) => f.n > 0)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "es"))
    .slice(0, 8);
  for (const f of ranked) {
    const part = groupPart(
      data,
      f.id,
      `Capítulo ${parts.length + 1} · ${FUNCTION_LABEL[fn]}`,
      f.name,
      [`${f.name}: sus programas en la función de ${FUNCTION_LABEL[fn].toLowerCase()}.`],
      f.programs,
      fn,
      Math.min(limit, 12),
      false,
    );
    if (part) parts.push(part);
  }
  const cut = cutYear(programs.flatMap((p) => programStandings(data, p.id).filter((r) => r.indicator.fn === fn)));
  return { scope, unitName, cut, parts };
}

/** El plan del informe: sus capítulos, con las cifras que lee la IA. Null si la unidad no existe. */
export function reportPlan(data: PortalData, scope: ReportScope, limit: number): ReportPlan | null {
  const base = scope.kind === "programa" ? programPlan(data, scope, limit) : scope.kind === "facultad" ? facultyPlan(data, scope, limit) : vicerrectoriaPlan(data, scope, limit);
  if (!base) return null;
  const campus = scope.kind === "programa" && scope.campusId ? data.campuses.find((c) => c.id === scope.campusId)?.name : null;
  const where = scope.kind === "programa" ? campus ?? "Todas las sedes" : scope.kind === "facultad" ? "Todos sus programas" : "Toda la universidad";
  return {
    ...base,
    title: `Informe de impacto · ${base.unitName}`,
    subtitle: [KIND_LABEL[scope.kind], where, base.cut ? `Corte ${base.cut}` : "Sin cifras aún"].join(" · "),
  };
}

/* --- Lo guardado --------------------------------------------------------------------- */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const strings = (v: unknown, max: number, len: number) =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.slice(0, len)).slice(0, max);
const objects = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");

function chapterOf(raw: unknown): AnalysisChapter | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const paragraphs = strings(c.paragraphs, 12, 4000);
  if (!paragraphs.length && !str(c.summary, 1)) return null;
  return {
    summary: str(c.summary, 600),
    paragraphs,
    alerts: strings(c.alerts, 6, 600),
    recommendations: strings(c.recommendations, 8, 600),
    unknown: strings(c.unknown, 40, 40),
    model: str(c.model, 120),
    at: str(c.at, 40),
  };
}

const STANDING_IDS: Standing[] = ["rezagada", "sin_cifra", "en_camino", "cumplida", "sin_meta"];

/** Lo guardado nunca se da por bueno: se revisa campo por campo. Null si no es un informe. */
export function normalizeDoc(raw: unknown): ReportDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const s = (d.scope ?? {}) as Record<string, unknown>;
  const kind = (["programa", "facultad", "vicerrectoria"] as const).find((k) => k === s.kind);
  if (!kind || typeof s.ref !== "string") return null;
  const b = (d.brief ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, ids: readonly T[], def: T): T => (ids.includes(v as T) ? (v as T) : def);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    version: 1,
    scope: { kind, ref: s.ref, campusId: typeof s.campusId === "string" ? s.campusId : null },
    unitName: str(d.unitName, 200),
    title: str(d.title, 200) || "Informe de impacto",
    subtitle: str(d.subtitle, 200),
    cut: num(d.cut),
    brief: {
      format: pick(b.format, ["ejecutivo", "tecnico", "sedes", "tendencias", "libre"] as const, "ejecutivo"),
      audience: str(b.audience, 80),
      tone: pick(b.tone, ["institucional", "divulgativo", "tecnico"] as const, "institucional"),
      length: pick(b.length, ["breve", "estandar", "extenso"] as const, "estandar"),
      alerts: b.alerts !== false,
      recommendations: b.recommendations !== false,
      method: b.method === true,
      prompt: str(b.prompt, 1200),
    },
    pdi: d.pdi === true,
    parts: objects(d.parts).map((p, k) => ({
      key: str(p.key, 80) || `parte-${k}`,
      kicker: str(p.kicker, 120),
      title: str(p.title, 200),
      figures: objects(p.figures)
        .slice(0, 4)
        .map((f) => ({ label: str(f.label, 60), value: str(f.value, 20), note: str(f.note, 120), tone: f.tone === "bien" || f.tone === "mal" ? f.tone : undefined })),
      bars: objects(p.bars)
        .slice(0, 12)
        .map((x) => ({ code: str(x.code, 30), name: str(x.name, 200), pct: num(x.pct), standing: pick(x.standing, STANDING_IDS, "sin_cifra") })),
      sources: objects(p.sources)
        .slice(0, 40)
        .map((x, i) => ({ n: num(x.n) ?? i + 1, code: str(x.code, 30), name: str(x.name, 200), source: str(x.source, 200), years: str(x.years, 20) })),
      chapter: chapterOf(p.chapter),
    })),
    closing: chapterOf(d.closing),
    createdAt: str(d.createdAt, 40),
  };
}

/** El nombre del documento que se le da a la IA. */
export const docName = (plan: Pick<ReportPlan, "unitName">) => `Informe de impacto de ${plan.unitName}`;
