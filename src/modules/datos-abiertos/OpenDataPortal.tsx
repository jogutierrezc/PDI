/* =============================================================================
   Datos Abiertos · UDES en Cifras — portada.

   1. La universidad en movimiento y el nombre del portal escribiéndose en
      paletas, con una fila de llegadas: cuatro cifras titulares del corte.
   2. El tablero de informes: nueve filas con su cifra titular y el corte
      anterior; al pasar por una fila, el andén de la derecha voltea su foto y
      sus cifras. Corte y campus re-voltean el tablero entero.
   3. Cómo leer una cifra: la anatomía del boleto.
   4. Cierre: pedir un dato que no está.
   ========================================================================== */

import { ContextBar } from "../../components/layout/ContextBar";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { BoardControls, useBoardFilters } from "./components/BoardControls";
import { CampusVideo } from "./components/CampusVideo";
import { ChartFrame } from "./components/ChartFrame";
import { ColombiaMap } from "./components/ColombiaMap";
import { FigureTicket } from "./components/FigureTicket";
import { ImageFlap } from "./components/ImageFlap";
import { EmptyPeriod, OpenDataLayout } from "./components/OpenDataLayout";
import { SplitFlap } from "./components/SplitFlap";
import { changeBetween, formatValue, keyIndicators, useOpenDataCatalog, valueOf } from "./data/open-data";
import { ALL_YEARS, cutLabel } from "./data/terms";
import { BulletinDownload } from "../boletin/BulletinDownload";
import type { CampusId, Indicator, OpenDataCatalog, Report, Term } from "./data/types";
import { ObservatoryBoard } from "./observatorio/Observatory";
import "./datos-abiertos.css";

/** Las cuatro cifras de la fila de llegadas: informe e indicador. */
const ARRIVALS: [string, string][] = [
  ["poblacional", "matricula"],
  ["ensenanza", "programas"],
  ["investigacion", "grupos"],
  ["extension", "beneficiarios"],
];

function findIndicator(data: OpenDataCatalog, slug: string, id: string): Indicator | undefined {
  return data.reports.find((r) => r.slug === slug)?.indicators.find((i) => i.id === id);
}

/** Celdas para alinear una columna de cifras a la derecha. */
function cellsFor(indicators: Indicator[], year: number, campus: CampusId, term: Term | null): number {
  return Math.max(1, ...indicators.map((i) => formatValue(valueOf(i, year, campus, term), i.format).length));
}

export function OpenDataPortal() {
  const catalog = useOpenDataCatalog();
  const filters = useBoardFilters(catalog.data ?? undefined);

  return (
    <OpenDataLayout title="UDES en Cifras | Datos Abiertos · Universidad de Santander" className="od-home">
      {catalog.isPending ? (
        <div className="u-container od-state">
          <LoadingBlock rows={4} label="Cargando las cifras" />
        </div>
      ) : catalog.isError ? (
        <div className="u-container od-state">
          <ErrorBlock error={catalog.error} onRetry={() => void catalog.refetch()} />
        </div>
      ) : !catalog.data ? (
        <EmptyPeriod />
      ) : (
        <>
          {/* La misma barra de las fichas: aquí sin informe actual. */}
          <ContextBar
            label="Navegación de UDES en Cifras"
            back={{ to: "/", label: "Planeación Institucional" }}
            links={[{ label: "Boletines", to: "/datos-abiertos/boletines" }]}
            itemsLabel="Informes"
            items={catalog.data.reports.map((r) => ({
              key: r.slug,
              to: `/datos-abiertos/${r.slug}`,
              code: r.code,
              name: r.name,
              tone: `var(--od-line-${r.line})`,
              current: false,
              label: `Abrir · ${r.name}`,
            }))}
          />
          <PortalContent data={catalog.data} {...filters} />
        </>
      )}
    </OpenDataLayout>
  );
}

interface ContentProps extends ReturnType<typeof useBoardFilters> {
  data: OpenDataCatalog;
}

function PortalContent({ data, year, term, campus, setYear, setTerm, setCampus, search }: ContentProps) {
  const campusName = data.campuses.find((c) => c.id === campus)?.name ?? "Todos los campus";
  const arrivals = ARRIVALS.map(([slug, id]) => findIndicator(data, slug, id)).filter(
    (i): i is Indicator => Boolean(i),
  );
  const query = search ? `?${search}` : "";

  return (
    <>
      <section className="od-hero" aria-labelledby="od-titulo">
        <CampusVideo className="od-hero__media" src="/Multimedia1.mp4" poster="/datos-abiertos/portada.webp" />
        <div className="od-hero__scrim" />

        <div className="u-container od-hero__content">
          <h1 id="od-titulo" className="od-hero__title">
            <span className="od-hero__name">Universidad de Santander</span>
            <SplitFlap className="od-hero__flap" value="UDES en Cifras" size="xl" delay={420} stagger={58} />
          </h1>
          <p className="od-hero__lede">Principales estadísticas de las actividades académicas y administrativas</p>
        </div>

        <div className="od-arrivals">
          <div className="u-container od-arrivals__inner">
            <p className="od-arrivals__head">
              <span>
                {year === ALL_YEARS ? "Periodo" : "Corte"} {cutLabel(year, term)} · {campusName}
              </span>
              {data.illustrative && <span className="od-stamp">Cifras ilustrativas</span>}
            </p>
            <div className="od-arrivals__row">
              {arrivals.map((indicator, index) => (
                <FigureTicket
                  key={indicator.id}
                  indicator={indicator}
                  year={year}
                  term={term}
                  campus={campus}
                  campusName={campusName}
                  illustrative={data.illustrative}
                  size="sm"
                  variant="hero"
                  delay={1300 + index * 160}
                />
              ))}
            </div>
            <a className="od-button od-button--signal od-arrivals__cta" href="#informes">
              Ver informes
              <Icon name="chevron-down" size={18} />
            </a>
          </div>
        </div>
      </section>

      <DepartureBoard
        data={data}
        year={year}
        term={term}
        campus={campus}
        campusName={campusName}
        setYear={setYear}
        setTerm={setTerm}
        setCampus={setCampus}
        query={query}
      />

      <ObservatoryBoard />

      <OriginAtlas data={data} year={year} campus={campus} setCampus={setCampus} query={query} />

      <ReadingGuide data={data} />

      <section className="od-closing" aria-labelledby="od-cierre">
        <div className="u-container od-closing__inner">
          <div>
            <h2 id="od-cierre">¿Buscas una cifra que no está en el tablero?</h2>
            <p>
              Escríbenos. La Oficina de Planeación Institucional la gestiona con la oficina que la produce y te
              responde con su corte y su fuente.
            </p>
          </div>
          <div className="od-closing__actions">
            <a
              className="od-button od-button--signal"
              href="mailto:planeacion@udes.edu.co?subject=Solicitud%20de%20datos%20%C2%B7%20UDES%20en%20Cifras"
            >
              Solicitar un dato
            </a>
            <Link className="od-button od-button--ghost" to="/pdi">
              Ir al Portal PDI
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/* --- Tablero de informes ---------------------------------------------------- */

interface BoardProps {
  data: OpenDataCatalog;
  year: number;
  term: Term | null;
  campus: CampusId;
  campusName: string;
  setYear: (year: number) => void;
  setTerm: (term: Term | null) => void;
  setCampus: (campus: CampusId) => void;
  query: string;
}

function DepartureBoard({ data, year, term, campus, campusName, setYear, setTerm, setCampus, query }: BoardProps) {
  const [activeSlug, setActiveSlug] = useState(data.reports[0]?.slug);
  const active = data.reports.find((r) => r.slug === activeSlug) ?? data.reports[0];

  const headlines = useMemo(() => data.reports.map((report) => keyIndicators(report)[0]), [data.reports]);
  const headlineCells = cellsFor(headlines.filter(Boolean), year, campus, term);

  return (
    <section className="od-board" id="informes" aria-labelledby="od-informes">
      <div className="u-container">
        <div className="od-board__head">
          <div className="od-board__intro">
            <h2 id="od-informes">Tablero de informes</h2>
            <p>
              {data.reports.length} informes del periodo {data.period?.label} con las cifras que reporta cada oficina de la universidad. Elige uno para abrir su ficha
              con la evolución, el detalle por campus y los datos para descargar.
            </p>
            <p className="od-board__downloads">
              <BulletinDownload catalog={data} className="od-button od-button--signal" />
              <BulletinDownload catalog={data} format="ejecutivo" className="od-button od-button--ghost" />
              <Link className="od-board__bulletins" to="/datos-abiertos/boletines">
                Todos los boletines y ediciones
              </Link>
            </p>
          </div>
          <BoardControls data={data} year={year} term={term} campus={campus} setYear={setYear} setTerm={setTerm} setCampus={setCampus} />
        </div>

        <div className="od-board__grid">
          <div className="od-departures">
            <div className="od-departures__columns" aria-hidden="true">
              <span>Informe</span>
              <span>Cifra titular · {cutLabel(year, term)}</span>
              <span>{year === ALL_YEARS ? "Cómo se calcula" : "Corte anterior"}</span>
            </div>

            <ol className="od-departures__list">
              {data.reports.map((report, index) => (
                <DepartureRow
                  key={report.slug}
                  report={report}
                  indicator={headlines[index]}
                  index={index}
                  year={year}
                  term={term}
                  campus={campus}
                  cells={headlineCells}
                  active={report.slug === active?.slug}
                  onActivate={() => setActiveSlug(report.slug)}
                  query={query}
                />
              ))}
            </ol>
          </div>

          {active && (
            <aside className="od-platform" aria-label={`Vista previa: ${active.name}`}>
              <ImageFlap className="od-platform__image" src={active.image.src} alt={active.image.alt} />
              <div className="od-platform__body">
                <div className="od-platform__title">
                  <span className="od-line" style={{ "--line": `var(--od-line-${active.line})` } as CSSProperties}>
                    <SplitFlap value={active.code} size="md" />
                  </span>
                  <h3>{active.name}</h3>
                </div>
                <p>{active.description}</p>
                <PlatformFigures report={active} data={data} year={year} term={term} campus={campus} campusName={campusName} />
                <Link className="od-button od-button--signal" to={`/datos-abiertos/${active.slug}${query}`}>
                  Abrir el informe <Icon name="arrow-right" size={17} />
                </Link>
                <small className="od-platform__credit">{active.image.credit}</small>
              </div>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}

function PlatformFigures({
  report,
  data,
  year,
  term,
  campus,
  campusName,
}: {
  report: Report;
  data: OpenDataCatalog;
  year: number;
  term: Term | null;
  campus: CampusId;
  campusName: string;
}) {
  const figures = keyIndicators(report).slice(1, 4);
  const cells = cellsFor(figures, year, campus, term);

  return (
    <div className="od-platform__figures">
      {figures.map((indicator, index) => (
        <FigureTicket
          key={`${report.slug}-${indicator.id}`}
          indicator={indicator}
          year={year}
          term={term}
          campus={campus}
          campusName={campusName}
          illustrative={data.illustrative}
          size="xs"
          variant="compact"
          cells={cells}
          delay={index * 90}
        />
      ))}
    </div>
  );
}

interface RowProps {
  report: Report;
  indicator: Indicator | undefined;
  index: number;
  year: number;
  term: Term | null;
  campus: CampusId;
  cells: number;
  active: boolean;
  onActivate: () => void;
  query: string;
}

function DepartureRow({ report, indicator, index, year, term, campus, cells, active, onActivate, query }: RowProps) {
  const value = indicator ? valueOf(indicator, year, campus, term) : null;
  const previous = indicator ? valueOf(indicator, year - 1, campus, term) : null;
  const change = indicator ? changeBetween(indicator, value, previous) : null;
  const figure = indicator ? formatValue(value, indicator.format) : "—";
  const wave = index * 85;

  return (
    <li>
      <Link
        className="od-row"
        to={`/datos-abiertos/${report.slug}${query}`}
        data-active={active || undefined}
        onMouseEnter={onActivate}
        onFocus={onActivate}
      >
        <span className="od-row__code od-line" style={{ "--line": `var(--od-line-${report.line})` } as CSSProperties}>
          <SplitFlap value={report.code} size="sm" delay={wave} />
        </span>

        <img className="od-row__thumb" src={report.image.src} alt="" loading="lazy" decoding="async" width={120} height={75} />

        <span className="od-row__name">
          <strong>{report.name}</strong>
          <span>{report.summary}</span>
          {indicator && <em className="od-row__source">Reporta: {indicator.source}</em>}
        </span>

        {indicator && (
          <span className="od-row__figure">
            <span className="od-row__digits">
              <SplitFlap
                value={figure}
                length={cells}
                align="end"
                size="sm"
                delay={wave + 140}
                numeric
                label={value === null ? `${indicator.label}: sin reportar` : `${indicator.label}: ${figure} ${indicator.unit}`}
              />
              <span className="od-row__unit" aria-hidden="true">
                {value === null ? "s. r." : indicator.unit === "%" ? "%" : ""}
              </span>
            </span>
            <span className="od-row__indicator">{indicator.label}</span>
          </span>
        )}

        <span className="od-row__previous">
          {indicator && year === ALL_YEARS && <span>{indicator.periodBasis?.[campus] ?? "sin cifras en el periodo"}</span>}
          {indicator && year !== ALL_YEARS && (
            <>
              <span>
                {cutLabel(year - 1, term)}: {previous === null ? "sin reportar" : formatValue(previous, indicator.format)}
              </span>
              {change && (
                <span className="od-row__change" data-reading={change.reading}>
                  {change.label}
                </span>
              )}
            </>
          )}
        </span>

        <span className="od-row__go" aria-hidden="true">
          <Icon name="arrow-right" size={20} />
        </span>
      </Link>
    </li>
  );
}

/* --- La universidad en el mapa ------------------------------------------- */

function OriginAtlas({
  data,
  year,
  campus,
  setCampus,
  query,
}: {
  data: OpenDataCatalog;
  year: number;
  campus: CampusId;
  setCampus: (campus: CampusId) => void;
  query: string;
}) {
  const report = data.reports.find((r) => r.slug === "poblacional");
  const dataset = report?.maps?.find((m) => m.mode === "origen");
  if (!report || !dataset) return null;

  return (
    <section className="od-atlas" aria-labelledby="od-atlas">
      <div className="u-container">
        <div className="od-atlas__head">
          <div>
            <h2 id="od-atlas">De dónde viene la universidad</h2>
            <p>
              Cada campus recibe estudiantes de toda la región. El color dice cuántos aporta cada departamento y las
              líneas los llevan hasta el campus donde estudian. Toca un campus para aislarlo.
            </p>
          </div>
          <Link className="od-button od-button--ghost" to={`/datos-abiertos/poblacional${query}`}>
            Ver el informe Poblacional <Icon name="arrow-right" size={16} />
          </Link>
        </div>
        <ChartFrame
          title={dataset.title}
          subtitle={`${year === ALL_YEARS ? `Periodo ${cutLabel(year, null)} · promedio anual` : `Corte ${year}`} · ${dataset.unit}`}
          source={dataset.source}
        >
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

/* --- Cómo leer una cifra -------------------------------------------------- */

function ReadingGuide({ data }: { data: OpenDataCatalog }) {
  const enrolled = findIndicator(data, "poblacional", "matricula");
  const groups = findIndicator(data, "investigacion", "grupos");

  return (
    <section className="od-reading" id="lectura" aria-labelledby="od-lectura">
      <div className="u-container od-reading__grid">
        <div className="od-reading__intro">
          <h2 id="od-lectura">Cómo leer una cifra</h2>
          <p>
            Cada número del portal viaja con lo necesario para citarlo sin llamar a nadie: de qué corte es, con qué se
            compara y qué oficina lo reporta. Las fichas descargan sus cifras en CSV, listas para Excel.
          </p>

          <ol className="od-anatomy">
            <li>
              <span className="od-pin" aria-hidden="true">A</span>
              <div>
                <strong>La cifra del corte</strong>
                <p>El valor del año y el campus elegidos. Cuando llega un dato nuevo, voltea hasta asentarse.</p>
              </div>
            </li>
            <li>
              <span className="od-pin" aria-hidden="true">B</span>
              <div>
                <strong>El corte anterior</strong>
                <p>El año previo y su variación. Las tasas cambian en puntos porcentuales; los conteos, en porcentaje.</p>
              </div>
            </li>
            <li>
              <span className="od-pin" aria-hidden="true">C</span>
              <div>
                <strong>El boleto de origen</strong>
                <p>La oficina que reporta, el campus y el corte. Sin boleto no se publica la cifra.</p>
              </div>
            </li>
            <li>
              <span className="od-pin" aria-hidden="true">D</span>
              <div>
                <strong>Sin reportar no es cero</strong>
                <p>Un dato que no llegó se muestra como sin reportar. Un cero diría que no hubo, y eso es otra afirmación.</p>
              </div>
            </li>
          </ol>
        </div>

        <figure className="od-specimen">
          {enrolled && (
            <div className="od-specimen__sheet">
              <FigureTicket
                indicator={enrolled}
                year={data.currentYear}
                campus="todas"
                campusName="Todos los campus"
                illustrative={data.illustrative}
                size="lg"
                annotate={["A", "B", "C"]}
              />
            </div>
          )}
          {groups && (
            <div className="od-specimen__sheet od-specimen__sheet--small">
              <FigureTicket
                indicator={groups}
                year={data.years[0]}
                campus="valledupar"
                campusName="Valledupar"
                illustrative={data.illustrative}
                size="sm"
                annotate={["D"]}
              />
            </div>
          )}
          <figcaption>
            Ejemplo con cifras del informe Poblacional y del informe de Investigación en Valledupar.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
