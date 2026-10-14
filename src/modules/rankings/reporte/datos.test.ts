import { describe, expect, it } from "vitest";
import { TraduccionNoDisponible, traducir } from "./traducir";
import { claveNombre, errorDe, nombreSeguro } from "./datos";
import { FaltaMigracion } from "../noticias";

describe("traducir (adaptador de Pilo)", () => {
  it("sin texto devuelve vacío, sin llamar a la IA", async () => {
    await expect(traducir("   ")).resolves.toBe("");
  });

  it("más de 1000 caracteres se rechaza antes de llamar, y no es un fallo del servicio", async () => {
    const error = await traducir("a".repeat(1001)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TraduccionNoDisponible);
  });
});

describe("claveNombre", () => {
  it("compara nombres de oficina sin acentos, mayúsculas ni espacios de más", () => {
    expect(claveNombre("  Planeación   Institucional ")).toBe(claveNombre("PLANEACION INSTITUCIONAL"));
  });
});

describe("nombreSeguro", () => {
  it("quita caracteres raros y conserva la extensión", () => {
    expect(nombreSeguro("Informe ODS 4 (final) ñ.pdf")).toBe("Informe_ODS_4_final_.pdf");
  });

  it("nunca devuelve vacío", () => {
    expect(nombreSeguro("ñññ")).toBe("archivo");
  });
});

describe("errorDe", () => {
  it("sin la columna o las funciones de 0150, pide aplicar 0150", () => {
    const e = errorDe({ code: "PGRST202", message: "Could not find the function public.ranking_aportes(p_ciclo) in the schema cache" });
    expect(e).toBeInstanceOf(FaltaMigracion);
    expect(e.message).toContain("0150");
    expect(errorDe({ code: "42703", message: "column ranking_responses.oficial does not exist" }).message).toContain("0150");
  });

  it("sin las tablas, pide 0149; otro error pasa tal cual", () => {
    expect(errorDe({ code: "42P01", message: "relation ranking_cycles does not exist" }).message).toContain("0149");
    const otro = errorDe({ code: "42501", message: "Solo Planeación marca la respuesta oficial" });
    expect(otro).not.toBeInstanceOf(FaltaMigracion);
    expect(otro.message).toBe("Solo Planeación marca la respuesta oficial");
  });
});
