/* =============================================================================
   Pregúntele a Pilo · cantar en el chat (0172).

   Pilo canta composiciones originales con ElevenLabs (Voz › «Hacer cantar a
   Pilo» en la administración). Desde aquí también se le puede pedir por chat:
   la app (/app) detecta el pedido en la pregunta, lo manda a la acción
   «cantar» de la función y muestra el audio en el turno.

   Qué detecta: una pregunta que empiece por «canta…» / «cántame…». De ahí
   saca, sin llamar al servidor:

     · el estilo   (jingle, cumpleaños, saludo, balada, pop, folclor,
                   infantil; si no, jingle);
     · el idioma   (inglés, portugués; si no, español);
     · el modo     «con tu voz» y una letra (o «letra: …») cantan la letra con
                   la voz de Pilo; lo demás va con música (Eleven Music), que
                   compone y canta sobre el tema;
     · el tema     lo que quede de la frase (sin el pedido, el estilo ni la
                   letra); si no queda nada, la Universidad.

   Las reglas de verdad (nada de música ajena, límites, permisos por espacio
   `sing_aud`, letra sin etiquetas) las aplica el servidor, que responde con
   el audio o con el error en español.
   ========================================================================== */

import { readFunctionError, supabase } from "../../lib/supabase";

/** Los estilos que acepta el servidor (elevenlabs.ts), con la palabra que los nombra en el chat. */
export const SONG_STYLES: Record<string, RegExp> = {
  jingle: /\bjingle?s?\b|\beslogan\b/i,
  cumpleanos: /\bcumplea[nñ]os\b|\bcumple\b|\bbirthday\b/i,
  saludo: /\bsaludo\b|\bbienvenida\b|\bgracias\b/i,
  balada: /\bbalada\b|\brom[aá]ntic[ao]s?\b/i,
  pop: /\bpop\b/i,
  folclor: /\bfolclor\b|\bfolklor\b|\bbambuco\b|\bt[ií]pic[ao]s?\b/i,
  infantil: /\binfantil\b|\bni[nñ]o?s?\b|\bni[nñ]as?\b/i,
};
export type SongStyle = "jingle" | "cumpleanos" | "saludo" | "balada" | "pop" | "folclor" | "infantil";

export interface SongRequest {
  letra: string;
  tema: string;
  estilo: SongStyle;
  idioma: "es" | "en" | "pt";
  modo: "voz" | "musica";
}

/** ¿La pregunta es un pedido de cantar? */
const IS_SING = /^\W{0,3}(?:oye[,\s]+|pil[oó][,\s]+)?(?:canta|c[aá]ntame)\b/i;

const sinAcentos = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Lee el pedido de cantar de una pregunta del chat. null si no lo es. Lo que no
 * se entiende queda en los valores de partida; las reglas de contenido las
 * revisa el servidor.
 */
export function singRequestOf(raw: string): SongRequest | null {
  const q = raw.replace(/\s+/g, " ").trim();
  if (!IS_SING.test(q)) return null;
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // «letra: …» o «con esta letra: …» canta lo que viene después.
  const afterLyrics = /(?:^|\W)(?:letra|con esta letra)\s*:/i.exec(raw);
  let modo: SongRequest["modo"] = "musica";
  let letra = "";
  if (afterLyrics) {
    letra = raw.slice(afterLyrics.index + afterLyrics[0].length).trim();
  } else if (lines.length > 1) {
    letra = lines.slice(1).join("\n");
  }
  if (letra) modo = "voz";
  if (/\bcon (?:tu )?voz\b/i.test(q)) modo = "voz";
  if (/\bcon m[uú]sica\b|\bsolo m[uú]sica\b/i.test(q)) modo = "musica";

  const estilo = (Object.keys(SONG_STYLES) as SongStyle[]).find((k) => SONG_STYLES[k].test(q)) ?? "jingle";
  const idioma: SongRequest["idioma"] = /\bingl[eé]s\b|\benglish\b|\bin english\b/i.test(q) ? "en" : /\bportugu[eé]s\b|\bportuguese\b/i.test(q) ? "pt" : "es";

  // El tema es lo que queda del pedido: sin el verbo, el estilo, el idioma ni la letra.
  let tema = q
    .replace(IS_SING, "")
    .replace(/(?:^|\W)(?:letra|con esta letra)\s*:[\s\S]*$/i, "")
    .replace(/\buna? (?=canci[oó]n|jingle|balada|saludo|cumplea[nñ]os|cosa|tema|cancion)/gi, "")
    .replace(/\bcanci[oó]n (?:de|sobre|para)\b/gi, "")
    .replace(/\b(?:de|sobre|para|acerca de)\b/gi, " ")
    .replace(SONG_STYLES[estilo], " ")
    .replace(/\bingl[eé]s\b|\benglish\b|\bin english\b|\bportugu[eé]s\b|\bportuguese\b|\bcon (?:tu )?voz\b|\bcon m[uú]sica\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:¿?¡!]+|[\s,.;:¿?¡!]+$/g, "");
  // Lo que suele quedar delante («un», «en», «la»…) no es parte del tema.
  for (let i = 0; i < 6; i++) tema = tema.replace(/^(?:en|un|una|unos|unas|de|del|sobre|para|el|la|los|las|y|que|algo)\b\s*/i, "").trim();
  tema = tema.slice(0, 200).trim();
  letra = letra
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 1500);

  return { letra, tema: tema || "la Universidad de Santander", estilo, idioma, modo };
}

/**
 * Pide la canción a la función (acción «cantar»). Devuelve el audio o el error
 * en español. No es la vía directa de la voz: cantar solo lo sabe la función.
 */
export async function askSong(portal: string, req: SongRequest): Promise<{ audio: Blob; ms: number } | { error: string }> {
  const started = Date.now();
  const { data, error } = await supabase.functions.invoke<Blob>("pilo-ia", { body: { action: "cantar", portal, ...req } });
  if (error) return { error: (await readFunctionError(error)) ?? "No pude hablar con Mr. Pilo ahora." };
  if (!(data instanceof Blob) || data.size === 0) return { error: "El servicio no devolvió audio." };
  return { audio: data, ms: Date.now() - started };
}

/* --- El audio de un turno ---------------------------------------------------------------------- */

/** El audio de cada canción, por turno: en memoria, porque un enlace de objeto no se puede guardar. */
const songs = new Map<string, string>();

/** La dirección del audio de la canción de este turno, o null si ya no está (p. ej., tras recargar). */
export const songUrlOf = (turnId: string): string | null => songs.get(turnId) ?? null;

/** Guarda el audio de un turno. Las canciones no se reutilizan: cada turno, la suya. */
export function rememberSong(turnId: string, audio: Blob): string {
  const url = URL.createObjectURL(audio);
  songs.set(turnId, url);
  return url;
}
