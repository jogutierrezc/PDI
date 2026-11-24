/* =============================================================================
   CMS Portales · bloque vivo «Pilares del plan».

   Copia de la sección home-pillars de routes/Home.tsx (sin su id, para que
   una página no repita el ancla); si cambia allí, cambiar aquí. Los pilares
   salen de la base con su avance; la narrativa editorial, de landing/content.ts.
   ========================================================================== */

import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { CardSkeleton, ErrorBlock } from "../../../../components/ui/QueryState";
import { usePillars } from "../../../../data/queries";
import { accentFor } from "../../../../data/pdi";
import { pillarNarratives } from "../../../landing/content";

export function PilaresPlan() {
  const pillars = usePillars();

  return (
    <section className="home-pillars">
      <div className="u-container">
        <div className="section-heading section-heading--centered">
          <span className="eyebrow">Ejes estratégicos</span>
          <h2>Nuestros pilares estratégicos</h2>
          <p>Los ejes que estructuran nuestro accionar para los próximos años.</p>
        </div>

        {pillars.isPending ? (
          <CardSkeleton count={6} />
        ) : pillars.isError ? (
          <ErrorBlock error={pillars.error} onRetry={() => void pillars.refetch()} />
        ) : (
          <div className="home-pillar-grid stagger">
            {pillars.data.map((pillar) => {
              // La narrativa del PDI es editorial y se busca por slug; un pilar sin
              // narrativa se muestra igual, solo que sin lema ni etiquetas.
              const narrative = pillarNarratives[pillar.slug];

              return (
                <Link
                  className="home-pillar-card card card--interactive"
                  to={`/implementacion/pilar/${pillar.slug}`}
                  key={pillar.id}
                  style={{ "--accent": accentFor(pillar.accent_slot) } as CSSProperties}
                >
                  <span className="home-pillar-card__head">
                    <span className="home-pillar-card__icon">
                      <Icon name={pillar.icon} size={22} />
                    </span>
                    <span className="home-pillar-card__numeral">{pillar.numeral}</span>
                  </span>

                  <h3>{pillar.name}</h3>

                  {narrative && <p className="home-pillar-card__motto">{narrative.motto}</p>}

                  <p>{pillar.description}</p>

                  {narrative && (
                    <span className="home-pillar-card__tags">
                      {narrative.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </span>
                  )}

                  <span className="home-pillar-card__foot">
                    <span className="home-pillar-card__meter">
                      <span className="progress-track">
                        <span
                          className="progress-track__fill"
                          style={{
                            width: `${pillar.progress.progress}%`,
                            background: accentFor(pillar.accent_slot),
                          }}
                        />
                      </span>
                      <small>
                        {pillar.progress.progress}% · {pillar.progress.done} de {pillar.progress.total} indicadores
                      </small>
                    </span>
                    <span className="home-pillar-card__link">
                      Conocer el pilar <span data-arrow aria-hidden="true">→</span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
