import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  canApply,
  columnLetter,
  fillStructureTemplate,
  normalize,
  parseStructureWorkbook,
  rowsToImport,
  workbookToTables,
  type StructureContext,
} from "../../src/modules/admin/institucion/structure-sheet";
import type { InstUnit } from "../../src/modules/admin/institucion/institution-model";

const unit = (over: Partial<InstUnit> & Pick<InstUnit, "id" | "kind" | "code" | "name">): InstUnit => ({
  parentId: null,
  slug: over.code.toLowerCase(),
  description: "",
  position: 0,
  sniesCode: null,
  degreeLevel: null,
  modality: null,
  substantiveFunction: null,
  reportsTo: null,
  ...over,
});

const context: StructureContext = {
  units: [
    unit({ id: "va", kind: "vicerrectoria", code: "VA", name: "Vicerrectoría Académica", substantiveFunction: "ensenanza" }),
    unit({ id: "vadm", kind: "vicerrectoria", code: "VADM", name: "Vicerrectoría Administrativa" }),
    unit({ id: "fcs", kind: "facultad", code: "FCS", name: "Facultad de Ciencias Sociales", reportsTo: "va" }),
    unit({
      id: "der",
      kind: "programa",
      code: "DER",
      name: "Derecho",
      slug: "derecho",
      parentId: "fcs",
      sniesCode: "1001",
      degreeLevel: "pregrado",
      modality: "presencial",
    }),
    unit({ id: "tic", kind: "oficina", code: "TIC", name: "Dirección TIC", parentId: "vadm" }),
    unit({ id: "bib", kind: "otra", code: "BIB", name: "Biblioteca" }),
  ],
  campuses: [
    { id: "c1", slug: "bucaramanga", code: "BUC", name: "Bucaramanga" },
    { id: "c2", slug: "cucuta", code: "CUC", name: "Cúcuta" },
  ],
  offer: [{ programId: "der", campusId: "c1", active: true }],
};

const VICE = ["Código", "Nombre", "Función sustantiva"];
const FAC = ["Código", "Nombre", "Vicerrectoría (código)"];
const OFI = ["Código", "Nombre", "Depende de (código)"];
const PRO = ["SNIES", "Código", "Nombre", "Facultad (código)", "Nivel", "Modalidad", "Sedes"];

const statuses = (result: ReturnType<typeof parseStructureWorkbook>, sheet: string) =>
  result.sheets.find((item) => item.name === sheet)!.rows.map((row) => row.status);

describe("utilidades", () => {
  it("normaliza y nombra columnas", () => {
    expect(normalize("  Vicerrectorías ")).toBe("vicerrectorias");
    expect([columnLetter(0), columnLetter(26)]).toEqual(["A", "AA"]);
  });
});

describe("el libro de la estructura", () => {
  it("pide al menos una hoja de la plantilla", () => {
    const result = parseStructureWorkbook({ Hoja1: [["x"]] }, context);
    expect(result.problems[0]).toContain("no trae ninguna de las hojas");
  });

  it("dice qué columnas faltan en una hoja", () => {
    const result = parseStructureWorkbook({ Programas: [["Código", "Nombre"]] }, context);
    expect(result.problems[0]).toBe(
      "Hoja Programas: faltan las columnas Facultad (código), Nivel, Modalidad, Sedes. Use la plantilla de esta pantalla.",
    );
  });

  it("resuelve padres que vienen en el mismo libro y encuentra las hojas sin tildes", () => {
    const result = parseStructureWorkbook(
      {
        VICERRECTORIAS: [VICE, ["VI", "Vicerrectoría de Investigaciones", "investigación"]],
        Facultades: [FAC, ["FIT", "Facultad de Ingenierías", "vi"]],
        Oficinas: [OFI, ["CAL", "Oficina de Calidad", "SIS"], ["SIS", "Sistema de Calidad", "VI"]],
        Programas: [PRO, ["2002", "ISI", "Ingeniería de Sistemas", "FIT", "Pregrado", "Híbrida", "Bucaramanga, CUC"]],
      },
      context,
    );
    expect(result.problems).toEqual([]);
    expect(result.counts).toEqual({ nuevo: 5, actualizado: 0, sin_cambio: 0, error: 0 });
    const payload = rowsToImport(result);
    expect(payload.find((row) => row.code === "VI")).toMatchObject({ kind: "vicerrectoria", substantive_function: "investigacion", slug: "vicerrectoria-de-investigaciones" });
    expect(payload.find((row) => row.code === "FIT")).toMatchObject({ vice_code: "vi" });
    expect(payload.find((row) => row.code === "CAL")).toMatchObject({ parent_code: "SIS" });
    expect(payload.find((row) => row.code === "ISI")).toMatchObject({
      sheet: "Programas",
      line: 2,
      faculty_code: "FIT",
      modality: "hibrida",
      campuses: ["bucaramanga", "cucuta"],
    });
    expect(canApply(result)).toBe(true);
  });

  it("clasifica sin cambio y actualizado, con lo que cambia", () => {
    const result = parseStructureWorkbook(
      {
        "Vicerrectorías": [VICE, ["VA", "Vicerrectoría Académica", "Enseñanza"], ["VADM", "Vicerrectoría Administrativa y Financiera", ""]],
        Facultades: [FAC, ["FCS", "Facultad de Ciencias Sociales", ""]],
        Oficinas: [OFI, ["TIC", "Dirección TIC", "VADM"], ["BIB", "Biblioteca", "VADM"]],
        Programas: [PRO, ["1001", "DER", "Derecho", "FCS", "pregrado", "PRESENCIAL", "Bucaramanga"]],
      },
      context,
    );
    expect(statuses(result, "Vicerrectorías")).toEqual(["sin_cambio", "actualizado"]);
    expect(statuses(result, "Facultades")).toEqual(["actualizado"]);
    expect(result.sheets[1].rows[0].changes).toEqual(["vicerrectoría: VA → ninguna"]);
    // «Otra» se carga en Oficinas.
    expect(statuses(result, "Oficinas")).toEqual(["sin_cambio", "actualizado"]);
    expect(result.sheets[2].rows[1].changes).toEqual(["depende de: nadie → VADM"]);
    expect(statuses(result, "Programas")).toEqual(["sin_cambio"]);
    // Solo lo que cambia viaja a la base, con el slug de siempre.
    expect(rowsToImport(result).map((row) => [row.code, row.slug])).toEqual([
      ["VADM", "vadm"],
      ["FCS", "fcs"],
      ["BIB", "bib"],
    ]);
  });

  it("los errores dicen hoja, fila y columna", () => {
    const result = parseStructureWorkbook(
      {
        "Vicerrectorías": [VICE, ["VX", "Vicerrectoría X", "Bienestar"]],
        Facultades: [FAC, ["FXX", "", "NOVI"]],
        Oficinas: [OFI, ["FCS", "Pisada", ""], ["OFX", "Oficina X", "FCS"]],
        Programas: [PRO, ["12A", "DER", "Derecho nocturno", "ZZZ", "Tecnólogo", "remota", "Pasto"]],
      },
      context,
    );
    const errors = result.sheets.flatMap((sheet) => sheet.rows.flatMap((row) => row.errors));
    expect(errors).toEqual([
      "Hoja Vicerrectorías, fila 2, columna C: «Bienestar» no es una función sustantiva. Use Investigación, Enseñanza, Extensión o déjela vacía.",
      "Hoja Facultades, fila 2, columna B: falta el nombre.",
      "Hoja Facultades, fila 2, columna C: no existe la vicerrectoría «NOVI».",
      "Hoja Oficinas, fila 2, columna A: el código FCS ya es de «Facultad de Ciencias Sociales» (facultad).",
      "Hoja Oficinas, fila 3, columna C: no existe la vicerrectoría u oficina «FCS».",
      "Hoja Programas, fila 2, columna A: el SNIES «12A» no es un número.",
      "Hoja Programas, fila 2, columna B: el código DER ya es del programa con SNIES 1001.",
      "Hoja Programas, fila 2, columna D: no existe la facultad «ZZZ».",
      "Hoja Programas, fila 2, columna E: «Tecnólogo» no es un nivel. Use Pregrado, Especialización, Maestría, Doctorado.",
      "Hoja Programas, fila 2, columna F: «remota» no es una modalidad. Use Presencial, Virtual, A distancia, Dual, Híbrida.",
      "Hoja Programas, fila 2, columna G: no existe la sede «Pasto».",
    ]);
    expect(canApply(result)).toBe(false);
  });

  it("un código repetido en el libro es error en la segunda aparición", () => {
    const result = parseStructureWorkbook(
      {
        Facultades: [FAC, ["NEW", "Nueva facultad", ""]],
        Oficinas: [OFI, ["new", "Nueva oficina", ""]],
      },
      context,
    );
    expect(result.sheets[2].rows[0].errors).toEqual([
      "Hoja Oficinas, fila 2, columna A: el código new ya está en la hoja Facultades, fila 2.",
    ]);
  });

  it("se puede cargar solo una hoja, y las filas vacías no cuentan", () => {
    const result = parseStructureWorkbook({ Programas: [PRO, ["", "", "", "", "", "", ""], ["", "DER2", "Derecho", "FCS", "Maestría", "Virtual", "Cúcuta"]] }, context);
    expect(result.sheets.map((sheet) => sheet.found)).toEqual([false, false, false, true]);
    expect(rowsToImport(result)[0]).toMatchObject({ line: 3, slug: "derecho-2" });
  });

  it("avisa si no hay unidades debajo de los encabezados", () => {
    expect(parseStructureWorkbook({ Oficinas: [OFI] }, context).problems).toEqual([
      "El libro no trae unidades debajo de los encabezados.",
    ]);
  });
});

describe("la plantilla", () => {
  it("trae lo que existe, listas desplegables, y se lee de vuelta sin cambios", async () => {
    const book = new ExcelJS.Workbook();
    fillStructureTemplate(book, context);
    const again = new ExcelJS.Workbook();
    await again.xlsx.load(await book.xlsx.writeBuffer());
    expect(again.worksheets.map((sheet) => sheet.name)).toEqual([
      "Instrucciones",
      "Vicerrectorías",
      "Facultades",
      "Oficinas",
      "Programas",
      "Listas",
    ]);
    const nivel = again.getWorksheet("Programas")!.getCell("E2").dataValidation;
    expect(nivel).toMatchObject({ type: "list", formulae: ["'Listas'!$B$2:$B$5"] });
    const facultad = again.getWorksheet("Programas")!.getCell("D40").dataValidation;
    expect(facultad.formulae?.[0]).toContain("'Facultades'!$A$2");

    const result = parseStructureWorkbook(workbookToTables(again), context);
    expect(result.problems).toEqual([]);
    expect(result.counts).toEqual({ nuevo: 0, actualizado: 0, sin_cambio: 6, error: 0 });
  });
});
