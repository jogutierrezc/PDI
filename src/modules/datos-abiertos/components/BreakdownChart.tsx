import { useState } from "react";
import { downloadText, formatValue } from "../data/open-data";
import { ANNUAL_RULE_LABEL, cutLabel } from "../data/terms";
import type { Breakdown, BreakdownItem, Term } from "../data/types";
import { AnnualTermChart } from "./AnnualTermChart";
import { BarList } from "./Charts";
import { ChartFrame, ViewSwitch } from "./ChartFrame";
import { Donut } from "./Donut";
import { LineChart } from "./LineChart";
import { YearFilter, useVisibleYears } from "./YearFilter";

export function BreakdownChart({ breakdown, year, term, years, setYear }: {
  breakdown: Breakdown; year: number; term: Term | null; years: number[]; setYear: (year: number) => void;
}) {
  const [view, setView] = useState<"circular" | "barras" | "lineas" | "combinada">(breakdown.unit === "%" || breakdown.defaultChart === "barras" ? "barras" : "circular");
  const available = breakdown.years ?? years;
  const visible = useVisibleYears(available, breakdown.id);
  const labels = Array.from(new Set(available.flatMap((y) => [...(breakdown.values[y] ?? []), ...(breakdown.terms?.[y]?.A ?? []), ...(breakdown.terms?.[y]?.B ?? [])]).map((v) => v.label)));
  const [picked, setPicked] = useState<string | null>(null);
  const category = picked && labels.includes(picked) ? picked : labels[0];
  const itemsAt = (y: number, t: Term | null): BreakdownItem[] => !available.includes(y) ? [] : (t ? breakdown.terms?.[y]?.[t] : breakdown.values[y]) ?? [];
  const value = (label: string, y: number, t: Term | null) => itemsAt(y, t).find((i) => i.label === label)?.value ?? null;
  const items = itemsAt(year, term);
  const hasData = items.some((i) => i.value !== null);
  const canCircle = breakdown.unit !== "%" && items.every((i) => i.value === null || i.value >= 0);
  const effectiveView = view === "circular" && !canCircle ? "barras" : view;
  const timeline = effectiveView === "lineas" || effectiveView === "combinada";
  const points = visible.years.map((y) => ({ year: y, annual: value(category, y, null), a: value(category, y, "A"), b: value(category, y, "B") }));
  const download = () => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = labels.flatMap((label) => visible.years.map((y) => [label, String(y), ...(["A", "B", null] as const).map((t) => { const v = value(label, y, t); return v === null ? "" : String(v).replace(".", ","); })]));
    downloadText(`desglose-${breakdown.id}.csv`, `\uFEFF${[["Categoría", "Año", "Periodo A", "Periodo B", "Global anual"], ...rows].map((row) => row.map(escape).join(";")).join("\n")}`);
  };
  return (
    <ChartFrame title={breakdown.title} subtitle={`Total institucional · ${timeline ? "por año y periodo" : `corte ${cutLabel(year, term)}`} · ${breakdown.unit}`} source={breakdown.source}
      actions={<ViewSwitch label={`Tipo de gráfica: ${breakdown.title}`} value={effectiveView} onChange={setView}
        options={[...(canCircle ? [{ value: "circular" as const, label: "Circular" }] : []), { value: "barras", label: "Barras" }, { value: "lineas", label: "Líneas" }, { value: "combinada", label: "Líneas y barras" }]} />}>
      <YearFilter available={available} selected={visible.selected} onChange={visible.select} />
      {timeline ? <>
        <label className="od-select"><span>Categoría</span><select value={category ?? ""} onChange={(e) => setPicked(e.target.value)}>{labels.map((label) => <option key={label}>{label}</option>)}</select></label>
        {effectiveView === "combinada" ? <AnnualTermChart label={`${breakdown.title}, ${category}: global anual y periodos A y B`} points={points} selectedYear={year} format={breakdown.format} unit={breakdown.unit}
          annualRule={ANNUAL_RULE_LABEL[breakdown.annualRule ?? "reportado"]} onSelectYear={setYear} /> :
          <LineChart label={`${breakdown.title}, ${category}`} years={visible.years} series={[{ id: category ?? "categoria", label: category ?? "Categoría", color: "var(--od-series-1)", values: visible.years.map((y) => value(category, y, term)) }]} format={breakdown.format} unit={breakdown.unit} selectedYear={year} onSelectYear={setYear} />}
      </> : !hasData || !visible.years.includes(year) ? <p className="od-empty">Sin reporte para {cutLabel(year, term)} en los años elegidos.</p> : effectiveView === "circular" ?
        <Donut label={`${breakdown.title}, ${cutLabel(year, term)}`} items={items} format={breakdown.format} unit={breakdown.unit} /> :
        <BarList label={`${breakdown.title}, ${cutLabel(year, term)}`} items={items} format={breakdown.format} unit={breakdown.unit} share={canCircle} />}
      <details className="od-breakdown-table">
        <summary>Ver datos por año y periodo</summary>
        <button type="button" className="od-button od-button--line" onClick={download}>Descargar CSV</button>
        <div className="od-combo__scroll"><table className="od-table">
          <caption>{breakdown.title} · total institucional · {breakdown.unit}. — = sin reportar.</caption>
          <thead><tr><th scope="col">Categoría</th><th scope="col">Año</th><th scope="col">Periodo A</th><th scope="col">Periodo B</th><th scope="col">Global anual</th></tr></thead>
          <tbody>{labels.flatMap((label) => visible.years.map((y) => <tr key={`${label}-${y}`}><th scope="row">{label}</th><td>{y}</td>{(["A", "B", null] as const).map((t) => <td key={t ?? "anual"}>{formatValue(value(label, y, t), breakdown.format)}</td>)}</tr>))}</tbody>
        </table></div>
      </details>
    </ChartFrame>
  );
}
