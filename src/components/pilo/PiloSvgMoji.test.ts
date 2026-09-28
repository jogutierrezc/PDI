import { describe, expect, it } from "vitest";
import { prefixSvgIds, syllables } from "./PiloSvgMoji";

describe("prefixSvgIds", () => {
  const svg = '<svg><defs><clipPath id="__PM__clip"><path d="M0 0"/></clipPath></defs><g clip-path="url(#__PM__clip)"><use href="#__PM__clip"/></g></svg>';

  it("hace únicas las ids y sus referencias", () => {
    const out = prefixSvgIds(svg, "pm1-");
    expect(out).toContain('id="pm1-__PM__clip"');
    expect(out).toContain("url(#pm1-__PM__clip)");
    expect(out).toContain('href="#pm1-__PM__clip"');
    expect(out).not.toMatch(/url\(#__PM__/);
  });

  it("dos instancias no comparten ids", () => {
    const a = prefixSvgIds(svg, "a-");
    const b = prefixSvgIds(svg, "b-");
    expect(a.match(/id="([^"]+)"/)![1]).not.toBe(b.match(/id="([^"]+)"/)![1]);
  });

  it("no toca referencias a ids que no existen ni un SVG sin ids", () => {
    expect(prefixSvgIds('<g fill="url(#otro)"/>', "x-")).toBe('<g fill="url(#otro)"/>');
    const dotted = prefixSvgIds('<i id="a.b"/><g fill="url(#a.b)"/><g fill="url(#aXb)"/>', "p-");
    expect(dotted).toBe('<i id="p-a.b"/><g fill="url(#p-a.b)"/><g fill="url(#aXb)"/>');
  });
});

describe("syllables", () => {
  it("da sílabas desiguales dentro de rangos que se ven como habla", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const s = syllables(40, rnd);
    expect(s).toHaveLength(40);
    for (const x of s) {
      expect(x.open).toBeGreaterThanOrEqual(3);
      expect(x.open).toBeLessThanOrEqual(14);
      expect(x.dur).toBeGreaterThanOrEqual(0.055);
      expect(x.dur).toBeLessThanOrEqual(0.115);
      expect(x.rest === 0 || (x.rest >= 0.12 && x.rest <= 0.26)).toBe(true);
    }
    expect(new Set(s.map((x) => x.open.toFixed(2))).size).toBeGreaterThan(20);
    expect(s.some((x) => x.rest > 0)).toBe(true);
  });
});
