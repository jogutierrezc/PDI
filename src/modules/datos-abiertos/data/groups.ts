/* =============================================================================
   Datos Abiertos · grupos de la ficha.

   Un separador ("Graduados") agrupa los bloques que le siguen en la ficha
   hasta el próximo separador. De esos bloques sale qué fuentes de datos son
   del grupo: los indicadores de sus tableros y los conjuntos de sus mapas,
   desgloses, tuberías, históricos, mapas de calor y tablas.

   La ficha web lo usa para su índice; el Boletín, para paginar: cada grupo
   abre página con sus hojas. Lo que ningún separador reclama queda en la parte
   general del informe, antes del primer grupo.

   Reglas de reparto, en orden (las mismas para la ficha web y el Boletín):
   · Un indicador elegido en un tablero es de ese tablero y de su grupo; un
     desglose elegido en un bloque de desgloses, igual.
   · Un tablero sin indicadores elegidos muestra los que ningún tablero eligió,
     pero solo el primero de esos tableros: así no se repiten en cada sección.
     Lo mismo con los bloques de desgloses sin elección.
   · Un mapa, tubería, histórico, mapa de calor o tabla es del grupo donde
     aparece su bloque por primera vez.
   ========================================================================== */

import type { Report, ReportBlock } from "./types";
import { SABER_COMPETENCIES } from "./saber-pro";
import type { SaberCompetency } from "./saber-pro";
import { TYT_COMPETENCIES, isPaired } from "./saber-tyt";

/** Referencia de una competencia de un conjunto Saber PRO: "saber:<clave>:<competencia>". */
export const saberRef = (id: string, competency: SaberCompetency) => `saber:${id}:${competency}`;

export interface ReportGroup {
  /** Clave estable del separador: su slot, o su posición. */
  key: string;
  title: string;
  description?: string;
  /** Claves de indicador, en el orden del informe. */
  indicators: string[];
  /** Referencias "desglose:clave", "mapa:clave", "calor:", "tuberia:", "historico:", "tabla:", "ranking:", "saber:". */
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
  libre: "libre",
};

/** El conjunto Saber TyT (Motor Beta) que muestra un bloque. */
export const saberTytOf = (report: Report, block: ReportBlock) =>
  report.saberTyt?.find((t) => t.id === block.settings.saberTyt) ?? report.saberTyt?.[0];

/** El conjunto Saber PRO que muestra un bloque: el elegido o, sin elección, el primero. */
export const saberProOf = (report: Report, block: ReportBlock) =>
  report.saberPro?.find((sp) => sp.id === block.settings.saberPro) ?? report.saberPro?.[0];

/** "indicador:clave" para los indicadores; los conjuntos, con su prefijo. */
export const indicatorRef = (id: string) => `indicador:${id}`;

const visibleBlocks = (report: Report) => [...(report.blocks ?? [])].filter((b) => b.visible).sort((a, b) => a.position - b.position);
const sameBlock = (a: ReportBlock, b: ReportBlock) => a === b || (Boolean(a.uuid) && a.uuid === b.uuid);

/**
 * Qué indicadores muestra un tablero y qué desgloses un bloque de desgloses.
 * Lo elegido en el bloque; sin elección, lo que ningún bloque del mismo tipo
 * eligió, y solo en el primero de esos bloques. Un bloque que no está en la
 * ficha guardada (orden por defecto) lo muestra todo.
 */
export function blockPicks(report: Report) {
  const blocks = visibleBlocks(report);
  const pick = (kind: "kpis" | "desgloses" | "rankings", all: string[], explicit: (b: ReportBlock) => string[] | null) => {
    const own = blocks.filter((b) => b.kind === kind);
    const claimed = new Set(own.flatMap((b) => explicit(b) ?? []));
    const restOwner = own.find((b) => explicit(b) === null);
    const rest = all.filter((key) => !claimed.has(key));
    return (block: ReportBlock): string[] => {
      if (!own.some((b) => sameBlock(b, block))) return all;
      const chosen = explicit(block);
      if (chosen) return chosen.filter((key) => all.includes(key));
      return restOwner && sameBlock(restOwner, block) ? rest : [];
    };
  };
  return {
    indicators: pick(
      "kpis",
      report.indicators.map((i) => i.id),
      (b) => (b.settings.indicators?.length ? b.settings.indicators : null),
    ),
    breakdowns: pick(
      "desgloses",
      report.breakdowns.map((b) => b.id),
      (b) => (b.refKey ? [b.refKey] : b.settings.breakdowns?.length ? b.settings.breakdowns : null),
    ),
    rankings: pick(
      "rankings",
      (report.rankings ?? []).map((r) => r.id),
      (b) => (b.settings.rankings?.length ? b.settings.rankings : null),
    ),
  };
}

export function reportGroups(report: Report): ReportGrouping {
  const blocks = visibleBlocks(report);
  const picks = blockPicks(report);
  const groups: ReportGroup[] = [];
  const owner = new Map<string, ReportGroup | null>();
  const claim = (ref: string, group: ReportGroup | null) => {
    if (!owner.has(ref)) owner.set(ref, group);
  };

  // Primera pasada: lo que cada bloque nombra.
  let current: ReportGroup | null = null;
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
      picks.indicators(block).forEach((id) => claim(indicatorRef(id), current));
      return;
    }
    if (block.kind === "desgloses") {
      picks.breakdowns(block).forEach((key) => claim(`desglose:${key}`, current));
      return;
    }
    if (block.kind === "rankings") {
      picks.rankings(block).forEach((key) => claim(`ranking:${key}`, current));
      return;
    }
    if (block.kind === "saber_tyt") {
      // Como en Saber PRO: una hoja por competencia con las dos pruebas.
      const shown = saberTytOf(report, block);
      if (shown) TYT_COMPETENCIES.filter((c) => isPaired(c.key)).forEach((c) => claim(`tyt:${shown.id}:${c.key}`, current));
      return;
    }
    if (block.kind === "saber_pro") {
      // Una hoja del boletín por competencia: todas son del grupo del bloque.
      const shown = saberProOf(report, block);
      if (shown) SABER_COMPETENCIES.forEach((c) => claim(saberRef(shown.id, c.key), current));
      return;
    }
    const prefix = DATASET_PREFIX[block.kind];
    if (prefix && block.refKey) {
      claim(`${prefix}:${block.refKey}`, current);
      // Conjunto libre: en el boletín cada vista es su hoja ("libre:<fuente>:<vista>").
      if (block.kind === "libre") {
        const set = report.freeSets?.find((f) => f.id === block.refKey);
        set?.views.filter((v) => !block.settings.view || v.key === block.settings.view).forEach((v) => claim(`libre:${set.id}:${v.key}`, current));
      }
      // Un mapa que se muestra junto a otro arrastra a su pareja.
      if (block.kind === "mapa" && block.settings.mapWith) claim(`mapa:${block.settings.mapWith}`, current);
    }
  });

  for (const [ref, group] of owner) {
    if (!group) continue;
    if (ref.startsWith("indicador:")) continue;
    group.datasets.push(ref);
  }
  report.indicators.forEach((i) => owner.get(indicatorRef(i.id))?.indicators.push(i.id));

  return { groups, groupOf: (ref) => owner.get(ref) ?? undefined };
}
