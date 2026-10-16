// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { DESTINOS } from "../lib/destinos";
import { generarCuadroMaestro, valorParaLibro } from "./emision";

const leer = (f: string): ArrayBuffer => {
  const b = readFileSync(`public/plantillas-cna/${f}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const cna07 = DESTINOS.find((d) => d.id === "cna07")!;
const cna08 = DESTINOS.find((d) => d.id === "cna08")!;

describe("emitir el Cuadro Maestro", () => {
  it("escribe las fechas como fecha y los números como número", () => {
    expect(valorParaLibro(cna08.columnas.find((c) => c.clave === "inicio")!, "2024-02-01")).toEqual(new Date(Date.UTC(2024, 1, 1)));
    expect(valorParaLibro(cna08.columnas.find((c) => c.clave === "n_profesores")!, "3")).toBe(3);
  });

  it("rellena los cuadros con archivo, pone la fila de periodos y marca los automáticos", async () => {
    const r = await generarCuadroMaestro({
      plantilla: leer("cuadro-maestro-programas.xlsx"),
      salud: false,
      periodos: ["2024-01", "2024-02", "2025-01"],
      archivos: [
        { id: "a", nombre: "07", estado: "listo", filas: [{ g: "Grupo Uno", c: "COL1" }, { g: "Grupo Dos", c: "COL2" }], respuestas: [{ destino_id: cna07.id, mapa: { grupo: "g", codigo_grupo: "c" } }] },
        { id: "b", nombre: "08", estado: "listo", filas: [{ p: "Proyecto", i: "2024-02-01" }], respuestas: [{ destino_id: cna08.id, mapa: { proyecto: "p", inicio: "i" } }] },
      ],
    });
    expect(r.llenados).toEqual(expect.arrayContaining([cna07.nombre, cna08.nombre]));
    expect(r.pendientes).toHaveLength(4);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(r.buffer);
    const h07 = libro.getWorksheet("07. Grupos y Líneas")!;
    expect(h07.getCell("C7").value).toBe("Grupo Uno");
    expect(h07.getCell("D8").value).toBe("COL2");
    expect(libro.getWorksheet("08. Proyectos y productos")!.getCell("C9").value).toBe("Proyecto");
    const h02 = libro.getWorksheet("02. Estudiantes")!;
    expect([h02.getCell("B9").value, h02.getCell("C9").value, h02.getCell("C10").value]).toEqual([2024, "I", "II"]);
    expect(String(h02.getCell("B5").value)).toMatch(/Pendiente de conexión/);
  }, 30000);
});
