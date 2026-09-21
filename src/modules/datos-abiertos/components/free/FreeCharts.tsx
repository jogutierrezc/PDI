/* =============================================================================
   Conjuntos libres · las gráficas de una vista.

   Barras, circular, radar, líneas, área y diagrama de caja con nivo; cascada y
   Gantt dibujados aquí (nivo no los trae) con los mismos tokens; mapas con los
   mapas propios del portal; cifras clave en paletas del tablero; tabla con el
   bloque de tablas.

   Reglas que valen para todas:
   · Una serie no se identifica solo por color: con dos o más hay leyenda.
   · Más de seis series o categorías de color no se inventan: la circular junta
     el resto en «Otros» y las demás dibujan las seis primeras y lo dicen.
   · Un vacío no se dibuja como cero.
   · Cada gráfica trae su tabla para lectores de pantalla.
   ========================================================================== */

import { createContext, useContext, useMemo, useRef, useState } from "react";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { Bar } from "@nivo/bar";
import { Pie } from "@nivo/pie";
import { Radar } from "@nivo/radar";
import { Line } from "@nivo/line";
import { BoxPlot } from "@nivo/boxplot";
import {
  CHART_TYPES,
  categoryTotals,
  columnOf,
  compareTotals,
  dateOf,
  freeAllRowsAt,
  freeRowsAt,
  freeTotalAt,
  freeYears,
  histogramBins,
  numberOf,
  territoryCode,
  textOf,
} from "../../data/free-sets";
import type { FreeColumn, FreeRow, FreeSet, FreeView } from "../../data/free-sets";
import { formatValue } from "../../data/open-data";
import { DEPARTMENTS, MAP_HEIGHT, MAP_WIDTH } from "../../data/colombia-map";
import { COUNTRIES, WORLD_HEIGHT, WORLD_WIDTH } from "../../data/world-map";
import { ChartTooltip, niceCeil } from "../ChartFrame";
import { SplitFlap } from "../SplitFlap";
import { usePrefersReducedMotion, useWidth } from "../motion";
import type React from "react";
import { MAX_CATEGORICAL, inkOn, nivoTheme, useChartTokens } from "./chart-tokens";
import type { ChartTokens } from "./chart-tokens";

const HEIGHT = 340;

/**
 * Dónde se dibuja: en la ficha, con los tokens del tema y el ancho del panel;
 * en el boletín, con la paleta fija del papel, un ancho fijo que el documento
 * escala y sin animación.
 */
interface ChartEnv {
  tokens?: ChartTokens;
  width?: number;
  still?: boolean;
}
const EnvContext = createContext<ChartEnv>({});
export const FreeChartEnv = EnvContext.Provider;

/** Ancho del lienzo: el fijo del entorno o el medido del contenedor. */
function useCanvasWidth(ref: React.RefObject<HTMLDivElement>, min: number) {
  const env = useContext(EnvContext);
  const measured = useWidth(ref, 720);
  return Math.max(min, env.width ?? measured);
}

const fmt = (column: FreeColumn | undefined, value: number | null) =>
  value === null ? "Sin dato" : `${formatValue(value, column?.format ?? "decimal")}${column?.unit ? (column.unit === "%" ? " %" : ` ${column.unit}`) : ""}`;

const shortFmt = (column: FreeColumn | undefined, value: number) => formatValue(value, column?.format ?? "decimal");

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="od-free__legend" aria-label="Leyenda">
      {items.map((item) => (
        <li key={item.label}>
          <i style={{ background: item.color }} data-dashed={item.dashed || undefined} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="od-free__note">{children}</p>;
}

/** Tabla para lectores de pantalla: categorías × series. */
function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tip({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="od-free__tip">
      <strong>{title}</strong>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
}

function Frame({ children, height = HEIGHT }: { children: (width: number) => ReactNode; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const width = useCanvasWidth(wrap, 260);
  return (
    <div className="od-free__canvas" ref={wrap} style={{ minHeight: height }}>
      {children(width)}
    </div>
  );
}

/* --- Vista ------------------------------------------------------------------------ */

export function FreeChart({ set, view, year }: { set: FreeSet; view: FreeView; year: number | null }) {
  const env = useContext(EnvContext);
  const themed = useChartTokens();
  const reduced = usePrefersReducedMotion();
  const t = env.tokens ?? themed;
  const rows = freeRowsAt(set, year);
  const common = { t, animate: !reduced && !env.still, set, view, rows };

  switch (view.type) {
    case "barras":
    case "barras_apiladas":
    case "barras_100":
      return <Bars {...common} />;
    case "barras_comparadas":
      return <CompareBars {...common} />;
    case "circular":
    case "dona":
      return <PieChart {...common} />;
    case "radar":
      return <RadarChart {...common} />;
    case "lineas":
    case "area":
      return <LineChart {...common} />;
    case "histograma":
      return <Histogram {...common} />;
    case "caja":
      return <BoxChart {...common} />;
    case "cascada":
      return <Waterfall {...common} />;
    case "gantt":
      return <Gantt {...common} />;
    case "mapa":
      return <FreeMap {...common} />;
    case "cifras":
      return <Figures {...common} />;
    case "tabla":
      return <FreeTable set={set} view={view} rows={freeAllRowsAt(set, year)} />;
  }
}

interface ChartProps {
  t: ChartTokens;
  animate: boolean;
  set: FreeSet;
  view: FreeView;
  rows: FreeRow[];
}

const seriesOf = (set: FreeSet, view: FreeView) =>
  (view.series ?? []).map((key) => columnOf(set, key)).filter((c): c is FreeColumn => c?.kind === "cifra");

/* --- Barras comparadas -------------------------------------------------------------
   Una cifra, dos dimensiones: la categoría va al eje y la columna que compara
   —el periodo, casi siempre— reparte cada categoría en varias barras.

   Cuando hay exactamente dos, la gráfica dice además cuánto varió cada
   categoría. Esa cifra se escribe en tinta, nunca en verde ni en rojo: el
   verde y el rojo de este sistema significan «completo» y «en riesgo», y una
   variación que sube no es un logro ni una alarma mientras nadie diga de qué
   indicador se trata. El signo basta para leerla. */

function CompareBars({ t, animate, set, view, rows }: ChartProps) {
  const category = columnOf(set, view.category)!;
  const compare = columnOf(set, view.compare);
  const measure = seriesOf(set, view)[0];
  if (!compare || !measure) return <Note>Elige la columna de categorías, la que compara y la cifra.</Note>;

  const { keys, groups } = compareTotals(rows, category.key, compare.key, measure.key, view.sort);
  if (!groups.length) return <Note>La fuente no tiene filas para esta gráfica.</Note>;

  const shown = keys.slice(0, MAX_CATEGORICAL);
  const horizontal = view.orientation === "horizontal";
  const data = groups.map(({ label, values }) => {
    const datum: Record<string, string | number> = { categoria: label };
    for (const key of shown) if (values[key] !== null && values[key] !== undefined) datum[key] = values[key]!;
    return datum;
  });

  const longest = Math.max(...groups.map((g) => g.label.length));
  const leftMargin = horizontal ? Math.min(220, 12 + longest * 6.4) : 64;
  const height = horizontal
    ? Math.max(240, groups.length * (shown.length * 16 + 16) + 70)
    : HEIGHT;
  const rotate = !horizontal && groups.length > 5;
  /** La variación solo se dibuja cuando comparar quiere decir «antes y después». */
  const pair = shown.length === 2 ? shown : null;

  return (
    <>
      <Legend items={shown.map((key, i) => ({ label: key, color: t.cats[i] }))} />
      {keys.length > shown.length && (
        <Note>
          Se dibujan los {shown.length} primeros valores de «{compare.label}»; la fuente trae {keys.length}.
        </Note>
      )}
      <Frame height={height}>
        {(width) => (
          <Bar
            width={width}
            height={height}
            data={data}
            keys={shown}
            indexBy="categoria"
            groupMode="grouped"
            layout={horizontal ? "horizontal" : "vertical"}
            margin={{ top: pair ? 30 : 12, right: horizontal && pair ? 76 : 18, bottom: rotate ? 92 : 44, left: leftMargin }}
            padding={0.3}
            innerPadding={3}
            borderRadius={3}
            colors={({ id }) => t.cats[shown.indexOf(String(id))]}
            theme={nivoTheme(t)}
            animate={animate}
            enableGridX={horizontal}
            enableGridY={!horizontal}
            axisBottom={
              horizontal
                ? { tickSize: 0, tickPadding: 8, format: (v) => shortFmt(measure, Number(v)) }
                : { tickSize: 0, tickPadding: 8, tickRotation: rotate ? -38 : 0 }
            }
            axisLeft={
              horizontal
                ? { tickSize: 0, tickPadding: 8 }
                : { tickSize: 0, tickPadding: 8, format: (v) => shortFmt(measure, Number(v)) }
            }
            valueFormat={(v) => shortFmt(measure, v)}
            labelSkipWidth={34}
            labelSkipHeight={16}
            labelTextColor={(d) => inkOn(d.color, t)}
            layers={pair ? ["grid", "axes", "bars", (props) => <Deltas {...props} t={t} measure={measure} pair={pair} horizontal={horizontal} />] : undefined}
            tooltip={({ id, value, indexValue }) => (
              <Tip title={String(indexValue)} lines={[`${compare.label} ${id}: ${fmt(measure, value)}`]} />
            )}
          />
        )}
      </Frame>
    </>
  );
}

/** La variación entre las dos barras de cada categoría, sobre el grupo. */
function Deltas({
  bars,
  t,
  measure,
  pair,
  horizontal,
}: {
  bars: readonly { x: number; y: number; width: number; height: number; data: { id: string | number; value: number | null; indexValue: string | number } }[];
  t: ChartTokens;
  measure: FreeColumn;
  pair: string[];
  horizontal: boolean;
}) {
  const groups = new Map<string, typeof bars[number][]>();
  for (const bar of bars) {
    const key = String(bar.data.indexValue);
    groups.set(key, [...(groups.get(key) ?? []), bar]);
  }

  return (
    <g>
      {[...groups.entries()].map(([label, list]) => {
        const before = list.find((b) => String(b.data.id) === pair[0])?.data.value;
        const after = list.find((b) => String(b.data.id) === pair[1])?.data.value;
        // Sin las dos cifras no hay variación que contar: mejor nada que un cero.
        if (before === null || before === undefined || after === null || after === undefined) return null;
        const diff = after - before;
        const pct = before === 0 ? null : (diff / Math.abs(before)) * 100;
        const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
        const text = `${sign}${formatValue(Math.abs(diff), measure.format ?? "decimal")}${pct === null ? "" : ` (${sign}${formatValue(Math.abs(pct), "decimal")} %)`}`;

        const left = Math.min(...list.map((b) => b.x));
        const right = Math.max(...list.map((b) => b.x + b.width));
        const top = Math.min(...list.map((b) => b.y));
        const bottom = Math.max(...list.map((b) => b.y + b.height));

        return (
          <text
            key={label}
            x={horizontal ? right + 8 : (left + right) / 2}
            y={horizontal ? (top + bottom) / 2 : top - 8}
            textAnchor={horizontal ? "start" : "middle"}
            dominantBaseline={horizontal ? "middle" : "auto"}
            style={{ fill: t.secondary, fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
          >
            {text}
          </text>
        );
      })}
    </g>
  );
}

/* --- Barras ------------------------------------------------------------------------ */

function Bars({ t, animate, set, view, rows }: ChartProps) {
  const category = columnOf(set, view.category)!;
  const allSeries = seriesOf(set, view);
  const series = allSeries.slice(0, MAX_CATEGORICAL);
  const totals = categoryTotals(rows, category.key, series.map((s) => s.key), view.sort);
  const percent = view.type === "barras_100";
  const horizontal = view.orientation === "horizontal";
  const data = totals.map(({ label, values }) => {
    const sum = series.reduce((acc, s) => acc + (values[s.key] ?? 0), 0);
    const datum: Record<string, string | number> = { categoria: label };
    series.forEach((s) => {
      const v = values[s.key];
      if (v !== null) datum[s.key] = percent ? (sum ? (v / sum) * 100 : 0) : v;
    });
    return datum;
  });
  if (!data.length) return <Note>La fuente no tiene filas para esta gráfica.</Note>;
  const longest = Math.max(...totals.map((d) => d.label.length));
  const leftMargin = horizontal ? Math.min(220, 12 + longest * 6.4) : 64;
  const height = horizontal ? Math.max(220, data.length * (series.length > 1 && view.type === "barras" ? 34 : 26) + 70) : HEIGHT;
  const rotate = !horizontal && data.length > 6;

  return (
    <>
      <Legend items={series.map((s, i) => ({ label: s.label, color: t.cats[i] }))} />
      <Frame height={height}>
        {(width) => (
          <Bar
            width={width}
            height={height}
            data={data}
            keys={series.map((s) => s.key)}
            indexBy="categoria"
            groupMode={view.type === "barras" ? "grouped" : "stacked"}
            layout={horizontal ? "horizontal" : "vertical"}
            margin={{ top: 12, right: 18, bottom: rotate ? 92 : 44, left: leftMargin }}
            padding={0.28}
            innerPadding={2}
            borderRadius={3}
            colors={({ id }) => t.cats[series.findIndex((s) => s.key === id)]}
            theme={nivoTheme(t)}
            animate={animate}
            enableGridX={horizontal}
            enableGridY={!horizontal}
            axisBottom={horizontal ? { tickSize: 0, tickPadding: 8, format: (v) => (percent ? `${v} %` : shortFmt(series[0], Number(v))) } : { tickSize: 0, tickPadding: 8, tickRotation: rotate ? -38 : 0 }}
            axisLeft={horizontal ? { tickSize: 0, tickPadding: 8 } : { tickSize: 0, tickPadding: 8, format: (v) => (percent ? `${v} %` : shortFmt(series[0], Number(v))) }}
            valueFormat={(v) => (percent ? `${formatValue(v, "decimal")} %` : shortFmt(series[0], v))}
            labelSkipWidth={34}
            labelSkipHeight={16}
            labelTextColor={(d) => inkOn(d.color, t)}
            tooltip={({ id, value, indexValue }) => {
              const column = series.find((s) => s.key === id);
              return <Tip title={String(indexValue)} lines={[`${column?.label}: ${percent ? `${formatValue(value, "decimal")} %` : fmt(column, value)}`]} />;
            }}
            role="img"
            ariaLabel={view.title}
          />
        )}
      </Frame>
      {allSeries.length > MAX_CATEGORICAL && <Note>Se dibujan las seis primeras cifras; el resto está en la tabla.</Note>}
      <SrTable caption={view.title} head={[category.label, ...series.map((s) => s.label)]} rows={totals.map((d) => [d.label, ...series.map((s) => fmt(s, d.values[s.key]))])} />
    </>
  );
}

/* --- Circular y dona ----------------------------------------------------------------- */

function PieChart({ t, animate, set, view, rows }: ChartProps) {
  const category = columnOf(set, view.category)!;
  const measure = seriesOf(set, view)[0];
  const totals = categoryTotals(rows, category.key, [measure.key], "desc").filter((d) => (d.values[measure.key] ?? 0) > 0);
  const head = totals.slice(0, totals.length > MAX_CATEGORICAL ? MAX_CATEGORICAL - 1 : MAX_CATEGORICAL);
  const rest = totals.slice(head.length);
  const data = [
    ...head.map((d, i) => ({ id: d.label, label: d.label, value: d.values[measure.key]!, color: t.cats[i] })),
    ...(rest.length ? [{ id: "Otros", label: `Otros (${rest.length})`, value: rest.reduce((s, d) => s + (d.values[measure.key] ?? 0), 0), color: t.muted }] : []),
  ];
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length) return <Note>La fuente no tiene valores positivos para repartir.</Note>;
  const donut = view.type === "dona";

  return (
    <>
      <div className="od-free__pie">
        <Frame height={320}>
          {(width) => {
            const size = Math.min(width, 360);
            return (
              <div className="od-free__pie-plot" style={{ width: size, height: 320 }}>
                <Pie
                  width={size}
                  height={320}
                  data={data}
                  margin={{ top: 16, right: 16, bottom: 16, left: 16 }}
                  innerRadius={donut ? 0.62 : 0}
                  padAngle={0.8}
                  cornerRadius={3}
                  colors={(d) => d.data.color}
                  borderWidth={1}
                  borderColor={t.surface}
                  enableArcLinkLabels={false}
                  arcLabelsSkipAngle={18}
                  arcLabel={(d) => `${formatValue((d.value / total) * 100, "decimal")} %`}
                  arcLabelsTextColor={(d) => inkOn(d.data.color, t)}
                  theme={nivoTheme(t)}
                  animate={animate}
                  tooltip={({ datum }) => <Tip title={String(datum.label)} lines={[fmt(measure, datum.value), `${formatValue((datum.value / total) * 100, "decimal")} % del total`]} />}
                  role="img"
                />
                {donut && (
                  <span className="od-free__pie-total" aria-hidden="true">
                    <strong>{shortFmt(measure, total)}</strong>
                    <small>{measure.unit || "total"}</small>
                  </span>
                )}
              </div>
            );
          }}
        </Frame>
        <ol className="od-free__pie-list">
          {data.map((d) => (
            <li key={d.id}>
              <i style={{ background: d.color }} aria-hidden="true" />
              <span>{d.label}</span>
              <b>{shortFmt(measure, d.value)}</b>
              <small>{formatValue((d.value / total) * 100, "decimal")} %</small>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/* --- Radar ------------------------------------------------------------------------------ */

function RadarChart({ t, animate, set, view, rows }: ChartProps) {
  const category = columnOf(set, view.category)!;
  const axes = seriesOf(set, view);
  const totals = categoryTotals(rows, category.key, axes.map((a) => a.key), view.sort).slice(0, MAX_CATEGORICAL);
  // Cada eje tiene su escala: se muestra en % de su máximo y el tooltip da la cifra real.
  const max = Object.fromEntries(axes.map((a) => [a.key, Math.max(0, ...totals.map((d) => d.values[a.key] ?? 0))]));
  const data = axes.map((a) => ({
    eje: a.label,
    ...Object.fromEntries(totals.map((d) => [d.label, d.values[a.key] === null || !max[a.key] ? 0 : ((d.values[a.key] as number) / max[a.key]) * 100])),
  }));
  if (!totals.length) return <Note>La fuente no tiene filas para esta gráfica.</Note>;

  return (
    <>
      <Legend items={totals.map((d, i) => ({ label: d.label, color: t.cats[i] }))} />
      <Frame height={380}>
        {(width) => (
          <Radar
            width={Math.min(width, 620)}
            height={380}
            data={data}
            keys={totals.map((d) => d.label)}
            indexBy="eje"
            maxValue={100}
            margin={{ top: 36, right: 90, bottom: 36, left: 90 }}
            gridShape="linear"
            gridLevels={4}
            borderWidth={2}
            borderColor={{ from: "color" }}
            fillOpacity={0.12}
            dotSize={7}
            dotBorderWidth={2}
            dotColor={t.surface}
            dotBorderColor={{ from: "color" }}
            colors={totals.map((_, i) => t.cats[i])}
            valueFormat={(v) => `${formatValue(v, "decimal")} %`}
            theme={nivoTheme(t)}
            animate={animate}
            sliceTooltip={({ index, data: slice }) => {
              const axis = axes.find((a) => a.label === index)!;
              return (
                <Tip
                  title={String(index)}
                  lines={slice.map((s) => `${s.id}: ${fmt(axis, totals.find((d) => d.label === s.id)?.values[axis.key] ?? null)}`)}
                />
              );
            }}
          />
        )}
      </Frame>
      <Note>Cada eje va de cero al valor más alto de ese eje: las cifras tienen escalas distintas. La cifra real está al pasar el puntero.</Note>
      <SrTable caption={view.title} head={[category.label, ...axes.map((a) => a.label)]} rows={totals.map((d) => [d.label, ...axes.map((a) => fmt(a, d.values[a.key]))])} />
    </>
  );
}

/* --- Líneas y área ------------------------------------------------------------------------- */

function LineChart({ t, animate, set, view }: ChartProps) {
  const series = seriesOf(set, view);
  const category = columnOf(set, view.category);
  const byYear = set.temporality === "anual";
  const years = freeYears(set);
  const lead = series[0];

  let lines: { id: string; color: string; data: { x: string; y: number | null }[] }[];
  if (byYear && category) {
    // Una línea por categoría con la primera cifra.
    const labels = Array.from(new Set(set.rows.map((r) => textOf(r.cells[category.key])).filter(Boolean))).slice(0, MAX_CATEGORICAL);
    lines = labels.map((label, i) => ({
      id: label,
      color: t.cats[i],
      data: years.map((y) => {
        const values = set.rows.filter((r) => r.year === y && textOf(r.cells[category.key]) === label).map((r) => numberOf(r.cells[lead.key])).filter((v): v is number => v !== null);
        return { x: String(y), y: values.length ? values.reduce((a, b) => a + b, 0) : null };
      }),
    }));
  } else if (byYear) {
    lines = series.slice(0, MAX_CATEGORICAL).map((s, i) => ({
      id: s.label,
      color: t.cats[i],
      data: years.map((y) => {
        const values = set.rows.filter((r) => r.year === y).map((r) => numberOf(r.cells[s.key])).filter((v): v is number => v !== null);
        return { x: String(y), y: values.length ? values.reduce((a, b) => a + b, 0) : null };
      }),
    }));
  } else {
    const totals = category ? categoryTotals(set.rows, category.key, series.map((s) => s.key), view.sort) : [];
    lines = series.slice(0, MAX_CATEGORICAL).map((s, i) => ({
      id: s.label,
      color: t.cats[i],
      data: totals.map((d) => ({ x: d.label, y: d.values[s.key] })),
    }));
  }
  const points = lines.flatMap((l) => l.data.map((d) => d.y)).filter((v): v is number => v !== null);
  if (!points.length) return <Note>La fuente no tiene cifras para esta gráfica.</Note>;
  const stacked = view.type === "area" && lines.length > 1;
  const min = Math.min(...points);

  return (
    <>
      <Legend items={lines.map((l) => ({ label: l.id, color: l.color }))} />
      <Frame>
        {(width) => (
          <Line
            width={width}
            height={HEIGHT}
            data={lines}
            margin={{ top: 16, right: 24, bottom: 48, left: 64 }}
            xScale={{ type: "point" }}
            yScale={{ type: "linear", min: stacked || min >= 0 ? 0 : "auto", max: "auto", stacked }}
            curve="monotoneX"
            colors={(d) => (d as { color: string }).color}
            lineWidth={2}
            pointSize={7}
            pointColor={t.surface}
            pointBorderWidth={2}
            pointBorderColor={{ from: "seriesColor" }}
            enableArea={view.type === "area"}
            areaOpacity={stacked ? 0.55 : 0.16}
            enableSlices="x"
            axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: lines[0].data.length > 8 ? -30 : 0 }}
            axisLeft={{ tickSize: 0, tickPadding: 8, format: (v) => shortFmt(lead, Number(v)) }}
            theme={nivoTheme(t)}
            animate={animate}
            sliceTooltip={({ slice }) => (
              <Tip
                title={String(slice.points[0]?.data.xFormatted ?? "")}
                lines={slice.points.map((p) => `${p.seriesId}: ${fmt(lead, p.data.y === null ? null : Number(p.data.y))}`)}
              />
            )}
            role="img"
          />
        )}
      </Frame>
      {stacked && <Note>Áreas apiladas: la altura total es la suma de las series.</Note>}
      <SrTable caption={view.title} head={["", ...lines[0].data.map((d) => d.x)]} rows={lines.map((l) => [l.id, ...l.data.map((d) => fmt(lead, d.y))])} />
    </>
  );
}

/* --- Histograma ------------------------------------------------------------------------------ */

function Histogram({ t, animate, set, view, rows }: ChartProps) {
  const measure = seriesOf(set, view)[0];
  const values = rows.map((r) => numberOf(r.cells[measure.key])).filter((v): v is number => v !== null);
  const bins = histogramBins(values, view.bins);
  if (!bins.length) return <Note>La fuente no tiene valores para repartir en tramos.</Note>;
  const data = bins.map((b) => ({ tramo: `${shortFmt(measure, b.from)}–${shortFmt(measure, b.to)}`, observaciones: b.count }));

  return (
    <>
      <Frame>
        {(width) => (
          <Bar
            width={width}
            height={HEIGHT}
            data={data}
            keys={["observaciones"]}
            indexBy="tramo"
            margin={{ top: 12, right: 28, bottom: data.length > 8 ? 80 : 48, left: 56 }}
            padding={0.04}
            borderRadius={2}
            colors={[t.cats[0]]}
            theme={nivoTheme(t)}
            animate={animate}
            axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: data.length > 8 ? -38 : 0, legend: measure.label, legendOffset: data.length > 8 ? 70 : 38, legendPosition: "middle" }}
            axisLeft={{ tickSize: 0, tickPadding: 8, legend: "Observaciones", legendOffset: -44, legendPosition: "middle" }}
            labelSkipHeight={16}
            labelTextColor={inkOn(t.cats[0], t)}
            tooltip={({ indexValue, value }) => <Tip title={`${measure.label}: ${indexValue}`} lines={[`${formatValue(value, "entero")} ${value === 1 ? "observación" : "observaciones"}`]} />}
            role="img"
            ariaLabel={view.title}
          />
        )}
      </Frame>
      <Note>
        {formatValue(values.length, "entero")} observaciones en {bins.length} tramos de igual ancho. Cada fila de la fuente es una observación.
      </Note>
      <SrTable caption={view.title} head={["Tramo", "Observaciones"]} rows={data.map((d) => [d.tramo, d.observaciones])} />
    </>
  );
}

/* --- Diagrama de caja -------------------------------------------------------------------------- */

function BoxChart({ t, animate, set, view, rows }: ChartProps) {
  const measure = seriesOf(set, view)[0];
  const category = columnOf(set, view.category);
  const data = rows
    .map((r) => ({ group: category ? textOf(r.cells[category.key]) || "Sin grupo" : measure.label, value: numberOf(r.cells[measure.key]) }))
    .filter((d): d is { group: string; value: number } => d.value !== null);
  const groups = Array.from(new Set(data.map((d) => d.group))).slice(0, 12);
  if (!data.length) return <Note>La fuente no tiene valores para este diagrama.</Note>;

  return (
    <>
      <Frame>
        {(width) => (
          <BoxPlot
            width={width}
            height={HEIGHT}
            data={data.filter((d) => groups.includes(d.group))}
            groupBy="group"
            groups={groups}
            value="value"
            margin={{ top: 16, right: 24, bottom: groups.length > 6 ? 80 : 48, left: 64 }}
            padding={0.4}
            quantiles={[0, 0.25, 0.5, 0.75, 1]}
            colors={[t.cats[0]]}
            opacity={0.35}
            borderRadius={3}
            borderWidth={2}
            borderColor={{ from: "color" }}
            medianWidth={3}
            medianColor={t.ink}
            whiskerColor={{ from: "color" }}
            whiskerWidth={2}
            whiskerEndSize={0.5}
            axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: groups.length > 6 ? -35 : 0 }}
            axisLeft={{ tickSize: 0, tickPadding: 8, format: (v) => shortFmt(measure, Number(v)), legend: measure.label, legendOffset: -52, legendPosition: "middle" }}
            valueFormat={(v) => shortFmt(measure, v)}
            // El tipo del tema de BoxPlot pide una clave de traducción que el tema no usa.
            theme={nivoTheme(t) as unknown as ComponentProps<typeof BoxPlot>["theme"]}
            animate={animate}
            tooltip={({ label, formatted }) => (
              <Tip
                title={String(label)}
                lines={[
                  `Mínimo ${formatted.values[0]}`,
                  `Primer cuartil ${formatted.values[1]}`,
                  `Mediana ${formatted.values[2]}`,
                  `Tercer cuartil ${formatted.values[3]}`,
                  `Máximo ${formatted.values[4]}`,
                  `${formatted.n} observaciones`,
                ]}
              />
            )}
          />
        )}
      </Frame>
      <Note>La caja va del primer al tercer cuartil; la raya es la mediana y los bigotes llegan al mínimo y al máximo. Cada fila de la fuente es una observación.</Note>
    </>
  );
}

/* --- Cascada ------------------------------------------------------------------------------------ */

function Waterfall({ t, set, view, rows }: ChartProps) {
  const category = columnOf(set, view.category)!;
  const measure = seriesOf(set, view)[0];
  const wrap = useRef<HTMLDivElement>(null);
  const width = useCanvasWidth(wrap, 320);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);
  const totals = categoryTotals(rows, category.key, [measure.key], "fuente").filter((d) => d.values[measure.key] !== null);

  const steps = useMemo(() => {
    let running = 0;
    const list = totals.map((d) => {
      const value = d.values[measure.key]!;
      const from = running;
      running += value;
      return { label: d.label, value, from, to: running, kind: value >= 0 ? "sube" : "baja" };
    });
    if (view.total) list.push({ label: "Total", value: running, from: 0, to: running, kind: "total" });
    return list;
  }, [totals, measure.key, view.total]);
  if (!steps.length) return <Note>La fuente no tiene cifras para esta cascada.</Note>;

  const guessW = (width - 80) / steps.length;
  const rotateLabels = steps.some((s) => s.label.length * 6.6 > guessW - 6);
  const M = { top: 22, right: 16, bottom: rotateLabels ? 96 : 44, left: 64 };
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const lo = Math.min(0, ...steps.map((s) => Math.min(s.from, s.to)));
  const hi = niceCeil(Math.max(0, ...steps.map((s) => Math.max(s.from, s.to))) * 1.08);
  const y = (v: number) => M.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH;
  const band = innerW / steps.length;
  const barW = Math.min(64, band * 0.62);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
  const color = (kind: string) => (kind === "total" ? t.total : kind === "sube" ? t.pos : t.neg);
  const show = (e: MouseEvent<SVGRectElement>, s: (typeof steps)[number]) => {
    const host = wrap.current?.getBoundingClientRect();
    const box = e.currentTarget.getBoundingClientRect();
    if (!host) return;
    setTip({
      x: box.left - host.left + box.width / 2,
      y: box.top - host.top,
      title: s.label,
      lines: s.kind === "total" ? [`Total: ${fmt(measure, s.to)}`] : [`${s.value >= 0 ? "Suma" : "Resta"} ${fmt(measure, Math.abs(s.value))}`, `Acumulado: ${fmt(measure, s.to)}`],
    });
  };

  return (
    <>
      <Legend
        items={[
          { label: "Suma", color: t.pos },
          { label: "Resta", color: t.neg },
          ...(view.total ? [{ label: "Total", color: t.total }] : []),
        ]}
      />
      <div className="od-free__canvas" ref={wrap}>
        <svg width={width} height={HEIGHT} role="img" aria-label={view.title} className="od-free__svg">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} style={{ stroke: t.line }} />
              <text x={M.left - 8} y={y(v) + 4} textAnchor="end" className="od-free__tick">
                {shortFmt(measure, v)}
              </text>
            </g>
          ))}
          {steps.map((s, i) => {
            const cx = M.left + band * i + band / 2;
            const top = y(Math.max(s.from, s.to));
            const h = Math.max(1, Math.abs(y(s.from) - y(s.to)));
            const next = steps[i + 1];
            return (
              <g key={`${s.label}-${i}`}>
                <rect
                  x={cx - barW / 2}
                  y={top}
                  width={barW}
                  height={h}
                  rx={3}
                  style={{ fill: color(s.kind) }}
                  onMouseEnter={(e) => show(e, s)}
                  onMouseLeave={() => setTip(null)}
                />
                <text x={cx} y={top - 6} textAnchor="middle" className="od-free__value">
                  {s.kind === "total" ? shortFmt(measure, s.to) : `${s.value >= 0 ? "+" : "−"}${shortFmt(measure, Math.abs(s.value))}`}
                </text>
                {next && next.kind !== "total" && (
                  <line x1={cx + barW / 2} x2={cx + band - barW / 2} y1={y(s.to)} y2={y(s.to)} className="od-free__connector" style={{ stroke: t.muted }} />
                )}
                <text
                  x={cx}
                  y={HEIGHT - M.bottom + 16}
                  textAnchor={rotateLabels ? "end" : "middle"}
                  transform={rotateLabels ? `rotate(-35 ${cx} ${HEIGHT - M.bottom + 16})` : undefined}
                  className="od-free__tick"
                >
                  {s.label}
                </text>
              </g>
            );
          })}
          <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} style={{ stroke: t.ink }} />
        </svg>
        {tip && (
          <ChartTooltip x={tip.x} y={tip.y}>
            <strong>{tip.title}</strong>
            {tip.lines.map((line) => (
              <em key={line}>{line}</em>
            ))}
          </ChartTooltip>
        )}
      </div>
      <SrTable
        caption={view.title}
        head={[category.label, measure.label, "Acumulado"]}
        rows={steps.map((s) => [s.label, s.kind === "total" ? fmt(measure, s.to) : fmt(measure, s.value), fmt(measure, s.to)])}
      />
    </>
  );
}

/* --- Gantt ------------------------------------------------------------------------------------------ */

const dateText = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
const monthText = new Intl.DateTimeFormat("es-CO", { month: "short" });

function Gantt({ t, set, view, rows }: ChartProps) {
  const category = columnOf(set, view.category)!;
  const wrap = useRef<HTMLDivElement>(null);
  const width = useCanvasWidth(wrap, 420);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);
  const tasks = rows
    .map((r) => ({ label: textOf(r.cells[category.key]), start: dateOf(r.cells[view.start!]), end: dateOf(r.cells[view.end!]) }))
    .filter((d): d is { label: string; start: Date; end: Date } => Boolean(d.label && d.start && d.end))
    .map((d) => (d.end < d.start ? { ...d, start: d.end, end: d.start } : d));
  const skipped = rows.length - tasks.length;
  if (!tasks.length) return <Note>Ninguna fila tiene tarea, inicio y fin válidos.</Note>;

  const longest = Math.max(...tasks.map((d) => d.label.length));
  const M = { top: 34, right: 16, bottom: 12, left: Math.min(260, 16 + longest * 6.6) };
  const ROW = 30;
  const height = M.top + tasks.length * ROW + M.bottom;
  const min = Math.min(...tasks.map((d) => d.start.getTime()));
  const max = Math.max(...tasks.map((d) => d.end.getTime()));
  const span = Math.max(86400000, max - min);
  const innerW = width - M.left - M.right;
  const x = (ms: number) => M.left + ((ms - min) / span) * innerW;
  const years = span > 3 * 365 * 86400000;
  const ticks: Date[] = [];
  const first = new Date(min);
  for (let d = new Date(first.getFullYear(), years ? 0 : first.getMonth(), 1); d.getTime() <= max; d = years ? new Date(d.getFullYear() + 1, 0, 1) : new Date(d.getFullYear(), d.getMonth() + (span > 400 * 86400000 ? 3 : 1), 1)) {
    if (d.getTime() >= min) ticks.push(d);
  }
  const today = Date.now();
  const show = (e: MouseEvent<SVGRectElement>, task: (typeof tasks)[number]) => {
    const host = wrap.current?.getBoundingClientRect();
    const box = e.currentTarget.getBoundingClientRect();
    if (!host) return;
    const days = Math.round((task.end.getTime() - task.start.getTime()) / 86400000) + 1;
    setTip({ x: box.left - host.left + box.width / 2, y: box.top - host.top, title: task.label, lines: [`${dateText.format(task.start)} – ${dateText.format(task.end)}`, `${formatValue(days, "entero")} días`] });
  };

  return (
    <>
      <div className="od-free__canvas od-free__canvas--scroll" ref={wrap}>
        <svg width={width} height={height} role="img" aria-label={view.title} className="od-free__svg">
          {ticks.map((d) => (
            <g key={d.getTime()}>
              <line x1={x(d.getTime())} x2={x(d.getTime())} y1={M.top - 6} y2={height - M.bottom} style={{ stroke: t.line }} />
              <text x={x(d.getTime()) + 4} y={M.top - 12} className="od-free__tick">
                {years ? d.getFullYear() : d.getMonth() === 0 ? `${monthText.format(d)} ${d.getFullYear()}` : monthText.format(d)}
              </text>
            </g>
          ))}
          {tasks.map((task, i) => {
            const top = M.top + i * ROW;
            const x0 = x(task.start.getTime());
            const w = Math.max(4, x(task.end.getTime()) - x0);
            return (
              <g key={`${task.label}-${i}`}>
                <text x={M.left - 10} y={top + ROW / 2 + 4} textAnchor="end" className="od-free__label">
                  {task.label}
                </text>
                <rect x={x0} y={top + 6} width={w} height={ROW - 12} rx={4} style={{ fill: t.cats[0] }} onMouseEnter={(e) => show(e, task)} onMouseLeave={() => setTip(null)} />
              </g>
            );
          })}
          {today >= min && today <= max && (
            <g>
              <line x1={x(today)} x2={x(today)} y1={M.top - 6} y2={height - M.bottom} className="od-free__today" style={{ stroke: t.ink }} />
              <text x={x(today) + 4} y={height - M.bottom - 4} className="od-free__tick">
                hoy
              </text>
            </g>
          )}
        </svg>
        {tip && (
          <ChartTooltip x={tip.x} y={tip.y}>
            <strong>{tip.title}</strong>
            {tip.lines.map((line) => (
              <em key={line}>{line}</em>
            ))}
          </ChartTooltip>
        )}
      </div>
      {skipped > 0 && <Note>{skipped} {skipped === 1 ? "fila no tiene" : "filas no tienen"} fecha de inicio y fin válidas y no se dibujan.</Note>}
      <SrTable caption={view.title} head={[category.label, "Inicio", "Fin"]} rows={tasks.map((d) => [d.label, dateText.format(d.start), dateText.format(d.end)])} />
    </>
  );
}

/* --- Mapa ------------------------------------------------------------------------------------------ */

const MAP_BINS = 7;

/**
 * Coroplético de la fuente: las formas de Colombia o del mundo del portal, en la
 * escala azul secuencial (claro = poco). Escala logarítmica en siete tramos,
 * como el mapa por departamento: lo pequeño no desaparece junto a lo grande.
 * Al lado, el ranking con la cifra: el color nunca va solo.
 */
function FreeMap({ set, view, rows }: ChartProps) {
  const territory = columnOf(set, view.category)!;
  const measure = seriesOf(set, view)[0];
  const kind = territory.territory ?? "departamento";
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; code: string } | null>(null);
  const values: Record<string, number> = {};
  const names: Record<string, string> = {};
  const unknown: string[] = [];
  for (const row of rows) {
    const text = textOf(row.cells[territory.key]);
    const code = territoryCode(kind, row.cells[territory.key]);
    const value = numberOf(row.cells[measure.key]);
    if (!code) {
      if (text) unknown.push(text);
      continue;
    }
    if (value !== null) values[code] = (values[code] ?? 0) + value;
  }
  const shapes = kind === "pais" ? COUNTRIES : DEPARTMENTS;
  shapes.forEach((shape) => (names[shape.code] = shape.name));
  const ranking = Object.entries(values).sort((a, b) => b[1] - a[1]);
  if (!ranking.length) return <Note>Ninguna fila tiene un {kind === "pais" ? "país" : "departamento"} reconocible con cifra.</Note>;
  const max = Math.max(10, ranking[0][1]);
  const binOf = (value: number | undefined) => (!value || value <= 0 ? 0 : Math.max(1, Math.min(MAP_BINS, Math.ceil((Math.log10(value) / Math.log10(max)) * MAP_BINS))));
  const [w, h] = kind === "pais" ? [WORLD_WIDTH, WORLD_HEIGHT] : [MAP_WIDTH, MAP_HEIGHT];
  const move = (event: MouseEvent<SVGPathElement>, code: string) => {
    const box = wrap.current?.getBoundingClientRect();
    if (box) setTip({ x: event.clientX - box.left, y: event.clientY - box.top - 12, code });
  };

  return (
    <div className="od-free__map">
      <div className="od-free__map-canvas" ref={wrap}>
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${view.title}. El detalle está en el ranking.`} onMouseLeave={() => setTip(null)}>
          {shapes.map((shape) => (
            <path
              key={shape.code}
              d={shape.d}
              className="od-free__map-shape"
              data-active={tip?.code === shape.code || undefined}
              style={{ fill: `var(--od-seq-${binOf(values[shape.code])})` }}
              onMouseMove={(e) => move(e, shape.code)}
            />
          ))}
        </svg>
        {tip && (
          <ChartTooltip x={tip.x} y={tip.y}>
            <strong>{names[tip.code] ?? tip.code}</strong>
            <em>{values[tip.code] === undefined ? "Sin dato" : fmt(measure, values[tip.code])}</em>
          </ChartTooltip>
        )}
      </div>
      <div className="od-free__map-side">
        <ol className="od-free__map-rank">
          {ranking.slice(0, 10).map(([code, value], i) => (
            <li key={code}>
              <span>{i + 1}</span>
              <b>{names[code] ?? code}</b>
              <em>{shortFmt(measure, value)}</em>
            </li>
          ))}
        </ol>
        {ranking.length > 10 && <Note>Los 10 primeros de {ranking.length}; el resto, al pasar el puntero.</Note>}
        <div className="od-free__map-scale" aria-hidden="true">
          {Array.from({ length: MAP_BINS }, (_, i) => (
            <i key={i} style={{ background: `var(--od-seq-${i + 1})` }} />
          ))}
          <small>poco</small>
          <small>{shortFmt(measure, ranking[0][1])}{measure.unit ? ` ${measure.unit}` : ""}</small>
        </div>
        {unknown.length > 0 && <Note>No se ubicaron: {Array.from(new Set(unknown)).slice(0, 6).join(", ")}{unknown.length > 6 ? "…" : ""}.</Note>}
      </div>
    </div>
  );
}

/* --- Cifras clave ------------------------------------------------------------------------------ */

function Figures({ set, view, rows }: ChartProps) {
  const series = seriesOf(set, view);
  const category = columnOf(set, view.category);
  // Con categoría y pocas filas, una ficha por fila; si no, la cifra agregada de la fuente.
  if (category && rows.length > 0 && rows.length <= 4 && series.length === 1) {
    const s = series[0];
    return (
      <div className="od-free__figures">
        {rows.map((row, i) => {
          const value = numberOf(row.cells[s.key]);
          return (
            <div className="od-free__figure" key={i}>
              <SplitFlap value={value === null ? "—" : shortFmt(s, value)} size="lg" numeric delay={i * 90} label={fmt(s, value)} />
              <strong>{textOf(row.cells[category.key]) || "Sin nombre"}</strong>
              <small>{s.label}{s.unit ? ` · ${s.unit}` : ""}</small>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="od-free__figures">
      {series.map((s, i) => {
        const values = rows.map((r) => numberOf(r.cells[s.key])).filter((v): v is number => v !== null);
        const additive = (s.format ?? "entero") === "entero";
        const value = values.length === 0 ? null : values.length === 1 ? values[0] : additive ? values.reduce((a, b) => a + b, 0) : values.reduce((a, b) => a + b, 0) / values.length;
        const basis = values.length > 1 ? (additive ? `suma de ${values.length} filas` : `promedio de ${values.length} filas`) : "";
        return (
          <div className="od-free__figure" key={s.key}>
            <SplitFlap value={value === null ? "—" : shortFmt(s, value)} size="lg" numeric delay={i * 90} label={fmt(s, value)} />
            <strong>{s.label}</strong>
            <small>{[s.unit, basis].filter(Boolean).join(" · ") || " "}</small>
          </div>
        );
      })}
    </div>
  );
}

/* --- Tabla ------------------------------------------------------------------------------------------ */

/**
 * La fuente tal como se capturó: los títulos de grupo abren su tramo y las
 * filas de total llevan la cifra calculada sobre las filas de datos de su
 * grupo (suma en enteros, promedio en decimales y porcentajes), con la
 * operación dicha en el encabezado de la fila.
 */
function FreeTable({ set, view, rows }: { set: FreeSet; view: FreeView; rows: FreeRow[] }) {
  const columns = set.columns;
  const yearColumn = set.temporality === "anual";
  const cell = (row: FreeRow, column: FreeColumn) => {
    const value = column.kind === "cifra" ? numberOf(row.cells[column.key]) : textOf(row.cells[column.key]);
    if (value === null || value === "") return null;
    return typeof value === "number" ? shortFmt(column, value) : value;
  };
  return (
    <div className="od-free__table" tabIndex={0} role="region" aria-label={`${view.title}, desplazable`}>
      <table className="od-table">
        <caption className="sr-only">{view.title}</caption>
        <thead>
          <tr>
            {yearColumn && <th scope="col">Año</th>}
            {columns.map((c) => (
              <th key={c.key} scope="col" data-numeric={c.kind === "cifra" || undefined}>
                {c.label}
                {c.unit ? <small> · {c.unit}</small> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            if (row.kind === "grupo") {
              return (
                <tr key={index} data-kind="grupo">
                  <th scope="colgroup" colSpan={columns.length + (yearColumn ? 1 : 0)}>
                    {row.label || "Sin título"}
                  </th>
                </tr>
              );
            }
            const total = row.kind === "total" ? freeTotalAt(rows, index, columns) : null;
            const operations = total ? Array.from(new Set(Object.values(total.basis))) : [];
            return (
              <tr key={index} data-kind={row.kind}>
                {yearColumn && <td data-numeric>{row.year ?? "—"}</td>}
                {columns.map((c, i) => {
                  if (total) {
                    const value = total.cells[c.key];
                    return (
                      <td key={c.key} data-numeric={c.kind === "cifra" || undefined}>
                        {i === 0 && c.kind !== "cifra" ? (
                          <>
                            {row.label || "Total"}
                            {operations.length > 0 && (
                              <small>
                                {" "}
                                · {operations.length === 1 ? (operations[0] === "suma" ? "suma" : "promedio") : "suma y promedio"} de {total.count}
                              </small>
                            )}
                          </>
                        ) : value === null || value === undefined ? (
                          "—"
                        ) : (
                          shortFmt(c, value as number)
                        )}
                      </td>
                    );
                  }
                  const text = cell(row, c);
                  return (
                    <td key={c.key} data-numeric={c.kind === "cifra" || undefined} data-empty={text === null || undefined}>
                      {text ?? "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Ninguna vista trae su propio marco: todas van en un panel del tablero. */
export const hasOwnFrame = (_view: FreeView) => false;

export { CHART_TYPES };
