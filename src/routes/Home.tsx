import { Link } from "react-router-dom";
import { PublicLayout } from "../components/layout/PublicLayout";
import { HeroVideo } from "../components/ui/HeroVideo";
import { Icon } from "../components/ui/Icon";
import { ProgressRing } from "../components/ui/ProgressRing";
import { CardSkeleton, ErrorBlock, LoadingBlock } from "../components/ui/QueryState";
import { useCurrentPeriod, usePillars, useSummary } from "../data/queries";
import { accentFor, emptySummary } from "../data/pdi";
import { prefetchProps } from "../lib/prefetch";

import { CampusExplorer } from "../modules/landing/CampusExplorer";
import { ContextTicker } from "../modules/landing/ContextTicker";
import { ResourceRoom } from "../modules/landing/ResourceRoom";
import { RouteFinder } from "../modules/landing/RouteFinder";
import { TheLeap } from "../modules/landing/TheLeap";
import { pillarNarratives } from "../modules/landing/content";

export function Home() {
  const pillars = usePillars();
  const summary = useSummary();
  const period = useCurrentPeriod();

  const totals = summary.data ?? emptySummary;

  return (
    <PublicLayout className="home-page">
      <section className="home-hero" id="inicio">
        <HeroVideo className="home-hero__media" src="/Multimedia1.mp4" />
        <div className="home-hero__scrim" />

        <div className="u-container home-hero__content">
          <span className="eyebrow">Plan de Desarrollo Institucional</span>
          <h1>
            PDI 2024-2028:
            <br />
            Aquí construimos futuro
          </h1>
          <p className="lede">
            Nuestra hoja de ruta hacia la excelencia académica y el compromiso social. Un esfuerzo
            colectivo para transformar nuestra región.
          </p>
          <div className="home-hero__actions">
            <Link className="button-primary" to="/implementacion" {...prefetchProps("/implementacion")}>
              Explorar el plan <span data-arrow aria-hidden="true">→</span>
            </Link>
            <Link className="button-secondary" to="/tablero" {...prefetchProps("/tablero")}>
              Ver el tablero
            </Link>
          </div>

          {/* La frase con la que el plan se presenta a sí mismo. Va aquí, bajo
              los botones, y no dentro del titular: es una cita, no una promesa
              de navegación. */}
          <blockquote className="home-hero__quote">
            Imaginamos una universidad que todavía no existe, pero que forjamos con cada paso hacia el
            futuro.
          </blockquote>
        </div>
      </section>

      {/* Cifra de cabecera: lo primero que la gente quiere saber es cómo vamos. */}
      <section className="home-pulse" aria-label="Avance del plan de un vistazo">
        <div className="u-container home-pulse__inner">
          {summary.isPending ? (
            <LoadingBlock rows={2} label="Cargando el avance del plan" />
          ) : summary.isError ? (
            <ErrorBlock error={summary.error} onRetry={() => void summary.refetch()} />
          ) : (
            <>
              <div className="home-pulse__figure">
                <ProgressRing value={totals.progress} size={104} label="Avance global" />
                <div>
                  <span className="eyebrow">Avance global</span>
                  {/* El anillo es el promedio de los pilares, no la proporción
                      de indicadores cumplidos: se dice cuál es cuál. */}
                  <p>
                    Promedio de {totals.pillar_count}{" "}
                    {totals.pillar_count === 1 ? "pilar" : "pilares"}
                    {totals.total > 0
                      ? ` · ${totals.done} de ${totals.total} indicadores cumplidos`
                      : ""}
                    {period.data ? ` · ${period.data.label}` : ""}
                  </p>
                </div>
              </div>

              <dl className="home-pulse__stats">
                <div>
                  <dt>Pilares estratégicos</dt>
                  <dd>{totals.pillar_count}</dd>
                </div>
                <div>
                  <dt>En curso</dt>
                  <dd>{totals.active}</dd>
                </div>
                <div>
                  <dt>Requieren atención</dt>
                  <dd>{totals.risk}</dd>
                </div>
              </dl>

              <Link className="button-secondary" to="/tablero" {...prefetchProps("/tablero")}>
                Ir al tablero <span data-arrow aria-hidden="true">→</span>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Por qué el plan existe: el diagnóstico, en cifras que se leen de reojo. */}
      <ContextTicker />

      {/* De qué modelo venimos y a cuál vamos. */}
      <TheLeap />

      <section className="home-pillars" id="pilares">
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
                // La narrativa del PDI es editorial y se busca por slug; un
                // pilar que la base publique sin narrativa se muestra igual,
                // solo que sin lema ni etiquetas.
                const narrative = pillarNarratives[pillar.slug];

                return (
                  <Link
                    className="home-pillar-card card card--interactive"
                    to={`/implementacion/pilar/${pillar.slug}`}
                    key={pillar.id}
                    style={{ "--accent": accentFor(pillar.accent_slot) } as React.CSSProperties}
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
                          {pillar.progress.progress}% · {pillar.progress.done} de{" "}
                          {pillar.progress.total} indicadores
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

      {/* El plan aterrizado en cada territorio. */}
      <CampusExplorer />

      {/* Qué parte del plan le toca a quien está leyendo. */}
      <RouteFinder />

      {/* Las fuentes, antes de las bandas de cierre. */}
      <ResourceRoom />

      <section className="home-cta-band">
        <div className="u-container home-cta-band__inner">
          <div>
            <span className="eyebrow">Seguimiento público</span>
            <h2>Consulta cómo avanzamos</h2>
            <p>
              Revisa el cumplimiento global del PDI, el estado de cada indicador y el avance detallado por
              pilar, con la misma información que usa el comité de planeación.
            </p>
          </div>
          <Link className="button-primary" to="/tablero" {...prefetchProps("/tablero")}>
            Ir al tablero PDI <span data-arrow aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="home-closing">
        <img
          className="home-closing__watermark"
          src="/udesback.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          width={1600}
          height={899}
        />
        <div className="u-container home-closing__inner">
          <div>
            <span className="eyebrow">Una visión compartida</span>
            <h2>Profundiza en nuestra visión</h2>
            <p className="lede">
              Conoce los detalles, indicadores y metas que guían nuestro trabajo diario hacia una
              universidad de excelencia.
            </p>
          </div>
          <Link className="button-secondary" to="/implementacion" {...prefetchProps("/implementacion")}>
            Ver implementación <span data-arrow aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
