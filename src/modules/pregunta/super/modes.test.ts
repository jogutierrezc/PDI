import { describe, expect, it } from "vitest";
import { isSuperMode, line, plainText, SUPER, SUPER_INTENTS, SUPER_MODES, superAnswer, superCommand, superLine, superReply, superStep } from "./modes";

describe("los modos secretos de Pilo", () => {
  it("reconoce la orden de entrar, con número, con nombre o sin nada", () => {
    expect(superCommand("modo super pilo")).toEqual({ type: "on", mode: "pilocop" });
    expect(superCommand("/superpilo")).toEqual({ type: "on", mode: "pilocop" });
    expect(superCommand("¡Modo Súper Pilo!")).toEqual({ type: "on", mode: "pilocop" });
    expect(superCommand("super pilo 2")).toEqual({ type: "on", mode: "pilonator" });
    expect(superCommand("modo super pilo 3")).toEqual({ type: "on", mode: "sayayin" });
    expect(superCommand("pilonator")).toEqual({ type: "on", mode: "pilonator" });
    expect(superCommand("activar modo super pilo sayayin")).toEqual({ type: "on", mode: "sayayin" });
  });

  it("sin número ni nombre vuelve al modo activo o al último usado", () => {
    expect(superCommand("modo super pilo", { active: null, last: "sayayin" })).toEqual({ type: "on", mode: "sayayin" });
    expect(superCommand("modo super pilo", { active: "pilonator", last: "sayayin" })).toEqual({ type: "on", mode: "pilonator" });
  });

  it("no desvía una pregunta de verdad que menciona el modo", () => {
    expect(superCommand("¿qué es el modo super pilo y para qué sirve?")).toBeNull();
    expect(superCommand("¿cuántos estudiantes tiene la UDES?")).toBeNull();
    expect(superCommand("super pilo 7")).toBeNull();
  });

  it("salir solo se entiende con un modo activo", () => {
    expect(superCommand("desactivar")).toBeNull();
    expect(superCommand("desactivar", { active: "pilocop" })).toEqual({ type: "off" });
    expect(superCommand("Modo normal.", { active: "sayayin" })).toEqual({ type: "off" });
    expect(superCommand("/normal", { active: "sayayin" })).toEqual({ type: "off" });
    expect(superCommand("¿cómo desactivo mi correo institucional?", { active: "pilocop" })).toBeNull();
  });

  it("el catálogo responde la charla corta y deja las preguntas a la IA", () => {
    expect(superReply("pilocop", "tengo parcial")?.id).toBe("parcial");
    expect(superReply("sayayin", "Cuéntame un chiste")?.id).toBe("chiste");
    expect(superReply("pilonator", "¿Cuál es tu misión?")?.id).toBe("mision");
    expect(superReply("pilocop", "¿cuándo son los parciales del segundo corte de este semestre?")).toBeNull();
    expect(superReply("pilocop", "¿cuántos programas tiene la UDES?")).toBeNull();
    expect(superReply("pilocop", "   ")).toBeNull();
  });

  it("cada línea trae las tres voces, y su texto de Fish Audio etiqueta cada frase", () => {
    for (const intent of SUPER_INTENTS) {
      for (const mode of SUPER_MODES) {
        const l = intent.lines[mode];
        expect(l.text.trim(), `${intent.id} · ${mode}`).not.toBe("");
        // En pantalla no se ve ninguna etiqueta.
        expect(l.text).not.toMatch(/[[\]|]/);
        // Las etiquetas solo llevan letras y espacios: es lo que deja pasar cleanTone.
        for (const tag of l.fish.match(/\[[^\]]*\]/g) ?? []) expect(tag).toMatch(/^\[[a-z ]+\]$/);
        // Quitadas las etiquetas, lo que se dice es lo que se lee.
        expect(l.fish.replace(/\[[^\]]*\]\s*/g, "")).toBe(l.text);
        // Ninguna frase queda sin etiqueta: cada una empieza por la suya.
        const sentences = l.fish.split(/(?<=[.!?…])\s+(?=\[)/);
        for (const s of sentences) expect(s.startsWith("["), `${intent.id} · ${mode}: «${s}»`).toBe(true);
      }
    }
  });

  it("los números van en letras, para que la voz no los deletree", () => {
    for (const intent of SUPER_INTENTS) for (const mode of SUPER_MODES) expect(intent.lines[mode].text, `${intent.id} · ${mode}`).not.toMatch(/\d/);
  });

  it("arma una línea frase por frase", () => {
    expect(line("R|Hola.", "P,W|Adiós.")).toEqual({ text: "Hola. Adiós.", fish: "[robotic monotone] Hola. [short pause] [whispering] Adiós." });
  });

  it("las líneas que dice la página existen en los tres modos", () => {
    for (const mode of SUPER_MODES) for (const id of ["activar", "activo", "desactivar"]) expect(superLine(mode, id).text).not.toBe("");
    expect(() => superLine("pilocop", "no-existe")).toThrow();
  });

  it("decide qué hace la conversación con cada mensaje", () => {
    // Sin modo: solo la orden de entrar es cosa de los modos.
    expect(superStep("tengo parcial", { active: null })).toBeNull();
    expect(superStep("desactivar", { active: null })).toBeNull();
    expect(superStep("modo super pilo", { active: null })).toEqual({ kind: "entrar", mode: "pilocop", short: false, said: superLine("pilocop", "activar") });
    // Con un modo: cambiar a otro (entrada corta), repetirlo, charlar y salir.
    expect(superStep("super pilo 3", { active: "pilocop" })).toMatchObject({ kind: "entrar", mode: "sayayin", short: true });
    expect(superStep("pilocop", { active: "pilocop" })).toEqual({ kind: "activo", mode: "pilocop", said: superLine("pilocop", "activo") });
    expect(superStep("tengo parcial", { active: "pilonator" })).toMatchObject({ kind: "charla", mode: "pilonator" });
    expect(superStep("desactivar", { active: "sayayin" })).toEqual({ kind: "salir", mode: "sayayin", said: superLine("sayayin", "desactivar") });
    // Una pregunta de verdad sigue al servidor, con el modo puesto.
    expect(superStep("¿cuántos programas de pregrado tiene la UDES en Cúcuta?", { active: "pilocop" })).toBeNull();
  });

  it("lo que dice el catálogo tiene forma de respuesta, sin fuentes", () => {
    expect(superAnswer(superLine("pilocop", "activo"))).toEqual({ kind: "curada", text: superLine("pilocop", "activo").text, sources: [], trail: [] });
  });

  it("cada modo tiene nombre, tono y las cuatro frases de su entrada", () => {
    for (const mode of SUPER_MODES) {
      expect(SUPER[mode].name).not.toBe("");
      expect(SUPER[mode].tone).toMatch(/^[a-z ]+$/);
      expect(SUPER[mode].stages).toHaveLength(4);
    }
    expect(isSuperMode("pilocop")).toBe(true);
    expect(isSuperMode("capitan")).toBe(false);
    expect(plainText("  ¿Qué  ÉS,  eso? ")).toBe("que es eso");
  });
});
