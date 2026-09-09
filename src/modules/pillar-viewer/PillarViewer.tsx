import { Fragment, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PublicLayout } from "../../components/layout/PublicLayout";
import { Icon } from "../../components/ui/Icon";
import { ProgressRing } from "../../components/ui/ProgressRing";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { Modal } from "../../components/ui/Modal";
import { YearScrubber } from "../../components/ui/YearScrubber";
import { useCurrentPeriod, usePillarDetail } from "../../data/queries";
import {
  accentFor,
  bandFor,
  formatBudget,
  formatDate,
  formatMonth,
  formatCurrency,
  formatRange,
  formatValue,
  indexYearProgress,
  sdgById,
  latestTarget,
  planYears,
  shortYear,
  statusMeta,
  yearScopeLabel,
  yearsInPlay,
} from "../../data/pdi";
import type {
  ActivityWithTargets,
  PillarObservation,
  ProgressScope,
  ProjectWithLinks,
} from "../../types/database";
import { projectFileUrl } from "../../data/storage";
import type { YearIndex, YearScope } from "../../data/pdi";
import "./pillar-viewer.css";

/**
 * La barra de secciones cambia con el filtro: al mirar un área concreta, la
 * sección "Áreas estratégicas" no existe, y enlazar a un ancla que no está en
 * la página deja al lector donde estaba sin explicación.
 */
function sectionsFor(hasArea: boolean) {
  return [
    { id: "ficha", label: hasArea ? "Ficha del área" : "Protocolo de medición" },
    ...(hasArea ? [] : [{ id: "areas", label: "Áreas estratégicas" }]),
    { id: "proyectos", label: "Proyectos" },
    { id: "indicadores", label: "Indicadores" },
    { id: "observaciones", label: "Observaciones" },
    { id: "cambios", label: "Control de cambios" },
    { id: "glosario", label: "Glosario" },
    { id: "cumplimiento", label: "Líneas de acción" },
  ];
}

export function PillarViewer() {
  const { slug } = useParams<{ slug: string }>();
  const detail = usePillarDetail(slug);
  const period = useCurrentPeriod();
  // null = todas las áreas. El selector de la barra filtra los proyectos y el
  // cumplimiento por línea, que son las dos secciones que cuelgan de un área.
  const [areaId, setAreaId] = useState<string | null>(null);
  // La observación abierta. Fuera del modal la lista solo muestra su
  // encabezado: un párrafo de balance entre tablas de cifras no se lee.
  const [reading, setReading] = useState<PillarObservation | null>(null);
  // La barra de años gobierna todos los porcentajes de la página: el anillo,
  // las áreas, los proyectos y las líneas. La tabla de indicadores no cambia
  // —ya enseña los cinco años— pero marca la columna que se está mirando.
  const [yearScope, setYearScope] = useState<YearScope>("plan");

  // Al cambiar de pilar el área elegida deja de existir: se vuelve a "todas"
  // en vez de dejar el selector apuntando a la nada.
  useEffect(() => {
    setAreaId(null);
    setReading(null);
    setYearScope("plan");
  }, [slug]);

  if (detail.isPending) {
    return (
      <PublicLayout className="pillar-page">
        <div className="u-container pillar-body">
          <LoadingBlock rows={6} label="Cargando el pilar" />
        </div>
      </PublicLayout>
    );
  }

  if (detail.isError) {
    return (
      <PublicLayout className="pillar-page">
        <div className="u-container pillar-body">
          <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />
        </div>
      </PublicLayout>
    );
  }

  // Un slug inventado, o un pilar sin publicar visto por alguien anónimo, no
  // muestran otro pilar por defecto: llevan a la página 404, que sí explica qué
  // ha pasado.
  if (!detail.data) return <Navigate to="/404" replace />;

  const {
    pillar,
    progress,
    areas,
    areaProgress,
    projectProgress,
    lines,
    indicators,
    projects,
    activities,
    observations,
    yearProgress,
    changes,
    glossary,
  } = detail.data;
  const accent = accentFor(pillar.accent_slot);
  const accentStyle = { "--accent": accent } as React.CSSProperties;

  // La ficha describe el indicador principal del pilar. Si hay más protocolos,
  // sus códigos se listan dentro de la ficha para que no queden invisibles.
  const indicator = indicators.find((item) => item.is_primary) ?? indicators[0];

  // v_action_lines ya trae el área de cada línea resuelta: con este índice, un
  // proyecto sabe a qué línea y a qué área pertenece sin más consultas.
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const activeArea = areaId ? areas.find((area) => area.id === areaId) : undefined;
  const sections = sectionsFor(Boolean(activeArea));
  // El avance de cada área lo calcula la base de datos en cascada desde sus
  // líneas, y estas desde sus proyectos: así el número del área, el del pilar y
  // el del tablero no pueden discrepar.
  const areaStats = new Map(areaProgress.map((row) => [row.area_id, row]));
  const projectStats = new Map(projectProgress.map((row) => [row.project_id, row]));

  const visibleAreas = activeArea ? [activeArea] : areas;
  const visibleLines = activeArea ? lines.filter((line) => line.area_id === activeArea.id) : lines;
  const visibleProjects = activeArea
    ? projects.filter(
        (project) =>
          project.action_line_id && lineById.get(project.action_line_id)?.area_id === activeArea.id,
      )
    : projects;

  // Proyectos que nadie ha colgado todavía de una línea: se avisa en vez de
  // hacerlos desaparecer al filtrar.
  const unlinkedProjects = projects.filter((project) => !project.action_line_id).length;

  const visibleActivities = activeArea
    ? activities.filter(
        (activity) =>
          activity.action_line_id && lineById.get(activity.action_line_id)?.area_id === activeArea.id,
      )
    : activities;
  const unlinkedActivities = activities.filter((activity) => !activity.action_line_id).length;
  // Las columnas del reporte son los años que este pilar tenga capturados,
  // más los del plan: no se pintan cortes que nadie ha reportado todavía.
  const years = yearsInPlay(visibleActivities.flatMap((activity) => activity.targets));
  // El avance de cada año, ya girado: dado un área, una línea o un proyecto,
  // su serie. Es la misma cascada del acumulado aplicada año a año.
  const yearIndex = indexYearProgress(yearProgress);

  /** El avance de una fila según dónde esté la barra. Null = ese corte no lo ha
   *  reportado. Es la única función que traduce la barra a un número, para que
   *  el anillo, las áreas, los proyectos y las líneas no puedan discrepar. */
  const shownProgress = (scope: ProgressScope, id: string, fallback: number): number | null => {
    if (yearScope === "plan") {
      // Sin ningún año capturado, el plan ponderado sería un cero engañoso: se
      // mantiene la cascada acumulada, que es lo que había antes de los años.
      return yearIndex.of(scope, id).length === 0 ? fallback : yearIndex.plan(scope, id);
    }
    return yearIndex.at(scope, id, yearScope);
  };

  // La barra habla del área elegida cuando hay una: filtrar y seguir viendo la
  // serie del pilar entero sería contradictorio.
  const barScope: ProgressScope = activeArea ? "area" : "pillar";
  const barId = activeArea ? activeArea.id : pillar.id;
  const heroValue = shownProgress("pillar", pillar.id, progress.progress);

  return (
    <PublicLayout className="pillar-page">
      <div className="pillar-viewer" style={accentStyle}>
        <header className="pillar-hero">
          <div className="u-container pillar-hero__inner">
            <span className="pillar-hero__icon">
              <Icon name={pillar.icon} size={30} />
            </span>

            <div className="pillar-hero__copy">
              <div className="pillar-hero__badges">
                <span className="pillar-hero__numeral">Pilar estratégico {pillar.numeral}</span>
                <span className="pillar-hero__owner">{pillar.management_owner}</span>
              </div>
              <h1>{pillar.name}</h1>
              <p className="lede">{pillar.description}</p>
            </div>

            <div className="pillar-hero__gauge">
              <ProgressRing
                value={heroValue}
                size={124}
                thickness={10}
                color={accent}
                label={`Avance de ${pillar.name}, ${yearScopeLabel(yearScope)}`}
                emptyHint="sin reportar"
              />
              {/* El anillo es el avance en cascada, no la proporción de
                  indicadores cumplidos: se dice de dónde sale para que el
                  número no parezca sacado de la nada. */}
              <small>
                {yearScopeLabel(yearScope)}
                {" · "}
                {progress.line_count > 0
                  ? `promedio de ${progress.area_count} ${progress.area_count === 1 ? "área" : "áreas"}`
                  : `promedio de ${progress.total} ${progress.total === 1 ? "indicador" : "indicadores"}`}
                {period.data ? ` · al ${formatDate(period.data.cutoff_date)}` : ""}
              </small>
            </div>
          </div>
        </header>

        <nav className="pillar-subnav" aria-label="Secciones del pilar">
          <div className="u-container pillar-subnav__inner">
            <ul>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.label}</a>
                </li>
              ))}
            </ul>

            {areas.length > 0 && (
              <label className="area-selector">
                <span>Áreas</span>
                <select
                  value={areaId ?? ""}
                  onChange={(event) => setAreaId(event.target.value || null)}
                >
                  <option value="">Todas las áreas ({areas.length})</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.code ? `${area.code} · ` : ""}
                      {area.name}
                    </option>
                  ))}
                </select>
                <Icon name="chevron-down" size={15} />
              </label>
            )}
          </div>

          <div className="u-container pillar-subnav__years">
            <YearScrubber
              label={activeArea ? `Corte · ${activeArea.name}` : "Corte del plan"}
              value={yearScope}
              onChange={setYearScope}
              series={yearIndex.series(barScope, barId)}
              plan={yearIndex.plan(barScope, barId)}
              hint={
                yearScope === "plan"
                  ? `Avance del plan: los ${planYears.length} años pesan lo mismo y los que aún no se han reportado cuentan como cero. El 100 % llega al cerrar ${planYears[planYears.length - 1]}.`
                  : `Cumplimiento de ${yearScope}: lo logrado sobre lo comprometido para ese año.`
              }
            />
          </div>
        </nav>

        <div className="u-container pillar-body">
          {activeArea && (
            <p className="area-note" aria-live="polite">
              <Icon name="grid" size={15} />
              <span>
                Mostrando el área <strong>{activeArea.name}</strong>
                {activeArea.description ? ` · ${activeArea.description}` : ""}
              </span>
              <button type="button" className="area-note__clear" onClick={() => setAreaId(null)}>
                Ver todas
              </button>
            </p>
          )}

          {/* --- Ficha ------------------------------------------------------ */}
          <section className="pillar-section" id="ficha" aria-labelledby="ficha-title">
            {/* Lectura destacada del pilar. Vivía al final, dentro del desglose
                de líneas, donde casi nadie llegaba. */}
            {!activeArea && pillar.insight && (
              <p className="insight">
                <Icon name="spark" size={17} />
                <span>{pillar.insight}</span>
              </p>
            )}

            {activeArea ? (
              /* Con un área elegida la ficha habla del área, no del indicador
                 del pilar: aporta, responsables y consideraciones describen el
                 indicador y aquí solo serían ruido. */
              <>
                <div className="section-heading">
                  <span className="eyebrow">Área estratégica</span>
                  <h2 id="ficha-title">Ficha del área seleccionada</h2>
                </div>

                <dl className="fact-grid">
                  <Fact label="Pilar" value={pillar.name} />
                  <Fact
                    label="Acción del pilar"
                    value={`${activeArea.code ? `${activeArea.code} · ` : ""}${activeArea.name}`}
                  />
                  <Fact label="Descripción de la acción" value={activeArea.description} wide />
                </dl>

                <div className="classification-grid">
                  <Classification
                    label="Avance del área"
                    value={`${areaStats.get(activeArea.id)?.progress ?? 0}%`}
                    glyph="◐"
                    tone="active"
                  />
                  <Classification
                    label="Líneas de acción"
                    value={String(areaStats.get(activeArea.id)?.line_count ?? 0)}
                    glyph="◆"
                    tone="neutral"
                  />
                  <Classification
                    label="Proyectos vinculados"
                    value={String(areaStats.get(activeArea.id)?.project_count ?? 0)}
                    glyph="▤"
                    tone="neutral"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="section-heading">
                  <span className="eyebrow">Protocolo de medición</span>
                  <h2 id="ficha-title">Cómo se mide este pilar</h2>
                </div>

                <dl className="fact-grid">
                  {indicator && (
                    <Fact
                      label="Código del protocolo"
                      value={`${indicator.code} · ${indicator.name}`}
                    />
                  )}
                  <Fact label="Impulsador" value={pillar.impulsor} />
                  <Fact label="Aporta a" value={pillar.contributes} />
                  <Fact label="Responsable de la gestión" value={pillar.management_owner} />
                  <Fact label="Responsable del cálculo" value={pillar.calculation_owner} />
                  {indicator && (
                    <Fact label="Consideraciones del protocolo" value={indicator.considerations} wide />
                  )}
                </dl>

                {indicator ? (
                  <div className="classification-grid">
                    <Classification label="Estado" value={indicator.status_label} glyph="●" tone="active" />
                    <Classification
                      label="Nivel de gestión"
                      value={indicator.level_label ?? "Sin definir"}
                      glyph="◆"
                      tone="neutral"
                    />
                    <Classification
                      label="Unidad"
                      value={indicator.unit_label ?? "Sin definir"}
                      glyph="%"
                      tone="neutral"
                    />
                    <Classification
                      label="Periodicidad"
                      value={indicator.periodicity_label ?? "Sin definir"}
                      glyph="◷"
                      tone="neutral"
                    />
                  </div>
                ) : (
                  <EmptyBlock
                    title="Este pilar todavía no tiene protocolo de medición"
                    hint="Se configura desde la intranet, en la configuración del pilar."
                  />
                )}
              </>
            )}
          </section>

          {/* --- Recursos y tiempo ------------------------------------------
              Describen el indicador del pilar completo, así que se retiran
              mientras se mira un área concreta. --------------------------- */}
          {indicator && !activeArea && (
            <section className="pillar-stats" aria-label="Recursos y tiempo">
              <StatBlock
                label="Presupuesto ejecutado"
                value={formatBudget(indicator.budget_amount)}
                progress={indicator.budget_progress}
                caption={`${indicator.budget_progress}% del total asignado`}
                icon="document"
              />
              <StatBlock
                label="Tiempo transcurrido"
                value={indicator.elapsed_label ?? "—"}
                progress={indicator.elapsed_progress}
                caption="Del horizonte del plan"
                icon="clock"
              />
              <article className="stat-block stat-block--alert">
                <header>
                  <span>Tareas críticas</span>
                  <Icon name="alert" size={17} />
                </header>
                <strong>{indicator.critical_tasks}</strong>
                <p>Requieren atención directa en el corte actual.</p>
              </article>
            </section>
          )}

          {/* --- Áreas estratégicas -----------------------------------------
              Antes esto era una línea de texto apretada dentro de la ficha con
              los códigos de los protocolos. Aquí baja a su propia sección, con
              el avance de cada área y con la tarjeta como forma de filtrar: el
              selector de la barra y estas tarjetas hacen lo mismo. --------- */}
          {!activeArea && areas.length > 0 && (
            <section className="pillar-section" id="areas" aria-labelledby="areas-title">
              <div className="section-heading">
                <span className="eyebrow">Estructura del plan</span>
                <h2 id="areas-title">Áreas estratégicas del pilar</h2>
                <p>
                  Cada área agrupa sus líneas de acción y los proyectos que cuelgan de ellas. El avance
                  del área es el promedio de sus líneas, y sigue a la barra de arriba:{" "}
                  <strong>{yearScopeLabel(yearScope)}</strong>.
                </p>
              </div>

              <div className="area-cards stagger">
                {areas.map((area) => {
                  const stats = areaStats.get(area.id);
                  const areaLines = stats?.line_count ?? 0;
                  const areaProjects = stats?.project_count ?? 0;
                  const areaValue = shownProgress("area", area.id, stats?.progress ?? 0);

                  return (
                    <button
                      className="area-card-public"
                      type="button"
                      key={area.id}
                      onClick={() => setAreaId(area.id)}
                    >
                      <span className="area-card-public__top">
                        {area.code && <span className="area-card-public__code">{area.code}</span>}
                        <ProgressRing
                          value={areaValue}
                          size={56}
                          thickness={5}
                          color={accent}
                          label={`Avance de ${area.name}, ${yearScopeLabel(yearScope)}`}
                        />
                      </span>

                      <span className="area-card-public__body">
                        <strong>{area.name}</strong>
                        {area.description && <small>{area.description}</small>}
                      </span>

                      <span className="area-card-public__foot">
                        <span>
                          {areaLines} {areaLines === 1 ? "línea" : "líneas"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {areaProjects} {areaProjects === 1 ? "proyecto" : "proyectos"}
                        </span>
                        <span className="area-card-public__cta">
                          Ver el área <span data-arrow aria-hidden="true">→</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* --- Proyectos ---------------------------------------------------
              A ancho completo: la columna lateral del desglose apretaba las
              filas, y ese desglose se consulta de vez en cuando, no mientras se
              leen los proyectos. Ahora vive al final de la página. -------- */}
          <section className="pillar-section" id="proyectos" aria-labelledby="proyectos-title">
            <div className="pillar-section__head">
              <div className="section-heading">
                <span className="eyebrow">Ejecución</span>
                <h2 id="proyectos-title">Proyectos estratégicos</h2>
              </div>
              <Link className="button-ghost" to="/implementacion">
                Ver todos los pilares
              </Link>
            </div>

            {visibleProjects.length === 0 ? (
              <EmptyBlock
                title={
                  activeArea
                    ? `Sin proyectos vinculados a ${activeArea.name}.`
                    : "Sin proyectos registrados."
                }
                hint={
                  activeArea && unlinkedProjects > 0
                    ? `Hay ${unlinkedProjects} proyecto(s) del pilar sin línea de acción asignada, así que no aparecen bajo ningún área.`
                    : undefined
                }
              />
            ) : (
              <ul className="entry-list">
                {visibleProjects.map((project) => {
                  const meta = statusMeta[project.status];
                  const line = project.action_line_id ? lineById.get(project.action_line_id) : undefined;
                  // El avance del proyecto sale de sus indicadores cuando los
                  // tiene; project.progress es solo el respaldo reportado.
                  const stats = projectStats.get(project.id);
                  const shown = shownProgress(
                    "project",
                    project.id,
                    stats?.progress ?? project.progress,
                  );
                  return (
                    <li className="entry-row" key={project.id}>
                      <span className="entry-row__icon">
                        <Icon name="check" size={16} />
                      </span>
                      <div className="entry-row__info">
                        <strong>{project.name}</strong>
                        <small>
                          {project.owner || "Sin responsable"} · {formatMonth(project.due_date)}
                          {stats?.is_derived ? ` · promedio de ${stats.activity_count} indicadores` : ""}
                        </small>
                        {/* De dónde cuelga el proyecto: pilar → área → línea.
                            Sin esto, la estructura del plan solo existía en la
                            base de datos. */}
                        {line ? (
                          <span className="entry-row__lineage">
                            <span>{pillar.name}</span>
                            <i aria-hidden="true">›</i>
                            <span>{line.area_name}</span>
                            <i aria-hidden="true">›</i>
                            <strong>
                              {line.code ? `${line.code} · ` : ""}
                              {line.name}
                            </strong>
                          </span>
                        ) : (
                          <span className="entry-row__lineage entry-row__lineage--empty">
                            Sin línea de acción asignada
                          </span>
                        )}
                        <ProjectBrief project={project} pillarId={pillar.id} />
                        <YearTrail scope="project" id={project.id} index={yearIndex} />
                      </div>
                      <div className="entry-row__state">
                        <span className={`status-badge status-badge--${project.status}`}>
                          <span className="status-badge__glyph" aria-hidden="true">
                            {meta.glyph}
                          </span>
                          {meta.label}
                        </span>
                        <span className="entry-row__meter">
                          <span className="progress-track">
                            <span
                              className="progress-track__fill"
                              style={{ width: `${shown ?? 0}%`, background: meta.color }}
                            />
                          </span>
                          <b>{shown}%</b>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* --- Indicadores de resultado --------------------------------
              La tabla del reporte institucional: base, y por cada año lo
              comprometido, lo logrado y su relación. El avance del pilar sale
              de la última columna de cumplimiento de cada fila. ----------- */}
          <section className="pillar-section" id="indicadores" aria-labelledby="indicadores-title">
            <div className="section-heading">
              <span className="eyebrow">Seguimiento</span>
              <h2 id="indicadores-title">Indicadores de resultado</h2>
              <p>
                {activeArea
                  ? `Indicadores vinculados a ${activeArea.name}.`
                  : "Cada indicador aporta al pilar el cumplimiento de su año más reciente: resultado sobre meta."}
              </p>
            </div>

            {visibleActivities.length === 0 ? (
              <EmptyBlock
                title={
                  activeArea
                    ? `Sin indicadores vinculados a ${activeArea.name}.`
                    : "Este pilar todavía no tiene indicadores registrados."
                }
                hint={
                  activeArea && unlinkedActivities > 0
                    ? `Hay ${unlinkedActivities} indicador(es) del pilar sin línea de acción asignada, así que no aparecen bajo ningún área.`
                    : undefined
                }
              />
            ) : (
              <>
                <div className="table-scroll">
                  <table className="result-table indicator-table">
                    <caption className="sr-only">
                      Indicadores de resultado: unidad, línea base y, por cada año, meta, resultado
                      y cumplimiento
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Indicador</th>
                        <th scope="col">Unidad</th>
                        <th scope="col">Base</th>
                        {years.map((year) => (
                          <th scope="col" key={year} colSpan={3} className="indicator-table__year">
                            {year}
                          </th>
                        ))}
                        <th scope="col">Avance</th>
                      </tr>
                      <tr className="indicator-table__subhead">
                        <th scope="col" />
                        <th scope="col" />
                        <th scope="col" />
                        {years.map((year) => (
                          <Fragment key={year}>
                            <th scope="col">Meta {shortYear(year)}</th>
                            <th scope="col">Result.</th>
                            <th scope="col">Cumpl.</th>
                          </Fragment>
                        ))}
                        <th scope="col" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleActivities.map((activity) => (
                        <IndicatorRow
                          key={activity.id}
                          activity={activity}
                          years={years}
                          highlight={yearScope === "plan" ? null : yearScope}
                          line={
                            activity.action_line_id
                              ? lineById.get(activity.action_line_id)
                              : undefined
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="result-table__note">
                  <strong>Base</strong> es el punto de partida del indicador y su año.{" "}
                  <strong>Cumpl.</strong> es el resultado sobre la meta de ese año; el año en
                  negrita es el que fija el avance que sube a la línea, al área y al pilar.
                </p>
              </>
            )}
          </section>

          {/* --- Observaciones ------------------------------------------------
              La tabla dice cuánto; esto dice por qué. Se publica solo si hay
              algo escrito: una sección vacía no informa de nada. ---------- */}
          {observations.length > 0 && (
            <section
              className="pillar-section"
              id="observaciones"
              aria-labelledby="observaciones-title"
            >
              <div className="section-heading">
                <span className="eyebrow">Lectura del avance</span>
                <h2 id="observaciones-title">Observaciones sobre los indicadores</h2>
                <p>
                  Balance cualitativo del pilar: lo que explica las cifras de la tabla anterior.
                  Abre cada una para leerla completa.
                </p>
              </div>

              <ul className="observation-list">
                {observations.map((observation) => (
                  <ObservationCard
                    key={observation.id}
                    observation={observation}
                    onOpen={() => setReading(observation)}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* --- Soporte ----------------------------------------------------- */}
          <section className="pillar-section support" aria-labelledby="soporte-title">
            <div className="section-heading">
              <span className="eyebrow">Acompañamiento</span>
              <h2 id="soporte-title">Soporte e información</h2>
              <p>
                Responsable de atención: Oficina de Planeación ·{" "}
                <a href="mailto:planeacion@udes.edu.co">planeacion@udes.edu.co</a>
              </p>
            </div>
            <div className="support__links">
              <a href="#ficha">
                <strong>Ficha del indicador</strong>
                <small>Definición, clasificación y responsables</small>
                <Icon name="arrow-right" size={16} />
              </a>
              <Link to="/implementacion#repositorio">
                <strong>Proyectos y evidencias</strong>
                <small>Documentos de soporte del plan</small>
                <Icon name="arrow-right" size={16} />
              </Link>
            </div>
          </section>

          {/* --- Trazabilidad ------------------------------------------------ */}
          <section className="pillar-section" id="cambios" aria-labelledby="cambios-title">
            <div className="section-heading">
              <span className="eyebrow">Trazabilidad</span>
              <h2 id="cambios-title">Control de cambios</h2>
            </div>
            {changes.length === 0 ? (
              <EmptyBlock title="Sin cambios registrados todavía." />
            ) : (
              <DataTable
                caption={`Historial de cambios del pilar ${pillar.name}`}
                headers={["Objeto", "Área", "Versión", "Aval", "Fecha", "Ajuste", "Tipo"]}
                rows={changes.map((change) => [
                  // Qué cambió. Sin esta columna, una entrada automática sería
                  // una descripción sin sujeto.
                  change.project_name ?? change.activity_title ?? change.indicator_code ?? "Pilar",
                  change.area_code || "—",
                  change.version,
                  change.approved_by || "—",
                  formatDate(change.changed_on),
                  change.description,
                  change.change_type,
                ])}
              />
            )}
          </section>

          <section className="pillar-section" id="glosario" aria-labelledby="glosario-title">
            <div className="section-heading">
              <span className="eyebrow">Definiciones</span>
              <h2 id="glosario-title">Glosario</h2>
            </div>
            {glossary.length === 0 ? (
              <EmptyBlock title="Sin términos en el glosario." />
            ) : (
              <DataTable
                caption="Términos usados en el seguimiento del pilar"
                headers={["Término", "Definición", "Descripción"]}
                rows={glossary.map((item) => [
                  item.term,
                  item.definition,
                  item.source ? `${item.description} · Fuente: ${item.source}` : item.description,
                ])}
              />
            )}
          </section>

          {/* --- Líneas de acción --------------------------------------------
            Última sección: es una consulta de detalle, no algo que se mire a
            la vez que los proyectos. ----------------------------------- */}
          <section className="pillar-section lines-section" id="cumplimiento" aria-labelledby="cumplimiento-title">
            <div className="section-heading">
              <span className="eyebrow">Desglose</span>
              <h2 id="cumplimiento-title">Líneas de acción</h2>
              <p>
                El porcentaje grande sigue a la barra de arriba —
                <strong>{yearScopeLabel(yearScope)}</strong>—; debajo, la serie completa de la línea.
                Un año que no aparece es un año que esa línea todavía no ha reportado.
              </p>
            </div>

            {visibleLines.length === 0 ? (
              <EmptyBlock title="Sin áreas ni líneas configuradas." />
            ) : (
              // Agrupado por área para que se vea la jerarquía, no una lista
              // plana de líneas sueltas.
                visibleAreas.map((area) => {
                const areaLines = visibleLines
                  .filter((line) => line.area_id === area.id)
                  .sort((a, b) => a.position - b.position);
                if (areaLines.length === 0) return null;

                return (
                  <div className="line-group" key={area.id}>
                    <h3>
                      {area.code ? `${area.code} · ` : ""}
                      {area.name}
                    </h3>
                    {/* El área también tiene su serie: el promedio anual de sus
                        líneas, que es lo que responde a "cómo íbamos en 2024". */}
                    <YearTrail scope="area" id={area.id} index={yearIndex} />
                    <ul className="line-list">
                      {areaLines.map((line) => {
                        const lineValue = shownProgress("line", line.id, line.progress);
                        return (
                          <li key={line.id}>
                            <div>
                              <span>
                                {line.code ? `${line.code} · ` : ""}
                                {line.name}
                              </span>
                              <b>{lineValue === null ? "—" : `${lineValue}%`}</b>
                            </div>
                            <span className="progress-track">
                              <span
                                className="progress-track__fill"
                                style={{ width: `${lineValue ?? 0}%`, background: accent }}
                              />
                            </span>
                            <YearTrail scope="line" id={line.id} index={yearIndex} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </section>

          {reading && (
            <ObservationReader observation={reading} onClose={() => setReading(null)} />
          )}

          <nav className="pillar-footer-nav" aria-label="Navegación entre pilares">
            <Link className="button-secondary" to="/implementacion">
              <span aria-hidden="true">←</span> Volver a los pilares
            </Link>
            <Link className="button-ghost" to="/tablero#pilares">
              Ver este pilar en el tablero <span data-arrow aria-hidden="true">→</span>
            </Link>
          </nav>
        </div>
      </div>
    </PublicLayout>
  );
}

/* --- Piezas ---------------------------------------------------------------- */

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "fact fact--wide" : "fact"}>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function Classification({
  label,
  value,
  glyph,
  tone,
}: {
  label: string;
  value: string;
  glyph: string;
  tone: "active" | "neutral";
}) {
  return (
    <div className={`classification classification--${tone}`}>
      <span className="classification__glyph" aria-hidden="true">
        {glyph}
      </span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function StatBlock({
  label,
  value,
  progress,
  caption,
  icon,
}: {
  label: string;
  value: string;
  progress: number;
  caption: string;
  icon: React.ComponentProps<typeof Icon>["name"];
}) {
  return (
    <article className="stat-block">
      <header>
        <span>{label}</span>
        <Icon name={icon} size={17} />
      </header>
      <strong>{value}</strong>
      <span className="progress-track">
        <span className="progress-track__fill" style={{ width: `${progress}%` }} />
      </span>
      <p>{caption}</p>
    </article>
  );
}

function DataTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th scope="col" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --- Fila de la tabla de indicadores ----------------------------------------
   Tres celdas por año. El cumplimiento del año que manda va marcado: de los
   cinco cortes solo uno llega al pilar, y sin señalarlo la tabla no lo dice.
   -------------------------------------------------------------------------- */

function IndicatorRow({
  activity,
  years,
  line,
  highlight,
}: {
  activity: ActivityWithTargets;
  years: number[];
  line?: { area_name: string; code: string | null; name: string };
  /** Año elegido en la barra. Sin año, se marca el que fija el avance. */
  highlight: number | null;
}) {
  const byYear = new Map(activity.targets.map((row) => [row.year, row]));
  const driver = latestTarget(activity.targets);
  const band = bandFor(activity.progress);
  const meta = statusMeta[activity.status];

  return (
    <tr>
      <th scope="row">
        <strong>
          {activity.title}
          {activity.is_featured && <span className="entry-row__flag">En el tablero</span>}
        </strong>
        <small>
          {line
            ? `${line.area_name} › ${line.code ? `${line.code} · ` : ""}${line.name}`
            : "Sin línea de acción"}
        </small>
      </th>

      <td>{activity.unit?.label ?? "—"}</td>

      <td className="result-table__number">
        {activity.baseline_value === null ? (
          "—"
        ) : (
          <>
            {formatValue(activity.baseline_value)}
            {activity.baseline_year && (
              <small className="indicator-table__base-year"> {activity.baseline_year}</small>
            )}
          </>
        )}
      </td>

      {years.map((year) => {
        const row = byYear.get(year);
        // Con un año en la barra se marca ese; con el plan, el que fija el
        // avance del indicador. Marcar los dos a la vez no diría cuál es cuál.
        const isDriver = highlight === null ? driver?.year === year : highlight === year;

        return (
          <Fragment key={year}>
            <td className="result-table__number">{formatValue(row?.target_value)}</td>
            <td className="result-table__number">{formatValue(row?.result_value)}</td>
            <td
              className={`result-table__number${isDriver ? " indicator-table__driver" : ""}`}
              title={
                isDriver
                  ? highlight === null
                    ? "Año que fija el avance del indicador"
                    : "Año elegido en la barra"
                  : undefined
              }
            >
              {row?.compliance === null || row?.compliance === undefined
                ? "—"
                : `${formatValue(row.compliance)} %`}
            </td>
          </Fragment>
        );
      })}

      <td>
        <span className="band-chip" style={{ "--band": band.color } as React.CSSProperties}>
          <span className="band-chip__value">{activity.progress} %</span>
          <span className="band-chip__label">{driver ? `Año ${driver.year}` : meta.label}</span>
        </span>
      </td>
    </tr>
  );
}

/* --- Rastro anual -----------------------------------------------------------
   La serie de un área, una línea o un proyecto en una línea de texto. Va debajo
   del acumulado y no en lugar de él: son dos preguntas distintas —"cómo va" y
   "cómo fue cada año"— y sustituir una por otra perdería la primera.

   Cada año lleva su cifra; el color de la banda es un refuerzo, nunca el dato.
   -------------------------------------------------------------------------- */

function YearTrail({
  scope,
  id,
  index,
}: {
  scope: ProgressScope;
  id: string;
  index: YearIndex;
}) {
  const entries = index.of(scope, id);
  if (entries.length === 0) return null;

  return (
    <ul className="year-trail">
      {entries.map((entry) => {
        const band = bandFor(entry.progress);
        return (
          <li key={entry.year} style={{ "--band": band.color } as React.CSSProperties}>
            <b>{entry.year}</b>
            <span>{entry.progress} %</span>
            <span className="sr-only">{band.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* --- Observaciones ----------------------------------------------------------
   En la página quedan solo los encabezados; el texto se lee en su propia
   ventana. Un balance de varios párrafos intercalado entre tablas de cifras
   compite con ellas y no gana: o interrumpe la lectura de la tabla, o se salta.

   Dentro del modal el texto va justificado y con partición de palabras, que es
   como se lee un informe, y a un ancho de medida controlada.
   -------------------------------------------------------------------------- */

function observationTitle(observation: PillarObservation): string {
  if (observation.title) return observation.title;
  return observation.year ? `Observación del corte ${observation.year}` : "Observación del pilar";
}

/* --- Formulación del proyecto ------------------------------------------------
   Lo que el módulo de proyectos añadió a la fila: vigencia, valor, ODS, a qué
   otros pilares aporta y el documento que lo formula. Va debajo de la cadena de
   estructura y no en su propia sección: es el mismo proyecto, no otra cosa.

   Los otros pilares se nombran a propósito. Un proyecto que aparece en tres
   fichas sin decir que es el mismo se lee como tres proyectos distintos.
   -------------------------------------------------------------------------- */

function ProjectBrief({ project, pillarId }: { project: ProjectWithLinks; pillarId: string }) {
  const elsewhere = [
    ...new Set(
      (project.links ?? [])
        .filter((link) => link.pillar_id !== pillarId)
        .map((link) => link.pillar_id),
    ),
  ];
  const fileUrl = projectFileUrl(project.attachment_path);
  const goals = project.sdg_goals ?? [];

  const facts = [
    formatRange(project.start_date, project.end_date),
    project.total_value !== null ? formatCurrency(project.total_value) : null,
    project.academic_units?.length ? project.academic_units.join(" · ") : null,
  ].filter(Boolean) as string[];

  if (facts.length === 0 && goals.length === 0 && elsewhere.length === 0 && !fileUrl) return null;

  return (
    <div className="project-brief">
      {facts.length > 0 && <span className="project-brief__facts">{facts.join(" · ")}</span>}

      {goals.length > 0 && (
        <ul className="sdg-row sdg-row--compact" aria-label="Objetivos de Desarrollo Sostenible">
          {goals.map((id) => {
            const goal = sdgById.get(id);
            if (!goal) return null;
            return (
              <li key={id} style={{ "--sdg": goal.color } as React.CSSProperties} title={goal.label}>
                <b>{id}</b>
                <span className="sr-only">{goal.label}</span>
              </li>
            );
          })}
        </ul>
      )}

      <span className="project-brief__links">
        {elsewhere.length > 0 && (
          <span className="project-brief__shared">
            También aporta a {elsewhere.length}{" "}
            {elsewhere.length === 1 ? "pilar más" : "pilares más"}
          </span>
        )}
        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="document" size={13} />
            {project.attachment_name ?? "Documento del proyecto"}
          </a>
        )}
      </span>
    </div>
  );
}

function ObservationCard({
  observation,
  onOpen,
}: {
  observation: PillarObservation;
  onOpen: () => void;
}) {
  return (
    <li className="observation">
      <button type="button" className="observation__open" onClick={onOpen}>
        <span className="observation__head">
          <span className="observation__corte">
            {observation.year ? `Corte ${observation.year}` : "Vigente"}
          </span>
          <strong>{observationTitle(observation)}</strong>
        </span>
        {/* Dos líneas de adelanto: lo justo para saber si esta es la que se
            busca, sin convertir la lista en el texto entero. */}
        <span className="observation__preview">{observation.body}</span>
        <span className="observation__cue">
          Leer completa
          <Icon name="arrow-right" size={14} />
        </span>
      </button>
    </li>
  );
}

function ObservationReader({
  observation,
  onClose,
}: {
  observation: PillarObservation;
  onClose: () => void;
}) {
  // Los saltos de línea dobles del formulario se respetan como párrafos: quien
  // escribe separando ideas espera verlas separadas.
  const paragraphs = observation.body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const meta = [observation.year ? `Corte ${observation.year}` : "Observación vigente", observation.author]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal size="reader" title={observationTitle(observation)} description={meta} onClose={onClose}>
      <div className="observation-reader">
        {paragraphs.length === 0 ? (
          <p>{observation.body}</p>
        ) : (
          paragraphs.map((block, position) => <p key={position}>{block}</p>)
        )}
      </div>
    </Modal>
  );
}
