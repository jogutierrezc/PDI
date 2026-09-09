import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PublicLayout } from "../../components/layout/PublicLayout";
import { Icon } from "../../components/ui/Icon";
import { ProgressRing } from "../../components/ui/ProgressRing";
import { CardSkeleton, EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { YearScrubber } from "../../components/ui/YearScrubber";
import {
  useCurrentPeriod,
  usePillars,
  usePillarYears,
  usePublicDocuments,
  useSummary,
} from "../../data/queries";
import {
  accentFor,
  aggregateYears,
  emptySummary,
  formatDate,
  indexYearProgress,
  planYears,
  toneForProgress,
  yearScopeLabel,
} from "../../data/pdi";
import type { YearScope } from "../../data/pdi";
import "./implementation.css";

export function ImplementationPortal() {
  // Arranca en el plan entero, igual que el tablero: la lectura de conjunto
  // primero, y el año concreto para quien lo busque.
  const [yearScope, setYearScope] = useState<YearScope>("plan");

  const pillars = usePillars();
  const summary = useSummary();
  const pillarYears = usePillarYears();
  const period = useCurrentPeriod();
  const documents = usePublicDocuments();

  const totals = summary.data ?? emptySummary;

  const yearRows = pillarYears.data ?? [];
  // Con el conjunto completo: los pilares que aún no reportan por años
  // conservan su avance acumulado en la posición del plan.
  const roster = (pillars.data ?? []).map((pillar) => ({
    id: pillar.id,
    fallback: pillar.progress.progress,
  }));
  const aggregate = useMemo(
    () => aggregateYears(yearRows, roster),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearRows, pillars.data],
  );
  const yearIndex = useMemo(() => indexYearProgress(yearRows), [yearRows]);

  // Null = ningún pilar ha reportado ese corte todavía.
  const headline = yearScope === "plan" ? aggregate.plan : aggregate.at(yearScope);

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
            <ProgressRing
              value={headline}
              size={112}
              thickness={10}
              label={`Avance del PDI, ${yearScopeLabel(yearScope)}`}
              emptyHint="sin reportar"
            />
            <div>
              <span className="eyebrow">
                {yearScope === "plan" ? "Avance del plan" : `Cumplimiento ${yearScope}`}
              </span>
              <strong>
                {totals.done} de {totals.total} indicadores
              </strong>
              <small>{period.data?.label ?? "Sin corte publicado"}</small>
            </div>
          </div>
        </header>

        <YearScrubber
          label="Corte del plan"
          value={yearScope}
          onChange={setYearScope}
          series={aggregate.series}
          plan={aggregate.plan}
          hint={
            yearScope === "plan"
              ? `Avance del plan: los ${planYears.length} años pesan lo mismo y los que aún no se han reportado cuentan como cero. El 100 % llega al cerrar ${planYears[planYears.length - 1]}.`
              : `Cumplimiento de ${yearScope}: lo logrado sobre lo comprometido para ese año.`
          }
        />

        <section className="implementation-grid stagger" id="indicadores" aria-label="Pilares estratégicos y avance">
          {pillars.isPending ? (
            <CardSkeleton count={6} />
          ) : pillars.isError ? (
            <ErrorBlock error={pillars.error} onRetry={() => void pillars.refetch()} />
          ) : pillars.data.length === 0 ? (
            <EmptyBlock title="Todavía no hay pilares publicados." />
          ) : (
            pillars.data.map((pillar) => {
              // La tarjeta sigue a la barra: el plan ponderado, o el año elegido.
              const value =
                yearScope === "plan"
                  ? yearIndex.plan("pillar", pillar.id)
                  : yearIndex.at("pillar", pillar.id, yearScope);
              const progress = value ?? 0;
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
                    <span
                      className={`implementation-status implementation-status--${value === null ? "neutral" : status.tone}`}
                    >
                      {value === null ? (
                        "Sin reportar"
                      ) : (
                        <>
                          <span aria-hidden="true">{status.glyph}</span> {status.label}
                        </>
                      )}
                    </span>
                  </header>

                  <h2>{pillar.name}</h2>
                  <p className="implementation-card__description">{pillar.description}</p>

                  <div className="implementation-card__meter">
                    <div className="implementation-card__meter-head">
                      <span>{yearScopeLabel(yearScope)}</span>
                      <strong>{value === null ? "—" : `${progress}%`}</strong>
                    </div>
                    <span className="progress-track">
                      <span
                        className="progress-track__fill"
                        style={{ width: `${progress}%`, background: accent }}
                      />
                    </span>
                    <small>
                      {value === null
                        ? `Sin reportes de ${yearScopeLabel(yearScope)} · `
                        : `${pillar.progress.done} de ${pillar.progress.total} indicadores cumplidos · `}
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
