import { describe, expect, it } from "vitest";
import { normalizeSettings } from "./store";

describe("la configuración de Mr. Pilo, venga como venga de la base", () => {
  it("sin la migración 0090 (sin proveedor) no se rompe: usa Mistral y lo avisa", () => {
    const s = normalizeSettings({ enabled: true, base_url: "", voice_rate: "1.1", functions: { explicar: false }, portals: { cifras: { on: false, aud: "sesion", fns: [] } } });
    expect(s.provider).toBe("mistral");
    expect(s.needs0090).toBe(true);
    expect(s.voice_rate).toBe(1.1);
    expect(s.functions).toEqual({ leer: true, resumir: true, sintetizar: true, explicar: false, preguntar: true });
    expect(s.portals.cifras.on).toBe(false);
    expect(s.portals.impacto.aud).toBe("admin");
    // Sin 0094, Pregúntele a Pilo queda cerrada y con todas sus memorias, y no se manda al guardar.
    expect(s.needs0094).toBe(true);
    expect(s.portals.pregunta).toEqual({ on: false, aud: "publico", fns: ["preguntar"] });
    expect(s.memory_sources).toEqual({ cifras: true, boletines: true, pdi: true, observatorio: true, impacto: true });
    expect(s.pregunta_welcome).toBe(true);
    // Sin dirección ni modelo, los de Mistral (no un texto de ejemplo vacío).
    expect(s.base_url).toBe("https://api.mistral.ai/v1");
    expect(s.text_model).toBe("mistral-small-latest");
  });

  it("con 0090, respeta lo guardado", () => {
    const s = normalizeSettings({ provider: "freeai", speech_provider: "otro", voice_engine: "proveedor" });
    expect(s).toMatchObject({ provider: "freeai", speech_provider: "otro", voice_engine: "proveedor", needs0090: false });
  });
});
