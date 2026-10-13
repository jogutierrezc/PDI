// @vitest-environment jsdom
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { NewsItem } from "../rankings/noticias";

const datos = vi.hoisted(() => ({ data: [] as NewsItem[] }));
vi.mock("../rankings/noticias", async (original) => ({
  ...(await original<typeof import("../rankings/noticias")>()),
  useApprovedNews: () => ({ data: datos.data }),
}));

import { OdsNews } from "./OdsNews";

const nota = (id: string, over: Partial<NewsItem> = {}): NewsItem => ({
  id, url: `https://udes.edu.co/investigacion/noticias/${id}`, title: `Título ${id}`, excerpt: `Extracto ${id}.`, image_url: "https://udes.edu.co/media/k2/items/cache/a.jpg",
  published_on: "2025-05-02", section: "Investigación", campus: "Bucaramanga", state: "ok", ods: [{ ods: 13, score: 80, reason: "Menciona clima", manual: false }], ...over,
});

describe("OdsNews", () => {
  it("sin notas aprobadas no pinta nada", () => {
    datos.data = [];
    expect(renderToString(h(OdsNews, { n: 13 }))).toBe("");
  });
  it("muestra título, extracto, imagen y enlace a la nota, sin porcentajes ni estados", () => {
    datos.data = [nota("a"), nota("b", { published_on: "2025-08-01" })];
    const html = renderToString(h(OdsNews, { n: 13 }));
    expect(html).toContain("La UDES en las noticias");
    expect(html).toContain("2 notas de 2025");
    expect(html).toContain("https://udes.edu.co/investigacion/noticias/a");
    expect(html).toContain("Extracto b."); // abre la sección la nota con imagen y mayor afinidad; a igualdad, la más reciente
    expect(html).not.toMatch(/Menciona clima|80 ?%|Por revisar/);
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
