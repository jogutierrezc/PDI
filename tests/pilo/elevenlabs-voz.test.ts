/* =============================================================================
   La voz de ElevenLabs (0172) con un fetch y una base falsos: el pedido que sale,
   la caché, los errores sin filtrar el cuerpo del proveedor, el respaldo y
   «cantar» (permiso, topes, derechos). La clave nunca aparece en una respuesta
   ni en la bitácora.
   ========================================================================== */

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { makeEleven } from "../../supabase/functions/pilo-ia/elevenlabs-voz";
import type { ElevenCtx } from "../../supabase/functions/pilo-ia/elevenlabs-voz";

const KEY = "sk_llave_de_prueba_0123456789";
const VOICE = "JBFqnCBsd6RMkjVDRZzb";
const AUDIO = new Uint8Array([1, 2, 3, 4, 5]);

function world(options: { extras?: Record<string, unknown> | null; songsToday?: number; settings?: Record<string, unknown>; replies?: Response[] } = {}) {
  const files = new Map<string, Uint8Array>();
  const logs: { status: string; subject: string; cached: boolean }[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  const replies = [...(options.replies ?? [])];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return replies.shift() ?? new Response(AUDIO, { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "like"]) c[m] = () => c;
    c.maybeSingle = async () => result;
    c.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return c;
  };
  const admin = {
    storage: {
      from: () => ({
        download: async (path: string) => ({ data: files.has(path) ? new Blob([files.get(path)!]) : null }),
        upload: async (path: string, body: Uint8Array) => {
          files.set(path, body);
          return {};
        },
      }),
    },
    from: (table: string) =>
      table === "pilo_extras"
        ? chain({ data: options.extras === undefined ? null : options.extras, error: null })
        : chain({ count: options.songsToday ?? 0, error: null }),
  };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
  const make = (over: Partial<ElevenCtx> = {}) =>
    makeEleven({
      admin,
      settings: { voice_engine: "proveedor", eleven_model: "eleven_v3", eleven_voice_id: VOICE, eleven_format: "mp3_44100_128", ...options.settings },
      key: KEY,
      body: {},
      portal: "prueba",
      role: "admin",
      space: "planeacion",
      style: null,
      json,
      audioHeaders: { "Content-Type": "application/octet-stream" },
      sha256: async (t) => createHash("sha256").update(t).digest("hex"),
      log: (status, subject, cached = false) => logs.push({ status, subject, cached }),
      fetch,
      ...over,
    });
  return { make, files, logs, calls, fetch };
}

const bytes = async (r: Response) => new Uint8Array(await r.arrayBuffer());

describe("elevenVoice", () => {
  it("pide el audio a ElevenLabs con la clave solo en la cabecera, y lo guarda en cache/<sha256>.mp3", async () => {
    const w = world();
    const r = await w.make({ body: { tone: "emocionado" } }).voice("Hola [laughs] amigo");
    expect(r.status).toBe(200);
    expect([...(await bytes(r))]).toEqual([...AUDIO]);
    const call = w.calls[0];
    expect(call.url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`);
    expect((call.init.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);
    expect(String(call.init.body)).not.toContain(KEY);
    expect(JSON.parse(String(call.init.body))).toMatchObject({ model_id: "eleven_v3", text: "[excited] Hola amigo" });
    expect([...w.files.keys()][0]).toMatch(/^cache\/[0-9a-f]{64}\.mp3$/);
    expect(JSON.stringify(w.logs)).not.toContain(KEY);
  });

  it("lo ya dicho sale de la caché sin llamar de nuevo", async () => {
    const w = world();
    await w.make().voice("Hola");
    const again = await w.make().voice("Hola");
    expect(w.fetch).toHaveBeenCalledTimes(1);
    expect(again.status).toBe(200);
    expect(w.logs.at(-1)).toMatchObject({ status: "listo", cached: true });
  });

  it("la voz del estilo manda sobre la de siempre", async () => {
    const w = world();
    await w.make({ style: { id: "a", name: "A", eleven_id: "AAAAAAAAAAAAAAAAAAAA", tone: "calm" } }).voice("Hola");
    expect(w.calls[0].url).toContain("/AAAAAAAAAAAAAAAAAAAA?");
  });

  it("sin clave o sin voz responde un error claro (503, sin_voz) y no llama", async () => {
    const w = world();
    const noKey = await w.make({ key: "" }).voice("Hola");
    expect(noKey.status).toBe(503);
    expect(((await noKey.json()) as { code: string }).code).toBe("sin_voz");
    const w2 = world({ settings: { eleven_voice_id: "" } });
    expect((await w2.make().voice("Hola")).status).toBe(503);
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it("fuera de la prueba, con la voz del servicio apagada, no suena", async () => {
    const w = world({ settings: { voice_engine: "navegador" } });
    expect((await w.make({ portal: "pregunta" }).voice("Hola")).status).toBe(503);
  });

  it("un error del proveedor no filtra su cuerpo ni la clave; se anota sin clave", async () => {
    const body = JSON.stringify({ detail: { status: "invalid_api_key", message: `Invalid key ${KEY} for user ana@udes.edu.co` } });
    const w = world({ replies: [new Response(body, { status: 401 })] });
    const r = await w.make().voice("Hola");
    const text = await r.text();
    expect(r.status).toBe(502);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("ana@udes");
    expect(JSON.parse(text).error).toMatch(/no aceptó la clave/);
    expect(JSON.stringify(w.logs)).not.toContain(KEY);
    expect(w.logs[0].status).toBe("error 401");
  });

  it("sin créditos: 402 con su código y, fuera de la prueba, suena el respaldo", async () => {
    const quota = () => new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 });
    const w = world({ replies: [quota()] });
    const r = await w.make().voice("Hola");
    expect(r.status).toBe(402);
    expect(((await r.json()) as { code: string }).code).toBe("cupo_proveedor");

    const fallback = vi.fn(async () => new Response("fish", { status: 200 }));
    const w2 = world({ replies: [quota()] });
    const out = await w2.make({ portal: "pregunta", fallback }).voice("Hola");
    expect(fallback).toHaveBeenCalledWith("Hola");
    expect(await out.text()).toBe("fish");

    const w3 = world({ replies: [quota()] });
    await w3.make({ portal: "prueba", fallback }).voice("Hola");
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("reintenta una vez si responde 429", async () => {
    const w = world({ replies: [new Response("", { status: 429 })] });
    vi.useFakeTimers();
    const pending = w.make().voice("Hola");
    await vi.advanceTimersByTimeAsync(1300);
    const r = await pending;
    vi.useRealTimers();
    expect(r.status).toBe(200);
    expect(w.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("probe y voices", () => {
  it("lee la suscripción (solo lectura) y devuelve el uso del mes", async () => {
    const w = world({ replies: [new Response(JSON.stringify({ tier: "creator", character_count: 1200, character_limit: 100000, next_character_count_reset_unix: 1790000000, status: "active", extra: "x" }))] });
    const r = await w.make().probe();
    expect(await r.json()).toEqual({ ok: true, tier: "creator", status: "active", used: 1200, limit: 100000, reset: 1790000000 });
    expect(w.calls[0].url).toBe("https://api.elevenlabs.io/v1/user/subscription");
    expect(w.calls[0].init.method ?? "GET").toBe("GET");
  });
  it("una clave sin permiso de lectura lo dice sin romper", async () => {
    const w = world({ replies: [new Response('{"detail":{"status":"missing_permissions"}}', { status: 401 })] });
    const out = (await (await w.make().probe()).json()) as { ok: boolean; limited: boolean };
    expect(out).toMatchObject({ ok: false, limited: true });
  });
  it("lista las voces con id válido, sin el resto", async () => {
    const w = world({
      replies: [
        new Response(
          JSON.stringify({
            voices: [
              { voice_id: VOICE, name: "George", category: "premade", labels: { gender: "male", accent: "british" }, preview_url: "https://x.example/a.mp3", secret: "no" },
              { voice_id: "../x", name: "Malo" },
            ],
          }),
        ),
      ],
    });
    const out = (await (await w.make({ body: { search: "geo<rge" } }).voices()).json()) as { voices: unknown[] };
    expect(out.voices).toEqual([{ id: VOICE, name: "George", category: "premade", detail: "male · british", preview: "https://x.example/a.mp3" }]);
    expect(w.calls[0].url).toBe("https://api.elevenlabs.io/v2/voices?page_size=100&search=george");
  });
});

describe("cantar", () => {
  const sing = { letra: "Bienvenidos a la UDES\nun lugar para crecer", tema: "", estilo: "saludo", idioma: "es", modo: "voz" };
  const on = { sing_aud: "admin", sing_daily: 3, sing_max_chars: 600, sing_max_seconds: 60 };

  it("la administración puede probar aunque el permiso esté apagado; canta con [sings] y la voz de Pilo", async () => {
    const w = world({ extras: null });
    const r = await w.make({ body: sing }).sing();
    expect(r.status).toBe(200);
    const sent = JSON.parse(String(w.calls[0].init.body));
    expect(sent.text).toBe("[sings] Bienvenidos a la UDES … un lugar para crecer");
    expect(sent.model_id).toBe("eleven_v3");
    expect(w.calls[0].url).toContain(`/v1/text-to-speech/${VOICE}`);
    expect(w.logs.at(-1)).toMatchObject({ status: "listo" });
    expect(w.logs.at(-1)?.subject).toMatch(/^cantar: /);
  });

  it("fuera de la pantalla de la administración, apagado por defecto", async () => {
    const w = world({ extras: null });
    const r = await w.make({ body: sing, portal: "pregunta", role: null }).sing();
    expect(r.status).toBe(403);
    expect(((await r.json()) as { code: string }).code).toBe("sin_permiso");
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it("con permiso «sesion» canta quien tiene sesión, no un visitante", async () => {
    const w = world({ extras: { ...on, sing_aud: "sesion" } });
    expect((await w.make({ body: sing, portal: "pregunta", role: null }).sing()).status).toBe(403);
    expect((await w.make({ body: sing, portal: "pregunta", role: "editor" }).sing()).status).toBe(200);
  });

  it("rechaza canciones ajenas antes de llamar", async () => {
    const w = world({ extras: on });
    const r = await w.make({ body: { ...sing, letra: "", tema: "Canta la canción Hips Don't Lie de Shakira", modo: "musica" } }).sing();
    expect(r.status).toBe(400);
    expect(((await r.json()) as { code: string }).code).toBe("derechos");
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it("respeta el máximo de caracteres y el cupo diario", async () => {
    const w = world({ extras: { ...on, sing_max_chars: 100 } });
    expect((await w.make({ body: { ...sing, letra: "a".repeat(101) } }).sing()).status).toBe(413);
    const full = world({ extras: on, songsToday: 3 });
    const r = await full.make({ body: sing }).sing();
    expect(r.status).toBe(429);
    expect(((await r.json()) as { code: string }).code).toBe("limite");
    expect(full.fetch).not.toHaveBeenCalled();
  });

  it("lo ya cantado sale de la caché y no gasta cupo", async () => {
    const w = world({ extras: on });
    await w.make({ body: sing }).sing();
    const full = world({ extras: on, songsToday: 99 });
    full.files.set([...w.files.keys()][0], AUDIO);
    expect((await full.make({ body: sing }).sing()).status).toBe(200);
    expect(full.fetch).not.toHaveBeenCalled();
  });

  it("modo música: POST /v1/music con el prompt original y la duración topada", async () => {
    const w = world({ extras: { ...on, sing_max_seconds: 20 } });
    const r = await w.make({ body: { ...sing, modo: "musica" } }).sing();
    expect(r.status).toBe(200);
    expect(w.calls[0].url).toBe("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128");
    const sent = JSON.parse(String(w.calls[0].init.body));
    expect(sent.model_id).toBe("music_v2_5");
    expect(sent.music_length_ms).toBeLessThanOrEqual(20000);
    expect(sent.prompt).toMatch(/Bienvenidos a la UDES/);
    expect(sent.force_instrumental).toBe(false);
    expect((w.calls[0].init.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);
  });

  it("si ElevenLabs rechaza el prompt por derechos, lo dice sin pasar su cuerpo", async () => {
    const w = world({ extras: on, replies: [new Response('{"detail":{"status":"bad_prompt","data":{"prompt_suggestion":"algo con Shakira"}}}', { status: 400 })] });
    const r = await w.make({ body: { ...sing, modo: "musica" } }).sing();
    const text = await r.text();
    expect(r.status).toBe(400);
    expect(JSON.parse(text).code).toBe("derechos");
    expect(text).not.toContain("Shakira");
  });

  it("modo voz con un modelo sin etiquetas usa eleven_v3", async () => {
    const w = world({ extras: on, settings: { eleven_model: "eleven_flash_v2_5" } });
    await w.make({ body: sing }).sing();
    expect(JSON.parse(String(w.calls[0].init.body)).model_id).toBe("eleven_v3");
  });

  it("las etiquetas de la letra no pasan", async () => {
    const w = world({ extras: on });
    await w.make({ body: { ...sing, letra: "[whispers] hola {x} <break/> UDES" } }).sing();
    expect(JSON.parse(String(w.calls[0].init.body)).text).toBe("[sings] hola UDES");
  });
});
