/* =============================================================================
   Impacto · la hoja de la herramienta anterior, leída para la intranet.

   El Apps Script de «SeguimientoImpacto_UDES» entrega cuatro hojas:

     Datos                 una fila por ficha (E17…): línea base, metas y
                           valores 2026/2028 que capturan las vicerrectorías.
     Indicadores_Programa  lo que sigue cada programa en su sede (P_BACVLL_001),
                           colgado de una ficha institucional (id_padre). Si
                           copia la ficha, es una adopción; si tiene nombre
                           propio, un indicador del programa (0084). Las filas
                           «eliminado» no entran.
     Resultados_Programa   la cifra de cada indicador de programa por año.
     Programas             el catálogo de programas y sedes. Trae una columna
                           «clave» con contraseñas: se descarta al leer.

   Aquí no se escribe nada. `buildPlan` compara la hoja con lo que ya hay y
   dice qué entra, qué cambia, qué es igual y qué necesita que alguien
   decida. Lo que se decide va en `Resolutions`; `toBatch` arma el lote que
   aplica imp_sync_apply (0083).

   Regla de conflicto: si un campo ya tiene otro valor en la intranet y nadie
   lo tocó aquí desde la última sincronización, gana la hoja. Si alguien lo
   editó aquí después (o nunca se ha sincronizado), se pregunta, y por
   omisión se conserva lo de la intranet.
   ========================================================================== */

import { parseFigure, parseTarget } from "../model";

/* --- Lo que llega de la hoja ---------------------------------------------------- */

type Cell = string | number | null | undefined;

export interface LegacyDatum {
  id: string;
  funcion?: Cell;
  lb?: Cell;
  va26?: Cell;
  va28?: Cell;
  m26?: Cell;
  m28?: Cell;
  estado?: Cell;
  observaciones?: Cell;
}

export interface LegacyProgramIndicator {
  id: string;
  id_padre: Cell;
  funcion?: Cell;
  niv?: Cell;
  programa: Cell;
  sede: Cell;
  nombre?: Cell;
  desc?: Cell;
  und?: Cell;
  estado?: Cell;
  lb?: Cell;
  lb2021?: Cell;
  m26?: Cell;
  va26?: Cell;
  m28?: Cell;
  va28?: Cell;
}

export interface LegacyResult {
  id_indicador: Cell;
  anio: Cell;
  num?: Cell;
  prop?: Cell;
  na?: Cell;
}

export interface LegacyProgram {
  codigo: Cell;
  nombre_programa?: Cell;
  sede?: Cell;
}

export interface LegacyPayload {
  data: LegacyDatum[];
  data_programa: LegacyProgramIndicator[];
  data_resultados: LegacyResult[];
  programas: LegacyProgram[];
}

const text = (c: Cell) => (c === null || c === undefined ? "" : String(c).trim());

/** Lo que responde el Apps Script, ya sin contraseñas. Lanza si no es la hoja esperada. */
export function readPayload(raw: unknown): LegacyPayload {
  if (!raw || typeof raw !== "object") throw new Error("La hoja no respondió con datos.");
  const body = raw as Record<string, unknown>;
  if (body.ok === false) throw new Error(`El Apps Script respondió con un error: ${text(body.error as Cell) || "sin detalle"}.`);
  const list = <T>(key: string): T[] => (Array.isArray(body[key]) ? (body[key] as T[]) : []);
  if (!Array.isArray(body.data)) throw new Error("La respuesta no trae la hoja «Datos». ¿Es la implementación correcta?");
  return {
    data: list<LegacyDatum>("data"),
    data_programa: list<LegacyProgramIndicator>("data_programa"),
    data_resultados: list<LegacyResult>("data_resultados"),
    // La columna «clave» (contraseñas) no pasa de aquí.
    programas: list<Record<string, Cell>>("programas").map((p) => ({
      codigo: p.codigo,
      nombre_programa: p.nombre_programa,
      sede: p.sede,
    })),
  };
}

/* --- Lo que ya hay en la intranet --------------------------------------------- */

export interface SyncIndicator {
  id: string;
  code: string;
  name: string;
  status: string;
  baselineText: string;
  target2026: string;
  target2028: string;
  updatedAt: string;
}

export interface SyncAdoption {
  indicatorId: string;
  programId: string;
  campusId: string;
  active: boolean;
  baselineText: string;
  target2026: string;
  target2028: string;
  updatedAt: string;
}

export interface SyncValue {
  indicatorId: string;
  year: number;
  programId: string | null;
  campusId: string | null;
  valueNum: number | null;
  valueText: string;
  notApplicable: boolean;
  updatedAt: string;
}

/** Un indicador propio de programa que ya entró de la hoja (por su id en ella). */
export interface SyncProgramIndicator {
  id: string;
  legacyId: string;
  name: string;
  baselineText: string;
  target2026: string;
  target2028: string;
  updatedAt: string;
}

export interface SyncContext {
  indicators: SyncIndicator[];
  /** Los indicadores de programa que ya vinieron de la hoja. */
  programIndicators?: SyncProgramIndicator[];
  programs: { id: string; name: string }[];
  campuses: { id: string; name: string; slug: string }[];
  offer: { programId: string; campusId: string }[];
  adoptions: SyncAdoption[];
  values: SyncValue[];
  legacyMap: { code: string; programId: string; campusId: string }[];
  /** Cuándo se aplicó la última sincronización; null si nunca. */
  lastRunAt: string | null;
}

/* --- Lo que se decide --------------------------------------------------------- */

export const OMIT = "omitir";
export const KEEP = "intranet";
export const TAKE = "hoja";

export interface Resolutions {
  /** Código de programa de la hoja → "programId|campusId" u OMIT. */
  programs: Record<string, string>;
  /** Indicador de programa con padre desconocido → código de ficha u OMIT. */
  parents: Record<string, string>;
  /** Dos indicadores de programa con el mismo padre en la misma sede → el que gana, u OMIT. */
  duplicates: Record<string, string>;
  /** Campo en conflicto → KEEP o TAKE. */
  conflicts: Record<string, string>;
}

export const emptyResolutions = (): Resolutions => ({ programs: {}, parents: {}, duplicates: {}, conflicts: {} });

/* --- El plan ------------------------------------------------------------------- */

export type SheetName = "Datos" | "Indicadores_Programa" | "Resultados_Programa" | "Programas";
export type ChangeKind = "nueva" | "cambia" | "igual";

export interface IssueOption {
  value: string;
  label: string;
}

export interface Issue {
  key: string;
  kind: "programa" | "padre" | "duplicado" | "conflicto";
  sheet: SheetName;
  resolutionGroup: keyof Resolutions;
  title: string;
  detail: string;
  options: IssueOption[];
  /** La elección vigente: la guardada, o la de omisión. */
  value: string;
}

export interface SheetSummary {
  sheet: SheetName;
  target: string;
  rows: number;
  nuevas: number;
  cambian: number;
  iguales: number;
  revisar: number;
  omitidas: number;
}

interface TargetFields {
  baseline_text?: string;
  baseline_num?: number | null;
  target_2026?: string;
  target_2026_num?: number | null;
  target_2028?: string;
  target_2028_num?: number | null;
}

export interface IndicatorChange extends TargetFields {
  code: string;
}

export interface AdoptionChange extends TargetFields {
  indicator_code: string;
  program_id: string;
  campus_id: string;
}

export interface ProgramIndicatorChange extends TargetFields {
  legacy_id: string;
  program_id: string;
  campus_id: string;
  fn: "investigacion" | "ensenanza" | "extension";
  stage: "insumos" | "procesos" | "productos" | "impacto";
  name: string;
  description: string;
  unit_label: string;
  measure: string;
  parent_code: string | null;
}

export interface ValueChange {
  /** La ficha por su código, o el indicador de programa por su id en la hoja. */
  indicator_code?: string;
  legacy_id?: string;
  year: number;
  program_id: string | null;
  campus_id: string | null;
  value_num: number | null;
  value_text: string;
  not_applicable: boolean;
  note: string;
}

export interface Omission {
  sheet: SheetName;
  row: string;
  reason: string;
}

export interface SyncPlan {
  sheets: SheetSummary[];
  issues: Issue[];
  omissions: Omission[];
  programs: { code: string; program_id: string; campus_id: string; name: string }[];
  indicators: IndicatorChange[];
  /** Indicadores propios de los programas (0084). */
  programIndicators: ProgramIndicatorChange[];
  adoptions: AdoptionChange[];
  values: ValueChange[];
}

/* --- Ayudas -------------------------------------------------------------------- */

/** Minúsculas, sin tildes y con un solo espacio: «BUCARAMANGA» = «Bucaramanga». */
export const normalize = (value: Cell) =>
  text(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const same = (a: string, b: string) => {
  if (a.trim() === b.trim()) return true;
  const na = parseFigure(a);
  const nb = parseFigure(b);
  return na !== null && nb !== null && Math.abs(na - nb) < 1e-9;
};

const after = (stamp: string, reference: string | null) => !reference || new Date(stamp).getTime() > new Date(reference).getTime();

const FIELDS: { sheet: "lb" | "m26" | "m28"; column: "baseline_text" | "target_2026" | "target_2028"; model: "baselineText" | "target2026" | "target2028"; label: string }[] = [
  { sheet: "lb", column: "baseline_text", model: "baselineText", label: "Línea base" },
  { sheet: "m26", column: "target_2026", model: "target2026", label: "Meta 2026" },
  { sheet: "m28", column: "target_2028", model: "target2028", label: "Meta 2028" },
];

/** El número de una línea base o una meta escrita como texto. */
const numberOf = (column: (typeof FIELDS)[number]["column"], value: string) =>
  column === "baseline_text" ? parseFigure(value) ?? parseTarget(value) : parseTarget(value);

/** El campo numérico que acompaña a cada texto. */
const numericOf = (column: (typeof FIELDS)[number]["column"]) =>
  (column === "baseline_text" ? "baseline_num" : `${column}_num`) as keyof TargetFields;

/** La cifra de una celda: número, texto o «no aplica». Null si está vacía. */
function readFigure(num: Cell, prop?: Cell, na?: Cell): Omit<ValueChange, "indicator_code" | "year" | "program_id" | "campus_id"> | null {
  if (text(na) === "1" || normalize(na) === "si" || normalize(na) === "true") {
    return { value_num: null, value_text: "", not_applicable: true, note: "" };
  }
  const main = text(num);
  const share = text(prop);
  if (!main && !share) return null;
  const source = main || share;
  const parsed = parseFigure(source);
  return {
    value_num: parsed,
    value_text: parsed === null ? source : "",
    not_applicable: false,
    note: main && share ? `Proporción en la hoja anterior: ${share}` : "",
  };
}

const FN_OF: Record<string, ProgramIndicatorChange["fn"]> = { INV: "investigacion", ENS: "ensenanza", EXT: "extension" };
const FN_OF_CODE: Record<string, ProgramIndicatorChange["fn"]> = { I: "investigacion", E: "ensenanza", X: "extension" };

function stageOf(niv: Cell): ProgramIndicatorChange["stage"] | null {
  const n = normalize(niv);
  if (n.startsWith("insumo")) return "insumos";
  if (n.startsWith("proceso")) return "procesos";
  if (n.startsWith("producto")) return "productos";
  if (n.startsWith("impacto") || n.startsWith("resultado")) return "impacto";
  return null;
}

/** La forma de medir desde la unidad que escribió el programa. */
export function measureOf(und: Cell): string {
  const u = normalize(und);
  if (u.includes("numero") && u.includes("proporcion")) return "dual";
  if (u.includes("proporcion")) return "proporcion";
  if (u.includes("porcentaje") || text(und).includes("%")) return "porcentaje";
  if (u.includes("pesos") || text(und).includes("$")) return "pesos";
  return "numero";
}

/** ¿El indicador del programa es la ficha misma, copiada con su nombre? */
function sameIndicator(a: string, b: string): boolean {
  const wa = new Set(normalize(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(normalize(b).split(" ").filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return false;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / (wa.size + wb.size - common) >= 0.8;
}

/* --- Reconocer los programas ------------------------------------------------- */

interface LegacySite {
  code: string;
  prefix: string;
  name: string;
  sede: string;
}

/** Todos los programa × sede que menciona la hoja, con su código («BAC-VLL»). */
function legacySites(payload: LegacyPayload): Map<string, LegacySite> {
  const byKey = new Map<string, LegacySite>();
  for (const p of payload.programas) {
    const code = text(p.codigo).toUpperCase();
    if (!code) continue;
    const prefix = code.split("-")[0];
    byKey.set(`${normalize(prefix)}|${normalize(p.sede)}`, { code, prefix, name: text(p.nombre_programa), sede: text(p.sede) });
  }
  return byKey;
}

function siteOf(sites: Map<string, LegacySite>, programa: Cell, sede: Cell): LegacySite {
  const key = `${normalize(programa)}|${normalize(sede)}`;
  const known = sites.get(key);
  if (known) return known;
  const prefix = text(programa).toUpperCase();
  // El mismo programa puede aparecer en otra sede de la hoja Programas: su nombre sirve para reconocerlo aquí.
  const sibling = [...sites.values()].find((x) => normalize(x.prefix) === normalize(prefix));
  const site = { code: `${prefix}-${normalize(sede).toUpperCase().replace(/ /g, "")}`, prefix, name: sibling?.name ?? prefix, sede: text(sede) };
  sites.set(key, site);
  return site;
}

/* --- El plan ------------------------------------------------------------------- */

export function buildPlan(payload: LegacyPayload, ctx: SyncContext, resolutions: Resolutions = emptyResolutions()): SyncPlan {
  const issues: Issue[] = [];
  const omissions: Omission[] = [];
  const indicatorByCode = new Map(ctx.indicators.map((i) => [i.code.toUpperCase(), i]));
  const campusByName = new Map<string, string>();
  for (const c of ctx.campuses) {
    campusByName.set(normalize(c.name), c.id);
    campusByName.set(normalize(c.slug), c.id);
  }
  const programName = new Map(ctx.programs.map((p) => [p.id, p.name]));
  const campusName = new Map(ctx.campuses.map((c) => [c.id, c.name]));
  const offerLabel = (o: { programId: string; campusId: string }) =>
    `${programName.get(o.programId) ?? "Programa"} · ${campusName.get(o.campusId) ?? "Sede"}`;
  const summary = (sheet: SheetName, target: string, rows: number): SheetSummary => ({
    sheet, target, rows, nuevas: 0, cambian: 0, iguales: 0, revisar: 0, omitidas: 0,
  });
  const sheets: Record<SheetName, SheetSummary> = {
    Datos: summary("Datos", "Línea base, metas y cifra global de cada ficha", payload.data.length),
    Indicadores_Programa: summary("Indicadores_Programa", "Fichas que sigue cada programa y sus indicadores propios, con sus metas", payload.data_programa.length),
    Resultados_Programa: summary("Resultados_Programa", "Cifras por programa, sede y año", payload.data_resultados.length),
    Programas: summary("Programas", "Solo para reconocer programa y sede (la columna «clave» no se copia)", payload.programas.length),
  };
  const count = (sheet: SheetName, kind: ChangeKind) => {
    const s = sheets[sheet];
    if (kind === "nueva") s.nuevas++;
    else if (kind === "cambia") s.cambian++;
    else s.iguales++;
  };
  const omit = (sheet: SheetName, row: string, reason: string) => {
    omissions.push({ sheet, row, reason });
    sheets[sheet].omitidas++;
  };
  const ask = (issue: Omit<Issue, "value">, fallback: string) => {
    const saved = resolutions[issue.resolutionGroup][issue.key];
    const value = saved && issue.options.some((o) => o.value === saved) ? saved : fallback;
    issues.push({ ...issue, value });
    sheets[issue.sheet].revisar++;
    return value;
  };

  /* Programas: código de la hoja → programa × sede de la intranet. */
  const sites = legacySites(payload);
  for (const p of payload.data_programa) siteOf(sites, p.programa, p.sede);
  const mapped = new Map(ctx.legacyMap.map((m) => [m.code.toUpperCase(), m]));
  const offered = new Set(ctx.offer.map((o) => `${o.programId}|${o.campusId}`));
  const usedCodes = new Set(payload.data_programa.map((p) => siteOf(sites, p.programa, p.sede).code));
  const siteByCode = new Map<string, { programId: string; campusId: string } | null>();
  const programRows: SyncPlan["programs"] = [];

  for (const site of new Set(sites.values())) {
    const known = mapped.get(site.code);
    if (known && offered.has(`${known.programId}|${known.campusId}`)) {
      siteByCode.set(site.code, { programId: known.programId, campusId: known.campusId });
      continue;
    }
    const campusId = campusByName.get(normalize(site.sede)) ?? null;
    const wanted = normalize(site.name);
    const atCampus = ctx.offer.filter((o) => !campusId || o.campusId === campusId);
    const exact = atCampus.filter((o) => normalize(programName.get(o.programId)) === wanted);
    if (exact.length === 1 && campusId) {
      const match = exact[0];
      siteByCode.set(site.code, match);
      programRows.push({ code: site.code, program_id: match.programId, campus_id: match.campusId, name: site.name });
      continue;
    }
    if (!usedCodes.has(site.code)) continue; // Sin datos en la hoja: no hace falta decidir nada.
    // Candidatos: los de esa sede, primero los que comparten palabras con el nombre.
    const words = new Set(wanted.split(" ").filter((w) => w.length > 3));
    const scored = atCampus
      .map((o) => ({ o, hits: normalize(programName.get(o.programId)).split(" ").filter((w) => words.has(w)).length }))
      .sort((a, b) => b.hits - a.hits || offerLabel(a.o).localeCompare(offerLabel(b.o), "es"));
    const options: IssueOption[] = [
      ...scored.map(({ o }) => ({ value: `${o.programId}|${o.campusId}`, label: offerLabel(o) })),
      { value: OMIT, label: "Omitir sus filas" },
    ];
    const choice = ask(
      {
        key: site.code,
        kind: "programa",
        sheet: "Programas",
        resolutionGroup: "programs",
        title: `${site.code} · «${site.name}» en ${site.sede || "sede sin nombre"}`,
        detail: campusId
          ? "No coincide con ningún programa de esa sede. Elija cuál es."
          : `La sede «${site.sede}» no coincide con ninguna de la intranet.`,
        options,
      },
      scored[0]?.hits ? options[0].value : OMIT,
    );
    if (choice === OMIT) {
      siteByCode.set(site.code, null);
    } else {
      const [programId, campus] = choice.split("|");
      siteByCode.set(site.code, { programId, campusId: campus });
      programRows.push({ code: site.code, program_id: programId, campus_id: campus, name: site.name });
    }
  }

  /* Datos: las fichas institucionales. */
  const indicatorChanges: IndicatorChange[] = [];
  const values: ValueChange[] = [];
  const valueIndex = new Map(
    ctx.values.map((v) => [`${v.indicatorId}|${v.year}|${v.programId ?? ""}|${v.campusId ?? ""}`, v]),
  );

  /** A qué indicador va una cifra: una ficha, o un indicador de programa (quizá aún sin crear). */
  type ValueTarget = { id: string | null; code: string; legacyId?: string };

  const planValue = (
    sheet: SheetName,
    rowLabel: string,
    indicator: ValueTarget,
    year: number,
    scope: { programId: string; campusId: string } | null,
    figure: ReturnType<typeof readFigure>,
  ) => {
    if (!figure) return;
    const existing = indicator.id ? valueIndex.get(`${indicator.id}|${year}|${scope?.programId ?? ""}|${scope?.campusId ?? ""}`) : undefined;
    const change: ValueChange = {
      ...(indicator.legacyId ? { legacy_id: indicator.legacyId } : { indicator_code: indicator.code }),
      year,
      program_id: scope?.programId ?? null,
      campus_id: scope?.campusId ?? null,
      ...figure,
    };
    const empty = !existing || (existing.valueNum === null && !existing.valueText && !existing.notApplicable);
    if (existing && !empty) {
      const equal =
        existing.notApplicable === figure.not_applicable &&
        (existing.valueNum ?? null) === (figure.value_num ?? null) &&
        existing.valueText === figure.value_text;
      const closeEnough =
        existing.valueNum !== null && figure.value_num !== null && Math.abs(existing.valueNum - figure.value_num) < 1e-9;
      if (equal || (closeEnough && existing.notApplicable === figure.not_applicable)) {
        count(sheet, "igual");
        return;
      }
      if (after(existing.updatedAt, ctx.lastRunAt)) {
        const shown = (v: { notApplicable?: boolean; not_applicable?: boolean; valueNum?: number | null; value_num?: number | null; valueText?: string; value_text?: string }) =>
          v.notApplicable || v.not_applicable ? "no aplica" : String(v.valueNum ?? v.value_num ?? (v.valueText || v.value_text || "vacío"));
        const decision = ask(
          {
            key: `cifra:${indicator.code}:${year}:${scope ? `${scope.programId}|${scope.campusId}` : "global"}`,
            kind: "conflicto",
            sheet,
            resolutionGroup: "conflicts",
            title: `${rowLabel} · ${year}`,
            detail: `La hoja dice ${shown(figure)} y la intranet ${shown(existing)}${ctx.lastRunAt ? " (editada aquí después de la última sincronización)" : ""}.`,
            options: [
              { value: KEEP, label: "Conservar la de la intranet" },
              { value: TAKE, label: "Usar la de la hoja" },
            ],
          },
          KEEP,
        );
        if (decision !== TAKE) return;
      }
      count(sheet, "cambia");
    } else {
      count(sheet, existing ? "cambia" : "nueva");
    }
    values.push(change);
  };

  /** Compara línea base y metas; devuelve los campos que entran. */
  const planTargets = (
    sheet: SheetName,
    rowLabel: string,
    keyPrefix: string,
    row: Record<string, Cell>,
    current: Pick<SyncIndicator, "baselineText" | "target2026" | "target2028" | "updatedAt"> | null,
  ): { fields: TargetFields; kind: ChangeKind | null } => {
    const fields: TargetFields = {};
    let changed = false;
    let seen = false;
    for (const f of FIELDS) {
      const incoming = text(row[f.sheet]);
      if (!incoming) continue;
      seen = true;
      const existing = current ? current[f.model] : "";
      if (existing && same(existing, incoming)) continue;
      if (existing && current && after(current.updatedAt, ctx.lastRunAt)) {
        const decision = ask(
          {
            key: `${keyPrefix}:${f.sheet}`,
            kind: "conflicto",
            sheet,
            resolutionGroup: "conflicts",
            title: `${rowLabel} · ${f.label}`,
            detail: `La hoja dice «${incoming}» y la intranet «${existing}».`,
            options: [
              { value: KEEP, label: "Conservar la de la intranet" },
              { value: TAKE, label: "Usar la de la hoja" },
            ],
          },
          KEEP,
        );
        if (decision !== TAKE) continue;
      }
      Object.assign(fields, { [f.column]: incoming, [numericOf(f.column)]: numberOf(f.column, incoming) });
      changed = true;
    }
    if (!seen) return { fields, kind: null };
    return { fields, kind: changed ? (current ? "cambia" : "nueva") : "igual" };
  };

  for (const row of payload.data) {
    const code = text(row.id).toUpperCase();
    const indicator = indicatorByCode.get(code);
    if (!indicator) {
      omit("Datos", code || "(sin id)", "La ficha no existe en el catálogo de la intranet.");
      continue;
    }
    const { fields, kind } = planTargets("Datos", `${code} · ${indicator.name}`, `ficha:${code}`, row as unknown as Record<string, Cell>, indicator);
    if (kind === "nueva" || kind === "cambia") indicatorChanges.push({ code, ...fields });
    if (kind) count("Datos", kind);
    planValue("Datos", `${code} · global`, indicator, 2026, null, readFigure(row.va26));
    planValue("Datos", `${code} · global`, indicator, 2028, null, readFigure(row.va28));
  }

  /* Indicadores_Programa: adopciones o indicadores propios.
     Si el indicador del programa es la ficha misma (su nombre es el de la ficha
     madre) y es el primero de esa ficha en esa sede, es una adopción. Si tiene
     nombre propio, repite madre o no la tiene, es un indicador propio del
     programa, relacionado con su madre cuando la hay. */
  const adoptionIndex = new Map(ctx.adoptions.map((a) => [`${a.indicatorId}|${a.programId}|${a.campusId}`, a]));
  const adoptionChanges: AdoptionChange[] = [];
  const programIndicatorChanges: ProgramIndicatorChange[] = [];
  const ownByLegacy = new Map((ctx.programIndicators ?? []).map((p) => [p.legacyId, p]));
  /** P_… → a qué indicador van sus cifras y en qué sede. */
  const programIndicators = new Map<string, { target: ValueTarget; site: { programId: string; campusId: string }; label: string }>();
  const usedSlots = new Set<string>();
  let deleted = 0;

  for (const row of payload.data_programa) {
    const id = text(row.id);
    if (normalize(row.estado) === "eliminado") {
      deleted++;
      sheets.Indicadores_Programa.omitidas++;
      continue;
    }
    const legacy = siteOf(sites, row.programa, row.sede);
    const site = siteByCode.get(legacy.code);
    if (!site) {
      omit("Indicadores_Programa", id, `El programa ${legacy.code} no se reconoció.`);
      continue;
    }
    const parentCode = text(row.id_padre).toUpperCase();
    const parent = indicatorByCode.get(parentCode) ?? null;
    const name = text(row.nombre) || parent?.name || id;
    const slot = parent ? `${parent.id}|${site.programId}|${site.campusId}` : "";

    if (parent && parent.status === "publicado" && !usedSlots.has(slot) && sameIndicator(name, parent.name)) {
      usedSlots.add(slot);
      const label = `${legacy.code} · ${parent.code}`;
      programIndicators.set(id, { target: parent, site, label });
      const existing = adoptionIndex.get(slot) ?? null;
      const { fields, kind } = planTargets("Indicadores_Programa", label, `adopcion:${slot}`, row as unknown as Record<string, Cell>, existing);
      const effective: ChangeKind = !existing ? "nueva" : !existing.active ? "cambia" : kind ?? "igual";
      if (effective !== "igual") {
        adoptionChanges.push({ indicator_code: parent.code, program_id: site.programId, campus_id: site.campusId, ...fields });
      }
      count("Indicadores_Programa", effective);
      continue;
    }

    const existing = ownByLegacy.get(id) ?? null;
    const label = `${legacy.code} · ${name}`;
    const { fields, kind } = planTargets("Indicadores_Programa", label, `propio:${id}`, row as unknown as Record<string, Cell>, existing);
    const renamed = Boolean(existing && existing.name !== name);
    const effective: ChangeKind = !existing ? "nueva" : kind === "cambia" || renamed ? "cambia" : "igual";
    if (effective !== "igual") {
      programIndicatorChanges.push({
        legacy_id: id,
        program_id: site.programId,
        campus_id: site.campusId,
        fn: FN_OF[text(row.funcion).toUpperCase()] ?? (parent ? FN_OF_CODE[parent.code[0]] : undefined) ?? "ensenanza",
        stage: stageOf(row.niv) ?? "procesos",
        name,
        description: text(row.desc),
        unit_label: text(row.und),
        measure: measureOf(row.und),
        parent_code: parent && parent.status === "publicado" ? parent.code : null,
        ...fields,
      });
    }
    count("Indicadores_Programa", effective);
    programIndicators.set(id, { target: { id: existing?.id ?? null, code: id, legacyId: id }, site, label });
  }
  if (deleted) omissions.push({ sheet: "Indicadores_Programa", row: `${deleted} filas`, reason: "Marcadas como eliminadas en la hoja." });

  /* Resultados_Programa y los valores 2021/2026/2028 de Indicadores_Programa. */
  const resultYears = new Set<string>();
  for (const r of payload.data_resultados) {
    const pid = text(r.id_indicador);
    const year = Number(text(r.anio));
    const target = programIndicators.get(pid);
    if (!target) {
      omit("Resultados_Programa", `${pid}|${text(r.anio)}`, "Su indicador de programa no entró.");
      continue;
    }
    if (!Number.isInteger(year) || year < 2015 || year > 2040) {
      omit("Resultados_Programa", `${pid}|${text(r.anio)}`, "El año no es válido.");
      continue;
    }
    resultYears.add(`${pid}|${year}`);
    planValue("Resultados_Programa", target.label, target.target, year, target.site, readFigure(r.num, r.prop, r.na));
  }
  for (const row of payload.data_programa) {
    const target = programIndicators.get(text(row.id));
    if (!target) continue;
    for (const [year, cell] of [[2021, row.lb2021], [2026, row.va26], [2028, row.va28]] as const) {
      if (resultYears.has(`${text(row.id)}|${year}`)) continue; // La fila anual manda.
      planValue("Indicadores_Programa", target.label, target.target, year, target.site, readFigure(cell));
    }
  }

  return {
    sheets: [sheets.Datos, sheets.Indicadores_Programa, sheets.Resultados_Programa, sheets.Programas],
    issues,
    omissions,
    programs: programRows,
    indicators: indicatorChanges,
    programIndicators: programIndicatorChanges,
    adoptions: adoptionChanges,
    values,
  };
}

/** Cuántos cambios entran si se aplica el plan tal cual. */
export const changeCount = (plan: SyncPlan) =>
  plan.indicators.length + plan.programIndicators.length + plan.adoptions.length + plan.values.length;

/** El lote para imp_sync_apply. */
export function toBatch(plan: SyncPlan, sourceUrl: string) {
  return {
    source_url: sourceUrl,
    summary: {
      hojas: Object.fromEntries(plan.sheets.map((s) => [s.sheet, { filas: s.rows, nuevas: s.nuevas, cambian: s.cambian, iguales: s.iguales }])),
      omitidas: plan.omissions.length,
      decididas: plan.issues.length,
    },
    programs: plan.programs,
    indicators: plan.indicators,
    program_indicators: plan.programIndicators,
    adoptions: plan.adoptions,
    values: plan.values,
  };
}
