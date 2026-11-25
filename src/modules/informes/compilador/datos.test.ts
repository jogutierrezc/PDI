import { describe, expect, it } from "vitest";
import { ErrorRedaccion, consumirFlujo, mensajeDeCodigo } from "./datos";

const frames = (...f: [string, unknown][]) => f.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`);
async function* de(partes: string[]) {
  for (const p of partes) yield p;
}

describe("cliente de pilo-compilador", () => {
  it("entrega pasos, razonamiento, partes y el resultado", async () => {
    const pasos: string[] = [];
    let pens = "";
    const partes: number[] = [];
    const r = await consumirFlujo(
      de(frames(["step", { id: "leer", label: "Leyendo" }], ["thinking", { text: "pienso " }], ["thinking", { text: "mucho" }], ["part", { n: 1, palabras: 40 }], ["part", { n: 2, palabras: 90 }], ["done", { seccion: "s1", texto: " Texto [[ind_c_g1]]. ", partes: 2, palabras: 3, usados: ["ind_c_g1"], no_verificado: [], pensamiento_s: 4.2, reintento: false }])),
      { onStep: (p) => pasos.push(p.label), onThinking: (t) => (pens += t), onPart: (p) => partes.push(p.n) },
    );
    expect(pasos).toEqual(["Leyendo"]);
    expect(pens).toBe("pienso mucho");
    expect(partes).toEqual([1, 2]);
    expect(r).toMatchObject({ seccion: "s1", texto: "Texto [[ind_c_g1]].", partes: 2, pensamiento_s: 4.2 });
  });
  it("lee un flujo partido a mitad de un evento", async () => {
    const todo = frames(["done", { seccion: "s2", texto: "Hola", partes: 1, palabras: 1, usados: [], no_verificado: [], pensamiento_s: 1, reintento: false }]).join("");
    const r = await consumirFlujo(de([todo.slice(0, 20), todo.slice(20, 55), todo.slice(55)]));
    expect(r.texto).toBe("Hola");
  });
  it("un error del flujo falla con su código y su detalle", async () => {
    await expect(consumirFlujo(de(frames(["error", { code: "verificacion", message: "No cumplió", detalle: ["token malo"] }])))).rejects.toMatchObject({ code: "verificacion", detalle: ["token malo"] });
  });
  it("sin texto o sin resultado, falla", async () => {
    await expect(consumirFlujo(de(frames(["done", { seccion: "s1", texto: "  " }])))).rejects.toBeInstanceOf(ErrorRedaccion);
    await expect(consumirFlujo(de([]))).rejects.toMatchObject({ code: "proveedor" });
  });
  it("los códigos conocidos tienen mensaje en español", () => {
    expect(mensajeDeCodigo("astra_apagado")).toMatch(/no está encendido/);
    expect(mensajeDeCodigo("desconocido")).toMatch(/No se pudo redactar/);
  });
});
