/* =============================================================================
   Fase 4 · periodos, asignaciones y precargados.

   Sobre la vr7 importada con las 13 fichas del piloto y la versión 1
   publicada, y la facultad de prueba de las semillas:
     · Programa A  pregrado, presencial   Bucaramanga y Cúcuta
     · Programa B  pregrado, virtual      Bucaramanga y Cúcuta
     · Maestría    maestría, presencial   Bucaramanga y Cúcuta
     · Programa Z  pregrado, otra facultad, solo Valledupar
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { resolve } from "node:path";
import { importMatrix } from "../../src/modules/impacto/import/matrix";
import { PILOT_SHEETS } from "../../src/modules/impacto/data/pilot-sheets";
import { PEOPLE, UNITS, createTestDb, errorOf } from "./harness";
import type { Query, TestDb } from "./harness";

let t: TestDb;
let versionId: string;

type Candidate = { indicator_code: string; program_id: string; campus_name: string | null; degree_level: string };

const admin = <T>(work: (q: Query) => Promise<T>) => t.asUser(PEOPLE.admin, work, { commit: true });
// Siempre con la versión de la vr7: una prueba de abajo publica otra más nueva.
const preview = (code: string) =>
  t.asUser(PEOPLE.admin, (q) => q<Candidate>("select * from imp_preview_assignments($1, $2)", [code, versionId]));

/** Deja la vr7 publicada con las 13 fichas del piloto. Sirve también a la fase 5. */
export async function publishPilotCatalog(db: TestDb) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(resolve(__dirname, "../../UDES_Matriz_Impacto_Institucional_vr7.xlsx"));
  const payload = JSON.stringify({ sourceFile: "vr7.xlsx", ...importMatrix(book) });
  return db.asUser(
    PEOPLE.admin,
    async (q) => {
      const [{ r }] = await q<{ r: { versionId: string } }>("select imp_import_catalog($1::jsonb) as r", [payload]);
      for (const { name, columns } of PILOT_SHEETS) {
        const keys = Object.keys(columns);
        await q(`update imp_indicators set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where version_id = $1 and name = $${keys.length + 2}`, [
          r.versionId,
          ...Object.values(columns),
          name,
        ]);
      }
      await q("select imp_publish_catalog($1)", [r.versionId]);
      return r.versionId;
    },
    { commit: true },
  );
}

beforeAll(async () => {
  t = await createTestDb();
  versionId = await publishPilotCatalog(t);
});

afterAll(async () => {
  await t.close();
});

describe("vista previa de asignaciones (criterio 3)", () => {
  let rows: Candidate[];
  beforeAll(async () => {
    rows = await preview("2026-2");
  });
  const codesOf = (program: string) => [...new Set(rows.filter((r) => r.program_id === program).map((r) => r.indicator_code))].sort();

  it("solo indicadores oficiales con ficha completa: los 13 del piloto, ningún sugerido", async () => {
    const codes = new Set(rows.map((r) => r.indicator_code));
    expect([...codes].sort()).toEqual(["E01", "E03", "E04", "E08", "E10", "E13", "I01", "I04", "I34", "X04", "X07", "X18", "X22"]);
    const [suggested] = await t.q<{ n: number }>(
      "select count(*)::int as n from imp_indicators where version_id = $1 and catalog_state = 'sugerido' and code = any($2)",
      [versionId, [...codes]],
    );
    expect(suggested.n).toBe(0);
  });

  it("un pregrado recibe todo lo que aplica a pregrado", () => {
    expect(codesOf(UNITS.programaA)).toEqual(["E01", "E03", "E04", "E08", "E10", "E13", "I01", "I04", "I34", "X04", "X07", "X18", "X22"]);
  });

  it("la maestría no recibe lo que es solo de pregrado (semilleros, PAIPE, retención, Saber Pro…)", () => {
    const codes = codesOf(UNITS.maestria);
    expect(codes).toEqual(["E01", "E08", "E13", "I04", "X04", "X18", "X22"]);
    for (const onlyUndergrad of ["I01", "I34", "E03", "E04", "E10", "X07"]) expect(codes).not.toContain(onlyUndergrad);
  });

  it("lo que se reporta por sede se asigna una vez por cada sede donde se ofrece el programa", () => {
    const e04 = rows.filter((r) => r.program_id === UNITS.programaA && r.indicator_code === "E04").map((r) => r.campus_name).sort();
    expect(e04).toEqual(["Bucaramanga", "Cúcuta"]);
    const e01 = rows.filter((r) => r.program_id === UNITS.programaA && r.indicator_code === "E01");
    expect(e01).toHaveLength(1);
    expect(e01[0].campus_name).toBeNull();
  });

  it("el programa de otra facultad solo recibe su sede (Valledupar)", () => {
    const sites = new Set(rows.filter((r) => r.program_id === UNITS.programaZ && r.campus_name).map((r) => r.campus_name));
    expect([...sites]).toEqual(["Valledupar"]);
  });

  it("los anuales solo en el segundo semestre", async () => {
    const first = new Set((await preview("2027-1")).map((r) => r.indicator_code));
    for (const annual of ["I34", "E08", "E13", "E10", "X22"]) expect(first).not.toContain(annual);
    expect(first).toContain("E04");
  });

  it("una ficha que nombra modalidades deja fuera a las demás", async () => {
    await t.q("insert into imp_catalog_versions (number) values (9)");
    // Se prueba sobre las reglas directamente: versión publicada con una modalidad.
    const [v] = await t.q<{ id: string }>("select id from imp_catalog_versions where number = 9");
    await t.q(
      `insert into imp_indicators (version_id, code, function_id, level, name, unit, calc_type, numerator_def, factor, aggregation,
         direction, periodicity, report_level, applies_degrees, applies_modalities, capture_mode, validator_function, in_pilot)
       values ($1, 'E90', 'ensenanza', 'insumos', 'Solo presencial', 'numero', 'conteo', 'x', 1, 'suma', 'mayor_mejor',
         'semestral', 'programa', '{pregrado}', '{presencial}', 'manual', 'ensenanza', true)`,
      [v.id],
    );
    await t.q("update imp_catalog_versions set state = 'publicada', published_at = now() where id = $1", [v.id]);
    const got = await t.asUser(PEOPLE.admin, (q) => q<Candidate>("select * from imp_preview_assignments('2026-2', $1)", [v.id]));
    const programs = new Set(got.map((r) => r.program_id));
    expect(programs.has(UNITS.programaA)).toBe(true);
    expect(programs.has(UNITS.programaB)).toBe(false); // virtual
  });

  it("solo la administración de Impacto la pide", async () => {
    expect(await errorOf(t.asUser(PEOPLE.decano, (q) => q("select * from imp_preview_assignments('2026-2')")))).toMatch(/Solo la administración/);
  });
});

describe("abrir el periodo", () => {
  let periodId: string;
  let e04: { id: string };
  let e13: { id: string };

  beforeAll(async () => {
    [e04] = await t.q<{ id: string }>("select id from imp_indicators where version_id = $1 and code = 'E04'", [versionId]);
    [e13] = await t.q<{ id: string }>("select id from imp_indicators where version_id = $1 and code = 'E13'", [versionId]);
  });

  it("quitar o agregar sin justificación se rechaza", async () => {
    const changes = JSON.stringify([{ action: "quitar", indicator_id: e13.id, program_id: UNITS.programaB, campus_id: null, justification: " " }]);
    expect(
      await errorOf(t.asUser(PEOPLE.admin, (q) => q("select imp_open_period('2026-2', '2026-10-15', '2026-10-25', '2026-11-05', null, $1::jsonb)", [changes]))),
    ).toMatch(/justificación/);
  });

  it("crea el periodo, sus asignaciones y un registro en borrador por cada una activa", async () => {
    const expected = (await preview("2026-2")).length;
    const changes = JSON.stringify([
      { action: "quitar", indicator_id: e13.id, program_id: UNITS.programaB, campus_id: null, justification: "El programa B no hizo innovaciones este año: cambio de plan de estudios." },
    ]);
    const [{ r }] = await admin((q) =>
      q<{ r: { periodId: string; active: number; removed: number; added: number } }>(
        "select imp_open_period('2026-2', '2026-10-15', '2026-10-25', '2026-11-05', $2, $1::jsonb) as r",
        [changes, versionId],
      ),
    );
    periodId = r.periodId;
    expect(r).toMatchObject({ active: expected - 1, removed: 1, added: 0 });
    const [records] = await t.q<{ n: number; drafts: number }>(
      "select count(*)::int as n, count(*) filter (where r.state = 'borrador')::int as drafts from imp_records r join imp_assignments a on a.id = r.assignment_id where a.period_id = $1",
      [periodId],
    );
    expect(records).toEqual({ n: expected - 1, drafts: expected - 1 });
    const [removed] = await t.q<{ active: boolean; justification: string }>(
      "select active, justification from imp_assignments where period_id = $1 and indicator_id = $2 and program_id = $3",
      [periodId, e13.id, UNITS.programaB],
    );
    expect(removed.active).toBe(false);
    expect(removed.justification).toMatch(/cambio de plan/);
  });

  it("no se abre dos veces el mismo periodo", async () => {
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select imp_open_period('2026-2', '2026-10-15', '2026-10-25', '2026-11-05')")))).toMatch(
      /ya existe/,
    );
  });

  it("agregar a mano queda marcado y con su porqué; también crea el registro", async () => {
    const [valledupar] = await t.q<{ id: string }>("select id from campuses where slug = 'valledupar'");
    await t.q("insert into imp_program_campuses (program_id, campus_id) values ($1, $2)", [UNITS.programaA, valledupar.id]);
    const [{ id }] = await admin((q) =>
      q<{ id: string }>("select imp_add_assignment($1, $2, $3, $4, 'Abrió cohorte en Valledupar este semestre') as id", [
        periodId,
        e04.id,
        UNITS.programaA,
        valledupar.id,
      ]),
    );
    const [row] = await t.q<{ manual: boolean; has_record: boolean }>(
      "select manual, exists(select 1 from imp_records r where r.assignment_id = a.id) as has_record from imp_assignments a where id = $1",
      [id],
    );
    expect(row).toEqual({ manual: true, has_record: true });
  });

  it("quitar una asignación con el periodo abierto pide justificación y no toca registros enviados", async () => {
    const [a] = await t.q<{ id: string; record: string }>(
      `select a.id, r.id as record from imp_assignments a join imp_records r on r.assignment_id = a.id
        where a.period_id = $1 and a.indicator_id = $2 and a.program_id = $3 limit 1`,
      [periodId, e04.id, UNITS.programaB],
    );
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select imp_set_assignment($1, false, '')", [a.id])))).toMatch(/justificación/);
    await t.q("update imp_records set state = 'enviado' where id = $1", [a.record]);
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select imp_set_assignment($1, false, 'ya no aplica')", [a.id])))).toMatch(
      /ya salió del programa/,
    );
    await t.q("update imp_records set state = 'borrador' where id = $1", [a.record]);
  });

  describe("valores precargados", () => {
    it("carga E04 en el registro del programa y sede, calcula el valor y guarda lo que llegó", async () => {
      const items = JSON.stringify([
        { row: 2, indicator: "E04", program: "900001", campus: "Bucaramanga", numerator: 430, denominator: 480 },
        { row: 3, indicator: "e04", program: "PR-A", campus: "cucuta", numerator: 210, denominator: 240 },
        { row: 4, indicator: "E10", program: "900001", campus: "", numerator: 151.2, n: 38 },
      ]);
      const [{ r }] = await admin((q) => q<{ r: { loaded: number; errors: unknown[] } }>("select imp_load_preloaded($1, $2::jsonb, 'registro.csv') as r", [periodId, items]));
      expect(r).toEqual({ loaded: 3, errors: [] });
      const [rec] = await t.q<{ value: string; preloaded: { numerator: number; file: string }; confirms_preloaded: boolean | null }>(
        `select r.value, r.preloaded, r.confirms_preloaded from imp_records r join imp_assignments a on a.id = r.assignment_id
           join campuses c on c.id = a.campus_id
          where a.period_id = $1 and a.indicator_id = $2 and a.program_id = $3 and c.slug = 'bucaramanga'`,
        [periodId, e04.id, UNITS.programaA],
      );
      expect(Number(rec.value)).toBeCloseTo((430 / 480) * 100, 6);
      expect(rec.preloaded).toMatchObject({ numerator: 430, file: "registro.csv" });
      expect(rec.confirms_preloaded).toBeNull();
    });

    it("dice fila por fila lo que no cargó, y carga el resto", async () => {
      const items = JSON.stringify([
        { row: 2, indicator: "E13", program: "900001", campus: "", numerator: 3 },
        { row: 3, indicator: "E04", program: "999999", campus: "Bucaramanga", numerator: 1, denominator: 2 },
        { row: 4, indicator: "E04", program: "900001", campus: "Pasto", numerator: 1, denominator: 2 },
        { row: 5, indicator: "E04", program: "900003", campus: "Bucaramanga", numerator: 1, denominator: 2 },
        { row: 6, indicator: "E04", program: "900001", campus: "Bucaramanga", numerator: 5, denominator: 0 },
        { row: 7, indicator: "E04", program: "900002", campus: "Bucaramanga", numerator: 300, denominator: 320 },
      ]);
      const [{ r }] = await admin((q) =>
        q<{ r: { loaded: number; errors: { row: number; message: string }[] } }>("select imp_load_preloaded($1, $2::jsonb) as r", [periodId, items]),
      );
      expect(r.loaded).toBe(1);
      const byRow = Object.fromEntries(r.errors.map((e) => [e.row, e.message]));
      expect(byRow[2]).toMatch(/no es un indicador precargado/);
      expect(byRow[3]).toMatch(/No se encontró el programa/);
      expect(byRow[4]).toMatch(/No se encontró la sede/);
      expect(byRow[5]).toMatch(/no tiene esa asignación/); // la maestría no reporta retención
      expect(byRow[6]).toMatch(/denominador/);
    });

    it("no sobrescribe un registro ya enviado", async () => {
      const [rec] = await t.q<{ id: string }>(
        `select r.id from imp_records r join imp_assignments a on a.id = r.assignment_id join campuses c on c.id = a.campus_id
          where a.period_id = $1 and a.indicator_id = $2 and a.program_id = $3 and c.slug = 'cucuta'`,
        [periodId, e04.id, UNITS.programaA],
      );
      await t.q("update imp_records set state = 'enviado' where id = $1", [rec.id]);
      const items = JSON.stringify([{ row: 2, indicator: "E04", program: "900001", campus: "cucuta", numerator: 1, denominator: 2 }]);
      const [{ r }] = await admin((q) => q<{ r: { loaded: number; errors: { message: string }[] } }>("select imp_load_preloaded($1, $2::jsonb) as r", [periodId, items]));
      expect(r.loaded).toBe(0);
      expect(r.errors[0].message).toMatch(/ya fue enviado/);
    });
  });

  it("cerrar el periodo impide seguir cargando", async () => {
    await admin((q) => q("select imp_close_period($1)", [periodId]));
    expect(
      await errorOf(t.asUser(PEOPLE.admin, (q) => q("select imp_load_preloaded($1, '[]'::jsonb)", [periodId]))),
    ).toMatch(/cerrado/);
  });
});
