/* =============================================================================
   Observatorio · qué entra en un boletín.

   Un boletín es un recorte: temas, años, periodos, fuentes y tipos de dato.
   Un filtro vacío deja pasar todo. Los años y periodos recortan filas, no
   tablas: una tabla sin tiempo entra entera (se rotula «sin año»), y una que
   se queda sin filas sale del boletín con sus visores.
   ========================================================================== */

import { textOf } from "../../datos-abiertos/data/free-sets";
import { TOPICS, periodsOfDataset, topicConfig, yearsOfDataset } from "./model";
import type { ObsBulletin, ObsBulletinFilters, ObsDataset, ObsState, ObsTopicConfig, ObsView } from "./model";

const PERIOD = /^\s*((?:19|20)\d{2})\s*[-_ ]?\s*(0?[12]|I{1,2}|[AB])\s*$/i;

function periodKey(text: string): string | null {
  const m = text.match(PERIOD);
  if (!m) return null;
  const term = m[2].toUpperCase().replace(/^0/, "");
  return `${m[1]}-${term === "A" || term === "I" ? "1" : term === "B" || term === "II" ? "2" : term}`;
}

/** La tabla recortada a los años y periodos pedidos, o null si no le queda nada. */
export function filterDataset(dataset: ObsDataset, filters: ObsBulletinFilters): ObsDataset | null {
  if (filters.sources.length && !filters.sources.includes(dataset.source)) return null;
  if (filters.dataTypes.length && !filters.dataTypes.includes(dataset.dataType)) return null;
  const years = yearsOfDataset(dataset);
  const periods = periodsOfDataset(dataset);
  let rows = dataset.rows;
  if (filters.years.length && years.length) {
    rows = rows.filter((r) => {
      if (r.year !== null) return filters.years.includes(r.year);
      return Object.values(r.cells).some((c) => {
        const m = textOf(c).match(/\b(19|20)\d{2}\b/);
        return m ? filters.years.includes(Number(m[0])) : false;
      });
    });
  }
  if (filters.periods.length && periods.length) {
    rows = rows.filter((r) => Object.values(r.cells).some((c) => {
      const key = periodKey(textOf(c));
      return key ? filters.periods.includes(key) : false;
    }));
  }
  if (!rows.some((r) => r.kind === "dato")) return null;
  return rows === dataset.rows ? dataset : { ...dataset, rows };
}

export interface BulletinTopic {
  config: ObsTopicConfig;
  datasets: Map<string, ObsDataset>;
  views: ObsView[];
}

/** Temas del boletín, en el orden del Observatorio, con sus tablas recortadas. */
export function bulletinContent(state: ObsState, filters: ObsBulletinFilters): BulletinTopic[] {
  const out: BulletinTopic[] = [];
  for (const t of TOPICS) {
    if (filters.topics.length && !filters.topics.includes(t.slug)) continue;
    const datasets = new Map<string, ObsDataset>();
    for (const d of state.datasets.filter((x) => x.topic === t.slug)) {
      const cut = filterDataset(d, filters);
      if (cut) datasets.set(d.id, cut);
    }
    const views = state.views.filter((v) => v.topic === t.slug && v.visible && datasets.has(v.datasetId)).sort((a, b) => a.position - b.position);
    if (!views.length && !datasets.size) continue;
    out.push({ config: topicConfig(state, t.slug), datasets, views });
  }
  return out;
}

/** Opciones de cada filtro a partir de lo que hay cargado. */
export function filterOptions(state: ObsState) {
  const years = new Set<number>();
  const periods = new Set<string>();
  const sources = new Set<string>();
  for (const d of state.datasets) {
    yearsOfDataset(d).forEach((y) => years.add(y));
    periodsOfDataset(d).forEach((p) => periods.add(p));
    if (d.source) sources.add(d.source);
  }
  return {
    years: [...years].sort((a, b) => a - b),
    periods: [...periods].sort(),
    sources: [...sources].sort((a, b) => a.localeCompare(b, "es")),
  };
}

export const emptyBulletin = (id: string): ObsBulletin => ({
  id,
  title: "Boletín del Observatorio de Analítica Académica",
  subtitle: "",
  filters: { topics: [], years: [], periods: [], sources: [], dataTypes: [] },
  include: { cover: true, summary: true, tables: true, method: true },
  updatedAt: new Date().toISOString(),
});

/** Resumen en palabras de un recorte, para la portada y la lista. */
export function describeFilters(filters: ObsBulletinFilters): string {
  const parts: string[] = [];
  parts.push(filters.topics.length ? `${filters.topics.length} ${filters.topics.length === 1 ? "tema" : "temas"}` : "todos los temas");
  if (filters.years.length) {
    const ys = [...filters.years].sort((a, b) => a - b);
    const consecutive = ys.every((y, i) => i === 0 || y === ys[i - 1] + 1);
    parts.push(consecutive && ys.length > 2 ? `${ys[0]}–${ys[ys.length - 1]}` : ys.join(", "));
  } else parts.push("todos los años");
  if (filters.periods.length) parts.push(`periodos ${filters.periods.join(", ")}`);
  if (filters.sources.length) parts.push(`${filters.sources.length === 1 ? "fuente" : "fuentes"}: ${filters.sources.join(", ")}`);
  if (filters.dataTypes.length) parts.push(`${filters.dataTypes.length} ${filters.dataTypes.length === 1 ? "tipo de dato" : "tipos de dato"}`);
  return parts.join(" · ");
}
