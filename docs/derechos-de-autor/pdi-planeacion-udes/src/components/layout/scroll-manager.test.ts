import { describe, expect, it } from "vitest";
import { shouldReposition } from "./ScrollManager";

describe("cuándo se mueve la página", () => {
  it("al cambiar de ruta", () => {
    expect(shouldReposition({ pathname: "/datos-abiertos", hash: "" }, { pathname: "/datos-abiertos/poblacional", hash: "" })).toBe(true);
  });

  it("al llegar a un ancla nueva de la misma página", () => {
    expect(shouldReposition({ pathname: "/datos-abiertos", hash: "" }, { pathname: "/datos-abiertos", hash: "#informes" })).toBe(true);
  });

  it("no al elegir un periodo: la búsqueda cambia, la ruta y el ancla no", () => {
    expect(shouldReposition({ pathname: "/datos-abiertos/poblacional", hash: "" }, { pathname: "/datos-abiertos/poblacional", hash: "" })).toBe(false);
    expect(shouldReposition({ pathname: "/datos-abiertos", hash: "#informes" }, { pathname: "/datos-abiertos", hash: "#informes" })).toBe(false);
  });

  it("no cuando la URL pierde su ancla sin cambiar de página", () => {
    expect(shouldReposition({ pathname: "/datos-abiertos", hash: "#informes" }, { pathname: "/datos-abiertos", hash: "" })).toBe(false);
  });
});
