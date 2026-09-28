import { describe, expect, it } from "vitest";
import { analysisFacts, analysisIndicators, closingFacts, defaultAnalysis, normalizeAnalysis } from "./analysis";
import { normalizeSettings, bulletinSlug } from "./model";
import { analysisText, buildAnalysisMessages, canUse, parseAnalysis, verifyNumbers } from "../../components/pilo/ai/logic";
import type { Rules } from "../../components/pilo/ai/logic";
import type { Indicator, OpenDataCatalog, Report } from "../datos-abiertos/data/types";

const indicator = (id: string, label: string, format: Indicator["format"], values: Indicator["values"], direction: Indicator["direction"] = "sube"): Indicator => ({
  id,
  label,
  unit: format === "porcentaje" ? "%" : "estudiantes",
  format,
  direction,
  definition: `Definición de ${label}`,
  source: "Oficina de Bienestar",
  values,
});

const report: Report = {
  slug: "bienestar",
  code: "BI",
  name: "Bienestar y permanencia",
  summary: "Deserción, retención y apoyos",
  description: "",
  image: { src: "", alt: "", credit: "" },
  line: 2,
  keyIndicators: ["des"],
  indicators: [
    indicator("apo", "Estudiantes con apoyo", "entero", { 2024: { todas: 4300 }, 2025: { todas: 4812 } }),
    indicator(
      "des",
      "Deserción por periodo",
      "porcentaje",
      { 2023: { todas: 11.2 }, 2024: { todas: 10.6, bga: 9.1, cuc: 12.4 }, 2025: { todas: 9.4, bga: 8.1, cuc: 12 } },
      "baja",
    ),
    indicator("vac", "Sin cifras", "entero", {}),
  ],
  breakdowns: [],
};

const catalog: OpenDataCatalog = {
  years: [2023, 2024, 2025],
  currentYear: 2025,
  campuses: [
    { id: "todas", name: "Todos" },
    { id: "bga", name: "Bucaramanga" },
    { id: "cuc", name: "Cúcuta" },
  ],
  illustrative: false,
  cutoffDate: "2025-12-31",
  reports: [report],
};

describe("Análisis de los datos · las cifras que lee Pilo", () => {
  it("toma los indicadores clave primero y deja fuera los que no tienen cifras", () => {
    expect(analysisIndicators(report, undefined, catalog, 10).map((i) => i.id)).toEqual(["des", "apo"]);
    expect(analysisIndicators(report, undefined, catalog, 1).map((i) => i.id)).toEqual(["des"]);
  });

  it("calcula serie, variación, sedes y brecha sin IA", () => {
    const facts = analysisFacts(report, undefined, catalog, 0, "todas", 10);
    expect(facts).toContain("[1] Deserción por periodo (%; más bajo es mejor; reporta Oficina de Bienestar)");
    expect(facts).toContain("[2] Estudiantes con apoyo");
    expect(facts).toContain("2025: 9,4 %");
    expect(facts).toContain("cambio 2024→2025: −1,2 p. p. (mejora)");
    expect(facts).toContain("sedes 2025: Bucaramanga 8,1 %, Cúcuta 12,0 %");
    expect(facts).toContain("Cúcuta +2,6 p. p.");
    expect(facts).toContain("2025: 4.812");
    expect(facts).not.toContain("Sin cifras");
  });

  it("verifica los números del texto contra esas cifras", () => {
    const facts = analysisFacts(report, undefined, catalog, 0, "todas", 10);
    expect(verifyNumbers("La deserción bajó a 9,4 % y Cúcuta quedó en 12,0 %, 2,6 p. p. arriba; 4.812 con apoyo.", facts).unknown).toEqual([]);
    expect(verifyNumbers("La deserción bajó a 7,3 %.", facts).unknown).toEqual(["7.3"]);
    // Las citas no son cifras.
    expect(verifyNumbers(analysisText({ summary: "", paragraphs: ["Bajó a 9,4 % [1] y hubo 4.812 con apoyo [12]."], alerts: [], recommendations: [] }), facts).unknown).toEqual([]);
  });

  it("el corte deja fuera los años posteriores", () => {
    const facts = analysisFacts(report, undefined, catalog, 2024, "todas", 10);
    expect(facts).toContain("2024: 10,6 %");
    expect(facts).not.toContain("2025:");
  });
});

describe("Análisis de los datos · el encargo y lo escrito", () => {
  it("normaliza lo guardado con valores por defecto", () => {
    const a = normalizeAnalysis({ brief: { format: "sedes", length: "raro" }, chapters: { bienestar: { paragraphs: ["Uno"], unknown: ["7.3"] }, vacio: {} } });
    expect(a.brief.format).toBe("sedes");
    expect(a.brief.length).toBe("estandar");
    expect(Object.keys(a.chapters)).toEqual(["bienestar"]);
    expect(a.chapters.bienestar.unknown).toEqual(["7.3"]);
    expect(normalizeAnalysis(null)).toEqual(defaultAnalysis());
  });

  it("el boletín de análisis guarda su encargo y tiene su propia marca", () => {
    const s = normalizeSettings({ format: "analisis", analysis: { brief: { prompt: "Compara sedes" } } }, catalog);
    expect(s.format).toBe("analisis");
    expect(s.analysis?.brief.prompt).toBe("Compara sedes");
    expect(s.texts.coverTitle).toBe("Análisis de los datos");
    expect(normalizeSettings({ format: "completo" }, catalog).analysis).toBeUndefined();
    expect(bulletinSlug(null, "analisis")).toMatch(/^boletin-analisis-/);
  });

  it("el cierre lee lo que dijo cada capítulo", () => {
    const text = closingFacts([{ title: "Bienestar", chapter: { summary: "Baja la deserción", paragraphs: ["P1", "P2", "P3"], alerts: ["Cúcuta"], recommendations: [], unknown: [], model: "", at: "" } }]);
    expect(text).toContain("## Bienestar");
    expect(text).toContain("Alerta: Cúcuta");
    expect(text).not.toContain("P3");
  });
});

describe("Análisis de los datos · la IA", () => {
  it("la instrucción lleva el encargo, las cifras y la forma de responder", () => {
    const [system, user] = buildAnalysisMessages({
      brief: { format: "sedes", audience: "Decanos y directores", tone: "divulgativo", length: "breve", alerts: true, recommendations: false, method: true, prompt: "Enfócate en Cúcuta" },
      part: "capitulo",
      title: "Bienestar y permanencia",
      facts: "· Deserción 2025: 9,4 %",
      context: "· Pilar 1 › Permanencia",
    });
    expect(system.content).toContain("no inventes números");
    expect(user.content).toContain("Comparativo por sede");
    expect(user.content).toContain("Decanos y directores");
    expect(user.content).toContain("Enfócate en Cúcuta");
    expect(user.content).toContain("2 párrafos de 60 a 90 palabras");
    expect(system.content).toContain("sin Markdown");
    expect(user.content).toContain('"recomendaciones": []');
    expect(user.content).toContain("Deserción 2025: 9,4 %");
    expect(user.content).toContain("Pilar 1 › Permanencia");
    expect(user.content).toContain("cómo se leyeron las cifras");
  });

  it("lee el JSON y, si no llega JSON, toma el texto por párrafos", () => {
    const part = parseAnalysis('```json\n{"resumen":"Baja la deserción","parrafos":["Uno","Dos"],"alertas":["Cúcuta"],"recomendaciones":["Acompañar"]}\n```');
    expect(part).toEqual({ summary: "Baja la deserción", paragraphs: ["Uno", "Dos"], alerts: ["Cúcuta"], recommendations: ["Acompañar"] });
    expect(parseAnalysis("## Hallazgos\nPrimer párrafo.\n\nSegundo párrafo.").paragraphs).toEqual(["Hallazgos\nPrimer párrafo.", "Segundo párrafo."]);
  });

  it("solo Planeación y la administración, con la IA encendida", () => {
    const on: Rules = { enabled: true, functions: {}, portals: {} };
    expect(canUse(on, "cifras", "analizar", "planeacion").ok).toBe(true);
    expect(canUse(on, "cifras", "analizar", "admin").ok).toBe(true);
    expect(canUse(on, "cifras", "analizar", "responsable").ok).toBe(false);
    expect(canUse(on, "cifras", "analizar", null).ok).toBe(false);
    expect(canUse({ ...on, enabled: false }, "cifras", "analizar", "admin").ok).toBe(false);
  });
});
