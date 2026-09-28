import { describe, expect, it } from "vitest";
import { buildModel } from "./engine";
import type { PresentationData } from "./engine";
import real from "./fixture.test-data.json";

describe("la capa profunda de Pilo", () => {
  const model = buildModel(real as PresentationData);

  it("arma la malla con la estructura real del plan", () => {
    // 5 fuentes + 6 pilares + 21 áreas + 123 líneas + 7 proyectos + 13 informes + 14 temas (sin los lugares punteados).
    expect(model.counts.nodes).toBe(5 + 6 + 21 + 123 + 7 + 13 + 14);
    expect(model.edges.length).toBeGreaterThan(200);
  });

  it("elige como ejemplo el proyecto más conectado y responde con su ruta", () => {
    expect(model.focus?.code).toBe("PR4");
    expect(model.answer).toMatch(/^«PR4 · .+» se vincula con \d+ líneas de acción de \d+ pilares: P\d/);
    expect(model.question).toContain(model.focus!.name);
    expect(model.matches.has(model.focus!)).toBe(true);
  });

  it("no se rompe sin datos", () => {
    const empty = buildModel({ pillars: [], areas: [], lines: [], projects: [], reports: [], obs: [] });
    expect(empty.focus).toBeNull();
    expect(empty.question).toMatch(/pilares/);
  });
});
