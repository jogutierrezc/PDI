/* =============================================================================
   Fase 5 · captura en línea sobre la base.

   Catálogo vr7 publicado con el piloto, periodo 2026-2 abierto, y la
   dirección y la reportante del Programa A capturando.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PEOPLE, UNITS, createTestDb, errorOf, publishPilotCatalog } from "./harness";
import type { Query, TestDb } from "./harness";

let t: TestDb;
let periodId: string;

interface Row {
  id: string;
  code: string;
  campus_name: string | null;
  state: string;
  version: number;
  value: string | null;
  previous_value: string | null;
  target_text: string | null;
  return_reason: string | null;
  captured_by: string | null;
}

const as = <T>(user: string, work: (q: Query) => Promise<T>, commit = true) => t.asUser(user, work, { commit });
const rowsOf = (user: string) =>
  t.asUser(user, (q) => q<Row>("select * from imp_capture_rows where program_id = $1 and period_id = $2 order by code, campus_name", [UNITS.programaA, periodId]));

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

describe("mis programas", () => {
  it("la directora captura y envía en su programa; la reportante solo captura", async () => {
    const dir = await t.asUser(PEOPLE.director, (q) => q<{ program_id: string; can_send: boolean }>("select * from imp_my_programs()"));
    expect(dir).toEqual([expect.objectContaining({ program_id: UNITS.programaA, can_send: true })]);
    const rep = await t.asUser(PEOPLE.reportante, (q) => q<{ can_send: boolean }>("select * from imp_my_programs()"));
    expect(rep).toEqual([expect.objectContaining({ can_send: false })]);
  });

  it("el decano no aparece como capturista de los programas de su facultad", async () => {
    const dec = await t.asUser(PEOPLE.decano, (q) => q("select * from imp_my_programs()"));
    expect(dec).toHaveLength(0);
  });
});

describe("la ficha de captura", () => {
  it("trae cada registro con su contexto: indicador, sede, meta del año", async () => {
    const rows = await rowsOf(PEOPLE.director);
    expect(rows.length).toBe(20); // 13 del piloto: 7 por sede en Bucaramanga y Cúcuta, 6 por programa
    const e04 = rows.filter((r) => r.code === "E04");
    expect(e04.map((r) => r.campus_name)).toEqual(["Bucaramanga", "Cúcuta"]);
    expect(e04[0].target_text).toBe("+1 pp vs LB");
    expect(e04[0].previous_value).toBeNull();
  });

  it("guardar deja el borrador, calcula el valor y anota quién capturó", async () => {
    const [row] = (await rowsOf(PEOPLE.reportante)).filter((r) => r.code === "E04");
    const [saved] = await as(PEOPLE.reportante, (q) =>
      q<{ value: string; captured_by: string; state: string; version: number }>(
        "update imp_records set numerator = 430, denominator = 480, confirms_preloaded = false, justification = 'La fuente no incluye transferencias' where id = $1 and version = $2 returning value, captured_by, state, version",
        [row.id, row.version],
      ),
    );
    expect(Number(saved.value)).toBeCloseTo(89.583, 2);
    expect(saved).toMatchObject({ captured_by: PEOPLE.reportante, state: "borrador", version: row.version + 1 });
  });

  it("si otra persona guardó antes, la versión vieja no pisa el cambio", async () => {
    const [row] = (await rowsOf(PEOPLE.director)).filter((r) => r.code === "E04");
    await as(PEOPLE.director, (q) => q("update imp_records set observations = 'revisado' where id = $1 and version = $2", [row.id, row.version]));
    const stale = await as(PEOPLE.reportante, (q) =>
      q("update imp_records set numerator = 1 where id = $1 and version = $2 returning id", [row.id, row.version]),
    );
    expect(stale).toHaveLength(0);
  });

  it("quien capturó primero sigue siendo quien capturó", async () => {
    const [row] = (await rowsOf(PEOPLE.director)).filter((r) => r.code === "E04");
    expect(row.captured_by).toBe(PEOPLE.reportante);
  });

  it("evidencias: se agregan y se ven mientras el registro es del programa", async () => {
    const [row] = (await rowsOf(PEOPLE.director)).filter((r) => r.code === "E13");
    await as(PEOPLE.director, (q) =>
      q("insert into imp_evidence (record_id, kind, url, created_by) values ($1, 'url', 'https://udes.edu.co/innovaciones.pdf', $2)", [row.id, PEOPLE.director]),
    );
    const [counted] = await t.asUser(PEOPLE.director, (q) => q<{ evidence_count: string }>("select evidence_count from imp_capture_rows where id = $1", [row.id]));
    expect(Number(counted.evidence_count)).toBe(1);
  });

  it("los archivos de evidencia van a la carpeta del registro y solo los sube quien captura", async () => {
    const [row] = (await rowsOf(PEOPLE.director)).filter((r) => r.code === "E13");
    await as(PEOPLE.director, (q) => q("insert into storage.objects (bucket_id, name) values ('impacto', $1)", [`${row.id}/acta.pdf`]));
    expect(
      await errorOf(t.asUser(PEOPLE.decano, (q) => q("insert into storage.objects (bucket_id, name) values ('impacto', $1)", [`${row.id}/otra.pdf`]))),
    ).toMatch(/row-level security/);
    const seen = await t.asUser(PEOPLE.otroDirector, (q) => q("select name from storage.objects where bucket_id = 'impacto'"));
    expect(seen).toHaveLength(0);
  });
});

describe("enviar a decanatura", () => {
  it("sin certificar no se envía", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select imp_submit_program($1, $2, false)", [periodId, UNITS.programaA])))).toMatch(
      /certificar/,
    );
  });

  it("la reportante no envía", async () => {
    expect(await errorOf(t.asUser(PEOPLE.reportante, (q) => q("select imp_submit_program($1, $2, true)", [periodId, UNITS.programaA])))).toMatch(
      /Solo la dirección/,
    );
  });

  it("la directora envía todo el paquete y cada registro deja su transición", async () => {
    const [{ n }] = await as(PEOPLE.director, (q) => q<{ n: number }>("select imp_submit_program($1, $2, true) as n", [periodId, UNITS.programaA]));
    expect(n).toBe(20);
    const rows = await rowsOf(PEOPLE.director);
    expect(rows.every((r) => r.state === "enviado")).toBe(true);
    const [log] = await t.q<{ n: number; actor: string }>(
      "select count(*)::int as n, min(actor_id::text) as actor from imp_transitions where to_state = 'enviado'",
    );
    expect(log).toEqual({ n: 20, actor: PEOPLE.director });
  });

  it("enviado, ya no se edita desde el programa, y no se vuelve a enviar", async () => {
    const [row] = await rowsOf(PEOPLE.director);
    const blocked = await t.asUser(PEOPLE.director, (q) => q("update imp_records set numerator = 1 where id = $1 returning id", [row.id]));
    expect(blocked).toHaveLength(0);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select imp_submit_program($1, $2, true)", [periodId, UNITS.programaA])))).toMatch(
      /No hay registros por enviar/,
    );
  });

  it("tras una devolución, solo lo devuelto vuelve a ser editable, y se ve el motivo", async () => {
    const [row] = (await rowsOf(PEOPLE.director)).filter((r) => r.code === "E04");
    // La devolución de verdad llega con la fase 7; aquí se simula con su transición.
    await t.q(
      "insert into imp_transitions (record_id, from_state, to_state, actor_id, reason, comment) values ($1, 'enviado', 'devuelto_programa', $2, 'evidencia_insuficiente', 'Falta el reporte de Registro')",
      [row.id, PEOPLE.decano],
    );
    await t.q("update imp_records set state = 'devuelto_programa' where id = $1", [row.id]);

    const rows = await rowsOf(PEOPLE.director);
    const returned = rows.find((r) => r.id === row.id)!;
    expect(returned).toMatchObject({ state: "devuelto_programa", return_reason: "evidencia_insuficiente" });
    const others = rows.filter((r) => r.id !== row.id);
    const editable = await t.asUser(PEOPLE.director, (q) =>
      q("update imp_records set observations = 'x' where id = any($1) returning id", [[row.id, ...others.map((o) => o.id)]]),
    );
    expect(editable).toHaveLength(1);

    const [{ n }] = await as(PEOPLE.director, (q) => q<{ n: number }>("select imp_submit_program($1, $2, true) as n", [periodId, UNITS.programaA]));
    expect(n).toBe(1);
  });
});
