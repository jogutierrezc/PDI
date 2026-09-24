/* =============================================================================
   Desglose: cómo se reparte una cifra por dentro.

   Cada desglose ocupa todo el ancho de la ficha.

   Cada dato se muestra en el corte en que se reportó, sin acumular: si se
   reportó por periodo, salen 2024-A y 2024-B por separado; si se reportó como
   cifra del año, sale 2024. La cifra del año calculada (A + B, promedio…) no se
   mezcla con los periodos de los que sale, así nada se cuenta dos veces. Con
   "Periodo: A" o "B" en la barra de la ficha, solo se ve ese periodo.

   Lecturas:
   · Circular y Barras: el reparto de un corte. El año lo marca la ficha; si ese
     año se reportó por periodo, se elige A o B aquí mismo (no se suman).
   · Composición: una columna al 100 % por corte, a lo largo del periodo.
   · Líneas: cada categoría en su línea, corte a corte.
   · Líneas y barras: una categoría, con su cifra del año en línea y A y B en barras.
   Pulsar un corte en una serie lo lleva a la vista de un corte.
   ========================================================================== */

import { useState } from "react";
import type { CSSProperties } from "react";
import { downloadText, formatReserved, formatValue, formatWithUnit } from "../data/open-data";
import { ALL_YEARS, ANNUAL_RULE_LABEL, cutCode, cutCodeLabel, cutLabel, fromCutCode, termLabel, TERMS } from "../data/terms";
import type { Breakdown, BreakdownItem, Term } from "../data/types";
import { AnnualTermChart } from "./AnnualTermChart";
import { BarList } from "./Charts";
import { ChartFrame, ViewSwitch } from "./ChartFrame";
import { Donut } from "./Donut";
import { LineChart } from "./LineChart";
import { YearFilter, useVisibleYears } from "./YearFilter";
import "./breakdowns.css";

type View = "circular" | "barras" | "composicion" | "lineas" | "combinada";

interface Cut {
  year: number;
  term: Term | null;
}

const oneDecimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Colores categóricos en orden fijo; desde el séptimo se repiten y la leyenda carga la identidad. */
const categoryColor = (index: number) => `var(--od-cat-${(index % 6) + 1})`;
const sameCut = (a: Cut | undefined, b: Cut | undefined) => Boolean(a && b && a.year === b.year && a.term === b.term);

export function BreakdownChart({ breakdown, year, term, years, setYear }: {
  breakdown: Breakdown;
  year: number;
  term: Term | null;
  years: number[];
  setYear: (year: number) => void;
}) {
  const rule = breakdown.annualRule ?? "reportado";
  const available = breakdown.years ?? years;
  const visible = useVisibleYears(available, breakdown.id);

  const reported = (items: BreakdownItem[] | undefined) => (items ?? []).some((item) => item.value !== null);
  const hasTerm = (y: number, t: Term) => reported(breakdown.terms?.[y]?.[t]);
  // La cifra del año es un corte propio solo si se reportó como año: con la
  // regla "reportado", o si ese año no tiene periodos (datos anteriores).
  const annualReported = (y: number) => reported(breakdown.values[y]) && (rule === "reportado" || (!hasTerm(y, "A") && !hasTerm(y, "B")));
  /** Cortes con dato de un año, sin acumular periodos. */
  const cutsOf = (y: number): Cut[] =>
    term
      ? hasTerm(y, term) ? [{ year: y, term }] : []
      : [...TERMS.filter((t) => hasTerm(y, t)).map((t) => ({ year: y, term: t })), ...(annualReported(y) ? [{ year: y, term: null }] : [])];

  const cuts = visible.years.flatMap(cutsOf);
  const itemsAt = (cut: Cut): BreakdownItem[] => (cut.term ? breakdown.terms?.[cut.year]?.[cut.term] : breakdown.values[cut.year]) ?? [];
  const labels = Array.from(new Set(available.flatMap(cutsOf).flatMap((cut) => itemsAt(cut).map((item) => item.label))));
  const valueAt = (label: string, cut: Cut) => itemsAt(cut).find((item) => item.label === label)?.value ?? null;
  const reservedAt = (label: string, cut: Cut) => Boolean(itemsAt(cut).find((item) => item.label === label)?.reserved);
  const totalAt = (cut: Cut) => {
    const parts = labels.map((label) => valueAt(label, cut)).filter((v): v is number => v !== null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  };

  // El corte del año de la ficha: el periodo elegido aquí, o el último con dato.
  // Todo el periodo: un único corte con el promedio anual de cada categoría.
  const grouped = year === ALL_YEARS;
  const yearCuts = grouped
    ? reported(breakdown.values[ALL_YEARS]) ? [{ year: ALL_YEARS, term: null }] : []
    : available.includes(year) ? cutsOf(year) : [];
  const [pickedTerm, setPickedTerm] = useState<Term | "anual" | null>(null);
  const selected =
    yearCuts.find((cut) => (cut.term ?? "anual") === pickedTerm) ?? yearCuts[yearCuts.length - 1];

  const partsOfWhole = breakdown.unit !== "%" && available.flatMap(cutsOf).every((cut) => itemsAt(cut).every((i) => i.value === null || i.value >= 0));
  const hasPeriods = available.some((y) => hasTerm(y, "A") || hasTerm(y, "B"));
  // La vista de entrada es la que fija la intranet. Composición pide partes de
  // un todo y más de un corte; si no los hay, abre en barras (una tasa) o circular.
  const [view, setView] = useState<View>(() =>
    breakdown.defaultChart === "composicion" && partsOfWhole && cuts.length > 1
      ? "composicion"
      : breakdown.unit === "%" || breakdown.defaultChart === "barras"
        ? "barras"
        : "circular",
  );
  const shownView: View =
    (view === "circular" || view === "composicion") && !partsOfWhole ? "barras" : view === "combinada" && (!hasPeriods || term) ? "lineas" : view;
  const series = shownView === "composicion" || shownView === "lineas" || shownView === "combinada";
  const [picked, setPicked] = useState<string | null>(null);
  const category = picked && labels.includes(picked) ? picked : labels[0];
  const [focus, setFocus] = useState<number | null>(null);
  const focusCut = cuts[focus ?? -1] ?? cuts.find((cut) => sameCut(cut, selected)) ?? cuts[cuts.length - 1];

  /** Llevar un corte de una serie a la vista de un corte. */
  const openCut = (cut: Cut) => {
    setYear(cut.year);
    setPickedTerm(cut.term ?? "anual");
  };

  const options = [
    ...(partsOfWhole ? [{ value: "circular" as const, label: "Circular" }] : []),
    { value: "barras" as const, label: "Barras" },
    ...(partsOfWhole ? [{ value: "composicion" as const, label: "Composición" }] : []),
    { value: "lineas" as const, label: "Líneas" },
    ...(hasPeriods && !term ? [{ value: "combinada" as const, label: "Líneas y barras" }] : []),
  ];

  const download = () => {
    const escape = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const header = ["Corte", ...labels, ...(partsOfWhole ? ["Total"] : [])];
    const rows = cuts.map((cut) => [
      cutLabel(cut.year, cut.term),
      ...labels.map((label) => {
        // La descarga respeta la reserva: el CSV no puede decir lo que la
        // ficha calla, o el umbral no serviría de nada.
        if (reservedAt(label, cut)) return formatReserved(breakdown.reserveThreshold);
        const v = valueAt(label, cut);
        return v === null ? "" : String(v).replace(".", ",");
      }),
      ...(partsOfWhole ? [String(totalAt(cut) ?? "").replace(".", ",")] : []),
    ]);
    downloadText(`desglose-${breakdown.id}.csv`, `﻿${[header, ...rows].map((row) => row.map(escape).join(";")).join("\n")}`);
  };

  const selectedItems = selected ? itemsAt(selected) : [];
  // Cuántas categorías del corte se callan por el umbral. Va en el subtítulo
  // para que viaje también en la imagen exportada, no solo en la pantalla.
  const reservedCount = selectedItems.filter((item) => item.reserved).length;
  const reserveNote = reservedCount
    ? ` · ${reservedCount} ${reservedCount === 1 ? "categoría reservada" : "categorías reservadas"} (${formatReserved(breakdown.reserveThreshold)})`
    : "";

  const subtitle = series
    ? `Total institucional · ${cuts.length ? `${cutLabel(cuts[0].year, cuts[0].term)} a ${cutLabel(cuts[cuts.length - 1].year, cuts[cuts.length - 1].term)}` : "sin cortes"}${term ? ` · solo periodo ${termLabel(term)}` : ""} · ${breakdown.unit}`
    : `Total institucional · ${grouped ? `periodo ${cutLabel(year, null)} · promedio anual` : `corte ${selected ? cutLabel(selected.year, selected.term) : cutLabel(year, term)}`} · ${breakdown.unit}${reserveNote}`;

  return (
    <ChartFrame
      title={breakdown.title}
      subtitle={subtitle}
      source={breakdown.source}
      className="od-breakdown"
      exportName={`${breakdown.title}-${series ? "serie" : selected ? cutLabel(selected.year, selected.term) : year}`}
      actions={<ViewSwitch label={`Tipo de gráfica: ${breakdown.title}`} value={shownView} onChange={setView} options={options} />}
    >
      {(series || yearCuts.length > 1) && (
      <div className="od-breakdown__bar" data-export-ignore>
        {series ? (
          <YearFilter available={available} selected={visible.selected} onChange={visible.select} />
        ) : (
          yearCuts.length > 1 && (
            <ViewSwitch
              label={`Corte de ${year}`}
              value={selected ? selected.term ?? "anual" : "anual"}
              onChange={(value) => setPickedTerm(value as Term | "anual")}
              options={yearCuts.map((cut) => ({
                value: cut.term ?? "anual",
                label: cut.term ? cutLabel(year, cut.term) : `${year} (año)`,
              }))}
            />
          )
        )}
        {shownView === "combinada" && (
          <label className="od-select od-breakdown__category">
            <span>Categoría</span>
            <select value={category ?? ""} onChange={(e) => setPicked(e.target.value)}>
              {labels.map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      )}

      {shownView === "composicion" && (
        <ul className="od-breakdown__legend" aria-label="Categorías">
          {labels.map((label, index) => (
            <li key={label}>
              <i style={{ background: categoryColor(index) }} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      )}

      {!series ? (
        !selected || !reported(selectedItems) ? (
          <div className="od-empty">
            <p>
              {grouped || available.includes(year)
                ? `Este desglose no tiene cifras para ${cutLabel(year, term)}.`
                : `Este desglose no reporta ${year}.`}
            </p>
            {cuts.length > 0 && (
              <button type="button" className="od-button od-button--line" onClick={() => openCut(cuts[cuts.length - 1])}>
                Ver el corte {cutLabel(cuts[cuts.length - 1].year, cuts[cuts.length - 1].term)}
              </button>
            )}
          </div>
        ) : shownView === "circular" ? (
          <Donut
            label={`${breakdown.title}, ${cutLabel(selected.year, selected.term)}`}
            items={selectedItems}
            format={breakdown.format}
            unit={breakdown.unit}
          />
        ) : (
          <BarList
            label={`${breakdown.title}, ${cutLabel(selected.year, selected.term)}`}
            items={selectedItems}
            format={breakdown.format}
            unit={breakdown.unit}
            share={partsOfWhole}
            reserveThreshold={breakdown.reserveThreshold}
          />
        )
      ) : cuts.length === 0 ? (
        <p className="od-empty">{term ? `Este desglose no tiene cifras del periodo ${term} en los años elegidos.` : "No hay cifras en los años elegidos."}</p>
      ) : shownView === "composicion" ? (
        <>
          <div className="od-stack100" role="list" aria-label={`${breakdown.title}: parte de cada categoría por corte`}>
            {cuts.map((cut, index) => {
              const total = totalAt(cut);
              const description = [
                `${cutLabel(cut.year, cut.term)}: total ${formatWithUnit(total, breakdown.format, breakdown.unit)}`,
                ...labels.map((label) => {
                  const v = valueAt(label, cut);
                  return `${label} ${formatWithUnit(v, breakdown.format, breakdown.unit)}${v !== null && total ? ` (${oneDecimal.format((v / total) * 100)} %)` : ""}`;
                }),
              ].join(". ");
              const newYear = index === 0 || cuts[index - 1].year !== cut.year;
              return (
                <button
                  key={cutLabel(cut.year, cut.term)}
                  type="button"
                  role="listitem"
                  aria-label={`${description}. Pulsa para ver este corte.`}
                  className="od-stack100__col"
                  data-active={sameCut(focusCut, cut) || undefined}
                  data-year-start={newYear || undefined}
                  onMouseEnter={() => setFocus(index)}
                  onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(index)}
                  onClick={() => {
                    openCut(cut);
                    setView(partsOfWhole ? "circular" : "barras");
                  }}
                >
                  <span className="od-stack100__total">{formatValue(total, breakdown.format)}</span>
                  <span className="od-stack100__track">
                    {labels.map((label, i) => {
                      const v = valueAt(label, cut);
                      const share = v !== null && total ? (v / total) * 100 : 0;
                      if (share <= 0) return null;
                      return (
                        <span key={label} className="od-stack100__seg" style={{ "--h": `${share}%`, "--c": categoryColor(i), "--i": i } as CSSProperties}>
                          {share >= 12 && <em>{Math.round(share)} %</em>}
                        </span>
                      );
                    })}
                  </span>
                  <span className="od-stack100__label">
                    <b>{cut.term ?? "Año"}</b>
                    <small data-repeat={!(newYear || !cut.term) || undefined}>{cut.year}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {focusCut && (
            <div className="od-breakdown__detail" aria-live="polite">
              <strong>{cutLabel(focusCut.year, focusCut.term)}</strong>
              <span>
                Total <b>{formatWithUnit(totalAt(focusCut), breakdown.format, breakdown.unit)}</b>
              </span>
              {labels.map((label, i) => {
                const v = valueAt(label, focusCut);
                const total = totalAt(focusCut);
                return (
                  <span key={label}>
                    <i style={{ background: categoryColor(i) }} aria-hidden="true" />
                    {label} <b>{formatValue(v, breakdown.format)}</b>
                    {v !== null && total ? <small> {oneDecimal.format((v / total) * 100)} %</small> : null}
                  </span>
                );
              })}
            </div>
          )}
        </>
      ) : shownView === "lineas" ? (
        <LineChart
          key={`${breakdown.id}-${term ?? "todos"}-${visible.years.join()}`}
          label={`${breakdown.title} por categoría y corte`}
          years={cuts.map((cut) => cutCode(cut.year, cut.term))}
          series={labels.map((label, i) => ({
            id: label,
            label,
            color: categoryColor(i),
            values: cuts.map((cut) => valueAt(label, cut)),
          }))}
          format={breakdown.format}
          unit={breakdown.unit}
          selectedYear={selected ? cutCode(selected.year, selected.term) : -1}
          onSelectYear={(code) => {
            const cut = fromCutCode(code);
            openCut({ year: cut.year, term: cut.term });
          }}
          tickLabel={cutCodeLabel}
        />
      ) : (
        <AnnualTermChart
          label={`${breakdown.title}, ${category}: cifra del año y periodos 1 y 2`}
          points={visible.years.map((y) => ({
            year: y,
            annual: breakdown.values[y]?.find((item) => item.label === category)?.value ?? null,
            a: breakdown.terms?.[y]?.A?.find((item) => item.label === category)?.value ?? null,
            b: breakdown.terms?.[y]?.B?.find((item) => item.label === category)?.value ?? null,
          }))}
          selectedYear={year}
          format={breakdown.format}
          unit={breakdown.unit}
          annualRule={ANNUAL_RULE_LABEL[rule]}
          onSelectYear={setYear}
        />
      )}

      <p className="od-breakdown__note">
        {hasPeriods
          ? "Los periodos 1 y 2 se muestran por separado, como se reportaron: no se suman en el año. La cifra del año solo aparece donde se reportó como año."
          : "Cifras por año, como se reportaron."}
      </p>

      <details className="od-breakdown-table" data-export-ignore>
        <summary>Ver datos por corte</summary>
        <button type="button" className="od-button od-button--line" onClick={download}>
          Descargar CSV
        </button>
        <div className="od-table-wrap" tabIndex={0} role="region" aria-label={`Datos de ${breakdown.title}, desplazable`}>
          <table className="od-table">
            <caption className="sr-only">
              {breakdown.title} · total institucional · {breakdown.unit}. — = sin reportar.
            </caption>
            <thead>
              <tr>
                <th scope="col">Corte</th>
                {labels.map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
                {partsOfWhole && <th scope="col">Total</th>}
              </tr>
            </thead>
            <tbody>
              {cuts.map((cut) => (
                <tr key={cutLabel(cut.year, cut.term)} data-selected={sameCut(cut, selected) || undefined}>
                  <th scope="row">{cutLabel(cut.year, cut.term)}</th>
                  {labels.map((label) => (
                    <td key={label} data-empty={valueAt(label, cut) === null || undefined}>
                      {formatValue(valueAt(label, cut), breakdown.format)}
                    </td>
                  ))}
                  {partsOfWhole && <td>{formatValue(totalAt(cut), breakdown.format)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </ChartFrame>
  );
}
