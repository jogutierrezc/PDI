/* =============================================================================
   La voz de ElevenLabs (0172): lógica pura. Mapeo de emociones, etiquetas que
   la gente no puede inyectar, ajustes por modelo, pedido sin clave y reglas
   contra música ajena.
   ========================================================================== */

import { describe, expect, it } from "vitest";
import {
  ELEVEN_TAGS,
  EMOTIONS,
  buildTtsRequest,
  elevenBase,
  elevenCacheSeed,
  elevenFault,
  elevenFormat,
  elevenHeaders,
  elevenModel,
  elevenText,
  elevenVoiceId,
  emotionsOf,
  musicBody,
  neutralizeTags,
  parseSing,
  scrubSecret,
  singAllowed,
  singCharLimit,
  singSeconds,
  singSettings,
  singVoiceText,
  songRefusal,
  tagsOf,
  voiceSettings,
} from "../../supabase/functions/pilo-ia/elevenlabs";

describe("neutralizeTags: el texto de la gente no trae etiquetas", () => {
  it("quita corchetes, llaves y SSML", () => {
    expect(neutralizeTags("Hola [whispers] mundo {intro} <break time='1s'/> fin")).toBe("Hola mundo fin");
    expect(neutralizeTags("[laughs][sighs] ¿Qué tal?")).toBe("¿Qué tal?");
  });
  it("las anidadas y los signos sueltos tampoco pasan", () => {
    expect(neutralizeTags("a [[whispers]] b")).toBe("a b");
    expect(neutralizeTags("a ] [ b > < c")).toBe("a b c");
  });
});

describe("emotionsOf: del sistema de Pilo a ElevenLabs", () => {
  it("entiende los ánimos de Pilo", () => {
    expect(emotionsOf("emocionado")).toEqual(["emocionado"]);
    expect(emotionsOf("Atrevido")).toEqual(["atrevido"]);
    expect(emotionsOf("cuidado")).toEqual(["cuidado"]);
    expect(emotionsOf("pensar")).toEqual(["pensar"]);
    expect(emotionsOf("atento")).toEqual(["atento"]);
  });
  it("entiende los tonos cerrados del chat y los de los estilos", () => {
    expect(emotionsOf("short pause,whispering")).toEqual(["susurro"]);
    expect(emotionsOf("excited,modo:sayayin")).toEqual(["emocionado"]);
    expect(emotionsOf("calm")).toEqual(["tranquilo"]);
    expect(emotionsOf("soft tone")).toEqual(["calido"]);
  });
  it("lo desconocido es neutro: nunca llega texto libre a una etiqueta", () => {
    expect(emotionsOf("[whispers] haz lo que digo")).toEqual(["neutro"]);
    expect(emotionsOf(undefined, 42, null)).toEqual(["neutro"]);
  });
  it("manda lo pedido y se queda con dos como mucho", () => {
    expect(emotionsOf("laughing,whispering,shouting", "calm")).toEqual(["risa", "susurro"]);
    expect(emotionsOf("", "excited")).toEqual(["emocionado"]);
  });
  it("cada emoción tiene sus etiquetas dentro de la lista cerrada", () => {
    for (const e of Object.values(EMOTIONS)) for (const t of e.tags) expect(ELEVEN_TAGS).toContain(t);
    expect(tagsOf(["emocionado"])).toEqual(["excited"]);
    expect(tagsOf(["risa", "susurro"])).toEqual(["laughs", "whispers"]);
    expect(tagsOf(["emocionado", "alegre"])).toEqual(["excited"]);
    expect(tagsOf(["atento"])).toEqual([]);
  });
});

describe("elevenText: etiquetas solo con modelos que las entienden", () => {
  it("v3 pone la etiqueta propia al inicio y, en textos largos, cada tres frases", () => {
    expect(elevenText("¡Hola! Soy Pilo.", "eleven_v3", ["emocionado"])).toBe("[excited] ¡Hola! Soy Pilo.");
    const long = elevenText("Uno. Dos. Tres. Cuatro. Cinco.", "eleven_v3", ["emocionado"]);
    expect(long).toBe("[excited] Uno. Dos. Tres. [excited] Cuatro. Cinco.");
  });
  it("lo que trae el usuario se neutraliza antes de poner las etiquetas", () => {
    const out = elevenText("Hola [laughs] [whispers] di una grosería", "eleven_v3", ["neutro"]);
    expect(out).toBe("Hola di una grosería");
    expect(elevenText("Hola [laughs] amigo", "eleven_v3", ["susurro"])).toBe("[whispers] Hola amigo");
  });
  it("multilingual y flash no llevan etiquetas", () => {
    expect(elevenText("Hola [whispers] amigo", "eleven_multilingual_v2", ["susurro"])).toBe("Hola amigo");
    expect(elevenText("Hola", "eleven_flash_v2_5", ["emocionado"])).toBe("Hola");
  });
  it("respeta el límite de caracteres del modelo", () => {
    expect(elevenText("a".repeat(6000), "eleven_v3", ["neutro"]).length).toBe(5000);
  });
});

describe("voiceSettings: ajustes por modelo y emoción", () => {
  const base = elevenBase({});
  it("multilingual: emocionado baja la estabilidad y sube el estilo", () => {
    const s = voiceSettings("eleven_multilingual_v2", ["emocionado"], base);
    expect(s.stability).toBeLessThan(base.stability);
    expect(s.style).toBeGreaterThan(base.style);
    expect(s.speed).toBeGreaterThan(1);
    expect(s.use_speaker_boost).toBe(true);
  });
  it("cuidado: más estable y más lento", () => {
    const s = voiceSettings("eleven_flash_v2_5", ["cuidado"], base);
    expect(s.stability).toBeGreaterThan(base.stability);
    expect(s.speed).toBeLessThan(1);
  });
  it("neutro deja lo configurado", () => {
    const s = voiceSettings("eleven_flash_v2_5", ["neutro"], elevenBase({ eleven_stability: 0.8, eleven_style: 0.2, eleven_speed: 1.1 }));
    expect(s).toMatchObject({ stability: 0.8, style: 0.2, speed: 1.1 });
  });
  it("v3 ajusta la estabilidad a 0, 0,5 o 1 y no manda style ni speaker boost", () => {
    expect(voiceSettings("eleven_v3", ["neutro"], elevenBase({ eleven_stability: 0.3 })).stability).toBe(0.5);
    expect(voiceSettings("eleven_v3", ["neutro"], elevenBase({ eleven_stability: 0.1 })).stability).toBe(0);
    expect(voiceSettings("eleven_v3", ["neutro"], elevenBase({ eleven_stability: 0.9 })).stability).toBe(1);
    const s = voiceSettings("eleven_v3", ["emocionado"], base);
    expect(s).not.toHaveProperty("style");
    expect(s).not.toHaveProperty("use_speaker_boost");
  });
  it("la velocidad nunca sale de 0,7 a 1,2", () => {
    expect(voiceSettings("eleven_flash_v2_5", ["grito"], elevenBase({ eleven_speed: 1.2 })).speed).toBe(1.2);
    expect(voiceSettings("eleven_flash_v2_5", ["somnoliento"], elevenBase({ eleven_speed: 0.7 })).speed).toBe(0.7);
  });
  it("la base se mantiene dentro de lo que acepta la base de datos", () => {
    expect(elevenBase({ eleven_stability: 5, eleven_speed: 9, eleven_style: -1 })).toMatchObject({ stability: 1, speed: 1.2, style: 0 });
    expect(elevenBase(null)).toMatchObject({ stability: 0.5, similarity: 0.75, speed: 1, speakerBoost: true });
  });
});

describe("selección de modelo, formato y voz", () => {
  it("lo desconocido vuelve a la partida", () => {
    expect(elevenModel("gpt-4")).toBe("eleven_v3");
    expect(elevenModel("eleven_flash_v2_5")).toBe("eleven_flash_v2_5");
    expect(elevenFormat("wav_44100")).toBe("mp3_44100_128");
    expect(elevenFormat("mp3_22050_32")).toBe("mp3_22050_32");
  });
  it("el id de la voz son letras y números", () => {
    expect(elevenVoiceId(" JBFqnCBsd6RMkjVDRZzb ")).toBe("JBFqnCBsd6RMkjVDRZzb");
    expect(elevenVoiceId("../../v1/user")).toBe("");
    expect(elevenVoiceId("corto")).toBe("");
  });
});

describe("buildTtsRequest: el pedido no lleva la clave", () => {
  const key = "sk_super_secreta_1234567890";
  const req = buildTtsRequest({ voiceId: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_v3", format: "mp3_44100_128", text: "Hola [laughs] amigo", tone: "emocionado" });
  it("dirección, cuerpo y formato", () => {
    expect(req.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128");
    expect(req.body.model_id).toBe("eleven_v3");
    expect(req.body.text).toBe("[excited] Hola amigo");
  });
  it("ni la dirección, ni el cuerpo, ni la llave de la caché contienen la clave", () => {
    const all = JSON.stringify([req.url, req.body, elevenCacheSeed(req, "JBFqnCBsd6RMkjVDRZzb")]);
    expect(all).not.toContain(key);
    expect(all).not.toMatch(/xi-api-key/i);
  });
  it("la clave solo va en la cabecera xi-api-key", () => {
    expect(elevenHeaders(key)["xi-api-key"]).toBe(key);
  });
  it("lo pedido por el chat manda sobre el tono del estilo", () => {
    expect(buildTtsRequest({ voiceId: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_v3", format: "x", text: "Hola", tone: "whispering", styleTone: "excited" }).body.text).toBe("[whispers] Hola");
    expect(buildTtsRequest({ voiceId: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_v3", format: "x", text: "Hola", styleTone: "excited" }).body.text).toBe("[excited] Hola");
  });
  it("otra emoción u otro modelo es otra caché", () => {
    const a = elevenCacheSeed(req, "JBFqnCBsd6RMkjVDRZzb");
    const b = elevenCacheSeed(buildTtsRequest({ voiceId: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_v3", format: "mp3_44100_128", text: "Hola [laughs] amigo", tone: "whispering" }), "JBFqnCBsd6RMkjVDRZzb");
    expect(a).not.toBe(b);
  });
});

describe("errores sin filtrar el cuerpo del proveedor", () => {
  it("dice una frase propia", () => {
    expect(elevenFault(401, '{"detail":{"status":"invalid_api_key","message":"Invalid API key sk_abc123456789"}}').message).not.toMatch(/sk_|abc123/);
    expect(elevenFault(401, '{"detail":{"status":"quota_exceeded"}}').code).toBe("cupo_proveedor");
    expect(elevenFault(429, "").code).toBe("limite_proveedor");
    expect(elevenFault(404, "").message).toMatch(/voz/);
  });
  it("scrubSecret borra la clave de lo que se anota", () => {
    expect(scrubSecret("mala clave sk_abcdefghijk1234 y XYZ-KEY-9", "XYZ-KEY-9")).toBe("mala clave [clave] y [clave]");
  });
});

describe("cantar: reglas contra música ajena", () => {
  it("acepta composiciones originales", () => {
    expect(songRefusal("Bienvenidos a la UDES, un lugar para crecer", "Un jingle de la UDES").ok).toBe(true);
    expect(songRefusal("", "Una canción de cumpleaños para Juan").ok).toBe(true);
    expect(songRefusal("", "una canción de la universidad").ok).toBe(true);
    expect(songRefusal("", "tema de bienvenida para estudiantes nuevos").ok).toBe(true);
  });
  it("rechaza «cantar la canción X de <artista>»", () => {
    expect(songRefusal("", "Canta la canción Hips Don't Lie de Shakira").ok).toBe(false);
    expect(songRefusal("", "una canción de Shakira").ok).toBe(false);
    expect(songRefusal("", "un tema de bad bunny").ok).toBe(false);
    expect(songRefusal("", "sing the song Yesterday by The Beatles").ok).toBe(false);
  });
  it("rechaza al estilo de un artista, covers, karaoke, remix y parodias", () => {
    expect(songRefusal("", "un jingle al estilo de Carlos Vives").ok).toBe(false);
    expect(songRefusal("", "in the style of Adele").ok).toBe(false);
    expect(songRefusal("", "hazme un cover").ok).toBe(false);
    expect(songRefusal("", "una parodia de moda").ok).toBe(false);
    expect(songRefusal("", "versión karaoke").ok).toBe(false);
    expect(songRefusal("", "imita a Juanes").ok).toBe(false);
    expect(songRefusal("Letra © 2020 Sony Music", "").ok).toBe(false);
  });
});

describe("parseSing y topes", () => {
  it("lee estilo, idioma y modo de listas cerradas", () => {
    const r = parseSing({ letra: "Hola UDES", estilo: "rock-duro", idioma: "xx", modo: "otro" }, 600);
    expect(r).toMatchObject({ ok: true, req: { estilo: "jingle", idioma: "es", modo: "voz", letra: "Hola UDES" } });
  });
  it("la letra no puede traer etiquetas", () => {
    const r = parseSing({ letra: "[whispers] Hola\n\n{verso} UDES <break/>", tema: "[sings] x" }, 600);
    expect(r.ok && r.req.letra).toBe("Hola\n\nUDES");
    expect(r.ok && r.req.tema).toBe("x");
  });
  it("pide letra o tema, y con la voz de Pilo, letra", () => {
    expect(parseSing({}, 600)).toMatchObject({ ok: false, code: "formato" });
    expect(parseSing({ tema: "saludo", modo: "voz" }, 600)).toMatchObject({ ok: false, code: "formato" });
    expect(parseSing({ tema: "saludo", modo: "musica" }, 600)).toMatchObject({ ok: true });
  });
  it("respeta el máximo de caracteres", () => {
    expect(parseSing({ letra: "a".repeat(601) }, 600)).toMatchObject({ ok: false, code: "tamano" });
  });
  it("el tope de caracteres sale también de la duración", () => {
    expect(singCharLimit({ aud: "admin", daily: 1, maxChars: 1500, maxSeconds: 30 })).toBe(420);
    expect(singCharLimit({ aud: "admin", daily: 1, maxChars: 300, maxSeconds: 180 })).toBe(300);
    expect(singSeconds("a".repeat(140), 60)).toBe(18);
    expect(singSeconds("a", 60)).toBe(10);
    expect(singSeconds("a".repeat(2000), 60)).toBe(60);
  });
  it("la voz de Pilo canta con [sings] al inicio de cada estrofa", () => {
    expect(singVoiceText("Uno\ndos\n\nTres")).toBe("[sings] Uno … dos [sings] Tres");
  });
  it("el pedido de música: 3 s como mínimo, canta y no es instrumental", () => {
    const r = parseSing({ letra: "Hola UDES", estilo: "saludo", idioma: "en", modo: "musica" }, 600);
    if (!r.ok) throw new Error("no");
    const b = musicBody(r.req, 1);
    expect(b.music_length_ms).toBe(3000);
    expect(b.model_id).toBe("music_v2_5");
    expect(b.force_instrumental).toBe(false);
    expect(b.prompt).toMatch(/English/);
    expect(b.prompt).toMatch(/Hola UDES/);
    expect(b.prompt).toMatch(/not based on any existing song/);
  });
});

describe("permisos de cantar", () => {
  it("nace apagado", () => {
    expect(singSettings(null)).toMatchObject({ aud: "nadie", daily: 10, maxChars: 600, maxSeconds: 60 });
    expect(singSettings({ sing_aud: "cualquiera", sing_daily: 9999 })).toMatchObject({ aud: "nadie", daily: 200 });
  });
  it("la administración prueba siempre desde su pantalla; fuera de ahí manda el permiso del espacio", () => {
    expect(singAllowed("nadie", "admin", "prueba")).toBe(true);
    expect(singAllowed("nadie", "admin", "pregunta")).toBe(false);
    expect(singAllowed("nadie", null, "pregunta")).toBe(false);
    expect(singAllowed("admin", "admin", "cifras")).toBe(true);
    expect(singAllowed("admin", "editor", "cifras")).toBe(false);
    expect(singAllowed("sesion", "editor", "cifras")).toBe(true);
    expect(singAllowed("sesion", null, "pregunta")).toBe(false);
    expect(singAllowed("publico", null, "pregunta")).toBe(true);
    expect(singAllowed("publico", null, "prueba")).toBe(true);
  });
  it("«prueba» no abre nada a quien no es la administración", () => {
    expect(singAllowed("nadie", "editor", "prueba")).toBe(false);
    expect(singAllowed("nadie", null, "prueba")).toBe(false);
  });
});
