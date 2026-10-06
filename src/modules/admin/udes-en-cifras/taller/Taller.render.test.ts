/* El taller dibujado en el servidor, sin navegador: comprueba que la pantalla
   arma la ficha con lo pendiente encima, que dice lo que debe según el informe
   esté publicado o no, y que la rejilla del editor trae todos los años. No
   sustituye a mirarla en un navegador: aquí no corren efectos ni estilos. */

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { OdIndicatorRow } from "../../../../types/database";
import { assembleCatalog } from "../../../datos-abiertos/data/repository";
import type { OpenDataRows } from "../../../datos-abiertos/data/repository";
import { indexValues, rowKeyOf } from "../indicator-grid";
import { cellKey } from "../sheet";
import { draftKey, emptyDraft, mergeValues } from "./draft";

const memory = new Map<string, string>();
vi.mock("./draft", async (original) => {
  const real = await original<typeof import("./draft")>();
  return {
    ...real,
    browserStorage: () => ({
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
      removeItem: (k: string) => void memory.delete(k),
    }),
  };
});
vi.mock("../../../../components/tour/TourProvider", () => ({ useTour: () => ({ start: () => undefined, isDone: () => true, active: null }) }));
vi.mock("../od-data", () => {
  const mutation = () => ({ mutateAsync: async () => undefined, mutate: () => undefined, isPending: false, error: null, isSuccess: false });
  return { useSaveBlocks: mutation, useSaveIndicator: mutation, useSaveValues: mutation };
});

// React avisa de que los efectos de maquetación no corren en el servidor: aquí es justo lo esperado.
beforeAll(() => {
  const error = console.error;
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("useLayoutEffect does nothing on the server")) return;
    error(...args);
  });
});

const { Taller } = await import("./Taller");
const { KpiEditor } = await import("./KpiEditor");

const indicator = (patch: Partial<OdIndicatorRow> = {}): OdIndicatorRow => ({
  id: "mat", report_id: "r1", key: "matriculados", label: "Estudiantes matriculados", unit: "estudiantes", format: "entero",
  direction: "sube", aggregation: "suma", reporting: "periodo", annual_rule: "ultimo", years: null, definition: "Matrícula al cierre",
  office_id: "o1", position: 1, is_kpi: true, kpi_position: 1, is_headline: true,
  ...patch,
});

const rows = (status: "publicado" | "borrador"): OpenDataRows =>
  ({
    period: { id: "p1", label: "2024-2025", start_year: 2024, end_year: 2025, status: "publicado", is_current: true },
    campuses: [
      { period_id: "p1", campus_id: "buc", label: "Bucaramanga", slug: "bucaramanga", position: 1 },
      { period_id: "p1", campus_id: "cuc", label: "Cúcuta", slug: "cucuta", position: 2 },
    ],
    offices: [{ id: "o1", name: "Admisiones y Registro Académico" }],
    reports: [{ id: "r1", period_id: "p1", slug: "poblacional", code: "PO", name: "Poblacional", line: 1, status, position: 1, summary: "", description: "", image_url: "", image_alt: "", image_credit: "" }],
    indicators: [indicator(), indicator({ id: "doc", key: "docentes", label: "Docentes", unit: "docentes", reporting: "anual", annual_rule: "reportado", is_headline: false, kpi_position: 2 })],
    values: [
      { indicator_id: "mat", year: 2025, term: "A", campus_id: "buc", value: 6200 },
      { indicator_id: "mat", year: 2025, term: "A", campus_id: "cuc", value: 2200 },
      { indicator_id: "mat", year: 2025, term: "B", campus_id: "buc", value: 6300 },
      { indicator_id: "doc", year: 2025, term: "anual", campus_id: "buc", value: 410 },
    ],
    breakdowns: [], breakdownValues: [], heatmaps: [], heatmapCells: [], maps: [], mapValues: [], pipelines: [], pipelineValues: [],
    histories: [], historyValues: [], sections: [], tables: [], rankings: [], rankingEditions: [], saberPro: [], saberProResults: [],
    freeSets: [], freeSetRows: [], saberTyt: [], saberTytResults: [], models: [], medalBoards: [], medalEntries: [], tableRows: [],
    blocks: [
      { id: "b1", report_id: "r1", kind: "separador", ref_id: null, position: 1, visible: true, settings: { title: "Matrícula", slot: "s1" } },
      { id: "b2", report_id: "r1", kind: "kpis", ref_id: null, position: 2, visible: true, settings: {} },
      { id: "b3", report_id: "r1", kind: "evolucion", ref_id: null, position: 3, visible: true, settings: { chart: "lineas" } },
      { id: "b4", report_id: "r1", kind: "rankings", ref_id: null, position: 4, visible: true, settings: {} },
      { id: "b5", report_id: "r1", kind: "metodologia", ref_id: null, position: 5, visible: false, settings: {} },
    ],
  }) as unknown as OpenDataRows;

function draw(status: "publicado" | "borrador", canEdit = true) {
  const data = rows(status);
  const catalog = assembleCatalog(data);
  return renderToString(
    createElement(
      MemoryRouter,
      null,
      createElement(Taller, {
        data: { rows: data, catalog },
        report: catalog.reports[0],
        periodId: "p1",
        canEdit,
        progress: new Map(),
        classicHref: (station, hash) => `/admin/udes-en-cifras/${station}/poblacional${hash ? `#${hash}` : ""}`,
      }),
    ),
  );
}

const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("el taller, dibujado", () => {
  it("informe sin publicar: la ficha con sus bloques en orden y guardado automático", () => {
    memory.clear();
    const html = draw("borrador");
    const read = text(html);
    expect(read).toContain("Lo que escriba se guarda solo.");
    expect(read).toContain("Así lo ve el público");
    expect(read).not.toContain("Este informe está publicado");
    // Los cinco bloques, en su orden, con su tipo.
    const order = ["Separador", "Tablero de indicadores", "Evolución por campus", "Rankings", "Qué mide cada cifra"].map((label) => html.indexOf(`odt-block__kind">${label}<`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // El tablero se dibuja con el componente del portal y sus cifras.
    expect(html).toContain("od-kpi");
    expect(read).toContain("Estudiantes matriculados");
    // Un tipo que no se incrusta: su ayuda y cómo se llena.
    expect(read).toContain("Posiciones en QS, THE y otros rankings");
    expect(read).toContain("se maneja en la vista clásica (Captura › Rankings)");
    // Un bloque oculto lo dice.
    expect(read).toContain("Oculto: el público no lo ve");
    expect(read).toContain("Llamar a Pilo");
    expect(read).toContain("Añadir algo a la ficha");
  });

  it("informe publicado: los cambios quedan pendientes en este equipo y se ven en la ficha", () => {
    memory.clear();
    const data = rows("publicado");
    const draft = mergeValues(emptyDraft(), { [cellKey(rowKeyOf("mat", "cuc"), "2025-B")]: 2345 }, indexValues(data.values));
    memory.set(draftKey("p1", "r1"), JSON.stringify(draft));
    const html = draw("publicado");
    const read = text(html);
    expect(read).toContain("Este informe está publicado.");
    expect(read).toContain("solo en este equipo");
    expect(read).toContain("Publicar cambios (1)");
    expect(read).toContain("Descartar cambios");
    expect(read).toContain("1 cambio pendiente, solo en este equipo");
    expect(read).toContain("Con cambios pendientes");
    // La ficha abre en 2025-2 y el total ya suma lo pendiente: 6.300 + 2.345.
    // (La cifra va en paletas: su lectura completa está en la etiqueta accesible.)
    expect(html).toContain("8.645 estudiantes");
    expect(read).toContain("Total institucional 8.645");
  });

  it("publicado y sin cambios: no ofrece publicar", () => {
    memory.clear();
    const read = text(draw("publicado"));
    expect(read).toContain("Sin cambios pendientes.");
    expect(read).not.toContain("Publicar cambios (");
    expect(read).not.toContain("Descartar cambios");
  });

  it("sin permiso: solo lectura, sin borrador ni botones de edición", () => {
    memory.clear();
    memory.set(draftKey("p1", "r1"), JSON.stringify(mergeValues(emptyDraft(), { [cellKey(rowKeyOf("mat", "cuc"), "2025-B")]: 1 }, new Map())));
    const html = draw("publicado", false);
    const read = text(html);
    expect(read).toContain("Solo lectura");
    expect(read).not.toContain("Publicar cambios");
    expect(read).not.toContain("Este informe está publicado.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Añadir algo a la ficha/s);
  });

  it("sin informe elegido lo pide", () => {
    const data = rows("borrador");
    const html = renderToString(
      createElement(
        MemoryRouter,
        null,
        createElement(Taller, { data: { rows: data, catalog: assembleCatalog(data) }, report: undefined, periodId: "p1", canEdit: true, progress: new Map(), classicHref: () => "/" }),
      ),
    );
    expect(text(html)).toContain("Elija un informe");
  });
});

describe("el editor del tablero, dibujado", () => {
  const data = rows("borrador");
  const base = {
    campuses: data.campuses,
    offices: data.offices,
    years: [2024, 2025],
    stored: indexValues(data.values),
    values: {},
    canEdit: true,
    onValues: () => undefined,
    onPasted: () => undefined,
    onPatch: () => undefined,
    structureHref: "/admin/udes-en-cifras/estructura/poblacional",
  };
  const editor = (mode: "sencillo" | "completo", indicators = data.indicators) =>
    renderToString(createElement(MemoryRouter, null, createElement(KpiEditor, { ...base, mode, indicators })));

  it("una rejilla por indicador, con todos los años del periodo y los periodos 1 y 2", () => {
    const html = editor("sencillo");
    expect(html.match(/<table/g)).toHaveLength(2);
    const read = text(html);
    expect(read).toContain("todos los años del periodo 2024–2025");
    expect(read).toContain("Periodo 1");
    expect(read).toContain("Periodo 2");
    // Por periodo: 2 campus × 2 años × 2 periodos = 8 casillas; el total y el año van bloqueados.
    expect(html.match(/aria-label="(Bucaramanga|Cúcuta), 20\d\d, periodo [12]"/g)).toHaveLength(8);
    expect(html).not.toMatch(/aria-label="Total institucional, 2025, periodo 1"/);
    // Por año: una casilla por año y campus.
    expect(html.match(/aria-label="(Bucaramanga|Cúcuta), 20\d\d, cifra del año"/g)).toHaveLength(4);
  });

  it("lo bloqueado dice por qué, a la vista", () => {
    const read = text(editor("sencillo"));
    expect(read).toContain("Total institucional: se suma de los campus y queda vacío si falta alguno.");
    expect(read).toContain("Columna «Año»: se calcula con la regla de este dato (último periodo reportado).");
    // El total calculado: 6.200 + 2.200.
    expect(read).toContain("8.400");
  });

  it("junto a cada dato: cómo se reporta y, si es por periodo, la regla del año", () => {
    const read = text(editor("sencillo"));
    expect(read).toContain("Este dato se reporta");
    expect(read).toContain("Por periodo (1 y 2)");
    expect(read).toContain("Por año");
    // Solo el indicador por periodo trae «Cifra del año».
    expect(read.match(/Cifra del año Suma de los periodos/g)).toHaveLength(1);
  });

  it("sencillo: la rejilla sola; completo: los campos de definición", () => {
    expect(text(editor("sencillo"))).not.toContain("Lectura de la variación");
    const complete = text(editor("completo"));
    for (const field of ["Nombre del indicador", "Unidad", "Formato", "Lectura de la variación", "Total institucional", "Oficina que reporta", "Qué mide y cómo"]) {
      expect(complete).toContain(field);
    }
    expect(complete).toContain("La clave «matriculados» no se cambia");
  });

  it("un tablero sin indicadores lo dice y manda a crearlos", () => {
    expect(text(editor("sencillo", []))).toContain("Este tablero todavía no tiene indicadores.");
  });
});
