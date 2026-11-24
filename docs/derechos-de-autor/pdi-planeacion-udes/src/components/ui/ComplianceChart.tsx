/* =============================================================================
   Gráfica de cumplimiento por año.

   La lectura visual de las mismas filas que ya salen en las tablas del tablero:
   una fila por entidad —pilar, área, línea, proyecto o indicador— y dentro de
   ella una barra por cada año del plan, 2024 a 2028.

   Decisiones que conviene no deshacer sin pensarlo:

   · **Barras horizontales agrupadas.** Los nombres del PDI son largos ("Municipios
     con brechas identificadas"); en columnas verticales habría que girarlos o
     recortarlos. En horizontal el nombre se lee de corrido a la izquierda.

   · **El color es la banda de cumplimiento, no el año.** Es la misma convención
     que gobierna toda la pantalla —`complianceBands`—, de modo que un verde
     aquí significa exactamente lo que significa en la tabla de al lado. El año
     no necesita color: lo dice su rótulo y su posición fija dentro del grupo.
     Pintar el año de un color y el cumplimiento de otro obligaría a leer dos
     escalas a la vez.

   · **Ninguna cifra depende del color.** Cada barra lleva su porcentaje escrito
     al extremo y el nombre de su banda en el rótulo emergente; la leyenda de
     bandas está siempre presente. La escala naranja→verde no es separable bajo
     daltonismo, así que el color es refuerzo y nunca el dato.

   · **Un año sin reportar se dibuja vacío, con un guion.** Un cero diría "no se
     cumplió" donde solo hay silencio, que es la misma regla que sigue la
     cascada anual en la base de datos.

   · **La escala llega al 100 % como mínimo.** Un indicador puede superar su
     meta; cuando alguno pasa del 100 %, el eje se estira hasta él y el 100 %
     se marca como línea de referencia, en vez de recortar la barra y mentir.

   Se dibuja con rejilla y bloques de CSS, no con SVG ni con una librería de
   gráficas: el portal no carga ninguna, los nombres largos fluyen solos y los
   colores salen de los tokens, así que el tema oscuro no necesita una paleta
   aparte.
   ========================================================================== */

import { useState } from "react";
import { bandFor, complianceBands } from "../../data/pdi";
import type { YearStop } from "../../data/pdi";

export interface ChartSeries {
  key: string;
  /** Nombre de la fila: el mismo que lleva en la tabla. */
  label: string;
  /** Ubicación de la fila (área › línea), cuando ayuda a distinguirla. */
  detail?: string;
  /** Un punto por año del horizonte; `progress` nulo = año sin reportar. */
  points: YearStop[];
}

interface ComplianceChartProps {
  series: ChartSeries[];
  /** Descripción de lo que se está comparando; va bajo la gráfica. */
  caption: string;
  /** Qué decir cuando ninguna fila tiene serie anual. */
  empty?: string;
}

interface Hover {
  key: string;
  year: number;
}

/** Extremo derecho de la escala: el 100 %, o el pico si alguien lo superó. */
function domainFor(series: ChartSeries[]): number {
  const peak = Math.max(
    100,
    ...series.flatMap((row) => row.points.map((point) => point.progress ?? 0)),
  );
  return Math.ceil(peak / 10) * 10;
}

export function ComplianceChart({ series, caption, empty }: ComplianceChartProps) {
  const [hover, setHover] = useState<Hover | null>(null);

  const visible = series.filter((row) => row.points.some((point) => point.progress !== null));

  if (visible.length === 0) {
    return <p className="scorecard-empty">{empty ?? "Todavía no hay cumplimiento reportado por año."}</p>;
  }

  const domain = domainFor(visible);
  // Cifras redondas y siempre el 100 %: es la meta, y cuando la escala se
  // estira por encima queda como línea de referencia en vez de como borde.
  const ticks = domain === 100 ? [0, 25, 50, 75, 100] : [0, 50, 100, domain];

  return (
    <figure className="compliance-chart">
      {/* Eje: los valores ya van escritos en cada barra, así que la escala se
          queda en cuatro marcas discretas que solo sitúan la vista. */}
      <div className="compliance-chart__scale" aria-hidden="true">
        <span className="compliance-chart__scale-spacer" />
        <span className="compliance-chart__scale-track">
          {ticks.map((tick) => (
            <span
              key={tick}
              className={`compliance-chart__tick${tick === 100 ? " is-goal" : ""}`}
              style={{ left: `${(tick / domain) * 100}%` }}
            >
              {tick} %
            </span>
          ))}
        </span>
      </div>

      <ul className="compliance-chart__rows">
        {visible.map((row) => (
          <li className="compliance-chart__row" key={row.key}>
            <div className="compliance-chart__name">
              <strong>{row.label}</strong>
              {row.detail && <small>{row.detail}</small>}
            </div>

            <div className="compliance-chart__plot">
              <span className="compliance-chart__grid" aria-hidden="true">
                {ticks.map((tick) => (
                  <span
                    key={tick}
                    className={`compliance-chart__rule${tick === 100 ? " is-goal" : ""}`}
                    style={{ left: `${(tick / domain) * 100}%` }}
                  />
                ))}
              </span>

              <ul className="compliance-chart__bars">
                {row.points.map((point) => {
                  const value = point.progress;
                  const band = value === null ? null : bandFor(value);
                  const share = value === null ? 0 : Math.min(100, (value / domain) * 100);
                  const active = hover?.key === row.key && hover.year === point.year;

                  return (
                    <li
                      className={`compliance-chart__bar${value === null ? " is-empty" : ""}`}
                      key={point.year}
                      onPointerEnter={() => setHover({ key: row.key, year: point.year })}
                      onPointerLeave={() => setHover(null)}
                    >
                      <span className="compliance-chart__year">{point.year}</span>

                      <span className="compliance-chart__track">
                        {value !== null && band && (
                          <span
                            className="compliance-chart__fill"
                            style={{ width: `${share}%`, background: band.color }}
                          />
                        )}
                        <span className="compliance-chart__value" style={{ left: `${share}%` }}>
                          {value === null ? (
                            <>
                              <span aria-hidden="true">—</span>
                              <span className="sr-only">
                                {point.year}: sin reportar
                              </span>
                            </>
                          ) : (
                            `${value} %`
                          )}
                        </span>

                        {/* El rótulo emergente no guarda ningún dato en
                            exclusiva: añade el nombre de la banda y repite el
                            de la fila, que en pantallas estrechas se corta. */}
                        {active && (
                          <span className="compliance-chart__tip" role="presentation">
                            <strong>{row.label}</strong>
                            <span>
                              {point.year} ·{" "}
                              {value === null ? "sin reportar" : `${value} % · ${band?.label}`}
                            </span>
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        ))}
      </ul>

      {/* La leyenda va siempre: es lo que hace que el color signifique algo sin
          tener que recordar los umbrales. */}
      <ul className="compliance-chart__legend">
        {complianceBands.map((band) => (
          <li key={band.id}>
            <span
              className="compliance-chart__swatch"
              style={{ background: band.color }}
              aria-hidden="true"
            />
            {band.label}
            <small>
              {band.from}–{band.to} %
            </small>
          </li>
        ))}
      </ul>

      <figcaption>{caption}</figcaption>
    </figure>
  );
}
