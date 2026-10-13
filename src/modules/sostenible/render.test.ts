// @vitest-environment jsdom
import { createElement as h } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RANKINGS } from "./data";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
});

vi.mock("../planeacion/PlanLayout", () => ({ PlanLayout: ({ children }: { children: ReactNode }) => h("div", null, children) }));
vi.mock("../../components/ui/Modal", () => ({ Modal: ({ children }: { children: ReactNode }) => h("div", null, children) }));

import { SostenibleHome } from "./SostenibleHome";
import { SostenibleCategory, SostenibleRanking } from "./SostenibleRanking";

const page = (path: string) =>
  renderToString(
    h(
      MemoryRouter,
      { initialEntries: [path] },
      h(
        Routes,
        null,
        h(Route, { path: "/sostenible", element: h(SostenibleHome) }),
        h(Route, { path: "/sostenible/:ranking", element: h(SostenibleRanking) }),
        h(Route, { path: "/sostenible/:ranking/:categoria", element: h(SostenibleCategory) }),
      ),
    ),
  );

describe("UDES Sostenible · páginas", () => {
  it("la portada muestra los rankings, los indicadores y los informes", () => {
    const html = page("/sostenible");
    for (const r of RANKINGS) expect(html).toContain(r.name);
    expect(html).toContain("Indicadores de sostenibilidad");
    expect(html).toContain("Descarga o consulta cada informe");
  });

  it("cada micrositio y cada microportal se dibuja", () => {
    for (const r of RANKINGS) {
      expect(page(`/sostenible/${r.id}`)).toContain("Cada subcategoría tiene su microportal");
      for (const c of r.categories) expect(page(`/sostenible/${r.id}/${c.id}`)).toContain(c.name.replace(/&/g, "&amp;"));
    }
  });

  it("un ranking que no existe redirige a la portada", () => {
    expect(page("/sostenible/nada")).not.toContain("microportal");
  });
});
