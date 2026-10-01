import { describe, expect, it } from "vitest";
import { toCsvText } from "./csv-export";
import { BD, IND, INES_KEY, TERM } from "./dei";
import { blockKeyOf, DEI_BREAKDOWNS, DEI_INDICATORS, DEI_INES, DEI_TERM, exportsOfBlock, readmeText, reportExports, sourceOf } from "./export-registry";
import type { ExportEntry } from "./export-registry";
import type { FreeSet } from "./free-sets";
import { inSectionOf, lastFreeBlock, orderedBlocks, ownFreeViews, pageBlocks, pairedMaps } from "./groups";
import type { Breakdown, HeatmapData, HistoryData, Indicator, MapDataset, PipelineData, Report, ReportBlock, ReportSection, TableData } from "./types";

const catalog = {
  years: [2023, 2024],
  campuses: [
    { id: "todas", name: "Total institucional" },
    { id: "bucaramanga", name: "Bucaramanga" },
  ],
  cutoffDate: "2025-06-30",
  illustrative: false,
};

/* --- Fixtures mínimos ------------------------------------------------------------------ */

const indicator = (id: string, source = "Registro"): Indicator => ({
  id,
  label: `Indicador ${id}`,
  unit: "estudiantes",
  format: "entero",
  direction: "sube",
  definition: "",
  source,
  years: [2023, 2024],
  values: { 2023: { todas: 10, bucaramanga: 6 }, 2024: { todas: 12, bucaramanga: 7 } },
});

const breakdown = (id: string, reserved = false): Breakdown => ({
  id,
  title: `Desglose ${id}`,
  unit: "estudiantes",
  format: "entero",
  source: "Bienestar",
  values: {
    2024: [
      { label: "Uno", value: 40 },
      { label: "Dos", value: reserved ? 3 : 20, ...(reserved ? { reserved: true } : {}) },
    ],
  },
});

const map = (id: string, mode: MapDataset["mode"], extra: Partial<MapDataset> = {}): MapDataset => ({
  id,
  title: `Mapa ${id}`,
  description: "",
  mode,
  unit: "personas",
  source: "Internacionalización",
  values: { 2024: { todas: mode === "municipio" ? { "68001": 9 } : mode === "origen" ? { "68": 9 } : { USA: 4 } } },
  ...extra,
});

const pipeline: PipelineData = {
  id: "cohortes",
  title: "Permanencia",
  description: "",
  stages: ["Ingreso", "Semestre 2"],
  cohorts: [{ cohort: "2020-A", campus: "todas", remaining: [100, 80], mainCause: ["Económica"] }],
  source: "Permanencia",
};

const history: HistoryData = {
  id: "matricula",
  title: "Matrícula histórica",
  description: "",
  unit: "estudiantes",
  format: "entero",
  totalLabel: "Total",
  source: "Registro",
  periods: ["2020-A"],
  categories: ["Pregrado"],
  total: { "2020-A": 10 },
  values: { Pregrado: { "2020-A": 10 } },
};

const heatmap = (id: string, values: (number | null)[][] = [[1, 2]]): HeatmapData => ({
  id,
  title: `Matriz ${id}`,
  description: "",
  rowLabel: "Factor",
  columnLabel: "Grupo",
  rows: ["F1"],
  columns: ["Estudiantes", "Docentes"],
  values,
  unit: "puntos",
  format: "decimal",
  source: "Bienestar",
  emptyMeaning: "",
});

const table = (id: string, rows: TableData["rows"] = [{ a: "x" }]): TableData => ({
  id,
  title: `Tabla ${id}`,
  description: "",
  display: "tabla",
  columns: [{ key: "a", label: "A", format: "texto" }],
  rows,
  source: "Planeación",
});

const freeSet = (id: string, rows = 1): FreeSet => ({
  id,
  title: `Conjunto ${id}`,
  description: "",
  source: "Extensión",
  temporality: "sin_tiempo",
  periodLabel: "",
  columns: [
    { key: "sede", label: "Sede", kind: "texto" },
    { key: "n", label: "Cantidad", kind: "cifra" },
  ],
  rows: Array.from({ length: rows }, () => ({ year: null, kind: "dato" as const, label: "", cells: { sede: "Bucaramanga", n: 3 } })),
  views: [
    { key: "barras", title: "Barras", type: "barras", category: "sede", series: ["n"] },
    { key: "torta", title: "Torta", type: "circular", category: "sede", series: ["n"] },
  ],
});

const report = (extra: Partial<Report> = {}): Report => ({
  slug: "matricula",
  code: "MA",
  name: "Matrícula",
  summary: "",
  description: "",
  image: { src: "", alt: "", credit: "" },
  line: 1,
  keyIndicators: ["b"],
  indicators: [indicator("a"), indicator("b", "Admisiones")],
  breakdowns: [],
  ...extra,
});

let position = 0;
const block = (kind: ReportBlock["kind"], extra: Partial<ReportBlock> = {}): ReportBlock => ({
  kind,
  refKey: null,
  visible: true,
  position: (position += 1),
  settings: {},
  ...extra,
});

const section = (key: string): ReportSection => ({
  key,
  number: 1,
  title: key,
  status: "completo",
  lede: "",
  warning: "",
  source: "",
  requested: [],
  position: 0,
});

const ids = (entries: ExportEntry[]) => entries.map((e) => e.id);
const names = (entries: ExportEntry[]) => entries.flatMap((e) => e.files.map((f) => f.filename));

/* --- Helpers compartidos con la ficha ------------------------------------------------------ */

describe("reglas de la ficha (groups.ts)", () => {
  it("sin bloques declarados usa el orden por defecto, con un bloque por conjunto", () => {
    const r = report({ maps: [map("a", "origen"), map("b", "cobertura")], heatmaps: [heatmap("h")], histories: [history], pipelines: [pipeline] });
    expect(orderedBlocks(r).map((b) => `${b.kind}:${b.refKey ?? ""}`)).toEqual([
      "kpis:",
      "evolucion:",
      "historico:matricula",
      "mapa:a",
      "mapa:b",
      "tuberia:cohortes",
      "mapa_calor:h",
      "desgloses:",
      "tabla_dinamica:",
      "metodologia:",
    ]);
  });

  it("con bloques declarados quita los ocultos y ordena por posición", () => {
    const r = report({
      blocks: [
        { kind: "metodologia", visible: true, position: 3, settings: {} },
        { kind: "kpis", visible: false, position: 1, settings: {} },
        { kind: "evolucion", visible: true, position: 2, settings: {} },
      ],
    });
    expect(orderedBlocks(r).map((b) => b.kind)).toEqual(["evolucion", "metodologia"]);
  });

  it("el mapa que otro pide va dentro de ese; si se piden mutuamente, gana el primero", () => {
    const blocks = [
      block("mapa", { refKey: "entra", settings: { mapWith: "sale" } }),
      block("mapa", { refKey: "sale", settings: { mapWith: "entra" } }),
    ];
    expect([...pairedMaps(blocks)]).toEqual(["sale"]);
  });

  it("la tabla de origen de un conjunto libre va en su último bloque", () => {
    const all = block("libre", { refKey: "f" });
    const own = block("libre", { refKey: "f", settings: { view: "torta" } });
    const r = report({ freeSets: [freeSet("f")], blocks: [own, all] });
    const blocks = orderedBlocks(r);
    expect([...ownFreeViews(blocks)]).toEqual(["f:torta"]);
    expect(lastFreeBlock(r, blocks).get("f")).toBe(own);
  });

  it("lee primero los bloques de cada punto y después los de toda la ficha", () => {
    const loose = block("evolucion");
    const inPoint = block("tabla", { refKey: "t", sectionKey: "p1" });
    const orphan = block("tabla", { refKey: "u", sectionKey: "no-existe" });
    const r = report({ sections: [section("p1")], blocks: [loose, inPoint, orphan] });
    expect(inSectionOf(r, inPoint)).toBe(true);
    expect(inSectionOf(r, orphan)).toBe(false);
    expect(pageBlocks(r).map((x) => [x.block.kind, x.block.refKey, x.inSection])).toEqual([
      ["tabla", "t", true],
      ["evolucion", null, false],
      ["tabla", "u", false],
    ]);
  });
});

/* --- El registro -------------------------------------------------------------------------- */

describe("reportExports", () => {
  it("en el orden por defecto lista lo que la ficha pinta, en su orden", () => {
    const r = report({
      breakdowns: [breakdown("genero"), breakdown("edad", true)],
      maps: [map("origen", "origen")],
      heatmaps: [heatmap("h")],
      histories: [history],
      pipelines: [pipeline],
    });
    const entries = reportExports(r, catalog);
    expect(ids(entries)).toEqual([
      "indicadores:tablero",
      "historico:matricula",
      "mapa:origen",
      "tuberia:cohortes",
      "mapa_calor:h",
      "desglose:genero",
      "desglose:edad",
    ]);
    expect(entries.map((e) => e.group)).toEqual(["Indicadores", "Tablas y series", "Mapas", "Tablas y series", "Tablas y series", "Desgloses", "Desgloses"]);
    expect(entries[0].detail).toBe("Admisiones · Registro");
    expect(entries.find((e) => e.id === "desglose:edad")?.reserved).toBe(true);
    expect(entries.find((e) => e.id === "desglose:genero")?.reserved).toBeUndefined();
    expect(names(entries)[0]).toBe("udes-en-cifras-matricula-indicadores-tablero.csv");
  });

  it("no ofrece un bloque oculto ni un conjunto vacío", () => {
    const r = report({
      heatmaps: [heatmap("vacia", [[null, null]]), heatmap("llena")],
      tables: [table("sin-filas", []), table("t")],
      histories: [history],
      blocks: [
        block("historico", { refKey: "matricula", visible: false }),
        block("mapa_calor", { refKey: "vacia" }),
        block("mapa_calor", { refKey: "llena" }),
        block("tabla", { refKey: "sin-filas" }),
        block("tabla", { refKey: "t" }),
        // Una tabla sin clave no apunta a nada.
        block("tabla"),
        block("separador", { settings: { title: "Grupo" } }),
        block("imagenes"),
        block("metodologia"),
      ],
    });
    expect(ids(reportExports(r, catalog))).toEqual(["mapa_calor:llena", "tabla:t"]);
  });

  it("los mapas emparejados salen los dos en el bloque que pide la pareja", () => {
    const host = block("mapa", { refKey: "entra", settings: { mapWith: "sale", mapLayout: "combinado" } });
    const partnerBlock = block("mapa", { refKey: "sale" });
    const r = report({ maps: [map("entra", "entrante"), map("sale", "saliente")], blocks: [host, partnerBlock] });
    const entries = reportExports(r, catalog);
    expect(ids(entries)).toEqual(["mapa:entra", "mapa:sale"]);
    expect(exportsOfBlock(entries, host)).toHaveLength(2);
    expect(exportsOfBlock(entries, partnerBlock)).toHaveLength(0);
    expect(sourceOf(exportsOfBlock(entries, host), "Movilidad", "movilidad.zip")).toMatchObject({ name: "Movilidad", zipName: "movilidad.zip" });
    expect(sourceOf(exportsOfBlock(entries, host), "Movilidad", "movilidad.zip")?.files).toHaveLength(2);
    expect(sourceOf([], "Nada", "nada.zip")).toBeUndefined();
  });

  it("con el tablero de la diversidad, el mapa por municipio sale una vez y como marco del tablero", () => {
    const grupo = indicator("grupo-especial");
    const municipio = map("origen-municipio", "municipio", { reserved: { 2024: { todas: ["68276"] } } });
    const mapBlock = block("mapa", { refKey: "origen-municipio" });
    const dei = block("diversidad");
    const r = report({
      indicators: [grupo, indicator("etnico"), indicator("otro")],
      keyIndicators: [],
      breakdowns: [breakdown("pueblo-indigena", true), breakdown("comunidad-negra"), breakdown("estrato"), breakdown("genero"), breakdown("tipo-discapacidad")],
      heatmaps: [heatmap("ines-grupos")],
      maps: [municipio],
      blocks: [mapBlock, dei],
    });
    const entries = reportExports(r, catalog);
    expect(ids(entries)).toEqual(["dei:corte", "dei:etnico", "dei:mapa", "dei:discapacidad", "dei:estratos", "dei:genero-zona", "dei:ines"]);
    expect(entries.every((e) => e.group === "Diversidad" && e.blockKey === blockKeyOf(dei))).toBe(true);
    // Étnico: un archivo por desglose. Género y zona: solo género, que es el que el informe trae.
    expect(entries.find((e) => e.id === "dei:etnico")?.files).toHaveLength(2);
    expect(entries.find((e) => e.id === "dei:genero-zona")?.files).toHaveLength(1);
    expect(entries.find((e) => e.id === "dei:etnico")?.reserved).toBe(true);
    expect(entries.find((e) => e.id === "dei:mapa")?.reserved).toBe(true);
    // El corte a corte lleva los indicadores del tablero y no otros.
    const corte = entries.find((e) => e.id === "dei:corte")?.files[0].build();
    expect(new Set(corte?.rows.map((row) => row[1]))).toEqual(new Set(["grupo-especial", "etnico"]));
    // El desglose baja con el corte que lee el tablero y sin el número reservado.
    const etnico = toCsvText(entries.find((e) => e.id === "dei:etnico")!.files[0].build());
    expect(etnico).toContain("< 5");
    expect(etnico.split("\n").some((line) => line.split(";").includes("3"))).toBe(false);

    // Sin el tablero, el mismo mapa sale como mapa.
    expect(ids(reportExports({ ...r, blocks: [mapBlock] }, catalog))).toEqual(["mapa:origen-municipio"]);
    // Sin el indicador titular el tablero no se pinta: no hay marcos, y el mapa tampoco vuelve.
    expect(reportExports({ ...r, indicators: [indicator("otro")] }, catalog)).toEqual([]);
  });

  it("un conjunto libre con una vista propia y un bloque de todas las vistas da una sola entrada, en el último", () => {
    const all = block("libre", { refKey: "f" });
    const own = block("libre", { refKey: "f", settings: { view: "torta" } });
    const r = report({ freeSets: [freeSet("f"), freeSet("vacio", 0)], blocks: [all, own, block("libre", { refKey: "vacio" }), block("libre", { refKey: "no-existe" })] });
    const entries = reportExports(r, catalog);
    expect(ids(entries)).toEqual(["libre:f"]);
    expect(entries[0].blockKey).toBe(blockKeyOf(own));
    expect(exportsOfBlock(entries, all)).toEqual([]);
    expect(entries[0].files[0].build().header).toEqual(["Sede", "Cantidad"]);
  });

  it("dentro de un punto no salen los tipos que la ficha no pinta ahí", () => {
    const r = report({
      sections: [section("p1")],
      breakdowns: [breakdown("genero")],
      tables: [table("t")],
      freeSets: [freeSet("f")],
      heatmaps: [heatmap("ines-grupos")],
      indicators: [indicator("grupo-especial")],
      keyIndicators: [],
      blocks: [
        block("libre", { refKey: "f", sectionKey: "p1" }),
        block("diversidad", { sectionKey: "p1" }),
        block("rankings", { sectionKey: "p1" }),
        block("medallero", { sectionKey: "p1" }),
        block("saber_pro", { sectionKey: "p1" }),
        block("saber_tyt", { sectionKey: "p1" }),
        block("modelo", { sectionKey: "p1" }),
        block("separador", { sectionKey: "p1" }),
        block("tabla", { refKey: "t", sectionKey: "p1" }),
        block("desgloses", { sectionKey: "p1" }),
        block("kpis", { sectionKey: "p1" }),
      ],
    });
    expect(ids(reportExports(r, catalog))).toEqual(["tabla:t", "desglose:genero", "indicadores:tablero"]);
    // Si el punto no existe, el bloque es de toda la ficha y sí se pinta.
    expect(ids(reportExports({ ...r, sections: [] }, catalog))).toContain("libre:f");
  });

  it("no repite indicadores entre tableros, evolución y tabla dinámica", () => {
    const boards = report({
      indicators: [indicator("a"), indicator("b"), indicator("c")],
      blocks: [
        block("kpis", { settings: { slot: "uno", indicators: ["a"] } }),
        block("kpis", { settings: { slot: "dos", title: "Resto" } }),
        block("evolucion"),
        block("tabla_dinamica"),
      ],
    });
    const entries = reportExports(boards, catalog);
    expect(ids(entries)).toEqual(["indicadores:uno", "indicadores:dos"]);
    expect(entries[1].label).toBe("Resto");
    const keys = entries.flatMap((e) => e.files[0].build().rows.map((row) => row[1]));
    expect([...new Set(keys)].sort()).toEqual(["a", "b", "c"]);
    expect(keys.filter((k) => k === "a")).toHaveLength(catalog.campuses.length);

    // Sin tablero, una sola entrada con todos, en el primer bloque que los muestra.
    const none = report({ blocks: [block("evolucion"), block("tabla_dinamica")] });
    const single = reportExports(none, catalog);
    expect(ids(single)).toEqual(["indicadores:todos"]);
    expect(single[0].blockKey).toBe(blockKeyOf(none.blocks![0]));

    // Un tablero que elige solo algunos deja el resto a la evolución, sin repetir.
    const partial = report({
      indicators: [indicator("a"), indicator("b"), indicator("c")],
      blocks: [block("kpis", { settings: { indicators: ["a"] } }), block("tabla_dinamica")],
    });
    const split = reportExports(partial, catalog);
    expect(ids(split)).toEqual(["indicadores:tablero", "indicadores:otros"]);
    expect([...new Set(split[1].files[0].build().rows.map((row) => row[1]))]).toEqual(["b", "c"]);

    // Sin ningún bloque que los muestre, no se ofrecen.
    expect(reportExports(report({ blocks: [block("metodologia")] }), catalog)).toEqual([]);
  });

  it("un conjunto que dos bloques muestran sale una vez: gana el primero", () => {
    const first = block("desgloses", { refKey: "genero" });
    const second = block("desgloses", { settings: { breakdowns: ["genero"] } });
    const r = report({ breakdowns: [breakdown("genero")], tables: [table("t")], blocks: [first, second, block("tabla", { refKey: "t" }), block("tabla", { refKey: "t" })] });
    const entries = reportExports(r, catalog);
    expect(ids(entries)).toEqual(["desglose:genero", "tabla:t"]);
    expect(entries[0].blockKey).toBe(blockKeyOf(first));
  });

  it("los ids y los nombres de archivo son únicos", () => {
    const r = report({
      breakdowns: [breakdown("Género"), breakdown("genero")],
      tables: [table("genero")],
      maps: [map("genero", "origen")],
      blocks: [block("kpis"), block("kpis", { settings: { indicators: ["a"] } }), block("desgloses"), block("tabla", { refKey: "genero" }), block("mapa", { refKey: "genero" })],
    });
    const entries = reportExports(r, catalog);
    expect(entries).toHaveLength(6);
    expect(new Set(ids(entries)).size).toBe(entries.length);
    expect(new Set(names(entries)).size).toBe(names(entries).length);
    // Dos claves que dan el mismo nombre: la segunda lleva "-2".
    expect(names(entries)).toContain("udes-en-cifras-matricula-desglose-genero.csv");
    expect(names(entries)).toContain("udes-en-cifras-matricula-desglose-genero-2.csv");
    expect(names(entries).every((name) => name.endsWith(".csv"))).toBe(true);
  });
});

describe("claves del tablero de la diversidad", () => {
  // El registro no importa dei.ts (arrastra open-data.ts): repite sus claves y esto vigila que no se separen.
  it("son las de dei.ts", () => {
    expect(DEI_INDICATORS).toEqual(Object.values(IND));
    expect(DEI_BREAKDOWNS).toEqual(BD);
    expect(DEI_INES).toBe(INES_KEY);
    expect(DEI_TERM).toBe(TERM);
  });
});

describe("readmeText", () => {
  const r = report({ breakdowns: [breakdown("edad", true)], tables: [table("t")], blocks: [block("kpis"), block("desgloses"), block("tabla", { refKey: "t" })] });
  const entries = reportExports(r, catalog);

  it("dice el informe, el corte y el formato, y lista los archivos elegidos con su fuente", () => {
    const chosen = entries.filter((e) => e.id !== "tabla:t");
    const text = readmeText(r, catalog, chosen);
    expect(text).toContain("Informe: Matrícula");
    expect(text).toContain("30 de junio de 2025");
    expect(text).toContain("punto y coma");
    expect(text).toContain("coma decimal");
    expect(text).toContain("sin reportar");
    expect(text).toContain('"< n"');
    for (const entry of chosen) for (const file of entry.files) expect(text).toContain(file.filename);
    expect(text).toContain("udes-en-cifras-matricula-desglose-edad.csv: Desglose edad. Fuente: Bienestar.");
    expect(text).not.toContain("tabla-t.csv");
  });

  it("solo habla de vista previa si el periodo es ilustrativo", () => {
    expect(readmeText(r, catalog, entries)).not.toMatch(/ilustrativ|vista previa/i);
    expect(readmeText(r, { ...catalog, illustrative: true }, entries)).toMatch(/Vista previa: las cifras son ilustrativas/);
  });
});
