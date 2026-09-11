/* =============================================================================
   Encuentra tu ruta.

   Dos preguntas y una respuesta armada con cuatro piezas, de la más personal a
   la más comprobable:

     1. El cruce perfil × interés — qué significa esto para quien pregunta.
     2. Qué pone en marcha el plan sobre ese tema, y con qué nombre.
     3. Los pilares que lo sostienen, con el avance que muestra el tablero.
     4. Los ODS a los que aportan esos pilares, deducidos de sus proyectos.

   Las dos primeras son redacción y viven en `content.ts`. Las dos últimas son
   datos: si mañana un proyecto declara un objetivo más, esta respuesta lo dice
   sin que nadie edite nada.

   Los botones son radios nativos vestidos de ficha: así el teclado ya sabe
   moverse con las flechas y el lector de pantalla anuncia "opción 2 de 5" sin
   que haya que programarlo.
   ========================================================================== */

import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { useProjects, usePillars } from "../../data/queries";
import { accentFor, sdgOfPillar } from "../../data/pdi";
import { prefetchProps } from "../../lib/prefetch";
import { SdgMarks } from "./SdgMarks";
import { routeInterests, routeMatrix, routeProfiles } from "./content";

export function RouteFinder() {
  const groupId = useId();
  const pillars = usePillars();
  const projects = useProjects();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [interestId, setInterestId] = useState<string | null>(null);

  const profile = routeProfiles.find((item) => item.id === profileId) ?? null;
  const interest = routeInterests.find((item) => item.id === interestId) ?? null;

  // Los slugs del contenido editorial se resuelven contra lo que la base
  // publica, en el orden en que el interés los prioriza. Un pilar sin publicar
  // simplemente no aparece: nunca se enlaza a una ficha que no existe.
  const suggested = useMemo(
    () =>
      interest
        ? interest.pillars
            .map((slug) => pillars.data?.find((pillar) => pillar.slug === slug))
            .filter((pillar): pillar is NonNullable<typeof pillar> => Boolean(pillar))
        : [],
    [interest, pillars.data],
  );

  // Los ODS de la respuesta son la unión de los que declaran los proyectos de
  // esos pilares. No hay tabla que los relacione: se deduce, igual que en /ods.
  const goals = useMemo(() => {
    const rows = projects.data ?? [];
    const union = new Set<number>();
    for (const pillar of suggested) {
      for (const id of sdgOfPillar(rows, pillar.id)) union.add(id);
    }
    return [...union].sort((a, b) => a - b);
  }, [projects.data, suggested]);

  const crossing = profile && interest ? routeMatrix[profile.id]?.[interest.id] : undefined;

  return (
    <section className="route-finder" id="tu-ruta" aria-labelledby="route-title">
      <div className="u-container">
        <div className="route-finder__shell card">
          <div className="section-heading">
            <span className="eyebrow">
              <Icon name="compass" size={14} /> Descubre tu ruta UDES
            </span>
            <h2 id="route-title">¿Qué parte del plan te toca a ti?</h2>
            <p>Dos preguntas y te mostramos las líneas del PDI diseñadas para lo que buscas.</p>
          </div>

          <fieldset className="route-finder__step">
            <legend>
              <span className="route-finder__number">1</span> ¿Quién eres?
            </legend>
            <div className="route-finder__options">
              {routeProfiles.map((item) => (
                <label className="route-chip" key={item.id}>
                  <input
                    type="radio"
                    name={`${groupId}-profile`}
                    value={item.id}
                    checked={profileId === item.id}
                    onChange={() => setProfileId(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="route-finder__step">
            <legend>
              <span className="route-finder__number">2</span> ¿Qué te interesa más?
            </legend>
            <div className="route-finder__options">
              {routeInterests.map((item) => (
                <label className="route-chip" key={item.id}>
                  <input
                    type="radio"
                    name={`${groupId}-interest`}
                    value={item.id}
                    checked={interestId === item.id}
                    onChange={() => setInterestId(item.id)}
                  />
                  <span>
                    <Icon name={item.icon} size={15} />
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* El resultado se anuncia solo: quien usa lector de pantalla no
              tiene por qué ir a buscarlo después de elegir. */}
          <div className="route-finder__result" role="status" aria-live="polite">
            {profile && interest ? (
              <div className="route-result" key={`${profile.id}-${interest.id}`}>
                <span className="eyebrow">
                  {profile.label} · {profile.lens}
                </span>

                {/* Lo primero es el cruce: es lo único de toda la respuesta que
                    solo aplica a quien acaba de elegir. */}
                {crossing && <p className="route-result__crossing">{crossing}</p>}

                <p className="route-result__answer">{interest.answer}</p>

                <div className="route-result__moves">
                  <span className="leap__tag">Lo que el plan pone en marcha</span>
                  <ul>
                    {interest.moves.map((move) => (
                      <li key={move}>{move}</li>
                    ))}
                  </ul>
                </div>

                {suggested.length > 0 && (
                  <div className="route-result__block">
                    <span className="leap__tag">Pilares que lo sostienen</span>
                    <ul className="route-result__pillars">
                      {suggested.map((pillar) => (
                        <li key={pillar.id}>
                          <Link
                            className="route-result__pillar"
                            to={`/implementacion/pilar/${pillar.slug}`}
                            style={{ "--accent": accentFor(pillar.accent_slot) } as React.CSSProperties}
                          >
                            <span className="route-result__pillar-icon">
                              <Icon name={pillar.icon} size={18} />
                            </span>
                            <span className="route-result__pillar-body">
                              <strong>{pillar.name}</strong>
                              <small>
                                {pillar.progress.progress}% de avance · {pillar.progress.done} de{" "}
                                {pillar.progress.total} indicadores
                              </small>
                            </span>
                            <span data-arrow aria-hidden="true">
                              →
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Solo si esos pilares tienen proyectos que declaren ODS. Un
                    bloque vacío diría "no aporta a ninguno", que no es lo mismo
                    que "todavía no se ha declarado". */}
                {goals.length > 0 && (
                  <div className="route-result__block">
                    <span className="leap__tag">Y a qué ODS aporta</span>
                    <SdgMarks
                      goals={goals}
                      named
                      label={`Objetivos de Desarrollo Sostenible a los que aportan los pilares de esta ruta`}
                    />
                  </div>
                )}

                <Link className="button-primary" to={profile.cta.to} {...prefetchProps(profile.cta.to)}>
                  {profile.cta.label} <span data-arrow aria-hidden="true">→</span>
                </Link>
              </div>
            ) : (
              <p className="route-finder__hint">
                {profileId || interestId
                  ? "Falta una respuesta para armar tu ruta."
                  : "Elige un perfil y un interés para ver tu ruta."}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
