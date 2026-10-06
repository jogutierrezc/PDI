/* =============================================================================
   Datos Abiertos · ficha de un informe.

   Se entiende sin haber pasado por la portada: dice qué informe es, de qué
   oficinas salen sus cifras y a qué corte corresponden. Corte y campus viajan en
   la URL, igual que en el tablero, así que la ficha se comparte tal como se ve.

   La ficha se lee primero por periodo académico: abre en el periodo más
   reciente con dato del informe, compara con el periodo anterior y con el
   mismo periodo del año anterior, y sus gráficas recorren los periodos. La
   cifra del año («Año») y todo el periodo agrupado («Todos») siguen en la
   barra, como lecturas secundarias. Lo que solo se reporta por año lo dice.

   Orden de lectura, de lo general a lo detallado:
     tablero de KPI → evolución por campus → evolución histórica → mapa (si
     el informe lo tiene) → tubería (permanencia) → mapa de calor → desgloses →
     tabla dinámica → qué mide cada cifra. Un informe puede tener varios
     conjuntos de cada tipo; cada bloque apunta al suyo.

   Cambiar de informe desde la barra no desmonta la página: la foto de cabecera
   voltea como una paleta y las cifras se reescriben.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ContextBar } from "../../components/layout/ContextBar";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { BoardControls, useBoardFilters } from "./components/BoardControls";
import { ChartFrame, ViewSwitch } from "./components/ChartFrame";
import { BarList, YearBars } from "./components/Charts";
import { AnnualTermChart } from "./components/AnnualTermChart";
import { YearFilter, useVisibleYears } from "./components/YearFilter";
import { BreakdownChart } from "./components/BreakdownChart";
import { ColombiaMap } from "./components/ColombiaMap";
import { WorldMap } from "./components/WorldMap";
import { AgreementsMap } from "./components/AgreementsMap";
import { BulletinDownload } from "../boletin/BulletinDownload";
import { Donut } from "./components/Donut";
import { Heatmap } from "./components/Heatmap";
import { HistoryCompare } from "./components/HistoryCompare";
import { ImageFlap } from "./components/ImageFlap";
import { KpiBoard } from "./components/KpiBoard";
import { LineChart } from "./components/LineChart";
import type { LineSeries } from "./components/LineChart";
import { EmptyPeriod, OpenDataLayout } from "./components/OpenDataLayout";
import { PivotTable } from "./components/PivotTable";
import { LeakyPipeline } from "./components/LeakyPipeline";
import { SplitFlap } from "./components/SplitFlap";
import { ReportSectionView, SECTION_STATUS_LABEL } from "./components/ReportSection";
import { TableBlock } from "./components/TableBlock";
import {
  findReport,
  cutsOf,
  formatCutoff,
  hasTerms,
  keyIndicators,
  useOpenDataCatalog,
  valueOf,
} from "./data/open-data";
import { imagesOf, reportImageUrl } from "./data/images";
import { ALL_YEARS, ANNUAL_RULE_LABEL, cutCode, cutCodeLabel, cutLabel, fromCutCode } from "./data/terms";
import { periodReading } from "./data/period-reading";
import type { Breakdown, CampusId, Indicator, MapDataset, OpenDataCatalog, Report, ReportBlock, Term } from "./data/types";
import { blockPicks, groupedTableViews, inSectionOf, lastFreeBlock as lastFreeBlockOf, orderedBlocks, ownFreeViews as ownFreeViewsOf, pairedMaps as pairedMapsOf, saberProOf, saberTytOf } from "./data/groups";
import { csvZipName } from "./data/csv-export";
import { EXPORT_GROUPS, exportsOfBlock, readmeText, reportExports, sourceOf } from "./data/export-registry";
import type { ExportEntry, ExportSource } from "./data/export-registry";
import { CsvAction } from "./components/CsvAction";
import { ExportSelector } from "./components/ExportSelector";
import { RankingsBlock } from "./components/RankingsBlock";
import { MedalBoardBlock } from "./components/MedalBoardBlock";
import { SaberProBlock } from "./components/SaberProBlock";
import { SaberTytBlock } from "./components/SaberTytBlock";
import { DiversityBoard } from "./components/DiversityBoard";
import { OriginMap } from "./components/OriginMap";
import { PredictiveModel } from "./components/PredictiveModel";
import { CustomTablesBlock, FreeSetBlock } from "./components/FreeSetBlock";
import { ALL_CAMPUSES, MAP_MODE_TITLE, isMobilityMap, isWorldMap } from "./data/types";
import "./datos-abiertos.css";

export function OpenDataReport() {
  const { slug } = useParams();
  const catalog = useOpenDataCatalog();
  const report = catalog.data ? findReport(catalog.data, slug) : undefined;
  const filters = useBoardFilters(catalog.data ?? undefined, report);

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

function ReportContent({ data, report, year, term, campus, setYear, setTerm, setCut, setCampus, search }: ContentProps) {
  const query = search ? `?${search}` : "";
  const campusName = data.campuses.find((c) => c.id === campus)?.name ?? "Todos los campus";
  const keys = keyIndicators(report);
  const [pickedId, setPickedId] = useState<string | null>(null);
  // La barra de informes, corte, campus y descargas se pliega sola al bajar:
  // lo principal es la ficha. Quien la abre o la cierra decide (manual).
  const [barManual, setBarManual] = useState<boolean | null>(null);
  const [scrolled, setScrolled] = useState(false);
  // Selector de descargas en CSV: un diálogo que se abre desde la barra.
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const barOpen = barManual ?? !scrolled;
  const cutSummary = year === ALL_YEARS ? `Todos · ${cutLabel(ALL_YEARS, null)}` : term ? `Periodo ${cutLabel(year, term)}` : `Año ${cutLabel(year, null)}`;
  const selected = report.indicators.find((i) => i.id === pickedId) ?? keys[0] ?? report.indicators[0];
  const sources = useMemo(
    () => Array.from(new Set([...report.indicators.map((i) => i.source), ...report.breakdowns.map((b) => b.source)])),
    [report],
  );

  const index = data.reports.findIndex((r) => r.slug === report.slug);
  const previousReport = data.reports[(index - 1 + data.reports.length) % data.reports.length];
  const nextReport = data.reports[(index + 1) % data.reports.length];
  const lineStyle = (line: number) => ({ "--line": `var(--od-line-${line})` }) as CSSProperties;

  // Lo que se puede bajar en CSV: los conjuntos que la ficha pinta, en su orden.
  // La acción de cada bloque y el selector de la barra leen la misma lista, así
  // el archivo de un bloque es el mismo que entrega el selector.
  const exports = useMemo(() => reportExports(report, data), [report, data]);
  const zipName = csvZipName(report.slug);
  /** Varios archivos de un mismo bloque bajan en un zip con el nombre del bloque. */
  const csvOf = (entries: ExportEntry[], name: string, zip: string): ExportSource | undefined =>
    sourceOf(entries, name, csvZipName(`${report.slug}-${zip}`));
  /** La descarga de un conjunto por su id en el registro ("mapa:<clave>", "desglose:<clave>"…). */
  const csvById = (id: string, name?: string): ExportSource | undefined => {
    const entry = exports.find((e) => e.id === id);
    return entry ? csvOf([entry], name ?? entry.label, id.replace(":", "-")) : undefined;
  };
  // Todos los indicadores del informe: lo que leen la evolución y la tabla dinámica.
  const indicatorsCsv = csvOf(exports.filter((e) => e.group === EXPORT_GROUPS.indicadores), `los indicadores de ${report.name}`, "indicadores");

  // Primero los KPI clave, luego el resto de indicadores del informe.
  const boardIndicators = [...keys, ...report.indicators.filter((i) => !report.keyIndicators.includes(i.id))];

  const sections = report.sections ?? [];
  const blocks = orderedBlocks(report);
  // Separadores: títulos de sección que agrupan los bloques siguientes.
  const dividers = blocks.filter((b) => b.kind === "separador");
  const dividerId = (b: ReportBlock) => `od-grupo-${b.settings.slot ?? b.position}`;
  // Qué indicadores y desgloses muestra cada bloque: sin repetirse entre secciones.
  const picks = blockPicks(report);
  // Un mapa emparejado con otro (combinado o lado a lado) sale en el bloque que
  // lo pide; su propio bloque se omite. Si dos bloques se piden mutuamente, gana
  // el primero en el orden de la ficha.
  const pairedMaps = pairedMapsOf(blocks);

  // Conjuntos libres: una vista con bloque propio no se repite en el bloque de
  // «todas las vistas» del mismo conjunto, y la tabla de origen va una sola vez,
  // debajo del último bloque que dibuja algo de ese conjunto.
  const ownFreeViews = ownFreeViewsOf(blocks);
  const lastFreeBlock = lastFreeBlockOf(report, blocks);
  // Una tabla personalizada que un bloque de tablas eligió sale en ese bloque:
  // su bloque «libre» suelto no la repite.
  const groupedTables = groupedTableViews(report, blocks);

  /** Un bloque suelto es una sección de la ficha; dentro de un punto, el punto ya pone el título. */
  const shell = (key: string, id: string, title: string, description: string | undefined, inSection: boolean, children: ReactNode) =>
    inSection ? (
      <div className="od-point__block" key={key}>
        {children}
      </div>
    ) : (
      <section className="od-section" key={key} aria-labelledby={id}>
        <div className="u-container">
          <header className="od-section__head">
            <h2 id={id}>{title}</h2>
            {description && <p>{description}</p>}
          </header>
          {children}
        </div>
      </section>
    );

  const pickIndicator = (id: string) => {
    setPickedId(id);
    document.getElementById("od-evolucion")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderBlock = (block: ReportBlock, key: string, inSection: boolean): ReactNode => {
    switch (block.kind) {
      case "kpis": {
        const chosen = picks.indicators(block);
        const picked = block.settings.indicators?.length
          ? chosen.map((id) => report.indicators.find((i) => i.id === id)).filter((i): i is Indicator => Boolean(i))
          : boardIndicators.filter((i) => chosen.includes(i.id));
        if (picked.length === 0) return null;
        const board = (
          <KpiBoard
            indicators={picked}
            years={data.years}
            year={year}
            term={term}
            campus={campus}
            campusName={campusName}
            illustrative={data.illustrative}
            selectedId={selected?.id}
            onSelect={pickIndicator}
          />
        );
        // Los indicadores de este tablero, en CSV: la acción va bajo la rejilla.
        const boardCsv = csvOf(exportsOfBlock(exports, block), block.settings.title || "el tablero de indicadores", `indicadores-${block.settings.slot ?? "tablero"}`);
        const boardAction = boardCsv && <CsvAction {...boardCsv} className="od-csv--block" />;
        if (inSection) return <div className="od-point__block" key={key}>{board}{boardAction}</div>;
        // Puede haber un tablero por grupo: cada uno con su propio id.
        const boardId = block.settings.slot ? `od-clave-${block.settings.slot}` : "od-clave";
        return (
          <section className="od-keyrow" aria-labelledby={boardId} key={key}>
            <div className="u-container">
              <div className="od-keyrow__head">
                <h2 id={boardId}>{block.settings.title || (block.settings.indicators?.length ? "Indicadores" : "Tablero de indicadores")}</h2>
                <p>
                  {year === ALL_YEARS ? (
                    <>
                      {campusName} · todo el periodo {cutLabel(year, term)}: promedio anual de cada indicador (las existencias, como la matrícula,
                      muestran su último dato). Elige un año arriba para ver ese corte.
                    </>
                  ) : term ? (
                    <>
                      {campusName} · periodo {cutLabel(year, term)}. Cada cifra se compara con el periodo anterior y con el mismo
                      periodo del año anterior. Lo que solo se reporta por año muestra su cifra de {year} y lo dice en su boleto.
                    </>
                  ) : (
                    <>
                      {campusName} · año {cutLabel(year, null)}: cifra del año, calculada con los periodos 1 y 2 según la regla de cada
                      indicador (la dice su boleto). Elige el periodo 1 o 2 arriba para leerlo por periodo.
                    </>
                  )}{" "}
                  Elige un indicador para verlo en la gráfica de evolución.
                </p>
              </div>
              {board}
              {boardAction}
            </div>
          </section>
        );
      }
      case "evolucion":
        return selected ? (
          <Evolution
            key={key}
            data={data}
            indicator={selected}
            indicators={report.indicators}
            onPick={setPickedId}
            year={year}
            term={term}
            campus={campus}
            campusName={campusName}
            setYear={setYear}
            setCut={setCut}
            defaultView={block.settings.chart === "barras" ? "barras" : "lineas"}
            csv={indicatorsCsv}
          />
        ) : null;
      case "mapa": {
        const dataset = report.maps?.find((m) => m.id === block.refKey) ?? (block.refKey ? undefined : report.maps?.[0]);
        if (!dataset || pairedMaps.has(dataset.id)) return null;
        // El tablero de la diversidad ya dibuja su mapa por municipio: no se repite.
        if (dataset.mode === "municipio" && blocks.some((b) => b.kind === "diversidad" && b.visible)) return null;
        const partner = block.settings.mapWith ? report.maps?.find((m) => m.id === block.settings.mapWith && m.id !== dataset.id) : undefined;
        const combined =
          partner !== undefined &&
          block.settings.mapLayout === "combinado" &&
          isMobilityMap(dataset.mode) &&
          isMobilityMap(partner.mode) &&
          dataset.mode !== partner.mode;
        const mapOf = (d: MapDataset, compact: boolean) =>
          d.mode === "municipio" ? (
            <OriginMap dataset={d} year={year} years={data.years} campus={campus} campuses={data.campuses} />
          ) : d.mode === "convenios" ? (
            <AgreementsMap dataset={d} compact={compact} year={year} years={data.years} campus={campus} campuses={data.campuses} onSelectCampus={setCampus} />
          ) : isWorldMap(d.mode) ? (
            <WorldMap datasets={[d]} compact={compact} year={year} years={data.years} campus={campus} campuses={data.campuses} onSelectCampus={setCampus} />
          ) : (
            <ColombiaMap dataset={d} year={year} years={data.years} campus={campus} campuses={data.campuses} onSelectCampus={setCampus} />
          );
        const mapCut = (d: MapDataset) =>
          d.reporting === "global"
            ? "Dato global"
            : year === ALL_YEARS ? `Periodo ${cutLabel(year, null)} · ${isWorldMap(d.mode) ? "total" : "promedio anual"}` : `Año ${year} · el mapa se reporta por año`;
        const frameTitle = (d: MapDataset) => (isWorldMap(d.mode) || d.mode === "municipio" ? MAP_MODE_TITLE[d.mode] : "Mapa por departamento");

        if (combined && partner) {
          const heading = block.settings.title || "Movilidad internacional";
          return shell(
            key,
            `od-mapa-${dataset.id}`,
            heading,
            [dataset.description, partner.description].filter(Boolean).join(" "),
            inSection,
            <ChartFrame
              title={inSection ? heading : "Movilidad entrante y saliente por país"}
              subtitle={`${mapCut(dataset)} · ${dataset.unit || partner.unit}`}
              source={[...new Set([dataset.source, partner.source].filter(Boolean))].join(" · ")}
              csv={csvOf(exports.filter((e) => e.id === `mapa:${dataset.id}` || e.id === `mapa:${partner.id}`), heading, `mapa-${dataset.id}`)}
            >
              <WorldMap
                datasets={[dataset, partner]}
                compact={Boolean(block.settings.compact)}
                year={year}
                years={data.years}
                campus={campus}
                campuses={data.campuses}
                onSelectCampus={setCampus}
              />
            </ChartFrame>,
          );
        }

        if (partner) {
          return shell(
            key,
            `od-mapa-${dataset.id}`,
            block.settings.title || `${dataset.title} · ${partner.title}`,
            dataset.description,
            inSection,
            <div className="od-pair">
              {[dataset, partner].map((d) => (
                <ChartFrame key={d.id} title={d.title} subtitle={`${mapCut(d)} · ${d.unit}`} source={d.source} exportName={d.title} csv={csvById(`mapa:${d.id}`)}>
                  {mapOf(d, true)}
                </ChartFrame>
              ))}
            </div>,
          );
        }

        return shell(
          key,
          `od-mapa-${dataset.id}`,
          block.settings.title || dataset.title,
          dataset.description,
          inSection,
          <ChartFrame
            title={inSection ? block.settings.title || dataset.title : frameTitle(dataset)}
            subtitle={`${mapCut(dataset)} · ${dataset.unit}`}
            source={dataset.source}
            csv={csvById(`mapa:${dataset.id}`)}
          >
            {mapOf(dataset, Boolean(block.settings.compact))}
          </ChartFrame>,
        );
      }
      case "tuberia": {
        const pipeline = report.pipelines?.find((p) => p.id === block.refKey) ?? (block.refKey ? undefined : report.pipelines?.[0]);
        if (!pipeline || pipeline.cohorts.length === 0) return null;
        return shell(
          key,
          `od-tuberia-${pipeline.id}`,
          block.settings.title || pipeline.title,
          pipeline.description,
          inSection,
          <ChartFrame
            title={inSection ? block.settings.title || pipeline.title : "Deserción acumulada"}
            subtitle={`${campusName} · deserción acumulada en % · pasa por una unión para leer el tramo`}
            source={pipeline.source}
            csv={csvById(`tuberia:${pipeline.id}`)}
          >
            <LeakyPipeline key={pipeline.id} data={pipeline} campus={campus} campusName={campusName} />
          </ChartFrame>,
        );
      }
      case "historico": {
        const history = report.histories?.find((h) => h.id === block.refKey) ?? (block.refKey ? undefined : report.histories?.[0]);
        if (!history || history.periods.length === 0) return null;
        return shell(
          key,
          `od-historico-${history.id}`,
          block.settings.title || history.title,
          `${history.description} Cifra institucional: no cambia al elegir un campus.`,
          inSection,
          <ChartFrame
            title={inSection ? block.settings.title || history.title : "Evolución histórica"}
            subtitle={`${history.periods[0]} a ${history.periods[history.periods.length - 1]} · ${history.unit}`}
            source={history.source}
            csv={csvById(`historico:${history.id}`)}
          >
            <HistoryCompare key={history.id} data={history} />
          </ChartFrame>,
        );
      }
      case "mapa_calor": {
        const heatmap = report.heatmaps?.find((h) => h.id === block.refKey) ?? (block.refKey ? undefined : report.heatmaps?.[0]);
        if (!heatmap || heatmap.values.flat().every((v) => v === null)) return null;
        return shell(
          key,
          `od-calor-${heatmap.id}`,
          block.settings.title || heatmap.title,
          heatmap.description,
          inSection,
          <ChartFrame
            title={inSection ? block.settings.title || heatmap.title : "Mapa de calor"}
            subtitle={`${inSection && heatmap.description ? `${heatmap.description} · ` : ""}${heatmap.rowLabel} × ${heatmap.columnLabel} · ${heatmap.unit}`}
            source={heatmap.source}
            csv={csvById(`mapa_calor:${heatmap.id}`)}
          >
            <Heatmap data={heatmap} />
          </ChartFrame>,
        );
      }
      case "tabla": {
        const table = report.tables?.find((x) => x.id === block.refKey);
        if (!table || table.rows.length === 0) return null;
        return shell(key, `od-tabla-${table.id}`, block.settings.title || table.title, undefined, inSection, <TableBlock table={table} title={block.settings.title} csv={csvById(`tabla:${table.id}`)} />);
      }
      case "desgloses": {
        const chosen = picks.breakdowns(block);
        const only = chosen.map((key) => report.breakdowns.find((b) => b.id === key)).filter((b): b is Breakdown => Boolean(b));
        if (only.length === 0) return null;
        if (inSection) {
          return (
            <div className="od-point__block od-breakdowns" key={key}>
              {only.map((breakdown) => (
                <BreakdownChart key={breakdown.id} breakdown={breakdown} year={year} term={term} years={data.years} setYear={setYear} setCut={setCut} csv={csvById(`desglose:${breakdown.id}`)} />
              ))}
            </div>
          );
        }
        return (
          <Breakdowns key={key} anchor={block.settings.slot ? `od-desgloses-${block.settings.slot}` : "od-desgloses"} breakdowns={only} year={year} campus={campus} setYear={setYear} setCut={setCut} title={block.settings.title} term={term} years={data.years} csvOf={(id) => csvById(`desglose:${id}`)} />
        );
      }
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
              <ChartFrame title="Todas las cifras del informe" subtitle="Indicador · campus · corte" source={sources.join(" · ")} csv={indicatorsCsv}>
                <PivotTable key={report.slug} report={report} years={data.years} campuses={data.campuses} year={year} term={term} campus={campus} />
              </ChartFrame>
            </div>
          </section>
        );
      case "rankings": {
        if (inSection) return null;
        const chosen = picks.rankings(block);
        const shown = chosen.map((key) => report.rankings?.find((r) => r.id === key)).filter((r): r is NonNullable<typeof r> => Boolean(r));
        if (!shown.length) return null;
        // Una sola acción para todos los rankings del bloque.
        const rankingsCsv = csvOf(
          exports.filter((e) => shown.some((r) => e.id === `ranking:${r.id}`)),
          block.settings.title || "los rankings",
          `rankings${block.settings.slot ? `-${block.settings.slot}` : ""}`,
        );
        return <RankingsBlock key={key} rankings={shown} title={block.settings.title} anchor={block.settings.slot ? `od-rankings-${block.settings.slot}` : "od-rankings"} csv={rankingsCsv} />;
      }
      case "medallero": {
        if (inSection) return null;
        const chosen = picks.medals(block);
        const shown = chosen.map((key) => report.medals?.find((m) => m.id === key)).filter((m): m is NonNullable<typeof m> => Boolean(m));
        if (!shown.length) return null;
        return (
          <MedalBoardBlock
            key={key}
            boards={shown}
            title={block.settings.title}
            anchor={block.settings.slot ? `od-medallero-${block.settings.slot}` : "od-medallero"}
            csvOf={(id) => csvById(`medallero:${id}`)}
          />
        );
      }
      case "libre": {
        if (inSection) return null;
        const set = report.freeSets?.find((f) => f.id === block.refKey);
        if (!set) return null;
        const view = block.settings.view;
        if (view && groupedTables.has(`${set.id}:${view}`)) return null;
        const elsewhere = (v: { key: string }) => ownFreeViews.has(`${set.id}:${v.key}`) || groupedTables.has(`${set.id}:${v.key}`);
        return (
          <FreeSetBlock
            key={key}
            set={set}
            viewKey={view}
            exclude={view ? undefined : set.views.filter(elsewhere).map((v) => v.key)}
            withSource={lastFreeBlock.get(set.id) === block}
            title={block.settings.title}
            anchor={`od-libre-${set.id}${view ? `-${view}` : ""}`}
            csv={csvById(`libre:${set.id}`)}
          />
        );
      }
      case "tablas_personalizadas": {
        if (inSection) return null;
        const shown = picks.tables(block).map((id) => report.freeSets?.find((f) => f.id === id)).filter((f): f is NonNullable<typeof f> => Boolean(f));
        if (!shown.length) return null;
        return (
          <CustomTablesBlock
            key={key}
            sets={shown}
            title={block.settings.title}
            anchor={block.settings.slot ? `od-tablas-${block.settings.slot}` : "od-tablas"}
            csvOf={(id) => csvById(`libre:${id}`)}
          />
        );
      }
      case "saber_tyt": {
        if (inSection) return null;
        const shown = saberTytOf(report, block);
        if (!shown || shown.results.length === 0) return null;
        return <SaberTytBlock key={key} data={shown} title={block.settings.title} anchor={block.settings.slot ? `od-saber-tyt-${block.settings.slot}` : "od-saber-tyt"} csv={csvById(`saber_tyt:${shown.id}`)} />;
      }
      case "diversidad": {
        if (inSection) return null;
        return (
          <DiversityBoard
            key={key}
            report={report}
            campuses={data.campuses}
            year={year}
            campus={campus}
            setYear={setYear}
            setCampus={setCampus}
            title={block.settings.title}
            anchor={block.settings.slot ? `od-diversidad-${block.settings.slot}` : "od-diversidad"}
            csvOf={(frame) => csvById(`dei:${frame}`)}
          />
        );
      }
      case "modelo": {
        if (inSection) return null;
        const model = report.models?.find((m) => m.id === block.refKey) ?? report.models?.[0];
        if (!model) return null;
        return <PredictiveModel key={key} model={model} title={block.settings.title} anchor={block.settings.slot ? `od-modelo-${block.settings.slot}` : "od-modelo"} csv={csvById(`modelo:${model.id}`)} />;
      }
      case "saber_pro": {
        if (inSection) return null;
        const shown = saberProOf(report, block);
        if (!shown || shown.results.length === 0) return null;
        return <SaberProBlock key={key} data={shown} title={block.settings.title} anchor={block.settings.slot ? `od-saber-pro-${block.settings.slot}` : "od-saber-pro"} csv={csvById(`saber_pro:${shown.id}`)} />;
      }
      case "separador": {
        if (inSection) return null;
        const number = dividers.indexOf(block) + 1;
        const id = dividerId(block);
        return (
          <section className="od-divider" key={key} id={id} aria-labelledby={`${id}-titulo`} style={{ "--od-divider": `var(--od-line-${report.line})` } as CSSProperties}>
            <div className="u-container od-divider__inner">
              <span className="od-divider__number" aria-hidden="true">
                {String(number).padStart(2, "0")}
              </span>
              <div className="od-divider__text">
                <span className="od-divider__kicker">{report.name}</span>
                <h2 id={`${id}-titulo`}>{block.settings.title || "Sin título"}</h2>
                {block.settings.description && <p>{block.settings.description}</p>}
              </div>
            </div>
          </section>
        );
      }
      case "imagenes": {
        const images = imagesOf(block.settings.images);
        // Un grid sin fotografías no deja un hueco con la promesa de una foto
        // que nadie subió: no se dibuja.
        if (!images.length) return null;
        const columns = block.settings.columns === 1 ? 1 : 2;
        return (
          <section className="od-section od-gallery" key={key}>
            <div className="u-container">
              {block.settings.title && (
                <header className="od-section__head">
                  <h2>{block.settings.title}</h2>
                  {block.settings.description && <p>{block.settings.description}</p>}
                </header>
              )}
              <ul className="od-gallery__grid" data-columns={columns}>
                {images.map((image, i) => (
                  <li key={`${image.path}-${i}`}>
                    <figure>
                      <img src={reportImageUrl(image.path) ?? ""} alt={image.alt} loading="lazy" decoding="async" />
                      {image.caption && <figcaption>{image.caption}</figcaption>}
                    </figure>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      }
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
  };

  return (
    <>
      {/* Regresar, boletines y los informes: la barra de contexto de los portales.
          Cambiar de informe conserva el corte y el campus. */}
      <ContextBar
        label="Navegación de UDES en Cifras"
        back={{ to: `/datos-abiertos${query}#informes`, label: "Todos los informes" }}
        links={[{ label: "Boletines", to: "/datos-abiertos/boletines" }]}
        itemsLabel="Informes"
        items={data.reports.map((r) => {
          const current = r.slug === report.slug;
          return {
            key: r.slug,
            to: `/datos-abiertos/${r.slug}${query}`,
            code: r.code,
            name: r.name,
            tone: `var(--od-line-${r.line})`,
            current,
            label: `${current ? "Estás leyendo" : "Abrir"} · ${r.name}`,
          };
        })}
      />
      <section className="od-report-head" aria-labelledby="od-informe">
        <div className="u-container od-report-head__grid">
          <div className="od-report-head__text">
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

      <div className="od-report-bar" data-open={barOpen || undefined}>
        <div className="u-container od-report-bar__summary">
          <span className="od-report-bar__code" style={lineStyle(report.line)} aria-hidden="true">
            {report.code}
          </span>
          <span className="od-report-bar__name">{report.name}</span>
          <span className="od-report-bar__chips">
            <span>
              Corte <b>{cutSummary}</b>
            </span>
            <span>
              Campus <b>{campusName}</b>
            </span>
          </span>
          <button
            type="button"
            className="od-report-bar__toggle"
            aria-expanded={barOpen}
            aria-controls="od-report-controls"
            onClick={() => setBarManual(!barOpen)}
          >
            {barOpen ? "Ocultar filtros" : "Filtros, informes y descargas"}
            <Icon name="chevron-down" size={16} />
          </button>
        </div>
        <div className="od-report-bar__panel" id="od-report-controls">
        <div className="u-container od-report-bar__inner">
          <BoardControls data={data} year={year} term={term} campus={campus} setYear={setYear} setTerm={setTerm} setCampus={setCampus} />
          <span className="od-report-bar__downloads">
            <button
              type="button"
              className="od-button od-button--ghost"
              aria-haspopup="dialog"
              aria-label="Descargar datos en CSV"
              aria-describedby={exports.length === 0 ? "od-csv-sin-datos" : undefined}
              disabled={exports.length === 0}
              title={exports.length === 0 ? "Este informe todavía no tiene datos para descargar" : "Elegir qué datos descargar"}
              onClick={() => {
                // La barra se pliega sola al bajar: se fija abierta para que el foco
                // pueda volver a este botón cuando el diálogo se cierre.
                setBarManual(true);
                setPicking(true);
              }}
            >
              <Icon name="download" size={16} /> CSV
            </button>
            {/* El motivo no puede vivir solo en `title`: un lector de pantalla no lo anuncia. */}
            {exports.length === 0 && (
              <span id="od-csv-sin-datos" className="sr-only">
                Este informe todavía no tiene datos para descargar.
              </span>
            )}
            <BulletinDownload catalog={data} report={report} />
          </span>
        </div>
        </div>
      </div>
      {picking && (
        <ExportSelector
          key={report.slug}
          reportName={report.name}
          zipName={zipName}
          entries={exports}
          readme={(chosen) => readmeText(report, data, chosen)}
          onClose={() => setPicking(false)}
        />
      )}

      {/* La intranet decide qué bloques salen y en qué orden (od_report_blocks).
          Un bloque sin datos no se pinta: una sección vacía no informa de nada.
          Un informe por puntos lee punto a punto; los bloques de toda la ficha
          (evolución, tabla dinámica, metodología) cierran después. */}
      {dividers.length > 1 && (
        <nav className="od-points-index od-divider-index" aria-labelledby="od-grupos">
          <div className="u-container">
            <h2 id="od-grupos">En esta ficha</h2>
            <ol>
              {dividers.map((divider, i) => (
                <li key={dividerId(divider)}>
                  <a href={`#${dividerId(divider)}`}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    <span>{divider.settings.title || "Sin título"}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
      )}
      {sections.length > 0 && (
        <nav className="od-points-index" aria-labelledby="od-puntos">
          <div className="u-container">
            <h2 id="od-puntos">Puntos del informe</h2>
            <ol>
              {sections.map((section) => (
                <li key={section.key}>
                  <a href={`#od-${section.key}`}>
                    <b>{section.number ?? "·"}</b>
                    <span>{section.title}</span>
                    <small className="od-point__status" data-status={section.status}>
                      {SECTION_STATUS_LABEL[section.status].split(":")[0]}
                    </small>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
      )}
      {sections.map((section) => {
        const own = blocks.filter((b) => b.sectionKey === section.key);
        const rendered = own.map((block, i) => renderBlock(block, `${block.kind}-${block.refKey ?? i}`, true)).filter(Boolean);
        return (
          <ReportSectionView key={section.key} section={section}>
            {rendered.length > 0 ? rendered : null}
          </ReportSectionView>
        );
      })}
      {blocks.filter((b) => !inSectionOf(report, b)).map((block, blockIndex) =>
        renderBlock(block, `${block.kind}-${block.refKey ?? blockIndex}`, false),
      )}

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

function Evolution({
  data,
  indicator,
  indicators,
  onPick,
  year,
  term,
  campus,
  campusName,
  setYear,
  setCut,
  defaultView = "lineas",
  csv,
}: {
  data: OpenDataCatalog;
  indicator: Indicator;
  indicators: Indicator[];
  onPick: (id: string) => void;
  year: number;
  term: Term | null;
  campus: CampusId;
  campusName: string;
  setYear: (year: number) => void;
  /** Año y periodo en una sola escritura: dos seguidas se pisarían en la URL. */
  setCut: (cut: { year: number; term: Term | null }) => void;
  defaultView?: "lineas" | "barras";
  /** Los indicadores del informe en CSV. */
  csv?: ExportSource;
}) {
  const [view, setView] = useState<"lineas" | "barras" | "combinada">(defaultView);
  const [siteView, setSiteView] = useState<"barras" | "circular">("barras");
  // Por periodos 1 y 2 (la lectura de partida) o por año. La serie por año
  // solo abre de entrada cuando la barra pide la cifra del año.
  const annualAsked = year !== ALL_YEARS && term === null;
  const [detail, setDetail] = useState<"anual" | "periodos">(annualAsked ? "anual" : "periodos");
  useEffect(() => {
    setDetail(annualAsked ? "anual" : "periodos");
  }, [annualAsked]);
  const bySemester = detail === "periodos" && hasTerms(indicator);
  // Lo que se lee en el corte de la barra: un indicador solo anual lee su año.
  const reading = periodReading(indicator, year, term, campus);
  const indicatorYears = indicator.years ?? data.years;
  const visible = useVisibleYears(indicatorYears, indicator.id);
  const cuts = cutsOf(visible.years, bySemester);
  const codes = cuts.map((c) => cutCode(c.year, c.term));
  const selectedCode = bySemester ? (term ? cutCode(year, term) : -1) : year;
  const selectCut = (code: number) => setCut(fromCutCode(code));

  // Tres colores validados para daltonismo: desde el cuarto campus el color se
  // repite, y la leyenda y la etiqueta final cargan la identidad.
  const siteSeries: LineSeries[] = data.campuses
    .filter((c) => c.id !== ALL_CAMPUSES)
    .map((c, index) => ({
      id: c.id,
      label: c.name,
      color: `var(--od-series-${(index % 3) + 1})`,
      values: cuts.map((c2) => valueOf(indicator, c2.year, c.id, c2.term)),
      ...(year === ALL_YEARS ? { current: valueOf(indicator, ALL_YEARS, c.id) } : {}),
    }));
  const totalSeries: LineSeries = {
    id: "todas",
    label: "Total institucional",
    color: "var(--od-series-total)",
    dashed: true,
    values: cuts.map((c) => valueOf(indicator, c.year, "todas", c.term)),
    ...(year === ALL_YEARS ? { current: valueOf(indicator, ALL_YEARS, "todas") } : {}),
  };
  const hasSites = siteSeries.some((s) => s.values.some((v) => v !== null));
  const series = hasSites ? [...siteSeries, totalSeries] : [totalSeries];
  // Un conteo sumado aplasta las líneas de los campus: el total arranca apagado.
  const hiddenByDefault = indicator.format === "entero" && hasSites ? ["todas"] : [];

  const points = cuts.map((c) => ({ year: cutCode(c.year, c.term), value: valueOf(indicator, c.year, campus, c.term) }));
  const cut = reading.label;
  const campusItems = data.campuses
    .filter((c) => c.id !== "todas")
    .map((c) => ({ label: c.name, value: valueOf(indicator, reading.cut.year, c.id, reading.cut.term), highlight: c.id === campus }));
  const hasCampusData = campusItems.some((item) => item.value !== null);
  const campusEverReported = data.years.some((y) =>
    data.campuses.some(
      (c) => c.id !== "todas" && [null, "A", "B"].some((t2) => valueOf(indicator, y, c.id, t2 as Term | null) !== null),
    ),
  );
  const total = valueOf(indicator, reading.cut.year, "todas", reading.cut.term);
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

        <YearFilter available={indicatorYears} selected={visible.selected} onChange={visible.select} />
        <div className="od-evolution">
          <ChartFrame
            title={bySemester || view === "combinada" ? "Evolución por periodo" : "Evolución por año"}
            subtitle={`${view === "lineas" ? "Por campus" : campusName} · ${view === "combinada" ? "periodos 1 y 2 en barras, cifra del año en línea" : bySemester ? "periodos 1 y 2" : hasTerms(indicator) ? "cifra del año" : "dato anual: no se reporta por periodo"} · ${indicator.unit}`}
            source={indicator.source}
            csv={csv}
            actions={
              <>
                {hasTerms(indicator) && view !== "combinada" && (
                  <ViewSwitch
                    label="Detalle de la serie"
                    options={[
                      { value: "periodos", label: "Periodos" },
                      { value: "anual", label: "Año" },
                    ]}
                    value={detail}
                    onChange={setDetail}
                  />
                )}
                <ViewSwitch
                  label="Tipo de gráfica"
                  options={[
                    { value: "lineas", label: "Líneas" },
                    { value: "barras", label: "Barras" },
                    { value: "combinada", label: "Líneas y barras" },
                  ]}
                  value={view}
                  onChange={setView}
                />
              </>
            }
          >
            {view === "combinada" ? (
              <AnnualTermChart
                key={`${indicator.id}-${campus}`}
                label={`${indicator.label}, ${campusName}: periodos 1 y 2 en barras y cifra del año en línea`}
                points={visible.years.map((y) => ({
                  year: y,
                  annual: valueOf(indicator, y, campus),
                  a: valueOf(indicator, y, campus, "A"),
                  b: valueOf(indicator, y, campus, "B"),
                }))}
                selectedYear={year}
                format={indicator.format}
                unit={indicator.unit}
                annualRule={indicator.annualRule ? ANNUAL_RULE_LABEL[indicator.annualRule] : "Cifra anual reportada"}
                onSelectYear={setYear}
              />
            ) : view === "lineas" ? (
              <LineChart
                key={`${indicator.id}-${hasSites}-${bySemester}`}
                label={`${indicator.label} por campus y ${bySemester ? "periodo" : "año"}`}
                years={codes}
                series={series}
                format={indicator.format}
                unit={indicator.unit}
                selectedYear={selectedCode}
                onSelectYear={selectCut}
                initiallyHidden={hiddenByDefault}
                tickLabel={cutCodeLabel}
              />
            ) : (
              <YearBars
                title={`${indicator.label}, ${campusName}, por ${bySemester ? "periodo" : "año"}`}
                points={points}
                selectedYear={selectedCode}
                format={indicator.format}
                unit={indicator.unit}
                onSelectYear={selectCut}
                tickLabel={cutCodeLabel}
              />
            )}
          </ChartFrame>

          <ChartFrame
            title="Por campus"
            subtitle={`${reading.kind === "todo" ? `Periodo ${cut} · ${indicator.annualRule === "ultimo" ? "último dato" : "promedio anual"}` : reading.kind === "periodo" ? `Periodo ${cut}` : `Año ${cut}${reading.annualOnly ? " · dato anual, no se reporta por periodo" : ""}`} · ${indicator.unit}`}
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
                  ? `Ningún campus reportó esta cifra para ${cut}.`
                  : "Esta cifra se reporta solo para el total institucional: los campus no la desagregan."}
              </p>
            ) : summable && siteView === "circular" ? (
              <Donut label={`${indicator.label} por campus, ${cut}`} items={campusItems} format={indicator.format} unit={indicator.unit} />
            ) : (
              <BarList
                items={campusItems}
                format={indicator.format}
                unit={indicator.unit}
                share={summable}
                label={`${indicator.label} por campus, ${cut}`}
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
  anchor,
  breakdowns,
  year,
  campus,
  setYear,
  setCut,
  title,
  term,
  years,
  csvOf,
}: {
  /** Id del título: puede haber un bloque de desgloses por sección. */
  anchor: string;
  breakdowns: Report["breakdowns"];
  year: number;
  campus: CampusId;
  setYear: (year: number) => void;
  setCut: (cut: { year: number; term: Term | null }) => void;
  title?: string;
  term: Term | null;
  years: number[];
  /** La descarga en CSV de cada desglose, por su clave. */
  csvOf: (id: string) => ExportSource | undefined;
}) {

  return (
    <section className="od-section" aria-labelledby={anchor}>
      <div className="u-container">
        <header className="od-section__head">
          <h2 id={anchor}>{title || "Desgloses"}</h2>
          <p>
            Cómo se reparte la cifra por dentro. Los desgloses se publican para el total institucional
            {campus !== "todas" ? ", así que no cambian al elegir un campus" : ""}.
          </p>
        </header>

        <div className="od-breakdowns">
          {breakdowns.map((breakdown) => <BreakdownChart key={breakdown.id} breakdown={breakdown} year={year} term={term} years={years} setYear={setYear} setCut={setCut} csv={csvOf(breakdown.id)} />)}
        </div>
      </div>
    </section>
  );
}
