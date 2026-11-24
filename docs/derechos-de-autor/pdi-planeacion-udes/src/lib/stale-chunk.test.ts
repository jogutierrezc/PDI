import { describe, expect, it } from "vitest";
import { STALE_MESSAGE, importFresh, isStaleChunkError } from "./stale-chunk";

describe("isStaleChunkError", () => {
  it("reconoce el aviso de cada navegador cuando falta un archivo cargado bajo demanda", () => {
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/pdf-load-BOVKA442.js"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new Error("error loading dynamically imported module: /assets/a.js"))).toBe(true);
  });
  it("no confunde un fallo cualquiera", () => {
    expect(isStaleChunkError(new Error("El PDF está dañado"))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe("importFresh", () => {
  it("devuelve el módulo cuando carga", async () => {
    expect(await importFresh(async () => ({ ok: 1 }))).toEqual({ ok: 1 });
  });
  it("explica qué hacer cuando el archivo es de una versión vieja", async () => {
    await expect(importFresh(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module: x")))).rejects.toThrow(STALE_MESSAGE);
  });
  it("deja pasar los demás errores tal cual", async () => {
    await expect(importFresh(() => Promise.reject(new Error("otro")))).rejects.toThrow("otro");
  });
});
