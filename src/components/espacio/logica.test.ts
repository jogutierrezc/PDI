import { describe, expect, it } from "vitest";
import { aplicarPegado, cambiarCelda, cambiosPendientes, erroresEnCeldas, parsearPortapapeles, reconciliar, siguienteError } from "./logica";
import type { EspColumna, FilaLocal, Reglas } from "./tipos";

const cols: EspColumna[] = [
  { clave: "nombre", etiqueta: "Nombre", tipo: "texto", obligatorio: true, opciones: [] },
  { clave: "n", etiqueta: "Cantidad", tipo: "numero", obligatorio: false, opciones: [] },
  { clave: "ro", etiqueta: "Cédula", tipo: "texto", obligatorio: false, opciones: [], solo_lectura: "Warehouse" },
];
// Reglas de ejemplo: números con coma decimal y nombre obligatorio.
const reglas: Reglas = {
  leer: (c, e) => (e.trim() === "" ? null : c.tipo === "numero" ? (/^\d+([.,]\d+)?$/.test(e.trim()) ? Number(e.replace(",", ".")) : e.trim()) : e.trim()),
  error: (_cs, d, c) => {
    const v = d[c.clave];
    if (v === null || v === undefined || v === "") return c.obligatorio ? "Obligatorio" : "";
    return c.tipo === "numero" && typeof v !== "number" ? "Escriba un número" : "";
  },
};
const fila = (k: string, datos: FilaLocal["datos"], id?: string): FilaLocal => ({ k, id, datos });

describe("hoja", () => {
  it("lee lo escrito según el tipo y marca el error al instante", () => {
    const f = cambiarCelda([fila("1", {})], "1", cols[1], "3,5", reglas);
    expect(f[0].datos.n).toBe(3.5);
    const malo = cambiarCelda(f, "1", cols[1], "abc", reglas);
    expect(erroresEnCeldas(cols, malo, reglas).map((e) => e.mensaje)).toContain("Escriba un número");
  });

  it("parsea y pega un bloque de Excel saltando las columnas de solo lectura", () => {
    expect(parsearPortapapeles("solo una celda")).toBeNull();
    const matriz = parsearPortapapeles("Ana\t2\nLuis\t5\n")!;
    expect(matriz).toEqual([["Ana", "2"], ["Luis", "5"]]);
    let n = 0;
    const r = aplicarPegado({ filas: [fila("1", {})], orden: ["1"], columnas: cols, desde: { fila: 0, columna: 0 }, matriz, reglas, claveNueva: () => `n${++n}` });
    expect(r.agregadas).toBe(1);
    expect(r.filas.map((f) => f.datos)).toEqual([{ nombre: "Ana", n: 2 }, { nombre: "Luis", n: 5 }]);
  });

  it("salta al siguiente error y da la vuelta", () => {
    const filas = [fila("1", { nombre: "" }), fila("2", { nombre: "ok" }), fila("3", { nombre: "" })];
    const errores = erroresEnCeldas(cols, filas, reglas);
    expect(errores.map((e) => e.k)).toEqual(["1", "3"]);
    expect(siguienteError(errores, null)?.k).toBe("1");
    expect(siguienteError(errores, { k: "1", clave: "nombre" })?.k).toBe("3");
    expect(siguienteError(errores, { k: "3", clave: "nombre" })?.k).toBe("1");
    expect(siguienteError([], null)).toBeNull();
  });

  it("calcula qué guardar: nuevas, cambiadas y quitadas", () => {
    const guardadas = [{ id: "a", datos: { nombre: "A" } }, { id: "b", datos: { nombre: "B" } }];
    expect(cambiosPendientes([fila("a", { nombre: "A" }, "a"), fila("b", { nombre: "B" }, "b")], guardadas)).toBeNull();
    const c = cambiosPendientes([fila("a", { nombre: "A2" }, "a"), fila("n1", { nombre: "N" })], guardadas)!;
    expect(c.filas).toEqual([{ id: "a", datos: { nombre: "A2" } }, { datos: { nombre: "N" }, orden: 1 }]);
    expect(c.borrar).toEqual(["b"]);
  });

});


describe("tras guardar", () => {
  it("las filas nuevas toman su id y lo escrito mientras tanto se conserva", () => {
    const antes = [{ id: "a", datos: { nombre: "A" } }];
    const locales = [fila("a", { nombre: "A2" }, "a"), fila("n1", { nombre: "N" }), fila("n2", { nombre: "" })];
    // Se mandó la fila a y la n1; después se siguió escribiendo en la a.
    const enviadas = new Map([["a", { nombre: "A1" }], ["n1", { nombre: "N" }]]);
    const servidor = [{ id: "a", datos: { nombre: "A1" } }, { id: "z", datos: { nombre: "N" } }];
    const r = reconciliar({ locales, servidor, antes, enviadas });
    expect(r.map((f) => [f.k, f.id, f.datos.nombre])).toEqual([["a", "a", "A2"], ["n1", "z", "N"], ["n2", undefined, ""]]);
  });
  it("no resucita una fila quitada ni pierde la que agregó otra persona", () => {
    const antes = [{ id: "a", datos: { nombre: "A" } }, { id: "b", datos: { nombre: "B" } }];
    const r = reconciliar({ locales: [fila("a", { nombre: "A" }, "a")], servidor: [...antes, { id: "c", datos: { nombre: "C" } }], antes, enviadas: new Map() });
    expect(r.map((f) => f.id)).toEqual(["a", "c"]);
  });
});
