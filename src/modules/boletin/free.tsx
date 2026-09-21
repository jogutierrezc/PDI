/* =============================================================================
   Boletín · conjuntos libres.

   Una hoja por vista de cada fuente ("libre:<fuente>:<vista>"), con la columna
   de notas que dice qué muestra, quién reporta, qué gráfica es, cómo se lee y
   a qué corte pertenece: sin fecha, un periodo ("2020–2025") o un año.

   Las gráficas son las de la ficha, dibujadas a 680 px con la paleta fija del
   papel y sin animación; el documento las escala al ancho del cuerpo. El mapa
   usa el coroplético del boletín; la tabla, la tabla del boletín con sus
   continuaciones; las cifras clave, números en tinta.
   ========================================================================== */

import type { ReactNode } from "react";
import { ALL_YEARS } from "../datos-abiertos/data/terms";
import {
  CHART_TYPES,
  columnOf,
  freeAllRowsAt,
  freeRowsAt,
  freeTotalAt,
  freeYears,
  numberOf,
  territoryCode,
  textOf,
  viewProblems,
} from "../datos-abiertos/data/free-sets";
import type { FreeSet, FreeView } from "../datos-abiertos/data/free-sets";
import { formatValue } from "../datos-abiertos/data/open-data";
import type { Report } from "../datos-abiertos/data/types";
import { FreeChart, FreeChartEnv } from "../datos-abiertos/components/free/FreeCharts";
import type { ChartTokens } from "../datos-abiertos/components/free/chart-tokens";
import { ChoroplethMap, DataTable, MapLegend } from "./figures";

/** La paleta del papel: la del portal en claro, fija. */
const PAPER: ChartTokens = {
  ink: "#16243a",
  secondary: "#4a5a70",
  muted: "#6f7d90",
  line: "#d6dee8",
  lineStrong: "#b9c5d4",
  surface: "#ffffff",
  font: "Montserrat, Manrope, system-ui, sans-serif",
  cats: ["#2a78d6", "#eb6834", "#1baf7a", "#7a5bd0", "#e87ba4", "#008300"],
  total: "#16243a",
  pos: "#2a63b8",
  posSoft: "#6fa4e8",
  neg: "#b9541f",
  negSoft: "#e79c69",
  mid: "#e9edf3",
  posInk: "#ffffff",
  posSoftInk: "#16243a",
  negInk: "#ffffff",
  negSoftInk: "#16243a",
};

const NATURAL = 680;
const TABLE_FIRST = 26;
const TABLE_NEXT = 40;
const USES_ALL_YEARS = ["lineas", "area", "gantt"];

type SheetComponent = (props: {
  title: string;
  description?: string;
  source: string;
  notes?: [string, ReactNode][];
  cut?: string;
  wide?: boolean;
  children: ReactNode;
}) => ReactNode;
type ContinuationComponent = (props: { title: string; from: number; to: number; total: number; children: ReactNode }) => ReactNode;

export function parseFreeKey(report: Report, key: string): { set: FreeSet; view: FreeView } | null {
  const at = key.lastIndexOf(":");
  if (at < 0) return null;
  const set = report.freeSets?.find((s) => s.id === key.slice(0, at));
  const view = set?.views.find((v) => v.key === key.slice(at + 1));
  return set && view && viewProblems(set, view).length === 0 ? { set, view } : null;
}

/** El año que dibuja una vista anual con el corte del boletín: el del corte o el último anterior. */
function yearFor(set: FreeSet, view: FreeView, cut: number): number | null {
  if (set.temporality !== "anual" || USES_ALL_YEARS.includes(view.type)) return null;
  const years = freeYears(set).filter((y) => cut === ALL_YEARS || y <= cut);
  return years.length ? years[years.length - 1] : null;
}

function cutText(set: FreeSet, view: FreeView, year: number | null, cut: number) {
  if (set.temporality === "periodo") return set.periodLabel ? `Periodo ${set.periodLabel}` : "Dato del periodo";
  if (set.temporality === "sin_tiempo") return "Dato sin fecha";
  if (USES_ALL_YEARS.includes(view.type)) return cut === ALL_YEARS ? "Todos los años reportados" : `Años hasta ${cut}`;
  return year === null ? "Sin año reportado" : `Año ${year}${cut !== ALL_YEARS && year !== cut ? ` · el más cercano a ${cut}` : ""}`;
}

export function freeUnits(set: FreeSet, view: FreeView, cut: number, Sheet: SheetComponent, Continuation: ContinuationComponent): { node: ReactNode; title: string; tight?: boolean }[] {
  const year = yearFor(set, view, cut);
  if (set.temporality === "anual" && !USES_ALL_YEARS.includes(view.type) && year === null) return [];
  const rows = freeRowsAt(set, year);
  if (!rows.length) return [];
  const title = `${set.title} · ${view.title}`;
  const compared = view.type === "barras_comparadas" ? columnOf(set, view.compare) : null;
  const notes: [string, ReactNode][] = [
    ["Gráfica", CHART_TYPES[view.type].label],
    ["Lectura", CHART_TYPES[view.type].hint],
    // Una gráfica comparada no se entiende sin saber qué se está comparando:
    // en papel no hay leyenda que se pueda señalar con el cursor.
    ...(compared ? ([["Compara", compared.label]] as [string, ReactNode][]) : []),
    ["Corte", cutText(set, view, year, cut)],
  ];
  const sheet = (children: ReactNode, extra: [string, ReactNode][] = []) => (
    <Sheet title={title} description={view.description || set.description} source={set.source} notes={[...notes, ...extra]} wide>
      {children}
    </Sheet>
  );

  if (view.type === "tabla") {
    const columns = set.columns;
    const tableRows = freeAllRowsAt(set, year);
    const head = [...(set.temporality === "anual" ? ["Año"] : []), ...columns.map((c) => c.label)];
    const cell = (value: unknown, kind: string, format?: string) => {
      if (value === null || value === undefined || value === "") return "—";
      if (kind === "cifra") {
        const n = numberOf(value as string | number);
        return n === null ? "—" : formatValue(n, (format as "entero" | "decimal" | "porcentaje") ?? "decimal");
      }
      return String(value);
    };
    const all = freeAllRowsAt(set, year);
    const toRows = (list: typeof rows) =>
      list.map((r) => {
        if (r.kind === "grupo") return { label: r.label || "Sin título", cells: head.slice(1).map(() => ""), strong: true };
        const total = r.kind === "total" ? freeTotalAt(all, all.indexOf(r), columns) : null;
        const cells = [
          ...(set.temporality === "anual" ? [r.year === null ? "—" : String(r.year)] : []),
          ...columns.map((c, i) =>
            total ? (i === 0 && c.kind !== "cifra" ? r.label || "Total" : cell(total.cells[c.key], c.kind, c.format)) : cell(r.cells[c.key], c.kind, c.format),
          ),
        ];
        return { label: cells[0], cells: cells.slice(1), strong: Boolean(total) };
      });
    const chunks: { from: number; list: typeof rows }[] = [{ from: 0, list: tableRows.slice(0, TABLE_FIRST) }];
    for (let i = TABLE_FIRST; i < tableRows.length; i += TABLE_NEXT) chunks.push({ from: i, list: tableRows.slice(i, i + TABLE_NEXT) });
    return chunks.map((chunk, i) =>
      i === 0
        ? { title, node: sheet(<DataTable head={head} rows={toRows(chunk.list)} />, chunks.length > 1 ? [["Filas", `1 a ${chunk.list.length} de ${tableRows.length} · continúa`]] : []) }
        : {
            title,
            tight: true,
            node: (
              <Continuation title={title} from={chunk.from + 1} to={chunk.from + chunk.list.length} total={tableRows.length}>
                <DataTable head={head} rows={toRows(chunk.list)} />
              </Continuation>
            ),
          },
    );
  }

  if (view.type === "mapa") {
    const territory = columnOf(set, view.category)!;
    const measure = columnOf(set, view.series?.[0])!;
    const totals: Record<string, number> = {};
    for (const r of rows) {
      const code = territoryCode(territory.territory ?? "departamento", r.cells[territory.key]);
      const value = numberOf(r.cells[measure.key]);
      if (code && value !== null) totals[code] = (totals[code] ?? 0) + value;
    }
    if (!Object.keys(totals).length) return [];
    const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    return [
      {
        title,
        node: sheet(
          <div className="bol-free-map">
            <ChoroplethMap kind={territory.territory === "pais" ? "mundo" : "colombia"} totals={totals} />
            <MapLegend values={Object.values(totals)} unit={measure.unit || measure.label} />
            <DataTable
              head={[territory.label, measure.label]}
              rows={ranked.slice(0, 15).map(([code, value]) => ({
                label: rows.map((r) => textOf(r.cells[territory.key])).find((text) => territoryCode(territory.territory ?? "departamento", text) === code) ?? code,
                cells: [formatValue(value, measure.format ?? "decimal")],
              }))}
              caption={ranked.length > 15 ? `Los 15 primeros de ${ranked.length}` : undefined}
            />
          </div>,
        ),
      },
    ];
  }

  if (view.type === "cifras") {
    const series = (view.series ?? []).map((k) => columnOf(set, k)).filter((c) => c?.kind === "cifra");
    return [
      {
        title,
        node: sheet(
          <dl className="bol-saber-keys bol-free-figures">
            {series.map((s) => {
              const values = rows.map((r) => numberOf(r.cells[s!.key])).filter((v): v is number => v !== null);
              const additive = (s!.format ?? "entero") === "entero";
              const value = values.length === 0 ? null : values.length === 1 || additive ? values.reduce((a, b) => a + b, 0) : values.reduce((a, b) => a + b, 0) / values.length;
              return (
                <div key={s!.key}>
                  <dt>{s!.label}</dt>
                  <dd>
                    <b>{value === null ? "—" : formatValue(value, s!.format ?? "decimal")}</b>
                    <span>{[s!.unit, values.length > 1 ? (additive ? `suma de ${values.length} filas` : `promedio de ${values.length} filas`) : ""].filter(Boolean).join(" · ")}</span>
                  </dd>
                </div>
              );
            })}
          </dl>,
        ),
      },
    ];
  }

  return [
    {
      title,
      node: sheet(
        <div className="bol-fit bol-free-chart" data-natural={NATURAL}>
          <div style={{ width: NATURAL }}>
            <FreeChartEnv value={{ tokens: PAPER, width: NATURAL, still: true }}>
              <FreeChart set={set} view={view} year={year} />
            </FreeChartEnv>
          </div>
        </div>,
      ),
    },
  ];
}
