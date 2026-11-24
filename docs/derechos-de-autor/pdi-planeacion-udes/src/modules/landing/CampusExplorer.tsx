/* =============================================================================
   Regionalización viva.

   Pestañas de verdad, no botones que parecen pestañas: una sola parada de
   tabulación para el grupo y flechas para moverse entre sedes, que es lo que
   espera quien navega con teclado.

   El panel se remonta con `key` al cambiar de sede para que la entrada se
   reproduzca; es una animación de 220 ms, corta y sin desplazamiento lateral,
   porque el contenido cambia entero y un movimiento largo se volvería una
   espera.
   ========================================================================== */

import { useRef, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { campuses } from "./content";

export function CampusExplorer() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (index: number) => {
    const next = (index + campuses.length) % campuses.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: campuses.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    focusTab(next);
  };

  const campus = campuses[active];

  return (
    <section className="campus" id="sedes" aria-labelledby="campus-title">
      <div className="u-container">
        <div className="section-heading">
          <span className="eyebrow">Regionalización viva</span>
          <h2 id="campus-title">Tres sedes, tres vocaciones productivas</h2>
          <p>
            El plan no se aplica igual en todo el territorio: cada sede responde a la economía real
            de su región.
          </p>
        </div>

        <div className="campus__tabs" role="tablist" aria-label="Sedes de la UDES">
          {campuses.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`campus-tab-${item.id}`}
              className={`campus__tab${index === active ? " is-active" : ""}`}
              aria-selected={index === active}
              aria-controls={`campus-panel-${item.id}`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <Icon name="pin" size={16} />
              {item.city}
            </button>
          ))}
        </div>

        <div
          key={campus.id}
          className="campus__panel card"
          role="tabpanel"
          id={`campus-panel-${campus.id}`}
          aria-labelledby={`campus-tab-${campus.id}`}
          tabIndex={0}
        >
          <div className="campus__intro">
            <h3>
              Sede {campus.city}
              <span>{campus.role}</span>
            </h3>

            <dl className="campus__highlights">
              {campus.highlights.map((highlight) => (
                <div key={highlight.label}>
                  <dt>{highlight.value}</dt>
                  <dd>{highlight.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="campus__columns">
            <div className="campus__column">
              <span className="leap__tag">Vocación regional</span>
              <p>{campus.vocation}</p>
            </div>
            <div className="campus__column campus__column--response">
              <span className="leap__tag">Respuesta de la UDES</span>
              <p>{campus.response}</p>
              <ul className="campus__fronts">
                {campus.fronts.map((front) => (
                  <li key={front}>{front}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
