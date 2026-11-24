/* Las tablas personalizadas en el boletín: tienen que poder elegirse en
   «Contenido» y tienen que llegar al papel, también en un boletín que ya
   estaba guardado antes de que existiera la tabla. */

import { describe, expect, it } from "vitest";
import { datasetRefs, normalizeSettings } from "./model";
import { freeUnits, parseFreeKey } from "./free";
import type { FreeSet } from "../datos-abiertos/data/free-sets";
import type { OpenDataCatalog, Report } from "../datos-abiertos/data/types";

const table = (over: Partial<FreeSet> = {}): FreeSet => ({
  id: "metas",
  uuid: "00000000-0000-4000-8000-000000000001",
  title: "Metas del plan",
  description: "",
  source: "Planeación",
  officeId: null,
  temporality: "sin_tiempo",
  periodLabel: "",
  columns: [
    { key: "meta", label: "Meta", kind: "texto" },
    { key: "avance", label: "Avance", kind: "cifra", format: "porcentaje" },
  ],
  views: [{ key: "tabla", type: "tabla", title: "Tabla", table: { cut: "Corte a 30 de junio de 2026" } }],
  rows: [
    { year: null, kind: "dato", label: "", cells: { meta: "Acreditación", avance: 80 } },
    { year: null, kind: "total", label: "", cells: { meta: "Total", avance: 80 } },
  ],
  ...over,
} as FreeSet);

const report = (freeSets: FreeSet[]): Report => ({
  slug: "plan",
  code: "PL",
  name: "Plan de desarrollo",
  summary: "",
  description: "",
  image: { src: "", alt: "", credit: "" },
  line: 1,
  keyIndicators: [],
  indicators: [],
  breakdowns: [],
  freeSets,
});

const catalog = (r: Report): OpenDataCatalog => ({
  years: [2024, 2025],
  currentYear: 2025,
  campuses: [{ id: "todas", name: "Todos" }],
  illustrative: false,
  cutoffDate: "2025-12-31",
  reports: [r],
});

const REF = "libre:metas:tabla";
const units = (r: Report, cut = 2025) => {
  const parsed = parseFreeKey(r, REF.slice(6));
  return parsed ? freeUnits(parsed.set, parsed.view, cut, () => null, () => null) : null;
};

describe("la tabla personalizada en el boletín", () => {
  it("se ofrece en «Contenido» y entra marcada en un boletín nuevo", () => {
    const r = report([table()]);
    expect(datasetRefs(r)).toEqual([{ ref: REF, title: "Metas del plan · Tabla" }]);
    expect(normalizeSettings({}, catalog(r)).reports[0].datasets).toEqual([{ ref: REF, include: true }]);
  });

  it("aparece también en un boletín que ya estaba guardado sin ella", () => {
    const r = report([table()]);
    const saved = { reports: [{ slug: "plan", include: true, indicators: [], datasets: [] }] };
    expect(normalizeSettings(saved, catalog(r)).reports[0].datasets).toEqual([{ ref: REF, include: true }]);
  });

  it("llega al papel con sus filas, sea cual sea el corte del boletín", () => {
    const r = report([table()]);
    expect(units(r)).toHaveLength(1);
    // Una tabla solo con título y total (sin filas de dato) también se imprime.
    const bare = report([table({ rows: [{ year: null, kind: "total", label: "", cells: { meta: "Total", avance: 80 } }] } as Partial<FreeSet>)]);
    expect(datasetRefs(bare).map((d) => d.ref)).toEqual([REF]);
    expect(units(bare)).toHaveLength(1);
  });

  it("anual: se ofrece, y se imprime con las filas del año del corte", () => {
    const yearly = table({
      temporality: "anual",
      rows: [
        { year: 2024, kind: "dato", label: "", cells: { meta: "Acreditación", avance: 60 } },
        { year: 2025, kind: "dato", label: "", cells: { meta: "Acreditación", avance: 80 } },
      ],
    } as Partial<FreeSet>);
    const r = report([yearly]);
    expect(datasetRefs(r).map((d) => d.ref)).toEqual([REF]);
    expect(units(r, 2025)).toHaveLength(1);
    expect(units(r, 2024)).toHaveLength(1);
  });

  it("sin filas no hay nada que imprimir: no se ofrece", () => {
    expect(datasetRefs(report([table({ rows: [] })]))).toEqual([]);
  });
});
