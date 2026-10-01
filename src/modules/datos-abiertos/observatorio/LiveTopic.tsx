/* =============================================================================
   Observatorio · cuerpo de una página con datos publicados.

   Lo que Planeación armó en el taller, tal cual: los visores por sección, en
   el orden de la página y con el tipo de informe elegido (tablero, narrativo,
   comparativo o ficha técnica). Cada visor va en el marco de gráfica del
   portal —descarga de imagen y, además, el CSV de su tabla— con su fuente y
   la reserva estadística a la vista. Varios visores pueden leer la misma
   tabla: el CSV es uno, y lo ofrece solo el primero de ellos. Se carga aparte:
   las gráficas pesan y el índice del portal no las necesita.
   ========================================================================== */

import { ChartFrame } from "../components/ChartFrame";
import { freeSetToTable } from "../data/csv-export";
import { slugify } from "../data/slug";
import { ObsChart } from "../../admin/observatorio/ObsCharts";
import { SECTION_LABEL } from "../../admin/observatorio/model";
import type { ObsDataset, ObsView } from "../../admin/observatorio/model";
import type { LiveTopic } from "./live";

export default function LiveTopicBody({ live, slug }: { live: LiveTopic; slug: string }) {
  const { config, views, datasets } = live;
  const sections = config.sections.filter((s) => views.some((v) => v.section === s));
  // En el orden de la página, el primer visor de cada tabla: el que lleva su «CSV».
  const firstOfDataset = new Map<string, string>();
  for (const view of sections.flatMap((s) => views.filter((v) => v.section === s))) {
    if (!firstOfDataset.has(view.datasetId)) firstOfDataset.set(view.datasetId, view.id);
  }
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
                  <LiveView
                    key={v.id}
                    view={v}
                    dataset={datasets.get(v.datasetId)!}
                    slug={slug}
                    wide={config.template === "narrativo" || v.size === "completa" || v.type === "tabla"}
                    withCsv={firstOfDataset.get(v.datasetId) === v.id}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LiveView({ view, dataset, slug, wide, withCsv }: { view: ObsView; dataset: ObsDataset; slug: string; wide: boolean; withCsv: boolean }) {
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
      csv={withCsv ? { files: [{ filename: `observatorio-${slug}-${slugify(dataset.title, "datos")}.csv`, build: () => freeSetToTable(dataset) }], name: dataset.title } : undefined}
    >
      <div className="obs-live__chart">
        <ObsChart dataset={dataset} view={view} />
      </div>
    </ChartFrame>
  );
}
