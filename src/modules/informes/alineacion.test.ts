import { describe, expect, it } from "vitest";
import { accionVacia, aporteVacio, avanceAlineacion, conAlineacion, controlesAlineacion, driveDeAlineacion, estadoDePilar, moverAccion, normalizarAlineacion } from "./alineacion";
import type { ContenidoSeccion } from "./types";

const diez = "uno dos tres cuatro cinco seis siete ocho nueve diez";
const aporte = (pilar: string, texto = diez) => ({ ...aporteVacio(pilar), aporte: texto });

describe("normalizarAlineacion", () => {
  it("migra pilares marcados a aportes vacíos cuando no hay alineacion", () => {
    const r = normalizarAlineacion({ pilares: ["a", "b"], texto: "algo" });
    expect(r.map((x) => x.pilar)).toEqual(["a", "b"]);
    expect(r.every((x) => x.aporte === "" && x.acciones.length === 0)).toBe(true);
  });
  it("usa alineacion si existe y quita pilares repetidos", () => {
    const r = normalizarAlineacion({ pilares: ["z"], alineacion: [aporte("a"), aporte("a"), aporte("b")] });
    expect(r.map((x) => x.pilar)).toEqual(["a", "b"]);
  });
  it("tolera contenido nulo o acciones mal formadas", () => {
    expect(normalizarAlineacion(null)).toEqual([]);
    const r = normalizarAlineacion({ alineacion: [{ pilar: "a", aporte: "x", acciones: [{ id: "1" } as never] }] });
    expect(r[0].acciones[0]).toMatchObject({ titulo: "", descripcion: "", bloques: [] });
  });
});

describe("conAlineacion", () => {
  it("sincroniza pilares con los pilares incluidos y conserva el resto", () => {
    const c: ContenidoSeccion = { texto: "previo", pilares: ["x"] };
    const r = conAlineacion(c, [aporte("a"), aporteVacio("b")]);
    expect(r.pilares).toEqual(["a", "b"]);
    expect(r.texto).toBe("previo");
    expect(r.alineacion).toHaveLength(2);
  });
});

describe("avanceAlineacion", () => {
  it("sin nada es 0", () => expect(avanceAlineacion({})).toBe(0));
  it("contenido anterior: regla de 3 pilares", () => {
    expect(avanceAlineacion({ pilares: ["a"] })).toBe(1);
    expect(avanceAlineacion({ pilares: ["a", "b", "c"] })).toBe(2);
    expect(avanceAlineacion({ texto: "hola" })).toBe(1);
  });
  it("lista con un pilar de 10 palabras", () => expect(avanceAlineacion({ alineacion: [aporte("a")] })).toBe(2));
  it("en curso si algún pilar tiene aporte corto o vacío", () => {
    expect(avanceAlineacion({ alineacion: [aporte("a"), aporte("b", "corto")] })).toBe(1);
    expect(avanceAlineacion({ alineacion: [aporteVacio("a")] })).toBe(1);
  });
  it("una acción sin título impide estar lista", () => {
    const a = { ...aporte("a"), acciones: [accionVacia()] };
    expect(avanceAlineacion({ alineacion: [a] })).toBe(1);
    expect(avanceAlineacion({ alineacion: [{ ...a, acciones: [{ ...a.acciones[0], titulo: "Acción" }] }] })).toBe(2);
  });
  it("alineacion vacía es 0, o 1 si queda texto anterior", () => {
    expect(avanceAlineacion({ alineacion: [] })).toBe(0);
    expect(avanceAlineacion({ alineacion: [], texto: "viejo" })).toBe(1);
  });
});

describe("controlesAlineacion y estados", () => {
  const pilares = [{ id: "a", numeral: "1" }, { id: "b", numeral: "2" }];
  it("nombra el pilar sin aporte y la acción sin título", () => {
    const t = controlesAlineacion({ alineacion: [aporte("a"), { ...aporteVacio("b"), acciones: [accionVacia()] }] }, pilares).map((x) => x.texto);
    expect(t).toContain("Pilar 2 sin aporte");
    expect(t).toContain("Pilar 2: una acción sin título");
  });
  it("todo en orden da controles ok", () => {
    const r = controlesAlineacion({ alineacion: [aporte("a")] }, pilares);
    expect(r.every((x) => x.nivel === "ok")).toBe(true);
  });
  it("estados del pilar", () => {
    expect(estadoDePilar(undefined)).toBe("sin-incluir");
    expect(estadoDePilar(aporteVacio("a"))).toBe("vacio");
    expect(estadoDePilar(aporte("a", "poco"))).toBe("corto");
    expect(estadoDePilar(aporte("a"))).toBe("listo");
  });
});

describe("helpers", () => {
  it("mueve acciones dentro de los límites", () => {
    const a = [{ ...accionVacia(), titulo: "1" }, { ...accionVacia(), titulo: "2" }];
    expect(moverAccion(a, 0, 1).map((x) => x.titulo)).toEqual(["2", "1"]);
    expect(moverAccion(a, 0, -1)).toBe(a);
  });
  it("reúne los elementos de UDrive de las acciones", () => {
    const el = { tipo: "tabla", archivoId: "f1", titulo: "" } as never;
    const x = { ...accionVacia(), bloques: [{ id: "b", tipo: "drive" as const, drive: [el] }] };
    expect(driveDeAlineacion({ alineacion: [{ ...aporteVacio("a"), acciones: [x] }] })).toHaveLength(1);
  });
});
