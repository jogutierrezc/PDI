/* =============================================================================
   Mr. Pilo · «Mis notas»: la conexión con Génesis (0131).

   La función pilo-genesis no guarda nada: de la base solo necesita saber a
   dónde llamar. Aquí se comprueba que:

     · la conexión nace apagada y sin dirección;
     · la dirección solo puede ser https, sin usuario, ruta, consulta ni
       ancla, y —a diferencia de la de Moodle— puede llevar puerto;
     · encendida, tiene que haber dirección;
     · solo la administración la lee y la cambia; la función del servidor la
       lee y no la cambia;
     · no sale en la configuración pública;
     · la migración se puede aplicar dos veces y no toca ninguna fila.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0131_pilo_genesis.sql");

let t: TestDb;

const asAdmin = <T>(work: (q: Query) => Promise<T>, commit = false) => t.asUser(PEOPLE.admin, work, { commit });

/** Como la función del servidor: rol de servicio, sin persona. */
async function asService<T>(work: (q: Query) => Promise<T>): Promise<T> {
  await t.db.exec("begin");
  try {
    await t.db.exec("set local role service_role");
    await t.db.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await t.db.query("select set_config('request.jwt.claim.sub', '', true)");
    return await work(t.q);
  } finally {
    await t.db.exec("rollback");
  }
}

const setUrl = (url: string) => t.q("update pilo_spaces set genesis_url = $1 where id = 'ensenanza'", [url]);

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
}, 120_000);

afterAll(() => t?.close());

describe("la conexión con Génesis, en la ficha del espacio", () => {
  it("nace apagada y sin dirección", async () => {
    expect(await t.q("select genesis_on, genesis_url from pilo_spaces where id = 'ensenanza'")).toEqual([{ genesis_on: false, genesis_url: "" }]);
  });

  it("la dirección solo puede ser https y de entrada: sin usuario, ruta, consulta ni ancla", async () => {
    for (const bad of [
      "http://genesis.udes.edu.co:81", "ftp://genesis.udes.edu.co", "genesis.udes.edu.co:81", "javascript:alert(1)", "https://", "https://:81", "https://usuario@genesis.udes.edu.co",
      "https://genesis.udes.edu.co:81/genesis/mod_auth/login/", "https://genesis.udes.edu.co/", "https://genesis.udes.edu.co:81?a=1", "https://genesis.udes.edu.co#x", "https://genesis.udes.edu.co:puerto",
      "https://genesis.udes.edu.co:123456", "https://genesis.udes.edu.co con espacio", " https://genesis.udes.edu.co", "https://Genesis.udes.edu.co", `https://${"a".repeat(300)}.co`,
    ]) {
      expect(await errorOf(setUrl(bad)), bad).toMatch(/pilo_spaces_genesis_url/);
    }
  });

  it("a diferencia de la de Moodle, puede llevar puerto", async () => {
    for (const ok of ["https://genesis.udes.edu.co", "https://master-val.udes.edu.co:81", "https://genesis.udes.edu.co:8443"]) {
      await setUrl(ok);
      expect(await t.q("select genesis_url from pilo_spaces where id = 'ensenanza'"), ok).toEqual([{ genesis_url: ok }]);
    }
    // La de Moodle sigue con su regla: esta migración no la toca.
    expect(await errorOf(t.q("update pilo_spaces set moodle_url = 'http://moodle.udes.edu.co' where id = 'ensenanza'"))).toMatch(/pilo_spaces_moodle_url/);
    await setUrl("");
  });

  it("encendida, tiene que haber dirección", async () => {
    expect(await errorOf(t.q("update pilo_spaces set genesis_on = true where id = 'ensenanza'"))).toMatch(/pilo_spaces_genesis_on/);
    await t.q("update pilo_spaces set genesis_on = true, genesis_url = 'https://genesis.udes.edu.co:81' where id = 'ensenanza'");
    expect(await errorOf(setUrl(""))).toMatch(/pilo_spaces_genesis_on/);
    await t.q("update pilo_spaces set genesis_on = false, genesis_url = '' where id = 'ensenanza'");
  });
});

describe("quién puede", () => {
  it("solo la administración la cambia", async () => {
    const change = "update pilo_spaces set genesis_on = true, genesis_url = 'https://malo.example.org:81' where id = 'ensenanza' returning id";
    for (const who of [PEOPLE.director, PEOPLE.vx, PEOPLE.reportante]) expect(await t.asUser(who, (q) => q(change)), who).toEqual([]);
    expect(await errorOf(t.asUser(null, (q) => q(change)))).toMatch(/permission denied/);
    expect(await t.q("select genesis_on, genesis_url from pilo_spaces where id = 'ensenanza'")).toEqual([{ genesis_on: false, genesis_url: "" }]);

    const ok = await asAdmin((q) => q("update pilo_spaces set genesis_on = true, genesis_url = 'https://genesis.udes.edu.co:81' where id = 'ensenanza' returning genesis_on, genesis_url"), true);
    expect(ok).toEqual([{ genesis_on: true, genesis_url: "https://genesis.udes.edu.co:81" }]);
  });

  it("solo la administración la lee desde el portal", async () => {
    const read = "select genesis_on, genesis_url from pilo_spaces where id = 'ensenanza'";
    expect(await asAdmin((q) => q(read))).toEqual([{ genesis_on: true, genesis_url: "https://genesis.udes.edu.co:81" }]);
    for (const who of [PEOPLE.director, PEOPLE.vx]) expect(await t.asUser(who, (q) => q(read)), who).toEqual([]);
    expect(await errorOf(t.asUser(null, (q) => q(read)))).toMatch(/permission denied/);
  });

  it("la función del servidor la lee, y no la cambia", async () => {
    expect(await asService((q) => q("select genesis_on, genesis_url from pilo_spaces where id = 'ensenanza'"))).toEqual([{ genesis_on: true, genesis_url: "https://genesis.udes.edu.co:81" }]);
    expect(await errorOf(asService((q) => q("update pilo_spaces set genesis_url = 'https://malo.example.org' where id = 'ensenanza'")))).toMatch(/permission denied/);
  });

  it("no sale en la configuración pública", async () => {
    const [c] = await t.asUser(null, (q) => q<{ c: unknown }>("select pilo_ai_public_config() as c"));
    expect(JSON.stringify(c.c)).not.toMatch(/genesis/i);
    expect(JSON.stringify(c.c)).not.toContain(":81");
  });
});

describe("la migración", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("se puede aplicar dos veces y deja lo guardado como estaba", async () => {
    await t.db.exec(sql);
    await t.db.exec(sql);
    expect(await t.q("select genesis_on, genesis_url from pilo_spaces where id = 'ensenanza'")).toEqual([{ genesis_on: true, genesis_url: "https://genesis.udes.edu.co:81" }]);
  });

  it("no guarda secretos ni datos de estudiantes: solo dos columnas en la ficha", async () => {
    const cols = await t.q<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and column_name like 'genesis%' order by 1");
    expect(cols.map((c) => c.column_name)).toEqual(["genesis_on", "genesis_url"]);
    expect(await t.q("select table_name from information_schema.tables where table_schema = 'public' and table_name like '%genesis%'")).toEqual([]);
    // Sin UPDATE ni DELETE: no toca ninguna fila. El único permiso que nombra es la lectura del rol de servicio.
    const code = sql.replace(/--.*$/gm, "");
    expect(code).not.toMatch(/\b(update|delete|insert|create\s+policy)\b/i);
    expect([...code.matchAll(/\bgrant\b[^;]*;/gi)].map((m) => m[0])).toEqual(["grant select on public.pilo_spaces to service_role;"]);
    expect(code).not.toMatch(/token|password|secret/i);
  });
});
