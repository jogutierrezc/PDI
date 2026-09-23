/* =============================================================================
   Impacto Institucional · una unidad.

   La cadena de valor de una vicerrectoría, una facultad, un programa o un
   campus: el río con lo que la unidad reporta y, debajo, una corriente por
   función con sus cuatro estaciones. Lo que tiene cifra es una piedra llena
   que abre su ficha; lo que no, una piedra hueca que dice por qué no la tiene.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { FUNCTIONS, LEVELS } from "../data/catalog";
import { INSTITUTION, LENSES, entitiesOf, resolveScope, statsFor } from "../data/lens";
import type { LensKind } from "../data/lens";
import type { FunctionId } from "../data/types";
import { ImpactLayout } from "./ImpactLayout";
import { IllustrativeNote, IndicatorPebble, riverCounts } from "./shared";
import { ValueRiver } from "./ValueRiver";

export function ImpactUnit({ institution = false }: { institution?: boolean }) {
  const { lente, slug } = useParams();
  const scope = institution ? INSTITUTION : resolveScope(lente, slug);
  const stats = useMemo(() => (scope ? statsFor(scope) : []), [scope]);
  const counts = useMemo(() => riverCounts(stats), [stats]);
  const [only, setOnly] = useState<FunctionId | null>(null);
  // Lo sencillo primero: se ven las cifras; lo que aún no se reporta, a un clic.
  const [withData, setWithData] = useState(true);

  if (!scope) {
    return (
      <ImpactLayout title="Unidad no encontrada">
        <div className="u-container imp-missing">
          <h1>No encontramos esa unidad</h1>
          <p>Puede que el enlace esté incompleto. Vuelva a la portada y elija una vicerrectoría, facultad, programa o campus.</p>
          <Link className="button-primary" to="/impacto">
            Ir a Impacto Institucional
          </Link>
        </div>
      </ImpactLayout>
    );
  }

  const lens = LENSES.find((l) => l.kind === scope.kind);
  const siblings = scope.kind === "institucion" ? [] : entitiesOf(scope.kind as LensKind);
  const functions = FUNCTIONS.filter((f) => scope.functions.includes(f.id) && (!only || only === f.id));
  const reported = stats.filter((s) => s.current).length;

  return (
    <ImpactLayout title={scope.name}>
      <section className="imp-unit-head">
        <div className="u-container">
          <Link className="imp-back" to="/impacto">
            <Icon name="arrow-left" size={14} />
            Impacto Institucional
          </Link>

          <div className="imp-unit-head__grid">
            <div>
              <h1>{scope.name}</h1>
              <p className="imp-lede">
                {lens?.name ?? "Institución"} · {scope.detail}. {reported} de {stats.length} indicadores con cifra en el último periodo reportado.
              </p>
              {scope.sitesOnly && (
                <p className="imp-hero__fine">
                  En un campus solo se ven los indicadores que se reportan por sede; los que se reportan por programa no se
                  reparten entre sedes.
                </p>
              )}
            </div>
            <ValueRiver counts={counts} functions={scope.functions} selected={only} onSelect={setOnly} compact />
          </div>

          {siblings.length > 1 && (
            <nav className="imp-siblings" aria-label={`Otras ${lens?.plural.toLowerCase()}`}>
              {siblings.map((s) => (
                <Link key={s.slug} to={`/impacto/${scope.kind}/${s.slug}`} aria-current={s.slug === scope.slug ? "page" : undefined}>
                  {s.name}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </section>

      <div className="u-container imp-toolbar">
        {scope.functions.length > 1 && (
          <div className="imp-chips" role="group" aria-label="Función sustantiva">
            <button type="button" aria-pressed={only === null} onClick={() => setOnly(null)}>
              Las tres
            </button>
            {FUNCTIONS.map((f) => (
              <button
                key={f.id}
                type="button"
                style={{ "--tone": f.tone } as CSSProperties}
                aria-pressed={only === f.id}
                onClick={() => setOnly(only === f.id ? null : f.id)}
              >
                <i aria-hidden="true" />
                {f.name}
              </button>
            ))}
          </div>
        )}
        <label className="imp-switch">
          <input type="checkbox" checked={!withData} onChange={(e) => setWithData(!e.target.checked)} />
          Mostrar también los {stats.length - reported} que aún no tienen cifra
        </label>
      </div>

      {functions.map((f) => {
        const own = stats.filter((s) => s.indicator.funcion === f.id && (!withData || s.current));
        return (
          <section key={f.id} className="imp-stream" style={{ "--tone": f.tone } as CSSProperties} aria-labelledby={`corriente-${f.id}`}>
            <div className="u-container">
              <header className="imp-stream__head">
                <h2 id={`corriente-${f.id}`}>{f.name}</h2>
                <p>
                  {f.vice} · {own.filter((s) => s.current).length} con cifra de {stats.filter((s) => s.indicator.funcion === f.id).length}
                </p>
              </header>
              <div className="imp-stream__levels">
                {LEVELS.map((level) => {
                  const items = own.filter((s) => s.indicator.nivel === level.id);
                  return (
                    <div key={level.id} className="imp-level">
                      <h3>
                        {level.name}
                        <small>{level.hint}</small>
                      </h3>
                      {items.length === 0 ? (
                        <p className="imp-level__empty">{withData ? "Nada con cifra en esta estación." : "Sin indicadores en esta estación."}</p>
                      ) : (
                        <ul>
                          {items.map((s) => (
                            <IndicatorPebble key={s.indicator.codigo} stat={s} scope={scope} />
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}

      <div className="u-container imp-closing">
        <IllustrativeNote />
      </div>
    </ImpactLayout>
  );
}
