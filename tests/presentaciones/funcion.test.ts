import { describe, expect, it } from "vitest";
import { crearManejador } from "../../supabase/functions/pilo-presentaciones/handler";
import type { ConfigAstra, DepsManejador } from "../../supabase/functions/pilo-presentaciones/handler";
import { plegarSistema, separarPensamiento } from "../../supabase/functions/pilo-presentaciones/astra";
import { informeEjemplo, presentacionEjemplo } from "../../src/modules/informes/presentacion/ejemplo";

const UUID = "11111111-2222-3333-4444-555555555555";
const DEST = { url: "https://astra.test/v1/chat/completions", model: "pilo-astra:1.0", key: "clave-de-prueba" };
const CFG: ConfigAstra = { habilitado: true, destino: DEST, effort: "medium", maxTokens: 8000, esperaMs: 5000, limiteHora: 20 };

const sse = (...trozos: object[]) => trozos.map((t) => `data: ${JSON.stringify(t)}\n\n`).join("") + "data: [DONE]\n\n";
const delta = (d: Record<string, unknown>, finish?: string) => ({ choices: [{ delta: d, finish_reason: finish ?? null }] });
const respuestaSse = (texto: string, partes = 5) =>
  new Response(
    new ReadableStream({
      start(c) {
        const e = new TextEncoder();
        const largo = Math.ceil(texto.length / partes);
        c.enqueue(e.encode(sse(delta({ reasoning_content: "The report has " }), delta({ reasoning: "twelve actions. " }))));
        for (let i = 0; i < texto.length; i += largo) c.enqueue(e.encode(sse(delta({ content: texto.slice(i, i + largo) })).replace("data: [DONE]\n\n", "")));
        c.enqueue(e.encode(sse(delta({}, "stop"))));
        c.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );

function armar(over: Partial<DepsManejador> & { cfg?: Partial<ConfigAstra>; respuestas?: (() => Response)[] } = {}) {
  const llamadas: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  let n = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const r = (over.respuestas ?? [() => respuestaSse(JSON.stringify(presentacionEjemplo))])[Math.min(n, (over.respuestas?.length ?? 1) - 1)];
    n++;
    return r();
  }) as unknown as typeof fetch;
  const golpes: string[] = [];
  const deps: DepsManejador = {
    configurado: true,
    anonKey: "anon",
    sal: "sal",
    usuarioDe: async (t) => (t === "token-bueno" ? "u-1" : null),
    visible: async () => true,
    config: async () => ({ ...CFG, ...over.cfg }),
    golpe: async (h) => {
      golpes.push(h);
      return golpes.length;
    },
    fetchFn,
    ...over,
  };
  return { manejar: crearManejador(deps), llamadas, golpes };
}

const pedido = (extra: Record<string, unknown> = {}, token = "token-bueno") =>
  new Request("https://f.test/pilo-presentaciones", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ instancia_id: UUID, tono: "institucional", informe: informeEjemplo, ...extra }),
  });

async function eventos(r: Response): Promise<{ evento: string; datos: any }[]> {
  const texto = await r.text();
  return texto
    .split("\n\n")
    .filter(Boolean)
    .map((b) => ({ evento: /event: (.*)/.exec(b)![1], datos: JSON.parse(/data: (.*)/.exec(b)![1]) }));
}

describe("pilo-presentaciones · de punta a punta con un Astra falso", () => {
  it("SSE con razonamiento y JSON bueno: step, thinking y done; solo habla con Astra", async () => {
    const { manejar, llamadas, golpes } = armar();
    const r = await manejar(pedido({ duracion_min: 15, enfoque: "Destacar la permanencia" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toContain("text/event-stream");
    const ev = await eventos(r);
    expect(ev.filter((e) => e.evento === "step").map((e) => e.datos.id)).toEqual(["leyendo", "organizando", "redactando", "validando"]);
    const pensar = ev.filter((e) => e.evento === "thinking").map((e) => e.datos.text).join("");
    expect(pensar).toBe("The report has twelve actions. ");
    const fin = ev[ev.length - 1];
    expect(fin.evento).toBe("done");
    expect(fin.datos.presentacion.diapositivas).toHaveLength(presentacionEjemplo.diapositivas.length);
    expect(fin.datos.no_verificado).toEqual([]);
    expect(fin.datos.reintento).toBe(false);
    expect(fin.datos.modelo.label).toBe("Pilo Astra 1.0");
    expect(typeof fin.datos.pensamiento_s).toBe("number");
    // La llamada: solo a Astra, con su clave, su modelo y el esfuerzo de razonamiento.
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe(DEST.url);
    expect(llamadas[0].headers.Authorization).toBe("Bearer clave-de-prueba");
    expect(llamadas[0].body).toMatchObject({ model: "pilo-astra:1.0", stream: true, reasoning_effort: "medium", max_tokens: 8000 });
    expect(JSON.stringify(llamadas[0].body.messages)).toContain("Destacar la permanencia");
    expect(golpes).toHaveLength(1);
  });

  it("una cifra inventada llega marcada en no_verificado y reemplazada", async () => {
    const p = JSON.parse(JSON.stringify(presentacionEjemplo));
    p.diapositivas[3].intro = "La facultad creció 47 % este año.";
    const { manejar } = armar({ respuestas: [() => respuestaSse(JSON.stringify(p))] });
    const fin = (await eventos(await manejar(pedido()))).pop()!;
    expect(fin.evento).toBe("done");
    expect(fin.datos.no_verificado).toEqual([{ diapositiva: 4, campo: "intro", valor: "47", motivo: "cifra" }]);
    expect(fin.datos.presentacion.diapositivas[3].intro).toContain("[por completar]");
  });

  it("JSON roto: un reintento con el error y, si ya viene bueno, termina", async () => {
    const { manejar, llamadas } = armar({ respuestas: [() => respuestaSse('{"titulo": "x", "diapositivas": [ {"tipo": "portada"'), () => respuestaSse(JSON.stringify(presentacionEjemplo))] });
    const ev = await eventos(await manejar(pedido()));
    expect(llamadas).toHaveLength(2);
    expect(JSON.stringify(llamadas[1].body.messages)).toContain("no pasó la validación");
    const fin = ev.pop()!;
    expect(fin.evento).toBe("done");
    expect(fin.datos.reintento).toBe(true);
  });

  it("fuera de esquema (tipo que no existe): reintenta con los errores concretos", async () => {
    const mala = JSON.parse(JSON.stringify(presentacionEjemplo));
    mala.diapositivas[2].tipo = "grafico";
    const { manejar, llamadas } = armar({ respuestas: [() => respuestaSse(JSON.stringify(mala)), () => respuestaSse(JSON.stringify(presentacionEjemplo))] });
    const fin = (await eventos(await manejar(pedido()))).pop()!;
    expect(fin.evento).toBe("done");
    expect(JSON.stringify(llamadas[1].body.messages)).toContain("«grafico» no existe");
  });

  it("si el reintento también falla: error presentacion_invalida (solo dos llamadas)", async () => {
    const { manejar, llamadas } = armar({ respuestas: [() => respuestaSse("no es json"), () => respuestaSse("{}")] });
    const fin = (await eventos(await manejar(pedido()))).pop()!;
    expect(fin.evento).toBe("error");
    expect(fin.datos.code).toBe("presentacion_invalida");
    expect(fin.datos.detalle.length).toBeGreaterThan(0);
    expect(llamadas).toHaveLength(2);
  });

  it("sin streaming del proveedor (JSON entero con razonamiento) también funciona", async () => {
    const entero = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(presentacionEjemplo), reasoning_content: "Plan: cover, agenda." }, finish_reason: "stop" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    const { manejar } = armar({ respuestas: [entero] });
    const ev = await eventos(await manejar(pedido()));
    expect(ev.find((e) => e.evento === "thinking")!.datos.text).toBe("Plan: cover, agenda.");
    expect(ev.pop()!.evento).toBe("done");
  });

  it("Astra apagado: astra_apagado (503) y NUNCA llama a otro modelo", async () => {
    const { manejar, llamadas, golpes } = armar({ cfg: { habilitado: false } });
    const r = await manejar(pedido());
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("astra_apagado");
    expect(llamadas).toHaveLength(0);
    expect(golpes).toHaveLength(0);
  });

  it("Astra encendido pero sin dirección, modelo o clave: también astra_apagado", async () => {
    const { manejar, llamadas } = armar({ cfg: { destino: null } });
    const r = await manejar(pedido());
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("astra_apagado");
    expect(llamadas).toHaveLength(0);
  });

  it("límite por hora: 429 con Retry-After y sin llamar a Astra", async () => {
    const { manejar, llamadas } = armar({ cfg: { limiteHora: 2 }, golpe: async () => 3 });
    const r = await manejar(pedido());
    expect(r.status).toBe(429);
    expect((await r.json()).code).toBe("astra_limite");
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(llamadas).toHaveLength(0);
  });

  it("si el contador falla, no bloquea", async () => {
    const { manejar } = armar({ golpe: async () => null });
    expect((await manejar(pedido())).status).toBe(200);
  });

  it("sin sesión o con la clave anónima: 401", async () => {
    const { manejar } = armar();
    expect((await manejar(new Request("https://f.test", { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await manejar(pedido({}, "anon"))).status).toBe(401);
    expect((await manejar(pedido({}, "token-malo"))).status).toBe(401);
  });

  it("sin acceso a la instancia (lo decide la base): 403", async () => {
    const { manejar, llamadas } = armar({ visible: async () => false });
    const r = await manejar(pedido());
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe("sin_acceso");
    expect(llamadas).toHaveLength(0);
  });

  it("pedidos mal hechos: tono, enfoque largo, informe grande, id", async () => {
    const { manejar } = armar();
    expect((await manejar(pedido({ tono: "gracioso" }))).status).toBe(400);
    expect((await manejar(pedido({ enfoque: "x".repeat(301) }))).status).toBe(400);
    expect((await manejar(pedido({ instancia_id: "no" }))).status).toBe(400);
    expect((await manejar(pedido({ duracion_min: 999 }))).status).toBe(400);
    const grande = await manejar(pedido({ informe: { texto: "a".repeat(320_000) } }));
    expect(grande.status).toBe(413);
  });

  it("proveedor con error 401: error del flujo, sin plan B", async () => {
    const { manejar, llamadas } = armar({ respuestas: [() => new Response("no", { status: 401 })] });
    const fin = (await eventos(await manejar(pedido()))).pop()!;
    expect(fin.evento).toBe("error");
    expect(fin.datos.code).toBe("proveedor");
    expect(llamadas).toHaveLength(1);
  });
});

describe("astra.ts · utilidades", () => {
  it("separa <think> de la respuesta", () => {
    expect(separarPensamiento("<think>hmm</think>{\"a\":1}")).toEqual({ texto: '{"a":1}', pensamiento: "hmm" });
    expect(separarPensamiento("{\"a\":1}")).toEqual({ texto: '{"a":1}', pensamiento: "" });
  });
  it("pliega el rol system dentro del primer mensaje del usuario", () => {
    expect(plegarSistema([{ role: "system", content: "S" }, { role: "user", content: "U" }])).toEqual([{ role: "user", content: "S\n\n---\n\nU" }]);
  });
});
