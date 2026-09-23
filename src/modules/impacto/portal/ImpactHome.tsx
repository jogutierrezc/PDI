/* =============================================================================
   Impacto Institucional · portada.

   1. El río: tres funciones sustantivas cruzando las cuatro estaciones de la
      cadena de valor, con el conteo de la matriz vr7.
   2. Las lentes: vicerrectorías, facultades, programas y campus. Cada una es
      una piedra que lleva a su propia cadena de valor.
   3. Cómo se lee una cifra: la razón de sumas, con una cifra de verdad del
      prototipo en lugar de una explicación abstracta.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { FACULTIES, FUNCTIONS, INDICATORS, indicatorByCode } from "../data/catalog";
import { INSTITUTION, LENSES, entitiesOf, formatValue, resolveScope, statFor, statsFor } from "../data/lens";
import type { LensKind } from "../data/lens";
import { ImpactLayout } from "./ImpactLayout";
import { IllustrativeNote, pebbleShape, riverCounts } from "./shared";
import { ValueRiver } from "./ValueRiver";

/** La cifra con la que se explica la razón de sumas. */
const EXAMPLE = "E04";

export function ImpactHome() {
  const stats = useMemo(() => statsFor(INSTITUTION), []);
  const counts = useMemo(() => riverCounts(stats), [stats]);
  const [lens, setLens] = useState<LensKind>("facultad");
  const official = INDICATORS.filter((i) => i.estado === "oficial").length;

  return (
    <ImpactLayout title="Portada">
      <section className="imp-hero">
        <div className="u-container imp-hero__grid">
          <div className="imp-hero__copy">
            <h1>Impacto Institucional</h1>
            <p className="imp-lede">
              Cómo la investigación, la enseñanza y la extensión convierten lo que la universidad tiene en cambios que
              se pueden medir. {INDICATORS.length} indicadores, de los insumos al impacto real.
            </p>
            <ul className="imp-hero__functions">
              {FUNCTIONS.map((f) => (
                <li key={f.id} style={{ "--tone": f.tone } as CSSProperties}>
                  <Link to={`/impacto/vicerrectoria/${f.id}`}>
                    <strong>{stats.filter((s) => s.indicator.funcion === f.id).length}</strong>
                    <span>{f.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="imp-hero__fine">
              {official} oficiales y {INDICATORS.length - official} sugeridos en el catálogo. Los sugeridos se ven, pero
              no se reportan hasta que el catálogo los adopte.
            </p>
            <div className="imp-hero__actions">
              <Link className="button-primary" to="/impacto/institucion">
                Ver toda la universidad
                <Icon name="arrow-right" size={16} />
              </Link>
              <a className="button-ghost" href="#lentes">
                Elegir una unidad
              </a>
            </div>
          </div>
          <ValueRiver counts={counts} />
        </div>
      </section>

      <section className="imp-lenses" id="lentes" aria-labelledby="lentes-titulo">
        <div className="u-container">
          <div className="imp-section-head">
            <h2 id="lentes-titulo">Mirar por unidad</h2>
            <p>Cada unidad tiene su propia cadena de valor, calculada con lo que reportan sus programas.</p>
          </div>

          <div className="imp-tabs" role="tablist" aria-label="Tipo de unidad">
            {LENSES.map((l) => (
              <button
                key={l.kind}
                type="button"
                role="tab"
                id={`lente-${l.kind}`}
                aria-selected={lens === l.kind}
                aria-controls="lente-panel"
                onClick={() => setLens(l.kind)}
              >
                {l.plural}
                <span>{entitiesOf(l.kind).length}</span>
              </button>
            ))}
          </div>

          <ul className="imp-stones" id="lente-panel" role="tabpanel" aria-labelledby={`lente-${lens}`}>
            {entitiesOf(lens).map((entity) => {
              const scope = resolveScope(lens, entity.slug)!;
              const withData = statsFor(scope).filter((s) => s.current).length;
              const tone = lens === "vicerrectoria" ? FUNCTIONS.find((f) => f.id === entity.slug)?.tone : undefined;
              return (
                <li key={entity.slug}>
                  <Link
                    to={`/impacto/${lens}/${entity.slug}`}
                    className="imp-stone"
                    style={{ "--shape": pebbleShape(entity.slug), ...(tone ? { "--tone": tone } : {}) } as CSSProperties}
                  >
                    <span className="imp-stone__detail">{entity.detail}</span>
                    <strong>{entity.name}</strong>
                    <span className="imp-stone__count">
                      {withData} {withData === 1 ? "indicador con cifra" : "indicadores con cifra"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <ReadingGuide />

      <div className="u-container imp-closing">
        <IllustrativeNote />
      </div>
    </ImpactLayout>
  );
}

/** La razón de sumas explicada con una cifra que se puede comprobar. */
function ReadingGuide() {
  const indicator = indicatorByCode.get(EXAMPLE)!;
  const whole = statFor(indicator, INSTITUTION);
  const parts = FACULTIES.map((f) => ({ faculty: f, stat: statFor(indicator, resolveScope("facultad", f.slug)!) }))
    .filter((p) => p.stat.current)
    .slice(0, 4);
  if (!whole.current) return null;
  const average = parts.reduce((t, p) => t + (p.stat.current?.valor ?? 0), 0) / parts.length;
  const num = parts.reduce((t, p) => t + (p.stat.current?.numerador ?? 0), 0);
  const den = parts.reduce((t, p) => t + (p.stat.current?.denominador ?? 0), 0);
  const factor = indicator.ficha?.factor ?? 1;

  return (
    <section className="imp-reading" aria-labelledby="lectura-titulo">
      <div className="u-container imp-reading__grid">
        <div>
          <h2 id="lectura-titulo">Una cifra de facultad no es un promedio</h2>
          <p>
            La {indicator.nombre.toLowerCase()} de una facultad suma los estudiantes que siguen de todos sus programas y
            los divide entre todos los que estaban. Así un programa de 900 estudiantes pesa lo que le corresponde frente
            a uno de 40.
          </p>
          <p>
            Por eso cada cifra del portal muestra su numerador y su denominador, y ningún porcentaje se guarda sin
            ellos.
          </p>
          <Link className="imp-link" to={`/impacto/indicador/${EXAMPLE}`}>
            Ver la ficha de {indicator.codigo}
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>

        <div className="imp-sum" aria-label={`Ejemplo con ${indicator.nombre}`}>
          <table>
            <caption>
              {indicator.nombre} · {whole.period}
            </caption>
            <thead>
              <tr>
                <th scope="col">Facultad</th>
                <th scope="col">Siguen</th>
                <th scope="col">Estaban</th>
                <th scope="col">Tasa</th>
              </tr>
            </thead>
            <tbody>
              {parts.map(({ faculty, stat }) => (
                <tr key={faculty.slug}>
                  <th scope="row">{faculty.code}</th>
                  <td>{stat.current!.numerador!.toLocaleString("es-CO")}</td>
                  <td>{stat.current!.denominador!.toLocaleString("es-CO")}</td>
                  <td>{formatValue(indicator, stat.current!.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl>
            <div>
              <dt>Las cuatro juntas, razón de sumas</dt>
              <dd>
                {num.toLocaleString("es-CO")} ÷ {den.toLocaleString("es-CO")} ={" "}
                <strong>{formatValue(indicator, (num / den) * factor)}</strong>
              </dd>
            </div>
            <div className="imp-sum__wrong">
              <dt>Promedio de las tasas de estas cuatro (lo que no se hace)</dt>
              <dd>
                <s>{formatValue(indicator, average)}</s>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
