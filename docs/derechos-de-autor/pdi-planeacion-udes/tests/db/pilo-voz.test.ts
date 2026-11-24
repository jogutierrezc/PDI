/* =============================================================================
   La voz de Pilo con NVIDIA (0101): la clave de la voz es la de NVIDIA, la voz
   está lista con function-id y una muestra, y el bucket pilo-voz es solo de la
   administración.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  // Como en Supabase: las tablas de Storage se abren a los roles y RLS decide.
  await t.db.exec("grant usage on schema storage to anon, authenticated; grant select, insert, update, delete on storage.objects to anon, authenticated");
}, 120_000);

afterAll(() => t?.close());

const ready = async () => {
  const [{ c }] = await t.asUser(null, (q) => q<{ c: { speech_ready: boolean } }>("select pilo_ai_public_config() as c"));
  return c.speech_ready;
};

describe("voz de NVIDIA", () => {
  it("usa la clave de NVIDIA y está lista con function-id y una muestra", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_ai_set_key('mis-1111', 'mistral'), pilo_ai_set_key('nvapi-9999', 'nvidia')"), { commit: true });
    await t.q("update pilo_ai_settings set voice_engine = 'proveedor', speech_provider = 'nvidia'");
    const [keys] = await t.q<{ speech_key: string }>("select speech_key from pilo_ai_keys_in_use()");
    expect(keys.speech_key).toBe("nvapi-9999");
    expect(await ready()).toBe(false);
    await t.q("update pilo_ai_settings set speech_function_id = '877104f7-e885-42b9-8de8-f6e4c6303969'");
    expect(await ready()).toBe(false);
    await t.q(`update pilo_ai_settings set voice_styles = '[{"id":"cercano","name":"Cercano","path":"muestras/cercano.wav","seconds":5}]'`);
    expect(await ready()).toBe(true);
  });

  it("rechaza un function-id, una calidad o unos estilos que no sirven", async () => {
    expect(await errorOf(t.q("update pilo_ai_settings set speech_function_id = 'magpie'"))).toMatch(/pilo_ai_settings_function_id/);
    expect(await errorOf(t.q("update pilo_ai_settings set voice_quality = 41"))).toMatch(/pilo_ai_settings_voice_quality/);
    expect(await errorOf(t.q(`update pilo_ai_settings set voice_styles = '{}'`))).toMatch(/pilo_ai_settings_voice_styles/);
  });

  it("el bucket pilo-voz es privado y solo de la administración", async () => {
    const [bucket] = await t.q<{ public: boolean }>("select public from storage.buckets where id = 'pilo-voz'");
    expect(bucket.public).toBe(false);
    await t.asUser(PEOPLE.admin, (q) => q("insert into storage.objects (bucket_id, name) values ('pilo-voz', 'muestras/cercano.wav')"), { commit: true });
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("insert into storage.objects (bucket_id, name) values ('pilo-voz', 'muestras/otra.wav')")))).toMatch(/row-level security/);
    expect(await t.asUser(PEOPLE.director, (q) => q("select name from storage.objects where bucket_id = 'pilo-voz'"))).toHaveLength(0);
    expect(await t.asUser(null, (q) => q("select name from storage.objects where bucket_id = 'pilo-voz'"))).toHaveLength(0);
    expect(await t.asUser(PEOPLE.admin, (q) => q("select name from storage.objects where bucket_id = 'pilo-voz'"))).toHaveLength(1);
  });

  it("Fish Audio usa su clave y está lista con un estilo que tenga voz creada", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_ai_set_key('fish-7777', 'fishaudio')"), { commit: true });
    await t.q("update pilo_ai_settings set speech_provider = 'fishaudio'");
    const [keys] = await t.q<{ speech_key: string }>("select speech_key from pilo_ai_keys_in_use()");
    expect(keys.speech_key).toBe("fish-7777");
    const [status] = await t.asUser(PEOPLE.admin, (q) => q<{ s: { keys: Record<string, { last4: string }> } }>("select pilo_ai_key_status() as s"));
    expect(status.s.keys.fishaudio.last4).toBe("7777");
    const [row] = await t.q<{ fish_model: string }>("select fish_model from pilo_ai_settings");
    expect(row.fish_model).toBe("s2.1-pro-free");
    expect(await ready()).toBe(false);
    await t.q(`update pilo_ai_settings set voice_styles = '[{"id":"cercano","name":"Cercano","path":"muestras/cercano.wav","seconds":5,"fish_id":"abc123","tone":"calm"}]'`);
    expect(await ready()).toBe(true);
    const [bucket] = await t.q<{ allowed_mime_types: string[] }>("select allowed_mime_types from storage.buckets where id = 'pilo-voz'");
    expect(bucket.allowed_mime_types).toContain("audio/mpeg");
  });
});
