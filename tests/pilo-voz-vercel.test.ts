import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error La función de Vercel es JavaScript sin tipos.
import handler, { fishTagged, fishText, fishVoiceId, originAllowed, parseTones, VOICE_TONES as DIRECT_TONES } from "../api/pilo-voz.js";
import { VOICE_TONES } from "../src/components/pilo/ai/logic";
import { directVerdict, sniffAudioType } from "../src/components/pilo/ai/voice-player";

const SELF = "https://portal.example";
const VOICE = "0123456789abcdef0123456789abcdef";

const ask = (init: { method?: string; origin?: string | null; body?: unknown } = {}) =>
  handler(
    new Request(`${SELF}/api/pilo-voz`, {
      method: init.method ?? "POST",
      headers: { "Content-Type": "application/json", ...(init.origin === null ? {} : { Origin: init.origin ?? SELF }) },
      body: (init.method ?? "POST") === "POST" ? JSON.stringify(init.body ?? { text: "Hola, soy Pilo." }) : undefined,
    }),
  ) as Promise<Response>;

describe("api/pilo-voz · la voz directa por Vercel", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("FISH_AUDIO_KEY", "clave-de-prueba");
    vi.stubEnv("FISH_VOICE_ID", `https://fish.audio/m/${VOICE}/`);
    vi.stubEnv("FISH_MODEL", "");
    vi.stubEnv("FISH_TONE", "calm");
    vi.stubEnv("PILO_VOZ_ORIGINS", "");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("pide el audio a Fish Audio con la voz, el modelo y el tono, y lo devuelve como MP3", async () => {
    const response = await ask();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toHaveLength(4);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.fish.audio/v1/tts");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer clave-de-prueba");
    expect((init.headers as Record<string, string>).model).toBe("s2.1-pro-free");
    expect(JSON.parse(init.body as string)).toMatchObject({ text: "[calm] Hola, soy Pilo.", reference_id: VOICE, format: "mp3" });
  });

  it("sin la clave o la voz responde 501, sin llamar a Fish Audio", async () => {
    vi.stubEnv("FISH_AUDIO_KEY", "");
    const response = await ask();
    expect(response.status).toBe(501);
    expect(((await response.json()) as { code: string }).code).toBe("sin_configurar");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("solo atiende al propio portal y a los orígenes autorizados", async () => {
    expect((await ask({ origin: "https://otro.example" })).status).toBe(403);
    expect((await ask({ origin: null })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("PILO_VOZ_ORIGINS", "https://otro.example/, https://tercero.example");
    expect((await ask({ origin: "https://otro.example" })).status).toBe(200);
  });

  it("rechaza lo que no es una frase leíble", async () => {
    expect((await ask({ body: { text: "   " } })).status).toBe(400);
    expect((await ask({ body: { text: "a".repeat(601) } })).status).toBe(413);
    expect((await ask({ method: "GET" })).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un fallo de Fish Audio no deja ver su detalle", async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"cuenta 123 sin saldo"}', { status: 402 }));
    const response = await ask();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("cuenta 123");
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    expect((await ask()).status).toBe(429);
  });

  it("las piezas sueltas", () => {
    expect(fishVoiceId("nada")).toBe("");
    expect(fishText("Hola. Soy Pilo.", "Calm!")).toBe("[calm] Hola. [calm] Soy Pilo.");
    expect(fishText("Hola.", "")).toBe("Hola.");
    expect(originAllowed("https://a.example", "https://b.example", "https://a.example")).toBe(true);
    expect(originAllowed("", "https://b.example", "")).toBe(false);
  });

  it("la emoción de una frase: la misma lista cerrada que en pilo-ia", () => {
    expect([...DIRECT_TONES]).toEqual([...VOICE_TONES]);
    expect(parseTones("short pause,whispering,nada")).toEqual(["short pause", "whispering"]);
    expect(parseTones(undefined)).toEqual([]);
    expect(fishTagged("A la biblioteca.", ["short pause", "whispering"])).toBe("[short pause] [whispering] A la biblioteca.");
  });
});

describe("el reproductor de la voz", () => {
  it("reconoce el tipo del audio por su comienzo", () => {
    const bytes = (text: string) => Uint8Array.from([...text].map((c) => c.charCodeAt(0)));
    expect(sniffAudioType(bytes("RIFF....WAVE"))).toBe("audio/wav");
    expect(sniffAudioType(bytes("ID3\u0004"))).toBe("audio/mpeg");
    expect(sniffAudioType(Uint8Array.from([0xff, 0xfb, 0x90, 0x00]))).toBe("audio/mpeg");
    expect(sniffAudioType(bytes("OggS"))).toBe("audio/ogg");
    expect(sniffAudioType(bytes("....ftypM4A "))).toBe("audio/mp4");
    expect(sniffAudioType(bytes("<!doctype"))).toBe("");
  });

  it("decide qué hacer con la respuesta de la vía directa", () => {
    expect(directVerdict(200, "audio/mpeg")).toBe("audio");
    // En desarrollo no hay /api: llega la página del portal.
    expect(directVerdict(200, "text/html")).toBe("no hay");
    expect(directVerdict(404, null)).toBe("no hay");
    expect(directVerdict(501, "application/json")).toBe("no hay");
    expect(directVerdict(429, "application/json")).toBe("esta vez no");
    expect(directVerdict(502, "application/json")).toBe("esta vez no");
  });
});
