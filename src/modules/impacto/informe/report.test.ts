import { describe, expect, it } from "vitest";
import { buildAnalysisMessages, canUse, verifyNumbers } from "../../../components/pilo/ai/logic";
import type { Rules } from "../../../components/pilo/ai/logic";
import { DEFAULT_BRIEF } from "../../boletin/analysis";
import { toPortalData } from "../portal/data";
import { normalizeDoc, reportChoices, reportPlan } from "./report";

const ind = (id: string, code: string, fn: string, stage: string, extra: object = {}) => ({ id, code, fn, stage, name: `Indicador ${code}`, unit_label: "%", measure: "porcentaje", ...extra });

/** Una facultad con dos programas y otra con uno; la vicerrectoría de investigaciones. */
const data = toPortalData({
  indicators: [
    ind("a", "I01", "investigacion", "insumos", { target_2026_num: 100, target_2028_num: 120, source: "Vicerrectoría de Investigaciones" }),
    ind("b", "I02", "investigacion", "productos", { target_2026_num: 10 }),
    ind("c", "E01", "ensenanza", "impacto", { target_2026_num: 20, direction: "baja" }),
  ],
  units: [
    { id: "vi", parent_id: null, kind: "vicerrectoria", code: "VI", name: "Vicerrectoría de Investigaciones", slug: "vi" },
    { id: "fac", parent_id: null, kind: "facultad", code: "FS", name: "Salud", slug: "salud" },
    { id: "ing", parent_id: null, kind: "facultad", code: "FI", name: "Ingenierías", slug: "ingenierias" },
    { id: "enf", parent_id: "fac", kind: "programa", code: "ENF", name: "Enfermería", slug: "enfermeria" },
    { id: "med", parent_id: "fac", kind: "programa", code: "MED", name: "Medicina", slug: "medicina" },
    { id: "sis", parent_id: "ing", kind: "programa", code: "SIS", name: "Sistemas", slug: "sistemas" },
  ],
  unit_functions: [{ unit_id: "vi", fn: "investigacion" }],
  campuses: [
    { id: "bga", slug: "bucaramanga", name: "Bucaramanga" },
    { id: "cuc", slug: "cucuta", name: "Cúcuta" },
  ],
  offer: [
    { program_id: "enf", campus_id: "bga" },
    { program_id: "enf", campus_id: "cuc" },
    { program_id: "med", campus_id: "bga" },
    { program_id: "sis", campus_id: "bga" },
  ],
  adoptions: [
    { indicator_id: "a", program_id: "enf", campus_id: "bga", target_2026_num: 80 },
    { indicator_id: "a", program_id: "enf", campus_id: "cuc", target_2026_num: 120 },
    { indicator_id: "b", program_id: "enf", campus_id: "bga" },
    { indicator_id: "c", program_id: "enf", campus_id: "bga" },
    { indicator_id: "a", program_id: "med", campus_id: "bga" },
    { indicator_id: "a", program_id: "sis", campus_id: "bga" },
  ],
  values: [
    { indicator_id: "a", year: 2024, program_id: "enf", campus_id: "bga", value_num: 70 },
    { indicator_id: "a", year: 2025, program_id: "enf", campus_id: "bga", value_num: 90 },
    { indicator_id: "a", year: 2025, program_id: "enf", campus_id: "cuc", value_num: 110 },
    { indicator_id: "b", year: 2025, program_id: "enf", campus_id: "bga", value_num: 5 },
    { indicator_id: "a", year: 2025, program_id: "med", campus_id: "bga", value_num: 50 },
    { indicator_id: "a", year: 2025, program_id: "sis", campus_id: "bga", value_num: 100 },
    { indicator_id: "a", year: 2025, program_id: null, campus_id: null, value_num: 84.5 },
  ],
});

const base = (memberships: { unitId: string; campusId: string | null }[]) => ({
  units: data.units,
  campuses: data.campuses,
  offer: data.offer,
  unitFunctions: data.unitFunctions,
  memberships,
});

const OPEN = { programa: true, facultad: true, vicerrectoria: true };
const CLOSED = { programa: false, facultad: false, vicerrectoria: false };

describe("reportChoices", () => {
  it("la administración elige cualquier unidad, aunque todo esté cerrado", () => {
    const c = reportChoices(base([]), true, CLOSED);
    expect(c.programs.map((p) => p.id)).toEqual(["enf", "med", "sis"]);
    expect(c.faculties.map((f) => f.id)).toEqual(["ing", "fac"]);
    expect(c.functions).toEqual(["investigacion", "ensenanza", "extension"]);
  });

  it("cerrado, nadie más tiene nada", () => {
    const c = reportChoices(base([{ unitId: "enf", campusId: null }]), false, CLOSED);
    expect(c.programs).toHaveLength(0);
  });

  it("un programa, el suyo; con sede fija, solo esa sede", () => {
    const all = reportChoices(base([{ unitId: "enf", campusId: null }]), false, OPEN);
    expect(all.programs.map((p) => [p.id, p.allCampuses, p.campuses.length])).toEqual([["enf", true, 2]]);
    expect(all.faculties).toHaveLength(0);
    const one = reportChoices(base([{ unitId: "enf", campusId: "cuc" }]), false, OPEN);
    expect(one.programs[0]).toMatchObject({ allCampuses: false, campuses: [{ id: "cuc", name: "Cúcuta" }] });
  });

  it("la decanatura, su facultad y sus programas; la vicerrectoría, su función", () => {
    const dean = reportChoices(base([{ unitId: "fac", campusId: null }]), false, OPEN);
    expect(dean.faculties.map((f) => f.id)).toEqual(["fac"]);
    expect(dean.programs.map((p) => p.id)).toEqual(["enf", "med"]);
    const vr = reportChoices(base([{ unitId: "vi", campusId: null }]), false, { ...OPEN, programa: false });
    expect(vr.functions).toEqual(["investigacion"]);
    expect(vr.programs).toHaveLength(0);
  });
});

describe("reportPlan", () => {
  it("un programa: un capítulo por función, con cifras numeradas y la comparación con los demás", () => {
    const plan = reportPlan(data, { kind: "programa", ref: "enf", campusId: null }, 14)!;
    expect(plan.title).toBe("Informe de impacto · Enfermería");
    expect(plan.subtitle).toBe("Programa · Todas las sedes · Corte 2025");
    expect(plan.parts.map((p) => p.key)).toEqual(["investigacion", "ensenanza"]);
    const facts = plan.parts[0].facts;
    expect(facts).toContain("Programa: Enfermería (Salud)");
    expect(facts).toMatch(/\[\d\] I01 · Indicador I01/);
    // A: (90 + 110) / 2 = 100 frente a (80 + 120) / 2 = 100 → cumplida.
    expect(facts).toContain("última cifra 2025: 100%; meta 2026: 100% (avance 100 %, cumplida)");
    expect(facts).toContain("meta 2028: 120%");
    expect(facts).toContain("avance mediano de los 3 programas que lo siguen");
    expect(plan.parts[0].sources.map((s) => s.code)).toContain("I01");
    expect(plan.parts[0].sources.find((s) => s.code === "I01")).toMatchObject({ source: "Vicerrectoría de Investigaciones", years: "2024–2025" });
    // E01 no tiene cifra: se dice, no se inventa un cero.
    expect(plan.parts[1].facts).toContain("sin cifra reportada");
  });

  it("una sede: solo sus cifras y metas", () => {
    const plan = reportPlan(data, { kind: "programa", ref: "enf", campusId: "cuc" }, 14)!;
    expect(plan.subtitle).toBe("Programa · Cúcuta · Corte 2025");
    expect(plan.parts[0].facts).toContain("última cifra 2025: 110%; meta 2026: 120%");
  });

  it("una facultad: por función, con el reparto de sus programas", () => {
    const plan = reportPlan(data, { kind: "facultad", ref: "fac", campusId: null }, 14)!;
    expect(plan.parts.map((p) => p.key)).toEqual(["investigacion", "ensenanza"]);
    const facts = plan.parts[0].facts;
    expect(facts).toContain("lo siguen 2 programas, 2 con cifra");
    expect(facts).toContain("el más alto, Enfermería (100 %); el más bajo, Medicina (50 %)");
    expect(facts).toContain("Medicina: 1 indicador");
  });

  it("una vicerrectoría: el panorama con la cifra de la universidad y un capítulo por facultad", () => {
    const plan = reportPlan(data, { kind: "vicerrectoria", ref: "investigacion", campusId: null }, 14)!;
    expect(plan.unitName).toBe("Vicerrectoría de Investigaciones");
    expect(plan.parts.map((p) => p.title)).toEqual(["Panorama de la función", "Salud", "Ingenierías"]);
    expect(plan.parts[0].facts).toContain("cifra de la universidad 2025: 84,5%");
  });

  it("una unidad que no existe no tiene plan", () => {
    expect(reportPlan(data, { kind: "programa", ref: "nada", campusId: null }, 14)).toBeNull();
    expect(reportPlan(data, { kind: "vicerrectoria", ref: "otra", campusId: null }, 14)).toBeNull();
  });

  it("las cifras del texto se verifican contra las del plan", () => {
    const facts = reportPlan(data, { kind: "programa", ref: "enf", campusId: null }, 14)!.parts[0].facts;
    expect(verifyNumbers("Llegó a 100% [1], con 5% en productos", facts).verified).toBe(true);
    expect(verifyNumbers("Subió a 97,3 %", facts).unknown).toEqual(["97.3"]);
  });
});

describe("normalizeDoc", () => {
  it("rechaza lo que no es un informe y completa lo que falta", () => {
    expect(normalizeDoc(null)).toBeNull();
    expect(normalizeDoc({ scope: { kind: "sede", ref: "x" } })).toBeNull();
    const doc = normalizeDoc({ scope: { kind: "programa", ref: "enf" }, parts: [{ key: "investigacion", chapter: { paragraphs: ["Texto."] }, bars: [{ code: "I01", pct: 90, standing: "raro" }] }] })!;
    expect(doc.title).toBe("Informe de impacto");
    expect(doc.brief.format).toBe("ejecutivo");
    expect(doc.parts[0].chapter?.paragraphs).toEqual(["Texto."]);
    expect(doc.parts[0].bars[0].standing).toBe("sin_cifra");
    expect(doc.closing).toBeNull();
  });
});

describe("pilo-ia · analizar en Impacto", () => {
  const rules = (open: Rules["impacto_report"], enabled = true): Rules => ({ enabled, functions: {}, portals: {}, impacto_report: open });

  it("por defecto, solo la administración", () => {
    expect(canUse(rules(undefined), "impacto", "analizar", "admin").ok).toBe(true);
    expect(canUse(rules(undefined), "impacto", "analizar", "planeacion").ok).toBe(false);
    expect(canUse(rules({ programa: false }), "impacto", "analizar", "consulta").ok).toBe(false);
  });

  it("abierto a algún tipo, cualquier sesión pasa aquí (la unidad la revisa la base)", () => {
    expect(canUse(rules({ facultad: true }), "impacto", "analizar", "consulta").ok).toBe(true);
    expect(canUse(rules({ facultad: true }), "impacto", "analizar", null).ok).toBe(false);
    expect(canUse(rules({ facultad: true }, false), "impacto", "analizar", "admin").ok).toBe(false);
  });

  it("UDES en Cifras sigue igual", () => {
    expect(canUse(rules({ programa: true }), "cifras", "analizar", "consulta").ok).toBe(false);
    expect(canUse(rules({}), "cifras", "analizar", "planeacion").ok).toBe(true);
  });

  it("el capítulo lleva el nombre del documento de Impacto", () => {
    const [, user] = buildAnalysisMessages({ brief: DEFAULT_BRIEF, part: "capitulo", title: "Investigación", facts: "x", doc: "Informe de impacto de Enfermería" });
    expect(user.content).toContain("del documento Informe de impacto de Enfermería.");
    const [, cifras] = buildAnalysisMessages({ brief: DEFAULT_BRIEF, part: "capitulo", title: "Matrícula", facts: "x" });
    expect(cifras.content).toContain("del documento Análisis de los datos de UDES en Cifras.");
  });
});
