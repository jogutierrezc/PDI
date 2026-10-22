/* =============================================================================
   Mr. Pilo · diseñar la voz de un modo con ElevenLabs («voice design»).

   Dos acciones, solo para la administración (index.ts las deja pasar solo con
   rol admin y portal «prueba», igual que «estado» y «voces»):
     disenar  descripción + texto de muestra → hasta 3 candidatos de audio
              con su id temporal (generated_voice_id).
     guardar  un candidato elegido → se guarda en la cuenta como una voz con el
              nombre dado («Awoo»); devuelve el id de la voz.

   La voz es ORIGINAL: nace de una descripción en palabras. Se rechaza una
   descripción que pida copiar o imitar a alguien con las fórmulas más claras;
   lo demás lo advierte la pantalla.

   Reglas:
   - La clave sale solo de la tabla de claves, llega en `ctx.key`, va en la
     cabecera xi-api-key y se borra de todo lo que se anote.
   - Del cuerpo de error del proveedor al navegador no pasa nada.
   - Tope de pedidos por día (se cuentan en la bitácora) y de tamaño.

   Documentación de ElevenLabs consultada el 2026-10-22 (elevenlabs.io/docs/api-reference/text-to-voice):
   - POST /v1/text-to-voice/design?output_format=…  cuerpo: voice_description
     (obligatoria), model_id (eleven_multilingual_ttv_v2 | eleven_ttv_v3), text
     (100 a 1000 caracteres) o auto_generate_text, loudness, guidance_scale,
     seed. Respuesta: { previews: [{ audio_base_64, generated_voice_id,
     media_type, duration_secs, language }], text }.
   - POST /v1/text-to-voice  cuerpo: voice_name, voice_description (ambos
     obligatorios), generated_voice_id, labels. Crea la voz en la cuenta.
   - NO confirmó la documentación: el largo mínimo y máximo de la descripción
     (aquí 20 a 1000 por precaución), cuántas voces permite cada plan ni los
     códigos de error exactos (se leen por estado HTTP y por texto).
   ========================================================================== */

import { ELEVEN_API, elevenFault, elevenVoiceId, scrubSecret } from "./elevenlabs.ts";

// deno-lint-ignore no-explicit-any
type Loose = any;

export interface DesignCtx {
  admin: Loose;
  key: string;
  body: Record<string, unknown>;
  space: string;
  json: (body: unknown, status?: number) => Response;
  log: (status: string, subject: string, cached?: boolean) => unknown;
  fetch?: typeof fetch;
}

export const DESIGN_DAILY_LIMIT = 12;
export const DESIGN_DESC_MIN = 20;
export const DESIGN_DESC_MAX = 1000;
export const DESIGN_TEXT_MIN = 100;
export const DESIGN_TEXT_MAX = 1000;
export const DESIGN_MAX_PREVIEWS = 3;
/** Un candidato de más de ~900 KB (1 200 000 caracteres en base64) se descarta: una muestra de 1 000 caracteres pesa mucho menos. */
export const DESIGN_MAX_AUDIO_B64 = 1_200_000;
export const DESIGN_MODEL = "eleven_ttv_v3";

const clean = (t: unknown, max: number) =>
  String(t ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);

/** Una descripción que pide copiar a alguien («clona…», «imita a…», «suena como…») no se acepta. */
export const IMITATION = /\b(clona\w*|clon\w*|imita\w*|copia\w*|suplanta\w*|igual (?:que|a)|id[eé]ntic\w+ a|parecid\w+ a|suena como|sonar como|sound like|clone|impersonat\w+)\b/i;

export function parseDesign(body: Record<string, unknown>): { ok: true; description: string; text: string } | { ok: false; error: string; code: string } {
  const description = clean(body.description, DESIGN_DESC_MAX + 1);
  const text = clean(body.text, DESIGN_TEXT_MAX + 1);
  if (description.length < DESIGN_DESC_MIN || description.length > DESIGN_DESC_MAX) {
    return { ok: false, error: `La descripción de la voz va de ${DESIGN_DESC_MIN} a ${DESIGN_DESC_MAX} caracteres.`, code: "tamano" };
  }
  if (text.length < DESIGN_TEXT_MIN || text.length > DESIGN_TEXT_MAX) {
    return { ok: false, error: `El texto de muestra va de ${DESIGN_TEXT_MIN} a ${DESIGN_TEXT_MAX} caracteres (ElevenLabs lo exige).`, code: "tamano" };
  }
  if (IMITATION.test(description)) {
    return { ok: false, error: "La voz de un modo es original: describa cómo suena (edad, acento, ritmo, energía), no a quién se parece ni a quién imita.", code: "original" };
  }
  return { ok: true, description, text };
}

export function makeVoiceDesign(ctx: DesignCtx) {
  const doFetch = ctx.fetch ?? fetch;
  const headers = () => ({ "xi-api-key": ctx.key, "Content-Type": "application/json", Accept: "application/json" });
  const read = async (r: Response) => {
    try {
      return (await r.text()).slice(0, 600);
    } catch {
      return "";
    }
  };

  /** Pedidos de diseño hechos hoy (solo los que salieron bien y gastaron créditos). */
  async function usedToday(): Promise<number> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const base = () =>
      ctx.admin.from("pilo_ai_log").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString()).eq("cached", false).eq("action", "voz").eq("status", "listo").like("subject", "diseno:%");
    const scoped = await base().eq("space", ctx.space);
    if (!scoped.error) return scoped.count ?? 0;
    return (await base()).count ?? 0;
  }

  /** Mensaje legible según lo que respondió el proveedor (nunca su cuerpo). */
  function why(status: number, detail: string): Response {
    if (status === 401 && /missing_permissions|text_to_voice|voices_write/i.test(detail)) {
      return ctx.json({ error: "La clave de ElevenLabs no tiene permiso para diseñar voces (Text to Voice / Voices: escritura). Cree una clave con ese permiso.", code: "proveedor" }, 502);
    }
    if (status === 401) return ctx.json({ error: "ElevenLabs no aceptó la clave. Revise que esté bien pegada.", code: "proveedor" }, 502);
    if (status === 402 || status === 403 || /voice_limit_reached|only_for_creator|upgrade|subscription/i.test(detail)) {
      const limit = /voice_limit_reached|voice limit/i.test(detail);
      return ctx.json(
        { error: limit ? "La cuenta de ElevenLabs llegó al máximo de voces de su plan: borre alguna voz o suba de plan." : "El plan de ElevenLabs no permite diseñar voces (o se acabaron los créditos). Revise el plan en elevenlabs.io.", code: "plan" },
        402,
      );
    }
    if (status === 409) return ctx.json({ error: "ElevenLabs está terminando otro pedido igual. Espere unos segundos y reintente.", code: "proveedor" }, 409);
    const f = elevenFault(status, detail);
    return ctx.json({ error: f.message, code: f.code }, f.status === 429 ? 429 : 502);
  }

  /** disenar: descripción + texto → candidatos con audio (base64) e id temporal. */
  async function design(): Promise<Response> {
    if (!ctx.key) return ctx.json({ error: "Falta la clave de ElevenLabs. Péguela en Voz › Voz de ElevenLabs.", code: "sin_voz" }, 503);
    const parsed = parseDesign(ctx.body);
    if (!parsed.ok) return ctx.json({ error: parsed.error, code: parsed.code }, parsed.code === "tamano" ? 413 : 400);
    if ((await usedToday()) >= DESIGN_DAILY_LIMIT) {
      await ctx.log("limite", "diseno: tope diario");
      return ctx.json({ error: `Hoy ya se pidieron ${DESIGN_DAILY_LIMIT} diseños de voz. Mañana vuelve, o escoja uno de los candidatos que ya tiene.`, code: "limite" }, 429);
    }
    const subject = `diseno: ${parsed.description.slice(0, 60)}`;
    let response: Response;
    try {
      response = await doFetch(`${ELEVEN_API}/v1/text-to-voice/design?output_format=mp3_44100_64`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ voice_description: parsed.description, text: parsed.text, model_id: DESIGN_MODEL, auto_generate_text: false }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      await ctx.log("error red", subject);
      return ctx.json({ error: "No se pudo conectar con ElevenLabs.", code: "proveedor" }, 502);
    }
    if (!response.ok) {
      const detail = scrubSecret(await read(response), ctx.key);
      await ctx.log(`error ${response.status}`, `${detail} · ${subject}`);
      return why(response.status, detail);
    }
    const data = (await response.json().catch(() => ({}))) as { previews?: Array<Record<string, unknown>> };
    const candidates = (Array.isArray(data.previews) ? data.previews : []).slice(0, DESIGN_MAX_PREVIEWS).flatMap((p) => {
      const id = String(p.generated_voice_id ?? "");
      const audio = typeof p.audio_base_64 === "string" ? p.audio_base_64 : "";
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(id) || !audio || audio.length > DESIGN_MAX_AUDIO_B64) return [];
      return [{ id, audio, mime: "audio/mpeg", seconds: Math.round(Number(p.duration_secs ?? 0) * 10) / 10 }];
    });
    if (candidates.length === 0) {
      await ctx.log("error sin audio", subject);
      return ctx.json({ error: "ElevenLabs no devolvió candidatos. Pruebe con otra descripción.", code: "proveedor" }, 502);
    }
    await ctx.log("listo", subject);
    return ctx.json({ candidates });
  }

  /** guardar: el candidato elegido pasa a ser una voz de la cuenta con el nombre dado. */
  async function save(): Promise<Response> {
    if (!ctx.key) return ctx.json({ error: "Falta la clave de ElevenLabs.", code: "sin_voz" }, 503);
    const id = String(ctx.body.generated_voice_id ?? "");
    const name = clean(ctx.body.name, 40).replace(/[^\p{L}\p{N} ._-]/gu, "") || "Awoo";
    const description = clean(ctx.body.description, DESIGN_DESC_MAX);
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return ctx.json({ error: "El candidato no es válido: cree los candidatos de nuevo.", code: "formato" }, 400);
    if (description.length < DESIGN_DESC_MIN) return ctx.json({ error: "Falta la descripción de la voz.", code: "tamano" }, 400);
    if (IMITATION.test(description)) return ctx.json({ error: "La voz de un modo es original: no describa a quién imita.", code: "original" }, 400);
    const subject = `diseno-guardar: ${name}`;
    let response: Response;
    try {
      response = await doFetch(`${ELEVEN_API}/v1/text-to-voice`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ voice_name: name, voice_description: description, generated_voice_id: id, labels: { language: "es", gender: "male", use_case: "modo de Pilo" } }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      await ctx.log("error red", subject);
      return ctx.json({ error: "No se pudo conectar con ElevenLabs.", code: "proveedor" }, 502);
    }
    if (!response.ok) {
      const detail = scrubSecret(await read(response), ctx.key);
      await ctx.log(`error ${response.status}`, `${detail} · ${subject}`);
      return why(response.status, detail);
    }
    const data = (await response.json().catch(() => ({}))) as { voice_id?: unknown };
    const voiceId = elevenVoiceId(data.voice_id);
    if (!voiceId) {
      await ctx.log("error sin voz", subject);
      return ctx.json({ error: "ElevenLabs no devolvió el id de la voz guardada. Revise la lista de voces de la cuenta.", code: "proveedor" }, 502);
    }
    await ctx.log("listo", subject);
    return ctx.json({ voice_id: voiceId, name });
  }

  return { design, save };
}
