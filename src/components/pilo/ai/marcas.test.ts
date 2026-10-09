import { describe, expect, it } from "vitest";
import { cleanDraft, finishAnswer, stripMarks } from "./logic";

describe("las marcas que el modelo copia del pedido", () => {
  it("quita los nombres de los bloques y las etiquetas sueltas", () => {
    expect(stripMarks("[OFICIAL] La matrícula abre en enero [CIFRAS] y cierra en marzo.")).toBe("La matrícula abre en enero y cierra en marzo.");
    expect(stripMarks("[DE OTRO ÁMBITO] Esto viene de Enseñanza.")).toBe("Esto viene de Enseñanza.");
    expect(stripMarks("[calm] Hola, soy Pilo [pause] ¿en qué te ayudo?")).toBe("Hola, soy Pilo ¿en qué te ayudo?");
    expect(stripMarks("Según la norma [fuente] y [n] y […] aplica.")).toBe("Según la norma y y aplica.");
  });

  it("deja las citas, los enlaces y los años entre corchetes", () => {
    expect(stripMarks("Bajó a 9,6 % [2] [2024] y ver [la guía](https://udes.edu.co).")).toBe("Bajó a 9,6 % [2] [2024] y ver [la guía](https://udes.edu.co).");
  });

  it("«[Fuente 2]» pasa a «[2]»", () => {
    expect(stripMarks("Lo dice la norma [Fuente 2].")).toBe("Lo dice la norma [2].");
  });

  it("la respuesta terminada sale sin corchetes de más", () => {
    expect(cleanDraft("[PASAJES] La evaluación es formativa [1].")).toBe("La evaluación es formativa [1].");
    const src = [{ ref: "a", title: "Política", section: "", cut: "", body: "La evaluación es formativa.", source: "documento" }] as never;
    const done = finishAnswer("[OFICIAL] La evaluación es formativa [1] [calm].", src, { question: "¿cómo se evalúa?", intent: "institucional" } as never);
    expect(done.text).toBe("La evaluación es formativa [1].");
  });
});
