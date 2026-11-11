/* =============================================================================
   Gráficas sugeridas para la vista previa.

   Un tema con tablas pero sin visores guardados se ve vacío. Para poder revisar cómo queda,
   la vista previa dibuja las que el taller recomienda para cada tabla (las mismas del paso
   «Resultado» al importar). No se guardan: los visores reales se arman en Diseño.
   ========================================================================== */

import { recommend } from "../analyze";
import type { ObsDataset, ObsSection, ObsView } from "../model";

const POR_TABLA = 2;
const MAXIMO = 8;

function seccionDe(tipo: string): ObsSection {
  if (tipo === "lineas" || tipo === "area") return "tendencia";
  if (tipo.startsWith("mapa") && tipo !== "mapa_calor") return "territorio";
  if (tipo === "cifras") return "panorama";
  if (["dona", "circular", "mosaico", "barras_100"].includes(tipo)) return "composicion";
  return "detalle";
}

export function visoresSugeridos(tablas: ObsDataset[], topic: string): ObsView[] {
  const out: ObsView[] = [];
  for (const d of tablas) {
    const vistos = new Set<string>();
    for (const r of recommend(d)) {
      if (r.type === "tabla" || vistos.has(r.type)) continue;
      vistos.add(r.type);
      out.push({
        ...r.encoding,
        id: `sugerido-${d.id}-${r.type}`,
        datasetId: d.id,
        topic,
        key: "v1",
        title: d.title,
        section: seccionDe(r.type),
        size: "media",
        visible: true,
        position: out.length,
      });
      if (vistos.size >= POR_TABLA) break;
    }
    if (out.length >= MAXIMO) break;
  }
  return out;
}
