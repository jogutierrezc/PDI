import { describe, expect, it } from "vitest";
import { toPortalData } from "./data";
import { programsOf } from "./analysis";
import {
  boxOf,
  countStandings,
  gridOf,
  groupStandingNote,
  median,
  metShare,
  programStandingNote,
  programStandings,
  spreads,
  stageCounts,
  standingOf,
  standingsOf,
} from "./standing";

const ind = (id: string, code: string, stage: string, extra: object = {}) => ({ id, code, fn: "investigacion", stage, name: `Indicador ${code}`, ...extra });

/** Dos programas de una facultad, en dos sedes. */
const data = toPortalData({
  indicators: [
    ind("a", "A", "insumos", { target_2026_num: 100 }),
    ind("b", "B", "productos", { target_2026_num: 10 }),
    ind("c", "C", "impacto", { target_2026_num: 20 }),
    ind("d", "D", "procesos", { target_2026: "Alta" }),
    ind("e", "E", "procesos", { target_2026_num: 10, direction: "baja" }),
  ],
  units: [
    { id: "fac", parent_id: null, kind: "facultad", code: "FS", name: "Salud", slug: "salud" },
    { id: "enf", parent_id: "fac", kind: "programa", code: "ENF", name: "Enfermería", slug: "enfermeria" },
    { id: "med", parent_id: "fac", kind: "programa", code: "MED", name: "Medicina", slug: "medicina" },
  ],
  campuses: [
    { id: "bga", slug: "bucaramanga", name: "Bucaramanga" },
    { id: "cuc", slug: "cucuta", name: "Cúcuta" },
  ],
  offer: [
    { program_id: "enf", campus_id: "bga" },
    { program_id: "enf", campus_id: "cuc" },
    { program_id: "med", campus_id: "bga" },
  ],
  adoptions: [
    // A: meta propia por sede (80 y 120 → 100 en promedio).
    { indicator_id: "a", program_id: "enf", campus_id: "bga", target_2026_num: 80 },
    { indicator_id: "a", program_id: "enf", campus_id: "cuc", target_2026_num: 120 },
    { indicator_id: "b", program_id: "enf", campus_id: "bga" },
    { indicator_id: "c", program_id: "enf", campus_id: "bga" },
    { indicator_id: "d", program_id: "enf", campus_id: "bga" },
    { indicator_id: "e", program_id: "enf", campus_id: "bga" },
    { indicator_id: "a", program_id: "med", campus_id: "bga" },
    { indicator_id: "b", program_id: "med", campus_id: "bga" },
  ],
  values: [
    { indicator_id: "a", year: 2024, program_id: "enf", campus_id: "bga", value_num: 70 },
    { indicator_id: "a", year: 2025, program_id: "enf", campus_id: "bga", value_num: 90 },
    { indicator_id: "a", year: 2025, program_id: "enf", campus_id: "cuc", value_num: 110 },
    { indicator_id: "b", year: 2025, program_id: "enf", campus_id: "bga", value_num: 5 },
    { indicator_id: "c", year: 2025, program_id: "enf", campus_id: "bga", not_applicable: true },
    { indicator_id: "e", year: 2025, program_id: "enf", campus_id: "bga", value_num: 12.5 },
    { indicator_id: "a", year: 2025, program_id: "med", campus_id: "bga", value_num: 130 },
    { indicator_id: "b", year: 2025, program_id: "med", campus_id: "bga", value_num: 9 },
  ],
});

const byCode = (rows: ReturnType<typeof programStandings>) => Object.fromEntries(rows.map((r) => [r.indicator.code, r]));

describe("el estado de un indicador", () => {
  it("cumplida desde el 100 %, en camino desde el 70 %, rezagada por debajo; sin meta o sin cifra aparte", () => {
    expect(standingOf(100, true)).toBe("cumplida");
    expect(standingOf(70, true)).toBe("en_camino");
    expect(standingOf(69, true)).toBe("rezagada");
    expect(standingOf(null, true)).toBe("sin_cifra");
    expect(standingOf(50, false)).toBe("sin_meta");
  });

  it("la mediana y la caja interpolan entre posiciones", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2, 10])).toBe(2.5);
    expect(boxOf([0, 10, 20, 30, 40])).toEqual({ min: 0, q1: 10, median: 20, q3: 30, max: 40 });
  });
});

describe("los indicadores de un programa", () => {
  it("sin sede: promedia la última cifra de cada sede y las metas que fijó por sede", () => {
    const rows = byCode(programStandings(data, "enf"));
    expect(rows.A).toMatchObject({ value: 100, target: 100, pct: 100, standing: "cumplida", campuses: 2, reportedCampuses: 2 });
    expect(rows.A.trend).toEqual([
      { year: 2024, value: 70 },
      { year: 2025, value: 100 },
    ]);
  });

  it("con sede: solo esa sede y su meta", () => {
    const rows = byCode(programStandings(data, "enf", "bga"));
    expect(rows.A).toMatchObject({ value: 90, target: 80, pct: 113, standing: "cumplida" });
  });

  it("sin meta propia usa la de la ficha; lo que no aplica no es cifra; lo que baja se invierte", () => {
    const rows = byCode(programStandings(data, "enf"));
    expect(rows.B).toMatchObject({ target: 10, pct: 50, standing: "rezagada" });
    expect(rows.C).toMatchObject({ value: null, standing: "sin_cifra" });
    expect(rows.D.standing).toBe("sin_meta");
    expect(rows.E).toMatchObject({ pct: 80, standing: "en_camino" });
  });

  it("ordena por atención: rezagados, sin cifra, en camino, cumplidos, sin meta", () => {
    expect(programStandings(data, "enf").map((r) => r.indicator.code)).toEqual(["B", "C", "E", "A", "D"]);
  });

  it("cuenta estados, metas cumplidas y eslabones", () => {
    const rows = programStandings(data, "enf");
    const c = countStandings(rows);
    expect(c).toEqual({ rezagada: 1, sin_cifra: 1, en_camino: 1, cumplida: 1, sin_meta: 1 });
    expect(metShare(c)).toBe(25);
    expect(stageCounts(rows).investigacion).toEqual({ insumos: 1, procesos: 2, productos: 1, impacto: 1 });
  });

  it("Pilo dice cuántas cumple, qué preocupa y qué falta", () => {
    const note = programStandingNote("Enfermería", programStandings(data, "enf"));
    expect(note.mood).toBe("cuidado");
    expect(note.lines[0]).toBe("Enfermería cumple 1 de sus 4 metas con número.");
    expect(note.lines[1]).toBe("Lo que más preocupa: indicador b (50 %).");
    expect(note.lines[2]).toBe("Falta la cifra de indicador c.");
  });
});

describe("varios programas", () => {
  const programs = programsOf(data);
  const standings = standingsOf(data, programs);
  const names = new Map(programs.map((p) => [p.id, p.name]));

  it("reparte cada indicador entre los programas que lo eligieron", () => {
    const [a, b] = spreads(standings, names);
    expect(a.indicator.code).toBe("A");
    expect(a).toMatchObject({ adopters: 2, reported: 2, met: 2, withTarget: 2 });
    expect(a.box).toMatchObject({ min: 100, max: 130 });
    expect(b).toMatchObject({ adopters: 2, met: 0 });
  });

  it("el mapa distingue «no lo eligió» de «sin cifra»", () => {
    const cells = gridOf(standings.get("med") ?? [], ["a", "c"]);
    expect(cells).toEqual([{ adopted: true, pct: 130 }, { adopted: false }]);
    expect(gridOf(standings.get("enf") ?? [], ["c"])).toEqual([{ adopted: true, pct: null }]);
  });

  it("Pilo señala dónde más se separan los programas", () => {
    const perGroup = programs.map((p) => ({ name: p.name, counts: countStandings(standings.get(p.id) ?? []) }));
    const note = groupStandingNote(spreads(standings, names), perGroup, "Salud");
    expect(note.lines[0]).toBe("Donde más se separan es en indicador b: Medicina va en 90 % y Enfermería en 50 %.");
  });
});
