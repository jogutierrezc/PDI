/* =============================================================================
   Observatorio · cómo se dibuja un visor.

   Los quince tipos de los conjuntos libres se dibujan con FreeChart, el mismo
   de las fichas de UDES en Cifras. Los siete que solo tenían los informes se
   dibujan aquí con los mismos tokens de gráfica: mapa de calor, mosaico,
   embudo, puntos, bosque, ranking y mapa por municipio.

   También viven aquí la tabla de datos brutos (ordenable, con la reserva
   «< 5» a la vista) y las minivistas de la galería de tipos.

   Reglas de siempre: un vacío no es cero; la reserva no se dibuja como dato;
   con dos o más series hay leyenda; cada gráfica propia trae su tabla para
   lectores de pantalla.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { FreeChart } from "../../datos-abiertos/components/free/FreeCharts";
import { useChartTokens, inkOn } from "../../datos-abiertos/components/free/chart-tokens";
import type { ChartTokens } from "../../datos-abiertos/components/free/chart-tokens";
import { useWidth } from "../../datos-abiertos/components/motion";
import { numberOf, textOf } from "../../datos-abiertos/data/free-sets";
import type { FreeRow, FreeView } from "../../datos-abiertos/data/free-sets";
import { formatValue } from "../../datos-abiertos/data/open-data";
import { squarify } from "../../datos-abiertos/data/dei";
import { DEPARTMENTS, MAP_HEIGHT, MAP_WIDTH } from "../../datos-abiertos/data/colombia-map";
import { MUNICIPIOS } from "../../datos-abiertos/data/colombia-municipios";
import { locateMunicipio } from "../../datos-abiertos/data/municipios";
import "../../datos-abiertos/components/free-sets.css";
import "./obs-charts.css";
import { RESERVED_TEXT, asFreeSet, isFreeType, obsViewProblems } from "./model";
import type { ObsChartType, ObsColumn, ObsDataset, ObsView } from "./model";

type Drawable = Pick<ObsView, "type" | "title" | "category" | "category2" | "series" | "start" | "end" | "orientation" | "sort" | "reference" | "limit" | "bins" | "total"> & {
  key?: string;
};

const isReserved = (cell: unknown) => typeof cell === "string" && cell.trim() === RESERVED_TEXT;

const fmtOf = (column: ObsColumn | undefined, value: number | null) =>
  value === null ? "Sin dato" : `${formatValue(value, column?.format ?? "decimal")}${column?.unit ? (column.unit === "%" ? " %" : ` ${column.unit}`) : ""}`;

/** Filas de datos (sin títulos ni totales). */
const dataRows = (dataset: ObsDataset) => dataset.rows.filter((r) => r.kind === "dato");

/** Categoría → suma de una cifra, en orden de aparición. Cuenta aparte las casillas en reserva. */
function totalsBy(rows: FreeRow[], category: string, measure: string) {
  const order: string[] = [];
  const sums = new Map<string, number | null>();
  let reserved = 0;
  for (const row of rows) {
    const label = textOf(row.cells[category]);
    if (!label) continue;
    if (!sums.has(label)) {
      order.push(label);
      sums.set(label, null);
    }
    const cell = row.cells[measure];
    if (isReserved(cell)) {
      reserved += 1;
      continue;
    }
    const n = numberOf(cell);
    if (n !== null) sums.set(label, (sums.get(label) ?? 0) + n);
  }
  return { items: order.map((label) => ({ label, value: sums.get(label) ?? null })), reserved };
}

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

function Canvas({ children, min = 280 }: { children: (width: number) => ReactNode; min?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = Math.max(min, useWidth(ref, 720));
  return (
    <div ref={ref} className="obs-canvas">
      {children(width)}
    </div>
  );
}

const TIME_VALUE = /^\s*(19|20)\d{2}(\s*[-_ ]?\s*(0?[12]|I{1,2}|[AB]))?\s*$/i;

/**
 * El conjunto que se le pasa a FreeChart. En el taller no hay selector de año:
 * con una categoría elegida, la gráfica recorre esa categoría (y no parte la
 * serie por año de fila); si la categoría es tiempo, en orden cronológico.
 */
function drawableSet(dataset: ObsDataset, view: Drawable) {
  const set = asFreeSet(dataset);
  if (!view.category) return set;
  const key = view.category;
  const timeLike = dataset.rows.length > 0 && dataset.rows.every((r) => TIME_VALUE.test(textOf(r.cells[key])));
  const rows = timeLike ? [...set.rows].sort((a, b) => textOf(a.cells[key]).localeCompare(textOf(b.cells[key]), "es", { numeric: true })) : set.rows;
  return { ...set, temporality: "sin_tiempo" as const, rows: rows.map((r) => ({ ...r, year: null })) };
}

/* --- Visor --------------------------------------------------------------------------- */

export function ObsChart({ dataset, view }: { dataset: ObsDataset; view: Drawable }) {
  const problems = obsViewProblems(dataset, view);
  const reserved = useMemo(
    () => dataRows(dataset).reduce((n, r) => n + (view.series ?? []).filter((k) => isReserved(r.cells[k])).length, 0),
    [dataset, view.series],
  );
  if (problems.length) {
    return (
      <div className="obs-chart-empty" role="note">
        <strong>Al visor le falta algo</strong>
        <ul>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (!dataRows(dataset).length) return <p className="obs-chart-empty">La tabla no tiene filas.</p>;

  let chart: ReactNode;
  if (view.type === "tabla") chart = <RawTable dataset={dataset} compact />;
  else if (isFreeType(view.type)) {
    const free: FreeView = { ...(view as FreeView), key: view.key ?? "visor", title: view.title || dataset.title, type: view.type };
    chart = <FreeChart set={drawableSet(dataset, view)} view={free} year={null} />;
  } else chart = <ExtraChart dataset={dataset} view={view} />;

  return (
    <div className="obs-chart">
      {chart}
      {reserved > 0 && view.type !== "tabla" && (
        <p className="obs-chart__reserve">
          {reserved === 1 ? "1 casilla" : `${reserved} casillas`} en reserva ({RESERVED_TEXT}) no se dibujan: se leen en la tabla.
        </p>
      )}
    </div>
  );
}

function ExtraChart({ dataset, view }: { dataset: ObsDataset; view: Drawable }) {
  const t = useChartTokens();
  switch (view.type) {
    case "mapa_calor":
      return <Heatmap t={t} dataset={dataset} view={view} />;
    case "mosaico":
      return <Treemap t={t} dataset={dataset} view={view} />;
    case "embudo":
      return <Funnel t={t} dataset={dataset} view={view} />;
    case "puntos":
      return <DotPlot t={t} dataset={dataset} view={view} />;
    case "bosque":
      return <Forest t={t} dataset={dataset} view={view} />;
    case "ranking":
      return <Ranking t={t} dataset={dataset} view={view} />;
    case "mapa_municipal":
      return <MunicipalMap t={t} dataset={dataset} view={view} />;
    default:
      return null;
  }
}

interface ExtraProps {
  t: ChartTokens;
  dataset: ObsDataset;
  view: Drawable;
}

const col = (dataset: ObsDataset, key: string | undefined) => dataset.columns.find((c) => c.key === key);

/* --- Mapa de calor ------------------------------------------------------------------ */

function Heatmap({ t, dataset, view }: ExtraProps) {
  const [hover, setHover] = useState<string | null>(null);
  const measure = col(dataset, view.series?.[0])!;
  const rowKey = view.category!;
  const colKey = view.category2!;
  const rows = dataRows(dataset);
  const collator = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
  const rowLabels = [...new Set(rows.map((r) => textOf(r.cells[rowKey])).filter(Boolean))];
  const colLabels = [...new Set(rows.map((r) => textOf(r.cells[colKey])).filter(Boolean))].sort(collator);
  const grid = new Map<string, number | "reserva">();
  for (const r of rows) {
    const id = `${textOf(r.cells[rowKey])}|${textOf(r.cells[colKey])}`;
    const cell = r.cells[measure.key];
    if (isReserved(cell)) {
      if (!grid.has(id)) grid.set(id, "reserva");
      continue;
    }
    const n = numberOf(cell);
    if (n === null) continue;
    const prev = grid.get(id);
    grid.set(id, (typeof prev === "number" ? prev : 0) + n);
  }
  const values = [...grid.values()].filter((v): v is number => typeof v === "number");
  const max = Math.max(1, ...values);
  const labelW = Math.min(220, Math.max(90, ...rowLabels.map((l) => l.length * 6.6)));
  return (
    <Canvas>
      {(width) => {
        const cellW = Math.max(34, (width - labelW - 8) / Math.max(1, colLabels.length));
        const cellH = 30;
        const w = labelW + cellW * colLabels.length + 8;
        const h = 28 + cellH * rowLabels.length;
        return (
          <div className="obs-scroll">
            <svg width={w} height={h} className="obs-svg" role="img" aria-label={`${view.title}: mapa de calor`}>
              {colLabels.map((c, j) => (
                <text key={c} x={labelW + j * cellW + cellW / 2} y={16} textAnchor="middle" className="obs-tick">
                  {c.length > 12 ? `${c.slice(0, 11)}…` : c}
                </text>
              ))}
              {rowLabels.map((r, i) => (
                <g key={r} transform={`translate(0 ${28 + i * cellH})`}>
                  <text x={labelW - 8} y={cellH / 2 + 4} textAnchor="end" className="obs-label">
                    {r.length > 32 ? `${r.slice(0, 31)}…` : r}
                  </text>
                  {colLabels.map((c, j) => {
                    const v = grid.get(`${r}|${c}`);
                    const id = `${r}|${c}`;
                    const share = typeof v === "number" ? 0.12 + 0.88 * (v / max) : 0;
                    const strong = share > 0.55;
                    return (
                      <g key={c} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
                        <rect
                          x={labelW + j * cellW + 1}
                          y={1}
                          width={cellW - 2}
                          height={cellH - 2}
                          rx={3}
                          fill={v === undefined ? "transparent" : v === "reserva" ? t.mid : t.pos}
                          fillOpacity={typeof v === "number" ? share : 1}
                          stroke={hover === id ? t.ink : v === undefined ? t.line : "none"}
                          strokeDasharray={v === undefined ? "3 3" : undefined}
                        />
                        {v !== undefined && cellW > 40 && (
                          <text
                            x={labelW + j * cellW + cellW / 2}
                            y={cellH / 2 + 4}
                            textAnchor="middle"
                            className="obs-value"
                            fill={typeof v === "number" && strong ? "#fff" : t.ink}
                          >
                            {v === "reserva" ? RESERVED_TEXT : formatValue(v, measure.format ?? "decimal")}
                          </text>
                        )}
                        <title>{`${r} · ${c}: ${v === "reserva" ? RESERVED_TEXT : typeof v === "number" ? fmtOf(measure, v) : "sin dato"}`}</title>
                      </g>
                    );
                  })}
                </g>
              ))}
            </svg>
          </div>
        );
      }}
    </Canvas>
  );
}

/* --- Mosaico ------------------------------------------------------------------------ */

function Treemap({ t, dataset, view }: ExtraProps) {
  const measure = col(dataset, view.series?.[0])!;
  const { items } = totalsBy(dataRows(dataset), view.category!, measure.key);
  const list = items.filter((i): i is { label: string; value: number } => (i.value ?? 0) > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((s, i) => s + i.value, 0);
  return (
    <Canvas>
      {(width) => {
        const h = Math.round(Math.min(420, Math.max(240, width * 0.5)));
        const rects = squarify(
          list.map((i) => i.value),
          { x: 0, y: 0, w: width, h },
        );
        return (
          <svg width={width} height={h} className="obs-svg" role="img" aria-label={`${view.title}: mosaico`}>
            {rects.map((r, i) => {
              const color = t.cats[i % t.cats.length];
              const share = total ? (list[i].value / total) * 100 : 0;
              const room = r.w > 70 && r.h > 34;
              return (
                <g key={list[i].label}>
                  <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx={4} fill={color} fillOpacity={0.9 - (i % 3) * 0.15} />
                  {room && (
                    <>
                      <text x={r.x + 9} y={r.y + 19} className="obs-tile-label" fill={inkOn(color, t)}>
                        {list[i].label.length > r.w / 7.5 ? `${list[i].label.slice(0, Math.max(3, Math.floor(r.w / 7.5) - 1))}…` : list[i].label}
                      </text>
                      <text x={r.x + 9} y={r.y + 35} className="obs-tile-value" fill={inkOn(color, t)}>
                        {formatValue(share, "decimal")} %
                      </text>
                    </>
                  )}
                  <title>{`${list[i].label}: ${fmtOf(measure, list[i].value)} (${formatValue(share, "decimal")} %)`}</title>
                </g>
              );
            })}
          </svg>
        );
      }}
    </Canvas>
  );
}

/* --- Embudo --------------------------------------------------------------------------- */

function Funnel({ t, dataset, view }: ExtraProps) {
  const measure = col(dataset, view.series?.[0])!;
  const { items } = totalsBy(dataRows(dataset), view.category!, measure.key);
  const max = Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <Canvas>
      {(width) => {
        const labelW = Math.min(200, width * 0.3);
        const barArea = width - labelW - 120;
        const rowH = 44;
        return (
          <svg width={width} height={items.length * rowH} className="obs-svg" role="img" aria-label={`${view.title}: embudo`}>
            {items.map((item, i) => {
              const w = item.value === null ? 0 : Math.max(4, (item.value / max) * barArea);
              const next = items[i + 1];
              const x = labelW + (barArea - w) / 2;
              const drop = next && item.value && next.value !== null ? ((item.value - next.value) / item.value) * 100 : null;
              return (
                <g key={item.label} transform={`translate(0 ${i * rowH})`}>
                  <text x={labelW - 10} y={rowH / 2} textAnchor="end" className="obs-label">
                    {item.label}
                  </text>
                  <rect x={x} y={6} width={w} height={rowH - 16} rx={4} fill={t.cats[0]} fillOpacity={1 - i * (0.55 / Math.max(1, items.length))} />
                  <text x={labelW + barArea + 10} y={rowH / 2 - 2} className="obs-value">
                    {item.value === null ? "Sin dato" : formatValue(item.value, measure.format ?? "entero")}
                  </text>
                  {drop !== null && (
                    <text x={labelW + barArea + 10} y={rowH / 2 + 13} className="obs-tick">
                      −{formatValue(drop, "decimal")} % a la siguiente
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        );
      }}
    </Canvas>
  );
}

/* --- Puntos ------------------------------------------------------------------------------- */

function DotPlot({ t, dataset, view }: ExtraProps) {
  const series = (view.series ?? []).slice(0, 2).map((k) => col(dataset, k)!).filter(Boolean);
  const rows = dataRows(dataset);
  const labels = [...new Set(rows.map((r) => textOf(r.cells[view.category!])).filter(Boolean))];
  const values = labels.map((label) => series.map((s) => totalsBy(rows.filter((r) => textOf(r.cells[view.category!]) === label), view.category!, s.key).items[0]?.value ?? null));
  const all = values.flat().filter((v): v is number => v !== null);
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all);
  return (
    <Canvas>
      {(width) => {
        const labelW = Math.min(210, width * 0.32);
        const plotW = width - labelW - 60;
        const x = (v: number) => labelW + ((v - min) / (max - min || 1)) * plotW;
        const rowH = 30;
        return (
          <>
            {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.label, color: t.cats[i] }))} />}
            <svg width={width} height={labels.length * rowH + 8} className="obs-svg" role="img" aria-label={`${view.title}: puntos`}>
              {labels.map((label, i) => {
                const [a, b] = values[i];
                const y = i * rowH + rowH / 2;
                return (
                  <g key={label}>
                    <line x1={labelW} x2={labelW + plotW} y1={y} y2={y} stroke={t.line} />
                    <text x={labelW - 10} y={y + 4} textAnchor="end" className="obs-label">
                      {label.length > 30 ? `${label.slice(0, 29)}…` : label}
                    </text>
                    {a !== null && b !== undefined && b !== null && <line x1={x(a)} x2={x(b)} y1={y} y2={y} stroke={t.secondary} strokeWidth={3} strokeOpacity={0.35} />}
                    {[a, b].map((v, j) =>
                      v === null || v === undefined ? null : (
                        <circle key={j} cx={x(v)} cy={y} r={6} fill={t.cats[j]} stroke={t.surface} strokeWidth={1.5}>
                          <title>{`${label} · ${series[j].label}: ${fmtOf(series[j], v)}`}</title>
                        </circle>
                      ),
                    )}
                    <text x={labelW + plotW + 12} y={y + 4} className="obs-tick">
                      {a !== null ? formatValue(a, series[0].format ?? "decimal") : "—"}
                    </text>
                  </g>
                );
              })}
            </svg>
          </>
        );
      }}
    </Canvas>
  );
}

/* --- Bosque ------------------------------------------------------------------------------- */

function Forest({ t, dataset, view }: ExtraProps) {
  const [est, low, high] = (view.series ?? []).map((k) => col(dataset, k)!);
  const reference = view.reference ?? 1;
  const log = reference === 1;
  const rows = dataRows(dataset)
    .map((r) => ({ label: textOf(r.cells[view.category!]), e: numberOf(r.cells[est.key]), l: numberOf(r.cells[low.key]), h: numberOf(r.cells[high.key]) }))
    .filter((r) => r.label && r.e !== null);
  const vals = rows.flatMap((r) => [r.e, r.l, r.h]).filter((v): v is number => v !== null && (!log || v > 0));
  const f = (v: number) => (log ? Math.log10(v) : v);
  const lo = Math.min(f(reference), ...vals.map(f));
  const hi = Math.max(f(reference), ...vals.map(f));
  const pad = (hi - lo) * 0.08 || 0.1;
  return (
    <Canvas>
      {(width) => {
        const labelW = Math.min(230, width * 0.34);
        const plotW = width - labelW - 90;
        const x = (v: number) => labelW + ((f(v) - lo + pad) / (hi - lo + pad * 2)) * plotW;
        const rowH = 28;
        const h = rows.length * rowH + 30;
        return (
          <svg width={width} height={h} className="obs-svg" role="img" aria-label={`${view.title}: estimaciones con intervalo`}>
            <line x1={x(reference)} x2={x(reference)} y1={0} y2={h - 22} stroke={t.ink} strokeDasharray="4 3" />
            <text x={x(reference)} y={h - 6} textAnchor="middle" className="obs-tick">
              {log ? `Referencia · ${reference}` : `Sin efecto · ${reference}`}
            </text>
            {rows.map((r, i) => {
              const y = i * rowH + rowH / 2;
              const up = r.e! > reference;
              const color = r.l !== null && r.h !== null && r.l <= reference && r.h >= reference ? t.muted : up ? t.pos : t.neg;
              return (
                <g key={`${r.label}-${i}`}>
                  <text x={labelW - 10} y={y + 4} textAnchor="end" className="obs-label">
                    {r.label.length > 34 ? `${r.label.slice(0, 33)}…` : r.label}
                  </text>
                  {r.l !== null && r.h !== null && (!log || (r.l > 0 && r.h > 0)) && <line x1={x(r.l)} x2={x(r.h)} y1={y} y2={y} stroke={color} strokeWidth={2} />}
                  {(!log || r.e! > 0) && <rect x={x(r.e!) - 5} y={y - 5} width={10} height={10} fill={color} />}
                  <text x={labelW + plotW + 12} y={y + 4} className="obs-tick">
                    {formatValue(r.e, "decimal")}
                  </text>
                  <title>{`${r.label}: ${formatValue(r.e, "decimal")} (${formatValue(r.l, "decimal")} – ${formatValue(r.h, "decimal")})`}</title>
                </g>
              );
            })}
          </svg>
        );
      }}
    </Canvas>
  );
}

/* --- Ranking ------------------------------------------------------------------------------- */

function Ranking({ t, dataset, view }: ExtraProps) {
  const measure = col(dataset, view.series?.[0])!;
  const { items } = totalsBy(dataRows(dataset), view.category!, measure.key);
  const list = items.filter((i): i is { label: string; value: number } => i.value !== null).sort((a, b) => b.value - a.value);
  const shown = list.slice(0, view.limit ?? 15);
  const max = Math.max(1, ...shown.map((i) => i.value));
  return (
    <ol className="obs-ranking" aria-label={view.title}>
      {shown.map((item, i) => (
        <li key={item.label} style={{ "--w": `${(item.value / max) * 100}%`, "--tone": i < 3 ? t.cats[0] : t.mid } as CSSProperties}>
          <span className="obs-ranking__pos">{i + 1}</span>
          <span className="obs-ranking__label">{item.label}</span>
          <span className="obs-ranking__bar" aria-hidden="true">
            <i />
          </span>
          <b>{formatValue(item.value, measure.format ?? "decimal")}</b>
        </li>
      ))}
      {list.length > shown.length && <li className="obs-ranking__more">y {list.length - shown.length} más en la tabla</li>}
    </ol>
  );
}

/* --- Mapa por municipio ---------------------------------------------------------------------- */

const MUNI = new Map(MUNICIPIOS.map(([code, name, x, y]) => [code, { name, x, y }]));

function MunicipalMap({ t, dataset, view }: ExtraProps) {
  const measure = col(dataset, view.series?.[0])!;
  const { items, reserved } = totalsBy(dataRows(dataset), view.category!, measure.key);
  const points: { code: string; name: string; x: number; y: number; value: number }[] = [];
  let missed = 0;
  for (const item of items) {
    if (item.value === null) continue;
    const hit = locateMunicipio(item.label);
    if (!("code" in hit)) {
      missed += 1;
      continue;
    }
    const m = MUNI.get(hit.code);
    if (m) points.push({ code: hit.code, ...m, value: item.value });
    else {
      const dept = DEPARTMENTS.find((d) => d.code === hit.code);
      if (dept) points.push({ code: hit.code, name: dept.name, x: dept.c[0], y: dept.c[1], value: item.value });
      else missed += 1;
    }
  }
  const max = Math.max(1, ...points.map((p) => p.value));
  const top = [...points].sort((a, b) => b.value - a.value).slice(0, 8);
  return (
    <div className="obs-munimap">
      <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="obs-munimap__map" role="img" aria-label={`${view.title}: mapa por municipio`}>
        {DEPARTMENTS.map((d) => (
          <path key={d.code} d={d.d} fill={t.mid} stroke={t.surface} strokeWidth={1} />
        ))}
        {[...points]
          .sort((a, b) => b.value - a.value)
          .map((p) => (
            <circle key={p.code} cx={p.x} cy={p.y} r={3 + Math.sqrt(p.value / max) * 22} fill={t.cats[0]} fillOpacity={0.55} stroke={t.cats[0]} strokeWidth={1}>
              <title>{`${p.name}: ${fmtOf(measure, p.value)}`}</title>
            </circle>
          ))}
      </svg>
      <div className="obs-munimap__side">
        <strong>Donde más</strong>
        <ol>
          {top.map((p) => (
            <li key={p.code}>
              <span>{p.name}</span>
              <b>{formatValue(p.value, measure.format ?? "entero")}</b>
            </li>
          ))}
        </ol>
        {(missed > 0 || reserved > 0) && (
          <p>
            {missed > 0 && `${missed} sin ubicar en la DIVIPOLA. `}
            {reserved > 0 && `${reserved} en reserva (${RESERVED_TEXT}).`}
          </p>
        )}
      </div>
      <SrTable caption={view.title} head={["Municipio", measure.label]} rows={top.map((p) => [p.name, fmtOf(measure, p.value)])} />
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="od-free__legend" aria-label="Leyenda">
      {items.map((item) => (
        <li key={item.label}>
          <i style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/* --- Tabla de datos brutos ------------------------------------------------------------------ */

export function RawTable({ dataset, compact = false, limit }: { dataset: ObsDataset; compact?: boolean; limit?: number }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    const list = dataset.rows.filter((r) => r.kind === "dato");
    if (!sort) return list;
    const column = dataset.columns.find((c) => c.key === sort.key);
    return [...list].sort((a, b) => {
      if (column?.kind === "cifra") return sort.dir * ((numberOf(a.cells[sort.key]) ?? -Infinity) - (numberOf(b.cells[sort.key]) ?? -Infinity));
      return sort.dir * textOf(a.cells[sort.key]).localeCompare(textOf(b.cells[sort.key]), "es", { numeric: true });
    });
  }, [dataset, sort]);
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="obs-raw" data-compact={compact || undefined} tabIndex={0} role="region" aria-label={`${dataset.title}, tabla desplazable`}>
      <table>
        <thead>
          <tr>
            <th scope="col" className="obs-raw__n">
              #
            </th>
            {dataset.columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} scope="col" data-numeric={c.kind === "cifra" || undefined} aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}>
                  <button type="button" onClick={() => setSort(active && sort!.dir === -1 ? null : { key: c.key, dir: active ? -1 : 1 })}>
                    <span className="obs-raw__kind" data-kind={c.kind} aria-hidden="true">
                      {c.kind === "cifra" ? "123" : c.kind === "territorio" ? "Geo" : c.kind === "fecha" ? "Fecha" : "Abc"}
                    </span>
                    {c.label}
                    <Icon name="chevron-down" size={12} className="obs-raw__sort" data-dir={active ? (sort!.dir === 1 ? "asc" : "desc") : undefined} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              <td className="obs-raw__n">{i + 1}</td>
              {dataset.columns.map((c) => {
                const cell = row.cells[c.key];
                if (isReserved(cell))
                  return (
                    <td key={c.key} data-numeric data-reserved>
                      {RESERVED_TEXT}
                    </td>
                  );
                if (c.kind === "cifra") {
                  const n = numberOf(cell);
                  return (
                    <td key={c.key} data-numeric data-empty={n === null || undefined}>
                      {n === null ? "" : formatValue(n, c.format ?? "decimal")}
                    </td>
                  );
                }
                const text = textOf(cell);
                return (
                  <td key={c.key} data-empty={!text || undefined}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {limit && rows.length > limit && <p className="obs-raw__more">Se ven {limit} de {rows.length.toLocaleString("es-CO")} filas.</p>}
    </div>
  );
}

/* --- Minivistas de la galería --------------------------------------------------------------- */

const P = "var(--obs-thumb-1)";
const S = "var(--obs-thumb-2)";
const Q = "var(--obs-thumb-3)";
const G = "var(--obs-thumb-4)";
const L = "var(--obs-thumb-line)";

const THUMBS: Record<ObsChartType, ReactNode> = {
  // Dos parejas: lo que distingue a las barras comparadas de las normales no
  // es la altura, es que cada categoría trae más de una barra.
  barras_comparadas: (
    <>
      <rect x="11" y="24" width="7" height="18" rx="1.5" fill={P} />
      <rect x="19" y="18" width="7" height="24" rx="1.5" fill={Q} />
      <rect x="33" y="29" width="7" height="13" rx="1.5" fill={P} />
      <rect x="41" y="20" width="7" height="22" rx="1.5" fill={Q} />
      <path d="M6 42h58" stroke={L} />
    </>
  ),
  barras: (
    <>
      <rect x="10" y="22" width="9" height="20" rx="1.5" fill={P} />
      <rect x="23" y="12" width="9" height="30" rx="1.5" fill={P} />
      <rect x="36" y="27" width="9" height="15" rx="1.5" fill={P} />
      <rect x="49" y="17" width="9" height="25" rx="1.5" fill={P} />
      <path d="M6 42h58" stroke={L} />
    </>
  ),
  // Barras con una línea encima: dos cifras, dos ejes.
  barras_linea: (
    <>
      {[10, 23, 36, 49].map((x, i) => (
        <rect key={x} x={x} y={[26, 18, 22, 14][i]} width="9" height={[16, 24, 20, 28][i]} rx="1.5" fill={P} />
      ))}
      <path d="M14.5 20L27.5 12L40.5 16L53.5 8" fill="none" stroke={Q} strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 42h58" stroke={L} />
    </>
  ),
  barras_apiladas: (
    <>
      {[10, 23, 36, 49].map((x, i) => (
        <g key={x}>
          <rect x={x} y={[18, 10, 24, 14][i]} width="9" height={[12, 14, 8, 12][i]} fill={S} />
          <rect x={x} y={[30, 24, 32, 26][i]} width="9" height={[12, 18, 10, 16][i]} fill={P} />
        </g>
      ))}
      <path d="M6 42h58" stroke={L} />
    </>
  ),
  barras_100: (
    <>
      {[10, 23, 36, 49].map((x, i) => (
        <g key={x}>
          <rect x={x} y="8" width="9" height={[14, 20, 10, 17][i]} fill={S} />
          <rect x={x} y={8 + [14, 20, 10, 17][i]} width="9" height={34 - [14, 20, 10, 17][i]} fill={P} />
        </g>
      ))}
    </>
  ),
  radar: (
    <>
      <polygon points="35,6 55,18 51,38 19,38 15,18" fill="none" stroke={L} />
      <polygon points="35,12 49,20 45,34 24,33 21,20" fill={P} fillOpacity="0.35" stroke={P} />
    </>
  ),
  circular: (
    <>
      <circle cx="35" cy="24" r="17" fill={P} />
      <path d="M35 24V7a17 17 0 0 1 15.6 23.6z" fill={S} />
      <path d="M35 24l15.6 6.6A17 17 0 0 1 35 41z" fill={G} />
    </>
  ),
  dona: (
    <>
      <circle cx="35" cy="24" r="15" fill="none" stroke={P} strokeWidth="8" />
      <path d="M35 9a15 15 0 0 1 14.3 19.6" fill="none" stroke={S} strokeWidth="8" />
    </>
  ),
  cascada: (
    <>
      <rect x="8" y="14" width="9" height="28" fill={P} />
      <rect x="20" y="8" width="9" height="6" fill={Q} />
      <rect x="32" y="8" width="9" height="12" fill={S} />
      <rect x="44" y="20" width="9" height="8" fill={S} />
      <rect x="56" y="28" width="9" height="14" fill={P} />
      <path d="M6 42h60" stroke={L} />
    </>
  ),
  histograma: (
    <>
      {[4, 10, 20, 30, 22, 12, 6].map((h, i) => (
        <rect key={i} x={8 + i * 8} y={42 - h} width="8" height={h} fill={P} stroke="var(--surface)" strokeWidth="0.8" />
      ))}
    </>
  ),
  caja: (
    <>
      <path d="M20 8v8M20 32v8M50 12v6M50 30v8" stroke={P} />
      <rect x="13" y="16" width="14" height="16" fill={P} fillOpacity="0.25" stroke={P} />
      <path d="M13 24h14" stroke={P} strokeWidth="2" />
      <rect x="43" y="18" width="14" height="12" fill={S} fillOpacity="0.25" stroke={S} />
      <path d="M43 25h14" stroke={S} strokeWidth="2" />
    </>
  ),
  lineas: (
    <>
      <path d="M6 42h58" stroke={L} />
      <path d="M8 34l12-8 12 4 12-14 14-6" fill="none" stroke={P} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 38l12-4 12 2 12-6 14 0" fill="none" stroke={S} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  area: (
    <>
      <path d="M8 34l12-10 12 4 12-14 14-6V42H8z" fill={P} fillOpacity="0.3" />
      <path d="M8 34l12-10 12 4 12-14 14-6" fill="none" stroke={P} strokeWidth="2" />
    </>
  ),
  gantt: (
    <>
      <rect x="8" y="9" width="22" height="6" rx="2" fill={P} />
      <rect x="22" y="19" width="26" height="6" rx="2" fill={S} />
      <rect x="36" y="29" width="24" height="6" rx="2" fill={G} />
      <path d="M44 5v38" stroke={L} strokeDasharray="2 2" />
    </>
  ),
  mapa: (
    <>
      <path d="M26 5l12 3 6 9-2 8 8 5-4 12-12 2-6-8-8-2-4-10 6-8z" fill={P} fillOpacity="0.3" stroke={P} />
      <path d="M32 17l8 4-2 8-8-1z" fill={P} />
    </>
  ),
  cifras: (
    <>
      <rect x="6" y="9" width="27" height="30" rx="3" fill={P} fillOpacity="0.12" />
      <rect x="37" y="9" width="27" height="30" rx="3" fill={S} fillOpacity="0.14" />
      <path d="M11 29h14M11 20h9" stroke={P} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M42 29h14M42 20h8" stroke={S} strokeWidth="3.5" strokeLinecap="round" />
    </>
  ),
  tabla: (
    <>
      <rect x="7" y="7" width="56" height="34" rx="2" fill="none" stroke={L} />
      <rect x="7" y="7" width="56" height="8" fill={P} fillOpacity="0.25" />
      <path d="M7 23h56M7 32h56M26 7v34M45 7v34" stroke={L} />
    </>
  ),
  mapa_calor: (
    <>
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={10 + c * 13} y={7 + r * 12} width="12" height="11" rx="1.5" fill={P} fillOpacity={[0.2, 0.5, 0.9, 0.35, 0.7, 0.25, 0.55, 1, 0.4, 0.85, 0.3, 0.6][r * 4 + c]} />),
      )}
    </>
  ),
  mosaico: (
    <>
      <rect x="7" y="7" width="30" height="34" rx="2" fill={P} />
      <rect x="39" y="7" width="24" height="18" rx="2" fill={S} />
      <rect x="39" y="27" width="13" height="14" rx="2" fill={G} />
      <rect x="54" y="27" width="9" height="14" rx="2" fill={Q} />
    </>
  ),
  embudo: (
    <>
      <rect x="8" y="7" width="54" height="8" rx="2" fill={P} />
      <rect x="16" y="18" width="38" height="8" rx="2" fill={P} fillOpacity="0.75" />
      <rect x="24" y="29" width="22" height="8" rx="2" fill={P} fillOpacity="0.5" />
    </>
  ),
  puntos: (
    <>
      {[12, 24, 36].map((y, i) => (
        <g key={y}>
          <path d={`M8 ${y}h56`} stroke={L} />
          <path d={`M${[20, 28, 16][i]} ${y}H${[46, 40, 52][i]}`} stroke={P} strokeOpacity="0.4" strokeWidth="2.5" />
          <circle cx={[20, 28, 16][i]} cy={y} r="3.5" fill={P} />
          <circle cx={[46, 40, 52][i]} cy={y} r="3.5" fill={S} />
        </g>
      ))}
    </>
  ),
  bosque: (
    <>
      <path d="M35 5v38" stroke={L} strokeDasharray="2.5 2" />
      {[10, 20, 30, 40].map((y, i) => (
        <g key={y}>
          <path d={`M${[40, 20, 30, 44][i]} ${y}h${[16, 10, 12, 14][i]}`} stroke={i === 1 ? S : P} strokeWidth="1.8" />
          <rect x={[46, 23, 34, 49][i]} y={y - 2.5} width="5" height="5" fill={i === 1 ? S : P} />
        </g>
      ))}
    </>
  ),
  ranking: (
    <>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <text x="8" y={13 + i * 10} fontSize="7" fontWeight="700" fill="var(--ink-muted)">
            {i + 1}
          </text>
          <rect x="16" y={8 + i * 10} width={[46, 36, 26, 18][i]} height="6" rx="1.5" fill={i === 0 ? P : L} />
        </g>
      ))}
    </>
  ),
  mapa_municipal: (
    <>
      <path d="M26 5l12 3 6 9-2 8 8 5-4 12-12 2-6-8-8-2-4-10 6-8z" fill={L} fillOpacity="0.6" />
      <circle cx="36" cy="20" r="5" fill={P} fillOpacity="0.7" />
      <circle cx="28" cy="28" r="3" fill={P} fillOpacity="0.7" />
      <circle cx="42" cy="32" r="2.2" fill={P} fillOpacity="0.7" />
      <circle cx="30" cy="12" r="1.8" fill={P} fillOpacity="0.7" />
    </>
  ),
};

export function ChartThumb({ type }: { type: ObsChartType }) {
  return (
    <svg className="obs-thumb" viewBox="0 0 70 48" aria-hidden="true" focusable="false">
      {THUMBS[type]}
    </svg>
  );
}
