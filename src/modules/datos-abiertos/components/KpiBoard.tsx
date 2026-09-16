/* =============================================================================
   Tablero de KPI.

   Todos los indicadores del informe como celdas de un mismo tablero: la cifra
   en paletas, la variación con su flecha y su lectura en palabras, el rastro
   de los cinco cortes y el boleto de origen. Cada celda es un botón: elegirla
   manda ese indicador a la gráfica de evolución.

   El rastro de cortes no es decorado: cada barra es un corte, se puede señalar
   y el corte elegido va marcado.
   ========================================================================== */

import type { CSSProperties } from "react";
import { basisOf, changeBetween, cutsOf, formatValue, formatWithUnit, valueOf } from "../data/open-data";
import { ALL_YEARS, cutLabel } from "../data/terms";
import type { CampusId, Indicator, Term } from "../data/types";
import { SplitFlap } from "./SplitFlap";

interface KpiBoardProps {
  indicators: Indicator[];
  years: number[];
  year: number;
  /** Periodo académico. Con él, el rastro recorre los periodos A y B. */
  term?: Term | null;
  campus: CampusId;
  campusName: string;
  illustrative: boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function KpiBoard({ indicators, years, year, term = null, campus, campusName, illustrative, selectedId, onSelect }: KpiBoardProps) {
  const cuts = cutsOf(years, term !== null);
  const cut = cutLabel(year, term);
  const previousCut = cutLabel(year - 1, term);
  const grouped = year === ALL_YEARS;
  return (
    <div className="od-kpis">
      {indicators.map((indicator, index) => {
        const value = valueOf(indicator, year, campus, term);
        const previous = valueOf(indicator, year - 1, campus, term);
        const change = changeBetween(indicator, value, previous);
        // El rastro recorre solo los años con dato del indicador.
        const own = indicator.years ? cuts.filter((c) => indicator.years!.includes(c.year)) : cuts;
        const trail = own.map((c) => valueOf(indicator, c.year, campus, c.term));
        const basis = basisOf(indicator, year, campus, term);
        const trailMax = Math.max(0, ...trail.map((v) => v ?? 0)) || 1;
        const selected = indicator.id === selectedId;
        const rising = value !== null && previous !== null && value > previous;
        const falling = value !== null && previous !== null && value < previous;

        return (
          <button
            key={indicator.id}
            type="button"
            className="od-kpi"
            aria-pressed={selected}
            onClick={() => onSelect(indicator.id)}
          >
            <span className="od-kpi__label">{indicator.label}</span>

            <span className="od-kpi__figure">
              <SplitFlap
                value={formatValue(value, indicator.format)}
                size="md"
                align="end"
                numeric
                delay={160 + index * 120}
                label={formatWithUnit(value, indicator.format, indicator.unit)}
              />
              <span className="od-kpi__unit">{value === null ? "sin reportar" : indicator.unit}</span>
            </span>

            <span className="od-kpi__change" data-reading={change?.reading ?? "neutro"}>
              {grouped ? (
                <>Periodo {cut} · {basis ?? "sin cifras"}</>
              ) : change ? (
                <>
                  <svg viewBox="0 0 16 16" aria-hidden="true" data-dir={rising ? "up" : falling ? "down" : "flat"}>
                    <path d={rising ? "M8 3l5 6H3z" : falling ? "M8 13l5-6H3z" : "M3 7h10v2H3z"} />
                  </svg>
                  {change.label} frente a {previousCut}
                  {change.reading === "mejora" ? " · mejora" : change.reading === "empeora" ? " · retrocede" : ""}
                </>
              ) : (
                <>Sin comparación con {previousCut}</>
              )}
            </span>

            <span className="od-kpi__trail" aria-hidden="true" data-cuts={own.length}>
              {trail.map((v, i) => {
                const c = own[i];
                return (
                  <span
                    key={cutLabel(c.year, c.term)}
                    data-selected={(c.year === year && c.term === term) || undefined}
                    data-previous={(c.year === year - 1 && c.term === term) || undefined}
                    data-empty={v === null || undefined}
                    style={{ "--h": `${v === null ? 12 : Math.max(8, (v / trailMax) * 100)}%` } as CSSProperties}
                    title={`${cutLabel(c.year, c.term)}: ${formatWithUnit(v, indicator.format, indicator.unit)}`}
                  />
                );
              })}
            </span>

            <span className="od-stub">
              <span className="od-stub__source">{indicator.source}</span>
              <span className="od-stub__meta">
                {campusName} · {cut}
                {basis && !grouped ? ` · ${basis}` : ""}
                {illustrative ? " · ilustrativo" : ""}
              </span>
            </span>

            <span className="od-kpi__pick">{selected ? "En la gráfica" : "Ver evolución"}</span>
          </button>
        );
      })}
    </div>
  );
}
