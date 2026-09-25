import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  STAGES,
  chainCount,
  chainGaps,
  mergeWeights,
  missingFunctions,
  recommend,
  type PiloIndicator,
  type PiloInput,
} from "./recommend";

const ind = (code: string, stage: PiloIndicator["stage"], dimensionName: string, name: string, extra: Partial<PiloIndicator> = {}): PiloIndicator => ({
  id: code,
  code,
  name,
  fn: code.startsWith("E") ? "ensenanza" : code.startsWith("I") ? "investigacion" : "extension",
  stage,
  dimensionName,
  cesu: [],
  programReports: true,
  ...extra,
});

const CATALOG: PiloIndicator[] = [
  ind("E01", "insumos", "Práctica Profesional", "Profesores con título de Maestría y Doctorado"),
  ind("E03", "procesos", "Permanencia", "Estudiantes beneficiados por el programa de acompañamiento"),
  ind("E04", "procesos", "Permanencia", "Tasa de retención estudiantil"),
  ind("E05", "procesos", "Permanencia", "Tasa de deserción acumulada"),
  ind("E07", "procesos", "Práctica Profesional", "Autoevaluación y evaluación profesoral", { cesu: ["C12"] }),
  ind("E10", "productos", "Experiencia del Estudiante", "Tasa de graduación oportuna"),
  ind("E17", "impacto", "Experiencia del Estudiante", "Tasa de empleabilidad de graduados"),
  ind("E18", "impacto", "Práctica Profesional", "Percepción de empleadores sobre graduados"),
  ind("E22", "impacto", "Práctica Profesional", "Tasa de vinculación efectiva en prácticas empresariales"),
  ind("E28", "impacto", "Permanencia", "Efecto de los mecanismos de permanencia estudiantil"),
  ind("I01", "insumos", "Formación investigativa", "Estudiantes vinculados a semilleros"),
  ind("I13", "procesos", "Formación investigativa", "Estudiantes de semillero reconocidos en eventos de investigación"),
  ind("I23", "productos", "Formación investigativa", "Productos de formación en investigación de alto nivel"),
  ind("I27", "impacto", "Formación investigativa", "Graduados UDES que participaron en semilleros de investigación"),
  ind("X01", "insumos", "Institucional Formativo", "Convenios activos con sector externo"),
  ind("X07", "procesos", "Microsocial Territorial", "Proyectos de proyección social activos"),
  ind("X18", "productos", "Microsocial Territorial", "Beneficiarios directos de proyectos"),
  ind("X22", "impacto", "Microsocial Territorial", "Percepción de cambios favorables en problemáticas atendidas"),
];

const input = (over: Partial<PiloInput> = {}): PiloInput => ({
  indicators: CATALOG,
  goals: ["empleo", "semilleros", "territorio"],
  size: 12,
  preferData: true,
  adopted: new Set(),
  years: new Map(),
  peers: new Map(),
  ...over,
});

const codes = (picks: { indicator: { code: string } }[]) => picks.map((p) => p.indicator.code);
const pickAt = (picks: ReturnType<typeof recommend>["picks"], fn: string, stage: string) =>
  picks.find((p) => p.indicator.fn === fn && p.indicator.stage === stage);

describe("Mr. Pilo · la cadena primero", () => {
  it("«Lo esencial» trae los cuatro eslabones en cada función elegida", () => {
    const { picks, impossible } = recommend(input());
    expect(impossible).toEqual([]);
    expect(picks).toHaveLength(12);
    expect(chainGaps(picks, ["ensenanza", "investigacion", "extension"])).toEqual([]);
    const count = chainCount(picks);
    for (const fn of ["ensenanza", "investigacion", "extension"] as const) {
      expect(STAGES.map((s) => count[fn][s])).toEqual([1, 1, 1, 1]);
    }
  });

  it("para un eslabón prefiere lo que responde al impacto elegido y marca lo que entra solo por la cadena", () => {
    const { picks } = recommend(input());
    expect(pickAt(picks, "ensenanza", "impacto")?.indicator.code).toMatch(/E17|E18|E22/);
    const insumo = pickAt(picks, "ensenanza", "insumos")!;
    expect(insumo.chain).toBe(true);
    expect(insumo.reasons[0]).toBe("Completa la cadena de valor");
  });

  it("dice qué eslabón queda vacío si se quita un indicador, y con qué llenarlo", () => {
    const proposal = recommend(input());
    const without = proposal.picks.filter((p) => p.indicator.code !== "X01");
    expect(chainGaps(without, ["extension"])).toEqual([{ fn: "extension", stage: "insumos" }]);
    // No hay otro insumo de Extensión en el catálogo; de procesos de Enseñanza sí.
    expect(proposal.fillers.get("extension|insumos")).toBeUndefined();
    expect(proposal.fillers.get("ensenanza|procesos")?.reasons[0]).toBe("Completa la cadena de valor");
  });

  it("dice qué eslabones no puede llenar el catálogo", () => {
    const { impossible } = recommend(input({ indicators: CATALOG.filter((i) => i.code !== "I23") }));
    expect(impossible).toEqual([{ fn: "investigacion", stage: "productos" }]);
  });
});

describe("Mr. Pilo · qué entra siempre y qué sube", () => {
  it("lo obligatorio y lo que ya sigue van primero", () => {
    const catalog = CATALOG.map((i) => (i.code === "E07" ? { ...i, mandatory: true } : i));
    const { picks } = recommend(input({ indicators: catalog, adopted: new Set(["X07"]) }));
    expect(codes(picks).slice(0, 2)).toEqual(["E07", "X07"]);
    expect(picks[0].mandatory).toBe(true);
    expect(picks[0].reasons[0]).toBe("Obligatoria de la vicerrectoría");
    expect(picks[1].reasons[0]).toBe("Ya lo sigue: se conserva");
  });

  it("lo que ya trae P1P2P3 sube: el programa lo puede reportar hoy", () => {
    const goals = ["permanencia", "semilleros", "territorio"];
    expect(pickAt(recommend(input({ goals })).picks, "ensenanza", "procesos")?.indicator.code).not.toBe("E05");
    const withSource = recommend(input({ goals, sourcePeriods: new Map([["E05", ["2025-2", "2026-1"]]]) }));
    const procesos = pickAt(withSource.picks, "ensenanza", "procesos")!;
    expect(procesos.indicator.code).toBe("E05");
    expect(procesos.reasons.join(" ")).toMatch(/P1P2P3 ya traen sus datos de 2025-2 y 2026-1: lo puede reportar hoy/);
  });

  it("los pesos de Planeación cambian el orden: CESU/CNA más pesado pone primero lo de acreditación", () => {
    const goals = ["permanencia", "semilleros", "territorio"];
    const { picks } = recommend(input({ goals, weights: mergeWeights({ cesu: 20 }) }));
    expect(pickAt(picks, "ensenanza", "procesos")?.indicator.code).toBe("E07");
  });

  it("mergeWeights completa con los de fábrica e ignora valores raros", () => {
    expect(mergeWeights({ cesu: 7, data: "x", goalName: 999 })).toEqual({ ...DEFAULT_WEIGHTS, cesu: 7 });
    expect(mergeWeights(null)).toEqual(DEFAULT_WEIGHTS);
  });
});

describe("Mr. Pilo · impactos y tamaño", () => {
  it("pide al menos un impacto por función", () => {
    expect(missingFunctions(["empleo", "territorio"])).toEqual(["investigacion"]);
    expect(missingFunctions(["empleo", "semilleros", "territorio"])).toEqual([]);
  });

  it("completa el tamaño con los impactos elegidos después de la cadena", () => {
    const { picks } = recommend(input({ goals: ["empleo", "permanencia", "semilleros", "territorio"], size: 15 }));
    expect(picks).toHaveLength(15);
    expect(chainGaps(picks, ["ensenanza", "investigacion", "extension"])).toEqual([]);
    expect(picks.filter((p) => p.indicator.fn === "ensenanza").length).toBeGreaterThan(4);
  });
});
