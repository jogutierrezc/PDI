/* =============================================================================
   Impacto Institucional · ficha de un indicador.

   La cifra con su cuenta a la vista (numerador ÷ denominador × factor), su
   evolución por periodo, en qué se reparte según la lente desde la que se
   llegó, y lo que dice la matriz: meta, línea base, fuente y alineación.
   ========================================================================== */

import type { CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { CALC_LABEL, LEVELS, MODE_LABEL, functionById, indicatorByCode } from "../data/catalog";
import { GAP_LABEL, INSTITUTION, breakdownFor, formatValue, resolveScope, statFor, unitLabel } from "../data/lens";
import type { IndicatorStat } from "../data/lens";
import { ImpactLayout } from "./ImpactLayout";
import { Change, IllustrativeNote } from "./shared";

const AGG_TEXT = {
  suma: "Suma de lo que reporta cada programa.",
  razon_de_sumas: "Razón de sumas: Σ numeradores ÷ Σ denominadores. Nunca el promedio de los porcentajes.",
  promedio_ponderado: "Promedio ponderado por el número de evaluados o de respuestas.",
  no_agregable: "No se consolida: cada programa se lee por separado.",
} as const;

export function ImpactIndicator() {
  const { codigo } = useParams();
  const [params] = useSearchParams();
  const indicator = codigo ? indicatorByCode.get(codigo.toUpperCase()) : undefined;
  const [kind, slug] = (params.get("en") ?? "").split(":");
  const scope = (kind && slug ? resolveScope(kind, slug) : INSTITUTION) ?? INSTITUTION;

  if (!indicator) {
    return (
      <ImpactLayout title="Indicador no encontrado">
        <div className="u-container imp-missing">
          <h1>No encontramos ese indicador</h1>
          <p>Los códigos van de I01 a I37, de E01 a E27 y de X01 a X42.</p>
          <Link className="button-primary" to="/impacto">
            Ir a Impacto Institucional
          </Link>
        </div>
      </ImpactLayout>
    );
  }

  const fn = functionById[indicator.funcion];
  const sheet = indicator.ficha;
  const stat = statFor(indicator, scope);
  const back = scope.kind === "institucion" ? "/impacto/institucion" : `/impacto/${scope.kind}/${scope.slug}`;
  const level = LEVELS.find((l) => l.id === indicator.nivel)!;
  const parts = breakdownFor(indicator, scope).filter((p) => p.stat.current);

  return (
    <ImpactLayout title={`${indicator.codigo} · ${indicator.nombre}`}>
      <article className="imp-sheet" style={{ "--tone": fn.tone } as CSSProperties}>
        <div className="u-container">
          <Link className="imp-back" to={back}>
            <Icon name="arrow-left" size={14} />
            {scope.name}
          </Link>

          <header className="imp-sheet__head">
            <h1>
              <span className="imp-code">{indicator.codigo}</span> {indicator.nombre}
            </h1>
            <p className="imp-sheet__path">
              {fn.name} · {level.name}
              {indicator.estado === "sugerido" && <span className="imp-tag">Sugerido</span>}
            </p>
            <p className="imp-lede">{indicator.descripcion}</p>
          </header>

          <div className="imp-sheet__grid">
            <section className="imp-figure" aria-labelledby="cifra">
              <h2 id="cifra" className="sr-only">
                Cifra
              </h2>
              {stat.current ? (
                <>
                  <p className="imp-figure__value">
                    <strong>{formatValue(indicator, stat.current.valor)}</strong>
                    <span>
                      {unitLabel(indicator)} · {stat.period} · {scope.name}
                    </span>
                  </p>
                  <Change stat={stat} />
                  <Formula stat={stat} />
                </>
              ) : (
                <p className="imp-figure__gap">
                  <strong>Sin cifra</strong>
                  <span>{stat.gap ? GAP_LABEL[stat.gap] : ""}. Un vacío no es un cero.</span>
                </p>
              )}
              <Series stat={stat} />
            </section>

            <aside className="imp-facts" aria-label="Lo que dice la matriz">
              <dl>
                <div>
                  <dt>Línea base 2023</dt>
                  <dd>{indicator.lineaBase || "—"}</dd>
                </div>
                <div>
                  <dt>Meta {indicator.meta.anio}</dt>
                  <dd>{indicator.meta.valor || "—"}</dd>
                </div>
                <div>
                  <dt>Meta 2028</dt>
                  <dd>{indicator.meta2028 || "—"}</dd>
                </div>
                <div>
                  <dt>Unidad en la matriz</dt>
                  <dd>{indicator.unidad || "—"}</dd>
                </div>
                <div>
                  <dt>Fuente</dt>
                  <dd>{indicator.fuente || "—"}</dd>
                </div>
                <div>
                  <dt>Responsable</dt>
                  <dd>{indicator.responsable || "—"}</dd>
                </div>
                {indicator.dimension && (
                  <div>
                    <dt>Dimensión</dt>
                    <dd>{indicator.dimension}</dd>
                  </div>
                )}
              </dl>
              <Alignment pillars={indicator.pilares} projects={indicator.proyectos} ods={indicator.ods} />
            </aside>
          </div>

          {sheet && (
            <section className="imp-how" aria-labelledby="como">
              <h2 id="como">Cómo se calcula</h2>
              <dl>
                <div>
                  <dt>{sheet.denominador ? "Numerador" : "Qué se cuenta"}</dt>
                  <dd>{sheet.numerador}</dd>
                </div>
                {sheet.denominador && (
                  <div>
                    <dt>Denominador</dt>
                    <dd>{sheet.denominador}</dd>
                  </div>
                )}
                <div>
                  <dt>Consolidación</dt>
                  <dd>{AGG_TEXT[sheet.agregacion]}</dd>
                </div>
                <div>
                  <dt>Tipo · captura · periodicidad</dt>
                  <dd>
                    {CALC_LABEL[sheet.tipo]} · {MODE_LABEL[sheet.modo]} · {sheet.periodicidad}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {parts.length > 0 && (
            <section className="imp-parts" aria-labelledby="reparto">
              <h2 id="reparto">En qué se reparte</h2>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Unidad</th>
                    {sheet?.denominador && <th scope="col">Numerador</th>}
                    {sheet?.denominador && <th scope="col">Denominador</th>}
                    <th scope="col">Valor</th>
                    <th scope="col">
                      <span className="sr-only">Proporción</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p) => {
                    const max = Math.max(...parts.map((x) => x.stat.current?.valor ?? 0));
                    const v = p.stat.current!.valor ?? 0;
                    return (
                      <tr key={p.label}>
                        <th scope="row">
                          <Link to={p.to}>{p.label}</Link>
                        </th>
                        {sheet?.denominador && <td>{p.stat.current!.numerador?.toLocaleString("es-CO")}</td>}
                        {sheet?.denominador && <td>{p.stat.current!.denominador?.toLocaleString("es-CO")}</td>}
                        <td>{formatValue(indicator, v)}</td>
                        <td className="imp-parts__bar" aria-hidden="true">
                          <i style={{ width: `${max ? (v / max) * 100 : 0}%` }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          <IllustrativeNote />
        </div>
      </article>
    </ImpactLayout>
  );
}

function Formula({ stat }: { stat: IndicatorStat }) {
  const sheet = stat.indicator.ficha;
  const c = stat.current;
  if (!sheet || !c) return null;
  if (c.numerador !== null && c.denominador !== null) {
    return (
      <p className="imp-formula">
        <span>{c.numerador.toLocaleString("es-CO")}</span> ÷ <span>{c.denominador.toLocaleString("es-CO")}</span>
        {sheet.factor === 100 && <> × 100</>} · {c.registros} {c.registros === 1 ? "registro" : "registros"}
      </p>
    );
  }
  if (c.n !== null) {
    return (
      <p className="imp-formula">
        Promedio de {c.registros} programas ponderado por {c.n.toLocaleString("es-CO")} evaluados
      </p>
    );
  }
  return <p className="imp-formula">Suma de {c.registros} {c.registros === 1 ? "registro" : "registros"}</p>;
}

/** Columnas rotuladas por periodo: el valor escrito, no solo la altura. */
function Series({ stat }: { stat: IndicatorStat }) {
  if (stat.series.length < 2) return null;
  const max = Math.max(...stat.series.map((s) => s.value.valor ?? 0));
  return (
    <figure className="imp-series">
      <figcaption>Por periodo</figcaption>
      <ol>
        {stat.series.map((s) => (
          <li key={s.period}>
            <span className="imp-series__value">{formatValue(stat.indicator, s.value.valor)}</span>
            <span className="imp-series__col" style={{ height: `${max ? ((s.value.valor ?? 0) / max) * 100 : 0}%` }} />
            <span className="imp-series__period">{s.period}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function Alignment({ pillars, projects, ods }: { pillars: number[]; projects: string[]; ods: number[] }) {
  if (!pillars.length && !projects.length && !ods.length) return null;
  return (
    <div className="imp-align">
      <p>Se alinea con</p>
      <ul>
        {pillars.map((p) => (
          <li key={`p${p}`} style={{ "--chip": `var(--pillar-${p})` } as CSSProperties}>
            Pilar {p}
          </li>
        ))}
        {projects.map((p) => (
          <li key={p}>Proyecto {p.slice(2)}</li>
        ))}
        {ods.map((o) => (
          <li key={`o${o}`}>ODS {o}</li>
        ))}
      </ul>
    </div>
  );
}
