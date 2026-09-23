/* =============================================================================
   Fase 6 · la plantilla Excel sobre la base: firma, verificación e importación.

   Catálogo vr7 publicado con el piloto y periodo 2026-2 abierto. La directora
   del Programa A descarga su plantilla, la devuelve y la base la verifica
   antes de cargar nada.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PEOPLE, UNITS, createTestDb, errorOf, publishPilotCatalog } from "./harness";
import type { Query, TestDb } from "./harness";

let t: TestDb;
let periodId: string;

interface Signed {
  templateId: string;
  programId: string;
  periodId: string;
  catalogVersionId: string;
  generatedAt: string;
  assignmentIds: string[];
  signature: string;
  password: string;
}

interface Row {
  id: string;
  code: string;
  state: string;
  numerator: string | null;
  denominator: string | null;
  justification: string | null;
  channel: string;
}

const as = <T>(user: string, work: (q: Query) => Promise<T>, commit = true) => t.asUser(user, work, { commit });
const rowsOf = () =>
  t.asUser(PEOPLE.director, (q) =>
    q<Row>("select * from imp_capture_rows where program_id = $1 and period_id = $2 order by code, campus_name", [UNITS.programaA, periodId]),
  );

const sign = async (user: string = PEOPLE.director) => {
  const [{ r }] = await as(user, (q) => q<{ r: Signed }>("select imp_sign_template($1, $2) as r", [periodId, UNITS.programaA]));
  return r;
};

/** Lo que la hoja CONTROL lleva y el importador manda a verificar. */
const controlOf = (s: Signed) => ({
  templateId: s.templateId,
  programId: s.programId,
  periodId: s.periodId,
  catalogVersionId: s.catalogVersionId,
  generatedAt: s.generatedAt,
  assignmentIds: s.assignmentIds,
  signature: s.signature,
});

const verify = (user: string, control: object) => t.asUser(user, (q) => q("select imp_verify_template($1::jsonb) as r", [JSON.stringify(control)]));

const load = (template: string, rows: object[], options: { allOrNothing?: boolean; summary?: object; user?: string } = {}) =>
  as(options.user ?? PEOPLE.director, (q) =>
    q<{ r: { batchId: number; loaded: number; errors: { row: number; message: string }[]; allOrNothing: boolean } }>(
      "select imp_import_template($1, $2::jsonb, 'plantilla.xlsx', $3::jsonb, $4) as r",
      [template, JSON.stringify(rows), JSON.stringify(options.summary ?? {}), options.allOrNothing ?? null],
    ),
  ).then(([{ r }]) => r);

beforeAll(async () => {
  t = await createTestDb();
  const versionId = await publishPilotCatalog(t);
  const [{ r }] = await as(PEOPLE.admin, (q) =>
    q<{ r: { periodId: string } }>("select imp_open_period('2026-2', '2026-10-15', '2026-10-25', '2026-11-05', $1) as r", [versionId]),
  );
  periodId = r.periodId;
});

afterAll(async () => {
  await t.close();
});

describe("firmar la plantilla", () => {
  it("la directora recibe la huella, las asignaciones y la clave de protección", async () => {
    const s = await sign();
    expect(s).toMatchObject({ programId: UNITS.programaA, periodId });
    expect(s.assignmentIds).toHaveLength(20);
    expect(s.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(s.password.length).toBeGreaterThanOrEqual(12);
    const [saved] = await t.q<{ n: number }>("select count(*)::int as n from imp_templates where id = $1", [s.templateId]);
    expect(saved.n).toBe(1);
  });

  it("quien no captura en el programa no la genera", async () => {
    expect(await errorOf(sign(PEOPLE.otroDirector))).toMatch(/Solo quien captura/);
  });

  it("la llave de la huella no se ve desde la aplicación", async () => {
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select * from imp_secrets")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select protection_password from imp_templates")))).toMatch(/permission denied/);
  });
});

describe("verificar la plantilla", () => {
  it("la plantilla intacta pasa", async () => {
    const s = await sign();
    const [{ r }] = (await verify(PEOPLE.director, controlOf(s))) as [{ r: { templateId: string } }];
    expect(r.templateId).toBe(s.templateId);
  });

  it("una huella o un dato del CONTROL cambiado: la plantilla fue alterada", async () => {
    const s = await sign();
    expect(await errorOf(verify(PEOPLE.director, { ...controlOf(s), signature: "0".repeat(64) }))).toMatch(/alterada/);
    expect(await errorOf(verify(PEOPLE.director, { ...controlOf(s), generatedAt: "2020-01-01T00:00:00Z" }))).toMatch(/alterada/);
    expect(await errorOf(verify(PEOPLE.director, { templateId: s.templateId }))).toMatch(/CONTROL/);
  });

  it("otro programa no puede subir la plantilla del Programa A", async () => {
    const s = await sign();
    expect(await errorOf(verify(PEOPLE.otroDirector, controlOf(s)))).toMatch(/otro programa/);
  });
});

describe("importar", () => {
  it("por defecto la carga es parcial (IMPORTACION_TODO_O_NADA = no)", async () => {
    const [setting] = await t.asUser(PEOPLE.director, (q) => q<{ value: boolean }>("select value from imp_settings where key = 'importacion_todo_o_nada'"));
    expect(setting.value).toBe(false);
  });

  it("carga lo escrito por el canal Excel y deja el lote con sus registros", async () => {
    const s = await sign();
    const [e13] = (await rowsOf()).filter((r) => r.code === "E13");
    const result = await load(s.templateId, [{ row: 5, recordId: e13.id, fields: { numerator: 4, observations: "Dos patentes y dos modelos" } }], {
      summary: { rowsRead: 20, rowsError: 0 },
    });
    expect(result).toMatchObject({ loaded: 1, errors: [], allOrNothing: false });
    const after = (await rowsOf()).find((r) => r.id === e13.id)!;
    expect(after).toMatchObject({ channel: "excel", state: "borrador" });
    expect(Number(after.numerator)).toBe(4);
    const [batch] = await t.q<{ rows_read: number; rows_loaded: number; actor_id: string; n: number }>(
      "select b.rows_read, b.rows_loaded, b.actor_id, (select count(*)::int from imp_import_batch_records r where r.batch_id = b.id) as n from imp_import_batches b where b.id = $1",
      [result.batchId],
    );
    expect(batch).toEqual({ rows_read: 20, rows_loaded: 1, actor_id: PEOPLE.director, n: 1 });
  });

  it("una celda vacía no borra: solo cambia lo que viene en la fila", async () => {
    const s = await sign();
    const [e13] = (await rowsOf()).filter((r) => r.code === "E13");
    await load(s.templateId, [{ row: 5, recordId: e13.id, fields: { justification: "Se revisó con Propiedad Intelectual" } }]);
    const after = (await rowsOf()).find((r) => r.id === e13.id)!;
    expect(Number(after.numerator)).toBe(4);
    expect(after.justification).toBe("Se revisó con Propiedad Intelectual");
  });

  it("el enlace de evidencia queda como evidencia del registro", async () => {
    const s = await sign();
    const [e13] = (await rowsOf()).filter((r) => r.code === "E13");
    await load(s.templateId, [{ row: 5, recordId: e13.id, fields: { evidence_url: "https://drive.udes.edu.co/e13" } }]);
    const [ev] = await t.q<{ kind: string; url: string }>("select kind, url from imp_evidence where record_id = $1", [e13.id]);
    expect(ev).toEqual({ kind: "url", url: "https://drive.udes.edu.co/e13" });
  });

  it("un registro enviado no se toca: la fila sale como error y lo demás carga", async () => {
    const s = await sign();
    const rows = await rowsOf();
    const [sent, open] = rows.filter((r) => r.code === "E04");
    await t.q("insert into imp_transitions (record_id, from_state, to_state, actor_id) values ($1, 'borrador', 'enviado', $2)", [sent.id, PEOPLE.director]);
    await t.q("update imp_records set state = 'enviado' where id = $1", [sent.id]);
    const result = await load(s.templateId, [
      { row: 2, recordId: sent.id, fields: { numerator: 1, denominator: 2 } },
      { row: 3, recordId: open.id, fields: { numerator: 410, denominator: 470, confirms_preloaded: true } },
    ]);
    expect(result.loaded).toBe(1);
    expect(result.errors).toEqual([expect.objectContaining({ row: 2 })]);
    expect((await rowsOf()).find((r) => r.id === sent.id)!.numerator).toBeNull();
  });

  it("con TODO O NADA, un solo error impide cargar el archivo", async () => {
    const s = await sign();
    const rows = await rowsOf();
    const sent = rows.find((r) => r.state === "enviado")!;
    const e06 = rows.find((r) => r.code !== "E04" && r.state === "borrador")!;
    expect(
      await errorOf(
        load(
          s.templateId,
          [
            { row: 2, recordId: sent.id, fields: { numerator: 1 } },
            { row: 4, recordId: e06.id, fields: { numerator: 7 } },
          ],
          { allOrNothing: true },
        ),
      ),
    ).toMatch(/no se cargó ninguna/);
    expect((await rowsOf()).find((r) => r.id === e06.id)!.numerator).toBeNull();
    // Y los errores que el navegador ya encontró también bastan para rechazarlo.
    expect(
      await errorOf(load(s.templateId, [{ row: 4, recordId: e06.id, fields: { numerator: 7 } }], { allOrNothing: true, summary: { rowsError: 1 } })),
    ).toMatch(/no se cargó ninguna/);
  });

  it("un registro que no está en la plantilla no se carga", async () => {
    const s = await sign();
    const result = await load(s.templateId, [{ row: 9, recordId: "00000000-0000-4000-c000-000000000999", fields: { numerator: 1 } }]);
    expect(result.loaded).toBe(0);
    expect(result.errors[0].message).toMatch(/plantilla/);
  });

  it("los lotes son bitácora: no se editan", async () => {
    expect(await errorOf(t.q("update imp_import_batches set rows_loaded = 0"))).toMatch(/bitácora/);
  });

  it("con el periodo cerrado se rechaza la plantilla", async () => {
    const s = await sign();
    await as(PEOPLE.admin, (q) => q("select imp_close_period($1)", [periodId]));
    expect(await errorOf(verify(PEOPLE.director, controlOf(s)))).toMatch(/cerrado/);
    expect(await errorOf(load(s.templateId, []))).toMatch(/cerrado/);
  });
});
