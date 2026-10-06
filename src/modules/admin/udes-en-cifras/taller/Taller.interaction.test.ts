// @vitest-environment jsdom
/* El taller en un DOM de pruebas (jsdom): se elige un bloque, se escribe, se
   pega, se mueve, se quita y se deshace, y se comprueba qué llega a las
   mutaciones de siempre y cuándo. Las escrituras son espías: aquí no hay base.
   No sustituye a mirarlo en un navegador (jsdom no calcula estilos ni tamaños). */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OdIndicatorRow } from "../../../../types/database";
import { assembleCatalog } from "../../../datos-abiertos/data/repository";
import type { OpenDataRows } from "../../../datos-abiertos/data/repository";
import { draftKey } from "./draft";

const memory = new Map<string, string>();
const saveValues = vi.fn(async (_input: unknown) => undefined);
const saveIndicator = vi.fn(async (_input: unknown) => undefined);
const saveBlocks = vi.fn(async (_input: unknown) => undefined);
const startTour = vi.fn();

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
vi.mock("../../../../components/tour/TourProvider", () => ({ useTour: () => ({ start: startTour, isDone: () => true, active: null }) }));
vi.mock("../../../../components/pilo/PiloAvatar", () => ({ PiloAvatar: () => null }));
vi.mock("./pilo-motion", () => ({
  openPanel: () => undefined,
  closePanel: async () => undefined,
  playSpeech: () => undefined,
  enterToast: () => undefined,
  settleBlock: () => undefined,
}));
vi.mock("../od-data", () => {
  const mutation = (mutateAsync: unknown) => () => ({ mutateAsync, mutate: () => undefined, isPending: false, error: null, isSuccess: false });
  return { useSaveBlocks: mutation(saveBlocks), useSaveIndicator: mutation(saveIndicator), useSaveValues: mutation(saveValues) };
});

const { Taller } = await import("./Taller");

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const g = globalThis as Record<string, unknown>;
  g.ResizeObserver = Observer;
  g.IntersectionObserver = Observer;
  if (!("CSS" in g)) g.CSS = {};
  (g.CSS as { escape?: (s: string) => string }).escape ??= (s: string) => s;
  window.matchMedia ??= ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView ??= () => undefined;
});

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
    ],
    breakdowns: [], breakdownValues: [], heatmaps: [], heatmapCells: [], maps: [], mapValues: [], pipelines: [], pipelineValues: [],
    histories: [], historyValues: [], sections: [], tables: [], rankings: [], rankingEditions: [], saberPro: [], saberProResults: [],
    freeSets: [], freeSetRows: [], saberTyt: [], saberTytResults: [], models: [], medalBoards: [], medalEntries: [], tableRows: [],
    blocks: [
      { id: "b1", report_id: "r1", kind: "separador", ref_id: null, position: 1, visible: true, settings: { title: "Matrícula", slot: "s1" } },
      { id: "b2", report_id: "r1", kind: "kpis", ref_id: null, position: 2, visible: true, settings: {} },
      { id: "b3", report_id: "r1", kind: "evolucion", ref_id: null, position: 3, visible: true, settings: { chart: "lineas" } },
    ],
  }) as unknown as OpenDataRows;

let root: Root | null = null;
let host: HTMLDivElement;

async function open(status: "publicado" | "borrador", canEdit = true) {
  const data = rows(status);
  const catalog = assembleCatalog(data);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
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
  });
}

const all = <T extends Element = HTMLElement>(selector: string) => Array.from(host.querySelectorAll<T>(selector));
const button = (label: string, within: ParentNode = host) =>
  Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.replace(/\s+/g, " ").trim() === label);
const click = async (node: Element | undefined | null) => {
  expect(node, "el elemento que se iba a pulsar existe").toBeTruthy();
  await act(async () => {
    node!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
};
const type = async (input: HTMLInputElement | undefined | null, value: string) => {
  expect(input, "la casilla existe").toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const paste = async (input: HTMLInputElement | undefined | null, text: string) => {
  expect(input, "la casilla existe").toBeTruthy();
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  await act(async () => {
    input!.dispatchEvent(event);
  });
};
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const cell = (label: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
const blocks = () => all(".odt-block").map((b) => b.getAttribute("data-kind"));
const block = (index: number) => all(".odt-block")[index];
const status = () => host.querySelector(".odt-status")?.textContent?.replace(/\s+/g, " ").trim();
const toast = () => host.querySelector(".odt-toast");
const pick = (index: number) => click(block(index).querySelector(".odt-block__head"));

beforeEach(() => {
  vi.useFakeTimers();
  memory.clear();
  saveValues.mockClear();
  saveIndicator.mockClear();
  saveBlocks.mockClear();
  startTour.mockClear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host.remove();
  vi.useRealTimers();
});

describe("elegir un bloque", () => {
  it("solo el bloque elegido muestra sus controles, con palabras", async () => {
    await open("borrador");
    expect(all(".odt-tools")).toHaveLength(0);
    await pick(1);
    expect(all(".odt-tools")).toHaveLength(1);
    const tools = all(".odt-tools button").map((b) => b.textContent?.trim());
    expect(tools).toEqual(["Editar", "Subir", "Bajar", "Ocultar", "Ayúdeme con esto", "Quitar"]);
    expect(block(1).querySelector(".odt-block__head")?.getAttribute("aria-pressed")).toBe("true");
    // Un tipo sin editor aquí no ofrece «Editar»: lleva a la vista clásica.
    await pick(2);
    expect(button("Editar")).toBeUndefined();
    const link = host.querySelector<HTMLAnchorElement>(".odt-tools a");
    expect(link?.textContent).toContain("Editar en la vista clásica");
    expect(link?.getAttribute("href")).toBe("/admin/udes-en-cifras/diseno/poblacional");
  });

  it("la copia de la ficha es inerte: no recibe el foco", async () => {
    await open("borrador");
    expect(all(".odt-copy").length).toBeGreaterThan(0);
    expect(all(".odt-copy").every((n) => n.hasAttribute("inert") && n.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("sin permiso: se puede elegir y pedir ayuda, no editar ni ordenar", async () => {
    await open("borrador", false);
    await pick(1);
    expect(all(".odt-tools button").map((b) => b.textContent?.trim())).toEqual(["Ayúdeme con esto"]);
    await click(button("Ayúdeme con esto"));
    expect(host.querySelector(".odt-pilo__say")?.textContent).toContain("Tablero de indicadores. Las cifras clave del informe");
  });
});

describe("informe sin publicar: guardado automático", () => {
  it("lo escrito se guarda solo un segundo después, por la rejilla", async () => {
    await open("borrador");
    expect(status()).toBe("Lo que escriba se guarda solo.");
    await pick(1);
    await click(button("Editar"));
    expect(all("table.oda-grid")).toHaveLength(2);
    await type(cell("Cúcuta, 2025, periodo 2"), "2.345");
    expect(status()).toBe("Guardando…");
    expect(saveValues).not.toHaveBeenCalled();
    await wait(900);
    expect(saveValues).not.toHaveBeenCalled();
    await wait(200);
    expect(saveValues).toHaveBeenCalledTimes(1);
    expect(saveValues).toHaveBeenCalledWith({
      periodId: "p1",
      reportId: "r1",
      kind: "rejilla",
      values: [{ indicator_id: "mat", year: 2025, term: "B", campus_id: "cuc", value: 2345 }],
    });
    expect(status()).toBe("Guardado");
    expect(memory.has(draftKey("p1", "r1"))).toBe(false);
  });

  it("seguir escribiendo aplaza el guardado: una sola escritura con todo", async () => {
    await open("borrador");
    await pick(1);
    await click(button("Editar"));
    await type(cell("Cúcuta, 2025, periodo 2"), "23");
    await wait(700);
    await type(cell("Cúcuta, 2025, periodo 2"), "2345");
    await wait(700);
    await type(cell("Bucaramanga, 2024, periodo 1"), "6000");
    await wait(700);
    expect(saveValues).not.toHaveBeenCalled();
    await wait(400);
    expect(saveValues).toHaveBeenCalledTimes(1);
    expect((saveValues.mock.calls[0][0] as { values: unknown[] }).values).toHaveLength(2);
  });

  it("vaciar una casilla guarda «sin reportar» (null), no cero", async () => {
    await open("borrador");
    await pick(1);
    await click(button("Editar"));
    await type(cell("Cúcuta, 2025, periodo 1"), "");
    await wait(1100);
    expect((saveValues.mock.calls[0][0] as { values: unknown[] }).values).toEqual([{ indicator_id: "mat", year: 2025, term: "A", campus_id: "cuc", value: null }]);
  });

  it("pegar un rango de Excel llena varios años, deja rastro de «pegado» y se puede deshacer", async () => {
    await open("borrador");
    await pick(1);
    await click(button("Editar"));
    await paste(cell("Bucaramanga, 2024, periodo 1"), "100\t110\t120\t130\r\n40\t44\t48\t52\r\n");
    expect(toast()?.textContent).toContain("Se pegaron 8 casillas desde Excel");
    expect(cell("Cúcuta, 2025, periodo 2")?.value).toBe("52");
    await wait(1100);
    expect(saveValues).toHaveBeenCalledTimes(1);
    const sent = saveValues.mock.calls[0][0] as { kind: string; values: { year: number; term: string }[] };
    expect(sent.kind).toBe("pegado");
    expect(sent.values).toHaveLength(8);
    expect(sent.values.every((v) => v.term === "A" || v.term === "B")).toBe(true);
    expect(new Set(sent.values.map((v) => v.year))).toEqual(new Set([2024, 2025]));
  });

  it("«Deshacer» tras pegar devuelve las casillas a lo que tenían y no guarda nada", async () => {
    await open("borrador");
    await pick(1);
    await click(button("Editar"));
    await paste(cell("Bucaramanga, 2024, periodo 1"), "100\t110\t120\t130\n40\t44\t48\t52");
    await click(button("Deshacer", toast()!));
    expect(cell("Bucaramanga, 2025, periodo 1")?.value).toBe("6.200");
    expect(cell("Bucaramanga, 2024, periodo 1")?.value).toBe("");
    await wait(1500);
    expect(saveValues).not.toHaveBeenCalled();
  });

  it("cambiar a «Por año» con cifras por periodo avisa qué pasa con ellas antes de cambiar", async () => {
    await open("borrador");
    await pick(1);
    await click(button("Editar"));
    await click(button("Por año", block(1).querySelector(".odt-indicator")!));
    const ask = host.querySelector(".odt-ask");
    expect(ask?.getAttribute("role")).toBe("alertdialog");
    expect(ask?.textContent).toContain("tiene 3 cifras cargadas en los periodos 1 y 2");
    expect(ask?.textContent).toContain("No se borran");
    await wait(1500);
    expect(saveIndicator).not.toHaveBeenCalled();
    await click(button("Sí, reportar por año"));
    await wait(1100);
    // La misma mutación de Estructura, con la regla que Estructura pone al pasar a «por año».
    expect(saveIndicator).toHaveBeenCalledWith({ id: "mat", report_id: "r1", reporting: "anual", annual_rule: "reportado" });
  });

  it("cancelar ese aviso no cambia nada", async () => {
    await open("borrador");
    await pick(1);
    await click(button("Editar"));
    await click(button("Por año", block(1).querySelector(".odt-indicator")!));
    await click(button("Cancelar"));
    expect(host.querySelector(".odt-ask")).toBeNull();
    await wait(1500);
    expect(saveIndicator).not.toHaveBeenCalled();
  });

  it("la regla del año se cambia junto al dato, con la mutación de Estructura", async () => {
    await open("borrador");
    await pick(1);
    await click(button("Editar"));
    const select = block(1).querySelector<HTMLSelectElement>(".odt-indicator select")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "suma");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await wait(1100);
    expect(saveIndicator).toHaveBeenCalledWith({ id: "mat", report_id: "r1", annual_rule: "suma" });
  });

  it("modo completo: la definición del dato y la evolución por campus, al lado", async () => {
    await open("borrador");
    await pick(1);
    await click(button("Editar"));
    expect(host.querySelector(".odt-definition")).toBeNull();
    expect(host.querySelector(".odt-evolution")).toBeNull();
    // En sencillo, al editar queda la rejilla sola.
    expect(block(1).querySelector(".odt-block__view")).toBeNull();
    await click(button("Completo"));
    expect(all(".odt-definition")).toHaveLength(2);
    expect(host.querySelector(".odt-evolution")?.textContent).toContain("Evolución por campus · Estudiantes matriculados");
    expect(memory.get("odt:modo")).toBe("completo");
  });
});

describe("orden de la ficha", () => {
  it("«Subir» y «Bajar» cambian el orden y se guarda con la mutación de bloques", async () => {
    await open("borrador");
    await pick(1);
    await click(button("Subir"));
    expect(blocks()).toEqual(["kpis", "separador", "evolucion"]);
    // El elegido sigue elegido, ahora primero: no puede subir más.
    expect(button("Subir")?.disabled).toBe(true);
    await wait(1100);
    expect(saveBlocks).toHaveBeenCalledTimes(1);
    const sent = saveBlocks.mock.calls[0][0] as { reportId: string; remove: string[]; blocks: { id?: string; position: number }[] };
    expect(sent.remove).toEqual([]);
    expect(sent.blocks.map((b) => [b.id, b.position])).toEqual([["b2", 1], ["b1", 2], ["b3", 3]]);
  });

  it("«Ocultar» no quita el bloque: lo marca y se puede volver a mostrar", async () => {
    await open("borrador");
    await pick(2);
    await click(button("Ocultar"));
    expect(blocks()).toHaveLength(3);
    expect(block(2).textContent).toContain("Oculto: el público no lo ve");
    expect(button("Mostrar")).toBeTruthy();
    await wait(1100);
    const sent = saveBlocks.mock.calls[0][0] as { blocks: { id?: string; visible: boolean }[] };
    expect(sent.blocks.find((b) => b.id === "b3")?.visible).toBe(false);
  });

  it("«Quitar» no pregunta: quita, dice que las cifras siguen y ofrece «Deshacer»", async () => {
    await open("borrador");
    await pick(2);
    await click(button("Quitar"));
    expect(blocks()).toEqual(["separador", "kpis"]);
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(toast()?.textContent).toContain("Se quitó «Evolución por campus» de la ficha. Sus cifras siguen guardadas.");
    await click(button("Deshacer", toast()!));
    expect(blocks()).toEqual(["separador", "kpis", "evolucion"]);
    await wait(1500);
    // Deshecho antes de guardarse: no hubo nada que escribir.
    expect(saveBlocks).not.toHaveBeenCalled();
  });

  it("sin deshacer, la quita se guarda y el aviso se va solo", async () => {
    await open("borrador");
    await pick(2);
    await click(button("Quitar"));
    await wait(1100);
    expect((saveBlocks.mock.calls[0][0] as { remove: string[] }).remove).toEqual(["b3"]);
    expect(toast()).toBeTruthy();
    await wait(8000);
    expect(toast()).toBeNull();
  });

  it("«Añadir algo a la ficha» lista los veinte tipos y añade aquí separador y tablero", async () => {
    await open("borrador");
    await click(button("Añadir algo a la ficha"));
    expect(all(".odt-option")).toHaveLength(20);
    expect(all(".odt-option[data-live]").map((o) => o.querySelector("strong")?.textContent)).toEqual(["Otro tablero de indicadores", "Separador"]);
    const classic = all<HTMLAnchorElement>(".odt-option a");
    expect(classic).toHaveLength(18);
    expect(classic.every((a) => a.textContent?.includes("Disponible en la vista clásica"))).toBe(true);
    const divider = all(".odt-option").find((o) => o.querySelector("strong")?.textContent === "Separador")!;
    await click(button("Añadir", divider));
    expect(blocks()).toEqual(["separador", "kpis", "evolucion", "separador"]);
    // Entra elegido y en edición: se le escribe el título.
    const title = block(3).querySelector<HTMLInputElement>(".odt-editor input")!;
    await type(title, "Graduados");
    await wait(1100);
    const sent = saveBlocks.mock.calls[0][0] as { blocks: { id?: string; kind: string; position: number; settings: { title?: string; slot?: string } }[] };
    const added = sent.blocks[3];
    expect(added.id).toBeUndefined();
    expect(added).toMatchObject({ kind: "separador", position: 4, settings: { title: "Graduados" } });
    expect(added.settings.slot).toBeTruthy();
  });
});

describe("informe publicado: cambios pendientes en este equipo", () => {
  it("nada se escribe en la base hasta «Publicar cambios (n)»", async () => {
    await open("publicado");
    expect(host.textContent).toContain("solo en este equipo");
    await pick(1);
    await click(button("Editar"));
    await type(cell("Cúcuta, 2025, periodo 2"), "2345");
    await type(cell("Bucaramanga, 2024, periodo 1"), "6000");
    await wait(10_000);
    expect(saveValues).not.toHaveBeenCalled();
    expect(status()).toBe("2 cambios pendientes, solo en este equipo");
    expect(block(1).textContent).toContain("Con cambios pendientes");
    // Quedan en el navegador, por informe y periodo.
    expect(JSON.parse(memory.get(draftKey("p1", "r1"))!).values).toEqual({ "mat::cuc|2025-B": 2345, "mat::buc|2024-A": 6000 });

    await click(button("Publicar cambios (2)"));
    expect(saveValues).toHaveBeenCalledTimes(1);
    expect((saveValues.mock.calls[0][0] as { values: unknown[] }).values).toHaveLength(2);
    expect(status()).toBe("Cambios publicados");
    expect(button("Publicar cambios (2)")).toBeUndefined();
    expect(memory.has(draftKey("p1", "r1"))).toBe(false);
  });

  it("lo pendiente sobrevive a una recarga", async () => {
    await open("publicado");
    await pick(1);
    await click(button("Editar"));
    await type(cell("Cúcuta, 2025, periodo 2"), "2345");
    await act(async () => root?.unmount());
    host.remove();
    expect(saveValues).not.toHaveBeenCalled();
    await open("publicado");
    expect(button("Publicar cambios (1)")).toBeTruthy();
    await pick(1);
    await click(button("Editar"));
    // Al volver, la casilla trae lo pendiente (con su formato de miles).
    expect(cell("Cúcuta, 2025, periodo 2")?.value).toBe("2.345");
  });

  it("«Descartar cambios» confirma en su sitio y borra lo pendiente", async () => {
    await open("publicado");
    await pick(2);
    await click(button("Subir"));
    expect(blocks()).toEqual(["separador", "evolucion", "kpis"]);
    expect(button("Publicar cambios (1)")).toBeTruthy();
    await click(button("Descartar cambios"));
    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain("Lo que ya está publicado no cambia");
    await click(button("Sí, descartar"));
    expect(blocks()).toEqual(["separador", "kpis", "evolucion"]);
    expect(memory.has(draftKey("p1", "r1"))).toBe(false);
    await wait(5000);
    expect(saveBlocks).not.toHaveBeenCalled();
  });

  it("si publicar falla, lo dice, conserva lo pendiente y deja reintentar", async () => {
    saveValues.mockRejectedValueOnce(new Error("Sin conexión"));
    await open("publicado");
    await pick(1);
    await click(button("Editar"));
    await type(cell("Cúcuta, 2025, periodo 2"), "2345");
    await click(button("Publicar cambios (1)"));
    expect(host.querySelector('.odt-save[role="alert"]')?.textContent).toContain("No se pudo publicar: Sin conexión");
    expect(memory.has(draftKey("p1", "r1"))).toBe(true);
    await click(button("Reintentar"));
    expect(saveValues).toHaveBeenCalledTimes(2);
    expect(status()).toBe("Cambios publicados");
  });
});

describe("Pilo en espera", () => {
  it("no ocupa pantalla hasta que lo llaman, y «Cerrar» lo devuelve a su botón", async () => {
    await open("borrador");
    expect(host.querySelector(".odt-pilo")).toBeNull();
    await click(button("Llamar a Pilo"));
    expect(host.querySelector(".odt-pilo__say")?.textContent).toContain("Aquí estoy.");
    expect(button("Llamar a Pilo")).toBeUndefined();
    await click(button("Cerrar", host.querySelector(".odt-pilo")!));
    await wait(10);
    expect(host.querySelector(".odt-pilo")).toBeNull();
    expect(button("Llamar a Pilo")).toBeTruthy();
  });

  it("ofrece el recorrido de la pantalla", async () => {
    await open("borrador");
    await click(button("Llamar a Pilo"));
    await click(button("Mostrarme el recorrido"));
    expect(startTour).toHaveBeenCalledWith("intranet-taller-cifras");
  });

  it("«¿Cómo funciona?» explica cada tipo: etiqueta, qué muestra y cómo se llena", async () => {
    await open("borrador");
    await click(button("Añadir algo a la ficha"));
    const heat = all(".odt-option").find((o) => o.querySelector("strong")?.textContent === "Mapa de calor")!;
    await click(button("¿Cómo funciona?", heat));
    const said = host.querySelector(".odt-pilo__say")?.textContent ?? "";
    expect(said).toContain("Mapa de calor. Matriz de dos dimensiones en escala azul.");
    expect(said).toContain("Se pega la tabla completa desde Excel");
  });
});
