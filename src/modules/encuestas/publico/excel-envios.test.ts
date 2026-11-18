import { describe, expect, it } from "vitest";
import { cifrasEnTexto, COLUMNAS_ENVIOS, filasDeEnvios, hojasDeEnvios, nombreArchivoEnvios } from "./excel-envios";
import type { EnvioHist } from "../tipos";

const envio = (id: string, creado: string, etapa: 1 | 2 | 3, items: EnvioHist["items"]): EnvioHist => ({
  id, origen: "aporte", encuesta: { slug: "logros-2026", titulo: "Logros y retos 2026" }, creado, etapa, quitable: etapa === 1, tipos: ["logro"], titulo: "t", items, lineas: [], copiable: null,
});

describe("Mis envíos en Excel", () => {
  const envios = [
    envio("b", "2026-05-02T15:00:00Z", 2, [{ tipo: "reto", titulo: "Más aulas", descripcion: "=Falta espacio", cifras: [] }]),
    envio("a", "2026-04-01T15:00:00Z", 3, [{ tipo: "logro", titulo: "Acreditación", descripcion: "Se logró", cifras: [{ que: "programas", valor: 3, unidad: "" }, { que: "avance", valor: 72, unidad: "%" }] }]),
  ];
  it("una fila por logro o reto, en orden de fecha, con su estado", () => {
    const f = filasDeEnvios(envios);
    expect(f.map((x) => x.fila[0])).toEqual([1, 2]);
    expect(f[0].fila[3]).toBe("Logro");
    expect(f[0].fila[7]).toBe("En el video");
    expect(f[1].fila[7]).toBe("Revisado");
    expect(f[1].fila[5]).toBe("=Falta espacio"); // texto tal cual, no se altera
  });
  it("las cifras van en texto y una por fila en su hoja", () => {
    expect(cifrasEnTexto([{ que: "avance", valor: 72, unidad: "%" }])).toBe("72 % avance");
    const h = hojasDeEnvios(envios, { slug: "logros-2026", alcance: "esta" });
    expect(h.map((x) => x.nombre)).toEqual(["Logros y retos", "Cifras", "_Control"]);
    expect(h[1].filas).toHaveLength(2);
    expect(h[0].columnas.map((c) => c.titulo)).toEqual([...COLUMNAS_ENVIOS]);
    expect(h[2].oculta).toBe(true);
  });
  it("sin logros ni retos no hay filas y el nombre del archivo es estable", () => {
    expect(filasDeEnvios([])).toEqual([]);
    expect(nombreArchivoEnvios("logros-2026", "esta", new Date("2026-06-01T00:00:00Z"))).toBe("logros-y-retos-logros-2026-2026-06-01.xlsx");
  });
});
