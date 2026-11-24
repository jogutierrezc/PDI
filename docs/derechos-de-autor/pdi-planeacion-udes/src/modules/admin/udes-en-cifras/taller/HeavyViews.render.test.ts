/* Los bloques de montaje pesado, dibujados en el servidor: comprueba que el
   archivo carga con todos los componentes del portal que usa y que cada caso
   arma su bloque con los datos del informe. No sustituye a mirarlo. */

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withPeriodView } from "../../../datos-abiertos/data/open-data";
import { assembleCatalog } from "../../../datos-abiertos/data/repository";
import type { OpenDataRows } from "../../../datos-abiertos/data/repository";
import type { ReportBlock } from "../../../datos-abiertos/data/types";
import { renderBlock } from "./BlockView";
import HeavyBlock from "./HeavyViews";

beforeAll(() => {
  const error = console.error;
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("useLayoutEffect does nothing on the server")) return;
    error(...args);
  });
});

const rows = {
  period: { id: "p1", label: "2024-2025", start_year: 2024, end_year: 2025, status: "publicado", is_current: true },
  campuses: [{ period_id: "p1", campus_id: "buc", label: "Bucaramanga", slug: "bucaramanga", position: 1 }],
  offices: [{ id: "o1", name: "Relaciones Internacionales" }],
  reports: [{ id: "r1", period_id: "p1", slug: "visibilidad", code: "VI", name: "Visibilidad", line: 3, status: "borrador", position: 1, summary: "", description: "", image_url: "", image_alt: "", image_credit: "" }],
  indicators: [{ id: "i1", report_id: "r1", key: "convenios", label: "Convenios activos", unit: "convenios", format: "entero", direction: "sube", aggregation: "suma", reporting: "anual", annual_rule: "reportado", years: null, definition: "", office_id: "o1", position: 1, is_kpi: true, kpi_position: 1, is_headline: true }],
  values: [{ indicator_id: "i1", year: 2025, term: "anual", campus_id: "buc", value: 42 }],
  maps: [{ id: "m1", report_id: "r1", key: "origen", title: "Origen de los estudiantes", description: "", mode: "origen", reporting: "anual", unit: "estudiantes", office_id: "o1", years: null, position: 1 }],
  mapValues: [{ map_id: "m1", year: 2025, campus_id: "buc", department_code: "68", value: 1200 }],
  rankings: [{ id: "k1", report_id: "r1", key: "qs", title: "QS World University Rankings", description: "", system: "qs_world", accent: "", view: "medallas", office_id: "o1", position: 1 }],
  rankingEditions: [{ ranking_id: "k1", year: 2025, global_rank: "801-1000", regional_rank: "145", national_rank: "=20", score: null, stars: null, sdgs: [], areas: [], note: "" }],
  breakdowns: [], breakdownValues: [], heatmaps: [], heatmapCells: [], pipelines: [], pipelineValues: [], histories: [], historyValues: [], sections: [], tables: [],
  saberPro: [], saberProResults: [], freeSets: [], freeSetRows: [], saberTyt: [], saberTytResults: [], models: [], medalBoards: [], medalEntries: [], tableRows: [],
  blocks: [
    { id: "b1", report_id: "r1", kind: "mapa", ref_id: "m1", position: 1, visible: true, settings: {} },
    { id: "b2", report_id: "r1", kind: "rankings", ref_id: null, position: 2, visible: true, settings: {} },
    { id: "b3", report_id: "r1", kind: "tabla_dinamica", ref_id: null, position: 3, visible: true, settings: {} },
    { id: "b4", report_id: "r1", kind: "medallero", ref_id: null, position: 4, visible: true, settings: {} },
  ],
} as unknown as OpenDataRows;

const catalog = withPeriodView(assembleCatalog(rows));
const report = catalog.reports[0];
const context = { catalog, report, cut: { year: 2025, term: null }, campus: "todas", noop: () => undefined };
const block = (kind: string) => report.blocks!.find((b) => b.kind === kind) as ReportBlock;
const draw = (kind: string) => renderToString(createElement(MemoryRouter, null, createElement(HeavyBlock, { block: block(kind), context })));

describe("bloques de montaje pesado", () => {
  it("la tabla dinámica se arma con las cifras del informe", () => {
    const html = draw("tabla_dinamica");
    expect(html).toContain("Convenios activos");
    expect(html).toContain("<table");
  });

  it("el mapa por departamento se dibuja con el componente del portal", () => {
    const html = draw("mapa");
    expect(html).toContain("Origen de los estudiantes");
    expect(html).toContain("<svg");
  });

  it("los rankings muestran sus ediciones", () => {
    expect(draw("rankings")).toContain("QS World University Rankings");
  });

  it("un bloque sin datos no se dibuja: el taller dice que falta llenarlo", () => {
    expect(renderBlock(block("medallero"), context)).toEqual({ embedded: true, node: null });
    expect(renderBlock(block("mapa"), context).node).not.toBeNull();
    expect(renderBlock(block("rankings"), context).node).not.toBeNull();
  });
});
