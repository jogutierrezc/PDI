/* =============================================================================
   Barra apilada del avance por estado.
   Reglas del sistema de datos aplicadas aquí:
   · separación de 2 px entre segmentos, del color de la superficie, para que
     dos tramos contiguos no se lean como uno solo;
   · leyenda siempre presente y con etiqueta directa — cuatro series es el
     límite en que las etiquetas caben, así que ninguna identidad depende del
     color;
   · glifo por estado (✓ ◐ ○ ▲): la codificación secundaria que necesitan los
     colores de estado, que no son separables bajo daltonismo por definición.
   ========================================================================== */

import { useId, useState } from "react";
import { countFor, statusMeta, statusOrder } from "../../data/pdi";
import type { PdiSummary } from "../../types/database";

interface StackedProgressProps {
  summary: PdiSummary;
}

export function StackedProgress({ summary }: StackedProgressProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const titleId = useId();

  const segments = statusOrder
    .map((status) => ({ ...statusMeta[status], value: countFor(summary, status) }))
    .filter((segment) => segment.value > 0);

  const total = summary.total || 1;

  return (
    <div className="stacked">
      <div
        className="stacked__bar"
        role="img"
        aria-labelledby={titleId}
        onPointerLeave={() => setHovered(null)}
      >
        <span id={titleId} className="sr-only">
          Distribución de {summary.total} indicadores:{" "}
          {segments.map((s) => `${s.label} ${s.value}`).join(", ")}.
        </span>

        {segments.map((segment) => {
          const share = (segment.value / total) * 100;
          return (
            <span
              key={segment.id}
              className={`stacked__segment${hovered === segment.id ? " is-hovered" : ""}`}
              style={{ width: `${share}%`, background: segment.color }}
              onPointerEnter={() => setHovered(segment.id)}
            >
              {/* La etiqueta vive dentro del tramo cuando hay sitio. */}
              {share > 12 && <span className="stacked__inline-label">{segment.value}</span>}

              {hovered === segment.id && (
                <span className="stacked__tooltip" role="presentation">
                  <strong>
                    {segment.glyph} {segment.label}
                  </strong>
                  <span>
                    {segment.value} indicadores · {Math.round(share)} %
                  </span>
                </span>
              )}
            </span>
          );
        })}
      </div>

      <ul className="stacked__legend">
        {statusOrder.map((status) => {
          const meta = statusMeta[status];
          const value = countFor(summary, status);

          return (
            <li
              key={status}
              className={`stacked__legend-item${hovered === status ? " is-hovered" : ""}`}
              onPointerEnter={() => setHovered(status)}
              onPointerLeave={() => setHovered(null)}
            >
              <span className="stacked__swatch" style={{ background: meta.color }} aria-hidden="true" />
              <span className="stacked__legend-label">
                <span aria-hidden="true">{meta.glyph}</span> {meta.label}
              </span>
              <strong>{value}</strong>
              <small>{Math.round((value / total) * 100)} %</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
