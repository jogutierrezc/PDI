/* =============================================================================
   Mr. Pilo en Alexa · la skill.

   «Alexa, abre mister pilo» → Pilo saluda y espera la pregunta.
   «Alexa, pregúntale a mister pilo cuántos estudiantes tiene la universidad».

   La pregunta llega en un intent con un solo hueco de texto libre
   (AMAZON.SearchQuery), que Alexa exige acompañar de una palabra fija. Hay un
   intent para las de entrada neutras («dime…», «quiero saber…») y uno por cada
   palabra interrogativa («qué…», «cuántos…»): así la palabra no se pierde y se
   le devuelve a la pregunta antes de mandársela a Pilo (QUESTION_WORD).

   Quien responde es la función pilo-ia del portal (pilo.js), y lo dice la voz
   de Alexa. La conversación de la sesión viaja con cada pregunta, para que
   «¿y en 2023?» se entienda.

   La espera. Alexa da 8 segundos por turno y a Pilo redactar le toma más. Si
   la respuesta no alcanza a llegar, Pilo sigue redactando (pilo.js, 0128) y
   Alexa llena la espera hablando: avisa, hace pausas y al final pregunta
   «¿Le digo lo que encontré?». Con el «sí» empieza otro turno, que recoge la
   respuesta ya escrita. Alexa no deja a una skill hablar sin que la persona
   diga algo, así que ese «sí» no se puede ahorrar.
   ========================================================================== */

import "./config.js";
import { randomUUID } from "node:crypto";
import Alexa from "ask-sdk-core";
import { netFetch, timeoutSignal } from "./http.js";
import { askPilo, collectPilo } from "./pilo.js";
import { cardText, escapeSsml, toPlain, toSpeech, waitSpeech } from "./speech.js";

/** El intent de cada palabra interrogativa: lo que Alexa quita, aquí se repone. */
export const QUESTION_WORD = {
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
  PreguntaPorQueIntent: "por qué",
};

const TITLE = "Mr. Pilo";
const AGAIN = "¿Qué más quiere saber?";
const HOW = "Empiece su pregunta con «dime» o «quiero saber»; por ejemplo: dime cuántos programas tiene la universidad.";
const READY = "¿Le digo lo que encontré?";
const READY_HOW = "Diga sí para oír la respuesta, o hágame otra pregunta.";
const TOO_SLOW = "Esa pregunta me pide más tiempo del que tengo aquí. Hágamela de nuevo, o búsquela en Pregúntele a Pilo, en el portal de Planeación.";
const MAX_TURNS = 3;

/**
 * Cuánto habla Alexa mientras Pilo redacta, en segundos. La primera espera se
 * ajusta con PILO_WAIT_SECONDS a lo que tarde el modelo de Pilo (40 de
 * partida: hoy redactar le toma cerca de un minuto, y el turno ya gastó 7).
 */
export function firstWait(env = process.env) {
  const asked = Number(env.PILO_WAIT_SECONDS);
  return Number.isFinite(asked) && asked > 0 ? Math.min(Math.max(Math.round(asked), 5), 90) : 40;
}
/** Si Pilo ya había empezado a escribir, falta poco. */
const NEAR_WAIT_S = 8;
/** Si al recoger aún no está, otra espera corta. */
const MORE_WAIT_S = 12;
/** Pasado esto desde la pregunta, Pilo ya no va a responder: el servidor corta la redacción antes. */
const GIVE_UP_MS = 150_000;

/** La pregunta como la dijo la persona: la palabra interrogativa, si la hubo, y lo que siguió. */
export function questionOf(intentName, heard) {
  const rest = String(heard ?? "").replace(/\s+/g, " ").trim();
  if (!rest) return "";
  const word = QUESTION_WORD[intentName] ?? "";
  return word ? `¿${word} ${rest}?` : rest;
}

/** Mientras Pilo busca, Alexa dice algo: así los segundos de espera no son silencio. No cambia el plazo. */
async function sayWhileWorking(envelope) {
  const { apiEndpoint, apiAccessToken } = envelope.context?.System ?? {};
  if (!apiEndpoint || !apiAccessToken) return;
  try {
    await netFetch(`${apiEndpoint}/v1/directives`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiAccessToken}` },
      body: JSON.stringify({ header: { requestId: envelope.request.requestId }, directive: { type: "VoicePlayer.Speak", speech: "Déjeme revisar." } }),
      signal: timeoutSignal(1500),
    });
  } catch {
    /* si no se pudo avisar, la respuesta llega igual */
  }
}

const isIntent = (input, ...names) => Alexa.getRequestType(input.requestEnvelope) === "IntentRequest" && names.includes(Alexa.getIntentName(input.requestEnvelope));

/** `remember: false` para lo que no vale la pena repetir (la espera). */
const reply = (input, speech, { reprompt = AGAIN, card, remember = true } = {}) => {
  const session = input.attributesManager.getSessionAttributes();
  if (remember) session.last = speech;
  input.attributesManager.setSessionAttributes(session);
  const builder = input.responseBuilder.speak(speech).reprompt(reprompt);
  if (card) builder.withSimpleCard(TITLE, card);
  return builder.getResponse();
};

/** La pregunta que quedó esperando deja de esperarse. */
const drop = (input) => {
  const session = input.attributesManager.getSessionAttributes();
  delete session.pending;
  input.attributesManager.setSessionAttributes(session);
};

/** Alexa llena la espera y pregunta si ya dice la respuesta. */
const waitReply = (input, opening, seconds) => reply(input, `${waitSpeech(opening, seconds)} ${READY}`, { reprompt: READY_HOW, remember: false });

/** Una respuesta completa de Pilo: se dice, entra a la conversación y va a la tarjeta. */
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

const LaunchHandler = {
  canHandle: (input) => Alexa.getRequestType(input.requestEnvelope) === "LaunchRequest",
  handle: (input) => reply(input, "Hola, soy Pilo, la inteligencia artificial de la Universidad de Santander. ¿Qué quiere saber?", { reprompt: HOW }),
};

const AskHandler = {
  canHandle: (input) => isIntent(input, ...Object.keys(QUESTION_WORD)),
  async handle(input) {
    const envelope = input.requestEnvelope;
    const question = questionOf(Alexa.getIntentName(envelope), Alexa.getSlotValue(envelope, "consulta"));
    if (question.length < 2) return reply(input, `No alcancé a oír la pregunta. ${HOW}`, { reprompt: HOW });

    // Una pregunta nueva reemplaza a la que estuviera esperando.
    drop(input);
    const session = input.attributesManager.getSessionAttributes();
    const turns = Array.isArray(session.turns) ? session.turns : [];
    const ticket = randomUUID();
    const [answer] = await Promise.all([askPilo({ question, history: turns, ticket }), sayWhileWorking(envelope)]);

    if (answer.status === "error") return reply(input, escapeSsml(answer.message));
    if (answer.status === "waiting") {
      session.pending = { ticket, question, at: Date.now() };
      input.attributesManager.setSessionAttributes(session);
      return answer.writing ? waitReply(input, "Ya casi la tengo.", NEAR_WAIT_S) : waitReply(input, "Esa me toma cerca de un minuto. Ya se la busco.", firstWait());
    }
    return answerReply(input, answer, question);
  },
};

/** Hay una pregunta esperando y la persona dijo «sí» (o algo que no es otra pregunta): se recoge la respuesta. */
const CollectHandler = {
  canHandle: (input) => Boolean(input.attributesManager.getSessionAttributes().pending?.ticket) && isIntent(input, "AMAZON.YesIntent", "AMAZON.RepeatIntent", "AMAZON.FallbackIntent"),
  async handle(input) {
    const { pending } = input.attributesManager.getSessionAttributes();
    const answer = await collectPilo({ ticket: pending.ticket });
    if (answer.status === "done") return answerReply(input, answer, pending.question);
    if (answer.status === "waiting" && Date.now() - Number(pending.at) < GIVE_UP_MS) return waitReply(input, "Todavía la estoy redactando.", MORE_WAIT_S);
    drop(input);
    return reply(input, answer.status === "error" ? escapeSsml(answer.message) : TOO_SLOW);
  },
};

const NoHandler = {
  canHandle: (input) => isIntent(input, "AMAZON.NoIntent"),
  handle(input) {
    if (!input.attributesManager.getSessionAttributes().pending) return input.responseBuilder.speak("Hasta luego.").withShouldEndSession(true).getResponse();
    drop(input);
    return reply(input, `Está bien, la dejo ahí. ${AGAIN}`);
  },
};

const RepeatHandler = {
  canHandle: (input) => isIntent(input, "AMAZON.RepeatIntent"),
  handle: (input) => reply(input, input.attributesManager.getSessionAttributes().last || `Todavía no le he dicho nada. ${HOW}`),
};

const HelpHandler = {
  canHandle: (input) => isIntent(input, "AMAZON.HelpIntent"),
  handle: (input) => reply(input, `Respondo con lo que publica la Universidad de Santander, y le digo cuando algo no lo sé. ${HOW}`, { reprompt: HOW }),
};

const FallbackHandler = {
  canHandle: (input) => isIntent(input, "AMAZON.FallbackIntent", "AMAZON.YesIntent"),
  handle: (input) => reply(input, `No le entendí. ${HOW}`, { reprompt: HOW }),
};

const StopHandler = {
  canHandle: (input) => isIntent(input, "AMAZON.CancelIntent", "AMAZON.StopIntent", "AMAZON.NavigateHomeIntent"),
  handle: (input) => input.responseBuilder.speak("Hasta luego.").withShouldEndSession(true).getResponse(),
};

const SessionEndedHandler = {
  canHandle: (input) => Alexa.getRequestType(input.requestEnvelope) === "SessionEndedRequest",
  handle: (input) => input.responseBuilder.getResponse(),
};

const ErrorHandler = {
  canHandle: () => true,
  handle(input, error) {
    console.error("skill", error);
    return input.responseBuilder.speak("Tuve un problema al responder. Intente de nuevo.").reprompt(AGAIN).getResponse();
  },
};

const builder = Alexa.SkillBuilders.custom()
  .addRequestHandlers(LaunchHandler, AskHandler, CollectHandler, NoHandler, RepeatHandler, HelpHandler, FallbackHandler, StopHandler, SessionEndedHandler)
  .addErrorHandlers(ErrorHandler);

// Con ALEXA_SKILL_ID, la Lambda solo atiende a esta skill.
if (process.env.ALEXA_SKILL_ID) builder.withSkillId(process.env.ALEXA_SKILL_ID);

export const handler = builder.lambda();
