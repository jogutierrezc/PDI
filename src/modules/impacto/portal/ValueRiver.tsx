/* =============================================================================
   El río de la cadena de valor.

   Tres cauces —Investigación, Enseñanza, Extensión— cruzan cuatro estaciones:
   Insumos, Procesos, Productos e Impacto real. El ancho de cada cauce en una
   estación es cuántos indicadores tiene allí la matriz; el hilo interior,
   cuántos tienen cifra en la lente que se está mirando. Un cauce sin hilo no
   está seco: está sin reportar.
   ========================================================================== */

import { useId, useState } from "react";
import type { CSSProperties } from "react";
import { FUNCTIONS, LEVELS } from "../data/catalog";
import type { FunctionId, Level } from "../data/types";

export type RiverCounts = Record<FunctionId, Record<Level, { total: number; data: number }>>;

interface ValueRiverProps {
  counts: RiverCounts;
  functions?: FunctionId[];
  selected?: FunctionId | null;
  onSelect?: (id: FunctionId | null) => void;
  compact?: boolean;
}

const W = 760;
const X = [70, 280, 490, 700];
/** El centro de cada cauce serpentea un poco entre estaciones. */
const LANES: Record<FunctionId, number[]> = {
  investigacion: [78, 96, 70, 88],
  ensenanza: [176, 160, 184, 168],
  extension: [270, 282, 262, 276],
};
const UNIT = 3.2;

/** Un cauce cerrado: borde superior de izquierda a derecha y vuelta por abajo. */
function ribbon(centers: number[], widths: number[]): string {
  const top = centers.map((c, i) => c - widths[i] / 2);
  const bottom = centers.map((c, i) => c + widths[i] / 2);
  const lead = X[0] - 44;
  const tail = X[3] + 44;
  const left = (top[0] + bottom[0]) / 2;
  const right = (top[3] + bottom[3]) / 2;
  const d = [`M ${lead} ${left}`, `C ${lead + 20} ${top[0]} ${X[0] - 16} ${top[0]} ${X[0]} ${top[0]}`];
  for (let i = 1; i < 4; i++) {
    const mid = (X[i] - X[i - 1]) / 2;
    d.push(`C ${X[i - 1] + mid} ${top[i - 1]} ${X[i] - mid} ${top[i]} ${X[i]} ${top[i]}`);
  }
  d.push(`C ${X[3] + 16} ${top[3]} ${tail - 20} ${right} ${tail} ${right}`);
  d.push(`C ${tail - 20} ${right} ${X[3] + 16} ${bottom[3]} ${X[3]} ${bottom[3]}`);
  for (let i = 2; i >= 0; i--) {
    const mid = (X[i + 1] - X[i]) / 2;
    d.push(`C ${X[i + 1] - mid} ${bottom[i + 1]} ${X[i] + mid} ${bottom[i]} ${X[i]} ${bottom[i]}`);
  }
  d.push(`C ${X[0] - 16} ${bottom[0]} ${lead + 20} ${left} ${lead} ${left}`, "Z");
  return d.join(" ");
}

export function ValueRiver({ counts, functions, selected = null, onSelect, compact = false }: ValueRiverProps) {
  const [hover, setHover] = useState<FunctionId | null>(null);
  const titleId = useId();
  const shown = FUNCTIONS.filter((f) => !functions || functions.includes(f.id));
  const active = hover ?? selected;
  const height = compact ? 330 : 350;

  return (
    <figure className={`imp-river${compact ? " imp-river--compact" : ""}`} data-active={active ?? undefined}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          Cadena de valor:{" "}
          {shown
            .map((f) => `${f.name}, ${LEVELS.map((l) => `${counts[f.id][l.id].total} en ${l.name}`).join(", ")}`)
            .join("; ")}
          .
        </title>

        {LEVELS.map((level, i) => (
          <g key={level.id} className="imp-river__station">
            <line x1={X[i]} x2={X[i]} y1={28} y2={height - 18} />
            <text x={X[i]} y={16} textAnchor="middle" className="imp-river__level">
              {level.name}
            </text>
          </g>
        ))}

        {shown.map((f, index) => {
          // Un solo cauce (la lente de una vicerrectoría) va por el centro.
          const shift = shown.length === 1 ? 176 - LANES[f.id].reduce((t, c) => t + c, 0) / 4 : 0;
          const centers = LANES[f.id].map((c) => c + shift);
          const totals = LEVELS.map((l) => counts[f.id][l.id].total);
          const data = LEVELS.map((l) => counts[f.id][l.id].data);
          const outer = totals.map((t) => Math.max(10, t * UNIT + 8));
          const inner = data.map((d) => (d > 0 ? Math.max(3, d * UNIT) : 0));
          const dim = active !== null && active !== f.id;
          return (
            <g
              key={f.id}
              className="imp-river__lane"
              style={{ "--tone": f.tone, "--delay": `${index * 90}ms` } as CSSProperties}
              data-dim={dim || undefined}
              onPointerEnter={() => setHover(f.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => onSelect?.(selected === f.id ? null : f.id)}
            >
              <path className="imp-river__bed" d={ribbon(centers, outer)} />
              {inner.some((w) => w > 0) && <path className="imp-river__thread" d={ribbon(centers, inner.map((w) => w || 1))} />}
              {LEVELS.map((l, i) => (
                <g key={l.id} className="imp-river__node" transform={`translate(${X[i]} ${centers[i]})`}>
                  <circle r={compact ? 13 : 15} />
                  <text textAnchor="middle" dy="0.35em">
                    {totals[i]}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>

      <figcaption className="imp-river__legend">
        {shown.map((f) => (
          <button
            key={f.id}
            type="button"
            style={{ "--tone": f.tone } as CSSProperties}
            aria-pressed={onSelect ? selected === f.id : undefined}
            onPointerEnter={() => setHover(f.id)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(f.id)}
            onBlur={() => setHover(null)}
            onClick={() => onSelect?.(selected === f.id ? null : f.id)}
          >
            <i aria-hidden="true" />
            {f.name}
            <span>{LEVELS.reduce((sum, l) => sum + counts[f.id][l.id].total, 0)}</span>
          </button>
        ))}
        <small>El número es cuántos indicadores hay en cada estación; el hilo intenso, cuántos tienen cifra.</small>
      </figcaption>
    </figure>
  );
}
