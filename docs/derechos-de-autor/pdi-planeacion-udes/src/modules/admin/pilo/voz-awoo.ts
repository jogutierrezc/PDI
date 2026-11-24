/* =============================================================================
   Intranet · Mr. Pilo · la voz del modo secreto «AWOO» (Pregúntele a Pilo).

   AWOO es un personaje ORIGINAL: Pilo en modo reguetonero paisa. Su voz no
   imita ni clona a ninguna persona: se DISEÑA con palabras en ElevenLabs
   («voice design») y se guarda como el estilo de voz «Awoo». La página lo
   encuentra por el NOMBRE del estilo (styleForMode en logic.ts), igual que
   «Pilonaitor».

   Aquí vive el perfil (descripción, muestra, parámetros, emociones) y lo que la
   pantalla «Diseñar la voz de un modo» le pide al servidor (voz-diseno.ts).
   La clave de ElevenLabs nunca pasa por aquí.

   Cómo se traducen las emociones del modo a ElevenLabs: NO se duplica la tabla.
   El servidor ya traduce el tono de cada frase con `emotionsOf` y `tagsOf`
   (supabase/functions/pilo-ia/elevenlabs.ts); allí se añadieron los alias
   authoritative, rhythmic, energetic y hype. AWOO_EMOTIONS solo lo cuenta para
   la pantalla.
   ========================================================================== */

import { supabase, readFunctionError } from "../../../lib/supabase";
import type { VoiceStyle } from "../../../components/pilo/ai/logic";
import { styleId } from "./voice-sample";

/** El nombre del estilo de voz con que la página reconoce el modo. */
export const AWOO_STYLE_NAME = "Awoo";

/** La descripción de la voz, valor inicial del diseñador (editable). */
export const AWOO_DESCRIPTION =
  "Hombre joven colombiano de Medellín, acento paisa claro, voz de artista urbano de reguetón: cálida, carismática y con mucha energía, ritmo ágil y juguetón, entonación melódica con pausas cortas antes de los remates, sonrisa en la voz, sin gritar demasiado salvo en el grito de guerra. Dicción comprensible para una universidad.";

/** El primer saludo del modo, sin las etiquetas por frase (texto de muestra, 100 a 1 000 caracteres). */
export const AWOO_SAMPLE =
  "¡Aquí Pilo Castro, The King Cóndor, pues! El mero mero del campus, la verdadera bestia... ¿Sí saaa-be, parce? Directo desde el nido en la U-DES, activando el modo bien fachero pa' toda la pipol que le mete berraquera.";

/** Los parámetros del modo. `tone` es el tono del estilo; `rate` y `pitch` los aplica la página al hablar. */
export const AWOO_PARAMS = { tone: "excited", rate: 1.04, pitch: 1.0 } as const;

/** El grito de guerra: sale con la emoción «shouting». */
export const AWOO_SHOUT = { text: "¡Awoo!", tone: "shouting" } as const;

/**
 * Las emociones por frase del saludo y lo que el servidor hace con ellas
 * (emoción interna y etiqueta de audio de ElevenLabs con Eleven v3 o v4; los
 * modelos sin etiquetas ajustan estabilidad, estilo y velocidad).
 */
export const AWOO_EMOTIONS: { tone: string; emotion: string; tag: string }[] = [
  { tone: "confident", emotion: "seguro", tag: "" },
  { tone: "authoritative", emotion: "seguro", tag: "" },
  { tone: "proud", emotion: "orgullo", tag: "" },
  { tone: "relaxed", emotion: "tranquilo", tag: "" },
  { tone: "rhythmic", emotion: "alegre", tag: "[excited]" },
  { tone: "energetic", emotion: "emocionado", tag: "[excited]" },
  { tone: "hype", emotion: "grito", tag: "[excited]" },
  { tone: "shouting", emotion: "grito", tag: "[excited]" },
];

/** El perfil completo, para quien lo necesite en un solo objeto. */
export const AWOO_PROFILE = {
  name: AWOO_STYLE_NAME,
  description: AWOO_DESCRIPTION,
  sample: AWOO_SAMPLE,
  params: AWOO_PARAMS,
  shout: AWOO_SHOUT,
  emotions: AWOO_EMOTIONS,
} as const;

/** Los topes que también hace cumplir el servidor. */
export const DESIGN_LIMITS = { descMin: 20, descMax: 1000, textMin: 100, textMax: 1000 } as const;

export interface VoiceCandidate {
  id: string;
  /** Audio MP3 en base64. */
  audio: string;
  seconds: number;
}

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Lo que dice el servidor de los candidatos; lo que no se entiende queda fuera. */
export function parseCandidates(raw: unknown): VoiceCandidate[] {
  const list = (raw && typeof raw === "object" ? (raw as { candidates?: unknown }).candidates : null) as unknown;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 3).flatMap((c) => {
    const r = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const id = typeof r.id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(r.id) ? r.id : "";
    const audio = typeof r.audio === "string" && /^[A-Za-z0-9+/=]+$/.test(r.audio) ? r.audio : "";
    if (!id || !audio) return [];
    return [{ id, audio, seconds: typeof r.seconds === "number" ? r.seconds : 0 }];
  });
}

/** Valida lo mismo que el servidor antes de gastar un pedido; devuelve el motivo o null. */
export function designProblem(description: string, text: string): string | null {
  const d = description.trim().length;
  const t = text.trim().length;
  if (d < DESIGN_LIMITS.descMin || d > DESIGN_LIMITS.descMax) return `La descripción va de ${DESIGN_LIMITS.descMin} a ${DESIGN_LIMITS.descMax} caracteres (tiene ${d}).`;
  if (t < DESIGN_LIMITS.textMin || t > DESIGN_LIMITS.textMax) return `El texto de muestra va de ${DESIGN_LIMITS.textMin} a ${DESIGN_LIMITS.textMax} caracteres (tiene ${t}).`;
  return null;
}

/** El estilo «Awoo» con la voz elegida: si ya existe se actualiza su voz; si no, se agrega. Solo texto y números. */
export function withAwooStyle(styles: VoiceStyle[], voiceId: string): VoiceStyle[] {
  const at = styles.findIndex((s) => fold(s.name) === fold(AWOO_STYLE_NAME));
  if (at >= 0) return styles.map((s, i) => (i === at ? { ...s, eleven_id: voiceId, tone: s.tone || AWOO_PARAMS.tone } : s));
  const style: VoiceStyle = { id: styleId(AWOO_STYLE_NAME, styles.map((s) => s.id)), name: AWOO_STYLE_NAME, path: "", seconds: 0, eleven_id: voiceId, tone: AWOO_PARAMS.tone };
  return [...styles, style];
}

async function ask<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("pilo-ia", { body: { action: "voz", portal: "prueba", ...body } });
  if (error) throw new Error((await readFunctionError(error)) ?? "No pude hablar con Mr. Pilo ahora.");
  return data as T;
}

/** «Crear candidatos»: la descripción y la muestra viajan al servidor, que habla con ElevenLabs. */
export async function designVoices(description: string, text: string): Promise<VoiceCandidate[]> {
  return parseCandidates(await ask<unknown>({ eleven: "disenar", description: description.trim(), text: text.trim() }));
}

/** «Usar esta»: guarda el candidato en la cuenta de ElevenLabs y devuelve el id de la voz. */
export async function saveDesignedVoice(candidateId: string, description: string, name = AWOO_STYLE_NAME): Promise<string> {
  const r = (await ask<unknown>({ eleven: "guardar", generated_voice_id: candidateId, description: description.trim(), name })) as { voice_id?: unknown };
  const id = typeof r?.voice_id === "string" && /^[A-Za-z0-9]{10,40}$/.test(r.voice_id) ? r.voice_id : "";
  if (!id) throw new Error("ElevenLabs no devolvió el id de la voz.");
  return id;
}
