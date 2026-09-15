/* =============================================================================
   Gráfica circular (dona).

   Los sectores se abren en barrido al entrar en pantalla. Al pasar por un
   sector o por su fila de la leyenda, el resto se apaga y el centro dice qué
   es, cuánto y qué parte del total; un clic lo deja fijo. Más de seis
   categorías se agrupan en "Otras": un séptimo color no se inventa.
   La leyenda lleva cifra y porcentaje de cada sector, así que el color nunca
   es la única forma de leerla.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { formatValue, formatWithUnit } from "../data/open-data";
import type { ValueFormat } from "../data/types";
import { useInView } from "./motion";

interface DonutProps {
  label: string;
  items: { label: string; value: number | null }[];
  format: ValueFormat;
  unit: string;
}

const SIZE = 220;
const RADIUS = 84;
const STROKE = 30;
const GAP = 2.5;
const CIRC = 2 * Math.PI * RADIUS;
const MAX_SLICES = 6;

export function Donut({ label, items, format, unit }: DonutProps) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  const slices = useMemo(() => {
    const reported = items.filter((i): i is { label: string; value: number } => i.value !== null && i.value > 0);
    if (reported.length <= MAX_SLICES) return reported;
    const sorted = [...reported].sort((a, b) => b.value - a.value);
    const kept = sorted.slice(0, MAX_SLICES - 1);
    const rest = sorted.slice(MAX_SLICES - 1).reduce((sum, i) => sum + i.value, 0);
    return [...kept, { label: "Otras", value: rest }];
  }, [items]);

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const missing = items.filter((i) => i.value === null);
  const active = hover ?? pinned;

  let offset = 0;
  const arcs = slices.map((slice, index) => {
    const length = total > 0 ? (slice.value / total) * CIRC : 0;
    const arc = { ...slice, index, length, offset, share: total > 0 ? (slice.value / total) * 100 : 0 };
    offset += length;
    return arc;
  });

  const focus = active !== null ? arcs[active] : null;

  return (
    <div ref={ref} className="od-donut" data-seen={seen || undefined} data-focus={active !== null || undefined}>
      <div className="od-donut__chart">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
          <circle className="od-donut__track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} strokeWidth={STROKE} />
          {arcs.map((arc) => {
            const visibleLength = Math.max(0, arc.length - GAP);
            return (
              <circle
                key={arc.label}
                className="od-donut__arc"
                data-active={active === arc.index || undefined}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                strokeWidth={STROKE}
                style={
                  {
                    stroke: `var(--od-cat-${arc.index + 1})`,
                    "--len": `${visibleLength}px`,
                    "--gap": `${CIRC - visibleLength}px`,
                    "--offset": `${-arc.offset}px`,
                    "--i": arc.index,
                  } as CSSProperties
                }
                onPointerEnter={() => setHover(arc.index)}
                onPointerLeave={() => setHover(null)}
                onClick={() => setPinned((p) => (p === arc.index ? null : arc.index))}
              />
            );
          })}
        </svg>
        <div className="od-donut__center" aria-live="polite">
          {focus ? (
            <>
              <strong>{formatValue(focus.share, "decimal")} %</strong>
              <span>{focus.label}</span>
              <small>{formatWithUnit(focus.value, format, unit)}</small>
            </>
          ) : (
            <>
              <strong>{formatValue(total, format)}</strong>
              <span>{unit === "%" ? "suma" : unit}</span>
              <small>en total</small>
            </>
          )}
        </div>
      </div>

      <ul className="od-donut__legend">
        {arcs.map((arc) => (
          <li key={arc.label}>
            <button
              type="button"
              aria-pressed={pinned === arc.index}
              data-active={active === arc.index || undefined}
              onPointerEnter={() => setHover(arc.index)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(arc.index)}
              onBlur={() => setHover(null)}
              onClick={() => setPinned((p) => (p === arc.index ? null : arc.index))}
            >
              <i style={{ background: `var(--od-cat-${arc.index + 1})` }} />
              <span className="od-donut__label">{arc.label}</span>
              <span className="od-donut__value">
                {formatValue(arc.value, format)}
                <small> · {formatValue(arc.share, "decimal")} %</small>
              </span>
            </button>
          </li>
        ))}
        {missing.map((item) => (
          <li key={item.label} className="od-donut__missing">
            <span>{item.label}</span>
            <span>Sin reportar</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
