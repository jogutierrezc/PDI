/* =============================================================================
   El portal arma sus lentes con lo que devuelve la base (lens.ts, buildPortal).
   ========================================================================== */

import { describe, expect, it } from "vitest";
import { INSTITUTION, breakdownFor, buildPortal, entitiesOf, resolveScope, statFor } from "../../src/modules/impacto/data/lens";
import type { RawCatalog, RawIndicator, RawRecord, RawStructure } from "../../src/modules/impacto/data/lens";

const sheet: Partial<RawIndicator> = {
  unit: "porcentaje", calc_type: "razon", numerator_def: "Siguen", denominator_def: "Estaban", factor: 100,
  aggregation: "razon_de_sumas", direction: "mayor_mejor", periodicity: "semestral", report_level: "programa_sede",
  applies_degrees: ["pregrado"], capture_mode: "precargado", in_pilot: true, sheet_complete: true,
};

function indicator(code: string, extra: Partial<RawIndicator> = {}): RawIndicator {
  return {
    code, function_id: code.startsWith("E") ? "ensenanza" : code.startsWith("I") ? "investigacion" : "extension",
    level: "procesos", catalog_state: "oficial", name: `Indicador ${code}`, description: "", unit_original: "% estudiantes",
    responsible_original: "VE", source: "Registro", origin: "", unit: null, calc_type: null, numerator_def: null,
    denominator_def: null, factor: null, aggregation: null, direction: null, periodicity: null, report_level: null,
    applies_degrees: [], capture_mode: null, evidence_type: null, evidence_required: false, variation_threshold: "30",
    range_min: null, range_max: null, n_minimum: null, allows_over_one: false, in_pilot: false, sheet_complete: false,
    targets: [], baseline: null, alignments: [], ...extra,
  };
}

const catalog: RawCatalog = {
  version: { id: "v1", number: 3, source_file: "vr7.xlsx", published_at: "2026-09-20T10:00:00Z" },
  indicators: [
    indicator("E04", {
      ...sheet,
      targets: [{ year: 2026, numeric: null, text: "+1 pp vs LB" }, { year: 2028, numeric: "90", text: null }],
      baseline: { year: 2023, value: "86.5" },
      alignments: [{ kind: "pilar", code: "2" }, { kind: "proyecto", code: "Pr3" }, { kind: "ods", code: "4" }, { kind: "dimension", code: "Permanencia" }],
    }),
    indicator("E13", { ...sheet, calc_type: "conteo", factor: 1, aggregation: "suma", report_level: "programa", denominator_def: null }),
    indicator("I20"),
    indicator("X40", { catalog_state: "sugerido" }),
  ],
};

const structure: RawStructure = {
  faculties: [{ id: "f1", slug: "salud", code: "FCMS", name: "Facultad de Salud" }],
  programs: [
    { id: "p1", slug: "medicina", code: "MED", name: "Medicina", faculty_id: "f1", degree_level: "pregrado", modality: "presencial", campus_ids: ["c1", "c2"] },
    { id: "p2", slug: "enfermeria", code: "ENF", name: "Enfermería", faculty_id: "f1", degree_level: "pregrado", modality: "presencial", campus_ids: ["c1"] },
  ],
  campuses: [
    { id: "c1", slug: "bucaramanga", name: "Bucaramanga" },
    { id: "c2", slug: "cucuta", name: "Cúcuta" },
    { id: "c3", slug: "bogota", name: "Bogotá" },
  ],
};

const rec = (code: string, program: string, campus: string | null, period: string, numerator: number, denominator: number | null = null): RawRecord => ({
  code, program_id: program, campus_id: campus, period_code: period, numerator: String(numerator), denominator: denominator === null ? null : String(denominator),
  n_responses: null, num_comparison: null, den_comparison: null,
});

const records: RawRecord[] = [
  rec("E04", "p1", "c1", "2026-1", 450, 500),
  rec("E04", "p1", "c2", "2026-1", 90, 100),
  rec("E04", "p2", "c1", "2026-1", 30, 50),
  rec("E04", "p1", "c1", "2025-2", 400, 500),
  rec("E13", "p1", null, "2026-1", 3),
  rec("E13", "p2", null, "2026-1", 2),
  // Un programa que ya no está en la estructura no rompe nada: se ignora.
  rec("E13", "p9", null, "2026-1", 7),
];

const data = buildPortal(catalog, structure, records);

describe("buildPortal", () => {
  it("lleva la ficha, las metas, la línea base y las alineaciones a la forma del portal", () => {
    const e04 = data.indicatorByCode.get("E04")!;
    expect(e04.ficha).toMatchObject({ tipo: "razon", factor: 100, agregacion: "razon_de_sumas", nivelReporte: "programa_sede", enPiloto: true, umbral: 30 });
    expect(e04.meta).toEqual({ anio: 2026, valor: "+1 pp vs LB" });
    expect(e04.meta2028).toBe("90");
    expect(e04.lineaBase).toBe("86,5");
    expect(e04.lineaBaseAnio).toBe(2023);
    expect(e04).toMatchObject({ pilares: [2], proyectos: ["Pr3"], ods: [4], dimension: "Permanencia" });
    expect(data.indicatorByCode.get("I20")!.ficha).toBeNull();
  });

  it("convierte ids en slugs y descarta lo que no está en la estructura", () => {
    expect(data.records).toHaveLength(6);
    expect(data.records[0]).toMatchObject({ codigo: "E04", program: "medicina", campus: "bucaramanga", numerador: 450, denominador: 500 });
    expect(data.periods).toEqual(["2025-2", "2026-1"]);
    expect(data.programBySlug.get("medicina")).toMatchObject({ faculty: "salud", campus: ["bucaramanga", "cucuta"] });
  });

  it("sin catálogo publicado no hay indicadores ni registros", () => {
    const empty = buildPortal({ version: null, indicators: [] }, structure, records);
    expect(empty.version).toBeNull();
    expect(empty.indicators).toEqual([]);
    expect(empty.records).toEqual([]);
  });
});

describe("lentes y huecos con datos de la base", () => {
  it("la institución consolida por razón de sumas y compara con el periodo anterior", () => {
    const stat = statFor(data, data.indicatorByCode.get("E04")!, INSTITUTION);
    expect(stat.period).toBe("2026-1");
    expect(stat.current).toMatchObject({ numerador: 570, denominador: 650, registros: 3 });
    expect(stat.current!.valor).toBeCloseTo(87.69, 2);
    expect(stat.previousPeriod).toBe("2025-2");
    expect(stat.previous!.valor).toBe(80);
  });

  it("los huecos dicen por qué: sugerido, fuera del piloto, sin desagregar", () => {
    const campus = resolveScope(data, "campus", "bucaramanga")!;
    expect(statFor(data, data.indicatorByCode.get("X40")!, INSTITUTION).gap).toBe("sugerido");
    expect(statFor(data, data.indicatorByCode.get("I20")!, INSTITUTION).gap).toBe("fuera_del_piloto");
    expect(statFor(data, data.indicatorByCode.get("E13")!, campus).gap).toBe("sin_desagregar");
    // En el campus, E04 solo con lo reportado en Bucaramanga: (450 + 30) ÷ (500 + 50).
    expect(statFor(data, data.indicatorByCode.get("E04")!, campus).current).toMatchObject({ numerador: 480, denominador: 550 });
  });

  it("una sede sin programas no aparece en la lente de campus", () => {
    expect(entitiesOf(data, "campus").map((c) => c.slug)).toEqual(["bucaramanga", "cucuta"]);
    expect(entitiesOf(data, "facultad")[0]).toMatchObject({ slug: "salud", detail: "2 programas" });
  });

  it("el reparto de un programa va por sede solo si el indicador se reporta por sede", () => {
    const program = resolveScope(data, "programa", "medicina")!;
    expect(breakdownFor(data, data.indicatorByCode.get("E04")!, program).map((p) => [p.label, p.stat.current?.valor])).toEqual([
      ["Bucaramanga", 90],
      ["Cúcuta", 90],
    ]);
    expect(breakdownFor(data, data.indicatorByCode.get("E13")!, program)).toEqual([]);
  });
});
