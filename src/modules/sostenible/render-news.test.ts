// @vitest-environment jsdom
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { NotaPublica } from "./ods-noticias";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
});

const datos = vi.hoisted(() => ({ data: [] as NotaPublica[] }));
vi.mock("./ods-noticias", () => ({ useNoticiasPublicas: () => ({ data: datos.data }) }));

import { LOTE_CARRUSEL, OdsNews, ordenarCarrusel } from "./OdsNews";

const nota = (id: string, over: Partial<NotaPublica> = {}): NotaPublica => ({
  id,
  url: `https://udes.edu.co/investigacion/noticias/${id}`,
  title: `Título ${id}`,
  title_en: "",
  excerpt: `Extracto ${id}.`,
  excerpt_en: "",
  image_url: "https://udes.edu.co/media/k2/items/cache/a.jpg",
  published_on: "2025-05-02",
  section: "Investigación",
  campus: "Bucaramanga",
  ...over,
});

const render = (props: Parameters<typeof OdsNews>[0]) => renderToString(h(OdsNews, props)).replace(/<!-- -->/g, "");

describe("OdsNews · carrusel final", () => {
  it("sin notas aprobadas no pinta nada", () => {
    datos.data = [];
    expect(render({ n: 13 })).toBe("");
    expect(render({ n: 13, lang: "en" })).toBe("");
  });

  it("cada tarjeta: foto, fecha, título, extracto y enlace a udes.edu.co; sin porcentajes ni estados", () => {
    datos.data = [nota("a"), nota("b", { published_on: "2025-08-01" }), nota("c", { image_url: null, published_on: null })];
    const html = render({ n: 13 });
    expect(html).toContain("La UDES en las noticias");
    expect(html).toContain("3 notas de 2025");
    expect(html).toContain('href="https://udes.edu.co/investigacion/noticias/a"');
    expect(html).toContain("Leer la nota en udes.edu.co");
    expect(html).toContain("Extracto b.");
    expect(html).toContain("1 ago 2025");
    expect(html).not.toMatch(/80 ?%|Por revisar/);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html.indexOf('id="osn-b"')).toBeLessThan(html.indexOf('id="osn-a"'));
    expect(html.indexOf('id="osn-a"')).toBeLessThan(html.indexOf('id="osn-c"'));
    expect(html).toContain(">UDES</span>");
    expect(html).not.toContain('class="lng-es"');
  });

  it("en inglés: título y extracto en inglés si existen; si no, el original con la marca «ES»", () => {
    datos.data = [nota("a", { title_en: "Title a", excerpt_en: "Excerpt a." }), nota("b", { published_on: "2025-01-01" })];
    const html = render({ n: 13, lang: "en" });
    expect(html).toContain("UDES in the news");
    expect(html).toContain("2 news stories from 2025");
    expect(html).toContain('<span lang="en">Title a</span>');
    expect(html).toContain("Excerpt a.");
    expect(html).toMatch(/<span lang="es">Título b <abbr class="lng-es"[^>]*>ES<\/abbr><\/span>/);
    expect(html).toContain("Read the story on udes.edu.co");
    expect(html).toContain("1 Jan 2025");
    expect(html).toContain('aria-label="Next stories"');
    expect(html).not.toContain("Leer la nota");
  });

  it("es un carrusel accesible: flechas, contador anunciado y pista con foco", () => {
    datos.data = [nota("a"), nota("b"), nota("c"), nota("d")];
    const html = render({ n: 13 });
    expect(html).toContain('aria-label="Noticias anteriores"');
    expect(html).toContain('aria-label="Noticias siguientes"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("1–3 de 4");
    expect(html).toMatch(/class="osn-track" tabindex="0"/);
  });

  it("todas las notas, sin tope: de 24 en 24 con «Ver N más»", () => {
    datos.data = Array.from({ length: 61 }, (_, i) => nota(`n${i}`, { published_on: `2025-${String((i % 12) + 1).padStart(2, "0")}-10` }));
    const html = render({ n: 4 });
    expect(html).toContain("61 notas de 2025");
    expect(html.match(/class="osn-card"/g)?.length).toBe(LOTE_CARRUSEL);
    expect(html).toContain(`Ver ${LOTE_CARRUSEL} más`);
  });

  it("si el informe recortó la foto, la tarjeta usa su punto de interés", () => {
    datos.data = [nota("a")];
    expect(render({ n: 13, recortes: { a: { fx: 0.2, fy: 0.7, ratio: "3:1" } } })).toContain("object-position:20% 70%");
  });

  it("ordena por fecha y deja al final las que no tienen", () => {
    expect(ordenarCarrusel([{ published_on: null }, { published_on: "2025-01-01" }, { published_on: "2025-06-01" }]).map((x) => x.published_on)).toEqual(["2025-06-01", "2025-01-01", null]);
  });
});
