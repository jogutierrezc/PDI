import { describe, expect, it } from "vitest";
import { cifrasAMano, extraerTokens, insertarToken, palabras, partesTexto, resolverTexto, textoDePlantilla, tokensDesconocidos, validarTexto } from "./tokens";

const resolver = (k: string) => (k === "matric" ? { texto: "2.840", fuente: "UDES en Cifras · Matrícula" } : k === "deser" ? { texto: "7,8 %", fuente: "SPADIES" } : null);

describe("tokens [[clave]]", () => {
  it("extrae las claves sin repetir y en orden", () => {
    expect(extraerTokens("La [[matric]] y la [[deser]]; otra vez [[MATRIC]].")).toEqual(["matric", "deser"]);
  });

  it("parte el texto en trozos de texto, cifra y roto", () => {
    const p = partesTexto("Hubo [[matric]] estudiantes y [[nada]].", resolver);
    expect(p).toEqual([
      { tipo: "texto", texto: "Hubo " },
      { tipo: "cifra", clave: "matric", texto: "2.840", fuente: "UDES en Cifras · Matrícula" },
      { tipo: "texto", texto: " estudiantes y " },
      { tipo: "roto", clave: "nada" },
      { tipo: "texto", texto: "." },
    ]);
  });

  it("resuelve a texto plano y deja los tokens sin valor", () => {
    expect(resolverTexto("[[matric]] y [[deser]] y [[x]]", resolver)).toBe("2.840 y 7,8 % y [[x]]");
  });

  it("inserta en el cursor con espacios donde hacen falta", () => {
    expect(insertarToken("Hubo estudiantes", 4, "matric")).toEqual({ texto: "Hubo [[matric]] estudiantes", cursor: 15 });
    expect(insertarToken("Hubo", null, "matric").texto).toBe("Hubo [[matric]]");
    expect(insertarToken("", 0, "matric").texto).toBe("[[matric]]");
    expect(insertarToken("Total .", 6, "matric").texto).toBe("Total [[matric]].");
  });
});

describe("advertencias del texto", () => {
  it("cuenta cifras a mano fuera de los tokens, sin los años", () => {
    expect(cifrasAMano("En 2026 la matrícula fue [[matric]] y la deserción 7,8 % con 1.200 graduados")).toEqual(["7,8", "1.200"]);
    expect(cifrasAMano("En 2025 y 2026 todo con [[matric]].")).toEqual([]);
  });

  it("detecta texto de la plantilla sin reemplazar", () => {
    expect(textoDePlantilla("El [nombre de la unidad] logró…")).toBe(true);
    expect(textoDePlantilla("Ejemplo: el telecentro…")).toBe(true);
    expect(textoDePlantilla("La [[matric]] creció.")).toBe(false);
  });

  it("encuentra tokens que no existen", () => {
    expect(tokensDesconocidos("[[matric]] [[inventada]]", ["matric", "deser"])).toEqual(["inventada"]);
  });

  it("arma los controles con mínimo de palabras", () => {
    const c = validarTexto("Uno dos 3 [x]", { claves: ["matric"], minimo: 10 });
    expect(c.map((x) => x.nivel)).toEqual(["warn", "warn", "warn"]);
    expect(c[0].texto).toMatch(/Faltan 6 palabras/);
    const bien = validarTexto("La matrícula llegó a [[matric]] estudiantes.", { claves: ["matric"] });
    expect(bien.every((x) => x.nivel === "ok")).toBe(true);
  });

  it("cuenta palabras", () => {
    expect(palabras("  uno  dos\ntres ")).toBe(3);
    expect(palabras(null)).toBe(0);
  });
});
