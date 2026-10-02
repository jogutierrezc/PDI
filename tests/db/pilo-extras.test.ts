/* =============================================================================
   Funciones ampliadas de Mr. Pilo (0119): el permiso para analizar archivos y
   generar código nace apagado, solo la administración lo cambia, y lo público
   no expone los topes.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0119_pilo_funciones_ampliadas.sql");

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
}, 120_000);

afterAll(() => t?.close());

describe("pilo_extras", () => {
  it("los dos Pilos nacen con las dos funciones apagadas", async () => {
    const rows = await t.q<{ space: string; files_aud: string; code_aud: string }>("select space, files_aud, code_aud from pilo_extras order by space");
    expect(rows).toEqual([
      { space: "ensenanza", files_aud: "nadie", code_aud: "nadie" },
      { space: "planeacion", files_aud: "nadie", code_aud: "nadie" },
    ]);
  });

  it("la administración cambia el permiso; quien no lo es, no cambia nada", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("update pilo_extras set files_aud = 'sesion', code_aud = 'publico' where space = 'ensenanza'"), { commit: true });
    await t.asUser(PEOPLE.vx, (q) => q("update pilo_extras set files_aud = 'publico' where space = 'planeacion'"), { commit: true });
    const rows = await t.q<{ space: string; files_aud: string }>("select space, files_aud from pilo_extras order by space");
    expect(rows).toEqual([
      { space: "ensenanza", files_aud: "sesion" },
      { space: "planeacion", files_aud: "nadie" },
    ]);
    expect(await t.asUser(PEOPLE.vx, (q) => q("select * from pilo_extras"))).toEqual([]);
  });

  it("no acepta audiencias ni topes fuera de lo previsto", async () => {
    expect(await errorOf(t.q("update pilo_extras set files_aud = 'todos' where space = 'planeacion'"))).toBeTruthy();
    expect(await errorOf(t.q("update pilo_extras set file_max_mb = 100 where space = 'planeacion'"))).toBeTruthy();
    expect(await errorOf(t.q("insert into pilo_extras (space) values ('otro')"))).toBeTruthy();
  });

  it("lo público dice para quién es cada función y el tamaño, sin los topes diarios ni la extensión", async () => {
    const [{ pilo_extras_public: out }] = await t.asUser(PEOPLE.vx, (q) => q<{ pilo_extras_public: Record<string, Record<string, unknown>> }>("select pilo_extras_public()"));
    expect(out.ensenanza).toEqual({ files_aud: "sesion", code_aud: "publico", file_max_mb: 10 });
    expect(out.planeacion).toEqual({ files_aud: "nadie", code_aud: "nadie", file_max_mb: 10 });
  });

  it("la migración se puede aplicar dos veces sin perder lo configurado", async () => {
    await t.db.exec(readFileSync(MIGRATION, "utf8"));
    const [row] = await t.q<{ files_aud: string }>("select files_aud from pilo_extras where space = 'ensenanza'");
    expect(row.files_aud).toBe("sesion");
  });
});
