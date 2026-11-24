import { describe, expect, it } from "vitest";
import { toPortalData } from "../portal/data";
import { programsOf } from "../portal/analysis";
import { programBulletin, vicerrectoriaBulletin } from "./content";

const data = toPortalData({
  indicators: [
    { id: "i1", code: "I01", fn: "investigacion", stage: "insumos", name: "Semilleros", target_2026_num: 100 },
    { id: "i2", code: "I02", fn: "investigacion", stage: "productos", name: "Artículos", target_2026_num: 10 },
    { id: "e1", code: "E01", fn: "ensenanza", stage: "procesos", name: "Tutorías", target_2026_num: 50 },
  ],
  program_indicators: [{ id: "p1", code: "P-ENF-BGA-001", fn: "ensenanza", stage: "productos", name: "Tutorías entre pares", program_id: "enf", campus_id: "bga", target_2026_num: 20 }],
  units: [
    { id: "vi", parent_id: null, kind: "vicerrectoria", code: "VI", name: "Vicerrectoría de Investigaciones", slug: "vi" },
    { id: "fac", parent_id: null, kind: "facultad", code: "FS", name: "Salud", slug: "salud" },
    { id: "enf", parent_id: "fac", kind: "programa", code: "ENF", name: "Enfermería", slug: "enfermeria" },
    { id: "med", parent_id: "fac", kind: "programa", code: "MED", name: "Medicina", slug: "medicina" },
  ],
  unit_functions: [{ unit_id: "vi", fn: "investigacion" }],
  campuses: [{ id: "bga", slug: "bucaramanga", name: "Bucaramanga" }],
  offer: [
    { program_id: "enf", campus_id: "bga" },
    { program_id: "med", campus_id: "bga" },
  ],
  adoptions: [
    { indicator_id: "i1", program_id: "enf", campus_id: "bga" },
    { indicator_id: "e1", program_id: "enf", campus_id: "bga" },
    { indicator_id: "i1", program_id: "med", campus_id: "bga" },
    { indicator_id: "i2", program_id: "med", campus_id: "bga" },
  ],
  values: [
    { indicator_id: "i1", year: 2025, program_id: null, campus_id: null, value_num: 120 },
    { indicator_id: "i1", year: 2025, program_id: "enf", campus_id: "bga", value_num: 60 },
    { indicator_id: "i1", year: 2025, program_id: "med", campus_id: "bga", value_num: 110 },
    { indicator_id: "e1", year: 2024, program_id: "enf", campus_id: "bga", value_num: 40 },
    { indicator_id: "p1", year: 2025, program_id: "enf", campus_id: "bga", value_num: 25 },
  ],
});

describe("el boletín de una vicerrectoría", () => {
  const b = vicerrectoriaBulletin(data, "investigacion");

  it("toma el nombre de la vicerrectoría dueña y todos sus indicadores, con la cifra de la UDES", () => {
    expect(b.unitName).toBe("Vicerrectoría de Investigaciones");
    expect(b.table.map((r) => [r.indicator.code, r.pct, r.standing, r.spread?.adopters ?? 0, r.share])).toEqual([
      ["I01", 120, "cumplida", 2, 50],
      ["I02", null, "sin_cifra", 1, 0],
    ]);
    expect(b.kpis).toMatchObject({ indicators: 2, chosen: 2, adopting: 2, reporting: 2, udesMeasured: 1, udesMet: ["Semilleros"] });
    expect(b.cut).toBe(2025);
  });

  it("suma por facultad y le pasa a la IA solo cifras que están en el boletín", () => {
    expect(b.faculties[0]).toMatchObject({ name: "Toda la UDES", programs: 2, total: true });
    expect(b.faculties[1]).toMatchObject({ name: "Salud", programs: 2 });
    expect(b.sections[0].text).toContain("I01 Semilleros (Insumos): cifra UDES 120 (2025); meta 2026 sin número; avance 120 %; cumplida; 2 programas lo eligieron; 50 % de ellos cumple su meta.");
  });
});

describe("el boletín de un programa", () => {
  const program = programsOf(data).find((p) => p.slug === "enfermeria")!;
  const b = programBulletin(data, program, null);

  it("separa las fichas institucionales de los indicadores propios", () => {
    expect(b.institutional.map((r) => r.indicator.code)).toEqual(["I01", "E01"]);
    expect(b.own.map((r) => [r.indicator.code, r.pct, r.standing])).toEqual([["P-ENF-BGA-001", 125, "cumplida"]]);
    expect(b.allCounts.cumplida).toBe(1);
    expect(b.campusNames).toEqual(["Bucaramanga"]);
  });

  it("trae su mapa de red y la lectura sin IA de respaldo", () => {
    expect(b.network.nodes).toHaveLength(3);
    expect(b.note.lines[0]).toBe("Enfermería cumple 0 de sus 2 metas con número.");
    expect(b.sections.map((s) => s.title)).toEqual(["Fichas institucionales que sigue Enfermería", "Indicadores propios de Enfermería", "Resumen del programa"]);
  });
});
