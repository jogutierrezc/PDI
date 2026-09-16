/* =============================================================================
   Datos Abiertos · grupos de la ficha.

   Un separador ("Graduados") agrupa los bloques que le siguen en la ficha
   hasta el próximo separador. De esos bloques sale qué fuentes de datos son
   del grupo: los indicadores de sus tableros y los conjuntos de sus mapas,
   desgloses, tuberías, históricos, mapas de calor y tablas.

   La ficha web lo usa para su índice; el Boletín, para paginar: cada grupo
   abre página con sus hojas. Lo que ningún separador reclama queda en la parte
   general del informe, antes del primer grupo.

   Reglas de reparto, en orden:
   · Un indicador elegido en un tablero es del grupo de ese tablero.
   · Un tablero sin indicadores elegidos se queda con los que nadie eligió
     (el primero de esos tableros, en el orden de la ficha).
   · Un conjunto es del grupo donde aparece su bloque por primera vez; un bloque
     "Desgloses" sin desglose propio se queda con los desgloses sin bloque.
   ========================================================================== */

import type { Report, ReportBlock } from "./types";

export interface ReportGroup {
  /** Clave estable del separador: su slot, o su posición. */
  key: string;
  title: string;
  description?: string;
  /** Claves de indicador, en el orden del informe. */
  indicators: string[];
  /** Referencias "desglose:clave", "mapa:clave", "calor:", "tuberia:", "historico:", "tabla:". */
  datasets: string[];
}

export interface ReportGrouping {
  groups: ReportGroup[];
  /** Grupo de cada indicador o conjunto; sin entrada, la parte general. */
  groupOf: (ref: string) => ReportGroup | undefined;
}

const DATASET_PREFIX: Partial<Record<ReportBlock["kind"], string>> = {
  mapa: "mapa",
  mapa_calor: "calor",
  tuberia: "tuberia",
  historico: "historico",
  tabla: "tabla",
};

/** "indicador:clave" para los indicadores; los conjuntos, con su prefijo. */
export const indicatorRef = (id: string) => `indicador:${id}`;

export function reportGroups(report: Report): ReportGrouping {
  const blocks = [...(report.blocks ?? [])].filter((b) => b.visible).sort((a, b) => a.position - b.position);
  const groups: ReportGroup[] = [];
  const owner = new Map<string, ReportGroup | null>();
  const claim = (ref: string, group: ReportGroup | null) => {
    if (!owner.has(ref)) owner.set(ref, group);
  };

  // Primera pasada: lo que cada bloque nombra.
  let current: ReportGroup | null = null;
  const restIndicators: (ReportGroup | null)[] = [];
  const restBreakdowns: (ReportGroup | null)[] = [];
  blocks.forEach((block, index) => {
    if (block.kind === "separador") {
      current = {
        key: block.settings.slot || `grupo-${index}`,
        title: block.settings.title?.trim() || "Sin título",
        description: block.settings.description?.trim() || undefined,
        indicators: [],
        datasets: [],
      };
      groups.push(current);
      return;
    }
    if (block.kind === "kpis") {
      if (block.settings.indicators?.length) block.settings.indicators.forEach((id) => claim(indicatorRef(id), current));
      else restIndicators.push(current);
      return;
    }
    if (block.kind === "desgloses") {
      if (block.refKey) claim(`desglose:${block.refKey}`, current);
      else restBreakdowns.push(current);
      return;
    }
    const prefix = DATASET_PREFIX[block.kind];
    if (prefix && block.refKey) {
      claim(`${prefix}:${block.refKey}`, current);
      // Un mapa que se muestra junto a otro arrastra a su pareja.
      if (block.kind === "mapa" && block.settings.mapWith) claim(`mapa:${block.settings.mapWith}`, current);
    }
  });

  // Segunda pasada: lo que nadie nombró va al primer bloque que toma "el resto".
  if (restIndicators.length) report.indicators.forEach((i) => claim(indicatorRef(i.id), restIndicators[0]));
  if (restBreakdowns.length) report.breakdowns.forEach((b) => claim(`desglose:${b.id}`, restBreakdowns[0]));

  for (const [ref, group] of owner) {
    if (!group) continue;
    if (ref.startsWith("indicador:")) continue;
    group.datasets.push(ref);
  }
  report.indicators.forEach((i) => owner.get(indicatorRef(i.id))?.indicators.push(i.id));

  return { groups, groupOf: (ref) => owner.get(ref) ?? undefined };
}
