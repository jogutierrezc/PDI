/* =============================================================================
   El taller · los bloques de montaje pesado, dibujados como en el portal.

   Mapas (Colombia, mundo, convenios, municipios), rankings, medalleros, Saber
   PRO, Saber TyT, el tablero de la diversidad, el modelo predictivo y la tabla
   dinámica. Traen cartografía y lógica propia, así que bajan aparte, solo
   cuando la ficha tiene alguno (ver `renderBlock` en BlockView.tsx).

   Cada caso llama al componente del portal con lo mismo que le pasa la ficha
   pública (OpenDataReport). La copia va inerte: los setters no hacen nada.
   ========================================================================== */

import { AgreementsMap } from "../../../datos-abiertos/components/AgreementsMap";
import { ChartFrame } from "../../../datos-abiertos/components/ChartFrame";
import { ColombiaMap } from "../../../datos-abiertos/components/ColombiaMap";
import { DiversityBoard } from "../../../datos-abiertos/components/DiversityBoard";
import { MedalBoardBlock } from "../../../datos-abiertos/components/MedalBoardBlock";
import { OriginMap } from "../../../datos-abiertos/components/OriginMap";
import { PivotTable } from "../../../datos-abiertos/components/PivotTable";
import { PredictiveModel } from "../../../datos-abiertos/components/PredictiveModel";
import { RankingsBlock } from "../../../datos-abiertos/components/RankingsBlock";
import { SaberProBlock } from "../../../datos-abiertos/components/SaberProBlock";
import { SaberTytBlock } from "../../../datos-abiertos/components/SaberAporte";
import { WorldMap } from "../../../datos-abiertos/components/WorldMap";
import { blockPicks, saberProOf, saberTytOf } from "../../../datos-abiertos/data/groups";
import { ALL_YEARS, cutLabel } from "../../../datos-abiertos/data/terms";
import { MAP_MODE_TITLE, isMobilityMap, isWorldMap } from "../../../datos-abiertos/data/types";
import type { MapDataset, ReportBlock } from "../../../datos-abiertos/data/types";
import type { BlockViewContext } from "./BlockView";

export default function HeavyBlock({ block, context }: { block: ReportBlock; context: BlockViewContext }) {
  const { catalog, report, cut, campus, noop } = context;
  const { year, term } = cut;
  const anchor = `odt-${block.kind}-${block.uuid ?? "bloque"}`;

  switch (block.kind) {
    case "mapa": {
      const dataset = report.maps?.find((m) => m.id === block.refKey) ?? (block.refKey ? undefined : report.maps?.[0]);
      if (!dataset) return null;
      const partner = block.settings.mapWith ? report.maps?.find((m) => m.id === block.settings.mapWith && m.id !== dataset.id) : undefined;
      const combined =
        partner !== undefined &&
        block.settings.mapLayout === "combinado" &&
        isMobilityMap(dataset.mode) &&
        isMobilityMap(partner.mode) &&
        dataset.mode !== partner.mode;
      const mapOf = (d: MapDataset, compact: boolean) =>
        d.mode === "municipio" ? (
          <OriginMap dataset={d} year={year} years={catalog.years} campus={campus} campuses={catalog.campuses} />
        ) : d.mode === "convenios" ? (
          <AgreementsMap dataset={d} compact={compact} year={year} years={catalog.years} campus={campus} campuses={catalog.campuses} onSelectCampus={noop} />
        ) : isWorldMap(d.mode) ? (
          <WorldMap datasets={[d]} compact={compact} year={year} years={catalog.years} campus={campus} campuses={catalog.campuses} onSelectCampus={noop} />
        ) : (
          <ColombiaMap dataset={d} year={year} years={catalog.years} campus={campus} campuses={catalog.campuses} onSelectCampus={noop} />
        );
      const mapCut = (d: MapDataset) =>
        d.reporting === "global"
          ? "Dato global"
          : year === ALL_YEARS
            ? `Periodo ${cutLabel(year, null)} · ${isWorldMap(d.mode) ? "total" : "promedio anual"}`
            : `Año ${year} · el mapa se reporta por año`;

      if (combined && partner) {
        return (
          <ChartFrame
            title={block.settings.title || "Movilidad entrante y saliente por país"}
            subtitle={`${mapCut(dataset)} · ${dataset.unit || partner.unit}`}
            source={[...new Set([dataset.source, partner.source].filter(Boolean))].join(" · ")}
            exportable={false}
          >
            <WorldMap datasets={[dataset, partner]} compact={Boolean(block.settings.compact)} year={year} years={catalog.years} campus={campus} campuses={catalog.campuses} onSelectCampus={noop} />
          </ChartFrame>
        );
      }
      if (partner) {
        return (
          <div className="od-pair">
            {[dataset, partner].map((d) => (
              <ChartFrame key={d.id} title={d.title} subtitle={`${mapCut(d)} · ${d.unit}`} source={d.source} exportable={false}>
                {mapOf(d, true)}
              </ChartFrame>
            ))}
          </div>
        );
      }
      return (
        <ChartFrame
          title={block.settings.title || dataset.title || MAP_MODE_TITLE[dataset.mode]}
          subtitle={`${mapCut(dataset)} · ${dataset.unit}`}
          source={dataset.source}
          exportable={false}
        >
          {mapOf(dataset, Boolean(block.settings.compact))}
        </ChartFrame>
      );
    }
    case "rankings": {
      const shown = blockPicks(report)
        .rankings(block)
        .map((key) => report.rankings?.find((r) => r.id === key))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      return shown.length ? <RankingsBlock rankings={shown} title={block.settings.title} anchor={anchor} /> : null;
    }
    case "medallero": {
      const shown = blockPicks(report)
        .medals(block)
        .map((key) => report.medals?.find((m) => m.id === key))
        .filter((m): m is NonNullable<typeof m> => Boolean(m));
      return shown.length ? <MedalBoardBlock boards={shown} title={block.settings.title} anchor={anchor} /> : null;
    }
    case "saber_pro": {
      const shown = saberProOf(report, block);
      return shown && shown.results.length ? <SaberProBlock data={shown} title={block.settings.title} anchor={anchor} /> : null;
    }
    case "saber_tyt": {
      const shown = saberTytOf(report, block);
      return shown ? <SaberTytBlock title={block.settings.title} anchor={anchor} /> : null;
    }
    case "diversidad":
      return <DiversityBoard report={report} campuses={catalog.campuses} year={year} campus={campus} setYear={noop} setCampus={noop} title={block.settings.title} anchor={anchor} csvOf={() => undefined} />;
    case "modelo": {
      const model = report.models?.find((m) => m.id === block.refKey) ?? report.models?.[0];
      return model ? <PredictiveModel model={model} title={block.settings.title} anchor={anchor} /> : null;
    }
    case "tabla_dinamica":
      return (
        <ChartFrame title={block.settings.title || "Todas las cifras del informe"} subtitle="Indicador · campus · corte" exportable={false}>
          <PivotTable key={report.slug} report={report} years={catalog.years} campuses={catalog.campuses} year={year} term={term} campus={campus} />
        </ChartFrame>
      );
    default:
      return null;
  }
}
