import { describe, expect, it } from "vitest";
import { normalizeSettings } from "./store";

describe("la configuración de Mr. Pilo, venga como venga de la base", () => {
  it("sin la migración 0090 (sin proveedor) no se rompe: usa Mistral y lo avisa", () => {
    const s = normalizeSettings({ enabled: true, base_url: "", voice_rate: "1.1", functions: { explicar: false }, portals: { cifras: { on: false, aud: "sesion", fns: [] } } });
    expect(s.provider).toBe("mistral");
    expect(s.needs0090).toBe(true);
    expect(s.voice_rate).toBe(1.1);
    expect(s.functions).toEqual({ leer: true, resumir: true, sintetizar: true, explicar: false });
    expect(s.portals.cifras.on).toBe(false);
    expect(s.portals.impacto.aud).toBe("admin");
  });

  it("con 0090, respeta lo guardado", () => {
    const s = normalizeSettings({ provider: "freeai", speech_provider: "otro", voice_engine: "proveedor" });
    expect(s).toMatchObject({ provider: "freeai", speech_provider: "otro", voice_engine: "proveedor", needs0090: false });
  });
});
