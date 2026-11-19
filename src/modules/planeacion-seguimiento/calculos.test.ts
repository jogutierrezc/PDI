import { describe, expect, it } from "vitest";
import real from "./datos/pdifyt-2027-2035.json";
import { calidadDeDatos, filtrar, inversionPorAnio, opcionesFiltro, FILTROS, porOficina, posicionBarra, resumir, sanearSeleccion } from "./calculos";
import { crearApiMemoria } from "./api";
import { lineaDeFila, lineaParaCarga } from "./api";
import type { Linea } from "./modelo";

const lineas = real as unknown as Linea[];

describe("resumen del plan real", () => {
  const r = resumir(lineas);
  it("cifras de la matriz", () => {
    expect(r.n).toBe(75);
    expect(r.monto).toBe(133374668643);
    expect(r.evaluados).toBe(63);
    expect(r.sinEvaluar).toBe(12);
    expect(Math.floor(r.montoSinEvaluar / 1e6)).toBe(55337);
    expect(Math.floor(r.montoEvaluado / 1e6)).toBe(78036);
    expect(r.porPrioridad.map((x) => x.n)).toEqual([16, 24, 23, 12]);
    expect(r.porPilar.map((x) => x.n)).toEqual([27, 1, 44, 3]);
    expect(r.porAnio).toHaveLength(9);
    expect(r.porAnio.reduce((s, a) => s + a.parte, 0)).toBeCloseTo(1, 6);
  });
  it("no usa la palabra «sede» en ningún rótulo", () => {
    expect(JSON.stringify([FILTROS.map((f) => f.rotulo), r.porCampus.map((c) => c.etiqueta)])).not.toMatch(/sede/i);
  });
  it("la inversión por año solo cuenta lo evaluado", () => {
    const total = inversionPorAnio(lineas).reduce((s, a) => s + a.monto, 0);
    expect(total).toBeLessThanOrEqual(r.montoEvaluado + 1);
  });
  it("cobertura de oficina: ninguna tiene responsable (no se inventa)", () => {
    expect(porOficina(lineas)).toEqual([{ clave: "Sin oficina", etiqueta: "Sin oficina", n: 75, monto: 133374668643 }]);
  });
});

describe("filtros", () => {
  it("multiselección dentro de un filtro suma; entre filtros cruza", () => {
    expect(filtrar(lineas, { campus: ["Cúcuta", "Valledupar"] })).toHaveLength(30);
    expect(filtrar(lineas, { campus: ["Cúcuta", "Valledupar"], prioridad: ["Crítico"] }).every((l) => l.prioridad === "Crítico")).toBe(true);
  });
  it("saneo: descarta lo que no existe", () => {
    expect(sanearSeleccion({ campus: ["Cúcuta", "Marte"], x: ["y"] }, lineas)).toEqual({ campus: ["Cúcuta"] });
    expect(sanearSeleccion("basura", lineas)).toEqual({});
  });
  it("opciones de campus en orden fijo con «Todos» al final", () => {
    expect(opcionesFiltro(FILTROS[0], lineas).map((o) => o.v)).toEqual(["Bucaramanga", "Valledupar", "Cúcuta", "Todos"]);
  });
});

describe("calidad de datos", () => {
  const c = Object.fromEntries(calidadDeDatos(lineas).map((h) => [h.clave, h]));
  it("distingue pendiente, no aplica e inconsistente", () => {
    expect(c["sin-evaluar"]).toMatchObject({ estado: "pend" });
    expect(c["sin-evaluar"].lineas).toHaveLength(12);
    expect(c["sin-fuente"].estado).toBe("na");
    expect(c["pct"].estado).toBe("warn");
    expect(c["pct"].inconsistentes).toHaveLength(1);
    expect(c["sin-monto"].estado).toBe("ok");
  });
});

describe("cronograma", () => {
  it("posición proporcional", () => {
    const p = posicionBarra("2027-01-01", "2035-12-31", 2027, 2035);
    expect(p.izquierda).toBe(0);
    expect(p.ancho).toBeCloseTo(100, 1);
    const m = posicionBarra("2031-01-01", "2031-12-31", 2027, 2035);
    expect(m.izquierda).toBeCloseTo((4 / 9) * 100, 0);
  });
});

describe("capa de datos en memoria", () => {
  it("vacío → crear plan → cargar → publicar", async () => {
    const api = crearApiMemoria({ estado: "ninguno" });
    expect(await api.plan()).toBeNull();
    const id = await api.crearPlan({ nombre: "PDIFyT 2027-2035", anioIni: 2027, anioFin: 2035 });
    const r = await api.cargarPlanificacion({ planId: id, lineas: lineas.slice(0, 5), nombreArchivo: "x.xlsx" });
    expect(r).toMatchObject({ aceptadas: 5, etiqueta: "v1.0", errores: [] });
    expect((await api.plan())?.version).toMatchObject({ estado: "borrador", vigente: false });
    await api.publicarVersion(r.versionId!, "");
    expect((await api.plan())?.version).toMatchObject({ estado: "publicada", vigente: true });
    const otra = await api.cargarPlanificacion({ planId: id, lineas: lineas.slice(0, 2), nombreArchivo: "y.xlsx" });
    expect(otra.errores[0].mensaje).toMatch(/solicitud de cambio/);
  });
  it("rechaza un campus que el portal no tiene", async () => {
    const api = crearApiMemoria({ estado: "ninguno" });
    const id = await api.crearPlan({ nombre: "Plan", anioIni: 2027, anioFin: 2035 });
    const r = await api.cargarPlanificacion({ planId: id, lineas: [{ ...lineas[0], campus: "Medellín" }], nombreArchivo: "x.xlsx" });
    expect(r.errores[0]).toMatchObject({ fila: 1, campo: "campus" });
  });
});

describe("contrato Supabase (forma de los datos)", () => {
  it("ps_version_lineas → Linea: campus_id nulo es «Todos» y Si/No son booleanos", () => {
    const l = lineaDeFila({ clave: "1", nombre: "N", pilar: "P4. X", prioridad: "Alto", campus_id: null, monto: "100.00", criterios: { alin: "Si", deficit: "No" }, viabilidad: {}, pct: { "2027": 0.5 }, oficina_unit_id: "u1" }, new Map(), new Map([["u1", "Planeación"]]));
    expect(l).toMatchObject({ campus: "Todos", monto: 100, oficina: "Planeación" });
    expect(l.criterios).toMatchObject({ alin: true, deficit: false, norm: null });
  });
  it("Linea → p_lineas de ps_cargar_matriz: clave, campus por nombre, Si/No, pct vacío si todo cero", () => {
    const o = lineaParaCarga({ ...lineas[0], oficina: "Planeación" }, new Map([["planeacion", "u1"]]));
    expect(o).toMatchObject({ clave: "1", campus: "Todos", oficina_unit_id: "u1" });
    expect((o.criterios as Record<string, string>).alin).toBe("Si");
    expect(lineaParaCarga({ ...lineas[0], pct: { "2027": 0 } }, new Map()).pct).toEqual({});
  });
});
