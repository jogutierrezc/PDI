import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { elegirModelo, esfuerzoPorNivel, metaModelo, modelosDisponibles, opcionesAstra, parseNivel, segundosPensando } from "../../../../supabase/functions/pilo-ia/modelos";

const con = { astraChat: true, hayDestino: true, sesion: true };

describe("modelosDisponibles", () => {
  it("con sesión, Astra encendido y destino: Pilo y Astra", () => {
    expect(modelosDisponibles(con)).toEqual({
      modelos: [
        { id: "pilo", label: "Pilo", razona: false },
        { id: "astra", label: "Pilo Astra 1.0", razona: true },
      ],
      defecto: "pilo",
    });
  });
  it("visitante: solo Pilo", () => expect(modelosDisponibles({ ...con, sesion: false }).modelos.map((m) => m.id)).toEqual(["pilo"]));
  it("Astra apagado: solo Pilo", () => expect(modelosDisponibles({ ...con, astraChat: false }).modelos.map((m) => m.id)).toEqual(["pilo"]));
  it("sin destino: solo Pilo", () => expect(modelosDisponibles({ ...con, hayDestino: false }).modelos.map((m) => m.id)).toEqual(["pilo"]));
  it("el defecto 'astra' solo vale si Astra está disponible", () => {
    expect(modelosDisponibles({ ...con, defecto: "astra" }).defecto).toBe("astra");
    expect(modelosDisponibles({ ...con, sesion: false, defecto: "astra" }).defecto).toBe("pilo");
    expect(modelosDisponibles({ ...con, defecto: "otro" }).defecto).toBe("pilo");
  });
});

describe("elegirModelo", () => {
  const todo = modelosDisponibles(con);
  const solo = modelosDisponibles({ ...con, sesion: false });
  it("elige el pedido si está disponible", () => {
    const e = elegirModelo("astra", todo);
    expect(e.modelo.id).toBe("astra");
    expect(e.caido).toBe(false);
  });
  it("pide Astra sin permiso: cae a Pilo y lo dice", () => {
    const e = elegirModelo("astra", solo);
    expect(e.modelo.id).toBe("pilo");
    expect(e.caido).toBe(true);
    expect(metaModelo(e)).toEqual({ modelo: { id: "pilo", label: "Pilo", caido: true }, razona: false });
  });
  it("valor desconocido o vacío: Pilo, sin marcar caída", () => {
    for (const v of [undefined, null, 5, "", "gpt"]) {
      const e = elegirModelo(v, todo);
      expect(e.modelo.id).toBe("pilo");
      expect(e.caido).toBe(false);
    }
  });
});

describe("formato de meta", () => {
  it("Astra: id, etiqueta y razona", () => {
    expect(metaModelo(elegirModelo("astra", modelosDisponibles(con)))).toEqual({ modelo: { id: "astra", label: "Pilo Astra 1.0" }, razona: true });
  });
  it("Pilo: razona falso", () => {
    expect(metaModelo(elegirModelo("pilo", modelosDisponibles(con)))).toEqual({ modelo: { id: "pilo", label: "Pilo" }, razona: false });
  });
  it("segundos pensando con un decimal", () => {
    expect(segundosPensando(14_640)).toBe(14.6);
    expect(segundosPensando(-5)).toBe(0);
  });
});

describe("opcionesAstra", () => {
  const pw = { astra_razonamiento: "auto", astra_max_tokens: 4000, astra_espera_s: 120 };
  it("reasoning_effort sale del ajuste", () => {
    expect(opcionesAstra(pw, 700, 300_000).reasoning_effort).toBe("medium");
    expect(opcionesAstra({ ...pw, astra_razonamiento: "profundo" }, 700, 300_000).reasoning_effort).toBe("high");
    expect(opcionesAstra({ ...pw, astra_razonamiento: "apagado" }, 700, 300_000).reasoning_effort).toBe("none");
  });
  it("max_tokens es el mayor y la espera no pasa del tope de la plataforma", () => {
    expect(opcionesAstra(pw, 700, 300_000).max_tokens).toBe(4000);
    expect(opcionesAstra(pw, 9000, 300_000).max_tokens).toBe(9000);
    expect(opcionesAstra({ ...pw, astra_max_tokens: 0 }, 9000, 300_000).max_tokens).toBe(0);
    expect(opcionesAstra(pw, 700, 300_000).esperaMs).toBe(120_000);
    expect(opcionesAstra(pw, 700, 60_000).esperaMs).toBe(60_000);
  });
});

describe("cableado en pilo-ia/index.ts", () => {
  const index = readFileSync(resolve(__dirname, "../../../../supabase/functions/pilo-ia/index.ts"), "utf8");
  it("acepta la acción y usa el límite por hora de Astra", () => {
    expect(index).toContain('"sugerir", "modelos"]');
    expect(index).toContain('visitorCheck("a", pw.astra_limite_hora, 3600)');
  });
  it("sin `modelo` en el pedido, meta y done no cambian", () => {
    expect(index).toContain("...(eleccion ? metaModelo(eleccion) : {})");
    expect(index).toContain("...(eleccion ? { pensamiento_s: segundosPensando(thinkMs) } : {})");
  });
  it("el 'none' de los servidores propios solo se manda sin Astra", () => {
    expect(index).toMatch(/opts\.astra\s*\?\s*\{ reasoning_effort: opts\.astra\.effort \}/);
  });
});

describe("nivel de razonamiento de Astra", () => {
  it("solo conoce los tres niveles", () => {
    expect(["rapida", "compleja", "investigacion"].map(parseNivel)).toEqual(["rapida", "compleja", "investigacion"]);
    for (const v of ["alto", "", null, undefined, 3, "RAPIDA", { x: 1 }]) expect(parseNivel(v)).toBeNull();
  });

  it("cada nivel pide su esfuerzo, y sin nivel queda el de la administración", () => {
    expect(esfuerzoPorNivel("medium", "rapida")).toBe("low");
    expect(esfuerzoPorNivel("low", "compleja")).toBe("medium");
    expect(esfuerzoPorNivel("low", "investigacion")).toBe("high");
    expect(esfuerzoPorNivel("high", null)).toBe("high");
  });

  it("si la administración apagó el razonamiento, ningún nivel lo enciende", () => {
    for (const n of ["rapida", "compleja", "investigacion", null] as const) expect(esfuerzoPorNivel("none", n)).toBe("none");
  });
});
