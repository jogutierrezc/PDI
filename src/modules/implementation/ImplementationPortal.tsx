import { Link } from "react-router-dom";
import { PublicLayout } from "../../components/layout/PublicLayout";
import { Icon } from "../../components/ui/Icon";
import { ProgressRing } from "../../components/ui/ProgressRing";
import { CardSkeleton, EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useCurrentPeriod, usePillars, usePublicDocuments, useSummary } from "../../data/queries";
import { accentFor, emptySummary, formatDate, toneForProgress } from "../../data/pdi";
import "./implementation.css";

export function ImplementationPortal() {
  const pillars = usePillars();
  const summary = useSummary();
  const period = useCurrentPeriod();
  const documents = usePublicDocuments();

  const totals = summary.data ?? emptySummary;

  return (
    <PublicLayout className="implementation-page">
      <div className="u-container implementation-shell">
        <header className="implementation-intro" id="estrategia">
          <div>
            <span className="eyebrow">Implementación del PDI</span>
            <h1>Cómo avanza cada pilar estratégico</h1>
            <p className="lede">
              Visión global del estado de los pilares institucionales: proyectos, avance verificado e
              indicadores clave de desempeño.
              {period.data ? ` Datos al ${formatDate(period.data.cutoff_date)}.` : ""}
            </p>
          </div>

          <div className="implementation-intro__gauge">
            <ProgressRing value={totals.progress} size={112} thickness={10} label="Avance global del PDI" />
            <div>
              <span className="eyebrow">Avance global</span>
              <strong>
                {totals.done} de {totals.total} indicadores
              </strong>
              <small>{period.data?.label ?? "Sin corte publicado"}</small>
            </div>
          </div>
        </header>

        <section className="implementation-grid stagger" id="indicadores" aria-label="Pilares estratégicos y avance">
          {pillars.isPending ? (
            <CardSkeleton count={6} />
          ) : pillars.isError ? (
            <ErrorBlock error={pillars.error} onRetry={() => void pillars.refetch()} />
          ) : pillars.data.length === 0 ? (
            <EmptyBlock title="Todavía no hay pilares publicados." />
          ) : (
            pillars.data.map((pillar) => {
              const progress = pillar.progress.progress;
              const status = toneForProgress(progress);
              const accent = accentFor(pillar.accent_slot);

              return (
                <article
                  className="implementation-card card"
                  key={pillar.id}
                  style={{ "--accent": accent } as React.CSSProperties}
                >
                  <header className="implementation-card__top">
                    <span className="implementation-card__icon">
                      <Icon name={pillar.icon} size={20} />
                    </span>
                    <span className={`implementation-status implementation-status--${status.tone}`}>
                      <span aria-hidden="true">{status.glyph}</span> {status.label}
                    </span>
                  </header>

                  <h2>{pillar.name}</h2>
                  <p className="implementation-card__description">{pillar.description}</p>

                  <div className="implementation-card__meter">
                    <div className="implementation-card__meter-head">
                      <span>Progreso</span>
                      <strong>{progress}%</strong>
                    </div>
                    <span className="progress-track">
                      <span
                        className="progress-track__fill"
                        style={{ width: `${progress}%`, background: accent }}
                      />
                    </span>
                    <small>
                      {pillar.progress.done} de {pillar.progress.total} indicadores cumplidos ·{" "}
                      {pillar.management_owner}
                    </small>
                  </div>

                  <Link className="implementation-card__link" to={`/implementacion/pilar/${pillar.slug}`}>
                    Ver detalle<span className="sr-only"> de {pillar.name}</span>{" "}
                    <span data-arrow aria-hidden="true">→</span>
                  </Link>
                </article>
              );
            })
          )}
        </section>

        <section className="implementation-repo" id="repositorio" aria-labelledby="repositorio-title">
          <div className="section-heading">
            <span className="eyebrow">Repositorio documental</span>
            <h2 id="repositorio-title">Documentos de soporte del plan</h2>
            <p>Las fuentes que respaldan cada cifra publicada en este portal.</p>
          </div>

          {documents.isPending ? (
            <LoadingBlock rows={4} label="Cargando documentos" />
          ) : documents.isError ? (
            <ErrorBlock error={documents.error} onRetry={() => void documents.refetch()} />
          ) : documents.data.length === 0 ? (
            <EmptyBlock
              title="Aún no hay documentos publicados"
              hint="Los documentos se publican desde la intranet marcándolos como públicos."
            />
          ) : (
            <ul className="repo-list">
              {documents.data.map((document) => (
                <li key={document.id}>
                  <a
                    href={document.url}
                    className="repo-item"
                    target="_blank"
                    // noopener evita que la página destino pueda manipular esta
                    // pestaña a través de window.opener.
                    rel="noopener noreferrer"
                    aria-label={`${document.title}, ${document.kind}${document.size_label ? `, ${document.size_label}` : ""}, se abre en una pestaña nueva`}
                  >
                    <span className="repo-item__kind" data-kind={document.kind}>
                      <Icon name="document" size={18} />
                      {document.kind}
                    </span>
                    <span className="repo-item__body">
                      <strong>{document.title}</strong>
                      <small>{document.description}</small>
                    </span>
                    {document.size_label && <span className="repo-item__size">{document.size_label}</span>}
                    <Icon name="external" size={16} />
                  </a>
                </li>
              ))}
            </ul>
          )}

          <p className="repo-note">
            ¿Necesitas una versión anterior o un dato que no aparece aquí? Escribe a{" "}
            <a href="mailto:planeacion@udes.edu.co">planeacion@udes.edu.co</a>.
          </p>
        </section>
      </div>
    </PublicLayout>
  );
}
