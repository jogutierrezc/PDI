/* =============================================================================
   Mr. Pilo con IA (0089): la configuración es de la administración, la clave
   no la lee nadie desde el cliente y el portal solo sabe si Pilo está y dónde.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  // El rol global sale del rol de acceso, como en la base real.
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
}, 120_000);

afterAll(() => t?.close());

const config = (q: (sql: string) => Promise<unknown[]>) =>
  q("select pilo_ai_public_config() as c") as Promise<{ c: Record<string, unknown> }[]>;

describe("pilo_ai", () => {
  it("solo la administración lee y cambia la configuración", async () => {
    const seen = await t.asUser(PEOPLE.director, (q) => q("select * from pilo_ai_settings"));
    expect(seen).toHaveLength(0);
    const [row] = await t.asUser(PEOPLE.admin, (q) => q<{ enabled: boolean }>("select enabled from pilo_ai_settings"));
    expect(row.enabled).toBe(false);
    await t.asUser(PEOPLE.director, (q) => q("update pilo_ai_settings set enabled = true"), { commit: true });
    const [still] = await t.q<{ enabled: boolean }>("select enabled from pilo_ai_settings");
    expect(still.enabled).toBe(false);
  });

  it("la clave se guarda con una función y nadie la lee desde el cliente", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_ai_set_key('sk-prueba-1234')")))).toMatch(/Solo la administración/);
    const [set] = await t.asUser(PEOPLE.admin, (q) => q<{ l: string }>("select pilo_ai_set_key('  sk-prueba-9876  ') as l"), { commit: true });
    expect(set.l).toBe("9876");
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select api_key from pilo_ai_secret")))).toMatch(/permission denied/);
    const [status] = await t.asUser(PEOPLE.admin, (q) => q<{ s: Record<string, unknown> }>("select pilo_ai_key_status() as s"));
    expect(status.s).toMatchObject({ has_key: true, last4: "9876", has_speech_key: false });
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_ai_set_key('voz-abcd', 'voz')"), { commit: true });
    const [both] = await t.asUser(PEOPLE.admin, (q) => q<{ s: Record<string, unknown> }>("select pilo_ai_key_status() as s"));
    expect(both.s).toMatchObject({ last4: "9876", speech_last4: "abcd" });
  });

  it("cada proveedor guarda su clave y se usa la del elegido", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_ai_set_key('mis-1111', 'mistral'), pilo_ai_set_key('free-2222', 'freeai')"), { commit: true });
    const [status] = await t.asUser(PEOPLE.admin, (q) => q<{ s: { keys: Record<string, { has: boolean; last4: string }>; last4: string } }>("select pilo_ai_key_status() as s"));
    expect(status.s.keys.mistral).toEqual({ has: true, last4: "1111" });
    expect(status.s.keys.freeai).toEqual({ has: true, last4: "2222" });
    expect(status.s.last4).toBe("1111");
    await t.q("update pilo_ai_settings set provider = 'freeai'");
    const [again] = await t.asUser(PEOPLE.admin, (q) => q<{ s: { last4: string } }>("select pilo_ai_key_status() as s"));
    expect(again.s.last4).toBe("2222");
    await t.q("update pilo_ai_settings set provider = 'mistral'");
  });

  it("el portal, incluso sin sesión, solo sabe si está encendido y dónde", async () => {
    let [{ c }] = await t.asUser(null, config);
    expect(c.enabled).toBe(false);
    await t.q("update pilo_ai_settings set enabled = true, base_url = 'https://api.mistral.ai/v1', text_model = 'mistral-small-latest'");
    [{ c }] = await t.asUser(null, config);
    expect(c.enabled).toBe(true);
    // Mistral para el texto; sin proveedor de voz, se lee con el navegador.
    expect(c.speech_ready).toBe(false);
    expect(c).not.toHaveProperty("base_url");
    expect(c).not.toHaveProperty("text_model");
    expect((c.portals as Record<string, { aud: string }>).cifras.aud).toBe("admin");
  });

  it("la dirección del proveedor debe ser https", async () => {
    expect(await errorOf(t.q("update pilo_ai_settings set base_url = 'http://inseguro.ai'"))).toMatch(/pilo_ai_settings_url/);
  });
});
