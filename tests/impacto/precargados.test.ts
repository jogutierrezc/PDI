/* Fase 4 · lectura del archivo de precargados. */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parsePreloadCsv, parsePreloadWorkbook, preloadTemplate } from "../../src/modules/impacto/import/preloaded";

describe("archivo de precargados", () => {
  it("lee el CSV de la plantilla, con «;», BOM, comillas y coma decimal", () => {
    const csv = '\uFEFFindicador;programa_snies;programa;sede;numerador;denominador;n\r\nE04;900001;"Programa ""A""";Bucaramanga;430;480;\r\nE10;900001;Programa A;;151,2;;38\r\n';
    const r = parsePreloadCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.items).toEqual([
      { row: 2, indicator: "E04", program: "900001", campus: "Bucaramanga", numerator: 430, denominator: 480, n: null },
      { row: 3, indicator: "E10", program: "900001", campus: "", numerator: 151.2, denominator: null, n: 38 },
    ]);
  });

  it("acepta coma como separador y encabezados sin tildes ni mayúsculas", () => {
    const r = parsePreloadCsv("Indicador,SNIES,Sede,Numerador,Denominador\nE04,900001,Cúcuta,210,240\n");
    expect(r.items[0]).toMatchObject({ indicator: "E04", program: "900001", campus: "Cúcuta", numerator: 210, denominator: 240 });
  });

  it("reporta por fila lo que no es un número y las columnas que faltan", () => {
    expect(parsePreloadCsv("indicador;sede\nE04;x\n").errors[0].message).toMatch(/programa_snies/);
    const r = parsePreloadCsv("indicador;programa_snies;numerador\nE04;900001;muchos\n");
    expect(r.errors).toEqual([{ row: 2, message: "«muchos» no es un número (numerador)." }]);
  });

  it("lee la primera hoja de un Excel", () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Hoja1");
    sheet.addRow(["indicador", "programa_snies", "sede", "numerador", "denominador"]);
    sheet.addRow(["E01", "900003", "", 18, 22]);
    expect(parsePreloadWorkbook(book).items).toEqual([{ row: 2, indicator: "E01", program: "900003", campus: "", numerator: 18, denominator: 22, n: null }]);
  });

  it("la plantilla se vuelve a leer tal cual", () => {
    const csv = preloadTemplate([{ indicator: "E04", snies: "900001", program: "Programa A", campus: "Bucaramanga" }]);
    const r = parsePreloadCsv(csv.replace(";;;\r\n", ";430;480;\r\n"));
    expect(r.items[0]).toMatchObject({ indicator: "E04", program: "900001", campus: "Bucaramanga", numerator: 430, denominator: 480 });
  });
});
