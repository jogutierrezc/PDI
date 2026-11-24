import { describe, expect, it } from "vitest";
import { validarEstructura } from "./estructura";
import type { Estructura, Pregunta } from "./estructura";
import { ponerTextoAporte, textoAporte } from "./textosAporte";

const bloque = (textos?: Pregunta["textos"]): Estructura => ({
  version: 1,
  secciones: [{ id: "s", titulo: "Logros", preguntas: [{ id: "aportes", tipo: "bloque_logro_reto", enunciado: "Logros y retos", obligatoria: true, textos }] }],
});

describe("textos del logro y del reto", () => {
  it("usa el texto por defecto cuando no hay uno propio", () => {
    expect(textoAporte(undefined, "reto", "tituloPregunta")).toBe("¿Cuál es el reto que enfrenta?");
    expect(textoAporte({ tituloPregunta: "  " }, "logro", "tituloPregunta")).toBe("¿Cuál es el logro que quiere destacar?");
  });

  it("usa el propio y reemplaza {max} y {cifras}", () => {
    expect(textoAporte({ cifrasAyuda: "Hasta {cifras} cifras; la descripción llega a {max}." }, "logro", "cifrasAyuda", { max: 500, cifras: 12 })).toBe("Hasta 12 cifras; la descripción llega a 500.");
  });

  it("guarda por tipo y quita lo vacío", () => {
    const p = bloque().secciones[0].preguntas[0];
    const a = ponerTextoAporte(p, "reto", "descripcionAyuda", "Cuál fue el obstáculo");
    expect(a).toEqual({ reto: { descripcionAyuda: "Cuál fue el obstáculo" } });
    expect(ponerTextoAporte({ ...p, textos: a }, "reto", "descripcionAyuda", "")).toBeUndefined();
  });

  it("la estructura con textos válidos pasa y con una clave rara no", () => {
    expect(validarEstructura(bloque({ reto: { cifrasAyuda: "Agregue las cifras." } }))).toEqual([]);
    expect(validarEstructura(bloque({ reto: { inventada: "x" } } as never)).length).toBeGreaterThan(0);
    expect(validarEstructura(bloque({ logro: { piloTitulo: "x".repeat(701) } })).length).toBeGreaterThan(0);
  });

  it("los textos no valen en otro tipo de pregunta", () => {
    const e = bloque();
    e.secciones[0].preguntas[0] = { id: "x", tipo: "texto_corto", enunciado: "Nombre", obligatoria: false, textos: { logro: {} } };
    expect(validarEstructura(e).length).toBeGreaterThan(0);
  });
});
