import { describe, expect, it } from "vitest";
import { formatBig, isBig, splitBig } from "./big-numbers";

const plain = (value: number) => `n${value}`;

describe("cifras grandes en las gráficas", () => {
  it("por debajo del millón no cambia nada", () => {
    expect(splitBig(999_999)).toBeNull();
    expect(formatBig(950_000, plain)).toBe("n950000");
    expect(formatBig(0, plain)).toBe("n0");
    expect(isBig(null)).toBe(false);
  });

  it("millones", () => {
    expect(formatBig(1_500_000, plain)).toBe("1,5 M");
    expect(formatBig(250_000_000, plain)).toBe("250 M");
    expect(splitBig(4_000_000)).toEqual({ text: "4", short: "M", long: "millones" });
  });

  it("miles de millones, que es donde se rompían las gráficas", () => {
    expect(formatBig(12_345_678_901, plain)).toBe("12,3 mil M");
    expect(splitBig(785_400_000_000)).toEqual({ text: "785,4", short: "mil M", long: "miles de millones" });
  });

  it("billones, en escala larga", () => {
    expect(formatBig(3_200_000_000_000, plain)).toBe("3,2 bill.");
    expect(splitBig(1e12)?.long).toBe("billones");
  });

  it("sube de escala cuando el redondeo llega a mil", () => {
    expect(formatBig(999_960_000, plain)).toBe("1 mil M");
    expect(formatBig(999_999_999_999, plain)).toBe("1 bill.");
  });

  it("conserva el signo", () => {
    expect(formatBig(-2_500_000_000, plain)).toBe("-2,5 mil M");
  });
});
