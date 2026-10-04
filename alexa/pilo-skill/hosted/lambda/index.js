/* Mr. Pilo en Alexa. Generado con build-hosted.mjs desde alexa/pilo-skill/lambda: no se edita aquí, salvo CONFIG. */
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lambda/index.js
var lambda_exports = {};
__export(lambda_exports, {
  QUESTION_WORD: () => QUESTION_WORD,
  firstWait: () => firstWait,
  handler: () => handler,
  questionOf: () => questionOf
});
module.exports = __toCommonJS(lambda_exports);

// lambda/config.js
var CONFIG = {
  SUPABASE_URL: "https://dogbfifebeyopcowuzbs.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvZ2JmaWZlYmV5b3Bjb3d1emJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNjIyODcsImV4cCI6MjEwMzkzODI4N30.2sJM4HiogRcnqkWcbZgRf1OtmcdECtqxgx0D6sc0V9w",
  // «pregunta» (el Pilo de Planeación) o «ensenanza» (con PILO_ROL «estudiante» o «profesor»).
  PILO_PORTAL: "pregunta",
  PILO_ROL: "",
  // Cuántos segundos llena Alexa mientras Pilo redacta (ver lambda/index.js).
  PILO_WAIT_SECONDS: "40",
  // El id de la skill (amzn1.ask.skill…): con él, la Lambda solo atiende a esta skill.
  ALEXA_SKILL_ID: ""
};
for (const [name, value] of Object.entries(CONFIG)) {
  if (value && !process.env[name]) process.env[name] = value;
}

// lambda/index.js
var import_node_crypto = require("node:crypto");
var import_ask_sdk_core = __toESM(require("ask-sdk-core"), 1);

// lambda/http.js
var import_node_https = __toESM(require("node:https"), 1);
var abortError = () => Object.assign(new Error("El pedido se canceló."), { name: "AbortError" });
function nodeFetch(url, { method = "GET", headers = {}, body, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal == null ? void 0 : signal.aborted) return reject(abortError());
    const request = import_node_https.default.request(url, { method, headers: { ...headers, ...body ? { "Content-Length": Buffer.byteLength(body) } : {} } }, (res) => {
      const chunks = res[Symbol.asyncIterator]();
      const status = res.statusCode ?? 0;
      resolve({
        status,
        ok: status >= 200 && status < 300,
        headers: {
          get(name) {
            const value = res.headers[String(name).toLowerCase()];
            return Array.isArray(value) ? value.join(", ") : value ?? null;
          }
        },
        body: {
          getReader: () => ({
            async read() {
              const { done: done2, value } = await chunks.next();
              return { done: Boolean(done2), value };
            }
          })
        },
        async json() {
          const parts = [];
          for await (const part of res) parts.push(part);
          return JSON.parse(Buffer.concat(parts).toString("utf8"));
        }
      });
    });
    const onAbort = () => request.destroy(abortError());
    signal == null ? void 0 : signal.addEventListener("abort", onAbort, { once: true });
    request.on("close", () => signal == null ? void 0 : signal.removeEventListener("abort", onAbort));
    request.on("error", reject);
    request.end(body);
  });
}
var netFetch = (url, init) => typeof globalThis.fetch === "function" ? globalThis.fetch(url, init) : nodeFetch(url, init);
function timeoutSignal(ms) {
  var _a;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  (_a = timer.unref) == null ? void 0 : _a.call(timer);
  return ctl.signal;
}

// lambda/speech.js
var SPEECH_MAX = 900;
function toPlain(text) {
  return String(text ?? "").replace(/```[\s\S]*?(```|$)/g, " ").replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1").replace(/\s*\[\d+\]/g, "").replace(/https?:\/\/\S+/g, "").replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/^\s*[-*•]\s+/gm, "").replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, "").replace(/\s*\|\s*/g, ", ").replace(/(\*\*|__|\*|_|`)/g, "").split(/\n+/).map((line) => line.replace(/^[,\s]+|[,\s]+$/g, "")).filter(Boolean).map((line) => /[.!?:;…]$/.test(line) ? line : `${line}.`).join(" ").replace(/\s+/g, " ").trim();
}
function completeSentences(text) {
  const plain = toPlain(text);
  const raw = String(text ?? "").trimEnd();
  const open = raw && !/[.!?…]["»)]?$/.test(raw.replace(/\s*\[\d+\]$/g, ""));
  const body = open ? plain.replace(/\.$/, "") : plain;
  const end = Math.max(body.lastIndexOf(". "), body.lastIndexOf("? "), body.lastIndexOf("! "));
  if (!open) return body;
  return end < 0 ? "" : body.slice(0, end + 1);
}
function clip(text, max = SPEECH_MAX) {
  if (text.length <= max) return { text, cut: false };
  const head = text.slice(0, max);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "));
  return { text: end > max * 0.4 ? head.slice(0, end + 1) : `${head.slice(0, head.lastIndexOf(" "))}…`, cut: true };
}
var escapeSsml = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
function toSpeech(text, max = SPEECH_MAX) {
  const { text: said2, cut } = clip(toPlain(text), max);
  return { speech: escapeSsml(said2), cut };
}
var PAUSE_S = 9;
var STILL = ["Sigo buscando.", "Ya casi.", "Un momento más.", "Estoy terminando."];
function waitSpeech(opening, seconds) {
  const parts = [opening];
  let left = Math.max(0, Math.round(seconds));
  for (let i = 0; left > 0; i++) {
    const pause = Math.min(PAUSE_S, left);
    parts.push(`<break time="${pause}s"/>`);
    left -= pause + 1;
    if (left > 0) parts.push(STILL[i % STILL.length]);
  }
  return parts.join(" ");
}
function cardText(text, sources = []) {
  const titles = [...new Set(sources.map((s) => typeof (s == null ? void 0 : s.title) === "string" ? s.title.trim() : "").filter(Boolean))].slice(0, 3);
  const body = toPlain(text).slice(0, 7e3);
  return titles.length ? `${body}

Fuentes: ${titles.join("; ")}.` : body;
}

// lambda/pilo.js
var DEADLINE_MS = 6500;
var HISTORY_TURNS = 3;
var HISTORY_Q = 300;
var HISTORY_A = 600;
function buildHistory(turns) {
  return (Array.isArray(turns) ? turns : []).filter((t) => typeof (t == null ? void 0 : t.q) === "string" && typeof (t == null ? void 0 : t.a) === "string" && t.q.trim() && t.a.trim()).slice(-HISTORY_TURNS).map((t) => ({ q: t.q.trim().slice(0, HISTORY_Q), a: t.a.trim().slice(0, HISTORY_A) }));
}
var portalOf = (env) => env.PILO_PORTAL === "ensenanza" ? "ensenanza" : "pregunta";
function askBody(question, history, env = process.env, ticket = "") {
  const portal = portalOf(env);
  const rol = portal === "ensenanza" && (env.PILO_ROL === "estudiante" || env.PILO_ROL === "profesor") ? env.PILO_ROL : null;
  return { action: "preguntar", portal, question, history: buildHistory(history), stream: true, ...rol ? { rol } : {}, ...ticket ? { espera: ticket } : {} };
}
function createSseReader() {
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
      }
    }
    return out;
  };
}
var said = (body, fallback) => {
  const error = typeof (body == null ? void 0 : body.error) === "string" ? body.error.trim() : "";
  const advice = typeof (body == null ? void 0 : body.advice) === "string" ? body.advice.trim() : "";
  return error ? advice ? `${error} ${advice}` : error : fallback;
};
var done = (payload) => ({
  status: "done",
  text: String((payload == null ? void 0 : payload.text) ?? ""),
  kind: String((payload == null ? void 0 : payload.kind) ?? ""),
  asked: typeof (payload == null ? void 0 : payload.asked) === "string" ? payload.asked : "",
  sources: Array.isArray(payload == null ? void 0 : payload.sources) ? payload.sources : []
});
async function askPilo({ question, history = [], ticket = "", deadlineMs = DEADLINE_MS, env = process.env, fetchImpl = netFetch }) {
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
      signal: ctl.signal
    });
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const fallback = response.status === 429 ? "Me han preguntado mucho en poco tiempo. Intente de nuevo en un momento." : "No pude responder ahora. Intente de nuevo en un momento.";
      return { status: "error", message: said(body, fallback) };
    }
    if (!type.includes("text/event-stream") || !response.body) return done(await response.json());
    const read = createSseReader();
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    for (; ; ) {
      const { done: closed, value } = await reader.read();
      if (closed) break;
      for (const { event, data } of read(decoder.decode(value, { stream: true }))) {
        if (event === "delta" && typeof (data == null ? void 0 : data.text) === "string") written += data.text;
        else if (event === "done") return done(data);
        else if (event === "error") return { status: "error", message: typeof (data == null ? void 0 : data.message) === "string" && data.message ? data.message : "No pude terminar la respuesta." };
      }
    }
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
var COLLECT_MS = 5500;
async function collectPilo({ ticket, waitMs = COLLECT_MS, env = process.env, fetchImpl = netFetch }) {
  const base = String(env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = String(env.SUPABASE_ANON_KEY ?? "");
  if (!base || !key) return { status: "error", message: "A esta skill le falta la dirección o la clave de Pilo. La administración debe configurarla." };
  const signal = timeoutSignal(waitMs + 1200);
  try {
    const response = await fetchImpl(`${base}/functions/v1/pilo-ia`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ action: "recoger", portal: portalOf(env), espera: ticket, wait: waitMs }),
      signal
    });
    const body = await response.json().catch(() => null);
    if ((body == null ? void 0 : body.status) === "lista") return done(body);
    if ((body == null ? void 0 : body.status) === "pendiente") return { status: "waiting" };
    if (response.status === 404 || (body == null ? void 0 : body.code) === "migracion") return { status: "gone" };
    if ((body == null ? void 0 : body.status) === "error") return { status: "error", message: typeof body.message === "string" && body.message ? body.message : "No pude terminar la respuesta." };
    return { status: "error", message: said(body, "No pude responder ahora. Intente de nuevo en un momento.") };
  } catch (error) {
    if (signal.aborted || (error == null ? void 0 : error.name) === "TimeoutError" || (error == null ? void 0 : error.name) === "AbortError") return { status: "waiting" };
    console.error("pilo-ia recoger", error);
    return { status: "error", message: "No pude conectarme con Pilo. Intente de nuevo en un momento." };
  }
}

// lambda/index.js
var QUESTION_WORD = {
  PreguntarIntent: "",
  PreguntaQueIntent: "qué",
  PreguntaCualIntent: "cuál",
  PreguntaCualesIntent: "cuáles",
  PreguntaCuantoIntent: "cuánto",
  PreguntaCuantaIntent: "cuánta",
  PreguntaCuantosIntent: "cuántos",
  PreguntaCuantasIntent: "cuántas",
  PreguntaComoIntent: "cómo",
  PreguntaDondeIntent: "dónde",
  PreguntaCuandoIntent: "cuándo",
  PreguntaQuienIntent: "quién",
  PreguntaQuienesIntent: "quiénes",
  PreguntaPorQueIntent: "por qué"
};
var TITLE = "Mr. Pilo";
var AGAIN = "¿Qué más quiere saber?";
var HOW = "Empiece su pregunta con «dime» o «quiero saber»; por ejemplo: dime cuántos programas tiene la universidad.";
var READY = "¿Le digo lo que encontré?";
var READY_HOW = "Diga sí para oír la respuesta, o hágame otra pregunta.";
var TOO_SLOW = "Esa pregunta me pide más tiempo del que tengo aquí. Hágamela de nuevo, o búsquela en Pregúntele a Pilo, en el portal de Planeación.";
var MAX_TURNS = 3;
function firstWait(env = process.env) {
  const asked = Number(env.PILO_WAIT_SECONDS);
  return Number.isFinite(asked) && asked > 0 ? Math.min(Math.max(Math.round(asked), 5), 90) : 40;
}
var NEAR_WAIT_S = 8;
var MORE_WAIT_S = 12;
var GIVE_UP_MS = 15e4;
function questionOf(intentName, heard) {
  const rest = String(heard ?? "").replace(/\s+/g, " ").trim();
  if (!rest) return "";
  const word = QUESTION_WORD[intentName] ?? "";
  return word ? `¿${word} ${rest}?` : rest;
}
async function sayWhileWorking(envelope) {
  var _a;
  const { apiEndpoint, apiAccessToken } = ((_a = envelope.context) == null ? void 0 : _a.System) ?? {};
  if (!apiEndpoint || !apiAccessToken) return;
  try {
    await netFetch(`${apiEndpoint}/v1/directives`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiAccessToken}` },
      body: JSON.stringify({ header: { requestId: envelope.request.requestId }, directive: { type: "VoicePlayer.Speak", speech: "Déjeme revisar." } }),
      signal: timeoutSignal(1500)
    });
  } catch {
  }
}
var isIntent = (input, ...names) => import_ask_sdk_core.default.getRequestType(input.requestEnvelope) === "IntentRequest" && names.includes(import_ask_sdk_core.default.getIntentName(input.requestEnvelope));
var reply = (input, speech, { reprompt = AGAIN, card, remember = true } = {}) => {
  const session = input.attributesManager.getSessionAttributes();
  if (remember) session.last = speech;
  input.attributesManager.setSessionAttributes(session);
  const builder2 = input.responseBuilder.speak(speech).reprompt(reprompt);
  if (card) builder2.withSimpleCard(TITLE, card);
  return builder2.getResponse();
};
var drop = (input) => {
  const session = input.attributesManager.getSessionAttributes();
  delete session.pending;
  input.attributesManager.setSessionAttributes(session);
};
var waitReply = (input, opening, seconds) => reply(input, `${waitSpeech(opening, seconds)} ${READY}`, { reprompt: READY_HOW, remember: false });
function answerReply(input, answer, question) {
  drop(input);
  const { speech, cut } = toSpeech(answer.text);
  if (!speech) return reply(input, "No encontré qué responderle. ¿Me la hace de otra forma?");
  const session = input.attributesManager.getSessionAttributes();
  const turns = Array.isArray(session.turns) ? session.turns : [];
  session.turns = [...turns, { q: answer.asked || question, a: toPlain(answer.text) }].slice(-MAX_TURNS);
  input.attributesManager.setSessionAttributes(session);
  const more = cut ? " Hay más detalle en la aplicación de Alexa y en Pregúntele a Pilo." : "";
  return reply(input, `${speech}${more} ${AGAIN}`, { card: cardText(answer.text, answer.sources) });
}
var LaunchHandler = {
  canHandle: (input) => import_ask_sdk_core.default.getRequestType(input.requestEnvelope) === "LaunchRequest",
  handle: (input) => reply(input, "Hola, soy Pilo, la inteligencia artificial de la Universidad de Santander. ¿Qué quiere saber?", { reprompt: HOW })
};
var AskHandler = {
  canHandle: (input) => isIntent(input, ...Object.keys(QUESTION_WORD)),
  async handle(input) {
    const envelope = input.requestEnvelope;
    const question = questionOf(import_ask_sdk_core.default.getIntentName(envelope), import_ask_sdk_core.default.getSlotValue(envelope, "consulta"));
    if (question.length < 2) return reply(input, `No alcancé a oír la pregunta. ${HOW}`, { reprompt: HOW });
    drop(input);
    const session = input.attributesManager.getSessionAttributes();
    const turns = Array.isArray(session.turns) ? session.turns : [];
    const ticket = (0, import_node_crypto.randomUUID)();
    const [answer] = await Promise.all([askPilo({ question, history: turns, ticket }), sayWhileWorking(envelope)]);
    if (answer.status === "error") return reply(input, escapeSsml(answer.message));
    if (answer.status === "waiting") {
      session.pending = { ticket, question, at: Date.now() };
      input.attributesManager.setSessionAttributes(session);
      return answer.writing ? waitReply(input, "Ya casi la tengo.", NEAR_WAIT_S) : waitReply(input, "Esa me toma cerca de un minuto. Ya se la busco.", firstWait());
    }
    return answerReply(input, answer, question);
  }
};
var CollectHandler = {
  canHandle: (input) => {
    var _a;
    return Boolean((_a = input.attributesManager.getSessionAttributes().pending) == null ? void 0 : _a.ticket) && isIntent(input, "AMAZON.YesIntent", "AMAZON.RepeatIntent", "AMAZON.FallbackIntent");
  },
  async handle(input) {
    const { pending } = input.attributesManager.getSessionAttributes();
    const answer = await collectPilo({ ticket: pending.ticket });
    if (answer.status === "done") return answerReply(input, answer, pending.question);
    if (answer.status === "waiting" && Date.now() - Number(pending.at) < GIVE_UP_MS) return waitReply(input, "Todavía la estoy redactando.", MORE_WAIT_S);
    drop(input);
    return reply(input, answer.status === "error" ? escapeSsml(answer.message) : TOO_SLOW);
  }
};
var NoHandler = {
  canHandle: (input) => isIntent(input, "AMAZON.NoIntent"),
  handle(input) {
    if (!input.attributesManager.getSessionAttributes().pending) return input.responseBuilder.speak("Hasta luego.").withShouldEndSession(true).getResponse();
    drop(input);
    return reply(input, `Está bien, la dejo ahí. ${AGAIN}`);
  }
};
var RepeatHandler = {
  canHandle: (input) => isIntent(input, "AMAZON.RepeatIntent"),
  handle: (input) => reply(input, input.attributesManager.getSessionAttributes().last || `Todavía no le he dicho nada. ${HOW}`)
};
var HelpHandler = {
  canHandle: (input) => isIntent(input, "AMAZON.HelpIntent"),
  handle: (input) => reply(input, `Respondo con lo que publica la Universidad de Santander, y le digo cuando algo no lo sé. ${HOW}`, { reprompt: HOW })
};
var FallbackHandler = {
  canHandle: (input) => isIntent(input, "AMAZON.FallbackIntent", "AMAZON.YesIntent"),
  handle: (input) => reply(input, `No le entendí. ${HOW}`, { reprompt: HOW })
};
var StopHandler = {
  canHandle: (input) => isIntent(input, "AMAZON.CancelIntent", "AMAZON.StopIntent", "AMAZON.NavigateHomeIntent"),
  handle: (input) => input.responseBuilder.speak("Hasta luego.").withShouldEndSession(true).getResponse()
};
var SessionEndedHandler = {
  canHandle: (input) => import_ask_sdk_core.default.getRequestType(input.requestEnvelope) === "SessionEndedRequest",
  handle: (input) => input.responseBuilder.getResponse()
};
var ErrorHandler = {
  canHandle: () => true,
  handle(input, error) {
    console.error("skill", error);
    return input.responseBuilder.speak("Tuve un problema al responder. Intente de nuevo.").reprompt(AGAIN).getResponse();
  }
};
var builder = import_ask_sdk_core.default.SkillBuilders.custom().addRequestHandlers(LaunchHandler, AskHandler, CollectHandler, NoHandler, RepeatHandler, HelpHandler, FallbackHandler, StopHandler, SessionEndedHandler).addErrorHandlers(ErrorHandler);
if (process.env.ALEXA_SKILL_ID) builder.withSkillId(process.env.ALEXA_SKILL_ID);
var handler = builder.lambda();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  QUESTION_WORD,
  firstWait,
  handler,
  questionOf
});
