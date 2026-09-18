/* =============================================================================
   Observatorio · cuerpo de una página con datos publicados.

   Lo que Planeación armó en el taller, tal cual: los visores por sección, en
   el orden de la página y con el tipo de informe elegido (tablero, narrativo,
   comparativo o ficha técnica). Cada visor va en el marco de gráfica del
   portal —descarga de imagen y, además, el CSV de su tabla— con su fuente y
   la reserva estadística a la vista. Se carga aparte: las gráficas pesan y el
   índice del portal no las necesita.
   ========================================================================== */

import { Icon } from "../../../components/ui/Icon";
import { ChartFrame } from "../components/ChartFrame";
import { downloadText } from "../data/open-data";
import { ObsChart } from "../../admin/observatorio/ObsCharts";
import { SECTION_LABEL } from "../../admin/observatorio/model";
import type { ObsDataset, ObsView } from "../../admin/observatorio/model";
import { toCsv } from "../../admin/udes-en-cifras/sheet";
import type { LiveTopic } from "./live";

function csvOf(dataset: ObsDataset) {
  return toCsv([dataset.columns.map((c) => c.label), ...dataset.rows.filter((r) => r.kind === "dato").map((r) => dataset.columns.map((c) => (r.cells[c.key] ?? "") as string | number))]);
}

export default function LiveTopicBody({ live, slug }: { live: LiveTopic; slug: string }) {
  const { config, views, datasets } = live;
  const sections = config.sections.filter((s) => views.some((v) => v.section === s));
  return (
    <section className="od-section obs-live" data-template={config.template} aria-label="Datos publicados">
      <div className="u-container obs-live__body">
        {sections.map((section) => (
          <div key={section} className="obs-live__section">
            <h2 className="obs-live__heading">{SECTION_LABEL[section]}</h2>
            <div className="obs-live__grid">
              {views
                .filter((v) => v.section === section)
                .map((v) => (
                  <LiveView key={v.id} view={v} dataset={datasets.get(v.datasetId)!} slug={slug} wide={config.template === "narrativo" || v.size === "completa" || v.type === "tabla"} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LiveView({ view, dataset, slug, wide }: { view: ObsView; dataset: ObsDataset; slug: string; wide: boolean }) {
  const rows = dataset.rows.filter((r) => r.kind === "dato").length;
  const subtitle = [view.description || dataset.description, `${rows.toLocaleString("es-CO")} ${rows === 1 ? "fila" : "filas"}`].filter(Boolean).join(" · ");
  return (
    <ChartFrame
      className={`obs-live__cell${wide ? " obs-live__cell--wide" : ""}`}
      title={view.title}
      subtitle={subtitle}
      source={`${dataset.source || "Observatorio de Analítica Académica"}${dataset.anonymization ? ` · anonimizada, conteos menores que ${dataset.anonymization.threshold} en reserva` : ""}`}
      exportName={`observatorio-${slug}-${view.title}`}
      exportable={view.type !== "tabla"}
      actions={
        <button type="button" className="od-button od-button--ghost obs-csv" onClick={() => downloadText(`observatorio-${slug}-${dataset.title}.csv`, csvOf(dataset))}>
          <Icon name="download" size={15} /> CSV
        </button>
      }
    >
      <div className="obs-live__chart">
        <ObsChart dataset={dataset} view={view} />
      </div>
    </ChartFrame>
  );
}
