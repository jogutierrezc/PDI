// @vitest-environment jsdom
import { createElement as h } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
});

vi.mock("../planeacion/PlanLayout", () => ({ PlanLayout: ({ children }: { children: ReactNode }) => h("div", null, children) }));
vi.mock("../../components/ui/Modal", () => ({ Modal: ({ children }: { children: ReactNode }) => h("div", null, children) }));

import { OdsReport } from "./OdsReport";
import { OdsBulletinSheet, odsBulletinPages } from "./OdsBulletinSheet";
import { BULLETIN_TEMPLATES, ODS_LIST } from "./ods-data";

/* El botón del boletín publicado consulta datos: el informe se monta con su cliente de consultas. */
const page = (path: string) =>
  renderToString(
    h(
      QueryClientProvider,
      { client: new QueryClient() },
      h(
        MemoryRouter,
        { initialEntries: [path] },
        h(
          Routes,
          null,
          h(Route, { path: "/sostenible/impact/informes", element: h("p", null, "PORTAL") }),
          h(Route, { path: "/sostenible/impact/informes/ods/:n", element: h(OdsReport) }),
        ),
      ),
    ),
  );

describe("UDES Sostenible · informe de un ODS", () => {
  it("el ODS 13 (2026) muestra el informe público con su dibujo, sin evidencias", () => {
    const html = page("/sostenible/impact/informes/ods/13?edicion=2026");
    expect(html).toContain("ODS 13: Acción por el clima");
    expect(html).toContain("Lo que cambia entre 2025 y 2026.");
    expect(html).toContain("Ilustración del ODS 13");
    expect(html).toContain('src="/ods/ods-13.png"');
    expect(html).toContain("Dato ilustrativo");
    for (const hidden of ["Cuatro indicadores, un avance de evidencias.", 'role="tablist"', "Total verificado", "Evidencias de muestra", "Borrador para revisión", "ors-prog"]) {
      expect(html).not.toContain(hidden);
    }
  });

  it("el ODS 13 (2025) es el informe publicado, sin comparación", () => {
    const html = page("/sostenible/impact/informes/ods/13?edicion=2025");
    expect(html).toContain("Informe publicado de la edición 2025");
    expect(html).not.toContain("Lo que cambia entre 2025 y 2026.");
  });

  it("otro ODS usa la plantilla genérica", () => {
    const html = page("/sostenible/impact/informes/ods/4");
    expect(html).toContain("Educación de calidad");
    expect(html).toContain("El detalle por indicador se carga desde el editor de informes.");
    expect(html).toContain('href="/sostenible/impact/informes/ods/7?edicion=2026"');
    expect(html).not.toContain("evidencias verificadas");
    expect(html).not.toContain("Por iniciar");
  });

  it("la hoja de un ODS en el boletín lleva su dibujo y no muestra evidencias", () => {
    const o = ODS_LIST[3];
    const pages = odsBulletinPages([o.n], { cover: true, pres: false, toc: false, back: false });
    const opts = { template: BULLETIN_TEMPLATES[0], voice: "narr" as const, accent: "#014898", font: "Open Sans" as const, rectorText: "", included: [o.n] };
    const html = renderToString(h("div", null, pages.map((p) => h(OdsBulletinSheet, { key: p.i, page: p, pages, opts }))));
    expect(html).toContain("Ilustración del ODS 4");
    expect(html).not.toContain("Evidencias");
    expect(html).not.toContain('loading="lazy"');
  });

  it("un ODS que no existe no dibuja informe (Navigate al portal actúa en el navegador)", () => {
    expect(page("/sostenible/impact/informes/ods/99")).not.toContain("odsx");
  });
});
