/* =============================================================================
   Datos Abiertos · ficha de un informe.

   Se entiende sin haber pasado por la portada: dice qué informe es, de qué
   oficinas salen sus cifras y a qué corte corresponden. Corte y campus viajan en
   la URL, igual que en el tablero, así que la ficha se comparte tal como se ve.

   Orden de lectura, de lo general a lo detallado:
     tablero de KPI → evolución por campus → mapa (si el informe lo tiene) →
     tubería (permanencia) → mapa de calor → desgloses → tabla dinámica →
     qué mide cada cifra.

   Cambiar de informe desde la barra no desmonta la página: la foto de cabecera
   voltea como una paleta y las cifras se reescriben.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { BoardControls, useBoardFilters } from "./components/BoardControls";
import { ChartFrame, ViewSwitch } from "./components/ChartFrame";
import { BarList, YearBars } from "./components/Charts";
import { ColombiaMap } from "./components/ColombiaMap";
import { Donut } from "./components/Donut";
import { Heatmap } from "./components/Heatmap";
import { ImageFlap } from "./components/ImageFlap";
import { KpiBoard } from "./components/KpiBoard";
import { LineChart } from "./components/LineChart";
import type { LineSeries } from "./components/LineChart";
import { EmptyPeriod, OpenDataLayout } from "./components/OpenDataLayout";
import { PivotTable } from "./components/PivotTable";
import { Pipeline } from "./components/Pipeline";
import { SplitFlap } from "./components/SplitFlap";
import {
  downloadText,
  findReport,
  formatCutoff,
  keyIndicators,
  reportToCsv,
  useOpenDataCatalog,
  valueOf,
} from "./data/open-data";
import type { CampusId, Indicator, OpenDataCatalog, Report, ReportBlock } from "./data/types";
import { ALL_CAMPUSES, DEFAULT_BLOCK_ORDER } from "./data/types";
import "./datos-abiertos.css";

export function OpenDataReport() {
  const { slug } = useParams();
  const catalog = useOpenDataCatalog();
  const filters = useBoardFilters(catalog.data ?? undefined);
  const report = catalog.data ? findReport(catalog.data, slug) : undefined;

  return (
    <OpenDataLayout
      title={report ? `${report.name} | UDES en Cifras` : "Informe | UDES en Cifras"}
      className="od-report-page"
    >
      {catalog.isPending ? (
        <div className="u-container od-state">
          <LoadingBlock rows={4} label="Cargando el informe" />
        </div>
      ) : catalog.isError ? (
        <div className="u-container od-state">
          <ErrorBlock error={catalog.error} onRetry={() => void catalog.refetch()} />
        </div>
      ) : !catalog.data ? (
        <EmptyPeriod />
      ) : !report ? (
        <section className="od-missing">
          <div className="u-container">
            <SplitFlap value="SIN INFORME" size="md" />
            <h1>Este informe no existe</h1>
            <p>Puede que el enlace esté incompleto o que el informe haya cambiado de nombre.</p>
            <Link className="od-button od-button--signal" to="/datos-abiertos#informes">
              Ver los nueve informes
            </Link>
          </div>
        </section>
      ) : (
        <ReportContent data={catalog.data} report={report} {...filters} />
      )}
    </OpenDataLayout>
  );
}

interface ContentProps extends ReturnType<typeof useBoardFilters> {
  data: OpenDataCatalog;
  report: Report;
}

function ReportContent({ data, report, year, campus, setYear, setCampus, search }: ContentProps) {
  const query = search ? `?${search}` : "";
  const campusName = data.campuses.find((c) => c.id === campus)?.name ?? "Todos los campus";
  const keys = keyIndicators(report);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selected = report.indicators.find((i) => i.id === pickedId) ?? keys[0] ?? report.indicators[0];
  const sources = useMemo(
    () => Array.from(new Set([...report.indicators.map((i) => i.source), ...report.breakdowns.map((b) => b.source)])),
    [report],
  );

  const index = data.reports.findIndex((r) => r.slug === report.slug);
  const previousReport = data.reports[(index - 1 + data.reports.length) % data.reports.length];
  const nextReport = data.reports[(index + 1) % data.reports.length];
  const lineStyle = (line: number) => ({ "--line": `var(--od-line-${line})` }) as CSSProperties;

  const download = () => {
    downloadText(`udes-en-cifras-${report.slug}.csv`, reportToCsv(report, data.years, data.campuses));
  };

  // Primero los KPI clave, luego el resto de indicadores del informe.
  const boardIndicators = [...keys, ...report.indicators.filter((i) => !report.keyIndicators.includes(i.id))];

  return (
    <>
      <section className="od-report-head" aria-labelledby="od-informe">
        <div className="u-container od-report-head__grid">
          <div className="od-report-head__text">
            <Link className="od-back" to={`/datos-abiertos${query}#informes`}>
              <Icon name="arrow-left" size={16} /> Tablero de informes
            </Link>
            <span className="od-report-head__code od-line" style={lineStyle(report.line)}>
              <SplitFlap key={report.slug} value={report.code} size="lg" delay={80} />
            </span>
            <h1 id="od-informe">{report.name}</h1>
            <p>{report.description}</p>
            <dl className="od-report-head__facts">
              <div>
                <dt>Reportan</dt>
                <dd>{sources.join(" · ")}</dd>
              </div>
              <div>
                <dt>Corte publicado</dt>
                <dd>
                  {formatCutoff(data.cutoffDate)}
                  {data.illustrative && <span className="od-stamp">Cifras ilustrativas</span>}
                </dd>
              </div>
            </dl>
          </div>

          <figure className="od-report-head__media">
            <ImageFlap src={report.image.src} alt={report.image.alt} eager />
            <figcaption>{report.image.credit}</figcaption>
          </figure>
        </div>
      </section>

      <div className="od-report-bar">
        <div className="u-container od-report-bar__inner">
          <nav className="od-switcher" aria-label="Cambiar de informe">
            {data.reports.map((r) => (
              <Link
                key={r.slug}
                to={`/datos-abiertos/${r.slug}${query}`}
                className="od-switcher__item"
                aria-current={r.slug === report.slug ? "page" : undefined}
                title={r.name}
                style={lineStyle(r.line)}
              >
                <span aria-hidden="true">{r.code}</span>
                <span className="sr-only">{r.name}</span>
              </Link>
            ))}
          </nav>
          <BoardControls data={data} year={year} campus={campus} setYear={setYear} setCampus={setCampus} />
          <button type="button" className="od-button od-button--ghost od-report-bar__csv" onClick={download}>
            <Icon name="download" size={16} /> CSV
          </button>
        </div>
      </div>

      {/* La intranet decide qué bloques salen y en qué orden (od_report_blocks).
          Un bloque sin datos no se pinta: una sección vacía no informa de nada. */}
      {orderedBlocks(report).map((block, blockIndex) => {
        const key = `${block.kind}-${block.refKey ?? blockIndex}`;
        switch (block.kind) {
          case "kpis":
            return (
              <section className="od-keyrow" aria-labelledby="od-clave" key={key}>
                <div className="u-container">
                  <div className="od-keyrow__head">
                    <h2 id="od-clave">{block.settings.title || "Tablero de indicadores"}</h2>
                    <p>
                      {campusName} · corte {year}. Elige un indicador para verlo en la gráfica de evolución.
                    </p>
                  </div>
                  <KpiBoard
                    indicators={boardIndicators}
                    years={data.years}
                    year={year}
                    campus={campus}
                    campusName={campusName}
                    illustrative={data.illustrative}
                    selectedId={selected?.id}
                    onSelect={(id) => {
                      setPickedId(id);
                      document.getElementById("od-evolucion")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  />
                </div>
              </section>
            );
          case "evolucion":
            return selected ? (
              <Evolution
                key={key}
                data={data}
                indicator={selected}
                indicators={report.indicators}
                onPick={setPickedId}
                year={year}
                campus={campus}
                campusName={campusName}
                setYear={setYear}
                defaultView={block.settings.chart === "barras" ? "barras" : "lineas"}
              />
            ) : null;
          case "mapa": {
            const dataset = report.maps?.find((m) => m.id === block.refKey) ?? (block.refKey ? undefined : report.maps?.[0]);
            if (!dataset) return null;
            return (
              <section className="od-section" key={key} aria-labelledby={`od-mapa-${dataset.id}`}>
                <div className="u-container">
                  <header className="od-section__head">
                    <h2 id={`od-mapa-${dataset.id}`}>{block.settings.title || dataset.title}</h2>
                    <p>{dataset.description}</p>
                  </header>
                  <ChartFrame title="Mapa por departamento" subtitle={`Corte ${year} · ${dataset.unit}`} source={dataset.source}>
                    <ColombiaMap
                      dataset={dataset}
                      year={year}
                      years={data.years}
                      campus={campus}
                      campuses={data.campuses}
                      onSelectCampus={setCampus}
                    />
                  </ChartFrame>
                </div>
              </section>
            );
          }
          case "tuberia":
            if (!report.pipeline || report.pipeline.cohorts.length === 0) return null;
            return (
              <section className="od-section" key={key} aria-labelledby="od-tuberia">
                <div className="u-container">
                  <header className="od-section__head">
                    <h2 id="od-tuberia">{block.settings.title || report.pipeline.title}</h2>
                    <p>{report.pipeline.description}</p>
                  </header>
                  <ChartFrame
                    title="Deserción por tramo"
                    subtitle={`${campusName} · pasa por una fuga para leerla`}
                    source={report.pipeline.source}
                  >
                    <Pipeline data={report.pipeline} campus={campus} campusName={campusName} />
                  </ChartFrame>
                </div>
              </section>
            );
          case "mapa_calor": {
            const heatmap = report.heatmaps?.find((h) => h.id === block.refKey) ?? (block.refKey ? undefined : report.heatmaps?.[0]);
            if (!heatmap || heatmap.values.flat().every((v) => v === null)) return null;
            return (
              <section className="od-section" key={key} aria-labelledby={`od-calor-${heatmap.id}`}>
                <div className="u-container">
                  <header className="od-section__head">
                    <h2 id={`od-calor-${heatmap.id}`}>{block.settings.title || heatmap.title}</h2>
                    <p>{heatmap.description}</p>
                  </header>
                  <ChartFrame
                    title="Mapa de calor"
                    subtitle={`${heatmap.rowLabel} × ${heatmap.columnLabel} · ${heatmap.unit}`}
                    source={heatmap.source}
                  >
                    <Heatmap data={heatmap} />
                  </ChartFrame>
                </div>
              </section>
            );
          }
          case "desgloses":
            return report.breakdowns.length > 0 ? (
              <Breakdowns
                key={key}
                report={report}
                year={year}
                campus={campus}
                setYear={setYear}
                title={block.settings.title}
              />
            ) : null;
          case "tabla_dinamica":
            return (
              <section className="od-section" key={key} aria-labelledby="od-tabla">
                <div className="u-container">
                  <header className="od-section__head">
                    <h2 id="od-tabla">{block.settings.title || "Tabla dinámica"}</h2>
                    <p>
                      Arma tu propia tabla: elige qué va en filas y en columnas, fija la tercera dimensión, ordena con un
                      clic en el encabezado y descarga exactamente lo que ves.
                    </p>
                  </header>
                  <ChartFrame title="Todas las cifras del informe" subtitle="Indicador · campus · año" source={sources.join(" · ")}>
                    <PivotTable
                      key={report.slug}
                      report={report}
                      years={data.years}
                      campuses={data.campuses}
                      year={year}
                      campus={campus}
                    />
                  </ChartFrame>
                </div>
              </section>
            );
          case "metodologia":
            return (
              <section className="od-section" key={key} aria-labelledby="od-metodo">
                <div className="u-container od-method">
                  <header className="od-section__head">
                    <h2 id="od-metodo">{block.settings.title || "Qué mide cada cifra"}</h2>
                    {report.note && <p>{report.note}</p>}
                  </header>
                  <dl className="od-method__list">
                    {report.indicators.map((indicator) => (
                      <div key={indicator.id}>
                        <dt>{indicator.label}</dt>
                        <dd>
                          {indicator.definition}
                          <span>
                            Unidad: {indicator.unit} · Reporta: {indicator.source}
                          </span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>
            );
          default:
            return null;
        }
      })}

      <nav className="od-next" aria-label="Otros informes">
        <div className="u-container od-next__inner">
          <Link className="od-next__link" to={`/datos-abiertos/${previousReport.slug}${query}`}>
            <span className="od-next__dir">
              <Icon name="arrow-left" size={16} /> Anterior
            </span>
            <span className="od-next__name">
              <span className="od-line" style={lineStyle(previousReport.line)}>
                <SplitFlap key={`p-${previousReport.slug}`} value={previousReport.code} size="sm" />
              </span>
              {previousReport.name}
            </span>
          </Link>
          <Link className="od-next__link od-next__link--next" to={`/datos-abiertos/${nextReport.slug}${query}`}>
            <span className="od-next__dir">
              Siguiente <Icon name="arrow-right" size={16} />
            </span>
            <span className="od-next__name">
              <span className="od-line" style={lineStyle(nextReport.line)}>
                <SplitFlap key={`n-${nextReport.slug}`} value={nextReport.code} size="sm" />
              </span>
              {nextReport.name}
            </span>
          </Link>
        </div>
      </nav>
    </>
  );
}

/* --- Evolución y campus ----------------------------------------------------- */

/** Orden de la ficha: el de la intranet, o el de siempre si el informe no declara bloques. */
function orderedBlocks(report: Report): ReportBlock[] {
  if (report.blocks && report.blocks.length > 0) {
    return [...report.blocks].filter((block) => block.visible).sort((x, y) => x.position - y.position);
  }
  const blocks: ReportBlock[] = [];
  for (const kind of DEFAULT_BLOCK_ORDER) {
    if (kind === "mapa") {
      (report.maps ?? []).forEach((m) => blocks.push({ kind, refKey: m.id, visible: true, position: blocks.length, settings: {} }));
    } else if (kind === "mapa_calor") {
      (report.heatmaps ?? []).forEach((h) => blocks.push({ kind, refKey: h.id, visible: true, position: blocks.length, settings: {} }));
    } else {
      blocks.push({ kind, refKey: null, visible: true, position: blocks.length, settings: {} });
    }
  }
  return blocks;
}

function Evolution({
  data,
  indicator,
  indicators,
  onPick,
  year,
  campus,
  campusName,
  setYear,
  defaultView = "lineas",
}: {
  data: OpenDataCatalog;
  indicator: Indicator;
  indicators: Indicator[];
  onPick: (id: string) => void;
  year: number;
  campus: CampusId;
  campusName: string;
  setYear: (year: number) => void;
  defaultView?: "lineas" | "barras";
}) {
  const [view, setView] = useState<"lineas" | "barras">(defaultView);
  const [siteView, setSiteView] = useState<"barras" | "circular">("barras");

  // Tres colores validados para daltonismo: desde el cuarto campus el color se
  // repite, y la leyenda y la etiqueta final cargan la identidad.
  const siteSeries: LineSeries[] = data.campuses
    .filter((c) => c.id !== ALL_CAMPUSES)
    .map((c, index) => ({
      id: c.id,
      label: c.name,
      color: `var(--od-series-${(index % 3) + 1})`,
      values: data.years.map((y) => valueOf(indicator, y, c.id)),
    }));
  const totalSeries: LineSeries = {
    id: "todas",
    label: "Total institucional",
    color: "var(--od-series-total)",
    dashed: true,
    values: data.years.map((y) => valueOf(indicator, y, "todas")),
  };
  const hasSites = siteSeries.some((s) => s.values.some((v) => v !== null));
  const series = hasSites ? [...siteSeries, totalSeries] : [totalSeries];
  // Un conteo sumado aplasta las líneas de los campus: el total arranca apagado.
  const hiddenByDefault = indicator.format === "entero" && hasSites ? ["todas"] : [];

  const points = data.years.map((y) => ({ year: y, value: valueOf(indicator, y, campus) }));
  const campusItems = data.campuses
    .filter((c) => c.id !== "todas")
    .map((c) => ({ label: c.name, value: valueOf(indicator, year, c.id), highlight: c.id === campus }));
  const hasCampusData = campusItems.some((item) => item.value !== null);
  const campusEverReported = data.years.some((y) =>
    data.campuses.some((c) => c.id !== "todas" && valueOf(indicator, y, c.id) !== null),
  );
  const total = valueOf(indicator, year, "todas");
  const summable =
    indicator.format === "entero" &&
    total !== null &&
    campusItems.every((i) => i.value !== null) &&
    campusItems.reduce((s, i) => s + (i.value ?? 0), 0) === total;

  return (
    <section className="od-section" id="od-evolucion" aria-labelledby="od-evolucion-titulo">
      <div className="u-container">
        <header className="od-section__head od-section__head--split">
          <div>
            <h2 id="od-evolucion-titulo">{indicator.label}</h2>
            <p>
              {indicator.definition} Reporta: {indicator.source}.
            </p>
          </div>
          <label className="od-select">
            <span>Indicador</span>
            <select value={indicator.id} onChange={(event) => onPick(event.target.value)}>
              {indicators.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="od-evolution">
          <ChartFrame
            title="Evolución por corte"
            subtitle={view === "lineas" ? `Por campus · ${indicator.unit}` : `${campusName} · ${indicator.unit}`}
            source={indicator.source}
            actions={
              <ViewSwitch
                label="Tipo de gráfica"
                options={[
                  { value: "lineas", label: "Líneas" },
                  { value: "barras", label: "Barras" },
                ]}
                value={view}
                onChange={setView}
              />
            }
          >
            {view === "lineas" ? (
              <LineChart
                key={`${indicator.id}-${hasSites}`}
                label={`${indicator.label} por campus y año`}
                years={data.years}
                series={series}
                format={indicator.format}
                unit={indicator.unit}
                selectedYear={year}
                onSelectYear={setYear}
                initiallyHidden={hiddenByDefault}
              />
            ) : (
              <YearBars
                title={`${indicator.label}, ${campusName}, por año`}
                points={points}
                selectedYear={year}
                format={indicator.format}
                unit={indicator.unit}
                onSelectYear={setYear}
              />
            )}
          </ChartFrame>

          <ChartFrame
            title="Por campus"
            subtitle={`Corte ${year} · ${indicator.unit}`}
            actions={
              summable ? (
                <ViewSwitch
                  label="Tipo de gráfica por campus"
                  options={[
                    { value: "barras", label: "Barras" },
                    { value: "circular", label: "Circular" },
                  ]}
                  value={siteView}
                  onChange={setSiteView}
                />
              ) : undefined
            }
          >
            {!hasCampusData ? (
              <p className="od-empty">
                {campusEverReported
                  ? `Ningún campus reportó esta cifra para ${year}.`
                  : "Esta cifra se reporta solo para el total institucional: los campus no la desagregan."}
              </p>
            ) : summable && siteView === "circular" ? (
              <Donut label={`${indicator.label} por campus, ${year}`} items={campusItems} format={indicator.format} unit={indicator.unit} />
            ) : (
              <BarList
                items={campusItems}
                format={indicator.format}
                unit={indicator.unit}
                share={summable}
                label={`${indicator.label} por campus, ${year}`}
              />
            )}
          </ChartFrame>
        </div>
      </div>
    </section>
  );
}

/* --- Desgloses ------------------------------------------------------------- */

function Breakdowns({
  report,
  year,
  campus,
  setYear,
  title,
}: {
  report: Report;
  year: number;
  campus: CampusId;
  setYear: (year: number) => void;
  title?: string;
}) {
  const [views, setViews] = useState<Record<string, "circular" | "barras">>({});

  return (
    <section className="od-section" aria-labelledby="od-desgloses">
      <div className="u-container">
        <header className="od-section__head">
          <h2 id="od-desgloses">{title || "Desgloses"}</h2>
          <p>
            Cómo se reparte la cifra por dentro. Los desgloses se publican para el total institucional
            {campus !== "todas" ? ", así que no cambian al elegir un campus" : ""}.
          </p>
        </header>

        <div className="od-breakdowns">
          {report.breakdowns.map((breakdown) => {
            const items = breakdown.values[year];
            const available = Object.keys(breakdown.values).map(Number).sort((a, b) => a - b);
            const latest = available[available.length - 1];
            // Una parte de un todo se lee en circular; una tasa por categoría, en barras.
            const canCircle = breakdown.unit !== "%";
            const view = views[breakdown.id] ?? (canCircle && breakdown.defaultChart !== "barras" ? "circular" : "barras");
            return (
              <ChartFrame
                key={breakdown.id}
                title={breakdown.title}
                subtitle={`Corte ${year} · Todos los campus · ${breakdown.unit}`}
                source={breakdown.source}
                actions={
                  canCircle && items ? (
                    <ViewSwitch
                      label={`Tipo de gráfica: ${breakdown.title}`}
                      options={[
                        { value: "circular", label: "Circular" },
                        { value: "barras", label: "Barras" },
                      ]}
                      value={view}
                      onChange={(v) => setViews((prev) => ({ ...prev, [breakdown.id]: v }))}
                    />
                  ) : undefined
                }
              >
                {!items ? (
                  <div className="od-empty">
                    <p>
                      Este desglose se publica desde {available[0]}. Para {year} no hay reporte.
                    </p>
                    <button type="button" className="od-button od-button--line" onClick={() => setYear(latest)}>
                      Ver el corte {latest}
                    </button>
                  </div>
                ) : view === "circular" ? (
                  <Donut label={`${breakdown.title}, ${year}`} items={items} format={breakdown.format} unit={breakdown.unit} />
                ) : (
                  <BarList
                    items={items}
                    format={breakdown.format}
                    unit={breakdown.unit}
                    share={canCircle}
                    label={`${breakdown.title}, ${year}`}
                  />
                )}
              </ChartFrame>
            );
          })}
        </div>
      </div>
    </section>
  );
}
