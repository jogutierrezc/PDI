import { describe, expect, it } from "vitest";
import { MAX_CARACTERES, extension, filaCsv, leerDocumento, limpiarTexto, recortar, textoDeCelda, validarArchivo } from "./documentos-astra";

describe("Astra · documentos adjuntos", () => {
  it("reconoce la extensión sin importar mayúsculas", () => {
    expect(extension("Informe Final.PDF")).toBe(".pdf");
    expect(extension("sin_extension")).toBe("");
  });

  it("acepta los formatos que lee y rechaza el resto con un mensaje claro", () => {
    expect(validarArchivo("a.pdf", 1000, 25)).toBe("");
    expect(validarArchivo("a.docx", 1000, 25)).toBe("");
    expect(validarArchivo("a.xlsx", 1000, 25)).toBe("");
    expect(validarArchivo("a.xls", 1000, 25)).toMatch(/antiguos/);
    expect(validarArchivo("a.exe", 1000, 25)).toMatch(/no es de esos formatos/);
  });

  it("rechaza lo vacío y lo que pasa del máximo de la administración", () => {
    expect(validarArchivo("a.pdf", 0, 25)).toMatch(/vacío/);
    expect(validarArchivo("a.pdf", 26 * 1024 * 1024, 25)).toMatch(/25 MB/);
    expect(validarArchivo("a.pdf", 25 * 1024 * 1024, 25)).toBe("");
  });

  it("limpia espacios y saltos de línea de sobra", () => {
    expect(limpiarTexto("  hola   mundo \r\n\r\n\r\n\r\nfin  ")).toBe("hola mundo\n\nfin");
  });

  it("recorta al tope y avisa que solo se leyó el comienzo", () => {
    expect(recortar("abc", 10)).toEqual({ texto: "abc", truncado: false });
    expect(recortar("abcdefghij", 4)).toEqual({ texto: "abcd", truncado: true });
    expect(recortar("x".repeat(MAX_CARACTERES + 5)).texto).toHaveLength(MAX_CARACTERES);
  });

  it("lee el valor visible de las celdas de Excel", () => {
    expect(textoDeCelda(null)).toBe("");
    expect(textoDeCelda(12.5)).toBe("12.5");
    expect(textoDeCelda({ formula: "A1+1", result: 7 })).toBe("7");
    expect(textoDeCelda({ richText: [{ text: "Ho" }, { text: "la" }] })).toBe("Hola");
    expect(textoDeCelda(new Date("2026-03-05T10:00:00Z"))).toBe("2026-03-05");
    expect(textoDeCelda("línea\nsiguiente")).toBe("línea siguiente");
  });

  it("escribe una fila CSV con comillas cuando hace falta", () => {
    expect(filaCsv(["a", "b,c", 'd"e'])).toBe('a,"b,c","d""e"');
  });

  it("lee un archivo de texto y lo deja limpio", async () => {
    const d = await leerDocumento(new File(["Compromiso uno.\n\n\n\nCompromiso dos, con responsable y fecha."], "acta.txt", { type: "text/plain" }), 25);
    expect(d.nombre).toBe("acta.txt");
    expect(d.texto).toBe("Compromiso uno.\n\nCompromiso dos, con responsable y fecha.");
    expect(d.truncado).toBe(false);
  });

  it("un archivo casi sin texto da un error claro, no un documento vacío", async () => {
    await expect(leerDocumento(new File(["   "], "vacio.txt"), 25)).rejects.toThrow(/no tiene texto/);
  });
});
