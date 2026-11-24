import { describe, expect, it } from "vitest";
import { H_INT, H_MAX, demandH, hourShare, merc, pUse, trafficH } from "./modelo";

describe("la probabilidad de caminar hasta una parada", () => {
  it("vale la mitad justo a la distancia elegida", () => {
    expect(pUse(400, 400)).toBeCloseTo(0.5, 5);
  });
  it("baja con la distancia y no sube nunca de 1", () => {
    expect(pUse(100, 400)).toBeGreaterThan(pUse(400, 400));
    expect(pUse(800, 400)).toBeLessThan(0.05);
    expect(pUse(0, 400)).toBeLessThanOrEqual(1);
  });
});

describe("las curvas del día", () => {
  it("no hay viajes fuera del servicio (5 a 22 h)", () => {
    expect(demandH(4.9)).toBe(0);
    expect(demandH(22.1)).toBe(0);
  });
  it("los picos superan al mediodía", () => {
    expect(demandH(6.5)).toBeGreaterThan(demandH(12.5));
    expect(demandH(18.5)).toBeGreaterThan(demandH(12.5));
    expect(H_MAX).toBeGreaterThanOrEqual(demandH(6.5));
  });
  it("las fracciones por hora suman el día entero", () => {
    let suma = 0;
    for (let h = 5; h < 22; h += 0.01) suma += hourShare(h) * 0.01;
    expect(suma).toBeCloseTo(1, 1);
    expect(H_INT).toBeGreaterThan(0);
  });
  it("el tráfico simulado se queda entre 0 y 1", () => {
    for (let h = 0; h <= 24; h += 0.5) {
      expect(trafficH(h)).toBeGreaterThanOrEqual(0);
      expect(trafficH(h)).toBeLessThanOrEqual(1);
    }
    expect(trafficH(7)).toBeGreaterThan(trafficH(3));
  });
});

describe("la proyección del mapa", () => {
  it("pone Bucaramanga en el cuadro [0,1] y crece hacia el sur", () => {
    const [x, y] = merc(-73.105, 7.103);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(1);
    expect(y).toBeLessThan(0.5);
    expect(merc(-73.105, 6.9)[1]).toBeGreaterThan(y);
  });
});
