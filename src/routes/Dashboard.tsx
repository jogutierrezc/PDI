import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PublicLayout } from "../components/layout/PublicLayout";
import { FilterChips } from "../components/ui/FilterChips";
import type { FilterOption } from "../components/ui/FilterChips";
import { Icon } from "../components/ui/Icon";
import { ProgressRing } from "../components/ui/ProgressRing";
import { StackedProgress } from "../components/ui/StackedProgress";
import { CardSkeleton, EmptyBlock, ErrorBlock, LoadingBlock } from "../components/ui/QueryState";
import { useCurrentPeriod, useFeaturedActivities, usePillars, useSummary } from "../data/queries";
import { accentFor, emptySummary, formatDate, formatMonth, statusMeta, summarizeProgress } from "../data/pdi";

export function Dashboard() {
  // null = todos los pilares. El filtro gobierna el detalle y la tabla.
  const [filter, setFilter] = useState<string | null>(null);

  const pillars = usePillars();
  const globalSummary = useSummary();
  const activities = useFeaturedActivities();
  const period = useCurrentPeriod();

  const rows = pillars.data ?? [];
  const scope = useMemo(
    () => (filter ? rows.filter((pillar) => pillar.slug === filter) : rows),
    [rows, filter],
  );
  const activePillar = filter ? rows.find((pillar) => pillar.slug === filter) : undefined;

  // Con un pilar seleccionado el resumen se recalcula en el cliente sobre las
  // mismas filas: no hace falta volver a preguntar a la base de datos.
  const summary = filter
    ? summarizeProgress(scope.map((pillar) => pillar.progress))
    : (globalSummary.data ?? emptySummary);

  const filterOptions = useMemo<FilterOption[]>(
    () => [
      { id: null, label: "Todos los pilares" },
      ...rows.map((pillar) => ({
        id: pillar.slug,
        label: pillar.name,
        icon: pillar.icon,
        accent: accentFor(pillar.accent_slot),
      })),
    ],
    [rows],
  );

  const visibleActivities = useMemo(() => {
    const list = activities.data ?? [];
    return filter ? list.filter((activity) => activity.pillar?.slug === filter) : list;
  }, [activities.data, filter]);

  if (pillars.isError) {
    return (
      <PublicLayout className="dashboard-page">
        <div className="u-container dashboard-shell">
          <ErrorBlock error={pillars.error} onRetry={() => void pillars.refetch()} />
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout className="dashboard-page">
      <div className="u-container dashboard-shell">
        <header className="board-hero">
          <div className="board-hero__copy">
            <span className="eyebrow">Tablero público de seguimiento</span>
            <h1>Cumplimiento global y por pilar del PDI</h1>
            <p className="lede">
              El avance institucional en abierto: el estado global, la lectura por pilar y las actividades
              que necesitan mayor atención.
            </p>
            <div className="board-hero__meta">
              {period.data && (
                <>
                  <span className="meta-pill">
                    <Icon name="clock" size={14} /> Actualizado al {formatDate(period.data.cutoff_date)}
                  </span>
                  <span className="meta-pill">{period.data.label}</span>
                </>
              )}
              <span className="meta-pill">
                <Icon name="check" size={14} /> {summary.on_track} de {summary.pillar_count} pilares sobre
                el 80 %
              </span>
            </div>
          </div>

          <aside className="board-hero__score" aria-label="Indicador de cumplimiento global">
            <span className="board-hero__score-label">
              {activePillar ? activePillar.name : "Cumplimiento global"}
            </span>
            <ProgressRing
              value={summary.progress}
              size={168}
              thickness={12}
              color={activePillar ? accentFor(activePillar.accent_slot) : "var(--brand-blue)"}
              label={activePillar ? `Avance de ${activePillar.name}` : "Cumplimiento global"}
            />
            <dl className="board-hero__facts">
              <div>
                <dt>Actividades cumplidas</dt>
                <dd>{summary.done}</dd>
              </div>
              <div>
                <dt>Con foco de atención</dt>
                <dd>{summary.need_attention}</dd>
              </div>
            </dl>
          </aside>
        </header>

        {/* Fila de filtros sobre los datos, no dentro de ellos. */}
        <section className="board-filter" aria-label="Filtrar por pilar">
          {pillars.isPending ? (
            <LoadingBlock rows={1} label="Cargando pilares" />
          ) : (
            <FilterChips label="Pilares" value={filter} onChange={setFilter} options={filterOptions} />
          )}

          {activePillar && (
            <p className="board-filter__note" aria-live="polite">
              Mostrando <strong>{activePillar.name}</strong> · {activePillar.focus}{" "}
              <Link to={`/implementacion/pilar/${activePillar.slug}`}>
                Ver detalle del pilar <span data-arrow aria-hidden="true">→</span>
              </Link>
            </p>
          )}
        </section>

        {/* Cuatro cifras sueltas: una tarjeta de dato, no un gráfico. */}
        <section className="stat-row" aria-label="Resumen de actividades">
          <StatTile label="Actividades totales" value={summary.total} hint="Seguimiento consolidado del alcance seleccionado." />
          <StatTile label="En curso" value={summary.active} hint="En ejecución durante el corte actual." tone="curso" />
          <StatTile label="Pendientes" value={summary.pending} hint="Programadas para próximas entregas." tone="pendiente" />
          <StatTile label="En riesgo" value={summary.risk} hint="Requieren seguimiento directo." tone="riesgo" />
        </section>

        <section className="board-split">
          <article className="card board-distribution">
            <div className="section-heading">
              <span className="eyebrow">Lectura rápida</span>
              <h2>Distribución del avance</h2>
              <p>Cómo se reparten las {summary.total} actividades del alcance seleccionado.</p>
            </div>
            {summary.total === 0 ? (
              <EmptyBlock
                title="Todavía no hay actividades registradas"
                hint="El avance del plan se calcula contando actividades: en cuanto se registre la primera, aparecerá aquí."
              />
            ) : (
              <StackedProgress summary={summary} />
            )}
          </article>

          <article className="card board-focus">
            <div className="section-heading">
              <span className="eyebrow">Enfoque del mes</span>
              <h2>Qué mirar primero</h2>
            </div>
            <ol className="focus-list">
              <li>
                <span className="focus-list__index">1</span>
                <p>
                  {summary.need_attention > 0
                    ? `Revisar ${summary.need_attention === 1 ? "el pilar" : `los ${summary.need_attention} pilares`} con riesgo para cerrar brechas antes del siguiente corte.`
                    : "Ningún pilar tiene actividades en riesgo en este corte."}
                </p>
              </li>
              <li>
                <span className="focus-list__index">2</span>
                <p>
                  Acelerar las {summary.active} actividades en curso para sostener el avance global por
                  encima del 80 %.
                </p>
              </li>
              <li>
                <span className="focus-list__index">3</span>
                <p>Validar evidencias y responsables para mantener una trazabilidad pública y confiable.</p>
              </li>
            </ol>
          </article>
        </section>

        <section className="board-section" id="pilares" aria-label="Cumplimiento por pilar">
          <div className="section-heading">
            <span className="eyebrow">Seguimiento por pilar</span>
            <h2>Cumplimiento por pilar del PDI</h2>
            <p>Lectura individual de cada pilar con su avance, volumen de actividades y foco principal.</p>
          </div>

          {pillars.isPending ? (
            <CardSkeleton count={4} />
          ) : scope.length === 0 ? (
            <EmptyBlock title="No hay pilares publicados todavía." />
          ) : (
            <div className="pillar-grid stagger">
              {scope.map((pillar) => {
                const accent = accentFor(pillar.accent_slot);
                return (
                  <article
                    className="pillar-card card"
                    key={pillar.id}
                    style={{ "--accent": accent } as React.CSSProperties}
                  >
                    <header className="pillar-card__head">
                      <span className="pillar-card__icon">
                        <Icon name={pillar.icon} size={20} />
                      </span>
                      <div>
                        <span className="pillar-card__eyebrow">Pilar {pillar.numeral}</span>
                        <h3>{pillar.name}</h3>
                      </div>
                      <ProgressRing
                        value={pillar.progress.progress}
                        size={62}
                        thickness={6}
                        color={accent}
                        label={`Avance de ${pillar.name}`}
                      />
                    </header>

                    <p className="pillar-card__focus">{pillar.focus}</p>

                    <dl className="pillar-card__metrics">
                      <MetricCell label="Cumplidas" value={pillar.progress.done} status="cumplida" />
                      <MetricCell label="En curso" value={pillar.progress.active} status="curso" />
                      <MetricCell label="Pendientes" value={pillar.progress.pending} status="pendiente" />
                      <MetricCell label="En riesgo" value={pillar.progress.risk} status="riesgo" />
                    </dl>

                    <footer className="pillar-card__foot">
                      <span className="progress-track">
                        <span
                          className="progress-track__fill"
                          style={{ width: `${pillar.progress.progress}%`, background: accent }}
                        />
                      </span>
                      <span className="pillar-card__foot-labels">
                        <small>
                          {pillar.progress.done} de {pillar.progress.total} actividades
                        </small>
                        <small>{pillar.management_owner}</small>
                      </span>
                    </footer>

                    <Link className="pillar-card__link" to={`/implementacion/pilar/${pillar.slug}`}>
                      Ver detalle<span className="sr-only"> de {pillar.name}</span>{" "}
                      <span data-arrow aria-hidden="true">→</span>
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="board-section" id="actividades" aria-label="Actividades destacadas">
          <div className="section-heading">
            <span className="eyebrow">Actividades destacadas</span>
            <h2>Seguimiento de acciones clave</h2>
            <p>
              {activePillar
                ? `Actividades destacadas de ${activePillar.name}.`
                : "Un vistazo público a actividades representativas del tablero y su estado de avance."}
            </p>
          </div>

          {activities.isPending ? (
            <LoadingBlock rows={4} label="Cargando actividades" />
          ) : activities.isError ? (
            <ErrorBlock error={activities.error} onRetry={() => void activities.refetch()} />
          ) : visibleActivities.length === 0 ? (
            <EmptyBlock
              title="Sin actividades destacadas"
              hint="Marca una actividad como destacada desde la intranet para que aparezca en esta tabla."
            />
          ) : (
            <div className="table-scroll">
              <table className="activity-table">
                <caption className="sr-only">
                  Actividades destacadas del PDI con pilar, responsable, estado y porcentaje de avance
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Actividad</th>
                    <th scope="col">Pilar</th>
                    <th scope="col">Responsable</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Avance</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleActivities.map((activity) => {
                    const meta = statusMeta[activity.status];
                    return (
                      <tr key={activity.id}>
                        <th scope="row">
                          <strong>{activity.title}</strong>
                          <small>Vence {formatMonth(activity.due_date)}</small>
                        </th>
                        <td>
                          <span className="table-pillar">
                            <span
                              className="table-pillar__dot"
                              style={{ background: accentFor(activity.pillar?.accent_slot) }}
                            />
                            {activity.pillar?.name ?? "—"}
                          </span>
                        </td>
                        <td>{activity.owner || "—"}</td>
                        <td>
                          <span className={`status-badge status-badge--${activity.status}`}>
                            <span className="status-badge__glyph" aria-hidden="true">
                              {meta.glyph}
                            </span>
                            {meta.label}
                          </span>
                        </td>
                        <td>
                          <span className="table-progress">
                            <span className="progress-track">
                              <span
                                className="progress-track__fill"
                                style={{ width: `${activity.progress}%`, background: meta.color }}
                              />
                            </span>
                            <strong>{activity.progress}%</strong>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}

/* --- Piezas ---------------------------------------------------------------- */

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "curso" | "pendiente" | "riesgo";
}) {
  return (
    <article className={`stat-tile card${tone ? ` stat-tile--${tone}` : ""}`}>
      <span className="stat-tile__label">{label}</span>
      <strong className="stat-tile__value">{value}</strong>
      <span className="stat-tile__hint">{hint}</span>
    </article>
  );
}

function MetricCell({
  label,
  value,
  status,
}: {
  label: string;
  value: number;
  status: keyof typeof statusMeta;
}) {
  return (
    <div className={`metric-cell metric-cell--${status}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
