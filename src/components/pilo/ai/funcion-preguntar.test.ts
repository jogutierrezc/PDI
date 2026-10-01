/* =============================================================================
   La función pilo-ia, de punta a punta, para «preguntar» (0110).

   La función corre en Deno y aquí no hay Deno: se toma su único archivo, se
   le cambia la base de datos por una de mentira y el proveedor por un `fetch`
   de mentira, y se llama a su manejador como lo haría la página. Así se prueba
   lo que la lógica suelta no ve: el orden de los eventos del flujo, la caída a
   lo publicado cuando el proveedor falla, el reintento sin rol `system`, el
   límite por visitante y que sin `stream` todo vuelva como JSON, como antes.
   No se llama a ningún proveedor real.
   ========================================================================== */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createSseParser } from "./logic";

type Row = Record<string, unknown>;
type Handler = (request: Request) => Promise<Response>;

interface World {
  settings: Row;
  catalog: Row[];
  memory: Row[];
  facts: Row[];
  /** Pedidos de texto y de voz ya gastados hoy. */
  textUsed: number;
  voiceUsed: number;
  /** Cuántos pedidos lleva el visitante en su ventana (lo que devuelve pilo_visitor_hit). */
  hits: number;
  /** Sin la migración 0110: la función del límite no existe. */
  noVisitorTable: boolean;
  logs: Row[];
  inbox: Row[];
  saved: Row[];
  rpcs: string[];
  visitors: string[];
}

const passage = { ref: "cifras:matriculados", source: "cifras", title: "Estudiantes matriculados", section: "Población", body: "En 2024 hubo 20.500 estudiantes matriculados en toda la UDES.", path: "/cifras/poblacion", cut: "2024", office: "Registro", updated_at: "2026-09-01", rank: 0.9 };

const world = (): World => ({
  settings: {
    id: 1,
    enabled: true,
    provider: "nvidia",
    text_model: "google/gemma-4-31b-it",
    base_url: "",
    chat_path: "",
    functions: { preguntar: true, leer: true },
    portals: { pregunta: { on: true, aud: "publico", fns: ["preguntar", "leer"] } },
    daily_limit: 200,
    max_rows: 500,
    cache_days: 0,
    memory_sources: {},
    speech_provider: "navegador",
    voice_engine: "proveedor",
  },
  catalog: [],
  memory: [passage],
  facts: [],
  textUsed: 0,
  voiceUsed: 0,
  hits: 0,
  noVisitorTable: false,
  logs: [],
  inbox: [],
  saved: [],
  rpcs: [],
  visitors: [],
});

/** Lo mínimo de supabase-js que usa la función: consultas encadenadas que se resuelven al esperarlas. */
function fakeClient(w: World) {
  const from = (table: string) => {
    const filters: [string, string, unknown][] = [];
    let op = "select";
    let row: Row = {};
    const result = (): Row => {
      if (table === "pilo_ai_settings") return { data: w.settings, error: null };
      if (table === "pilo_ai_secret") return { data: { id: 1, nvidia_key: "clave-de-prueba" }, error: null };
      if (table === "pilo_ai_log") {
        if (op === "insert") {
          w.logs.push(row);
          return { error: null };
        }
        const voice = filters.some(([kind, column, value]) => kind === "eq" && column === "action" && value === "voz");
        return { count: voice ? w.voiceUsed : w.textUsed, error: null };
      }
      if (table === "profiles") return { data: { id: "admin-1", role: "admin", is_active: true }, error: null };
      if (table === "campuses") return { data: [{ name: "Bucaramanga" }, { name: "Cúcuta" }], error: null };
      if (table === "pilo_memory") return { data: w.memory, error: null };
      if (table === "pilo_answers") {
        if (op === "insert") {
          w.saved.push(row);
          return { data: { id: 77 }, error: null };
        }
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };
    const api = {
      select: () => api,
      eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), api),
      neq: (c: string, v: unknown) => (filters.push(["neq", c, v]), api),
      gte: () => api,
      in: () => api,
      insert: (r: Row) => ((op = "insert"), (row = r), api),
      update: () => ((op = "update"), api),
      upsert: () => api,
      maybeSingle: () => Promise.resolve(result()),
      then: (ok: (v: Row) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, fail),
    };
    return api;
  };
  const rpc = (name: string, args: Row = {}) => {
    w.rpcs.push(name);
    const data = (): Row => {
      switch (name) {
        case "pilo_catalog_active":
          return { data: w.catalog, error: null };
        case "pilo_facts_campuses":
          return { data: ["Bucaramanga", "Cúcuta"], error: null };
        case "pilo_embed_status":
          return { data: { memory_done: 0, facts_done: 0 }, error: null };
        case "pilo_memory_search":
          return { data: w.memory, error: null };
        case "pilo_facts_search":
          return { data: w.facts, error: null };
        case "pilo_answer_candidates":
          return { data: [], error: null };
        case "pilo_graph_around":
          return { data: { nodes: [], edges: [] }, error: null };
        case "pilo_visitor_hit":
          if (w.noVisitorTable) return { data: null, error: { message: "Could not find the function public.pilo_visitor_hit" } };
          w.visitors.push(String(args.p_visitor));
          return { data: (w.hits += 1), error: null };
        case "pilo_inbox_add":
          w.inbox.push(args);
          return { data: null, error: null };
        default:
          return { data: null, error: null };
      }
    };
    return Promise.resolve(data());
  };
  return { from, rpc, auth: { getUser: async (token: string) => ({ data: { user: token === "sesion-admin" ? { id: "admin-1" } : null } }) }, storage: { from: () => ({}) } };
}

let dir = "";
let code = "";
let version = 0;
let current: World = world();

beforeAll(async () => {
  const source = readFileSync(resolve(__dirname, "../../../../supabase/functions/pilo-ia/index.ts"), "utf8");
  const importLine = /^import \{ createClient \} from "https:\/\/esm\.sh\/[^"]+";$/m;
  expect(source).toMatch(importLine);
  const patched = source.replace(importLine, "const createClient = (globalThis as any).__piloCreateClient;");
  code = (await transform(patched, { loader: "ts", format: "esm", target: "es2022" })).code;
  dir = mkdtempSync(join(tmpdir(), "pilo-ia-"));
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Una instancia nueva de la función (sus cachés empiezan vacías) sobre un mundo de prueba. */
async function boot(w: World): Promise<Handler> {
  current = w;
  let handler: Handler | null = null;
  const g = globalThis as Record<string, unknown>;
  g.__piloCreateClient = () => fakeClient(current);
  g.Deno = {
    env: { get: (name: string) => ({ SUPABASE_URL: "https://proyecto.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "servicio" })[name] },
    serve: (h: Handler) => {
      handler = h;
    },
  };
  // Un archivo por instancia: así cada una se evalúa de nuevo.
  const file = join(dir, `index-${++version}.mjs`);
  writeFileSync(file, code);
  await import(pathToFileURL(file).href);
  if (!handler) throw new Error("La función no registró su manejador.");
  return handler;
}

const ask = (handler: Handler, body: Row, headers: Record<string, string> = {}) =>
  handler(
    new Request("https://proyecto.supabase.co/functions/v1/pilo-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", "x-forwarded-for": "190.1.2.3", "user-agent": "prueba", ...headers },
      body: JSON.stringify({ action: "preguntar", portal: "pregunta", ...body }),
    }),
  );

/** Los eventos del flujo, en orden, con su JSON leído. */
async function events(response: Response): Promise<{ event: string; data: Record<string, unknown> }[]> {
  const sse = createSseParser();
  return [...sse.push(await response.text()), ...sse.flush()].map((e) => ({ event: e.event, data: JSON.parse(e.data) as Record<string, unknown> }));
}

const sseBody = (parts: string[], finish = "stop") => {
  const encoder = new TextEncoder();
  const frames = [
    ...parts.map((text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`),
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }], usage: { prompt_tokens: 800, completion_tokens: 20, total_tokens: 820 } })}\n\n`,
    "data: [DONE]\n\n",
  ];
  // Partido a destiempo, como llega de verdad por la red.
  const whole = frames.join("");
  const cuts = [0, 17, 60, 61, 140, whole.length];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < cuts.length - 1; i++) if (cuts[i] < whole.length) controller.enqueue(encoder.encode(whole.slice(cuts[i], Math.min(cuts[i + 1], whole.length))));
      controller.close();
    },
  });
};

const provider = (...replies: (() => Response)[]) => {
  let n = 0;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    const reply = replies[Math.min(n++, replies.length - 1)];
    return reply();
  });
  vi.stubGlobal("fetch", fn);
  return calls;
};

const stream = (...parts: string[]) => () => new Response(sseBody(parts), { headers: { "Content-Type": "text/event-stream" } });
const roles = (call: { body: Record<string, unknown> }) => (call.body.messages as { role: string }[]).map((m) => m.role);

describe("preguntar, por partes", () => {
  it("manda meta, los trozos y el objeto final revisado", async () => {
    const w = world();
    const calls = provider(stream("En 2024 hubo ", "20.500 estudiantes ", "matriculados [1]. ", "Es la cifra de toda la UDES [1]."));
    const response = await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    const all = await events(response);
    expect(all[0].event).toBe("meta");
    expect(all[all.length - 1].event).toBe("done");
    expect(all.slice(1, -1).every((e) => e.event === "delta")).toBe(true);
    expect(all[0].data).toMatchObject({ asked: "", intent: "institucional", official: false, model: "google/gemma-4-31b-it" });
    expect((all[0].data.sources as Row[]).map((s) => [s.n, s.ref])).toEqual([[1, "cifras:matriculados"]]);
    // Los trozos, unidos, son el texto (solo frases completas hasta el último).
    const live = all.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
    expect(live).toBe("En 2024 hubo 20.500 estudiantes matriculados [1]. Es la cifra de toda la UDES [1].");
    const done = all[all.length - 1].data;
    expect(done).toMatchObject({ kind: "ia", text: live, grounding: "oficial", intent: "institucional", verified: true, unknown: [], answerId: 77, finish: "stop", usage: { total: 820 } });
    expect(done.sources).toHaveLength(1);
    expect((done.trail as Row[]).map((s) => s.step)).toEqual(["Enrutador", "Catálogo", "Respuestas guardadas", "Entender", "Cifras", "Fuentes", "IA"]);
    // Un solo pedido al proveedor (sin la llamada de «entender»), por partes y con los bloques.
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ stream: true, temperature: 0.3, max_tokens: 800 });
    expect(roles(calls[0])).toEqual(["system", "user"]);
    expect((calls[0].body.messages as { content: string }[])[0].content).toContain("[PASAJES]");
    // Verificada y citada de la memoria: se guarda. Y cuenta para el cupo de texto.
    expect(w.saved).toEqual([{ question: "¿Cuántos estudiantes matriculados hay?", qnorm: "cuantos estudiantes matriculados hay", kind: "ia", answer: live, refs: ["cifras:matriculados"] }]);
    expect(w.logs.filter((l) => l.cached === false)).toHaveLength(1);
    expect(w.inbox).toEqual([]);
  });

  it("la conversación va como turnos reales y la pregunta de seguimiento se une sin IA", async () => {
    const w = world();
    const calls = provider(stream("En Cúcuta no tengo la cifra publicada. "));
    const history = Array.from({ length: 8 }, (_, i) => ({ q: i === 7 ? "¿Cuántos estudiantes matriculados hay?" : `pregunta ${i}`, a: `respuesta ${i} [1]` }));
    const all = await events(await ask(await boot(w), { question: "¿y en Cúcuta?", history, stream: true }));
    expect(all[0].data.asked).toBe("¿Cuántos estudiantes matriculados hay? → ¿y en Cúcuta?");
    expect(calls).toHaveLength(1);
    expect(roles(calls[0])).toEqual(["system", ...Array.from({ length: 6 }, () => ["user", "assistant"]).flat(), "user"]);
    // Un seguimiento no se guarda: solo no dice qué pide.
    expect(w.saved).toEqual([]);
  });

  it("lo vetado y las capciosas responden con JSON, sin modelo", async () => {
    const w = world();
    w.catalog = [{ key: "C-001", kind: "capciosa", question: "", variants: [], triggers: ["tienes novia"], answer: "¡Solo tengo ojos para los datos!", mood: "atrevido", source_title: "", source_path: "", cut: "", office: "" }];
    const calls = provider(stream("no debería llamarse"));
    const handler = await boot(w);
    const money = await ask(handler, { question: "¿Cuánto presupuesto tiene el pilar II?", stream: true });
    expect(money.headers.get("Content-Type")).toContain("application/json");
    expect(await money.json()).toMatchObject({ kind: "regla", intent: "vetado", sources: [], text: expect.stringContaining("presupuesto") });
    const tricky = await ask(handler, { question: "Pilo, ¿tienes novia?", stream: true });
    expect(await tricky.json()).toMatchObject({ kind: "capciosa", intent: "capciosa", text: "¡Solo tengo ojos para los datos!", mood: "atrevido" });
    expect(calls).toHaveLength(0);
    expect(w.logs.every((l) => l.cached === true)).toBe(true);
  });

  it("la respuesta oficial del catálogo va como base y no se guarda", async () => {
    const w = world();
    w.catalog = [{ key: "R-001", kind: "respuesta", question: "¿Qué es el PDI?", variants: [], triggers: [], answer: "El PDI es el Plan de Desarrollo Institucional 2024-2028.", mood: "feliz", source_title: "Plan de Desarrollo", source_path: "/pdi", cut: "", office: "Planeación" }];
    w.memory = [];
    const calls = provider(stream("El PDI es el Plan de Desarrollo Institucional de la UDES para 2024-2028 [1]. "));
    const all = await events(await ask(await boot(w), { question: "¿Qué es el PDI?", stream: true }));
    expect(all[0].data).toMatchObject({ official: true, mood: "feliz", intent: "institucional" });
    expect((calls[0].body.messages as { content: string }[])[0].content).toContain("[OFICIAL]");
    const done = all[all.length - 1].data;
    expect(done).toMatchObject({ kind: "ia", grounding: "oficial", mood: "feliz", answerId: null });
    expect((done.sources as Row[])[0]).toMatchObject({ ref: "catalogo:R-001", source: "catalogo" });
    expect(w.saved).toEqual([]);
  });

  it("sin fuente institucional responde de conocimiento general, lo marca y lo anota en la bandeja", async () => {
    const w = world();
    w.memory = [];
    provider(stream("La capital de Francia es París. "));
    const all = await events(await ask(await boot(w), { question: "¿Cuál es la capital de Francia?", stream: true }));
    const done = all[all.length - 1].data;
    expect(done).toMatchObject({ kind: "ia", text: "La capital de Francia es París.", grounding: "general", intent: "general", sources: [], verified: true, answerId: null });
    expect(w.saved).toEqual([]);
    expect(w.inbox).toEqual([expect.objectContaining({ p_reason: "general", p_kind: "ia", p_question: "¿Cuál es la capital de Francia?" })]);
  });

  it("un saludo lo responde el modelo, sin buscar y sin bandeja", async () => {
    const w = world();
    const calls = provider(stream("¡Hola! Soy Mr. Pilo. "));
    const all = await events(await ask(await boot(w), { question: "hola pilo", stream: true }));
    expect(all[all.length - 1].data).toMatchObject({ kind: "ia", intent: "saludo", grounding: "general" });
    expect(calls).toHaveLength(1);
    expect(w.rpcs).not.toContain("pilo_memory_search");
    expect(w.inbox).toEqual([]);
  });

  it("si el proveedor ignora stream y manda el JSON entero, igual termina con done", async () => {
    const w = world();
    provider(() => new Response(JSON.stringify({ choices: [{ message: { content: "En 2024 hubo 20.500 estudiantes [1]." }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } }));
    const all = await events(await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true }));
    expect(all.map((e) => e.event)).toEqual(["meta", "delta", "done"]);
    expect(all[2].data).toMatchObject({ kind: "ia", text: "En 2024 hubo 20.500 estudiantes [1].", grounding: "oficial" });
  });

  it("quita del flujo y del final la cifra de dinero que no está publicada", async () => {
    const w = world();
    provider(stream("La matrícula cuesta $ 9.000.000 por semestre. ", "Hubo 20.500 estudiantes [1]. "));
    const all = await events(await ask(await boot(w), { question: "¿Cuánto cuesta la matrícula?", stream: true }));
    const text = JSON.stringify(all);
    expect(text).not.toContain("9.000.000");
    expect(all[all.length - 1].data).toMatchObject({ kind: "ia", filtered: ["dinero"] });
    expect(w.saved).toEqual([]);
  });
});

describe("cuando el proveedor falla", () => {
  it("con pasajes, cae al extracto y lo dice", async () => {
    const w = world();
    provider(() => new Response(JSON.stringify({ error: { message: "Internal error" } }), { status: 500 }));
    const all = await events(await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true }));
    expect(all.map((e) => e.event)).toEqual(["meta", "done"]);
    const done = all[1].data;
    expect(done).toMatchObject({ kind: "extracto", fallback: "proveedor", grounding: "oficial" });
    expect(String(done.text)).toContain("20.500");
    const last = (done.trail as Row[]).at(-1);
    expect(last).toMatchObject({ step: "IA", status: "skip", detail: expect.stringContaining("(500)") });
    expect(w.logs.some((l) => String(l.status) === "error 500")).toBe(true);
  });

  it("sin nada publicado, manda un error honesto en vez de dejar la página esperando", async () => {
    const w = world();
    w.memory = [];
    provider(() => new Response("upstream", { status: 503 }));
    const all = await events(await ask(await boot(w), { question: "¿Cuál es la capital de Francia?", stream: true }));
    expect(all.map((e) => e.event)).toEqual(["meta", "error"]);
    expect(all[1].data).toMatchObject({ code: "proveedor", message: expect.stringContaining("(503)") });
    // Sin stream, el mismo caso es un error HTTP con el mismo mensaje.
    const plain = await ask(await boot(world2()), { question: "¿Cuál es la capital de Francia?" });
    expect(plain.status).toBe(502);
    expect(await plain.json()).toMatchObject({ code: "proveedor", error: expect.stringContaining("(503)") });
    function world2() {
      const x = world();
      x.memory = [];
      return x;
    }
  });

  it("si el flujo se rompe a medias, entrega lo escrito y marcado como parcial", async () => {
    const w = world();
    const encoder = new TextEncoder();
    let sent = false;
    provider(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            // Primero llega un trozo; al pedir el siguiente, la conexión se cae.
            pull(controller) {
              if (sent) return controller.error(new TypeError("conexión cortada"));
              sent = true;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "En 2024 hubo 20.500 estudiantes [1]. Además" } }] })}\n\n`));
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    );
    const all = await events(await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true }));
    expect(all[all.length - 1].event).toBe("done");
    expect(all[all.length - 1].data).toMatchObject({ kind: "ia", partial: true, notice: expect.stringContaining("incompleta"), verified: true });
    expect(String(all[all.length - 1].data.text)).toContain("20.500 estudiantes [1]");
    expect(w.saved).toEqual([]);
    expect(w.logs.some((l) => l.status === "parcial")).toBe(true);
  });

  it("si el modelo solo devuelve razonamiento, no hay texto: cae a lo publicado", async () => {
    const w = world();
    provider(() => new Response(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "pensando…" }, finish_reason: "length" }] })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } }));
    const all = await events(await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true }));
    expect(all[all.length - 1].data).toMatchObject({ kind: "extracto", fallback: "vacio" });
    expect(w.logs.some((l) => String(l.subject).includes("razonamiento"))).toBe(true);
  });

  it("si el modelo rechaza el rol system, reintenta con la persona doblada y lo recuerda", async () => {
    const w = world();
    const calls = provider(
      () => new Response(JSON.stringify({ error: { message: "System role not supported" } }), { status: 400 }),
      stream("En 2024 hubo 20.500 estudiantes [1]. "),
    );
    const handler = await boot(w);
    const first = await events(await ask(handler, { question: "¿Cuántos estudiantes matriculados hay?", stream: true }));
    expect(first[first.length - 1].data).toMatchObject({ kind: "ia", grounding: "oficial" });
    expect(calls.map(roles)).toEqual([["system", "user"], ["user"]]);
    expect((calls[1].body.messages as { content: string }[])[0].content).toContain("Eres Mr. Pilo");
    // La siguiente pregunta ya va sin `system`: no se paga otro pedido fallido.
    await events(await ask(handler, { question: "¿Cuántos estudiantes hay matriculados hoy?", stream: true }));
    expect(calls).toHaveLength(3);
    expect(roles(calls[2])).toEqual(["user"]);
  });

  it("con el ajuste «user», nunca manda el rol system", async () => {
    const w = world();
    w.settings.system_role = "user";
    const calls = provider(stream("Hola. "));
    await events(await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", history: [{ q: "hola", a: "¡Hola!" }], stream: true }));
    expect(roles(calls[0])).toEqual(["user", "assistant", "user"]);
  });
});

describe("sin stream, como antes", () => {
  it("devuelve JSON con la forma de siempre y los campos nuevos sumados", async () => {
    const w = world();
    const calls = provider(() => new Response(JSON.stringify({ choices: [{ message: { content: "En 2024 hubo 20.500 estudiantes [1]." }, finish_reason: "stop" }] })));
    const response = await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?" });
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const data = (await response.json()) as Row;
    expect(Object.keys(data).slice(0, 4)).toEqual(["kind", "text", "sources", "trail"]);
    expect(data).toMatchObject({ kind: "ia", text: "En 2024 hubo 20.500 estudiantes [1].", answerId: 77, verified: true, unknown: [], grounding: "oficial" });
    expect((data.sources as Row[])[0]).toEqual({ n: 1, ref: "cifras:matriculados", source: "cifras", title: "Estudiantes matriculados", section: "Población", path: "/cifras/poblacion", cut: "2024", office: "Registro", excerpt: passage.body });
    expect(calls[0].body.stream).toBeUndefined();
  });

  it("con la IA apagada responde lo publicado tal cual, también si se pidió stream", async () => {
    const w = world();
    w.settings.enabled = false;
    const calls = provider(stream("no debería llamarse"));
    const handler = await boot(w);
    const response = await ask(handler, { question: "¿Cuántos estudiantes matriculados hay?", stream: true });
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toMatchObject({ kind: "extracto", grounding: "oficial" });
    expect(await (await ask(handler, { question: "hola" })).json()).toMatchObject({ kind: "regla", intent: "saludo" });
    w.memory = [];
    expect(await (await ask(handler, { question: "¿Cuál es la capital de Francia?" })).json()).toMatchObject({ kind: "nada" });
    expect(w.inbox).toEqual([expect.objectContaining({ p_reason: "sin_respuesta" })]);
    expect(calls).toHaveLength(0);
  });

  it("sin cupo de texto responde lo publicado; la voz gastada no cuenta para el texto", async () => {
    const w = world();
    w.voiceUsed = 5000;
    const calls = provider(() => new Response(JSON.stringify({ choices: [{ message: { content: "Hubo 20.500 estudiantes [1]." } }] })));
    const handler = await boot(w);
    expect(await (await ask(handler, { question: "¿Cuántos estudiantes matriculados hay?" })).json()).toMatchObject({ kind: "ia" });
    expect(calls).toHaveLength(1);
    w.textUsed = 200;
    const out = (await (await ask(handler, { question: "¿Cuántos estudiantes hay matriculados?" })).json()) as Row;
    expect(out).toMatchObject({ kind: "extracto" });
    expect((out.trail as Row[]).at(-1)).toMatchObject({ step: "IA", detail: expect.stringContaining("cupo") });
    expect(calls).toHaveLength(1);
    // Y la voz tiene su propio tope: pasado, pide la del navegador (429) sin tocar al proveedor.
    const voice = await ask(handler, { action: "voz", text: "Hola." });
    expect(voice.status).toBe(429);
    expect(await voice.json()).toMatchObject({ code: "limite" });
  });
});

describe("límite por visitante y tamaño", () => {
  it("pasado el límite responde 429 con Retry-After, y solo guarda una huella", async () => {
    const w = world();
    w.hits = 20;
    const calls = provider(stream("no debería llamarse"));
    const response = await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true });
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await response.json()).toMatchObject({ code: "visitante", retry_after: expect.any(Number) });
    expect(calls).toHaveLength(0);
    expect(w.visitors.length).toBe(2);
    for (const v of w.visitors) {
      expect(v).toMatch(/^[0-9a-f]{40}$/);
      expect(v).not.toContain("190.1.2.3");
    }
  });

  it("sin la migración 0110 no limita y sigue respondiendo", async () => {
    const w = world();
    w.noVisitorTable = true;
    provider(() => new Response(JSON.stringify({ choices: [{ message: { content: "Hubo 20.500 estudiantes [1]." } }] })));
    expect(await (await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?" })).json()).toMatchObject({ kind: "ia" });
  });

  it("con el límite en cero no cuenta a nadie", async () => {
    const w = world();
    w.settings.visitor_limit = 0;
    provider(() => new Response(JSON.stringify({ choices: [{ message: { content: "Hubo 20.500 estudiantes [1]." } }] })));
    await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?" });
    expect(w.rpcs).not.toContain("pilo_visitor_hit");
  });

  it("rechaza un pedido demasiado grande y recorta la pregunta", async () => {
    const w = world();
    const calls = provider(() => new Response(JSON.stringify({ choices: [{ message: { content: "Hubo 20.500 estudiantes [1]." } }] })));
    const handler = await boot(w);
    const huge = await ask(handler, { question: "¿hola?", history: [{ q: "x", a: "y".repeat(60_000) }] });
    expect(huge.status).toBe(413);
    await ask(handler, { question: `¿Cuántos estudiantes hay? ${"relleno ".repeat(200)}` });
    const sent = calls[0].body.messages as { content: string }[];
    expect(sent[sent.length - 1].content.length).toBeLessThanOrEqual(500);
  });
});

describe("probar la conexión", () => {
  const admin = { Authorization: "Bearer sesion-admin" };
  const okJson = () => new Response(JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }));

  it("ejerce la misma forma de mensajes de una pregunta real y dice cómo responde el modelo", async () => {
    const w = world();
    const calls = provider(okJson, stream("OK"));
    const response = await ask(await boot(w), { action: "probar" }, admin);
    expect(await response.json()).toMatchObject({ ok: true, model: "google/gemma-4-31b-it", system_role: "system", stream: "sse", reasoning: false, sample: "OK" });
    expect(calls.map(roles)).toEqual([
      ["system", "user", "assistant", "user"],
      ["system", "user", "assistant", "user"],
    ]);
    expect((calls[0].body.messages as { content: string }[])[0].content).toContain("Eres Mr. Pilo");
    expect(calls[1].body.stream).toBe(true);
    expect(w.logs.at(-1)).toMatchObject({ status: "listo", subject: expect.stringContaining("rol system aceptado") });
  });

  it("avisa si el modelo rechaza el rol system o ignora stream", async () => {
    const w = world();
    const calls = provider(() => new Response(JSON.stringify({ error: { message: "System role not supported" } }), { status: 400 }), okJson, okJson);
    const out = (await (await ask(await boot(w), { action: "probar" }, admin)).json()) as Row;
    expect(out).toMatchObject({ ok: true, system_role: "user", stream: "json" });
    expect(calls.map(roles)).toEqual([["system", "user", "assistant", "user"], ["user", "assistant", "user"], ["user", "assistant", "user"]]);
    expect(out.notes).toEqual(expect.arrayContaining([expect.stringContaining("rol system rechazado"), expect.stringContaining("ignora stream")]));
  });

  it("solo la administración la prueba", async () => {
    const response = await ask(await boot(world()), { action: "probar" });
    expect(response.status).toBe(403);
  });
});
