// @vitest-environment jsdom
import { createElement as h } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvidenciaPublica } from "../rankings/informes/datos";
import type { InformePublico } from "../rankings/informes/tipos";
import type { NotaPublica } from "./ods-noticias";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
});

vi.mock("../planeacion/PlanLayout", () => ({ PlanLayout: ({ children }: { children: ReactNode }) => h("div", { "data-layout": "plan" }, children) }));

const datos = vi.hoisted(() => ({ ev: null as EvidenciaPublica | null, informe: null as InformePublico | null, notas: [] as NotaPublica[] }));
vi.mock("../rankings/informes/datos", async (orig) => ({
  ...(await orig<typeof import("../rankings/informes/datos")>()),
  useEvidenciaPublica: () => ({ data: datos.ev, isPending: false, error: null }),
  usePublicInforme: (ods: number) => ({ data: datos.informe && datos.informe.informe.ods === ods ? datos.informe : null, isPending: false, error: null }),
}));
vi.mock("./ods-noticias", () => ({ useNoticiasPublicas: () => ({ data: datos.notas }) }));

import { OdsEvidence } from "./OdsEvidence";
import { OdsPiloCuerpo, cifrasDelInforme } from "./OdsPilo";
import { OdsReport } from "./OdsReport";
import { odsByNumber } from "./ods-data";
import { aPublico } from "../rankings/informes/InformeVista";
import { INFORME_EJEMPLO, NOTAS_EJEMPLO, REGISTRO_EJEMPLO } from "../rankings/informes/ejemplo-ods4";

const conRouter = (path: string, route: string, el: ReturnType<typeof h>) =>
  renderToString(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: route, element: el }))))).replace(/<!-- -->/g, "");

const EV: EvidenciaPublica = {
  indicator: "4.3.4",
  ods: 4,
  title: "«El Recolector» llevó la cultura del reciclaje a la Institución Educativa La Libertad",
  title_en: "“El Recolector” brought a recycling culture to the La Libertad school",
  date: "2025-03-28",
  section: "Comunicaciones",
  campus: "Bucaramanga",
  image_url: "https://udes.edu.co/images/noticias/2025/recolector.jpg",
  url: "https://udes.edu.co/comunicaciones/noticias/el-recolector-la-libertad",
  page_es: ["En los meses de febrero y marzo de 2025, la Institución Educativa La Libertad fue sede.", "Más de 400 estudiantes participaron."],
  page_en: "From February to March 2025, more than 400 secondary students took part. The workshops were run with Veolia.",
  ficha: {
    indicator: "4.3.4",
    question: "Does your university run educational outreach activities beyond campus?",
    answer: "In 2025 Universidad de Santander ran recycling workshops for more than 400 students at a public school in Bucaramanga.",
    answer_es: "En 2025 la Universidad de Santander dictó talleres de reciclaje a más de 400 estudiantes de un colegio público de Bucaramanga.",
    who: "Surgical Instrumentation programme",
    what: "Recycling workshops",
    when: "2025-02-01/2025-03-31",
    where: "Bucaramanga, Colombia",
    how_many: "400 secondary school students",
    beneficiaries: "",
    partners: "Veolia",
    evidence_type: "News story",
    period: "Academic year 2025",
  },
};
const RUTA_EV = "/sostenible/impact/evidencia/:n/:indicador";

describe("Página de evidencia para THE", () => {
  it("abre en inglés, en el orden de THE, limpia: sin marco, sin menú y sin un solo enlace", () => {
    datos.ev = EV;
    const html = conRouter("/sostenible/impact/evidencia/4/4.3.4", RUTA_EV, h(OdsEvidence));
    expect(html).not.toMatch(/<a /);
    expect(html).not.toContain('data-layout="plan"');
    expect(html).not.toMatch(/<nav/);
    expect(html).toContain('<main class="oev" lang="en">');
    expect(html).toContain("Evidence · Indicator 4.3.4");
    expect(html).toContain("Indicator 4.3.4 — Does your university run educational outreach");
    /* Orden: título, respuesta, ficha, frases, nota de origen. */
    const i = (s: string) => html.indexOf(s);
    expect(i("In 2025 Universidad de Santander ran")).toBeGreaterThan(i("Indicator 4.3.4 —"));
    expect(i("Key facts")).toBeGreaterThan(i("In 2025 Universidad de Santander ran"));
    expect(i("more than 400 secondary students took part")).toBeGreaterThan(i("Key facts"));
    expect(i("Source story")).toBeGreaterThan(i("more than 400 secondary students took part"));
    expect(html).toContain("<dt>How many</dt>");
    expect(html).not.toContain("<dt>Beneficiaries</dt>");
    expect(html).toContain("28 Mar 2025 · Comunicaciones · Bucaramanga");
    expect(html).toContain("Original source: udes.edu.co/comunicaciones/noticias/el-recolector-la-libertad");
    expect(html).toMatch(/<img[^>]+alt="Photograph of the activity/);
    expect(html).toMatch(/<button[^>]*lang="es"[^>]*aria-pressed="false"/);
  });

  it("el español a un clic (?lang=es), con la respuesta y las frases literales en español", () => {
    datos.ev = EV;
    const html = conRouter("/sostenible/impact/evidencia/4/4.3.4?lang=es", RUTA_EV, h(OdsEvidence));
    expect(html).toContain('<main class="oev" lang="es">');
    expect(html).toContain("Evidencia · Indicador 4.3.4");
    expect(html).toContain("En 2025 la Universidad de Santander dictó talleres");
    expect(html).toContain("<dt>Cuántos</dt>");
    expect(html).toContain("Más de 400 estudiantes participaron.");
    expect(html).toContain("28 mar 2025");
    expect(html).not.toMatch(/<a /);
  });

  it("sin fotografía de la API no pinta imagen; sin evidencia lo dice sin enlaces", () => {
    datos.ev = { ...EV, image_url: null };
    expect(conRouter("/sostenible/impact/evidencia/4/4.3.4", RUTA_EV, h(OdsEvidence))).not.toContain("<img");
    datos.ev = null;
    const vacio = conRouter("/sostenible/impact/evidencia/4/9.9", RUTA_EV, h(OdsEvidence));
    expect(vacio).toContain("does not exist or has not been approved yet");
    expect(vacio).not.toMatch(/<a /);
    expect(conRouter("/sostenible/impact/evidencia/4/9.9?lang=es", RUTA_EV, h(OdsEvidence))).toContain("no existe o todavía no está aprobada");
  });
});

describe("OdsPilo · el cuerpo del informe publicado", () => {
  const o = odsByNumber(4)!;
  const pub = { ...aPublico(INFORME_EJEMPLO), registro: REGISTRO_EJEMPLO };
  const notas = NOTAS_EJEMPLO.map((n) => ({ id: n.id, image_url: n.image_url, title: n.title }));
  const cuerpo = (props: Partial<Parameters<typeof OdsPiloCuerpo>[0]> = {}) => renderToString(h(OdsPiloCuerpo, { o, informe: pub, notas, animar: false, ...props })).replace(/<!-- -->/g, "");

  it("tesis, cifras, subtítulos temáticos, relato justificado con referencias al carrusel y proyectos", () => {
    const html = cuerpo();
    expect(html).toContain("La UDES forma maestros");
    expect(html).toContain("16.030");
    expect(html).toContain('aria-label="Lo que hicimos en 2025"');
    expect(html).toContain('class="opi-p opi-just opi-rise"');
    expect(html).toContain('href="#osn-recolector"');
    expect(html).toContain("El Recolector</b>");
    expect(html).toContain("Hacia la próxima edición");
    /* Un subtítulo abre cada grupo, una sola vez. */
    expect(html.match(/class="opi-sub/g)?.length).toBe(2);
    expect(html).toContain("Educación en los colegios");
    expect(html).not.toContain('class="lng-es"');
  });

  it("en inglés: text_en y heading_en cuando existen; si no, el español con la marca «ES», nunca vacío", () => {
    const html = cuerpo({ lang: "en" });
    expect(html).toContain('aria-label="What we did in 2025"');
    expect(html).toContain('<span lang="en">Between February and March, the La Libertad school');
    expect(html).toContain('<span lang="en">Education in schools</span>');
    /* El párrafo sin inglés va en español, marcado. */
    expect(html).toMatch(/<span lang="es">Los residentes de Medicina Familiar[^<]*<abbr class="lng-es"/);
    expect(html).toMatch(/<span lang="es">Formación continua <abbr class="lng-es"/);
    expect(html).toContain("Projects that make it possible");
    expect(html).toContain("Towards the next edition");
    expect(html).not.toMatch(/<p class="opi-p[^"]*"><\/p>/);
  });

  it("las cifras de ods-data mandan en los ODS reales (4 y 13); en los demás, las del bloque «cifras»", () => {
    const real = cifrasDelInforme(o, pub, "en");
    expect(real.grandes.map((g) => g.v)).toEqual(["16.030", "20,09 %"]);
    expect(real.grandes[0].label).toBe("people benefiting from Social Outreach");
    expect(real.margen.map((g) => g.v)).toEqual(["400", "271"]);
    const otro = cifrasDelInforme(odsByNumber(7)!, { ...pub, informe: { ...pub.informe, ods: 7 } }, "es");
    expect(otro.grandes.map((g) => g.v)).toEqual(["16.030", "20,09 %"]);
    expect(otro.grandes[0].label).toBe("personas beneficiadas por Proyección Social");
  });

  it("las fotos llevan su recorte; la de menores sin autorización no aparece", () => {
    const html = renderToString(h(OdsPiloCuerpo, { o, informe: pub, notas, animar: false }));
    expect(html).toMatch(/recolector\.jpg"[^>]*style="aspect-ratio:3 \/ 1;object-fit:cover;object-position:30% 25%"/);
    expect(html).toMatch(/mutis\.jpg"[^>]*style="aspect-ratio:4 \/ 3;object-fit:cover;object-position:62% 40%"/);
    expect(html).not.toContain("diplomado.jpg");
  });

  it("registro de actividades: todas las notas, cronológico, título según idioma y fila que lleva al carrusel", () => {
    const es = cuerpo();
    expect(es).toContain("Registro de actividades");
    expect(es).toContain('href="#osn-otra"');
    expect(es).toContain("Nota que solo está en el registro");
    expect(es).toContain("En el relato");
    expect(es.indexOf("osn-recolector\" title")).toBeLessThan(es.indexOf("osn-otra\" title"));
    const en = cuerpo({ lang: "en" });
    expect(en).toContain("Activity log");
    expect(en).toContain("“El Recolector” brought a recycling culture");
    expect(en).toMatch(/Nota que solo está en el registro <abbr class="lng-es"/);
    expect(en).toContain("28 Mar 2025");
  });

  it("solo el relato (y el registro) para el ODS 13", () => {
    const html = cuerpo({ soloRelato: true });
    expect(html).toContain("Lo que hicimos en 2025");
    expect(html).not.toContain("La UDES forma maestros");
    expect(html).not.toContain("Hacia la próxima edición");
  });

  it("OdsReport: con informe publicado usa OdsPilo; sin él queda como hoy; el idioma es el del portal", () => {
    datos.notas = [];
    datos.informe = pub;
    const con = conRouter("/sostenible/impact/informes/ods/4?edicion=2025", "/sostenible/impact/informes/ods/:n", h(OdsReport));
    expect(con).toContain("Lo que hicimos en 2025");
    expect(con).not.toContain("El detalle por indicador se carga desde el editor de informes.");
    const en = conRouter("/sostenible/impact/informes/ods/4?edicion=2025&lang=en", "/sostenible/impact/informes/ods/:n", h(OdsReport));
    expect(en).toContain("SDG 4: Quality education");
    expect(en).toContain("What we did in 2025");
    expect(en).toContain("Back to the 17 reports");
    expect(en).toMatch(/<div class="ors" lang="en"/);
    datos.informe = null;
    const sin = conRouter("/sostenible/impact/informes/ods/4?edicion=2025", "/sostenible/impact/informes/ods/:n", h(OdsReport));
    expect(sin).toContain("El detalle por indicador se carga desde el editor de informes.");
    expect(sin).not.toContain("Lo que hicimos en");
    const sinEn = conRouter("/sostenible/impact/informes/ods/7?edicion=2026&lang=en", "/sostenible/impact/informes/ods/:n", h(OdsReport));
    expect(sinEn).toContain("What UDES can already show.");
    expect(sinEn).toContain("UDES plans to raise low-emission energy to 16%.");
  });

  it("el ODS 13 respeta el selector global (su detalle ya era bilingüe)", () => {
    datos.informe = null;
    const en = conRouter("/sostenible/impact/informes/ods/13?edicion=2026&lang=en", "/sostenible/impact/informes/ods/:n", h(OdsReport));
    expect(en).toContain("SDG 13: Climate Action");
    expect(en).toContain("What changes between 2025 and 2026.");
    const es = conRouter("/sostenible/impact/informes/ods/13?edicion=2026&lang=es", "/sostenible/impact/informes/ods/:n", h(OdsReport));
    expect(es).toContain("ODS 13: Acción por el clima");
  });
});
