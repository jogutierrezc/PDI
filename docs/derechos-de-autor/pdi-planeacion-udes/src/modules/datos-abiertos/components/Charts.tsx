/* =============================================================================
   Gráficos de la ficha.

   Dos formas, las dos de una sola serie y un solo tono (sin leyenda: el título
   nombra la serie):

   · YearBars — magnitud en el tiempo. El corte elegido va en tono pleno y el
     resto en el mismo tono aclarado; un año sin dato se dibuja como hueco
     punteado con la etiqueta "s. r.", nunca como una barra en cero.
   · BarList — comparación entre categorías, ordenada como llega del origen
     (niveles, semestres y categorías tienen un orden propio que no se altera).

   Las barras crecen desde la línea base al entrar en pantalla. Cada marca
   tiene tooltip al pasar y al enfocar, y la tabla de la ficha repite los
   valores para quien no ve el gráfico.
   ========================================================================== */

import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { formatCellWithUnit, formatCompact, formatReserved, formatValue, formatWithUnit, RESERVE_DEFAULT } from "../data/open-data";
import type { ValueFormat } from "../data/types";
import { useInView } from "./motion";

interface YearBarsProps {
  title: string;
  points: { year: number; value: number | null }[];
  selectedYear: number;
  format: ValueFormat;
  unit: string;
  onSelectYear?: (year: number) => void;
  /** Rótulo de cada corte. Por defecto, el número tal cual (el año). */
  tickLabel?: (year: number) => string;
}

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(max));
  const fraction = max / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

export function YearBars({ title, points, selectedYear, format, unit, onSelectYear, tickLabel = String }: YearBarsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const [hover, setHover] = useState<number | null>(null);

  const max = niceMax(Math.max(0, ...points.map((p) => p.value ?? 0)));
  // Cuatro tramos si caen en números redondos; si no (50 → 12,5), cinco.
  const steps = Number.isInteger(max / 4) || max < 4 ? 4 : 5;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => (i * max) / steps);
  const focusPoint = points.find((p) => p.year === hover);

  return (
    <div ref={ref} className="od-yearbars" data-seen={seen || undefined}>
      <div className="od-yearbars__plot">
        <div className="od-yearbars__grid" aria-hidden="true">
          {ticks
            .slice()
            .reverse()
            .map((tick) => (
              <span key={tick}>
                <em>{formatCompact(tick, format === "entero" ? "entero" : "decimal")}</em>
              </span>
            ))}
        </div>

        <div className="od-yearbars__bars" role="list" aria-label={title}>
          {points.map((point, index) => {
            const selected = point.year === selectedYear;
            const height = point.value === null ? 100 : (point.value / max) * 100;
            const label = `${tickLabel(point.year)}: ${formatWithUnit(point.value, format, unit)}`;
            return (
              <div role="listitem" key={point.year} className="od-yearbars__slot">
                <button
                  type="button"
                  className="od-yearbars__bar"
                  data-selected={selected || undefined}
                  data-empty={point.value === null || undefined}
                  style={{ "--h": `${height}%`, "--i": index } as CSSProperties}
                  aria-label={label}
                  aria-pressed={onSelectYear ? selected : undefined}
                  onMouseEnter={() => setHover(point.year)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(point.year)}
                  onBlur={() => setHover(null)}
                  onClick={() => onSelectYear?.(point.year)}
                >
                  {(selected || index === points.length - 1) && point.value !== null && (
                    <span className="od-yearbars__value" aria-hidden="true">
                      {formatCompact(point.value, format)}
                    </span>
                  )}
                  {point.value === null && (
                    <span className="od-yearbars__empty" aria-hidden="true">
                      s. r.
                    </span>
                  )}
                </button>
                <span className="od-yearbars__year" aria-hidden="true">
                  {tickLabel(point.year)}
                </span>
                {focusPoint?.year === point.year && (
                  <span className="od-tooltip" role="presentation">
                    <strong>{tickLabel(point.year)}</strong>
                    {formatWithUnit(point.value, format, unit)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface BarListProps {
  items: { label: string; value: number | null; highlight?: boolean; reserved?: boolean }[];
  format: ValueFormat;
  unit: string;
  /** Muestra además la participación de cada fila en el total. */
  share?: boolean;
  label: string;
  /** Con umbral, las filas reservadas se escriben "< n" en vez de su cifra. */
  reserveThreshold?: number;
}

export function BarList({ items, format, unit, share = false, label, reserveThreshold }: BarListProps) {
  const ref = useRef<HTMLUListElement>(null);
  const seen = useInView(ref);
  const max = Math.max(0, ...items.map((i) => i.value ?? 0)) || 1;
  const total = items.reduce((sum, i) => sum + (i.value ?? 0), 0);

  return (
    <ul ref={ref} className="od-barlist" data-seen={seen || undefined} aria-label={label}>
      {items.map((item, index) => {
        const reserved = Boolean(item.reserved);
        // La barra reservada llega hasta el umbral y va rayada: el dato real
        // está por debajo de ahí, y la trama dice que no es una medición.
        const width = reserved
          ? Math.min(100, ((reserveThreshold ?? RESERVE_DEFAULT) / max) * 100)
          : item.value === null
            ? 0
            : (item.value / max) * 100;
        const part = share && total > 0 && item.value !== null && !reserved ? (item.value / total) * 100 : null;
        return (
          <li
            key={item.label}
            className="od-barlist__item"
            data-highlight={item.highlight || undefined}
            data-empty={(!reserved && item.value === null) || undefined}
            data-reserved={reserved || undefined}
            title={`${item.label}: ${formatCellWithUnit(item.value, format, unit, reserved, reserveThreshold)}`}
          >
            <span className="od-barlist__label">{item.label}</span>
            <span className="od-barlist__value">
              {reserved ? (
                <abbr title={`Reservado: menos de ${reserveThreshold ?? RESERVE_DEFAULT} registros`}>
                  {formatReserved(reserveThreshold)}
                </abbr>
              ) : item.value === null ? (
                "Sin reportar"
              ) : (
                formatValue(item.value, format)
              )}
              {part !== null && <small> · {formatValue(part, "decimal")} %</small>}
            </span>
            <span className="od-barlist__track" aria-hidden="true">
              <span className="od-barlist__fill" style={{ "--w": `${width}%`, "--i": index } as CSSProperties} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
