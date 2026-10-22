import { describe, expect, it } from "vitest";
import { ofrecerBorrador, respaldoExplicacion } from "./capaPilo";
import { aGuardar, acentoValido, CONFIG_BASE, contrasteConBlanco, copiaDeRespuesta, leerConfig, urlSegura } from "./config";

describe("contraste del acento", () => {
  it("mide contra el blanco y exige 4,5", () => {
    expect(contrasteConBlanco("#ffffff")).toBeCloseTo(1, 1);
    expect(contrasteConBlanco("#000000")).toBeCloseTo(21, 0);
    expect(acentoValido("#004a97")).toBe(true);
    expect(acentoValido("#ffd400")).toBe(false);
    expect(acentoValido("azul")).toBe(false);
  });
});

describe("leerConfig", () => {
  it("lo vacío o dañado vuelve a los valores de partida", () => {
    expect(leerConfig(null)).toEqual(CONFIG_BASE);
    expect(leerConfig("x")).toEqual(CONFIG_BASE);
    expect(leerConfig({ presentacion: { pose: "dragon", entrada: 3 }, tema: { acento: "#ffd400", fondo: "rojo" } })).toEqual(CONFIG_BASE);
  });
  it("conserva lo válido y descarta direcciones inseguras", () => {
    const c = leerConfig({ flujo: "aportes", tema: { acento: "#0A7D8C", imagen: "javascript:alert(1)", logo: "https://udes.edu.co/logo.svg" }, salida: { enlace: "https://udes.edu.co", mostrarResumen: false } });
    expect(c.flujo).toBe("aportes");
    expect(c.tema).toMatchObject({ acento: "#0a7d8c", imagen: "", logo: "https://udes.edu.co/logo.svg" });
    expect(c.salida).toMatchObject({ enlace: "https://udes.edu.co", mostrarResumen: false, copia: true });
    expect(urlSegura("http://x.co")).toBe(false);
    expect(urlSegura("/logo-udes.svg")).toBe(true);
  });
  it("guardar conserva las claves ajenas y la marca del flujo", () => {
    const previo = { flujo: "aportes", otra: 1 };
    const g = aGuardar(previo, leerConfig(previo));
    expect(g).toMatchObject({ flujo: "aportes", otra: 1, verificacionRobots: true });
    expect(aGuardar({}, CONFIG_BASE)).not.toHaveProperty("flujo");
  });
});

describe("copia descargable", () => {
  it("lista cada pregunta con su respuesta", () => {
    const t = copiaDeRespuesta("Satisfacción", [{ pregunta: "¿Qué tal?", respuesta: "Bien" }, { pregunta: "Comentario", respuesta: "" }], new Date("2026-10-22T15:00:00Z"));
    expect(t).toContain("Satisfacción");
    expect(t).toContain("¿Qué tal?\nBien");
    expect(t).toContain("(sin respuesta)");
  });
});

describe("Capa de Pilo", () => {
  it("el respaldo sale de la propia pregunta, sin inventar", () => {
    const t = respaldoExplicacion({ tipo: "cifra", enunciado: "Graduados en 2025:", apoyo: "Solo pregrado.", validaciones: { unidad: "estudiantes" } });
    expect(t).toContain("Graduados en 2025.");
    expect(t).toContain("Unidad: estudiantes.");
    expect(t).toContain("Solo pregrado.");
  });
  it("una sugerencia es siempre un borrador y avisa si habría pisado texto", () => {
    expect(ofrecerBorrador("", "  Hola   mundo ")).toEqual({ borrador: "Hola mundo", pisa: false });
    expect(ofrecerBorrador("Mi texto", "Otro")).toEqual({ borrador: "Otro", pisa: true });
    expect(ofrecerBorrador("Mi texto", "   ")).toBeNull();
  });
});
