import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PublicLayout } from "../components/layout/PublicLayout";
import { FilterChips } from "../components/ui/FilterChips";
import type { FilterOption } from "../components/ui/FilterChips";
import { Icon } from "../components/ui/Icon";
import { ProgressRing } from "../components/ui/ProgressRing";
import { StackedProgress } from "../components/ui/StackedProgress";
import { YearScrubber } from "../components/ui/YearScrubber";
import { ComplianceChart } from "../components/ui/ComplianceChart";
import type { ChartSeries } from "../components/ui/ComplianceChart";
import { ViewToggle } from "../components/ui/ViewToggle";
import type { ResultView } from "../components/ui/ViewToggle";
import { CardSkeleton, EmptyBlock, ErrorBlock, LoadingBlock } from "../components/ui/QueryState";
import {
  useCurrentPeriod,
  useFeaturedActivities,
  usePillars,
  usePillarYears,
  useSummary,
} from "../data/queries";
import {
  accentFor,
  aggregateYears,
  bandFor,
  emptySummary,
  formatDate,
  formatMonth,
  indexYearProgress,
  planYears,
  shortYear,
  statusMeta,
  summarizeProgress,
  yearScopeLabel,
} from "../data/pdi";
import type { YearScope } from "../data/pdi";

export function Dashboard() {
  // null = todos los pilares. El filtro gobierna el detalle y la tabla.
  const [filter, setFilter] = useState<string | null>(null);
  // Dónde está puesta la barra de años. Arranca en el plan entero: quien abre
  // el tablero busca la lectura de conjunto, y una cifra de un año suelto
  // pasaría por la del plan.
  const [yearScope, setYearScope] = useState<YearScope>("plan");
  // Tabla o gráfica en la comparativa 2024-2028. Arranca en tabla: es la cifra
  // exacta y la lectura que funciona con lector de pantalla y en papel.
  const [view, setView] = useState<ResultView>("table");

  const pillars = usePillars();
  const globalSummary = useSummary();
  const pillarYears = usePillarYears();
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

  // La barra y el anillo miran las mismas filas que el filtro de pilares: al
  // elegir un pilar, la serie pasa a ser la suya.
  const yearRows = pillarYears.data ?? [];
  const scopedYears = useMemo(() => {
    const ids = new Set(scope.map((pillar) => pillar.id));
    return yearRows.filter((row) => ids.has(row.entity_id));
  }, [yearRows, scope]);

  // El conjunto completo, no solo quien ya reporta por años: un pilar que
  // todavía no ha capturado ningún corte conserva su avance acumulado en la
  // posición del plan, en vez de irse a cero y hundir la media.
  const aggregate = useMemo(
    () =>
      aggregateYears(
        scopedYears,
        scope.map((pillar) => ({ id: pillar.id, fallback: pillar.progress.progress })),
      ),
    [scopedYears, scope],
  );
  const yearIndex = useMemo(() => indexYearProgress(yearRows), [yearRows]);

  // Las filas de la comparativa: un pilar y sus cinco cortes. Sirven igual a la
  // tabla y a la gráfica, que es justamente lo que hace que las dos lecturas no
  // puedan discrepar.
  const comparison = useMemo<ChartSeries[]>(
    () =>
      scope.map((pillar) => ({
        key: pillar.id,
        label: pillar.name,
        detail: `Pilar ${pillar.numeral} · ${pillar.management_owner}`,
        points: yearIndex.series("pillar", pillar.id),
      })),
    [scope, yearIndex],
  );
  const hasYearData = comparison.some((row) => row.points.some((point) => point.progress !== null));

  // Null = ese año no lo ha reportado nadie del alcance. Se dice, no se pinta
  // un cero: "no se cumplió" y "todavía no se sabe" son cosas distintas.
  const headline = yearScope === "plan" ? aggregate.plan : aggregate.at(yearScope);

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
              El avance institucional en abierto: el estado global, la lectura por pilar y los indicadores
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
              <small>{yearScopeLabel(yearScope)}</small>
            </span>
            <ProgressRing
              value={headline}
              size={168}
              thickness={12}
              color={activePillar ? accentFor(activePillar.accent_slot) : "var(--brand-blue)"}
              label={`${activePillar ? `Avance de ${activePillar.name}` : "Cumplimiento global"}, ${yearScopeLabel(yearScope)}`}
              emptyHint="sin reportar"
            />
            <dl className="board-hero__facts">
              <div>
                <dt>Indicadores cumplidos</dt>
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

          <YearScrubber
            label="Corte del plan"
            value={yearScope}
            onChange={setYearScope}
            series={aggregate.series}
            plan={aggregate.plan}
            hint={
              yearScope === "plan"
                ? `Avance del plan: los ${planYears.length} años pesan lo mismo y los que aún no se han reportado cuentan como cero. El 100 % llega al cerrar ${planYears[planYears.length - 1]}.`
                : `Cumplimiento de ${yearScope}: lo logrado sobre lo comprometido para ese año. Los conteos por estado de abajo son siempre los del corte actual.`
            }
          />

          {activePillar && (
            <p className="board-filter__note" aria-live="polite">
              Mostrando <strong>{activePillar.name}</strong> · {activePillar.focus}{" "}
              <Link to={`/tablero/pilar/${activePillar.slug}`}>
                Ver su cumplimiento <span data-arrow aria-hidden="true">→</span>
              </Link>
            </p>
          )}
        </section>

        {/* Cuatro cifras sueltas: una tarjeta de dato, no un gráfico. */}
        <section className="stat-row" aria-label="Resumen de indicadores">
          <StatTile label="Indicadores totales" value={summary.total} hint="Seguimiento consolidado del alcance seleccionado." />
          <StatTile label="En curso" value={summary.active} hint="En ejecución durante el corte actual." tone="curso" />
          <StatTile label="Pendientes" value={summary.pending} hint="Programadas para próximas entregas." tone="pendiente" />
          <StatTile label="En riesgo" value={summary.risk} hint="Requieren seguimiento directo." tone="riesgo" />
        </section>

        <section className="board-split">
          <article className="card board-distribution">
            <div className="section-heading">
              <span className="eyebrow">Lectura rápida</span>
              <h2>Distribución del avance</h2>
              <p>Cómo se reparten los {summary.total} indicadores del alcance seleccionado.</p>
            </div>
            {summary.total === 0 ? (
              <EmptyBlock
                title="Todavía no hay indicadores registrados"
                hint="El avance del plan se calcula contando indicadores: en cuanto se registre el primero, aparecerá aquí."
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
                    : "Ningún pilar tiene indicadores en riesgo en este corte."}
                </p>
              </li>
              <li>
                <span className="focus-list__index">2</span>
                <p>
                  Acelerar los {summary.active} indicadores en curso para sostener el avance global por
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
            <p>Lectura individual de cada pilar con su avance, volumen de indicadores y foco principal.</p>
          </div>

          {pillars.isPending ? (
            <CardSkeleton count={4} />
          ) : scope.length === 0 ? (
            <EmptyBlock title="No hay pilares publicados todavía." />
          ) : (
            <div className="pillar-grid stagger">
              {scope.map((pillar) => {
                const accent = accentFor(pillar.accent_slot);
                // La tarjeta sigue a la barra: con el plan, su ponderación
                // hasta 2028; con un año, lo que ese pilar cumplió ese año.
                const value =
                  yearScope === "plan"
                    ? yearIndex.plan("pillar", pillar.id)
                    : yearIndex.at("pillar", pillar.id, yearScope);
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
                        value={value}
                        size={62}
                        thickness={6}
                        color={accent}
                        label={`Avance de ${pillar.name}, ${yearScopeLabel(yearScope)}`}
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
                          style={{ width: `${value ?? 0}%`, background: accent }}
                        />
                      </span>
                      <span className="pillar-card__foot-labels">
                        <small>
                          {value === null
                            ? `Sin reportes de ${yearScopeLabel(yearScope)}`
                            : `${value} % · ${yearScopeLabel(yearScope)}`}
                        </small>
                        <small>{pillar.management_owner}</small>
                      </span>
                    </footer>

                    {/* El tablero lleva a su propia lectura del pilar —cuánto
                        se ha cumplido—, no a la ficha de implementación. */}
                    <Link className="pillar-card__link" to={`/tablero/pilar/${pillar.slug}`}>
                      Ver cumplimiento<span className="sr-only"> de {pillar.name}</span>{" "}
                      <span data-arrow aria-hidden="true">→</span>
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* --- Comparativa 2024-2028 -----------------------------------
            Las tarjetas de arriba dicen cómo va cada pilar en el corte que
            marca la barra de años; esta sección pone los cinco cortes uno al
            lado del otro. La misma serie alimenta la tabla y la gráfica: no
            son dos cálculos, son dos lecturas del mismo. --------------- */}
        <section className="board-section" id="comparativa" aria-label="Comparativa de cumplimiento por año">
          <div className="section-bar">
            <div className="section-heading">
              <span className="eyebrow">
                Comparativa {planYears[0]}-{planYears[planYears.length - 1]}
              </span>
              <h2>Cumplimiento por año</h2>
              <p>
                La tabla da la cifra exacta de cada corte; la gráfica compara los cinco años de un
                vistazo. Un año en blanco no es un cero: es un corte que ese pilar todavía no ha
                reportado.
              </p>
            </div>

            <ViewToggle
              label="Ver como"
              value={view}
              onChange={setView}
              chartDisabled={!hasYearData}
              disabledHint="Todavía no hay cumplimiento reportado por año."
            />
          </div>

          {pillars.isPending ? (
            <LoadingBlock rows={4} label="Cargando la comparativa por año" />
          ) : !hasYearData ? (
            <EmptyBlock
              title="Todavía no hay cumplimiento reportado por año"
              hint="En cuanto un indicador registre meta y resultado de un año, ese corte sube por la cascada hasta su pilar y aparece aquí."
            />
          ) : view === "chart" ? (
            <ComplianceChart
              series={comparison}
              caption="Cumplimiento de cada pilar frente a lo comprometido para ese año. El color es la banda de cumplimiento y acompaña siempre a la cifra; un año sin barra es un año sin reportar."
            />
          ) : (
            <>
              <div className="table-scroll">
                <table className="result-table">
                  <caption className="sr-only">
                    Cumplimiento de cada pilar en cada año del plan y avance acumulado del plan
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Pilar</th>
                      {planYears.map((year) => (
                        <th scope="col" key={year} className="result-table__year">
                          Cumpl. {shortYear(year)}
                        </th>
                      ))}
                      <th scope="col">Plan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scope.map((pillar) => {
                      const plan = yearIndex.plan("pillar", pillar.id);
                      const planBand = bandFor(plan);

                      return (
                        <tr key={pillar.id}>
                          <th scope="row">
                            <strong>{pillar.name}</strong>
                            <small>
                              Pilar {pillar.numeral} · {pillar.management_owner}
                            </small>
                          </th>

                          {planYears.map((year) => {
                            const value = yearIndex.at("pillar", pillar.id, year);
                            if (value === null) {
                              return (
                                <td className="result-table__number" key={year}>
                                  <span className="target-empty">—</span>
                                </td>
                              );
                            }
                            const band = bandFor(value);
                            return (
                              <td className="result-table__number" key={year}>
                                <span
                                  className="year-cell"
                                  style={{ "--band": band.color } as React.CSSProperties}
                                  title={`${band.label} en ${year}`}
                                >
                                  {value} %
                                </span>
                              </td>
                            );
                          })}

                          <td>
                            <span
                              className="band-chip"
                              style={{ "--band": planBand.color } as React.CSSProperties}
                            >
                              <span className="band-chip__value">{plan} %</span>
                              <span className="band-chip__label">{planBand.label}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="result-table__note">
                Cada columna de año es lo cumplido frente a lo comprometido para ese año.{" "}
                <strong>Plan</strong> es otra pregunta: los {planYears.length} años pesan lo mismo y
                los que aún no se han reportado cuentan como cero, así que el 100 % solo llega al
                cerrar {planYears[planYears.length - 1]}.
              </p>
            </>
          )}
        </section>

        <section className="board-section" id="indicadores" aria-label="Indicadores destacados">
          <div className="section-heading">
            <span className="eyebrow">Indicadores destacados</span>
            <h2>Seguimiento de acciones clave</h2>
            <p>
              {activePillar
                ? `Indicadores destacados de ${activePillar.name}.`
                : "Un vistazo público a indicadores representativos del tablero y su estado de avance."}
            </p>
          </div>

          {activities.isPending ? (
            <LoadingBlock rows={4} label="Cargando indicadores" />
          ) : activities.isError ? (
            <ErrorBlock error={activities.error} onRetry={() => void activities.refetch()} />
          ) : visibleActivities.length === 0 ? (
            <EmptyBlock
              title="Sin indicadores destacados"
              hint="Marca un indicador como destacado desde la intranet para que aparezca en esta tabla."
            />
          ) : (
            <div className="table-scroll">
              <table className="activity-table">
                <caption className="sr-only">
                  Indicadores destacados del PDI con pilar, responsable, estado y porcentaje de avance
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Indicador</th>
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
