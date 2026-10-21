import { describe, expect, it } from "vitest";
import { caben, cuerpoEnvio, formatearValor, leerNumero, LIMITES, validarCifra, validarCifras, validarDependencia, validarDescripcion, validarTitulo } from "./validacion";
import type { CifraBorrador } from "./validacion";

const cifra = (p: Partial<CifraBorrador> = {}): CifraBorrador => ({ id: 1, que: "Graduados en 2025", tipo: "estudiantes", otro: "", valor: "412", ...p });

describe("leerNumero", () => {
  it.each([
    ["412", 412],
    ["1.250", 1250],
    ["1.250.000", 1250000],
    ["1.250,75", 1250.75],
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["12.25", 12.25],
    ["0,5", 0.5],
    [".5", 0.5],
    ["$ 2.300.000.000", 2300000000],
    ["22,5 %", 22.5],
    ["  71%  ", 71],
    ["0", 0],
  ])("«%s» se lee como %s", (texto, esperado) => {
    expect(leerNumero(texto)).toBe(esperado);
  });

  it.each(["", "   ", "abc", "12a", "-5", "1,2,3", "$", "%", ".", ","])("«%s» no es un número", (texto) => {
    expect(leerNumero(texto)).toBeNull();
  });
});

describe("formatearValor", () => {
  it("pone la unidad según el tipo", () => {
    expect(formatearValor(1250, "estudiantes")).toBe("1.250");
    expect(formatearValor(22.5, "porcentaje")).toBe("22,5 %");
    expect(formatearValor(120000000, "dinero")).toBe("$ 120.000.000");
    expect(formatearValor(7, "otro")).toBe("7");
  });
});

describe("campos de texto", () => {
  it("dependencia: de 3 a 90 caracteres", () => {
    expect(validarDependencia("ab")).not.toBeNull();
    expect(validarDependencia("  ab  ")).not.toBeNull();
    expect(validarDependencia("Bienestar")).toBeNull();
    expect(validarDependencia("x".repeat(90))).toBeNull();
    expect(validarDependencia("x".repeat(91))).not.toBeNull();
  });
  it("título: de 5 a 120", () => {
    expect(validarTitulo("corto", "logro")).toBeNull();
    expect(validarTitulo("cort", "reto")).toMatch(/el reto/);
    expect(validarTitulo("x".repeat(121), "logro")).toMatch(/el logro/);
  });
  it("descripción: de 20 a 500", () => {
    expect(validarDescripcion("x".repeat(19))).toMatch(/al menos 20/);
    expect(validarDescripcion("x".repeat(20))).toBeNull();
    expect(validarDescripcion("x".repeat(500))).toBeNull();
    expect(validarDescripcion("x".repeat(501))).toMatch(/500/);
  });
});

describe("validarCifra", () => {
  it("acepta una cifra completa y la deja lista", () => {
    expect(validarCifra(cifra())).toEqual({ cifra: { que: "Graduados en 2025", tipo: "estudiantes", valor: 412 } });
    expect(validarCifra(cifra({ tipo: "otro", otro: " convenios ", valor: "1.250,5" }))).toEqual({ cifra: { que: "Graduados en 2025", tipo: "otro", otro: "convenios", valor: 1250.5 } });
  });
  it("«qué» de 2 a 80", () => {
    expect(validarCifra(cifra({ que: "a" }))).toMatchObject({ error: { campo: "que" } });
    expect(validarCifra(cifra({ que: "x".repeat(81) }))).toMatchObject({ error: { campo: "que" } });
  });
  it("pide el tipo", () => {
    expect(validarCifra(cifra({ tipo: "" }))).toMatchObject({ error: { campo: "tipo" } });
  });
  it("«otro» es una sola palabra de 2 a 20", () => {
    expect(validarCifra(cifra({ tipo: "otro", otro: "" }))).toMatchObject({ error: { campo: "otro" } });
    expect(validarCifra(cifra({ tipo: "otro", otro: "dos palabras" }))).toMatchObject({ error: { campo: "otro" } });
    expect(validarCifra(cifra({ tipo: "otro", otro: "x".repeat(21) }))).toMatchObject({ error: { campo: "otro" } });
    expect(validarCifra(cifra({ tipo: "otro", otro: "xx" }))).toHaveProperty("cifra");
  });
  it("el valor es un número no negativo; el porcentaje, hasta 100", () => {
    expect(validarCifra(cifra({ valor: "" }))).toMatchObject({ error: { campo: "valor" } });
    expect(validarCifra(cifra({ valor: "-3" }))).toMatchObject({ error: { campo: "valor" } });
    expect(validarCifra(cifra({ tipo: "porcentaje", valor: "100" }))).toHaveProperty("cifra");
    expect(validarCifra(cifra({ tipo: "porcentaje", valor: "100,5" }))).toMatchObject({ error: { campo: "valor", mensaje: expect.stringMatching(/100/) } });
    expect(validarCifra(cifra({ tipo: "dinero", valor: "250.000.000" }))).toMatchObject({ cifra: { valor: 250000000 } });
  });
  it("«otro» no viaja si el tipo no es «otro»", () => {
    const r = validarCifra(cifra({ otro: "sobrante" }));
    expect(r).toEqual({ cifra: { que: "Graduados en 2025", tipo: "estudiantes", valor: 412 } });
  });
});

describe("validarCifras", () => {
  it("pide al menos una y hasta 12", () => {
    expect(validarCifras([]).general).toMatch(/al menos una/);
    const trece = Array.from({ length: LIMITES.cifras + 1 }, (_, i) => cifra({ id: i }));
    expect(validarCifras(trece).general).toMatch(/12/);
    expect(validarCifras(trece.slice(0, 12)).general).toBeNull();
  });
  it("junta el error de cada cifra mala y deja pasar las buenas", () => {
    const r = validarCifras([cifra({ id: 1 }), cifra({ id: 2, valor: "x" }), cifra({ id: 3, tipo: "" })]);
    expect(r.listas).toHaveLength(1);
    expect([...r.errores.keys()]).toEqual([2, 3]);
  });
});

describe("envío", () => {
  it("arma el cuerpo sin correo y con el campo trampa vacío", () => {
    const cuerpo = cuerpoEnvio("rendicion-2026", "  Facultad   de Salud ", [{ tipo: "logro", titulo: " Un logro ", descripcion: " Algo que pasó en la facultad ", cifras: [{ que: "Casos", tipo: "otro", otro: "casos", valor: 3 }] }]);
    expect(cuerpo).toEqual({
      slug: "rendicion-2026",
      dependencia: "Facultad de Salud",
      aportes: [{ tipo: "logro", titulo: "Un logro", descripcion: "Algo que pasó en la facultad", cifras: [{ que: "Casos", tipo: "otro", otro: "casos", valor: 3 }] }],
      web: "",
    });
    expect(cuerpo).not.toHaveProperty("correo");
  });
  it("caben hasta 30 aportes", () => {
    expect(caben(29)).toBe(true);
    expect(caben(30)).toBe(false);
  });
});
