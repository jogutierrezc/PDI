/* =============================================================================
   Mr. Pilo · la voz de ElevenLabs (0172): lógica pura, sin red ni Deno.

   Vive aparte de index.ts (9 500 líneas) y se importa desde allí y desde las
   pruebas de Vitest (tests/pilo/elevenlabs.test.ts). Lo que habla con la red
   está en elevenlabs-voz.ts.

   Documentación de ElevenLabs consultada el 2026-10-19 (elevenlabs.io/docs):
   - Text to Speech: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
     · cabecera «xi-api-key» · query output_format (por defecto mp3_44100_128;
       mp3_44100_192 exige plan Creator) · cuerpo JSON: text, model_id,
       voice_settings {stability, similarity_boost, style, speed,
       use_speaker_boost}, seed, apply_text_normalization.
   - Modelos y límite de caracteres por pedido: eleven_v3 (5 000), eleven_v4
     (10 000), eleven_multilingual_v2 (10 000), eleven_flash_v2_5 (40 000).
   - Etiquetas de audio (v3 y v4, entre corchetes, antes o después del texto):
     [laughs] [laughs harder] [starts laughing] [whispers] [sighs] [exhales]
     [sarcastic] [curious] [excited] [crying] [mischievously]; experimental:
     [sings]. v3 no admite <break> de SSML. La velocidad va de 0,7 a 1,2.
   - Voces: GET https://api.elevenlabs.io/v2/voices (page_size hasta 100,
     search). Suscripción: GET https://api.elevenlabs.io/v1/user/subscription
     (tier, character_count, character_limit, next_character_count_reset_unix,
     status).
   - Música (Eleven Music): POST https://api.elevenlabs.io/v1/music, cuerpo
     {prompt | composition_plan, music_length_ms 3 000–600 000, model_id
     music_v1 | music_v2 | music_v2_5, force_instrumental}. Solo planes de pago.
     Canta con SU voz: la página no permite elegir una voz (ni la de Pilo).
     Un prompt que nombra a un artista o trae letra con derechos responde
     «bad_prompt» (con una sugerencia).
   - Lo que NO confirmó la documentación consultada: que v3 solo acepte la
     estabilidad en 0 / 0,5 / 1 (se hace así por precaución) y qué códigos de
     error exactos devuelve cada caso (se leen por estado HTTP y por texto).
   ========================================================================== */

export const ELEVEN_API = "https://api.elevenlabs.io";

/** Modelo → [límite de caracteres por pedido, ¿entiende etiquetas de audio?]. */
export const ELEVEN_MODELS = {
  eleven_v3: { limit: 5000, tags: true },
  eleven_v4: { limit: 10000, tags: true },
  eleven_multilingual_v2: { limit: 10000, tags: false },
  eleven_flash_v2_5: { limit: 40000, tags: false },
} as const;
export type ElevenModel = keyof typeof ELEVEN_MODELS;
export const ELEVEN_DEFAULT_MODEL: ElevenModel = "eleven_v3";

/** Solo MP3 (lo que reproducen todos los clientes). mp3_44100_192 exige plan Creator: no se ofrece. */
export const ELEVEN_FORMATS = ["mp3_22050_32", "mp3_24000_48", "mp3_44100_32", "mp3_44100_64", "mp3_44100_96", "mp3_44100_128"] as const;
export const ELEVEN_DEFAULT_FORMAT = "mp3_44100_128";

export const MUSIC_MODEL = "music_v2_5";
export const MUSIC_MIN_MS = 3000;

export const elevenModel = (m: unknown): ElevenModel => ((m as string) in ELEVEN_MODELS ? (m as ElevenModel) : ELEVEN_DEFAULT_MODEL);
export const elevenFormat = (f: unknown): string => ((ELEVEN_FORMATS as readonly string[]).includes(f as string) ? (f as string) : ELEVEN_DEFAULT_FORMAT);

/** El id de una voz (letras y números, 10 a 40); se acepta pegado con espacios. Vacío si no sirve. */
export function elevenVoiceId(input: unknown): string {
  const v = String(input ?? "").trim();
  return /^[A-Za-z0-9]{10,40}$/.test(v) ? v : "";
}

/* --- Texto del usuario o del modelo: nunca etiquetas ---------------------------------------- */

/**
 * Quita del texto todo lo que ElevenLabs podría tomar por una orden: «[...]»
 * (etiquetas de audio), «{...}» (indicaciones de música), «<...>» (SSML) y los
 * signos sueltos. Se aplica a TODO texto antes de poner las etiquetas propias.
 */
export function neutralizeTags(text: string): string {
  let t = String(text ?? "");
  for (let i = 0; i < 4; i++) {
    const next = t.replace(/\[[^\]]*\]|\{[^}]*\}|<[^>]*>/g, " ");
    if (next === t) break;
    t = next;
  }
  return t.replace(/[[\]{}<>]/g, " ").replace(/\s+/g, " ").trim();
}

/* --- Emociones ---------------------------------------------------------------------------------- */

/** Las únicas etiquetas que el servidor pone (lista cerrada). */
export const ELEVEN_TAGS = ["laughs", "laughs harder", "starts laughing", "whispers", "sighs", "exhales", "sarcastic", "curious", "excited", "mischievously", "sings"] as const;
export type ElevenTag = (typeof ELEVEN_TAGS)[number];

export interface Emotion {
  /** Etiquetas de audio (modelos v3 y v4). */
  tags: ElevenTag[];
  /** Ajustes para los modelos sin etiquetas: estabilidad (menor = más expresiva), exageración de estilo y factor de velocidad. */
  stability: number;
  style: number;
  speed: number;
}

/**
 * Tabla de emociones. Mapea el sistema de Pilo (ánimos de voice-expressions.ts:
 * emocionado, atento, atrevido, cuidado, pensar; los tonos cerrados del chat y
 * el «tone» de cada estilo de voz) a ElevenLabs:
 *  - v3 / v4: etiquetas al inicio de la frase («[excited] ¡Claro que sí!»).
 *  - multilingual_v2 / flash: voice_settings (estabilidad baja y estilo alto
 *    para lo emocionado; estabilidad alta y más lento para el cuidado).
 */
export const EMOTIONS = {
  neutro: { tags: [], stability: 0.5, style: 0, speed: 1 },
  emocionado: { tags: ["excited"], stability: 0.3, style: 0.5, speed: 1.05 },
  alegre: { tags: ["excited"], stability: 0.4, style: 0.35, speed: 1.02 },
  atento: { tags: [], stability: 0.6, style: 0.1, speed: 1 },
  atrevido: { tags: ["mischievously"], stability: 0.35, style: 0.45, speed: 1.03 },
  cuidado: { tags: [], stability: 0.7, style: 0.1, speed: 0.95 },
  alarma: { tags: ["excited"], stability: 0.25, style: 0.6, speed: 1.08 },
  pensar: { tags: ["curious"], stability: 0.5, style: 0.2, speed: 0.96 },
  susurro: { tags: ["whispers"], stability: 0.5, style: 0.2, speed: 0.95 },
  risa: { tags: ["laughs"], stability: 0.3, style: 0.5, speed: 1 },
  suspiro: { tags: ["sighs"], stability: 0.5, style: 0.2, speed: 0.95 },
  ironico: { tags: ["sarcastic"], stability: 0.4, style: 0.4, speed: 1 },
  somnoliento: { tags: ["exhales"], stability: 0.7, style: 0.1, speed: 0.9 },
  grito: { tags: ["excited"], stability: 0.2, style: 0.7, speed: 1.08 },
  tranquilo: { tags: [], stability: 0.65, style: 0.1, speed: 0.97 },
  calido: { tags: [], stability: 0.55, style: 0.2, speed: 0.98 },
  seguro: { tags: [], stability: 0.55, style: 0.25, speed: 1 },
  orgullo: { tags: [], stability: 0.45, style: 0.3, speed: 1 },
  monotono: { tags: [], stability: 1, style: 0, speed: 1 },
  canto: { tags: ["sings"], stability: 0.3, style: 0.6, speed: 1 },
} as const satisfies Record<string, Emotion>;
export type EmotionKey = keyof typeof EMOTIONS;
export const EMOTION_KEYS = Object.keys(EMOTIONS) as EmotionKey[];

/** Nombre (sin tildes, en minúsculas) → emoción. Cubre: ánimos de Pilo, tonos cerrados del chat (VOICE_TONES) y tonos de estilo (FISH_TONES). */
const EMOTION_OF: Record<string, EmotionKey> = {
  // Ánimos de voice-expressions.ts (y sus alias en normalizeMood)
  emocionado: "emocionado", feliz: "alegre", alegre: "alegre",
  atento: "atento", atrevido: "atrevido", loco: "atrevido", curioso: "atrevido",
  cuidado: "cuidado", advertencia: "cuidado", alerta: "cuidado",
  pensar: "pensar", duda: "pensar", reflexivo: "pensar",
  // Tonos cerrados del chat (VOICE_TONES)
  "robotic monotone": "monotono", "deep serious voice": "cuidado", "cold calm voice": "tranquilo",
  whispering: "susurro", excited: "emocionado", shouting: "grito", amused: "atrevido", proud: "orgullo",
  playful: "atrevido", alarmed: "alarma", confident: "seguro", worried: "cuidado", warm: "calido",
  laughing: "risa", helpful: "atento", cheerful: "alegre", sighing: "suspiro", sleepy: "somnoliento", singing: "canto",
  // Tonos de los estilos de voz (FISH_TONES)
  calm: "tranquilo", happy: "alegre", empathetic: "calido", curious: "pensar", relaxed: "tranquilo", "soft tone": "calido",
};

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Las emociones de una frase. `input` puede ser la lista del chat
 * («short pause,whispering,modo:sayayin»), un ánimo («emocionado») o el tono de
 * un estilo («calm»); lo desconocido se ignora (nunca llega texto libre a una
 * etiqueta). Hasta dos; la primera manda en los ajustes, y las etiquetas se
 * suman sin repetir. Sin nada conocido: «neutro».
 */
export function emotionsOf(...inputs: unknown[]): EmotionKey[] {
  const found: EmotionKey[] = [];
  for (const input of inputs) {
    if (typeof input !== "string") continue;
    for (const raw of input.split(",")) {
      const name = fold(raw);
      // Cada emoción también se reconoce por su propio nombre (la pantalla «Probar emociones» las manda así).
      const key = EMOTION_OF[name] ?? (name in EMOTIONS ? (name as EmotionKey) : undefined);
      if (key && !found.includes(key)) found.push(key);
    }
  }
  return found.length ? found.slice(0, 2) : ["neutro"];
}

/** Las etiquetas de audio de esas emociones, sin repetir y de la lista cerrada. */
export function tagsOf(keys: EmotionKey[]): ElevenTag[] {
  const out: ElevenTag[] = [];
  for (const k of keys) for (const t of EMOTIONS[k].tags as readonly ElevenTag[]) if (!out.includes(t) && (ELEVEN_TAGS as readonly string[]).includes(t)) out.push(t);
  return out.slice(0, 2);
}

const sentencesOf = (text: string) => (text.match(/[^.!?…]+(?:[.!?…]+["»)]*|$)/g) ?? [text]).map((s) => s.trim()).filter(Boolean);

/**
 * El texto listo para decir. Primero se neutraliza lo que venga de la persona o
 * del modelo; después, solo con un modelo de etiquetas, se antepone la
 * etiqueta propia a la frase (y, en textos largos, cada tres frases). Otros
 * modelos no llevan etiquetas: la emoción va en voice_settings.
 */
export function elevenText(text: string, model: ElevenModel, keys: EmotionKey[]): string {
  const clean = neutralizeTags(text);
  const tags = ELEVEN_MODELS[model].tags ? tagsOf(keys) : [];
  if (!clean || !tags.length) return clean.slice(0, ELEVEN_MODELS[model].limit);
  const head = tags.map((t) => `[${t}]`).join(" ");
  const sentences = sentencesOf(clean);
  const spoken = sentences.map((s, i) => (i === 0 ? `${head} ${s}` : i % 3 === 0 ? `[${tags[0]}] ${s}` : s)).join(" ");
  return spoken.slice(0, ELEVEN_MODELS[model].limit);
}

/* --- voice_settings ----------------------------------------------------------------------------- */

export interface ElevenBase {
  stability: number;
  similarity: number;
  style: number;
  speed: number;
  speakerBoost: boolean;
}
export const ELEVEN_BASE: ElevenBase = { stability: 0.5, similarity: 0.75, style: 0, speed: 1, speakerBoost: true };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, d: number) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));

/** Los ajustes de partida desde la fila de pilo_ai_settings (dentro de lo que la base acepta). */
export function elevenBase(row: Record<string, unknown> | null | undefined): ElevenBase {
  const r = row ?? {};
  return {
    stability: clamp(num(r.eleven_stability, ELEVEN_BASE.stability), 0, 1),
    similarity: clamp(num(r.eleven_similarity, ELEVEN_BASE.similarity), 0, 1),
    style: clamp(num(r.eleven_style, ELEVEN_BASE.style), 0, 1),
    speed: clamp(num(r.eleven_speed, ELEVEN_BASE.speed), 0.7, 1.2),
    speakerBoost: r.eleven_speaker_boost === undefined ? true : Boolean(r.eleven_speaker_boost),
  };
}

/** v3 y v4 trabajan con tres niveles de estabilidad (Creative 0, Natural 0,5, Robust 1). */
export const snapStability = (s: number) => (s < 0.25 ? 0 : s < 0.75 ? 0.5 : 1);

/**
 * Los voice_settings de un pedido. Con modelo de etiquetas, la emoción la
 * ponen las etiquetas (la estabilidad solo se ajusta al nivel más cercano y no
 * se manda style ni speaker boost). Con los demás, la emoción mueve estabilidad
 * y estilo, y la velocidad se multiplica; "neutro" deja lo configurado.
 */
export function voiceSettings(model: ElevenModel, keys: EmotionKey[], base: ElevenBase = ELEVEN_BASE): Record<string, number | boolean> {
  const e = EMOTIONS[keys[0] ?? "neutro"];
  const neutral = (keys[0] ?? "neutro") === "neutro";
  const speed = clamp(Number((base.speed * (neutral ? 1 : e.speed)).toFixed(2)), 0.7, 1.2);
  if (ELEVEN_MODELS[model].tags) {
    return { stability: snapStability(base.stability), similarity_boost: base.similarity, speed };
  }
  return {
    stability: neutral ? base.stability : e.stability,
    similarity_boost: base.similarity,
    style: neutral ? base.style : e.style,
    speed,
    use_speaker_boost: base.speakerBoost,
  };
}

export interface TtsInput {
  voiceId: string;
  model: ElevenModel;
  format: string;
  text: string;
  /** Lo que pidió el cliente (tono del chat) y el tono del estilo de voz. */
  tone?: unknown;
  styleTone?: unknown;
  base?: ElevenBase;
}

/**
 * El pedido a ElevenLabs SIN la clave: la dirección, el cuerpo y el texto que
 * se dirá (que también entra en la llave de la caché). La clave la pone
 * `elevenHeaders` al enviar; así nada de esto la contiene.
 */
export function buildTtsRequest(i: TtsInput) {
  const model = elevenModel(i.model);
  // Lo que pide el chat manda sobre el tono del estilo.
  const asked = emotionsOf(i.tone);
  const keys = asked[0] === "neutro" ? emotionsOf(i.styleTone) : asked;
  const spoken = elevenText(i.text, model, keys);
  const settings = voiceSettings(model, keys, i.base ?? ELEVEN_BASE);
  return {
    url: `${ELEVEN_API}/v1/text-to-speech/${encodeURIComponent(i.voiceId)}?output_format=${elevenFormat(i.format)}`,
    body: { text: spoken, model_id: model, voice_settings: settings },
    spoken,
    settings,
    keys,
  };
}

/** Las cabeceras con la clave: solo se arman en el momento de enviar y nunca se registran. */
export const elevenHeaders = (key: string): Record<string, string> => ({ "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" });

/** La llave de la caché (se hace hash con SHA-256). La clave no entra. */
export const elevenCacheSeed = (r: ReturnType<typeof buildTtsRequest>, voiceId: string): string =>
  ["eleven", r.body.model_id, voiceId, r.url.split("output_format=")[1], JSON.stringify(r.settings), r.spoken].join("|");

/** Quita la clave (y cualquier «sk_…») de un texto antes de registrarlo. */
export function scrubSecret(text: string, key: string): string {
  let t = String(text ?? "");
  if (key) t = t.split(key).join("[clave]");
  return t.replace(/\bsk_[A-Za-z0-9_-]{8,}/g, "[clave]").replace(/xi-api-key[^\s,;"']*/gi, "[clave]");
}

/* --- Errores del proveedor, dichos sin filtrar su cuerpo -------------------------------------------- */

export interface ElevenFault {
  status: number;
  /** Mensaje para el navegador: nunca trae el cuerpo del proveedor. */
  message: string;
  code: "proveedor" | "limite_proveedor" | "cupo_proveedor" | "sin_voz";
}

export function elevenFault(status: number, rawBody: string): ElevenFault {
  const quota = /quota_exceeded|exceeds your quota|credits?/i.test(rawBody);
  if (quota) return { status: 402, message: "ElevenLabs se quedó sin créditos este mes.", code: "cupo_proveedor" };
  if (status === 401 || status === 403) return { status, message: "ElevenLabs no aceptó la clave (o no tiene permiso para esto).", code: "proveedor" };
  if (status === 402) return { status, message: "ElevenLabs pide un plan de pago para esto.", code: "proveedor" };
  if (status === 404) return { status, message: "ElevenLabs no encontró la voz: revise el id de la voz.", code: "proveedor" };
  if (status === 422 || status === 400) return { status, message: "ElevenLabs no aceptó el pedido (voz, modelo o texto).", code: "proveedor" };
  if (status === 429) return { status, message: "ElevenLabs limitó los pedidos (429): espere un minuto.", code: "limite_proveedor" };
  return { status, message: `El servicio de ElevenLabs respondió ${status}.`, code: "proveedor" };
}

/* --- Cantar --------------------------------------------------------------------------------------- */

/**
 * Que Pilo canta en el chat (la app, /app): la pantalla detecta el pedido
 * («cántame…»), llama a la acción «cantar» con una letra o tema original y
 * respeta `sing_aud` del espacio. Apagado (nadie) o sin permiso, el servidor
 * responde con el aviso de la administración y el chat lo enseña.
 */
export const CHAT_SING_ENABLED = true;

export const SING_STYLES = {
  jingle: "upbeat, catchy advertising jingle with bright acoustic guitar and light percussion",
  cumpleanos: "joyful festive birthday song with handclaps and warm acoustic instruments",
  saludo: "warm, friendly sung greeting, gentle pop with acoustic guitar",
  balada: "soft, heartfelt ballad with piano and light strings",
  pop: "modern upbeat pop with a clear melody",
  folclor: "acoustic Latin American folk with guitar and tiple",
  infantil: "playful children's song, simple melody, cheerful",
} as const;
export type SingStyle = keyof typeof SING_STYLES;
export const SING_LANGS = { es: "Spanish", en: "English", pt: "Portuguese" } as const;
export type SingLang = keyof typeof SING_LANGS;
/** Cuántos caracteres cantados caben, más o menos, en un segundo. */
export const SING_CHARS_PER_SECOND = 14;

export interface SingSettings {
  aud: "nadie" | "admin" | "sesion" | "publico";
  daily: number;
  maxChars: number;
  maxSeconds: number;
}
export const SING_DEFAULTS: SingSettings = { aud: "nadie", daily: 10, maxChars: 600, maxSeconds: 60 };

/** La fila de pilo_extras de un espacio; sin la migración 0172 (o sin fila), apagado. */
export function singSettings(row: unknown): SingSettings {
  const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  const int = (v: unknown, d: number, lo: number, hi: number) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? d : clamp(Math.round(Number(v)), lo, hi));
  const aud = r.sing_aud === "admin" || r.sing_aud === "sesion" || r.sing_aud === "publico" ? r.sing_aud : "nadie";
  return { aud, daily: int(r.sing_daily, SING_DEFAULTS.daily, 0, 200), maxChars: int(r.sing_max_chars, SING_DEFAULTS.maxChars, 100, 1500), maxSeconds: int(r.sing_max_seconds, SING_DEFAULTS.maxSeconds, 10, 180) };
}

/**
 * ¿Puede esta persona hacer cantar a Pilo? La administración siempre, desde su
 * pantalla de voz (portal «prueba»); fuera de ahí lo decide el espacio. «sesion»
 * pide una sesión de la intranet (no basta una cuenta de invitado).
 */
export function singAllowed(aud: SingSettings["aud"], role: string | null, portal: string): boolean {
  if (role === "admin" && portal === "prueba") return true;
  if (aud === "publico") return true;
  if (aud === "sesion") return Boolean(role);
  if (aud === "admin") return role === "admin";
  return false;
}

/** Palabras que, tras «canción de», son un tema y no un artista. */
const SAFE_AFTER = new Set([
  "cumpleanos", "navidad", "cuna", "amor", "bienvenida", "despedida", "graduacion", "fiesta", "fiestas", "la", "el", "los", "las", "un", "una", "mi", "mis",
  "tu", "su", "nuestra", "nuestro", "udes", "pilo", "mr", "gracias", "paz", "alegria", "esperanza", "vida", "felicitacion", "aniversario", "ano", "año",
  "bucaramanga", "cucuta", "valledupar", "bogota", "colombia", "santander", "salud", "estudiantes", "universidad", "ciencia", "deporte", "futuro", "ninos", "amistad", "naturaleza", "musica", "investigacion", "campus", "profesores", "docentes", "familia", "mama", "papa", "maestros", "bienestar", "birthday", "love", "welcome", "thanks", "the", "a", "my", "our", "christmas",
]);

/**
 * Reglas simples para no cantar música ajena. Rechaza el pedido de «cantar la
 * canción X de <artista>», «al estilo de <Artista>», covers, karaoke, remix y
 * parodias, y las letras que se declaran de otro. No es un detector de
 * derechos de autor: la pantalla pide composiciones originales y ElevenLabs
 * rechaza por su lado (bad_prompt) lo que reconoce.
 */
export function songRefusal(...texts: string[]): { ok: true } | { ok: false; reason: string } {
  const NO = { ok: false as const, reason: "Solo se cantan composiciones originales: un jingle, un saludo, un cumpleaños. No se canta la canción de otra persona ni al estilo de un artista." };
  for (const raw of texts) {
    const t = String(raw ?? "");
    const f = fold(t);
    if (/\b(karaoke|cover|remix|parodia|parody|lyrics? by|letra original de|letra de la canci[oó]n)\b/i.test(t)) return NO;
    if (/(?:al\s+)?estilo\s+de\s+[A-ZÁÉÍÓÚÑ]/.test(t) || /in the (?:style|voice) of\s+[A-Z]/.test(t) || /(?:como|igual que)\s+(?:canta|cantaba|suena)\s+[A-ZÁÉÍÓÚÑ]/.test(t)) return NO;
    if (/\bimit(?:a|ar|ando|ame)\s+(?:a\s+)?[A-ZÁÉÍÓÚÑ]/.test(t)) return NO;
    if (/©|\(c\)\s*\d{4}/i.test(t)) return NO;
    const m = /\b(?:cancion|tema|song|hit|version|letra)\s+(?:de|del|por|by)\s+(\S+)/.exec(f);
    if (m && !SAFE_AFTER.has(m[1].replace(/[^a-z]/g, ""))) return NO;
    // «canta la canción Hips Don't Lie de Shakira»: un verbo de cantar, una canción y «de <Nombre propio>».
    const named = /\b[Cc]ant\w*\b.{0,20}\b(?:[Cc]anci[oó]n|[Tt]ema)\s.{1,50}?\s(?:de|del|por)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]*)/.exec(t);
    if (named && !SAFE_AFTER.has(fold(named[1]).replace(/[^a-z]/g, ""))) return NO;
    if (/\b(?:sing|play)\b.{0,30}\b(?:song|track)\b.{0,30}\bby\b/i.test(t)) return NO;
  }
  return { ok: true };
}

export interface SingRequest {
  letra: string;
  tema: string;
  estilo: SingStyle;
  idioma: SingLang;
  modo: "voz" | "musica";
}

/** Lee el pedido de «cantar» de un cuerpo cualquiera: listas cerradas para estilo, idioma y modo; texto sin etiquetas. */
export function parseSing(body: Record<string, unknown>, maxChars: number): { ok: true; req: SingRequest } | { ok: false; error: string; code: "formato" | "tamano" } {
  const estilo = (Object.keys(SING_STYLES) as SingStyle[]).find((k) => k === body.estilo) ?? "jingle";
  const idioma = (Object.keys(SING_LANGS) as SingLang[]).find((k) => k === body.idioma) ?? "es";
  const modo = body.modo === "musica" ? "musica" : "voz";
  const rawLetra = typeof body.letra === "string" ? body.letra : "";
  // Se conservan los saltos de línea (estrofas) pero no las etiquetas.
  const letra = rawLetra
    .split(/\r?\n/)
    .map((l) => neutralizeTags(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const tema = neutralizeTags(typeof body.tema === "string" ? body.tema : "").slice(0, 200);
  if (!letra && !tema) return { ok: false, error: "Escriba la letra o, al menos, de qué trata la canción.", code: "formato" };
  if (modo === "voz" && !letra) return { ok: false, error: "Con la voz de Pilo hace falta la letra.", code: "formato" };
  if (letra.length > maxChars) return { ok: false, error: `La letra tiene ${letra.length} caracteres; el máximo es ${maxChars}.`, code: "tamano" };
  return { ok: true, req: { letra, tema, estilo, idioma, modo } };
}

/** Los caracteres que caben en la duración máxima, sin pasar del tope de la letra. */
export const singCharLimit = (s: SingSettings) => Math.min(s.maxChars, s.maxSeconds * SING_CHARS_PER_SECOND);

/** Cuánto dura, más o menos, una letra cantada (tope de la duración configurada, mínimo 10 s). */
export const singSeconds = (letra: string, maxSeconds: number) => clamp(Math.ceil(letra.length / SING_CHARS_PER_SECOND) + 8, 10, maxSeconds);

/** El texto para cantar con la voz de Pilo (v3/v4): «[sings]» al inicio de cada estrofa. */
export function singVoiceText(letra: string): string {
  const stanzas = letra.split(/\n\s*\n/).map((s) => s.split("\n").map((l) => l.trim()).filter(Boolean).join(" … ")).filter(Boolean);
  return stanzas.map((s) => `[sings] ${s}`).join(" ");
}

/** El prompt de Eleven Music, en inglés, para una pieza original con voz cantada. */
export function musicPrompt(r: SingRequest): string {
  const lines = [
    `An original ${SING_STYLES[r.estilo]}, sung by a lead vocalist in ${SING_LANGS[r.idioma]}.`,
    "This is a brand-new composition, not based on any existing song, artist or lyrics.",
  ];
  if (r.tema) lines.push(`Topic: ${r.tema}.`);
  if (r.letra) lines.push(`Sing these lyrics exactly, in order:\n${r.letra}`);
  return lines.join("\n");
}

/** El cuerpo de POST /v1/music (sin clave). */
export function musicBody(r: SingRequest, seconds: number) {
  return { prompt: musicPrompt(r), music_length_ms: Math.max(MUSIC_MIN_MS, Math.round(seconds * 1000)), model_id: MUSIC_MODEL, force_instrumental: false };
}

export const musicUrl = (format = ELEVEN_DEFAULT_FORMAT) => `${ELEVEN_API}/v1/music?output_format=${elevenFormat(format)}`;
