/* =============================================================================
   Datos Abiertos · registro de descargas de un informe.

   Enumera los conjuntos que la ficha pinta, en el orden en que se leen, cada
   uno con sus archivos CSV. Lo consumen la acción «CSV» de cada bloque y el
   selector de la barra: lo que se ofrece para bajar es, por construcción, lo
   que la ficha dibuja.

   Sigue las reglas de `renderBlock` (OpenDataReport.tsx) con los mismos
   helpers de `groups.ts`: orden y visibilidad de los bloques, mapas
   emparejados, reparto de indicadores, desgloses, rankings y medalleros entre
   bloques, tipos que no salen dentro de un punto y las guardas de vacío de
   cada tipo. Un bloque sin datos no se pinta y aquí tampoco se ofrece.

   · Un conjunto que la ficha muestra dos veces sale una sola: gana el primero.
     El mapa por municipio que dibuja el tablero de la diversidad es de su
     marco, también cuando otro mapa lo trae de pareja.
   · Los indicadores no se repiten: cada tablero exporta los suyos y, si la
     gráfica de evolución o la tabla dinámica muestran otros que ningún tablero
     tiene, esos van en una entrada aparte.
   · Las tablas se arman al hacer clic (`build`), no al listar.

   Módulo puro: no importa `open-data.ts`, `repository.ts` ni componentes, para
   que las pruebas en node lo lean. Por eso repite las claves del informe de
   Diversidad (`dei.ts` importa `open-data.ts`); una prueba vigila que no se
   separen.
   ========================================================================== */

import {
  breakdownToTable,
  csvFilename,
  customTableToTable,
  freeSetToTable,
  heatmapToTable,
  historyToTable,
  indicatorsToTable,
  mapToTable,
  medalBoardToTable,
  modelToTable,
  pipelineToTable,
  rankingToTable,
  saberProToTable,
  saberTytCurvesToTable,
  saberTytModelsToTable,
  saberTytResultsToTable,
  tableToTable,
} from "./csv-export";
import type { CsvFile, CsvTable } from "./csv-export";
import { viewProblems } from "./free-sets";
import { customViewOf } from "./custom-table";
import type { FreeSet } from "./free-sets";
import { blockPicks, orderedBlocks, ownFreeViews, pageBlocks, pairedMaps, saberProOf, saberTytOf } from "./groups";
import { valueOf } from "./reserve";
import { ALL_CAMPUSES } from "./types";
import type { Breakdown, BreakdownItem, Indicator, MapDataset, OpenDataCatalog, Report, ReportBlock } from "./types";

export type ExportKind =
  | "indicadores"
  | "desglose"
  | "mapa"
  | "tuberia"
  | "historico"
  | "mapa_calor"
  | "tabla"
  | "ranking"
  | "medallero"
  | "saber_pro"
  | "saber_tyt"
  | "libre"
  | "modelo";

export interface ExportEntry {
  /**
   * Único y estable: "indicadores:<slot>", "desglose:<clave>", "mapa:<clave>", "libre:<conjunto>", "dei:<marco>"…
   * Los indicadores que ningún tablero muestra llevan otro prefijo ("resto-indicadores:"),
   * que ningún slot puede reclamar.
   */
  id: string;
  kind: ExportKind;
  /** Texto de la fila en el selector: el título del conjunto. */
  label: string;
  /** Oficina que lo reporta. */
  detail?: string;
  /** Leyenda del selector bajo la que sale. */
  group: string;
  /** El conjunto tiene celdas bajo reserva estadística. */
  reserved?: boolean;
  /** `blockKeyOf` del bloque que lo muestra. */
  blockKey: string;
  /** Archivos del conjunto, con su nombre suelto. La tabla se arma al descargar. */
  files: CsvFile[];
}

/** Lo que necesita una acción «CSV»: la misma forma que `CsvSource` (components/CsvAction). */
export interface ExportSource {
  files: CsvFile[];
  zipName?: string;
  name: string;
}

export const EXPORT_GROUPS = {
  indicadores: "Indicadores",
  desgloses: "Desgloses",
  mapas: "Mapas",
  tablas: "Tablas y series",
  rankings: "Rankings y medallero",
  saber: "Pruebas Saber y modelos",
  diversidad: "Diversidad",
} as const;

/* --- Claves del informe de Diversidad (las de dei.ts) ---------------------------------- */

export const DEI_INDICATORS = ["grupo-especial", "etnico", "discapacidad", "victima", "rural", "estrato-bajo", "cobertura-discapacidad"];
export const DEI_BREAKDOWNS = {
  tipoDiscapacidad: "tipo-discapacidad",
  indigena: "pueblo-indigena",
  negra: "comunidad-negra",
  estrato: "estrato",
  genero: "genero",
  zona: "zona",
} as const;
export const DEI_INES = "ines-grupos";
/** La cifra del DE se captura en el segundo periodo del año. */
export const DEI_TERM = "B" as const;
/** Id del marco del mapa de origen en el tablero de la diversidad. */
export const DEI_MAP = "dei:mapa";
/** Marcos del tablero de la diversidad, en el orden en que se leen. */
export const DEI_FRAMES = ["corte", "etnico", "mapa", "discapacidad", "estratos", "genero-zona", "ines"] as const;

/* --- Lo común ---------------------------------------------------------------------------- */

/** Clave de un bloque dentro de su ficha: tipo, conjunto, slot, vista y posición. */
export function blockKeyOf(block: ReportBlock): string {
  return [block.kind, block.refKey ?? "", block.settings.slot ?? "", block.settings.view ?? "", block.position].join("|");
}

const joined = (sources: (string | undefined)[]): string | undefined =>
  [...new Set(sources.filter((s): s is string => Boolean(s)))].join(" · ") || undefined;

const anyReserved = (items: BreakdownItem[] | undefined): boolean => (items ?? []).some((item) => item.reserved);

/** Ids de los indicadores que ningún tablero muestra. Sin "indicadores:" delante: un slot llamado «otros» o «todos» no choca. */
export const REST_INDICATORS = { all: "resto-indicadores:todos", others: "resto-indicadores:otros" } as const;

/** ¿El desglose tiene alguna celda reservada, en la cifra del año o en un periodo? */
function breakdownReserved(breakdown: Breakdown): boolean {
  return (
    Object.values(breakdown.values).some(anyReserved) ||
    Object.values(breakdown.terms ?? {}).some((terms) => Object.values(terms ?? {}).some(anyReserved))
  );
}

/** ¿El desglose trae categorías en algún corte? */
function breakdownHasItems(breakdown: Breakdown | undefined): breakdown is Breakdown {
  if (!breakdown) return false;
  return (
    Object.values(breakdown.values).some((items) => (items ?? []).length > 0) ||
    Object.values(breakdown.terms ?? {}).some((terms) => Object.values(terms ?? {}).some((items) => (items ?? []).length > 0))
  );
}

/** Mapa por municipio con algún código en reserva en un campus (el total institucional no se exporta). */
function mapReserved(map: MapDataset): boolean {
  if (map.mode !== "municipio") return false;
  return Object.values(map.reserved ?? {}).some((byCampus) =>
    Object.entries(byCampus ?? {}).some(([campus, codes]) => campus !== ALL_CAMPUSES && (codes ?? []).length > 0),
  );
}

/** ¿El mapa trae algún corte capturado? */
const mapHasData = (map: MapDataset): boolean => Object.keys(map.values).length > 0 || Object.keys(map.reserved ?? {}).length > 0;

/* --- El registro -------------------------------------------------------------------------- */

type Catalog = Pick<OpenDataCatalog, "years" | "campuses">;

/** Los conjuntos que la ficha del informe pinta, en su orden, cada uno con sus archivos. */
export function reportExports(report: Report, catalog: Catalog): ExportEntry[] {
  const blocks = orderedBlocks(report);
  const page = pageBlocks(report, blocks);
  const picks = blockPicks(report);
  const paired = pairedMaps(blocks);
  const ownViews = ownFreeViews(blocks);
  // Conjunto libre: una entrada por conjunto, en el último bloque que lo dibuja
  // (el mismo que lleva su tabla de origen, `lastFreeBlock`, cuando ese se pinta).
  const freeHome = new Map<string, ReportBlock>();
  for (const { block, inSection } of page) {
    const set = block.kind === "libre" && !inSection ? report.freeSets?.find((f) => f.id === block.refKey) : undefined;
    if (set && freeBlockPainted(set, block, ownViews)) freeHome.set(set.id, block);
  }
  const hasDiversity = blocks.some((b) => b.kind === "diversidad" && b.visible);
  const campuses = catalog.campuses;

  const entries: ExportEntry[] = [];
  const taken = new Set<string>();
  const names = new Set<string>();

  /** Archivo con nombre suelto; si dos claves dan el mismo nombre, el segundo lleva "-2". */
  const file = (kind: string, key: string, build: () => CsvTable): CsvFile => {
    const base = csvFilename(report.slug, kind, key).replace(/\.csv$/, "");
    let name = base;
    for (let n = 2; names.has(name); n += 1) name = `${base}-${n}`;
    names.add(name);
    return { filename: `${name}.csv`, build };
  };
  /** Añade la entrada si su id no está ya: el primero que muestra un conjunto se lo queda. */
  const add = (block: ReportBlock, entry: Omit<ExportEntry, "blockKey" | "files">, files: () => CsvFile[]) => {
    if (taken.has(entry.id)) return;
    const built = files();
    if (built.length === 0) return;
    taken.add(entry.id);
    entries.push({ ...entry, reserved: entry.reserved || undefined, blockKey: blockKeyOf(block), files: built });
  };

  /* Indicadores: los de cada tablero, tal como `renderBlock` los ordena. */
  const keyIds = new Set(report.keyIndicators);
  const boardOrder = [
    ...report.keyIndicators.map((id) => report.indicators.find((i) => i.id === id)).filter((i): i is Indicator => Boolean(i)),
    ...report.indicators.filter((i) => !keyIds.has(i.id)),
  ];
  const boardIndicators = (block: ReportBlock): Indicator[] => {
    const chosen = picks.indicators(block);
    return block.settings.indicators?.length
      ? chosen.map((id) => report.indicators.find((i) => i.id === id)).filter((i): i is Indicator => Boolean(i))
      : boardOrder.filter((i) => chosen.includes(i.id));
  };
  const onBoards = new Set(page.filter(({ block }) => block.kind === "kpis").flatMap(({ block }) => boardIndicators(block).map((i) => i.id)));
  const indicatorsFile = (key: string, indicators: Indicator[]) =>
    file("indicadores", key, () => indicatorsToTable({ reportName: report.name, indicators, years: catalog.years, campuses }));
  /** Evolución y tabla dinámica leen todos los indicadores: los que ningún tablero exporta van aquí. */
  const restOfIndicators = (block: ReportBlock) => {
    const rest = report.indicators.filter((i) => !onBoards.has(i.id));
    if (rest.length === 0) return;
    const all = onBoards.size === 0;
    add(
      block,
      {
        id: all ? REST_INDICATORS.all : REST_INDICATORS.others,
        kind: "indicadores",
        label: all ? "Indicadores del informe" : "Otros indicadores del informe",
        detail: joined(rest.map((i) => i.source)),
        group: EXPORT_GROUPS.indicadores,
      },
      () => [indicatorsFile(all ? "todos" : "otros", rest)],
    );
  };

  const mapEntry = (block: ReportBlock, map: MapDataset) =>
    add(
      block,
      { id: `mapa:${map.id}`, kind: "mapa", label: map.title, detail: map.source || undefined, group: EXPORT_GROUPS.mapas, reserved: mapReserved(map) },
      () => [file("mapa", map.id, () => mapToTable(map, { campuses }))],
    );

  for (const { block, inSection } of page) {
    switch (block.kind) {
      case "kpis": {
        const picked = boardIndicators(block);
        if (picked.length === 0) break;
        // Puede haber un tablero por grupo: el slot los distingue; sin slot, su posición.
        const slot = block.settings.slot || "tablero";
        const key = taken.has(`indicadores:${slot}`) ? `${slot}-${block.position}` : slot;
        add(
          block,
          {
            id: `indicadores:${key}`,
            kind: "indicadores",
            label: block.settings.title || (block.settings.indicators?.length ? "Indicadores" : "Tablero de indicadores"),
            detail: joined(picked.map((i) => i.source)),
            group: EXPORT_GROUPS.indicadores,
          },
          () => [indicatorsFile(key, picked)],
        );
        break;
      }
      case "evolucion":
        if (report.indicators.length > 0) restOfIndicators(block);
        break;
      case "tabla_dinamica":
        restOfIndicators(block);
        break;
      case "mapa": {
        const dataset = report.maps?.find((m) => m.id === block.refKey) ?? (block.refKey ? undefined : report.maps?.[0]);
        if (!dataset || paired.has(dataset.id)) break;
        // El tablero de la diversidad ya dibuja su mapa por municipio: no se repite.
        if (dataset.mode === "municipio" && hasDiversity) break;
        const partner = block.settings.mapWith ? report.maps?.find((m) => m.id === block.settings.mapWith && m.id !== dataset.id) : undefined;
        mapEntry(block, dataset);
        // La pareja (combinada o lado a lado) se dibuja en este bloque: su archivo también es de aquí.
        if (partner) mapEntry(block, partner);
        break;
      }
      case "tuberia": {
        const pipeline = report.pipelines?.find((p) => p.id === block.refKey) ?? (block.refKey ? undefined : report.pipelines?.[0]);
        if (!pipeline || pipeline.cohorts.length === 0) break;
        add(
          block,
          { id: `tuberia:${pipeline.id}`, kind: "tuberia", label: pipeline.title, detail: pipeline.source || undefined, group: EXPORT_GROUPS.tablas },
          () => [file("tuberia", pipeline.id, () => pipelineToTable(pipeline, { campuses }))],
        );
        break;
      }
      case "historico": {
        const history = report.histories?.find((h) => h.id === block.refKey) ?? (block.refKey ? undefined : report.histories?.[0]);
        if (!history || history.periods.length === 0) break;
        add(
          block,
          { id: `historico:${history.id}`, kind: "historico", label: history.title, detail: history.source || undefined, group: EXPORT_GROUPS.tablas },
          () => [file("historico", history.id, () => historyToTable(history))],
        );
        break;
      }
      case "mapa_calor": {
        const heatmap = report.heatmaps?.find((h) => h.id === block.refKey) ?? (block.refKey ? undefined : report.heatmaps?.[0]);
        if (!heatmap || heatmap.values.flat().every((v) => v === null)) break;
        add(
          block,
          { id: `mapa_calor:${heatmap.id}`, kind: "mapa_calor", label: heatmap.title, detail: heatmap.source || undefined, group: EXPORT_GROUPS.tablas },
          () => [file("mapa-de-calor", heatmap.id, () => heatmapToTable(heatmap))],
        );
        break;
      }
      case "tabla": {
        const table = report.tables?.find((x) => x.id === block.refKey);
        if (!table || table.rows.length === 0) break;
        add(
          block,
          { id: `tabla:${table.id}`, kind: "tabla", label: table.title, detail: table.source || undefined, group: EXPORT_GROUPS.tablas },
          () => [file("tabla", table.id, () => tableToTable(table))],
        );
        break;
      }
      case "desgloses": {
        for (const key of picks.breakdowns(block)) {
          const breakdown = report.breakdowns.find((b) => b.id === key);
          if (!breakdown) continue;
          add(
            block,
            {
              id: `desglose:${breakdown.id}`,
              kind: "desglose",
              label: breakdown.title,
              detail: breakdown.source || undefined,
              group: EXPORT_GROUPS.desgloses,
              reserved: breakdownReserved(breakdown),
            },
            () => [file("desglose", breakdown.id, () => breakdownToTable(breakdown))],
          );
        }
        break;
      }
      case "rankings": {
        if (inSection) break;
        for (const key of picks.rankings(block)) {
          const ranking = report.rankings?.find((r) => r.id === key);
          if (!ranking) continue;
          add(
            block,
            { id: `ranking:${ranking.id}`, kind: "ranking", label: ranking.title, detail: ranking.source || undefined, group: EXPORT_GROUPS.rankings },
            () => [file("ranking", ranking.id, () => rankingToTable(ranking))],
          );
        }
        break;
      }
      case "medallero": {
        if (inSection) break;
        for (const key of picks.medals(block)) {
          const board = report.medals?.find((m) => m.id === key);
          if (!board) continue;
          add(
            block,
            { id: `medallero:${board.id}`, kind: "medallero", label: board.title, detail: board.source || undefined, group: EXPORT_GROUPS.rankings },
            () => [file("medallero", board.id, () => medalBoardToTable(board))],
          );
        }
        break;
      }
      case "libre": {
        if (inSection) break;
        const set = report.freeSets?.find((f) => f.id === block.refKey);
        if (!set || freeHome.get(set.id) !== block) break;
        add(
          block,
          { id: `libre:${set.id}`, kind: "libre", label: set.title, detail: set.source || undefined, group: EXPORT_GROUPS.tablas },
          // Una tabla personalizada sale como está escrita, con el nombre de cada tono.
          () => [file("conjunto", set.id, () => { const custom = customViewOf(set); return custom?.table ? customTableToTable(set, custom.table) : freeSetToTable(set); })],
        );
        break;
      }
      case "saber_tyt": {
        if (inSection) break;
        const shown = saberTytOf(report, block);
        if (!shown || shown.results.length === 0) break;
        add(
          block,
          { id: `saber_tyt:${shown.id}`, kind: "saber_tyt", label: shown.title, detail: shown.source || undefined, group: EXPORT_GROUPS.saber },
          () => [
            file("saber-tyt-resultados", shown.id, () => saberTytResultsToTable(shown)),
            // Sin curvas o sin modelos cargados, ese archivo saldría solo con su encabezado.
            ...(Object.keys(shown.benchmarks ?? {}).length > 0 ? [file("saber-tyt-curvas", shown.id, () => saberTytCurvesToTable(shown))] : []),
            ...(Object.keys(shown.alpha?.modelos ?? {}).length > 0 ? [file("saber-tyt-modelos", shown.id, () => saberTytModelsToTable(shown))] : []),
          ],
        );
        break;
      }
      case "saber_pro": {
        if (inSection) break;
        const shown = saberProOf(report, block);
        if (!shown || shown.results.length === 0) break;
        add(
          block,
          { id: `saber_pro:${shown.id}`, kind: "saber_pro", label: shown.title, detail: shown.source || undefined, group: EXPORT_GROUPS.saber },
          () => [file("saber-pro", shown.id, () => saberProToTable(shown))],
        );
        break;
      }
      case "modelo": {
        if (inSection) break;
        const model = report.models?.find((m) => m.id === block.refKey) ?? report.models?.[0];
        if (!model) break;
        add(
          block,
          { id: `modelo:${model.id}`, kind: "modelo", label: model.title, detail: model.source || undefined, group: EXPORT_GROUPS.saber },
          () => [file("modelo", model.id, () => modelToTable(model))],
        );
        break;
      }
      case "diversidad": {
        if (inSection) break;
        diversityEntries(report, catalog, block, add, file);
        break;
      }
      default:
        // separador, imagenes y metodologia no llevan datos.
        break;
    }
  }
  // El mapa del tablero de la diversidad puede haber entrado también como pareja
  // (`mapWith`) de otro mapa: se queda en su marco, que es donde el tablero lo dibuja.
  const origin = report.maps?.find((m) => m.mode === "municipio");
  if (origin && taken.has(DEI_MAP)) return entries.filter((entry) => entry.id !== `mapa:${origin.id}`);
  return entries;
}

/**
 * ¿El bloque dibuja algo del conjunto libre? Las guardas de FreeSetBlock: que
 * haya filas y al menos una vista completa entre las que le tocan.
 */
function freeBlockPainted(set: FreeSet, block: ReportBlock, ownViews: Set<string>): boolean {
  if (set.rows.length === 0) return false;
  const views = set.views.filter((v) => (block.settings.view ? v.key === block.settings.view : !ownViews.has(`${set.id}:${v.key}`)));
  return views.some((v) => viewProblems(set, v).length === 0);
}

/* --- Tablero de la diversidad -------------------------------------------------------------- */

type AddEntry = (block: ReportBlock, entry: Omit<ExportEntry, "blockKey" | "files">, files: () => CsvFile[]) => void;
type MakeFile = (kind: string, key: string, build: () => CsvTable) => CsvFile;

/**
 * Una entrada por marco del tablero (DiversityBoard), cada una solo si el
 * informe trae su dato. Los desgloses bajan con el corte que el tablero lee:
 * el segundo periodo de cada año o, si no se capturó, la cifra del año.
 */
function diversityEntries(report: Report, catalog: Catalog, block: ReportBlock, add: AddEntry, file: MakeFile) {
  const grupo = report.indicators.find((i) => i.id === DEI_INDICATORS[0]);
  // Sin el indicador titular, o sin ningún corte institucional, el tablero no sale.
  if (!grupo || !(grupo.years ?? []).some((y) => valueOf(grupo, y, ALL_CAMPUSES) !== null)) return;

  const group = EXPORT_GROUPS.diversidad;
  const breakdown = (id: string) => report.breakdowns.find((b) => b.id === id);
  const breakdownFiles = (list: (Breakdown | undefined)[]) =>
    list.filter(breakdownHasItems).map((b) => file("diversidad", b.id, () => breakdownToTable(b, { preferTerm: DEI_TERM })));
  const reservedIn = (list: (Breakdown | undefined)[]) => list.some((b) => b !== undefined && breakdownReserved(b));

  const frames: Record<(typeof DEI_FRAMES)[number], () => void> = {
    corte: () => {
      const indicators = DEI_INDICATORS.map((id) => report.indicators.find((i) => i.id === id)).filter((i): i is Indicator => Boolean(i));
      add(
        block,
        { id: "dei:corte", kind: "indicadores", label: "Grupos de protección constitucional, corte a corte", detail: joined(indicators.map((i) => i.source)), group },
        () => [
          file("diversidad", "corte-a-corte", () =>
            indicatorsToTable({ reportName: report.name, indicators, years: catalog.years, campuses: catalog.campuses }),
          ),
        ],
      );
    },
    etnico: () => {
      const list = [breakdown(DEI_BREAKDOWNS.indigena), breakdown(DEI_BREAKDOWNS.negra)];
      add(
        block,
        { id: "dei:etnico", kind: "desglose", label: "Pueblos y comunidades", detail: joined(list.map((b) => b?.source)), group, reserved: reservedIn(list) },
        () => breakdownFiles(list),
      );
    },
    mapa: () => {
      // Mapa de origen: el primero del informe que va por municipio.
      const origin = report.maps?.find((m) => m.mode === "municipio");
      if (!origin || !mapHasData(origin)) return;
      add(
        block,
        { id: DEI_MAP, kind: "mapa", label: origin.title, detail: origin.source || grupo.source || undefined, group, reserved: mapReserved(origin) },
        () => [file("diversidad", `mapa-${origin.id}`, () => mapToTable(origin, { campuses: catalog.campuses }))],
      );
    },
    discapacidad: () => {
      const list = [breakdown(DEI_BREAKDOWNS.tipoDiscapacidad)];
      add(
        block,
        { id: "dei:discapacidad", kind: "desglose", label: "Discapacidad declarada", detail: joined(list.map((b) => b?.source)), group, reserved: reservedIn(list) },
        () => breakdownFiles(list),
      );
    },
    estratos: () => {
      const list = [breakdown(DEI_BREAKDOWNS.estrato)];
      add(
        block,
        { id: "dei:estratos", kind: "desglose", label: "Estrato socioeconómico", detail: joined(list.map((b) => b?.source)), group, reserved: reservedIn(list) },
        () => breakdownFiles(list),
      );
    },
    "genero-zona": () => {
      const list = [breakdown(DEI_BREAKDOWNS.genero), breakdown(DEI_BREAKDOWNS.zona)];
      add(
        block,
        { id: "dei:genero-zona", kind: "desglose", label: "Género y zona", detail: joined(list.map((b) => b?.source)), group, reserved: reservedIn(list) },
        () => breakdownFiles(list),
      );
    },
    ines: () => {
      const ines = report.heatmaps?.find((h) => h.id === DEI_INES);
      if (!ines || ines.values.flat().every((v) => v === null)) return;
      add(
        block,
        { id: "dei:ines", kind: "mapa_calor", label: "Índice de Inclusión para la Educación Superior", detail: ines.source || undefined, group },
        () => [file("diversidad", "ines", () => heatmapToTable(ines))],
      );
    },
  };
  DEI_FRAMES.forEach((frame) => frames[frame]());
}

/* --- Para quien consume el registro ------------------------------------------------------------ */

/** Las entradas que muestra un bloque. */
export function exportsOfBlock(entries: ExportEntry[], block: ReportBlock): ExportEntry[] {
  const key = blockKeyOf(block);
  return entries.filter((entry) => entry.blockKey === key);
}

/** Una sola fuente para la acción «CSV» de un bloque: los archivos de sus entradas, seguidos. */
export function sourceOf(entries: ExportEntry[], name: string, zipName: string): ExportSource | undefined {
  const files = entries.flatMap((entry) => entry.files);
  return files.length > 0 ? { files, zipName, name } : undefined;
}

/* --- LEEME ---------------------------------------------------------------------------------- */

const cutoffFormat = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });

function cutoffText(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : cutoffFormat.format(date);
}

/** El LEEME.txt del zip: qué informe es, de qué corte, cómo leer los archivos y quién reporta cada uno. */
export function readmeText(report: Report, catalog: Pick<OpenDataCatalog, "cutoffDate" | "illustrative">, chosen: ExportEntry[]): string {
  const reserved = chosen.some((entry) => entry.reserved);
  const lines = [
    "UDES en Cifras · Universidad de Santander",
    "",
    `Informe: ${report.name}`,
    `Corte publicado: ${cutoffText(catalog.cutoffDate)}`,
    ...(catalog.illustrative ? ["Vista previa: las cifras son ilustrativas, no oficiales."] : []),
    "",
    "Formato",
    "- Archivos CSV en UTF-8, con punto y coma (;) como separador y coma decimal: Excel en español los abre sin configurar nada.",
    "- Una casilla vacía es un dato sin reportar, no un cero.",
    "- Un texto que empieza por =, +, - o @ lleva un apóstrofo (') delante, para que la hoja de cálculo no lo ejecute como fórmula. El apóstrofo se ve en la celda y no es parte del dato; los números negativos no lo llevan.",
    `- "< n" (por ejemplo "< 5") es reserva estadística: la celda tiene dato, pero tan pocos registros que no se publica su número.${reserved ? " Estos archivos traen celdas así." : ""}`,
    "- Los códigos DANE y DIVIPOLA empiezan a veces por cero (05, 08001). Si la hoja de cálculo lo quita, la columna de nombre de al lado dice de qué territorio se trata.",
    "- Cada archivo trae el conjunto completo: todos sus cortes y campus, no solo lo que la ficha tenía en pantalla.",
    "",
    "Archivos",
    ...chosen.flatMap((entry) =>
      entry.files.map((f) => `- ${f.filename}: ${entry.label}${entry.files.length > 1 ? ` (${entry.files.indexOf(f) + 1} de ${entry.files.length})` : ""}. Fuente: ${entry.detail ?? "no indicada"}.`),
    ),
    "",
  ];
  return lines.join("\r\n");
}
