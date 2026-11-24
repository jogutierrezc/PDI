/* Catálogo del reporte: el Excel real de la raíz (ODS 4, 5, 10 y 17) y un libro
   sintético para los casos de las opciones, el tipo y las advertencias. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  indicadoresPorOds,
  leerCatalogo,
  numeroCelda,
  oficinasDe,
  prioridadDesde,
  textoCelda,
  tipoDeRequerimiento,
  tipoDeResumen,
} from "./catalogo-excel";

const RUTA_EXCEL = resolve(__dirname, "../../../../Impact_2026_UDES_ajustado_ODS_4_5_10_17.xlsx");

async function cargarReal(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS acepta un Buffer; leerlo aquí evita depender de la ruta de trabajo.
  const bytes = readFileSync(RUTA_EXCEL);
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb;
}

describe("catálogo desde el Excel real de THE", () => {
  it("ODS 4, 5, 10 y 17 dan 7, 16, 15 y 26 indicadores: 64 en total", async () => {
    const cat = leerCatalogo(await cargarReal());
    const conteo = indicadoresPorOds(cat.filas);
    expect(conteo.get(4)).toBe(7);
    expect(conteo.get(5)).toBe(16);
    expect(conteo.get(10)).toBe(15);
    expect(conteo.get(17)).toBe(26);
    const total = [4, 5, 10, 17].reduce((s, ods) => s + (conteo.get(ods) ?? 0), 0);
    expect(total).toBe(64);
  });

  it("los 64 indicadores coinciden con la hoja CONTROL UDES 2026", async () => {
    const wb = await cargarReal();
    const control = wb.getWorksheet("CONTROL UDES 2026");
    expect(control).toBeDefined();
    const ids = new Set<string>();
    control!.eachRow((row, n) => {
      if (n <= 4) return;
      const ref = textoCelda(row.getCell(2).value);
      if (/^\d+\.\d+\.\d+$/.test(ref)) ids.add(ref);
    });
    const cat = leerCatalogo(wb);
    const indicadores = new Set(cat.filas.filter((f) => f.nivel === "indicator" && [4, 5, 10, 17].includes(f.ods)).map((f) => f.id));
    expect(ids.size).toBe(64);
    expect([...indicadores].sort()).toEqual([...ids].sort());
  });

  it("las 17 hojas SDG producen catálogo, y las de 7 columnas también", async () => {
    const cat = leerCatalogo(await cargarReal());
    expect(cat.ods).toHaveLength(17);
    expect(cat.ods).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    for (const ods of cat.ods) {
      const filas = cat.filas.filter((f) => f.ods === ods);
      expect(filas.some((f) => f.nivel === "indicator"), `ODS ${ods}`).toBe(true);
      expect(filas.some((f) => f.nivel === "metric"), `ODS ${ods} sin métrica`).toBe(true);
    }
    // SDG7 solo trae 7 columnas: sin peso ni oficinas, pero con texto en inglés.
    const sdg7 = cat.filas.filter((f) => f.ods === 7 && f.nivel === "indicator");
    expect(sdg7[0].texto_en.length).toBeGreaterThan(0);
    expect(sdg7[0].peso).toBeNull();
    expect(sdg7[0].responsables).toEqual([]);
  });

  it("tipo, peso, prioridad y oficinas del indicador 4.2.1", async () => {
    const cat = leerCatalogo(await cargarReal());
    const f = cat.filas.find((x) => x.id === "4.2.1")!;
    expect(f.nivel).toBe("indicator");
    expect(f.padre).toBe("4.2");
    expect(f.tipo).toBe("dato");
    expect(f.peso).toBeCloseTo(0.154);
    expect(f.prioridad).toBe("alta");
    expect(f.texto_en).toMatch(/^Proportion of graduates/);
    expect(f.texto_es).toMatch(/^Proporción de titulados/);
    expect(f.coordinacion).toBe("Planeación Institucional");
    expect(f.responsables).toEqual(["Planeación Institucional"]);
    expect(f.apoyo).toEqual(["Registro y Control Académico", "Vicerrectoría de Enseñanza"]);
  });

  it("las filas siguientes con la misma referencia son opciones del indicador", async () => {
    const cat = leerCatalogo(await cargarReal());
    const op = cat.filas.find((x) => x.id === "4.2.1/2")!;
    expect(op.nivel).toBe("option");
    expect(op.padre).toBe("4.2.1");
    expect(op.texto_en).toBe("Number of graduates");
    expect(op.tipo).toBe("dato");
    const sinOpciones = cat.filas.filter((x) => x.nivel === "option" && x.padre === "4.3.1");
    expect(sinOpciones.map((x) => x.id)).toEqual(["4.3.1/2", "4.3.1/3", "4.3.1/4"]);
  });

  it("las métricas no llevan tipo; los indicadores y opciones sí", async () => {
    const cat = leerCatalogo(await cargarReal());
    const metricas = cat.filas.filter((f) => f.nivel === "metric");
    expect(metricas.length).toBeGreaterThan(0);
    expect(metricas.every((f) => f.tipo === null)).toBe(true);
    expect(cat.filas.filter((f) => f.nivel !== "metric").every((f) => f.tipo !== null)).toBe(true);
  });

  it("tipos por requerimiento: política = doc, evidencia = ev, cifra = dato", async () => {
    const cat = leerCatalogo(await cargarReal());
    const porId = new Map(cat.filas.map((f) => [f.id, f]));
    expect(porId.get("4.3.1")?.tipo).toBe("ev");
    expect(porId.get("4.3.5")?.tipo).toBe("doc");
    expect(porId.get("5.6.1")?.tipo).toBe("doc");
    expect(porId.get("5.4.1")?.tipo).toBe("dato");
    expect(porId.get("17.4.4")?.tipo).toBe("ev");
  });

  it("la prioridad se lee aunque la celda sea una fórmula (=Alta)", async () => {
    const cat = leerCatalogo(await cargarReal());
    expect(cat.filas.find((f) => f.id === "4.3.1")?.prioridad).toBe("media");
    expect(cat.filas.find((f) => f.id === "17.2.1")?.prioridad).toBe("media");
  });

  it("el orden del catálogo sigue el de la hoja y los ids son únicos", async () => {
    const cat = leerCatalogo(await cargarReal());
    const ids = cat.filas.map((f) => `${f.ods}:${f.id}`);
    expect(new Set(ids).size).toBe(ids.length);
    const ordenes = cat.filas.map((f) => f.orden);
    expect([...ordenes].sort((a, b) => a - b)).toEqual(ordenes);
  });
});

/* ---------------------------------------------------------------------------
   Libro sintético: casos que el Excel real no muestra.
   --------------------------------------------------------------------------- */

function libro(hojas: Record<string, (string | number | null)[][]>, resumen?: (string | null)[][]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  if (resumen) {
    const s = wb.addWorksheet("summary");
    resumen.forEach((fila) => s.addRow(fila));
  }
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(nombre);
    filas.forEach((fila) => ws.addRow(fila));
  }
  return wb;
}

const CABECERA_7 = ["Type", "Metric and indicator reference", "Metric / Indicator", "Value (for continuous data)", "Yes/No", "Evidence1", "Public (Yes/No)"];
const CABECERA_17 = [
  "Type",
  "Metric and indicator reference",
  "Metric / Indicator",
  "Metrica / Indicador Este año solicitamos información del año académico 2024.",
  "Fuente datos",
  "Value (for continuous data)",
  "Yes/No",
  "Evidence1",
  "Public (Yes/No)",
  "Comentarios",
  "Coordinación del reporte",
  "Responsable / fuente principal",
  "Dependencia(s) de apoyo",
  "Tipo de requerimiento",
  "Peso oficial THE",
  "Prioridad",
  "Estado",
];

describe("casos sintéticos del catálogo", () => {
  it("una opción sin tipo hereda el del indicador; una referencia sin tipo se infiere del resumen", () => {
    const wb = libro(
      {
        SDG9: [
          ["SDG9: Industry", "", ""],
          CABECERA_7,
          ["Metric", "9.3", "University spin offs"],
          ["Indicator", "9.3.1", "Number of university spin offs"],
          ["", "9.3.1", "Ad hoc"],
          ["Indicator", "9.4.1", "Sin tipo en la hoja"],
        ],
      },
      [
        ["Metric and indicator reference", "Metric / Indicator", "Question format", "Evidence Required", "Policy dates required"],
        ["9.3.1", "Número de spin offs", "YES/NO", "YES", "NO"],
        ["9.4.1", "Sin tipo en la hoja", "Continuous", "NO", "NO"],
      ],
    );
    const cat = leerCatalogo(wb);
    expect(cat.filas.find((f) => f.id === "9.3.1/2")?.tipo).toBe("ev");
    expect(cat.filas.find((f) => f.id === "9.4.1")?.tipo).toBe("dato");
    expect(cat.advertencias).toEqual([]);
  });

  it("sin tipo ni resumen, el indicador queda como ev y se avisa", () => {
    const wb = libro({
      SDG2: [CABECERA_7, ["Metric", "2.9", "Métrica suelta"], ["Indicator", "2.9.1", "Algo sin tipo"]],
    });
    const cat = leerCatalogo(wb);
    const ind = cat.filas.find((f) => f.id === "2.9.1")!;
    expect(ind.tipo).toBe("ev");
    expect(cat.advertencias.some((a) => a.includes("2.9.1"))).toBe(true);
  });

  it("una métrica repetida se omite con aviso y el peso en porcentaje se corrige", () => {
    const wb = libro({
      SDG3: [
        CABECERA_17,
        ["Metric", "3.2", "Metric uno", "Métrica uno", "", "", "", "", "", "", "", "", "", "Métrica / bloque de evaluación", 15, "=Alta", ""],
        ["Metric", "3.2", "Metric repetida"],
        ["Indicator", "3.2.1", "Indicador", "Indicador ES", "", "", "", "", "", "", "", "Oficina A / Oficina B", "Apoyo X", "Dato cuantitativo 2024", 0.2, "=Baja", ""],
      ],
    });
    const cat = leerCatalogo(wb);
    expect(cat.filas.filter((f) => f.id === "3.2")).toHaveLength(1);
    expect(cat.advertencias.some((a) => a.includes("aparece dos veces"))).toBe(true);
    expect(cat.filas.find((f) => f.id === "3.2")?.peso).toBeCloseTo(0.15);
    expect(cat.advertencias.some((a) => a.includes("porcentaje"))).toBe(true);
    const ind = cat.filas.find((f) => f.id === "3.2.1")!;
    expect(ind.responsables).toEqual(["Oficina A", "Oficina B"]);
    expect(ind.apoyo).toEqual(["Apoyo X"]);
    expect(ind.texto_es).toBe("Indicador ES");
    expect(ind.prioridad).toBe("baja");
  });

  it("una hoja sin encabezado «Type» se omite con aviso", () => {
    const wb = libro({ SDG4: [["sin nada"], ["tampoco"]] });
    const cat = leerCatalogo(wb);
    expect(cat.filas).toEqual([]);
    expect(cat.advertencias.some((a) => a.includes("SDG4"))).toBe(true);
  });

  it("las hojas que no son SDG n se ignoran", () => {
    const wb = libro({ "CONTROL UDES 2026": [CABECERA_7, ["Indicator", "1.2.1", "x"]], SDG18: [CABECERA_7, ["Indicator", "18.1.1", "x"]] });
    const cat = leerCatalogo(wb);
    expect(cat.ods).toEqual([]);
    expect(cat.filas).toEqual([]);
  });
});

describe("ayudas de celda", () => {
  it("textoCelda normaliza texto enriquecido, fórmulas y vínculos", () => {
    expect(textoCelda({ richText: [{ text: "Hola " }, { text: "  mundo" }] })).toBe("Hola mundo");
    expect(textoCelda({ formula: "A1", result: "=Alta" })).toBe("=Alta");
    expect(textoCelda({ text: "Enlace", hyperlink: "https://udes.edu.co" })).toBe("Enlace");
    expect(textoCelda({ hyperlink: "https://udes.edu.co" })).toBe("https://udes.edu.co");
    expect(textoCelda(null)).toBe("");
    expect(textoCelda(42)).toBe("42");
    expect(textoCelda("  a \n  b  ")).toBe("a b");
  });

  it("numeroCelda acepta coma decimal y fórmulas con resultado numérico", () => {
    expect(numeroCelda("0,154")).toBeCloseTo(0.154);
    expect(numeroCelda({ formula: "x", result: 0.05 })).toBe(0.05);
    expect(numeroCelda("")).toBeNull();
    expect(numeroCelda("abc")).toBeNull();
  });

  it("prioridadDesde quita el signo de igual y rechaza lo que no es prioridad", () => {
    expect(prioridadDesde("=Alta")).toBe("alta");
    expect(prioridadDesde({ formula: "x", result: "Media" })).toBe("media");
    expect(prioridadDesde("Urgente")).toBeNull();
  });

  it("oficinasDe separa por « / » y descarta vacíos", () => {
    expect(oficinasDe("Registro y Control Académico / Vicerrectoría de Enseñanza")).toEqual([
      "Registro y Control Académico",
      "Vicerrectoría de Enseñanza",
    ]);
    expect(oficinasDe("A/B / ")).toEqual(["A", "B"]);
    expect(oficinasDe("")).toEqual([]);
  });

  it("tipoDeRequerimiento y tipoDeResumen", () => {
    expect(tipoDeRequerimiento("Política / evidencia pública")).toBe("doc");
    expect(tipoDeRequerimiento("Evidencia (sin puntaje 2026)")).toBe("ev");
    expect(tipoDeRequerimiento("Dato cuantitativo 2024")).toBe("dato");
    expect(tipoDeRequerimiento("Métrica / bloque de evaluación")).toBeNull();
    expect(tipoDeRequerimiento("Investigación Scopus")).toBe("inv");
    expect(tipoDeResumen({ formato: "Continuous", evidencia: false, politica: false })).toBe("dato");
    expect(tipoDeResumen({ formato: "YES/NO", evidencia: true, politica: true })).toBe("doc");
    expect(tipoDeResumen({ formato: "YES/NO", evidencia: true, politica: false })).toBe("ev");
    expect(tipoDeResumen(undefined)).toBeNull();
  });
});
