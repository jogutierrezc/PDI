/* =============================================================================
   El taller · cada bloque de la ficha, dibujado como lo ve el público.

   Se usan los componentes del portal (el tablero de paletas, las líneas por
   campus, los desgloses, el mapa de calor…) con la hoja de estilos del portal,
   no un esquema de cajas. La copia es una imagen de la ficha, no la ficha: va
   con `inert`, así sus botones no reciben el foco ni el tabulador (DESIGN.md,
   «The Inert Preview Rule»). El bloque se elige y se edita con los controles
   del taller, que están fuera de la copia.

   Los tipos que piden un montaje propio (mapas, rankings, medalleros, Saber
   PRO y TyT, modelo, diversidad, tabla dinámica) no se incrustan en este
   incremento: `embedded` sale en falso y el taller los muestra con su
   etiqueta, su ayuda y el enlace a la vista clásica.
   ========================================================================== */

import type { CSSProperties, ReactNode } from "react";
import { BreakdownChart } from "../../../datos-abiertos/components/BreakdownChart";
import { ChartFrame } from "../../../datos-abiertos/components/ChartFrame";
import { CustomTablesBlock, FreeSetBlock } from "../../../datos-abiertos/components/FreeSetBlock";
import { Heatmap } from "../../../datos-abiertos/components/Heatmap";
import { HistoryCompare } from "../../../datos-abiertos/components/HistoryCompare";
import { KpiBoard } from "../../../datos-abiertos/components/KpiBoard";
import { LeakyPipeline } from "../../../datos-abiertos/components/LeakyPipeline";
import { LineChart } from "../../../datos-abiertos/components/LineChart";
import type { LineSeries } from "../../../datos-abiertos/components/LineChart";
import { TableBlock } from "../../../datos-abiertos/components/TableBlock";
import { blockPicks, groupedTableViews, lastFreeBlock, orderedBlocks, ownFreeViews } from "../../../datos-abiertos/data/groups";
import { imagesOf, reportImageUrl } from "../../../datos-abiertos/data/images";
import { cutsOf, hasTerms, keyIndicators, valueOf } from "../../../datos-abiertos/data/open-data";
import type { Cut } from "../../../datos-abiertos/data/period-reading";
import { ALL_YEARS, cutCode, cutCodeLabel } from "../../../datos-abiertos/data/terms";
import { ALL_CAMPUSES } from "../../../datos-abiertos/data/types";
import type { Breakdown, CampusId, Indicator, OpenDataCatalog, Report, ReportBlock } from "../../../datos-abiertos/data/types";
import "../../../datos-abiertos/datos-abiertos.css";
import "../../../datos-abiertos/components/report-sections.css";

export interface BlockViewContext {
  catalog: OpenDataCatalog;
  report: Report;
  cut: Cut;
  campus: CampusId;
  /** El corte no se cambia desde la copia: va inerte. */
  noop: () => void;
}

/** Los indicadores que muestra un tablero, en el orden de la ficha pública. */
export function boardIndicators(report: Report, block: ReportBlock): Indicator[] {
  if (block.settings.indicators?.length) {
    return block.settings.indicators.map((id) => report.indicators.find((i) => i.id === id)).filter((i): i is Indicator => Boolean(i));
  }
  // Un bloque oculto no reparte: sin elección propia, no muestra nada.
  if (!block.visible) return [];
  const chosen = blockPicks(report).indicators(block);
  const keys = keyIndicators(report);
  const ordered = [...keys, ...report.indicators.filter((i) => !report.keyIndicators.includes(i.id))];
  return ordered.filter((i) => chosen.includes(i.id));
}

/**
 * La evolución por campus de un indicador, con el componente de líneas del
 * portal: por periodos 1 y 2 si los reporta, o por año. Un hueco en la línea
 * es un corte sin reportar.
 */
export function IndicatorLines({ catalog, indicator, cut }: { catalog: OpenDataCatalog; indicator: Indicator; cut: Cut }) {
  const bySemester = hasTerms(indicator);
  const years = indicator.years ?? catalog.years;
  const cuts = cutsOf(years, bySemester);
  const siteSeries: LineSeries[] = catalog.campuses
    .filter((c) => c.id !== ALL_CAMPUSES)
    .map((c, index) => ({
      id: c.id,
      label: c.name,
      color: `var(--od-series-${(index % 3) + 1})`,
      values: cuts.map((c2) => valueOf(indicator, c2.year, c.id, c2.term)),
    }));
  const total: LineSeries = {
    id: ALL_CAMPUSES,
    label: "Total institucional",
    color: "var(--od-series-total)",
    dashed: true,
    values: cuts.map((c) => valueOf(indicator, c.year, ALL_CAMPUSES, c.term)),
  };
  const hasSites = siteSeries.some((s) => s.values.some((v) => v !== null));
  const series = hasSites ? [...siteSeries, total] : [total];
  if (!series.some((s) => s.values.some((v) => v !== null))) {
    return <p className="odt-empty">Todavía no hay cifras para dibujar la evolución de «{indicator.label}».</p>;
  }
  const selected = cut.year === ALL_YEARS ? -1 : bySemester ? (cut.term ? cutCode(cut.year, cut.term) : -1) : cut.year;
  return (
    <LineChart
      key={`${indicator.id}-${hasSites}-${bySemester}`}
      label={`${indicator.label} por campus y ${bySemester ? "periodo" : "año"}`}
      years={cuts.map((c) => cutCode(c.year, c.term))}
      series={series}
      format={indicator.format}
      unit={indicator.unit}
      selectedYear={selected}
      // Un conteo sumado aplasta las líneas de los campus: el total arranca apagado.
      initiallyHidden={indicator.format === "entero" && hasSites ? [ALL_CAMPUSES] : []}
      tickLabel={cutCodeLabel}
    />
  );
}

/** El nombre con que se reconoce un bloque en la lista: su título propio, el de su conjunto o su tipo. */
export function blockName(report: Report, block: ReportBlock, label: string): string {
  if (block.settings.title) return block.settings.title;
  const ref = block.refKey;
  if (block.kind === "mapa") return report.maps?.find((m) => m.id === ref)?.title ?? label;
  if (block.kind === "mapa_calor") return report.heatmaps?.find((h) => h.id === ref)?.title ?? label;
  if (block.kind === "tuberia") return report.pipelines?.find((p) => p.id === ref)?.title ?? label;
  if (block.kind === "historico") return report.histories?.find((h) => h.id === ref)?.title ?? label;
  if (block.kind === "tabla") return report.tables?.find((t) => t.id === ref)?.title ?? label;
  if (block.kind === "libre") return report.freeSets?.find((f) => f.id === ref)?.title ?? label;
  if (block.kind === "desgloses" && ref) return report.breakdowns.find((b) => b.id === ref)?.title ?? label;
  if (block.kind === "separador") return "Separador sin título";
  return label;
}

export interface BlockRender {
  /** Falso: este tipo no se incrusta en el taller todavía. */
  embedded: boolean;
  /** Lo que el público ve; null si el bloque no tiene datos (el portal no lo pinta). */
  node: ReactNode | null;
}

export function renderBlock(block: ReportBlock, { catalog, report, cut, campus, noop }: BlockViewContext): BlockRender {
  const { year, term } = cut;
  const campusName = catalog.campuses.find((c) => c.id === campus)?.name ?? "Todos los campus";
  const frameTitle = (fallback: string) => block.settings.title || fallback;

  switch (block.kind) {
    case "kpis": {
      const picked = boardIndicators(report, block);
      if (!picked.length) return { embedded: true, node: null };
      return {
        embedded: true,
        node: (
          <KpiBoard
            indicators={picked}
            years={catalog.years}
            year={year}
            term={term}
            campus={campus}
            campusName={campusName}
            illustrative={catalog.illustrative}
            selectedId={undefined}
            onSelect={noop}
          />
        ),
      };
    }
    case "separador": {
      const dividers = (report.blocks ?? []).filter((b) => b.kind === "separador" && b.visible).sort((a, b) => a.position - b.position);
      const number = Math.max(1, dividers.findIndex((b) => b.uuid === block.uuid) + 1);
      return {
        embedded: true,
        node: (
          <div className="od-divider odt-divider" style={{ "--od-divider": `var(--od-line-${report.line})` } as CSSProperties}>
            <div className="od-divider__inner">
              <span className="od-divider__number" aria-hidden="true">
                {String(number).padStart(2, "0")}
              </span>
              <div className="od-divider__text">
                <span className="od-divider__kicker">{report.name}</span>
                <h2>{block.settings.title || "Sin título"}</h2>
                {block.settings.description && <p>{block.settings.description}</p>}
              </div>
            </div>
          </div>
        ),
      };
    }
    case "evolucion": {
      const indicator = keyIndicators(report)[0] ?? report.indicators[0];
      if (!indicator) return { embedded: true, node: null };
      return {
        embedded: true,
        node: (
          <ChartFrame
            title={hasTerms(indicator) ? "Evolución por periodo" : "Evolución por año"}
            subtitle={`${indicator.label} · por campus · ${indicator.unit}`}
            source={indicator.source}
            exportable={false}
          >
            <IndicatorLines catalog={catalog} indicator={indicator} cut={cut} />
          </ChartFrame>
        ),
      };
    }
    case "desgloses": {
      if (!block.visible) return { embedded: true, node: null };
      const chosen = blockPicks(report).breakdowns(block);
      const only = chosen.map((key) => report.breakdowns.find((b) => b.id === key)).filter((b): b is Breakdown => Boolean(b));
      if (!only.length) return { embedded: true, node: null };
      return {
        embedded: true,
        node: (
          <div className="od-breakdowns">
            {only.map((breakdown) => (
              <BreakdownChart key={breakdown.id} breakdown={breakdown} year={year} term={term} years={catalog.years} setYear={noop} setCut={noop} />
            ))}
          </div>
        ),
      };
    }
    case "mapa_calor": {
      const heatmap = report.heatmaps?.find((h) => h.id === block.refKey) ?? (block.refKey ? undefined : report.heatmaps?.[0]);
      if (!heatmap || heatmap.values.flat().every((v) => v === null)) return { embedded: true, node: null };
      return {
        embedded: true,
        node: (
          <ChartFrame title={frameTitle(heatmap.title)} subtitle={`${heatmap.rowLabel} × ${heatmap.columnLabel} · ${heatmap.unit}`} source={heatmap.source} exportable={false}>
            <Heatmap data={heatmap} />
          </ChartFrame>
        ),
      };
    }
    case "historico": {
      const history = report.histories?.find((h) => h.id === block.refKey) ?? (block.refKey ? undefined : report.histories?.[0]);
      if (!history || history.periods.length === 0) return { embedded: true, node: null };
      return {
        embedded: true,
        node: (
          <ChartFrame
            title={frameTitle(history.title)}
            subtitle={`${history.periods[0]} a ${history.periods[history.periods.length - 1]} · ${history.unit}`}
            source={history.source}
            exportable={false}
          >
            <HistoryCompare key={history.id} data={history} />
          </ChartFrame>
        ),
      };
    }
    case "tuberia": {
      const pipeline = report.pipelines?.find((p) => p.id === block.refKey) ?? (block.refKey ? undefined : report.pipelines?.[0]);
      if (!pipeline || pipeline.cohorts.length === 0) return { embedded: true, node: null };
      return {
        embedded: true,
        node: (
          <ChartFrame title={frameTitle(pipeline.title)} subtitle={`${campusName} · deserción acumulada en %`} source={pipeline.source} exportable={false}>
            <LeakyPipeline key={pipeline.id} data={pipeline} campus={campus} campusName={campusName} />
          </ChartFrame>
        ),
      };
    }
    case "tabla": {
      const table = report.tables?.find((x) => x.id === block.refKey);
      if (!table || table.rows.length === 0) return { embedded: true, node: null };
      return { embedded: true, node: <TableBlock table={table} title={block.settings.title} /> };
    }
    case "libre": {
      const set = report.freeSets?.find((f) => f.id === block.refKey);
      if (!set || !block.visible) return { embedded: true, node: null };
      const blocks = orderedBlocks(report);
      const own = ownFreeViews(blocks);
      const grouped = groupedTableViews(report, blocks);
      const view = block.settings.view;
      if (view && grouped.has(`${set.id}:${view}`)) return { embedded: true, node: null };
      const elsewhere = (v: { key: string }) => own.has(`${set.id}:${v.key}`) || grouped.has(`${set.id}:${v.key}`);
      const last = lastFreeBlock(report, blocks).get(set.id);
      return {
        embedded: true,
        node: (
          <FreeSetBlock
            set={set}
            viewKey={view}
            exclude={view ? undefined : set.views.filter(elsewhere).map((v) => v.key)}
            withSource={Boolean(last && last.uuid === block.uuid)}
            title={block.settings.title}
            anchor={`odt-libre-${block.uuid ?? set.id}`}
          />
        ),
      };
    }
    case "tablas_personalizadas": {
      if (!block.visible) return { embedded: true, node: null };
      const shown = blockPicks(report)
        .tables(block)
        .map((id) => report.freeSets?.find((f) => f.id === id))
        .filter((f): f is NonNullable<typeof f> => Boolean(f));
      if (!shown.length) return { embedded: true, node: null };
      return { embedded: true, node: <CustomTablesBlock sets={shown} title={block.settings.title} anchor={`odt-tablas-${block.uuid ?? "bloque"}`} /> };
    }
    case "imagenes": {
      const images = imagesOf(block.settings.images);
      if (!images.length) return { embedded: true, node: null };
      return {
        embedded: true,
        node: (
          <div className="od-gallery">
            {block.settings.title && (
              <header className="od-section__head">
                <h2>{block.settings.title}</h2>
                {block.settings.description && <p>{block.settings.description}</p>}
              </header>
            )}
            <ul className="od-gallery__grid" data-columns={block.settings.columns === 1 ? 1 : 2}>
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
        ),
      };
    }
    case "metodologia": {
      if (!report.indicators.length) return { embedded: true, node: null };
      return {
        embedded: true,
        node: (
          <div className="od-method">
            <header className="od-section__head">
              <h2>{block.settings.title || "Qué mide cada cifra"}</h2>
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
        ),
      };
    }
    default:
      return { embedded: false, node: null };
  }
}
