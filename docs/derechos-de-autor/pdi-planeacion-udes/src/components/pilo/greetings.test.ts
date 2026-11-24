import { describe, expect, it } from "vitest";
import { chooseGreeting, hasFigures, momentOf, parseGreetings, pickGreeting } from "./greetings";
import type { Greeting } from "./greetings";

const list: Greeting[] = [
  { text: "Hola, soy Mr. Pilo, la AI de la UDES. ¿En qué te ayudo hoy?", moment: "cualquiera" },
  { text: "¡Buenos días! Soy Mr. Pilo, la AI de la UDES.", moment: "manana" },
  { text: "¡Buenas tardes! Soy Mr. Pilo, la AI de la UDES.", moment: "tarde" },
  { text: "¡Buenas noches! Soy Mr. Pilo, la AI de la UDES.", moment: "noche" },
];

describe("los saludos del chat incrustado", () => {
  it("lee la lista de la base con cuidado: sin cifras, sin repetidos, sin texto vacío", () => {
    const got = parseGreetings([
      { text: "  Hola   desde Mr. Pilo ", moment: "tarde" },
      { text: "Hola desde Mr. Pilo", moment: "noche" },
      { text: "Somos 20 mil", moment: "cualquiera" },
      { text: "", moment: "cualquiera" },
      { text: "Otro saludo cualquiera", moment: "raro" },
      null,
      7,
    ]);
    expect(got).toEqual([
      { text: "Hola desde Mr. Pilo", moment: "tarde" },
      { text: "Otro saludo cualquiera", moment: "cualquiera" },
    ]);
    expect(parseGreetings("nada")).toEqual([]);
  });

  it("detecta las cifras", () => {
    expect(hasFigures("Hola")).toBe(false);
    expect(hasFigures("Hola 2026")).toBe(true);
  });

  it("reparte el día en mañana, tarde y noche", () => {
    expect([5, 11, 12, 18, 19, 23, 0, 4].map(momentOf)).toEqual(["manana", "manana", "tarde", "tarde", "noche", "noche", "noche", "noche"]);
    expect(momentOf(Number.NaN)).toBe("tarde");
  });

  it("solo ofrece los del momento del día y los de cualquiera", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(pickGreeting(list, { hour: 8, random: i / 40 })!.moment);
    expect([...seen].sort()).toEqual(["cualquiera", "manana"]);
    expect(pickGreeting(list, { hour: 21, random: 0.99 })!.moment).not.toBe("manana");
  });

  it("no repite el último saludo mientras haya otro", () => {
    for (let i = 0; i < 20; i++) {
      const g = pickGreeting(list, { hour: 8, last: list[1].text, random: i / 20 })!;
      expect(g.text).not.toBe(list[1].text);
    }
    // si solo hay uno, se repite (no se queda sin saludo)
    expect(pickGreeting([list[0]], { hour: 8, last: list[0].text, random: 0.5 })!.text).toBe(list[0].text);
  });

  it("varía con el azar", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) seen.add(pickGreeting(list, { hour: 14, random: i / 30 })!.text);
    expect(seen.size).toBe(2);
  });

  it("sin lista, o con una lista vacía, vale el saludo único de siempre; con lista, el único entra como uno más", () => {
    expect(chooseGreeting([], "Hola de siempre.", { hour: 9, random: 0.3 })).toBe("Hola de siempre.");
    expect(pickGreeting([], { hour: 9, random: 0.3 })).toBeNull();
    const texts = new Set<string>();
    for (let i = 0; i < 60; i++) texts.add(chooseGreeting(list, "Saludo único de la administración.", { hour: 14, random: i / 60 }));
    expect(texts.has("Saludo único de la administración.")).toBe(true);
    // un único con cifras no entra a la lista
    const none = new Set<string>();
    for (let i = 0; i < 60; i++) none.add(chooseGreeting(list, "Hola 2026", { hour: 14, random: i / 60 }));
    expect(none.has("Hola 2026")).toBe(false);
  });
});
