/* =============================================================================
   Cantar en el chat (0172) · qué detecta la app de lo que escribe la persona.

   El chat manda a «cantar» lo que empieza por «canta» / «cántame»: de ahí saca
   el estilo, el idioma, el modo (la letra con la voz de Pilo o un tema con
   música) y el tema. Las reglas de contenido (nada de música ajena) y los
   permisos (`sing_aud`) los aplica el servidor.
   ========================================================================== */

import { describe, expect, it } from "vitest";
import { singRequestOf } from "./sing";

describe("qué es un pedido de cantar", () => {
  it("empieza por «canta» o «cántame», con o sin «Pilo,» delante", () => {
    expect(singRequestOf("cántame un jingle de la UDES")).not.toBeNull();
    expect(singRequestOf("Pilo, canta algo")).not.toBeNull();
    expect(singRequestOf("¿Canta un saludo de bienvenida?")).not.toBeNull();
  });

  it("otras preguntas no lo son", () => {
    expect(singRequestOf("¿Cuántos estudiantes hay?")).toBeNull();
    expect(singRequestOf("¿Cantaré bien en el coro?")).toBeNull();
    expect(singRequestOf("¿Qué dice la canción del contador?")).toBeNull();
    expect(singRequestOf("")).toBeNull();
  });

  it("un tema, con música de Eleven Music", () => {
    const r = singRequestOf("cántame un jingle de la UDES")!;
    expect(r.modo).toBe("musica");
    expect(r.estilo).toBe("jingle");
    expect(r.idioma).toBe("es");
    expect(r.letra).toBe("");
    expect(r.tema).toBe("UDES");
  });

  it("el estilo se reconoce por su nombre", () => {
    expect(singRequestOf("canta un cumpleaños para mi mamá")!.estilo).toBe("cumpleanos");
    expect(singRequestOf("cántame una balada")!.estilo).toBe("balada");
    expect(singRequestOf("cántame algo de folclor")!.estilo).toBe("folclor");
    expect(singRequestOf("cántame una canción infantil")!.estilo).toBe("infantil");
  });

  it("«para mi mamá» deja el tema limpio", () => {
    expect(singRequestOf("canta un cumpleaños para mi mamá")!.tema).toBe("mi mamá");
  });

  it("el idioma se reconoce (inglés, portugués)", () => {
    expect(singRequestOf("cántame una balada en inglés sobre la investigación")!.idioma).toBe("en");
    expect(singRequestOf("canta un saludo en portugués")!.idioma).toBe("pt");
  });

  it("sin tema, la Universidad", () => {
    expect(singRequestOf("canta algo")!.tema).toBe("la Universidad de Santander");
  });
});

describe("la letra, con la voz de Pilo", () => {
  it("«letra: …» canta lo que viene después, con la voz", () => {
    const r = singRequestOf("cántame con tu voz. Letra: Sol, fa, mi. Te saludo yo.")!;
    expect(r.modo).toBe("voz");
    expect(r.letra).toContain("Sol, fa, mi");
    expect(r.letra).toContain("Te saludo yo");
  });

  it("una pregunta de varias líneas lleva la letra en las que siguen", () => {
    const r = singRequestOf("cántame con tu voz\nHola, UDES\nte saludo yo")!;
    expect(r.modo).toBe("voz");
    expect(r.letra).toBe("Hola, UDES\nte saludo yo");
  });

  it("«con música» se queda en música aunque haya una letra", () => {
    const r = singRequestOf("cántame con música. Letra: Sol, fa, mi")!;
    expect(r.modo).toBe("musica");
    expect(r.letra).toContain("Sol, fa, mi");
  });
});
