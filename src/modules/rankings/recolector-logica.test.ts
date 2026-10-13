import { describe, expect, it } from "vitest";
import type { NewsItem } from "./noticias";
import {
  SIN_ODS,
  altaAfinidad,
  apilar,
  conEstados,
  contarRiel,
  desapilar,
  filtrar,
  haceCuanto,
  mover,
  pendientesDe,
  restaurar,
  siguienteNota,
} from "./recolector-logica";

const nota = (id: string, over: Partial<NewsItem> = {}): NewsItem => ({
  id,
  url: `https://udes.edu.co/${id}`,
  title: id,
  excerpt: "",
  image_url: null,
  published_on: "2025-01-01",
  section: "",
  campus: "",
  state: "pending",
  ods: [{ ods: 13, score: 50, reason: "", manual: false }],
  ...over,
});

describe("recolector · filtrar", () => {
  const notas = [
    nota("a", { title: "Siembra de árboles en la cuenca", published_on: "2025-03-01" }),
    nota("b", { state: "ok", published_on: "2025-05-01", ods: [{ ods: 4, score: 90, reason: "", manual: false }] }),
    nota("c", { state: "no", ods: [], published_on: "2025-02-01" }),
    nota("d", { published_on: "2025-09-01", ods: [{ ods: 4, score: 70, reason: "", manual: false }] }),
  ];
  it("por estado, de la más reciente a la más antigua", () => {
    expect(filtrar(notas, { estado: "pending", ods: 0, q: "" }).map((n) => n.id)).toEqual(["d", "a"]);
    expect(filtrar(notas, { estado: "all", ods: 0, q: "" }).map((n) => n.id)).toEqual(["d", "b", "a", "c"]);
  });
  it("por ODS y sin ODS", () => {
    expect(filtrar(notas, { estado: "all", ods: 4, q: "" }).map((n) => n.id)).toEqual(["d", "b"]);
    expect(filtrar(notas, { estado: "all", ods: SIN_ODS, q: "" }).map((n) => n.id)).toEqual(["c"]);
  });
  it("busca en el título sin importar tildes ni mayúsculas", () => {
    expect(filtrar(notas, { estado: "all", ods: 0, q: "ARBOLES" }).map((n) => n.id)).toEqual(["a"]);
  });
  it("cuenta el riel por estado: todas, cada ODS y sin ODS", () => {
    const r = contarRiel(notas);
    expect(r.get(0)).toEqual({ pending: 2, ok: 1, no: 1, total: 4 });
    expect(r.get(4)).toMatchObject({ pending: 1, ok: 1 });
    expect(r.get(SIN_ODS)).toMatchObject({ no: 1, total: 1 });
  });
});

describe("recolector · moverse", () => {
  const lista = [nota("a"), nota("b", { state: "ok" }), nota("c"), nota("d")];
  it("la siguiente por revisar va hacia abajo, salta las revisadas y vuelve arriba si no hay más", () => {
    expect(siguienteNota(lista, "a")).toBe("c");
    expect(siguienteNota(lista, "d")).toBe("a");
    expect(siguienteNota([nota("x")], "x")).toBeNull();
  });
  it("J/K no se salen de la lista", () => {
    expect(mover(lista, "a", -1)).toBe("a");
    expect(mover(lista, "a", 1)).toBe("b");
    expect(mover(lista, "d", 1)).toBe("d");
    expect(mover(lista, null, 1)).toBe("a");
    expect(mover([], null, 1)).toBeNull();
  });
});

describe("recolector · deshacer", () => {
  it("la pila guarda las últimas y desapila la más reciente", () => {
    let pila = apilar([], { antes: [{ id: "a", state: "pending" }], despues: "ok", texto: "1" });
    pila = apilar(pila, { antes: [{ id: "b", state: "pending" }], despues: "no", texto: "2" });
    const { ultima, resto } = desapilar(pila);
    expect(ultima?.texto).toBe("2");
    expect(resto).toHaveLength(1);
    expect(desapilar([]).ultima).toBeNull();
    let larga: ReturnType<typeof apilar> = [];
    for (let i = 0; i < 30; i++) larga = apilar(larga, { antes: [], despues: "ok", texto: String(i) }, 5);
    expect(larga.map((d) => d.texto)).toEqual(["25", "26", "27", "28", "29"]);
  });
  it("restaurar agrupa por el estado anterior y deja las notas como estaban", () => {
    const d = {
      antes: [
        { id: "a", state: "pending" as const },
        { id: "b", state: "no" as const },
        { id: "c", state: "pending" as const },
      ],
      despues: "ok" as const,
      texto: "",
    };
    expect(restaurar(d)).toEqual([
      { state: "pending", ids: ["a", "c"] },
      { state: "no", ids: ["b"] },
    ]);
    const notas = [nota("a", { state: "ok" }), nota("b", { state: "ok" }), nota("c", { state: "ok" })];
    let vuelta = notas;
    for (const g of restaurar(d)) vuelta = conEstados(vuelta, new Map(g.ids.map((id) => [id, g.state])));
    expect(vuelta.map((n) => n.state)).toEqual(["pending", "no", "pending"]);
  });
});

describe("recolector · lote y progreso", () => {
  it("el lote de alta afinidad toma solo las por revisar con su mejor ODS ≥ 80 %", () => {
    const notas = [
      nota("alta", { ods: [{ ods: 3, score: 40, reason: "", manual: false }, { ods: 13, score: 85, reason: "", manual: false }] }),
      nota("justa", { ods: [{ ods: 4, score: 80, reason: "", manual: false }] }),
      nota("baja", { ods: [{ ods: 4, score: 79, reason: "", manual: false }] }),
      nota("aprobada", { state: "ok", ods: [{ ods: 4, score: 95, reason: "", manual: false }] }),
      nota("sin", { ods: [] }),
    ];
    expect(altaAfinidad(notas).map((n) => n.id)).toEqual(["alta", "justa"]);
  });
  it("continuar donde quedó: solo las fuentes a medias de ese año", () => {
    const p = { "comunicaciones|2025": 40, "investigacion|2025": -1, "extension|2024": 10 };
    expect(pendientesDe(p, ["comunicaciones", "investigacion", "extension"], 2025)).toEqual({ comunicaciones: 40 });
  });
  it("hace cuánto", () => {
    const ahora = Date.parse("2026-10-13T12:00:00Z");
    expect(haceCuanto(null)).toBe("nunca");
    expect(haceCuanto("2026-10-13T11:55:00Z", ahora)).toBe("hace 5 min");
    expect(haceCuanto("2026-10-13T09:00:00Z", ahora)).toBe("hace 3 h");
    expect(haceCuanto("2026-10-11T12:00:00Z", ahora)).toBe("hace 2 días");
  });
});
