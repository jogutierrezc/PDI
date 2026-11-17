import { describe, expect, it } from "vitest";
import { consumirFlujo, errorHttp, ErrorPresentacionCliente, mensajeDeCodigo } from "./presentaciones";
import { reducirGeneracion } from "./usePresentacion";
import type { EstadoGeneracion } from "./usePresentacion";
import { presentacionEjemplo } from "./ejemplo";

const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
async function* partir(texto: string, tam = 37): AsyncGenerator<string> {
  for (let i = 0; i < texto.length; i += tam) yield texto.slice(i, i + tam);
}

describe("consumirFlujo", () => {
  const completo =
    frame("step", { id: "leyendo", texto: "Leyendo el informe" }) +
    frame("step", { id: "redactando", texto: "Redactando" }) +
    frame("thinking", { text: "The report " }) +
    frame("thinking", { text: "has data." }) +
    frame("done", { presentacion: presentacionEjemplo, no_verificado: [{ diapositiva: 4, campo: "intro", valor: "47", motivo: "cifra" }], ajustes: [], pensamiento_s: 31.4, reintento: true });

  it("entrega pasos, razonamiento y la presentación aunque los trozos corten líneas", async () => {
    const pasos: string[] = [];
    let pensar = "";
    const r = await consumirFlujo(partir(completo), { onStep: (p) => pasos.push(p.id), onThinking: (t) => (pensar += t) });
    expect(pasos).toEqual(["leyendo", "redactando"]);
    expect(pensar).toBe("The report has data.");
    expect(r.presentacion.diapositivas).toHaveLength(presentacionEjemplo.diapositivas.length);
    expect(r.no_verificado[0].valor).toBe("47");
    expect(r.pensamiento_s).toBe(31.4);
    expect(r.reintento).toBe(true);
  });

  it("un evento error del flujo se vuelve ErrorPresentacionCliente con su código y detalle", async () => {
    const flujo = frame("step", { id: "leyendo", texto: "" }) + frame("error", { code: "presentacion_invalida", message: "No pasó", detalle: ["a", "b"] });
    await expect(consumirFlujo(partir(flujo))).rejects.toMatchObject({ code: "presentacion_invalida", message: "No pasó", detalle: ["a", "b"] });
  });

  it("sin done ni error: falla con mensaje claro", async () => {
    await expect(consumirFlujo(partir(frame("step", { id: "leyendo", texto: "" })))).rejects.toBeInstanceOf(ErrorPresentacionCliente);
  });

  it("un done con presentación fuera de esquema se rechaza", async () => {
    await expect(consumirFlujo(partir(frame("done", { presentacion: { titulo: "x", diapositivas: [] } })))).rejects.toMatchObject({ code: "presentacion_invalida" });
  });
});

describe("errores HTTP", () => {
  it("astra_apagado trae su mensaje; 429 trae la espera", () => {
    const a = errorHttp(503, { error: "Astra no está", code: "astra_apagado" });
    expect(a.code).toBe("astra_apagado");
    expect(a.message).toBe("Astra no está");
    const l = errorHttp(429, { code: "astra_limite" }, "1800");
    expect(l.retryAfter).toBe(1800);
    expect(l.message).toBe(mensajeDeCodigo("astra_limite"));
  });
  it("sin código se deduce del estado", () => {
    expect(errorHttp(401, null).code).toBe("sin_sesion");
    expect(errorHttp(403, {}).code).toBe("sin_acceso");
  });
});

describe("estado de la generación", () => {
  const ini = reducirGeneracion({ fase: "inactivo" }, { t: "empezar", tono: "cercano", ahora: 1000 });
  it("empezar → pasos sin repetir y pensamiento acumulado", () => {
    let e: EstadoGeneracion = ini;
    e = reducirGeneracion(e, { t: "paso", paso: { id: "leyendo", texto: "a" } });
    e = reducirGeneracion(e, { t: "paso", paso: { id: "leyendo", texto: "a" } });
    e = reducirGeneracion(e, { t: "pensar", texto: "uno " });
    e = reducirGeneracion(e, { t: "pensar", texto: "dos" });
    expect(e).toMatchObject({ fase: "trabajando", pensamiento: "uno dos", tono: "cercano" });
    expect((e as { pasos: unknown[] }).pasos).toHaveLength(1);
  });
  it("el pensamiento larguísimo conserva el final", () => {
    const e = reducirGeneracion(ini, { t: "pensar", texto: "a".repeat(20_000) + "FIN" });
    expect((e as { pensamiento: string }).pensamiento.endsWith("FIN")).toBe(true);
    expect((e as { pensamiento: string }).pensamiento.length).toBeLessThanOrEqual(12_000);
  });
  it("error y reiniciar", () => {
    expect(reducirGeneracion(ini, { t: "error", code: "astra_apagado", mensaje: "x" })).toMatchObject({ fase: "error", code: "astra_apagado" });
    expect(reducirGeneracion(ini, { t: "reiniciar" })).toEqual({ fase: "inactivo" });
  });
  it("lo que llega fuera de la fase de trabajo se ignora", () => {
    const e: EstadoGeneracion = { fase: "inactivo" };
    expect(reducirGeneracion(e, { t: "pensar", texto: "x" })).toBe(e);
  });
});
