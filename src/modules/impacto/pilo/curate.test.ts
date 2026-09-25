import { describe, expect, it } from "vitest";
import { analyzeProposals, analyzeUsage, similarity, words } from "./curate";

const item = (id: string, name: string, site = "fis|bga", parentId: string | null = null) => {
  const [programId, campusId] = site.split("|");
  return { id, code: id, name, stage: "procesos" as const, programId, campusId, parentId, description: "" };
};

const FICHAS = [
  { ...item("E04", "Tasa de retención estudiantil"), programId: null, campusId: null },
  { ...item("I01", "Estudiantes vinculados a semilleros"), programId: null, campusId: null },
];

describe("Mr. Pilo para vicerrectorías · propuestas", () => {
  it("compara sin tildes, sin palabras vacías y en singular", () => {
    expect([...words("Tasa de retención de los estudiantes")]).toEqual(["retencion", "estudiant"]);
    expect(similarity(words("Estudiantes en semilleros"), words("Estudiante vinculado a semillero"))).toBeGreaterThanOrEqual(0.5);
  });

  it("sugiere relacionar lo que se parece a una ficha y crear ficha para lo que se repite en varios programas", () => {
    const result = analyzeProposals(FICHAS, [
      item("p1", "Estudiantes vinculados a semilleros del programa"),
      item("p2", "Tutorías entre pares", "fis|bga"),
      item("p3", "Tutorías entre pares académicas", "bac|vll"),
      item("p4", "Huella de carbono del laboratorio", "bac|vll"),
      item("p5", "Retención estudiantil", "to|cuc", "E04"),
    ]);
    expect(result.links.map((l) => [l.item.id, l.ficha.id])).toEqual([["p1", "I01"]]);
    expect(result.ideas).toHaveLength(1);
    expect(result.ideas[0]).toMatchObject({ name: "Tutorías entre pares", sites: 2 });
    expect(result.single.map((i) => i.id)).toEqual(["p4"]);
    expect(result.linked).toBe(1);
  });

  it("marca las fichas sin uso, sin cifras o muy adaptadas", () => {
    const usage = analyzeUsage(
      FICHAS,
      [
        { indicatorId: "E04", programId: "fis", campusId: "bga", active: true },
        { indicatorId: "E04", programId: "bac", campusId: "vll", active: true },
      ],
      [item("a", "x", "fis|bga", "E04"), item("b", "y", "bac|vll", "E04"), item("c", "z", "to|cuc", "E04")],
      new Set(["E04|fis|bga"]),
    );
    const e04 = usage.find((u) => u.ficha.id === "E04")!;
    expect(e04).toMatchObject({ adopted: 2, reporting: 1, adapted: 3 });
    expect(e04.flags).toEqual(["muy_adaptada"]);
    expect(usage.find((u) => u.ficha.id === "I01")!.flags).toEqual(["sin_uso"]);
  });
});
