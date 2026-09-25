import { describe, expect, it } from "vitest";
import { buildPlan, changeCount, emptyResolutions, KEEP, OMIT, readPayload, TAKE, toBatch, type SyncContext } from "./legacy";

const P_FIS = "prog-fis";
const P_BAC = "prog-bac";
const BGA = "camp-bga";
const VLL = "camp-vll";

const ctx = (over: Partial<SyncContext> = {}): SyncContext => ({
  indicators: [
    { id: "i-e17", code: "E17", name: "Tasa de empleabilidad", status: "publicado", baselineText: "75%", target2026: "≥ 80%", target2028: "", updatedAt: "2026-09-20T00:00:00Z" },
    { id: "i-e04", code: "E04", name: "Retención", status: "publicado", baselineText: "", target2026: "", target2028: "", updatedAt: "2026-09-20T00:00:00Z" },
    { id: "i-i01", code: "I01", name: "Semilleros", status: "publicado", baselineText: "", target2026: "", target2028: "", updatedAt: "2026-09-20T00:00:00Z" },
  ],
  programs: [
    { id: P_FIS, name: "Fisioterapia" },
    { id: P_BAC, name: "Bacteriología y Laboratorio Clínico" },
  ],
  campuses: [
    { id: BGA, name: "Bucaramanga", slug: "bucaramanga" },
    { id: VLL, name: "Valledupar", slug: "valledupar" },
  ],
  offer: [
    { programId: P_FIS, campusId: BGA },
    { programId: P_BAC, campusId: BGA },
    { programId: P_BAC, campusId: VLL },
  ],
  adoptions: [],
  values: [],
  legacyMap: [],
  lastRunAt: null,
  ...over,
});

const payload = () =>
  readPayload({
    ok: true,
    data: [
      { id: "E17", lb: "75%", m26: "≥ 80%", m28: "85%", va26: "78" },
      { id: "E04", lb: "81,5%", va26: "" },
      { id: "Z01", lb: "3" },
    ],
    data_programa: [
      { id: "P_FISBGA_001", id_padre: "E17", programa: "FIS", sede: "BUCARAMANGA", lb: "60%", m26: "70%", lb2021: "55", va26: "66" },
      { id: "P_BACVLL_001", id_padre: "I01", programa: "BAC", sede: "Valledupar", lb: "12" },
      { id: "P_BACVLL_002", id_padre: "I99", programa: "BAC", sede: "Valledupar", nombre: "Algo propio" },
    ],
    data_resultados: [
      { id_indicador: "P_FISBGA_001", anio: "2024", num: "64" },
      { id_indicador: "P_FISBGA_001", anio: "2026", num: "68" },
      { id_indicador: "P_BACVLL_001", anio: "2025", na: "1" },
    ],
    programas: [
      { codigo: "FIS-BGA", nombre_programa: "Fisioterapia", sede: "Bucaramanga", clave: "secreta" },
      { codigo: "BAC-VLL", nombre_programa: "Bacteriología", sede: "Valledupar", clave: "otra" },
    ],
  });

describe("readPayload", () => {
  it("descarta las contraseñas de la hoja Programas", () => {
    expect(JSON.stringify(payload())).not.toMatch(/secreta|clave/);
  });

  it("dice qué pasó si el Apps Script responde un error o no es la hoja", () => {
    expect(() => readPayload({ ok: false, error: "sin permiso" })).toThrow(/sin permiso/);
    expect(() => readPayload({ hola: 1 })).toThrow(/Datos/);
  });
});

describe("buildPlan", () => {
  it("reconoce el programa por nombre y sede, y pregunta el que no coincide", () => {
    const plan = buildPlan(payload(), ctx());
    expect(plan.programs).toContainEqual({ code: "FIS-BGA", program_id: P_FIS, campus_id: BGA, name: "Fisioterapia" });
    const bac = plan.issues.find((i) => i.kind === "programa");
    expect(bac?.key).toBe("BAC-VLL");
    // Sugiere el que comparte palabras, en su sede.
    expect(bac?.value).toBe(`${P_BAC}|${VLL}`);
  });

  it("recuerda el mapa de corridas anteriores", () => {
    const plan = buildPlan(payload(), ctx({ legacyMap: [{ code: "BAC-VLL", programId: P_BAC, campusId: VLL }] }));
    expect(plan.issues.some((i) => i.kind === "programa")).toBe(false);
  });

  it("fichas: entra lo vacío, lo igual no cuenta y lo distinto editado aquí se pregunta", () => {
    const plan = buildPlan(payload(), ctx());
    // E17: lb igual, m26 igual, m28 nueva.
    expect(plan.indicators).toContainEqual({ code: "E17", target_2028: "85%", target_2028_num: 85 });
    // E04: línea base vacía en la intranet → entra con su número.
    expect(plan.indicators).toContainEqual({ code: "E04", baseline_text: "81,5%", baseline_num: 81.5 });
    // Z01 no existe: se omite y se dice por qué.
    expect(plan.omissions).toContainEqual(expect.objectContaining({ sheet: "Datos", row: "Z01" }));
  });

  it("un campo distinto que nadie tocó desde la última corrida lo toma de la hoja sin preguntar", () => {
    const base = ctx();
    base.indicators[0].target2026 = "≥ 75%";
    const asked = buildPlan(payload(), base);
    expect(asked.issues.find((i) => i.key === "ficha:E17:m26")?.value).toBe(KEEP);
    expect(asked.indicators.find((i) => i.code === "E17")?.target_2026).toBeUndefined();

    const quiet = buildPlan(payload(), { ...base, lastRunAt: "2026-09-21T00:00:00Z" });
    expect(quiet.issues.some((i) => i.key === "ficha:E17:m26")).toBe(false);
    expect(quiet.indicators.find((i) => i.code === "E17")?.target_2026).toBe("≥ 80%");

    const resolved = emptyResolutions();
    resolved.conflicts["ficha:E17:m26"] = TAKE;
    expect(buildPlan(payload(), base, resolved).indicators.find((i) => i.code === "E17")?.target_2026).toBe("≥ 80%");
  });

  it("adopciones y cifras por programa, con la fila anual por encima de va26", () => {
    const plan = buildPlan(payload(), ctx());
    expect(plan.adoptions).toContainEqual(
      expect.objectContaining({ indicator_code: "E17", program_id: P_FIS, campus_id: BGA, baseline_text: "60%", target_2026: "70%" }),
    );
    const fis = plan.values.filter((v) => v.program_id === P_FIS).map((v) => [v.year, v.value_num]);
    expect(fis).toEqual(expect.arrayContaining([[2024, 64], [2026, 68], [2021, 55]]));
    expect(fis).not.toContainEqual([2026, 66]);
    // «No aplica» no es un vacío ni un cero.
    expect(plan.values).toContainEqual(expect.objectContaining({ indicator_code: "I01", year: 2025, not_applicable: true, value_num: null }));
    // La cifra global de E17 en 2026.
    expect(plan.values).toContainEqual(expect.objectContaining({ indicator_code: "E17", year: 2026, program_id: null, value_num: 78 }));
  });

  it("lo que no copia una ficha es un indicador propio del programa, relacionado con su madre si la hay", () => {
    const plan = buildPlan(payload(), ctx());
    // Madre desconocida (I99): propio, sin relación.
    expect(plan.programIndicators).toContainEqual(
      expect.objectContaining({ legacy_id: "P_BACVLL_002", name: "Algo propio", parent_code: null, program_id: P_BAC, campus_id: VLL }),
    );
    expect(plan.issues.some((i) => i.kind === "padre" || i.kind === "duplicado")).toBe(false);
  });

  it("un segundo indicador bajo la misma ficha, o con nombre propio, también es propio; las cifras van por su id", () => {
    const data = payload();
    data.data_programa.push(
      { id: "P_FISBGA_009", id_padre: "E17", funcion: "ENS", niv: "Impacto Real", programa: "FIS", sede: "Bucaramanga", nombre: "Egresados en posgrado", und: "Porcentaje" },
      { id: "P_FISBGA_010", id_padre: "E04", funcion: "ENS", niv: "Procesos", programa: "FIS", sede: "Bucaramanga", nombre: "Tasa de retención estudiantil", estado: "eliminado" },
    );
    data.data_resultados.push({ id_indicador: "P_FISBGA_009", anio: "2025", num: "12" });
    const plan = buildPlan(data, ctx());
    expect(plan.programIndicators).toContainEqual(
      expect.objectContaining({ legacy_id: "P_FISBGA_009", parent_code: "E17", stage: "impacto", measure: "porcentaje", fn: "ensenanza" }),
    );
    expect(plan.values).toContainEqual(expect.objectContaining({ legacy_id: "P_FISBGA_009", year: 2025, value_num: 12 }));
    // Lo eliminado no entra ni como adopción ni como propio.
    expect(plan.adoptions.some((a) => a.indicator_code === "E04")).toBe(false);
    expect(plan.omissions).toContainEqual(expect.objectContaining({ reason: "Marcadas como eliminadas en la hoja." }));
  });

  it("un propio que ya entró no se duplica: se compara por su id en la hoja", () => {
    const plan = buildPlan(
      payload(),
      ctx({
        programIndicators: [
          { id: "own-1", legacyId: "P_BACVLL_002", name: "Algo propio", baselineText: "", target2026: "", target2028: "", updatedAt: "2026-09-20T00:00:00Z" },
        ],
      }),
    );
    expect(plan.programIndicators.some((p) => p.legacy_id === "P_BACVLL_002")).toBe(false);
  });

  it("una cifra ya igual no vuelve a entrar; una editada aquí se conserva por omisión", () => {
    const values = [
      { indicatorId: "i-e17", year: 2024, programId: P_FIS, campusId: BGA, valueNum: 64, valueText: "", notApplicable: false, updatedAt: "2026-09-01T00:00:00Z" },
      { indicatorId: "i-e17", year: 2026, programId: P_FIS, campusId: BGA, valueNum: 69, valueText: "", notApplicable: false, updatedAt: "2026-09-01T00:00:00Z" },
    ];
    const plan = buildPlan(payload(), ctx({ values }));
    expect(plan.values.some((v) => v.program_id === P_FIS && v.year === 2024)).toBe(false);
    expect(plan.values.some((v) => v.program_id === P_FIS && v.year === 2026)).toBe(false);
    expect(plan.issues.find((i) => i.kind === "conflicto" && i.key.startsWith("cifra:E17:2026"))?.detail).toMatch(/68.*69/);
  });

  it("el lote lleva lo que entra y el resumen", () => {
    const plan = buildPlan(payload(), ctx());
    const batch = toBatch(plan, "https://script.google.com/macros/s/x/exec");
    expect(batch.values.length + batch.adoptions.length + batch.indicators.length + batch.program_indicators.length).toBe(changeCount(plan));
    expect(batch.summary.hojas.Datos.filas).toBe(3);
  });
});
