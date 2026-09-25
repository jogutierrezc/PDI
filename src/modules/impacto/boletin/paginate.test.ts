import { describe, expect, it } from "vitest";
import { paginate } from "./paginate";

describe("el reparto en páginas", () => {
  it("los bloques que no caben pasan enteros a la página siguiente", () => {
    const pages = paginate(
      [
        { key: "a", kind: "block", h: 400 },
        { key: "b", kind: "block", h: 400 },
        { key: "c", kind: "block", h: 400 },
      ],
      900,
      900,
      20,
    );
    expect(pages.map((p) => p.map((x) => x.key))).toEqual([["a", "b"], ["c"]]);
  });

  it("una tabla se parte por filas y repite su encabezado; la nota va con la última fila", () => {
    const pages = paginate([{ key: "t", kind: "rows", head: 100, rows: Array(30).fill(40), foot: 30 }], 600, 900, 20);
    expect(pages.map((p) => p.map((x) => (x.kind === "rows" ? [x.from, x.to, x.first, x.last] : x.key)))).toEqual([
      [[0, 12, true, false]],
      [[12, 30, false, true]],
    ]);
  });

  it("no deja dos filas sueltas al pie: la tabla empieza en la página siguiente", () => {
    const pages = paginate(
      [
        { key: "a", kind: "block", h: 700 },
        { key: "t", kind: "rows", head: 100, rows: Array(10).fill(40), foot: 0 },
      ],
      900,
      900,
      20,
    );
    expect(pages[0].map((x) => x.key)).toEqual(["a"]);
    expect(pages[1][0]).toMatchObject({ key: "t", from: 0, to: 10 });
  });

  it("una fila más alta que la página va igual, sin quedar en bucle", () => {
    const pages = paginate([{ key: "t", kind: "rows", head: 50, rows: [2000, 40], foot: 0 }], 900, 900, 20);
    expect(pages.flat()).toHaveLength(2);
  });
});
