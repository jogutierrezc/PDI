import { useRef, useState } from "react";
import { formatCompact, formatWithUnit } from "../data/open-data";
import type { ValueFormat } from "../data/types";
import { niceCeil } from "./ChartFrame";
import { useWidth } from "./motion";

export interface DualAxisPoint {
  key: string;
  label: string;
  bar: number | null;
  line: number | null;
}

interface DualAxisChartProps {
  label: string;
  points: DualAxisPoint[];
  barLabel: string;
  lineLabel: string;
  format: ValueFormat;
  unit: string;
}

/**
 * Dos cifras de una misma fuente con escala propia: barras contra el eje izquierdo
 * y línea contra el derecho. Cada eje va de cero a su máximo; los huecos cortan la
 * línea y la barra vacía lleva «—»: un dato sin reportar no es cero.
 */
export function DualAxisChart({ label, points, barLabel, lineLabel, format, unit }: DualAxisChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const available = useWidth(wrap);
  const [hover, setHover] = useState<number | null>(null);
  const width = Math.max(420, available, points.length * 44 + 140);
  const height = 300;
  const margin = { top: 20, right: 64, bottom: 48, left: 64 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxOf = (values: (number | null)[]) => niceCeil(Math.max(0, ...values.filter((v): v is number => v !== null)));
  const barMax = maxOf(points.map((p) => p.bar));
  const lineMax = maxOf(points.map((p) => p.line));
  const slot = innerW / Math.max(1, points.length);
  const barW = Math.min(36, slot * 0.55);
  const x = (index: number) => margin.left + slot * (index + 0.5);
  const yBar = (value: number) => margin.top + innerH * (1 - value / barMax);
  const yLine = (value: number) => margin.top + innerH * (1 - value / lineMax);
  const ticks = Array.from({ length: 5 }, (_, i) => i / 4);
  const tickFormat = (value: number): ValueFormat => (Number.isInteger(value) ? "entero" : "decimal");
  let pen = false;
  const path = points
    .map((point, index) => {
      if (point.line === null) { pen = false; return ""; }
      const part = `${pen ? "L" : "M"}${x(index)} ${yLine(point.line)}`;
      pen = true;
      return part;
    })
    .join(" ");
  const current = points[hover ?? -1] ?? points[points.length - 1];
  const describe = (point: DualAxisPoint) =>
    `${point.label}. ${barLabel}: ${formatWithUnit(point.bar, format, unit)}. ${lineLabel}: ${formatWithUnit(point.line, format, unit)}`;
  // Con muchos cortes se rotulan uno de cada dos para que no se pisen.
  const every = slot < 40 ? 2 : 1;

  return (
    <div className="od-combo">
      <ul className="od-combo__legend" aria-label="Series de la gráfica">
        <li>
          <svg width="24" height="14" aria-hidden="true"><rect x="6" y="1" width="12" height="12" fill="var(--od-series-1)" /></svg>
          {barLabel} (barras, eje izquierdo)
        </li>
        <li>
          <svg width="24" height="14" aria-hidden="true">
            <line x1="0" y1="7" x2="24" y2="7" stroke="var(--od-series-total)" strokeWidth="2.5" />
            <circle cx="12" cy="7" r="3" fill="var(--od-series-total)" />
          </svg>
          {lineLabel} (línea, eje derecho)
        </li>
      </ul>
      <div ref={wrap} className="od-combo__scroll">
        <svg width={width} height={height} role="group" aria-label={label}>
          <g aria-hidden="true">
            {ticks.map((t) => (
              <g key={t}>
                <line className="od-lines__grid" x1={margin.left} x2={width - margin.right} y1={yBar(barMax * t)} y2={yBar(barMax * t)} />
                <text className="od-lines__tick" x={margin.left - 8} y={yBar(barMax * t)} dy="0.32em" textAnchor="end">
                  {formatCompact(barMax * t, tickFormat(barMax * t))}
                </text>
                <text className="od-lines__tick" x={width - margin.right + 8} y={yLine(lineMax * t)} dy="0.32em" textAnchor="start">
                  {formatCompact(lineMax * t, tickFormat(lineMax * t))}
                </text>
              </g>
            ))}
            <line className="od-combo__axis" x1={margin.left} x2={width - margin.right} y1={yBar(0)} y2={yBar(0)} />
            {points.map((point, index) => (
              <g key={point.key}>
                {point.bar === null ? (
                  <text className="od-lines__tick" x={x(index)} y={yBar(0) - 6} textAnchor="middle">—</text>
                ) : (
                  <rect
                    x={x(index) - barW / 2}
                    y={point.bar === 0 ? yBar(0) - 1 : yBar(point.bar)}
                    width={barW}
                    height={Math.max(1, yBar(0) - yBar(point.bar))}
                    fill="var(--od-series-1)"
                  />
                )}
                {index % every === 0 && (
                  <text className="od-lines__year" x={x(index)} y={height - 8} textAnchor="middle">{point.label}</text>
                )}
              </g>
            ))}
            <path className="od-combo__line" d={path} />
            {points.map((point, index) =>
              point.line === null ? null : <circle key={point.key} className="od-combo__dot" cx={x(index)} cy={yLine(point.line)} r="4" />,
            )}
          </g>
          {points.map((point, index) => (
            <g
              key={point.key}
              role="img"
              tabIndex={0}
              aria-label={describe(point)}
              className="od-combo__hit"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
            >
              <title>{describe(point)}</title>
              <rect x={x(index) - slot / 2 + 1} y={margin.top} width={Math.max(1, slot - 2)} height={innerH + margin.bottom - 2} />
            </g>
          ))}
        </svg>
      </div>
      {current && (
        <div className="od-combo__values">
          <strong>{current.label}</strong>
          <span>{barLabel}: <b>{formatWithUnit(current.bar, format, unit)}</b></span>
          <span>{lineLabel}: <b>{formatWithUnit(current.line, format, unit)}</b></span>
        </div>
      )}
      <p className="od-combo__note">
        Cada eje va de cero a su valor más alto: las dos categorías pueden tener escalas distintas. — = sin reportar. Pasa por un corte para ver sus valores.
      </p>
    </div>
  );
}
