/* =============================================================================
   Tablero de KPI.

   Todos los indicadores del informe como celdas de un mismo tablero: la cifra
   en paletas, la variación con su flecha y su lectura en palabras, el rastro
   de los cinco cortes y el boleto de origen. Cada celda es un botón: elegirla
   manda ese indicador a la gráfica de evolución.

   El rastro de cortes no es decorado: cada barra es un corte, se puede señalar
   y el corte elegido va marcado.
   ========================================================================== */

import { splitBig } from "../data/big-numbers";
import type { CSSProperties } from "react";
import { basisOf, changeBetween, cutsOf, formatCompact, formatValue, formatWithUnit, valueOf } from "../data/open-data";
import { comparisonText, periodReading, readingCutText } from "../data/period-reading";
import { formatVariation, kpiModeOf, lastReported, pointsUpToCut, variationOf, VARIATION_REASON_TEXT } from "../data/kpi-options";
import type { KpiMode, KpiPoint } from "../data/kpi-options";
import { cutLabel } from "../data/terms";
import type { CampusId, Indicator, Term } from "../data/types";
import { KpiSpark } from "./KpiSpark";
import { SplitFlap } from "./SplitFlap";

interface KpiBoardProps {
  indicators: Indicator[];
  years: number[];
  year: number;
  /** Periodo académico. Con él, cada cifra es la de ese periodo y el rastro recorre los periodos 1 y 2. */
  term?: Term | null;
  campus: CampusId;
  campusName: string;
  illustrative: boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** Cómo lee cada KPI su cifra (ajustes del bloque). Sin elección, el promedio de siempre. */
  modes?: Record<string, KpiMode>;
}

export function KpiBoard({ indicators, years, year, term = null, campus, campusName, illustrative, selectedId, onSelect, modes }: KpiBoardProps) {
  return (
    <div className="od-kpis">
      {indicators.map((indicator, index) => {
        // La lectura del corte: un indicador que solo se reporta por año lee su
        // cifra anual aunque el tablero esté en un periodo, y lo dice.
        const reading = periodReading(indicator, year, term, campus);
        const { value, cut } = reading;
        const grouped = reading.kind === "todo";
        const changes = reading.comparisons.map((comparison) => ({ comparison, change: changeBetween(indicator, value, comparison.value) }));
        const lead = changes.length ? changes[0] : undefined;
        // El rastro recorre solo los años con dato del indicador, en su propia unidad de corte.
        const cuts = cutsOf(years, reading.kind === "periodo");
        const own = indicator.years ? cuts.filter((c) => indicator.years!.includes(c.year)) : cuts;
        const trail = own.map((c) => valueOf(indicator, c.year, campus, c.term));
        const basis = basisOf(indicator, cut.year, campus, cut.term);
        const trailMax = Math.max(0, ...trail.map((v) => v ?? 0)) || 1;
        const selected = indicator.id === selectedId;
        const previous = lead?.comparison.value ?? null;
        const rising = value !== null && previous !== null && value > previous;
        const falling = value !== null && previous !== null && value < previous;

        // La lectura que eligió el bloque para este KPI. «promedio» es la de siempre y no toca nada de lo de abajo.
        const mode = kpiModeOf(modes, indicator.id);
        const series: KpiPoint[] = own.map((c, i) => ({ year: c.year, term: c.term, label: cutLabel(c.year, c.term), value: trail[i] }));
        const range = pointsUpToCut(series, cut);
        const latest = mode === "ultima" ? lastReported(range) : null;
        const variation = mode === "variacion" ? variationOf(range) : null;
        const shownValue = mode === "ultima" ? latest?.value ?? null : value;
        const figureText = variation ? formatVariation(variation.pct) : splitBig(shownValue)?.text ?? formatValue(shownValue, indicator.format);
        const figureSpoken = variation
          ? variation.pct === null
            ? `Variación porcentual: ${VARIATION_REASON_TEXT[variation.reason as Exclude<typeof variation.reason, "calculada">]}`
            : `Variación porcentual de ${variation.from!.label} a ${variation.to!.label}: ${figureText}`
          : mode === "ultima"
            ? `${formatWithUnit(shownValue, indicator.format, indicator.unit)}, última cifra reportada${latest ? `, ${latest.label}` : ""}`
            : `${formatWithUnit(value, indicator.format, indicator.unit)}, ${readingCutText(reading)}`;

        return (
          <button
            key={indicator.id}
            type="button"
            className="od-kpi"
            aria-pressed={selected}
            onClick={() => onSelect(indicator.id)}
          >
            <span className="od-kpi__label">{indicator.label}</span>

            {mode === "evolucion" ? (
              <KpiSpark label={indicator.label} points={range} format={indicator.format} unit={indicator.unit} />
            ) : (
              <span className="od-kpi__figure">
                <SplitFlap
                  value={figureText}
                  size="md"
                  align="end"
                  numeric
                  delay={160 + index * 120}
                  label={figureSpoken}
                />
                {/* Trece dígitos no caben en la paleta: va el número y la escala baja a la unidad («miles de millones de pesos»). */}
                <span className="od-kpi__unit">
                  {variation
                    ? variation.pct === null
                      ? VARIATION_REASON_TEXT[variation.reason as Exclude<typeof variation.reason, "calculada">]
                      : "variación porcentual"
                    : shownValue === null
                      ? "sin reportar"
                      : [splitBig(shownValue)?.long, indicator.unit].filter(Boolean).join(" de ")}
                </span>
              </span>
            )}

            {mode === "ultima" ? (
              <span className="od-kpi__change" data-reading="neutro">
                {latest
                  ? `Última cifra reportada · ${latest.label}${latest.label !== reading.label && !grouped ? ` (${reading.label} sin dato)` : ""}`
                  : "Sin cifras reportadas"}
              </span>
            ) : mode === "variacion" ? (
              <span className="od-kpi__change" data-reading="neutro">
                {variation?.from && variation.to && variation.from !== variation.to
                  ? `De ${variation.from.label} (${formatCompact(variation.from.value, indicator.format)}) a ${variation.to.label} (${formatCompact(variation.to.value, indicator.format)})`
                  : variation?.from
                    ? `Única cifra: ${variation.from.label} (${formatCompact(variation.from.value, indicator.format)})`
                    : "Sin cifras reportadas"}
              </span>
            ) : mode === "evolucion" ? null : (
              <>
            <span className="od-kpi__change" data-reading={lead?.change?.reading ?? "neutro"}>
              {grouped ? (
                <>Periodo {reading.label} · {basis ?? "sin cifras"}</>
              ) : lead?.change ? (
                <>
                  <svg viewBox="0 0 16 16" aria-hidden="true" data-dir={rising ? "up" : falling ? "down" : "flat"}>
                    <path d={rising ? "M8 3l5 6H3z" : falling ? "M8 13l5-6H3z" : "M3 7h10v2H3z"} />
                  </svg>
                  {lead.change.label} frente a {lead.comparison.label}
                  {lead.change.reading === "mejora" ? " · mejora" : lead.change.reading === "empeora" ? " · retrocede" : ""}
                </>
              ) : lead ? (
                <>Sin comparación con {lead.comparison.label}</>
              ) : (
                <>Primer corte publicado</>
              )}
            </span>
            {/* El mismo periodo del año anterior: la comparación que no depende de la época del año. */}
            {changes.slice(1).map(({ comparison, change }) => (
              <span key={comparison.kind} className="od-kpi__change od-kpi__change--second" data-reading={change?.reading ?? "neutro"}>
                {change ? `${change.label} frente a ${comparisonText(comparison)}` : `Sin comparación con ${comparisonText(comparison)}`}
              </span>
            ))}
              </>
            )}

            {mode !== "evolucion" && <span className="od-kpi__trail" aria-hidden="true" data-cuts={own.length}>
              {trail.map((v, i) => {
                const c = own[i];
                return (
                  <span
                    key={cutLabel(c.year, c.term)}
                    data-selected={(c.year === cut.year && c.term === cut.term) || undefined}
                    data-previous={(lead !== undefined && cutLabel(c.year, c.term) === lead.comparison.label) || undefined}
                    data-empty={v === null || undefined}
                    style={{ "--h": `${v === null ? 12 : Math.max(8, (v / trailMax) * 100)}%` } as CSSProperties}
                    title={`${cutLabel(c.year, c.term)}: ${formatWithUnit(v, indicator.format, indicator.unit)}`}
                  />
                );
              })}
            </span>}

            <span className="od-stub">
              <span className="od-stub__source">{indicator.source}</span>
              <span className="od-stub__meta">
                {campusName} · {grouped ? reading.label : readingCutText(reading)}
                {reading.annualOnly ? " · dato anual, no se reporta por periodo" : ""}
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
