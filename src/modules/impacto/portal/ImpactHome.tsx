/* =============================================================================
   Impacto Institucional · portada.

   1. El río: tres funciones sustantivas cruzando las cuatro estaciones de la
      cadena de valor, con el conteo de la matriz vr7.
   2. Las lentes: vicerrectorías, facultades, programas y campus. Cada una es
      una piedra que lleva a su propia cadena de valor.
   3. Cómo se lee una cifra: la razón de sumas, con una cifra validada en
      lugar de una explicación abstracta. Si aún no hay una que sirva de
      ejemplo, la sección no se muestra.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { FUNCTIONS } from "../data/catalog";
import { INSTITUTION, LENSES, entitiesOf, formatValue, resolveScope, statFor, statsFor } from "../data/lens";
import type { IndicatorStat, LensKind, PortalData, PortalFaculty } from "../data/lens";
import { ImpactLayout } from "./ImpactLayout";
import { PortalGate } from "./PortalGate";
import { SourceNote, pebbleShape, riverCounts } from "./shared";
import { ValueRiver } from "./ValueRiver";

/** La cifra con la que se explica la razón de sumas, si tiene con qué. */
const PREFERRED_EXAMPLE = "E04";

export function ImpactHome() {
  return <PortalGate title="Portada">{(data) => <Home data={data} />}</PortalGate>;
}

function Home({ data }: { data: PortalData }) {
  const stats = useMemo(() => statsFor(data, INSTITUTION), [data]);
  const counts = useMemo(() => riverCounts(stats), [stats]);
  const [lens, setLens] = useState<LensKind>("facultad");
  const entities = entitiesOf(data, lens);
  const total = data.indicators.length;
  const official = data.indicators.filter((i) => i.estado === "oficial").length;

  return (
    <ImpactLayout title="Portada">
      <section className="imp-hero">
        <div className="u-container imp-hero__grid">
          <div className="imp-hero__copy">
            <h1>Impacto Institucional</h1>
            <p className="imp-lede">
              Cómo la investigación, la enseñanza y la extensión convierten lo que la universidad tiene en cambios que
              se pueden medir. {total} indicadores, de los insumos al impacto real.
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
              {official} oficiales y {total - official} sugeridos en el catálogo. Los sugeridos se ven, pero
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
                <span>{entitiesOf(data, l.kind).length}</span>
              </button>
            ))}
          </div>

          {entities.length === 0 ? (
            <p className="imp-level__empty" id="lente-panel" role="tabpanel" aria-labelledby={`lente-${lens}`}>
              Aún no hay {LENSES.find((l) => l.kind === lens)?.plural.toLowerCase()} con programas en la estructura de Impacto.
            </p>
          ) : (
            <ul className="imp-stones" id="lente-panel" role="tabpanel" aria-labelledby={`lente-${lens}`}>
              {entities.map((entity) => {
                const scope = resolveScope(data, lens, entity.slug)!;
                const withData = statsFor(data, scope).filter((s) => s.current).length;
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
          )}
        </div>
      </section>

      <ReadingGuide data={data} />

      <div className="u-container imp-closing">
        <SourceNote data={data} />
      </div>
    </ImpactLayout>
  );
}

/** Una razón de sumas con cifra institucional y al menos dos facultades con cifra, prefiriendo E04. */
function pickExample(data: PortalData) {
  const candidates = data.indicators
    .filter((i) => i.ficha?.agregacion === "razon_de_sumas")
    .sort((a, b) => Number(b.codigo === PREFERRED_EXAMPLE) - Number(a.codigo === PREFERRED_EXAMPLE));
  for (const indicator of candidates) {
    const whole = statFor(data, indicator, INSTITUTION);
    if (!whole.current) continue;
    const parts: { faculty: PortalFaculty; stat: IndicatorStat }[] = data.faculties
      .map((faculty) => ({ faculty, stat: statFor(data, indicator, resolveScope(data, "facultad", faculty.slug)!) }))
      .filter((p) => Boolean(p.stat.current?.denominador))
      .slice(0, 4);
    if (parts.length >= 2) return { indicator, whole, parts };
  }
  return null;
}

/** La razón de sumas explicada con una cifra que se puede comprobar. */
function ReadingGuide({ data }: { data: PortalData }) {
  const example = useMemo(() => pickExample(data), [data]);
  if (!example) return null;
  const { indicator, whole, parts } = example;
  const average = parts.reduce((t, p) => t + (p.stat.current?.valor ?? 0), 0) / parts.length;
  const num = parts.reduce((t, p) => t + (p.stat.current?.numerador ?? 0), 0);
  const den = parts.reduce((t, p) => t + (p.stat.current?.denominador ?? 0), 0);
  const factor = indicator.ficha?.factor ?? 1;
  const together = ["Las dos juntas", "Las tres juntas", "Las cuatro juntas"][parts.length - 2];

  return (
    <section className="imp-reading" aria-labelledby="lectura-titulo">
      <div className="u-container imp-reading__grid">
        <div>
          <h2 id="lectura-titulo">Una cifra de facultad no es un promedio</h2>
          <p>
            La cifra de una facultad en «{indicator.nombre}» suma los numeradores de todos sus programas y los divide
            entre la suma de sus denominadores. Así un programa de 900 estudiantes pesa lo que le corresponde frente a
            uno de 40.
          </p>
          <p>
            Por eso cada cifra del portal muestra su numerador y su denominador, y ningún porcentaje se guarda sin
            ellos.
          </p>
          <Link className="imp-link" to={`/impacto/indicador/${indicator.codigo}`}>
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
                <th scope="col">Numerador</th>
                <th scope="col">Denominador</th>
                <th scope="col">Valor</th>
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
              <dt>{together}, razón de sumas</dt>
              <dd>
                {num.toLocaleString("es-CO")} ÷ {den.toLocaleString("es-CO")} ={" "}
                <strong>{formatValue(indicator, (num / den) * factor)}</strong>
              </dd>
            </div>
            <div className="imp-sum__wrong">
              <dt>Promedio de los valores de estas {parts.length} (lo que no se hace)</dt>
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
