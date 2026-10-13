// @vitest-environment jsdom
import { createElement as h } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvidenciaPublica } from "../rankings/informes/datos";
import type { InformePublico } from "../rankings/informes/tipos";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
});

vi.mock("../planeacion/PlanLayout", () => ({ PlanLayout: ({ children }: { children: ReactNode }) => h("div", { "data-layout": "plan" }, children) }));

const datos = vi.hoisted(() => ({ ev: null as EvidenciaPublica | null, informe: null as InformePublico | null, notas: [] as unknown[] }));
vi.mock("../rankings/informes/datos", async (orig) => ({
  ...(await orig<typeof import("../rankings/informes/datos")>()),
  useEvidenciaPublica: () => ({ data: datos.ev, isPending: false, error: null }),
  usePublicInforme: (ods: number) => ({ data: datos.informe && datos.informe.informe.ods === ods ? datos.informe : null, isPending: false, error: null }),
}));
vi.mock("../rankings/noticias", async (orig) => ({
  ...(await orig<typeof import("../rankings/noticias")>()),
  useApprovedNews: () => ({ data: datos.notas }),
}));

import { OdsEvidence } from "./OdsEvidence";
import { OdsPiloCuerpo } from "./OdsPilo";
import { OdsReport } from "./OdsReport";
import { odsByNumber } from "./ods-data";
import { aPublico } from "../rankings/informes/InformeVista";
import { INFORME_EJEMPLO, NOTAS_EJEMPLO } from "../rankings/informes/ejemplo-ods4";

const conRouter = (path: string, route: string, el: ReturnType<typeof h>) =>
  renderToString(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: route, element: el }))))).replace(/<!-- -->/g, "");

const EV: EvidenciaPublica = {
  indicator: "4.3.4",
  ods: 4,
  title: "«El Recolector» llevó la cultura del reciclaje a la Institución Educativa La Libertad",
  date: "2025-03-28",
  section: "Comunicaciones",
  campus: "Bucaramanga",
  image_url: "https://udes.edu.co/images/noticias/2025/recolector.jpg",
  url: "https://udes.edu.co/comunicaciones/noticias/el-recolector-la-libertad",
  page_es: ["En los meses de febrero y marzo de 2025, la Institución Educativa La Libertad fue sede.", "Más de 400 estudiantes participaron."],
  page_en: "From February to March 2025, more than 400 secondary students took part.",
};

describe("Página de evidencia para THE", () => {
  it("es limpia: sin marco del portal, sin menú y sin un solo enlace", () => {
    datos.ev = EV;
    const html = conRouter("/sostenible/impact/evidencia/4/4.3.4", "/sostenible/impact/evidencia/:n/:indicador", h(OdsEvidence));
    expect(html).not.toMatch(/<a /);
    expect(html).not.toContain('data-layout="plan"');
    expect(html).not.toContain("sos-sub");
    expect(html).not.toMatch(/<nav/);
    expect(html).toContain("Evidence · Indicator 4.3.4");
    expect(html).toContain("Universidad de Santander · 2025");
    expect(html).toContain("28 mar 2025 · Comunicaciones · Bucaramanga");
    expect(html).toContain('lang="es"');
    expect(html).toContain('lang="en"');
    expect(html).toContain("more than 400 secondary students");
    expect(html).toContain("udes.edu.co/comunicaciones/noticias/el-recolector-la-libertad");
    expect(html).toMatch(/<img[^>]+alt="Fotografía de la actividad/);
  });

  it("sin fotografía de la API no pinta imagen; sin evidencia lo dice sin enlaces", () => {
    datos.ev = { ...EV, image_url: null };
    expect(conRouter("/sostenible/impact/evidencia/4/4.3.4", "/sostenible/impact/evidencia/:n/:indicador", h(OdsEvidence))).not.toContain("<img");
    datos.ev = null;
    const vacio = conRouter("/sostenible/impact/evidencia/4/9.9", "/sostenible/impact/evidencia/:n/:indicador", h(OdsEvidence));
    expect(vacio).toContain("no existe o todavía no está aprobada");
    expect(vacio).not.toMatch(/<a /);
  });
});

describe("OdsPilo · el cuerpo del informe publicado", () => {
  const o = odsByNumber(4)!;
  const pub = aPublico(INFORME_EJEMPLO);
  const notas = NOTAS_EJEMPLO.map((n) => ({ id: n.id, image_url: n.image_url, title: n.title }));

  it("tesis, cifras tipográficas, relato justificado con referencias al carrusel y proyectos", () => {
    const html = renderToString(h(OdsPiloCuerpo, { o, informe: pub, notas, animar: false })).replace(/<!-- -->/g, "");
    expect(html).toContain("La UDES forma maestros");
    expect(html).toContain("16.030");
    expect(html).toContain("20,09");
    expect(html).toContain('aria-label="Lo que hicimos en 2025"');
    expect(html).toContain('class="opi-p opi-just opi-rise"');
    expect(html).toContain('href="#osn-recolector"');
    expect(html).toContain('href="#osn-mutis"');
    expect(html).toContain("El Recolector</b>");
    expect(html).toContain("Hacia la próxima edición");
    /* Las dos cifras de las noticias van al margen del relato. */
    expect(html).toContain('class="opi-mfig opi-rise"');
  });

  it("las fotos llevan su recorte: portada ancha, en el texto 4:3; la de menores sin autorización no aparece", () => {
    const html = renderToString(h(OdsPiloCuerpo, { o, informe: pub, notas, animar: false }));
    expect(html).toMatch(/recolector\.jpg"[^>]*style="aspect-ratio:3 \/ 1;object-fit:cover;object-position:30% 25%"/);
    expect(html).toMatch(/mutis\.jpg"[^>]*style="aspect-ratio:4 \/ 3;object-fit:cover;object-position:62% 40%"/);
    expect(html).not.toContain("diplomado.jpg");
    expect(html).toContain('alt="Lo que se ve en la foto de recolector."');
  });

  it("solo el relato para el ODS 13", () => {
    const html = renderToString(h(OdsPiloCuerpo, { o, informe: pub, notas, animar: false, soloRelato: true }));
    expect(html).toContain("Lo que hicimos en 2025");
    expect(html).not.toContain("La UDES forma maestros");
    expect(html).not.toContain("Hacia la próxima edición");
  });

  it("OdsReport cambia la plantilla genérica por el informe publicado, y sin él queda como hoy", () => {
    datos.notas = [];
    datos.informe = pub;
    const con = conRouter("/sostenible/impact/informes/ods/4?edicion=2025", "/sostenible/impact/informes/ods/:n", h(OdsReport));
    expect(con).toContain("Lo que hicimos en 2025");
    expect(con).not.toContain("El detalle por indicador se carga desde el editor de informes.");
    datos.informe = null;
    const sin = conRouter("/sostenible/impact/informes/ods/4?edicion=2025", "/sostenible/impact/informes/ods/:n", h(OdsReport));
    expect(sin).toContain("El detalle por indicador se carga desde el editor de informes.");
    expect(sin).not.toContain("Lo que hicimos en");
  });
});
