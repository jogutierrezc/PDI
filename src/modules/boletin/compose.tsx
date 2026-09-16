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
   ========================================================================== */

import type { CSSProperties, ReactNode } from "react";
import { basisOf, changeBetween, formatCount, formatValue, periodBasisOf, valueOf } from "../datos-abiertos/data/open-data";
import { ALL_YEARS, ANNUAL_RULE_LABEL, cutLabel } from "../datos-abiertos/data/terms";
import { isMobilityMap, isWorldMap } from "../datos-abiertos/data/types";
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
} from "../datos-abiertos/data/types";
import { DEPARTMENTS } from "../datos-abiertos/data/colombia-map";
import { LeakyPipeline } from "../datos-abiertos/components/LeakyPipeline";
import { COUNTRIES } from "../datos-abiertos/data/world-map";
import { ChoroplethMap, DataTable, EvolutionChart, HBars, Legend, MapLegend, SERIES_COLORS, StackedColumns, SwatchLegend, Trend, figure } from "./figures";
import type { Series } from "./figures";
import type { BulletinSettings, IndicatorShow } from "./model";

export interface Unit {
  key: string;
  kind: "resumen" | "capitulo" | "indicador" | "conjunto";
  /** Informe al que pertenece (el resumen no tiene): pie, cabecera, pestaña e índice. */
  report?: Report;
  /** Continuación de una tabla: va pegada a la anterior y no entra al índice. */
  tight?: boolean;
  /** Título de la hoja: nombre del indicador o del conjunto. */
  title: string;
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

/* --- Presencia de datos ------------------------------------------------------ */

function indicatorHasData(indicator: Indicator, catalog: OpenDataCatalog): boolean {
  return yearsOf(catalog, indicator.years).some((y) => Object.values(indicator.values[y] ?? {}).some((v) => v !== null && v !== undefined));
}

function itemsAt(breakdown: Breakdown, key: number) {
  return (breakdown.values[key] ?? []).filter((i) => i.value !== null);
}

/** Años del desglose con alguna cifra. */
const breakdownYears = (b: Breakdown, catalog: OpenDataCatalog) => yearsOf(catalog, b.years).filter((y) => itemsAt(b, y).length > 0);

function mapKey(map: MapDataset, cut: number, catalog: OpenDataCatalog): number | undefined {
  const has = (k: number) => Object.values(map.values[k] ?? {}).some((codes) => codes && Object.keys(codes).length > 0);
  if (map.reporting === "global") return has(ALL_YEARS) ? ALL_YEARS : undefined;
  if (has(cut)) return cut;
  const years = yearsOf(catalog, map.years).filter(has);
  return years[years.length - 1];
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
  const value = valueOf(indicator, cut, campus);
  const previous = cut === ALL_YEARS ? null : valueOf(indicator, cut - 1, campus);
  const change = changeBetween(indicator, value, previous);
  const basis = cut === ALL_YEARS ? periodBasisOf(indicator, campus) : basisOf(indicator, cut, campus);
  const percent = indicator.format === "porcentaje";
  const unitText = percent || indicator.unit === "%" ? "%" : indicator.unit;

  const withData = campuses.filter((c) => years.some((y) => valueOf(indicator, y, c.id) !== null));
  const series: Series[] = [
    ...withData.map((c, i) => ({ label: c.name, color: SERIES_COLORS[i % SERIES_COLORS.length], values: years.map((y) => valueOf(indicator, y, c.id)) })),
    // "Total" y no "Total institucional": la leyenda cabe en una fila; la tabla lo dice completo.
    { label: "Total", color: "var(--bol-navy)", dashed: withData.length > 0, values: years.map((y) => valueOf(indicator, y, "todas")) },
  ].filter((s) => s.values.some((v) => v !== null));

  const campusItems = withData.map((c) => ({ label: c.name, value: valueOf(indicator, cut, c.id), strong: c.id === campus }));
  const showCampus = !compact && show.campus && campusItems.some((i) => i.value !== null);
  const showEvolution = show.evolution && series.length > 0 && years.length > 1;

  const columns = [...years.map(String), ...(periodColumn(settings) ? [`${cutLabel(ALL_YEARS, null)}`] : [])];
  const highlightCol = cut === ALL_YEARS ? columns.length - 1 : years.indexOf(cut);
  const rowFor = (id: string, label: string, strong?: boolean) => ({
    label,
    strong,
    cells: [
      ...years.map((y) => figure(valueOf(indicator, y, id), indicator.format)),
      ...(periodColumn(settings) ? [figure(valueOf(indicator, ALL_YEARS, id), indicator.format)] : []),
    ],
  });
  const tableRows = [...withData.map((c) => rowFor(c.id, c.name)), rowFor("todas", "Total institucional", withData.length > 0)];
  const calculation = [
    indicator.annualRule ? `Año: ${ANNUAL_RULE_LABEL[indicator.annualRule].toLowerCase()}.` : null,
    cut === ALL_YEARS ? (indicator.annualRule === "ultimo" ? "Periodo: último dato." : "Periodo: promedio anual.") : null,
    indicator.aggregation === "reportado" ? "Total reportado aparte." : withData.length ? "Total: suma de campus." : null,
  ].filter(Boolean).join(" ");

  return (
    <article className="bol-sheet" data-notes={show.notes || undefined} data-compact={compact || undefined}>
      {show.notes && (
        <Notes
          items={[
            ["Qué mide", indicator.definition],
            ["Reporta", indicator.source],
            ["Cómo se calcula", compact ? null : calculation],
            ["Lectura", compact ? null : DIRECTION_TEXT[indicator.direction]],
            ["Corte", `${cutText(cut)} · ${campusName}`],
          ]}
        />
      )}
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
        </div>

        {(showEvolution || showCampus) && (
          <div className="bol-figures" data-single={!(showEvolution && showCampus) || undefined}>
            {showEvolution && (
              <figure>
                <figcaption>Evolución por año</figcaption>
                <EvolutionChart
                  years={years}
                  series={series}
                  format={indicator.format}
                  highlight={cut === ALL_YEARS ? undefined : cut}
                  width={showCampus ? 74 : 130}
                  height={showCampus ? 36 : compact ? 24 : series.length > 1 ? 34 : 28}
                />
                {series.length > 1 && <Legend series={series} />}
              </figure>
            )}
            {showCampus && (
              <figure>
                <figcaption>Por campus · {cut === ALL_YEARS ? cutLabel(ALL_YEARS, null) : cut}</figcaption>
                <HBars items={campusItems} format={indicator.format} width={showEvolution ? 52 : 128} />
              </figure>
            )}
          </div>
        )}

        {show.table && (
          <DataTable head={[withData.length ? "Campus" : "Cifra", ...columns]} rows={tableRows} highlightCol={highlightCol} />
        )}
      </div>
    </article>
  );
}

/* --- Apertura de capítulo --------------------------------------------------------- */

function ChapterOpener({ report, catalog, settings, count }: { report: Report; catalog: OpenDataCatalog; settings: BulletinSettings; count: number }) {
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
            const v = valueOf(indicator, settings.cut, settings.campus);
            return (
              <div key={indicator.id}>
                <dt>{indicator.label}</dt>
                <dd>
                  <b>{figure(v, indicator.format)}</b>
                  <small>{v === null ? "sin reportar" : indicator.format === "porcentaje" || indicator.unit === "%" ? "%" : indicator.unit}</small>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className="bol-chapter__meta">
        {cutText(settings.cut)} · {catalog.campuses.find((c) => c.id === settings.campus)?.name ?? "Todos los campus"} · {count}{" "}
        {count === 1 ? "hoja" : "hojas"} en este capítulo
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
  return (
    <article className="bol-sheet" data-notes={wide ? undefined : true} data-wide={wide || undefined}>
      <Notes items={[["Qué muestra", description], ["Reporta", source], ...(notes ?? []), ...(cut && !hasCut ? ([["Corte", cut]] as [string, ReactNode][]) : [])]} />
      <div className="bol-sheet__body">
        <SheetHead title={title} />
        {children}
      </div>
    </article>
  );
}

function breakdownUnit(b: Breakdown, catalog: OpenDataCatalog, settings: BulletinSettings): ReactNode | null {
  const years = breakdownYears(b, catalog);
  if (!years.length) return null;
  const key = settings.cut === ALL_YEARS && itemsAt(b, ALL_YEARS).length ? ALL_YEARS : years.includes(settings.cut) ? settings.cut : years[years.length - 1];
  const labels = Array.from(new Set(years.flatMap((y) => itemsAt(b, y).map((i) => i.label))));
  const items = labels.map((label) => ({ label, value: (b.values[key] ?? []).find((i) => i.label === label)?.value ?? null }));
  const withPeriod = settings.cut === ALL_YEARS && itemsAt(b, ALL_YEARS).length > 0;
  const columns = [...years.map(String), ...(withPeriod ? [cutLabel(ALL_YEARS, null)] : [])];
  return (
    <DatasetSheet
      title={b.title}
      source={b.source}
      notes={[
        ["Corte", key === ALL_YEARS ? `${cutText(ALL_YEARS)} · promedio anual` : `Corte ${key}${key !== settings.cut ? " (último con dato)" : ""}`],
        ["Alcance", "Total institucional"],
      ]}
    >
      <figure className="bol-wide">
        <figcaption>{key === ALL_YEARS ? `Promedio anual ${cutLabel(ALL_YEARS, null)}` : key} · {b.unit}</figcaption>
        <HBars items={items} format={b.format} share={b.unit !== "%"} width={128} />
      </figure>
      <DataTable
        head={["Categoría", ...columns]}
        highlightCol={withPeriod ? columns.length - 1 : years.indexOf(key)}
        rows={labels.map((label) => ({
          label,
          cells: [
            ...years.map((y) => figure((b.values[y] ?? []).find((i) => i.label === label)?.value ?? null, b.format)),
            ...(withPeriod ? [figure((b.values[ALL_YEARS] ?? []).find((i) => i.label === label)?.value ?? null, b.format)] : []),
          ],
        }))}
      />
    </DatasetSheet>
  );
}

function mapUnit(map: MapDataset, catalog: OpenDataCatalog, settings: BulletinSettings): ReactNode | null {
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
  const format = measure === "estudiantes" ? "entero" : "decimal";
  const campusName = catalog.campuses.find((c) => c.id === settings.campus)?.name ?? "Todos los campus";
  // La misma cohorte que dibuja la tubería de la web: la de más etapas con dato y, a igualdad, la más reciente.
  const filled = (c: PipelineData["cohorts"][number]) => c.remaining.filter((v) => v !== null).length;
  const drawn = rows.slice().sort((a, b) => filled(a) - filled(b) || String(a.cohort).localeCompare(String(b.cohort))).pop();
  return (
    <DatasetSheet
      title={p.title}
      description={p.description}
      source={p.source}
      notes={[["Cifra", "Deserción acumulada en % de la cohorte que entró"]]}
      cut={rows.length > 1 ? `Cohortes ${rows[0].cohort} a ${rows[rows.length - 1].cohort}` : `${rows[0].cohort} · ${period}`}
      wide
    >
      {/* El mismo dibujo de la ficha web, quieto y escalado al ancho de la página. */}
      <div className="bol-fit" data-natural={PIPELINE_WIDTH}>
        <LeakyPipeline data={p} campus={settings.campus} campusName={campusName} print={{ width: PIPELINE_WIDTH }} />
      </div>
      <DataTable
        head={["Cohorte", ...p.stages]}
        caption={rows.length > 1 && drawn ? `La tubería dibuja la cohorte ${drawn.cohort}, en negrita en la tabla.` : undefined}
        rows={rows.map((c) => {
          const first = c.remaining[0] ?? null;
          return {
            strong: rows.length > 1 && c === drawn,
            label: String(c.cohort),
            cells: p.stages.map((_, i) => figure(c.remaining[i] ?? null, format)),
            shade: p.stages.map((_, i) => {
              const v = c.remaining[i];
              if (v === null || v === undefined) return null;
              return measure === "estudiantes" ? (first ? v / first : null) : v / 100;
            }),
          };
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

/** Cifras clave de un informe: sus KPI incluidos con datos; sin KPI, los primeros incluidos. */
function executiveIndicators(report: Report, entry: BulletinSettings["reports"][number], catalog: OpenDataCatalog, limit: number): Indicator[] {
  const included = entry.indicators
    .filter((item) => item.include)
    .map((item) => report.indicators.find((i) => i.id === item.id))
    .filter((i): i is Indicator => Boolean(i) && indicatorHasData(i!, catalog));
  const keys = report.keyIndicators.map((id) => included.find((i) => i.id === id)).filter((i): i is Indicator => Boolean(i));
  return (keys.length ? keys : included).slice(0, limit);
}

function unitOf(indicator: Indicator) {
  return indicator.format === "porcentaje" || indicator.unit === "%" ? "%" : indicator.unit;
}

/** Lectura de la cifra del corte: variación frente al año anterior o cómo salió del periodo. */
function readingOf(indicator: Indicator, settings: BulletinSettings, campusName: string): ReactNode {
  const { cut, campus } = settings;
  const value = valueOf(indicator, cut, campus);
  if (value === null) return "Sin reportar";
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

function ExecutiveSummary({ items, settings }: { items: { report: Report; indicators: Indicator[] }[]; settings: BulletinSettings }) {
  return (
    <section className="bol-summary">
      <h2>Resumen ejecutivo</h2>
      <p className="bol-summary__lede">
        Las cifras titulares de cada informe · {cutText(settings.cut)}. El detalle de cada una está en su capítulo.
      </p>
      <ol className="bol-summary__list">
        {items.map(({ report, indicators }) => (
          <li key={report.slug} style={{ "--line": `var(--bol-line-${report.line})` } as CSSProperties}>
            <a className="bol-summary__report" href={`#cap-${report.slug}`}>
              <span className="bol-chapter__code">{report.code}</span>
              <span>{report.name}</span>
            </a>
            <dl>
              {indicators.slice(0, 3).map((indicator) => {
                const v = valueOf(indicator, settings.cut, settings.campus);
                return (
                  <div key={indicator.id}>
                    <dt>{indicator.label}</dt>
                    <dd>
                      <b>{figure(v, indicator.format)}</b>
                      <small>{v === null ? "sin reportar" : unitOf(indicator)}</small>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ExecutiveSheet({ report, indicators, catalog, settings }: { report: Report; indicators: Indicator[]; catalog: OpenDataCatalog; settings: BulletinSettings }) {
  const campusName = catalog.campuses.find((c) => c.id === settings.campus)?.name ?? "Todos los campus";
  const campuses = sites(catalog);
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
        {cutText(settings.cut)} · {campusName} · {indicators.length} {indicators.length === 1 ? "cifra clave" : "cifras clave"}
      </p>
      <ol className="bol-exec__rows">
        {indicators.map((indicator) => {
          const value = valueOf(indicator, settings.cut, settings.campus);
          const years = yearsOf(catalog, indicator.years);
          const split = campuses
            .map((c) => ({ name: c.name, value: valueOf(indicator, settings.cut, c.id) }))
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
                <p>{readingOf(indicator, settings, campusName)}</p>
              </div>
              <div className="bol-exec__trend">
                <Trend years={years} values={years.map((y) => valueOf(indicator, y, "todas"))} format={indicator.format} />
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
  const summaryItems: { report: Report; indicators: Indicator[] }[] = [];

  for (const entry of settings.reports) {
    if (!entry.include || entry.removed) continue;
    const report = catalog.reports.find((r) => r.slug === entry.slug);
    if (!report) continue;

    if (executive || settings.summary) {
      const headline = executiveIndicators(report, entry, catalog, executive ? 6 : 3);
      if (headline.length) summaryItems.push({ report, indicators: headline });
    }

    // Ejecutivo: una ficha por informe con sus cifras clave, sin hojas.
    if (executive) {
      const key = summaryItems.find((item) => item.report.slug === report.slug)?.indicators ?? [];
      if (!key.length) continue;
      key.forEach((indicator) => credit(indicator.source, report));
      chapters.push(report);
      units.push({
        key: `${report.slug}-ficha`,
        kind: "capitulo",
        report,
        title: report.name,
        breakBefore: true,
        node: <ExecutiveSheet report={report} indicators={key} catalog={catalog} settings={settings} />,
      });
      continue;
    }

    const body: Unit[] = [];

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
    }

    for (const item of entry.datasets) {
      if (!item.include) continue;
      const [kind, key] = [item.ref.slice(0, item.ref.indexOf(":")), item.ref.slice(item.ref.indexOf(":") + 1)];
      const nodes: { node: ReactNode; source: string; title: string; tight?: boolean }[] = [];
      if (kind === "desglose") {
        const b = report.breakdowns.find((x) => x.id === key);
        if (b) nodes.push({ node: breakdownUnit(b, catalog, settings), source: b.source, title: b.title });
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
      }
      nodes.forEach(({ node, source, title, tight }, index) => {
        // Sin cifras, el conjunto no dibuja nada: siempre se omite.
        if (!node) return;
        credit(source, report);
        body.push({ key: `${report.slug}-d-${item.ref}-${index}`, kind: "conjunto", report, title, node, tight });
      });
    }

    if (!body.length && settings.skipEmpty) continue;
    chapters.push(report);
    units.push({
      key: `${report.slug}-capitulo`,
      kind: "capitulo",
      report,
      title: report.name,
      breakBefore: true,
      node: <ChapterOpener report={report} catalog={catalog} settings={settings} count={body.length} />,
    });
    units.push(...body);
  }

  // El resumen abre el documento: siempre en el ejecutivo, a pedido en el completo.
  if ((executive || settings.summary) && summaryItems.length) {
    units.unshift({
      key: "resumen",
      kind: "resumen",
      title: "Resumen ejecutivo",
      breakBefore: true,
      node: <ExecutiveSummary items={summaryItems.filter((item) => chapters.includes(item.report))} settings={settings} />,
    });
  }

  return {
    units,
    chapters,
    offices: [...offices.entries()]
      .map(([name, reports]) => ({ name, reports: [...reports] }))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}
