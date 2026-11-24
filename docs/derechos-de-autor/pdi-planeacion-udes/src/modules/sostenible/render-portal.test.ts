// @vitest-environment jsdom
import { createElement as h } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ODS_LIST, ODS_ROUTES, RECTOR } from "./ods-data";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
});

vi.mock("../planeacion/PlanLayout", () => ({ PlanLayout: ({ children }: { children: ReactNode }) => h("div", null, children) }));
vi.mock("../../components/ui/Modal", () => ({ Modal: ({ children }: { children: ReactNode }) => h("div", null, children) }));
/* Sin sesión: el boletín muestra la puerta de acceso. */
vi.mock("../../lib/auth", async (orig) => ({
  ...(await orig<typeof import("../../lib/auth")>()),
  useAuth: () => ({ loading: false, profile: null, session: null, user: null }),
}));

import { OdsPortal } from "./OdsPortal";
import { OdsRector } from "./OdsRector";
import { OdsBulletin } from "./OdsBulletin";
import { odsBulletinPages } from "./OdsBulletinSheet";
import { resetBulletinSelectionForTests } from "./ods-selection";

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
          h(Route, { path: ODS_ROUTES.portal, element: h(OdsPortal) }),
          h(Route, { path: ODS_ROUTES.rector, element: h(OdsRector) }),
          h(Route, { path: ODS_ROUTES.bulletin, element: h(OdsBulletin) }),
        ),
      ),
    ),
  );

describe("UDES Sostenible · portal de informes ODS", () => {
  it("el portal dibuja las 17 tarjetas con su dibujo y su enlace al informe, sin datos internos", () => {
    resetBulletinSelectionForTests();
    const html = page(ODS_ROUTES.portal);
    expect(html.match(/class="opt-card[ "]/g)?.length).toBe(17);
    expect(html).toContain(ODS_ROUTES.report(13, 2026).replace(/&/g, "&amp;"));
    expect(html).toContain('src="/ods/ods-7.png"');
    expect(html).toContain("Dato ilustrativo");
    expect(html).toContain("Para THE");
    for (const hidden of ["Incluir en el boletín", "Por completar", "Listos", "evidencias 2026 verificadas", "Lista para revisión", "En recopilación", "Por iniciar", "opt-meter"]) {
      expect(html).not.toContain(hidden);
    }
    expect(page(`${ODS_ROUTES.portal}?edicion=2025`)).toContain("Informe 2025 publicado");
  });

  it("la presentación rectoral muestra la carta y el aviso de texto de ejemplo", () => {
    const html = page(ODS_ROUTES.rector);
    expect(html).toContain(RECTOR.quote);
    expect(html).toContain("Texto de ejemplo");
  });

  it("sin sesión, el boletín muestra la puerta de acceso", () => {
    const html = page(ODS_ROUTES.bulletin);
    expect(html).toContain("El generador del boletín es para el equipo de Planeación");
  });

  it("el boletín arma portada, presentación, índice, una hoja por ODS y contraportada", () => {
    const the = ODS_LIST.filter((o) => o.the).map((o) => o.n);
    const pages = odsBulletinPages(the, { cover: true, pres: true, toc: true, back: true });
    expect(pages).toHaveLength(the.length + 4);
    expect(pages.map((p) => p.i)).toEqual(pages.map((_, k) => k + 1));
    expect(odsBulletinPages([], { cover: false, pres: false, toc: false, back: false })).toHaveLength(0);
  });
});
