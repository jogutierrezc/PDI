import { describe, expect, it } from "vitest";
import { cutTable, showsTotal, sumOfParts, totalAdvice } from "./breakdown-total";
import { breakdownToTable, toCsvText } from "./csv-export";
import type { Breakdown } from "./types";

const breakdown = (over: Partial<Breakdown> = {}): Breakdown => ({
  id: "sexo",
  title: "Matrícula por sexo",
  unit: "estudiantes",
  format: "entero",
  source: "Registro",
  values: { 2024: [{ label: "Mujeres", value: 60 }, { label: "Hombres", value: 40 }] },
  ...over,
});

const cuts = [
  { label: "2023", values: [50, 30] },
  { label: "2024", values: [60, null] },
  { label: "2025", values: [null, null] },
];

describe("valor de partida", () => {
  it("un desglose que no trae la opción queda con total", () => {
    expect(showsTotal(breakdown())).toBe(true);
    expect(showsTotal(breakdown({ showTotal: undefined }))).toBe(true);
  });

  it("solo se apaga cuando se guardó apagado", () => {
    expect(showsTotal(breakdown({ showTotal: true }))).toBe(true);
    expect(showsTotal(breakdown({ showTotal: false }))).toBe(false);
  });
});

describe("tabla «Ver datos por corte»", () => {
  it("con total: una columna Total con la suma de las categorías con dato", () => {
    const table = cutTable(["Mujeres", "Hombres"], cuts, true);
    expect(table.header).toEqual(["Corte", "Mujeres", "Hombres", "Total"]);
    expect(table.rows.map((row) => row.total)).toEqual([80, 60, null]);
  });

  it("sin total: ni la columna ni la suma", () => {
    const table = cutTable(["Mujeres", "Hombres"], cuts, false);
    expect(table.header).toEqual(["Corte", "Mujeres", "Hombres"]);
    expect(table.rows.every((row) => !("total" in row))).toBe(true);
    expect(table.rows.map((row) => row.values)).toEqual(cuts.map((cut) => cut.values));
  });

  it("un corte sin ninguna categoría reportada no suma cero", () => {
    expect(sumOfParts([null, null])).toBeNull();
    expect(sumOfParts([0, null])).toBe(0);
  });
});

describe("CSV del desglose", () => {
  it("no lleva total, ni con la opción encendida ni apagada", () => {
    for (const showTotal of [undefined, true, false]) {
      const table = breakdownToTable(breakdown({ showTotal }));
      expect(table.rows).toHaveLength(2);
      expect(toCsvText(table)).not.toMatch(/total/i);
    }
  });

  it("la opción no cambia el archivo", () => {
    expect(toCsvText(breakdownToTable(breakdown({ showTotal: false })))).toBe(toCsvText(breakdownToTable(breakdown())));
  });
});

describe("sugerencia en la intranet", () => {
  it("avisa en porcentajes y promedios", () => {
    expect(totalAdvice({ unit: "%", format: "decimal" })).toMatch(/porcentaje/);
    expect(totalAdvice({ unit: "tasa", format: "porcentaje" })).toMatch(/porcentaje/);
    expect(totalAdvice({ unit: "puntos", format: "decimal", annualRule: "promedio" })).toMatch(/promedio/);
  });

  it("no dice nada cuando sumar tiene sentido", () => {
    expect(totalAdvice({ unit: "estudiantes", format: "entero", annualRule: "suma" })).toBeNull();
    expect(totalAdvice({ unit: "estudiantes", format: "entero" })).toBeNull();
  });
});
