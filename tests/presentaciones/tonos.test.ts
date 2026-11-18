import { describe, expect, it } from "vitest";
import { INFO_TONOS, TONOS, esTono, textoDeTono } from "../../supabase/functions/pilo-presentaciones/tonos";
import { mensajeSistema, mensajesPresentacion, mensajesReintento, compactarInforme, diapositivasObjetivo } from "../../supabase/functions/pilo-presentaciones/prompt";
import { informeEjemplo } from "../../src/modules/informes/presentacion/ejemplo";

describe("tonos", () => {
  it("son cuatro, cada uno con 3 o 4 reglas, ejemplos y una línea de ayuda", () => {
    expect(TONOS).toEqual(["institucional", "cercano", "ejecutivo", "academico"]);
    for (const t of TONOS) {
      const i = INFO_TONOS[t];
      expect(i.reglas.length).toBeGreaterThanOrEqual(3);
      expect(i.reglas.length).toBeLessThanOrEqual(4);
      expect(i.ejemplos.length).toBeGreaterThanOrEqual(2);
      expect(i.ayuda.length).toBeGreaterThan(10);
      expect(i.ayuda.length).toBeLessThan(80);
    }
  });
  it("esTono solo acepta los cuatro", () => {
    expect(esTono("cercano")).toBe(true);
    expect(esTono("gracioso")).toBe(false);
    expect(esTono(undefined)).toBe(false);
  });
  it("cada voz cambia el prompt pero el contrato de no inventar y las reglas de plantilla son iguales", () => {
    const [a, b] = [mensajeSistema("institucional"), mensajeSistema("ejecutivo")];
    expect(a).not.toBe(b);
    for (const s of [a, b]) {
      expect(s).toContain("NO INVENTAR");
      expect(s).toContain("[por completar]");
      expect(s).toContain("máximo 28 caracteres");
      expect(s).toContain("10 caracteres o menos");
    }
    expect(textoDeTono("cercano")).toContain("Avanzamos");
  });
});

describe("prompt", () => {
  it("lista los 12 tipos y el catálogo cerrado de ánimos", () => {
    const s = mensajeSistema("institucional");
    for (const t of ["portada", "agenda", "seccion", "tabla", "tarjetas", "cifras", "cumplimiento", "grafica", "logros", "evidencias", "texto", "cierre"]) expect(s).toContain(`${t}:`);
    expect(s).toContain("feliz, piensa, idea, excelente");
  });
  it("el mensaje del usuario lleva el informe, el enfoque (≤300) y la duración", () => {
    const m = mensajesPresentacion("cercano", { informe: informeEjemplo, duracion_min: 15, enfoque: "x".repeat(400) });
    expect(m[0].role).toBe("system");
    expect(m[1].content).toContain("Facultad de Ingenierías");
    expect(m[1].content).toContain("15 minutos");
    expect(m[1].content.match(/x{20,}/)![0].length).toBe(300);
  });
  it("compacta: quita lo vacío y respeta el presupuesto", () => {
    const grande = { filas: Array.from({ length: 500 }, (_, i) => ({ a: `texto ${i} `.repeat(30), vacio: "", n: null })) };
    const c = compactarInforme(grande, 20_000);
    expect(c.texto.length).toBeLessThanOrEqual(20_000);
    expect(c.recortado).toBe(true);
    expect(c.texto).not.toContain('"vacio"');
  });
  it("duración → diapositivas", () => {
    expect(diapositivasObjetivo()).toEqual({ min: 16, max: 24 });
    expect(diapositivasObjetivo(15)).toEqual({ min: 11, max: 17 });
    expect(diapositivasObjetivo(1).min).toBeGreaterThanOrEqual(4);
    // sin duración, un informe más largo pide más láminas (de 14 a 32 según su tamaño)
    expect(diapositivasObjetivo(undefined, 20_000).max).toBeLessThan(diapositivasObjetivo(undefined, 60_000).max);
    expect(diapositivasObjetivo(undefined, 1_000_000).max).toBeLessThanOrEqual(40);
  });
  it("el reintento añade la respuesta rota y los errores", () => {
    const m = mensajesReintento(mensajesPresentacion("cercano", { informe: {} }), "{roto", ["a falla", "b falla"]);
    expect(m.slice(-2).map((x) => x.role)).toEqual(["assistant", "user"]);
    expect(m[m.length - 1].content).toContain("- a falla");
  });
});
