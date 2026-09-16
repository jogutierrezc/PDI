/* =============================================================================
   Boletín · figuras para papel.

   Las gráficas del portal animan, se miden contra la pantalla y esperan a
   entrar en vista; en una hoja A4 nada de eso existe. Estas son estáticas y
   se dibujan en milímetros: el viewBox de cada SVG está en mm y el texto
   también, así una etiqueta de 2,5 mm mide 2,5 mm impresa (unos 7 pt).

   Colores por variable CSS del boletín (--bol-*), que salen del tema de la
   plantilla. Ningún dato va solo en color: las series llevan leyenda, las
   barras su cifra y las tablas su número.
   ========================================================================== */

import type { CSSProperties, ReactNode } from "react";
import { formatCount, formatValue } from "../datos-abiertos/data/open-data";
import type { ValueFormat } from "../datos-abiertos/data/types";
import { DEPARTMENTS } from "../datos-abiertos/data/colombia-map";
import { COUNTRIES, WORLD_CAMPUS_POINTS, WORLD_HEIGHT, WORLD_WIDTH } from "../datos-abiertos/data/world-map";
import { CAMPUS_POINTS, MAP_HEIGHT, MAP_WIDTH } from "../datos-abiertos/data/colombia-map";

export const SERIES_COLORS = ["var(--bol-s1)", "var(--bol-s2)", "var(--bol-s3)", "var(--bol-s4)", "var(--bol-s5)"];

const compact = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });

/** Cifra corta para ejes: "1,2 mil", "35 %". */
function tick(value: number, format: ValueFormat): string {
  if (format === "porcentaje") return `${formatValue(value, Number.isInteger(value) ? "entero" : "decimal")}`;
  return Math.abs(value) >= 10000 ? compact.format(value) : formatValue(value, Number.isInteger(value) ? "entero" : "decimal");
}

/**
 * Escala "bonita" con unas 4 divisiones. Arranca en 0, salvo en las tasas que
 * viven lejos de cero (una retención entre 78 y 87 %): ahí empezar en 0 aplasta
 * la variación que la gráfica existe para mostrar. Es una línea, no una barra,
 * así que el eje recortado no exagera ninguna longitud.
 */
function niceScale(min: number, max: number, format: ValueFormat): number[] {
  if (max <= 0) return [0, 1];
  const zoom = format === "porcentaje" && min > 0 && min / max > 0.5;
  const low = zoom ? min : 0;
  const raw = (max - low) / 4 || max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const start = zoom ? Math.max(0, Math.floor(low / step) * step - step) : 0;
  return Array.from({ length: Math.ceil((max - start) / step) + 1 }, (_, i) => Math.round((start + i * step) * 1000) / 1000);
}

export const figure = (value: number | null, format: ValueFormat) => (value === null ? "—" : formatValue(value, format));

/* --- Evolución por año ------------------------------------------------------ */

export interface Series {
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

/** Líneas por categoría del eje x: años, o etapas de una tubería. */
export function EvolutionChart({
  years,
  series,
  format,
  highlight,
  width = 70,
  height = 46,
  label = "Evolución por año",
}: {
  years: (number | string)[];
  series: Series[];
  format: ValueFormat;
  highlight?: number | string;
  width?: number;
  height?: number;
  label?: string;
}) {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const ticks = niceScale(Math.min(...all, Infinity), Math.max(0, ...all), format);
  const bottom = ticks[0];
  const top = ticks[ticks.length - 1] || 1;
  const m = { left: 10, right: 3, top: 3, bottom: 6 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const x = (i: number) => m.left + (years.length === 1 ? innerW / 2 : (i / (years.length - 1)) * innerW);
  const y = (v: number) => m.top + innerH - ((v - bottom) / (top - bottom || 1)) * innerH;
  const slot = years.length > 1 ? innerW / (years.length - 1) : innerW;
  const hi = highlight === undefined ? -1 : years.indexOf(highlight);
  // Rótulos largos (etapas): se acortan y, si no caben, se alternan.
  const maxChars = Math.max(4, Math.floor(slot / 1.35));
  const short = (text: string) => (text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text);

  return (
    <svg className="bol-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {hi >= 0 && <rect className="bol-chart__highlight" x={x(hi) - Math.min(5, slot / 2)} y={m.top} width={Math.min(10, slot)} height={innerH} />}
      {ticks.map((t) => (
        <g key={t}>
          <line className="bol-chart__grid" x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
          <text className="bol-chart__tick" x={m.left - 1.5} y={y(t)} dy="0.9" textAnchor="end">
            {tick(t, format)}
          </text>
        </g>
      ))}
      {years.map((year, i) => (
        <text key={`${year}-${i}`} className="bol-chart__year" data-highlight={i === hi || undefined} x={x(i)} y={height - 1.6} textAnchor={i === 0 && typeof year === "string" ? "start" : i === years.length - 1 && typeof year === "string" ? "end" : "middle"}>
          {short(String(year))}
        </text>
      ))}
      {series.map((s) => {
        // Un año sin reportar corta la línea: no se inventa el tramo.
        const segments: string[] = [];
        let current = "";
        s.values.forEach((v, i) => {
          if (v === null) {
            if (current) segments.push(current);
            current = "";
          } else current += `${current ? "L" : "M"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`;
        });
        if (current) segments.push(current);
        return (
          <g key={s.label} style={{ "--c": s.color } as CSSProperties}>
            {segments.map((d) => (
              <path key={d} className="bol-chart__line" data-dashed={s.dashed || undefined} d={d} />
            ))}
            {s.values.map((v, i) => (v === null ? null : <circle key={i} className="bol-chart__dot" cx={x(i)} cy={y(v)} r={0.75} />))}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Tendencia de la ficha ejecutiva: la serie del total, con su primer y último
 * año y su último punto marcado. Acompaña a la cifra; no la reemplaza.
 */
export function Trend({ years, values, format }: { years: number[]; values: (number | null)[]; format: ValueFormat }) {
  const points = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (points.length < 2) return <p className="bol-trend__empty">Sin serie para comparar</p>;
  const width = 40;
  const height = 17;
  const m = { top: 2, bottom: 5, side: 1.5 };
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const span = max - min || Math.abs(max) || 1;
  const x = (i: number) => m.side + (i / Math.max(1, years.length - 1)) * (width - m.side * 2);
  const y = (v: number) => m.top + (1 - (v - min) / span) * (height - m.top - m.bottom);
  const d = points.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(2)} ${y(p.v).toFixed(2)}`).join("");
  const last = points[points.length - 1];
  const first = points[0];
  return (
    <svg className="bol-chart bol-trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`De ${figure(first.v, format)} en ${years[first.i]} a ${figure(last.v, format)} en ${years[last.i]}`}>
      <path className="bol-trend__line" d={d} />
      <circle className="bol-trend__dot" cx={x(last.i)} cy={y(last.v)} r={0.9} />
      <text className="bol-chart__year" x={x(first.i)} y={height - 0.6} textAnchor="start">{years[first.i]}</text>
      <text className="bol-chart__year" x={x(last.i)} y={height - 0.6} textAnchor="end">{years[last.i]}</text>
    </svg>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="bol-legend">
      {series.map((s) => (
        <li key={s.label}>
          <svg viewBox="0 0 8 3" aria-hidden="true">
            <line x1="0" x2="8" y1="1.5" y2="1.5" style={{ stroke: s.color }} strokeDasharray={s.dashed ? "1.6 1" : undefined} />
          </svg>
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/* --- Barras horizontales ---------------------------------------------------- */

export function HBars({
  items,
  format,
  share = false,
  width = 56,
}: {
  items: { label: string; value: number | null; strong?: boolean }[];
  format: ValueFormat;
  share?: boolean;
  width?: number;
}) {
  const row = 6.2;
  const labelW = Math.min(24, width * 0.4);
  const valueW = share ? 17 : 11;
  const barW = width - labelW - valueW - 2;
  const max = Math.max(0, ...items.map((i) => i.value ?? 0)) || 1;
  const total = items.reduce((s, i) => s + (i.value ?? 0), 0);
  const height = items.length * row + 1;
  return (
    <svg className="bol-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={items.map((i) => `${i.label}: ${figure(i.value, format)}`).join(", ")}>
      {items.map((item, index) => {
        const top = index * row + 0.5;
        const w = item.value === null ? 0 : Math.max(0.4, (item.value / max) * barW);
        return (
          <g key={item.label} data-strong={item.strong || undefined}>
            <text className="bol-chart__label" x={labelW - 1.5} y={top + row / 2} dy="0.9" textAnchor="end">
              {item.label.length > 22 ? `${item.label.slice(0, 21)}…` : item.label}
            </text>
            <rect className="bol-chart__track" x={labelW} y={top + 1.2} width={barW} height={row - 2.4} />
            {item.value === null ? (
              <text className="bol-chart__empty" x={labelW + 1} y={top + row / 2} dy="0.9">sin reportar</text>
            ) : (
              <rect className="bol-chart__bar" x={labelW} y={top + 1.2} width={w} height={row - 2.4} />
            )}
            <text className="bol-chart__value" x={width} y={top + row / 2} dy="0.9" textAnchor="end">
              {item.value === null ? "—" : figure(item.value, format)}
              {share && item.value !== null && total > 0 ? ` · ${formatValue((item.value / total) * 100, "decimal")} %` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* --- Columnas apiladas ------------------------------------------------------- */

export function StackedColumns({
  periods,
  categories,
  values,
  format,
  width = 128,
  height = 44,
}: {
  periods: string[];
  categories: string[];
  /** values[categoría][periodo] */
  values: Record<string, Record<string, number | null>>;
  format: ValueFormat;
  width?: number;
  height?: number;
}) {
  const totals = periods.map((p) => categories.reduce((sum, c) => sum + (values[c]?.[p] ?? 0), 0));
  const ticks = niceScale(0, Math.max(0, ...totals), "entero");
  const top = ticks[ticks.length - 1] || 1;
  const m = { left: 10, right: 2, top: 4, bottom: 6 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const slot = innerW / Math.max(1, periods.length);
  const barW = Math.min(14, slot * 0.62);
  const y = (v: number) => m.top + innerH - (v / top) * innerH;
  return (
    <svg className="bol-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={periods.map((p, i) => `${p}: ${figure(totals[i], format)}`).join(", ")}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="bol-chart__grid" x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
          <text className="bol-chart__tick" x={m.left - 1.5} y={y(t)} dy="0.9" textAnchor="end">{tick(t, format)}</text>
        </g>
      ))}
      {periods.map((period, i) => {
        const cx = m.left + slot * i + slot / 2;
        let acc = 0;
        return (
          <g key={period}>
            {categories.map((c, ci) => {
              const v = values[c]?.[period];
              if (v === null || v === undefined || v <= 0) return null;
              const y0 = y(acc + v);
              const h = y(acc) - y0;
              acc += v;
              return <rect key={c} x={cx - barW / 2} y={y0} width={barW} height={Math.max(0.2, h)} style={{ fill: SERIES_COLORS[ci % SERIES_COLORS.length] }} />;
            })}
            <text className="bol-chart__value" x={cx} y={y(totals[i]) - 1} textAnchor="middle">{figure(totals[i], format)}</text>
            <text className="bol-chart__year" x={cx} y={height - 1.6} textAnchor="middle">{period}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function SwatchLegend({ labels }: { labels: string[] }) {
  return (
    <ul className="bol-legend">
      {labels.map((label, i) => (
        <li key={label}>
          <i className="bol-legend__swatch" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
          {label}
        </li>
      ))}
    </ul>
  );
}

/* --- Tablas ----------------------------------------------------------------- */

export function DataTable({
  head,
  rows,
  highlightCol,
  caption,
}: {
  head: ReactNode[];
  rows: { label: ReactNode; cells: ReactNode[]; strong?: boolean; shade?: (number | null)[] }[];
  highlightCol?: number;
  caption?: ReactNode;
}) {
  const columns = head.length;
  // Una celda con letras es texto (nombre, facultad, acuerdo): parte línea y va
  // a la izquierda. Las cifras se quedan en una línea, a la derecha.
  const isText = (cell: ReactNode) => typeof cell === "string" && cell !== "—" && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(cell);
  const textCols = head.map((_, c) => c > 0 && rows.some((row) => isText(row.cells[c - 1])));
  return (
    <div className="bol-table-fit">
    <table className="bol-table" data-density={columns > 11 ? "max" : columns > 7 ? "alta" : undefined}>
      {caption && <caption>{caption}</caption>}
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i} scope="col" data-highlight={i - 1 === highlightCol || undefined} data-text={textCols[i] || undefined}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} data-strong={row.strong || undefined}>
            <th scope="row">{row.label}</th>
            {row.cells.map((cell, c) => (
              <td
                key={c}
                data-highlight={c === highlightCol || undefined}
                data-empty={cell === "—" || undefined}
                data-text={textCols[c + 1] || undefined}
                style={row.shade?.[c] != null ? ({ "--shade": row.shade[c] } as CSSProperties) : undefined}
                data-shade={row.shade?.[c] != null || undefined}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

/**
 * Ajusta al margen las tablas que aun con letra densa no caben: las reduce con
 * zoom hasta el ancho del cuerpo. Se llama sobre el DOM ya pintado (medida y
 * páginas), antes de medir alturas, así la paginación cuenta la tabla reducida.
 */
export function fitTables(root: ParentNode | null) {
  if (!root) return;
  // Dibujos de ancho fijo (la tubería de la web): se escalan al ancho del cuerpo.
  root.querySelectorAll<HTMLElement>(".bol-fit[data-natural]").forEach((wrap) => {
    const drawing = wrap.firstElementChild as HTMLElement | null;
    const natural = Number(wrap.dataset.natural);
    if (!drawing || !natural || wrap.clientWidth <= 0) return;
    drawing.style.zoom = String(Math.min(1, wrap.clientWidth / natural));
  });
  root.querySelectorAll<HTMLElement>(".bol-table-fit").forEach((wrap) => {
    const table = wrap.firstElementChild as HTMLElement | null;
    if (!table) return;
    table.style.zoom = "";
    const available = wrap.clientWidth;
    const natural = table.scrollWidth;
    if (available > 0 && natural > available + 1) table.style.zoom = String(Math.max(0.55, available / natural));
  });
}

/* --- Mapas ------------------------------------------------------------------ */

const BINS = 6;

function binner(values: number[]) {
  const max = Math.max(0, ...values);
  if (max <= 0) return () => 0;
  const log = max > 30;
  return (v: number | undefined) => {
    if (!v) return 0;
    const t = log ? Math.log10(v) / Math.log10(max) : v / max;
    return Math.max(1, Math.min(BINS, Math.ceil(t * BINS)));
  };
}

export function ChoroplethMap({
  kind,
  totals,
  routes,
  sites,
}: {
  kind: "colombia" | "mundo";
  totals: Record<string, number>;
  /** Rutas de movilidad: país → campus o campus → país. */
  routes?: { code: string; incoming: boolean; strength: number }[];
  sites?: string[];
}) {
  const bin = binner(Object.values(totals));
  if (kind === "colombia") {
    return (
      <svg className="bol-map" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label="Mapa de Colombia por departamento">
        {DEPARTMENTS.map((d) => (
          <path key={d.code} d={d.d} className="bol-map__area" data-bin={bin(totals[d.code])} />
        ))}
        {(sites ?? []).filter((s) => CAMPUS_POINTS[s]).map((s) => (
          <circle key={s} className="bol-map__site" cx={CAMPUS_POINTS[s][0]} cy={CAMPUS_POINTS[s][1]} r={7} />
        ))}
      </svg>
    );
  }
  const points = (sites ?? []).map((s) => WORLD_CAMPUS_POINTS[s]).filter(Boolean);
  const hub: [number, number] = points.length
    ? [points.reduce((a, p) => a + p[0], 0) / points.length, points.reduce((a, p) => a + p[1], 0) / points.length]
    : [297.6, 225];
  const byCode = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));
  return (
    <svg className="bol-map" viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`} role="img" aria-label="Mapa del mundo por país">
      {COUNTRIES.filter((c) => c.d).map((c) => (
        <path key={c.code} d={c.d} className="bol-map__area" data-home={c.code === "COL" || undefined} data-bin={bin(totals[c.code])} />
      ))}
      {Object.keys(totals)
        .filter((code) => byCode[code] && !byCode[code].d)
        .map((code) => (
          <circle key={code} className="bol-map__area" data-bin={Math.max(3, bin(totals[code]))} cx={byCode[code].c[0]} cy={byCode[code].c[1]} r={4} />
        ))}
      {(routes ?? []).filter((r) => byCode[r.code]).map((r) => {
        const place = byCode[r.code].c;
        const [a, b] = r.incoming ? [place, hub] : [hub, place];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const chord = Math.hypot(dx, dy) || 1;
        let nx = -dy / chord;
        let ny = dx / chord;
        if (ny > 0) {
          nx = -nx;
          ny = -ny;
        }
        const lift = Math.min(150, chord * 0.26);
        const cx = (a[0] + b[0]) / 2 + nx * lift;
        const cy = (a[1] + b[1]) / 2 + ny * lift;
        return (
          <path
            key={`${r.code}-${r.incoming}`}
            className="bol-map__route"
            data-dir={r.incoming ? "entrante" : "saliente"}
            d={`M${a[0]} ${a[1]}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0]} ${b[1]}`}
            style={{ strokeWidth: 0.9 + r.strength * 2.4 }}
          />
        );
      })}
      {points.length > 0 && <circle className="bol-map__site" cx={hub[0]} cy={hub[1]} r={4} />}
    </svg>
  );
}

export function MapLegend({ values, unit }: { values: number[]; unit: string }) {
  const max = Math.max(0, ...values);
  return (
    <div className="bol-map-legend">
      <span>{unit}</span>
      <i aria-hidden="true">
        {Array.from({ length: BINS }, (_, i) => (
          <b key={i} data-bin={i + 1} />
        ))}
      </i>
      <span>1 – {formatCount(max)}</span>
    </div>
  );
}
