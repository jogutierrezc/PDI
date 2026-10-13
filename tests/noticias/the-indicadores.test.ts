import { describe, expect, it } from "vitest";
import {
  INDICADORES_EVIDENCIA,
  INDICADORES_THE,
  METODOLOGIA_THE,
  ODS_CON_EVIDENCIA,
  indicadorPorId,
  indicadoresDe,
} from "../../src/modules/rankings/informes/the-indicadores";
// Script de Node en JavaScript: la prueba ejecuta la misma lógica que `--check`.
import { copiaActual, generarCopia, DESTINO } from "../../scripts/sync-the-indicadores.mjs";

const ODS = Array.from({ length: 17 }, (_, i) => i + 1);

describe("mapa de indicadores de THE", () => {
  it("sale de la metodología 2027 v1.1", () => {
    expect(METODOLOGIA_THE).toMatchObject({ edicion: 2027, version: "1.1" });
  });

  it("tiene ids únicos y bien formados, y cada id empieza por su ODS", () => {
    const ids = INDICADORES_THE.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of INDICADORES_THE) {
      expect(x.id).toMatch(/^\d{1,2}\.\d+(\.\d+)?$/);
      expect(x.id.split(".")[0]).toBe(String(x.ods));
      expect(x.titulo.trim()).not.toBe("");
      expect(x.pregunta.trim()).not.toBe("");
      expect(x.regla.trim()).not.toBe("");
    }
  });

  it("está ordenado por ODS y número", () => {
    const clave = (id: string) => id.split(".").map((n) => n.padStart(3, "0")).join(".");
    const ids = INDICADORES_THE.map((x) => clave(x.id));
    expect(ids).toEqual([...ids].sort());
  });

  it("tiene indicadores en los 17 ODS, con su investigación", () => {
    for (const ods of ODS) {
      const lista = indicadoresDe(ods);
      expect(lista.length, `ODS ${ods}`).toBeGreaterThan(0);
      expect(lista.some((x) => x.tipo === "inv"), `ODS ${ods} sin investigación`).toBe(true);
    }
  });

  it("los de evidencia y documento valen al menos 3 puntos; los datos e investigación, 0", () => {
    for (const x of INDICADORES_THE) {
      if (x.tipo === "ev" || x.tipo === "doc") expect(x.maximo, x.id).toBeGreaterThanOrEqual(3);
      else expect(x.maximo, x.id).toBe(0);
    }
    expect(INDICADORES_EVIDENCIA.every((x) => x.tipo === "ev" || x.tipo === "doc")).toBe(true);
  });

  it("los pesos de cada ODS no pasan de 100 %", () => {
    for (const ods of ODS) {
      const suma = indicadoresDe(ods).reduce((s, x) => s + (x.peso ?? 0), 0);
      expect(suma, `ODS ${ods}`).toBeLessThanOrEqual(100.1);
      expect(suma, `ODS ${ods}`).toBeGreaterThan(90);
    }
  });

  it("las preguntas para una persona tienen opciones numéricas y un valor por defecto válido", () => {
    for (const x of INDICADORES_THE) {
      const p = x.pregunta_persona;
      if (!p) continue;
      expect(p.opciones.length, x.id).toBeGreaterThanOrEqual(2);
      for (const o of p.opciones) expect(o.valor, x.id).toMatch(/^\d+(\.\d+)?$/);
      expect(p.opciones.map((o) => o.valor), x.id).toContain(p.por_defecto);
    }
  });

  it("4.3.2 pregunta si los actos son gratuitos", () => {
    const x = indicadorPorId("4.3.2");
    expect(x?.tipo).toBe("ev");
    expect(x?.pregunta_persona?.texto).toMatch(/gratuit/i);
    expect(x?.pregunta_persona?.opciones.map((o) => o.valor)).toEqual(["1", "0.5", "0.25"]);
    expect(x?.pregunta_persona?.por_defecto).toBe("1");
  });

  it("busca por id y sabe qué ODS tienen evidencia", () => {
    expect(indicadorPorId("13.3.1")?.ods).toBe(13);
    expect(indicadorPorId("99.9")).toBeUndefined();
    expect(ODS_CON_EVIDENCIA).not.toContain(9);
    expect(ODS_CON_EVIDENCIA).toContain(17);
    expect(ODS_CON_EVIDENCIA.length).toBe(16);
  });
});

describe("copia para la función de Deno", () => {
  it(`${DESTINO} es idéntica a lo que genera el script (node scripts/sync-the-indicadores.mjs)`, () => {
    expect(copiaActual()).toBe(generarCopia());
  });

  it("la copia no importa nada de src/", () => {
    const copia: string = generarCopia();
    expect(copia).not.toMatch(/from\s+["'](\.\.?\/|src\/)/);
    expect(copia).toContain("export interface IndicadorTHE");
    expect(copia.startsWith("// ARCHIVO GENERADO")).toBe(true);
  });
});
