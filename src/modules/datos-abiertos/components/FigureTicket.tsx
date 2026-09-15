/* =============================================================================
   Cifra con su boleto de origen.

   La unidad mínima del portal: la cifra en paletas, qué es, el corte anterior
   legible debajo y el boleto con la oficina que la reporta. Una cifra sin su
   corte y su fuente no se publica, así que el componente no admite omitirlos.
   ========================================================================== */

import { changeBetween, formatValue, formatWithUnit, valueOf } from "../data/open-data";
import type { CampusId, Indicator } from "../data/types";
import { SplitFlap } from "./SplitFlap";
import type { FlapSize } from "./SplitFlap";

interface FigureTicketProps {
  indicator: Indicator;
  year: number;
  campus: CampusId;
  campusName: string;
  illustrative: boolean;
  size?: FlapSize;
  delay?: number;
  /** Celdas reservadas, para alinear varias cifras en una fila. */
  cells?: number;
  variant?: "board" | "hero" | "compact";
  /** Marcas de la guía de lectura: [cifra, corte anterior, boleto]. */
  annotate?: (string | null)[];
}

function Pin({ letter }: { letter: string | null | undefined }) {
  if (!letter) return null;
  return (
    <span className="od-pin od-pin--inline" aria-hidden="true">
      {letter}
    </span>
  );
}

export function FigureTicket({
  indicator,
  year,
  campus,
  campusName,
  illustrative,
  size = "md",
  delay = 0,
  cells,
  variant = "board",
  annotate,
}: FigureTicketProps) {
  const value = valueOf(indicator, year, campus);
  const previous = valueOf(indicator, year - 1, campus);
  const change = changeBetween(indicator, value, previous);
  const figure = formatValue(value, indicator.format);
  const hasPrevious = year - 1 in indicator.values;

  return (
    <span className={`od-figure od-figure--${variant}`} data-empty={value === null || undefined}>
      <span className="od-figure__label">{indicator.label}</span>

      <span className="od-figure__value">
        <Pin letter={annotate?.[0]} />
        <SplitFlap
          value={figure}
          length={cells}
          align="end"
          size={size}
          delay={delay}
          numeric
          label={formatWithUnit(value, indicator.format, indicator.unit)}
        />
        <span className="od-figure__unit" aria-hidden="true">
          {value === null ? "sin reportar" : indicator.unit}
        </span>
      </span>

      <span className="od-figure__previous">
        <Pin letter={annotate?.[1]} />
        {!hasPrevious ? (
          <>Primer corte publicado</>
        ) : previous === null ? (
          <>{year - 1}: sin reportar</>
        ) : (
          <>
            {year - 1}: {formatValue(previous, indicator.format)}
            {change && (
              <span className="od-figure__change" data-reading={change.reading}>
                {" · "}
                {change.label}
                {change.reading === "mejora" ? " · mejora" : change.reading === "empeora" ? " · retrocede" : ""}
              </span>
            )}
          </>
        )}
      </span>

      {/* La marca va fuera del boleto: su borde perforado es una máscara y la recortaría. */}
      <span className="od-figure__ticket">
        <Pin letter={annotate?.[2]} />
        <span className="od-ticket">
          <span className="od-ticket__source">{indicator.source}</span>
          <span className="od-ticket__meta">
            <span className="od-ticket__campus">{campusName} · </span>Corte {year}
          </span>
          {illustrative && <span className="od-ticket__stamp">Dato ilustrativo</span>}
        </span>
      </span>
    </span>
  );
}
