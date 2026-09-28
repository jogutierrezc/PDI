import { describe, expect, it } from "vitest";
import { hasTrigger, matchCatalog, normalizeQuestion } from "./logic";
import type { CatalogEntry } from "./logic";

const entry = (e: Partial<CatalogEntry>): CatalogEntry => ({
  key: "X",
  kind: "capciosa",
  question: "",
  variants: [],
  triggers: [],
  answer: "…",
  mood: "atrevido",
  source_title: "",
  source_path: "",
  cut: "",
  office: "",
  ...e,
});

const catalog = [
  entry({ key: "C-001", triggers: ["salario"], answer: "Los salarios no se publican." }),
  entry({ key: "C-002", triggers: ["salario rector"], answer: "Del rector tampoco, lo siento.", mood: "loco" }),
  entry({ key: "C-003", triggers: ["novia"], answer: "Mi único amor son los datos abiertos." }),
  entry({
    key: "R-001",
    kind: "respuesta",
    question: "¿Qué es el PDI?",
    variants: ["que significa pdi", "para que sirve el plan de desarrollo"],
    answer: "El PDI es el Plan de Desarrollo Institucional 2024-2028.",
    mood: "emocionado",
  }),
];

describe("el catálogo de Planeación", () => {
  it("un disparador son palabras en cualquier orden, sin tildes, al comienzo de una palabra", () => {
    const q = normalizeQuestion("¿Cuál es el SALARIO del rector?");
    expect(hasTrigger(q, "salario rector")).toBe(true);
    expect(hasTrigger(q, "rector salario")).toBe(true);
    expect(hasTrigger(q, "salarios")).toBe(false);
    expect(hasTrigger(normalizeQuestion("¿tienes novia?"), "novia")).toBe(true);
    expect(hasTrigger(normalizeQuestion("¿cómo va la novedad?"), "novia")).toBe(false);
  });

  it("gana la capciosa más específica", () => {
    expect(matchCatalog("¿Cuánto es el salario del rector?", catalog)?.entry.key).toBe("C-002");
    expect(matchCatalog("¿Cuál es el salario de un profesor?", catalog)?.entry.key).toBe("C-001");
  });

  it("una respuesta oficial responde a su pregunta y a sus variantes", () => {
    expect(matchCatalog("que es el PDI", catalog)?.entry.key).toBe("R-001");
    expect(matchCatalog("¿Qué significa PDI?", catalog)?.entry.key).toBe("R-001");
    expect(matchCatalog("¿Cuántos estudiantes hay?", catalog)).toBeNull();
  });
});
