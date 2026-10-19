/* =============================================================================
   Intranet · Mr. Pilo con IA · ElevenLabs (0172): lo que la pantalla de Voz
   le pide al servidor. La clave nunca pasa por aquí: vive en la tabla de
   claves y solo la función pilo-ia la usa.
   ========================================================================== */

import { supabase, readFunctionError } from "../../../lib/supabase";
import { probeVoice } from "../../../components/pilo/ai/client";

/** Los modelos de ElevenLabs, como los explica la pantalla. */
export const ELEVEN_MODEL_LABEL: Record<string, string> = {
  eleven_v3: "Eleven v3 · emociones con etiquetas, hasta 5 000 caracteres",
  eleven_v4: "Eleven v4 · el más expresivo, hasta 10 000 caracteres",
  eleven_multilingual_v2: "Multilingual v2 · estable en textos largos (sin etiquetas)",
  eleven_flash_v2_5: "Flash v2.5 · el más rápido y barato (sin etiquetas)",
};

export const ELEVEN_FORMAT_LABEL: Record<string, string> = {
  mp3_22050_32: "MP3 22 kHz · 32 kbps (liviano)",
  mp3_24000_48: "MP3 24 kHz · 48 kbps",
  mp3_44100_32: "MP3 44 kHz · 32 kbps",
  mp3_44100_64: "MP3 44 kHz · 64 kbps",
  mp3_44100_96: "MP3 44 kHz · 96 kbps",
  mp3_44100_128: "MP3 44 kHz · 128 kbps (de partida)",
};

/** Las emociones que se pueden oír en «Probar emociones» (el valor es el nombre que entiende el servidor). */
export const EMOTION_CHOICES: [value: string, label: string][] = [
  ["emocionado", "Emocionado"],
  ["alegre", "Alegre"],
  ["atento", "Atento"],
  ["atrevido", "Atrevido, pícaro"],
  ["cuidado", "Cuidado, advertencia"],
  ["pensar", "Pensativo"],
  ["susurro", "Susurro"],
  ["risa", "Risa"],
  ["suspiro", "Suspiro"],
  ["ironico", "Irónico"],
  ["somnoliento", "Somnoliento"],
  ["grito", "Grito de entusiasmo"],
  ["tranquilo", "Tranquilo"],
  ["calido", "Cálido"],
  ["seguro", "Seguro"],
  ["neutro", "Sin emoción"],
];

export const EMOTION_LINE = "Hola, soy Mr. Pilo. Hoy tengo una noticia sobre la Universidad de Santander.";

export const SING_STYLE_CHOICES: [value: string, label: string][] = [
  ["jingle", "Jingle alegre"],
  ["cumpleanos", "Cumpleaños festivo"],
  ["saludo", "Saludo cantado"],
  ["balada", "Balada suave"],
  ["pop", "Pop"],
  ["folclor", "Folclor acústico"],
  ["infantil", "Infantil"],
];

export const SING_LANG_CHOICES: [value: string, label: string][] = [
  ["es", "Español"],
  ["en", "Inglés"],
  ["pt", "Portugués"],
];

/** El aviso de costo que va en el panel. */
export const COST_NOTICE =
  "ElevenLabs cobra por caracteres (créditos del plan) y su API de música es solo de planes de pago. Lo ya dicho se guarda en la caché y no vuelve a gastar; las pruebas sí gastan. Cantar usa más créditos que leer: póngale un tope diario.";

export interface ElevenStatus {
  ok: boolean;
  error?: string;
  tier?: string;
  status?: string;
  used?: number;
  limit?: number;
  reset?: number | null;
  limited?: boolean;
}

export interface ElevenVoiceItem {
  id: string;
  name: string;
  category: string;
  detail: string;
  preview: string;
}

/** Lo que dice el servidor del uso del mes; lo que no se entiende queda sin decir. */
export function parseStatus(raw: unknown): ElevenStatus {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: ElevenStatus = { ok: r.ok === true };
  if (typeof r.error === "string") out.error = r.error;
  if (typeof r.tier === "string") out.tier = r.tier;
  if (typeof r.status === "string") out.status = r.status;
  if (typeof r.used === "number") out.used = r.used;
  if (typeof r.limit === "number") out.limit = r.limit;
  if (typeof r.reset === "number") out.reset = r.reset;
  if (r.limited === true) out.limited = true;
  return out;
}

export function parseVoices(raw: unknown): ElevenVoiceItem[] {
  const list = (raw && typeof raw === "object" ? (raw as { voices?: unknown }).voices : null) as unknown;
  if (!Array.isArray(list)) return [];
  return list.flatMap((v) => {
    const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const id = typeof r.id === "string" && /^[A-Za-z0-9]{10,40}$/.test(r.id) ? r.id : "";
    if (!id) return [];
    return [{ id, name: String(r.name ?? "").slice(0, 60) || id, category: String(r.category ?? ""), detail: String(r.detail ?? ""), preview: typeof r.preview === "string" && r.preview.startsWith("https://") ? r.preview : "" }];
  });
}

/** «Ha usado 12 340 de 100 000 caracteres (12 %); se reinicia el 3 nov.» */
export function usageLine(s: ElevenStatus): string {
  if (!s.ok) return s.error ?? "No se pudo leer el uso.";
  const parts: string[] = [];
  if (s.tier) parts.push(`Plan ${s.tier}`);
  if (typeof s.used === "number" && typeof s.limit === "number" && s.limit > 0) {
    parts.push(`usó ${s.used.toLocaleString("es-CO")} de ${s.limit.toLocaleString("es-CO")} caracteres (${Math.round((s.used / s.limit) * 100)} %)`);
  }
  if (typeof s.reset === "number") parts.push(`se reinicia el ${new Date(s.reset * 1000).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}`);
  return parts.length ? `${parts.join(" · ")}.` : "La conexión funciona.";
}

async function ask<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("pilo-ia", { body: { action: "voz", portal: "prueba", ...body } });
  if (error) throw new Error((await readFunctionError(error)) ?? "No pude hablar con Mr. Pilo ahora.");
  return data as T;
}

/** «Probar la conexión» con ElevenLabs: lee la suscripción (solo lectura). */
export async function elevenStatus(): Promise<ElevenStatus> {
  try {
    return parseStatus(await ask<unknown>({ eleven: "estado" }));
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function elevenVoices(search = ""): Promise<ElevenVoiceItem[]> {
  return parseVoices(await ask<unknown>({ eleven: "voces", ...(search ? { search } : {}) }));
}

/** Oír una frase con una emoción (con lo guardado en el servidor). */
export const tryEmotion = (text: string, emotion: string, style?: string) => probeVoice(text, style, emotion);

export interface SingInput {
  letra: string;
  tema: string;
  estilo: string;
  idioma: string;
  modo: "voz" | "musica";
}

/** Pide la canción; devuelve el audio o por qué no se pudo. */
export async function singSong(input: SingInput): Promise<{ audio: Blob; ms: number } | { error: string }> {
  const started = performance.now();
  const { data, error } = await supabase.functions.invoke<Blob>("pilo-ia", { body: { action: "cantar", portal: "prueba", ...input } });
  if (error) return { error: (await readFunctionError(error)) ?? "No pude hablar con Mr. Pilo ahora." };
  if (!(data instanceof Blob) || data.size === 0) return { error: "El servicio no devolvió audio." };
  return { audio: data, ms: Math.round(performance.now() - started) };
}
