import { describe, expect, it } from "vitest";
import {
  contarComentario,
  errorComentario,
  LIMITE_COMENTARIO,
  normalizarComentario,
  recortarComentario,
  UMBRAL_CERCA,
} from "./comentario";

describe("contar el comentario", () => {
  it("el límite es 1000 y el estado cambia en 900 y en 1001", () => {
    expect(LIMITE_COMENTARIO).toBe(1000);
    expect(contarComentario("a".repeat(UMBRAL_CERCA - 1)).estado).toBe("ok");
    expect(contarComentario("a".repeat(UMBRAL_CERCA)).estado).toBe("near");
    expect(contarComentario("a".repeat(1000)).estado).toBe("near");
    expect(contarComentario("a".repeat(1000)).restantes).toBe(0);
    expect(contarComentario("a".repeat(1001)).estado).toBe("over");
    expect(contarComentario("a".repeat(1001)).restantes).toBe(-1);
  });

  it("cuenta caracteres, no unidades de código: la ñ y los emoji cuentan como uno", () => {
    expect(contarComentario("ñandú").caracteres).toBe(5);
    expect(contarComentario("😀".repeat(3)).caracteres).toBe(3);
  });

  it("normaliza saltos de Windows y espacios de los extremos antes de contar", () => {
    expect(normalizarComentario("  línea uno\r\nlínea dos\r  ")).toBe("línea uno\nlínea dos");
    expect(contarComentario("   abc\r\n  ").caracteres).toBe(3);
  });

  it("el mensaje de error dice cuánto sobra", () => {
    expect(errorComentario("a".repeat(1000))).toBeNull();
    expect(errorComentario("a".repeat(1003))).toMatch(/1003 caracteres.*Quite 3/);
  });

  it("recortar deja exactamente el límite sin partir un emoji", () => {
    const texto = "😀".repeat(1005);
    const r = recortarComentario(texto);
    expect(Array.from(r)).toHaveLength(LIMITE_COMENTARIO);
    expect(r.startsWith("😀")).toBe(true);
    expect(recortarComentario("corto")).toBe("corto");
  });
});
