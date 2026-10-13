// @vitest-environment jsdom
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { NewsItem } from "../rankings/noticias";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
});

const datos = vi.hoisted(() => ({ data: [] as NewsItem[] }));
vi.mock("../rankings/noticias", async (original) => ({
  ...(await original<typeof import("../rankings/noticias")>()),
  useApprovedNews: () => ({ data: datos.data }),
}));

import { OdsNews, ordenarCarrusel } from "./OdsNews";

const nota = (id: string, over: Partial<NewsItem> = {}): NewsItem => ({
  id, url: `https://udes.edu.co/investigacion/noticias/${id}`, title: `Título ${id}`, excerpt: `Extracto ${id}.`, image_url: "https://udes.edu.co/media/k2/items/cache/a.jpg",
  published_on: "2025-05-02", section: "Investigación", campus: "Bucaramanga", state: "ok", ods: [{ ods: 13, score: 80, reason: "Menciona clima", manual: false }], ...over,
});

const render = (props: Parameters<typeof OdsNews>[0]) => renderToString(h(OdsNews, props)).replace(/<!-- -->/g, "");

describe("OdsNews · carrusel final", () => {
  it("sin notas aprobadas no pinta nada", () => {
    datos.data = [];
    expect(render({ n: 13 })).toBe("");
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
    expect(html).not.toMatch(/Menciona clima|80 ?%|Por revisar/);
    expect(html).toContain('rel="noopener noreferrer"');
    /* De la más reciente a la más antigua; la tarjeta lleva el id al que apuntan las referencias del relato. */
    expect(html.indexOf('id="osn-b"')).toBeLessThan(html.indexOf('id="osn-a"'));
    expect(html.indexOf('id="osn-a"')).toBeLessThan(html.indexOf('id="osn-c"'));
    /* Sin imagen queda el campo del color del ODS. */
    expect(html).toContain(">UDES</span>");
  });

  it("es un carrusel accesible: flechas, contador anunciado y pista con foco", () => {
    datos.data = [nota("a"), nota("b"), nota("c"), nota("d")];
    const html = render({ n: 13 });
    expect(html).toContain('aria-label="Noticias anteriores"');
    expect(html).toContain('aria-label="Noticias siguientes"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("1–3 de 4");
    expect(html).toMatch(/class="osn-track" tabindex="0"/);
    expect(html).toMatch(/aria-label="Noticias anteriores" aria-controls="osn-track" disabled=""|disabled=""[^>]*aria-label="Noticias anteriores"/);
  });

  it("si el informe recortó la foto, la tarjeta usa su punto de interés", () => {
    datos.data = [nota("a")];
    expect(render({ n: 13, recortes: { a: { fx: 0.2, fy: 0.7, ratio: "3:1" } } })).toContain("object-position:20% 70%");
  });

  it("ordena por fecha y deja al final las que no tienen", () => {
    expect(ordenarCarrusel([{ published_on: null }, { published_on: "2025-01-01" }, { published_on: "2025-06-01" }]).map((x) => x.published_on)).toEqual(["2025-06-01", "2025-01-01", null]);
  });
});
