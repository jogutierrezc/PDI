/* =============================================================================
   Fase 2 · el importador con la matriz real (vr7).

   Los conteos y hallazgos esperados son los de la especificación. Si la
   matriz cambia de versión, esta prueba es la que dice qué se movió.
   ========================================================================== */

import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { resolve } from "node:path";
import { countFindings, importMatrix } from "../../src/modules/impacto/import/matrix";
import type { MatrixImport } from "../../src/modules/impacto/import/matrix";
import { findingsToCsv, findingsToWorkbook } from "../../src/modules/impacto/import/findings-report";

const FILE = resolve(__dirname, "../../UDES_Matriz_Impacto_Institucional_vr7.xlsx");
let result: MatrixImport;

beforeAll(async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(FILE);
  result = importMatrix(book);
});

const of = (fn: string) => result.indicators.filter((i) => i.functionId === fn);
const findings = (kind: string) => result.findings.filter((f) => f.kind === kind);

describe("conteos", () => {
  it("106 indicadores: 37 de Investigación, 27 de Enseñanza y 42 de Extensión", () => {
    expect(result.indicators).toHaveLength(106);
    expect(of("investigacion")).toHaveLength(37);
    expect(of("ensenanza")).toHaveLength(27);
    expect(of("extension")).toHaveLength(42);
  });

  it("93 oficiales y 13 sugeridos", () => {
    expect(result.indicators.filter((i) => i.catalogState === "oficial")).toHaveLength(93);
    expect(result.indicators.filter((i) => i.catalogState === "sugerido")).toHaveLength(13);
  });

  it("códigos I01–I37, E01–E27 y X01–X42 en el orden de la matriz", () => {
    expect(of("investigacion").map((i) => i.code)).toEqual(Array.from({ length: 37 }, (_, k) => `I${String(k + 1).padStart(2, "0")}`));
    expect(of("ensenanza").at(-1)?.code).toBe("E27");
    expect(of("extension").at(-1)?.code).toBe("X42");
    expect(of("investigacion")[0].name).toBe("Estudiantes vinculados a semilleros");
  });

  it("los nombres quedan en una línea y sin espacios dobles", () => {
    expect(result.indicators.every((i) => !/\s{2,}|\n/.test(i.name))).toBe(true);
  });
});

describe("hallazgos esperados de la vr7", () => {
  it("niveles escritos de dos formas en Enseñanza («2. PROCESO»), importados como procesos", () => {
    const rows = findings("nivel_variante");
    expect(rows).toHaveLength(3);
    expect(rows.every((f) => /ENSE/i.test(f.sheet) && f.value.startsWith("2. PROCESO"))).toBe(true);
    const rowsSet = new Set(rows.map((f) => f.row));
    expect(result.indicators.filter((i) => rowsSet.has(i.row) && i.functionId === "ensenanza").every((i) => i.level === "procesos")).toBe(true);
  });

  it("55 variantes distintas de unidad de medida", () => {
    const [summary] = findings("unidades_variantes");
    expect(summary.value).toMatch(/^55 variantes/);
  });

  it("1920 en la unidad de «Estudiantes vinculados a semilleros» (Investigación)", () => {
    const [f] = findings("unidad_numerica");
    expect(findings("unidad_numerica")).toHaveLength(1);
    expect(f.value).toBe("1920");
    expect(f.sheet).toMatch(/INVESTIGACI/i);
    expect(f.suggestion).toMatch(/línea base desplazada/);
    const semilleros = result.indicators.find((i) => i.row === f.row && i.functionId === "investigacion");
    expect(semilleros?.name).toBe("Estudiantes vinculados a semilleros");
    expect(semilleros?.unit).toBeNull();
  });

  it("años de meta distintos: Extensión usa META 2025; Investigación y Enseñanza, META 2026", () => {
    const rows = findings("anio_meta_distinto");
    expect(rows).toHaveLength(1);
    expect(rows[0].sheet).toMatch(/EXTENSI/i);
    expect(rows[0].value).toBe("META 2025");
    expect(of("extension").flatMap((i) => i.targets).every((t) => t.year === 2025 || t.year === 2028)).toBe(true);
    expect(of("investigacion").flatMap((i) => i.targets).every((t) => t.year === 2026 || t.year === 2028)).toBe(true);
  });

  it("líneas base «Por definir»: 27 en Investigación, 12 en Enseñanza y 42 en Extensión, y quedan vacías", () => {
    const bySheet = (re: RegExp) => findings("linea_base_por_definir").filter((f) => re.test(f.sheet)).length;
    expect(bySheet(/INVESTIGACI/i)).toBe(27);
    expect(bySheet(/ENSE/i)).toBe(12);
    expect(bySheet(/EXTENSI/i)).toBe(42);
    const rows = new Set(findings("linea_base_por_definir").map((f) => `${f.sheet}|${f.row}`));
    expect(result.indicators.filter((i) => rows.has(`${i.sheet}|${i.row}`)).every((i) => i.baseline === null)).toBe(true);
  });

  it("responsables múltiples en una misma celda", () => {
    const rows = findings("responsable_multiple");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((f) => f.value.includes("/"))).toBe(true);
  });

  it("formatos distintos de proyecto estratégico, normalizados a Pr1–Pr7", () => {
    expect(findings("proyecto_formato").length).toBeGreaterThan(0);
    expect(findings("proyecto_formato")[0].value).toMatch(/^Proyecto \d/);
    const codes = new Set(result.indicators.flatMap((i) => i.alignments.filter((a) => a.kind === "proyecto").map((a) => a.code)));
    expect([...codes].every((c) => /^Pr[1-7]$/.test(c))).toBe(true);
  });

  it("dimensión «Por definir» en los 13 sugeridos", () => {
    const rows = findings("dimension_por_definir");
    expect(rows).toHaveLength(13);
    const keys = new Set(rows.map((f) => `${f.sheet}|${f.row}`));
    const affected = result.indicators.filter((i) => keys.has(`${i.sheet}|${i.row}`));
    expect(affected.every((i) => i.catalogState === "sugerido" && i.dimension === null)).toBe(true);
  });

  it("cada hallazgo dice hoja, tipo, valor y sugerencia", () => {
    for (const f of result.findings) {
      expect(f.sheet).toBeTruthy();
      expect(f.kind).toBeTruthy();
      expect(f.suggestion.length).toBeGreaterThan(10);
    }
  });
});

describe("normalización", () => {
  it("separa pilares, proyectos y ODS en alineaciones", () => {
    const i01 = result.indicators.find((i) => i.code === "I01")!;
    expect(i01.alignments.filter((a) => a.kind === "pilar").map((a) => a.code)).toEqual(["1", "3"]);
    expect(i01.alignments.filter((a) => a.kind === "ods").map((a) => a.code)).toEqual(["4", "9"]);
  });

  it("toma la línea base numérica y la meta por año", () => {
    const e04 = result.indicators.find((i) => i.name === "Tasa de retención estudiantil")!;
    expect(e04.baseline).toEqual({ year: 2023, value: 0.94 });
    expect(e04.targets).toContainEqual({ year: 2026, numeric: null, text: "+1 pp vs LB" });
    expect(e04.unit).toBe("porcentaje");
  });

  it("no corrige en silencio un porcentaje escrito como fracción", () => {
    const rows = findings("porcentaje_como_fraccion");
    expect(rows.length).toBeGreaterThan(0);
    const e04 = result.indicators.find((i) => i.name === "Tasa de retención estudiantil")!;
    expect(e04.baseline?.value).toBe(0.94);
  });

  it("arma los catálogos de fuentes y de dimensiones por función", () => {
    expect(result.sources.length).toBeGreaterThan(5);
    expect(result.dimensions.some((d) => d.functionId === "investigacion" && d.name === "Formación Investigativa")).toBe(true);
    expect(result.dimensions.some((d) => d.functionId === "extension")).toBe(true);
  });
});

describe("reporte descargable", () => {
  it("CSV con encabezados y una fila por hallazgo", () => {
    const csv = findingsToCsv(result.findings);
    // Sin trim(): se comería el BOM, que es parte de lo que se prueba.
    const lines = csv.replace(/\r\n$/, "").split("\r\n");
    expect(lines[0]).toBe("﻿Hoja;Fila;Columna;Tipo de hallazgo;Valor encontrado;Sugerencia");
    expect(lines).toHaveLength(result.findings.length + 1);
  });

  it("Excel con la hoja de hallazgos y el resumen", async () => {
    const book = await findingsToWorkbook(result.findings, "UDES_Matriz_Impacto_Institucional_vr7.xlsx");
    expect(book.getWorksheet("Hallazgos")?.rowCount).toBe(result.findings.length + 1);
    expect(book.getWorksheet("Resumen")).toBeTruthy();
    const buffer = await book.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it("resumen por tipo", () => {
    console.log(countFindings(result.findings));
  });
});
