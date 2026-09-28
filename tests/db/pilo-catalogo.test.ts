/* =============================================================================
   Pregúntele a Pilo (0096): el catálogo lo importa la administración, se
   guarda por clave y «reemplazar» deja la clase igual al libro.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
}, 120_000);

afterAll(() => t?.close());

const capciosas = [
  { key: "c-001", triggers: ["salario rector", "cuanto gana"], answer: "Eso no lo cuento: los salarios no se publican.", mood: "atrevido" },
  { key: "C-002", triggers: ["novia"], answer: "Mi único amor son los datos abiertos.", mood: "loco" },
];

describe("catálogo de Pilo", () => {
  it("solo la administración importa; la clave se guarda en mayúsculas", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_catalog_import('capciosa', $1::jsonb)", [JSON.stringify(capciosas)])))).toMatch(/Solo la administración/);
    const [r] = await t.asUser(PEOPLE.admin, (q) => q<{ r: Record<string, number> }>("select pilo_catalog_import('capciosa', $1::jsonb) as r", [JSON.stringify(capciosas)]), { commit: true });
    expect(r.r).toMatchObject({ added: 2, updated: 0, removed: 0, total: 2 });
    const keys = await t.q<{ key: string }>("select key from pilo_catalog order by key");
    expect(keys.map((k) => k.key)).toEqual(["C-001", "C-002"]);
  });

  it("importar de nuevo actualiza, y reemplazar borra lo que no vino", async () => {
    const again = [{ ...capciosas[0], answer: "No: los salarios no son públicos." }];
    const [r] = await t.asUser(PEOPLE.admin, (q) => q<{ r: Record<string, number> }>("select pilo_catalog_import('capciosa', $1::jsonb, true) as r", [JSON.stringify(again)]), { commit: true });
    expect(r.r).toMatchObject({ added: 0, updated: 1, removed: 1, total: 1 });
    const [row] = await t.q<{ answer: string }>("select answer from pilo_catalog where key = 'C-001'");
    expect(row.answer).toBe("No: los salarios no son públicos.");
  });

  it("una respuesta necesita su pregunta; una capciosa, sus disparadores", async () => {
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select pilo_catalog_import('respuesta', $1::jsonb)", [JSON.stringify([{ key: "R-1", answer: "Sin pregunta" }])])))).toMatch(/pilo_catalog_needs/);
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select pilo_catalog_import('capciosa', $1::jsonb)", [JSON.stringify([{ key: "C-9", answer: "Sin disparadores" }])])))).toMatch(/pilo_catalog_needs/);
  });

  it("el público no lo lee; la función del servidor lee solo lo activo", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select * from pilo_catalog")))).toMatch(/permission denied/);
    await t.q("update pilo_catalog set active = false where key = 'C-001'");
    const rows = await t.asUser(PEOPLE.admin, (q) => q("select * from pilo_catalog_active()"));
    expect(rows).toHaveLength(0);
  });
});
