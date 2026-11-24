/* =============================================================================
   Pregúntele a Pilo (0094): la memoria la escribe la administración, la
   busca la función del servidor, y el público no la lee directo.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
}, 120_000);

afterAll(() => t?.close());

const rows = [
  { ref: "cifras:poblacional:matriculados", title: "Matriculados por campus", section: "Informe Poblacional", body: "En 2025-2 la UDES tiene 15.870 estudiantes matriculados: Bucaramanga 9.412, Cúcuta 2.960.", path: "/datos-abiertos/poblacional", cut: "2025-2", office: "Admisiones" },
  { ref: "cifras:permanencia:desercion", title: "Deserción por periodo", section: "Informe Permanencia", body: "La deserción en 2025-1 fue de 8,4 % y viene bajando desde 2023-2.", path: "/datos-abiertos/permanencia", cut: "2025-1", office: "Bienestar" },
];

describe("pregunte a pilo", () => {
  it("solo la administración reemplaza la memoria; el público no la lee", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_memory_replace('cifras', $1::jsonb)", [JSON.stringify(rows)])))).toMatch(/Solo la administración/);
    const [r] = await t.asUser(PEOPLE.admin, (q) => q<{ r: Record<string, number> }>("select pilo_memory_replace('cifras', $1::jsonb) as r", [JSON.stringify(rows)]), { commit: true });
    expect(r.r).toMatchObject({ added: 2, changed: 0, removed: 0, total: 2 });
    expect(await errorOf(t.asUser(null, (q) => q("select * from pilo_memory")))).toMatch(/permission denied/);
    expect(await t.asUser(PEOPLE.director, (q) => q("select * from pilo_memory"))).toHaveLength(0);
  });

  it("busca con palabras sueltas y sin tildes", async () => {
    const found = await t.asUser(PEOPLE.admin, (q) => q<{ ref: string; rank: number }>("select ref, rank from pilo_memory_search('¿Cuántos estudiantes matriculados hay por campus?')"));
    expect(found[0].ref).toBe("cifras:poblacional:matriculados");
    const desercion = await t.asUser(PEOPLE.admin, (q) => q<{ ref: string }>("select ref from pilo_memory_search('desercion')"));
    expect(desercion.map((d) => d.ref)).toEqual(["cifras:permanencia:desercion"]);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select * from pilo_memory_search('desercion')")))).toMatch(/Solo la función/);
  });

  it("lo que cambia estrena fecha y lo que ya no está se borra", async () => {
    await t.q("update pilo_memory set updated_at = now() - interval '1 day'");
    const changed = [{ ...rows[0], body: rows[0].body + " Bogotá 1.392." }];
    const [r] = await t.asUser(PEOPLE.admin, (q) => q<{ r: Record<string, number> }>("select pilo_memory_replace('cifras', $1::jsonb) as r", [JSON.stringify(changed)]), { commit: true });
    expect(r.r).toMatchObject({ added: 0, changed: 1, removed: 1, total: 1 });
    const [m] = await t.q<{ fresh: boolean }>("select updated_at > now() - interval '1 hour' as fresh from pilo_memory where ref = $1", [rows[0].ref]);
    expect(m.fresh).toBe(true);
  });

  it("una respuesta guardada deja de estar fresca si su pasaje cambió", async () => {
    await t.q("insert into pilo_answers (question, qnorm, kind, answer, refs, created_at) values ('¿Cuántos matriculados hay?', 'cuantos matriculados hay', 'ia', 'Hay 15.870 [1].', array[$1], now() - interval '2 hours')", [rows[0].ref]);
    const [c] = await t.asUser(PEOPLE.admin, (q) => q<{ fresh: boolean }>("select fresh from pilo_answer_candidates('cuantos matriculados hay')"));
    expect(c.fresh).toBe(false);
    await t.q("update pilo_answers set created_at = now()");
    const [d] = await t.asUser(PEOPLE.admin, (q) => q<{ fresh: boolean }>("select fresh from pilo_answer_candidates('matriculados')"));
    expect(d.fresh).toBe(true);
  });

  it("la página tiene su propio interruptor y no depende de la IA", async () => {
    const [c] = await t.q<{ c: { pregunta: Record<string, unknown> } }>("select pilo_ai_public_config() as c");
    expect(c.c.pregunta).toMatchObject({ on: false, aud: "publico", welcome: true, ai: false });
    await t.q(`update pilo_ai_settings set portals = jsonb_set(portals, '{pregunta,on}', 'true')`);
    const [d] = await t.q<{ c: { pregunta: Record<string, unknown> } }>("select pilo_ai_public_config() as c");
    expect(d.c.pregunta).toMatchObject({ on: true, ai: false });
  });
});
