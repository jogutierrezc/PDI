import { describe, expect, it } from "vitest";
import { MAX_FILAS_TABLA, fondoDe, leerJson, repartirTablas, validarPresentacion } from "../../supabase/functions/pilo-presentaciones/esquema";
import type { DTabla, Diapositiva } from "../../supabase/functions/pilo-presentaciones/esquema";
import { presentacionEjemplo } from "../../src/modules/informes/presentacion/ejemplo";

const base = () => JSON.parse(JSON.stringify(presentacionEjemplo));

describe("validarPresentacion", () => {
  it("acepta la presentación de ejemplo (los 12 tipos)", () => {
    const v = validarPresentacion(base(), "institucional");
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(new Set(v.presentacion.diapositivas.map((d) => d.tipo)).size).toBe(12);
      expect(v.ajustes).toEqual([]);
    }
  });

  it("el tono lo fija la persona, no lo que escriba el modelo", () => {
    const p = base();
    p.tono = "ejecutivo";
    const v = validarPresentacion(p, "cercano");
    expect(v.ok && v.presentacion.tono).toBe("cercano");
  });

  it("rechaza lo roto con mensajes que sirven de reintento", () => {
    const p = base();
    p.diapositivas[3].tipo = "grafico";
    p.diapositivas[6].filas[0].completadas = -1;
    const v = validarPresentacion(p, "institucional");
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errores.join("\n")).toMatch(/«grafico» no existe/);
      expect(v.errores.join("\n")).toMatch(/entero no negativo/);
    }
  });

  it("exige portada primero y cierre al final", () => {
    const p = base();
    p.diapositivas.reverse();
    const v = validarPresentacion(p, "institucional");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errores.join(" ")).toMatch(/portada/);
  });

  it("repara: recorta un texto pasado de su límite y lo anota (no pide de nuevo)", () => {
    const p = base();
        p.diapositivas[3].intro = "x".repeat(10) + " palabra".repeat(40); // ~330 caracteres (> 240, < 480)
    const v = validarPresentacion(p, "institucional");
    expect(v.ok).toBe(true);
    if (v.ok) {
      const t = v.presentacion.diapositivas[3] as { intro?: string };
      expect(t.intro!.length).toBeLessThanOrEqual(240);
      expect(t.intro!.endsWith("…")).toBe(true);
      expect(v.ajustes.join(" ")).toMatch(/recortado/);
    }
    p.diapositivas[3].intro = "palabra ".repeat(80);
    const largo = validarPresentacion(p, "institucional");
    expect(largo.ok).toBe(true);
    if (largo.ok) {
      expect((largo.presentacion.diapositivas[3] as { intro?: string }).intro!.length).toBeLessThanOrEqual(240);
      expect(largo.ajustes.join(" ")).toMatch(/muy por encima/);
    }
  });

  it("un ánimo fuera del catálogo se omite, no rompe", () => {
    const p = base();
    p.diapositivas[1].animo = "furioso";
    const v = validarPresentacion(p, "institucional");
    expect(v.ok && v.presentacion.diapositivas[1].animo).toBeUndefined();
    expect(v.ok && v.ajustes.join(" ")).toMatch(/catálogo/);
  });

  it("las notas pasan hasta 900 caracteres", () => {
    const p = base();
    p.diapositivas[0].notas = "a ".repeat(440).trim();
    expect(validarPresentacion(p, "institucional").ok).toBe(true);
    p.diapositivas[0].notas = "palabra ".repeat(260);
    const largo = validarPresentacion(p, "institucional");
    expect(largo.ok && largo.presentacion.diapositivas[0].notas!.length).toBeLessThanOrEqual(900);
  });

  it("tarjetas: de 2 a 4", () => {
    const p = base();
    p.diapositivas[3].tarjetas = [p.diapositivas[3].tarjetas[0]];
    expect(validarPresentacion(p, "institucional").ok).toBe(false);
  });

  it("no es un objeto o no trae diapositivas", () => {
    expect(validarPresentacion("hola", "institucional").ok).toBe(false);
    expect(validarPresentacion({ titulo: "x" }, "institucional").ok).toBe(false);
  });
});

describe("leerJson", () => {
  const ok = { titulo: "x", diapositivas: [] };
  it("JSON limpio, con cercas y con texto alrededor", () => {
    expect(leerJson(JSON.stringify(ok))).toEqual({ ok: true, valor: ok });
    expect(leerJson("```json\n" + JSON.stringify(ok) + "\n```")).toEqual({ ok: true, valor: ok });
    expect(leerJson("Claro, aquí está:\n" + JSON.stringify(ok) + "\nListo.")).toEqual({ ok: true, valor: ok });
  });
  it("repara comas finales y quita <think>", () => {
    expect(leerJson('<think>hmm {no}</think>{"a":[1,2,],}')).toEqual({ ok: true, valor: { a: [1, 2] } });
  });
  it("vacío o roto: error legible", () => {
    expect(leerJson("")).toMatchObject({ ok: false });
    expect(leerJson("sin json")).toMatchObject({ ok: false });
    expect(leerJson('{"a": [1, 2')).toMatchObject({ ok: false });
  });
});

describe("repartirTablas", () => {
  const tabla = (n: number): DTabla => ({ tipo: "tabla", titulo: "Acciones", intro: "Intro", notas: "guion", columnas: ["A", "B"], filas: Array.from({ length: n }, (_, i) => [`a${i}`, `b${i}`]) });

  it("una tabla de 8 filas no se parte", () => {
    expect(repartirTablas([tabla(8)])).toHaveLength(1);
  });
  it("9 filas son 5 + 4, con parte n/de, sin perder ninguna fila", () => {
    const r = repartirTablas([tabla(9)]) as DTabla[];
    expect(r.map((t) => t.filas.length)).toEqual([5, 4]);
    expect(r.map((t) => t.parte)).toEqual([{ n: 1, de: 2 }, { n: 2, de: 2 }]);
    expect(r.flatMap((t) => t.filas).map((f) => f[0])).toEqual(Array.from({ length: 9 }, (_, i) => `a${i}`));
    expect(r[1].intro).toBeUndefined();
    expect(r[1].notas).toBeUndefined();
    expect(r[0].notas).toBe("guion");
  });
  it("20 filas: tres partes y ninguna pasa del tope", () => {
    const r = repartirTablas([tabla(20)]) as DTabla[];
    expect(r).toHaveLength(3);
    expect(Math.max(...r.map((t) => t.filas.length))).toBeLessThanOrEqual(MAX_FILAS_TABLA);
  });
  it("el validador parte una tabla larga que viene del modelo", () => {
    const p = base();
    p.diapositivas[4].filas = tabla(11).filas;
    p.diapositivas[4].columnas = ["A", "B"];
    const v = validarPresentacion(p, "institucional");
    expect(v.ok && v.presentacion.diapositivas.filter((d: Diapositiva) => d.tipo === "tabla")).toHaveLength(2);
  });
  it("deja intactas las diapositivas que no son tabla", () => {
    const d: Diapositiva = { tipo: "cierre", titulo: "Gracias" };
    expect(repartirTablas([d])).toEqual([d]);
  });
});

describe("fondoDe", () => {
  it("elige el fondo de la plantilla; la banda corta solo con títulos de hasta 10 caracteres", () => {
    const ds = presentacionEjemplo.diapositivas;
    const f = (tipo: string, i = ds.findIndex((d) => d.tipo === tipo)) => fondoDe(ds[i]);
    expect(f("portada")).toBe(1);
    expect(f("agenda")).toBe(2);
    expect(f("seccion")).toBe(5);
    expect(f("cierre")).toBe(6);
    expect(f("tabla")).toBe(3); // «Objetivos y metas»
    expect(f("logros")).toBe(4); // «Logros»
  });
});

describe("tablas: filas con celdas de más o de menos se ajustan sin pedir de nuevo", () => {
  it("celdas de más se juntan en la última; de menos se completan con «[por completar]»", () => {
    const p = base();
    p.diapositivas[4].filas[0] = ["A", "B", "C", "D", "E", "F"]; // 4 columnas
    p.diapositivas[4].filas[1] = ["solo una celda"];
    const v = validarPresentacion(p, "institucional");
    expect(v.ok).toBe(true);
    if (v.ok) {
      const t = v.presentacion.diapositivas[4] as DTabla;
      expect(t.filas[0]).toEqual(["A", "B", "C", "D · E · F"]);
      expect(t.filas[1]).toEqual(["solo una celda", "[por completar]", "[por completar]", "[por completar]"]);
      expect(v.ajustes.join(" ")).toMatch(/se ajustó/);
    }
  });
  it("conserva «parte n de m» al abrir una tabla guardada partida", () => {
    const p = base();
    p.diapositivas[4].parte = { n: 2, de: 3 };
    const v = validarPresentacion(p, "institucional");
    expect(v.ok && (v.presentacion.diapositivas[4] as DTabla).parte).toEqual({ n: 2, de: 3 });
  });
});

describe("tablas: una fila escrita como objeto se lee por el nombre de la columna", () => {
  it("por nombre, o en el orden de sus valores", () => {
    const p = base();
    const cols = p.diapositivas[4].columnas as string[];
    p.diapositivas[4].filas[0] = { [cols[0]]: "Uno", [cols[2]]: "Tres" };
    p.diapositivas[4].filas[1] = { a: "w", b: "x", c: "y", d: "z" };
    const v = validarPresentacion(p, "institucional");
    expect(v.ok).toBe(true);
    if (v.ok) {
      const t = v.presentacion.diapositivas[4] as DTabla;
      expect(t.filas[0]).toEqual(["Uno", "[por completar]", "Tres", "[por completar]"]);
      expect(t.filas[1]).toEqual(["w", "x", "y", "z"]);
    }
  });
});
