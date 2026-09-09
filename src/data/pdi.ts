/* =============================================================================
   Dominio del PDI: lo que no son datos.

   Este archivo contenía los seis pilares y sus cifras escritos a mano. Ahora
   los datos viven en Supabase y aquí solo queda lo que traduce la base de
   datos a la interfaz: colores, glifos, formatos y etiquetas.
   ========================================================================== */

import type {
  ActivityStatus,
  ActivityTarget,
  PdiSummary,
  PillarProgress,
  ProgressScope,
  PublicationStatus,
  YearProgress,
} from "../types/database";

/* --- Estados -------------------------------------------------------------- */

export interface StatusMeta {
  id: ActivityStatus;
  label: string;
  /** Codificación secundaria: el estado nunca se comunica solo con color. */
  glyph: string;
  color: string;
}

export const statusMeta: Record<ActivityStatus, StatusMeta> = {
  cumplida: { id: "cumplida", label: "Cumplido", glyph: "✓", color: "var(--status-done)" },
  curso: { id: "curso", label: "En curso", glyph: "◐", color: "var(--status-active)" },
  pendiente: { id: "pendiente", label: "Pendiente", glyph: "○", color: "var(--status-pending)" },
  riesgo: { id: "riesgo", label: "En riesgo", glyph: "▲", color: "var(--status-risk)" },
};

/** Orden fijo de los segmentos del avance: cumplido → en curso → pendiente → riesgo. */
export const statusOrder: ActivityStatus[] = ["cumplida", "curso", "pendiente", "riesgo"];

export const publicationLabels: Record<PublicationStatus, string> = {
  borrador: "Borrador",
  revision: "En revisión",
  publicado: "Publicado",
  archivado: "Archivado",
};

/* --- Serie anual de los indicadores ----------------------------------------
   El PDI cubre 2024-2028 y su línea base es 2023. Los años viven aquí y en
   ningún otro sitio: la base admite cualquiera, pero los formularios y las
   tablas abren solo estos para que dos personas no capturen el mismo corte con
   dos rejillas distintas.
   -------------------------------------------------------------------------- */

export const planYears = [2024, 2025, 2026, 2027, 2028] as const;

/** Año de la línea base que se propone al crear un indicador. */
export const baselineYear = 2023;

/** "Meta 24" — la cabecera del reporte usa el año en dos cifras. */
export function shortYear(year: number): string {
  return String(year).slice(-2);
}

/**
 * Cumplimiento de un año: resultado sobre meta. Es la misma fórmula que la
 * columna generada de `activity_targets`; se repite aquí solo para que el
 * formulario muestre la cifra mientras se escribe, antes de guardar.
 */
export function computeCompliance(
  target: number | null,
  result: number | null,
): number | null {
  if (target === null || result === null || target === 0) return null;
  return Math.round((result * 100) / target);
}

/** El año más reciente con cumplimiento: el que fija el avance del indicador. */
export function latestTarget(targets: ActivityTarget[]): ActivityTarget | null {
  return (
    [...targets]
      .filter((row) => row.compliance !== null)
      .sort((a, b) => b.year - a.year)[0] ?? null
  );
}

/** Los años a mostrar: los del plan más cualquiera ya capturado fuera de rango. */
export function yearsInPlay(targets: ActivityTarget[]): number[] {
  const years = new Set<number>(planYears);
  for (const row of targets) years.add(row.year);
  return [...years].sort((a, b) => a - b);
}

/** 28 → "28", 28.5 → "28,5". Sin decimales de relleno en una tabla de cifras. */
export function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

/* --- Avance por año --------------------------------------------------------
   `v_year_progress` llega como una lista plana de (ámbito, entidad, año,
   avance). Las tablas la necesitan al revés: dada una fila y un año, su cifra.
   Este índice hace esa vuelta una sola vez por pantalla.
   -------------------------------------------------------------------------- */

/** Dónde está puesta la barra de años: un corte del plan, o el plan entero. */
export type YearScope = number | "plan";

/** Un año del horizonte con su cifra. Null = ese año no se ha reportado. */
export interface YearStop {
  year: number;
  progress: number | null;
}

/**
 * Avance del plan.
 *
 * Los cinco años del horizonte pesan lo mismo y **los que todavía no se han
 * reportado cuentan como cero**: el 100 % no se alcanza hasta cerrar 2028. Es
 * una pregunta distinta de "cómo se cumplió lo comprometido hasta ahora" —para
 * eso está el cumplimiento de cada año— y da siempre una cifra más baja.
 *
 * Un plan que va perfecto marca 40 % a finales de 2025, y eso es correcto: le
 * quedan tres años por cumplir.
 */
export function planProgress(at: (year: number) => number | null): number {
  const total = planYears.reduce((sum, year) => sum + (at(year) ?? 0), 0);
  return Math.round(total / planYears.length);
}

export interface YearIndex {
  /** Años con algo reportado, de menor a mayor. */
  years: number[];
  /** Avance de una entidad en un año. Null = ese año no se reportó. */
  at: (scope: ProgressScope, id: string, year: number) => number | null;
  /** La serie completa de una entidad, ya ordenada. Solo los años con dato. */
  of: (scope: ProgressScope, id: string) => { year: number; progress: number }[];
  /** Los cinco años del plan, con hueco donde no hay dato. Para la barra. */
  series: (scope: ProgressScope, id: string) => YearStop[];
  /** Avance del plan de esa entidad, ponderado hasta 2028. */
  plan: (scope: ProgressScope, id: string) => number;
}

export function indexYearProgress(rows: YearProgress[]): YearIndex {
  const byEntity = new Map<string, Map<number, number>>();
  const years = new Set<number>();

  for (const row of rows) {
    const key = `${row.scope}:${row.entity_id}`;
    const bucket = byEntity.get(key) ?? new Map<number, number>();
    bucket.set(row.year, row.progress);
    byEntity.set(key, bucket);
    years.add(row.year);
  }

  const at = (scope: ProgressScope, id: string, year: number) =>
    byEntity.get(`${scope}:${id}`)?.get(year) ?? null;

  return {
    years: [...years].sort((a, b) => a - b),
    at,
    of: (scope, id) =>
      [...(byEntity.get(`${scope}:${id}`) ?? new Map())]
        .map(([year, progress]) => ({ year, progress }))
        .sort((a, b) => a.year - b.year),
    series: (scope, id) => planYears.map((year) => ({ year, progress: at(scope, id, year) })),
    plan: (scope, id) => planProgress((year) => at(scope, id, year)),
  };
}

/**
 * El mismo cálculo para un conjunto de entidades del mismo nivel: el tablero
 * necesita "los seis pilares en 2025" y "los seis pilares en el plan".
 *
 * Cada entidad pesa lo mismo, igual que en `v_pdi_summary`: sumar indicadores
 * daría más voz a los pilares con más filas.
 *
 * Las dos lecturas tratan el silencio de forma distinta, a propósito:
 *
 * - **Un año concreto** promedia solo a quien lo reportó. Contar como cero a un
 *   pilar que aún no ha entregado ese corte diría "no cumplió" donde solo hay
 *   "todavía no se sabe".
 *
 * - **El plan** cuenta como cero los años no reportados de quien ya reporta:
 *   ahí el cero sí significa algo —queda por cumplir— y es lo que hace que el
 *   100 % solo llegue al cerrar el último año del horizonte.
 *
 * `roster` da el conjunto completo y, por entidad, el número que se publicaba
 * antes de la serie anual. Una entidad sin ningún año capturado conserva ese
 * valor en la posición del plan, igual que hace la cascada: aplicar la
 * ponderación a quien no ha empezado a reportar por años la mandaría a cero de
 * golpe.
 */
export interface YearAggregate {
  /** Promedio de las entidades que reportaron ese año. Null = ninguna. */
  at: (year: number) => number | null;
  /** Los cinco años del plan, con hueco donde no hay dato. */
  series: YearStop[];
  /** Avance del plan del conjunto, ponderado hasta el final del horizonte. */
  plan: number;
}

export interface RosterEntry {
  id: string;
  /** Avance acumulado, para las entidades que aún no reportan por años. */
  fallback: number;
}

export function aggregateYears(rows: YearProgress[], roster?: RosterEntry[]): YearAggregate {
  const byYear = new Map<number, number[]>();
  const byEntity = new Map<string, Map<number, number>>();

  for (const row of rows) {
    byYear.set(row.year, [...(byYear.get(row.year) ?? []), row.progress]);
    const bucket = byEntity.get(row.entity_id) ?? new Map<number, number>();
    bucket.set(row.year, row.progress);
    byEntity.set(row.entity_id, bucket);
  }

  const at = (year: number) => {
    const values = byYear.get(year);
    if (!values || values.length === 0) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  };

  const entries: RosterEntry[] =
    roster ?? [...byEntity.keys()].map((id) => ({ id, fallback: 0 }));

  const planes = entries.map((entry) => {
    const bucket = byEntity.get(entry.id);
    if (!bucket || bucket.size === 0) return entry.fallback;
    return planProgress((year) => bucket.get(year) ?? null);
  });

  return {
    at,
    series: planYears.map((year) => ({ year, progress: at(year) })),
    plan:
      planes.length === 0
        ? 0
        : Math.round(planes.reduce((sum, value) => sum + value, 0) / planes.length),
  };
}

/** Etiqueta de la posición de la barra, para los rótulos que la acompañan. */
export function yearScopeLabel(scope: YearScope): string {
  return scope === "plan" ? `Plan ${planYears[0]}-${planYears[planYears.length - 1]}` : String(scope);
}

/* --- Color ---------------------------------------------------------------- */

/**
 * La base de datos guarda un índice de 1 a 6, no un color. El color vive en
 * tokens.css, donde el tema oscuro tiene su propia paleta validada: si se
 * guardara el hex, el modo oscuro heredaría colores pensados para fondo claro.
 */
export function accentFor(slot: number | null | undefined): string {
  const index = Math.min(Math.max(slot ?? 1, 1), 6);
  return `var(--pillar-${index})`;
}

/* --- Formatos ------------------------------------------------------------- */

const monthFormatter = new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric" });
const longDateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Las fechas de Postgres llegan como "2026-08-31". Interpretarlas en UTC
  // evita que un huso al oeste las muestre un día antes.
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

/** "2026-08-31" → "ago 2026" */
export function formatMonth(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? monthFormatter.format(date).replace(".", "") : "Sin fecha";
}

/** "2026-08-28" → "28 ago 2026" */
export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? longDateFormatter.format(date).replace(".", "") : "—";
}

/** 4200000 → "$4,2 M" */
export function formatBudget(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toLocaleString("es-CO", { maximumFractionDigits: 0 })} K`;
  }
  return `$${value.toLocaleString("es-CO")}`;
}

/* --- Derivados ------------------------------------------------------------ */

export const emptyProgress: PillarProgress = {
  pillar_id: "",
  slug: "",
  done: 0,
  active: 0,
  pending: 0,
  risk: 0,
  total: 0,
  progress: 0,
  completion_rate: 0,
  area_count: 0,
  line_count: 0,
  project_count: 0,
};

export const emptySummary: PdiSummary = {
  done: 0,
  active: 0,
  pending: 0,
  risk: 0,
  total: 0,
  progress: 0,
  on_track: 0,
  need_attention: 0,
  pillar_count: 0,
  completion_rate: 0,
};

/** Cuenta de un estado dentro de un resumen, para no repetir el switch. */
export function countFor(summary: PdiSummary | PillarProgress, status: ActivityStatus): number {
  switch (status) {
    case "cumplida":
      return summary.done;
    case "curso":
      return summary.active;
    case "pendiente":
      return summary.pending;
    case "riesgo":
      return summary.risk;
  }
}

/** Suma varios avances por pilar en un resumen, para el filtro del tablero. */
export function summarizeProgress(rows: PillarProgress[]): PdiSummary {
  const totals = rows.reduce(
    (acc, row) => ({
      done: acc.done + row.done,
      active: acc.active + row.active,
      pending: acc.pending + row.pending,
      risk: acc.risk + row.risk,
      total: acc.total + row.total,
    }),
    { done: 0, active: 0, pending: 0, risk: 0, total: 0 },
  );

  return {
    ...totals,
    // Promedio de los pilares, igual que v_pdi_summary: cada pilar pesa lo
    // mismo. Sumar indicadores daría más peso a los pilares con más filas.
    progress:
      rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length),
    completion_rate: totals.total === 0 ? 0 : Math.round((totals.done / totals.total) * 100),
    on_track: rows.filter((row) => row.progress >= 80).length,
    need_attention: rows.filter((row) => row.risk > 0).length,
    pillar_count: rows.length,
  };
}

/* --- Bandas de cumplimiento ------------------------------------------------
   Cinco tramos con nombre. Los umbrales viven aquí y en ningún otro sitio: si
   la institución cambia el criterio, se cambia una vez.

   El color nunca viaja solo — cada uso muestra también el nombre de la banda.
   Naranja y verde son indistinguibles bajo daltonismo, así que la escala se
   apoya además en la luminosidad (ver tokens.css).
   -------------------------------------------------------------------------- */

export interface ComplianceBand {
  id: 1 | 2 | 3 | 4 | 5;
  label: string;
  /** Mínimo incluido del tramo. */
  from: number;
  /** Máximo incluido del tramo. */
  to: number;
  color: string;
}

export const complianceBands: ComplianceBand[] = [
  { id: 1, label: "Bajo", from: 0, to: 24, color: "var(--band-1)" },
  { id: 2, label: "Medio bajo", from: 25, to: 49, color: "var(--band-2)" },
  { id: 3, label: "Medio", from: 50, to: 69, color: "var(--band-3)" },
  { id: 4, label: "Medio alto", from: 70, to: 89, color: "var(--band-4)" },
  { id: 5, label: "Satisfactorio", from: 90, to: 100, color: "var(--band-5)" },
];

export function bandFor(progress: number): ComplianceBand {
  const value = Math.max(0, Math.min(100, Math.round(progress)));
  return complianceBands.find((band) => value >= band.from && value <= band.to) ?? complianceBands[0];
}

/** Etiqueta de estado a partir del avance, no de un texto escrito a mano. */
export function toneForProgress(progress: number) {
  if (progress >= 90) return { label: "Consolidado", tone: "done" as const, glyph: "✓" };
  if (progress >= 70) return { label: "En progreso", tone: "active" as const, glyph: "◐" };
  if (progress >= 45) return { label: "En desarrollo", tone: "pending" as const, glyph: "○" };
  return { label: "Atención requerida", tone: "risk" as const, glyph: "▲" };
}
