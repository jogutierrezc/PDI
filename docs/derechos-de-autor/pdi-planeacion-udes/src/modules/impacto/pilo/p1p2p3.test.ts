import { describe, expect, it } from "vitest";
import { aggregateP1P2P3, grade } from "./p1p2p3";

const HEAD = [
  "Campus", "Periodo", "Código Programa", "Nombre Programa", "Código Estudiante", "Nombre de estudiante",
  "Código Materia", "Nombre Materia", "Grupo", "Plan eval", "P1", "P2", "P3", "Nota acumulada",
];
const row = (campus: string, student: string, p1: string, final: string, program = "06401", period = "2026-1") => [
  campus, period, program, "FISIOTERAPIA", student, `ESTUDIANTE ${student}`, "M1", "MATERIA", "A", "SIN DATO", p1, "", "", final,
];

describe("P1P2P3 como fuente de Mr. Pilo", () => {
  it("lee notas con coma decimal", () => {
    expect(grade("3,1")).toBe(3.1);
    expect(grade("-")).toBeNull();
    expect(grade("")).toBeNull();
  });

  it("agrega por programa, sede y periodo sin dejar datos de estudiantes", () => {
    const result = aggregateP1P2P3([
      HEAD,
      row("BUCARAMANGA", "1", "2,5", "3,2"),
      row("BUCARAMANGA", "1", "4,0", "2,8"),
      row("BUCARAMANGA", "2", "3,5", "4,0"),
      row("CUCUTA", "3", "3,0", ""),
    ]);
    expect(result.problems).toEqual([]);
    expect(result.rows).toBe(4);
    const bga = result.groups.find((g) => g.campus === "BUCARAMANGA")!;
    expect(bga).toMatchObject({ students: 2, enrollments: 3, approvedRate: 66.7, averageGrade: 3.33, atRiskRate: 50 });
    const cuc = result.groups.find((g) => g.campus === "CUCUTA")!;
    expect(cuc).toMatchObject({ students: 1, approvedRate: null, atRiskRate: 0 });
    expect(JSON.stringify(result)).not.toMatch(/ESTUDIANTE/);
  });

  it("avisa si el archivo no es el consolidado", () => {
    expect(aggregateP1P2P3([["Hoja", "Otra"]]).problems[0]).toMatch(/faltan/);
  });
});
