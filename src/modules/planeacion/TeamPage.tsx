/* =============================================================================
   Portal de Planeación · la oficina y su equipo.

   Primero qué hace la oficina, área por área, con el portal donde se ve su
   trabajo; luego las personas (solo las que tienen nombre en content.ts) y el
   contacto. Sin equipo cargado la página sigue completa: áreas y contacto.
   ========================================================================== */

import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { AREAS, OFFICE, TEAM, initials } from "./content";
import { PlanLayout } from "./PlanLayout";

export function TeamPage() {
  const people = TEAM.filter((p) => p.name.trim());
  return (
    <PlanLayout title={`Nuestro equipo · ${OFFICE.name}`}>
      <section className="pl-hero pl-hero--compact" aria-labelledby="pl-equipo">
        <div className="pl-container pl-hero__inner">
          <Link className="pl-back" to="/">
            <Icon name="arrow-left" size={16} /> Planeación Institucional
          </Link>
          <h1 id="pl-equipo">La oficina</h1>
          <p className="pl-hero__lede">{OFFICE.purpose}</p>
        </div>
      </section>

      <section className="pl-section" aria-labelledby="pl-areas">
        <div className="pl-container">
          <div className="pl-section__head">
            <h2 id="pl-areas">Qué hacemos</h2>
          </div>
          <ol className="pl-area-list">
            {AREAS.map((area) => (
              <li key={area.id}>
                <h3>{area.name}</h3>
                <p>{area.does}</p>
                {area.to && (
                  <Link className="pl-link" to={area.to}>
                    {area.toLabel} <Icon name="arrow-right" size={15} />
                  </Link>
                )}
                {people.some((p) => p.area === area.id) && (
                  <ul className="pl-people">
                    {people
                      .filter((p) => p.area === area.id)
                      .map((p) => (
                        <li key={p.name}>
                          {p.photo ? <img src={p.photo} alt="" width={56} height={56} /> : <span aria-hidden="true">{initials(p.name)}</span>}
                          <span>
                            <b>{p.name}</b>
                            <small>{p.role}</small>
                            {p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="pl-section" aria-labelledby="pl-contacto">
        <div className="pl-container">
          <div className="pl-office">
            <div className="pl-office__text">
              <h2 id="pl-contacto">Escríbenos</h2>
              <p>¿Necesitas una cifra que no está publicada, un soporte del plan o acompañamiento para tu oficina? Escribe a la oficina y te respondemos con la fuente.</p>
              <a className="pl-cta pl-cta--solid" href={`mailto:${OFFICE.email}`}>
                {OFFICE.email} <Icon name="arrow-right" size={16} />
              </a>
            </div>
            {OFFICE.address && <p className="pl-office__address">{OFFICE.address}</p>}
          </div>
        </div>
      </section>
    </PlanLayout>
  );
}
