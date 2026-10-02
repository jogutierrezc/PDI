import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_THEMES, DEFAULT_THEME, parseTheme, readTheme, writeTheme } from "./themes";

describe("la elección de tema", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("son cinco, con «Mi UDES» por defecto", () => {
    expect(APP_THEMES.map((t) => t.label)).toEqual(["Mi UDES", "Blanco", "Negro", "Futurista", "Estilo Pilo"]);
    expect(APP_THEMES.map((t) => t.id)).toEqual(["udes", "blanco", "negro", "futurista", "pilo"]);
    expect(DEFAULT_THEME).toBe("udes");
  });

  it("lo guardado que no es un tema es «Mi UDES»", () => {
    expect(parseTheme("negro")).toBe("negro");
    expect(parseTheme(" Futurista ")).toBe("futurista");
    for (const v of [null, undefined, "", "soleado", "dark", 3, {}]) expect(parseTheme(v)).toBe("udes");
  });

  it("se guarda por dispositivo, y sin almacenamiento sigue funcionando", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } });
    expect(readTheme()).toBe("udes");
    writeTheme("pilo");
    expect(data.get("pilo-app:tema")).toBe("pilo");
    expect(readTheme()).toBe("pilo");
    // No toca el tema de las páginas de Pilo ni el del portal.
    expect([...data.keys()]).toEqual(["pilo-app:tema"]);
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    });
    expect(readTheme()).toBe("udes");
    expect(() => writeTheme("negro")).not.toThrow();
  });
});

/* --- Los colores: una sola hoja, y contraste de texto de 4.5:1 en los cinco temas ------------- */

const DIR = resolve(process.cwd(), "src/modules/pilo-app");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const sheet = strip(readFileSync(resolve(DIR, "pilo-app-themes.css"), "utf8"));

function themeVars(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [, selector, body] of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const id = selector.match(/\.pa\[data-tema="([a-z]+)"\]/)?.[1] ?? (/(^|,)\s*\.pa\s*(,|$)/.test(selector) ? "udes" : null);
    if (!id) continue;
    out[id] = Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
  }
  return out;
}

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Cada tinta con los fondos sobre los que se lee de verdad. */
const PAIRS: [string, string[]][] = [
  ["--s-ink", ["--s1", "--s2", "--s3"]],
  ["--s-muted", ["--s1", "--s2", "--s3"]],
  ["--acc-ink", ["--acc"]],
  ["--c-ink", ["--c-bg", "--c-bubble", "--c-sheet", "--c-mark", "--c-chip"]],
  ["--c-ink2", ["--c-bg", "--c-bubble", "--c-sheet"]],
  ["--c-mine-ink", ["--c-mine"]],
  ["--c-bar-ink", ["--c-bar"]],
  ["--c-bar-muted", ["--c-bar"]],
  ["--c-link", ["--c-bg", "--c-bubble", "--c-sheet", "--c-chip"]],
  // La cita encendida: el fondo de la página como tinta sobre el color de enlace.
  ["--c-bg", ["--c-link"]],
  ["--c-warn", ["--c-warn-bg"]],
  // Las pantallas de la cuenta: lo que sirve y lo que falta en un campo, sobre la página, la hoja y el campo.
  ["--c-ok", ["--c-bg", "--c-bubble", "--c-sheet"]],
  ["--c-bad", ["--c-bg", "--c-bubble", "--c-sheet"]],
  // El campo elegido y la barra lateral del escritorio.
  ["--c-ink2", ["--c-chip"]],
  ["--w-card-ink", ["--w-card"]],
  ["--w-card-ok", ["--w-card"]],
];

describe("los cinco temas", () => {
  const themes = themeVars();

  it("la hoja define los cinco, con las mismas variables", () => {
    expect(Object.keys(themes).sort()).toEqual(APP_THEMES.map((t) => t.id).sort());
    const names = Object.keys(themes.udes).sort();
    expect(names.length).toBeGreaterThan(25);
    for (const t of APP_THEMES) expect(Object.keys(themes[t.id]).sort(), t.id).toEqual(names);
  });

  it.each(APP_THEMES.map((t) => t.id))("«%s»: el texto llega a 4.5:1 sobre su fondo", (id) => {
    const v = themes[id];
    for (const [ink, grounds] of PAIRS) {
      for (const ground of grounds) {
        expect(v[ink], `${ink} en ${id}`).toMatch(/^#[0-9a-f]{6}$/);
        expect(v[ground], `${ground} en ${id}`).toMatch(/^#[0-9a-f]{6}$/);
        const ratio = contrast(v[ink], v[ground]);
        expect(ratio, `${id}: ${ink} sobre ${ground} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("los colores de la app viven solo en la hoja de temas", () => {
    const main = strip(readFileSync(resolve(DIR, "pilo-app.css"), "utf8"));
    // Ningún color escrito a mano: ni hexadecimal, ni rgb(), ni hsl(). (#000 solo como máscara: no es un color que se vea.)
    const loose = [...main.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)].map((m) => m[0]).filter((c) => c !== "#000");
    expect(loose).toEqual([]);
  });
});
