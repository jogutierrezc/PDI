/* =============================================================================
   Análisis de los datos (0099): las indicaciones guardadas las lee y las
   edita quien puede editar el periodo de UDES en Cifras; nadie más.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
}, 120_000);

afterAll(() => t?.close());

describe("indicaciones del análisis", () => {
  it("la administración guarda, lee y borra", async () => {
    await t.asUser(
      PEOPLE.admin,
      (q) => q("insert into od_analysis_prompts (name, body, brief) values ($1, $2, $3::jsonb)", ["Consejo Superior", "Compara las sedes", JSON.stringify({ format: "sedes" })]),
      { commit: true },
    );
    const rows = await t.asUser(PEOPLE.admin, (q) => q<{ name: string; created_by: string }>("select name, created_by from od_analysis_prompts"));
    expect(rows).toEqual([{ name: "Consejo Superior", created_by: PEOPLE.admin }]);
  });

  it("un director de programa no las ve ni las crea", async () => {
    const rows = await t.asUser(PEOPLE.director, (q) => q("select * from od_analysis_prompts"));
    expect(rows).toHaveLength(0);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("insert into od_analysis_prompts (name, body) values ('x', 'y')")))).toMatch(/row-level security/);
  });

  it("el público no llega a la tabla", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select * from od_analysis_prompts")))).toMatch(/permission denied/);
  });

  it("el nombre no puede ir vacío", async () => {
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("insert into od_analysis_prompts (name, body) values ('  ', 'y')")))).toMatch(/check constraint/);
  });
});
