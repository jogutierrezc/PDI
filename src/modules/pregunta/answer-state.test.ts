import { describe, expect, it } from "vitest";
import { activeStep, badgeOf, compactThink, interruptedTurn, notesOf, reduceSteps, secondsText, showsSources, THINKING_KEEP, waitingLine } from "./answer-state";
import type { ThinkStep } from "./answer-state";
import type { AskMeta, AskResult, AskSource, AskThinkStep } from "../../components/pilo/ai/client";

const src = (n: number): AskSource => ({ n, ref: `cifras:${n}`, source: "cifras", title: `Fuente ${n}`, section: "", path: "/cifras", cut: "2024", office: "", excerpt: "" });
const answer = (over: Partial<AskResult>): AskResult => ({ kind: "ia", text: "Texto.", sources: [], trail: [], ...over });
const play = (events: AskThinkStep[]) => events.reduce<ThinkStep[]>(reduceSteps, []);

describe("la etiqueta de procedencia", () => {
  it("oficial, mixta y conocimiento general, según el grounding del servidor", () => {
    expect(badgeOf(answer({ grounding: "oficial", sources: [src(1)] }))).toMatchObject({ text: "Redactada con IA · con fuentes de la UDES", icon: "spark" });
    expect(badgeOf(answer({ grounding: "mixta", sources: [src(1)] }))?.text).toBe("Redactada con IA · parte es conocimiento general");
    expect(badgeOf(answer({ grounding: "general" }))).toEqual({ text: "Conocimiento general · no es información oficial de la UDES", tone: "general", icon: "globe" });
  });

  it("la marca de conocimiento general no depende solo del color: lleva glifo y frase", () => {
    const badge = badgeOf(answer({ grounding: "general" }));
    expect(badge?.icon).toBeTruthy();
    expect(badge?.text).toMatch(/no es información oficial/);
  });

  it("un saludo o una charla no llevan etiqueta de fuentes", () => {
    expect(badgeOf(answer({ intent: "saludo", grounding: "general" }))).toBeNull();
    expect(badgeOf(answer({ intent: "charla" }))).toBeNull();
  });

  it("ya no dice «sin IA»: las respuestas sin modelo dicen de dónde salen", () => {
    for (const kind of ["curada", "memoria", "extracto", "dato", "malla", "capciosa", "regla", "nada"] as const) {
      const badge = badgeOf(answer({ kind }));
      expect(badge?.text, kind).toBeTruthy();
      expect(badge?.text, kind).not.toMatch(/sin IA/i);
    }
    expect(badgeOf(answer({ kind: "curada" }))?.text).toBe("Respuesta oficial de Planeación");
  });

  it("las conversaciones guardadas antes (sin grounding) siguen teniendo etiqueta", () => {
    expect(badgeOf(answer({ sources: [src(1)] }))?.text).toBe("Redactada con IA · con fuentes de la UDES");
    expect(badgeOf(answer({}))?.text).toBe("Redactada con IA");
  });

  it("una respuesta interrumpida se marca como incompleta", () => {
    expect(badgeOf(answer({ grounding: "oficial" }), true)).toMatchObject({ text: "Respuesta incompleta", tone: "aviso" });
  });

  it("con conocimiento general no se muestra la lista de fuentes", () => {
    expect(showsSources(answer({ grounding: "general", sources: [src(1)] }))).toBe(false);
    expect(showsSources(answer({ grounding: "mixta", sources: [src(1)] }))).toBe(true);
    expect(showsSources(answer({ kind: "memoria", sources: [src(1)] }))).toBe(true);
    expect(showsSources(answer({ grounding: "oficial" }))).toBe(false);
  });
});

describe("las notas discretas", () => {
  it("parcial: la frase del servidor; sin ella, una propia", () => {
    expect(notesOf(answer({ partial: true, notice: "El proveedor de IA tardó demasiado: esta respuesta quedó incompleta." }))).toEqual(["El proveedor de IA tardó demasiado: esta respuesta quedó incompleta."]);
    expect(notesOf(answer({ partial: true }))).toHaveLength(1);
  });

  it("corta, y la IA no respondió", () => {
    expect(notesOf(answer({ truncated: true }))).toEqual(["La respuesta quedó corta: llegó al tope de extensión."]);
    expect(notesOf(answer({ kind: "curada", fallback: "tiempo" }))).toEqual(["La IA no respondió: esta es la respuesta oficial, tal cual."]);
    expect(notesOf(answer({ kind: "extracto", fallback: "proveedor" }))[0]).toMatch(/le muestro lo publicado, tal cual/);
    expect(notesOf(answer({ grounding: "oficial" }))).toEqual([]);
  });
});

describe("los pasos de «Pensando…»", () => {
  it("un paso empieza y luego termina, en su sitio y con su detalle", () => {
    const steps = play([
      { id: "entender", label: "Entendiendo la pregunta", state: "start" },
      { id: "entender", label: "Entendiendo la pregunta", state: "done" },
      { id: "cifras", label: "Consultando las cifras", state: "start" },
      { id: "memoria", label: "Buscando en lo que conozco", state: "start" },
      { id: "cifras", label: "Consultando las cifras", detail: "2 cifras de Permanencia 2024", state: "done" },
    ]);
    expect(steps).toEqual([
      { id: "entender", label: "Entendiendo la pregunta", state: "done" },
      { id: "cifras", label: "Consultando las cifras", detail: "2 cifras de Permanencia 2024", state: "done" },
      { id: "memoria", label: "Buscando en lo que conozco", state: "start" },
    ]);
    expect(activeStep(steps)?.id).toBe("memoria");
  });

  it("un id desconocido se pinta igual; sin etiqueta, con su id", () => {
    expect(play([{ id: "algo-nuevo", label: "Cruzando con el Observatorio", state: "start" }])).toEqual([{ id: "algo-nuevo", label: "Cruzando con el Observatorio", state: "start" }]);
    expect(play([{ id: "x9", label: "", state: "start" }])[0].label).toBe("x9");
  });

  it("un start repetido no duplica el paso ni reabre uno terminado", () => {
    const steps = play([
      { id: "memoria", label: "Buscando en lo que conozco", state: "start" },
      { id: "memoria", label: "Buscando en lo que conozco", detail: "5 pasajes", state: "start" },
      { id: "memoria", label: "Buscando en lo que conozco", state: "done" },
      { id: "memoria", label: "Buscando en lo que conozco", state: "start" },
    ]);
    expect(steps).toEqual([{ id: "memoria", label: "Buscando en lo que conozco", detail: "5 pasajes", state: "done" }]);
  });

  it("un done sin start entra ya terminado", () => {
    const steps = play([{ id: "catalogo", label: "Revisando las respuestas oficiales", detail: "1 respuesta oficial", state: "done" }]);
    expect(steps).toEqual([{ id: "catalogo", label: "Revisando las respuestas oficiales", detail: "1 respuesta oficial", state: "done" }]);
    expect(activeStep(steps)).toBeNull();
  });

  it("lo que no trae id se ignora, y no cambia la lista", () => {
    const before = play([{ id: "a", label: "A", state: "start" }]);
    expect(reduceSteps(before, { id: " ", label: "sin id", state: "start" })).toBe(before);
    expect(reduceSteps(before, {} as AskThinkStep)).toBe(before);
    expect(reduceSteps(before, { id: "b", label: "B", state: "raro" as "start" })).toHaveLength(2);
  });

  it("no cambia la lista que recibe", () => {
    const before = play([{ id: "a", label: "A", state: "start" }]);
    const after = reduceSteps(before, { id: "a", label: "A", state: "done" });
    expect(before[0].state).toBe("start");
    expect(after[0].state).toBe("done");
  });
});

describe("el titular mientras Pilo trabaja", () => {
  const meta = (n: number): AskMeta => ({ asked: "", sources: Array.from({ length: n }, (_, i) => src(i + 1)), trail: [] });

  it("con pasos del servidor: el que está en curso, o el último terminado", () => {
    const steps = play([
      { id: "cifras", label: "Consultando las cifras", state: "done" },
      { id: "redactar", label: "Redactando la respuesta", state: "start" },
    ]);
    expect(waitingLine({ steps, meta: null, seconds: 5 })).toBe("Redactando la respuesta");
    // La redacción larga cuenta en qué anda, para que no parezca un cuelgue.
    expect(waitingLine({ steps, meta: null, seconds: 40 })).toBe("Revisando las fuentes para no inventar cifras…");
    expect(waitingLine({ steps, meta: null, seconds: 120 })).toBe("Ya casi: sigo esperando la respuesta del modelo…");
    expect(waitingLine({ steps: steps.slice(0, 1), meta: null, seconds: 1 })).toBe("Consultando las cifras");
  });

  it("sin pasos: una sola línea honesta que cambia con el tiempo", () => {
    expect(waitingLine({ steps: [], meta: null, seconds: 0 })).toBe("Buscando en lo que conozco…");
    expect(waitingLine({ steps: [], meta: null, seconds: 8 })).toBe("Redactando la respuesta…");
    expect(waitingLine({ steps: [], meta: null, seconds: 25 })).toBe("Esto está tardando más de lo normal; sigo en ello.");
  });

  it("sin pasos pero con meta: dice lo que encontró", () => {
    expect(waitingLine({ steps: [], meta: meta(4), seconds: 2 })).toBe("Encontré 4 fuentes. Redactando la respuesta…");
    expect(waitingLine({ steps: [], meta: meta(1), seconds: 2 })).toBe("Encontré 1 fuente. Redactando la respuesta…");
    expect(waitingLine({ steps: [], meta: meta(0), seconds: 2 })).toBe("Redactando la respuesta…");
  });

  it("los segundos, en palabras", () => {
    expect([secondsText(0.2), secondsText(12.4), secondsText(60), secondsText(65)]).toEqual(["1 s", "12 s", "1 min", "1 min 5 s"]);
  });
});

describe("lo que se guarda de «Pensando…»", () => {
  it("los pasos, el tiempo y solo el comienzo del razonamiento", () => {
    const think = compactThink(play([{ id: "redactar", label: "Redactando la respuesta", state: "start" }]), "razona ".repeat(400), 12.4);
    expect(think.seconds).toBe(12);
    expect(think.steps).toEqual([{ id: "redactar", label: "Redactando la respuesta", state: "done" }]);
    expect(think.thinking?.length).toBeLessThanOrEqual(THINKING_KEEP + 1);
    expect(think.thinking?.endsWith("…")).toBe(true);
  });

  it("sin razonamiento no guarda el campo", () => {
    expect(compactThink([], "  ", 3)).toEqual({ steps: [], seconds: 3 });
  });
});

describe("una respuesta interrumpida", () => {
  const meta: AskMeta = { asked: "a → b", intent: "institucional", sources: [src(1), src(2), src(3)], trail: [{ step: "Enrutador", status: "ok", detail: "", ms: 3 }] };

  it("conserva lo escrito, marcado como incompleto, con las fuentes que alcanzó a citar", () => {
    const turn = interruptedTurn("En 2024 hubo 20.500 [1]. Y en Cúcuta [3]. ", meta, "Se cortó la conexión mientras Pilo escribía.");
    expect(turn.incomplete).toBe(true);
    expect(turn.error).toBe("Se cortó la conexión mientras Pilo escribía.");
    expect(turn.answer).toMatchObject({ kind: "ia", text: "En 2024 hubo 20.500 [1]. Y en Cúcuta [3].", asked: "a → b", answerId: null });
    expect(turn.answer?.sources.map((s) => s.n)).toEqual([1, 3]);
    expect(turn.answer?.grounding).toBeUndefined();
  });

  it("detenida por la persona: incompleta y sin mensaje de error", () => {
    const turn = interruptedTurn("Hola. ", null);
    expect(turn).toMatchObject({ incomplete: true, answer: { text: "Hola.", sources: [], trail: [] } });
    expect(turn.error).toBeUndefined();
  });

  it("sin nada escrito queda el mensaje, no una respuesta vacía", () => {
    expect(interruptedTurn("  ", meta, "No pude conectarme con Pilo.")).toEqual({ error: "No pude conectarme con Pilo." });
    expect(interruptedTurn("", null).error).toMatch(/Detuvo la pregunta/);
  });
});
