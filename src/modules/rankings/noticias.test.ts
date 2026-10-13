import { describe, expect, it } from "vitest";
import { contarPorOds, ordenarParaOds, type NewsItem } from "./noticias";

const nota = (id: string, over: Partial<NewsItem>): NewsItem => ({
  id, url: `https://udes.edu.co/${id}`, title: id, excerpt: "", image_url: null, published_on: "2025-01-01", section: "", campus: "", state: "ok", ods: [{ ods: 13, score: 50, reason: "", manual: false }], ...over,
});

describe("noticias", () => {
  it("cuenta solo las aprobadas, por ODS", () => {
    const n = [nota("a", {}), nota("b", { state: "pending" }), nota("c", { ods: [{ ods: 13, score: 80, reason: "", manual: false }, { ods: 3, score: 40, reason: "", manual: false }] })];
    expect(contarPorOds(n)).toEqual({ 13: 2, 3: 1 });
  });
  it("abre con la nota que tiene imagen y mayor afinidad; el resto va por fecha", () => {
    const n = [
      nota("vieja-con-foto", { published_on: "2025-02-01", image_url: "https://x/y.jpg", ods: [{ ods: 13, score: 90, reason: "", manual: false }] }),
      nota("nueva-sin-foto", { published_on: "2025-09-01" }),
      nota("media", { published_on: "2025-05-01" }),
    ];
    expect(ordenarParaOds(n, 13).map((x) => x.id)).toEqual(["vieja-con-foto", "nueva-sin-foto", "media"]);
  });
});
