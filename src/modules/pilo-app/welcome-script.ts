/* =============================================================================
   Mr. Pilo · la app móvil · lo que dice la bienvenida, y con qué voz.

   Pilo se presenta una sola vez por toda la universidad: es «la Inteligencia
   Artificial de la Universidad de Santander», y al final pregunta con cuál de
   sus dos versiones se quiere hablar. Cada frase lleva su cara, su ánimo de
   voz y hacia dónde mira.

   La voz es la oficial y va por el mismo camino que las respuestas: la misma
   acción («voz»), el mismo portal, el mismo estilo y la misma caché
   (client.ts). Lo único que cambia con el ánimo de cada frase es la velocidad
   (modulateVoice), igual que al leer una respuesta. Al texto no se le añade
   nada: lo que se oye es lo que se lee. Si la voz no está disponible no hay
   nada que pedir, y queda el texto: nunca otra voz.

   Puro: se prueba en node.
   ========================================================================== */

import { audioKey, voiceBody } from "../../components/pilo/ai/client";
import { modulateVoice, normalizeMood } from "../../components/pilo/ai/voice-expressions";
import type { MojiMood } from "../../components/pilo/PiloMoji";
import type { AppVoice, Door } from "./access";
import type { SpaceId } from "../pregunta/space";

export interface AppBeat {
  id: "hola" | "preguntar" | "fuente" | "elegir" | "rol";
  say: string;
  /** La cara de Pilo mientras lo dice. */
  face: MojiMood;
  /** El ánimo de la voz (los de voice-expressions) y cómo se le nombra en pantalla. */
  mood: "emocionado" | "atento" | "pensar";
  label: string;
  look: [number, number];
  /** Aquí se elige: no hay «Siguiente» ni avanza sola. */
  pick?: boolean;
}

export const APP_TITLE = "Hola, soy Mr. Pilo";

export const APP_BEATS: AppBeat[] = [
  { id: "hola", say: "¡Hola! Soy Mr. Pilo, la Inteligencia Artificial de la Universidad de Santander.", face: "feliz", mood: "emocionado", label: "Emocionado", look: [0, -0.1] },
  { id: "preguntar", say: "Pregúnteme por la universidad, o hablemos de enseñar y aprender.", face: "feliz", mood: "atento", label: "Atento", look: [0, 0.7] },
  { id: "fuente", say: "Le respondo con lo que la universidad ha publicado y le muestro la fuente.", face: "sorpresa", mood: "pensar", label: "Reflexivo", look: [0.2, 0.8] },
  { id: "elegir", say: "¿Con cuál Pilo quiere hablar hoy?", face: "feliz", mood: "emocionado", label: "Emocionado", look: [0, 0.6], pick: true },
];

/** Solo si se elige Pilo en Enseñanza y ese espacio pregunta el rol. */
export const ROLE_BEAT: AppBeat = { id: "rol", say: "¿Quién pregunta? Así le hablo a su medida.", face: "cuidado", mood: "atento", label: "Atento", look: [0, 0.6], pick: true };

/** Lo que conoce Pilo, para la primera muestra: lo de sus dos versiones. */
export const APP_KNOWS = ["UDES en Cifras", "Plan de Desarrollo", "Impacto", "Innovación educativa", "Políticas"];
export const APP_ASKS = ["¿Qué es el PDI?", "¿Qué es el aprendizaje activo?"];

/**
 * Con qué voz habla la bienvenida: la de la primera versión de Pilo que tenga
 * la voz oficial disponible para esta persona (primero la de la Universidad).
 * null = no hay voz oficial: la bienvenida es solo texto.
 */
export function welcomeVoice(doors: Partial<Record<SpaceId, Pick<Door, "state" | "voice">>>): AppVoice | null {
  for (const space of ["planeacion", "ensenanza"] as const) {
    const door = doors[space];
    if (door && door.state === "abierto" && door.voice.advanced) return door.voice;
  }
  return null;
}

export interface VoiceRequest {
  beat: AppBeat["id"];
  /** Lo que se le pide al servicio: exactamente la frase que se lee en pantalla. */
  text: string;
  portal: AppVoice["portal"];
  /** La velocidad con que suena, según el ánimo de la frase. */
  rate: number;
  /** El cuerpo del pedido y la llave de su audio guardado: los mismos de una respuesta leída. */
  body: ReturnType<typeof voiceBody>;
  key: string;
}

/** Lo que se pide para una frase de la bienvenida. */
export function voiceRequest(beat: AppBeat, voice: AppVoice): VoiceRequest {
  const rate = voice.modulation ? modulateVoice(normalizeMood(beat.mood), voice.rate, voice.pitch).rate : voice.rate;
  return { beat: beat.id, text: beat.say, portal: voice.portal, rate, body: voiceBody(beat.say, voice.portal), key: audioKey(beat.say, voice.portal) };
}

/**
 * Todo lo que la bienvenida pide por adelantado. Sin voz oficial, nada. La
 * pregunta del rol solo se pide si Pilo en Enseñanza la va a hacer.
 */
export function welcomeVoicePlan(voice: AppVoice | null, options: { askRol?: boolean } = {}): VoiceRequest[] {
  if (!voice || !voice.advanced) return [];
  const beats = options.askRol ? [...APP_BEATS, ROLE_BEAT] : APP_BEATS;
  return beats.map((b) => voiceRequest(b, voice));
}
