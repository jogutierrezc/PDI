/* =============================================================================
   Mr. Pilo en Alexa · lo que no necesita un parlante.

   La skill (alexa/pilo-skill/lambda) le pregunta a la función pilo-ia y dice
   la respuesta. Aquí se comprueba, sin Alexa ni red:
     · que el pedido es el del portal y lleva la conversación;
     · que una respuesta completa, una a medias y una que no llega a tiempo se
       distinguen, y que nunca se dice una frase sin terminar;
     · que lo que se dice no trae Markdown, citas, enlaces ni código;
     · que el modelo de voz tiene un intent por cada palabra interrogativa.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error La skill es JavaScript: no trae tipos.
import { askBody, askPilo, buildHistory, collectPilo, createSseReader } from "../../alexa/pilo-skill/lambda/pilo.js";
// @ts-expect-error La skill es JavaScript: no trae tipos.
import { cardText, clip, completeSentences, escapeSsml, toPlain, toSpeech, waitSpeech } from "../../alexa/pilo-skill/lambda/speech.js";

const ENV = { SUPABASE_URL: "https://x.supabase.co/", SUPABASE_ANON_KEY: "anon" };
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** Una respuesta con flujo: manda los trozos y, si `close` es falso, se queda abierta (Pilo sigue escribiendo). */
function streamOf(chunks: string[], close = true) {
  return (_url: string, init: { signal: AbortSignal }) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        if (close) controller.close();
        else init.signal.addEventListener("abort", () => controller.error(Object.assign(new Error("aborted"), { name: "AbortError" })));
      },
    });
    return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
  };
}

describe("el pedido", () => {
  it("es el del portal, con la conversación recortada", () => {
    const turns = Array.from({ length: 5 }, (_, i) => ({ q: `pregunta ${i}`, a: "respuesta ".repeat(100) }));
    const body = askBody("¿cuántos programas hay?", turns, {});
    expect(body).toMatchObject({ action: "preguntar", portal: "pregunta", question: "¿cuántos programas hay?", stream: true });
    expect(body.history).toHaveLength(3);
    expect(body.history[2].q).toBe("pregunta 4");
    expect(body.history[0].a.length).toBeLessThanOrEqual(600);
    expect(body).not.toHaveProperty("rol");
    expect(buildHistory([{ q: "", a: "x" }, null, { q: "a" }])).toEqual([]);
  });

  it("el otro Pilo se elige en la configuración, con su rol", () => {
    expect(askBody("hola", [], { PILO_PORTAL: "ensenanza", PILO_ROL: "profesor" })).toMatchObject({ portal: "ensenanza", rol: "profesor" });
    expect(askBody("hola", [], { PILO_PORTAL: "otro", PILO_ROL: "profesor" })).toMatchObject({ portal: "pregunta" });
    expect(askBody("hola", [], { PILO_PORTAL: "ensenanza", PILO_ROL: "rector" })).not.toHaveProperty("rol");
  });

  it("va con la clave anónima a la función pilo-ia", async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null;
    const fetchImpl = (url: string, init: { headers: Record<string, string> }) => {
      seen = { url, headers: init.headers };
      return Promise.resolve(new Response(JSON.stringify({ kind: "regla", text: "Hola.", sources: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    };
    const r = await askPilo({ question: "hola", env: ENV, fetchImpl });
    expect(r).toMatchObject({ status: "done", text: "Hola.", kind: "regla" });
    expect(seen).toMatchObject({ url: "https://x.supabase.co/functions/v1/pilo-ia", headers: { apikey: "anon", Authorization: "Bearer anon" } });
  });

  it("sin configurar, lo dice", async () => {
    expect(await askPilo({ question: "hola", env: {}, fetchImpl: () => Promise.reject(new Error("no")) })).toMatchObject({ status: "error" });
  });
});

describe("la respuesta que llega por partes", () => {
  it("los eventos pueden llegar partidos entre un trozo y otro", () => {
    const read = createSseReader();
    const whole = frame("delta", { text: "Hola" }) + frame("done", { text: "Hola." });
    expect(read(whole.slice(0, 20))).toEqual([]);
    expect(read(whole.slice(20)).map((e: { event: string }) => e.event)).toEqual(["delta", "done"]);
  });

  it("completa: vale lo que dice «done»", async () => {
    const r = await askPilo({ question: "x y", env: ENV, fetchImpl: streamOf([frame("step", { id: "memoria" }), frame("delta", { text: "La UDES" }), frame("done", { kind: "ia", text: "La UDES tiene tres sedes [1].", asked: "¿Cuántas sedes tiene?", sources: [{ title: "UDES en Cifras" }] })]) });
    expect(r).toEqual({ status: "done", kind: "ia", text: "La UDES tiene tres sedes [1].", asked: "¿Cuántas sedes tiene?", sources: [{ title: "UDES en Cifras" }] });
  });

  it("a medias: solo las frases completas de lo que alcanzó a escribir", async () => {
    const chunks = [frame("delta", { text: "La Universidad de Santander tiene tres sedes [1]. La principal está en Bucara" })];
    const r = await askPilo({ question: "x y", env: ENV, deadlineMs: 60, fetchImpl: streamOf(chunks, false) });
    expect(r).toEqual({ status: "partial", text: "La Universidad de Santander tiene tres sedes." });
  });

  it("si no alcanzó a escribir nada, no se inventa nada", async () => {
    expect(await askPilo({ question: "x y", env: ENV, deadlineMs: 60, fetchImpl: streamOf([frame("step", { id: "memoria" })], false) })).toEqual({ status: "slow" });
    expect(await askPilo({ question: "x y", env: ENV, deadlineMs: 60, fetchImpl: streamOf([frame("delta", { text: "La Universidad de" })], false) })).toEqual({ status: "slow" });
  });

  it("un error del servidor se dice con sus palabras", async () => {
    const limit = () => Promise.resolve(new Response(JSON.stringify({ error: "Va muy rápido.", advice: "Espere 30 s." }), { status: 429, headers: { "content-type": "application/json" } }));
    expect(await askPilo({ question: "x y", env: ENV, fetchImpl: limit })).toEqual({ status: "error", message: "Va muy rápido. Espere 30 s." });
    expect(await askPilo({ question: "x y", env: ENV, fetchImpl: streamOf([frame("error", { message: "El proveedor falló." })]) })).toEqual({ status: "error", message: "El proveedor falló." });
    expect(await askPilo({ question: "x y", env: ENV, fetchImpl: () => Promise.reject(new Error("red")) })).toMatchObject({ status: "error", message: expect.stringMatching(/No pude conectarme/) });
  });
});

describe("la respuesta que se recoge después", () => {
  const TICKET = "3f2b8c1e-5a47-4d09-9b61-0c7e2a1d4f58";
  const reply = (status: number, body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("con tiquete, el pedido lo lleva y lo que no alcanza a llegar queda esperando, no a medias", async () => {
    expect(askBody("hola", [], {}, TICKET)).toMatchObject({ espera: TICKET });
    expect(askBody("hola", [], {})).not.toHaveProperty("espera");
    const writing = [frame("delta", { text: "La Universidad de Santander tiene tres sedes [1]. La principal está en Bucara" })];
    expect(await askPilo({ question: "x y", ticket: TICKET, env: ENV, deadlineMs: 60, fetchImpl: streamOf(writing, false) })).toEqual({ status: "waiting", writing: true });
    expect(await askPilo({ question: "x y", ticket: TICKET, env: ENV, deadlineMs: 60, fetchImpl: streamOf([frame("step", { id: "memoria" })], false) })).toEqual({ status: "waiting", writing: false });
  });

  it("recoger pide la respuesta del tiquete y distingue lista, pendiente, perdida y con error", async () => {
    let sent: Record<string, unknown> = {};
    const ready = (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      return reply(200, { status: "lista", kind: "ia", text: "Tres sedes [1].", asked: "", sources: [{ n: 1, title: "UDES en Cifras", path: "/cifras" }] })();
    };
    expect(await collectPilo({ ticket: TICKET, env: ENV, fetchImpl: ready })).toEqual({ status: "done", kind: "ia", text: "Tres sedes [1].", asked: "", sources: [{ n: 1, title: "UDES en Cifras", path: "/cifras" }] });
    expect(sent).toMatchObject({ action: "recoger", portal: "pregunta", espera: TICKET });
    expect(await collectPilo({ ticket: TICKET, env: ENV, fetchImpl: reply(200, { status: "pendiente" }) })).toEqual({ status: "waiting" });
    expect(await collectPilo({ ticket: TICKET, env: ENV, fetchImpl: reply(404, { status: "desconocida" }) })).toEqual({ status: "gone" });
    expect(await collectPilo({ ticket: TICKET, env: ENV, fetchImpl: reply(500, { error: "Falta 0128.", code: "migracion" }) })).toEqual({ status: "gone" });
    expect(await collectPilo({ ticket: TICKET, env: ENV, fetchImpl: reply(200, { status: "error", message: "El proveedor falló." }) })).toEqual({ status: "error", message: "El proveedor falló." });
    const late = () => Promise.reject(Object.assign(new Error("tarde"), { name: "TimeoutError" }));
    expect(await collectPilo({ ticket: TICKET, env: ENV, fetchImpl: late })).toEqual({ status: "waiting" });
  });

  it("la espera se llena con pausas de las que admite Alexa y avisos entre una y otra", () => {
    const speech = waitSpeech("Ya se la busco.", 40);
    const pauses = [...speech.matchAll(/<break time="(\d+)s"\/>/g)].map((m) => Number(m[1]));
    expect(speech.startsWith("Ya se la busco. <break")).toBe(true);
    expect(pauses.every((p) => p >= 1 && p <= 10)).toBe(true);
    expect(pauses.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(34);
    expect(pauses.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(40);
    expect(speech).toContain("Sigo buscando.");
    expect(waitSpeech("Ya casi.", 0)).toBe("Ya casi.");
  });
});

describe("la conversación con Alexa", () => {
  type Reply = { response: { outputSpeech?: { ssml: string }; shouldEndSession?: boolean }; sessionAttributes: Record<string, unknown> };
  const envelope = (intent: string, attributes: Record<string, unknown>, slot?: string) => ({
    version: "1.0",
    session: { new: false, sessionId: "s", application: { applicationId: "amzn1.ask.skill.prueba" }, attributes, user: { userId: "u" } },
    context: { System: { application: { applicationId: "amzn1.ask.skill.prueba" }, user: { userId: "u" }, device: { deviceId: "d", supportedInterfaces: {} } } },
    request: { type: "IntentRequest", requestId: "r", timestamp: new Date().toISOString(), locale: "es-US", intent: { name: intent, confirmationStatus: "NONE", ...(slot ? { slots: { consulta: { name: "consulta", value: slot, confirmationStatus: "NONE" } } } : {}) } },
  });
  const jsonReply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("si Pilo no alcanza, Alexa llena la espera y con el «sí» dice la respuesta", async () => {
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("PILO_WAIT_SECONDS", "20");
    // @ts-expect-error La skill es JavaScript: no trae tipos.
    const skill = await import("../../alexa/pilo-skill/lambda/index.js");
    const turn = (event: unknown) => new Promise<Reply>((ok, fail) => skill.handler(event, {}, (error: Error | null, result: Reply) => (error ? fail(error) : ok(result))));
    const bodies: Record<string, unknown>[] = [];

    // Primer turno: el servidor abre el flujo y no termina; la skill corta al cumplirse su plazo.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", (url: string, init: { body: string; signal: AbortSignal }) => {
      bodies.push(JSON.parse(init.body));
      return streamOf([frame("step", { id: "memoria" })], false)(url, init);
    });
    const asking = turn(envelope("PreguntaCuantosIntent", {}, "estudiantes tiene la universidad"));
    await vi.advanceTimersByTimeAsync(7000);
    const first = await asking;
    vi.useRealTimers();
    expect(bodies[0]).toMatchObject({ action: "preguntar", question: "¿cuántos estudiantes tiene la universidad?" });
    const ticket = String(bodies[0].espera);
    expect(ticket).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.response.outputSpeech?.ssml).toMatch(/Ya se la busco\. <break time="9s"\/>.*¿Le digo lo que encontré\?<\/speak>$/);
    expect(first.response.shouldEndSession).toBe(false);
    expect(first.sessionAttributes.pending).toMatchObject({ ticket, question: "¿cuántos estudiantes tiene la universidad?" });
    // La espera no es lo que se repite.
    expect(first.sessionAttributes.last).toBeUndefined();

    // Segundo turno: aún no está. Otra espera corta, con el mismo tiquete.
    vi.stubGlobal("fetch", (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return Promise.resolve(jsonReply({ status: "pendiente" }));
    });
    const second = await turn(envelope("AMAZON.YesIntent", first.sessionAttributes));
    expect(bodies[1]).toMatchObject({ action: "recoger", espera: ticket });
    expect(second.response.outputSpeech?.ssml).toContain("Todavía la estoy redactando.");
    expect(second.sessionAttributes.pending).toMatchObject({ ticket });

    // Tercer turno: ya está. Se dice sin citas y entra a la conversación.
    vi.stubGlobal("fetch", () => Promise.resolve(jsonReply({ status: "lista", kind: "ia", text: "En 2025 hubo 17.370 estudiantes [1].", asked: "", sources: [{ n: 1, title: "UDES en Cifras", path: "" }] })));
    const third = await turn(envelope("AMAZON.YesIntent", second.sessionAttributes));
    expect(third.response.outputSpeech?.ssml).toBe("<speak>En 2025 hubo 17.370 estudiantes. ¿Qué más quiere saber?</speak>");
    expect(third.sessionAttributes.pending).toBeUndefined();
    expect(third.sessionAttributes.turns).toEqual([{ q: "¿cuántos estudiantes tiene la universidad?", a: "En 2025 hubo 17.370 estudiantes." }]);

    // «No» con una pregunta esperando la deja; sin ninguna, se despide.
    const left = await turn(envelope("AMAZON.NoIntent", second.sessionAttributes));
    expect(left.sessionAttributes.pending).toBeUndefined();
    expect(left.response.shouldEndSession).toBe(false);
    expect((await turn(envelope("AMAZON.NoIntent", third.sessionAttributes))).response.shouldEndSession).toBe(true);

    // Si el servidor no guardó la espera (falta 0128), se dice que no alcanzó.
    vi.stubGlobal("fetch", () => Promise.resolve(jsonReply({ status: "desconocida" }, 404)));
    const gone = await turn(envelope("AMAZON.YesIntent", first.sessionAttributes));
    expect(gone.response.outputSpeech?.ssml).toContain("más tiempo del que tengo aquí");
    expect(gone.sessionAttributes.pending).toBeUndefined();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

describe("lo que se dice", () => {
  it("sin Markdown, citas, enlaces ni código", () => {
    const text = "## Sedes\n\nLa **UDES** tiene tres sedes [1][2]:\n\n- Bucaramanga\n- Cúcuta\n- Valledupar\n\nVea [el informe](https://udes.edu.co/informe) o https://udes.edu.co.\n\n```sql\nselect 1\n```";
    expect(toPlain(text)).toBe("Sedes. La UDES tiene tres sedes: Bucaramanga. Cúcuta. Valledupar. Vea el informe o.");
  });

  it("una frase sin terminar no se dice", () => {
    expect(completeSentences("Primera frase. Segunda fra")).toBe("Primera frase.");
    expect(completeSentences("Primera frase. Segunda frase.")).toBe("Primera frase. Segunda frase.");
    expect(completeSentences("Sin terminar")).toBe("");
  });

  it("se recorta en una frase completa y avisa que hay más", () => {
    const long = "Esta es una frase de prueba. ".repeat(60).trim();
    const { text, cut } = clip(long, 200);
    expect(cut).toBe(true);
    expect(text.length).toBeLessThanOrEqual(200);
    expect(text.endsWith(".")).toBe(true);
    expect(clip("Corta.", 200)).toEqual({ text: "Corta.", cut: false });
    expect(toSpeech(long, 200).cut).toBe(true);
  });

  it("queda lista para SSML", () => {
    expect(escapeSsml(`Ciencia & "Tecnología" <hoy>`)).toBe("Ciencia &amp; &quot;Tecnología&quot; &lt;hoy&gt;");
    expect(toSpeech("I+D & más").speech).toBe("I+D &amp; más.");
  });

  it("la tarjeta lleva la respuesta y sus fuentes, sin repetir", () => {
    expect(cardText("Tres sedes [1].", [{ title: "UDES en Cifras" }, { title: "UDES en Cifras" }, { title: "PDI" }])).toBe("Tres sedes.\n\nFuentes: UDES en Cifras; PDI.");
    expect(cardText("Hola.", [])).toBe("Hola.");
  });
});

describe("el modelo de voz", () => {
  const root = resolve(__dirname, "../../alexa/pilo-skill");
  const model = JSON.parse(readFileSync(resolve(root, "skill-package/interactionModels/custom/es-MX.json"), "utf8")).interactionModel.languageModel;
  const code = readFileSync(resolve(root, "lambda/index.js"), "utf8");

  it("cada intent de pregunta que atiende la skill está en el modelo, y al revés", () => {
    const inCode = [...code.slice(code.indexOf("QUESTION_WORD = {"), code.indexOf("};", code.indexOf("QUESTION_WORD = {"))).matchAll(/^\s+(\w+Intent):/gm)].map((m) => m[1]).sort();
    const inModel = model.intents.filter((i: { slots?: unknown[] }) => i.slots?.length).map((i: { name: string }) => i.name).sort();
    expect(inCode.length).toBe(14);
    expect(inModel).toEqual(inCode);
  });

  it("toda frase con texto libre lleva una palabra fija delante, como exige Alexa", () => {
    const samples: string[] = model.intents.flatMap((i: { samples: string[] }) => i.samples);
    expect(samples.length).toBeGreaterThan(20);
    expect(samples.every((s) => /^\S.* \{consulta\}$/.test(s))).toBe(true);
    expect(new Set(samples).size).toBe(samples.length);
  });

  it("los tres idiomas en español usan el mismo modelo", () => {
    const read = (locale: string) => readFileSync(resolve(root, `skill-package/interactionModels/custom/${locale}.json`), "utf8");
    expect(read("es-US")).toBe(read("es-MX"));
    expect(read("es-ES")).toBe(read("es-MX"));
    expect(model.invocationName).toBe("mister pilo");
  });
});
