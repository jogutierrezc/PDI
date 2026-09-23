/* Fase 5 · la lógica del modo hoja de cálculo. */
import { describe, expect, it } from "vitest";
import { draftOf, issuesOf } from "../../src/modules/impacto/data/capture-db";
import type { CaptureRow } from "../../src/modules/impacto/data/capture-db";
import { isEditable, parseClipboard, paste, writeCell } from "../../src/modules/impacto/capture/sheet-model";
import type { SheetDraft } from "../../src/modules/impacto/capture/sheet-model";

const base = {
  numerator: null, denominator: null, value: null, comparison_value: null, n_responses: null, num_comparison: null, den_comparison: null,
  text_value: null, confirms_preloaded: null, preloaded: null, no_data: null, justification: "", observations: "", state: "borrador",
  channel: "en_linea", version: 1, captured_by: null, updated_at: "", program_id: "p", period_id: "per", period_code: "2026-2",
  period_state: "abierto", cutoff_program: "2026-10-15", program_name: "Programa A", campus_id: null, campus_name: null,
  description: "", function_id: "ensenanza", level: "procesos", unit: "numero", numerator_def: "", denominator_def: null, factor: 1,
  aggregation: "suma", direction: "mayor_mejor", periodicity: "semestral", capture_mode: "manual", evidence_type: null,
  evidence_required: false, variation_threshold: 30, range_min: null, range_max: null, n_minimum: null, allows_over_one: false,
  target_numeric: null, target_text: null, previous_value: null, previous_period: null, return_reason: null, return_comment: null,
  evidence_count: 0, assignment_id: "a", indicator_id: "i",
} as const;

const row = (over: Partial<CaptureRow>): CaptureRow => ({ ...(base as unknown as CaptureRow), id: over.code ?? "x", code: "X", name: "Indicador", calc_type: "conteo", ...over });
const sheet = (r: CaptureRow): SheetDraft => ({ ...draftOf(r), observations: r.observations, evidenceUrl: "" });

describe("qué celda se edita", () => {
  it("un conteo solo tiene valor; una razón, numerador y denominador; un puntaje, n", () => {
    const conteo = row({ code: "E13", calc_type: "conteo" });
    const razon = row({ code: "E04", calc_type: "razon", factor: 100 });
    const puntaje = row({ code: "E10", calc_type: "puntaje" });
    expect(isEditable(conteo, sheet(conteo), "numerator")).toBe(true);
    expect(isEditable(conteo, sheet(conteo), "denominator")).toBe(false);
    expect(isEditable(razon, sheet(razon), "denominator")).toBe(true);
    expect(isEditable(puntaje, sheet(puntaje), "n")).toBe(true);
    expect(isEditable(razon, sheet(razon), "n")).toBe(false);
  });

  it("un precargado se bloquea hasta declarar discrepancia", () => {
    const r = row({ code: "E01", calc_type: "razon", capture_mode: "precargado", confirms_preloaded: true });
    expect(isEditable(r, sheet(r), "numerator")).toBe(false);
    expect(isEditable(r, sheet(r), "confirm")).toBe(true);
    expect(isEditable(r, { ...sheet(r), confirma: false }, "numerator")).toBe(true);
  });

  it("«No aplica» bloquea los números y deja la justificación", () => {
    const r = row({ code: "I01" });
    const d = { ...sheet(r), noAplica: "no_aplica" as const };
    expect(isEditable(r, d, "numerator")).toBe(false);
    expect(isEditable(r, d, "justification")).toBe(true);
  });

  it("un registro enviado o de un periodo cerrado no se edita", () => {
    const sent = row({ code: "I04", state: "enviado" });
    const closed = row({ code: "I04", period_state: "cerrado" });
    expect(isEditable(sent, sheet(sent), "numerator")).toBe(false);
    expect(isEditable(closed, sheet(closed), "justification")).toBe(false);
  });
});

describe("escribir y pegar", () => {
  it("entiende coma decimal, punto de miles, Sí/No y No aplica", () => {
    const r = row({});
    const d = sheet(r);
    expect(writeCell(d, "numerator", "1.200")).toEqual({ draft: expect.objectContaining({ numerador: 1200 }) });
    expect(writeCell(d, "numerator", "89,5")).toEqual({ draft: expect.objectContaining({ numerador: 89.5 }) });
    expect(writeCell(d, "confirm", "si")).toEqual({ draft: expect.objectContaining({ confirma: true }) });
    expect(writeCell(d, "noData", "No aplica")).toEqual({ draft: expect.objectContaining({ noAplica: "no_aplica" }) });
    expect(writeCell(d, "numerator", "muchos")).toEqual({ error: "«muchos» no es un número." });
  });

  it("pega un bloque copiado de Excel y salta lo bloqueado", () => {
    const rows = [row({ id: "r1", code: "E04", calc_type: "razon", factor: 100 }), row({ id: "r2", code: "E13", calc_type: "conteo" })];
    const drafts = new Map(rows.map((r) => [r.id, sheet(r)]));
    const block = parseClipboard("430\t480\r\n3\t99\r\n");
    const r = paste(rows, drafts, ["numerator", "denominator"], { row: 0, col: 0 }, block);
    expect(r.written).toBe(3);
    expect(r.skipped).toBe(1); // el 99 cae en el denominador de un conteo
    expect(r.drafts.get("r1")).toMatchObject({ numerador: 430, denominador: 480 });
    expect(r.drafts.get("r2")).toMatchObject({ numerador: 3, denominador: null });
  });
});

describe("mismas validaciones que la ficha", () => {
  it("V01, V03 y V07 con el servicio único", () => {
    const empty = row({ code: "E13", evidence_required: true, evidence_type: "Acta" });
    expect(issuesOf(empty).map((i) => i.code)).toEqual(expect.arrayContaining(["V01", "V07"]));
    const ratio = row({ code: "E04", calc_type: "razon", factor: 100, numerator: 5, denominator: 4 });
    expect(issuesOf(ratio).map((i) => i.code)).toContain("V03");
  });

  it("V05 frente al periodo anterior validado", () => {
    const r = row({ code: "E13", numerator: 9, previous_value: 3, previous_period: "2025-2" });
    expect(issuesOf(r).find((i) => i.code === "V05")?.message).toMatch(/2025-2/);
  });
});
