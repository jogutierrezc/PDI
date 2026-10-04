/* =============================================================================
   Mr. Pilo en Alexa · hablar con Pilo.

   La skill no tiene cerebro propio: le pregunta a la misma función del portal
   (supabase/functions/pilo-ia, acción «preguntar»), con la clave anónima, como
   un visitante de Pregúntele a Pilo. Así responde con la misma memoria, las
   mismas reglas y el mismo cupo.

   Alexa espera la respuesta 8 segundos, y a Pilo redactar le toma más (cerca
   de un minuto con el modelo de hoy). Por eso cada pregunta lleva un tiquete
   (`espera`, migración 0128): si el plazo se cumple antes de que termine, la
   skill suelta el pedido, Pilo sigue redactando y la respuesta se recoge en
   el siguiente turno con `collectPilo`. Nunca se inventa una respuesta ni se
   dice una a medias.

   Variables de entorno de la Lambda (o, en una skill alojada por Alexa, config.js):
     SUPABASE_URL        https://<proyecto>.supabase.co
     SUPABASE_ANON_KEY   la clave anónima (pública) del proyecto
     PILO_PORTAL         «pregunta» (el Pilo de Planeación, de partida) o
                         «ensenanza» (Mr. Pilo en Enseñanza)
     PILO_ROL            solo en «ensenanza»: «estudiante» o «profesor»
   ========================================================================== */

import { netFetch, timeoutSignal } from "./http.js";
import { completeSentences } from "./speech.js";

/** Lo que se espera a Pilo: Alexa corta a los 8 s y hay que dejar tiempo para responderle. */
export const DEADLINE_MS = 6500;

const HISTORY_TURNS = 3;
const HISTORY_Q = 300;
const HISTORY_A = 600;

/** La conversación que viaja con la pregunta: los últimos turnos, recortados. */
export function buildHistory(turns) {
  return (Array.isArray(turns) ? turns : [])
    .filter((t) => typeof t?.q === "string" && typeof t?.a === "string" && t.q.trim() && t.a.trim())
    .slice(-HISTORY_TURNS)
    .map((t) => ({ q: t.q.trim().slice(0, HISTORY_Q), a: t.a.trim().slice(0, HISTORY_A) }));
}

const portalOf = (env) => (env.PILO_PORTAL === "ensenanza" ? "ensenanza" : "pregunta");

/** El cuerpo del pedido, igual al del portal, más el tiquete con que se recoge la respuesta si no alcanza a llegar. */
export function askBody(question, history, env = process.env, ticket = "") {
  const portal = portalOf(env);
  const rol = portal === "ensenanza" && (env.PILO_ROL === "estudiante" || env.PILO_ROL === "profesor") ? env.PILO_ROL : null;
  return { action: "preguntar", portal, question, history: buildHistory(history), stream: true, ...(rol ? { rol } : {}), ...(ticket ? { espera: ticket } : {}) };
}

/** Los eventos de un trozo del flujo (SSE): «event: nombre» y «data: JSON», separados por una línea en blanco. */
export function createSseReader() {
  let buffer = "";
  return (chunk) => {
    buffer += chunk;
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    const out = [];
    for (const frame of frames) {
      let event = "message";
      const data = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (!data.length) continue;
      try {
        out.push({ event, data: JSON.parse(data.join("\n")) });
      } catch {
        /* un evento que no es JSON no es de Pilo */
      }
    }
    return out;
  };
}

const said = (body, fallback) => {
  const error = typeof body?.error === "string" ? body.error.trim() : "";
  const advice = typeof body?.advice === "string" ? body.advice.trim() : "";
  return error ? (advice ? `${error} ${advice}` : error) : fallback;
};

const done = (payload) => ({
  status: "done",
  text: String(payload?.text ?? ""),
  kind: String(payload?.kind ?? ""),
  asked: typeof payload?.asked === "string" ? payload.asked : "",
  sources: Array.isArray(payload?.sources) ? payload.sources : [],
});

/**
 * Le pregunta a Pilo y espera hasta el plazo. Devuelve:
 *   { status: "done", text, kind, asked, sources }   la respuesta completa
 *   { status: "waiting", writing }                    con tiquete: Pilo sigue y la respuesta se recoge después
 *                                                     (`writing`: ya había empezado a escribir, falta poco)
 *   { status: "partial", text }                       sin tiquete: lo que alcanzó a escribir, en frases completas
 *   { status: "slow" }                                sin tiquete: no alcanzó a escribir nada
 *   { status: "error", message }                      lo que dijo el servidor, o que no hubo conexión
 */
export async function askPilo({ question, history = [], ticket = "", deadlineMs = DEADLINE_MS, env = process.env, fetchImpl = netFetch }) {
  const base = String(env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = String(env.SUPABASE_ANON_KEY ?? "");
  if (!base || !key) return { status: "error", message: "A esta skill le falta la dirección o la clave de Pilo. La administración debe configurarla." };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deadlineMs);
  let written = "";
  try {
    const response = await fetchImpl(`${base}/functions/v1/pilo-ia`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify(askBody(question, history, env, ticket)),
      signal: ctl.signal,
    });
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const fallback = response.status === 429 ? "Me han preguntado mucho en poco tiempo. Intente de nuevo en un momento." : "No pude responder ahora. Intente de nuevo en un momento.";
      return { status: "error", message: said(body, fallback) };
    }
    // Las reglas, el catálogo y la memoria responden de una, como JSON.
    if (!type.includes("text/event-stream") || !response.body) return done(await response.json());

    const read = createSseReader();
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    for (;;) {
      const { done: closed, value } = await reader.read();
      if (closed) break;
      for (const { event, data } of read(decoder.decode(value, { stream: true }))) {
        if (event === "delta" && typeof data?.text === "string") written += data.text;
        else if (event === "done") return done(data);
        else if (event === "error") return { status: "error", message: typeof data?.message === "string" && data.message ? data.message : "No pude terminar la respuesta." };
      }
    }
    // El flujo se cerró sin «done»: vale lo que quedó escrito, si quedó algo completo.
    const rest = completeSentences(written);
    return rest ? { status: "partial", text: rest } : { status: "error", message: "La respuesta se cortó antes de terminar. Intente de nuevo." };
  } catch (error) {
    if (ctl.signal.aborted) {
      if (ticket) return { status: "waiting", writing: Boolean(written.trim()) };
      const rest = completeSentences(written);
      return rest.length >= 40 ? { status: "partial", text: rest } : { status: "slow" };
    }
    console.error("pilo-ia", error);
    return { status: "error", message: "No pude conectarme con Pilo. Intente de nuevo en un momento." };
  } finally {
    clearTimeout(timer);
    if (!ctl.signal.aborted) ctl.abort();
  }
}

/** Lo que se espera al recoger: menos que el plazo de Alexa. El servidor espera con el pedido abierto. */
export const COLLECT_MS = 5500;

/**
 * Recoge la respuesta que Pilo dejó para un tiquete. Devuelve:
 *   { status: "done", text, kind, asked, sources }   ya está
 *   { status: "waiting" }                             Pilo sigue redactando
 *   { status: "gone" }                                el servidor no guardó esa espera (falta 0128, o venció)
 *   { status: "error", message }                      falló la redacción, o no hubo conexión
 */
export async function collectPilo({ ticket, waitMs = COLLECT_MS, env = process.env, fetchImpl = netFetch }) {
  const base = String(env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = String(env.SUPABASE_ANON_KEY ?? "");
  if (!base || !key) return { status: "error", message: "A esta skill le falta la dirección o la clave de Pilo. La administración debe configurarla." };
  const signal = timeoutSignal(waitMs + 1200);
  try {
    const response = await fetchImpl(`${base}/functions/v1/pilo-ia`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ action: "recoger", portal: portalOf(env), espera: ticket, wait: waitMs }),
      signal,
    });
    const body = await response.json().catch(() => null);
    if (body?.status === "lista") return done(body);
    if (body?.status === "pendiente") return { status: "waiting" };
    if (response.status === 404 || body?.code === "migracion") return { status: "gone" };
    if (body?.status === "error") return { status: "error", message: typeof body.message === "string" && body.message ? body.message : "No pude terminar la respuesta." };
    return { status: "error", message: said(body, "No pude responder ahora. Intente de nuevo en un momento.") };
  } catch (error) {
    // Si el plazo se cumplió esperando, Pilo sigue: se vuelve a recoger en el siguiente turno.
    if (signal.aborted || error?.name === "TimeoutError" || error?.name === "AbortError") return { status: "waiting" };
    console.error("pilo-ia recoger", error);
    return { status: "error", message: "No pude conectarme con Pilo. Intente de nuevo en un momento." };
  }
}
