/* =============================================================================
   Fase 8 · pruebas de aceptación, de punta a punta.

   Una sola historia, en el orden de los once criterios de la especificación,
   con el mismo código que usa la aplicación: el importador de la matriz, las
   fichas del piloto, el servicio único de validación, la plantilla Excel
   (armarla, diligenciarla, leerla de vuelta y clasificar sus filas) y la
   consolidación. La base es la de todas las migraciones, con RLS.

   Reparto de la historia:
     · Programa A (dirección en línea): 2026-1 validado para tener valor
       anterior; en 2026-2 captura en línea, envía y recorre el flujo.
     · Programa B (dirección por Excel): descarga la plantilla, la diligencia
       y la importa; completa en línea y envía. Allí se prueba también la
       separación de funciones, con una decanatura y una vicerrectoría que
       además capturan en el programa.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PEOPLE, UNITS, createTestDb, errorOf } from "./harness";
import type { Query, TestDb } from "./harness";
import { importMatrix } from "../../src/modules/impacto/import/matrix";
import type { MatrixImport } from "../../src/modules/impacto/import/matrix";
import { findingsToCsv } from "../../src/modules/impacto/import/findings-report";
import { PILOT_SHEETS } from "../../src/modules/impacto/data/pilot-sheets";
import { draftOf, issuesOf, patchOf } from "../../src/modules/impacto/data/capture-db";
import type { CaptureRow } from "../../src/modules/impacto/data/capture-db";
import { blocking } from "../../src/modules/impacto/data/validate";
import type { Draft } from "../../src/modules/impacto/data/validate";
import { consolidate } from "../../src/modules/impacto/data/aggregate";
import { SHEET, buildTemplate } from "../../src/modules/impacto/excel/template";
import type { SignedTemplate } from "../../src/modules/impacto/excel/template";
import { annotate, classify, payloadOf, readTemplate } from "../../src/modules/impacto/excel/import";
import type { PreviewRow } from "../../src/modules/impacto/excel/import";

const ROOT = resolve(__dirname, "../..");
const DIRECTOR_B = "00000000-0000-4000-a000-000000000009";
const CERTIFY = true;

let t: TestDb;
let matrix: MatrixImport;
let versionId: string;
let period1: string;
let period2: string;
let templateA1: SignedTemplate;
let templateB: SignedTemplate;
let filledB: ArrayBuffer;
let previewB: PreviewRow[];

const commit = <T>(user: string, work: (q: Query) => Promise<T>) => t.asUser(user, work, { commit: true });

const rowsOf = (user: string, program: string, period: string) =>
  t.asUser(user, (q) =>
    q<CaptureRow>("select * from imp_capture_rows where program_id = $1 and period_id = $2 order by code, campus_name nulls first", [program, period]),
  );

const find = (rows: CaptureRow[], code: string, campus: string | null = null) => {
  const row = rows.find((r) => r.code === code && r.campus_name === campus);
  if (!row) throw new Error(`No hay registro de ${code}${campus ? ` en ${campus}` : ""}.`);
  return row;
};

/** «Guardar» de la ficha: escribe el borrador si nadie guardó antes (misma `version`). */
async function save(user: string, row: CaptureRow, draft: Draft & { observations?: string }) {
  const patch: Record<string, unknown> = { ...patchOf(draft), channel: "en_linea" };
  const keys = Object.keys(patch);
  const done = await commit(user, (q) =>
    q(`update imp_records set ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")} where id = $1 and version = $2 returning id`, [
      row.id,
      row.version,
      ...Object.values(patch),
    ]),
  );
  return done.length;
}

/** Un borrador completo y coherente para cualquier tipo de cálculo. */
function filled(row: CaptureRow, over: Partial<Draft> = {}): Draft {
  const d = draftOf(row);
  if (row.calc_type === "conteo") d.numerador = 5;
  if (row.calc_type === "razon") Object.assign(d, { numerador: 40, denominador: 50 });
  if (row.calc_type === "puntaje") Object.assign(d, { numerador: 150, n: 30 });
  if (row.calc_type === "comparacion") Object.assign(d, { numerador: 30, denominador: 40, numComparacion: 20, denComparacion: 60 });
  if (row.capture_mode === "precargado") d.confirma = true;
  return { ...d, ...over };
}

const addLink = (user: string, recordId: string, url = "https://drive.udes.edu.co/soporte") =>
  commit(user, (q) => q("insert into imp_evidence (record_id, kind, url, created_by) values ($1, 'url', $2, $3)", [recordId, url, user]));

/** Completa en línea lo que siga vacío y adjunta la evidencia que se exija. */
async function completeOnline(user: string, program: string, period: string) {
  for (const row of await rowsOf(user, program, period)) {
    if (row.state !== "borrador" && row.state !== "devuelto_programa") continue;
    if (row.numerator === null) await save(user, row, filled(row));
    if (row.evidence_required && Number(row.evidence_count) === 0) await addLink(user, row.id);
  }
}

const review = (user: string, ids: string[], action: "aprobar" | "devolver" | "validar", reason: string | null = null, comment = "") =>
  commit(user, (q) => q<{ n: number }>("select imp_review($1::uuid[], $2, $3, $4) as n", [ids, action, reason, comment])).then((r) => r[0].n);

const submit = (user: string, program: string, period: string) =>
  commit(user, (q) => q<{ n: number }>("select imp_submit_program($1, $2, $3) as n", [period, program, CERTIFY])).then((r) => r[0].n);

const sign = (user: string, program: string, period: string) =>
  commit(user, (q) => q<{ r: SignedTemplate }>("select imp_sign_template($1, $2) as r", [period, program])).then((r) => r[0].r);

const verify = (user: string, control: object) =>
  t.asUser(user, (q) => q<{ r: { templateId: string; generatedAt: string } }>("select imp_verify_template($1::jsonb) as r", [JSON.stringify(control)])).then((r) => r[0].r);

/** La fila de REGISTROS de una asignación. */
function sheetRow(book: ExcelJS.Workbook, assignmentId: string) {
  let found: ExcelJS.Row | undefined;
  book.getWorksheet(SHEET.records)!.eachRow((r) => {
    if (r.getCell(1).value === assignmentId) found = r;
  });
  if (!found) throw new Error(`La plantilla no trae la asignación ${assignmentId}.`);
  return found;
}

const reopen = async (buffer: ArrayBuffer) => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  return book;
};

beforeAll(async () => {
  t = await createTestDb();
  // Una dirección para el Programa B, que en la semilla no tiene.
  await t.q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'director.b@prueba.udes.edu.co', '{"full_name": "Dirección del Programa B"}')`, [
    DIRECTOR_B,
  ]);
  await t.q("insert into profiles (id, email, full_name) values ($1, 'director.b@prueba.udes.edu.co', 'Dirección del Programa B') on conflict (id) do nothing", [
    DIRECTOR_B,
  ]);
  await t.q(
    "insert into unit_members (unit_id, profile_id, role, access_role_id) select $1, $2, 'jefe', id from access_roles where key = 'impacto_director'",
    [UNITS.programaB, DIRECTOR_B],
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(join(ROOT, "UDES_Matriz_Impacto_Institucional_vr7.xlsx"));
  matrix = importMatrix(book);
});

afterAll(async () => {
  await t.close();
});

/* --- 1 ------------------------------------------------------------------------------ */

describe("criterio 1 · importar la vr7", () => {
  it("produce 106 indicadores: 37 · 27 · 42, 93 oficiales y 13 sugeridos", async () => {
    const [{ r }] = await commit(PEOPLE.admin, (q) =>
      q<{ r: { versionId: string } }>("select imp_import_catalog($1::jsonb) as r", [JSON.stringify({ sourceFile: "vr7.xlsx", ...matrix })]),
    );
    versionId = r.versionId;
    const counts = await t.q<{ function_id: string; catalog_state: string; n: number }>(
      "select function_id, catalog_state, count(*)::int as n from imp_indicators where version_id = $1 group by 1, 2",
      [versionId],
    );
    const total = (pick: (c: (typeof counts)[number]) => boolean) => counts.filter(pick).reduce((s, c) => s + c.n, 0);
    expect(total(() => true)).toBe(106);
    expect(total((c) => c.function_id === "investigacion")).toBe(37);
    expect(total((c) => c.function_id === "ensenanza")).toBe(27);
    expect(total((c) => c.function_id === "extension")).toBe(42);
    expect(total((c) => c.catalog_state === "oficial")).toBe(93);
    expect(total((c) => c.catalog_state === "sugerido")).toBe(13);
  });

  it("guarda los hallazgos esperados, con hoja, fila, columna, tipo, valor y sugerencia", async () => {
    const findings = await t.q<{ sheet: string; kind: string; value: string | null; suggestion: string | null }>(
      "select sheet, kind, value, suggestion from imp_import_findings where version_id = $1",
      [versionId],
    );
    const of = (kind: string) => findings.filter((f) => f.kind === kind);
    const bySheet = (kind: string, re: RegExp) => of(kind).filter((f) => re.test(f.sheet)).length;

    expect(of("nivel_variante").every((f) => /ENSE/i.test(f.sheet) && f.value!.startsWith("2. PROCESO"))).toBe(true);
    expect(of("nivel_variante").length).toBeGreaterThan(0);
    expect(of("unidades_variantes")[0].value).toMatch(/^55 variantes/);
    expect(of("unidad_numerica")).toEqual([expect.objectContaining({ value: "1920", sheet: expect.stringMatching(/INVESTIGACI/i) })]);
    expect(of("anio_meta_distinto")).toEqual([expect.objectContaining({ value: "META 2025", sheet: expect.stringMatching(/EXTENSI/i) })]);
    expect([bySheet("linea_base_por_definir", /INVESTIGACI/i), bySheet("linea_base_por_definir", /ENSE/i), bySheet("linea_base_por_definir", /EXTENSI/i)]).toEqual([
      27, 12, 42,
    ]);
    expect(of("responsable_multiple").length).toBeGreaterThan(0);
    expect(of("proyecto_formato").length).toBeGreaterThan(0);
    expect(of("dimension_por_definir")).toHaveLength(13);
    expect(findings.every((f) => f.suggestion && f.suggestion.length > 10)).toBe(true);
  });

  it("el reporte de hallazgos se descarga con sus seis columnas", () => {
    const [head, ...lines] = findingsToCsv(matrix.findings).split(/\r?\n/).filter(Boolean);
    expect(head).toBe(String.fromCharCode(0xfeff) + "Hoja;Fila;Columna;Tipo de hallazgo;Valor encontrado;Sugerencia");
    expect(lines.length).toBe(matrix.findings.length);
  });
});

/* --- 2 ------------------------------------------------------------------------------ */

describe("criterio 2 · fichas del piloto y versión 1 publicada e inmutable", () => {
  it("sin las fichas completas la versión no se publica", async () => {
    expect(await errorOf(commit(PEOPLE.admin, (q) => q("select imp_publish_catalog($1)", [versionId])))).toBeTruthy();
  });

  it("con las 13 fichas completas se publica la versión 1", async () => {
    await commit(PEOPLE.admin, async (q) => {
      for (const { name, columns } of PILOT_SHEETS) {
        const keys = Object.keys(columns);
        const done = await q(
          `update imp_indicators set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where version_id = $1 and name = $${keys.length + 2} returning id`,
          [versionId, ...Object.values(columns), name],
        );
        expect(done, name).toHaveLength(1);
      }
    });
    const pilot = await t.q<{ code: string; sheet_complete: boolean }>(
      "select code, sheet_complete from imp_indicators_admin where version_id = $1 and in_pilot order by code",
      [versionId],
    );
    expect(pilot).toHaveLength(13);
    expect(pilot.every((p) => p.sheet_complete)).toBe(true);

    await commit(PEOPLE.admin, (q) => q("select imp_publish_catalog($1)", [versionId]));
    const [v] = await t.q<{ number: number; state: string; published_at: Date | null }>("select number, state, published_at from imp_catalog_versions where id = $1", [
      versionId,
    ]);
    expect(v).toMatchObject({ number: 1, state: "publicada" });
    expect(v.published_at).not.toBeNull();
  });

  it("la versión publicada no se edita, ni siquiera por la administración", async () => {
    const edit = commit(PEOPLE.admin, (q) => q("update imp_indicators set name = 'Otro nombre' where version_id = $1 and code = 'E04'", [versionId]));
    expect(await errorOf(edit)).toMatch(/publicada/);
    expect(await errorOf(t.q("delete from imp_indicators where version_id = $1", [versionId]))).toMatch(/publicada/);
  });

  it("un cambio posterior crea la versión 2 en borrador y la 1 no cambia", async () => {
    await commit(PEOPLE.admin, (q) => q("select imp_new_draft()"));
    const versions = await t.q<{ number: number; state: string; n: number }>(
      "select v.number, v.state, (select count(*)::int from imp_indicators i where i.version_id = v.id) as n from imp_catalog_versions v order by number",
    );
    expect(versions).toEqual([
      { number: 1, state: "publicada", n: 106 },
      { number: 2, state: "borrador", n: 106 },
    ]);
    await commit(PEOPLE.admin, (q) => q("select imp_discard_draft()"));
  });
});

/* --- 3 ------------------------------------------------------------------------------ */

const openPeriod = (code: string) =>
  commit(PEOPLE.admin, (q) => q<{ r: { periodId: string } }>("select imp_open_period($1, '2026-10-15', '2026-10-25', '2026-11-05', $2) as r", [code, versionId])).then(
    (r) => r[0].r.periodId,
  );

describe("criterio 3 · al abrir 2026-2 cada programa recibe solo lo que le aplica", () => {
  it("la vista previa y la apertura coinciden", async () => {
    const preview = await t.asUser(PEOPLE.admin, (q) => q("select * from imp_preview_assignments('2026-2', $1)", [versionId]));
    period2 = await openPeriod("2026-2");
    const [{ n }] = await t.q<{ n: number }>("select count(*)::int as n from imp_assignments where period_id = $1 and active", [period2]);
    expect(n).toBe(preview.length);
    expect(n).toBeGreaterThan(0);
  });

  it("ningún sugerido, nivel de formación y sede siempre acordes con la ficha y la oferta", async () => {
    const rows = await t.q<{ catalog_state: string; in_pilot: boolean; degree_ok: boolean; report_level: string; campus_id: string | null; offered: boolean }>(
      `select i.catalog_state, i.in_pilot, u.degree_level = any(i.applies_degrees) as degree_ok, i.report_level, a.campus_id,
              a.campus_id is null or exists (select 1 from imp_program_campuses pc where pc.program_id = a.program_id and pc.campus_id = a.campus_id and pc.active) as offered
         from imp_assignments a join imp_indicators i on i.id = a.indicator_id join units u on u.id = a.program_id
        where a.period_id = $1`,
      [period2],
    );
    expect(rows.every((r) => r.catalog_state === "oficial" && r.in_pilot && r.degree_ok && r.offered)).toBe(true);
    expect(rows.every((r) => (r.report_level === "programa_sede") === (r.campus_id !== null))).toBe(true);
  });

  it("por programa: las sedes que ofrece y los niveles que le aplican", async () => {
    const byProgram = await t.q<{ program_id: string; codes: string[]; campuses: string[] }>(
      `select a.program_id, array_agg(distinct i.code order by i.code) as codes, array_remove(array_agg(distinct c.slug), null) as campuses
         from imp_assignments a join imp_indicators i on i.id = a.indicator_id left join campuses c on c.id = a.campus_id
        where a.period_id = $1 group by a.program_id`,
      [period2],
    );
    const of = (id: string) => byProgram.find((p) => p.program_id === id)!;
    expect(of(UNITS.programaA).campuses.sort()).toEqual(["bucaramanga", "cucuta"]);
    expect(of(UNITS.programaZ).campuses).toEqual(["valledupar"]);
    // I01 (semilleros) y E04 (retención) son solo de pregrado: la maestría no los recibe.
    expect(of(UNITS.programaA).codes).toEqual(expect.arrayContaining(["I01", "E04"]));
    expect(of(UNITS.maestria).codes).not.toContain("I01");
    expect(of(UNITS.maestria).codes).not.toContain("E04");
    expect(of(UNITS.maestria).codes.length).toBeGreaterThan(0);
  });
});

/* --- 4 ------------------------------------------------------------------------------ */

describe("criterio 4 · captura en línea, borradores, validaciones y envío", () => {
  beforeAll(async () => {
    // 2026-1 validado para el Programa A: da el «valor del periodo anterior» (V05).
    period1 = await openPeriod("2026-1");
    const e04 = find(await rowsOf(PEOPLE.director, UNITS.programaA, period1), "E04", "Bucaramanga");
    await save(PEOPLE.director, e04, { ...draftOf(e04), numerador: 450, denominador: 500, confirma: true });
    templateA1 = await sign(PEOPLE.director, UNITS.programaA, period1);
    await submit(PEOPLE.director, UNITS.programaA, period1);
    await review(PEOPLE.decano, [e04.id], "aprobar");
    await review(PEOPLE.ve, [e04.id], "validar");
    await commit(PEOPLE.admin, (q) => q("select imp_close_period($1)", [period1]));
  });

  it("la ficha muestra el valor del periodo anterior validado", async () => {
    const e04 = find(await rowsOf(PEOPLE.director, UNITS.programaA, period2), "E04", "Bucaramanga");
    expect(e04.previous_period).toBe("2026-1");
    expect(Number(e04.previous_value)).toBe(90);
  });

  it("«Guardar» deja un borrador incompleto, y el valor lo calcula la base", async () => {
    const rows = await rowsOf(PEOPLE.director, UNITS.programaA, period2);
    const e13 = find(rows, "E13");
    expect(await save(PEOPLE.director, e13, { ...draftOf(e13), observations: "Falta contar las del segundo corte" })).toBe(1);
    const e04 = find(rows, "E04", "Cúcuta");
    await save(PEOPLE.director, e04, { ...draftOf(e04), numerador: 40, denominador: 50, confirma: true });
    const after = await rowsOf(PEOPLE.director, UNITS.programaA, period2);
    expect(find(after, "E13")).toMatchObject({ state: "borrador", numerator: null, observations: "Falta contar las del segundo corte" });
    expect(Number(find(after, "E04", "Cúcuta").value)).toBe(80);
  });

  it("guardar sobre un cambio de otra persona no pisa: se detecta por la versión", async () => {
    const [stale] = (await rowsOf(PEOPLE.director, UNITS.programaA, period2)).filter((r) => r.code === "E03");
    await save(PEOPLE.reportante, stale, filled(stale));
    expect(await save(PEOPLE.director, stale, filled(stale, { numerador: 9 }))).toBe(0);
  });

  it("V01–V09 bloquean el envío con su mensaje", async () => {
    const rows = await rowsOf(PEOPLE.director, UNITS.programaA, period2);
    const codes = (row: CaptureRow, draft: Draft) => blocking(issuesOf(row, draft)).map((i) => i.code);
    const e03 = find(rows, "E03", "Cúcuta");
    const e04 = find(rows, "E04", "Bucaramanga");
    const e10 = find(rows, "E10");
    const e13 = find(rows, "E13");
    const i34 = find(rows, "I34");

    const v01 = blocking(issuesOf(e03, draftOf(e03)));
    expect(v01.map((i) => i.code)).toEqual(["V01"]);
    expect(v01[0].message).toBe("Falta el valor de E03. Si no aplica, márquelo y justifique.");
    expect(codes(e03, filled(e03, { numerador: -3 }))).toContain("V02");
    expect(blocking(issuesOf(e04, filled(e04, { numerador: 600, denominador: 500 })))[0].message).toBe(
      "El numerador (600) no puede ser mayor que el denominador (500).",
    );
    expect(codes(e10, filled(e10, { numerador: 420 }))).toContain("V04");
    const v05 = blocking(issuesOf(e04, filled(e04, { numerador: 250, denominador: 500 })));
    expect(v05.map((i) => i.code)).toEqual(["V05"]);
    expect(v05[0].message).toMatch(/cambió -44,4 % frente a 2026-1\. Explique la variación\./);
    expect(codes(e04, filled(e04, { numerador: 250, denominador: 500, justificacion: "Cambió la cohorte" }))).toEqual([]);
    expect(codes(e03, { ...draftOf(e03), noAplica: "no_aplica" })).toEqual(["V06"]);
    expect(codes(e13, filled(e13))).toEqual(["V07"]);
    expect(codes(i34, filled(i34, { numComparacion: null, denComparacion: null }))).toEqual(["V08"]);
    expect(codes(e03, filled(e03, { evidencias: [{ nombre: "x", url: "drive/sin-protocolo" }] }))).toEqual(["V09"]);

    // Con registros así el paquete no sale: la pantalla lista los errores y no llama al envío.
    expect(rows.filter((r) => blocking(issuesOf(r)).length > 0).length).toBeGreaterThan(0);
  });

  it("completo y sin errores, el paquete se envía con la certificación", async () => {
    await save(PEOPLE.director, find(await rowsOf(PEOPLE.director, UNITS.programaA, period2), "E04", "Bucaramanga"), {
      ...draftOf(find(await rowsOf(PEOPLE.director, UNITS.programaA, period2), "E04", "Bucaramanga")),
      numerador: 460,
      denominador: 500,
      confirma: true,
    });
    await completeOnline(PEOPLE.director, UNITS.programaA, period2);
    const rows = await rowsOf(PEOPLE.director, UNITS.programaA, period2);
    expect(rows.flatMap((r) => blocking(issuesOf(r)))).toEqual([]);

    expect(await errorOf(commit(PEOPLE.director, (q) => q("select imp_submit_program($1, $2, false)", [period2, UNITS.programaA])))).toMatch(/certificar/);
    expect(await submit(PEOPLE.director, UNITS.programaA, period2)).toBe(rows.length);
    const after = await rowsOf(PEOPLE.director, UNITS.programaA, period2);
    expect(after.every((r) => r.state === "enviado")).toBe(true);
    // Enviado, ya no se edita.
    expect(await save(PEOPLE.director, after[0], filled(after[0], { numerador: 1 }))).toBe(0);
  });
});

/* --- 5 ------------------------------------------------------------------------------ */

describe("criterio 5 · plantilla Excel: descargar, diligenciar, importar", () => {
  it("la dirección del Programa B guarda en línea y descarga su plantilla firmada", async () => {
    const e03 = find(await rowsOf(DIRECTOR_B, UNITS.programaB, period2), "E03", "Bucaramanga");
    await save(DIRECTOR_B, e03, { ...draftOf(e03), numerador: 40 });
    // La hora de la plantilla va al segundo: un guardado en el mismo segundo
    // saldría «en conflicto» (el lado seguro). Una persona tarda más que eso.
    await new Promise((done) => setTimeout(done, 1100));

    templateB = await sign(DIRECTOR_B, UNITS.programaB, period2);
    const rows = await rowsOf(DIRECTOR_B, UNITS.programaB, period2);
    expect(templateB.assignmentIds.sort()).toEqual(rows.map((r) => r.assignment_id).sort());
    const book = await buildTemplate(ExcelJS, { signed: templateB, programName: "Programa de Prueba B", rows });
    expect(book.worksheets.map((s) => s.name)).toEqual(["INSTRUCCIONES", "REGISTROS", "CATALOGOS", "CONTROL"]);
    // Lo guardado en línea viene prellenado.
    expect(sheetRow(book, e03.assignment_id).getCell(10).value).toBe(40);

    // La dirección diligencia: dos filas buenas, dos con error y una que borra una celda.
    const pick = (code: string, campus: string | null = null) => sheetRow(book, find(rows, code, campus).assignment_id);
    const e04b = pick("E04", "Bucaramanga");
    e04b.getCell(10).value = 430;
    e04b.getCell(11).value = 500;
    e04b.getCell(15).value = "Sí";
    const e04c = pick("E04", "Cúcuta");
    e04c.getCell(10).value = 600;
    e04c.getCell(11).value = 500;
    pick("E13").getCell(10).value = 2;
    pick("X04", "Bucaramanga").getCell(10).value = "doce";
    const e03row = pick("E03", "Bucaramanga");
    e03row.getCell(10).value = null;
    e03row.getCell(18).value = "Dato revisado con Bienestar";
    filledB = (await book.xlsx.writeBuffer()) as ArrayBuffer;
  });

  it("la vista previa clasifica cada fila y da fila, columna y mensaje de cada error", async () => {
    const read = readTemplate(await reopen(filledB));
    expect(read.structure).toEqual([]);
    const verified = await verify(DIRECTOR_B, read.control!);
    const rows = await rowsOf(DIRECTOR_B, UNITS.programaB, period2);
    previewB = classify(read.rows, rows, verified.generatedAt);
    const status = (code: string, campus: string | null = null) => previewB.find((p) => p.record?.id === find(rows, code, campus).id)!;

    expect(status("E04", "Bucaramanga").status).toBe("nueva");
    expect(status("E13").status).toBe("nueva");
    expect(status("E03", "Bucaramanga")).toMatchObject({ status: "actualizada", fields: { observations: "Dato revisado con Bienestar" } });
    const v03 = status("E04", "Cúcuta");
    expect(v03.status).toBe("error");
    expect(v03.errors[0].message).toBe(`Fila ${v03.rowNumber}, columna J: El numerador (600) no puede ser mayor que el denominador (500).`);
    const text = status("X04", "Bucaramanga");
    expect(text.status).toBe("error");
    expect(text.errors[0].message).toMatch(new RegExp(`^Fila ${text.rowNumber}, columna J: `));
    expect(previewB.filter((p) => p.status === "sin_cambio").length).toBe(rows.length - 5);
  });

  it("carga solo las filas válidas, en borrador, por el canal Excel, y deja el lote", async () => {
    const payload = payloadOf(previewB, new Set());
    expect(payload).toHaveLength(3);
    const [{ r }] = await commit(DIRECTOR_B, (q) =>
      q<{ r: { batchId: number; loaded: number; errors: unknown[] } }>("select imp_import_template($1, $2::jsonb, 'plantilla-B.xlsx', $3::jsonb, null) as r", [
        templateB.templateId,
        JSON.stringify(payload),
        JSON.stringify({ rowsRead: previewB.length, rowsError: 2, report: {} }),
      ]),
    );
    expect(r).toMatchObject({ loaded: 3, errors: [] });
    const rows = await rowsOf(DIRECTOR_B, UNITS.programaB, period2);
    expect(find(rows, "E04", "Bucaramanga")).toMatchObject({ state: "borrador", channel: "excel" });
    expect(Number(find(rows, "E04", "Bucaramanga").value)).toBe(86);
    expect(Number(find(rows, "E13").numerator)).toBe(2);
    expect(find(rows, "E04", "Cúcuta").numerator).toBeNull();
    const [batch] = await t.q<{ rows_read: number; rows_loaded: number; rows_error: number; n: number }>(
      "select rows_read, rows_loaded, rows_error, (select count(*)::int from imp_import_batch_records x where x.batch_id = b.id) as n from imp_import_batches b where id = $1",
      [r.batchId],
    );
    expect(batch).toEqual({ rows_read: previewB.length, rows_loaded: 3, rows_error: 2, n: 3 });
  });

  it("se descarga la misma plantilla con la columna «Errores» y las celdas en rojo", async () => {
    const book = annotate(await reopen(filledB), previewB);
    const sheet = book.getWorksheet(SHEET.records)!;
    expect(sheet.getRow(1).getCell(22).value).toBe("Errores");
    const bad = previewB.find((p) => p.status === "error" && /numerador \(600\)/.test(p.errors[0].message))!;
    expect(String(sheet.getRow(bad.rowNumber).getCell(22).value)).toMatch(/numerador \(600\)/);
    const fill = sheet.getRow(bad.rowNumber).getCell(10).fill as ExcelJS.FillPattern;
    expect(fill.fgColor?.argb).toMatch(/^FF(F|E)/);
  });
});

/* --- 6 ------------------------------------------------------------------------------ */

describe("criterio 6 · plantilla alterada, de otro programa o de un periodo cerrado", () => {
  it("una huella que no coincide: «fue alterada», y no se lee ninguna fila", async () => {
    const book = await reopen(filledB);
    book.getWorksheet(SHEET.control)!.eachRow((row) => {
      if (row.getCell(1).value === "asignaciones") row.getCell(2).value = String(row.getCell(2).value).split(",").slice(1).join(",");
    });
    const read = readTemplate(await reopen((await book.xlsx.writeBuffer()) as ArrayBuffer));
    expect(read.structure.join(" ")).toMatch(/no son de esta plantilla/);
    expect(await errorOf(verify(DIRECTOR_B, read.control!))).toMatch(/alterada/);

    const signed = await reopen(filledB);
    signed.getWorksheet(SHEET.control)!.eachRow((row) => {
      if (row.getCell(1).value === "huella") row.getCell(2).value = "0".repeat(64);
    });
    expect(await errorOf(verify(DIRECTOR_B, readTemplate(signed).control!))).toMatch(/alterada/);
  });

  it("columnas cambiadas: el archivo se rechaza completo antes de verificar", async () => {
    const book = await reopen(filledB);
    book.getWorksheet(SHEET.records)!.getRow(1).getCell(10).value = "Valor";
    const read = readTemplate(book);
    expect(read.structure).toEqual([expect.stringMatching(/columna J de REGISTROS debía llamarse/)]);
  });

  it("la plantilla del Programa B no la sube otro programa", async () => {
    const read = readTemplate(await reopen(filledB));
    expect(await errorOf(verify(PEOPLE.director, read.control!))).toMatch(/otro programa/);
  });

  it("la plantilla de un periodo cerrado se rechaza, también al cargar", async () => {
    const control = {
      templateId: templateA1.templateId,
      programId: templateA1.programId,
      periodId: templateA1.periodId,
      catalogVersionId: templateA1.catalogVersionId,
      generatedAt: templateA1.generatedAt,
      assignmentIds: templateA1.assignmentIds,
      signature: templateA1.signature,
    };
    expect(await errorOf(verify(PEOPLE.director, control))).toMatch(/cerrado/);
    expect(await errorOf(commit(PEOPLE.director, (q) => q("select imp_import_template($1, '[]'::jsonb, 'viejo.xlsx', '{}'::jsonb, null)", [templateA1.templateId])))).toMatch(
      /cerrado/,
    );
  });
});

/* --- 7 ------------------------------------------------------------------------------ */

describe("criterio 7 · una celda vacía no borra lo capturado en línea", () => {
  it("el E03 de Bucaramanga conserva el 40 guardado en línea y recibe la observación del Excel", async () => {
    const e03 = find(await rowsOf(DIRECTOR_B, UNITS.programaB, period2), "E03", "Bucaramanga");
    expect(Number(e03.numerator)).toBe(40);
    expect(e03.observations).toBe("Dato revisado con Bienestar");
  });
});

/* --- 9 y 10 (8 necesita registros validados) ------------------------------------------- */

describe("criterio 9 · el recorrido de estados y las dos devoluciones", () => {
  it("borrador → enviado → aprobado_decanatura → validado, con una transición por paso", async () => {
    const e04 = find(await rowsOf(PEOPLE.director, UNITS.programaA, period2), "E04", "Bucaramanga");
    expect(await review(PEOPLE.decano, [e04.id], "aprobar")).toBe(1);
    expect(await review(PEOPLE.ve, [e04.id], "validar")).toBe(1);
    const log = await t.q<{ from_state: string; to_state: string; actor_id: string }>(
      "select from_state, to_state, actor_id from imp_transitions where record_id = $1 order by id",
      [e04.id],
    );
    expect(log).toEqual([
      { from_state: "borrador", to_state: "enviado", actor_id: PEOPLE.director },
      { from_state: "enviado", to_state: "aprobado_decanatura", actor_id: PEOPLE.decano },
      { from_state: "aprobado_decanatura", to_state: "validado", actor_id: PEOPLE.ve },
    ]);
  });

  it("validado no cambia: ni se edita ni se devuelve", async () => {
    const e04 = find(await rowsOf(PEOPLE.director, UNITS.programaA, period2), "E04", "Bucaramanga");
    expect(e04.state).toBe("validado");
    expect(await save(PEOPLE.director, e04, filled(e04, { numerador: 1 }))).toBe(0);
    expect(await errorOf(review(PEOPLE.ve, [e04.id], "devolver", "dato_incompleto", "x"))).toMatch(/validado/);
  });

  it("devolución al programa: motivo de la lista y comentario; solo lo devuelto se reabre", async () => {
    const e13 = find(await rowsOf(PEOPLE.director, UNITS.programaA, period2), "E13");
    expect(await errorOf(review(PEOPLE.decano, [e13.id], "devolver"))).toMatch(/motivo/);
    expect(await review(PEOPLE.decano, [e13.id], "devolver", "evidencia_insuficiente", "Falta el acta del comité curricular")).toBe(1);

    const rows = await rowsOf(PEOPLE.director, UNITS.programaA, period2);
    const back = find(rows, "E13");
    expect(back).toMatchObject({ state: "devuelto_programa", return_reason: "evidencia_insuficiente", return_comment: "Falta el acta del comité curricular" });
    expect(await save(PEOPLE.director, back, filled(back, { numerador: 3 }))).toBe(1);
    expect(await save(PEOPLE.director, find(rows, "E03", "Cúcuta"), filled(find(rows, "E03", "Cúcuta"), { numerador: 1 }))).toBe(0);
    expect(await submit(PEOPLE.director, UNITS.programaA, period2)).toBe(1);
    expect(find(await rowsOf(PEOPLE.director, UNITS.programaA, period2), "E13").state).toBe("enviado");
  });

  it("devolución a la decanatura: la vicerrectoría devuelve y la decanatura reaprueba", async () => {
    const x04 = find(await rowsOf(PEOPLE.director, UNITS.programaA, period2), "X04", "Bucaramanga");
    await review(PEOPLE.decano, [x04.id], "aprobar");
    expect(await review(PEOPLE.vx, [x04.id], "devolver", "variacion_sin_justificar", "Explique el salto frente a 2026-1")).toBe(1);
    expect(find(await rowsOf(PEOPLE.director, UNITS.programaA, period2), "X04", "Bucaramanga").state).toBe("devuelto_decanatura");
    expect(await review(PEOPLE.decano, [x04.id], "aprobar")).toBe(1);
    expect(await review(PEOPLE.vx, [x04.id], "validar")).toBe(1);
    expect(find(await rowsOf(PEOPLE.director, UNITS.programaA, period2), "X04", "Bucaramanga").state).toBe("validado");
  });

  it("la decanatura aprueba el resto del paquete de una vez y cada vicerrectoría valida lo suyo", async () => {
    const pending = (await rowsOf(PEOPLE.director, UNITS.programaA, period2)).filter((r) => r.state === "enviado");
    expect(await review(PEOPLE.decano, pending.map((r) => r.id), "aprobar")).toBe(pending.length);
    for (const [who, fn] of [
      [PEOPLE.vi, "investigacion"],
      [PEOPLE.ve, "ensenanza"],
      [PEOPLE.vx, "extension"],
    ] as const) {
      const mine = (await rowsOf(PEOPLE.director, UNITS.programaA, period2)).filter((r) => r.state === "aprobado_decanatura" && r.function_id === fn);
      if (mine.length) expect(await review(who, mine.map((r) => r.id), "validar")).toBe(mine.length);
    }
    expect((await rowsOf(PEOPLE.director, UNITS.programaA, period2)).every((r) => r.state === "validado")).toBe(true);
  });
});

describe("criterio 10 · nadie aprueba ni valida lo que capturó", () => {
  beforeAll(async () => {
    // La decanatura y la vicerrectoría de Enseñanza también reportan en el Programa B.
    await t.q(
      `insert into unit_members (unit_id, profile_id, role, access_role_id)
       select $1, p, 'editor', r.id from unnest($2::uuid[]) p, access_roles r where r.key = 'impacto_reportante'`,
      [UNITS.programaB, [PEOPLE.decano, PEOPLE.ve]],
    );
    const rows = await rowsOf(DIRECTOR_B, UNITS.programaB, period2);
    await save(PEOPLE.decano, find(rows, "I04", "Bucaramanga"), filled(find(rows, "I04", "Bucaramanga")));
    await save(PEOPLE.ve, find(rows, "E08"), filled(find(rows, "E08")));
    await save(DIRECTOR_B, find(rows, "E04", "Cúcuta"), filled(find(rows, "E04", "Cúcuta"), { numerador: 10, denominador: 20 }));
    await completeOnline(DIRECTOR_B, UNITS.programaB, period2);
    expect((await rowsOf(DIRECTOR_B, UNITS.programaB, period2)).flatMap((r) => blocking(issuesOf(r)))).toEqual([]);
    await submit(DIRECTOR_B, UNITS.programaB, period2);
  });

  it("quien capturó queda anotado en el registro", async () => {
    const rows = await rowsOf(DIRECTOR_B, UNITS.programaB, period2);
    expect(find(rows, "I04", "Bucaramanga").captured_by).toBe(PEOPLE.decano);
    expect(find(rows, "E08").captured_by).toBe(PEOPLE.ve);
  });

  it("la decanatura no aprueba lo que capturó, aunque aprueba el resto del paquete", async () => {
    const rows = await rowsOf(DIRECTOR_B, UNITS.programaB, period2);
    const own = find(rows, "I04", "Bucaramanga");
    expect(await errorOf(review(PEOPLE.decano, [own.id], "aprobar"))).toMatch(/usted lo capturó o lo envió/);
    const others = rows.filter((r) => r.state === "enviado" && r.id !== own.id);
    expect(await review(PEOPLE.decano, others.map((r) => r.id), "aprobar")).toBe(others.length);
    expect(find(await rowsOf(DIRECTOR_B, UNITS.programaB, period2), "I04", "Bucaramanga").state).toBe("enviado");
  });

  it("la vicerrectoría no valida lo que capturó", async () => {
    const rows = await rowsOf(DIRECTOR_B, UNITS.programaB, period2);
    const own = find(rows, "E08");
    expect(await errorOf(review(PEOPLE.ve, [own.id], "validar"))).toMatch(/usted lo capturó o lo envió/);
    const others = rows.filter((r) => r.state === "aprobado_decanatura" && r.function_id === "ensenanza" && r.id !== own.id);
    expect(await review(PEOPLE.ve, others.map((r) => r.id), "validar")).toBe(others.length);
  });
});

/* --- 8 ------------------------------------------------------------------------------ */

describe("criterio 8 · un porcentaje de facultad es razón de sumas", () => {
  it("la retención de la facultad suma numeradores y denominadores de sus programas y sedes", async () => {
    const e04 = await t.asUser(PEOPLE.ve, (q) =>
      q<{ numerator: string; denominator: string; value: string }>(
        "select numerator, denominator, value from imp_capture_rows where period_id = $1 and code = 'E04' and state = 'validado' and program_id = any($2::uuid[])",
        [period2, [UNITS.programaA, UNITS.programaB]],
      ),
    );
    // A: 460/500 y 40/50 · B: 430/500 y 10/20.
    expect(e04.map((r) => Number(r.value)).sort((a, b) => a - b)).toEqual([50, 80, 86, 92]);
    const faculty = consolidate(
      e04.map((r) => ({ numerador: Number(r.numerator), denominador: Number(r.denominator) })),
      "razon_de_sumas",
      100,
    );
    expect(faculty).toMatchObject({ numerador: 940, denominador: 1070, registros: 4 });
    expect(faculty.valor).toBeCloseTo((940 / 1070) * 100, 6); // 87,9 %
    const averageOfPercentages = e04.reduce((s, r) => s + Number(r.value), 0) / e04.length; // 77 %
    expect(Math.abs(faculty.valor! - averageOfPercentages)).toBeGreaterThan(10);
  });
});

/* --- 11 ----------------------------------------------------------------------------- */

describe("criterio 11 · historial de transiciones y lotes de importación de cada registro", () => {
  /** Lo mismo que lee la ficha (useRecordHistory), con la sesión de cada quien. */
  const history = (user: string, recordId: string) =>
    t.asUser(user, async (q) => ({
      transitions: await q<{ from_state: string; to_state: string; reason: string | null; comment: string }>(
        "select from_state, to_state, reason, comment from imp_transitions where record_id = $1 order by at, id",
        [recordId],
      ),
      batches: await q<{ file_name: string; actor_id: string }>(
        "select b.file_name, b.actor_id from imp_import_batch_records r join imp_import_batches b on b.id = r.batch_id where r.record_id = $1",
        [recordId],
      ),
    }));

  it("el E04 de Bucaramanga del Programa B: el lote que lo cargó y sus tres pasos", async () => {
    const e04 = find(await rowsOf(DIRECTOR_B, UNITS.programaB, period2), "E04", "Bucaramanga");
    for (const who of [DIRECTOR_B, PEOPLE.decano, PEOPLE.ve]) {
      const h = await history(who, e04.id);
      expect(h.batches).toEqual([{ file_name: "plantilla-B.xlsx", actor_id: DIRECTOR_B }]);
      expect(h.transitions.map((x) => `${x.from_state}→${x.to_state}`)).toEqual(["borrador→enviado", "enviado→aprobado_decanatura", "aprobado_decanatura→validado"]);
    }
  });

  it("el E13 del Programa A: la devolución con su motivo y su comentario", async () => {
    const e13 = find(await rowsOf(PEOPLE.director, UNITS.programaA, period2), "E13");
    const h = await history(PEOPLE.director, e13.id);
    expect(h.transitions.map((x) => x.to_state)).toEqual(["enviado", "devuelto_programa", "enviado", "aprobado_decanatura", "validado"]);
    expect(h.transitions[1]).toMatchObject({ reason: "evidencia_insuficiente", comment: "Falta el acta del comité curricular" });
    expect(h.batches).toEqual([]);
  });

  it("otra facultad no ve el historial ajeno", async () => {
    const e04 = find(await rowsOf(DIRECTOR_B, UNITS.programaB, period2), "E04", "Bucaramanga");
    const h = await history(PEOPLE.otroDirector, e04.id);
    expect(h).toEqual({ transitions: [], batches: [] });
  });

  it("las bitácoras solo crecen", async () => {
    expect(await errorOf(t.q("update imp_transitions set comment = 'x'"))).toMatch(/bitácora/);
    expect(await errorOf(t.q("delete from imp_import_batch_records"))).toMatch(/bitácora/);
  });
});
