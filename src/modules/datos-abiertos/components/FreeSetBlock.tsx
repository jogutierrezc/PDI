/* =============================================================================
   Conjunto libre en la ficha.

   Una fuente con sus gráficas. Arriba, el título, lo que muestra y cómo se
   lee en el tiempo: "Dato sin fecha", "Periodo 2020–2025" o, en una fuente
   anual, el selector de año (las líneas y áreas recorren todos los años y no
   lo usan). Debajo, cada vista en su panel del tablero; las pequeñas
   (circular, dona, radar, histograma, caja, cifras) se emparejan en dos
   columnas y las anchas ocupan la fila.

   Una vista incompleta (le falta una columna) no se publica: la intranet lo
   avisa al armarla.

   Debajo de las gráficas, plegada, la tabla de origen: las filas tal como se
   cargaron. Sale una vez por conjunto (la ficha la pide en su último bloque)
   y no si el conjunto ya tiene su propia vista de tabla.
   ========================================================================== */

import { useState } from "react";
import { CHART_TYPES, freeYears, viewProblems } from "../data/free-sets";
import type { FreeChartType, FreeSet, FreeView } from "../data/free-sets";
import { ChartFrame } from "./ChartFrame";
import { FreeChart, hasOwnFrame } from "./free/FreeCharts";
import "./free-sets.css";

const NARROW: FreeChartType[] = ["circular", "dona", "radar", "histograma", "caja", "cifras"];
// Las barras comparadas necesitan la serie entera: con las filas de un
// solo año no hay dos periodos que poner al lado.
const USES_ALL_YEARS: FreeChartType[] = ["lineas", "area", "gantt", "barras_comparadas", "barras_linea"];

export function temporalityText(set: FreeSet, year: number | null) {
  if (set.temporality === "periodo") return set.periodLabel ? `Periodo ${set.periodLabel}` : "Dato del periodo";
  if (set.temporality === "sin_tiempo") return "Dato sin fecha";
  return year === null ? "Todos los años" : `Año ${year}`;
}

/** La tabla de origen: una vista de tabla que no se guarda, armada al vuelo. */
const SOURCE_VIEW: FreeView = { key: "__origen", title: "Datos de origen", type: "tabla" };

export function FreeSetBlock({
  set,
  viewKey,
  exclude = [],
  withSource = false,
  title,
  anchor,
}: {
  set: FreeSet;
  viewKey?: string;
  /** Vistas que tienen su propio bloque en la ficha: aquí no se repiten. */
  exclude?: string[];
  /** Pone la tabla de origen, plegada, debajo de las gráficas. */
  withSource?: boolean;
  title?: string;
  anchor: string;
}) {
  const years = freeYears(set);
  const [year, setYear] = useState<number | null>(years.length ? years[years.length - 1] : null);
  const views = set.views.filter((v) => (viewKey ? v.key === viewKey : !exclude.includes(v.key)) && viewProblems(set, v).length === 0);
  if (!views.length || !set.rows.length) return null;
  const usesYear = set.temporality === "anual" && views.some((v) => !USES_ALL_YEARS.includes(v.type));
  const showSource = withSource && !set.views.some((v) => v.type === "tabla" && viewProblems(set, v).length === 0);

  return (
    <section className="od-section od-free" aria-labelledby={anchor}>
      <div className="u-container">
        <header className="od-section__head od-section__head--split">
          <div>
            <h2 id={anchor}>{title || (viewKey && views.length === 1 ? views[0].title : set.title)}</h2>
            {set.description && <p>{set.description}</p>}
          </div>
          <div className="od-free__when">
            {usesYear ? (
              <label className="od-select">
                <span>Año</span>
                <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))}>
                  {[...years].reverse().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="od-free__stamp">{temporalityText(set, null)}</span>
            )}
          </div>
        </header>

        <div className="od-free__grid">
          {views.map((view) => (
            <FreeViewPanel key={view.key} set={set} view={view} year={set.temporality === "anual" && !USES_ALL_YEARS.includes(view.type) ? year : null} />
          ))}
        </div>

        {showSource && (
          <details className="od-free__source">
            <summary>
              Ver datos de origen
              <small>{usesYear && year !== null ? ` · año ${year}` : ` · ${set.rows.length} ${set.rows.length === 1 ? "fila" : "filas"}`}</small>
            </summary>
            <FreeChart set={set} view={{ ...SOURCE_VIEW, title: `${set.title} · datos de origen` }} year={usesYear ? year : null} />
            {set.source && <p className="od-free__source-note">Fuente: {set.source}</p>}
          </details>
        )}
      </div>
    </section>
  );
}

function FreeViewPanel({ set, view, year }: { set: FreeSet; view: FreeView; year: number | null }) {
  const span = NARROW.includes(view.type) ? "half" : "full";
  if (hasOwnFrame(view)) {
    return (
      <div className="od-free__cell" data-span={span}>
        <FreeChart set={set} view={view} year={year} />
      </div>
    );
  }
  const when = set.temporality === "anual" && USES_ALL_YEARS.includes(view.type) ? "Todos los años" : temporalityText(set, year);
  return (
    <div className="od-free__cell" data-span={span}>
      <ChartFrame
        title={view.title}
        subtitle={[CHART_TYPES[view.type].label, when, view.description].filter(Boolean).join(" · ")}
        source={set.source}
        exportName={`${set.title}-${view.title}`}
      >
        <FreeChart set={set} view={view} year={year} />
      </ChartFrame>
    </div>
  );
}
