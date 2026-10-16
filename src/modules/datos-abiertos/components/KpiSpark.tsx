/* =============================================================================
   KPI en evolución · la versión compacta de la gráfica de evolución.

   En lugar del número, la serie del indicador en una línea pequeña, con la
   cifra inicial y la final rotuladas (cada una con su año o periodo). Vive
   dentro de la celda del tablero, así que es un dibujo sin interacción: la
   celda entera es el botón que lleva a la gráfica de evolución completa.

   · Un corte sin reportar rompe la línea; nunca se dibuja como cero.
   · El dibujo va oculto a lectores de pantalla y en su lugar se lee la serie
     completa («2020: 1.200; 2021: sin reportar…»), que hace de tabla.
   ========================================================================== */

import { formatCompact, formatWithUnit } from "../data/open-data";
import { firstReported, lastReported, reportedPoints } from "../data/kpi-options";
import type { KpiPoint } from "../data/kpi-options";
import type { ValueFormat } from "../data/types";

interface KpiSparkProps {
  label: string;
  points: KpiPoint[];
  format: ValueFormat;
  unit: string;
}

const W = 200;
const H = 52;
const PAD = 6;

/** La serie dicha de corrido, para lectores de pantalla. */
export function sparkSummary(label: string, points: KpiPoint[], format: ValueFormat, unit: string): string {
  const reported = reportedPoints(points);
  if (!reported.length) return `${label}: sin cifras reportadas.`;
  const first = reported[0];
  const last = reported[reported.length - 1];
  const head =
    reported.length === 1
      ? `${label}: una sola cifra reportada, ${first.label}, ${formatWithUnit(first.value, format, unit)}.`
      : `${label}: de ${first.label}, ${formatWithUnit(first.value, format, unit)}, a ${last.label}, ${formatWithUnit(last.value, format, unit)}.`;
  const rows = points.map((p) => `${p.label}: ${p.value === null ? "sin reportar" : formatWithUnit(p.value, format, unit)}`).join("; ");
  return `${head} Serie completa. ${rows}.`;
}

export function KpiSpark({ label, points, format, unit }: KpiSparkProps) {
  const reported = reportedPoints(points);
  const first = firstReported(points);
  const last = lastReported(points);

  if (!first || !last) return <span className="od-kpi__unit">sin reportar</span>;

  const values = reported.map((p) => p.value as number);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => (points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * (W - PAD * 2));
  const y = (v: number) => (hi === lo ? H / 2 : PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2));

  let d = "";
  let pen = false;
  points.forEach((p, i) => {
    if (p.value === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`;
    pen = true;
  });

  const firstIndex = points.indexOf(first);
  const lastIndex = points.indexOf(last);
  const single = first === last;

  return (
    <span className="od-spark">
      <svg className="od-spark__plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path className="od-spark__line" d={d} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) =>
          p.value === null ? null : <circle key={p.label} className="od-spark__dot" cx={x(i)} cy={y(p.value)} r={2} />,
        )}
        <circle className="od-spark__end" data-end="first" cx={x(firstIndex)} cy={y(first.value as number)} r={4} />
        {!single && <circle className="od-spark__end" data-end="last" cx={x(lastIndex)} cy={y(last.value as number)} r={4} />}
      </svg>

      <span className="od-spark__ends" aria-hidden="true">
        <span className="od-spark__end-label">
          <small>{single ? "Única cifra" : "Inicial"} · {first.label}</small>
          <b>{formatCompact(first.value, format)}</b>
        </span>
        {!single && (
          <span className="od-spark__end-label" data-end="last">
            <small>Final · {last.label}</small>
            <b>{formatCompact(last.value, format)}</b>
          </span>
        )}
      </span>

      <span className="sr-only">{sparkSummary(label, points, format, unit)}</span>
    </span>
  );
}
