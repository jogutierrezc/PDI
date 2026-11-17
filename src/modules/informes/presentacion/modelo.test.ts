import { describe, expect, it } from "vitest";
import { MAX_INFORME_BYTES } from "../../../../supabase/functions/pilo-presentaciones/pedido";
import { anchosColumnas, claseEstado, cuerpoCifra, filaTotal, informeParaPresentacion, lineasDe, medidasTabla, otroTono, partesBarra, ponerEn, reemplazarDiapositiva } from "./modelo";
import { informeEjemplo, presentacionEjemplo } from "./ejemplo";
import type { Diapositiva } from "./modelo";

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

describe("informeParaPresentacion (el armado de la entrada)", () => {
  it("un informe normal pasa intacto y como copia", () => {
    const r = informeParaPresentacion(informeEjemplo);
    expect(r.aligerado).toBe(false);
    expect(r.informe).toEqual(informeEjemplo);
    expect(r.informe).not.toBe(informeEjemplo);
  });

  it("si pasa de 200 KB, quita primero lo que no se dibuja (matriz, drive) y conserva las cifras", () => {
    const relleno = Array.from({ length: 2500 }, (_, i) => ({ clave: `c${i}`, etiqueta: `Indicador ${i} con un nombre largo para ocupar espacio`, valor: String(i) }));
    const grande = { ...informeEjemplo, secciones: [{ ...informeEjemplo.secciones[0], matriz: relleno, drive: relleno }, ...informeEjemplo.secciones.slice(1)] };
    expect(bytes(grande)).toBeGreaterThan(MAX_INFORME_BYTES);
    const r = informeParaPresentacion(grande);
    expect(r.aligerado).toBe(true);
    expect(bytes(r.informe)).toBeLessThanOrEqual(MAX_INFORME_BYTES);
    expect(JSON.stringify(r.informe)).toContain("84,2 %");
    expect(JSON.stringify(r.informe)).not.toContain("Indicador 7 ");
  });

  it("último recurso: recorta textos larguísimos", () => {
    const r = informeParaPresentacion({ secciones: [{ texto: "x".repeat(300_000) }] });
    expect(bytes(r.informe)).toBeLessThanOrEqual(MAX_INFORME_BYTES);
  });
});

describe("edición en línea", () => {
  it("ponerEn cambia solo el texto indicado y no muta", () => {
    const t = presentacionEjemplo.diapositivas.find((d) => d.tipo === "tabla")!;
    const antes = JSON.stringify(t);
    const n = ponerEn(t, ["filas", 1, 2], "Otra área") as Extract<Diapositiva, { tipo: "tabla" }>;
    expect(n.filas[1][2]).toBe("Otra área");
    expect(n.filas[1][1]).toBe((t as typeof n).filas[1][1]);
    expect(n.filas[0]).toBe((t as typeof n).filas[0]);
    expect(JSON.stringify(t)).toBe(antes);
  });
  it("campos simples y listas de texto", () => {
    const e = presentacionEjemplo.diapositivas.find((d) => d.tipo === "evidencias")!;
    expect((ponerEn(e, ["fuentes", 0], "Nueva fuente") as Extract<Diapositiva, { tipo: "evidencias" }>).fuentes[0]).toBe("Nueva fuente");
    expect(ponerEn(presentacionEjemplo.diapositivas[0], ["titulo"], "Hola").tipo).toBe("portada");
  });
  it("reemplazarDiapositiva deja las demás", () => {
    const p = reemplazarDiapositiva(presentacionEjemplo, 1, presentacionEjemplo.diapositivas[0]);
    expect(p.diapositivas).toHaveLength(presentacionEjemplo.diapositivas.length);
    expect(p.diapositivas[2]).toBe(presentacionEjemplo.diapositivas[2]);
  });
});

describe("gráfica de cumplimiento", () => {
  it("partes en porcentaje; sin datos, todo cero", () => {
    expect(partesBarra({ completadas: 2, en_proceso: 2, pendientes: 1 })).toMatchObject({ total: 5, ok: 40, pr: 40, pe: 20 });
    expect(partesBarra({ completadas: 0, en_proceso: 0, pendientes: 0 })).toMatchObject({ total: 0, ok: 0 });
  });
  it("la fila Total suma las dimensiones y no se duplica", () => {
    const filas = [{ dimension: "A", completadas: 2, en_proceso: 2, pendientes: 1 }, { dimension: "B", completadas: 1, en_proceso: 0, pendientes: 3 }];
    expect(filaTotal(filas)).toEqual({ dimension: "Total", completadas: 3, en_proceso: 2, pendientes: 4 });
    expect(filaTotal([filas[0]])).toBeNull();
    expect(filaTotal([...filas, { dimension: "total", completadas: 0, en_proceso: 0, pendientes: 0 }])).toBeNull();
  });
});

describe("estados con su palabra", () => {
  it("reconoce las palabras del plan", () => {
    expect(claseEstado("Completado")).toBe("ok");
    expect(claseEstado("En proceso")).toBe("proc");
    expect(claseEstado("Sin iniciar")).toBe("pend");
    expect(claseEstado("Decanatura")).toBe("");
  });
});

describe("medidas para que el texto quepa", () => {
  const cols = ["Acción", "Meta", "Responsable", "Fecha límite"];
  const fila = ["Ejecutar proyectos de proyección social con comunidades vulnerables del área", "8 proyectos aprobados y ejecutados durante el año", "Decanatura", "15 dic 2026"];
  it("pocas filas: letra grande; ocho filas largas: letra menor", () => {
    const pocas = medidasTabla(cols, Array(4).fill(fila.map(() => "Corto")));
    const muchas = medidasTabla(cols, Array(8).fill(fila));
    expect(pocas.cuerpo).toBe(32);
    expect(muchas.cuerpo).toBeLessThan(pocas.cuerpo);
    expect(muchas.cuerpo).toBeGreaterThanOrEqual(20);
  });
  it("las columnas suman ~100 % y la de más texto es más ancha", () => {
    const a = anchosColumnas(cols, Array(3).fill(fila));
    expect(a.reduce((x, y) => x + y, 0)).toBeGreaterThanOrEqual(98);
    expect(a[0]).toBeGreaterThan(a[3]);
  });
  it("las cifras grandes se achican para caber en su tarjeta", () => {
    expect(cuerpoCifra("68 %", 460)).toBe(104);
    expect(cuerpoCifra("[por completar]", 300) * 0.66 * 15).toBeLessThanOrEqual(300);
  });
  it("líneas estimadas crecen con el texto", () => {
    expect(lineasDe(10, 30, 500)).toBe(1);
    expect(lineasDe(200, 30, 500)).toBeGreaterThan(3);
  });
  it("otroTono rota entre los cuatro", () => {
    expect(otroTono("institucional")).toBe("cercano");
    expect(otroTono("academico")).toBe("institucional");
  });
});
