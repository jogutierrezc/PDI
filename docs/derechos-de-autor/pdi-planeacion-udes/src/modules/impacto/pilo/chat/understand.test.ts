import { describe, expect, it } from "vitest";
import { detectIntent, matchGoals, matchIndicators } from "./understand";
import type { Candidate } from "./understand";

const c = (id: string, name: string, description = ""): Candidate => ({ id, code: id.toUpperCase(), name, description, fn: "ensenanza", stage: "impacto", dimensionName: null });

describe("Mr. Pilo Bot entiende lo que escribe el programa", () => {
  it("reconoce los impactos como los dice la gente", () => {
    const ids = matchGoals("Queremos que nuestros graduados consigan empleo y que los estudiantes investiguen").map((g) => g.id);
    expect(ids).toContain("empleo");
    expect(ids).toContain("semilleros");
    expect(ids).not.toContain("permanencia");
    expect(matchGoals("que no haya tanta deserción en primer semestre").map((g) => g.id)).toContain("permanencia");
    expect(matchGoals("hola")).toEqual([]);
  });

  it("encuentra las fichas ya construidas que comparten palabras", () => {
    const list = [c("a", "Tasa de empleabilidad de graduados"), c("b", "Estudiantes en semilleros de investigación"), c("x", "Convenios internacionales vigentes")];
    const r = matchIndicators("Queremos medir la empleabilidad de nuestros graduados", list);
    expect(r[0].item.id).toBe("a");
    expect(r.map((m) => m.item.id)).not.toContain("x");
  });

  it("reconoce preguntas de análisis y ajustes", () => {
    expect(detectIntent("¿Cómo va mi programa?")).toBe("estado");
    expect(detectIntent("¿Qué me falta en la cadena?")).toBe("cadena");
    expect(detectIntent("quiero más de investigación")).toBe("mas:investigacion");
    expect(detectIntent("una opción más liviana")).toBe("liviana");
    expect(detectIntent("queremos más empleo")).toBeNull();
  });
});
