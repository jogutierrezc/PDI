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

   Despliegue:
     supabase functions deploy pilo-ia
   (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta
   la plataforma. La clave del proveedor se guarda desde la intranet.)
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { answerText, buildMessages, canUse, clipSections, parseAnswer, verifyNumbers } from "./logic.ts";
import type { Action, Role, Rules, Section } from "./logic.ts";

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

const joinUrl = (base: string, path: string) => `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

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
  if (!settings.base_url || !textKey) {
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
      const speechBase = settings.speech_base_url || settings.base_url;
      if (settings.voice_engine !== "proveedor" || settings.speech_provider === "navegador" || !settings.speech_model || !speechBase) {
        return json({ error: "La voz avanzada no está configurada; se usa la del navegador.", code: "sin_voz" }, 503);
      }
      const response = await fetch(joinUrl(speechBase, settings.speech_path), {
        method: "POST",
        headers: { Authorization: `Bearer ${speechKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: settings.speech_model,
          input: text,
          voice: settings.speech_voice || undefined,
          response_format: "mp3",
          speed: Number(settings.voice_rate) || 1,
        }),
      });
      if (!response.ok) {
        await log(`error ${response.status}`, text);
        return json({ error: "El proveedor no pudo leer el texto.", code: "proveedor" }, 502);
      }
      await log("listo", text);
      return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "application/octet-stream" } });
    }

    // --- Probar la conexión -------------------------------------------------------
    if (action === "probar") {
      const response = await fetch(joinUrl(settings.base_url, settings.chat_path), {
        method: "POST",
        headers,
        body: JSON.stringify({ model: settings.text_model, messages: [{ role: "user", content: "Responde solo: OK" }], max_tokens: 5 }),
      });
      await log(response.ok ? "listo" : `error ${response.status}`, "Prueba de conexión");
      if (!response.ok) return json({ ok: false, status: response.status, error: `El proveedor respondió ${response.status}.` }, 200);
      return json({ ok: true, ms: Date.now() - started });
    }

    // --- Resumir, sintetizar, explicar ------------------------------------------------
    const sections = clipSections(Array.isArray(body.sections) ? body.sections : [], settings.max_rows);
    if (!sections.length) return json({ error: "No encontré cifras que leer en esta página." }, 400);
    const page = String(body.page ?? "").slice(0, 160);
    const source = sections.map((s) => `${s.title}\n${s.text}`).join("\n");
    const key = await sha256(JSON.stringify([action, settings.text_model, page, sections]));

    if (settings.cache_days > 0) {
      const { data: hit } = await admin.from("pilo_ai_cache").select("result, created_at").eq("key", key).maybeSingle();
      if (hit && Date.now() - new Date(hit.created_at).getTime() < settings.cache_days * 86400_000) {
        await log("listo", page, true);
        return json({ ...hit.result, cached: true });
      }
    }

    const response = await fetch(joinUrl(settings.base_url, settings.chat_path), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.text_model,
        messages: buildMessages(action, page, sections),
        temperature: 0.2,
        max_tokens: 700,
        // Mistral (y los compatibles que lo aceptan) devuelven JSON limpio.
        ...(settings.provider === "mistral" ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) {
      await log(`error ${response.status}`, page);
      return json({ error: "El proveedor no respondió bien.", code: "proveedor" }, 502);
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
