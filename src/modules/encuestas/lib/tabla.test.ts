import { describe, expect, it } from "vitest";
import type { Aporte } from "../tipos";
import { aCsv, aTsv, celdaSegura, COLUMNAS, dependenciasDe, fechaCorta, filasDe, matrizDe, resumir, SIN_FILTROS } from "./tabla";

const aporte = (p: Partial<Aporte> & { id: string }): Aporte => ({
  encuesta_id: "e1",
  correo: "ana@udes.edu.co",
  correo_verificado: true,
  dependencia: "Biblioteca",
  tipo: "logro",
  titulo: "Un título de prueba",
  descripcion: "Una descripción de prueba suficientemente larga.",
  estado: "recibido",
  created_at: "2026-10-14T14:12:00Z",
  cifras: [],
  ...p,
});

const cifra = (id: string, aporte_id: string, orden: number, que: string, valor: number, tipo: "estudiantes" | "dinero" | "porcentaje" | "otro" = "estudiantes", otro: string | null = null) => ({ id, aporte_id, orden, que, tipo, otro, valor });

const A = [
  aporte({ id: "a2", dependencia: "Egresados", tipo: "reto", titulo: "Más encuentros", created_at: "2026-10-15T10:00:00Z", estado: "revisado", cifras: [cifra("c3", "a2", 0, "Egresados", 3150, "otro", "egresados")] }),
  aporte({ id: "a1", dependencia: "Biblioteca", titulo: "Digitalizar el fondo", created_at: "2026-10-14T14:12:00Z", cifras: [cifra("c2", "a1", 1, "Presupuesto", 120000000, "dinero"), cifra("c1", "a1", 0, "Estudiantes", 412)] }),
  aporte({ id: "a3", dependencia: "Biblioteca", titulo: "Otro aporte", created_at: "2026-10-16T10:00:00Z", estado: "para_video", correo: "=cmd@udes.edu.co", cifras: [cifra("c4", "a3", 0, "Crecimiento", 22.5, "porcentaje")] }),
];

const orden = { clave: "n", sentido: 1 } as const;

describe("filasDe", () => {
  it("numera por orden de llegada y ordena", () => {
    const f = filasDe(A, "aporte", SIN_FILTROS, orden);
    expect(f.map((x) => [x.n, x.aporte.id])).toEqual([[1, "a1"], [2, "a2"], [3, "a3"]]);
    expect(filasDe(A, "aporte", SIN_FILTROS, { clave: "dependencia", sentido: -1 }).map((x) => x.aporte.id)).toEqual(["a2", "a1", "a3"]);
  });
  it("«Por cifra» abre una fila por cifra, en su orden", () => {
    const f = filasDe(A, "cifra", SIN_FILTROS, orden);
    expect(f.map((x) => x.cifra?.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(filasDe(A, "cifra", SIN_FILTROS, { clave: "valor", sentido: -1 }).map((x) => x.cifra?.id)).toEqual(["c2", "c3", "c1", "c4"]);
  });
  it("filtra por tipo, dependencia, estado y búsqueda (también en las cifras)", () => {
    expect(filasDe(A, "aporte", { ...SIN_FILTROS, tipo: "reto" }, orden)).toHaveLength(1);
    expect(filasDe(A, "aporte", { ...SIN_FILTROS, dependencia: "Biblioteca" }, orden)).toHaveLength(2);
    expect(filasDe(A, "aporte", { ...SIN_FILTROS, estado: "para_video" }, orden).map((x) => x.aporte.id)).toEqual(["a3"]);
    expect(filasDe(A, "aporte", { ...SIN_FILTROS, q: "PRESUPUESTO" }, orden).map((x) => x.aporte.id)).toEqual(["a1"]);
    expect(filasDe(A, "aporte", { ...SIN_FILTROS, q: "zzz" }, orden)).toEqual([]);
  });
  it("cada columna ordenable existe en su vista", () => {
    for (const vista of ["aporte", "cifra"] as const) for (const c of COLUMNAS[vista]) expect(() => filasDe(A, vista, SIN_FILTROS, { clave: c.clave, sentido: 1 })).not.toThrow();
  });
});

describe("resumen y filtros", () => {
  it("cuenta lo recibido", () => {
    expect(resumir(A)).toEqual({ recibidas: 3, logros: 2, retos: 1, dependencias: 2, cifras: 4 });
    expect(dependenciasDe(A)).toEqual(["Biblioteca", "Egresados"]);
  });
});

describe("exportar", () => {
  it("la fecha sale en hora de Bogotá", () => {
    expect(fechaCorta("2026-10-14T14:12:00Z")).toBe("2026-10-14 09:12");
    expect(fechaCorta("no es fecha")).toBe("");
  });
  it("«Por aporte» junta las cifras en una celda", () => {
    const m = matrizDe(filasDe(A, "aporte", SIN_FILTROS, orden), "aporte");
    expect(m.encabezados).toHaveLength(m.filas[0].length);
    expect(m.filas[0][7]).toBe("Estudiantes: 412 | Presupuesto: $ 120.000.000");
  });
  it("«Por cifra» trae el número crudo para que Excel pueda sumar", () => {
    const m = matrizDe(filasDe(A, "cifra", SIN_FILTROS, orden), "cifra");
    expect(m.encabezados).toHaveLength(m.filas[0].length);
    expect(m.filas[1][8]).toBe(120000000);
    expect(m.filas[2][7]).toBe("egresados");
  });
  it("no deja que una celda de texto se lea como fórmula", () => {
    expect(celdaSegura("=SUMA(A1)")).toBe("'=SUMA(A1)");
    expect(celdaSegura("+57 300")).toBe("'+57 300");
    expect(celdaSegura("-3")).toBe("'-3");
    expect(celdaSegura("normal")).toBe("normal");
    expect(celdaSegura(-3)).toBe("-3");
  });
  it("TSV: sin tabuladores ni saltos dentro de las celdas", () => {
    const tsv = aTsv({ encabezados: ["a", "b"], filas: [["x\ty\nz", 2]] });
    expect(tsv).toBe("a\tb\nx y z\t2");
  });
  it("CSV: punto y coma, comillas escapadas y marca UTF-8", () => {
    const csv = aCsv({ encabezados: ["a", "b"], filas: [['di "hola"; ok', 2]] });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿"a";"b"\r\n"di ""hola""; ok";"2"');
    expect(aCsv(matrizDe(filasDe(A, "aporte", SIN_FILTROS, orden), "aporte"))).toContain("\"'=cmd@udes.edu.co\"");
  });
});

describe("fecha de cierre", () => {
  it("va y vuelve sin correrse de día", async () => {
    const { cierreAFecha, fechaACierre } = await import("./tabla");
    expect(fechaACierre("2026-11-15")).toBe("2026-11-15T23:59:59-05:00");
    expect(cierreAFecha(fechaACierre("2026-11-15"))).toBe("2026-11-15");
    expect(cierreAFecha("2026-11-15")).toBe("2026-11-15");
    expect(cierreAFecha(null)).toBe("");
    expect(fechaACierre("")).toBeNull();
  });
});

describe("estaCerrada", () => {
  it("cerrada a mano o vencida; el día de cierre aún recibe", async () => {
    const { estaCerrada } = await import("./tabla");
    const hoy = new Date("2026-11-15T20:00:00-05:00");
    expect(estaCerrada({ abierta: false, cierra_el: null }, hoy)).toBe(true);
    expect(estaCerrada({ abierta: true, cierra_el: null }, hoy)).toBe(false);
    expect(estaCerrada({ abierta: true, cierra_el: "2026-11-15" }, hoy)).toBe(false);
    expect(estaCerrada({ abierta: true, cierra_el: "2026-11-14" }, hoy)).toBe(true);
  });
});
