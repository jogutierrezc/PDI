import { useRef, useState } from "react";
import { formatValue, formatWithUnit } from "../data/open-data";
import type { ValueFormat } from "../data/types";
import { niceCeil } from "./ChartFrame";
import { useWidth } from "./motion";

interface AnnualTermPoint {
  year: number;
  annual: number | null;
  a: number | null;
  b: number | null;
}

interface AnnualTermChartProps {
  label: string;
  points: AnnualTermPoint[];
  selectedYear: number;
  format: ValueFormat;
  unit: string;
  annualRule: string;
  onSelectYear: (year: number) => void;
}

const SERIES = [
  { key: "annual", label: "Global anual", color: "var(--od-series-total)" },
  { key: "a", label: "Periodo 1", color: "var(--od-series-1)" },
  { key: "b", label: "Periodo 2", color: "var(--od-series-2)" },
] as const;

/** Una misma escala, desde cero; los huecos interrumpen la línea anual. */
export function AnnualTermChart({ label, points, selectedYear, format, unit, annualRule, onSelectYear }: AnnualTermChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const available = useWidth(wrap);
  const [hover, setHover] = useState<number | null>(null);
  const width = Math.max(420, available, points.length * 52 + 80);
  const height = 300;
  const margin = { top: 20, right: 16, bottom: 48, left: 64 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const values = points.flatMap((p) => [p.annual, p.a, p.b]).filter((v): v is number => v !== null);
  const min = Math.min(0, ...values) < 0 ? -niceCeil(-Math.min(...values)) : 0;
  const max = niceCeil(Math.max(0, ...values));
  const slot = innerW / Math.max(1, points.length);
  const barW = Math.min(24, slot * 0.26);
  const x = (index: number) => margin.left + slot * (index + 0.5);
  const y = (value: number) => margin.top + innerH * (1 - (value - min) / (max - min));
  const ticks = Array.from({ length: 5 }, (_, i) => min + (max - min) * i / 4);
  let pen = false;
  const path = points.map((point, index) => {
    if (point.annual === null) { pen = false; return ""; }
    const part = `${pen ? "L" : "M"}${x(index)} ${y(point.annual)}`;
    pen = true;
    return part;
  }).join(" ");
  const current = points.find((p) => p.year === (hover ?? selectedYear)) ?? points[points.length - 1];
  const describe = (point: AnnualTermPoint) => `${point.year}. ${SERIES.map((s) => `${s.label}: ${formatWithUnit(point[s.key], format, unit)}`).join(". ")}`;

  return (
    <div className="od-combo">
      <ul className="od-combo__legend" aria-label="Series de la gráfica">
        {SERIES.map((series) => (
          <li key={series.key}>
            <svg width="24" height="14" aria-hidden="true">
              {series.key === "annual" ? <><line x1="0" y1="7" x2="24" y2="7" stroke={series.color} strokeWidth="2.5" /><circle cx="12" cy="7" r="3" fill={series.color} /></> : <rect x="6" y="1" width="12" height="12" fill={series.color} />}
            </svg>
            {series.label}
          </li>
        ))}
      </ul>
      <div ref={wrap} className="od-combo__scroll">
        <svg width={width} height={height} role="group" aria-label={label}>
          <g aria-hidden="true">
            {ticks.map((tick) => (
              <g key={tick}>
                <line className="od-lines__grid" x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />
                <text className="od-lines__tick" x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{formatValue(tick, Number.isInteger(tick) ? "entero" : "decimal")}</text>
              </g>
            ))}
            <line className="od-combo__axis" x1={margin.left} x2={width - margin.right} y1={y(0)} y2={y(0)} />
            {points.map((point, index) => (
              <g key={point.year}>
                {point.year === selectedYear && <rect className="od-lines__selected" x={x(index) - slot / 2 + 2} y={margin.top} width={slot - 4} height={innerH} rx="4" />}
                {SERIES.slice(1).map((series, barIndex) => {
                  const value = point[series.key];
                  const left = x(index) + (barIndex === 0 ? -barW - 2 : 2);
                  return (
                    <g key={series.key}>
                      {value === null ? <text className="od-lines__tick" x={left + barW / 2} y={y(0) - 6} textAnchor="middle">—</text> :
                        <rect data-series={series.key} x={left} y={value === 0 ? y(0) - 1 : Math.min(y(value), y(0))} width={barW} height={Math.max(1, Math.abs(y(value) - y(0)))} fill={series.color} />}
                      <text className="od-lines__tick" x={left + barW / 2} y={height - 28} textAnchor="middle">{barIndex === 0 ? "1" : "2"}</text>
                    </g>
                  );
                })}
                <text className="od-lines__year" data-selected={point.year === selectedYear || undefined} x={x(index)} y={height - 8} textAnchor="middle">{point.year}</text>
              </g>
            ))}
            <path className="od-combo__line" d={path} />
            {points.map((point, index) => point.annual === null ? null : <circle key={point.year} className="od-combo__dot" cx={x(index)} cy={y(point.annual)} r="4" />)}
          </g>
          {points.map((point, index) => (
            <g key={point.year} role="button" tabIndex={0} aria-label={describe(point)} aria-pressed={point.year === selectedYear}
              className="od-combo__hit" onMouseEnter={() => setHover(point.year)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(point.year)} onBlur={() => setHover(null)} onClick={() => onSelectYear(point.year)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectYear(point.year); }
              }}>
              <title>{describe(point)}</title>
              <rect x={x(index) - slot / 2 + 2} y={margin.top} width={slot - 4} height={innerH + margin.bottom - 2} />
            </g>
          ))}
        </svg>
      </div>
      {current && <div className="od-combo__values">
        <strong>{current.year}</strong>
        {SERIES.map((series) => <span key={series.key}>{series.label}: <b>{formatWithUnit(current[series.key], format, unit)}</b></span>)}
      </div>}
      <p className="od-combo__note">Cifra anual: {annualRule.toLowerCase()}. — = sin reportar. Pasa por un año o enfócalo para consultar sus valores.</p>
    </div>
  );
}
