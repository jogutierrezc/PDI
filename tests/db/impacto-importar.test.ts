/* =============================================================================
   Fase 2 · la matriz real importada y guardada como borrador.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { resolve } from "node:path";
import { importMatrix } from "../../src/modules/impacto/import/matrix";
import type { MatrixImport } from "../../src/modules/impacto/import/matrix";
import { PEOPLE, createTestDb, errorOf } from "./harness";
import type { TestDb } from "./harness";

let t: TestDb;
let matrix: MatrixImport;
let payload: string;

beforeAll(async () => {
  t = await createTestDb();
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(resolve(__dirname, "../../UDES_Matriz_Impacto_Institucional_vr7.xlsx"));
  matrix = importMatrix(book);
  payload = JSON.stringify({ sourceFile: "UDES_Matriz_Impacto_Institucional_vr7.xlsx", ...matrix });
});

afterAll(async () => {
  await t.close();
});

/** Como la administración, y confirmando lo importado. */
const importAsAdmin = (carry = true) =>
  t.asUser(
    PEOPLE.admin,
    async (q) => (await q<{ r: Record<string, unknown> }>("select imp_import_catalog($1::jsonb, $2) as r", [payload, carry]))[0].r,
    { commit: true },
  );

describe("importar la vr7", () => {
  it("solo la administración de Impacto", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select imp_import_catalog($1::jsonb)", [payload])))).toMatch(
      /Solo la administración/,
    );
  });

  it("crea la versión 1 en borrador con 106 indicadores, 93 oficiales y 13 sugeridos", async () => {
    const r = await importAsAdmin();
    expect(r).toMatchObject({ number: 1, indicators: 106, official: 93, suggested: 13, findings: matrix.findings.length, carried: 0 });
    const [v] = await t.q<{ state: string; source_file: string }>("select state, source_file from imp_catalog_versions where number = 1");
    expect(v).toEqual({ state: "borrador", source_file: "UDES_Matriz_Impacto_Institucional_vr7.xlsx" });
  });

  it("guarda los indicadores con lo que trae la matriz y su rastro", async () => {
    const [i01] = await t.q<Record<string, unknown>>(
      "select code, name, unit, unit_original, matrix_sheet, matrix_row, validator_function from imp_indicators where code = 'I01'",
    );
    expect(i01).toMatchObject({
      code: "I01",
      name: "Estudiantes vinculados a semilleros",
      unit: null,
      unit_original: "1920",
      validator_function: "investigacion",
    });
    expect(i01.matrix_sheet).toMatch(/INVESTIGACI/);
  });

  it("guarda metas con su año y la línea base solo cuando es un número", async () => {
    const [years] = await t.q<{ ext: number[]; inv: number[] }>(`
      select array(select distinct t.year from imp_targets t join imp_indicators i on i.id = t.indicator_id where i.function_id = 'extension' order by 1)::int[] as ext,
             array(select distinct t.year from imp_targets t join imp_indicators i on i.id = t.indicator_id where i.function_id = 'investigacion' order by 1)::int[] as inv`);
    expect(years.ext.every((y) => y === 2025 || y === 2028)).toBe(true);
    expect(years.inv.every((y) => y === 2026 || y === 2028)).toBe(true);
    const [bases] = await t.q<{ n: number }>("select count(*)::int as n from imp_baselines");
    expect(bases.n).toBe(matrix.indicators.filter((i) => i.baseline).length);
  });

  it("guarda las alineaciones y amplía el catálogo maestro", async () => {
    const [n] = await t.q<{ n: number }>("select count(*)::int as n from imp_alignments");
    expect(n.n).toBe(new Set(matrix.indicators.flatMap((i) => i.alignments.map((a) => `${i.code}|${a.kind}|${a.code}`))).size);
    const [dims] = await t.q<{ n: number }>("select count(*)::int as n from imp_master_catalog where kind = 'dimension'");
    expect(dims.n).toBe(matrix.dimensions.length);
    const [src] = await t.q<{ n: number }>("select count(*)::int as n from imp_master_catalog where kind = 'fuente'");
    expect(src.n).toBe(matrix.sources.length);
  });

  it("guarda los hallazgos abiertos, con hoja, fila, columna, tipo, valor y sugerencia", async () => {
    const rows = await t.q<{ kind: string; n: number }>("select kind, count(*)::int as n from imp_import_findings where state = 'abierto' group by kind");
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.n]));
    expect(byKind.linea_base_por_definir).toBe(81);
    expect(byKind.nivel_variante).toBe(3);
    expect(byKind.unidad_numerica).toBe(1);
    expect(byKind.dimension_por_definir).toBe(13);
    expect(byKind.anio_meta_distinto).toBe(1);
  });

  it("no deja importar otra matriz mientras haya un borrador", async () => {
    expect(await errorOf(importAsAdmin())).toMatch(/Ya hay una versión del catálogo en borrador/);
  });

  it("descartar el borrador lo borra todo", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("select imp_discard_draft()"), { commit: true });
    const [n] = await t.q<{ n: number }>("select count(*)::int as n from imp_indicators");
    expect(n.n).toBe(0);
  });

  it("al reimportar, copia la ficha de la versión publicada por código", async () => {
    // Versión 1 publicada con la ficha de I01 completa.
    await importAsAdmin();
    await t.q(`update imp_indicators set calc_type = 'conteo', numerator_def = 'Estudiantes activos', factor = 1,
                 aggregation = 'suma', direction = 'mayor_mejor', periodicity = 'semestral', report_level = 'programa_sede',
                 applies_degrees = '{pregrado}', capture_mode = 'manual', unit = 'numero', in_pilot = true
               where code = 'I01'`);
    await t.q("update imp_catalog_versions set state = 'publicada', published_at = now() where state = 'borrador'");

    const r = await importAsAdmin(true);
    expect(r).toMatchObject({ number: 2, indicators: 106, carried: 1 });
    const [i01] = await t.q<{ calc_type: string; in_pilot: boolean; unit: string }>(
      "select i.calc_type, i.in_pilot, i.unit from imp_indicators i join imp_catalog_versions v on v.id = i.version_id where v.number = 2 and i.code = 'I01'",
    );
    expect(i01).toEqual({ calc_type: "conteo", in_pilot: true, unit: "numero" });
  });
});
