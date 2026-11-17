import { describe, expect, it } from "vitest";
import { askBody, consumeAskStream, toAskEvent, toCatalogo } from "./client";
import { modeloVigente } from "./modelo";

describe("cuerpo de preguntar con modelo", () => {
  it("sin modelo es el de siempre, byte a byte", () => {
    expect(JSON.stringify(askBody("hola", []))).toBe(JSON.stringify(askBody("hola", [], { modelo: null })));
    expect(askBody("hola", [])).not.toHaveProperty("modelo");
  });
  it("con modelo válido lo manda; con uno raro, no", () => {
    expect(askBody("hola", [], { modelo: "astra" }).modelo).toBe("astra");
    expect(askBody("hola", [], { modelo: "pilo" }).modelo).toBe("pilo");
    expect(askBody("hola", [], { modelo: "x" as never })).not.toHaveProperty("modelo");
  });
});

describe("catálogo de modelos", () => {
  it("lee lo del servidor", () => {
    const c = toCatalogo({ modelos: [{ id: "pilo", label: "Pilo", razona: false }, { id: "astra", label: "Pilo Astra 1.0", razona: true }], defecto: "astra" });
    expect(c.modelos.map((m) => m.id)).toEqual(["pilo", "astra"]);
    expect(c.defecto).toBe("astra");
    expect(c.modelos[1].razona).toBe(true);
  });
  it("ante cualquier duda, solo Pilo", () => {
    for (const raw of [null, {}, { modelos: [] }, { modelos: [{ id: "otro" }] }, "x"]) expect(toCatalogo(raw).modelos.map((m) => m.id)).toEqual(["pilo"]);
  });
  it("el recordado solo vale si el servidor lo ofrece", () => {
    const solo = toCatalogo(null);
    const dos = toCatalogo({ modelos: [{ id: "pilo" }, { id: "astra" }], defecto: "pilo" });
    expect(modeloVigente(solo, "astra")).toBe("pilo");
    expect(modeloVigente(dos, "astra")).toBe("astra");
    expect(modeloVigente(dos, null)).toBe("pilo");
  });
});

describe("flujo con Astra", () => {
  it("meta trae modelo y razona; thinking llega; done trae pensamiento_s", async () => {
    const sse = [
      `event: meta\ndata: ${JSON.stringify({ asked: "q", sources: [], trail: [], modelo: { id: "astra", label: "Pilo Astra 1.0" }, razona: true })}\n\n`,
      `event: thinking\ndata: ${JSON.stringify({ text: "Let me think" })}\n\n`,
      `event: delta\ndata: ${JSON.stringify({ text: "Hola." })}\n\n`,
      `event: done\ndata: ${JSON.stringify({ kind: "ia", text: "Hola.", sources: [], trail: [], pensamiento_s: 14.6 })}\n\n`,
    ];
    async function* chunks() {
      for (const c of sse) yield c;
    }
    let meta: unknown;
    let think = "";
    const result = await consumeAskStream(chunks(), { onMeta: (m) => (meta = m), onThinking: (t) => (think += t) });
    expect((meta as { modelo: { id: string }; razona: boolean }).modelo.id).toBe("astra");
    expect((meta as { razona: boolean }).razona).toBe(true);
    expect(think).toBe("Let me think");
    expect(result.pensamiento_s).toBe(14.6);
    expect(toAskEvent({ event: "thinking", data: "{}" })).toBeNull();
  });
});
