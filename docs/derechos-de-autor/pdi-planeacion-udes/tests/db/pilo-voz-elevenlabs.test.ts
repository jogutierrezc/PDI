/* =============================================================================
   La voz de ElevenLabs (0172): su clave aparte (solo los últimos 4 se ven), la
   voz lista con clave y una voz, los límites de la configuración y el permiso
   de «cantar», que nace apagado y solo cambia la administración. La migración
   se puede aplicar dos veces.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0172_pilo_voz_elevenlabs.sql");

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
}, 120_000);

afterAll(() => t?.close());

const ready = async () => {
  const [{ c }] = await t.asUser(null, (q) => q<{ c: { speech_ready: boolean } }>("select pilo_ai_public_config() as c"));
  return c.speech_ready;
};

describe("la voz de ElevenLabs", () => {
  it("guarda su clave aparte y solo la administración ve los últimos 4", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_ai_set_key('sk_eleven_abcd1234', 'elevenlabs')"), { commit: true });
    const [status] = await t.asUser(PEOPLE.admin, (q) => q<{ s: { keys: Record<string, { has: boolean; last4: string }> } }>("select pilo_ai_key_status() as s"));
    expect(status.s.keys.elevenlabs).toEqual({ has: true, last4: "1234" });
    expect(JSON.stringify(status.s)).not.toContain("sk_eleven_abcd");
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_ai_set_key('x', 'elevenlabs')")))).toMatch(/administración/);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_ai_key_status()")))).toMatch(/administración/);
    // La clave no sale por la configuración pública.
    const [{ c }] = await t.asUser(null, (q) => q<{ c: unknown }>("select pilo_ai_public_config() as c"));
    expect(JSON.stringify(c)).not.toContain("sk_eleven");
  });

  it("usa solo su clave como clave de la voz, aunque haya una «clave de voz» aparte", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_ai_set_key('otra-clave-voz', 'voz'), pilo_ai_set_key('mis-1111', 'mistral')"), { commit: true });
    await t.q("update pilo_ai_settings set voice_engine = 'proveedor', speech_provider = 'elevenlabs'");
    const [keys] = await t.q<{ speech_key: string }>("select speech_key from pilo_ai_keys_in_use()");
    expect(keys.speech_key).toBe("sk_eleven_abcd1234");
  });

  it("está lista con la clave y una voz (la de siempre o la de un estilo)", async () => {
    expect(await ready()).toBe(false);
    await t.q("update pilo_ai_settings set eleven_voice_id = 'JBFqnCBsd6RMkjVDRZzb'");
    expect(await ready()).toBe(true);
    await t.q("update pilo_ai_settings set eleven_voice_id = ''");
    expect(await ready()).toBe(false);
    await t.q(`update pilo_ai_settings set voice_styles = '[{"id":"pilo","name":"Pilo","path":"","seconds":0,"eleven_id":"JBFqnCBsd6RMkjVDRZzb"}]'`);
    expect(await ready()).toBe(true);
    await t.q("update pilo_ai_secret set elevenlabs_key = '' where id = 1");
    expect(await ready()).toBe(false);
    await t.q("update pilo_ai_secret set elevenlabs_key = 'sk_eleven_abcd1234' where id = 1");
  });

  it("las partidas son las de ElevenLabs y la base rechaza lo que no sirve", async () => {
    const [row] = await t.q<Record<string, unknown>>("select eleven_model, eleven_format, eleven_stability, eleven_similarity, eleven_style, eleven_speed, eleven_speaker_boost, eleven_fallback from pilo_ai_settings");
    expect(row).toMatchObject({ eleven_model: "eleven_v3", eleven_format: "mp3_44100_128", eleven_speaker_boost: true, eleven_fallback: "ninguno" });
    expect(Number(row.eleven_stability)).toBe(0.5);
    expect(Number(row.eleven_speed)).toBe(1);
    expect(await errorOf(t.q("update pilo_ai_settings set eleven_model = 'gpt-4'"))).toMatch(/pilo_ai_settings_eleven/);
    expect(await errorOf(t.q("update pilo_ai_settings set eleven_voice_id = '../v1/user'"))).toMatch(/pilo_ai_settings_eleven/);
    expect(await errorOf(t.q("update pilo_ai_settings set eleven_format = 'wav_44100'"))).toMatch(/pilo_ai_settings_eleven/);
    expect(await errorOf(t.q("update pilo_ai_settings set eleven_speed = 2"))).toMatch(/pilo_ai_settings_eleven/);
    expect(await errorOf(t.q("update pilo_ai_settings set eleven_fallback = 'navegador'"))).toMatch(/pilo_ai_settings_eleven/);
    expect(await errorOf(t.q("update pilo_ai_settings set speech_provider = 'otra'"))).toMatch(/pilo_ai_settings_speech_provider/);
  });
});

describe("cantar (pilo_extras)", () => {
  it("nace apagado en los dos Pilos, con topes de partida", async () => {
    const rows = await t.q<Record<string, unknown>>("select space, sing_aud, sing_daily, sing_max_chars, sing_max_seconds from pilo_extras order by space");
    expect(rows).toEqual([
      { space: "ensenanza", sing_aud: "nadie", sing_daily: 10, sing_max_chars: 600, sing_max_seconds: 60 },
      { space: "planeacion", sing_aud: "nadie", sing_daily: 10, sing_max_chars: 600, sing_max_seconds: 60 },
    ]);
  });

  it("la administración lo enciende por espacio; quien no lo es, no cambia nada", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("update pilo_extras set sing_aud = 'admin', sing_daily = 5 where space = 'planeacion'"), { commit: true });
    await t.asUser(PEOPLE.vx, (q) => q("update pilo_extras set sing_aud = 'publico' where space = 'ensenanza'"), { commit: true });
    const rows = await t.q<{ space: string; sing_aud: string; sing_daily: number }>("select space, sing_aud, sing_daily from pilo_extras order by space");
    expect(rows).toEqual([
      { space: "ensenanza", sing_aud: "nadie", sing_daily: 10 },
      { space: "planeacion", sing_aud: "admin", sing_daily: 5 },
    ]);
  });

  it("rechaza permisos y topes fuera de margen", async () => {
    expect(await errorOf(t.q("update pilo_extras set sing_aud = 'todos' where space = 'planeacion'"))).toMatch(/pilo_extras_sing_aud/);
    expect(await errorOf(t.q("update pilo_extras set sing_daily = 201 where space = 'planeacion'"))).toMatch(/pilo_extras_sing_limits/);
    expect(await errorOf(t.q("update pilo_extras set sing_max_chars = 5000 where space = 'planeacion'"))).toMatch(/pilo_extras_sing_limits/);
    expect(await errorOf(t.q("update pilo_extras set sing_max_seconds = 600 where space = 'planeacion'"))).toMatch(/pilo_extras_sing_limits/);
  });

  it("lo público no expone el permiso ni los topes de cantar", async () => {
    const [{ e }] = await t.asUser(null, (q) => q<{ e: Record<string, Record<string, unknown>> }>("select pilo_extras_public() as e"));
    expect(Object.keys(e.planeacion).sort()).toEqual(["code_aud", "file_max_mb", "files_aud"]);
  });
});

describe("la migración", () => {
  it("se puede aplicar dos veces sin romper nada y no borra datos sin WHERE", async () => {
    const sql = readFileSync(MIGRATION, "utf8");
    await t.db.exec(sql);
    await t.db.exec(sql);
    expect(sql).not.toMatch(/\bdelete\s+from\b(?![^;]*\bwhere\b)/i);
    const [{ c }] = await t.q<{ c: number }>("select count(*)::int as c from pilo_extras");
    expect(c).toBe(2);
    const [keys] = await t.q<{ speech_key: string }>("select speech_key from pilo_ai_keys_in_use()");
    expect(keys.speech_key).toBe("sk_eleven_abcd1234");
  });
});
