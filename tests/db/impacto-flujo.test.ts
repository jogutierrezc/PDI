/* =============================================================================
   Fase 7 · el flujo de tres niveles.

   vr7 publicada con el piloto, periodo 2026-2 abierto y el paquete del
   Programa A enviado por su dirección. Desde ahí: decanatura, vicerrectorías,
   devoluciones en los dos sentidos y separación de funciones.
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
  function_id: string;
}

const commit = <T>(user: string, work: (q: Query) => Promise<T>) => t.asUser(user, work, { commit: true });
const review = (user: string, ids: string[], action: string, reason: string | null = null, comment = "") =>
  commit(user, (q) => q<{ n: number }>("select imp_review($1::uuid[], $2, $3, $4) as n", [ids, action, reason, comment])).then((r) => r[0].n);
const rows = () =>
  t.q<Row>(
    `select r.id, i.code, c.name as campus_name, r.state, i.function_id
       from imp_records r join imp_assignments a on a.id = r.assignment_id join imp_indicators i on i.id = a.indicator_id
       left join campuses c on c.id = a.campus_id
      where a.program_id = $1 and a.period_id = $2 order by i.code, c.name`,
    [UNITS.programaA, periodId],
  );
const one = async (code: string, campus: string | null = null) => (await rows()).find((r) => r.code === code && r.campus_name === campus)!;

beforeAll(async () => {
  t = await createTestDb();
  const versionId = await publishPilotCatalog(t);
  const [{ r }] = await commit(PEOPLE.admin, (q) =>
    q<{ r: { periodId: string } }>("select imp_open_period('2026-2', '2026-10-15', '2026-10-25', '2026-11-05', $1) as r", [versionId]),
  );
  periodId = r.periodId;
  // La dirección captura un valor en cada registro y envía el paquete.
  const all = await rows();
  await commit(PEOPLE.director, async (q) => {
    for (const row of all) await q("update imp_records set numerator = 10, denominator = 20, n_responses = 30, num_comparison = 5, den_comparison = 20 where id = $1", [row.id]);
    return q("select imp_submit_program($1, $2, true)", [periodId, UNITS.programaA]);
  });
});

afterAll(async () => {
  await t.close();
});

describe("qué revisa cada quien", () => {
  it("la decanatura aprueba en los programas de su facultad; no valida", async () => {
    const [{ s }] = await t.asUser(PEOPLE.decano, (q) => q<{ s: { deanPrograms: { id: string }[]; functions: string[] } }>("select imp_my_review_scope() as s"));
    expect(s.deanPrograms.map((p) => p.id).sort()).toEqual([UNITS.programaA, UNITS.programaB, UNITS.maestria].sort());
    expect(s.functions).toEqual([]);
  });

  it("cada vicerrectoría valida solo su función", async () => {
    const [{ s }] = await t.asUser(PEOPLE.ve, (q) => q<{ s: { deanPrograms: unknown[]; functions: string[] } }>("select imp_my_review_scope() as s"));
    expect(s).toEqual({ deanPrograms: [], functions: ["ensenanza"] });
  });

  it("la dirección del programa no revisa", async () => {
    const [{ s }] = await t.asUser(PEOPLE.director, (q) => q<{ s: { deanPrograms: unknown[]; functions: string[] } }>("select imp_my_review_scope() as s"));
    expect(s).toEqual({ deanPrograms: [], functions: [] });
  });
});

describe("el recorrido completo (criterio 9)", () => {
  it("borrador → enviado → aprobado_decanatura → validado", async () => {
    const e04 = await one("E04", "Bucaramanga");
    expect(e04.state).toBe("enviado");
    expect(await review(PEOPLE.decano, [e04.id], "aprobar")).toBe(1);
    expect((await one("E04", "Bucaramanga")).state).toBe("aprobado_decanatura");
    expect(await review(PEOPLE.ve, [e04.id], "validar")).toBe(1);
    expect((await one("E04", "Bucaramanga")).state).toBe("validado");

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

  it("un registro validado no cambia ni se edita", async () => {
    const e04 = await one("E04", "Bucaramanga");
    expect(await errorOf(review(PEOPLE.ve, [e04.id], "devolver", "dato_incompleto", "x"))).toMatch(/validado y ya no cambia/);
    const edited = await t.asUser(PEOPLE.director, (q) => q("update imp_records set numerator = 1 where id = $1 returning id", [e04.id]));
    expect(edited).toHaveLength(0);
  });

  it("devolución al programa: motivo y comentario obligatorios; el programa corrige y reenvía", async () => {
    const e13 = await one("E13");
    expect(await errorOf(review(PEOPLE.decano, [e13.id], "devolver"))).toMatch(/motivo de la lista y escribir un comentario/);
    expect(await errorOf(review(PEOPLE.decano, [e13.id], "devolver", "evidencia_insuficiente", "  "))).toMatch(/comentario/);
    expect(await review(PEOPLE.decano, [e13.id], "devolver", "evidencia_insuficiente", "Falta el acta del comité")).toBe(1);
    expect((await one("E13")).state).toBe("devuelto_programa");

    // Solo lo devuelto vuelve a ser editable.
    const edited = await t.asUser(PEOPLE.director, (q) => q("update imp_records set numerator = 3 where id = $1 returning id", [e13.id]));
    expect(edited).toHaveLength(1);
    const [{ n }] = await commit(PEOPLE.director, (q) => q<{ n: number }>("select imp_submit_program($1, $2, true) as n", [periodId, UNITS.programaA]));
    expect(n).toBe(1);
    expect((await one("E13")).state).toBe("enviado");
  });

  it("devolución a la decanatura: la vicerrectoría siempre devuelve a la decanatura, que reaprueba", async () => {
    const x04 = await one("X04", "Bucaramanga");
    await review(PEOPLE.decano, [x04.id], "aprobar");
    expect(await review(PEOPLE.vx, [x04.id], "devolver", "variacion_sin_justificar", "Explique el salto frente a 2026-1")).toBe(1);
    expect((await one("X04", "Bucaramanga")).state).toBe("devuelto_decanatura");
    expect(await review(PEOPLE.decano, [x04.id], "aprobar")).toBe(1);
    expect((await one("X04", "Bucaramanga")).state).toBe("aprobado_decanatura");
  });

  it("desde devuelto_decanatura la decanatura también puede devolver al programa", async () => {
    const x04 = await one("X04", "Cúcuta");
    await review(PEOPLE.decano, [x04.id], "aprobar");
    await review(PEOPLE.vx, [x04.id], "devolver", "dato_incompleto", "Falta la sede");
    expect(await review(PEOPLE.decano, [x04.id], "devolver", "dato_incompleto", "Complete la sede y reenvíe")).toBe(1);
    expect((await one("X04", "Cúcuta")).state).toBe("devuelto_programa");
  });
});

describe("cada quien en lo suyo", () => {
  it("la vicerrectoría solo valida su función", async () => {
    const i01 = await one("I01", "Bucaramanga");
    await review(PEOPLE.decano, [i01.id], "aprobar");
    expect(await errorOf(review(PEOPLE.ve, [i01.id], "validar"))).toMatch(/solo la vicerrectoría de su función/);
    expect(await review(PEOPLE.vi, [i01.id], "validar")).toBe(1);
  });

  it("la vicerrectoría no decide sobre lo que aún está en la decanatura", async () => {
    const i04 = await one("I04", "Bucaramanga");
    expect(await errorOf(review(PEOPLE.vi, [i04.id], "validar"))).toMatch(/solo la decanatura/);
  });

  it("la decanatura no valida ni aprueba dos veces", async () => {
    const i04 = await one("I04", "Cúcuta");
    expect(await errorOf(review(PEOPLE.decano, [i04.id], "validar"))).toMatch(/validar es de la vicerrectoría/);
    await review(PEOPLE.decano, [i04.id], "aprobar");
    expect(await errorOf(review(PEOPLE.decano, [i04.id], "aprobar"))).toMatch(/solo la vicerrectoría/);
  });

  it("otra facultad no decide sobre este programa", async () => {
    const e01 = await one("E01");
    expect(await errorOf(review(PEOPLE.otroDirector, [e01.id], "aprobar"))).toMatch(/solo la decanatura/);
  });

  it("todo o nada: si un registro del lote no se puede, no se mueve ninguno", async () => {
    const e01 = await one("E01");
    const i04 = await one("I04", "Cúcuta"); // ya aprobado: la decanatura no puede aprobarlo otra vez
    expect(await errorOf(review(PEOPLE.decano, [e01.id, i04.id], "aprobar"))).toBeTruthy();
    expect((await one("E01")).state).toBe("enviado");
  });
});

describe("separación de funciones (criterio 10)", () => {
  it("nadie aprueba lo que capturó", async () => {
    const e03 = await one("E03", "Bucaramanga");
    await t.q("update imp_records set captured_by = $1 where id = $2", [PEOPLE.decano, e03.id]);
    expect(await errorOf(review(PEOPLE.decano, [e03.id], "aprobar"))).toMatch(/E03 \(Bucaramanga\): usted lo capturó o lo envió/);
  });

  it("nadie valida lo que envió", async () => {
    const e08 = await one("E08");
    await review(PEOPLE.decano, [e08.id], "aprobar");
    // La vicerrectoría de Enseñanza, si hubiera enviado el registro, tampoco lo valida.
    await t.q("insert into imp_transitions (record_id, from_state, to_state, actor_id, comment) values ($1, 'borrador', 'enviado', $2, 'simulado')", [e08.id, PEOPLE.ve]);
    expect(await errorOf(review(PEOPLE.ve, [e08.id], "validar"))).toMatch(/usted lo capturó o lo envió/);
  });

  it("aprobar el paquete: todo lo enviado del programa de una vez", async () => {
    const pending = (await rows()).filter((r) => r.state === "enviado" && r.code !== "E03");
    expect(pending.length).toBeGreaterThan(3);
    expect(await review(PEOPLE.decano, pending.map((r) => r.id), "aprobar")).toBe(pending.length);
    const after = await rows();
    expect(after.filter((r) => pending.some((p) => p.id === r.id)).every((r) => r.state === "aprobado_decanatura")).toBe(true);
  });

  it("nadie escribe la bitácora por fuera del flujo", async () => {
    const e01 = await one("E01");
    expect(
      await errorOf(t.asUser(PEOPLE.decano, (q) => q("insert into imp_transitions (record_id, from_state, to_state) values ($1, 'aprobado_decanatura', 'validado')", [e01.id]))),
    ).toMatch(/permission denied/);
  });
});
