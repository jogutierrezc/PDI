import { describe, expect, it } from "vitest";
import { cleanKpiModes, firstReported, formatVariation, kpiModeOf, lastReported, pointsUpToCut, variationOf, withKpiMode } from "./kpi-options";
import type { KpiPoint } from "./kpi-options";

const point = (year: number, value: number | null, term: "A" | "B" | null = null): KpiPoint => ({
  year,
  term,
  label: term ? `${year}-${term === "A" ? 1 : 2}` : String(year),
  value,
});

describe("última cifra reportada", () => {
  it("toma la más reciente con dato, aunque haya huecos al final", () => {
    const series = [point(2020, 100), point(2021, null), point(2025, 150), point(2026, null)];
    expect(lastReported(series)?.label).toBe("2025");
    expect(lastReported(series)?.value).toBe(150);
  });

  it("un hueco no se cuenta como cero y sin datos no hay cifra", () => {
    expect(lastReported([point(2024, null), point(2025, null)])).toBeNull();
    expect(lastReported([point(2024, 0), point(2025, null)])?.value).toBe(0);
  });

  it("respeta el rango visible: un corte elegido no ve el futuro", () => {
    const series = [point(2020, 1), point(2023, 3), point(2025, 5)];
    expect(lastReported(pointsUpToCut(series, { year: 2024, term: null }))?.label).toBe("2023");
    expect(lastReported(pointsUpToCut(series, { year: 0, term: null }))?.label).toBe("2025");
  });

  it("por periodo llega hasta ese periodo", () => {
    const series = [point(2024, 1, "A"), point(2024, 2, "B"), point(2025, 3, "A"), point(2025, 4, "B")];
    expect(pointsUpToCut(series, { year: 2025, term: "A" }).map((p) => p.label)).toEqual(["2024-1", "2024-2", "2025-1"]);
  });
});

describe("variación porcentual", () => {
  it("((final − inicial) / inicial) × 100 con la primera y la última cifra reportadas", () => {
    const v = variationOf([point(2019, null), point(2020, 200), point(2022, null), point(2025, 250)]);
    expect(v.reason).toBe("calculada");
    expect(v.pct).toBe(25);
    expect(v.from?.label).toBe("2020");
    expect(v.to?.label).toBe("2025");
  });

  it("baja y se escribe con signo", () => {
    expect(formatVariation(variationOf([point(2020, 200), point(2021, 150)]).pct)).toBe("−25,0 %");
    expect(formatVariation(12.46)).toBe("+12,5 %");
    expect(formatVariation(0)).toBe("0,0 %");
  });

  it("con inicial en cero no inventa el número", () => {
    const v = variationOf([point(2020, 0), point(2025, 40)]);
    expect(v.pct).toBeNull();
    expect(v.reason).toBe("sin-base");
    expect(formatVariation(v.pct)).toBe("—");
  });

  it("un hueco inicial no es cero: la base es la primera cifra reportada", () => {
    expect(variationOf([point(2019, null), point(2020, 10), point(2021, 20)]).pct).toBe(100);
  });

  it("con un solo dato no hay con qué comparar", () => {
    const v = variationOf([point(2020, null), point(2025, 80)]);
    expect(v.pct).toBeNull();
    expect(v.reason).toBe("un-solo-dato");
    expect(v.from).toBe(v.to);
  });

  it("sin datos no hay nada", () => {
    expect(variationOf([point(2020, null)]).reason).toBe("sin-datos");
    expect(firstReported([])).toBeNull();
  });
});

describe("la opción de cada KPI", () => {
  it("sin elección, o con una desconocida, es el promedio", () => {
    expect(kpiModeOf(undefined, "a")).toBe("promedio");
    expect(kpiModeOf({ a: "raro" as never }, "a")).toBe("promedio");
    expect(kpiModeOf({ a: "ultima" }, "a")).toBe("ultima");
  });

  it("solo se guarda lo distinto del promedio; si no queda nada, el bloque queda como estaba", () => {
    expect(cleanKpiModes({ a: "promedio" })).toBeUndefined();
    expect(withKpiMode({ a: "ultima" }, "a", "promedio")).toBeUndefined();
    expect(withKpiMode({ a: "ultima" }, "b", "evolucion")).toEqual({ a: "ultima", b: "evolucion" });
  });
});
