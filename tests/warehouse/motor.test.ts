/* El motor del Warehouse (supabase/functions/warehouse/motor.ts): normalizar
   encabezados, leer un .xlsx real (armado en memoria con exceljs, con las
   rarezas de los reportes de Master y Davinci) y la huella del contenido. */

import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { base64ABytes, enParalelo, recortarPorPolitica, enLotes, esExcelBase64, huellaContenido, leerXlsx, normalizarColumna, normalizarEncabezados, periodoValido } from "../../supabase/functions/warehouse/motor";

async function xlsx(filas: unknown[][], hojas = 1): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook();
  for (let i = 0; i < hojas; i++) {
    const hoja = libro.addWorksheet(`Hoja${i + 1}`);
    filas.forEach((f) => hoja.addRow(i === 0 ? f : [`hoja ${i + 1}`]));
  }
  return new Uint8Array((await libro.xlsx.writeBuffer()) as ArrayBuffer);
}

describe("normalizarColumna", () => {
  it("quita tildes, pasa a minúscula y deja guiones bajos", () => {
    expect(normalizarColumna("Código")).toBe("codigo");
    expect(normalizarColumna("% Reprobados")).toBe("pct_reprobados");
    expect(normalizarColumna("Créd. según ubicación")).toBe("cred_segun_ubicacion");
    expect(normalizarColumna("Promedio Semestre Ultimo polígrafo")).toBe("promedio_semestre_ultimo_poligrafo");
    expect(normalizarColumna("PAZ Y SALVO")).toBe("paz_y_salvo");
    expect(normalizarColumna("Cod.")).toBe("cod");
    expect(normalizarColumna("MATRI/CAP")).toBe("matri_cap");
  });

  it("el encabezado con la tilde mal puesta de Davinci (Cŕeditos) cae en la misma columna", () => {
    expect(normalizarColumna("Cŕeditos NO matriculados")).toBe("creditos_no_matriculados");
  });

  it("un encabezado vacío o solo símbolos no deja la columna sin nombre", () => {
    expect(normalizarColumna("")).toBe("columna");
    expect(normalizarColumna("---")).toBe("columna");
  });

  it("desempata los repetidos", () => {
    expect(normalizarEncabezados(["Nota", "nota", "NOTA", "Otra"])).toEqual(["nota", "nota_2", "nota_3", "otra"]);
  });
});

describe("leerXlsx", () => {
  it("lee encabezados y filas, con texto y números", async () => {
    const bytes = await xlsx([
      ["Codigo", "Letra", "Programa", "Matriculados", "% Reprobados", "Promedio"],
      ["103801", "A", "TERAPIA OCUPACIONAL", 12, "0.0", 4.5],
      ["372601", "A", "INGENIERÍA DE SOFTWARE", 18, "16.7", 4.7],
    ]);
    const h = leerXlsx(unzipSync(bytes));
    expect(h.columnas).toEqual(["codigo", "letra", "programa", "matriculados", "pct_reprobados", "promedio"]);
    expect(h.originales[4]).toBe("% Reprobados");
    expect(h.filas).toHaveLength(2);
    expect(h.filas[0]).toMatchObject({ codigo: "103801", programa: "TERAPIA OCUPACIONAL", matriculados: 12, promedio: 4.5 });
    expect(h.filas[1].programa).toBe("INGENIERÍA DE SOFTWARE");
  });

  it("conserva las celdas vacías en su columna y salta las filas vacías", async () => {
    const bytes = await xlsx([["A", "B", "C"], ["x", null, "z"], [null, null, null], ["", "y", ""]]);
    const h = leerXlsx(unzipSync(bytes));
    expect(h.filas).toEqual([
      { a: "x", b: null, c: "z" },
      { a: "", b: "y", c: "" },
    ]);
  });

  it("entiende el texto con &, < y comillas", async () => {
    const bytes = await xlsx([["Nombre"], ['Q&A <básico> "uno"']]);
    expect(leerXlsx(unzipSync(bytes)).filas[0].nombre).toBe('Q&A <básico> "uno"');
  });

  it("lee la primera hoja, o la que se pida", async () => {
    const bytes = await xlsx([["Semana"], ["1"]], 2);
    const partes = unzipSync(bytes);
    expect(leerXlsx(partes).columnas).toEqual(["semana"]);
    expect(leerXlsx(partes, { hoja: 1 }).columnas).toEqual(["hoja_2"]);
  });

  it("si el encabezado no está en la primera fila, toma la primera con contenido", async () => {
    const bytes = await xlsx([[null, null], ["Codigo", "Nota"], ["1", 3.5]]);
    const h = leerXlsx(unzipSync(bytes));
    expect(h.columnas).toEqual(["codigo", "nota"]);
    expect(h.filas).toEqual([{ codigo: "1", nota: 3.5 }]);
  });

  it("un archivo que no es Excel falla con un mensaje claro", () => {
    expect(() => leerXlsx({ "otra/cosa.txt": new Uint8Array([1]) })).toThrow(/no es un Excel válido/);
  });
});

describe("huella, lotes y utilidades", () => {
  it("la huella es del contenido: mismo contenido, mismo SHA-256, aunque el archivo cambie", async () => {
    const a = leerXlsx(unzipSync(await xlsx([["Codigo"], ["1"]])));
    await new Promise((r) => setTimeout(r, 1100)); // el .xlsx lleva la hora de creación
    const b = leerXlsx(unzipSync(await xlsx([["Codigo"], ["1"]])));
    const c = leerXlsx(unzipSync(await xlsx([["Codigo"], ["2"]])));
    expect(await huellaContenido(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(await huellaContenido(a)).toBe(await huellaContenido(b));
    expect(await huellaContenido(a)).not.toBe(await huellaContenido(c));
  });

  it("parte en lotes", () => {
    expect(enLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(enLotes([], 2)).toEqual([]);
  });

  it("valida el periodo", () => {
    expect(periodoValido("2026b")).toBe(true);
    expect(periodoValido("2026-1")).toBe(false);
    expect(periodoValido("26b")).toBe(false);
  });

  it("reconoce el Excel en base64 de Master (zip: «UEsDB…»)", async () => {
    const bytes = await xlsx([["A"], ["1"]]);
    const b64 = Buffer.from(bytes).toString("base64");
    expect(esExcelBase64(b64)).toBe(true);
    expect(esExcelBase64("No hay datos")).toBe(false);
    expect(esExcelBase64(null)).toBe(false);
    expect(leerXlsx(unzipSync(base64ABytes(b64))).filas).toEqual([{ a: "1" }]);
  });
});

describe("carga en paralelo y recorte por política", () => {
  it("enParalelo corre todos los lotes y nunca más de cuatro a la vez", async () => {
    let vivos = 0;
    let maximo = 0;
    const hechos: number[] = [];
    const n = await enParalelo(Array.from({ length: 10 }, (_, i) => i), async (x) => {
      vivos++;
      maximo = Math.max(maximo, vivos);
      await new Promise((r) => setTimeout(r, 5));
      hechos.push(x);
      vivos--;
    });
    expect(n).toBe(10);
    expect(maximo).toBeLessThanOrEqual(4);
    expect(hechos.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("enParalelo se detiene en el primer error y no lanza lotes nuevos", async () => {
    const lanzados: number[] = [];
    await expect(
      enParalelo(Array.from({ length: 20 }, (_, i) => i), async (x) => {
        lanzados.push(x);
        await new Promise((r) => setTimeout(r, 2));
        if (x === 1) throw new Error("falló el lote 1");
      }),
    ).rejects.toThrow(/lote 1/);
    expect(lanzados.length).toBeLessThan(20);
  });

  it("cada lote conserva su posición: n = indice × lote + 1, sin huecos ni repetidos", () => {
    const filas = Array.from({ length: 4500 }, (_, i) => i);
    const lotes = enLotes(filas, 2000);
    const rangos = lotes.map((l, i) => [i * 2000 + 1, i * 2000 + l.length]);
    expect(rangos).toEqual([[1, 2000], [2001, 4000], [4001, 4500]]);
  });

  it("recortarPorPolitica: permitir deja solo la lista y excluir quita la lista", () => {
    const f = [{ codigo: "1", nombres: "ANA", direccion: "Calle 1", programa: "DERECHO" }];
    expect(recortarPorPolitica(f, { modo: "permitir", lista: ["codigo", "programa"] })).toEqual([{ codigo: "1", programa: "DERECHO" }]);
    expect(recortarPorPolitica(f, { modo: "excluir", lista: ["nombres", "direccion"] })).toEqual([{ codigo: "1", programa: "DERECHO" }]);
  });
});
