/* Importador de Excel: un libro de ejemplo construido en memoria con exceljs. */

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { Campus } from "../tipos";
import { CONCEPTOS_BASE, claveDePropio, emparejarConcepto } from "./conceptos";
import { analizarLibro, campusDe, columnasParaCrear, hojaPorNombre, inferirTipo, paraGuardar, prepararCarga } from "./importador-excel";

const CAMPUS: Campus[] = [
  { id: "c-buc", slug: "bucaramanga", code: "BUC", name: "Bucaramanga" },
  { id: "c-cuc", slug: "cucuta", code: "CUC", name: "Cúcuta" },
  { id: "c-val", slug: "valledupar", code: "VAL", name: "Valledupar" },
  { id: "c-bog", slug: "bogota", code: "BOG", name: "Bogotá" },
];

/** El Excel de ejemplo: título arriba, encabezados en la fila 3, una fila vacía y errores sembrados. */
function libroDeEjemplo(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Movilidad saliente");
  ws.addRow(["Oficina de Internacionalización · Movilidad 2026-2"]);
  ws.addRow([]);
  ws.addRow(["Periodo", "Campus", "Programa", "No. documento", "País destino", "Universidad destino", "Fecha inicio", "Fecha fin", "Duración", "Financiación", "Créditos homologados", "Tipo de beca"]);
  const filas: unknown[][] = [
    ["2026-2", "Cúcuta", "Derecho", "1.090.123", "Chile", "U. de Chile", new Date(Date.UTC(2026, 7, 24)), "04/12/2026", "", "convenio", 18, "Parcial"],
    ["2026-2", "Cucuta", "Administración", "1090456", "Perú", "U. del Pacífico", "2026-09-14", "2026-09-01", "", "Propia", 6, "Total"],
    [],
    ["2026-2", "Bucaramanga", "Medicina", "1098777", "España", "U. de Salamanca", "2026-09-01", "2026-10-30", "", "Beca UDES", 12, "Parcial"],
    ["2026-1", "CUC", "Ing. Ambiental", "", "Francia", "U. Grenoble", "2026-09-01", "2026-11-20", "", "Regalo", "doce", "Parcial"],
    ["2026-2", "Cúcuta", "Psicología", "1090999", "Brasil", "USP", "2026-02-30", "", "", "Externa", 3, "Total"],
    ["2026-2", "Cúcuta", "Enfermería", "1090111", "Argentina", "U. de Córdoba", "2026-08-31", "2026-11-27", "", "Externa", 9, "Parcial"],
  ];
  for (const f of filas) ws.addRow(f);
  const oculta = wb.addWorksheet("Listas");
  oculta.state = "hidden";
  oculta.addRow(["Campus", "Programa"]);
  wb.addWorksheet("Notas").addRow(["solo una nota"]);
  return wb;
}

describe("emparejar conceptos", () => {
  it("empareja sin acentos, por sinónimos y por parecido; lo demás es propio", () => {
    expect(emparejarConcepto("PAÍS DE LA CONTRAPARTE", CONCEPTOS_BASE)?.concepto.id).toBe("pais_contraparte");
    expect(emparejarConcepto("No. documento", CONCEPTOS_BASE)?.concepto.id).toBe("numero_documento");
    expect(emparejarConcepto("Universidad destino", CONCEPTOS_BASE)).toMatchObject({ concepto: { id: "institucion_contraparte" }, como: "exacto" });
    expect(emparejarConcepto("Nombre de la institución aliada", CONCEPTOS_BASE)).toMatchObject({ concepto: { id: "institucion_contraparte" }, como: "parecido" });
    expect(emparejarConcepto("Créditos homologados", CONCEPTOS_BASE)).toBeNull();
    // Un concepto ya usado en la hoja no se repite.
    expect(emparejarConcepto("País", CONCEPTOS_BASE, new Set(["pais_contraparte"]))).toBeNull();
  });

  it("los campos propios llevan clave «propio_» sin chocar", () => {
    expect(claveDePropio("Nº de créditos")).toBe("propio_n_de_creditos");
    expect(claveDePropio("Tipo de beca", ["propio_tipo_de_beca"])).toBe("propio_tipo_de_beca_2");
  });

  it("infiere fecha, número, lista (pocos valores) y texto", () => {
    expect(inferirTipo([new Date(), "2026-01-02", "03/04/2026"]).tipo).toBe("fecha");
    expect(inferirTipo([1, "2,5", "7"]).tipo).toBe("numero");
    expect(inferirTipo(["Sí", "No", "sí", "No", "No"])).toEqual({ tipo: "lista", opciones: ["No", "Sí"] });
    expect(inferirTipo(["a", "b", "c"]).tipo).toBe("texto");
  });
});

describe("analizarLibro", () => {
  const libro = analizarLibro(libroDeEjemplo(), CONCEPTOS_BASE);
  const hoja = libro.hojas[0];

  it("lee las hojas visibles y encuentra la fila de encabezados", () => {
    expect(libro.hojas.map((h) => h.nombre)).toEqual(["Movilidad saliente"]);
    expect(libro.advertencias.join(" ")).toMatch(/«Listas» está oculta/);
    expect(libro.advertencias.join(" ")).toMatch(/«Notas» no tiene una fila de encabezados/);
    expect(hoja.filaEncabezado).toBe(3);
    expect(hoja.filas).toHaveLength(6);
    expect(hoja.filas[2].fila).toBe(7);
  });

  it("empareja columnas con conceptos, marca implícitas, propias y la duración calculada", () => {
    const por = Object.fromEntries(hoja.columnas.map((c) => [c.encabezado, c]));
    expect(por.Periodo).toMatchObject({ implicito: "periodo", como: "implicito" });
    expect(por.Campus).toMatchObject({ implicito: "campus" });
    expect(por["País destino"]).toMatchObject({ clave: "pais_contraparte", concepto_id: "pais_contraparte", como: "exacto" });
    expect(por["Fecha inicio"]).toMatchObject({ clave: "fecha_inicio", tipo: "fecha" });
    expect(por["Duración"]).toMatchObject({ tipo: "calculado", calculo: { tipo: "dias_entre", desde: "fecha_inicio", hasta: "fecha_fin" } });
    expect(por["Financiación"]).toMatchObject({ tipo: "lista", opciones: ["Propia", "Beca UDES", "Convenio", "Externa"] });
    expect(por["Créditos homologados"]).toMatchObject({ clave: "propio_creditos_homologados", como: "propio", tipo: "texto" });
    expect(por["Tipo de beca"]).toMatchObject({ como: "propio", tipo: "lista", opciones: ["Parcial", "Total"] });
  });

  it("columnasParaCrear deja fuera periodo y campus", () => {
    const cols = columnasParaCrear(hoja);
    expect(cols.map((c) => c.clave)).not.toContain("campus");
    expect(cols.map((c) => c.clave)).not.toContain("periodo");
    expect(cols[0]).toMatchObject({ clave: "programa", orden: 1, obligatorio: false });
  });

  it("encuentra la hoja de destino por nombre", () => {
    expect(hojaPorNombre("MOVILIDAD  SALIENTE", [{ nombre: "Movilidad saliente" }])).toEqual({ nombre: "Movilidad saliente" });
  });
});

describe("prepararCarga", () => {
  const hoja = analizarLibro(libroDeEjemplo(), CONCEPTOS_BASE).hojas[0];
  const destino = columnasParaCrear(hoja).map((c) => (c.clave === "numero_documento" ? { ...c, obligatorio: true } : c));

  it("Gestor de Cúcuta: solo sus filas pasan; errores por fila y celda en español", () => {
    const carga = prepararCarga(hoja, destino, { campus: CAMPUS, permitidos: ["c-cuc"], periodo: "2026-2" });
    const errores = (fila: number) => carga.errores.filter((e) => e.fila === fila).map((e) => `${e.columna}: ${e.mensaje}`);

    // Fila 4: válida; la fecha Date y la dd/mm/aaaa quedan ISO; el documento es texto; la lista se canoniza.
    expect(errores(4)).toEqual([]);
    expect(carga.filas[0].datos).toMatchObject({
      numero_documento: "1.090.123",
      fecha_inicio: "2026-08-24",
      fecha_fin: "2026-12-04",
      duracion_dias: 102,
      financiacion: "Convenio",
      propio_creditos_homologados: "18",
    });
    // Fila 5: «Cucuta» sin tilde es Cúcuta, pero el fin es anterior al inicio.
    expect(errores(5)).toEqual(["fecha_fin: «Fecha de fin» (2026-09-01) es anterior a «Fecha de inicio» (2026-09-14)."]);
    expect(carga.filas[1].campus_id).toBe("c-cuc");
    // Fila 7: es de Bucaramanga, y el Gestor solo carga Cúcuta.
    expect(errores(7)).toEqual(["campus: La fila es de Bucaramanga: usted solo puede cargar Cúcuta."]);
    // Fila 8: obligatorio vacío, lista inválida, periodo distinto.
    expect(errores(8)).toEqual([
      "financiacion: «Regalo» no es una opción de «Financiación». Opciones: Propia, Beca UDES, Convenio, Externa.",
      "numero_documento: Falta «Número de documento»: es obligatorio.",
      "periodo: La fila es del periodo «2026-1» y la carga es de 2026-2.",
    ]);
    // Fila 9: fecha que no existe.
    expect(errores(9)[0]).toMatch(/«2026-02-30» no es una fecha válida para «Fecha de inicio»/);

    expect(carga.validas.map((f) => f.fila)).toEqual([4, 10]);
    expect(carga.porCampus).toEqual({ "c-cuc": 2 });
    expect(carga.ignoradas).toEqual([]);
    expect(paraGuardar(carga)).toEqual([
      { campus_id: "c-cuc", datos: carga.filas[0].datos, orden: 0 },
      { campus_id: "c-cuc", datos: carga.validas[1].datos, orden: 1 },
    ]);
  });

  it("Director: carga varios campus", () => {
    const carga = prepararCarga(hoja, destino, { campus: CAMPUS, permitidos: CAMPUS.map((c) => c.id), periodo: "2026-2" });
    expect(carga.porCampus).toEqual({ "c-cuc": 2, "c-buc": 1 });
  });

  it("sin columna de campus, el campus fijo; si no hay, lo pide", () => {
    const sinCampus = { ...hoja, columnas: hoja.columnas.filter((c) => c.implicito !== "campus") };
    expect(prepararCarga(sinCampus, destino, { campus: CAMPUS, permitidos: ["c-val"], periodo: "2026-2" }).porCampus).toEqual({ "c-val": 3 });
    const ambiguo = prepararCarga(sinCampus, destino, { campus: CAMPUS, permitidos: ["c-val", "c-bog"], periodo: "2026-2" });
    expect(ambiguo.validas).toEqual([]);
    expect(ambiguo.errores[0].mensaje).toMatch(/Falta el campus/);
  });

  it("avisa columnas que sobran y obligatorias que el Excel no trae", () => {
    const otro = [...destino.filter((c) => c.clave !== "propio_tipo_de_beca"), { clave: "propio_tutor", etiqueta: "Tutor", tipo: "texto" as const, concepto_id: null, obligatorio: true, opciones: [] }];
    const carga = prepararCarga(hoja, otro, { campus: CAMPUS, permitidos: ["c-cuc"], periodo: "2026-2" });
    expect(carga.ignoradas).toEqual(["Tipo de beca"]);
    expect(carga.faltantes).toEqual(["Tutor"]);
  });

  it("lee el campus por nombre, slug o código", () => {
    expect(campusDe("BOGOTA", CAMPUS)?.id).toBe("c-bog");
    expect(campusDe("cuc", CAMPUS)?.id).toBe("c-cuc");
    expect(campusDe("Medellín", CAMPUS)).toBeNull();
  });
});
