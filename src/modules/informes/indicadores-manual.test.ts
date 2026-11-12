import { describe, expect, it } from "vitest";
import { criteriosMarcados, esAccion, esCifra, esCompleto, faltantes, filasParaExcel, indicadorNuevo, leerFilasIndicadores, normalizar, COLUMNAS_EXCEL_TODAS, soloCifras } from "./indicadores-manual";
import { armarSintesis } from "./sintesis";
import { avanceSeccion, controlesSeccion } from "./validacion";
import type { SeccionDef } from "./types";

const criterios = [{ id: "acad", nombre: "Calidad académica", origen: "base" as const }];

describe("acciones", () => {
  it("lo guardado sin tipo es cifra", () => {
    const [i] = normalizar([{ id: "a", criterio: "acad", nombre: "Graduación", actual: 5 }]);
    expect(esCifra(i)).toBe(true);
    expect(i.tipo).toBeUndefined();
  });
  it("normaliza una acción", () => {
    const [i] = normalizar([{ id: "a", criterio: "acad", nombre: "Tutorías", tipo: "accion", descripcion: "d", avance_texto: "h", proyeccion_num: 20 }]);
    expect(esAccion(i)).toBe(true);
    expect(i.proyeccion_num).toBe(20);
    expect(i.finalizacion).toBe("");
  });
  it("completa = nombre + descripción + qué se ha hecho; la finalización no se exige", () => {
    const a = indicadorNuevo("acad", "x", "accion");
    expect(esCompleto(a)).toBe(false);
    expect(faltantes(a, true)).toEqual(["el nombre", "la descripción de la acción", "qué se ha hecho con la acción"]);
    const b = { ...a, nombre: "T", descripcion: "d", avance_texto: "h" };
    expect(esCompleto(b)).toBe(true);
    expect(faltantes(b, true)).toEqual([]);
  });
  it("no mezcla acciones con la aritmética", () => {
    const l = [indicadorNuevo("acad"), indicadorNuevo("acad", "", "accion")];
    expect(soloCifras(l)).toHaveLength(1);
    const s = armarSintesis({ acciones: [], metas: [], indicadores: [], accionesManuales: [{ criterio: "acad", criterioNombre: "A", completa: true }, { criterio: "acad", criterioNombre: "A", completa: false }] });
    expect(s.indicadores.total).toBe(0);
    expect(s.acciones).toEqual({ total: 2, completas: 1, criterios: [{ id: "acad", nombre: "A", total: 2, completas: 1 }] });
  });
});

describe("selector de criterios", () => {
  it("marca los de criterios_reporta, los que tienen indicadores y los pedidos", () => {
    const ind = normalizar([{ id: "a", criterio: "inv", nombre: "x" }]);
    expect([...criteriosMarcados(["acad"], ind, ["ext"])].sort()).toEqual(["acad", "ext", "inv"]);
    expect(criteriosMarcados(undefined, [], []).size).toBe(0);
  });
});

describe("excel", () => {
  it("lee un archivo viejo de nueve columnas como cifras", () => {
    const r = leerFilasIndicadores([["h"], ["Calidad académica", "Graduación", "%", "Más es mejor", "1", "2", "3", "f", "n"]], criterios);
    expect(r.indicadores[0].tipo).toBeUndefined();
    expect(r.indicadores[0].actual).toBe(2);
  });
  it("ida y vuelta de una acción", () => {
    const a = { ...indicadorNuevo("acad", "Calidad académica", "accion"), nombre: "T", descripcion: "d", avance_texto: "h", finalizacion: "2027", proyeccion_texto: "p", proyeccion_num: 7 };
    const filas = filasParaExcel([a], criterios);
    expect(filas[0]).toHaveLength(COLUMNAS_EXCEL_TODAS.length);
    const r = leerFilasIndicadores([["h"], filas[0].map((v) => (v === null ? "" : String(v)))], criterios);
    expect(r.indicadores[0]).toMatchObject({ tipo: "accion", descripcion: "d", avance_texto: "h", finalizacion: "2027", proyeccion_texto: "p", proyeccion_num: 7, actual: null });
  });
});

describe("validación de la sección dim", () => {
  const def = { clave: "res", titulo: "R", tipo: "dim", dims: [] } as unknown as SeccionDef;
  const base = { cifras: [], propias: [], anexos: 0, exigirFuente: false };
  it("cuenta acciones completas e incompletas", () => {
    expect(avanceSeccion(def, {}, { ...base, acciones: { total: 2, completas: 1 } })).toBe(1);
    expect(avanceSeccion(def, {}, { ...base, acciones: { total: 2, completas: 2 } })).toBe(2);
    const t = controlesSeccion(def, {}, { ...base, acciones: { total: 2, completas: 1 }, claves: [], congelada: false, corte: null }).map((c) => c.texto);
    expect(t.some((x) => x.startsWith("1 acción sin descripción"))).toBe(true);
  });
});
