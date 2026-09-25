/* =============================================================================
   Edge Function · pilo-ia
   Mr. Pilo con IA: resumir, sintetizar, explicar y leer en voz alta.

   Existe para que las claves de los proveedores (Mistral o Free.ai para el
   texto; Free.ai u otro para la voz) nunca lleguen al navegador. Cada pedido pasa por aquí: se revisa quién pregunta, si Mr. Pilo
   está activo en ese portal y para esa audiencia, y cuánto se ha usado hoy;
   luego se llama al proveedor con el formato de OpenAI (/chat/completions
   para el texto, /audio/speech para la voz), se revisa que cada número del
   resumen esté en los datos y se anota en la bitácora.

   Pedido (POST, JSON):
     { action: "resumir" | "sintetizar" | "explicar", portal, page, sections: [{title, kind, text}] }
     { action: "voz", portal, text }            → audio (application/octet-stream)
     { action: "probar" }                        → { ok, ms } (solo administración)

   Despliegue (un solo archivo: también se puede pegar en el editor de Supabase,
   con «Verify JWT» apagado):
     supabase functions deploy pilo-ia
   (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta
   la plataforma. La clave del proveedor se guarda desde la intranet.)
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

// --- lógica: copia exacta de src/components/pilo/ai/logic.ts (la prueba logic-sync lo vigila)
// Va dentro para que la función sea un solo archivo y se pueda desplegar
// también pegándola en el editor del panel de Supabase.
export type Action = "resumir" | "sintetizar" | "explicar" | "voz" | "probar";
export type Fn = "leer" | "resumir" | "sintetizar" | "explicar";
export type Audience = "admin" | "sesion" | "publico";
export type Portal = "cifras" | "pdi" | "observatorio" | "impacto";
export type Role = "consulta" | "responsable" | "planeacion" | "admin";

export interface PortalRule {
  on: boolean;
  aud: Audience;
  fns: Fn[];
}

export interface Rules {
  enabled: boolean;
  functions: Partial<Record<Fn, boolean>>;
  portals: Partial<Record<Portal, PortalRule>>;
}

export interface Section {
  title: string;
  kind: "tabla" | "grafica" | "texto";
  text: string;
}

export const PORTALS: Portal[] = ["cifras", "pdi", "observatorio", "impacto"];
export const FN_OF: Record<Exclude<Action, "probar">, Fn> = { resumir: "resumir", sintetizar: "sintetizar", explicar: "explicar", voz: "leer" };

/** ¿Puede esta persona (null = sin sesión) usar la acción en el portal? */
export function canUse(rules: Rules, portal: string, action: Action, role: Role | null): { ok: true } | { ok: false; reason: string } {
  if (action === "probar") return role === "admin" ? { ok: true } : { ok: false, reason: "Solo la administración prueba la conexión." };
  // La muestra de voz de la configuración: solo la administración, en cualquier estado.
  if (portal === "prueba") return role === "admin" ? { ok: true } : { ok: false, reason: "Solo la administración prueba la voz." };
  if (!rules.enabled) return { ok: false, reason: "Mr. Pilo con IA está apagado." };
  const fn = FN_OF[action];
  if (!fn) return { ok: false, reason: "Acción desconocida." };
  if (rules.functions[fn] === false) return { ok: false, reason: "Esa función de Mr. Pilo está apagada." };
  const rule = (PORTALS as string[]).includes(portal) ? rules.portals[portal as Portal] : undefined;
  if (!rule?.on) return { ok: false, reason: "Mr. Pilo con IA no está activo en este portal." };
  if (!rule.fns.includes(fn)) return { ok: false, reason: "Esa función no está activa en este portal." };
  if (rule.aud === "admin" && role !== "admin") return { ok: false, reason: "Por ahora Mr. Pilo con IA es solo para la administración." };
  if (rule.aud === "sesion" && !role) return { ok: false, reason: "Inicie sesión para usar a Mr. Pilo con IA." };
  return { ok: true };
}

/** Recorta las secciones a un máximo de filas en total y de caracteres por sección. */
export function clipSections(sections: Section[], maxRows: number, maxChars = 6000): Section[] {
  let rows = 0;
  const out: Section[] = [];
  for (const s of sections.slice(0, 20)) {
    const lines = s.text.split("\n").map((l) => l.trim()).filter(Boolean);
    const room = Math.max(0, maxRows - rows);
    if (!room) break;
    const kept = lines.slice(0, room);
    rows += kept.length;
    out.push({ title: s.title.slice(0, 160), kind: s.kind, text: kept.join("\n").slice(0, maxChars) });
  }
  return out;
}

const PERSONA = [
  "Eres Mr. Pilo, el guía de la Oficina de Planeación Institucional de la Universidad de Santander (UDES).",
  "Hablas en español de Colombia, en masculino, con frases cortas, claras y cercanas, sin tecnicismos.",
  "Solo usas las cifras y los datos que vienen en el contenido. No inventes números, causas ni comparaciones que no estén.",
  "Si algo no se puede afirmar con esos datos, dilo. Un dato vacío no es un cero.",
  "No menciones ni infieras datos de personas.",
  "Responde solo con el JSON que se pide, sin texto antes ni después.",
].join(" ");

const TASK: Record<"resumir" | "sintetizar" | "explicar", string> = {
  resumir:
    'Resume lo esencial en 3 a 5 puntos: lo más alto, lo más bajo y cómo cambió. Cada punto dice de qué sección sale. Formato: {"puntos":[{"texto":"...","fuente":"título de la sección"}]}',
  sintetizar:
    'Cruza las secciones y saca lo que dicen juntas: una idea principal, 2 a 4 hallazgos y 1 o 2 preguntas útiles para decidir. Formato: {"principal":"...","hallazgos":["..."],"preguntas":["..."]}',
  explicar:
    'Explica en 2 a 4 frases cómo se lee la sección y qué muestra, para alguien que la ve por primera vez. Formato: {"explicacion":"..."}',
};

export function buildMessages(action: "resumir" | "sintetizar" | "explicar", page: string, sections: Section[]) {
  const body = sections.map((s, i) => `### ${i + 1}. ${s.title} (${s.kind})\n${s.text}`).join("\n\n");
  return [
    { role: "system", content: PERSONA },
    { role: "user", content: `${TASK[action]}\n\nPágina: ${page}\n\nContenido:\n${body}` },
  ];
}

export interface Answer {
  puntos?: { texto: string; fuente?: string }[];
  principal?: string;
  hallazgos?: string[];
  preguntas?: string[];
  explicacion?: string;
}

/** Lee la respuesta del modelo: JSON (aunque venga envuelto en ```), o texto suelto. */
export function parseAnswer(action: "resumir" | "sintetizar" | "explicar", raw: string): Answer {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const data = JSON.parse(text.slice(start, end + 1)) as Answer;
      if (action === "resumir" && Array.isArray(data.puntos)) {
        return { puntos: data.puntos.filter((p) => p && typeof p.texto === "string").slice(0, 6) };
      }
      if (action === "sintetizar" && typeof data.principal === "string") {
        return {
          principal: data.principal,
          hallazgos: (data.hallazgos ?? []).filter((h) => typeof h === "string").slice(0, 5),
          preguntas: (data.preguntas ?? []).filter((q) => typeof q === "string").slice(0, 3),
        };
      }
      if (action === "explicar" && typeof data.explicacion === "string") return { explicacion: data.explicacion };
    } catch {
      /* no era JSON: se usa como texto */
    }
  }
  const plain = text.replace(/```[a-z]*|```/g, "").trim();
  if (action === "resumir") return { puntos: plain.split(/\n+/).filter(Boolean).slice(0, 5).map((texto) => ({ texto: texto.replace(/^[-*•\d.)\s]+/, "") })) };
  if (action === "sintetizar") return { principal: plain, hallazgos: [], preguntas: [] };
  return { explicacion: plain };
}

/** El texto de una respuesta, para leerlo en voz alta o para revisar sus números. */
export function answerText(a: Answer): string {
  return [a.principal, a.explicacion, ...(a.puntos ?? []).map((p) => p.texto), ...(a.hallazgos ?? []), ...(a.preguntas ?? [])]
    .filter(Boolean)
    .join(" ");
}

/** Los números de un texto, normalizados: "1.234,5" y "1234.5" son el mismo. */
export function numbersIn(text: string): string[] {
  const found = text.match(/\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g) ?? [];
  return found.map((n) => {
    let v = n.replace(/\s/g, "");
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
    else v = v.replace(",", ".");
    return String(Number(v));
  });
}

/**
 * ¿Cada número del resumen está en los datos? Los años y los números muy
 * pequeños (1 a 10, que suelen ser conteos de la propia frase) no cuentan.
 */
export function verifyNumbers(answer: string, source: string): { verified: boolean; unknown: string[] } {
  const known = new Set(numbersIn(source));
  const unknown = [...new Set(numbersIn(answer))].filter((n) => {
    const v = Number(n);
    if (known.has(n)) return false;
    if (Number.isInteger(v) && v >= 1900 && v <= 2100) return false;
    if (Number.isInteger(v) && v >= 0 && v <= 10) return false;
    return true;
  });
  return { verified: unknown.length === 0, unknown };
}

/* --- La dirección del proveedor ---------------------------------------------------- */

/**
 * Los proveedores conocidos traen todo puesto: quien configura solo elige y
 * pega la clave. Sus direcciones no se toman de la configuración (así un dato
 * mal escrito no rompe nada); el modelo sí se puede cambiar.
 */
export const TEXT_PRESETS: Record<string, { url: string; model: string }> = {
  mistral: { url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest" },
  // Free.ai: https://api.free.ai, POST /v1/chat/ (respuesta como la de OpenAI).
  freeai: { url: "https://api.free.ai/v1/chat/", model: "qwen7b" },
};

/** Voz de Free.ai: POST /v1/tts/ {text, model, voice} → {audio_url}. em_alex es masculina en español. */
export const SPEECH_PRESETS: Record<string, { url: string; model: string; voice: string; format: "freeai" | "openai" }> = {
  freeai: { url: "https://api.free.ai/v1/tts/", model: "kokoro", voice: "em_alex", format: "freeai" },
};

/** Un nombre de modelo, no una ruta ni una dirección pegada por error. */
const looksLikeModel = (model: string) => /^[\w.:-][\w.:/-]*$/.test(model) && !/^https?:/.test(model);

/** La dirección y el modelo de texto que se usan de verdad. */
export function textTarget(provider: string, base: string, path: string, model: string): { url: string; model: string } {
  const preset = TEXT_PRESETS[provider];
  if (preset) return { url: preset.url, model: looksLikeModel(model) ? model : preset.model };
  return { url: endpoint(provider, base, path || "/chat/completions"), model };
}

/** La dirección, el modelo, la voz y el formato de la voz avanzada. */
export function speechTarget(provider: string, base: string, path: string, model: string, voice: string) {
  const preset = SPEECH_PRESETS[provider];
  if (preset) {
    return { url: preset.url, model: looksLikeModel(model) ? model : preset.model, voice: looksLikeModel(voice) ? voice : preset.voice, format: preset.format };
  }
  return { url: endpoint(provider, base, path || "/audio/speech"), model, voice, format: "openai" as const };
}

/**
 * Une la dirección del servicio y la ruta sin duplicar ni perder la versión:
 * "https://api.mistral.ai" + "/chat/completions" → ".../v1/chat/completions";
 * "…/v1" + "/v1/chat/completions" → ".../v1/chat/completions".
 */
export function endpoint(provider: string, base: string, path: string): string {
  let b = base.trim().replace(/\/+$/, "");
  let p = "/" + path.trim().replace(/^\/+/, "");
  if (/\/v1$/.test(b) && p.startsWith("/v1/")) p = p.slice(3);
  if (provider === "mistral" && !/\/v1$/.test(b) && !p.startsWith("/v1/")) b = `${b}/v1`;
  return `${b}${p}`;
}
// --- fin de la lógica -------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Llama al proveedor. Si responde 429 (límite de pedidos por segundo, muy
 * bajo en el plan gratuito de Mistral), espera lo que pida —hasta 3 s— y
 * reintenta una sola vez.
 */
async function callProvider(url: string, init: RequestInit): Promise<Response> {
  const first = await fetch(url, init);
  if (first.status !== 429) return first;
  const wait = Math.min(3, Math.max(1, Number(first.headers.get("retry-after")) || 1.2));
  await first.body?.cancel();
  await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  return fetch(url, init);
}

/** El 429 dicho en palabras: es el límite del proveedor, no el de la intranet. */
const LIMIT_429 =
  "El proveedor limitó los pedidos (429). Es el límite de su cuenta, no el de la intranet: espere un minuto y, si sigue, revise el plan y los límites de la cuenta en la consola del proveedor.";

/** Lo que respondió el proveedor cuando falla, corto y sin romper nada. */
async function providerDetail(response: Response) {
  try {
    const text = await response.text();
    // Una página web en vez de una respuesta de API: la dirección no es la del servicio.
    if (/^\s*</.test(text)) return "respondió una página web, no la API (la dirección no es la del servicio)";
    try {
      const data = JSON.parse(text);
      return String(data?.message ?? data?.error?.message ?? data?.error ?? data?.detail ?? text).slice(0, 240);
    } catch {
      return text.slice(0, 240);
    }
  } catch {
    return "";
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "La función no está configurada correctamente." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: { action?: Action; portal?: string; page?: string; sections?: Section[]; text?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "El pedido no es JSON." }, 400);
  }
  const action = body.action;
  if (!action || !["resumir", "sintetizar", "explicar", "voz", "probar"].includes(action)) {
    return json({ error: "Acción desconocida." }, 400);
  }

  // Quién pregunta: sin sesión, o una persona con su rol (si su perfil está activo).
  let profileId: string | null = null;
  let role: Role | null = null;
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (token) {
    const { data } = await admin.auth.getUser(token);
    if (data?.user) {
      const { data: profile } = await admin.from("profiles").select("id, role, is_active").eq("id", data.user.id).maybeSingle();
      if (profile?.is_active) {
        profileId = profile.id;
        role = profile.role as Role;
      }
    }
  }

  const [{ data: settings }, { data: secret }] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    // «*»: si la base aún no tiene 0090, speech_key no existe y no debe fallar.
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (!settings) return json({ error: "Falta la migración 0089 de Mr. Pilo con IA." }, 500);
  // Cada proveedor guarda su clave (0091); antes había una sola (api_key).
  const keyOf = (provider: string) => String(secret?.[`${provider}_key`] ?? "");
  const textKey = keyOf(settings.provider ?? "mistral") || String(secret?.api_key ?? "");
  const speechKey =
    String(secret?.speech_key ?? "") ||
    (settings.speech_provider === "freeai" || settings.speech_provider === "otro" ? keyOf(settings.speech_provider) : "") ||
    textKey;
  const target = textTarget(settings.provider ?? "mistral", settings.base_url ?? "", settings.chat_path ?? "", settings.text_model ?? "");
  if (!target.url.startsWith("https://") || !target.model || !textKey) {
    return json({ error: "Mr. Pilo con IA aún no está conectado.", advice: "La administración debe poner la dirección y la clave del proveedor." }, 503);
  }

  const portal = String(body.portal ?? "");
  const allowed = canUse(settings as unknown as Rules, portal, action, role);
  if (!allowed.ok) return json({ error: allowed.reason }, 403);

  const started = Date.now();
  const log = (status: string, subject: string, cached = false) =>
    admin.from("pilo_ai_log").insert({ profile_id: profileId, portal, action, subject: subject.slice(0, 200), status, cached, ms: Date.now() - started });

  // Cupo del día (los pedidos atendidos desde lo guardado no cuentan).
  if (action !== "probar") {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from("pilo_ai_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since.toISOString())
      .eq("cached", false);
    if ((count ?? 0) >= settings.daily_limit) {
      await log("limite", body.page ?? "");
      return json({ error: "Mr. Pilo llegó al límite de pedidos de hoy.", advice: "Mañana vuelve; mientras tanto puede leer con la voz del navegador.", code: "limite" }, 429);
    }
  }

  const headers = { Authorization: `Bearer ${textKey}`, "Content-Type": "application/json" };

  try {
    // --- Voz -------------------------------------------------------------------
    if (action === "voz") {
      const text = String(body.text ?? "").replace(/\s+/g, " ").trim().slice(0, 4000);
      if (!text) return json({ error: "No hay texto para leer." }, 400);
      const provider = settings.speech_provider ?? "navegador";
      const voice = speechTarget(provider, settings.speech_base_url || settings.base_url || "", settings.speech_path ?? "", settings.speech_model ?? "", settings.speech_voice ?? "");
      const testing = portal === "prueba";
      if ((!testing && settings.voice_engine !== "proveedor") || provider === "navegador" || !voice.model || !voice.url.startsWith("https://") || !speechKey) {
        return json({ error: "La voz avanzada no está configurada; se usa la del navegador.", code: "sin_voz" }, 503);
      }
      const init = {
        method: "POST",
        headers: { Authorization: `Bearer ${speechKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          voice.format === "freeai"
            ? { text, model: voice.model, voice: voice.voice }
            : { model: voice.model, input: text, voice: voice.voice || undefined, response_format: "mp3", speed: Number(settings.voice_rate) || 1 },
        ),
      };
      const response = await callProvider(voice.url, init);
      if (!response.ok) {
        const detail = await providerDetail(response);
        await log(`error ${response.status}`, `${detail} · ${text}`);
        if (response.status === 429) return json({ error: LIMIT_429, code: "limite_proveedor" }, 429);
        return json({ error: `El servicio de voz respondió ${response.status}${detail ? `: ${detail}` : ""}. Se llamó a ${voice.url}.`, code: "proveedor" }, 502);
      }
      let audio: Response = response;
      // Free.ai devuelve {audio_url}: se descarga aquí para no depender de su CORS.
      if (voice.format === "freeai") {
        const data = await response.json().catch(() => null);
        const link = typeof data?.audio_url === "string" ? new URL(data.audio_url, voice.url).toString() : "";
        if (!link) {
          await log("error sin audio", text);
          return json({ error: "El servicio de voz no devolvió el audio.", code: "proveedor" }, 502);
        }
        audio = await fetch(link);
        if (!audio.ok) {
          await log(`error audio ${audio.status}`, text);
          return json({ error: `No se pudo descargar el audio (${audio.status}).`, code: "proveedor" }, 502);
        }
      }
      await log("listo", text);
      return new Response(audio.body, { headers: { ...corsHeaders, "Content-Type": "application/octet-stream" } });
    }

    // --- Probar la conexión -------------------------------------------------------
    if (action === "probar") {
      const response = await callProvider(target.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: target.model, messages: [{ role: "user", content: "Responde solo: OK" }], max_tokens: 5 }),
      });
      if (!response.ok) {
        const detail = await providerDetail(response);
        await log(`error ${response.status}`, `Prueba de conexión · ${detail}`);
        return json({
          ok: false,
          status: response.status,
          error:
            response.status === 429
              ? `${LIMIT_429} (La conexión sí funciona: ${target.url}, modelo «${target.model}».)`
              : `El proveedor respondió ${response.status}${detail ? `: ${detail}` : ""}. Se llamó a ${target.url} con el modelo «${target.model}».`,
        });
      }
      await log("listo", "Prueba de conexión");
      return json({ ok: true, ms: Date.now() - started, url: target.url, model: target.model });
    }

    // --- Resumir, sintetizar, explicar ------------------------------------------------
    const sections = clipSections(Array.isArray(body.sections) ? body.sections : [], settings.max_rows);
    if (!sections.length) return json({ error: "No encontré cifras que leer en esta página." }, 400);
    const page = String(body.page ?? "").slice(0, 160);
    const source = sections.map((s) => `${s.title}\n${s.text}`).join("\n");
    const key = await sha256(JSON.stringify([action, target.model, page, sections]));

    if (settings.cache_days > 0) {
      const { data: hit } = await admin.from("pilo_ai_cache").select("result, created_at").eq("key", key).maybeSingle();
      if (hit && Date.now() - new Date(hit.created_at).getTime() < settings.cache_days * 86400_000) {
        await log("listo", page, true);
        return json({ ...hit.result, cached: true });
      }
    }

    const response = await callProvider(target.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: target.model,
        messages: buildMessages(action, page, sections),
        temperature: 0.2,
        max_tokens: 700,
        // Mistral (y los compatibles que lo aceptan) devuelven JSON limpio.
        ...(settings.provider === "mistral" ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) {
      const detail = await providerDetail(response);
      await log(`error ${response.status}`, `${page} · ${detail}`);
      if (response.status === 429) return json({ error: LIMIT_429, code: "limite_proveedor" }, 429);
      return json({ error: `El proveedor respondió ${response.status}${detail ? `: ${detail}` : ""}.`, code: "proveedor" }, 502);
    }
    const data = await response.json();
    const raw = String(data?.choices?.[0]?.message?.content ?? "");
    const answer = parseAnswer(action, raw);
    const check = verifyNumbers(answerText(answer), source);
    const result = { answer, verified: check.verified, unknown: check.unknown, sections: sections.map((s) => s.title) };
    if (settings.cache_days > 0 && check.verified) {
      await admin.from("pilo_ai_cache").upsert({ key, result, created_at: new Date().toISOString() });
    }
    await log(check.verified ? "listo" : "revisar", page);
    return json({ ...result, cached: false });
  } catch (error) {
    await log("sin conexión", body.page ?? "");
    return json({ error: "No pude hablar con el proveedor.", detail: String(error), code: "red" }, 502);
  }
});
