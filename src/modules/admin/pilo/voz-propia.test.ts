import { describe, expect, it } from "vitest";
import { VOZ_KOKORO, vozPropiaAvisos, vozPropiaUrl } from "./voz-propia";

describe("la dirección a la que Pilo llama para la voz de un servidor propio", () => {
  it("une dirección y ruta, y con la ruta vacía usa /audio/speech", () => {
    expect(vozPropiaUrl("https://voz.udes.edu.co/v1", "/audio/speech")).toBe("https://voz.udes.edu.co/v1/audio/speech");
    expect(vozPropiaUrl("https://voz.udes.edu.co/v1/", "")).toBe("https://voz.udes.edu.co/v1/audio/speech");
    expect(vozPropiaUrl("https://voz.udes.edu.co", "audio/speech")).toBe("https://voz.udes.edu.co/audio/speech");
  });

  it("no repite la ruta si ya viene en la dirección o escrita dos veces", () => {
    expect(vozPropiaUrl("https://voz.udes.edu.co/v1/audio/speech", "/audio/speech")).toBe("https://voz.udes.edu.co/v1/audio/speech");
    expect(vozPropiaUrl("https://voz.udes.edu.co/v1", "/audio/speech/audio/speech")).toBe("https://voz.udes.edu.co/v1/audio/speech");
  });

  it("no repite el /v1 si la ruta también lo trae", () => {
    expect(vozPropiaUrl("https://voz.udes.edu.co/v1", "/v1/audio/speech")).toBe("https://voz.udes.edu.co/v1/audio/speech");
  });

  it("sin dirección no hay nada que llamar", () => {
    expect(vozPropiaUrl("  ", "/audio/speech")).toBe("");
  });
});

describe("los avisos de la voz de un servidor propio", () => {
  const ok = { base: "https://voz.udes.edu.co/v1", path: "/audio/speech", model: "tts-1", hasKey: true };

  it("con todo en orden no hay avisos", () => {
    expect(vozPropiaAvisos(ok)).toEqual([]);
  });

  it("sin dirección, sin modelo o sin clave, lo dice (y la clave solo si ya se sabe que falta)", () => {
    const ids = vozPropiaAvisos({ base: "", path: "", model: " ", hasKey: false }).map((a) => a.id);
    expect(ids).toEqual(["url", "modelo", "clave"]);
    expect(vozPropiaAvisos({ ...ok, hasKey: null })).toEqual([]);
  });

  it("una dirección http:// no sirve: Pilo solo llama por https", () => {
    const [a] = vozPropiaAvisos({ ...ok, base: "http://192.168.1.20:8000/v1" });
    expect(a.id).toBe("https");
    expect(a.tone).toBe("fail");
  });

  it("un túnel de Cloudflare avisa que es temporal, sin bloquear", () => {
    const avisos = vozPropiaAvisos({ ...ok, base: "https://forecast-vsnet.trycloudflare.com/v1" });
    expect(avisos.map((a) => a.id)).toEqual(["temporal"]);
    expect(avisos[0].tone).toBe("warn");
  });

  it("una dirección sin /v1 avisa que un 404 se arregla agregándolo", () => {
    const avisos = vozPropiaAvisos({ ...ok, base: "https://voz.udes.edu.co" });
    expect(avisos.map((a) => a.id)).toEqual(["v1"]);
  });

  it("el ejemplo de Kokoro trae ruta, modelo y voz en español", () => {
    expect(VOZ_KOKORO).toEqual({ speech_path: "/audio/speech", speech_model: "mlx-community/Kokoro-82M-bf16", speech_voice: "ef_dora" });
  });
});
