/* =============================================================================
   Encuentra tu ruta.

   Dos preguntas y una respuesta. Los botones son radios nativos vestidos de
   ficha: así el teclado ya sabe moverse entre las opciones con las flechas y
   los lectores de pantalla anuncian "opción 2 de 5" sin que haya que
   programarlo.

   El resultado no es un texto suelto: los pilares que recomienda son los del
   plan, con el avance que muestra el tablero. Si un pilar todavía no está
   publicado, simplemente no aparece — nunca se enlaza a una ficha que no existe.
   ========================================================================== */

import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { usePillars } from "../../data/queries";
import { accentFor } from "../../data/pdi";
import { prefetchProps } from "../../lib/prefetch";
import { routeInterests, routeProfiles } from "./content";

export function RouteFinder() {
  const groupId = useId();
  const pillars = usePillars();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [interestId, setInterestId] = useState<string | null>(null);

  const profile = routeProfiles.find((item) => item.id === profileId) ?? null;
  const interest = routeInterests.find((item) => item.id === interestId) ?? null;

  // Los slugs del contenido editorial se resuelven contra lo que la base
  // publica, en el orden en que el interés los prioriza.
  const suggested = interest
    ? interest.pillars
        .map((slug) => pillars.data?.find((pillar) => pillar.slug === slug))
        .filter((pillar): pillar is NonNullable<typeof pillar> => Boolean(pillar))
    : [];

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
                <p className="route-result__answer">{interest.answer}</p>

                {suggested.length > 0 && (
                  <>
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
                  </>
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
