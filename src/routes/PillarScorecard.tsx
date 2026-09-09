/* =============================================================================
   Tablero PDI · cuadro de mando de un pilar

   Otra lectura del mismo pilar que la de "Implementación". Allí se cuenta qué
   es el pilar y qué hay dentro; aquí solo se responde a "cuánto se ha
   cumplido", en cinco pasos: la convención de bandas, los cuatro resultados
   generales, tres tablas —pilar, áreas y líneas, proyectos— con la misma
   estructura, y la serie anual de los indicadores, que es de donde salen todos
   los porcentajes anteriores.

   Nota sobre el color: la escala naranja→verde no es separable bajo
   daltonismo, así que ningún porcentaje se comunica solo con color. Cada celda
   lleva su cifra y el nombre de la banda, y la escala se apoya además en la
   luminosidad (ver tokens.css).
   ========================================================================== */

import { Fragment } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PublicLayout } from "../components/layout/PublicLayout";
import { Icon } from "../components/ui/Icon";
import { ProgressRing } from "../components/ui/ProgressRing";
import { ErrorBlock, LoadingBlock } from "../components/ui/QueryState";
import { useCurrentPeriod, usePillarDetail } from "../data/queries";
import {
  accentFor,
  bandFor,
  complianceBands,
  formatDate,
  formatValue,
  indexYearProgress,
  latestTarget,
  shortYear,
  yearsInPlay,
} from "../data/pdi";
import type { ActivityWithTargets, ProgressScope, TargetFields } from "../types/database";
import type { YearIndex } from "../data/pdi";

export function PillarScorecard() {
  const { slug } = useParams<{ slug: string }>();
  const detail = usePillarDetail(slug);
  const period = useCurrentPeriod();

  if (detail.isPending) {
    return (
      <PublicLayout className="scorecard-page">
        <div className="u-container scorecard">
          <LoadingBlock rows={6} label="Cargando el cuadro de mando" />
        </div>
      </PublicLayout>
    );
  }

  if (detail.isError) {
    return (
      <PublicLayout className="scorecard-page">
        <div className="u-container scorecard">
          <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />
        </div>
      </PublicLayout>
    );
  }

  if (!detail.data) return <Navigate to="/404" replace />;

  const { pillar, progress, areaProgress, projectProgress, lines, activities, yearProgress } =
    detail.data;
  const accent = accentFor(pillar.accent_slot);
  const band = bandFor(progress.progress);

  const areaById = new Map(areaProgress.map((area) => [area.area_id, area]));
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const years = yearsInPlay(activities.flatMap((activity) => activity.targets));
  // La misma cascada, año a año: cada tabla añade una columna por año con
  // algo reportado. Si no hay ninguno, las tablas se quedan como estaban.
  const yearIndex = indexYearProgress(yearProgress);

  return (
    <PublicLayout className="scorecard-page">
      <div className="scorecard" style={{ "--accent": accent } as React.CSSProperties}>
        {/* --- Cabecera: el pilar y su cifra grande ----------------------- */}
        <header className="scorecard-hero">
          <div className="u-container scorecard-hero__inner">
            <div className="scorecard-hero__copy">
              <nav className="scorecard-crumbs" aria-label="Ubicación">
                <Link to="/tablero">Tablero PDI</Link>
                <span aria-hidden="true">›</span>
                <span>Pilar {pillar.numeral}</span>
              </nav>

              <span className="scorecard-hero__icon" aria-hidden="true">
                <Icon name={pillar.icon} size={26} />
              </span>
              <h1>{pillar.name}</h1>
              <p className="lede">{pillar.description}</p>

              <div className="scorecard-hero__meta">
                <span className="meta-pill">{pillar.management_owner}</span>
                {period.data && (
                  <span className="meta-pill">
                    <Icon name="clock" size={14} /> Corte al {formatDate(period.data.cutoff_date)}
                  </span>
                )}
              </div>
            </div>

            <div className="scorecard-hero__gauge">
              <ProgressRing
                value={progress.progress}
                size={168}
                thickness={12}
                color={band.color}
                label={`Cumplimiento de ${pillar.name}`}
              />
              <span className="band-chip band-chip--lg" style={{ "--band": band.color } as React.CSSProperties}>
                {band.label}
              </span>
            </div>
          </div>
        </header>

        <div className="u-container scorecard-body">
          {/* --- 1. Convención de cumplimiento --------------------------- */}
          <section className="scorecard-block" aria-labelledby="convencion-title">
            <div className="scorecard-legend">
              <div className="scorecard-legend__copy">
                <span className="eyebrow">Cómo leer esta página</span>
                <h2 id="convencion-title">Relación de cumplimiento del pilar</h2>
                <p>
                  Cada indicador, proyecto, línea y área se clasifica en una de estas cinco bandas
                  según su porcentaje de avance. El color acompaña siempre al nombre de la banda: la
                  escala no se comunica solo con color.
                </p>
              </div>

              <table className="band-table">
                <caption className="sr-only">Convención de bandas de cumplimiento</caption>
                <thead>
                  <tr>
                    <th scope="col">Cumplimiento</th>
                    <th scope="col">Rango</th>
                  </tr>
                </thead>
                <tbody>
                  {complianceBands.map((item) => (
                    <tr key={item.id} className={item.id === band.id ? "is-current" : undefined}>
                      <th scope="row">
                        <span
                          className="band-swatch"
                          style={{ "--band": item.color } as React.CSSProperties}
                          aria-hidden="true"
                        />
                        {item.label}
                        {item.id === band.id && <span className="band-table__here">este pilar</span>}
                      </th>
                      <td>
                        {item.from} – {item.to} %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="scorecard-total">
              <span>Cumplimiento general del pilar</span>
              <strong style={{ color: band.color }}>{progress.progress} %</strong>
              <small>{band.label}</small>
            </p>
          </section>

          {/* --- 2. Indicadores de resultado general --------------------- */}
          <section className="scorecard-block" aria-labelledby="indicadores-title">
            <div className="section-heading">
              <span className="eyebrow">Resultado general</span>
              <h2 id="indicadores-title">Indicadores del pilar</h2>
            </div>

            <div className="kpi-row">
              <Kpi
                label="Resultados a nivel de pilar"
                value={`${progress.progress} %`}
                hint={`${progress.done} de ${progress.total} indicadores cumplidos`}
                progress={progress.progress}
              />
              <Kpi
                label="Resultado a nivel de áreas estratégicas"
                value={String(progress.area_count)}
                hint={`${progress.line_count} líneas de acción`}
                progress={average(areaProgress.map((area) => area.progress))}
              />
              <Kpi
                label="Resultado a nivel de proyectos"
                value={String(projectProgress.length)}
                hint={`${projectProgress.filter((p) => p.progress >= 90).length} en nivel satisfactorio`}
                progress={average(projectProgress.map((p) => p.progress))}
              />
              <Kpi
                label="Cumplimiento del pilar"
                value={`${progress.progress} %`}
                hint={band.label}
                progress={progress.progress}
                emphasis
              />
            </div>
          </section>

          {/* --- 3. Tabla de pilar --------------------------------------- */}
          <ResultTable
            id="tabla-pilar"
            eyebrow="Resultados"
            title="Resultados a nivel de pilar"
            nameHeader="Nomenclatura del pilar"
            years={yearIndex.years}
            yearIndex={yearIndex}
            rows={[
              {
                key: pillar.id,
                scope: "pillar",
                code: pillar.numeral || "—",
                name: pillar.name,
                target: null,
                achieved: null,
                fallbackTarget: progress.total,
                fallbackAchieved: progress.done,
                progress: progress.progress,
              },
            ]}
          />

          {/* --- 4. Tabla de áreas y líneas ------------------------------ */}
          <ResultTable
            id="tabla-areas"
            eyebrow="Estructura"
            title="Resultados a nivel de áreas y líneas estratégicas"
            nameHeader="Nomenclatura del área o línea"
            years={yearIndex.years}
            yearIndex={yearIndex}
            rows={areaProgress.flatMap((area) => [
              {
                key: area.area_id,
                scope: "area" as const,
                code: area.area_code || "—",
                name: area.area_name,
                target: area.target_value,
                achieved: area.achieved_value,
                unit: area.measure_unit,
                fallbackTarget: area.activity_count,
                fallbackAchieved: area.activity_done,
                progress: area.progress,
              },
              ...lines
                .filter((line) => line.area_id === area.area_id)
                .map((line) => ({
                  key: line.id,
                  scope: "line" as const,
                  code: line.code || "—",
                  name: line.name,
                  target: line.target_value,
                  achieved: line.achieved_value,
                  unit: line.measure_unit,
                  fallbackTarget: line.activity_count,
                  fallbackAchieved: line.activity_done,
                  progress: line.progress,
                  nested: true,
                })),
            ])}
          />

          {/* --- 5. Tabla de proyectos ----------------------------------- */}
          <ResultTable
            id="tabla-proyectos"
            eyebrow="Ejecución"
            title="Resultados a nivel de proyectos"
            nameHeader="Nomenclatura del proyecto"
            years={yearIndex.years}
            yearIndex={yearIndex}
            rows={projectProgress.map((project) => {
              const line = project.action_line_id
                ? lines.find((item) => item.id === project.action_line_id)
                : undefined;
              const area = line ? areaById.get(line.area_id) : undefined;

              return {
                key: project.project_id,
                scope: "project" as const,
                code: line?.code || area?.area_code || "—",
                name: project.name,
                detail: line ? `${line.area_name} › ${line.name}` : "Sin línea de acción",
                target: project.target_value,
                achieved: project.achieved_value,
                unit: project.measure_unit,
                fallbackTarget: project.activity_count,
                fallbackAchieved: project.activity_done,
                progress: project.progress,
              };
            })}
            empty="Este pilar todavía no tiene proyectos registrados."
          />

          {/* --- 6. Serie anual de los indicadores ----------------------
              Las tres tablas anteriores resumen; esta es el dato de origen.
              Todo porcentaje de esta página sale, subiendo por la cascada, de
              la última columna de cumplimiento de estas filas. ------------ */}
          <section className="scorecard-block" id="tabla-indicadores" aria-labelledby="tabla-indicadores-title">
            <div className="section-heading">
              <span className="eyebrow">Medición</span>
              <h2 id="tabla-indicadores-title">Resultados a nivel de indicadores</h2>
            </div>

            {activities.length === 0 ? (
              <p className="scorecard-empty">
                Este pilar todavía no tiene indicadores de resultado registrados.
              </p>
            ) : (
              <>
                <div className="table-scroll">
                  <table className="result-table indicator-table">
                    <caption className="sr-only">
                      Indicadores del pilar: unidad, línea base y, por cada año, meta, resultado y
                      cumplimiento
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
                        <th scope="col">Cumplimiento</th>
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
                      {activities.map((activity) => {
                        const line = activity.action_line_id
                          ? lineById.get(activity.action_line_id)
                          : undefined;
                        return (
                          <IndicatorRow
                            key={activity.id}
                            activity={activity}
                            years={years}
                            detail={
                              line
                                ? `${line.area_name} › ${line.name}`
                                : "Sin línea de acción"
                            }
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="result-table__note">
                  <strong>Cumpl.</strong> es el resultado sobre la meta del año. El año en negrita es
                  el que fija el cumplimiento del indicador, y ese es el que sube a la línea, al área
                  y al pilar.
                </p>
              </>
            )}
          </section>

          <nav className="scorecard-footer" aria-label="Otras vistas del pilar">
            <Link className="button-secondary" to="/tablero">
              <span aria-hidden="true">←</span> Volver al tablero
            </Link>
            <Link className="button-ghost" to={`/implementacion/pilar/${pillar.slug}`}>
              Ver la ficha completa del pilar <span data-arrow aria-hidden="true">→</span>
            </Link>
          </nav>
        </div>
      </div>
    </PublicLayout>
  );

  function average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }
}

/* --- Piezas ---------------------------------------------------------------- */

function Kpi({
  label,
  value,
  hint,
  progress,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint: string;
  progress: number;
  emphasis?: boolean;
}) {
  const band = bandFor(progress);

  return (
    <article
      className={`kpi${emphasis ? " kpi--emphasis" : ""}`}
      style={{ "--band": band.color } as React.CSSProperties}
    >
      <span className="kpi__label">{label}</span>
      <strong className="kpi__value">{value}</strong>
      <span className="kpi__hint">{hint}</span>
      <span className="kpi__bar" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>
      <span className="kpi__band">{band.label}</span>
    </article>
  );
}

/** Una fila de la serie anual: la unidad, la base y tres celdas por año. */
function IndicatorRow({
  activity,
  years,
  detail,
}: {
  activity: ActivityWithTargets;
  years: number[];
  detail: string;
}) {
  const byYear = new Map(activity.targets.map((row) => [row.year, row]));
  const driver = latestTarget(activity.targets);
  const band = bandFor(activity.progress);

  return (
    <tr>
      <th scope="row">
        <strong>{activity.title}</strong>
        <small>{detail}</small>
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
        const isDriver = driver?.year === year;

        return (
          <Fragment key={year}>
            <td className="result-table__number">{formatValue(row?.target_value)}</td>
            <td className="result-table__number">{formatValue(row?.result_value)}</td>
            <td
              className={`result-table__number${isDriver ? " indicator-table__driver" : ""}`}
              title={isDriver ? "Año que fija el cumplimiento del indicador" : undefined}
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
          <span className="band-chip__label">{band.label}</span>
        </span>
      </td>
    </tr>
  );
}

interface ResultRow extends Partial<TargetFields> {
  key: string;
  /** Nivel de la cascada al que pertenece la fila, para buscar sus años. */
  scope: ProgressScope;
  code: string;
  name: string;
  detail?: string;
  target: number | null;
  achieved: number | null;
  unit?: string | null;
  /** Se usa cuando no hay meta absoluta capturada: cuenta indicadores. */
  fallbackTarget: number;
  fallbackAchieved: number;
  progress: number;
  nested?: boolean;
}

function ResultTable({
  id,
  eyebrow,
  title,
  nameHeader,
  rows,
  years,
  yearIndex,
  empty,
}: {
  id: string;
  eyebrow: string;
  title: string;
  nameHeader: string;
  rows: ResultRow[];
  /** Años con algo reportado en el pilar; vacío = tabla sin columnas de año. */
  years: number[];
  yearIndex: YearIndex;
  empty?: string;
}) {
  const usesFallback = rows.some((row) => row.target === null || row.achieved === null);

  return (
    <section className="scorecard-block" id={id} aria-labelledby={`${id}-title`}>
      <div className="section-heading">
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={`${id}-title`}>{title}</h2>
      </div>

      {rows.length === 0 ? (
        <p className="scorecard-empty">{empty}</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="result-table">
              <caption className="sr-only">
                {title}: código, nomenclatura, meta, avance, cumplimiento de cada año y acumulado
              </caption>
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">{nameHeader}</th>
                  <th scope="col">Meta</th>
                  <th scope="col">Avance</th>
                  {years.map((year) => (
                    <th scope="col" key={year} className="result-table__year">
                      Cumpl. {shortYear(year)}
                    </th>
                  ))}
                  <th scope="col">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const band = bandFor(row.progress);
                  const absolute = row.target !== null && row.achieved !== null;
                  const unit = row.unit ? ` ${row.unit}` : "";

                  return (
                    <tr key={row.key} className={row.nested ? "is-nested" : undefined}>
                      <td className="result-table__code">{row.code}</td>
                      <th scope="row">
                        <strong>{row.name}</strong>
                        {row.detail && <small>{row.detail}</small>}
                      </th>
                      <td className="result-table__number">
                        {absolute ? `${row.target}${unit}` : row.fallbackTarget}
                      </td>
                      <td className="result-table__number">
                        {absolute ? `${row.achieved}${unit}` : row.fallbackAchieved}
                      </td>

                      {/* Un año sin nada reportado se deja vacío. Escribir un
                          cero diría "no se cumplió" donde solo hay silencio. */}
                      {years.map((year) => {
                        const value = yearIndex.at(row.scope, row.key, year);
                        if (value === null) {
                          return (
                            <td className="result-table__number" key={year}>
                              <span className="target-empty">—</span>
                            </td>
                          );
                        }
                        const yearBand = bandFor(value);
                        return (
                          <td className="result-table__number" key={year}>
                            <span
                              className="year-cell"
                              style={{ "--band": yearBand.color } as React.CSSProperties}
                              title={`${yearBand.label} en ${year}`}
                            >
                              {value} %
                            </span>
                          </td>
                        );
                      })}

                      <td>
                        {/* La cifra y el nombre de la banda van siempre: el
                            color es un refuerzo, nunca el único dato. */}
                        <span
                          className="band-chip"
                          style={{ "--band": band.color } as React.CSSProperties}
                        >
                          <span className="band-chip__value">{row.progress} %</span>
                          <span className="band-chip__label">{band.label}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {usesFallback && (
            <p className="result-table__note">
              Donde no hay una meta absoluta capturada, <strong>Meta</strong> y{" "}
              <strong>Avance</strong> cuentan indicadores: comprometidos y cumplidos.{" "}
              {years.length > 0 ? (
                <>
                  Las columnas por año son la misma cascada aplicada al cumplimiento de ese año; el{" "}
                  <strong>acumulado</strong> es el estado actual, con el último dato de cada
                  indicador. Un año en blanco no es un cero: es un año que esa fila todavía no ha
                  reportado.
                </>
              ) : (
                <>El porcentaje es siempre el avance en cascada.</>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
