/* =============================================================================
   Pregúntele a Pilo con IA siempre (0110): los ajustes nuevos, el contador
   del límite por visitante (que nadie lee desde el cliente), el motivo
   «general» de la bandeja y el uso de hoy con la voz aparte.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
}, 120_000);

afterAll(() => t?.close());

const HASH = "0123456789abcdef0123456789abcdef01234567";
const hit = (visitor: string, window: string) =>
  t.asUser(PEOPLE.admin, (q) => q<{ n: number }>("select pilo_visitor_hit($1, $2::timestamptz) as n", [visitor, window]), { commit: true });

describe("los ajustes de preguntar", () => {
  it("nacen con valores sensatos", async () => {
    const [s] = await t.q("select ask_temperature::float as t, ask_max_tokens, ask_context_tokens, ask_history_turns, system_role, ask_stream, voice_daily_limit, visitor_limit, visitor_window_seconds from pilo_ai_settings where id = 1");
    expect(s).toEqual({ t: 0.3, ask_max_tokens: 800, ask_context_tokens: 3500, ask_history_turns: 6, system_role: "auto", ask_stream: true, voice_daily_limit: 1500, visitor_limit: 20, visitor_window_seconds: 600 });
  });

  it("no aceptan valores fuera de margen", async () => {
    expect(await errorOf(t.q("update pilo_ai_settings set ask_max_tokens = 50000"))).toMatch(/pilo_ai_settings_ask/);
    expect(await errorOf(t.q("update pilo_ai_settings set system_role = 'developer'"))).toMatch(/pilo_ai_settings_ask/);
    expect(await errorOf(t.q("update pilo_ai_settings set visitor_window_seconds = 1"))).toMatch(/pilo_ai_settings_ask/);
    await t.q("update pilo_ai_settings set system_role = 'user', visitor_limit = 0");
    await t.q("update pilo_ai_settings set system_role = 'auto', visitor_limit = 20");
  });
});

describe("el límite por visitante", () => {
  it("cuenta por huella y por ventana", async () => {
    const w1 = "2026-10-01T12:00:00Z";
    const w2 = "2026-10-01T12:10:00Z";
    expect((await hit(HASH, w1))[0].n).toBe(1);
    expect((await hit(HASH, w1))[0].n).toBe(2);
    expect((await hit(HASH, w2))[0].n).toBe(1);
    expect((await hit(HASH.replace("0", "f"), w1))[0].n).toBe(1);
  });

  it("solo lo usa la función del servidor (o la administración) y pide una huella, no una dirección", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_visitor_hit($1, now())", [HASH])))).toMatch(/Solo la función/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_visitor_hit($1, now())", [HASH])))).toMatch(/permission denied/);
    expect(await errorOf(hit("190.1.2.3", "2026-10-01T12:00:00Z"))).toMatch(/huella/);
  });

  it("nadie lee ni escribe el contador desde el cliente", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select * from pilo_visitor_hits")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select * from pilo_visitor_hits")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("insert into pilo_visitor_hits (visitor, window_start) values ($1, now())", [HASH])))).toMatch(/permission denied/);
  });

  it("la limpieza borra las ventanas de más de un día", async () => {
    await t.q("insert into pilo_visitor_hits (visitor, window_start, hits) values ($1, now() - interval '3 days', 9), ($1, now(), 1)", [HASH.replace("0", "a")]);
    const [gone] = await t.asUser(PEOPLE.admin, (q) => q<{ n: number }>("select pilo_visitor_cleanup() as n"), { commit: true });
    expect(gone.n).toBeGreaterThanOrEqual(1);
    const left = await t.q("select 1 from pilo_visitor_hits where window_start < now() - interval '1 day'");
    expect(left).toEqual([]);
    const kept = await t.q("select 1 from pilo_visitor_hits where visitor = $1", [HASH.replace("0", "a")]);
    expect(kept).toHaveLength(1);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_visitor_cleanup()")))).toMatch(/Solo la función/);
  });
});

describe("la bandeja", () => {
  it("acepta el motivo «general» y sigue rechazando los desconocidos", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_inbox_add('¿Cuál es la capital de Francia?', 'cual es la capital de francia', 'general', 'ia', 'París.')"), { commit: true });
    const rows = await t.q<{ reason: string; kind: string }>("select reason, kind from pilo_inbox where reason = 'general'");
    expect(rows).toEqual([{ reason: "general", kind: "ia" }]);
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select pilo_inbox_add('otra pregunta', 'otra pregunta', 'inventado')")))).toMatch(/pilo_inbox_reason/);
  });
});

describe("el uso de hoy", () => {
  it("cuenta el texto y la voz aparte, sin lo atendido desde lo guardado", async () => {
    await t.q(`insert into pilo_ai_log (portal, action, subject, status, cached) values
      ('pregunta', 'preguntar', 'a', 'listo', false),
      ('pregunta', 'preguntar', 'b', 'listo · regla', true),
      ('cifras', 'resumir', 'c', 'listo', false),
      ('pregunta', 'voz', 'd', 'listo', false),
      ('pregunta', 'voz', 'e', 'listo', false),
      ('pregunta', 'voz', 'f', 'listo', true)`);
    const [status] = await t.asUser(PEOPLE.admin, (q) => q<{ s: { today: number; today_voice: number } }>("select pilo_ai_key_status() as s"));
    expect(status.s).toMatchObject({ today: 2, today_voice: 2 });
  });
});
