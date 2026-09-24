import { describe, expect, it } from "vitest";
import { changeText, heatmapCompare, signed } from "./heatmap-compare";
import type { HeatmapData } from "./types";

const base: HeatmapData = {
  id: "h",
  title: "Matrícula",
  description: "",
  rowLabel: "Facultad",
  columnLabel: "Años",
  rows: ["Ingeniería", "Salud"],
  columns: ["2020", "2021", "2025"],
  values: [
    [120, 150, 180],
    [90, null, 81],
  ],
  unit: "estudiantes",
  format: "entero",
  source: "",
  emptyMeaning: "Sin reporte",
};

describe("comparativa del mapa de calor", () => {
  it("compara la primera y la última columna, con total en una matriz de conteos", () => {
    const c = heatmapCompare(base)!;
    expect([c.fromLabel, c.toLabel, c.points]).toEqual(["2020", "2025", false]);
    expect(c.rows.map((r) => [r.label, r.from, r.to, r.diff, r.change])).toEqual([
      ["Ingeniería", 120, 180, 60, 50],
      ["Salud", 90, 81, -9, -10],
      ["Total", 210, 261, 51, expect.closeTo(24.29, 2)],
    ]);
  });

  it("salta las columnas sin dato y no suma tasas", () => {
    const c = heatmapCompare({ ...base, unit: "%", format: "porcentaje", values: [[null, 10, 12], [null, 20, null]] })!;
    expect([c.fromLabel, c.toLabel, c.points]).toEqual(["2021", "2025", true]);
    expect(c.rows).toHaveLength(2);
    expect(c.rows[1]).toMatchObject({ from: 20, to: null, diff: null, change: null });
  });

  it("no compara con una sola columna con dato, ni divide por cero", () => {
    expect(heatmapCompare({ ...base, values: [[1, null, null], [2, null, null]] })).toBeNull();
    expect(heatmapCompare({ ...base, values: [[0, 0, 5], [1, 1, 1]] })!.rows[0].change).toBeNull();
  });

  it("escribe el signo y la flecha", () => {
    expect(signed(60, "entero")).toBe("+60");
    expect(signed(-9, "entero")).toBe("−9");
    expect(changeText(null)).toBe("—");
    expect(changeText(-10)).toMatch(/^▼ −10/);
  });
});
