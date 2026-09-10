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
  useProjects,
  usePublicDocuments,
  useStructure,
  useSummary,
} from "../../data/queries";
import {
  accentFor,
  aggregateYears,
  budgetedCount,
  emptySummary,
  estimatedBudget,
  formatBudget,
  formatDate,
  indexYearProgress,
  planElapsed,
  planYears,
  toneForProgress,
  yearScopeLabel,
  EXECUTED_BUDGET,
} from "../../data/pdi";
import { NetworkSection } from "./NetworkSection";
import { buildRepository } from "../../data/repository";
import type { RepositorySource } from "../../data/repository";
import type { YearScope } from "../../data/pdi";
import "./implementation.css";

export function ImplementationPortal() {
  // Arranca en el plan entero, igual que el tablero: la lectura de conjunto
  // primero, y el año concreto para quien lo busque.
  const [yearScope, setYearScope] = useState<YearScope>("plan");
  // Qué fuente del repositorio se está mirando. Arranca en todas: la unión es
  // el punto de la sección.
  const [repoFilter, setRepoFilter] = useState<RepositorySource | "todos">("todos");

  const pillars = usePillars();
  const summary = useSummary();
  const pillarYears = usePillarYears();
  const period = useCurrentPeriod();
  const documents = usePublicDocuments();
  // Los proyectos entran por dos motivos: son la única cifra de dinero del plan
  // y traen el documento que los formula. RLS ya filtra a los de pilares
  // públicos, así que un anónimo no ve más de lo que puede abrir.
  const projects = useProjects();
  // Áreas y líneas de todo el plan: el mapa de relacionamiento las necesita de
  // los seis pilares a la vez, y `usePillarDetail` solo sabe de uno.
  const structure = useStructure();

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

  const projectRows = useMemo(() => projects.data ?? [], [projects.data]);
  const planBudget = estimatedBudget(projectRows);
  const withBudget = budgetedCount(projectRows);
  const elapsed = planElapsed();

  const pillarNames = useMemo(
    () => new Map((pillars.data ?? []).map((pillar) => [pillar.id, pillar.name])),
    [pillars.data],
  );
  const repository = useMemo(
    () => buildRepository(documents.data ?? [], projectRows, pillarNames),
    [documents.data, projectRows, pillarNames],
  );
  const visibleRepository = repository.filter(
    (entry) => repoFilter === "todos" || entry.source === repoFilter,
  );
  const formulationCount = repository.filter((entry) => entry.source === "proyecto").length;
  const institutionalCount = repository.length - formulationCount;

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

        {/* --- Recursos y tiempo del plan ---------------------------------
            Tres cifras que antes solo existían dentro de la ficha de un pilar y
            que describen el plan entero. El presupuesto lo suman los proyectos
            —no hay otra cifra de dinero en el portal— y el tiempo lo pone el
            calendario contra el horizonte 2024-2028. ------------------------ */}
        <section className="implementation-stats" aria-label="Recursos y tiempo del plan">
          <PlanStat
            label="Presupuesto estimado"
            value={formatBudget(planBudget)}
            progress={projectRows.length === 0 ? 0 : Math.round((withBudget * 100) / projectRows.length)}
            caption={
              projectRows.length === 0
                ? "Todavía no hay proyectos formulados"
                : `Declarado por ${withBudget} de ${projectRows.length} ${projectRows.length === 1 ? "proyecto" : "proyectos"}`
            }
            icon="document"
            pending={projects.isPending}
          />
          <PlanStat
            label="Presupuesto ejecutado"
            value={formatBudget(EXECUTED_BUDGET)}
            progress={0}
            caption="El portal aún no registra ejecución presupuestal"
            icon="chart"
          />
          <PlanStat
            label="Tiempo transcurrido"
            value={elapsed.label}
            progress={elapsed.progress}
            caption={elapsed.caption}
            icon="clock"
          />
        </section>

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

        {/* --- Mapa numerado de relacionamiento -----------------------------
            Va aquí, entre los pilares y el repositorio: después de saber cómo
            va cada pilar y antes de ir a los documentos, que es cuando alguien
            se pregunta cómo se conecta todo. --------------------------------- */}
        <NetworkSection
          pillars={pillars.data ?? []}
          areas={structure.data ?? []}
          projects={projectRows}
          pending={pillars.isPending || structure.isPending || projects.isPending}
          refreshing={pillars.isFetching || structure.isFetching || projects.isFetching}
          error={(structure.error ?? pillars.error ?? projects.error) as Error | null}
          // También es el botón "Actualizar datos" del mapa: quien acaba de
          // editar un proyecto en la intranet, en otra pestaña, no pasa por la
          // invalidación de caché de esta y necesita poder forzarlo.
          onRetry={() => {
            void pillars.refetch();
            void structure.refetch();
            void projects.refetch();
          }}
        />

        <section className="implementation-repo" id="repositorio" aria-labelledby="repositorio-title">
          <div className="section-heading">
            <span className="eyebrow">Repositorio documental</span>
            <h2 id="repositorio-title">Documentos de soporte del plan</h2>
            <p>
              Las fuentes que respaldan cada cifra publicada en este portal: los documentos
              institucionales del PDI y el documento con el que se formuló cada proyecto.
            </p>
          </div>

          {/* Un proyecto sin documento no aparece, así que el filtro solo se
              ofrece cuando de verdad hay dos fuentes que separar. */}
          {formulationCount > 0 && (
            <div className="repo-filter" role="group" aria-label="Filtrar el repositorio por origen">
              {(
                [
                  ["todos", "Todos", repository.length],
                  ["institucional", "Documentos del plan", institutionalCount],
                  ["proyecto", "Formulación de proyectos", formulationCount],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={`repo-filter__chip${repoFilter === value ? " is-on" : ""}`}
                  aria-pressed={repoFilter === value}
                  onClick={() => setRepoFilter(value)}
                >
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
          )}

          {documents.isPending || projects.isPending ? (
            <LoadingBlock rows={4} label="Cargando documentos" />
          ) : documents.isError ? (
            <ErrorBlock error={documents.error} onRetry={() => void documents.refetch()} />
          ) : visibleRepository.length === 0 ? (
            <EmptyBlock
              title="Aún no hay documentos publicados"
              hint="Los documentos institucionales se publican desde la intranet marcándolos como públicos; los de formulación aparecen al cargar el archivo del proyecto."
            />
          ) : (
            <ul className="repo-list">
              {visibleRepository.map((entry) => (
                <li key={entry.id}>
                  <a
                    href={entry.url}
                    className="repo-item"
                    target="_blank"
                    // noopener evita que la página destino pueda manipular esta
                    // pestaña a través de window.opener.
                    rel="noopener noreferrer"
                    aria-label={`${entry.title}, ${entry.kind}${entry.sizeLabel ? `, ${entry.sizeLabel}` : ""}, ${entry.source === "proyecto" ? "formulación de proyecto" : "documento del plan"}, se abre en una pestaña nueva`}
                  >
                    <span className="repo-item__kind" data-kind={entry.kind} data-source={entry.source}>
                      <Icon name="document" size={18} />
                      {entry.kind}
                    </span>
                    <span className="repo-item__body">
                      <strong>{entry.title}</strong>
                      <small>{entry.description}</small>
                    </span>
                    {entry.source === "proyecto" && (
                      <span className="repo-item__tag">Formulación</span>
                    )}
                    {entry.sizeLabel && <span className="repo-item__size">{entry.sizeLabel}</span>}
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

/**
 * Una cifra de recursos o tiempo del plan.
 *
 * Es el mismo bloque que la ficha del pilar, con una diferencia: aquí el
 * presupuesto depende de una consulta que puede seguir en vuelo, y una cifra en
 * cero mientras carga se leería como "el plan no tiene presupuesto".
 */
function PlanStat({
  label,
  value,
  progress,
  caption,
  icon,
  pending = false,
}: {
  label: string;
  value: string;
  progress: number;
  caption: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  pending?: boolean;
}) {
  return (
    <article className="plan-stat card">
      <header>
        <span>{label}</span>
        <Icon name={icon} size={17} />
      </header>
      <strong>{pending ? "…" : value}</strong>
      <span className="progress-track">
        <span className="progress-track__fill" style={{ width: `${pending ? 0 : progress}%` }} />
      </span>
      <p>{pending ? "Calculando…" : caption}</p>
    </article>
  );
}
