import { describe, expect, it } from "vitest";
import { breakdownModeOf, cleanBreakdownModes, readBreakdown, withBreakdownMode } from "./kpi-options";
import type { BreakdownCut } from "./kpi-options";

const cuts: BreakdownCut[] = [
  { label: "2020-1", items: [{ label: "Titular", value: 100 }, { label: "Auxiliar", value: 0 }, { label: "Nuevo", value: null }] },
  { label: "2024-2", items: [{ label: "Titular", value: 120 }, { label: "Auxiliar", value: 5 }, { label: "Nuevo", value: 10 }] },
  { label: "2025-2", items: [{ label: "Titular", value: 150 }, { label: "Auxiliar", value: null }, { label: "Nuevo", value: 15 }] },
];
const labels = ["Titular", "Auxiliar", "Nuevo"];

describe("lectura de un desglose en todo el periodo", () => {
  it("el promedio no cambia nada", () => {
    expect(readBreakdown(cuts, labels, "promedio")).toBeNull();
    expect(breakdownModeOf(undefined, "a")).toBe("promedio");
    expect(breakdownModeOf({ a: "ultima" }, "a")).toBe("ultima");
  });

  it("guarda solo lo distinto del promedio", () => {
    expect(cleanBreakdownModes({ a: "promedio" })).toBeUndefined();
    expect(withBreakdownMode({ a: "ultima" }, "a", "promedio")).toBeUndefined();
    expect(withBreakdownMode({ a: "ultima" }, "b", "variacion")).toEqual({ a: "ultima", b: "variacion" });
  });

  it("última cifra: cada categoría su cifra más reciente; un hueco no es cero", () => {
    const r = readBreakdown(cuts, labels, "ultima")!;
    expect(r.items.map((i) => [i.label, i.value, i.at])).toEqual([
      ["Titular", 150, "2025-2"],
      ["Auxiliar", 5, "2024-2"],
      ["Nuevo", 15, "2025-2"],
    ]);
    expect(r.caption).toContain("2025-2");
    expect(r.caption).toContain("corte anterior");
  });

  it("última cifra: sin datos queda null", () => {
    const r = readBreakdown([{ label: "2025-1", items: [{ label: "A", value: null }] }], ["A"], "ultima")!;
    expect(r.items[0].value).toBeNull();
    expect(r.caption).toBe("última cifra · sin cifras");
  });

  it("última cifra: una celda reservada es la más reciente y no se lee", () => {
    const r = readBreakdown(
      [{ label: "1", items: [{ label: "A", value: 9 }] }, { label: "2", items: [{ label: "A", value: null, reserved: true }] }],
      ["A"],
      "ultima",
    )!;
    expect(r.items[0]).toMatchObject({ value: null, reserved: true, at: "2" });
  });

  it("variación: (final − inicial) / inicial con la primera cifra de cada categoría", () => {
    const r = readBreakdown(cuts, labels, "variacion")!;
    expect(r.items[0].value).toBeCloseTo(50);
    expect(r.items[1].value).toBeNull(); // un hueco al final y 5 como única cifra tras el 0: inicial 0, sin base
    expect(r.items[2].value).toBeCloseTo(50); // inicial 2024-2, no 2020-1
    expect(r.items[2].from).toBe("2024-2");
    expect(r.caption).toBe("variación 2020-1 → 2025-2");
  });

  it("variación: una sola cifra no inventa porcentaje", () => {
    const r = readBreakdown([{ label: "1", items: [{ label: "A", value: 4 }] }], ["A"], "variacion")!;
    expect(r.items[0].value).toBeNull();
  });
});
