import { describe, expect, it } from "vitest";
import { HEADERS, parseImport, type ImportContext } from "./template";

const ctx: ImportContext = {
  indicators: [
    { id: "i-e04", code: "E04", name: "Tasa de retención", measure: "porcentaje", fn: "ensenanza" },
    { id: "i-e18", code: "E18", name: "Percepción de empleadores", measure: "texto", fn: "ensenanza" },
  ],
  campuses: [
    { id: "bga", name: "Bucaramanga", slug: "bucaramanga" },
    { id: "cuc", name: "Cúcuta", slug: "cucuta" },
  ],
  sites: [{ programId: "fis", campusId: "bga", programName: "Fisioterapia", campusName: "Bucaramanga" }],
  values: [{ indicatorId: "i-e04", year: 2025, programId: null, campusId: null, valueNum: 80, valueText: "", notApplicable: false }],
};

const table = (...rows: string[][]) => [[...HEADERS], ...rows];
const row = (code: string, year: string, scope: string, sede = "", programa = "", valor = "", extra: string[] = []) => [
  code, "", year, scope, sede, programa, valor, ...extra,
];

describe("parseImport", () => {
  it("lee global, por sede y por programa, y dice qué es nuevo, qué cambia y qué es igual", () => {
    const result = parseImport(
      table(
        row("E04", "2025", "Global", "", "", "80"),
        row("E04", "2025", "Sede", "Cucuta", "", "78,5 %"),
        row("e04", "2025", "Programa", "", "Fisioterapia · Bucaramanga", "71"),
        row("E04", "2024", "Global", "", "", "", ["", "", "Sí"]),
      ),
      ctx,
    );
    expect(result.problems).toEqual([]);
    expect(result.rows.map((r) => [r.row.campus_id, r.row.program_id, r.row.value_num, r.state])).toEqual([
      [null, null, 80, "igual"],
      ["cuc", null, 78.5, "nueva"],
      ["bga", "fis", 71, "nueva"],
      [null, null, null, "nueva"],
    ]);
    expect(result.rows[3].row.not_applicable).toBe(true);
  });

  it("acepta numerador y denominador, y texto en fichas que se miden con texto", () => {
    const result = parseImport(
      table(row("E04", "2026", "Global", "", "", "", ["45", "50"]), row("E18", "2026", "Global", "", "", "Media-Alta")),
      ctx,
    );
    expect(result.problems).toEqual([]);
    expect(result.rows[0].row).toMatchObject({ numerator: 45, denominator: 50, value_num: null });
    expect(result.rows[1].row).toMatchObject({ value_text: "Media-Alta", value_num: null });
  });

  it("dice por número de fila qué está mal", () => {
    const result = parseImport(
      table(
        row("X99", "2025", "Global", "", "", "1"),
        row("E04", "20x5", "Global", "", "", "1"),
        row("E04", "2025", "Sede", "", "", "1"),
        row("E04", "2025", "Programa", "", "Medicina · Bogotá", "1"),
        row("E04", "2025", "Campus", "", "", "1"),
        row("E04", "2025", "Global", "", "", "mucho"),
        row("E04", "2023", "Global", "", "", "1"),
        row("E04", "2023", "Global", "", "", "2"),
      ),
      ctx,
    );
    expect(result.problems.map((p) => p.line)).toEqual([2, 3, 4, 5, 6, 7, 9]);
    expect(result.problems[0].message).toMatch(/X99/);
    expect(result.problems[6].message).toMatch(/Repite la fila 8/);
  });

  it("ignora las filas de la plantilla que quedaron sin valor", () => {
    const result = parseImport(table(row("E04", "2025", "Global"), row("E18", "2025", "Global", "", "", "Alta")), ctx);
    expect(result.empty).toBe(1);
    expect(result.rows).toHaveLength(1);
  });
});

describe("fillTemplate", () => {
  it("la plantilla que se descarga se puede llenar y volver a leer", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const { fillTemplate } = await import("./template");
    const { workbookToTables } = await import("../../admin/institucion/structure-sheet");
    const book = new ExcelJS.Workbook();
    fillTemplate(book, ctx, 2025);
    const sheet = book.getWorksheet("Cifras")!;
    // Fila 2: E04 global 2025 (ya viene), se le pone valor; se añade una fila por programa.
    sheet.getCell("G2").value = "81";
    sheet.addRow(["E04", "", 2025, "Programa", "", "Fisioterapia · Bucaramanga", "70"]);
    const again = new ExcelJS.Workbook();
    await again.xlsx.load(await book.xlsx.writeBuffer());
    const table = workbookToTables(again).Cifras;
    const result = parseImport(table, ctx);
    expect(result.problems).toEqual([]);
    expect(result.rows.map((r) => [r.row.indicator_code, r.row.program_id, r.row.value_num, r.state])).toEqual([
      ["E04", null, 81, "cambia"],
      ["E04", "fis", 70, "nueva"],
    ]);
    expect(result.empty).toBe(1); // E18 sin valor
    expect(again.getWorksheet("Listas")).toBeDefined();
  });
});
