import { describe, expect, it } from "vitest";
import { AZUL_UDES, acentoPorDefecto, acentosParaUnidad, evaluarAcento, facultadDe, normalizarDiseno, normalizarPerfil } from "./perfil";

describe("acentos por facultad", () => {
  const casos: [string, string][] = [
    ["Facultad de Ciencias Médicas y de la Salud", "#43bfeb"],
    ["Facultad de Ingenierías y Tecnologías", "#dd3e9d"],
    ["Facultad de Ciencias Naturales", "#d6c105"],
    ["Facultad de Ciencias Agrícolas y Veterinarias", "#43ac38"],
    ["UDES TEC", "#9071b0"],
    ["Facultad de Ciencias Sociales", "#eb5a6c"],
    ["Facultad de Ciencias Económicas, Administrativas y Contables", "#f28a30"],
  ];
  it.each(casos)("%s → %s", (nombre, hex) => expect(facultadDe(nombre)?.hex).toBe(hex));

  it("una oficina cae en el azul UDES y ofrece la escala institucional", () => {
    expect(acentoPorDefecto("Oficina de Planeación Institucional")).toBe(AZUL_UDES);
    const a = acentosParaUnidad("Oficina de Planeación Institucional");
    expect(a.facultad).toBeNull();
    expect(a.institucionales.slice(0, 2).map((x) => x.hex)).toEqual(["#014c97", "#cea284"]);
  });

  it("un programa hereda el color de su facultad", () => {
    expect(normalizarPerfil(null, "Medicina", ["Facultad de Ciencias Médicas y de la Salud"]).acento).toBe("#43bfeb");
  });

  it("todos los colores de facultad superan 3:1 (el editor avisa si bajan de 4,5)", () => {
    for (const [, hex] of casos) expect(evaluarAcento(hex).razon).toBeGreaterThanOrEqual(3);
  });

  it("la galería elegida se conserva y lo malformado se limpia", () => {
    const base = { unidad: "U", anio: 2026, nombreCiclo: "" };
    expect(normalizarDiseno({ portada: { galeria: "123-fachada.jpg" } }, base).portada.galeria).toBe("123-fachada.jpg");
    expect(normalizarDiseno({ portada: { galeria: 5 } }, base).portada.galeria).toBe("");
  });
});
