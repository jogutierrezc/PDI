/* Traducir un comentario suelto (acción «traducir-texto» de pilo-rankingsod): validación del texto y lectura de la respuesta. Puro, sin red. */

import { describe, expect, it } from "vitest";
import { leerTextoParaTraducir, leerTraduccionTexto, LIMITE_TEXTO_TRADUCIR, mensajesTraducir, puedeLlamar } from "../../supabase/functions/pilo-rankingsod/ficha";

describe("leerTextoParaTraducir", () => {
  it("rechaza lo que no es texto o está vacío", () => {
    expect(leerTextoParaTraducir(undefined).ok).toBe(false);
    expect(leerTextoParaTraducir(42).ok).toBe(false);
    expect(leerTextoParaTraducir("   \n ").ok).toBe(false);
  });

  it("quita espacios de los extremos y normaliza saltos de línea", () => {
    expect(leerTextoParaTraducir("  Hola\r\nmundo  ")).toEqual({ ok: true, valor: "Hola\nmundo" });
  });

  it("acepta exactamente 1000 caracteres y rechaza 1001", () => {
    expect(leerTextoParaTraducir("a".repeat(LIMITE_TEXTO_TRADUCIR)).ok).toBe(true);
    const r = leerTextoParaTraducir("a".repeat(LIMITE_TEXTO_TRADUCIR + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("1001");
  });

  it("cuenta puntos de código, como la pantalla: una ñ o un emoji cuentan como uno", () => {
    expect(leerTextoParaTraducir("ñ".repeat(LIMITE_TEXTO_TRADUCIR)).ok).toBe(true);
    expect(leerTextoParaTraducir("😀".repeat(LIMITE_TEXTO_TRADUCIR)).ok).toBe(true);
    expect(leerTextoParaTraducir("😀".repeat(LIMITE_TEXTO_TRADUCIR + 1)).ok).toBe(false);
  });
});

describe("leerTraduccionTexto", () => {
  const es = "La Universidad atendió a 400 estudiantes en 2025.";

  it("devuelve la traducción si trae las mismas cifras", () => {
    const crudo = JSON.stringify({ traducciones: [{ ref: "T1", en: "The University served 400 students in 2025." }] });
    expect(leerTraduccionTexto(crudo, es)).toEqual({ ok: true, valor: "The University served 400 students in 2025." });
  });

  it("rechaza una traducción que cambia una cifra", () => {
    const crudo = JSON.stringify({ traducciones: [{ ref: "T1", en: "The University served 300 students in 2025." }] });
    const r = leerTraduccionTexto(crudo, es);
    expect(r.ok).toBe(false);
  });

  it("rechaza una respuesta sin JSON o sin la lista", () => {
    expect(leerTraduccionTexto("no es json", es).ok).toBe(false);
    expect(leerTraduccionTexto(JSON.stringify({ otra: [] }), es).ok).toBe(false);
  });

  it("rechaza una traducción vacía", () => {
    const crudo = JSON.stringify({ traducciones: [{ ref: "T1", en: "  " }] });
    expect(leerTraduccionTexto(crudo, es).ok).toBe(false);
  });
});

describe("mensajesTraducir (comentario)", () => {
  it("pide traducir un comentario y pasa el texto como dato", () => {
    const m = mensajesTraducir([{ ref: "T1", es: "Hola" }], "comentario");
    const usuario = m[1].content as string;
    expect(usuario).toContain("Translate this comment");
    expect(usuario).toContain("[T1] Hola");
  });
});

describe("puedeLlamar (quién usa la función)", () => {
  const activo = (role: string) => ({ role, is_active: true });

  it("Planeación y la administración pueden todo", () => {
    expect(puedeLlamar({ texto: false, perfil: activo("planeacion"), rolesUnidad: [] })).toBe(true);
    expect(puedeLlamar({ texto: true, perfil: activo("admin"), rolesUnidad: [] })).toBe(true);
  });

  it("Gestor (jefe) o Contribuyente (editor) de alguna oficina traduce un comentario", () => {
    expect(puedeLlamar({ texto: true, perfil: activo("usuario"), rolesUnidad: ["visor", "editor"] })).toBe(true);
    expect(puedeLlamar({ texto: true, perfil: activo("usuario"), rolesUnidad: ["jefe"] })).toBe(true);
  });

  it("pero no usa los pasos de los informes", () => {
    expect(puedeLlamar({ texto: false, perfil: activo("usuario"), rolesUnidad: ["jefe"] })).toBe(false);
  });

  it("Consulta (visor), sin oficina o con perfil inactivo: no", () => {
    expect(puedeLlamar({ texto: true, perfil: activo("usuario"), rolesUnidad: ["visor"] })).toBe(false);
    expect(puedeLlamar({ texto: true, perfil: activo("usuario"), rolesUnidad: [] })).toBe(false);
    expect(puedeLlamar({ texto: true, perfil: { role: "planeacion", is_active: false }, rolesUnidad: ["jefe"] })).toBe(false);
    expect(puedeLlamar({ texto: true, perfil: null, rolesUnidad: ["jefe"] })).toBe(false);
  });
});
