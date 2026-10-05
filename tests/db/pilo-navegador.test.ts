/* =============================================================================
   Mr. Pilo: el navegador para leer páginas web (0132).

   La conexión con el servicio de navegador nace apagada, solo la configura la
   administración y no se deja encender sin dirección o sin clave. La clave es
   un secreto: nadie la lee desde el portal —ni el público, ni una persona con
   sesión, ni la administración por SQL—; la administración solo ve si hay
   clave y sus cuatro últimos caracteres. La función del servidor (rol de
   servicio) sí la lee.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

const KEY = "clave-del-navegador-0123456789-WXYZ";
const URL_OK = "https://navegador.udes.edu.co";

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

const status = async (q: Query) => (await q<{ s: { enabled: boolean; url: string; key: { has: boolean; last4: string }; ready: boolean } }>("select pilo_browser_status() as s"))[0].s;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
}, 120_000);

afterAll(() => t?.close());

describe("la conexión con el navegador", () => {
  it("nace apagada, sin dirección y sin clave", async () => {
    expect(await t.q("select id, enabled, url from pilo_browser")).toEqual([{ id: 1, enabled: false, url: "" }]);
    expect(await t.q("select id, key from pilo_browser_secret")).toEqual([{ id: 1, key: "" }]);
    expect(await asAdmin(status)).toMatchObject({ enabled: false, url: "", key: { has: false, last4: "" }, ready: false });
  });

  it("solo la administración la configura", async () => {
    for (const who of [PEOPLE.director, PEOPLE.vx]) {
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_browser_save(false, $1)", [URL_OK]))), who).toMatch(/Solo la administración/);
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_browser_set_key($1)", [KEY]))), who).toMatch(/Solo la administración/);
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_browser_status()"))), who).toMatch(/Solo la administración/);
      // Ni la ve ni la cambia por la tabla.
      expect(await t.asUser(who, (q) => q("select * from pilo_browser")), who).toEqual([]);
      expect(await errorOf(t.asUser(who, (q) => q("update pilo_browser set enabled = true where id = 1"))), who).toMatch(/permission denied/);
    }
    for (const call of ["pilo_browser_save(false, 'https://x.co')", "pilo_browser_set_key('x')", "pilo_browser_status()"]) {
      expect(await errorOf(t.asUser(null, (q) => q(`select ${call}`))), call).toMatch(/permission denied/);
    }
    expect(await errorOf(t.asUser(null, (q) => q("select * from pilo_browser")))).toMatch(/permission denied/);
    // Tampoco la administración escribe la tabla directo: solo por función.
    expect(await errorOf(asAdmin((q) => q("update pilo_browser set enabled = true, url = 'https://x.co' where id = 1")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("insert into pilo_browser (id) values (2)")))).toMatch(/permission denied/);
  });

  it("la dirección solo puede ser https, sin usuario, consulta ni ancla", async () => {
    for (const bad of ["http://navegador.udes.edu.co", "navegador.udes.edu.co", "ftp://navegador.udes.edu.co", "https://", "https://usuario@navegador.udes.edu.co", "https://navegador.udes.edu.co/?a=1", "https://navegador.udes.edu.co/#x", "https://navegador.udes.edu.co/con espacio", `https://${"a".repeat(300)}.co`]) {
      expect(await errorOf(asAdmin((q) => q("select pilo_browser_save(false, $1)", [bad]))), bad).toMatch(/debe empezar por https/);
    }
    // La tabla lo exige también por su cuenta.
    expect(await errorOf(t.q("update pilo_browser set url = 'http://x.co' where id = 1"))).toMatch(/pilo_browser_url/);
    expect(await errorOf(t.q("update pilo_browser set enabled = true where id = 1"))).toMatch(/pilo_browser_enabled/);
    expect(await errorOf(t.q("insert into pilo_browser (id) values (2)"))).toMatch(/pilo_browser_single/);
    // Con puerto y ruta de base vale; la barra final se quita.
    await asAdmin(async (q) => {
      expect((await q<{ s: { url: string } }>("select pilo_browser_save(false, ' https://navegador.udes.edu.co:8443/pilo/ ') as s"))[0].s.url).toBe("https://navegador.udes.edu.co:8443/pilo");
    });
  });

  it("no se enciende sin dirección o sin clave", async () => {
    expect(await errorOf(asAdmin((q) => q("select pilo_browser_save(true, $1)", [URL_OK])))).toMatch(/antes de encenderlo/);
    expect(await errorOf(asAdmin((q) => q("select pilo_browser_save(true, '')")))).toMatch(/antes de encenderlo/);
    // Con clave pero sin dirección, tampoco.
    const keyOnly = asAdmin(async (q) => {
      await q("select pilo_browser_set_key($1)", [KEY]);
      await q("select pilo_browser_save(true, null)");
    });
    expect(await errorOf(keyOnly)).toMatch(/antes de encenderlo/);
  });
});

describe("la clave del navegador", () => {
  it("la guarda la administración y solo vuelven sus cuatro últimos caracteres", async () => {
    expect(await errorOf(asAdmin((q) => q("select pilo_browser_set_key('corta')")))).toMatch(/al menos 24/);
    expect(await errorOf(asAdmin((q) => q("select pilo_browser_set_key(repeat('x', 201))")))).toMatch(/demasiado larga/);
    // Ni siquiera la función del servidor la cambia: es cosa de la administración.
    expect(await errorOf(asService((q) => q("select pilo_browser_set_key($1)", [KEY])))).toMatch(/permission denied|Solo la administración/);

    const [r] = await asAdmin((q) => q<{ last4: string }>("select pilo_browser_set_key($1) as last4", [`  ${KEY}\n`]), true);
    expect(r.last4).toBe("WXYZ");
    expect(await t.q("select key, updated_by from pilo_browser_secret where id = 1")).toEqual([{ key: KEY, updated_by: PEOPLE.admin }]);
  });

  it("con dirección y clave, se enciende; y el estado nunca lleva la clave", async () => {
    const s = (await asAdmin((q) => q<{ s: Record<string, unknown> }>("select pilo_browser_save(true, $1) as s", [`${URL_OK}/`]), true))[0].s;
    expect(s).toMatchObject({ enabled: true, url: URL_OK, key: { has: true, last4: "WXYZ" }, ready: true });
    expect(JSON.stringify(s)).not.toContain(KEY);
    expect(JSON.stringify(s)).not.toContain(KEY.slice(0, 12));
    // Un valor nulo deja lo que había.
    expect((await asAdmin((q) => q<{ s: Record<string, unknown> }>("select pilo_browser_save(null, null) as s")))[0].s).toMatchObject({ enabled: true, url: URL_OK });
    expect((await asAdmin((q) => q<{ s: Record<string, unknown> }>("select pilo_browser_save(false, null) as s")))[0].s).toMatchObject({ enabled: false, url: URL_OK, ready: false });
    expect(await t.q("select enabled, url, updated_by from pilo_browser")).toEqual([{ enabled: true, url: URL_OK, updated_by: PEOPLE.admin }]);
  });

  it("no la lee el público, ni una persona con sesión, ni la administración por SQL", async () => {
    for (const who of [null, PEOPLE.vx, PEOPLE.director, PEOPLE.admin]) {
      expect(await errorOf(t.asUser(who, (q) => q("select key from pilo_browser_secret"))), String(who)).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(who, (q) => q("select count(*) from pilo_browser_secret"))), String(who)).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(who, (q) => q("update pilo_browser_secret set key = 'x' where true returning key"))), String(who)).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(who, (q) => q("delete from pilo_browser_secret where true returning key"))), String(who)).toMatch(/permission denied/);
    }
    const [c] = await t.q<{ rls: boolean; policies: number }>(
      `select c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.tablename = 'pilo_browser_secret') as policies
       from pg_class c where c.oid = 'public.pilo_browser_secret'::regclass`,
    );
    expect(c).toEqual({ rls: true, policies: 0 });
    for (const role of ["anon", "authenticated"]) {
      const [p] = await t.q<{ any: boolean }>("select has_table_privilege($1, 'public.pilo_browser_secret', 'select, insert, update, delete') as any", [role]);
      expect(p.any, role).toBe(false);
    }
    // Tampoco sale en la configuración pública de Pilo.
    const [pub] = await t.asUser(null, (q) => q<{ c: unknown }>("select pilo_ai_public_config() as c"));
    expect(JSON.stringify(pub.c)).not.toContain("WXYZ");
    expect(JSON.stringify(pub.c)).not.toContain("navegador.udes.edu.co");
  });

  it("la función del servidor sí lee la conexión y la clave", async () => {
    expect(await asService((q) => q("select enabled, url from pilo_browser where id = 1"))).toEqual([{ enabled: true, url: URL_OK }]);
    expect(await asService((q) => q("select key from pilo_browser_secret where id = 1"))).toEqual([{ key: KEY }]);
    expect(await asService(status)).toMatchObject({ ready: true, key: { has: true, last4: "WXYZ" } });
    // Pero no escribe la conexión.
    expect(await errorOf(asService((q) => q("update pilo_browser set enabled = false where id = 1")))).toMatch(/permission denied/);
  });

  it("quitar la clave apaga el servicio", async () => {
    await asAdmin(async (q) => {
      const [r] = await q<{ last4: string }>("select pilo_browser_set_key('') as last4");
      expect(r.last4).toBe("");
      expect(await status(q)).toMatchObject({ enabled: false, url: URL_OK, key: { has: false, last4: "" }, ready: false });
    });
    // Fuera de ese bloque (se revirtió) sigue como estaba.
    expect(await asAdmin(status)).toMatchObject({ enabled: true, ready: true });
  });
});
