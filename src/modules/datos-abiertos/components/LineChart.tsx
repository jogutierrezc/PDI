/* =============================================================================
   Líneas por campus.

   Una línea por campus (y el total institucional en tinta, punteado) sobre un
   solo eje. Las líneas se dibujan al entrar en pantalla; al pasar el puntero
   una guía vertical muestra todas las cifras de ese corte, y al hacer clic el
   corte pasa a ser el de toda la ficha. La leyenda enciende y apaga series, y
   con el teclado las flechas recorren los cortes y Enter lo elige.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { formatValue, formatWithUnit } from "../data/open-data";
import type { ValueFormat } from "../data/types";
import { ChartTooltip, niceCeil, niceFloor } from "./ChartFrame";
import { useInView, useWidth } from "./motion";

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

interface LineChartProps {
  label: string;
  years: number[];
  series: LineSeries[];
  format: ValueFormat;
  unit: string;
  selectedYear: number;
  onSelectYear?: (year: number) => void;
  initiallyHidden?: string[];
  /** Rótulo de cada corte. Por defecto, el número tal cual (el año). */
  tickLabel?: (year: number) => string;
}

const HEIGHT = 300;
const M = { top: 22, right: 158, bottom: 34, left: 56 };

export function LineChart({
  label,
  years,
  series,
  format,
  unit,
  selectedYear,
  onSelectYear,
  initiallyHidden = [],
  tickLabel = String,
}: LineChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const seen = useInView(wrap);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initiallyHidden));
  const [hover, setHover] = useState<number | null>(null);

  const visible = series.filter((s) => !hidden.has(s.id) && s.values.some((v) => v !== null));
  const compact = width < 520;
  const right = compact ? 16 : M.right;
  const innerW = Math.max(120, width - M.left - right);
  const innerH = HEIGHT - M.top - M.bottom;

  const { min, max } = useMemo(() => {
    const all = visible.flatMap((s) => s.values).filter((v): v is number => v !== null);
    if (all.length === 0) return { min: 0, max: 1 };
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    // Si todo vive en una franja estrecha lejos del cero, la base sube: una
    // tasa que va de 82 a 87 no se lee pegada al techo de una escala 0-100.
    const floor = lo > 0 && (hi - lo) / hi < 0.35 ? niceFloor(lo * 0.92) : 0;
    return { min: floor, max: niceCeil(hi * 1.04) };
  }, [visible]);

  const x = (i: number) => M.left + (years.length === 1 ? innerW / 2 : (i / (years.length - 1)) * innerW);
  const y = (v: number) => M.top + innerH - ((v - min) / (max - min || 1)) * innerH;
  // Cuatro tramos si caen en números redondos (0-20); si no (0-25), cinco.
  const span = max - min;
  const steps = Number.isInteger(span / 4) && (span / 4) % 1 === 0 && !(span % 4) ? 4 : 5;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => min + (span * i) / steps);

  const pathFor = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  // Etiquetas directas al final de cada línea, separadas para que no se pisen.
  const endLabels = (() => {
    if (compact) return [];
    const items = visible
      .map((s) => {
        let last = s.values.length - 1;
        while (last >= 0 && s.values[last] === null) last -= 1;
        return last < 0 ? null : { s, y: y(s.values[last] as number), value: s.values[last] as number };
      })
      .filter((item): item is { s: LineSeries; y: number; value: number } => Boolean(item))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i += 1) {
      if (items[i].y - items[i - 1].y < 16) items[i].y = items[i - 1].y + 16;
    }
    return items;
  })();

  const indexFromPointer = (event: MouseEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const step = years.length > 1 ? innerW / (years.length - 1) : innerW;
    return Math.max(0, Math.min(years.length - 1, Math.round(px / step)));
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const current = hover ?? years.indexOf(selectedYear);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = Math.max(0, Math.min(years.length - 1, current + (event.key === "ArrowRight" ? 1 : -1)));
      setHover(next);
    } else if ((event.key === "Enter" || event.key === " ") && hover !== null) {
      event.preventDefault();
      onSelectYear?.(years[hover]);
    } else if (event.key === "Escape") {
      setHover(null);
    }
  };

  const toggle = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (series.length - next.size > 1) next.add(id);
      return next;
    });
  };

  const selectedIndex = years.indexOf(selectedYear);
  const tipIndex = hover;

  return (
    <div className="od-lines" data-seen={seen || undefined}>
      <div className="od-legend" role="group" aria-label="Series visibles">
        {series.map((s) => {
          const on = !hidden.has(s.id);
          const current = s.values[selectedIndex] ?? null;
          return (
            <button
              key={s.id}
              type="button"
              className="od-legend__item"
              aria-pressed={on}
              onClick={() => toggle(s.id)}
            >
              <span
                className="od-legend__swatch"
                data-dashed={s.dashed || undefined}
                style={{ "--swatch": s.color } as React.CSSProperties}
              />
              <span className="od-legend__label">{s.label}</span>
              <span className="od-legend__value">{formatValue(current, format)}</span>
            </button>
          );
        })}
      </div>

      <div ref={wrap} className="od-lines__plot">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${label}. Usa las flechas para recorrer los cortes y Enter para elegir uno.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setHover(null)}
        >
          {selectedIndex >= 0 && (
            <rect
              className="od-lines__selected"
              x={x(selectedIndex) - Math.min(28, innerW / years.length / 2)}
              y={M.top}
              width={Math.min(56, innerW / years.length)}
              height={innerH}
              rx={6}
            />
          )}

          {ticks.map((tick) => (
            <g key={tick}>
              <line className="od-lines__grid" x1={M.left} x2={M.left + innerW} y1={y(tick)} y2={y(tick)} />
              <text className="od-lines__tick" x={M.left - 10} y={y(tick)} dy="0.32em" textAnchor="end">
                {formatValue(tick, format === "entero" ? "entero" : "decimal")}
              </text>
            </g>
          ))}

          {years.map((year, i) =>
            // Con muchos cortes en poco ancho, un rótulo sí y otro no; el elegido siempre.
            years.length > 8 && innerW / years.length < 56 && i % 2 === 1 && i !== selectedIndex ? null : (
              <text
                key={year}
                className="od-lines__year"
                data-selected={i === selectedIndex || undefined}
                x={x(i)}
                y={HEIGHT - 10}
                textAnchor="middle"
              >
                {tickLabel(year)}
              </text>
            ),
          )}

          {visible.map((s, index) => (
            <path
              key={s.id}
              className="od-lines__path"
              d={pathFor(s.values)}
              pathLength={1}
              data-dashed={s.dashed || undefined}
              style={{ "--i": index, stroke: s.color } as React.CSSProperties}
            />
          ))}

          {visible.map((s) =>
            s.values.map((v, i) =>
              v === null ? null : (
                <circle
                  key={`${s.id}-${i}`}
                  className="od-lines__dot"
                  data-active={i === tipIndex || i === selectedIndex || undefined}
                  cx={x(i)}
                  cy={y(v)}
                  r={i === tipIndex ? 6 : 4}
                  style={{ fill: s.color }}
                />
              ),
            ),
          )}

          {tipIndex !== null && (
            <line className="od-lines__cross" x1={x(tipIndex)} x2={x(tipIndex)} y1={M.top} y2={M.top + innerH} />
          )}

          {endLabels.map((item) => (
            <text key={item.s.id} className="od-lines__end" x={M.left + innerW + 12} y={item.y} dy="0.32em">
              <tspan className="od-lines__end-value">{formatValue(item.value, format)}</tspan>
              <tspan dx={6}>{item.s.label}</tspan>
            </text>
          ))}

          <rect
            className="od-lines__hit"
            x={M.left - 20}
            y={M.top}
            width={innerW + 40}
            height={innerH + 20}
            onPointerMove={(event) => setHover(indexFromPointer(event))}
            onPointerLeave={() => setHover(null)}
            onClick={(event) => onSelectYear?.(years[indexFromPointer(event)])}
          />
        </svg>

        {tipIndex !== null && (
          <ChartTooltip
            x={x(tipIndex)}
            y={M.top}
            align={tipIndex === 0 ? "start" : tipIndex === years.length - 1 ? "end" : "center"}
          >
            <strong>{tickLabel(years[tipIndex])}</strong>
            {visible.map((s) => (
              <span key={s.id} className="od-tip__row">
                <i style={{ background: s.color }} />
                {s.label}
                <b>{formatWithUnit(s.values[tipIndex] ?? null, format, unit)}</b>
              </span>
            ))}
            {onSelectYear && years[tipIndex] !== selectedYear && <em>Clic para ver este corte</em>}
          </ChartTooltip>
        )}
      </div>
    </div>
  );
}
