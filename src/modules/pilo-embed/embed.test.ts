import { describe, expect, it } from "vitest";
import { frameMessage, hostOrigin, normalizeOrigin, readHostMessage, readParams, sourceUrl, widgetAllowed, widgetSnippet } from "./embed";

describe("readParams", () => {
  it("sin nada pedido: blanco y a la derecha", () => {
    expect(readParams("")).toEqual({ tema: "blanco", lado: "der" });
  });

  it("acepta los tres temas y la esquina izquierda, con cualquier mayúscula", () => {
    expect(readParams("?tema=Soleado&lado=izquierda")).toEqual({ tema: "soleado", lado: "izq" });
    expect(readParams("?tema=negro&lado=izq")).toEqual({ tema: "negro", lado: "izq" });
  });

  it("lo que no conoce cae en lo de siempre", () => {
    expect(readParams("?tema=rosado&lado=arriba")).toEqual({ tema: "blanco", lado: "der" });
  });
});

describe("mensajes entre el marco y la página anfitriona", () => {
  it("el marco dice su estado", () => {
    expect(frameMessage("abierto")).toEqual({ source: "pilo-embed", type: "estado", state: "abierto" });
  });

  it("solo se lee lo que viene de la página anfitriona", () => {
    expect(readHostMessage({ source: "pilo-host", full: true })).toEqual({ full: true });
    expect(readHostMessage({ source: "pilo-host" })).toEqual({ full: false });
    expect(readHostMessage({ source: "otro", full: true })).toBeNull();
    expect(readHostMessage("pilo-host")).toBeNull();
    expect(readHostMessage(null)).toBeNull();
  });
});

describe("sourceUrl", () => {
  it("una ruta del portal se abre en el portal", () => {
    expect(sourceUrl("/datos-abiertos/poblacional", "https://portal.example/")).toBe("https://portal.example/datos-abiertos/poblacional");
  });

  it("una dirección completa se respeta", () => {
    expect(sourceUrl("https://www.udes.edu.co/x", "https://portal.example")).toBe("https://www.udes.edu.co/x");
  });

  it("sin ruta, o con algo que no es una ruta, lleva a Pregúntele a Pilo", () => {
    expect(sourceUrl("", "https://portal.example")).toBe("https://portal.example/pregunta");
    expect(sourceUrl(null, "https://portal.example")).toBe("https://portal.example/pregunta");
    expect(sourceUrl("javascript:alert(1)", "https://portal.example")).toBe("https://portal.example/pregunta");
  });
});

describe("normalizeOrigin", () => {
  it("deja el origen, con o sin https, ruta o mayúsculas", () => {
    expect(normalizeOrigin("www.udes.edu.co/")).toBe("https://www.udes.edu.co");
    expect(normalizeOrigin(" https://Admisiones.UDES.edu.co/programas?x=1 ")).toBe("https://admisiones.udes.edu.co");
    expect(normalizeOrigin("http://localhost:5173")).toBe("http://localhost:5173");
  });

  it("rechaza lo que no es la dirección de un sitio", () => {
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin("udes")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("ftp://udes.edu.co")).toBeNull();
  });
});

describe("hostOrigin", () => {
  it("prefiere ancestorOrigins y cae en el referente", () => {
    expect(hostOrigin(["https://a.example"], "https://b.example/pagina")).toBe("https://a.example");
    expect(hostOrigin([], "https://b.example/pagina")).toBe("https://b.example");
    expect(hostOrigin(undefined, "")).toBeNull();
  });
});

describe("widgetAllowed", () => {
  const self = "https://portal.example";
  const on = { on: true, origins: ["https://www.udes.edu.co"] };

  it("este portal siempre puede, aunque esté apagado o sin migración", () => {
    expect(widgetAllowed({ on: false, origins: [] }, self, self)).toBe(true);
    expect(widgetAllowed(undefined, self, self)).toBe(true);
  });

  it("otro portal: solo encendido y en la lista", () => {
    expect(widgetAllowed(on, "https://www.udes.edu.co", self)).toBe(true);
    expect(widgetAllowed(on, "https://otro.example", self)).toBe(false);
    expect(widgetAllowed({ ...on, on: false }, "https://www.udes.edu.co", self)).toBe(false);
    expect(widgetAllowed(undefined, "https://www.udes.edu.co", self)).toBe(false);
  });

  it("si no se sabe quién aloja el marco, no", () => {
    expect(widgetAllowed(on, null, self)).toBe(false);
  });
});

describe("widgetSnippet", () => {
  it("arma la línea con el tema y la esquina", () => {
    expect(widgetSnippet("https://portal.example/", "negro", "izq")).toBe('<script src="https://portal.example/pilo.js" data-tema="negro" data-esquina="izquierda" defer></script>');
  });
});
