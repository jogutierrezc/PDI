import { describe, expect, it } from "vitest";
import { AYUDA_LOGROS, COLUMNAS_LOGROS, filasALogros, filasAMetas, logrosAFilas, metasAFilas } from "./excel-secciones";
import {
  CRITERIOS_BASE,
  criteriosDe,
  filasAcciones,
  filasCifras,
  idCriterio,
  indicadorNuevo,
  leerLibroIndicadores,
  normalizar,
} from "./indicadores-manual";
import { buscarInstancia, unaPorUnidad } from "./sedes";
import type { InstanciaRow } from "./types";

const base = criteriosDe([], [], []);

describe("criterios base de Resultados y evidencias", () => {
  it("son seis, en este orden", () => {
    expect(CRITERIOS_BASE.map((c) => c.nombre)).toEqual(["Extensión", "Internacionalización", "Investigación", "Enseñanza", "Gestión administrativa y financiera", "Acciones estratégicas"]);
    expect(base.map((c) => c.id)).toEqual(["ext", "int", "inv", "ens", "fin", "ae"]);
  });
  it("lo guardado con los ids de enseñanza de antes pasa a Enseñanza", () => {
    expect(["acad", "prof", "cal"].map(idCriterio)).toEqual(["ens", "ens", "ens"]);
    expect(normalizar([{ id: "a", criterio: "prof", nombre: "x" }])[0].criterio).toBe("ens");
  });
  it("una sección que consolida muestra solo los de sus dimensiones; los aprobados y propios se suman", () => {
    const k = criteriosDe(["acad", "prof", "cal"], [{ id: "c_1", nombre: "Aprobado" }], [{ id: "l_1", nombre: "Propio" }], false);
    expect(k.map((c) => c.id)).toEqual(["ens", "c_1", "l_1"]);
    expect(k.map((c) => c.origen)).toEqual(["base", "aprobado", "propio"]);
  });
});

describe("Excel de resultados: hojas Cifras y Acciones", () => {
  const criterios = criteriosDe([], [{ id: "c_1", nombre: "Bienestar" }], [{ id: "l_1", nombre: "Mi criterio" }]);
  it("cifras y acciones salen cada una a su hoja y se leen de vuelta, con criterios propios", () => {
    const cifra = { ...indicadorNuevo("l_1", "Mi criterio"), nombre: "Tasa", unidad: "%", anterior: 1, actual: 2, meta: 3, fuente: "Oficina" };
    const accion = { ...indicadorNuevo("ext", "Extensión", "accion"), nombre: "Feria", descripcion: "D", avance_texto: "H", finalizacion: "2026-2", proyeccion_texto: "P", proyeccion_num: 5 };
    const cab = ["x"];
    const r = leerLibroIndicadores(
      { cifras: [cab, ...filasCifras([cifra], criterios).map((f) => f.map((c) => String(c ?? "")))], acciones: [cab, ...filasAcciones([accion], criterios).map((f) => f.map((c) => String(c ?? "")))] },
      criterios,
    );
    expect(r.avisos).toEqual([]);
    expect(r.indicadores).toHaveLength(2);
    const [c, a] = r.indicadores;
    expect(c).toMatchObject({ criterio: "l_1", nombre: "Tasa", actual: 2, meta: 3 });
    expect(a).toMatchObject({ criterio: "ext", tipo: "accion", descripcion: "D", avance_texto: "H", finalizacion: "2026-2", proyeccion_num: 5 });
  });
  it("un criterio nuevo escrito en el archivo se crea una vez aunque esté en las dos hojas", () => {
    const r = leerLibroIndicadores(
      {
        cifras: [["h"], ["Nuevo criterio", "Cifra 1", "", "", "", "4", "5"]],
        acciones: [["h"], ["nuevo criterio", "Acción 1", "", "descr", "hecho"]],
      },
      criterios,
    );
    expect(r.criteriosNuevos).toHaveLength(1);
    expect(new Set(r.indicadores.map((i) => i.criterio)).size).toBe(1);
    expect(r.avisos.some((x) => x.startsWith("Cifras, fila 2"))).toBe(true);
  });
  it("la hoja única de antes se sigue leyendo y sus nombres viejos llegan a su criterio", () => {
    const r = leerLibroIndicadores({ indicadores: [["h"], ["Gestión académica", "Tasa", "", "Más es mejor", "", "5", "6", "", "", "Cifra"]] }, criterios);
    expect(r.indicadores[0].criterio).toBe("ens");
    expect(r.criteriosNuevos).toHaveLength(0);
  });
});

describe("Excel de logros y de metas anuales", () => {
  it("logros: ida y vuelta, el anexo inválido queda vacío", () => {
    const filas = [["Logro A", "Resultado A", "2"], ["Logro B", "Resultado B", "x"]];
    expect(filasALogros(filas)).toEqual([{ titulo: "Logro A", resultado: "Resultado A", anexo: 2 }, { titulo: "Logro B", resultado: "Resultado B", anexo: null }]);
    expect(logrosAFilas(filasALogros(filas))[0]).toEqual(filas[0]);
    expect(COLUMNAS_LOGROS).toHaveLength(3);
    expect(AYUDA_LOGROS.length).toBeGreaterThan(1);
  });
  it("metas: lee coma decimal y %, y deja vacío el alcanzado pendiente", () => {
    expect(filasAMetas([["Meta", "12,5", ""], ["Otra", "80 %", "75"]])).toEqual([
      { meta: "Meta", programado: 12.5, alcanzado: null },
      { meta: "Otra", programado: 80, alcanzado: 75 },
    ]);
    expect(metasAFilas([{ meta: "M", programado: 12.5, alcanzado: null }])).toEqual([["M", "12,5", ""]]);
  });
});

describe("un informe por unidad (multicampus)", () => {
  const inst = (id: string, unit: string, estado: InstanciaRow["estado"], campus: string | null): InstanciaRow =>
    ({ id, ciclo_id: "c1", unit_id: unit, plantilla: "A", destino: null, estado, nota_revision: "", enviado_en: null, enviado_por: null, aprobado_en: null, aprobado_por: null, campus_id: campus }) as InstanciaRow;
  it("deja uno por unidad y ciclo: el más avanzado, sin sede", () => {
    const r = unaPorUnidad([inst("1", "fac", "draft", "bga"), inst("2", "fac", "sent", "cuc"), inst("3", "otra", "draft", null)]);
    expect(r.map((i) => [i.id, i.campus_id])).toEqual([["2", null], ["3", null]]);
  });
  it("buscarInstancia ya no mira la sede", () => {
    expect(buscarInstancia([inst("1", "fac", "draft", null)], "fac")?.id).toBe("1");
  });
});
