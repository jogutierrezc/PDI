import { describe, expect, it } from "vitest";
import {
  campusFigures,
  chainCoverage,
  chainSummary,
  facultyOf,
  functionLinks,
  goalStates,
  linksNote,
  matrixNote,
  programChain,
  programNote,
  riverCounts,
  valueMatrix,
} from "./analysis";
import { toPortalData } from "./data";

const ind = (id: string, code: string, fn: string, stage: string, dimension_id: string | null, extra: object = {}) => ({
  id,
  code,
  fn,
  stage,
  dimension_id,
  name: code,
  suggested: false,
  ...extra,
});

/** Una universidad de juguete: dos dimensiones de Investigación y una de Extensión. */
const data = toPortalData({
  dimensions: [
    { id: "d-ici", fn: "investigacion", name: "Investigación, creación e innovación", position: 1 },
    { id: "d-asc", fn: "investigacion", name: "Apropiación social", position: 2 },
    { id: "d-mt", fn: "extension", name: "Microsocial territorial", position: 1 },
  ],
  indicators: [
    ind("i1", "I01", "investigacion", "insumos", "d-ici"),
    ind("i2", "I02", "investigacion", "procesos", "d-ici"),
    ind("i3", "I03", "investigacion", "productos", "d-ici"),
    ind("i4", "I04", "investigacion", "impacto", "d-ici", { target_2026_num: 80 }),
    ind("i5", "I05", "investigacion", "productos", "d-asc"),
    ind("i6", "I06", "investigacion", "impacto", "d-asc", { target_2026_num: 10 }),
    ind("i7", "I07", "investigacion", "impacto", null),
    ind("x1", "X01", "extension", "procesos", "d-mt"),
    ind("x2", "X02", "extension", "impacto", "d-mt", { target_2026: "+2 pp vs LB" }),
  ],
  // I02 también cuenta como proceso de Apropiación social.
  refs: [{ indicator_id: "i2", dimension_id: "d-asc", stage: "procesos", note: "" }],
  alignments: [
    { indicator_id: "i1", target: "ods", sdg: 9 },
    { indicator_id: "i4", target: "ods", sdg: 9 },
    { indicator_id: "x1", target: "ods", sdg: 9 },
    { indicator_id: "x2", target: "ods", sdg: 11 },
  ],
  pillars: [],
  units: [
    { id: "fac", parent_id: null, kind: "facultad", code: "FI", name: "Ingenierías", slug: "ingenierias" },
    { id: "esc", parent_id: "fac", kind: "otra", code: "ES", name: "Escuela", slug: "escuela" },
    { id: "sis", parent_id: "esc", kind: "programa", code: "SIS", name: "Sistemas", slug: "sistemas" },
  ],
  campuses: [
    { id: "bga", slug: "bucaramanga", name: "Bucaramanga" },
    { id: "cuc", slug: "cucuta", name: "Cúcuta" },
  ],
  offer: [
    { program_id: "sis", campus_id: "bga" },
    { program_id: "sis", campus_id: "cuc" },
  ],
  adoptions: [
    { indicator_id: "i1", program_id: "sis", campus_id: "bga" },
    { indicator_id: "i4", program_id: "sis", campus_id: "bga" },
    { indicator_id: "i4", program_id: "sis", campus_id: "cuc" },
  ],
  program_indicators: [{ id: "p1", code: "P-SIS-BGA-001", fn: "investigacion", stage: "procesos", program_id: "sis", campus_id: "bga" }],
  values: [
    { indicator_id: "i4", year: 2025, program_id: null, campus_id: null, value_num: 84 },
    { indicator_id: "i6", year: 2024, program_id: null, campus_id: null, value_num: 4 },
    { indicator_id: "i4", year: 2025, program_id: "sis", campus_id: "bga", value_num: 70 },
    { indicator_id: "i4", year: 2024, program_id: "sis", campus_id: "cuc", value_num: 60 },
    { indicator_id: "i4", year: 2025, program_id: "sis", campus_id: "cuc", not_applicable: true },
  ],
});

describe("la matriz de cadena de valor", () => {
  it("cuenta por dimensión y eslabón, suma los antecedentes de otra dimensión y aparta lo que no tiene dimensión", () => {
    const rows = valueMatrix(data, "investigacion");
    expect(rows.map((r) => r.name)).toEqual(["Investigación, creación e innovación", "Apropiación social", "Sin dimensión asignada"]);
    expect(rows[0].complete).toBe(true);
    const asc = rows[1];
    expect(asc.cells.find((c) => c.stage === "procesos")).toMatchObject({ count: 0, refs: 1 });
    expect(asc.missing).toEqual(["insumos"]);
    expect(rows[2]).toMatchObject({ unassigned: true, total: 1 });
  });

  it("resume cuántas cadenas están completas en toda la universidad", () => {
    expect(chainSummary(data)).toEqual({ dimensions: 3, complete: 1 });
  });

  it("Pilo señala la cadena rota más seria", () => {
    const note = matrixNote(valueMatrix(data, "investigacion"), "investigacion");
    expect(note.mood).toBe("cuidado");
    expect(note.lines[0]).toMatch(/Apropiación social no tiene insumos\. Está rota al comienzo/);
  });
});

describe("el río y los lazos", () => {
  it("el hilo cuenta solo las fichas con alguna cifra", () => {
    const counts = riverCounts(data);
    expect(counts.investigacion.impacto).toEqual({ total: 3, data: 2 });
    expect(counts.extension.impacto).toEqual({ total: 1, data: 0 });
  });

  it("el lazo suma, por cada ODS, el menor de los dos conteos", () => {
    const [strong] = functionLinks(data);
    expect(strong).toMatchObject({ a: "investigacion", b: "extension", score: 1 });
    expect(strong.shared).toEqual([{ label: "ODS 9", count: 1 }]);
    expect(linksNote(functionLinks(data)).lines[1]).toMatch(/Investigación–Extensión \(1\)/);
  });
});

describe("la cadena de un programa", () => {
  it("la facultad se encuentra aunque haya una unidad en medio", () => {
    expect(facultyOf(data.units, "sis")?.name).toBe("Ingenierías");
  });

  it("suma lo adoptado y lo propio, y se puede mirar por sede", () => {
    const all = programChain(data, "sis");
    expect(all.investigacion.procesos).toEqual(["P-SIS-BGA-001"]);
    expect(chainCoverage(all, "investigacion")).toMatchObject({ covered: 3, missing: ["productos"] });
    const cuc = programChain(data, "sis", "cuc");
    expect(chainCoverage(cuc, "investigacion").covered).toBe(1);
    expect(chainCoverage(cuc, "extension").connected).toBe(false);
  });

  it("Pilo dice qué eslabón falta y con qué función no se conecta", () => {
    const note = programNote("Sistemas", programChain(data, "sis"));
    expect(note.lines[0]).toBe("En Investigación le falta productos.");
    expect(note.lines[1]).toBe("No se conecta con Enseñanza ni con Extensión.");
  });
});

describe("los resultados", () => {
  it("cada meta queda cumplida, en camino, sin cifra o sin número", () => {
    const i = data.indicators;
    expect(goalStates(data, [i[3], i[5], i[8], i[0]])).toEqual({ cumplida: 1, en_camino: 1, sin_cifra: 0, sin_meta: 2 });
  });

  it("por sede toma la última cifra de cada programa, sin contar las que no aplican", () => {
    const rows = campusFigures(data, "i4", new Set(["sis"]));
    expect(rows.find((r) => r.campus.id === "bga")).toMatchObject({ value: 70, year: 2025, from: "programas" });
    expect(rows.find((r) => r.campus.id === "cuc")).toMatchObject({ value: 60, year: 2024 });
  });
});
