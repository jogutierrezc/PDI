/* =============================================================================
   Lentes del portal: vicerrectoría, facultad, programa y campus.

   Cada lente es un filtro sobre los registros y una regla de qué funciones se
   muestran. El valor de cada indicador se consolida con su regla de
   agregación: un porcentaje de facultad es razón de sumas.
   ========================================================================== */

import { consolidate } from "./aggregate";
import type { Consolidated } from "./aggregate";
import { CAMPUS, FACULTIES, FUNCTIONS, INDICATORS, PROGRAMS, facultyBySlug, programBySlug } from "./catalog";
import { DEMO_RECORDS, PERIODS } from "./demo";
import type { DemoRecord } from "./demo";
import type { FunctionId, Indicator } from "./types";

export type LensKind = "vicerrectoria" | "facultad" | "programa" | "campus";

export const LENSES: { kind: LensKind; name: string; plural: string }[] = [
  { kind: "vicerrectoria", name: "Vicerrectoría", plural: "Vicerrectorías" },
  { kind: "facultad", name: "Facultad", plural: "Facultades" },
  { kind: "programa", name: "Programa", plural: "Programas" },
  { kind: "campus", name: "Campus", plural: "Campus" },
];

export interface Scope {
  kind: LensKind | "institucion";
  slug: string;
  name: string;
  detail: string;
  functions: FunctionId[];
  /** true si un registro por programa (sin sede) no entra: la lente de campus. */
  sitesOnly: boolean;
  match: (record: DemoRecord) => boolean;
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

export function entitiesOf(kind: LensKind): { slug: string; name: string; detail: string }[] {
  switch (kind) {
    case "vicerrectoria":
      return FUNCTIONS.map((f) => ({ slug: f.id, name: f.vice, detail: f.name }));
    case "facultad":
      return FACULTIES.map((f) => ({
        slug: f.slug,
        name: f.name,
        detail: programs(PROGRAMS.filter((p) => p.faculty === f.slug).length),
      }));
    case "programa":
      return PROGRAMS.map((p) => ({ slug: p.slug, name: p.name, detail: facultyBySlug.get(p.faculty)?.code ?? "" }));
    case "campus":
      return CAMPUS.map((c) => ({
        slug: c.id,
        name: c.name,
        detail: programs(PROGRAMS.filter((p) => p.campus.includes(c.id)).length),
      }));
  }
}

export function resolveScope(kind: string | undefined, slug: string | undefined): Scope | null {
  if (!kind || !slug) return INSTITUTION;
  if (kind === "vicerrectoria") {
    const f = FUNCTIONS.find((x) => x.id === slug);
    return f ? { kind, slug, name: f.vice, detail: `Función sustantiva de ${f.name}`, functions: [f.id], sitesOnly: false, match: () => true } : null;
  }
  if (kind === "facultad") {
    const f = facultyBySlug.get(slug);
    return f
      ? { kind, slug, name: f.name, detail: programs(PROGRAMS.filter((p) => p.faculty === slug).length), functions: ALL_FUNCTIONS, sitesOnly: false, match: (r) => programBySlug.get(r.program)?.faculty === slug }
      : null;
  }
  if (kind === "programa") {
    const p = programBySlug.get(slug);
    return p
      ? { kind, slug, name: p.name, detail: facultyBySlug.get(p.faculty)?.name ?? "", functions: ALL_FUNCTIONS, sitesOnly: false, match: (r) => r.program === slug }
      : null;
  }
  if (kind === "campus") {
    const c = CAMPUS.find((x) => x.id === slug);
    return c
      ? { kind, slug, name: `Campus ${c.name}`, detail: programs(PROGRAMS.filter((p) => p.campus.includes(c.id)).length), functions: ALL_FUNCTIONS, sitesOnly: true, match: (r) => r.campus === slug }
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

export function statFor(indicator: Indicator, scope: Scope): IndicatorStat {
  const base: IndicatorStat = { indicator, period: null, current: null, previous: null, previousPeriod: null, series: [], gap: null };
  if (indicator.estado === "sugerido") return { ...base, gap: "sugerido" };
  const sheet = indicator.ficha;
  if (!sheet) return { ...base, gap: "fuera_del_piloto" };
  if (scope.sitesOnly && sheet.nivelReporte !== "programa_sede") return { ...base, gap: "sin_desagregar" };

  const series = PERIODS.map((period) => {
    const rows = DEMO_RECORDS.filter((r) => r.codigo === indicator.codigo && r.period === period && scope.match(r));
    return { period, value: consolidate(rows, sheet.agregacion, sheet.factor) };
  }).filter((s) => s.value.registros > 0 && s.value.valor !== null);

  if (series.length === 0) return { ...base, gap: "sin_registros" };
  const last = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  return { ...base, period: last.period, current: last.value, previous: prev?.value ?? null, previousPeriod: prev?.period ?? null, series };
}

export function statsFor(scope: Scope): IndicatorStat[] {
  return INDICATORS.filter((i) => scope.functions.includes(i.funcion)).map((i) => statFor(i, scope));
}

/** Para la ficha: en qué se reparte una cifra según la lente en la que se mira. */
export function breakdownFor(indicator: Indicator, scope: Scope): { label: string; to: string; stat: IndicatorStat }[] {
  const sheet = indicator.ficha;
  if (!sheet) return [];
  if (scope.kind === "institucion" || scope.kind === "vicerrectoria") {
    return FACULTIES.map((f) => ({ label: f.name, to: `/impacto/facultad/${f.slug}`, stat: statFor(indicator, resolveScope("facultad", f.slug)!) }));
  }
  if (scope.kind === "facultad" || scope.kind === "campus") {
    const programs = PROGRAMS.filter((p) => (scope.kind === "facultad" ? p.faculty === scope.slug : p.campus.includes(scope.slug as never)));
    return programs.map((p) => {
      const programScope = resolveScope("programa", p.slug)!;
      const narrowed: Scope = scope.kind === "campus" ? { ...programScope, sitesOnly: true, match: (r) => r.program === p.slug && r.campus === scope.slug } : programScope;
      return { label: p.name, to: `/impacto/programa/${p.slug}`, stat: statFor(indicator, narrowed) };
    });
  }
  const program = programBySlug.get(scope.slug);
  if (!program || sheet.nivelReporte !== "programa_sede") return [];
  return program.campus.map((c) => ({
    label: CAMPUS.find((x) => x.id === c)?.name ?? c,
    to: `/impacto/campus/${c}`,
    stat: statFor(indicator, { ...scope, sitesOnly: true, match: (r) => r.program === program.slug && r.campus === c }),
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
  sin_registros: "Sin registros en esta lente",
};
