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
import { changeBetween, formatValue, formatWithUnit, valueOf } from "../data/open-data";
import type { CampusId, Indicator } from "../data/types";
import { SplitFlap } from "./SplitFlap";

interface KpiBoardProps {
  indicators: Indicator[];
  years: number[];
  year: number;
  campus: CampusId;
  campusName: string;
  illustrative: boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function KpiBoard({ indicators, years, year, campus, campusName, illustrative, selectedId, onSelect }: KpiBoardProps) {
  return (
    <div className="od-kpis">
      {indicators.map((indicator, index) => {
        const value = valueOf(indicator, year, campus);
        const previous = valueOf(indicator, year - 1, campus);
        const change = changeBetween(indicator, value, previous);
        const trail = years.map((y) => valueOf(indicator, y, campus));
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
              {change ? (
                <>
                  <svg viewBox="0 0 16 16" aria-hidden="true" data-dir={rising ? "up" : falling ? "down" : "flat"}>
                    <path d={rising ? "M8 3l5 6H3z" : falling ? "M8 13l5-6H3z" : "M3 7h10v2H3z"} />
                  </svg>
                  {change.label} frente a {year - 1}
                  {change.reading === "mejora" ? " · mejora" : change.reading === "empeora" ? " · retrocede" : ""}
                </>
              ) : (
                <>Sin comparación con {year - 1}</>
              )}
            </span>

            <span className="od-kpi__trail" aria-hidden="true">
              {trail.map((v, i) => (
                <span
                  key={years[i]}
                  data-selected={years[i] === year || undefined}
                  data-previous={years[i] === year - 1 || undefined}
                  data-empty={v === null || undefined}
                  style={{ "--h": `${v === null ? 12 : Math.max(8, (v / trailMax) * 100)}%` } as CSSProperties}
                  title={`${years[i]}: ${formatWithUnit(v, indicator.format, indicator.unit)}`}
                />
              ))}
            </span>

            <span className="od-stub">
              <span className="od-stub__source">{indicator.source}</span>
              <span className="od-stub__meta">
                {campusName} · {year}
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
