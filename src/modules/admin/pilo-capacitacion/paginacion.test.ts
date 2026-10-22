import { describe, expect, it } from "vitest";
import { PAGE_SIZE, clampPagina, parsePagina, rangoDePagina, textoRango, totalPages, ventanaDePaginas } from "./paginacion";

describe("totalPages", () => {
  it("cuenta páginas de 10 y redondea hacia arriba", () => {
    expect(totalPages(114)).toBe(12);
    expect(totalPages(110)).toBe(11);
    expect(totalPages(1)).toBe(1);
  });

  it("sin preguntas hay una página vacía", () => {
    expect(totalPages(0)).toBe(1);
  });

  it("usa 10 por página por defecto", () => {
    expect(PAGE_SIZE).toBe(10);
  });
});

describe("parsePagina", () => {
  it("lee un número entero ≥ 1", () => {
    expect(parsePagina("3")).toBe(3);
  });

  it("lo que no sea un número válido vuelve a la primera", () => {
    expect(parsePagina(null)).toBe(1);
    expect(parsePagina("")).toBe(1);
    expect(parsePagina("abc")).toBe(1);
    expect(parsePagina("0")).toBe(1);
    expect(parsePagina("-4")).toBe(1);
  });
});

describe("clampPagina", () => {
  it("deja la página si existe", () => {
    expect(clampPagina(5, 114)).toBe(5);
  });

  it("si la página ya no existe, va a la última", () => {
    expect(clampPagina(40, 114)).toBe(12);
    expect(clampPagina(3, 0)).toBe(1);
  });
});

describe("rangoDePagina y textoRango", () => {
  it("la segunda página de 114 muestra 11 a 20", () => {
    expect(rangoDePagina(2, 114)).toEqual({ from: 11, to: 20 });
    expect(textoRango(2, 114)).toBe("Mostrando 11–20 de 114");
  });

  it("la última página acota al total", () => {
    expect(rangoDePagina(12, 114)).toEqual({ from: 111, to: 114 });
    expect(textoRango(12, 114)).toBe("Mostrando 111–114 de 114");
  });

  it("sin preguntas no inventa un rango", () => {
    expect(rangoDePagina(1, 0)).toEqual({ from: 0, to: 0 });
    expect(textoRango(1, 0)).toBe("Sin preguntas pendientes");
  });
});

describe("ventanaDePaginas", () => {
  it("con pocas páginas las muestra todas", () => {
    expect(ventanaDePaginas(2, 30)).toEqual([1, 2, 3]);
  });

  it("pone puntos suspensivos entre la vecindad y la última", () => {
    expect(ventanaDePaginas(1, 114)).toEqual([1, 2, "…", 12]);
    expect(ventanaDePaginas(12, 114)).toEqual([1, "…", 11, 12]);
  });

  it("en medio muestra la primera, la actual con sus vecinas y la última", () => {
    expect(ventanaDePaginas(6, 114)).toEqual([1, "…", 5, 6, 7, "…", 12]);
  });

  it("si solo se salta un número, lo muestra en vez de puntos", () => {
    // De 6 páginas: con la 4 se ven 3, 4 y 5; el 2 se salta solo y se muestra, sin puntos.
    expect(ventanaDePaginas(4, 60)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ventanaDePaginas(3, 60)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("sin preguntas muestra solo la página 1", () => {
    expect(ventanaDePaginas(1, 0)).toEqual([1]);
  });
});
