/* =============================================================================
   Portal de Planeación · la oficina y su equipo.

   Primero qué hace la oficina, área por área, con el portal donde se ve su
   trabajo; luego el equipo en rejilla —la misma tarjeta y la misma ficha
   ampliada de la portada— y el contacto. Sin equipo cargado la página sigue
   completa: áreas y contacto, sin marcadores a la vista.

   El contenido llega publicado desde la intranet («Página de la oficina»).
   ========================================================================== */

import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { useOfficePage } from "./page";
import { PlanLayout } from "./PlanLayout";
import { TeamGrid } from "./TeamCarousel";

export function TeamPage() {
  const { page } = useOfficePage();
  const people = page.team.people;

  return (
    <PlanLayout title={`Nuestro equipo · ${page.office.name}`}>
      <section className="pl-hero pl-hero--compact" aria-labelledby="pl-equipo">
        <div className="pl-container pl-hero__inner">
          <Link className="pl-back" to="/">
            <Icon name="arrow-left" size={16} /> Planeación Institucional
          </Link>
          <h1 id="pl-equipo">{page.teamPage.title}</h1>
          <p className="pl-hero__lede">{page.teamPage.lede}</p>
        </div>
      </section>

      {page.areas.length > 0 && (
      <section className="pl-section" aria-labelledby="pl-areas">
        <div className="pl-container">
          <div className="pl-section__head">
            <h2 id="pl-areas">Qué hacemos</h2>
          </div>
          <ol className="pl-area-list">
            {page.areas.map((area) => (
              <li key={area.id}>
                <h3>{area.name}</h3>
                <p>{area.does}</p>
                {area.to && (
                  <Link className="pl-link" to={area.to}>
                    {area.toLabel || "Ver el portal"} <Icon name="arrow-right" size={15} />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>
      )}

      {people.length > 0 && (
        <section className="pl-section pl-team" aria-labelledby="pl-personas">
          <div className="pl-container">
            <div className="pl-section__head">
              <h2 id="pl-personas">{page.team.title}</h2>
              {page.team.lede && <p>{page.team.lede}</p>}
            </div>
            <TeamGrid people={people} areas={page.areas} label={`${people.length} personas de la oficina`} />
          </div>
        </section>
      )}

      <section className="pl-section" aria-labelledby="pl-contacto">
        <div className="pl-container">
          <div className="pl-office">
            <div className="pl-office__text">
              <h2 id="pl-contacto">{page.teamPage.contactTitle}</h2>
              <p>{page.teamPage.contactBody}</p>
              <a className="pl-cta pl-cta--solid" href={`mailto:${page.office.email}`}>
                {page.office.email} <Icon name="arrow-right" size={16} />
              </a>
            </div>
            {(page.office.address || page.office.phone) && (
              <p className="pl-office__address">
                {page.office.address}
                {page.office.address && page.office.phone && <br />}
                {page.office.phone && <a href={`tel:${page.office.phone.replace(/\s+/g, "")}`}>{page.office.phone}</a>}
              </p>
            )}
          </div>
        </div>
      </section>
    </PlanLayout>
  );
}
