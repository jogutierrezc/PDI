import { describe, expect, it } from "vitest";
import { placeBubble, type BubblePlacement } from "./placement";

const viewport = { width: 1280, height: 800 };
const inside = (p: BubblePlacement, height: number, vp = viewport, margin = 16) => {
  const h = Math.min(height, p.maxHeight);
  expect(p.top).toBeGreaterThanOrEqual(margin);
  expect(p.left).toBeGreaterThanOrEqual(margin);
  expect(p.top + h).toBeLessThanOrEqual(vp.height - margin);
  expect(p.left + p.width).toBeLessThanOrEqual(vp.width - margin);
};

describe("placeBubble: el globo de Mr. Pilo siempre cabe en la ventana", () => {
  it("con el elemento pegado arriba, el globo va debajo y no se corta", () => {
    const target = { top: 4, left: 20, width: 160, height: 44 };
    const p = placeBubble({ target, bubbleHeight: 300, viewport });
    expect(p.side).toBe("below");
    expect(p.top).toBe(4 + 44 + 24);
    inside(p, 300);
  });

  it("con el elemento abajo, el globo sube encima", () => {
    const target = { top: 700, left: 600, width: 200, height: 60 };
    const p = placeBubble({ target, bubbleHeight: 300, viewport });
    expect(p.side).toBe("above");
    expect(p.top + 300).toBeLessThanOrEqual(700 - 24);
    inside(p, 300);
  });

  it("con un elemento alto a un lado, el globo se pone a su lado", () => {
    const target = { top: 20, left: 16, width: 300, height: 760 };
    const p = placeBubble({ target, bubbleHeight: 320, viewport });
    expect(p.side).toBe("right");
    expect(p.left).toBeGreaterThanOrEqual(16 + 300 + 24);
    inside(p, 320);
  });

  it("si el elemento ocupa toda la pantalla, va a la esquina, dentro", () => {
    const target = { top: -200, left: 0, width: 1280, height: 1400 };
    const p = placeBubble({ target, bubbleHeight: 320, viewport });
    expect(p.side).toBe("overlay");
    inside(p, 320);
  });

  it("un elemento que asoma por encima de la ventana no arrastra el globo fuera", () => {
    const target = { top: -30, left: 900, width: 360, height: 50 };
    const p = placeBubble({ target, bubbleHeight: 300, viewport });
    inside(p, 300);
  });

  it("un globo más alto que la ventana se limita y empieza en el margen", () => {
    const small = { width: 360, height: 420 };
    const p = placeBubble({ target: { top: 10, left: 10, width: 100, height: 40 }, bubbleHeight: 600, viewport: small });
    expect(p.maxHeight).toBe(420 - 32);
    expect(p.top).toBe(16);
    expect(p.width).toBe(360 - 32);
    inside(p, 600, small);
  });

  it("sin elemento, centrado", () => {
    const p = placeBubble({ target: null, bubbleHeight: 200, viewport });
    expect(p.side).toBe("center");
    expect(p.top).toBe(300);
    expect(p.left).toBe(440);
  });

  it("junto al borde derecho, el globo se ajusta al margen", () => {
    const target = { top: 100, left: 1240, width: 30, height: 30 };
    const p = placeBubble({ target, bubbleHeight: 200, viewport });
    expect(p.left + p.width).toBe(1280 - 16);
    inside(p, 200);
  });
});
