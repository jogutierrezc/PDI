/* =============================================================================
   Pilo en el Aula · la función (0299).

   El chat de Pilo dentro de Moodle. La página del aula lleva una credencial que
   firma el plugin local_pilo en el servidor de Moodle; esta función la verifica
   con la clave del sitio y solo entonces sabe quién pregunta, con qué rol y en
   qué cursos. Nada de eso lo decide el navegador.

   Acciones (POST, JSON):
     identidad   { site, firma }                        → quién es, su rol y sus cursos
     preguntar   { site, firma, question, history }     → flujo SSE (meta, delta, done)

   Responde siempre con Pilo Astra, en el servidor propio de la universidad: lo
   que se hable del aula no sale a un proveedor externo. Busca en la memoria del
   espacio «ensenanza» (los documentos cargados) por palabras y, si los
   embeddings salen del servidor de Astra (0298), también por significado.

   Fase 1: sin notas, entregas ni listas de estudiantes. Va aparte de pilo-ia:
   desplegarla o cambiarla no toca el Pilo de siempre.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { ASTRA_NOMBRE, destinoAstra, esfuerzoAstra, leerConfig, llamar, servidorAstra, endpoint } from "../pilo-work/proveedor.ts";
import type { Destinos } from "../pilo-work/proveedor.ts";
import {
  aulaSiteOf,
  aulaSources,
  buildAulaMessages,
  cleanHistory,
  cleanQuestion,
  createLimiter,
  createOpenAiReader,
  sse,
  todayText,
  verifyAulaToken,
  type AulaIdentidad,
  type AulaPasaje,
} from "./aula.ts";

const SPACE = "ensenanza";
const EMBED_DIM = 1024;
const SEMANTIC_MIN = 0.3;

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...extra } });

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const limiter = createLimiter();

/** La clave de firma de cada sitio, un minuto en memoria: apagar el sitio vale en menos de un minuto. */
const keyCache = new Map<string, { at: number; key: string | null; why: string }>();

async function siteKey(site: string): Promise<{ key: string | null; why: string }> {
  const hit = keyCache.get(site);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const [{ data: row, error: e1 }, { data: secret, error: e2 }] = await Promise.all([
    admin.from("pilo_moodle_sites").select("enabled").eq("space", SPACE).eq("id", site).maybeSingle(),
    admin.from("pilo_moodle_site_secret").select("firma_key").eq("space", SPACE).eq("site", site).maybeSingle(),
  ]);
  let out: { key: string | null; why: string };
  if (e1 || e2) out = { key: null, why: /firma_key/.test(String(e2?.message)) ? "migracion" : "interno" };
  else if (!row) out = { key: null, why: "sitio" };
  else if ((row as { enabled?: boolean }).enabled !== true) out = { key: null, why: "apagado" };
  else {
    const key = String((secret as { firma_key?: string } | null)?.firma_key ?? "");
    out = key.length >= 32 ? { key, why: "" } : { key: null, why: "sin_clave" };
  }
  keyCache.set(site, { at: Date.now(), ...out });
  return out;
}

const WHY: Record<string, [number, string, string]> = {
  migracion: [500, "Falta la migración 0299 de Pilo en el Aula.", "La administración debe aplicarla antes de usar el plugin de Moodle."],
  interno: [500, "No pude leer la conexión con Moodle.", "Intente de nuevo en un momento."],
  sitio: [403, "Este Moodle no está conectado con Pilo.", "La administración debe agregarlo en Mr. Pilo en Enseñanza › Memoria › Moodle."],
  apagado: [403, "Pilo está apagado para este Moodle.", "La administración puede encenderlo en Mr. Pilo en Enseñanza › Memoria › Moodle."],
  sin_clave: [403, "Este Moodle aún no tiene la clave del plugin.", "La administración debe crearla en Mr. Pilo y pegarla en la configuración de local_pilo."],
  firma: [401, "No pude confirmar quién pregunta.", "Recargue la página del aula. Si sigue, la clave del plugin no coincide con la de Pilo."],
};

async function identify(body: Record<string, unknown>): Promise<{ id: AulaIdentidad } | { error: Response }> {
  const firma = typeof body.firma === "string" ? body.firma : "";
  const site = typeof body.site === "string" ? body.site : "";
  const claimed = aulaSiteOf(firma);
  if (!firma || !claimed || claimed !== site) return { error: json({ error: WHY.firma[1], advice: WHY.firma[2], code: "firma" }, 401) };
  const { key, why } = await siteKey(site);
  if (!key) {
    const [status, error, advice] = WHY[why] ?? WHY.interno;
    return { error: json({ error, advice, code: why }, status) };
  }
  const id = await verifyAulaToken(firma, key, site);
  if (!id) return { error: json({ error: WHY.firma[1], advice: WHY.firma[2], code: "firma" }, 401) };
  return { id };
}

/* --- La memoria ------------------------------------------------------------------------- */

interface Hit extends AulaPasaje {
  rank?: number;
  sim?: number;
}

/** El vector de la pregunta con el servidor de Astra (0298), si así está configurado; si no, null. */
async function queryVector(q: string): Promise<{ v: string; model: string } | null> {
  try {
    const [{ data: settings }, { data: secret }, cfg] = await Promise.all([
      admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
      admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
      leerConfig(admin),
    ]);
    if (settings?.embed_provider !== "astra") return null;
    const model = String(settings?.embed_model ?? "").trim();
    const { base, key } = servidorAstra(cfg, settings, secret);
    const url = base ? endpoint("otro", base, "/embeddings") : "";
    if (!model || !key || !url.startsWith("https://")) return null;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: [q] }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const v = (await r.json())?.data?.[0]?.embedding;
    if (!Array.isArray(v) || v.length < EMBED_DIM) return null;
    const cut = (v as number[]).slice(0, EMBED_DIM);
    const norm = Math.sqrt(cut.reduce((s, x) => s + x * x, 0)) || 1;
    return { v: `[${cut.map((x) => Number((x / norm).toFixed(6))).join(",")}]`, model };
  } catch {
    return null;
  }
}

/** Los pasajes de la memoria de Enseñanza para la pregunta: por palabras y por significado, sin repetir. */
async function searchMemory(q: string): Promise<AulaPasaje[]> {
  const scope = { p_space: SPACE, p_public_only: true, p_member: true };
  const [lex, vec] = await Promise.all([
    admin.rpc("pilo_memory_search", { p_q: q, p_sources: null, p_limit: 6, ...scope }),
    queryVector(q),
  ]);
  const sem = vec
    ? await admin.rpc("pilo_memory_semantic", { p_embedding: vec.v, p_model: vec.model, p_sources: null, p_limit: 6, p_min: SEMANTIC_MIN, ...scope })
    : { data: [], error: null };
  const a = (lex.error ? [] : lex.data ?? []) as Hit[];
  const b = (sem.error ? [] : sem.data ?? []) as Hit[];
  const out: AulaPasaje[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < 6; i++) {
    for (const h of [b[i], a[i]]) {
      if (!h || seen.has(h.ref) || out.length >= 6) continue;
      seen.add(h.ref);
      out.push({ ref: h.ref, source: h.source, title: h.title ?? "", section: h.section ?? "", body: h.body ?? "", path: h.path ?? "", cut: h.cut ?? "", office: h.office ?? "" });
    }
  }
  return out;
}

/* --- Preguntar ---------------------------------------------------------------------------- */

async function ask(id: AulaIdentidad, body: Record<string, unknown>, request: Request): Promise<Response> {
  const question = cleanQuestion(body.question);
  if (question.length < 2) return json({ error: "Escriba su pregunta." }, 400);
  const turn = limiter(`${id.site}:${id.user}`);
  if (!turn.ok) {
    return json({ error: "Ya hizo muchas preguntas en esta hora.", advice: "Descanse un momento y vuelva a intentarlo.", code: "limite", retry_after: turn.retry }, 429, { "Retry-After": String(turn.retry) });
  }
  const t0 = Date.now();
  const cfg = await leerConfig(admin);
  const destino = await destinoAstra(admin, cfg);
  if (!destino) {
    return json({ error: "Pilo en el Aula responde con Pilo Astra y el servidor aún no está conectado.", advice: "La administración debe poner la dirección, la clave y el modelo de Astra en Pilo Work.", code: "sin_ia" }, 503);
  }
  const pasajes = await searchMemory(question).catch(() => [] as AulaPasaje[]);
  const messages = buildAulaMessages(id, pasajes, question, cleanHistory(body.history), todayText());
  const solo: Destinos = { principal: destino, apoyo: null, orden: { rapido: [destino], capacidad: [destino] } };
  const { response, error } = await llamar(
    solo,
    { messages, temperature: 0.4, max_tokens: cfg.astra_max_tokens, stream: true, reasoning: esfuerzoAstra(cfg.astra_razonamiento) },
    { nivel: "capacidad", esperaMs: Math.min(Math.max(cfg.astra_espera_s, 20), 150) * 1000, signal: request.signal },
  );
  if (!response?.body) return json({ error: "Pilo Astra no respondió.", advice: error || "Intente de nuevo en un momento.", code: "proveedor" }, 502);

  const sources = aulaSources(pasajes);
  const meta = { asked: question, sources, trail: [], rol: id.rol, model: ASTRA_NOMBRE, modelo: { id: "astra", label: ASTRA_NOMBRE }, razona: true };
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const upstream = response.body.getReader();
  const reader = createOpenAiReader();
  let text = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(ctl) {
      const send = (event: string, data: unknown) => ctl.enqueue(enc.encode(sse(event, data)));
      send("meta", meta);
      try {
        for (;;) {
          const { done, value } = await upstream.read();
          if (done) break;
          const got = reader.push(dec.decode(value, { stream: true }));
          if (got.thinking) send("thinking", { text: got.thinking });
          if (got.text) {
            text += got.text;
            send("delta", { text: got.text });
          }
        }
        const tail = reader.push(dec.decode() + "\n");
        if (tail.text) {
          text += tail.text;
          send("delta", { text: tail.text });
        }
        if (!text.trim()) {
          send("error", { message: "Pilo Astra terminó sin respuesta. Intente de nuevo.", code: "vacio" });
        } else {
          const used = sources.filter((s) => text.includes(`[${s.n}]`));
          send("done", {
            kind: "ia",
            text,
            sources: used,
            trail: [{ step: "aula", status: "ai", detail: `${id.rol}${id.curso ? ` · curso ${id.curso.id}` : ""} · ${pasajes.length} pasajes`, ms: Date.now() - t0 }],
            rol: id.rol,
          });
        }
        // Sin contenidos en la bitácora: quién (id de Moodle), rol, sitio y tiempos.
        console.log(`[pilo-aula] ${id.site}:${id.user} ${id.rol} ${pasajes.length}p ${text.length}c ${Date.now() - t0}ms`);
      } catch (e) {
        if (!request.signal.aborted) send("error", { message: "Se cortó la respuesta de Pilo Astra.", code: "cortado" });
        console.error(`[pilo-aula] flujo: ${e instanceof Error ? e.message : e}`);
      } finally {
        upstream.cancel().catch(() => undefined);
        ctl.close();
      }
    },
    cancel() {
      upstream.cancel().catch(() => undefined);
    },
  });
  return new Response(stream, { status: 200, headers: { ...cors, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Solo POST." }, 405);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 48_000) return json({ error: "El pedido es demasiado grande." }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object") throw new Error("cuerpo");
  } catch {
    return json({ error: "El pedido no es JSON." }, 400);
  }
  try {
    const who = await identify(body);
    if ("error" in who) return who.error;
    const { id } = who;
    if (body.action === "identidad") {
      return json({ ok: true, nombre: id.nombre, rol: id.rol, curso: id.curso, cursos: id.cursos, exp: id.exp });
    }
    if (body.action === "preguntar") return await ask(id, body, request);
    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    console.error(`[pilo-aula] ${e instanceof Error ? e.message : e}`);
    return json({ error: "Pilo tuvo un problema interno.", advice: "Intente de nuevo en un momento.", code: "interno" }, 500);
  }
});
