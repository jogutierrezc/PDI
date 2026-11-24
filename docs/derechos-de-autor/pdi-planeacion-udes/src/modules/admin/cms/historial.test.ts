import { describe, expect, it } from "vitest";
import { LIMITE_HISTORIAL, cambiar, cortarFusion, deshacer, nuevoHistorial, rehacer } from "./historial";

describe("historial de deshacer y rehacer", () => {
  it("deshace y rehace un cambio", () => {
    let h = nuevoHistorial(["a"]);
    h = cambiar(h, ["a", "b"]);
    h = deshacer(h);
    expect(h.actual).toEqual(["a"]);
    h = rehacer(h);
    expect(h.actual).toEqual(["a", "b"]);
  });

  it("un cambio nuevo anula lo que se podía rehacer", () => {
    let h = nuevoHistorial(1);
    h = cambiar(h, 2);
    h = deshacer(h);
    h = cambiar(h, 3);
    expect(h.futuro).toEqual([]);
    expect(rehacer(h).actual).toBe(3);
  });

  it("deshacer sin pasos no cambia nada", () => {
    const h = nuevoHistorial("x");
    expect(deshacer(h)).toBe(h);
    expect(rehacer(h)).toBe(h);
  });

  it("un cambio igual al actual no abre paso", () => {
    const h = nuevoHistorial("x");
    expect(cambiar(h, "x")).toBe(h);
  });

  it("con la misma clave, los cambios se fusionan en un paso", () => {
    let h = nuevoHistorial("");
    h = cambiar(h, "H", "bloque:titulo");
    h = cambiar(h, "Ho", "bloque:titulo");
    h = cambiar(h, "Hol", "bloque:titulo");
    expect(h.pasado).toEqual([""]);
    h = deshacer(h);
    expect(h.actual).toBe("");
  });

  it("cortarFusion hace que el siguiente cambio abra paso nuevo", () => {
    let h = nuevoHistorial("");
    h = cambiar(h, "H", "k");
    h = cortarFusion(h);
    h = cambiar(h, "Ho", "k");
    expect(h.pasado).toEqual(["", "H"]);
  });

  it("una clave distinta abre paso nuevo", () => {
    let h = nuevoHistorial("");
    h = cambiar(h, "a", "k1");
    h = cambiar(h, "ab", "k2");
    expect(h.pasado).toEqual(["", "a"]);
  });

  it("guarda como máximo LIMITE_HISTORIAL pasos, también al rehacer", () => {
    let h = nuevoHistorial(0);
    for (let i = 1; i <= LIMITE_HISTORIAL + 20; i++) h = cambiar(h, i);
    expect(h.pasado).toHaveLength(LIMITE_HISTORIAL);
    expect(h.pasado[0]).toBe(20);
    for (let i = 0; i < 5; i++) h = rehacer(deshacer(h));
    expect(h.pasado.length).toBeLessThanOrEqual(LIMITE_HISTORIAL);
  });
});
