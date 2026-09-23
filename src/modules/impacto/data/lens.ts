/* =============================================================================
   Lentes del portal: vicerrectoría, facultad, programa y campus.

   Cada lente es un filtro sobre los registros y una regla de qué funciones se
   muestran. El valor de cada indicador se consolida con su regla de
   agregación: un porcentaje de facultad es razón de sumas.

   Desde el cierre de la fase 7 los datos vienen de la base (portal-db.ts, migración 0072):
   el catálogo publicado, la estructura real y solo los registros validados.
   `buildPortal` los arma una vez y cada función de aquí los recibe; nada se
   importa de datos ilustrativos. Todo es puro: lo usan las pantallas y las
   pruebas.
   ========================================================================== */

import { consolidate } from "./aggregate";
import type { Consolidated } from "./aggregate";
import { FUNCTIONS } from "./catalog";
import type { Aggregation, CalcType, CaptureMode, Degree, FunctionId, Indicator, Level, Measure, TechSheet } from "./types";

export type LensKind = "vicerrectoria" | "facultad" | "programa" | "campus";

export const LENSES: { kind: LensKind; name: string; plural: string }[] = [
  { kind: "vicerrectoria", name: "Vicerrectoría", plural: "Vicerrectorías" },
  { kind: "facultad", name: "Facultad", plural: "Facultades" },
  { kind: "programa", name: "Programa", plural: "Programas" },
  { kind: "campus", name: "Campus", plural: "Campus" },
];

/* --- Lo que llega de la base (0072) ---------------------------------------- */

export interface RawIndicator {
  code: string;
  function_id: FunctionId;
  level: Level;
  catalog_state: "oficial" | "sugerido";
  name: string;
  description: string;
  unit_original: string;
  responsible_original: string;
  source: string;
  origin: string;
  unit: string | null;
  calc_type: CalcType | null;
  numerator_def: string | null;
  denominator_def: string | null;
  factor: number | null;
  aggregation: Aggregation | null;
  direction: "mayor_mejor" | "menor_mejor" | null;
  periodicity: "semestral" | "anual" | null;
  report_level: TechSheet["nivelReporte"] | null;
  applies_degrees: string[];
  capture_mode: CaptureMode | null;
  evidence_type: string | null;
  evidence_required: boolean;
  variation_threshold: number | string;
  range_min: number | string | null;
  range_max: number | string | null;
  n_minimum: number | null;
  allows_over_one: boolean;
  in_pilot: boolean;
  sheet_complete: boolean;
  targets: { year: number; numeric: number | string | null; text: string | null }[];
  baseline: { year: number; value: number | string } | null;
  alignments: { kind: string; code: string }[];
}

export interface RawCatalog {
  version: { id: string; number: number; source_file: string; published_at: string | null } | null;
  indicators: RawIndicator[];
}

export interface RawStructure {
  faculties: { id: string; slug: string; code: string; name: string }[];
  programs: {
    id: string;
    slug: string;
    code: string;
    name: string;
    faculty_id: string | null;
    degree_level: Degree | null;
    modality: string | null;
    campus_ids: string[];
  }[];
  campuses: { id: string; slug: string; name: string }[];
}

export interface RawRecord {
  code: string;
  program_id: string;
  campus_id: string | null;
  period_code: string;
  numerator: number | string | null;
  denominator: number | string | null;
  n_responses: number | string | null;
  num_comparison: number | string | null;
  den_comparison: number | string | null;
}

/* --- Lo que usan las pantallas --------------------------------------------- */

export interface PortalFaculty {
  slug: string;
  code: string;
  name: string;
}

export interface PortalProgram {
  slug: string;
  name: string;
  /** slug de la facultad, o null si el programa no cuelga de una. */
  faculty: string | null;
  degree: Degree | null;
  /** slugs de las sedes donde se ofrece. */
  campus: string[];
}

export interface PortalCampus {
  slug: string;
  name: string;
}

/** Un registro validado: siempre numerador y denominador, nunca solo el porcentaje. */
export interface PortalRecord extends Measure {
  codigo: string;
  program: string;
  campus: string | null;
  period: string;
}

export interface PortalData {
  version: { number: number; publishedAt: string | null; sourceFile: string } | null;
  indicators: Indicator[];
  faculties: PortalFaculty[];
  programs: PortalProgram[];
  campuses: PortalCampus[];
  records: PortalRecord[];
  /** Periodos con al menos un registro validado, en orden. */
  periods: string[];
  indicatorByCode: Map<string, Indicator>;
  programBySlug: Map<string, PortalProgram>;
  facultyBySlug: Map<string, PortalFaculty>;
  /** Códigos con algún registro validado, en cualquier lente. */
  reported: Set<string>;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

function formatNumber(value: number): string {
  return value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

function targetText(t: RawIndicator["targets"][number] | undefined): string {
  if (!t) return "";
  if (t.text) return t.text;
  const n = num(t.numeric);
  return n === null ? "" : formatNumber(n);
}

/** La ficha de la base, en la forma de la ficha técnica. Sin tipo, factor o agregación no hay con qué consolidar. */
function sheetOf(row: RawIndicator): TechSheet | null {
  if (!row.calc_type || !row.aggregation || (row.factor !== 1 && row.factor !== 100)) return null;
  const min = num(row.range_min);
  const max = num(row.range_max);
  return {
    tipo: row.calc_type,
    numerador: row.numerator_def ?? "",
    denominador: row.denominator_def || undefined,
    factor: row.factor,
    agregacion: row.aggregation,
    sentido: row.direction ?? "mayor_mejor",
    periodicidad: row.periodicity ?? "semestral",
    nivelReporte: row.report_level ?? "programa",
    aplicaA: row.applies_degrees as Degree[],
    modo: row.capture_mode ?? "manual",
    evidencia: row.evidence_required || row.evidence_type ? { tipo: row.evidence_type ?? "", obligatoria: row.evidence_required } : null,
    umbral: Number(row.variation_threshold),
    rango: min !== null && max !== null ? [min, max] : undefined,
    nMinimo: row.n_minimum ?? undefined,
    admiteMayorQueUno: row.allows_over_one,
    enPiloto: row.in_pilot,
  };
}

function indicatorOf(row: RawIndicator): Indicator {
  const aligned = (kind: string) => row.alignments.filter((a) => a.kind === kind).map((a) => a.code);
  const target = row.targets.find((t) => t.year !== 2028);
  const baseline = row.baseline ? num(row.baseline.value) : null;
  return {
    codigo: row.code,
    funcion: row.function_id,
    nivel: row.level,
    estado: row.catalog_state,
    nombre: row.name,
    descripcion: row.description,
    unidad: row.unit_original,
    lineaBase: baseline === null ? "" : formatNumber(baseline),
    lineaBaseAnio: row.baseline?.year ?? null,
    meta: { anio: target?.year ?? 0, valor: targetText(target) },
    meta2028: targetText(row.targets.find((t) => t.year === 2028)),
    responsable: row.responsible_original,
    fuente: row.source,
    dimension: aligned("dimension")[0] ?? "",
    pilares: aligned("pilar").map(Number).filter((n) => !Number.isNaN(n)),
    proyectos: aligned("proyecto"),
    ods: aligned("ods").map(Number).filter((n) => !Number.isNaN(n)),
    origen: row.origin,
    ficha: sheetOf(row),
  };
}

/** Arma el portal con lo que devuelve la base. */
export function buildPortal(catalog: RawCatalog, structure: RawStructure, rows: RawRecord[]): PortalData {
  const indicators = catalog.version ? catalog.indicators.map(indicatorOf) : [];
  const campusById = new Map(structure.campuses.map((c) => [c.id, c]));
  const facultyById = new Map(structure.faculties.map((f) => [f.id, f]));
  const faculties = structure.faculties.map((f) => ({ slug: f.slug, code: f.code, name: f.name }));
  const programs: PortalProgram[] = structure.programs.map((p) => ({
    slug: p.slug,
    name: p.name,
    faculty: p.faculty_id ? (facultyById.get(p.faculty_id)?.slug ?? null) : null,
    degree: p.degree_level,
    campus: p.campus_ids.map((id) => campusById.get(id)?.slug).filter((s): s is string => Boolean(s)),
  }));
  const programById = new Map(structure.programs.map((p) => [p.id, p.slug]));
  const indicatorByCode = new Map(indicators.map((i) => [i.codigo, i]));

  const records: PortalRecord[] = [];
  for (const r of rows) {
    const program = programById.get(r.program_id);
    if (!program || !indicatorByCode.has(r.code)) continue;
    records.push({
      codigo: r.code,
      program,
      campus: r.campus_id ? (campusById.get(r.campus_id)?.slug ?? null) : null,
      period: r.period_code,
      numerador: num(r.numerator),
      denominador: num(r.denominator),
      n: num(r.n_responses),
      numComparacion: num(r.num_comparison),
      denComparacion: num(r.den_comparison),
    });
  }

  return {
    version: catalog.version
      ? { number: catalog.version.number, publishedAt: catalog.version.published_at, sourceFile: catalog.version.source_file }
      : null,
    indicators,
    faculties,
    programs,
    campuses: structure.campuses.map((c) => ({ slug: c.slug, name: c.name })),
    records,
    periods: [...new Set(records.map((r) => r.period))].sort(),
    indicatorByCode,
    programBySlug: new Map(programs.map((p) => [p.slug, p])),
    facultyBySlug: new Map(faculties.map((f) => [f.slug, f])),
    reported: new Set(records.map((r) => r.codigo)),
  };
}

/* --- Lentes ---------------------------------------------------------------- */

export interface Scope {
  kind: LensKind | "institucion";
  slug: string;
  name: string;
  detail: string;
  functions: FunctionId[];
  /** true si un registro por programa (sin sede) no entra: la lente de campus. */
  sitesOnly: boolean;
  match: (record: PortalRecord) => boolean;
}

const ALL_FUNCTIONS = FUNCTIONS.map((f) => f.id);
const programs = (n: number) => `${n} ${n === 1 ? "programa" : "programas"}`;

export const INSTITUTION: Scope = {
  kind: "institucion",
  slug: "udes",
  name: "Universidad de Santander",
  detail: "Toda la universidad",
  functions: ALL_FUNCTIONS,
  sitesOnly: false,
  match: () => true,
};

const programsOfFaculty = (data: PortalData, slug: string) => data.programs.filter((p) => p.faculty === slug);
const programsOfCampus = (data: PortalData, slug: string) => data.programs.filter((p) => p.campus.includes(slug));

export function entitiesOf(data: PortalData, kind: LensKind): { slug: string; name: string; detail: string }[] {
  switch (kind) {
    case "vicerrectoria":
      return FUNCTIONS.map((f) => ({ slug: f.id, name: f.vice, detail: f.name }));
    case "facultad":
      return data.faculties.map((f) => ({ slug: f.slug, name: f.name, detail: programs(programsOfFaculty(data, f.slug).length) }));
    case "programa":
      return data.programs.map((p) => ({ slug: p.slug, name: p.name, detail: (p.faculty && data.facultyBySlug.get(p.faculty)?.code) || "" }));
    case "campus":
      // Una sede sin programas ofrecidos no tiene nada que mostrar.
      return data.campuses
        .map((c) => ({ slug: c.slug, name: c.name, count: programsOfCampus(data, c.slug).length }))
        .filter((c) => c.count > 0)
        .map((c) => ({ slug: c.slug, name: c.name, detail: programs(c.count) }));
  }
}

export function resolveScope(data: PortalData, kind: string | undefined, slug: string | undefined): Scope | null {
  if (!kind || !slug) return INSTITUTION;
  if (kind === "vicerrectoria") {
    const f = FUNCTIONS.find((x) => x.id === slug);
    return f ? { kind, slug, name: f.vice, detail: `Función sustantiva de ${f.name}`, functions: [f.id], sitesOnly: false, match: () => true } : null;
  }
  if (kind === "facultad") {
    const f = data.facultyBySlug.get(slug);
    if (!f) return null;
    const own = new Set(programsOfFaculty(data, slug).map((p) => p.slug));
    return { kind, slug, name: f.name, detail: programs(own.size), functions: ALL_FUNCTIONS, sitesOnly: false, match: (r) => own.has(r.program) };
  }
  if (kind === "programa") {
    const p = data.programBySlug.get(slug);
    const faculty = p?.faculty ? data.facultyBySlug.get(p.faculty)?.name : undefined;
    return p
      ? { kind, slug, name: p.name, detail: faculty ?? "Sin facultad", functions: ALL_FUNCTIONS, sitesOnly: false, match: (r) => r.program === slug }
      : null;
  }
  if (kind === "campus") {
    const c = data.campuses.find((x) => x.slug === slug);
    return c
      ? { kind, slug, name: `Campus ${c.name}`, detail: programs(programsOfCampus(data, slug).length), functions: ALL_FUNCTIONS, sitesOnly: true, match: (r) => r.campus === slug }
      : null;
  }
  return null;
}

export interface IndicatorStat {
  indicator: Indicator;
  period: string | null;
  current: Consolidated | null;
  previous: Consolidated | null;
  previousPeriod: string | null;
  /** Serie por periodo, para la ficha. */
  series: { period: string; value: Consolidated }[];
  /** Por qué no hay cifra, cuando no la hay. */
  gap: "sugerido" | "fuera_del_piloto" | "sin_desagregar" | "sin_registros" | null;
}

export function statFor(data: PortalData, indicator: Indicator, scope: Scope): IndicatorStat {
  const base: IndicatorStat = { indicator, period: null, current: null, previous: null, previousPeriod: null, series: [], gap: null };
  if (indicator.estado === "sugerido") return { ...base, gap: "sugerido" };
  const sheet = indicator.ficha;
  if (!sheet) return { ...base, gap: "fuera_del_piloto" };
  // Lo que se reporta por programa no se reparte entre sedes.
  if (scope.sitesOnly && sheet.nivelReporte !== "programa_sede") return { ...base, gap: "sin_desagregar" };

  const own = data.records.filter((r) => r.codigo === indicator.codigo && scope.match(r));
  const series = data.periods
    .map((period) => ({ period, value: consolidate(own.filter((r) => r.period === period), sheet.agregacion, sheet.factor) }))
    .filter((s) => s.value.registros > 0 && s.value.valor !== null);

  if (series.length === 0) {
    const outside = !sheet.enPiloto && !data.reported.has(indicator.codigo);
    return { ...base, gap: outside ? "fuera_del_piloto" : "sin_registros" };
  }
  const last = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  return { ...base, period: last.period, current: last.value, previous: prev?.value ?? null, previousPeriod: prev?.period ?? null, series };
}

export function statsFor(data: PortalData, scope: Scope): IndicatorStat[] {
  return data.indicators.filter((i) => scope.functions.includes(i.funcion)).map((i) => statFor(data, i, scope));
}

/** Para la ficha: en qué se reparte una cifra según la lente en la que se mira. */
export function breakdownFor(data: PortalData, indicator: Indicator, scope: Scope): { label: string; to: string; stat: IndicatorStat }[] {
  const sheet = indicator.ficha;
  if (!sheet) return [];
  if (scope.kind === "institucion" || scope.kind === "vicerrectoria") {
    return data.faculties.map((f) => ({ label: f.name, to: `/impacto/facultad/${f.slug}`, stat: statFor(data, indicator, resolveScope(data, "facultad", f.slug)!) }));
  }
  if (scope.kind === "facultad" || scope.kind === "campus") {
    const list = scope.kind === "facultad" ? programsOfFaculty(data, scope.slug) : programsOfCampus(data, scope.slug);
    return list.map((p) => {
      const programScope = resolveScope(data, "programa", p.slug)!;
      const narrowed: Scope =
        scope.kind === "campus" ? { ...programScope, sitesOnly: true, match: (r) => r.program === p.slug && r.campus === scope.slug } : programScope;
      return { label: p.name, to: `/impacto/programa/${p.slug}`, stat: statFor(data, indicator, narrowed) };
    });
  }
  const program = data.programBySlug.get(scope.slug);
  if (!program || sheet.nivelReporte !== "programa_sede") return [];
  return program.campus.map((c) => ({
    label: data.campuses.find((x) => x.slug === c)?.name ?? c,
    to: `/impacto/campus/${c}`,
    stat: statFor(data, indicator, { ...scope, sitesOnly: true, match: (r) => r.program === program.slug && r.campus === c }),
  }));
}

export function formatValue(indicator: Indicator, value: number | null): string {
  if (value === null) return "—";
  const sheet = indicator.ficha;
  if (sheet?.factor === 100) return `${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
  if (sheet?.tipo === "puntaje" || sheet?.admiteMayorQueUno) return value.toLocaleString("es-CO", { maximumFractionDigits: 1 });
  return Math.round(value).toLocaleString("es-CO");
}

export function unitLabel(indicator: Indicator): string {
  const sheet = indicator.ficha;
  if (!sheet) return indicator.unidad;
  if (sheet.factor === 100) return "porcentaje";
  if (sheet.tipo === "puntaje") return "puntos";
  if (sheet.admiteMayorQueUno) return "horas por profesor";
  if (/^[\d.,\s]+$/.test(indicator.unidad)) return "número";
  return indicator.unidad.replace(/^N[°º]\s*/i, "").replace(/\/año|\/semestre/gi, "").trim().toLowerCase() || "número";
}

export const GAP_LABEL: Record<NonNullable<IndicatorStat["gap"]>, string> = {
  sugerido: "Sugerido: aún no se reporta",
  fuera_del_piloto: "Fuera del piloto",
  sin_desagregar: "Se reporta por programa, sin sede",
  sin_registros: "Sin cifras validadas en esta lente",
};
