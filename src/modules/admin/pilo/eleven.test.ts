// @vitest-environment jsdom
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { COST_NOTICE, EMOTION_CHOICES, parseStatus, parseVoices, usageLine } from "./eleven";
import { normalizeSettings } from "./store";
import type { KeyStatus } from "./store";
import { EMOTION_KEYS } from "../../../../supabase/functions/pilo-ia/elevenlabs";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
});

import { ElevenLabsVoice } from "./ElevenLabsVoice";
import type { EditorApi } from "./sections";

describe("lo que dice el servidor de ElevenLabs", () => {
  it("lee el uso del mes y no se fía de la forma", () => {
    const s = parseStatus({ ok: true, tier: "creator", used: 1200, limit: 100000, reset: 1790000000, basura: 1 });
    expect(s).toEqual({ ok: true, tier: "creator", used: 1200, limit: 100000, reset: 1790000000 });
    expect(usageLine(s)).toMatch(/Plan creator · usó 1\.200 de 100\.000 caracteres \(1 %\)/);
    expect(parseStatus(null)).toEqual({ ok: false });
    expect(usageLine({ ok: false, error: "Falta la clave." })).toBe("Falta la clave.");
    expect(usageLine({ ok: true })).toBe("La conexión funciona.");
  });
  it("solo acepta voces con id válido y vista previa por https", () => {
    const list = parseVoices({
      voices: [
        { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", category: "premade", detail: "male", preview: "http://x/a.mp3" },
        { id: "../x", name: "Malo" },
      ],
    });
    expect(list).toEqual([{ id: "JBFqnCBsd6RMkjVDRZzb", name: "George", category: "premade", detail: "male", preview: "" }]);
    expect(parseVoices(undefined)).toEqual([]);
  });
  it("cada emoción de la pantalla existe en el servidor", () => {
    for (const [value] of EMOTION_CHOICES) expect(EMOTION_KEYS).toContain(value);
  });
});

describe("la configuración de ElevenLabs", () => {
  it("normaliza con las partidas y descarta lo que la base rechazaría", () => {
    const s = normalizeSettings({ speech_provider: "elevenlabs", eleven_model: "gpt", eleven_speed: 9, eleven_fallback: "navegador", eleven_format: "wav" });
    expect(s).toMatchObject({ speech_provider: "elevenlabs", eleven_model: "eleven_v3", eleven_speed: 1.2, eleven_fallback: "ninguno", eleven_format: "mp3_44100_128", eleven_speaker_boost: true });
    expect(normalizeSettings({}).needs0172).toBe(true);
    expect(normalizeSettings({ eleven_model: "eleven_v4" }).needs0172).toBe(false);
  });
});

function editor(raw: Record<string, unknown>, keys?: KeyStatus["keys"]): EditorApi {
  const s = normalizeSettings({ eleven_model: "eleven_v3", ...raw });
  return { s, saved: s, setS: () => undefined, set: () => undefined, setPortal: () => undefined, dirty: false, keys: { keys, has_key: true, last4: "", has_speech_key: false, speech_last4: "", updated_at: null, today: 0 } };
}
const render = (ed: EditorApi) => renderToString(h(QueryClientProvider, { client: new QueryClient() }, h(ElevenLabsVoice, { ed }))).replace(/<!-- -->/g, "");

describe("la pantalla de la voz de ElevenLabs", () => {
  it("muestra la conexión, las emociones y cantar, con el aviso de costo y de obras originales", () => {
    const html = render(editor({}, { elevenlabs: { has: true, last4: "1234" } }));
    expect(html).toContain("Voz de ElevenLabs");
    expect(html).toContain("Probar la conexión");
    expect(html).toContain("Probar emociones");
    expect(html).toContain("Hacer cantar a Pilo");
    expect(html).toContain("composiciones originales");
    expect(html).toContain(COST_NOTICE.slice(0, 40));
    expect(html).toContain("1234");
    expect(html).toContain("Eleven v3");
    expect(html).toContain("nunca la del navegador");
    // Con v3 el estilo no se usa.
    expect(html).toMatch(/No se usa con v3 ni v4/);
  });
  it("sin clave pide pegarla y no deja probar", () => {
    const html = render(editor({}, { elevenlabs: { has: false, last4: "" } }));
    expect(html).toContain("Pegue primero la clave");
    expect(html).not.toContain("1234");
  });
  it("sin la migración 0172 lo dice", () => {
    const s = normalizeSettings({});
    const html = render({ ...editor({}), s, saved: s });
    expect(html).toContain("migración 0172");
  });
});
