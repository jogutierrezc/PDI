import { describe, expect, it } from "vitest";
import { ALL_INDICATORS, INDICATORS, LAST, RANKINGS, YEARS, categoryById, indicatorChange, indicatorValue, nationalGain, rankingById, rankingIndicators, reports } from "./data";

describe("UDES Sostenible · datos", () => {
  it("cada serie tiene un valor por edición", () => {
    for (const r of RANKINGS) {
      expect(r.world).toHaveLength(YEARS.length);
      expect(r.mid).toHaveLength(YEARS.length);
      expect(r.national).toHaveLength(YEARS.length);
      for (const c of r.categories) expect(c.scores).toHaveLength(YEARS.length);
    }
    for (const k of ALL_INDICATORS) expect(INDICATORS[k].values).toHaveLength(YEARS.length);
  });

  it("los identificadores de subcategoría no se repiten dentro de un ranking", () => {
    for (const r of RANKINGS) expect(new Set(r.categories.map((c) => c.id)).size).toBe(r.categories.length);
  });

  it("los pesos de GreenMetric suman 100", () => {
    const green = rankingById("green")!;
    expect(green.categories.reduce((s, c) => s + (c.weight ?? 0), 0)).toBe(100);
  });

  it("todo indicador citado por una subcategoría existe", () => {
    for (const r of RANKINGS) for (const k of rankingIndicators(r)) expect(INDICATORS[k]).toBeDefined();
  });

  it("los porcentajes por campus no pasan de 100", () => {
    for (const k of ALL_INDICATORS) {
      if (!INDICATORS[k].max) continue;
      for (const c of ["Bucaramanga", "Todos"] as const) expect(indicatorValue(k, c, LAST)).toBeLessThanOrEqual(100);
    }
  });

  it("un consumo que baja cuenta como mejora y un aprovechamiento que baja, no", () => {
    expect(indicatorChange("energia", "Todos", LAST).good).toBe(true);
    expect(indicatorChange("residuos", "Todos", LAST).good).toBe(true);
    expect(indicatorChange("residuos", "Todos", 0)).toEqual({ pct: 0, good: true });
  });

  it("busca rankings y subcategorías, y devuelve undefined si no existen", () => {
    expect(rankingById("impact")?.short).toBe("THE Impact");
    expect(rankingById("nada")).toBeUndefined();
    expect(categoryById(rankingById("impact")!, "o4")?.sdg).toBe(4);
    expect(categoryById(rankingById("impact")!, "x")).toBeUndefined();
  });

  it("calcula los puestos ganados en Colombia y ordena los informes del más nuevo al más viejo", () => {
    expect(nationalGain(rankingById("green")!, LAST)).toBe(9);
    const list = reports();
    expect(list[0].yearIndex).toBe(LAST);
    expect(list.at(-1)!.yearIndex).toBe(LAST - 1);
  });
});
