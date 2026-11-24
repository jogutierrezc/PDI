import { describe, expect, it } from "vitest";
import { esperando, formProblem, FRASES, lastUnanswered, summarizeTurns, wantsAgent } from "./reglas";

describe("cuándo se ofrece un agente", () => {
  it.each([
    "Quiero hablar con un agente",
    "necesito hablar con una persona",
    "Me puede comunicar con un asesor?",
    "pasame con un humano por favor",
    "¿Hay alguien real que me atienda?",
    "no eres un robot, quiero una persona",
    "AGENTE",
    "quiero comunicarme con un asesor de admisiones",
  ])("«%s» pide un agente", (q) => expect(wantsAgent(q)).toBe(true));

  it.each([
    "¿Cuántos estudiantes tiene la UDES?",
    "Cómo me inscribo a ingeniería",
    "el agente de tránsito me multó cerca de la universidad",
    "qué es un agente inteligente en inteligencia artificial",
    "persona",
    "",
  ])("«%s» no lo pide", (q) => expect(wantsAgent(q)).toBe(false));

  it("no se dispara con textos largos que solo mencionan la palabra", () => {
    expect(wantsAgent(`${"muchas palabras ".repeat(20)} agente`)).toBe(false);
  });
});

describe("el resumen para el agente", () => {
  const turns = [
    { q: "¿Cómo pago la matrícula?", a: "Puedes pagar por PSE o en bancos aliados." },
    { q: "Quiero hablar con un agente" },
    { q: "No me deja pagar con PSE" },
  ];
  it("cuenta qué preguntó y qué respondió Pilo, sin la petición del agente", () => {
    const r = summarizeTurns(turns);
    expect(r).toContain("Preguntó: ¿Cómo pago la matrícula?");
    expect(r).toContain("Pilo respondió: Puedes pagar por PSE");
    expect(r).toContain("Pilo no alcanzó a responder.");
    expect(r).not.toContain("hablar con un agente");
  });
  it("si solo pidió el agente, lo dice", () => {
    expect(summarizeTurns([{ q: "quiero un agente" }])).toMatch(/sin haber hecho otra pregunta/);
  });
  it("no pasa del tope y conserva lo más reciente", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ q: `pregunta número ${i} con bastante texto para llenar`, a: "respuesta larga de ejemplo ".repeat(8) }));
    const r = summarizeTurns(many, 600);
    expect(r.length).toBeLessThanOrEqual(600);
    expect(r).toContain("número 39");
  });
  it("la pregunta sin responder es la última que no tuvo respuesta", () => {
    expect(lastUnanswered(turns)).toBe("No me deja pagar con PSE");
    expect(lastUnanswered([{ q: "A", a: "x" }, { q: "B", a: "y" }])).toBe("B");
    expect(lastUnanswered([])).toBe("");
  });
});

describe("el formulario de Pilo", () => {
  const ok = { name: "Camila Rojas Prada", email: "camila@correo.com", phone: "300 000 0000", city: "Bucaramanga", authorized: true, web: "", turnstile: "tok" };
  it("pide los datos en orden y la autorización", () => {
    expect(formProblem(ok)).toBe("");
    expect(formProblem({ ...ok, name: "Camila" })).toMatch(/nombre completo/);
    expect(formProblem({ ...ok, email: "camila@" })).toMatch(/correo/);
    expect(formProblem({ ...ok, phone: "123" })).toMatch(/teléfono/);
    expect(formProblem({ ...ok, city: " " })).toMatch(/ciudad/);
    expect(formProblem({ ...ok, authorized: false })).toMatch(/autorización/);
  });
});

describe("las frases de Pilo", () => {
  it("las dos acordadas no cambian", () => {
    expect(FRASES.esperar).toBe("En un momento un Agente de la UDES te atenderá");
    expect(FRASES.despedida).toBe("Hasta aquí termino yo, pero te dejo con un experto de la UDES que te puede ayudar. Recuerda que Pilo siempre está aquí cuando lo necesites.");
    expect(esperando("Camila Rojas Prada")).toBe("Gracias, Camila. En un momento un Agente de la UDES te atenderá.");
  });
});
