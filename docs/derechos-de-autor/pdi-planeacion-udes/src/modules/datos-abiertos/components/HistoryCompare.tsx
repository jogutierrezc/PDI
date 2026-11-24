/* =============================================================================
   Evolución histórica.

   Cuál era la cifra en un periodo y cómo va en otro: 2020-A 14.324
   estudiantes, 2025-B 8.888; de ellos, cuántos de pregrado y de posgrado y qué
   parte del total es cada uno. Los periodos se eligen (por defecto el primero y
   el último) y pueden ser anteriores al periodo del informe.

   Dos lecturas del mismo conjunto:
   · Comparar: los dos totales con su variación, la composición de cada periodo
     en una barra al 100 % y una tabla con cifra, % del total y cambio.
   · Serie: todos los periodos en líneas, el total y cada categoría.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { formatValue, formatWithUnit } from "../data/open-data";
import { cutCode, cutCodeLabel } from "../data/terms";
import type { HistoryData, Indicator } from "../data/types";
import { changeBetween } from "../data/open-data";
import { ViewSwitch } from "./ChartFrame";
import { LineChart } from "./LineChart";
import type { LineSeries } from "./LineChart";
import { SplitFlap } from "./SplitFlap";

const oneDecimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Colores categóricos en orden fijo; desde el séptimo se repiten y la etiqueta carga la identidad. */
const categoryColor = (index: number) => `var(--od-cat-${(index % 6) + 1})`;

const toCode = (label: string) => {
  const [year, term] = label.split("-");
  return cutCode(Number(year), term === "A" || term === "1" ? "A" : term === "B" || term === "2" ? "B" : null);
};

export function HistoryCompare({ data }: { data: HistoryData }) {
  const periods = data.periods;
  const [from, setFrom] = useState(periods[0]);
  const [to, setTo] = useState(periods[periods.length - 1]);
  const [view, setView] = useState<"comparar" | "serie">("comparar");

  // changeBetween lee formato y dirección de un indicador: la evolución es neutra.
  const asIndicator = useMemo(
    () => ({ id: data.id, label: data.title, unit: data.unit, format: data.format, direction: "neutro" }) as Indicator,
    [data],
  );

  if (periods.length === 0) {
    return <p className="od-empty">Esta evolución todavía no tiene periodos cargados.</p>;
  }

  const totalFrom = data.total[from] ?? null;
  const totalTo = data.total[to] ?? null;
  const diff = totalFrom !== null && totalTo !== null ? totalTo - totalFrom : null;
  const change = changeBetween(asIndicator, totalTo, totalFrom);
  const share = (value: number | null | undefined, total: number | null) =>
    value === null || value === undefined || !total ? null : (value / total) * 100;

  const series: LineSeries[] = [
    { id: "total", label: data.totalLabel, color: "var(--od-series-total)", dashed: true, values: periods.map((p) => data.total[p] ?? null) },
    ...data.categories.map((category, index) => ({
      id: category,
      label: category,
      color: categoryColor(index),
      values: periods.map((p) => data.values[category]?.[p] ?? null),
    })),
  ];

  return (
    <div className="od-history">
      <div className="od-history__bar">
        {view === "comparar" && periods.length > 1 && (
          <div className="od-history__pick">
            <label className="od-select">
              <span>Desde</span>
              <select value={from} onChange={(event) => setFrom(event.target.value)}>
                {periods.map((p) => (
                  <option key={p} value={p} disabled={p >= to}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="od-select">
              <span>Hasta</span>
              <select value={to} onChange={(event) => setTo(event.target.value)}>
                {periods.map((p) => (
                  <option key={p} value={p} disabled={p <= from}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {periods.length > 1 && (
          <ViewSwitch
            label="Vista de la evolución"
            options={[
              { value: "comparar", label: "Comparar" },
              { value: "serie", label: "Serie" },
            ]}
            value={view}
            onChange={setView}
          />
        )}
      </div>

      {view === "serie" ? (
        <LineChart
          key={data.id}
          label={`${data.title} por periodo`}
          years={periods.map(toCode)}
          series={series}
          format={data.format}
          unit={data.unit}
          selectedYear={toCode(to)}
          onSelectYear={(code) => setTo(cutCodeLabel(code))}
          tickLabel={cutCodeLabel}
        />
      ) : (
        <>
          <div className="od-history__totals">
            {[from, to].filter((p, i, list) => list.indexOf(p) === i).map((period, index) => {
              const total = data.total[period] ?? null;
              return (
                <div key={period} className="od-history__total" data-side={index === 0 ? "desde" : "hasta"}>
                  <span className="od-history__period">{period}</span>
                  <span className="od-history__figure">
                    <SplitFlap
                      value={formatValue(total, data.format)}
                      size="lg"
                      align="end"
                      numeric
                      delay={index * 180}
                      label={`${data.totalLabel}, ${period}: ${formatWithUnit(total, data.format, data.unit)}`}
                    />
                    <span className="od-history__unit">{total === null ? "sin reportar" : data.unit}</span>
                  </span>
                  <span className="od-history__label">{data.totalLabel}</span>
                </div>
              );
            })}
            {from !== to && (
              <div className="od-history__delta" data-dir={diff === null ? undefined : diff > 0 ? "up" : diff < 0 ? "down" : "flat"}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d={diff !== null && diff > 0 ? "M8 3l5 6H3z" : diff !== null && diff < 0 ? "M8 13l5-6H3z" : "M3 7h10v2H3z"} />
                </svg>
                {diff === null ? (
                  <span>Sin variación calculable: falta un total.</span>
                ) : (
                  <span>
                    <b>
                      {diff > 0 ? "+" : diff < 0 ? "−" : "±"}
                      {formatValue(Math.abs(diff), data.format)} {data.unit}
                    </b>
                    {change ? ` · ${change.label}` : ""} entre {from} y {to}
                  </span>
                )}
              </div>
            )}
          </div>

          {data.categories.length > 0 && (
            <div className="od-history__composition" role="list" aria-label={`Composición de ${data.totalLabel.toLowerCase()} por periodo`}>
              {[from, to].filter((p, i, list) => list.indexOf(p) === i).map((period) => {
                const total = data.total[period] ?? null;
                return (
                  <div key={period} className="od-history__stack" role="listitem">
                    <span className="od-history__stack-label">{period}</span>
                    <span className="od-history__stack-track">
                      {data.categories.map((category, index) => {
                        const value = data.values[category]?.[period] ?? null;
                        const pct = share(value, total);
                        if (pct === null || pct <= 0) return null;
                        return (
                          <span
                            key={category}
                            className="od-history__segment"
                            style={{ "--w": `${pct}%`, "--c": categoryColor(index), "--i": index } as CSSProperties}
                            title={`${category}, ${period}: ${formatWithUnit(value, data.format, data.unit)} · ${oneDecimal.format(pct)} %`}
                          >
                            {pct >= 9 && <em>{oneDecimal.format(pct)} %</em>}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
              <ul className="od-history__legend" aria-hidden="true">
                {data.categories.map((category, index) => (
                  <li key={category}>
                    <i style={{ background: categoryColor(index) }} />
                    {category}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="od-table-wrap" tabIndex={0} role="region" aria-label="Detalle de la evolución, desplazable">
            <table className="od-table od-history__table">
              <caption className="sr-only">
                {data.title}: cifra y % del total en {from} y {to}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Categoría</th>
                  <th scope="col">{from}</th>
                  <th scope="col">% del total</th>
                  {from !== to && (
                    <>
                      <th scope="col">{to}</th>
                      <th scope="col">% del total</th>
                      <th scope="col">Cambio</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {[{ key: "", label: data.totalLabel }, ...data.categories.map((c) => ({ key: c, label: c }))].map((row, index) => {
                  const a = row.key === "" ? totalFrom : data.values[row.key]?.[from] ?? null;
                  const b = row.key === "" ? totalTo : data.values[row.key]?.[to] ?? null;
                  const rowChange = changeBetween(asIndicator, b, a);
                  return (
                    <tr key={row.key || "total"} data-total={row.key === "" || undefined}>
                      <th scope="row">
                        {row.key !== "" && <i className="od-history__swatch" style={{ background: categoryColor(index - 1) }} aria-hidden="true" />}
                        {row.label}
                      </th>
                      <td data-empty={a === null || undefined}>{formatValue(a, data.format)}</td>
                      <td>{row.key === "" ? "100 %" : share(a, totalFrom) === null ? "—" : `${oneDecimal.format(share(a, totalFrom)!)} %`}</td>
                      {from !== to && (
                        <>
                          <td data-empty={b === null || undefined}>{formatValue(b, data.format)}</td>
                          <td>{row.key === "" ? "100 %" : share(b, totalTo) === null ? "—" : `${oneDecimal.format(share(b, totalTo)!)} %`}</td>
                          <td>{rowChange?.label ?? "—"}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
