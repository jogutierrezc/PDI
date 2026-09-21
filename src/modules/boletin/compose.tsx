/* =============================================================================
   Boletín · composición del contenido.

   Convierte plantilla + catálogo en una lista ordenada de unidades que el
   documento reparte en páginas: por cada informe incluido, su apertura de
   capítulo (que siempre empieza página), una hoja por indicador y una por
   conjunto visual. Una unidad no se parte entre páginas, salvo las tablas
   largas, que ya llegan cortadas en tramos con "(continuación)".

   La hoja de indicador es el contrato del boletín: a la izquierda, la columna
   de notas (qué mide, quién reporta, cómo se calcula, corte); a la derecha, la
   cifra ancla, la evolución por año, el detalle por campus y la tabla.

   Fidelidad a cómo se reporta: lo que llega por periodo académico se muestra
   por periodo (2024-1, 2024-2) y, junto, la cifra del año que sale de su regla
   (suma, promedio, último periodo). Lo que llega por año se muestra por año.
   Nada se da por vacío porque le falte la cifra del año: si solo hay 2025-1,
   la hoja muestra 2025-1.
   ========================================================================== */

import type { CSSProperties, ReactNode } from "react";import { reportImageUrl } from "../datos-abiertos/data/images";

import { basisOf, changeBetween, formatCount, formatValue, periodBasisOf, valueOf } from "../datos-abiertos/data/open-data";
import { ALL_YEARS, ANNUAL_RULE_LABEL, cutLabel, TERMS } from "../datos-abiertos/data/terms";
import type { AnnualRule, Term } from "../datos-abiertos/data/terms";
import { isMobilityMap, isWorldMap } from "../datos-abiertos/data/types";
import { indicatorRef, reportGroups } from "../datos-abiertos/data/groups";
import { RANKING_SYSTEMS, SCOPE_LABEL, SDGS, latestEdition, parseRank, preferredScope, previousEdition, rankChange, rankOf, rankingShortLabel } from "../datos-abiertos/data/rankings";
import type { ParsedRank, RankScope, RankingData } from "../datos-abiertos/data/rankings";
import { medalHeadline, medalUnits } from "./medals";
import type { ReportGroup } from "../datos-abiertos/data/groups";
import type {
  Breakdown,
  Campus,
  HeatmapData,
  HistoryData,
  Indicator,
  MapDataset,
  OpenDataCatalog,
  PipelineData,
  Report,
  TableData,
  ValueFormat,
} from "../datos-abiertos/data/types";
import { DEPARTMENTS } from "../datos-abiertos/data/colombia-map";
import { LeakyPipeline } from "../datos-abiertos/components/LeakyPipeline";
import { COUNTRIES } from "../datos-abiertos/data/world-map";
import { ChoroplethMap, DataTable, EvolutionChart, HBars, Legend, MapLegend, RankEvolutionChart, RankTrace, SERIES_COLORS, StackedColumns, SwatchLegend, TERM_COLORS, Trend, figure } from "./figures";
import type { RankLine } from "./figures";
import type { Series } from "./figures";
import type { BulletinSettings, IndicatorShow } from "./model";
import { parseSaberKey, saberHighlight, saberUnits } from "./saber";
import { freeUnits, parseFreeKey } from "./free";
import { parseTytKey, tytHighlight, tytUnits } from "./tyt";
import { deiUnits } from "./dei";
import { modelUnits } from "./model-sheets";
import { BIENESTAR_SLUG, DEI_SLUG } from "./model";

export interface Unit {
  key: string;
  /**
   * "seccion": apertura de un separador de la ficha (Graduados) dentro del capítulo.
   * "tablero": microtablero de un informe en el resumen ejecutivo (no entra al índice).
   */
  kind: "resumen" | "capitulo" | "seccion" | "indicador" | "conjunto" | "tablero";
  /** Informe al que pertenece (el resumen no tiene): pie, cabecera, pestaña e índice. */
  report?: Report;
  /** Continuación de una tabla: va pegada a la anterior y no entra al índice. */
  tight?: boolean;
  /** Título de la hoja: nombre del indicador o del conjunto. */
  title: string;
  /** Separador de la ficha al que pertenece: va en el pie de su página. */
  section?: string;
  breakBefore?: boolean;
  node: ReactNode;
  /**
   * Variante más baja de la misma hoja (sin barras por campus, gráfica más
   * corta, notas esenciales). Se usa solo cuando la completa no cabe en lo que
   * queda de página y esta sí: así un indicador no deja media página en blanco.
   */
  compact?: ReactNode;
}

export interface Composition {
  units: Unit[];
  /** Informes que quedaron en el boletín, en orden. */
  chapters: Report[];
  /** Oficinas que reportan lo incluido, con sus informes. */
  offices: { name: string; reports: string[] }[];
}

/** Filas de una tabla larga en su hoja y en cada continuación. */
const TABLE_FIRST = 12;
const TABLE_NEXT = 14;
const DIRECTION_TEXT = { sube: "Un valor más alto es mejor", baja: "Un valor más bajo es mejor", neutro: "Sin dirección deseada" };
const NAMES: Record<string, string> = {
  ...Object.fromEntries(DEPARTMENTS.map((d) => [d.code, d.name])),
  ...Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name])),
};

const sites = (catalog: OpenDataCatalog): Campus[] => catalog.campuses.filter((c) => c.id !== "todas");
const yearsOf = (catalog: OpenDataCatalog, own?: number[]) => (own?.length ? catalog.years.filter((y) => own.includes(y)) : catalog.years);
const periodColumn = (settings: BulletinSettings) => settings.cut === ALL_YEARS;
const cutText = (cut: number) => (cut === ALL_YEARS ? `Periodo ${cutLabel(ALL_YEARS, null)}` : `Corte ${cut}`);

/* --- Periodos académicos -------------------------------------------------------- */

interface PeriodCut {
  year: number;
  term: Term;
  /** "2024-1" */
  label: string;
}

const periodCutsOf = (years: number[]): PeriodCut[] =>
  years.flatMap((year) => TERMS.map((term) => ({ year, term, label: cutLabel(year, term) })));

const hasValue = (v: number | null | undefined): v is number => v !== null && v !== undefined;

/**
 * ¿El indicador llega por periodo académico? Se decide por lo reportado: si no
 * hay ni una cifra de periodo (se reporta por año, o la cifra del año se captura
 * aparte), la hoja es anual y no dibuja columnas de periodo vacías.
 */
const reportsByTerm = (indicator: Indicator) =>
  indicator.reporting !== "anual" &&
  Boolean(indicator.annualRule) &&
  !onlyTermOf(indicator) &&
  Object.values(indicator.terms ?? {}).some((byTerm) => TERMS.some((t) => Object.values(byTerm?.[t] ?? {}).some(hasValue)));

/**
 * El dato que llega una sola vez al año, siempre en el mismo periodo (el
 * informe DE cuenta en el periodo 2). Dibujarlo por periodo deja una columna
 * vacía por año; se lee como serie anual rotulada con su periodo ("2024-2").
 * Hace falta que se repita en dos años o más: un año en curso con solo su
 * periodo 1 no es esto.
 */
function onlyTermOf(indicator: Indicator): Term | null {
  const used = TERMS.filter((t) => Object.values(indicator.terms ?? {}).some((byTerm) => Object.values(byTerm?.[t] ?? {}).some(hasValue)));
  if (used.length !== 1) return null;
  const withTerm = Object.entries(indicator.terms ?? {}).filter(([, byTerm]) => Object.values(byTerm?.[used[0]] ?? {}).some(hasValue));
  // Solo si la cifra del año existe donde está el periodo: si no, la hoja
  // sigue por periodo y nada se pierde por falta de cifra anual.
  const annualEverywhere = withTerm.every(([year]) => Object.values(indicator.values[Number(year)] ?? {}).some(hasValue));
  return withTerm.length >= 2 && annualEverywhere ? used[0] : null;
}

/** "periodo 2 de cada año", para rótulos. */
const onlyTermText = (term: Term) => `periodo ${term === "A" ? 1 : 2} de cada año`;

/** Cómo sale la cifra del año, en minúscula y corto, para rótulos de gráfica. */
const RULE_SHORT: Record<AnnualRule, string> = {
  suma: "suma de los periodos 1 y 2",
  promedio: "promedio de los periodos 1 y 2",
  ultimo: "último periodo reportado",
  reportado: "reportada como año",
};

/** Tramos de años para las tablas por periodo: tres años (nueve columnas) por tabla. */
const YEARS_PER_TABLE = 3;
const chunk = <T,>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/* --- Presencia de datos ------------------------------------------------------ */

function indicatorHasData(indicator: Indicator, catalog: OpenDataCatalog): boolean {
  const years = yearsOf(catalog, indicator.years);
  const annual = years.some((y) => Object.values(indicator.values[y] ?? {}).some(hasValue));
  if (annual) return true;
  // Un periodo reportado basta: la cifra del año puede faltar (año en curso).
  return reportsByTerm(indicator) && years.some((y) => TERMS.some((t) => Object.values(indicator.terms?.[y]?.[t] ?? {}).some(hasValue)));
}

/**
 * La cifra que representa al indicador en un corte: la del año (o del periodo
 * agrupado) y, si falta, la del último periodo reportado de ese corte. Así un
 * año en curso (solo 2025-1) no se lee como "sin reportar".
 */
function figureAt(indicator: Indicator, catalog: OpenDataCatalog, cut: number, campus: string): { value: number | null; period?: PeriodCut } {
  const value = valueOf(indicator, cut, campus);
  if (value !== null || !reportsByTerm(indicator)) return { value };
  const years = cut === ALL_YEARS ? yearsOf(catalog, indicator.years) : [cut];
  const last = periodCutsOf(years)
    .filter((p) => valueOf(indicator, p.year, campus, p.term) !== null)
    .pop();
  return last ? { value: valueOf(indicator, last.year, campus, last.term), period: last } : { value: null };
}

/** Una categoría con cifra o reservada («< 5»): las dos existen; el vacío no. */
const present = (i: { value: number | null; reserved?: boolean }) => i.value !== null || Boolean(i.reserved);

function termItemsAt(breakdown: Breakdown, year: number, term: Term) {
  return (breakdown.terms?.[year]?.[term] ?? []).filter(present);
}

/** Como en los indicadores: el desglose que llega en un solo periodo al año. */
function breakdownOnlyTerm(b: Breakdown): Term | null {
  const used = TERMS.filter((t) => Object.values(b.terms ?? {}).some((byTerm) => (byTerm?.[t] ?? []).some(present)));
  if (used.length !== 1) return null;
  const years = Object.values(b.terms ?? {}).filter((byTerm) => (byTerm?.[used[0]] ?? []).some(present)).length;
  return years >= 2 ? used[0] : null;
}

/** Categorías del año; si el desglose llega en un solo periodo, las de ese periodo. */
function itemsAt(breakdown: Breakdown, key: number) {
  const own = (breakdown.values[key] ?? []).filter(present);
  if (own.length || key === ALL_YEARS) return own;
  const only = breakdownOnlyTerm(breakdown);
  return only ? termItemsAt(breakdown, key, only) : own;
}

/** Como en los indicadores: por periodo solo si hay alguna cifra de periodo. */
const breakdownByTerm = (b: Breakdown) =>
  b.reporting !== "anual" && !breakdownOnlyTerm(b) && Object.values(b.terms ?? {}).some((byTerm) => TERMS.some((t) => (byTerm?.[t] ?? []).some(present)));

/** Años del desglose con alguna cifra, del año o de un periodo. */
const breakdownYears = (b: Breakdown, catalog: OpenDataCatalog) =>
  yearsOf(catalog, b.years).filter((y) => itemsAt(b, y).length > 0 || (breakdownByTerm(b) && TERMS.some((t) => termItemsAt(b, y, t).length > 0)));

function mapKey(map: MapDataset, cut: number, catalog: OpenDataCatalog): number | undefined {
  const has = (k: number) => Object.values(map.values[k] ?? {}).some((codes) => codes && Object.keys(codes).length > 0);
  if (map.reporting === "global") return has(ALL_YEARS) ? ALL_YEARS : undefined;
  if (has(cut)) return cut;
  const years = yearsOf(catalog, map.years).filter(has);
  return years[years.length - 1];
}

/**
 * Tablas por periodo: cada año con sus periodos 1 y 2 y la cifra del año al
 * lado, en tramos de tres años para que las cifras se lean a tamaño de papel.
 * Con todo el periodo, la última tabla cierra con la cifra agrupada.
 */
function PeriodTables({
  head,
  years,
  rows,
  format,
  highlightYear,
  grouped,
  caption,
}: {
  head: string;
  years: number[];
  rows: { label: string; strong?: boolean; at: (year: number, term: Term | null) => number | null; grouped?: number | null }[];
  format: ValueFormat;
  highlightYear?: number;
  /** Rótulo de la columna agrupada ("2020–2025"), si va. */
  grouped?: string;
  caption?: ReactNode;
}) {
  const groups = chunk(years, YEARS_PER_TABLE);
  return (
    <div className="bol-period-tables">
      {groups.map((group, g) => {
        const last = g === groups.length - 1;
        const columns = group.flatMap((year) => [
          ...TERMS.map((term) => ({ label: cutLabel(year, term), year, term: term as Term | null })),
          { label: String(year), year, term: null as Term | null },
        ]);
        const withGrouped = last && grouped !== undefined;
        const yearCols = columns.map((c, i) => (c.term === null ? i : -1)).filter((i) => i >= 0);
        const highlightCol = highlightYear === undefined ? (withGrouped ? columns.length : undefined) : columns.findIndex((c) => c.year === highlightYear && c.term === null);
        return (
          <DataTable
            key={group.join("-")}
            caption={g === 0 ? caption : undefined}
            head={[head, ...columns.map((c) => c.label), ...(withGrouped ? [grouped!] : [])]}
            yearCols={yearCols}
            highlightCol={highlightCol === -1 ? undefined : highlightCol}
            rows={rows.map((row) => ({
              label: row.label,
              strong: row.strong,
              cells: [...columns.map((c) => figure(row.at(c.year, c.term), format)), ...(withGrouped ? [figure(row.grouped ?? null, format)] : [])],
            }))}
          />
        );
      })}
    </div>
  );
}

/** "2024-1 812 · 2024-2 845": los periodos del corte, bajo la cifra. */
function TermsLine({ indicator, catalog, cut, campus }: { indicator: Indicator; catalog: OpenDataCatalog; cut: number; campus: string }) {
  if (!reportsByTerm(indicator)) return null;
  const years = cut === ALL_YEARS ? yearsOf(catalog, indicator.years) : [cut];
  const cuts = periodCutsOf(years).filter((p) => valueOf(indicator, p.year, campus, p.term) !== null);
  // Con todo el periodo, los dos últimos periodos con dato; con un año, los suyos.
  const shown = cut === ALL_YEARS ? cuts.slice(-2) : periodCutsOf(years);
  if (!cuts.length) return null;
  return (
    <ul className="bol-terms">
      {cut === ALL_YEARS && <li><span>Últimos periodos</span></li>}
      {shown.map((p) => (
        <li key={p.label}>
          <span>{p.label}</span> <b>{figure(valueOf(indicator, p.year, campus, p.term), indicator.format)}</b>
        </li>
      ))}
    </ul>
  );
}

/* --- Piezas comunes ----------------------------------------------------------- */

function SheetHead({ title, unit, description }: { title: string; unit?: string; description?: string }) {
  return (
    <header className="bol-sheet__head">
      <h3>
        {title}
        {unit && <small>{unit}</small>}
      </h3>
      {description && <p>{description}</p>}
    </header>
  );
}

/**
 * Notas largas no caben en la columna de 38 mm: crecen más que el cuerpo o el
 * texto se amontona. Desde este largo (caracteres de texto) van en una franja
 * arriba y el cuerpo usa todo el ancho.
 */
const NOTES_SIDE_MAX = 260;
const textLength = (node: ReactNode | null | undefined): number =>
  typeof node === "string" || typeof node === "number" ? String(node).length : Array.isArray(node) ? node.reduce((s, n) => s + textLength(n), 0) : 0;
const notesLength = (items: [string, ReactNode | null | undefined][]) => items.reduce((s, [label, v]) => s + (v ? label.length + textLength(v) : 0), 0);

function Notes({ items }: { items: [string, ReactNode | null | undefined][] }) {
  return (
    <dl className="bol-notes">
      {items
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function Arrow({ dir }: { dir: "up" | "down" | "flat" }) {
  return (
    <svg className="bol-arrow" viewBox="0 0 10 10" aria-hidden="true">
      <path d={dir === "up" ? "M5 1.5 9 7.5H1z" : dir === "down" ? "M5 8.5 9 2.5H1z" : "M1 4.2h8v1.6H1z"} />
    </svg>
  );
}

/* --- Hoja de indicador --------------------------------------------------------- */

function IndicatorSheet({
  indicator,
  catalog,
  settings,
  show,
  compact = false,
}: {
  indicator: Indicator;
  catalog: OpenDataCatalog;
  settings: BulletinSettings;
  show: IndicatorShow;
  compact?: boolean;
}) {
  const { cut, campus } = settings;
  const years = yearsOf(catalog, indicator.years);
  const campuses = sites(catalog);
  const campusName = catalog.campuses.find((c) => c.id === campus)?.name ?? "Todos los campus";
  const byTerm = reportsByTerm(indicator);
  const only = onlyTermOf(indicator);
  const periods = byTerm ? periodCutsOf(years) : [];
  const anchor = figureAt(indicator, catalog, cut, campus);
  const value = anchor.value;
  const previous = cut === ALL_YEARS || anchor.period ? null : valueOf(indicator, cut - 1, campus);
  const change = changeBetween(indicator, value, previous);
  const basis = cut === ALL_YEARS ? periodBasisOf(indicator, campus) : basisOf(indicator, cut, campus);
  const percent = indicator.format === "porcentaje";
  const unitText = percent || indicator.unit === "%" ? "%" : indicator.unit;

  const reported = (id: string) =>
    years.some((y) => valueOf(indicator, y, id) !== null) || periods.some((p) => valueOf(indicator, p.year, id, p.term) !== null);
  const withData = campuses.filter((c) => reported(c.id));
  const seriesOf = (at: (id: string) => (number | null)[]): Series[] =>
    [
      ...withData.map((c, i) => ({ label: c.name, color: SERIES_COLORS[i % SERIES_COLORS.length], values: at(c.id) })),
      // "Total" y no "Total institucional": la leyenda cabe en una fila; la tabla lo dice completo.
      { label: "Total", color: "var(--bol-navy)", dashed: withData.length > 0, values: at("todas") },
    ].filter((s) => s.values.some((v) => v !== null));
  const annualSeries = seriesOf((id) => years.map((y) => valueOf(indicator, y, id)));
  const periodSeries = byTerm ? seriesOf((id) => periods.map((p) => valueOf(indicator, p.year, id, p.term))) : [];

  const campusItems = withData.map((c) => ({ label: c.name, value: figureAt(indicator, catalog, cut, c.id).value, strong: c.id === campus }));
  const showCampus = !compact && show.campus && campusItems.some((i) => i.value !== null);
  const showEvolution = show.evolution && (annualSeries.length > 0 || periodSeries.length > 0) && (years.length > 1 || byTerm);
  const campusCaption = `Por campus · ${cut === ALL_YEARS ? cutLabel(ALL_YEARS, null) : anchor.period?.label ?? cut}`;

  // Cifra del año con sus periodos. Con la regla "suma", los periodos se apilan
  // y la columna es el año; con las demás, la cifra del año va en línea.
  const rule = indicator.annualRule;
  const stacked = byTerm && rule === "suma";
  const focus = campus;
  const annualFigure = () =>
    stacked ? (
      <>
        <StackedColumns
          periods={years.map(String)}
          categories={["Periodo 1", "Periodo 2"]}
          values={{
            "Periodo 1": Object.fromEntries(years.map((y) => [String(y), valueOf(indicator, y, focus, "A")])),
            "Periodo 2": Object.fromEntries(years.map((y) => [String(y), valueOf(indicator, y, focus, "B")])),
          }}
          totals={years.map((y) => valueOf(indicator, y, focus))}
          colors={TERM_COLORS}
          highlight={cut === ALL_YEARS ? undefined : String(cut)}
          format={indicator.format}
          width={showCampus || compact ? 74 : 130}
          height={compact ? 26 : 36}
        />
        <SwatchLegend labels={["Periodo 1", "Periodo 2"]} colors={TERM_COLORS} />
      </>
    ) : (
      <>
        <EvolutionChart
          years={years}
          series={annualSeries}
          format={indicator.format}
          highlight={cut === ALL_YEARS ? undefined : cut}
          width={showCampus || (compact && byTerm) ? 74 : 130}
          height={compact ? 24 : showCampus ? 36 : annualSeries.length > 1 ? 34 : 28}
        />
        {annualSeries.length > 1 && !byTerm && <Legend series={annualSeries} />}
      </>
    );

  const grouped = periodColumn(settings) ? cutLabel(ALL_YEARS, null) : undefined;
  const tableRows = [
    ...withData.map((c) => ({ id: c.id, label: c.name, strong: false })),
    { id: "todas", label: "Total institucional", strong: withData.length > 0 },
  ];
  const columns = [...years.map((y) => (only ? cutLabel(y, only) : String(y))), ...(grouped ? [grouped] : [])];
  const highlightCol = cut === ALL_YEARS ? columns.length - 1 : years.indexOf(cut);
  const calculation = [
    byTerm
      ? "Se reporta por periodo académico (1 y 2)."
      : only
        ? `Se reporta una vez al año, en el ${onlyTermText(only).replace(" de cada año", "")}.`
        : indicator.reporting === "anual"
          ? "Se reporta por año."
          : null,
    rule && byTerm ? `Año: ${ANNUAL_RULE_LABEL[rule].toLowerCase()}.` : null,
    cut === ALL_YEARS ? (rule === "ultimo" ? "Periodo: último dato." : "Periodo: promedio anual.") : null,
    indicator.aggregation === "reportado" ? "Total reportado aparte." : withData.length ? "Total: suma de campus." : null,
  ].filter(Boolean).join(" ");

  const noteItems: [string, ReactNode | null | undefined][] = [
    ["Qué mide", indicator.definition],
    ["Reporta", indicator.source],
    ["Cómo se calcula", compact ? null : calculation],
    ["Lectura", compact ? null : DIRECTION_TEXT[indicator.direction]],
    ["Corte", `${cutText(cut)} · ${campusName}`],
  ];
  const notesOnTop = show.notes && notesLength(noteItems) > NOTES_SIDE_MAX;

  return (
    <article
      className="bol-sheet"
      data-kind="indicador"
      data-notes={(show.notes && !notesOnTop) || undefined}
      data-wide={notesOnTop || undefined}
      data-compact={compact || undefined}
    >
      {show.notes && <Notes items={noteItems} />}
      <div className="bol-sheet__body">
        <SheetHead title={indicator.label} unit={indicator.unit && indicator.unit !== "%" ? indicator.unit : undefined} />
        <div className="bol-anchor">
          <strong>
            {figure(value, indicator.format)}
            {value !== null && unitText === "%" && <span> %</span>}
          </strong>
          <p>
            {value === null ? (
              <>Sin reportar en {cutText(cut).toLowerCase()}.</>
            ) : anchor.period ? (
              <>
                {campusName} · periodo {anchor.period.label}
                {cut !== ALL_YEARS && rule && rule !== "reportado" ? ` · la cifra del año (${RULE_SHORT[rule]}) aún no se completa` : ""}
              </>
            ) : cut === ALL_YEARS ? (
              <>{campusName} · {basis ?? "periodo completo"}</>
            ) : change ? (
              <>
                <span className="bol-change" data-reading={change.reading}>
                  <Arrow dir={value! > previous! ? "up" : value! < previous! ? "down" : "flat"} />
                  {change.label} frente a {cut - 1}
                </span>
                {change.reading === "mejora" ? " · mejora" : change.reading === "empeora" ? " · retrocede" : ""}
                {basis ? ` · ${basis}` : ""}
              </>
            ) : (
              <>{campusName} · sin comparación con {cut - 1}{basis ? ` · ${basis}` : ""}</>
            )}
          </p>
          <TermsLine indicator={indicator} catalog={catalog} cut={cut} campus={campus} />
        </div>

        {showEvolution && byTerm && periodSeries.length > 0 && !compact && (
          <figure>
            <figcaption>Por periodo académico · como se reportó</figcaption>
            <EvolutionChart
              years={periods.map((p) => p.label)}
              series={periodSeries}
              format={indicator.format}
              periodAxis
              highlight={cut === ALL_YEARS ? undefined : cut}
              width={130}
              height={periodSeries.length > 1 ? 34 : 30}
              label="Evolución por periodo académico"
            />
            {periodSeries.length > 1 && <Legend series={periodSeries} />}
          </figure>
        )}

        {(showEvolution || showCampus) && (
          <div className="bol-figures" data-single={!((showEvolution && showCampus) || (compact && byTerm && showEvolution)) || undefined}>
            {showEvolution && compact && byTerm && periodSeries.length > 0 && (
              <figure>
                <figcaption>Por periodo académico</figcaption>
                <EvolutionChart years={periods.map((p) => p.label)} series={periodSeries} format={indicator.format} periodAxis highlight={cut === ALL_YEARS ? undefined : cut} width={74} height={24} label="Evolución por periodo académico" />
              </figure>
            )}
            {showEvolution && (annualSeries.length > 0 || stacked) && (
              <figure>
                <figcaption>{byTerm && rule ? `Cifra del año · ${RULE_SHORT[rule]}` : only ? `Evolución · ${onlyTermText(only)}` : "Evolución por año"}</figcaption>
                {annualFigure()}
              </figure>
            )}
            {showCampus && (
              <figure>
                <figcaption>{campusCaption}</figcaption>
                <HBars items={campusItems} format={indicator.format} width={showEvolution ? 52 : 128} />
              </figure>
            )}
          </div>
        )}

        {show.table &&
          (byTerm ? (
            <PeriodTables
              head={withData.length ? "Campus" : "Cifra"}
              years={years}
              format={indicator.format}
              highlightYear={cut === ALL_YEARS ? undefined : cut}
              grouped={grouped}
              caption={rule ? `Periodos 1 y 2 como se reportaron; en negrita, la cifra del año (${RULE_SHORT[rule]}).` : undefined}
              rows={tableRows.map((row) => ({
                label: row.label,
                strong: row.strong,
                at: (year, term) => valueOf(indicator, year, row.id, term),
                grouped: valueOf(indicator, ALL_YEARS, row.id),
              }))}
            />
          ) : (
            <DataTable
              head={[withData.length ? "Campus" : "Cifra", ...columns]}
              highlightCol={highlightCol}
              rows={tableRows.map((row) => ({
                label: row.label,
                strong: row.strong,
                cells: [
                  ...years.map((y) => figure(valueOf(indicator, y, row.id), indicator.format)),
                  ...(grouped ? [figure(valueOf(indicator, ALL_YEARS, row.id), indicator.format)] : []),
                ],
              }))}
            />
          ))}
      </div>
    </article>
  );
}

/* --- Apertura de capítulo --------------------------------------------------------- */

function ChapterOpener({
  report,
  catalog,
  settings,
  count,
  sections = [],
}: {
  report: Report;
  catalog: OpenDataCatalog;
  settings: BulletinSettings;
  count: number;
  /** Separadores de la ficha que abren sección en este capítulo. */
  sections?: string[];
}) {
  const keys = report.keyIndicators
    .map((id) => report.indicators.find((i) => i.id === id))
    .filter((i): i is Indicator => Boolean(i))
    .slice(0, 4);
  return (
    <section className="bol-chapter" style={{ "--line": `var(--bol-line-${report.line})` } as CSSProperties}>
      <div className="bol-chapter__title">
        <span className="bol-chapter__code">{report.code}</span>
        <div>
          <h2>{report.name}</h2>
          <p>{report.description || report.summary}</p>
        </div>
      </div>
      {keys.length > 0 && (
        <dl className="bol-chapter__keys">
          {keys.map((indicator) => {
            const { value: v, period } = figureAt(indicator, catalog, settings.cut, settings.campus);
            return (
              <div key={indicator.id}>
                <dt>{indicator.label}</dt>
                <dd>
                  <b>{figure(v, indicator.format)}</b>
                  <small>
                    {v === null ? "sin reportar" : indicator.format === "porcentaje" || indicator.unit === "%" ? "%" : indicator.unit}
                    {period ? ` · ${period.label}` : ""}
                  </small>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {sections.length > 0 && (
        <ol className="bol-chapter__sections">
          {sections.map((title, i) => (
            <li key={title + i}>
              <b>{String(i + 1).padStart(2, "0")}</b>
              {title}
            </li>
          ))}
        </ol>
      )}
      <p className="bol-chapter__meta">
        {cutText(settings.cut)} · {catalog.campuses.find((c) => c.id === settings.campus)?.name ?? "Todos los campus"} · {count}{" "}
        {count === 1 ? "hoja" : "hojas"} en este capítulo
      </p>
    </section>
  );
}

/* --- Apertura de sección (separador de la ficha) ------------------------------------ */

function SectionOpener({ report, group, number, total, titles }: { report: Report; group: ReportGroup; number: number; total: number; titles: string[] }) {
  return (
    <section className="bol-group" style={{ "--line": `var(--bol-line-${report.line})` } as CSSProperties}>
      <p className="bol-group__kicker">
        <span className="bol-group__code">{report.code}</span>
        {report.name} · sección {number} de {total}
      </p>
      <div className="bol-group__title">
        <span className="bol-group__number">{String(number).padStart(2, "0")}</span>
        <div>
          <h2>{group.title}</h2>
          {group.description && <p>{group.description}</p>}
        </div>
      </div>
      <p className="bol-group__meta">
        {titles.length} {titles.length === 1 ? "hoja" : "hojas"}: {titles.join(" · ")}
      </p>
    </section>
  );
}

/* --- Hojas de conjuntos -------------------------------------------------------------- */

/**
 * Hoja de un conjunto. Con `wide` (tablas o gráficas de muchas columnas), las
 * notas pasan a una franja encima y el cuerpo toma todo el ancho de la página.
 */
function DatasetSheet({
  title,
  description,
  source,
  notes,
  cut,
  wide = false,
  children,
}: {
  title: string;
  description?: string;
  source: string;
  notes?: [string, ReactNode][];
  /** A qué periodo o corte pertenece: toda hoja se lee sin su pie de página. */
  cut?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const hasCut = (notes ?? []).some(([label]) => label === "Corte");
  const items: [string, ReactNode][] = [["Qué muestra", description], ["Reporta", source], ...(notes ?? []), ...(cut && !hasCut ? ([["Corte", cut]] as [string, ReactNode][]) : [])];
  const onTop = wide || notesLength(items) > NOTES_SIDE_MAX;
  return (
    <article className="bol-sheet" data-notes={onTop ? undefined : true} data-wide={onTop || undefined}>
      <Notes items={items} />
      <div className="bol-sheet__body">
        <SheetHead title={title} />
        {children}
      </div>
    </article>
  );
}

/** Más categorías que estas y la hoja se parte: barras y notas arriba, la tabla sigue en continuación. */
const BREAKDOWN_LONG = 16;
const BREAKDOWN_ROWS = 30;

function breakdownUnit(b: Breakdown, catalog: OpenDataCatalog, settings: BulletinSettings): { node: ReactNode; tight: boolean }[] {
  const years = breakdownYears(b, catalog);
  if (!years.length) return [];
  const byTerm = breakdownByTerm(b);
  const only = breakdownOnlyTerm(b);
  const threshold = b.reserveThreshold ?? 5;
  const withPeriod = settings.cut === ALL_YEARS && itemsAt(b, ALL_YEARS).length > 0;
  const key = withPeriod ? ALL_YEARS : years.includes(settings.cut) ? settings.cut : years[years.length - 1];
  const periods = byTerm ? periodCutsOf(years) : [];
  const termValue = (label: string, year: number, term: Term) => (b.terms?.[year]?.[term] ?? []).find((i) => i.label === label)?.value ?? null;
  const yearItem = (label: string, year: number) => itemsAt(b, year).find((i) => i.label === label);
  const yearValue = (label: string, year: number) => yearItem(label, year)?.value ?? null;
  // La celda de tabla: la cifra, «< 5» si está reservada, «—» si no se reportó.
  const cellOf = (item: { value: number | null; reserved?: boolean } | undefined) =>
    item?.reserved ? `< ${threshold}` : figure(item?.value ?? null, b.format);
  const allLabels = Array.from(
    new Set(years.flatMap((y) => [...itemsAt(b, y), ...(byTerm ? TERMS.flatMap((t) => termItemsAt(b, y, t)) : [])].map((i) => i.label))),
  );
  // En un desglose largo, las categorías sin nadie en ningún corte no llenan la
  // tabla: se nombran en una línea.
  const long = allLabels.length > BREAKDOWN_LONG;
  // Alguien en algún corte: en la cifra del año o, si llega por periodo, en un periodo.
  const someone = (i: { value: number | null; reserved?: boolean } | undefined) => Boolean(i?.reserved) || (i?.value ?? 0) > 0;
  const everyone = (label: string) =>
    years.some(
      (y) =>
        someone(yearItem(label, y)) ||
        (byTerm && TERMS.some((t) => someone((b.terms?.[y]?.[t] ?? []).find((i) => i.label === label)))),
    );
  const labels = long ? allLabels.filter(everyone) : allLabels;
  const nobody = long ? allLabels.filter((l) => !everyone(l)) : [];

  // Barras del corte: la cifra del año; si el año no cierra, su último periodo.
  const keyPeriod =
    byTerm && key !== ALL_YEARS && !itemsAt(b, key).length ? periodCutsOf([key]).filter((p) => termItemsAt(b, p.year, p.term).length).pop() : undefined;
  const items = labels.map((label) => {
    const item = keyPeriod ? (b.terms?.[keyPeriod.year]?.[keyPeriod.term] ?? []).find((i) => i.label === label) : key === ALL_YEARS ? (b.values[key] ?? []).find((i) => i.label === label) : yearItem(label, key);
    return { label, value: item?.value ?? null, reserved: item?.reserved };
  });
  // Barras de un desglose largo: solo lo que tiene cifra; lo reservado se nombra aparte.
  const barItems = long ? items.filter((i) => !i.reserved && (i.value ?? 0) > 0).sort((a, c) => (c.value ?? 0) - (a.value ?? 0)) : items;
  const reservedNow = items.filter((i) => i.reserved).map((i) => i.label);
  const keyText = key === ALL_YEARS ? `Promedio anual ${cutLabel(ALL_YEARS, null)}` : keyPeriod ? `Periodo ${keyPeriod.label}` : only ? cutLabel(key, only) : String(key);

  // Partes de un todo (personas, programas): columnas apiladas. Tasas o más
  // categorías de las que se distinguen por color: líneas o solo tabla.
  const parts = b.unit !== "%" && b.format !== "porcentaje";
  const chartable = labels.length > 0 && labels.length <= SERIES_COLORS.length;
  const lineSeries = (at: (label: string) => (number | null)[]): Series[] =>
    labels.map((label, i) => ({ label, color: SERIES_COLORS[i % SERIES_COLORS.length], values: at(label) })).filter((s) => s.values.some((v) => v !== null));
  const byCategory = (cuts: string[], at: (label: string, index: number) => number | null) =>
    Object.fromEntries(labels.map((label) => [label, Object.fromEntries(cuts.map((c, i) => [c, at(label, i)]))]));

  const rule = b.annualRule;
  const notes: [string, ReactNode][] = [
    ["Corte", key === ALL_YEARS ? `${cutText(ALL_YEARS)} · promedio anual` : `${keyPeriod ? `Periodo ${keyPeriod.label}` : `Corte ${key}`}${key !== settings.cut ? " (último con dato)" : ""}`],
    ["Alcance", "Total institucional"],
    ...(byTerm && rule ? ([["Cómo se reporta", `Por periodo académico (1 y 2). Año: ${RULE_SHORT[rule]}.`]] as [string, ReactNode][]) : []),
    ...(only ? ([["Cómo se reporta", `Una vez al año, en el ${onlyTermText(only).replace(" de cada año", "")}.`]] as [string, ReactNode][]) : []),
    ...(b.reserveThreshold
      ? ([["Reserva", `Con menos de ${threshold} registros la cifra se publica como «< ${threshold}»: en un grupo pequeño señalaría a personas concretas.`]] as [string, ReactNode][])
      : []),
  ];

  const tableRows = labels.map((label) => ({
    label,
    cells: [
      ...years.map((y) => cellOf(yearItem(label, y))),
      ...(withPeriod ? [cellOf((b.values[ALL_YEARS] ?? []).find((i) => i.label === label))] : []),
    ],
  }));
  const tableHead = ["Categoría", ...years.map((y) => (only ? cutLabel(y, only) : String(y))), ...(withPeriod ? [cutLabel(ALL_YEARS, null)] : [])];
  const tableHighlight = withPeriod ? years.length : years.indexOf(key);
  // Tabla larga: la hoja lleva las primeras filas y el resto sigue en continuación.
  const firstRows = long && tableRows.length > BREAKDOWN_ROWS - 10 ? BREAKDOWN_ROWS - 14 : tableRows.length;
  const rest: { from: number; rows: typeof tableRows }[] = [];
  for (let i = firstRows; i < tableRows.length; i += BREAKDOWN_ROWS) rest.push({ from: i, rows: tableRows.slice(i, i + BREAKDOWN_ROWS) });

  // Por periodo, cada año lleva tres columnas: con muchas categorías las tablas
  // no caben bajo las barras y van enteras a la hoja siguiente.
  const periodTables = byTerm ? (
    <PeriodTables
      head="Categoría"
      years={years}
      format={b.format}
      highlightYear={key === ALL_YEARS ? undefined : key}
      grouped={withPeriod ? cutLabel(ALL_YEARS, null) : undefined}
      caption={rule ? `Periodos 1 y 2 como se reportaron; en negrita, la cifra del año (${RULE_SHORT[rule]}).` : undefined}
      rows={labels.map((label) => ({
        label,
        at: (year, term) => (term ? termValue(label, year, term) : yearValue(label, year)),
        grouped: (b.values[ALL_YEARS] ?? []).find((i) => i.label === label)?.value ?? null,
      }))}
    />
  ) : null;

  const sheet = (
    <DatasetSheet title={b.title} source={b.source} notes={notes}>
      {(!byTerm || !chartable) && (
        <figure className="bol-wide">
          <figcaption>{keyText} · {b.unit}{long ? " · categorías con cifra" : ""}</figcaption>
          <HBars items={barItems} format={b.format} share={parts} width={128} reservedThreshold={threshold} />
        </figure>
      )}
      {long && (reservedNow.length > 0 || nobody.length > 0) && (
        <p className="bol-reserve">
          {reservedNow.length > 0 && (
            <>
              <b>Con menos de {threshold} en {keyText}:</b> {reservedNow.join(" · ")}.{" "}
            </>
          )}
          {nobody.length > 0 && (
            <>
              <b>Sin registros en ningún corte:</b> {nobody.join(" · ")}.
            </>
          )}
        </p>
      )}
      {byTerm && chartable && (
        <figure>
          <figcaption>Por periodo académico · como se reportó · {b.unit}</figcaption>
          {parts ? (
            <StackedColumns
              periods={periods.map((p) => p.label)}
              categories={labels}
              values={byCategory(periods.map((p) => p.label), (label, i) => termValue(label, periods[i].year, periods[i].term))}
              format={b.format}
              periodAxis
              width={130}
              height={40}
            />
          ) : (
            <EvolutionChart
              years={periods.map((p) => p.label)}
              series={lineSeries((label) => periods.map((p) => termValue(label, p.year, p.term)))}
              format={b.format}
              periodAxis
              width={130}
              height={34}
              label="Por periodo académico"
            />
          )}
          <SwatchLegend labels={labels} />
        </figure>
      )}
      {byTerm && chartable && (
        <figure>
          <figcaption>Cifra del año{rule ? ` · ${RULE_SHORT[rule]}` : ""}</figcaption>
          {parts ? (
            <StackedColumns
              periods={years.map(String)}
              categories={labels}
              values={byCategory(years.map(String), (label, i) => yearValue(label, years[i]))}
              format={b.format}
              highlight={key === ALL_YEARS ? undefined : String(key)}
              width={130}
              height={36}
            />
          ) : (
            <EvolutionChart
              years={years}
              series={lineSeries((label) => years.map((y) => yearValue(label, y)))}
              format={b.format}
              highlight={key === ALL_YEARS ? undefined : key}
              width={130}
              height={30}
            />
          )}
        </figure>
      )}
      {byTerm ? (
        !long && periodTables
      ) : (
        <DataTable
          head={tableHead}
          highlightCol={tableHighlight}
          caption={only ? `Cifras del ${onlyTermText(only)}.` : undefined}
          rows={tableRows.slice(0, firstRows)}
        />
      )}
    </DatasetSheet>
  );

  return [
    { node: sheet, tight: false },
    ...(byTerm && long
      ? [
          {
            tight: true,
            node: (
              <TableContinuation title={b.title} from={1} to={labels.length} total={labels.length}>
                {periodTables}
              </TableContinuation>
            ),
          },
        ]
      : []),
    ...(byTerm ? [] : rest).map(({ from, rows }) => ({
      tight: true,
      node: (
        <TableContinuation title={b.title} from={from + 1} to={from + rows.length} total={tableRows.length}>
          <DataTable head={tableHead} highlightCol={tableHighlight} rows={rows} />
        </TableContinuation>
      ),
    })),
  ];
}

function mapUnit(map: MapDataset, catalog: OpenDataCatalog, settings: BulletinSettings): ReactNode | null {
  // Por municipio no es un mapa departamental: su hoja es dei:origen.
  if (map.mode === "municipio") return null;
  const key = mapKey(map, settings.cut, catalog);
  if (key === undefined) return null;
  const active = sites(catalog).map((c) => c.id).filter((id) => settings.campus === "todas" || id === settings.campus);
  const totals: Record<string, number> = {};
  for (const site of active) {
    for (const [code, v] of Object.entries(map.values[key]?.[site] ?? {})) {
      if (isWorldMap(map.mode) && code === "COL") continue;
      totals[code] = (totals[code] ?? 0) + v;
    }
  }
  const ranking = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!ranking.length) return null;
  const grand = ranking.reduce((s, [, v]) => s + v, 0);
  const max = ranking[0][1];
  const world = isWorldMap(map.mode);
  const routes = isMobilityMap(map.mode)
    ? ranking.slice(0, 14).map(([code, v]) => ({ code, incoming: map.mode === "entrante", strength: Math.sqrt(v / max) }))
    : undefined;
  const top = ranking.slice(0, world ? 12 : 14);
  const cutNote =
    map.reporting === "global"
      ? "Dato global, sin año"
      : key === ALL_YEARS
        ? `${cutText(ALL_YEARS)} · ${world ? "total" : "promedio anual"}`
        : `Corte ${key}${key !== settings.cut ? " (último con dato)" : ""}`;
  // La descripción del portal habla de líneas animadas y filtros: en papel se
  // dice lo que la hoja dibuja.
  const printed: Record<string, string> = {
    origen: "Personas por departamento de procedencia. El tono más oscuro es el que más aporta; los puntos marcan los campus.",
    cobertura: "Personas atendidas por departamento. El tono más oscuro es el de mayor cobertura; los puntos marcan los campus.",
    entrante: "Participantes que llegan de cada país a la UDES. Las rutas van del país de origen a Colombia; su grosor crece con la cifra.",
    saliente: "Participantes que salen de la UDES a cada país. Las rutas van de Colombia al país de destino; su grosor crece con la cifra.",
    convenios: "Convenios con cada país. El tono más oscuro es el país con más convenios.",
  };
  return (
    <DatasetSheet
      title={map.title}
      description={printed[map.mode] ?? map.description}
      source={map.source}
      notes={[
        ["Corte", cutNote],
        ["Total", `${formatCount(grand)} ${map.unit} · ${ranking.length} ${world ? (ranking.length === 1 ? "país" : "países") : ranking.length === 1 ? "departamento" : "departamentos"}`],
      ]}
    >
      <div className="bol-map-sheet" data-world={world || undefined}>
        <figure>
          <ChoroplethMap kind={world ? "mundo" : "colombia"} totals={totals} routes={routes} sites={active} />
          <MapLegend values={Object.values(totals)} unit={map.unit} />
        </figure>
        <DataTable
          head={[world ? "País" : "Departamento", map.unit || "Cifra", "%"]}
          rows={top.map(([code, v]) => ({
            label: NAMES[code] ?? code,
            cells: [formatCount(v), formatValue((v / grand) * 100, "decimal")],
          }))}
          caption={ranking.length > top.length ? `Los ${top.length} primeros de ${ranking.length}` : undefined}
        />
      </div>
    </DatasetSheet>
  );
}

function heatmapUnit(h: HeatmapData, period: string): ReactNode | null {
  const all = h.values.flat().filter((v): v is number => v !== null);
  if (!all.length) return null;
  const max = Math.max(...all);
  const min = Math.min(...all);
  return (
    <DatasetSheet title={h.title} description={h.description} source={h.source} notes={[["Casilla vacía", h.emptyMeaning], ["Unidad", h.unit]]} cut={period} wide={h.columns.length > 7}>
      <DataTable
        head={[h.rowLabel, ...h.columns]}
        rows={h.rows.map((row, r) => ({
          label: row,
          cells: h.columns.map((_, c) => figure(h.values[r]?.[c] ?? null, h.format)),
          shade: h.columns.map((_, c) => {
            const v = h.values[r]?.[c];
            return v === null || v === undefined ? null : max === min ? 0.5 : (v - min) / (max - min);
          }),
        }))}
      />
    </DatasetSheet>
  );
}

/** Ancho al que se dibuja la tubería antes de escalarla al ancho del cuerpo. */
const PIPELINE_WIDTH = 980;

function pipelineUnit(p: PipelineData, settings: BulletinSettings, catalog: OpenDataCatalog, period: string): ReactNode | null {
  const cohorts = p.cohorts.filter((c) => c.campus === settings.campus);
  const list = cohorts.length ? cohorts : p.cohorts.filter((c) => c.campus === "todas");
  if (!list.length && !p.cohorts.length) return null;
  const rows = list.length ? list : p.cohorts;
  const measure = p.measure ?? "estudiantes";
  const campusName = catalog.campuses.find((c) => c.id === settings.campus)?.name ?? "Todos los campus";
  // La misma cohorte que dibuja la tubería de la web: la de más etapas con dato y, a igualdad, la más reciente.
  const filled = (c: PipelineData["cohorts"][number]) => c.remaining.filter((v) => v !== null).length;
  const drawn = rows.slice().sort((a, b) => filled(a) - filled(b) || String(a.cohort).localeCompare(String(b.cohort))).pop();
  const percentText = (v: number | null) => (v === null ? "—" : `${formatValue(v, "decimal")} %`);
  // Lo que dibuja la tubería: % de la cohorte que ya se retiró al llegar a cada etapa.
  // Es la única fila en %: con deserción es la cifra capturada; con permanencia,
  // su complemento (repetir ambas sería contar dos veces la misma razón).
  const cumulative = (c: PipelineData["cohorts"][number]) => {
    const intake = c.remaining[0];
    return p.stages.map((_, i) => {
      const v = c.remaining[i];
      return intake && v !== null && v !== undefined ? (1 - v / intake) * 100 : null;
    });
  };

  return (
    <DatasetSheet
      title={p.title}
      description={p.description}
      source={p.source}
      notes={[
        ["Cifra", "Deserción acumulada en % de la cohorte que entró"],
        ["Se captura", { estudiantes: "Estudiantes que siguen en cada etapa", permanencia: "% del flujo que sigue en cada etapa", desercion: "Deserción acumulada en cada etapa" }[measure]],
      ]}
      cut={rows.length > 1 ? `Cohortes ${rows[0].cohort} a ${rows[rows.length - 1].cohort}` : `${rows[0].cohort} · ${period}`}
      wide
    >
      {/* El mismo dibujo de la ficha web, quieto y escalado al ancho de la página. */}
      <div className="bol-fit" data-natural={PIPELINE_WIDTH}>
        <LeakyPipeline data={p} campus={settings.campus} campusName={campusName} print={{ width: PIPELINE_WIDTH }} />
      </div>
      <DataTable
        head={["Cohorte", ...p.stages]}
        caption={`Deserción acumulada en % de la cohorte${measure === "estudiantes" ? "; debajo, los estudiantes que siguen" : ""}.${rows.length > 1 && drawn ? ` La tubería dibuja la cohorte ${drawn.cohort}.` : ""}`}
        rows={rows.flatMap((c) => {
          const lost = cumulative(c);
          const mark = rows.length > 1 && c === drawn;
          return [
            {
              strong: mark,
              label: `${c.cohort}${mark ? " (dibujada)" : ""}`,
              cells: lost.map((v) => percentText(v)),
              shade: lost.map((v) => (v === null ? null : v / 100)),
            },
            ...(measure === "estudiantes"
              ? [{ label: `${c.cohort} · estudiantes`, cells: p.stages.map((_, i) => figure(c.remaining[i] ?? null, "entero")) }]
              : []),
          ];
        })}
      />
    </DatasetSheet>
  );
}

function historyUnit(h: HistoryData): ReactNode | null {
  const span = h.periods.length > 1 ? `${h.periods[0]} a ${h.periods[h.periods.length - 1]}` : h.periods[0];
  if (!h.periods.length) return null;
  return (
    <DatasetSheet title={h.title} description={h.description} source={h.source} notes={[["Unidad", h.unit]]} cut={`Periodos ${span}`} wide={h.periods.length > 7}>
      <figure>
        <figcaption>{h.totalLabel} por periodo y categoría</figcaption>
        <StackedColumns periods={h.periods} categories={h.categories} values={h.values} format={h.format} width={h.periods.length > 7 ? 178 : 130} />
        {h.categories.length > 1 && <SwatchLegend labels={h.categories} />}
      </figure>
      <DataTable
        head={["Categoría", ...h.periods]}
        rows={[
          ...h.categories.map((cat) => ({ label: cat, cells: h.periods.map((p) => figure(h.values[cat]?.[p] ?? null, h.format)) })),
          { label: h.totalLabel, strong: true, cells: h.periods.map((p) => figure(h.total[p] ?? null, h.format)) },
        ]}
      />
    </DatasetSheet>
  );
}

/* --- Ranking universitario ----------------------------------------------------------- */

function StarsPrint({ value }: { value: number }) {
  return (
    <span className="bol-rank__stars" aria-label={`${value} de 5 estrellas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" data-on={i < value || undefined} aria-hidden="true">
          <path d="M10 1.6l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.5l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z" />
        </svg>
      ))}
    </span>
  );
}

/** Las ediciones de un ranking que traen posición en ese ámbito, hasta el corte. */
function rankPoints(r: RankingData, scope: RankScope, cut: number): { year: number; rank: ParsedRank }[] {
  return r.editions
    .filter((e) => cut === ALL_YEARS || e.year <= cut)
    .map((e) => ({ year: e.year, rank: rankOf(e, scope) }))
    .filter((pt): pt is { year: number; rank: ParsedRank } => pt.rank !== null);
}

/**
 * Hoja de un ranking: la edición del corte (o la más reciente), sus posiciones
 * con la variación frente a la edición anterior, estrellas, ODS, áreas, campos
 * propios y la historia de ediciones.
 */
function rankingUnit(r: RankingData, settings: BulletinSettings): ReactNode | null {
  const edition = latestEdition(r, settings.cut === ALL_YEARS ? undefined : settings.cut);
  if (!edition) return null;
  const system = RANKING_SYSTEMS[r.system];
  const previous = previousEdition(r, edition);
  const scopes = (["global", "regional", "national"] as RankScope[]).filter((scope) => rankOf(edition, scope));
  const history = r.editions.filter((e) => e.global_rank || e.regional_rank || e.national_rank || e.score !== null);
  const rankText = (text: string) => parseRank(text)?.text ?? "—";
  const editionNote =
    settings.cut !== ALL_YEARS && edition.year !== settings.cut ? `Edición ${edition.year} (la más reciente hasta ${settings.cut})` : `Edición ${edition.year}`;
  // La traza toma el ámbito más cercano con al menos dos ediciones: en papel no
  // hay selector, y el puesto en Colombia es el que primero se busca.
  const traceScope = preferredScope((scope) => rankPoints(r, scope, settings.cut).length > 1);
  const trace: RankLine | null = traceScope
    ? { label: rankingShortLabel(r), color: r.accent, points: rankPoints(r, traceScope, settings.cut) }
    : null;
  return (
    <DatasetSheet
      title={r.title}
      description={r.description || system.label}
      source={r.source}
      notes={[
        ["Ranking", system.label],
        ["Corte", editionNote],
        ["Lectura", "El puesto 1 es el primero: bajar el número es subir en el ranking."],
      ]}
      wide
    >
      <div className="bol-rank" style={{ "--rk": r.accent } as CSSProperties}>
        {(scopes.length > 0 || edition.score !== null) && (
          <div className="bol-rank__medals">
            {scopes.map((scope) => {
              const rank = rankOf(edition, scope)!;
              const change = previous ? rankChange(rank, rankOf(previous, scope)) : null;
              return (
                <div key={scope} data-lead={scope === scopes[0] || undefined}>
                  <span>{SCOPE_LABEL[scope]}</span>
                  <strong data-band={rank.band || undefined}>{rank.band ? rank.text : `#${rank.text.replace("=", "")}`}</strong>
                  {change && (
                    <small data-tone={change.places > 0 ? "up" : change.places < 0 ? "down" : undefined}>
                      {change.label} frente a {previous!.year}
                    </small>
                  )}
                </div>
              );
            })}
            {edition.score !== null && (
              <div>
                <span>Puntaje</span>
                <strong>{formatValue(edition.score, "decimal")}</strong>
                {edition.evaluated && <small>entre {formatValue(edition.evaluated, "entero")} instituciones</small>}
              </div>
            )}
          </div>
        )}

        {trace && traceScope && (
          <figure>
            <figcaption>
              Evolución de la posición {SCOPE_LABEL[traceScope].toLowerCase()} · el puesto 1 arriba, escala logarítmica
            </figcaption>
            <RankTrace line={trace} width={178} height={38} label={`Evolución de la posición de ${r.title}`} />
          </figure>
        )}

        {edition.stars.length > 0 && (
          <figure>
            <figcaption>Estrellas por categoría · edición {edition.year}</figcaption>
            <ul className="bol-rank__star-list">
              {edition.stars.map((star) => (
                <li key={star.category}>
                  <span>{star.category}</span>
                  <StarsPrint value={star.stars} />
                </li>
              ))}
            </ul>
          </figure>
        )}

        {edition.sdgs.length > 0 && (
          <DataTable
            caption={`ODS en los que participó · ${edition.sdgs.length} de 17`}
            head={["ODS", "Mundial", "Colombia", "Puntaje"]}
            rows={edition.sdgs.map((sdg) => ({
              label: (
                <span className="bol-rank__sdg-label">
                  <i style={{ "--sdg": SDGS[sdg.sdg - 1].color } as CSSProperties}>{sdg.sdg}</i>
                  {SDGS[sdg.sdg - 1].name}
                </span>
              ),
              cells: [rankText(sdg.global_rank), rankText(sdg.national_rank), sdg.score === null || sdg.score === undefined ? "—" : formatValue(Number(sdg.score), "decimal")],
            }))}
          />
        )}

        {edition.subjects.length > 0 && (
          <DataTable
            caption="Posición por área"
            head={["Área", "Mundial", "Colombia"]}
            rows={edition.subjects.map((subject) => ({ label: subject.subject, cells: [rankText(subject.global_rank), rankText(subject.national_rank)] }))}
          />
        )}

        {edition.custom.length > 0 && (
          <DataTable caption="Otros resultados" head={["Campo", "Resultado"]} rows={edition.custom.map((c) => ({ label: c.label, cells: [c.value || "—"] }))} />
        )}

        {history.length > 1 && (
          <DataTable
            caption="Ediciones"
            head={["Edición", SCOPE_LABEL.global, SCOPE_LABEL.regional, SCOPE_LABEL.national, "Puntaje"]}
            highlightCol={undefined}
            rows={history.map((e) => ({
              label: String(e.year),
              strong: e.year === edition.year,
              cells: [rankText(e.global_rank), rankText(e.regional_rank), rankText(e.national_rank), e.score === null ? "—" : formatValue(e.score, "decimal")],
            }))}
          />
        )}
        {edition.note && <p className="bol-rank__note">{edition.note}</p>}
      </div>
    </DatasetSheet>
  );
}

/**
 * Hoja de conjunto: todos los rankings del informe en un mismo lienzo, edición
 * a edición. El ámbito es el más cercano que reporten al menos dos rankings
 * —Colombia, si no Latinoamérica, si no el mundial— y la hoja lo dice.
 *
 * Debajo, la tabla con los mismos puestos: la gráfica enseña la forma del
 * recorrido, la tabla da la cifra y deja la hoja legible sin el color.
 */
function rankingsEvolutionUnit(report: Report, settings: BulletinSettings): ReactNode | null {
  const rankings = report.rankings ?? [];
  const scope = preferredScope((sc) => rankings.filter((r) => rankPoints(r, sc, settings.cut).length > 1).length >= 2);
  if (!scope) return null;
  const lines: RankLine[] = rankings
    .map((r) => ({ label: rankingShortLabel(r), color: r.accent, points: rankPoints(r, scope, settings.cut) }))
    .filter((line) => line.points.length > 0);
  if (lines.length < 2) return null;

  const years = Array.from(new Set(lines.flatMap((line) => line.points.map((pt) => pt.year)))).sort((a, b) => a - b);
  const cutNote = settings.cut === ALL_YEARS ? "Todas las ediciones publicadas" : `Ediciones hasta ${settings.cut}`;
  return (
    <DatasetSheet
      title="Evolución de los rankings"
      description={`Cómo se ha movido la UDES en cada ranking que sigue Planeación, edición a edición, en su posición ${SCOPE_LABEL[scope].toLowerCase()}.`}
      source={Array.from(new Set(rankings.map((r) => r.source).filter(Boolean))).join(" · ")}
      notes={[
        ["Ámbito", `${SCOPE_LABEL[scope]} · el más cercano que reportan al menos dos rankings`],
        ["Corte", cutNote],
        ["Lectura", "El puesto 1 es el primero: bajar el número es subir en el ranking. La escala es logarítmica, así que un puesto nacional y uno mundial caben en el mismo dibujo."],
        ["Bandas", "Un ranking que publica un tramo («801–1000») lo ocupa entero en vertical; no se inventa un punto medio."],
      ]}
      wide
    >
      <RankEvolutionChart lines={lines} width={178} label={`Evolución de la posición ${SCOPE_LABEL[scope].toLowerCase()} en ${lines.length} rankings`} />
      <DataTable
        caption={`Posición ${SCOPE_LABEL[scope].toLowerCase()} por edición`}
        head={["Ranking", ...years.map(String)]}
        rows={lines.map((line) => ({
          label: line.label,
          cells: years.map((year) => {
            const pt = line.points.find((point) => point.year === year);
            return pt ? (pt.rank.band ? pt.rank.text : `#${pt.rank.text.replace("=", "")}`) : "—";
          }),
        }))}
      />
    </DatasetSheet>
  );
}

/** Continuación de una tabla larga: sin notas, con el encabezado de la tabla repetido. */
function TableContinuation({ title, from, to, total, children }: { title: string; from: number; to: number; total: number; children: ReactNode }) {
  return (
    <article className="bol-sheet bol-sheet--cont">
      <p className="bol-cont">
        <b>{title}</b> · continuación · filas {from} a {to} de {total}
        {to < total ? " · continúa" : ""}
      </p>
      {children}
    </article>
  );
}

function tableUnits(t: TableData, period: string): { node: ReactNode; tight: boolean }[] {
  if (!t.rows.length) return [];
  const [first, ...rest] = t.columns;
  const cell = (row: Record<string, string | number | null>, col: TableData["columns"][number]) => {
    const v = row[col.key];
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "number" && col.format !== "texto" && col.format !== "enlace") return formatValue(v, col.format);
    return String(v);
  };
  const table = (rows: Record<string, string | number | null>[]) => (
    <DataTable head={t.columns.map((c) => c.label)} rows={rows.map((row) => ({ label: cell(row, first), cells: rest.map((c) => cell(row, c)) }))} />
  );
  // La hoja lleva las primeras filas; el resto sigue en tramos cortos que
  // llenan el final de la página y continúan en la siguiente.
  const chunks: { from: number; rows: Record<string, string | number | null>[] }[] = [{ from: 0, rows: t.rows.slice(0, TABLE_FIRST) }];
  for (let i = TABLE_FIRST; i < t.rows.length; i += TABLE_NEXT) chunks.push({ from: i, rows: t.rows.slice(i, i + TABLE_NEXT) });
  // Un ranking con una columna numérica se lee mejor con barras encima de la tabla.
  const measureCol = t.display === "ranking" ? t.columns.find((c) => c.format !== "texto" && c.format !== "enlace") : undefined;
  const wide = t.columns.length > 5;
  return chunks.map(({ from, rows }, i) =>
    i === 0
      ? {
          tight: false,
          node: (
            <DatasetSheet
              title={t.title}
              description={t.description}
              source={t.source}
              notes={chunks.length > 1 ? [["Filas", `1 a ${rows.length} de ${t.rows.length} · continúa`]] : undefined}
              cut={period}
              wide={wide}
            >
              {measureCol && (
                <figure>
                  <figcaption>{measureCol.label} · los {Math.min(10, t.rows.length)} primeros</figcaption>
                  <HBars
                    items={t.rows.slice(0, 10).map((row) => ({ label: String(row[first.key] ?? "—"), value: typeof row[measureCol.key] === "number" ? (row[measureCol.key] as number) : null }))}
                    format={measureCol.format === "texto" || measureCol.format === "enlace" ? "entero" : measureCol.format}
                    width={wide ? 178 : 130}
                  />
                </figure>
              )}
              {table(rows)}
            </DatasetSheet>
          ),
        }
      : {
          tight: true,
          node: (
            <TableContinuation title={t.title} from={from + 1} to={from + rows.length} total={t.rows.length}>
              {table(rows)}
            </TableContinuation>
          ),
        },
  );
}

/* --- Formato ejecutivo -------------------------------------------------------------- */

/** Cifras clave de un informe: sus KPI incluidos con datos; sin KPI con datos, los primeros incluidos con datos. */
function executiveIndicators(report: Report, entry: BulletinSettings["reports"][number], catalog: OpenDataCatalog, limit: number): Indicator[] {
  const included = entry.indicators
    .filter((item) => item.include)
    .map((item) => report.indicators.find((i) => i.id === item.id))
    .filter((i): i is Indicator => Boolean(i) && indicatorHasData(i!, catalog));
  const keys = report.keyIndicators.map((id) => included.find((i) => i.id === id)).filter((i): i is Indicator => Boolean(i));
  // Los KPI primero; si son menos que el límite, se completan con los demás.
  return [...keys, ...included.filter((i) => !keys.includes(i))].slice(0, limit);
}

interface Highlight {
  key: string;
  title: string;
  value: string;
  unit: string;
  note: string;
}

/**
 * Lo esencial de los conjuntos incluidos de un informe (mapas, históricos,
 * desgloses, tablas, tuberías). Un informe que reporta sobre todo en conjuntos
 * —movilidad por país, producción en tablas— también tiene su ficha ejecutiva.
 */
function datasetHighlights(report: Report, entry: BulletinSettings["reports"][number], catalog: OpenDataCatalog, settings: BulletinSettings, limit: number): Highlight[] {
  const list: Highlight[] = [];
  for (const item of entry.datasets) {
    if (!item.include || list.length >= limit) continue;
    const kind = item.ref.slice(0, item.ref.indexOf(":"));
    const key = item.ref.slice(item.ref.indexOf(":") + 1);
    if (kind === "mapa") {
      const m = report.maps?.find((x) => x.id === key);
      const at = m ? mapKey(m, settings.cut, catalog) : undefined;
      if (!m || at === undefined) continue;
      const totals: Record<string, number> = {};
      for (const [site, codes] of Object.entries(m.values[at] ?? {})) {
        if (site === "todas" && sites(catalog).length) continue;
        if (settings.campus !== "todas" && site !== settings.campus) continue;
        for (const [code, v] of Object.entries(codes ?? {})) {
          if (isWorldMap(m.mode) && code === "COL") continue;
          totals[code] = (totals[code] ?? 0) + v;
        }
      }
      const ranking = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      if (!ranking.length) continue;
      const grand = ranking.reduce((sum, [, v]) => sum + v, 0);
      const world = isWorldMap(m.mode);
      list.push({
        key: item.ref,
        title: m.title,
        value: formatCount(grand),
        unit: m.unit,
        note: `${m.reporting === "global" ? "Dato global" : at === ALL_YEARS ? cutLabel(ALL_YEARS, null) : `Corte ${at}`} · ${ranking.length} ${world ? (ranking.length === 1 ? "país" : "países") : ranking.length === 1 ? "departamento" : "departamentos"} · principal: ${NAMES[ranking[0][0]] ?? ranking[0][0]}`,
      });
    } else if (kind === "historico") {
      const h = report.histories?.find((x) => x.id === key);
      const shown = h?.periods.filter((p) => h.total[p] !== null && h.total[p] !== undefined) ?? [];
      if (!h || !shown.length) continue;
      const last = shown[shown.length - 1];
      const first = shown[0];
      list.push({
        key: item.ref,
        title: h.title,
        value: figure(h.total[last] ?? null, h.format),
        unit: h.unit,
        note: shown.length > 1 ? `${last} · en ${first}: ${figure(h.total[first] ?? null, h.format)}` : last,
      });
    } else if (kind === "desglose") {
      const b = report.breakdowns.find((x) => x.id === key);
      const years = b ? breakdownYears(b, catalog) : [];
      if (!b || !years.length) continue;
      const at = settings.cut === ALL_YEARS && itemsAt(b, ALL_YEARS).length ? ALL_YEARS : years.includes(settings.cut) && itemsAt(b, settings.cut).length ? settings.cut : years.filter((y) => itemsAt(b, y).length).pop();
      const lastTerm = at === undefined ? periodCutsOf(years).filter((p) => termItemsAt(b, p.year, p.term).length).pop() : undefined;
      const items = at !== undefined ? itemsAt(b, at) : lastTerm ? termItemsAt(b, lastTerm.year, lastTerm.term) : [];
      if (!items.length) continue;
      const top = items.slice().sort((a, c) => (c.value ?? 0) - (a.value ?? 0))[0];
      const parts = b.unit !== "%" && b.format !== "porcentaje";
      const total = items.reduce((sum, i) => sum + (i.value ?? 0), 0);
      const when = at === ALL_YEARS ? cutLabel(ALL_YEARS, null) : at !== undefined ? String(at) : lastTerm!.label;
      list.push({
        key: item.ref,
        title: b.title,
        value: figure(parts ? total : top.value, b.format),
        unit: parts ? b.unit : `${b.unit} · ${top.label}`,
        note: parts ? `${when} · mayor: ${top.label} (${formatValue(((top.value ?? 0) / (total || 1)) * 100, "decimal")} %)` : `${when} · la categoría más alta`,
      });
    } else if (kind === "medallero") {
      const board = report.medals?.find((x) => x.id === key);
      const head = board ? medalHeadline(board, settings.cut) : null;
      if (!head) continue;
      list.push({ key: item.ref, title: head.title, value: head.value, unit: head.unit, note: head.note });
    } else if (kind === "ranking") {
      const r = report.rankings?.find((x) => x.id === key);
      const edition = r ? latestEdition(r, settings.cut === ALL_YEARS ? undefined : settings.cut) : undefined;
      if (!r || !edition) continue;
      const scope = (["global", "regional", "national"] as RankScope[]).find((s) => rankOf(edition, s));
      const rank = scope ? rankOf(edition, scope)! : null;
      const previous = previousEdition(r, edition);
      const change = scope && previous ? rankChange(rank, rankOf(previous, scope)) : null;
      list.push({
        key: item.ref,
        title: r.title,
        value: rank ? (rank.band ? rank.text : `#${rank.text.replace("=", "")}`) : `${edition.sdgs.length || edition.stars.length}`,
        unit: rank && scope ? `puesto ${SCOPE_LABEL[scope].toLowerCase()}` : edition.sdgs.length ? "ODS" : "categorías con estrellas",
        note: `Edición ${edition.year}${change ? ` · ${change.label} frente a ${previous!.year}` : ""}`,
      });
    } else if (kind === "tyt") {
      const parsed = parseTytKey(report, key);
      const highlight = parsed ? tytHighlight(parsed.data, parsed.competency, settings.cut) : null;
      if (highlight) list.push({ key: item.ref, ...highlight });
    } else if (kind === "saber") {
      const parsed = parseSaberKey(key);
      const sp = parsed ? report.saberPro?.find((x) => x.id === parsed.id) : undefined;
      const highlight = sp && parsed ? saberHighlight(sp, parsed.competency, settings.cut) : null;
      if (highlight) list.push({ key: item.ref, ...highlight });
    } else if (kind === "tabla") {
      const t = report.tables?.find((x) => x.id === key);
      if (!t || !t.rows.length) continue;
      list.push({ key: item.ref, title: t.title, value: formatCount(t.rows.length), unit: t.rows.length === 1 ? "registro" : "registros", note: t.description || "Detalle en el boletín completo" });
    } else if (kind === "tuberia") {
      const pl = (report.pipelines ?? (report.pipeline ? [report.pipeline] : [])).find((x) => x.id === key);
      const cohorts = pl ? Array.from(new Set(pl.cohorts.map((c) => String(c.cohort)))) : [];
      if (!pl || !cohorts.length) continue;
      list.push({
        key: item.ref,
        title: pl.title,
        value: formatCount(cohorts.length),
        unit: cohorts.length === 1 ? "cohorte" : "cohortes",
        note: cohorts.length > 1 ? `${cohorts[0]} a ${cohorts[cohorts.length - 1]} · ${pl.stages.length} etapas` : `${cohorts[0]} · ${pl.stages.length} etapas`,
      });
    }
  }
  return list;
}

function unitOf(indicator: Indicator) {
  return indicator.format === "porcentaje" || indicator.unit === "%" ? "%" : indicator.unit;
}

/** Lectura de la cifra del corte: variación frente al año anterior o cómo salió del periodo. */
function readingOf(indicator: Indicator, catalog: OpenDataCatalog, settings: BulletinSettings, campusName: string): ReactNode {
  const { cut, campus } = settings;
  const { value, period } = figureAt(indicator, catalog, cut, campus);
  if (value === null) return "Sin reportar";
  if (period) return `Periodo ${period.label}`;
  if (cut === ALL_YEARS) return periodBasisOf(indicator, campus) ?? "periodo completo";
  const previous = valueOf(indicator, cut - 1, campus);
  const change = changeBetween(indicator, value, previous);
  if (!change) return `${campusName} · sin comparación con ${cut - 1}`;
  return (
    <span className="bol-change" data-reading={change.reading}>
      <Arrow dir={value > previous! ? "up" : value < previous! ? "down" : "flat"} />
      {change.label} frente a {cut - 1}
    </span>
  );
}

interface ExecutiveItem {
  report: Report;
  indicators: Indicator[];
  sets: Highlight[];
}

function ExecutiveSummary({ items, catalog, settings }: { items: ExecutiveItem[]; catalog: OpenDataCatalog; settings: BulletinSettings }) {
  return (
    <section className="bol-summary">
      <h2>Resumen ejecutivo</h2>
      <p className="bol-summary__lede">
        Las cifras titulares de cada informe · {cutText(settings.cut)}. El detalle de cada una está en su capítulo.
      </p>
      <ol className="bol-summary__list">
        {items.map(({ report, indicators, sets }) => (
          <li key={report.slug} style={{ "--line": `var(--bol-line-${report.line})` } as CSSProperties}>
            <a className="bol-summary__report" href={`#cap-${report.slug}`}>
              <span className="bol-chapter__code">{report.code}</span>
              <span>{report.name}</span>
            </a>
            <dl>
              {indicators.slice(0, 3).map((indicator) => {
                const { value: v, period } = figureAt(indicator, catalog, settings.cut, settings.campus);
                return (
                  <div key={indicator.id}>
                    <dt>{indicator.label}</dt>
                    <dd>
                      <b>{figure(v, indicator.format)}</b>
                      <small>
                        {v === null ? "sin reportar" : unitOf(indicator)}
                        {period ? ` · ${period.label}` : ""}
                      </small>
                    </dd>
                  </div>
                );
              })}
              {sets.slice(0, Math.max(0, 3 - indicators.length)).map((set) => (
                <div key={set.key}>
                  <dt>{set.title}</dt>
                  <dd>
                    <b>{set.value}</b>
                    <small>{set.unit}</small>
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* --- Resumen ejecutivo del boletín completo: microtableros ------------------------ */

/** Cifras por microtablero; las demás se cuentan y quedan en el capítulo. */
const BOARD_TILES = 8;

function SummaryIntro({ items, catalog, settings }: { items: ExecutiveItem[]; catalog: OpenDataCatalog; settings: BulletinSettings }) {
  const campusName = catalog.campuses.find((c) => c.id === settings.campus)?.name ?? "Todos los campus";
  const total = items.reduce((s, i) => s + i.indicators.length + i.sets.length, 0);
  return (
    <section className="bol-summary bol-summary--boards">
      <h2>Resumen ejecutivo</h2>
      <p className="bol-summary__lede">
        La Universidad de Santander en una mirada: un tablero por informe con las cifras que reporta cada oficina · {cutText(settings.cut)} ·{" "}
        {campusName}. Para leer una cifra con su definición, su evolución por campus y su tabla, basta ir al capítulo de su informe.
      </p>
      <ul className="bol-summary__legend">
        <li>
          <b>{items.length}</b> informes
        </li>
        <li>
          <b>{total}</b> cifras y conjuntos en este resumen
        </li>
        <li>
          <span className="bol-board__arrow-key" aria-hidden="true">▲▼</span> variación frente al año anterior
        </li>
        <li>
          <span className="bol-board__trend-key" aria-hidden="true" /> tendencia del periodo
        </li>
      </ul>
    </section>
  );
}

function SummaryBoard({ item, catalog, settings }: { item: ExecutiveItem; catalog: OpenDataCatalog; settings: BulletinSettings }) {
  const { report, indicators, sets } = item;
  const tiles = indicators.slice(0, BOARD_TILES);
  const rest = indicators.length - tiles.length;
  return (
    <section className="bol-board" style={{ "--line": `var(--bol-line-${report.line})` } as CSSProperties}>
      <header className="bol-board__head">
        <span className="bol-chapter__code">{report.code}</span>
        <div>
          <h3>{report.name}</h3>
          <p>{report.summary}</p>
        </div>
        <a href={`#cap-${report.slug}`}>Ver capítulo →</a>
      </header>
      {tiles.length > 0 && (
        <div className="bol-board__tiles">
          {tiles.map((indicator) => {
            const { value, period } = figureAt(indicator, catalog, settings.cut, settings.campus);
            const years = yearsOf(catalog, indicator.years);
            const series = years.map((y) => valueOf(indicator, y, settings.campus));
            const previous = settings.cut === ALL_YEARS || period ? null : valueOf(indicator, settings.cut - 1, settings.campus);
            const change = changeBetween(indicator, value, previous);
            return (
              <div key={indicator.id} className="bol-board__tile">
                <span className="bol-board__label">{indicator.label}</span>
                <b className="bol-board__value">
                  {figure(value, indicator.format)}
                  <small> {value === null ? "sin reportar" : unitOf(indicator)}</small>
                </b>
                <span className="bol-board__meta">
                  {change ? (
                    <span className="bol-change" data-reading={change.reading}>
                      <Arrow dir={value! > previous! ? "up" : value! < previous! ? "down" : "flat"} />
                      {change.label}
                    </span>
                  ) : period ? (
                    `periodo ${period.label}`
                  ) : settings.cut === ALL_YEARS ? (
                    periodBasisOf(indicator, settings.campus) ?? cutLabel(ALL_YEARS, null)
                  ) : (
                    String(settings.cut)
                  )}
                </span>
                {series.filter((v) => v !== null).length > 1 && (
                  <span className="bol-board__trend">
                    <Trend years={years} values={series} format={indicator.format} height={9} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {(sets.length > 0 || rest > 0) && (
        <ul className="bol-board__sets">
          {sets.map((set) => (
            <li key={set.key}>
              <span>{set.title}</span>
              <b>
                {set.value} <small>{set.unit}</small>
              </b>
              <em>{set.note}</em>
            </li>
          ))}
          {rest > 0 && (
            <li className="bol-board__more">
              <span>
                y {rest} {rest === 1 ? "cifra más" : "cifras más"} en el capítulo
              </span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function ExecutiveSheet({ item, catalog, settings }: { item: ExecutiveItem; catalog: OpenDataCatalog; settings: BulletinSettings }) {
  const { report, indicators, sets } = item;
  const campusName = catalog.campuses.find((c) => c.id === settings.campus)?.name ?? "Todos los campus";
  const campuses = sites(catalog);
  const count = indicators.length + sets.length;
  return (
    <section className="bol-exec" style={{ "--line": `var(--bol-line-${report.line})` } as CSSProperties}>
      <div className="bol-chapter__title">
        <span className="bol-chapter__code">{report.code}</span>
        <div>
          <h2>{report.name}</h2>
          <p>{report.summary || report.description}</p>
        </div>
      </div>
      <p className="bol-chapter__meta">
        {cutText(settings.cut)} · {campusName} · {count} {count === 1 ? "cifra clave" : "cifras clave"}
      </p>
      {indicators.length > 0 && (
        <ol className="bol-exec__rows">
          {indicators.map((indicator) => {
            const { value } = figureAt(indicator, catalog, settings.cut, settings.campus);
            const years = yearsOf(catalog, indicator.years);
            const byTerm = reportsByTerm(indicator);
            const periods = byTerm ? periodCutsOf(years) : [];
            const split = campuses
              .map((c) => ({ name: c.name, value: figureAt(indicator, catalog, settings.cut, c.id).value }))
              .filter((c) => c.value !== null);
            return (
              <li key={indicator.id}>
                <div className="bol-exec__what">
                  <h3>{indicator.label}</h3>
                  <p>{indicator.definition}</p>
                  <small>Reporta: {indicator.source}</small>
                </div>
                <div className="bol-exec__figure">
                  <b>
                    {figure(value, indicator.format)}
                    {value !== null && unitOf(indicator) === "%" && <span> %</span>}
                  </b>
                  {value !== null && unitOf(indicator) !== "%" && <small>{indicator.unit}</small>}
                  <p>{readingOf(indicator, catalog, settings, campusName)}</p>
                  <TermsLine indicator={indicator} catalog={catalog} cut={settings.cut} campus={settings.campus} />
                </div>
                <div className="bol-exec__trend">
                  {byTerm && (
                    <div>
                      <small>Por periodo</small>
                      <Trend years={periods.map((p) => p.label)} values={periods.map((p) => valueOf(indicator, p.year, "todas", p.term))} format={indicator.format} height={15} />
                    </div>
                  )}
                  <div>
                    {byTerm && <small>Por año{indicator.annualRule ? ` · ${RULE_SHORT[indicator.annualRule]}` : ""}</small>}
                    <Trend years={years} values={years.map((y) => valueOf(indicator, y, "todas"))} format={indicator.format} height={15} />
                  </div>
                </div>
                <ul className="bol-exec__split">
                  {split.length ? (
                    split.map((c) => (
                      <li key={c.name}>
                        <span>{c.name}</span>
                        <b>{figure(c.value, indicator.format)}</b>
                      </li>
                    ))
                  ) : (
                    <li className="bol-exec__institutional">Cifra institucional</li>
                  )}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
      {sets.length > 0 && (
        <>
          {indicators.length > 0 && <p className="bol-exec__sets-title">Mapas, desgloses y tablas</p>}
          <dl className="bol-exec__sets">
            {sets.map((set) => (
              <div key={set.key}>
                <dt>{set.title}</dt>
                <dd>
                  <b>{set.value}</b>
                  <small>{set.unit}</small>
                  <p>{set.note}</p>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

/* --- Composición ---------------------------------------------------------------------- */

export function compose(catalog: OpenDataCatalog, settings: BulletinSettings): Composition {
  const period = `Periodo ${catalog.period?.label ?? cutLabel(ALL_YEARS, null)}`;
  const units: Unit[] = [];
  const chapters: Report[] = [];
  const offices = new Map<string, Set<string>>();
  const credit = (source: string, report: Report) => {
    if (!source) return;
    if (!offices.has(source)) offices.set(source, new Set());
    offices.get(source)!.add(report.name);
  };

  const executive = settings.format === "ejecutivo";
  const summaryItems: ExecutiveItem[] = [];

  // Diversidad dentro de Bienestar: solo en el completo y si los dos entran.
  const included = (slug: string) => settings.reports.some((r) => r.slug === slug && r.include && !r.removed);
  const deiInside = !executive && settings.deiPlacement === "bienestar" && included(DEI_SLUG) && included(BIENESTAR_SLUG);
  let deiSection: { report: Report; units: Unit[] } | null = null;

  for (const entry of settings.reports) {
    if (!entry.include || entry.removed) continue;
    const report = catalog.reports.find((r) => r.slug === entry.slug);
    if (!report) continue;

    if (executive || settings.summary) {
      // En el completo, el microtablero lleva todas las cifras con dato del informe.
      const headline = executiveIndicators(report, entry, catalog, executive ? 6 : BOARD_TILES + 20);
      // Los conjuntos completan la ficha; sin indicadores con datos, la llenan.
      const sets = datasetHighlights(report, entry, catalog, settings, executive ? (headline.length >= 5 ? 2 : 4) : 4);
      if (headline.length || sets.length) summaryItems.push({ report, indicators: headline, sets });
    }

    // Ejecutivo: una ficha por informe con sus cifras clave, sin hojas.
    if (executive) {
      const item = summaryItems.find((x) => x.report.slug === report.slug);
      if (!item) continue;
      item.indicators.forEach((indicator) => credit(indicator.source, report));
      item.sets.forEach((set) => {
        const source =
          report.maps?.find((m) => `mapa:${m.id}` === set.key)?.source ??
          report.histories?.find((h) => `historico:${h.id}` === set.key)?.source ??
          report.breakdowns.find((b) => `desglose:${b.id}` === set.key)?.source ??
          report.tables?.find((t) => `tabla:${t.id}` === set.key)?.source ??
          report.rankings?.find((r) => `ranking:${r.id}` === set.key)?.source ??
          report.saberPro?.find((sp) => set.key.startsWith(`saber:${sp.id}:`))?.source ??
          report.saberTyt?.find((t) => set.key.startsWith(`tyt:${t.id}:`))?.source ??
          (report.pipelines ?? []).find((p) => `tuberia:${p.id}` === set.key)?.source;
        if (source) credit(source, report);
      });
      chapters.push(report);
      units.push({
        key: `${report.slug}-ficha`,
        kind: "capitulo",
        report,
        title: report.name,
        breakBefore: true,
        node: <ExecutiveSheet item={item} catalog={catalog} settings={settings} />,
      });
      continue;
    }

    const body: Unit[] = [];
    /** Indicador o conjunto de cada unidad del cuerpo: decide su sección. */
    const refOf = new Map<Unit, string>();

    for (const item of entry.indicators) {
      if (!item.include) continue;
      const indicator = report.indicators.find((i) => i.id === item.id);
      if (!indicator) continue;
      if (settings.skipEmpty && !indicatorHasData(indicator, catalog)) continue;
      credit(indicator.source, report);
      body.push({
        key: `${report.slug}-i-${indicator.id}`,
        kind: "indicador",
        report,
        title: indicator.label,
        node: <IndicatorSheet indicator={indicator} catalog={catalog} settings={settings} show={item.show} />,
        compact: <IndicatorSheet indicator={indicator} catalog={catalog} settings={settings} show={item.show} compact />,
      });
      refOf.set(body[body.length - 1], indicatorRef(indicator.id));
    }

    for (const item of entry.datasets) {
      if (!item.include) continue;
      const [kind, key] = [item.ref.slice(0, item.ref.indexOf(":")), item.ref.slice(item.ref.indexOf(":") + 1)];
      const nodes: { node: ReactNode; source: string; title: string; tight?: boolean }[] = [];
      if (kind === "desglose") {
        const b = report.breakdowns.find((x) => x.id === key);
        if (b) breakdownUnit(b, catalog, settings).forEach(({ node, tight }) => nodes.push({ node, source: b.source, title: b.title, tight }));
      } else if (kind === "mapa") {
        const m = report.maps?.find((x) => x.id === key);
        if (m) nodes.push({ node: mapUnit(m, catalog, settings), source: m.source, title: m.title });
      } else if (kind === "calor") {
        const h = report.heatmaps?.find((x) => x.id === key);
        if (h) nodes.push({ node: heatmapUnit(h, period), source: h.source, title: h.title });
      } else if (kind === "tuberia") {
        const p = (report.pipelines ?? (report.pipeline ? [report.pipeline] : [])).find((x) => x.id === key);
        if (p) nodes.push({ node: pipelineUnit(p, settings, catalog, period), source: p.source, title: p.title });
      } else if (kind === "historico") {
        const h = report.histories?.find((x) => x.id === key);
        if (h) nodes.push({ node: historyUnit(h), source: h.source, title: h.title });
      } else if (kind === "tabla") {
        const t = report.tables?.find((x) => x.id === key);
        if (t) tableUnits(t, period).forEach(({ node, tight }) => nodes.push({ node, source: t.source, title: t.title, tight }));
      } else if (kind === "ranking") {
        const r = report.rankings?.find((x) => x.id === key);
        if (r) nodes.push({ node: rankingUnit(r, settings), source: r.source, title: r.title });
      } else if (kind === "medallero") {
        const board = report.medals?.find((x) => x.id === key);
        if (board) {
          medalUnits(board, settings.cut, DatasetSheet, TableContinuation).forEach(({ node, title, tight }) =>
            nodes.push({ node, source: board.source, title, tight }),
          );
        }
      } else if (kind === "rankings-evo") {
        const node = rankingsEvolutionUnit(report, settings);
        const sources = Array.from(new Set((report.rankings ?? []).map((r) => r.source).filter(Boolean))).join(" · ");
        if (node) nodes.push({ node, source: sources, title: "Evolución de los rankings" });
      } else if (kind === "tyt") {
        const parsed = parseTytKey(report, key);
        if (parsed) {
          tytUnits(parsed.data, parsed.competency, settings.cut, DatasetSheet, TableContinuation).forEach(({ node, title, tight }) =>
            nodes.push({ node, source: parsed.data.source, title, tight }),
          );
        }
      } else if (kind === "libre") {
        const parsed = parseFreeKey(report, key);
        if (parsed) {
          freeUnits(parsed.set, parsed.view, settings.cut, DatasetSheet, TableContinuation).forEach(({ node, title, tight }) =>
            nodes.push({ node, source: parsed.set.source, title, tight }),
          );
        }
      } else if (kind === "imagenes") {
        const block = (report.blocks ?? []).find((b) => b.kind === "imagenes" && (b.settings.slot ?? "1") === key);
        const images = (block?.settings.images ?? []).filter((img) => img.path?.trim());
        if (images.length) {
          nodes.push({
            node: (
              <DatasetSheet
                title={block?.settings.title || "Imágenes"}
                description={block?.settings.description ?? ""}
                source={report.name}
                notes={[["Qué muestra", `${images.length} ${images.length === 1 ? "fotografía" : "fotografías"}`]]}
                wide
              >
                <div className="bol-gallery" data-columns={block?.settings.columns === 1 ? 1 : 2}>
                  {images.map((image, i) => (
                    <figure key={`${image.path}-${i}`}>
                      <img src={reportImageUrl(image.path) ?? ""} alt={image.alt} />
                      {image.caption && <figcaption>{image.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              </DatasetSheet>
            ),
            source: report.name,
            title: block?.settings.title || "Imágenes",
          });
        }
      } else if (kind === "modelo") {
        const m = report.models?.find((x) => x.id === key);
        if (m) modelUnits(m, DatasetSheet).forEach(({ node, title }) => nodes.push({ node, source: m.source, title }));
      } else if (kind === "dei") {
        deiUnits(report, key, catalog, settings, DatasetSheet).forEach(({ node, title }) =>
          nodes.push({ node, source: report.indicators[0]?.source ?? "", title }),
        );
      } else if (kind === "saber") {
        const parsed = parseSaberKey(key);
        const sp = parsed ? report.saberPro?.find((x) => x.id === parsed.id) : undefined;
        if (sp && parsed) {
          saberUnits(sp, parsed.competency, settings.cut, DatasetSheet, TableContinuation).forEach(({ node, title, tight }) =>
            nodes.push({ node, source: sp.source, title, tight }),
          );
        }
      }
      nodes.forEach(({ node, source, title, tight }, index) => {
        // Sin cifras, el conjunto no dibuja nada: siempre se omite.
        if (!node) return;
        credit(source, report);
        body.push({ key: `${report.slug}-d-${item.ref}-${index}`, kind: "conjunto", report, title, node, tight });
        refOf.set(body[body.length - 1], item.ref);
      });
    }

    if (!body.length && settings.skipEmpty) continue;

    // Diversidad como sección de Bienestar: sus hojas esperan a que Bienestar
    // cierre su capítulo y entran detrás, con su propia apertura de sección.
    if (deiInside && report.slug === DEI_SLUG) {
      deiSection = { report, units: body };
      continue;
    }

    // Separadores de la ficha: lo general del informe va primero; luego cada
    // sección abre página con sus hojas, en el orden del boletín.
    const { groups, groupOf } = reportGroups(report);
    const general = body.filter((unit) => !groupOf(refOf.get(unit) ?? ""));
    const sectioned = groups
      .map((group) => ({ group, units: body.filter((unit) => groupOf(refOf.get(unit) ?? "") === group) }))
      .filter((part) => part.units.length > 0);
    const sheets = body.filter((unit) => !unit.tight).length;

    chapters.push(report);
    units.push({
      key: `${report.slug}-capitulo`,
      kind: "capitulo",
      report,
      title: report.name,
      breakBefore: true,
      node: <ChapterOpener report={report} catalog={catalog} settings={settings} count={sheets} sections={sectioned.map((part) => part.group.title)} />,
    });
    units.push(...general);
    sectioned.forEach(({ group, units: own }, i) => {
      const titles = Array.from(new Set(own.filter((unit) => !unit.tight).map((unit) => unit.title)));
      units.push({
        key: `${report.slug}-s-${group.key}`,
        kind: "seccion",
        report,
        title: group.title,
        section: group.title,
        // Una sección sigue el flujo (no abre página): entra bajo la apertura
        // del capítulo o tras la hoja anterior, pegada siempre a su primera hoja.
        breakBefore: false,
        node: <SectionOpener report={report} group={group} number={i + 1} total={sectioned.length} titles={titles} />,
      });
      units.push(...own.map((unit) => ({ ...unit, section: group.title })));
    });
  }

  if (deiSection) {
    const host = chapters.find((r) => r.slug === BIENESTAR_SLUG);
    const { report: dei, units: own } = deiSection;
    if (host) {
      // Detrás de la última hoja de Bienestar, con cabecera y pestaña de Bienestar.
      let at = units.length;
      for (let i = units.length - 1; i >= 0; i -= 1) {
        if (units[i].report?.slug === BIENESTAR_SLUG) {
          at = i + 1;
          break;
        }
      }
      const group = { key: "dei", title: dei.name, description: dei.summary, indicators: [], datasets: [] };
      const titles = Array.from(new Set(own.filter((unit) => !unit.tight).map((unit) => unit.title)));
      units.splice(
        at,
        0,
        {
          key: `${dei.slug}-seccion`,
          kind: "seccion",
          report: host,
          title: dei.name,
          section: dei.name,
          breakBefore: false,
          node: <SectionOpener report={host} group={group} number={1} total={1} titles={titles} />,
        },
        ...own.map((unit) => ({ ...unit, report: host, section: dei.name })),
      );
    }
  }

  // El resumen abre el documento: siempre en el ejecutivo, a pedido en el completo.
  if ((executive || settings.summary) && summaryItems.length) {
    const shown = summaryItems.filter((item) => chapters.includes(item.report));
    if (executive) {
      units.unshift({
        key: "resumen",
        kind: "resumen",
        title: "Resumen ejecutivo",
        breakBefore: true,
        node: <ExecutiveSummary items={shown} catalog={catalog} settings={settings} />,
      });
    } else {
      // Completo: una apertura y un microtablero por informe. Cada tablero es
      // su propia unidad, así la paginación los reparte sin pisar el pie.
      units.unshift(
        {
          key: "resumen",
          kind: "resumen",
          title: "Resumen ejecutivo",
          breakBefore: true,
          node: <SummaryIntro items={shown} catalog={catalog} settings={settings} />,
        },
        ...shown.map((item) => ({
          key: `resumen-${item.report.slug}`,
          kind: "tablero" as const,
          title: item.report.name,
          node: <SummaryBoard item={item} catalog={catalog} settings={settings} />,
        })),
      );
    }
  }

  return {
    units,
    chapters,
    offices: [...offices.entries()]
      .map(([name, reports]) => ({ name, reports: [...reports] }))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}
