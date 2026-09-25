/* =============================================================================
   Boletín de Impacto · lo que dice cada boletín.

   Dos boletines, con las mismas cuentas del Portal de Impacto (standing.ts)
   para que el PDF y la página nunca digan cosas distintas:

   - De una vicerrectoría (una función): sus indicadores con la cifra de la
     UDES frente a la meta, el cumplimiento de sus programas por facultad, el
     reparto de los programas en cada indicador y el avance por facultad.
   - De un programa: sus fichas institucionales y, aparte, sus indicadores
     propios; su estado, su cadena, el avance indicador por indicador y su
     mapa de red.

   Cada uno arma también las secciones que se le pasan a Mr. Pilo con IA
   (texto plano con las cifras del boletín: la IA solo puede usar esas) y la
   lectura sin IA que se muestra si la IA no está disponible.
   ========================================================================== */

import { FUNCTIONS, FUNCTION_LABEL, STAGE_LABEL, formatFigure, progress } from "../model";
import type { SubstantiveFunction } from "../model";
import type { Section } from "../../../components/pilo/ai/logic";
import { globalFigure, programsOf } from "../portal/analysis";
import type { PiloNote, PortalProgram } from "../portal/analysis";
import type { PortalData, PortalIndicator } from "../portal/data";
import { layoutNetwork, programNetwork } from "../portal/network";
import {
  STANDING_LABEL,
  countStandings,
  cutYear,
  gridOf,
  groupStandingNote,
  median,
  metShare,
  ownStandings,
  programStandingNote,
  programStandings,
  spreads,
  stageCounts,
  standingOf,
  standingsOf,
  withTarget,
} from "../portal/standing";
import type { GridCell, IndicatorStanding, Spread, Standing, StandingCounts } from "../portal/standing";

export const BULLETIN_TITLE = "Boletín de Seguimiento - Impacto Institucional UDES 2024-2028";
export const BULLETIN_OFFICE = "Oficina de Planeación Institucional";

export const today = (d = new Date()) => d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

const fig = (value: number | null, i: Pick<PortalIndicator, "measure">) => (value === null ? "sin cifra" : formatFigure(Math.round(value * 100) / 100, i.measure));
const pctText = (n: number | null) => (n === null ? "sin avance" : `${Math.round(n)} %`);

/* --- Vicerrectoría ---------------------------------------------------------------------- */

export interface InstitutionRow {
  indicator: PortalIndicator;
  value: number | null;
  year: number | null;
  target: number | null;
  pct: number | null;
  standing: Standing;
  spread: Spread | null;
  /** % de los programas con meta que ya la cumplen. */
  share: number | null;
}

export interface FacultyRow {
  key: string;
  name: string;
  programs: number;
  counts: StandingCounts;
  total?: boolean;
}

export interface VicerrectoriaBulletin {
  fn: SubstantiveFunction;
  unitName: string;
  cut: number | null;
  kpis: {
    indicators: number;
    chosen: number;
    adopting: number;
    reporting: number;
    pending: number;
    counts: StandingCounts;
    udesMet: string[];
    udesMeasured: number;
  };
  table: InstitutionRow[];
  faculties: FacultyRow[];
  boxes: Spread[];
  callouts: { even: Spread | null; wide: Spread | null; unreported: Spread | null };
  heat: { cols: string[]; rows: { indicator: PortalIndicator; cells: GridCell[] }[] };
  note: PiloNote;
  sections: Section[];
}

export function vicerrectoriaBulletin(data: PortalData, fn: SubstantiveFunction): VicerrectoriaBulletin {
  const programs = programsOf(data);
  const standings = standingsOf(data, programs);
  for (const [id, list] of standings) standings.set(id, list.filter((r) => r.indicator.fn === fn));
  const names = new Map(programs.map((p) => [p.id, p.name]));
  const spreadRows = spreads(standings, names);
  const spreadOf = new Map(spreadRows.map((s) => [s.indicator.id, s]));
  const adopting = programs.filter((p) => (standings.get(p.id) ?? []).length > 0);
  const all = adopting.flatMap((p) => standings.get(p.id) ?? []);
  const counts = countStandings(all);

  const table: InstitutionRow[] = data.indicators
    .filter((i) => i.fn === fn)
    .map((i) => {
      const v = globalFigure(data, i.id);
      const value = v?.valueNum ?? null;
      const pct = progress(value, i.target2026Num, i.direction);
      const spread = spreadOf.get(i.id) ?? null;
      return {
        indicator: i,
        value,
        year: v?.year ?? null,
        target: i.target2026Num,
        pct,
        standing: standingOf(pct, i.target2026Num !== null),
        spread,
        share: spread && spread.withTarget ? Math.round((spread.met / spread.withTarget) * 100) : null,
      };
    })
    .sort((a, b) => a.indicator.code.localeCompare(b.indicator.code, "es", { numeric: true }));

  const groups = new Map<string, { key: string; name: string; programs: PortalProgram[] }>();
  for (const p of adopting) {
    const key = p.faculty?.id ?? "sin";
    const g = groups.get(key) ?? { key, name: p.faculty?.name ?? "Sin facultad", programs: [] };
    g.programs.push(p);
    groups.set(key, g);
  }
  const perFaculty = [...groups.values()]
    .map((g) => ({ ...g, counts: countStandings(g.programs.flatMap((p) => standings.get(p.id) ?? [])) }))
    .sort((a, b) => (metShare(b.counts) ?? -1) - (metShare(a.counts) ?? -1) || a.name.localeCompare(b.name, "es"));

  const boxes = spreadRows.filter((s) => s.adopters > 0).sort((a, b) => a.indicator.code.localeCompare(b.indicator.code, "es", { numeric: true }));
  const spreadable = boxes.filter((s) => s.box && s.reported >= 3);
  const range = (s: Spread) => (s.box ? s.box.q3 - s.box.q1 : 0);
  const even = [...spreadable].sort((a, b) => range(a) - range(b))[0] ?? null;
  const wide = [...spreadable].sort((a, b) => (b.box!.max - b.box!.min) - (a.box!.max - a.box!.min))[0] ?? null;
  const unreported = boxes.filter((s) => s.reported < 2).sort((a, b) => b.adopters - a.adopters)[0] ?? null;

  const udesWith = table.filter((r) => r.pct !== null);
  const udesMet = udesWith.filter((r) => r.standing === "cumplida").map((r) => r.indicator.name);
  const unitName =
    data.units.find((u) => u.kind === "vicerrectoria" && data.unitFunctions.some((f) => f.unitId === u.id && f.fn === fn))?.name ??
    `Vicerrectoría de ${FUNCTION_LABEL[fn]}`;

  const sections: Section[] = [
    {
      title: `Indicadores de ${FUNCTION_LABEL[fn]}: cifra de la UDES frente a la meta 2026`,
      kind: "tabla",
      text: table
        .map(
          (r) =>
            `${r.indicator.code} ${r.indicator.name} (${STAGE_LABEL[r.indicator.stage]}): cifra UDES ${fig(r.value, r.indicator)}${r.year ? ` (${r.year})` : ""}; meta 2026 ${r.indicator.target2026 || "sin número"}; avance ${pctText(r.pct)}; ${STANDING_LABEL[r.standing].toLowerCase()}; ${r.spread?.adopters ?? 0} programas lo eligieron${r.share !== null ? `; ${r.share} % de ellos cumple su meta` : ""}.`,
        )
        .join("\n"),
    },
    {
      title: "Cumplimiento de los programas por facultad",
      kind: "tabla",
      text: perFaculty
        .map(
          (g) =>
            `${g.name}: ${g.programs.length} programas; ${g.counts.cumplida} cumplidas, ${g.counts.en_camino} en camino, ${g.counts.rezagada} rezagadas, ${g.counts.sin_cifra} sin cifra; cumple el ${metShare(g.counts) ?? 0} % de sus metas.`,
        )
        .join("\n"),
    },
    {
      title: "Reparto de los programas en cada indicador",
      kind: "tabla",
      text: boxes
        .map((s) =>
          s.box
            ? `${s.indicator.code} ${s.indicator.name}: ${s.reported} de ${s.adopters} programas con cifra; el más bajo ${Math.round(s.box.min)} %, mediana ${Math.round(s.box.median)} %, el más alto ${Math.round(s.box.max)} %; ${s.met} de ${s.withTarget} cumplen.`
            : `${s.indicator.code} ${s.indicator.name}: ${s.reported} de ${s.adopters} programas con cifra.`,
        )
        .join("\n"),
    },
  ];

  return {
    fn,
    unitName,
    cut: cutYear([...table, ...all]),
    kpis: {
      indicators: table.length,
      chosen: boxes.length,
      adopting: adopting.length,
      reporting: adopting.filter((p) => (standings.get(p.id) ?? []).some((r) => r.value !== null)).length,
      pending: counts.sin_cifra,
      counts,
      udesMet,
      udesMeasured: udesWith.length,
    },
    table,
    faculties: [
      { key: "total", name: "Toda la UDES", programs: adopting.length, counts, total: true },
      ...perFaculty.map((g) => ({ key: g.key, name: g.name, programs: g.programs.length, counts: g.counts })),
    ],
    boxes,
    callouts: { even, wide, unreported },
    heat: {
      cols: perFaculty.map((g) => g.name),
      rows: boxes.map((s) => ({ indicator: s.indicator, cells: perFaculty.map((g) => gridOf(g.programs.flatMap((p) => standings.get(p.id) ?? []), [s.indicator.id])[0]) })),
    },
    note: groupStandingNote(spreadRows, perFaculty.map((g) => ({ name: g.name, counts: g.counts })), FUNCTION_LABEL[fn]),
    sections,
  };
}

/* --- Programa --------------------------------------------------------------------------- */

export interface ProgramBulletin {
  program: PortalProgram;
  campusName: string | null;
  campusNames: string[];
  cut: number | null;
  institutional: IndicatorStanding[];
  own: IndicatorStanding[];
  counts: StandingCounts;
  ownCounts: StandingCounts;
  allCounts: StandingCounts;
  median: number | null;
  facultyMedian: number | null;
  stages: ReturnType<typeof stageCounts>;
  byFn: { fn: SubstantiveFunction; counts: StandingCounts; total: number }[];
  network: ReturnType<typeof programNetwork>;
  layout: ReturnType<typeof layoutNetwork>;
  note: PiloNote;
  sections: Section[];
}

export function programBulletin(data: PortalData, program: PortalProgram, campusId: string | null): ProgramBulletin {
  const institutional = programStandings(data, program.id, campusId);
  const own = ownStandings(data, program.id, campusId);
  const everything = [...institutional, ...own];
  const counts = countStandings(institutional);
  const pcts = (rows: IndicatorStanding[]) => rows.map((r) => r.pct).filter((p): p is number => p !== null);
  const siblings = programsOf(data).filter((p) => p.faculty && p.faculty.id === program.faculty?.id);
  const facultyRows = siblings.flatMap((p) => programStandings(data, p.id, campusId));
  const network = programNetwork(data, program.id, campusId);
  const campus = data.campuses.find((c) => c.id === campusId) ?? null;

  const line = (r: IndicatorStanding) =>
    `${r.indicator.code} ${r.indicator.name} (${FUNCTION_LABEL[r.indicator.fn]}, ${STAGE_LABEL[r.indicator.stage]}): cifra ${fig(r.value, r.indicator)}${r.year ? ` (${r.year})` : ""}; meta 2026 ${r.target === null ? "sin número" : fig(r.target, r.indicator)}; avance ${pctText(r.pct)}; ${STANDING_LABEL[r.standing].toLowerCase()}.`;
  const sections: Section[] = [
    { title: `Fichas institucionales que sigue ${program.name}`, kind: "tabla", text: institutional.map(line).join("\n") },
    ...(own.length ? [{ title: `Indicadores propios de ${program.name}`, kind: "tabla" as const, text: own.map(line).join("\n") }] : []),
    {
      title: "Resumen del programa",
      kind: "texto",
      text: [
        `Cumple ${counts.cumplida} de ${withTarget(counts)} metas institucionales con número; ${counts.rezagada} rezagadas y ${counts.sin_cifra} sin cifra.`,
        `Avance mediano del programa: ${pctText(median(pcts(institutional)))}; de su facultad: ${pctText(median(pcts(facultyRows)))}.`,
        ...FUNCTIONS.map((f) => `${FUNCTION_LABEL[f]}: ${institutional.filter((r) => r.indicator.fn === f).length} indicadores.`),
        `Mapa de red: ${network.nodes.length} indicadores, ${network.edges.filter((e) => e.cross).length} conexiones entre funciones por pilares y ODS compartidos.`,
      ].join("\n"),
    },
  ];

  return {
    program,
    campusName: campus?.name ?? null,
    campusNames: data.campuses.filter((c) => program.campusIds.includes(c.id)).map((c) => c.name),
    cut: cutYear(everything),
    institutional,
    own,
    counts,
    ownCounts: countStandings(own),
    allCounts: countStandings(everything),
    median: median(pcts(institutional)),
    facultyMedian: median(pcts(facultyRows)),
    stages: stageCounts(everything),
    byFn: FUNCTIONS.map((f) => {
      const rows = everything.filter((r) => r.indicator.fn === f);
      return { fn: f, counts: countStandings(rows), total: rows.length };
    }),
    network,
    layout: layoutNetwork(network.nodes),
    note: programStandingNote(program.name, institutional),
    sections,
  };
}
