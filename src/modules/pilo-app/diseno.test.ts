import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DISENO, KEY_DISENO, disenoAttr, disenoFromSearch, parseDiseno, readDiseno, writeDiseno } from "./diseno";

describe("el interruptor del diseño nuevo", () => {
  let data: Map<string, string>;
  beforeEach(() => {
    data = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("la clave es «pilo-app:diseno» y por defecto es «clasico»", () => {
    expect(KEY_DISENO).toBe("pilo-app:diseno");
    expect(DEFAULT_DISENO).toBe("clasico");
    expect(readDiseno("")).toBe("clasico");
  });

  it("solo reconoce «nuevo» y «clasico»", () => {
    expect(parseDiseno("nuevo")).toBe("nuevo");
    expect(parseDiseno(" CLASICO ")).toBe("clasico");
    expect(parseDiseno("beta")).toBeNull();
    expect(parseDiseno(null)).toBeNull();
    expect(parseDiseno(3)).toBeNull();
  });

  it("el parámetro de la dirección lo fija y se recuerda", () => {
    expect(disenoFromSearch("?diseno=nuevo")).toBe("nuevo");
    expect(disenoFromSearch("?x=1&diseno=clasico")).toBe("clasico");
    expect(disenoFromSearch("?diseno=otro")).toBeNull();
    expect(readDiseno("?diseno=nuevo")).toBe("nuevo");
    expect(data.get("pilo-app:diseno")).toBe("nuevo");
    // Sin parámetro, queda lo recordado.
    expect(readDiseno("")).toBe("nuevo");
    // Y el parámetro contrario lo cambia.
    expect(readDiseno("?diseno=clasico")).toBe("clasico");
    expect(readDiseno("")).toBe("clasico");
  });

  it("lo guardado se lee; un valor dañado cae en «clasico»", () => {
    writeDiseno("nuevo");
    expect(readDiseno("")).toBe("nuevo");
    data.set(KEY_DISENO, "???");
    expect(readDiseno("")).toBe("clasico");
  });

  it("sin almacenamiento sigue siendo «clasico» y no falla", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    });
    expect(readDiseno("")).toBe("clasico");
    expect(() => writeDiseno("nuevo")).not.toThrow();
  });

  it("solo el nuevo lleva atributo", () => {
    expect(disenoAttr("nuevo")).toBe("nuevo");
    expect(disenoAttr("clasico")).toBeUndefined();
  });
});

describe("la hoja del diseño nuevo", () => {
  const css = ["pilo-app-nuevo.css", "pilo-app-nuevo-pantallas.css"].map((f) => readFileSync(resolve(process.cwd(), "src/modules/pilo-app", f), "utf8")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

  it("todo selector va bajo data-diseno=\"nuevo\" (salvo el conmutador): sin atributo, nada cambia", () => {
    const loose: string[] = [];
    for (const [, head] of css.matchAll(/([^{}]+)\{/g)) {
      // Lo de dentro de :is(…), :not(…) y :where(…) puede llevar comas: no son selectores aparte.
      const sel = head.trim().replace(/:(is|not|where|has)\(([^()]*)\)/g, ":$1()");
      if (sel.startsWith("@")) continue;
      for (const part of sel.split(",").map((p) => p.trim())) {
        if (!part.includes('[data-diseno="nuevo"]') && !/^\.pa(-side)? \.pa-diseno|^\.pa-diseno/.test(part)) loose.push(part);
      }
    }
    expect(loose).toEqual([]);
  });

  it("el cristal (backdrop-filter) solo está en dos elementos y tiene su alternativa sólida", () => {
    const withBlur = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, , body]) => /(^|\s|;)backdrop-filter:/.test(body)).map(([, sel]) => sel.trim());
    expect(withBlur).toEqual(['.pa[data-diseno="nuevo"] .pa-compose', '.pa[data-diseno="nuevo"] .pt']);
    expect(css).toMatch(/@supports not \(\(backdrop-filter/);
  });
});
