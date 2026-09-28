import { describe, expect, it } from "vitest";
import { parseAnswer } from "./AnswerText";

describe("el texto de una respuesta", () => {
  it("se parte en frases que se leen sin las citas", () => {
    const p = parseAnswer("En 2025-2 hay 15.870 estudiantes [1]. Bucaramanga concentra 9.412 [1].\n\nCreció 3,1 % [2].");
    expect(p.paragraphs).toHaveLength(2);
    expect(p.sentences.map((s) => s.spoken)).toEqual(["En 2025-2 hay 15.870 estudiantes.", "Bucaramanga concentra 9.412.", "Creció 3,1 %."]);
  });

  it("cuenta palabras y citas para la escritura, en orden", () => {
    const p = parseAnswer("Hola [1] mundo.");
    expect(p.count).toBe(3);
    const visible = p.sentences[0].pieces.filter((x) => x.order >= 0).map((x) => `${x.kind}:${x.value}`);
    expect(visible).toEqual(["word:Hola", "cite:1", "word:mundo."]);
  });
});
