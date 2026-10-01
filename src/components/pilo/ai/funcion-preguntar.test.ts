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
  /** La búsqueda en la memoria falla (la base no responde). */
  memoryFails?: boolean;
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
          return w.memoryFails ? { data: null, error: { message: "tiempo agotado en la base" } } : { data: w.memory, error: null };
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
  vi.useRealTimers();
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

type Ev = { event: string; data: Record<string, unknown> };

const parseEvents = (text: string): Ev[] => {
  const sse = createSseParser();
  return [...sse.push(text), ...sse.flush()].map((e) => ({ event: e.event, data: JSON.parse(e.data) as Record<string, unknown> }));
};

/** Todos los eventos del flujo, en orden, con su JSON leído: también los pasos (`step`) y el razonamiento (`thinking`). */
const allEvents = async (response: Response): Promise<Ev[]> => parseEvents(await response.text());

/** Los eventos de siempre (meta, delta, done, error): lo que ve una página que ignora los opcionales. */
const events = async (response: Response): Promise<Ev[]> => (await allEvents(response)).filter((e) => e.event !== "step" && e.event !== "thinking");

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

  it("lo vetado responde con JSON, sin modelo; la capciosa es base del modelo", async () => {
    const w = world();
    w.catalog = [{ key: "C-001", kind: "capciosa", question: "", variants: [], triggers: ["tienes novia"], answer: "¡Solo tengo ojos para los datos!", mood: "atrevido", source_title: "", source_path: "", cut: "", office: "" }];
    const calls = provider(stream("Mi corazón es de los datos. "));
    const handler = await boot(w);
    const money = await ask(handler, { question: "¿Cuánto presupuesto tiene el pilar II?", stream: true });
    expect(money.headers.get("Content-Type")).toContain("application/json");
    expect(await money.json()).toMatchObject({ kind: "regla", intent: "vetado", sources: [], text: expect.stringContaining("presupuesto") });
    expect(calls).toHaveLength(0);
    // La capciosa ya no sale sola: su microexpresión va en [OFICIAL] y escribe el modelo.
    const tricky = await events(await ask(handler, { question: "Pilo, ¿tienes novia?", stream: true }));
    expect(calls).toHaveLength(1);
    const prompt = (calls[0].body.messages as { content: string }[]).map((m) => m.content).join(" ");
    expect(prompt).toContain("[OFICIAL]");
    expect(prompt).toContain("¡Solo tengo ojos para los datos!");
    expect(tricky[tricky.length - 1].data).toMatchObject({ kind: "ia", text: expect.stringContaining("Mi corazón es de los datos") });
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
    // Los pasos y su resumen son del flujo: el JSON sigue como estaba.
    expect(data.steps).toBeUndefined();
    expect(data.seconds).toBeUndefined();
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

/** Un flujo del proveedor con los `delta` que se le den (contenido, razonamiento o ambos). */
const deltas = (...parts: Row[]) => () =>
  new Response([...parts.map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`), `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`, "data: [DONE]\n\n"].join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });

type StepData = { id: string; label: string; detail?: string; state: string };
const stepsOf = (all: Ev[]) => all.filter((e) => e.event === "step").map((e) => e.data as unknown as StepData);
const at = (all: Ev[], event: string, id?: string, state?: string) => all.findIndex((e) => e.event === event && (!id || (e.data.id === id && e.data.state === state)));
/** Cada paso empieza una vez y termina una vez, en ese orden. */
const expectClosed = (steps: StepData[]) => {
  for (const id of new Set(steps.map((s) => s.id))) expect(steps.filter((s) => s.id === id).map((s) => s.state)).toEqual(["start", "done"]);
};

describe("lo que Pilo va haciendo (step)", () => {
  it("cuenta cada paso en el orden real: step… → meta → delta… → done, y cierra todos", async () => {
    const w = world();
    provider(stream("En 2024 hubo 20.500 estudiantes matriculados [1]. ", "Es la cifra de toda la UDES [1]."));
    const response = await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true });
    const all = await allEvents(response);
    expect(all[0]).toEqual({ event: "step", data: { id: "entender", label: "Entendiendo la pregunta", state: "start" } });
    expect(all[1].data).toEqual({ id: "entender", label: "Entendiendo la pregunta", detail: "pregunta sobre la UDES", state: "done" });
    expect(all[all.length - 1].event).toBe("done");
    const steps = stepsOf(all);
    expectClosed(steps);
    expect([...new Set(steps.map((s) => s.id))]).toEqual(["entender", "catalogo", "guardadas", "cifras", "memoria", "redactar", "verificar"]);
    // Las capas de la búsqueda empiezan todas antes de que termine la primera.
    const search = ["catalogo", "guardadas", "cifras", "memoria"];
    const lastStart = Math.max(...search.map((id) => at(all, "step", id, "start")));
    const firstDone = Math.min(...search.map((id) => at(all, "step", id, "done")));
    expect(lastStart).toBeLessThan(firstDone);
    // meta llega con la búsqueda terminada; redactar empieza antes del primer trozo y termina después del último.
    const meta = at(all, "meta");
    const firstDelta = at(all, "delta");
    const lastDelta = all.map((e) => e.event).lastIndexOf("delta");
    expect(Math.max(...search.map((id) => at(all, "step", id, "done")))).toBeLessThan(meta);
    expect(at(all, "step", "redactar", "start")).toBeGreaterThan(meta);
    expect(at(all, "step", "redactar", "start")).toBeLessThan(firstDelta);
    expect(at(all, "step", "redactar", "done")).toBeGreaterThan(lastDelta);
    expect(at(all, "step", "verificar", "start")).toBeGreaterThan(at(all, "step", "redactar", "done"));
    expect(at(all, "step", "verificar", "done")).toBe(all.length - 2);
    // Los detalles son cuentas ciertas, sin contenido de los pasajes ni nada interno.
    const detail = (id: string, state: string) => steps.find((s) => s.id === id && s.state === state)?.detail;
    expect(detail("catalogo", "done")).toBe("sin resultados");
    expect(detail("guardadas", "done")).toBe("sin resultados");
    expect(detail("cifras", "done")).toBe("sin resultados");
    expect(detail("memoria", "done")).toBe("1 pasaje");
    expect(detail("redactar", "start")).toBe("con 1 pasaje");
    expect(detail("redactar", "done")).toBe("con 1 pasaje");
    expect(detail("verificar", "done")).toBe("cada número está en las fuentes");
    const said = JSON.stringify(steps).toLowerCase();
    for (const secret of ["20.500", "nvidia", "gemma", "pilo_", "clave", "rank", "%"]) expect(said).not.toContain(secret);
    // El resumen queda en done, para guardar «cómo respondí»; lo demás de done no cambia.
    const done = all[all.length - 1].data;
    expect(done).toMatchObject({ kind: "ia", grounding: "oficial", verified: true, answerId: 77 });
    expect((done.steps as Row[]).map((s) => s.id).sort()).toEqual(["catalogo", "cifras", "entender", "guardadas", "memoria", "redactar", "verificar"]);
    for (const s of done.steps as Row[]) expect(s).toMatchObject({ label: expect.any(String), ms: expect.any(Number) });
    expect(done.seconds).toEqual(expect.any(Number));
  });

  it("dice lo que entendió de un seguimiento y solo busca donde tiene sentido", async () => {
    const w = world();
    provider(stream("En Cúcuta no tengo la cifra publicada. "));
    const all = await allEvents(await ask(await boot(w), { question: "¿y en Cúcuta?", history: [{ q: "¿Cuántos estudiantes matriculados hay?", a: "En 2024 hubo 20.500 [1]." }], stream: true }));
    const steps = stepsOf(all);
    expect(steps.find((s) => s.id === "entender" && s.state === "done")?.detail).toBe("sigue la conversación · sede Cúcuta");
    // Un seguimiento no va solo al catálogo ni a las guardadas: esos pasos no se anuncian.
    expect(steps.some((s) => s.id === "catalogo" || s.id === "guardadas")).toBe(false);
    expect(steps.some((s) => s.id === "cifras")).toBe(true);
    expectClosed(steps);
  });

  it("con cifras en vivo dice cuántas y de qué indicador, sin el valor", async () => {
    const w = world();
    w.facts = [
      {
        ref: "permanencia",
        report: "Permanencia",
        label: "Tasa de permanencia",
        unit: "%",
        format: "percent",
        definition: "",
        office: "Registro",
        path: "/cifras/permanencia",
        period: "anual",
        illustrative: false,
        rank: 0.9,
        series: [
          { y: 2023, t: null, c: "", v: 87.5 },
          { y: 2024, t: null, c: "", v: 88.25 },
        ],
      },
    ];
    provider(stream("En 2024 la permanencia fue la publicada [1]. "));
    const all = await allEvents(await ask(await boot(w), { question: "¿Cuál fue la tasa de permanencia en 2024?", stream: true }));
    const steps = stepsOf(all);
    expect(steps.find((s) => s.id === "entender" && s.state === "done")?.detail).toBe("pregunta sobre la UDES · año 2024");
    expect(steps.find((s) => s.id === "cifras" && s.state === "done")?.detail).toBe("1 cifra de Tasa de permanencia 2024");
    expect(steps.find((s) => s.id === "redactar" && s.state === "start")?.detail).toMatch(/^con 1 indicador/);
    expect(JSON.stringify(steps)).not.toMatch(/88|87/);
    expectClosed(steps);
  });

  it("si no hay nada institucional, lo dice sin rodeos", async () => {
    const w = world();
    w.memory = [];
    provider(stream("La capital de Francia es París. "));
    const all = await allEvents(await ask(await boot(w), { question: "¿Cuál es la capital de Francia?", stream: true }));
    const steps = stepsOf(all);
    expect(steps.find((s) => s.id === "memoria" && s.state === "done")?.detail).toBe("sin resultados");
    expect(steps.find((s) => s.id === "redactar" && s.state === "start")?.detail).toBe("No hay datos de la UDES sobre esto; respondo con conocimiento general");
    expect(steps.find((s) => s.id === "verificar" && s.state === "done")?.detail).toBe("sin cifras de la UDES que verificar");
  });

  it("un saludo no anuncia búsquedas", async () => {
    provider(stream("¡Hola! Soy Mr. Pilo. "));
    const all = await allEvents(await ask(await boot(world()), { question: "hola pilo", stream: true }));
    expect([...new Set(stepsOf(all).map((s) => s.id))]).toEqual(["entender", "redactar", "verificar"]);
    expect(stepsOf(all)[1].detail).toBe("es un saludo");
  });

  it("si el proveedor falla, los pasos se cierran igual y el final sigue siendo done o error", async () => {
    const w = world();
    provider(() => new Response(JSON.stringify({ error: { message: "Internal error" } }), { status: 500 }));
    const all = await allEvents(await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true }));
    const steps = stepsOf(all);
    expectClosed(steps);
    expect(steps.find((s) => s.id === "redactar" && s.state === "done")?.detail).toBe("el modelo no respondió");
    expect(steps.some((s) => s.id === "verificar")).toBe(false);
    expect(all[all.length - 1].event).toBe("done");
    expect(all[all.length - 1].data).toMatchObject({ kind: "extracto", fallback: "proveedor", steps: expect.any(Array) });
    // Sin nada publicado, termina en error, también con los pasos cerrados.
    const w2 = world();
    w2.memory = [];
    const bad = await allEvents(await ask(await boot(w2), { question: "¿Cuál es la capital de Francia?", stream: true }));
    expect(bad[bad.length - 1].event).toBe("error");
    expectClosed(stepsOf(bad));
  });

  it("si la búsqueda falla con el flujo ya abierto, termina en un evento error con los pasos cerrados", async () => {
    const w = world();
    w.memoryFails = true;
    const calls = provider(stream("no debería llamarse"));
    const response = await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const all = await allEvents(response);
    expect(all[all.length - 1]).toMatchObject({ event: "error", data: { code: "memoria", message: expect.stringContaining("buscar en lo publicado") } });
    expect(all.filter((e) => e.event === "error" || e.event === "done")).toHaveLength(1);
    expectClosed(stepsOf(all));
    expect(calls).toHaveLength(0);
    expect(w.logs.some((l) => String(l.status).startsWith("error · buscar"))).toBe(true);
    // Sin stream, el mismo fallo sigue siendo el error HTTP de siempre.
    const w2 = world();
    w2.memoryFails = true;
    const plain = await ask(await boot(w2), { question: "¿Cuántos estudiantes matriculados hay?" });
    expect(plain.status).toBe(502);
    expect(await plain.json()).toMatchObject({ code: "memoria" });
  });
});

describe("lo que Pilo piensa (thinking)", () => {
  it("el razonamiento aparte va como thinking, antes de escribir, y no entra en la respuesta", async () => {
    const w = world();
    provider(
      deltas(
        { reasoning_content: "Me preguntan por los matriculados. " },
        { reasoning_content: "La fuente 1 trae la cifra de 2024; no son 99.999. " },
        { reasoning_content: "El presupuesto sería de $ 5.000.000.000. " },
        { reasoning_content: "Respondo corto" },
        { content: "En 2024 hubo 20.500 estudiantes matriculados [1]. " },
        { reasoning_content: "Esto ya llegó tarde. " },
        { content: "Es la cifra de toda la UDES [1]." },
      ),
    );
    const all = await allEvents(await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true }));
    const thinking = all.filter((e) => e.event === "thinking").map((e) => String(e.data.text)).join("");
    expect(thinking).toBe("Me preguntan por los matriculados. La fuente 1 trae la cifra de 2024; no son 99.999. Respondo corto");
    // Todo el razonamiento sale antes del primer trozo de la respuesta y después de empezar a redactar.
    const kinds = all.map((e) => e.event);
    expect(kinds.lastIndexOf("thinking")).toBeLessThan(kinds.indexOf("delta"));
    expect(kinds.indexOf("thinking")).toBeGreaterThan(at(all, "step", "redactar", "start"));
    // Ni la cifra de dinero ni lo que llegó tarde se muestran.
    expect(JSON.stringify(all)).not.toContain("5.000.000.000");
    expect(JSON.stringify(all)).not.toContain("llegó tarde");
    // La respuesta, lo guardado y la revisión de cifras no ven el razonamiento.
    const done = all[all.length - 1].data;
    expect(done).toMatchObject({ kind: "ia", text: "En 2024 hubo 20.500 estudiantes matriculados [1]. Es la cifra de toda la UDES [1].", verified: true, unknown: [] });
    expect(JSON.stringify(done)).not.toContain("Me preguntan");
    expect(all.filter((e) => e.event === "delta").map((e) => e.data.text).join("")).toBe(done.text);
    expect(w.saved).toHaveLength(1);
    expect(w.saved[0].answer).toBe(done.text);
  });

  it("un bloque <think> partido entre trozos también sale como thinking y fuera del texto", async () => {
    const w = world();
    provider(deltas({ content: "<thi" }, { content: "nk>Busco la cifra. Está en la fuente 1.</th" }, { content: "ink>En 2024 hubo 20.500 estudiantes [1]. " }, { content: "Listo." }));
    const all = await allEvents(await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true }));
    expect(all.filter((e) => e.event === "thinking").map((e) => e.data.text).join("")).toBe("Busco la cifra. Está en la fuente 1.");
    const shown = all.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
    expect(shown).toBe("En 2024 hubo 20.500 estudiantes [1]. Listo.");
    expect(all[all.length - 1].data).toMatchObject({ kind: "ia", text: shown });
    expect(JSON.stringify(all.filter((e) => e.event !== "thinking"))).not.toContain("Busco la cifra");
  });

  it("un modelo que no razona no manda thinking, y sin stream el razonamiento no aparece", async () => {
    const w = world();
    provider(stream("En 2024 hubo 20.500 estudiantes [1]. "));
    const all = await allEvents(await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true }));
    expect(all.some((e) => e.event === "thinking")).toBe(false);
    provider(() => new Response(JSON.stringify({ choices: [{ message: { reasoning_content: "Pienso en secreto.", content: "<think>y aquí</think>En 2024 hubo 20.500 estudiantes [1]." }, finish_reason: "stop" }] })));
    const plain = await (await ask(await boot(world()), { question: "¿Cuántos estudiantes matriculados hay?" })).text();
    expect(JSON.parse(plain)).toMatchObject({ kind: "ia", text: "En 2024 hubo 20.500 estudiantes [1]." });
    expect(plain).not.toContain("secreto");
    expect(plain).not.toContain("y aquí");
  });

  it("le pide al modelo razonar en español y breve, sin exigirlo", async () => {
    const calls = provider(stream("Hola. "));
    await allEvents(await ask(await boot(world()), { question: "¿Cuántos estudiantes matriculados hay?", stream: true }));
    const system = (calls[0].body.messages as { content: string }[])[0].content;
    expect(system).toMatch(/Si antes de responder razonas aparte, hazlo en español y con brevedad/);
  });
});

describe("el flujo se mantiene vivo y se suelta", () => {
  it("mientras el modelo no da su primera palabra van comentarios «: ping», sin dañar los eventos", async () => {
    const w = world();
    const handler = await boot(w);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    let release: (r: Response) => void = () => undefined;
    const called = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        called();
        return new Promise<Response>((ok) => (release = ok));
      }),
    );
    const response = await ask(handler, { question: "¿Cuántos estudiantes matriculados hay?", stream: true });
    const reading = response.text();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(called).toHaveBeenCalledTimes(1);
    release(stream("En 2024 hubo 20.500 estudiantes [1]. ")());
    const text = await reading;
    expect(text.match(/^: ping$/gm)).toHaveLength(2);
    // Los comentarios caen entre eventos enteros: todo lo demás se lee igual.
    for (const block of text.split("\n\n").filter(Boolean)) expect(block).toMatch(/^(: ping|event: \w+\ndata: \{.*\})$/s);
    const all = parseEvents(text);
    expect(all[all.length - 1]).toMatchObject({ event: "done", data: { kind: "ia", text: "En 2024 hubo 20.500 estudiantes [1]." } });
    expect(all.map((e) => e.event).indexOf("delta")).toBeGreaterThan(-1);
    // Al terminar, el latido se detiene.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("si la página se va, se cancela el pedido al proveedor", async () => {
    const w = world();
    const seen: { signal: AbortSignal | null } = { signal: null };
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        seen.signal = init.signal ?? null;
        return new Promise<Response>((_ok, fail) => init.signal?.addEventListener("abort", () => fail(new DOMException("cancelado", "AbortError"))));
      }),
    );
    const response = await ask(await boot(w), { question: "¿Cuántos estudiantes matriculados hay?", stream: true });
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("event: step");
    await vi.waitFor(() => expect(seen.signal).not.toBeNull());
    expect(seen.signal?.aborted).toBe(false);
    await reader.cancel();
    expect(seen.signal?.aborted).toBe(true);
    await vi.waitFor(() => expect(w.logs.some((l) => l.status === "cancelado")).toBe(true));
    expect(w.saved).toEqual([]);
  });
});
