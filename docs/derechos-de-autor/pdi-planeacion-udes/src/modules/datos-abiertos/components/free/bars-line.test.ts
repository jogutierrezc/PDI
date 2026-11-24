import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { viewProblems } from "../../data/free-sets";
import type { FreeSet, FreeView } from "../../data/free-sets";
import { FreeChart, FreeChartEnv } from "./FreeCharts";

// Convocatorias de investigación: una fila por convocatoria y año.
const set: FreeSet = {
  id: "convocatorias",
  title: "Convocatorias de investigación",
  description: "",
  source: "Vicerrectoría de Investigaciones",
  temporality: "anual",
  periodLabel: "",
  columns: [
    { key: "conv", label: "Convocatoria", kind: "texto" },
    { key: "proy", label: "No. de proyectos", kind: "cifra", format: "entero" },
    { key: "pres", label: "Presupuesto ejecutado", kind: "cifra", format: "entero", unit: "COP" },
  ],
  rows: [
    { year: 2023, kind: "dato", label: "", cells: { conv: "Interna", proy: 12, pres: 300_000_000 } },
    { year: 2023, kind: "dato", label: "", cells: { conv: "Externa", proy: 4, pres: 250_000_000 } },
    { year: 2024, kind: "dato", label: "", cells: { conv: "Interna", proy: 18, pres: 450_000_000 } },
    { year: 2024, kind: "dato", label: "", cells: { conv: "Externa", proy: 6, pres: 380_000_000 } },
  ],
  views: [],
};
const view: FreeView = { key: "v", title: "Inversión y proyectos", type: "barras_linea", category: "conv", series: ["pres", "proy"] };

const draw = (v: FreeView) =>
  renderToStaticMarkup(createElement(FreeChartEnv, { value: { width: 680, still: true } }, createElement(FreeChart, { set, view: v, year: null })));

describe("gráfica de barras y línea", () => {
  it("valida que tenga dos cifras distintas", () => {
    expect(viewProblems(set, view)).toEqual([]);
    expect(viewProblems(set, { ...view, series: ["pres"] })).toHaveLength(1);
    expect(viewProblems(set, { ...view, series: ["pres", "pres"] })).toHaveLength(1);
  });

  it("dibuja las barras por convocatoria, la línea de proyectos y su eje derecho", () => {
    const html = draw(view);
    expect(html).toContain("<polyline");
    // Proyectos por año, sobre los puntos: 16 en 2023 y 24 en 2024.
    expect(html).toMatch(/>16</);
    expect(html).toMatch(/>24</);
    // Leyenda: las convocatorias y la línea.
    expect(html).toContain("Interna");
    expect(html).toContain("Externa");
    expect(html).toContain("No. de proyectos (línea, eje derecho)");
    // Tabla para lectores de pantalla con el total del año: 830.000.000 en 2024.
    expect(html).toContain("830.000.000");
  });
});
