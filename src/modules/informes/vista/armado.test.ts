import { describe, expect, it } from "vitest";
import { unidadesDelLibro } from "./armado";
import type { EntradaLibro, SeccionLibro } from "./entrada";

const seccion = (i: number, o: Partial<SeccionLibro> = {}): SeccionLibro => ({
  clave: `s${i}`, numero: i + 1, titulo: `Sección ${i + 1}`, tipo: "narr", funcion: "", texto: "Un párrafo.", dimensiones: [], otros: [], pilares: [], metas: [], columnas: [], filas: [], logros: [], anexos: [],
  matriz: [], drive: [], driveLogros: [], driveIndicadores: [], bloques: [], plan: [], avancesPlan: [], evidenciasPlan: [], sintesis: null, fuente: "", ...o,
});
const recursos = { tablas: new Map(), graficas: new Map(), listo: true, firma: "" };

describe("el cuerpo corre continuo", () => {
  it("ninguna unidad fuerza hoja nueva: cada sección sigue en la misma hoja", () => {
    const e: EntradaLibro = { anio: "2026", secciones: [seccion(0), seccion(1), seccion(2, { tipo: "dim", dimensiones: [{ id: "a", titulo: "A", funcion: "", filas: [], acciones: [{ nombre: "x", descripcion: "", hecho: "h", finalizacion: "", proyeccion: "" }] }, { id: "b", titulo: "B", funcion: "", filas: [], acciones: [{ nombre: "y", descripcion: "", hecho: "h", finalizacion: "", proyeccion: "" }] }] })] };
    const u = unidadesDelLibro(e, recursos);
    expect(u.length).toBeGreaterThan(3);
    expect(u.filter((x) => x.nuevaPagina)).toHaveLength(0);
  });

  it("el título de cada sección se pega a lo que sigue", () => {
    const u = unidadesDelLibro({ anio: "2026", secciones: [seccion(0), seccion(1)] }, recursos);
    expect(u.filter((x) => x.clave.startsWith("sec:")).every((x) => x.pegar)).toBe(true);
  });
});
