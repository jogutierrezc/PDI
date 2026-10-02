import { describe, expect, it } from "vitest";
import { ASK_SPACES } from "../pregunta/space";
import { APP_BASE, APP_PATHS, APP_PILOS, APP_SPACES, isAppPath, readAppPath, startTarget } from "./routes";

describe("las rutas de la app y su Pilo", () => {
  it("cada ruta abre su espacio", () => {
    expect(readAppPath("/app")).toEqual({ kind: "inicio" });
    expect(readAppPath("/app/")).toEqual({ kind: "inicio" });
    expect(readAppPath("/app/universidad")).toEqual({ kind: "pilo", space: "planeacion" });
    expect(readAppPath("/app/ensenanza")).toEqual({ kind: "pilo", space: "ensenanza" });
    expect(readAppPath("/app/ensenanza/")).toEqual({ kind: "pilo", space: "ensenanza" });
    expect(readAppPath("/APP/Universidad")).toEqual({ kind: "pilo", space: "planeacion" });
    expect(readAppPath("/app/universidad?x=1#y")).toEqual({ kind: "pilo", space: "planeacion" });
  });

  it("lo que no existe dentro de la app, o no es de la app, es «otra»", () => {
    for (const path of ["/app/otra", "/app/universidad/mas", "/apple", "/pregunta", "/", ""]) expect(readAppPath(path)).toEqual({ kind: "otra" });
  });

  it("cada Pilo tiene su ruta, su nombre y su perfil", () => {
    expect(APP_BASE).toBe("/app");
    expect(APP_SPACES).toEqual(["planeacion", "ensenanza"]);
    for (const space of APP_SPACES) {
      expect(ASK_SPACES[space].id).toBe(space);
      expect(readAppPath(APP_PATHS[space])).toEqual({ kind: "pilo", space });
      expect(APP_PILOS[space].label).toMatch(/^Pilo /);
    }
    // No son las rutas de las páginas: la app tiene las suyas.
    expect(APP_PATHS.planeacion).not.toBe(ASK_SPACES.planeacion.route);
    expect(APP_PATHS.ensenanza).not.toBe(ASK_SPACES.ensenanza.route);
  });

  it("el service worker solo se registra bajo /app", () => {
    expect(isAppPath("/app")).toBe(true);
    expect(isAppPath("/app/ensenanza")).toBe(true);
    expect(isAppPath("/app?x=1")).toBe(true);
    expect(isAppPath("/apple")).toBe(false);
    expect(isAppPath("/pregunta")).toBe(false);
    expect(isAppPath("/")).toBe(false);
  });

  it("/app: la bienvenida la primera vez; después, el Pilo de la última conversación", () => {
    expect(startTarget({ seen: false, last: "ensenanza" })).toBe("bienvenida");
    expect(startTarget({ seen: false, last: null })).toBe("bienvenida");
    expect(startTarget({ seen: true, last: "ensenanza" })).toBe("ensenanza");
    expect(startTarget({ seen: true, last: "planeacion" })).toBe("planeacion");
    expect(startTarget({ seen: true, last: null })).toBe("planeacion");
    expect(startTarget({ seen: true, last: undefined })).toBe("planeacion");
  });
});
