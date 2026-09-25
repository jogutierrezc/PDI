/* =============================================================================
   El motor de alineación, medido contra la matriz vr7.

   92 indicadores de la matriz ya traen sus pilares y 91 sus ODS, puestos por
   Planeación. Son la vara: si el diccionario base se toca, estas cifras dicen
   si el motor reconoce mejor o peor.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_CRITERIA } from "./criterios-base";
import { normalize, stem, suggest, tokens, type Criterion, type IndicatorText } from "./motor";

interface Labeled extends IndicatorText {
  code: string;
  pillars: number[];
  sdgs: number[];
}

const MATRIX: Labeled[] = JSON.parse(
  readFileSync(resolve(__dirname, "../../../tests/fixtures/impacto-matriz-vr7.json"), "utf8"),
);
const CRITERIA: Criterion[] = BASE_CRITERIA.map((c) => ({ ...c, key: String(c.key) }));

function score(target: "pilar" | "ods") {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let hit = 0;
  let labeled = 0;
  for (const row of MATRIX) {
    const truth = new Set((target === "pilar" ? row.pillars : row.sdgs).map(String));
    if (!truth.size) continue;
    labeled++;
    const got = new Set(suggest(row, CRITERIA).filter((s) => s.target === target).map((s) => s.key));
    let any = false;
    for (const k of got) {
      if (truth.has(k)) {
        tp++;
        any = true;
      } else fp++;
    }
    for (const k of truth) if (!got.has(k)) fn++;
    if (any) hit++;
  }
  return { precision: tp / (tp + fp), recall: tp / (tp + fn), hitRate: hit / labeled };
}

describe("normalización", () => {
  it("sin tildes, sin mayúsculas, singular y plural juntos", () => {
    expect(normalize("Deserción ACUMULADA (%)")).toBe("desercion acumulada");
    expect(stem("profesores")).toBe(stem("profesor"));
    expect(stem("estudiantes")).toBe(stem("estudiante"));
    expect(stem("graduados")).toBe(stem("graduado"));
    expect(tokens("Tasa de graduación de los estudiantes")).toEqual(["tasa", "graduacion", "estudiant"]);
  });
});

describe("el motor", () => {
  const rules: Criterion[] = [
    { target: "ods", key: "4", term: "estudiante", weight: 3 },
    { target: "ods", key: "8", term: "sector productivo", weight: 3 },
    { target: "pilar", key: "p1", term: "graduación", weight: 2 },
  ];

  it("una frase cuenta solo si sus palabras van seguidas", () => {
    expect(suggest({ name: "Proyectos con el sector productivo" }, rules).map((s) => s.key)).toEqual(["8"]);
    expect(suggest({ name: "Sector de servicios productivo" }, rules)).toEqual([]);
  });

  it("el nombre pesa el doble que la descripción", () => {
    const [inName] = suggest({ name: "Estudiantes en práctica" }, rules);
    const [inDesc] = suggest({ name: "Práctica", description: "de los estudiantes" }, rules);
    expect(inName.score).toBe(6);
    expect(inDesc.score).toBe(3);
  });

  it("dice qué términos lo llevaron a sugerir", () => {
    const [s] = suggest({ name: "Tasa de graduación oportuna" }, rules);
    expect(s).toMatchObject({ target: "pilar", key: "p1", terms: ["graduación"] });
  });

  it("no sugiere por debajo del umbral", () => {
    expect(suggest({ name: "Algo", description: "graduación" }, rules, { threshold: 3 })).toEqual([]);
  });
});

describe("contra la matriz vr7", () => {
  it("reconoce los pilares que puso Planeación", () => {
    const s = score("pilar");
    expect(s.hitRate).toBeGreaterThanOrEqual(0.95);
    expect(s.precision).toBeGreaterThanOrEqual(0.78);
    expect(s.recall).toBeGreaterThanOrEqual(0.68);
  });

  it("reconoce los ODS que puso Planeación", () => {
    const s = score("ods");
    expect(s.hitRate).toBeGreaterThanOrEqual(0.9);
    expect(s.precision).toBeGreaterThanOrEqual(0.7);
    expect(s.recall).toBeGreaterThanOrEqual(0.58);
  });

  it("sugiere algo para los indicadores que la matriz dejó sin pilar", () => {
    const orphans = MATRIX.filter((r) => !r.pillars.length);
    const covered = orphans.filter((r) => suggest(r, CRITERIA).some((s) => s.target === "pilar"));
    expect(covered.length / orphans.length).toBeGreaterThanOrEqual(0.8);
  });
});
