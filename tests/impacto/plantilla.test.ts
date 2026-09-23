/* =============================================================================
   Fase 6 · la plantilla Excel sin base de datos: estructura, celdas abiertas
   y cerradas, validaciones, lectura de vuelta y clasificación de filas.
   ========================================================================== */

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { CaptureRow } from "../../src/modules/impacto/data/capture-db";
import { SHEET, TEMPLATE_COLUMNS, buildTemplate, openKeys } from "../../src/modules/impacto/excel/template";
import type { SignedTemplate } from "../../src/modules/impacto/excel/template";
import { annotate, classify, countByStatus, payloadOf, readTemplate } from "../../src/modules/impacto/excel/import";

const base = {
  numerator: null, denominator: null, value: null, comparison_value: null, n_responses: null, num_comparison: null, den_comparison: null,
  text_value: null, confirms_preloaded: null, preloaded: null, no_data: null, justification: "", observations: "", state: "borrador",
  channel: "en_linea", version: 1, captured_by: null, updated_at: "2026-09-20T10:00:00Z", program_id: "p", period_id: "per",
  period_code: "2026-2", period_state: "abierto", cutoff_program: "2026-10-15", program_name: "Programa A", campus_id: null,
  campus_name: null, description: "", function_id: "ensenanza", level: "procesos", unit: "numero", numerator_def: "Qué se cuenta",
  denominator_def: null, factor: 1, aggregation: "suma", direction: "mayor_mejor", periodicity: "semestral", capture_mode: "manual",
  evidence_type: null, evidence_required: false, variation_threshold: 30, range_min: null, range_max: null, n_minimum: null,
  allows_over_one: false, target_numeric: null, target_text: null, previous_value: null, previous_period: null, return_reason: null,
  return_comment: null, evidence_count: 0, indicator_id: "i", name: "Indicador", calc_type: "conteo",
} as const;

const row = (over: Partial<CaptureRow> & { id: string; code: string }): CaptureRow =>
  ({ ...(base as unknown as CaptureRow), assignment_id: `a-${over.id}`, ...over }) as CaptureRow;

const rows: CaptureRow[] = [
  row({ id: "r1", code: "E04", name: "Tasa de retención", calc_type: "razon", factor: 100, capture_mode: "precargado", unit: "porcentaje",
    denominator_def: "Matriculados", campus_id: "c1", campus_name: "Bucaramanga", numerator: 430, denominator: 480, confirms_preloaded: true }),
  row({ id: "r2", code: "E13", name: "Innovaciones", numerator: 3 }),
  row({ id: "r3", code: "E10", name: "Saber Pro", calc_type: "puntaje", range_min: 0, range_max: 300, n_minimum: 10 }),
  row({ id: "r4", code: "I04", name: "Profesores en investigación", function_id: "investigacion", level: "insumos", state: "enviado", numerator: 12 }),
];

const signed: SignedTemplate = {
  templateId: "11111111-1111-4111-8111-111111111111",
  programId: "p",
  periodId: "per",
  periodCode: "2026-2",
  cutoffProgram: "2026-10-15",
  catalogVersionId: "v1",
  catalogVersion: 1,
  generatedAt: "2026-09-21T10:00:00Z",
  assignmentIds: rows.map((r) => r.assignment_id),
  signature: "abc123",
  password: "secreta",
};

/** Arma la plantilla, la escribe y la vuelve a leer, como pasaría con el archivo real. */
async function roundTrip(edit?: (book: ExcelJS.Workbook) => void) {
  const book = await buildTemplate(ExcelJS, { signed, programName: "Programa A", rows });
  edit?.(book);
  const buffer = await book.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buffer as ArrayBuffer);
  return back;
}

const rowOf = (book: ExcelJS.Workbook, code: string) => {
  const sheet = book.getWorksheet(SHEET.records)!;
  let found: ExcelJS.Row | undefined;
  sheet.eachRow((r) => {
    if (r.getCell(2).value === code) found = r;
  });
  return found!;
};

describe("la plantilla", () => {
  it("trae las cuatro hojas: CATALOGOS oculta y CONTROL muy oculta", async () => {
    const book = await roundTrip();
    expect(book.worksheets.map((s) => s.name)).toEqual(["INSTRUCCIONES", "REGISTROS", "CATALOGOS", "CONTROL"]);
    expect(book.getWorksheet(SHEET.catalogs)!.state).toBe("hidden");
    expect(book.getWorksheet(SHEET.control)!.state).toBe("veryHidden");
  });

  it("REGISTROS tiene las columnas A–U y la A oculta", async () => {
    const sheet = (await roundTrip()).getWorksheet(SHEET.records)!;
    expect(TEMPLATE_COLUMNS).toHaveLength(21);
    TEMPLATE_COLUMNS.forEach((c, i) => expect(sheet.getRow(1).getCell(i + 1).value).toBe(c.header));
    expect(sheet.getColumn(1).hidden).toBe(true);
  });

  // ExcelJS no relee la protección de un archivo: se revisa el libro recién armado.
  const fresh = () => buildTemplate(ExcelJS, { signed, programName: "Programa A", rows });

  it("las hojas quedan protegidas y no dejan insertar ni borrar filas o columnas", async () => {
    const book = await fresh();
    for (const name of [SHEET.records, SHEET.control, SHEET.instructions]) {
      const protection = (book.getWorksheet(name) as unknown as { sheetProtection: Record<string, unknown> }).sheetProtection;
      expect(protection.sheet, name).toBe(true);
      expect(protection.insertRows).toBe(false);
      expect(protection.deleteRows).toBe(false);
      expect(protection.insertColumns).toBe(false);
      expect(protection.deleteColumns).toBe(false);
    }
  });

  it("abre solo las celdas que aplican al tipo: amarillo lo editable, gris lo demás", async () => {
    const book = await fresh();
    const e13 = rowOf(book, "E13");
    expect(e13.getCell("J").protection?.locked).toBe(false);
    expect(e13.getCell("K").protection?.locked).toBe(true);
    expect((e13.getCell("J").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFFFF2CC");
    expect((e13.getCell("K").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFE7E6E6");
    const e04 = rowOf(book, "E04");
    expect(e04.getCell("K").protection?.locked).toBe(false);
    expect(e04.getCell("O").protection?.locked).toBe(false);
    const e10 = rowOf(book, "E10");
    expect(e10.getCell("L").protection?.locked).toBe(false);
    expect(openKeys(rows[2])).toContain("n");
  });

  it("una fila enviada queda toda bloqueada", async () => {
    const i04 = rowOf(await fresh(), "I04");
    for (const c of TEMPLATE_COLUMNS) expect(i04.getCell(c.letter).protection?.locked, c.letter).toBe(true);
  });

  it("valida números ≥ 0, el rango del puntaje y las listas de O y P", async () => {
    const book = await roundTrip();
    const e13 = rowOf(book, "E13");
    expect(e13.getCell("J").dataValidation).toMatchObject({ type: "decimal", operator: "greaterThanOrEqual" });
    expect(rowOf(book, "E10").getCell("J").dataValidation).toMatchObject({ type: "decimal", operator: "between", formulae: [0, 300] });
    expect(rowOf(book, "E04").getCell("O").dataValidation).toMatchObject({ type: "list" });
    expect(e13.getCell("P").dataValidation).toMatchObject({ type: "list" });
  });

  it("prellena lo guardado y calcula el valor con fórmula", async () => {
    const e04 = rowOf(await roundTrip(), "E04");
    expect(e04.getCell("J").value).toBe(430);
    expect(e04.getCell("O").value).toBe("Sí");
    expect((e04.getCell("T").value as { formula: string }).formula).toContain("J2/K2*100");
  });
});

describe("leer la plantilla de vuelta", () => {
  it("recupera el CONTROL y solo las celdas editables con algo escrito", async () => {
    const read = readTemplate(await roundTrip());
    expect(read.structure).toEqual([]);
    expect(read.control).toMatchObject({ templateId: signed.templateId, signature: "abc123", assignmentIds: signed.assignmentIds });
    expect(read.rows.find((r) => r.assignmentId === "a-r2")?.cells).toEqual({ numerator: "3" });
  });

  it("una columna cambiada o CONTROL incompleto rechazan el archivo completo", async () => {
    const renamed = readTemplate(await roundTrip((b) => (b.getWorksheet(SHEET.records)!.getRow(1).getCell(10).value = "Valor")));
    expect(renamed.structure[0]).toMatch(/columna J/);
    const broken = readTemplate(
      await roundTrip((b) => {
        b.getWorksheet(SHEET.control)!.getRow(7).getCell(2).value = "";
      }),
    );
    expect(broken.structure.join(" ")).toMatch(/CONTROL fue modificada: faltan huella/);
    const noSheet = readTemplate(await roundTrip((b) => b.removeWorksheet(b.getWorksheet(SHEET.catalogs)!.id)));
    expect(noSheet.structure).toContain("Falta la hoja CATALOGOS.");
  });
});

describe("clasificar las filas", () => {
  const withEdits = async (edits: Record<string, Record<string, string | number | null>>) =>
    readTemplate(
      await roundTrip((b) => {
        for (const [code, cells] of Object.entries(edits)) {
          const r = rowOf(b, code);
          for (const [letter, value] of Object.entries(cells)) r.getCell(letter).value = value;
        }
      }),
    );

  it("una celda vacía no borra lo guardado: la fila queda sin cambio", async () => {
    const read = await withEdits({ E13: { J: null } });
    const [e13] = classify(read.rows.filter((r) => r.assignmentId === "a-r2"), rows, signed.generatedAt);
    expect(e13.status).toBe("sin_cambio");
    expect(e13.fields).toEqual({});
  });

  it("clasifica nuevas, actualizadas, omitidas y con error, con fila y columna", async () => {
    const read = await withEdits({ E13: { J: 5 }, E10: { J: 151.5, L: 38 }, I04: { J: 99 }, E04: { O: "No", J: 440, K: "muchos" } });
    const preview = classify(read.rows, rows, signed.generatedAt);
    const by = (code: string) => preview.find((p) => p.record?.code === code)!;
    expect(by("E13")).toMatchObject({ status: "actualizada", fields: { numerator: 5 } });
    expect(by("E10")).toMatchObject({ status: "nueva", fields: { numerator: 151.5, n_responses: 38 } });
    expect(by("I04").status).toBe("omitida");
    expect(by("E04").status).toBe("error");
    expect(by("E04").errors[0].message).toMatch(/^Fila \d+, columna K: «muchos» no es un número\./);
    expect(countByStatus(preview)).toMatchObject({ nueva: 1, actualizada: 1, omitida: 1, error: 1 });
  });

  it("usa el mismo servicio de validación: V03 y V06 con su fila y columna", async () => {
    const read = await withEdits({ E04: { O: "No", J: 500, K: 480 } });
    const [e04] = classify(read.rows.filter((r) => r.assignmentId === "a-r1"), rows, signed.generatedAt);
    const messages = e04.errors.map((e) => e.message).join(" ");
    expect(messages).toMatch(/columna J: El numerador \(500\) no puede ser mayor que el denominador \(480\)/);
    expect(messages).toMatch(/columna Q: Explique la discrepancia/);
  });

  it("marca en conflicto lo que cambió en línea después de generar la plantilla", async () => {
    const changed = rows.map((r) => (r.id === "r2" ? { ...r, updated_at: "2026-09-22T09:00:00Z", numerator: 4 } : r));
    const read = await withEdits({ E13: { J: 6 } });
    const [e13] = classify(read.rows.filter((r) => r.assignmentId === "a-r2"), changed, signed.generatedAt);
    expect(e13.status).toBe("conflicto");
    expect(payloadOf([e13], new Set())).toHaveLength(0);
    expect(payloadOf([e13], new Set([e13.rowNumber]))).toEqual([{ row: e13.rowNumber, recordId: "r2", fields: { numerator: 6 } }]);
  });

  it("devuelve la plantilla con la columna «Errores» y las celdas con error en rojo", async () => {
    const book = await roundTrip((b) => (rowOf(b, "E04").getCell("K").value = "muchos"));
    const preview = classify(readTemplate(book).rows, rows, signed.generatedAt);
    annotate(book, preview);
    const sheet = book.getWorksheet(SHEET.records)!;
    expect(sheet.getRow(1).getCell(22).value).toBe("Errores");
    const e04 = rowOf(book, "E04");
    expect(String(e04.getCell(22).value)).toMatch(/columna K/);
    expect((e04.getCell("K").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFF8D7DA");
    // Y se puede volver a importar: la columna «Errores» no rompe la estructura.
    expect(readTemplate(book).structure).toEqual([]);
  });
});
