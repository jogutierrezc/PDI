/* =============================================================================
   El río de la cadena de valor (recuperado del primer portal de Impacto).

   Tres cauces —Investigación, Enseñanza, Extensión— cruzan cuatro estaciones:
   Insumos, Procesos, Productos e Impacto real. El ancho de cada cauce en una
   estación es cuántos indicadores tiene allí; el hilo interior, cuántos
   tienen cifra. Un cauce sin hilo no está seco: está sin reportar.
   ========================================================================== */

import { useId, useState } from "react";
import type { CSSProperties } from "react";
import { FUNCTIONS, FUNCTION_LABEL, FUNCTION_TONE, STAGES, STAGE_LABEL } from "../model";
import type { SubstantiveFunction } from "../model";
import type { RiverCounts } from "./analysis";

interface ValueRiverProps {
  counts: RiverCounts;
  functions?: SubstantiveFunction[];
  selected?: SubstantiveFunction | null;
  onSelect?: (id: SubstantiveFunction | null) => void;
  compact?: boolean;
}

const W = 760;
const X = [70, 280, 490, 700];
/** El centro de cada cauce serpentea un poco entre estaciones. */
const LANES: Record<SubstantiveFunction, number[]> = {
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
  const [hover, setHover] = useState<SubstantiveFunction | null>(null);
  const titleId = useId();
  const shown = FUNCTIONS.filter((f) => !functions || functions.includes(f));
  const active = hover ?? selected;
  const height = compact ? 330 : 350;
  // La escala se ajusta a la estación más ancha para que ningún cauce se desborde.
  const widest = Math.max(1, ...shown.flatMap((f) => STAGES.map((s) => counts[f][s].total)));
  const unit = Math.min(UNIT, 70 / widest);

  return (
    <figure className={`ipo-river${compact ? " ipo-river--compact" : ""}`}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          Cadena de valor:{" "}
          {shown.map((f) => `${FUNCTION_LABEL[f]}, ${STAGES.map((s) => `${counts[f][s].total} en ${STAGE_LABEL[s]}`).join(", ")}`).join("; ")}.
        </title>

        {STAGES.map((stage, i) => (
          <g key={stage} className="ipo-river__station">
            <line x1={X[i]} x2={X[i]} y1={28} y2={height - 18} />
            <text x={X[i]} y={16} textAnchor="middle" className="ipo-river__level">
              {STAGE_LABEL[stage]}
            </text>
          </g>
        ))}

        {shown.map((f, index) => {
          // Un solo cauce (la lente de una vicerrectoría) va por el centro.
          const shift = shown.length === 1 ? 176 - LANES[f].reduce((t, c) => t + c, 0) / 4 : 0;
          const centers = LANES[f].map((c) => c + shift);
          const totals = STAGES.map((s) => counts[f][s].total);
          const data = STAGES.map((s) => counts[f][s].data);
          const outer = totals.map((t) => Math.max(10, t * unit + 8));
          const inner = data.map((d) => (d > 0 ? Math.max(3, d * unit) : 0));
          const dim = active !== null && active !== f;
          return (
            <g
              key={f}
              className="ipo-river__lane"
              style={{ "--tone": FUNCTION_TONE[f], "--delay": `${index * 90}ms` } as CSSProperties}
              data-dim={dim || undefined}
              onPointerEnter={() => setHover(f)}
              onPointerLeave={() => setHover(null)}
              onClick={() => onSelect?.(selected === f ? null : f)}
            >
              <path className="ipo-river__bed" d={ribbon(centers, outer)} />
              {inner.some((w) => w > 0) && <path className="ipo-river__thread" d={ribbon(centers, inner.map((w) => w || 1))} />}
              {STAGES.map((s, i) => (
                <g key={s} className="ipo-river__node" transform={`translate(${X[i]} ${centers[i]})`}>
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

      <figcaption className="ipo-river__legend">
        {shown.map((f) => (
          <button
            key={f}
            type="button"
            style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}
            aria-pressed={onSelect ? selected === f : undefined}
            onPointerEnter={() => setHover(f)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(f)}
            onBlur={() => setHover(null)}
            onClick={() => onSelect?.(selected === f ? null : f)}
          >
            <i aria-hidden="true" />
            {FUNCTION_LABEL[f]}
            <span>{STAGES.reduce((sum, s) => sum + counts[f][s].total, 0)}</span>
          </button>
        ))}
        <small>El número es cuántos indicadores hay en cada estación; el hilo intenso, cuántos tienen cifra.</small>
      </figcaption>
    </figure>
  );
}
