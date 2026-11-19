import { describe, expect, it } from "vitest";
import real from "./datos/pdifyt-2027-2035.json";
import { construirPlantilla, hojasPlantilla } from "./plantilla";
import { analizarLibro, conErrores, importarArchivo, leerFecha, leerNumero, lineasListas, problemasDe, type HojaCruda } from "./importar";
import { COLUMNAS, HOJA_LINEAS } from "./columnas";
import { resumir } from "./calculos";
import type { Linea } from "./modelo";

const lineas = real as unknown as Linea[];
const OFICINAS = ["Infraestructura y Planta Física", "Tecnología e Infraestructura TI"];

/** Una hoja «Líneas del plan» mínima, con la banda de 3 filas, para casos de error. */
function hojaDe(filas: (string | number | null)[][]): HojaCruda[] {
  const enc = COLUMNAS.map((c) => `${c.base} (x)`);
  const cuerpo = filas.map((f) => COLUMNAS.map((_, i) => (f[i] === undefined || f[i] === null ? "" : String(f[i]))));
  return [{ nombre: HOJA_LINEAS, oculta: false, filas: [["banda"], [""], [""], enc, ...cuerpo] }];
}
const base = (o: Record<string, string | number> = {}): (string | number | null)[] => {
  const v: Record<string, string | number> = { no: "1", clasif: "PLF", nombre: "Obra", campus: "Cúcuta", pilar: "P4. Gobernanza para el buen gobierno", monto: "1.250", prioridad: "Alto", ...o };
  return COLUMNAS.map((c) => v[c.id] ?? null);
};

describe("los 75 proyectos reales", () => {
  it("son 75 y suman $ 133.374.668.643", () => {
    expect(lineas).toHaveLength(75);
    expect(resumir(lineas).monto).toBe(133374668643);
    expect(resumir(lineas).evaluados).toBe(63);
  });

  it("plantilla llena → archivo → importar: mismos datos (ida y vuelta)", async () => {
    const buffer = await construirPlantilla({ lineas, oficinas: OFICINAS, ahora: new Date("2026-11-19") });
    const r = await importarArchivo(buffer, { oficinas: OFICINAS });
    expect(r.error).toBeNull();
    expect(r.origen).toBe("plan");
    expect(r.ejemplosIgnorados).toBe(2);
    expect(conErrores(r)).toHaveLength(0);
    expect(lineasListas(r)).toEqual(lineas);
    // lo único que se avisa son porcentajes que no suman 100 (la matriz real trae una línea con 99,9 %)
    expect(problemasDe(r).every((p) => p.nivel === "aviso")).toBe(true);
  });

  it("con oficina y correo: se conservan", async () => {
    const con = lineas.map((l, i) => (i === 0 ? { ...l, oficina: OFICINAS[1], gestorCorreo: "gestor@udes.edu.co" } : l));
    const r = await importarArchivo(await construirPlantilla({ lineas: con, oficinas: OFICINAS }), { oficinas: OFICINAS });
    expect(lineasListas(r)[0]).toMatchObject({ oficina: OFICINAS[1], gestorCorreo: "gestor@udes.edu.co" });
  });

  it("la plantilla vacía no trae líneas y trae sus 4 hojas (2 ocultas)", async () => {
    const hojas = hojasPlantilla({ oficinas: OFICINAS });
    expect(hojas.map((h) => h.nombre)).toEqual(["Instrucciones", "Líneas del plan", "Listas", "_Control"]);
    expect(hojas.filter((h) => h.oculta).map((h) => h.nombre)).toEqual(["Listas", "_Control"]);
    const r = await importarArchivo(await construirPlantilla({ oficinas: OFICINAS }));
    expect(r.error).toBeNull();
    expect(r.origen).toBe("plantilla");
    expect(r.lineas).toHaveLength(0);
    expect(r.ejemplosIgnorados).toBe(2);
  });

  it("los totales de lo leído coinciden con los de los datos", async () => {
    const r = await importarArchivo(await construirPlantilla({ lineas }));
    const t = resumir(lineasListas(r));
    expect(t.n).toBe(75);
    expect(t.porCampus.map((x) => [x.clave, x.n])).toEqual([["Bucaramanga", 37], ["Valledupar", 16], ["Cúcuta", 14], ["Todos", 8]]);
    expect(t.porPrioridad.map((x) => [x.clave, x.n])).toEqual([["Crítico", 16], ["Alto", 24], ["Medio", 23], ["Largo plazo", 12]]);
  });
});

describe("valores", () => {
  it("números a la colombiana", () => {
    expect(leerNumero("$ 6.971.769.559,00")).toBe(6971769559);
    expect(leerNumero("6971769559")).toBe(6971769559);
    expect(leerNumero("1.250")).toBe(1250);
    expect(leerNumero("12,5")).toBe(12.5);
    expect(leerNumero("12 %")).toBe(12);
    expect(leerNumero("mil")).toBeNull();
  });
  it("fechas", () => {
    expect(leerFecha("2027-01-18")).toBe("2027-01-18");
    expect(leerFecha("18/01/2027")).toBe("2027-01-18");
    expect(leerFecha("2027-02-30")).toBeNull();
    expect(leerFecha("pronto")).toBeNull();
  });
});

describe("casos de error", () => {
  it("una fila buena y una mala: la buena entra, la mala no, con fila y columna", () => {
    const r = analizarLibro(hojaDe([base(), base({ no: "2", monto: "mucho", campus: "Bogotá" })]));
    expect(lineasListas(r)).toHaveLength(1);
    const errores = problemasDe(r).filter((p) => p.nivel === "error");
    expect(errores.map((p) => [p.fila, p.columna])).toEqual([[6, "Campus"], [6, "Monto"]]);
    expect(errores[0].mensaje).toMatch(/Bucaramanga, Valledupar, Cúcuta, Todos/);
  });
  it("faltan obligatorias: nada se inventa", () => {
    const r = analizarLibro(hojaDe([base({ nombre: "", pilar: "", prioridad: "" })]));
    expect(lineasListas(r)).toHaveLength(0);
    expect(conErrores(r)[0].problemas.map((p) => p.columna)).toEqual(["Nombre", "Pilar", "Prioridad"]);
  });
  it("N.º repetido: la segunda no entra", () => {
    const r = analizarLibro(hojaDe([base(), base({ nombre: "Otra" })]));
    expect(lineasListas(r)).toHaveLength(1);
    expect(conErrores(r)[0].problemas[0].mensaje).toMatch(/fila 5/);
  });
  it("fin antes del inicio, Sí/No inválido y porcentaje fuera de rango", () => {
    const r = analizarLibro(hojaDe([base({ inicio: "2028-01-01", fin: "2027-01-01", "crit:alin": "quizá", "pct:2027": 140 })]));
    expect(conErrores(r)[0].problemas.map((p) => p.columna)).toEqual(["Criterio Alineación", "Fecha de fin", "% de inversión 2027"]);
  });
  it("avisos: porcentajes que no suman, oficina desconocida, correo malo", () => {
    const r = analizarLibro(hojaDe([base({ "pct:2027": 50, "pct:2028": 30, oficina: "Cafetería", gestorCorreo: "x" })]), { oficinas: OFICINAS });
    expect(lineasListas(r)).toHaveLength(1);
    expect(lineasListas(r)[0].oficina).toBeNull();
    expect(lineasListas(r)[0].gestorCorreo).toBeNull();
    expect(problemasDe(r).map((p) => p.nivel)).toEqual(["aviso", "aviso", "aviso", "aviso"]);
  });
  it("sin la hoja o sin encabezados explica qué hacer", () => {
    expect(analizarLibro([{ nombre: "Otra", oculta: false, filas: [] }]).error).toMatch(/Líneas del plan/);
    expect(analizarLibro([{ nombre: HOJA_LINEAS, oculta: false, filas: [["a", "b"]] }]).error).toMatch(/encabezados/);
  });
  it("un archivo que no es xlsx, o pesa de más, se rechaza con motivo", async () => {
    expect((await importarArchivo(new Uint8Array([1, 2, 3, 4, 5]))).error).toMatch(/no es un libro de Excel/);
    expect((await importarArchivo(new Uint8Array(5 * 1024 * 1024 + 1))).error).toMatch(/máximo es 5 MB/);
  });
  it("las fórmulas se ignoran y se avisa", () => {
    const hojas = hojaDe([base()]);
    hojas[0].formulas = new Set(["4:6"]);
    expect(analizarLibro(hojas).generales.some((p) => /fórmula/.test(p.mensaje))).toBe(true);
  });
});
