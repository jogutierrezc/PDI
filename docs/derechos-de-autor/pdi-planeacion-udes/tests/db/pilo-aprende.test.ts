/* =============================================================================
   Pregúntele a Pilo aprende (0109): la bandeja de lo que no supo. La anota
   la función del servidor, la ve y la cierra solo la administración.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
}, 120_000);

afterAll(() => t?.close());

const add = (q: string, reason: string, answerId: number | null = null) =>
  t.asUser(PEOPLE.admin, (x) => x("select pilo_inbox_add($1, $2, $3, 'nada', 'No encontré eso.', $4)", [q, q.toLowerCase(), reason, answerId]), { commit: true });

describe("la bandeja de Pilo", () => {
  it("solo la función del servidor (o la administración) anota", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_inbox_add('hola que tal', 'hola que tal', 'sin_respuesta')")))).toMatch(/Solo la función/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_inbox_add('hola que tal', 'hola que tal', 'sin_respuesta')")))).toMatch(/permission denied/);
  });

  it("la misma pregunta pendiente suma veces en vez de repetirse", async () => {
    await add("¿Cuántos egresados trabajan?", "sin_respuesta");
    await add("¿Cuántos egresados trabajan?", "sin_respuesta");
    await add("¿Cuántos egresados trabajan?", "no_sirvio");
    const rows = await t.q<{ reason: string; times: number }>("select reason, times from pilo_inbox order by reason");
    expect(rows).toEqual([
      { reason: "no_sirvio", times: 1 },
      { reason: "sin_respuesta", times: 2 },
    ]);
  });

  it("la ve solo la administración", async () => {
    expect(await t.asUser(PEOPLE.admin, (q) => q("select id from pilo_inbox"))).toHaveLength(2);
    expect(await t.asUser(PEOPLE.director, (q) => q("select id from pilo_inbox"))).toHaveLength(0);
    expect(await errorOf(t.asUser(null, (q) => q("select id from pilo_inbox")))).toMatch(/permission denied/);
  });

  it("al resolverla con el catálogo, la respuesta guardada que no sirvió deja de darse", async () => {
    const [a] = await t.q<{ id: number }>("insert into pilo_answers (question, qnorm, kind, answer) values ('¿Cuántos egresados trabajan?', 'cuantos egresados trabajan', 'ia', 'Mal.') returning id");
    await add("¿Tasa de empleo de egresados?", "no_sirvio", a.id);
    const [item] = await t.q<{ id: number }>("select id from pilo_inbox where answer_id = $1", [a.id]);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_inbox_close($1, 'resuelta', 'R-010')", [item.id])))).toMatch(/Solo la administración/);
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_inbox_close($1, 'resuelta', 'R-010')", [item.id]), { commit: true });
    const [closed] = await t.q<{ status: string; catalog_key: string; resolved_by: string }>("select status, catalog_key, resolved_by from pilo_inbox where id = $1", [item.id]);
    expect(closed).toEqual({ status: "resuelta", catalog_key: "R-010", resolved_by: PEOPLE.admin });
    const [hidden] = await t.q<{ hidden: boolean }>("select hidden from pilo_answers where id = $1", [a.id]);
    expect(hidden.hidden).toBe(true);
  });

  it("descartada deja de estar pendiente, y la misma pregunta puede volver a anotarse", async () => {
    const [item] = await t.q<{ id: number }>("select id from pilo_inbox where reason = 'sin_respuesta' and status = 'pendiente'");
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_inbox_close($1, 'descartada')", [item.id]), { commit: true });
    await add("¿Cuántos egresados trabajan?", "sin_respuesta");
    const rows = await t.q<{ status: string; times: number }>("select status, times from pilo_inbox where reason = 'sin_respuesta' order by id");
    expect(rows).toEqual([
      { status: "descartada", times: 2 },
      { status: "pendiente", times: 1 },
    ]);
  });

  it("guarda el modelo de embeddings elegido por la administración", async () => {
    const [s] = await t.q<{ embed_model: string }>("select embed_model from pilo_ai_settings where id = 1");
    expect(s.embed_model).toBe("");
  });
});
