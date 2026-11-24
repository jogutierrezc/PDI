// @vitest-environment jsdom
/* El estudio de visores de Mis Tableros en un DOM de pruebas: que se abra con
   sus tres paneles (campos, estantes y lienzo, galería), que las tablas y los
   visores ya guardados aparezcan, y que al elegir otro tipo de gráfica el
   lienzo lo refleje. */

import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DesignStudio } from "./DesignStudio";
import type { Board, BoardDataset, BoardView, Unit } from "./model";

vi.mock("../../lib/supabase", () => {
  const chain: unknown = new Proxy(() => undefined, {
    get: (_t, key) => (key === "then" ? (ok: (v: unknown) => void) => ok({ data: [], count: 0, error: null }) : () => chain),
  });
  return { supabase: chain };
});

const unit: Unit = { id: "u1", parentId: null, kind: "facultad", code: "FCJ", name: "Facultad de Ciencias Jurídicas", slug: "ciencias-juridicas", description: "", position: 0 };

const board: Board = {
  id: "b1",
  unitId: "u1",
  slug: "matricula",
  title: "Matrícula y permanencia",
  description: "",
  visibility: "unidad",
  pages: [
    { slug: "panorama", title: "Panorama", template: "tablero", intro: "" },
    { slug: "tendencia", title: "Tendencia", template: "narrativo", intro: "Cómo ha cambiado la matrícula." },
  ],
  position: 0,
  updatedAt: new Date(0).toISOString(),
};

const dataset: BoardDataset = {
  id: "d1",
  boardId: "b1",
  title: "Matriculados por año",
  description: "",
  source: "Registro Académico",
  dataType: "serie",
  temporality: "anual",
  periodLabel: "",
  columns: [
    { key: "anio", label: "Año", kind: "texto" },
    { key: "matriculados", label: "Matriculados", kind: "cifra", format: "entero", unit: "estudiantes" },
  ],
  rows: [
    { year: 2020, kind: "dato", label: "", cells: { anio: "2020", matriculados: 812 } },
    { year: 2021, kind: "dato", label: "", cells: { anio: "2021", matriculados: 845 } },
    { year: 2022, kind: "dato", label: "", cells: { anio: "2022", matriculados: 903 } },
  ],
  anonymization: null,
  position: 0,
  updatedAt: new Date(0).toISOString(),
};

const view: BoardView = {
  id: "v1",
  boardId: "b1",
  datasetId: "d1",
  page: "panorama",
  section: "tendencia",
  spec: { title: "Matrícula de la facultad", type: "lineas", category: "anio", series: ["matriculados"] },
  size: "media",
  visible: true,
  position: 1,
};

let root: Root | null = null;

const mount = async (datasets: BoardDataset[] = [dataset], views: BoardView[] = [view]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client },
        h(MemoryRouter, null, h(DesignStudio, { board, unit, datasets, views, canEdit: true })),
      ),
    );
  });
  return el;
};

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
  // Las gráficas miden su contenedor para acomodarse; en jsdom no hay quien mida.
  (globalThis as Record<string, unknown>).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  document.body.replaceChildren();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("Mis Tableros · estudio de visores", () => {
  it("sin tablas de datos abre el estado vacío, sin romperse", async () => {
    const el = await mount([], []);
    expect(el.textContent).toContain("Primero hacen falta datos");
    expect(el.querySelector(".obs-studio")).toBeNull();
  });

  it("abre los tres paneles: campos, lienzo con estantes y galería", async () => {
    const el = await mount();
    const text = el.textContent ?? "";
    expect(text).toContain("Matriculados por año");
    expect(text).toContain("Recomendados para esta tabla");
    expect(el.querySelector(".obs-studio__gallery .obs-gallery__tile")).toBeTruthy();
    // El campo de cifras y la categoría están a la izquierda, como píldoras.
    expect(el.querySelector('.obs-field-pill[data-kind="cifra"]')?.textContent).toContain("Matriculados");
    expect(el.querySelector('.obs-field-pill[data-kind="dimension"]')?.textContent).toContain("Año");
  });

  it("el visor guardado sale en la tira con su página, sección y gráfica", async () => {
    const el = await mount();
    const strip = el.querySelector(".obs-views-strip");
    expect(strip?.textContent).toContain("Matrícula de la facultad");
    expect(strip?.textContent).toContain("Tendencia");
  });

  it("al elegir otro tipo de la galería, el lienzo cambia de gráfica", async () => {
    const el = await mount();
    const tile = [...el.querySelectorAll(".obs-gallery__tile")].find((b) => b.textContent?.includes("Dona"));
    expect(tile).toBeTruthy();
    await act(async () => {
      tile!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const pressed = el.querySelector('.obs-gallery__tile[aria-pressed="true"]');
    expect(pressed?.textContent).toContain("Dona");
  });
});
