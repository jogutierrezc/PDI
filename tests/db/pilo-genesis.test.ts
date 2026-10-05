/* =============================================================================
   Mr. Pilo · «Mis notas»: la conexión con Génesis (0131).

   La función pilo-genesis no guarda nada: de la base solo necesita saber a
   dónde llamar. Génesis tiene un portal por sede, así que lo que se guarda es
   una lista. Aquí se comprueba que:

     · la conexión nace apagada y sin portales;
     · la lista admite varios portales (id, nombre y dirección), con tope, sin
       ids ni nombres repetidos, y los nombres los escribe la administración;
     · cada dirección solo puede ser https, sin usuario, ruta, consulta ni
       ancla, y —a diferencia de la de Moodle— puede llevar puerto;
     · encendida, tiene que haber al menos un portal;
     · solo la administración la lee y la cambia; la función del servidor la
       lee y no la cambia;
     · no sale en la configuración pública;
     · la migración se puede aplicar dos veces y no toca ninguna fila.

   Las direcciones de estas pruebas son inventadas.
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

type Portal = Record<string, unknown>;
const BGA: Portal = { id: "bucaramanga", name: "Bucaramanga", url: "https://genesis-bga.udes.edu.co:81" };
const CUC: Portal = { id: "cucuta", name: "Cúcuta", url: "https://genesis-cuc.udes.edu.co:81" };
const TEC: Portal = { id: "tec", name: "TEC", url: "https://genesis-tec.udes.edu.co" };
const SEDES = [BGA, CUC, { id: "valledupar", name: "Valledupar", url: "https://genesis-vup.udes.edu.co:8443" }, { id: "bogota", name: "Bogotá", url: "https://genesis-bog.udes.edu.co" }, TEC];

const setPortals = (portals: unknown) => t.q("update pilo_spaces set genesis_portals = $1::jsonb where id = 'ensenanza'", [JSON.stringify(portals)]);
const read = () => t.q<{ genesis_on: boolean; genesis_portals: Portal[] }>("select genesis_on, genesis_portals from pilo_spaces where id = 'ensenanza'");

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
}, 120_000);

afterAll(() => t?.close());

describe("los portales de Génesis, en la ficha del espacio", () => {
  it("nace apagada y sin portales", async () => {
    expect(await read()).toEqual([{ genesis_on: false, genesis_portals: [] }]);
  });

  it("admite varios portales, uno por sede, y los devuelve en el orden guardado", async () => {
    await setPortals(SEDES);
    expect((await read())[0].genesis_portals.map((p) => p.name)).toEqual(["Bucaramanga", "Cúcuta", "Valledupar", "Bogotá", "TEC"]);
    // Los nombres no están fijados: la administración escribe el que sea.
    await setPortals([...SEDES, { id: "posgrados", name: "Posgrados · sede norte", url: "https://genesis-pos.udes.edu.co" }]);
    expect((await read())[0].genesis_portals).toHaveLength(6);
    await setPortals([]);
  });

  it("la lista tiene forma: un arreglo de hasta 12 portales con id, nombre y dirección, y nada más", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({ id: `sede-${i}`, name: `Sede ${i}`, url: `https://genesis-${i}.udes.edu.co` }));
    await setPortals(twelve);
    for (const bad of [
      [...twelve, { id: "una-mas", name: "Una más", url: "https://genesis-13.udes.edu.co" }],
      {}, "texto", 5, null,
      [null], ["https://genesis.udes.edu.co"], [[BGA]],
      [{ id: "bucaramanga", name: "Bucaramanga" }], [{ id: "bucaramanga", url: BGA.url }], [{ name: "Bucaramanga", url: BGA.url }],
      [{ ...BGA, token: "se-cuela" }], [{ ...BGA, id: 5 }], [{ ...BGA, name: 5 }], [{ ...BGA, url: null }],
    ]) {
      expect(await errorOf(setPortals(bad)), JSON.stringify(bad).slice(0, 70)).toMatch(/pilo_spaces_genesis_portals|not-null|null value/);
    }
    await setPortals([]);
  });

  it("el id es corto y estable: minúsculas, números y guiones", async () => {
    for (const id of ["B", "Bucaramanga", "1sede", "con espacio", "cúcuta", "sede_1", "sede/../x", "", "a".repeat(25)]) {
      expect(await errorOf(setPortals([{ ...BGA, id }])), id).toMatch(/pilo_spaces_genesis_portals/);
    }
    for (const id of ["bga", "sede-2", "tec", "a".repeat(24)]) await setPortals([{ ...BGA, id }]);
    await setPortals([]);
  });

  it("no admite ids ni nombres repetidos", async () => {
    expect(await errorOf(setPortals([BGA, { ...CUC, id: "bucaramanga" }]))).toMatch(/pilo_spaces_genesis_portals/);
    expect(await errorOf(setPortals([BGA, { ...CUC, name: "BUCARAMANGA" }]))).toMatch(/pilo_spaces_genesis_portals/);
    for (const name of ["", " Cúcuta", "Cúcuta ", "x".repeat(61), "Cúcuta\nSede"]) expect(await errorOf(setPortals([{ ...CUC, name }])), JSON.stringify(name).slice(0, 20)).toMatch(/pilo_spaces_genesis_portals/);
  });

  it("cada dirección solo puede ser https y de entrada: sin usuario, ruta, consulta ni ancla", async () => {
    for (const url of [
      "http://genesis.udes.edu.co:81", "ftp://genesis.udes.edu.co", "genesis.udes.edu.co:81", "javascript:alert(1)", "https://", "https://:81", "https://usuario@genesis.udes.edu.co",
      "https://genesis.udes.edu.co:81/genesis/mod_auth/login/", "https://genesis.udes.edu.co/", "https://genesis.udes.edu.co:81?a=1", "https://genesis.udes.edu.co#x", "https://genesis.udes.edu.co:puerto",
      "https://genesis.udes.edu.co:123456", "https://genesis.udes.edu.co con espacio", " https://genesis.udes.edu.co", "https://Genesis.udes.edu.co", `https://${"a".repeat(300)}.co`, "",
    ]) {
      expect(await errorOf(setPortals([BGA, { ...CUC, url }])), url).toMatch(/pilo_spaces_genesis_portals/);
    }
  });

  it("a diferencia de la de Moodle, puede llevar puerto", async () => {
    for (const url of ["https://genesis.udes.edu.co", "https://master-val.udes.edu.co:81", "https://genesis.udes.edu.co:8443"]) {
      await setPortals([{ ...BGA, url }]);
      expect((await read())[0].genesis_portals[0].url, url).toBe(url);
    }
    // La de Moodle sigue con su regla: esta migración no la toca.
    expect(await errorOf(t.q("update pilo_spaces set moodle_url = 'http://moodle.udes.edu.co' where id = 'ensenanza'"))).toMatch(/pilo_spaces_moodle_url/);
    await setPortals([]);
  });

  it("encendida, tiene que haber al menos un portal", async () => {
    expect(await errorOf(t.q("update pilo_spaces set genesis_on = true where id = 'ensenanza'"))).toMatch(/pilo_spaces_genesis_on/);
    await t.q("update pilo_spaces set genesis_on = true, genesis_portals = $1::jsonb where id = 'ensenanza'", [JSON.stringify([TEC])]);
    expect(await errorOf(setPortals([]))).toMatch(/pilo_spaces_genesis_on/);
    // Quitar uno de varios no la apaga.
    await setPortals([TEC, CUC]);
    await setPortals([CUC]);
    await t.q("update pilo_spaces set genesis_on = false, genesis_portals = '[]'::jsonb where id = 'ensenanza'");
  });
});

describe("quién puede", () => {
  const two = JSON.stringify([BGA, CUC]);

  it("solo la administración la cambia", async () => {
    const change = `update pilo_spaces set genesis_on = true, genesis_portals = '[{"id": "malo", "name": "Malo", "url": "https://malo.example.org:81"}]'::jsonb where id = 'ensenanza' returning id`;
    for (const who of [PEOPLE.director, PEOPLE.vx, PEOPLE.reportante]) expect(await t.asUser(who, (q) => q(change)), who).toEqual([]);
    expect(await errorOf(t.asUser(null, (q) => q(change)))).toMatch(/permission denied/);
    expect(await read()).toEqual([{ genesis_on: false, genesis_portals: [] }]);

    const ok = await asAdmin((q) => q("update pilo_spaces set genesis_on = true, genesis_portals = $1::jsonb where id = 'ensenanza' returning genesis_on, genesis_portals", [two]), true);
    expect(ok).toEqual([{ genesis_on: true, genesis_portals: [BGA, CUC] }]);
  });

  it("solo la administración la lee desde el portal", async () => {
    const sql = "select genesis_on, genesis_portals from pilo_spaces where id = 'ensenanza'";
    expect(await asAdmin((q) => q(sql))).toEqual([{ genesis_on: true, genesis_portals: [BGA, CUC] }]);
    for (const who of [PEOPLE.director, PEOPLE.vx]) expect(await t.asUser(who, (q) => q(sql)), who).toEqual([]);
    expect(await errorOf(t.asUser(null, (q) => q(sql)))).toMatch(/permission denied/);
  });

  it("la función del servidor la lee, y no la cambia", async () => {
    expect(await asService((q) => q("select genesis_on, genesis_portals from pilo_spaces where id = 'ensenanza'"))).toEqual([{ genesis_on: true, genesis_portals: [BGA, CUC] }]);
    expect(await errorOf(asService((q) => q("update pilo_spaces set genesis_portals = '[]'::jsonb, genesis_on = false where id = 'ensenanza'")))).toMatch(/permission denied/);
  });

  it("no sale en la configuración pública: ni los portales ni sus direcciones", async () => {
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
    expect(await read()).toEqual([{ genesis_on: true, genesis_portals: [BGA, CUC] }]);
  });

  it("si un borrador con una sola dirección llegó a aplicarse, la retira", async () => {
    await t.db.exec("alter table public.pilo_spaces add column if not exists genesis_url text not null default ''");
    await t.db.exec(sql);
    expect(await t.q("select column_name from information_schema.columns where table_name = 'pilo_spaces' and column_name = 'genesis_url'")).toEqual([]);
    expect(await read()).toEqual([{ genesis_on: true, genesis_portals: [BGA, CUC] }]);
  });

  it("no guarda secretos ni datos de estudiantes: solo dos columnas en la ficha", async () => {
    const cols = await t.q<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and column_name like 'genesis%' order by 1");
    expect(cols.map((c) => c.column_name)).toEqual(["genesis_advice", "genesis_on", "genesis_portals"]);
    expect(await t.q("select table_name from information_schema.tables where table_schema = 'public' and table_name like '%genesis%'")).toEqual([]);
    // Sin UPDATE ni DELETE: no toca ninguna fila. No crea políticas, y los únicos permisos que nombra son la
    // lectura del rol de servicio y poder usar la función de la restricción.
    const code = sql.replace(/--.*$/gm, "");
    expect(code).not.toMatch(/\b(update|delete|insert|create\s+policy)\b/i);
    expect([...code.matchAll(/\bgrant\b[^;]*;/gi)].map((m) => m[0])).toEqual([
      "grant execute on function public.pilo_genesis_portals_ok(jsonb) to authenticated, service_role;",
      "grant select on public.pilo_spaces to service_role;",
    ]);
    expect(code).not.toMatch(/token|password|secret/i);
  });

  it("la función de la restricción dice sí o no, sin leer ninguna tabla", async () => {
    const ok = async (v: unknown) => (await t.q<{ ok: boolean }>("select pilo_genesis_portals_ok($1::jsonb) as ok", [JSON.stringify(v)]))[0].ok;
    expect(await ok([])).toBe(true);
    expect(await ok(SEDES)).toBe(true);
    expect(await ok({})).toBe(false);
    expect(await ok([BGA, BGA])).toBe(false);
    expect((await t.q<{ ok: boolean }>("select pilo_genesis_portals_ok(null) as ok"))[0].ok).toBe(false);
    const [f] = await t.q<{ v: string }>("select provolatile as v from pg_proc where proname = 'pilo_genesis_portals_ok'");
    expect(f.v).toBe("i");
  });
});
