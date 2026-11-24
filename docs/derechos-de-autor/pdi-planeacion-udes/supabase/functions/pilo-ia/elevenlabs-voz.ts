/* =============================================================================
   Mr. Pilo · la voz de ElevenLabs (0172): lo que habla con la red.

   Lo arma index.ts con lo que ya tiene a mano (la base, la clave del
   proveedor, la bitácora) y se prueba en tests/pilo/elevenlabs-voz.test.ts con
   un fetch falso. Reglas:
   - La clave sale solo de la tabla de claves (pilo_ai_secret.elevenlabs_key),
     llega aquí en `ctx.key` y solo se pone en la cabecera xi-api-key. No se
     registra, no vuelve al navegador y se borra de todo detalle que se anote.
   - Del cuerpo de error del proveedor al navegador no pasa nada: se anota (sin
     clave) en la bitácora y a la persona se le dice una frase propia.
   - Sin clave, sin créditos o con error, suena el respaldo que la
     administración eligió (Fish Audio o NVIDIA), nunca la voz del navegador.
   Documentación consultada el 2026-10-19: ver elevenlabs.ts.
   ========================================================================== */

import {
  ELEVEN_API,
  buildTtsRequest,
  elevenBase,
  elevenCacheSeed,
  elevenFault,
  elevenFormat,
  elevenHeaders,
  elevenModel,
  elevenVoiceId,
  ELEVEN_MODELS,
  musicBody,
  musicUrl,
  parseSing,
  scrubSecret,
  singAllowed,
  singCharLimit,
  singSeconds,
  singSettings,
  singVoiceText,
  songRefusal,
  voiceSettings,
} from "./elevenlabs.ts";
import type { ElevenFault } from "./elevenlabs.ts";

/* Tipos mínimos de lo que se recibe (el servidor real pasa su cliente de Supabase). */
// deno-lint-ignore no-explicit-any
type Loose = any;

export interface ElevenCtx {
  admin: Loose;
  settings: Record<string, unknown>;
  /** La clave de ElevenLabs de la tabla de claves; vacía si no hay. */
  key: string;
  body: Record<string, unknown>;
  portal: string;
  role: string | null;
  space: string;
  /** El estilo de voz que suena (por portal, modo o pedido); null si no hay estilos. */
  style: { id: string; name: string; tone?: string; eleven_id?: string } | null;
  json: (body: unknown, status?: number) => Response;
  audioHeaders: Record<string, string>;
  sha256: (text: string) => Promise<string>;
  log: (status: string, subject: string, cached?: boolean) => unknown;
  /** La voz de respaldo (Fish Audio o NVIDIA) o null si no hay. Se usa solo fuera de la prueba. */
  fallback?: (text: string) => Promise<Response | null>;
  fetch?: typeof fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeEleven(ctx: ElevenCtx) {
  const doFetch = ctx.fetch ?? fetch;
  const testing = ctx.portal === "prueba";
  const bucket = () => ctx.admin.storage.from("pilo-voz");
  const text = async (r: Response) => {
    try {
      return (await r.text()).slice(0, 600);
    } catch {
      return "";
    }
  };

  /** POST con un reintento si el proveedor responde 429. */
  async function post(url: string, body: unknown, timeoutMs: number): Promise<Response> {
    const init = () => ({ method: "POST", headers: elevenHeaders(ctx.key), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const first = await doFetch(url, init());
    if (first.status !== 429) return first;
    await first.body?.cancel();
    await sleep(1200);
    return doFetch(url, init());
  }

  const fail = (f: ElevenFault) => ctx.json({ error: f.message, code: f.code }, f.status === 402 ? 402 : f.status === 429 ? 429 : 502);

  /** Si hay respaldo y no es una prueba, suena el respaldo; si no, el error. */
  async function orFallback(spoken: string, error: Response): Promise<Response> {
    if (testing || !ctx.fallback) return error;
    return (await ctx.fallback(spoken).catch(() => null)) ?? error;
  }

  /** elevenVoice(texto, estilo, emoción): la voz de Pilo, con caché por hash. */
  async function voice(raw: string): Promise<Response> {
    const s = ctx.settings;
    const ready = testing || s.voice_engine === "proveedor";
    const voiceId = elevenVoiceId(ctx.style?.eleven_id) || elevenVoiceId(s.eleven_voice_id);
    if (!ready || !ctx.key || !voiceId) {
      const why = !ctx.key ? "falta la clave de ElevenLabs" : "falta la voz (el id de la voz o la del estilo)";
      return orFallback(raw, ctx.json({ error: `La voz de ElevenLabs no está configurada: ${why}.`, code: "sin_voz" }, 503));
    }
    const model = elevenModel(s.eleven_model);
    const format = elevenFormat(s.eleven_format);
    const req = buildTtsRequest({ voiceId, model, format, text: raw, tone: ctx.body.tone, styleTone: ctx.style?.tone, base: elevenBase(s) });
    if (!req.spoken) return ctx.json({ error: "No hay texto para leer.", code: "formato" }, 400);

    const cachePath = `cache/${await ctx.sha256(elevenCacheSeed(req, voiceId))}.mp3`;
    const hit = await bucket().download(cachePath);
    if (hit.data && hit.data.size > 0) {
      await ctx.log("listo", raw, true);
      return new Response(hit.data, { headers: ctx.audioHeaders });
    }

    let response: Response;
    try {
      response = await post(req.url, req.body, 25_000);
    } catch {
      await ctx.log("error red", raw);
      return orFallback(raw, ctx.json({ error: "No se pudo conectar con ElevenLabs.", code: "proveedor" }, 502));
    }
    if (!response.ok) {
      const detail = scrubSecret(await text(response), ctx.key);
      await ctx.log(`error ${response.status}`, `${detail} · ${raw}`);
      return orFallback(raw, fail(elevenFault(response.status, detail)));
    }
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.length === 0) {
      await ctx.log("error sin audio", raw);
      return orFallback(raw, ctx.json({ error: "ElevenLabs no devolvió el audio.", code: "proveedor" }, 502));
    }
    await bucket().upload(cachePath, audio, { contentType: "audio/mpeg", upsert: true }).catch(() => null);
    await ctx.log("listo", raw);
    return new Response(audio, { headers: ctx.audioHeaders });
  }

  const get = (path: string) => doFetch(`${ELEVEN_API}${path}`, { headers: { "xi-api-key": ctx.key, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });

  /** «Probar la conexión» y el uso del mes (GET /v1/user/subscription, solo lectura). */
  async function probe(): Promise<Response> {
    if (!ctx.key) return ctx.json({ ok: false, error: "Falta la clave de ElevenLabs." });
    try {
      const response = await get("/v1/user/subscription");
      if (!response.ok) {
        const detail = scrubSecret(await text(response), ctx.key);
        await ctx.log(`error probar ${response.status}`, detail);
        // 401 con «missing_permissions»: la clave sirve para hablar pero no para leer la suscripción.
        const limited = /missing_permissions|user_read/i.test(detail);
        return ctx.json({ ok: false, error: limited ? "La clave es válida pero no tiene permiso para leer la suscripción: el uso del mes no se verá." : elevenFault(response.status, detail).message, limited });
      }
      const d = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return ctx.json({
        ok: true,
        tier: String(d.tier ?? ""),
        status: String(d.status ?? ""),
        used: Number(d.character_count ?? 0),
        limit: Number(d.character_limit ?? 0),
        reset: typeof d.next_character_count_reset_unix === "number" ? d.next_character_count_reset_unix : null,
      });
    } catch {
      return ctx.json({ ok: false, error: "No se pudo conectar con ElevenLabs." });
    }
  }

  /** Las voces de la cuenta, para elegir (GET /v2/voices, hasta 100). */
  async function voices(): Promise<Response> {
    if (!ctx.key) return ctx.json({ error: "Falta la clave de ElevenLabs.", code: "sin_voz" }, 400);
    try {
      const search = typeof ctx.body.search === "string" ? ctx.body.search.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 40) : "";
      const response = await get(`/v2/voices?page_size=100${search ? `&search=${encodeURIComponent(search)}` : ""}`);
      if (!response.ok) {
        const detail = scrubSecret(await text(response), ctx.key);
        await ctx.log(`error voces ${response.status}`, detail);
        const limited = /missing_permissions|voices_read/i.test(detail);
        return ctx.json({ error: limited ? "La clave no tiene permiso para listar voces: pegue el id de la voz a mano." : elevenFault(response.status, detail).message, code: "proveedor" }, 502);
      }
      const d = (await response.json().catch(() => ({}))) as { voices?: Array<Record<string, unknown>> };
      const list = (Array.isArray(d.voices) ? d.voices : []).slice(0, 100).flatMap((v) => {
        const id = elevenVoiceId(v.voice_id);
        if (!id) return [];
        const labels = v.labels && typeof v.labels === "object" ? (v.labels as Record<string, unknown>) : {};
        return [
          {
            id,
            name: String(v.name ?? "").slice(0, 60),
            category: String(v.category ?? ""),
            detail: [labels.gender, labels.accent, labels.use_case].filter((x) => typeof x === "string").join(" · ").slice(0, 80),
            preview: typeof v.preview_url === "string" && v.preview_url.startsWith("https://") ? v.preview_url : "",
          },
        ];
      });
      return ctx.json({ voices: list });
    } catch {
      return ctx.json({ error: "No se pudo conectar con ElevenLabs.", code: "proveedor" }, 502);
    }
  }

  /** Las canciones hechas hoy (solo las que salieron bien y gastaron créditos). */
  async function songsToday(): Promise<number> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const base = () =>
      ctx.admin.from("pilo_ai_log").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString()).eq("cached", false).eq("action", "voz").eq("status", "listo").like("subject", "cantar:%");
    const scoped = await base().eq("space", ctx.space);
    if (!scoped.error) return scoped.count ?? 0;
    return (await base()).count ?? 0;
  }

  /**
   * «Cantar» (acción del servidor): una pieza cantada original.
   *  modo «voz»    con la voz de Pilo: eleven_v3/v4 con la etiqueta [sings]
   *                (experimental en la documentación de ElevenLabs).
   *  modo «musica» con Eleven Music (/v1/music): canta con la voz de su propio
   *                cantante; no se puede elegir la voz de Pilo.
   * Apagada por defecto (pilo_extras.sing_aud). La pide la administración
   * desde Voz y, desde el chat de la app, quien tenga permiso en su espacio
   * (CHAT_SING_ENABLED en elevenlabs.ts).
   */
  async function sing(): Promise<Response> {
    const { data: row, error } = await ctx.admin.from("pilo_extras").select("*").eq("space", ctx.space).maybeSingle();
    const cfg = singSettings(error ? null : row);
    if (!singAllowed(cfg.aud, ctx.role, ctx.portal)) {
      return ctx.json({ error: "Cantar está apagado para este Pilo. La administración lo enciende en Voz › Hacer cantar a Pilo.", code: "sin_permiso" }, 403);
    }
    const parsed = parseSing(ctx.body, singCharLimit(cfg));
    if (!parsed.ok) return ctx.json({ error: parsed.error, code: parsed.code }, parsed.code === "tamano" ? 413 : 400);
    const req = parsed.req;
    const refusal = songRefusal(req.letra, req.tema);
    if (!refusal.ok) return ctx.json({ error: refusal.reason, code: "derechos" }, 400);
    if (!ctx.key) return ctx.json({ error: "Falta la clave de ElevenLabs.", code: "sin_voz" }, 503);

    const s = ctx.settings;
    const format = elevenFormat(s.eleven_format);
    const voiceId = elevenVoiceId(ctx.style?.eleven_id) || elevenVoiceId(s.eleven_voice_id);
    if (req.modo === "voz" && !voiceId) return ctx.json({ error: "Falta la voz de Pilo en ElevenLabs (el id de la voz).", code: "sin_voz" }, 503);

    const seconds = singSeconds(req.letra || req.tema.repeat(8), cfg.maxSeconds);
    // Con la voz de Pilo hace falta un modelo con etiquetas: si el configurado no las tiene, eleven_v3.
    const model = ELEVEN_MODELS[elevenModel(s.eleven_model)].tags ? elevenModel(s.eleven_model) : "eleven_v3";
    const spoken = req.modo === "voz" ? singVoiceText(req.letra).slice(0, ELEVEN_MODELS[model].limit) : "";
    const settings = req.modo === "voz" ? voiceSettings(model, ["canto"], elevenBase(s)) : {};
    const seed =
      req.modo === "voz"
        ? ["cantar", "voz", model, voiceId, format, JSON.stringify(settings), spoken].join("|")
        : ["cantar", "musica", format, seconds, req.estilo, req.idioma, req.tema, req.letra].join("|");
    const cachePath = `cache/${await ctx.sha256(seed)}.mp3`;
    const subject = `cantar: ${(req.tema || req.letra).replace(/\s+/g, " ").slice(0, 80)}`;

    const hit = await bucket().download(cachePath);
    if (hit.data && hit.data.size > 0) {
      await ctx.log("listo", subject, true);
      return new Response(hit.data, { headers: ctx.audioHeaders });
    }
    if (cfg.daily <= 0 || (await songsToday()) >= cfg.daily) {
      await ctx.log("limite", subject);
      return ctx.json({ error: "Se acabó el cupo de canciones de hoy. Mañana vuelve, o la administración lo sube.", code: "limite" }, 429);
    }

    let response: Response;
    try {
      response =
        req.modo === "voz"
          ? await post(`${ELEVEN_API}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${format}`, { text: spoken, model_id: model, voice_settings: settings }, 60_000)
          : await post(musicUrl(format), musicBody(req, seconds), 120_000);
    } catch {
      await ctx.log("error red", subject);
      return ctx.json({ error: "No se pudo conectar con ElevenLabs.", code: "proveedor" }, 502);
    }
    if (!response.ok) {
      const detail = scrubSecret(await text(response), ctx.key);
      await ctx.log(`error ${response.status}`, `${detail} · ${subject}`);
      if (req.modo === "musica" && /bad_prompt|bad_composition_plan|copyright|artist|musician|band/i.test(detail)) {
        return ctx.json({ error: "ElevenLabs no aceptó el pedido: nombra a un artista o se parece a una letra con derechos. Escriba una letra y un tema originales.", code: "derechos" }, 400);
      }
      if (req.modo === "musica" && (response.status === 402 || response.status === 403)) {
        return ctx.json({ error: "La API de música de ElevenLabs es solo para planes de pago.", code: "proveedor" }, 502);
      }
      return fail(elevenFault(response.status, detail));
    }
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.length === 0) {
      await ctx.log("error sin audio", subject);
      return ctx.json({ error: "ElevenLabs no devolvió el audio.", code: "proveedor" }, 502);
    }
    await bucket().upload(cachePath, audio, { contentType: "audio/mpeg", upsert: true }).catch(() => null);
    await ctx.log("listo", subject);
    return new Response(audio, { headers: ctx.audioHeaders });
  }

  return { voice, probe, voices, sing };
}
