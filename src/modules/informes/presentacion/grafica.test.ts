import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DGrafica, Diapositiva } from "../../../../supabase/functions/pilo-presentaciones/esquema";
import { Lamina } from "./Laminas";
import { presentacionEjemplo } from "./ejemplo";
import { arcosDona, descripcionGrafica, formatoNumero, fraccionProgreso, informeParaPresentacion, partirEtiqueta, textoValor, topeEscala } from "./modelo";
import { MAX_INFORME_BYTES } from "../../../../supabase/functions/pilo-presentaciones/pedido";
import { informeEjemplo } from "./ejemplo";

const html = (d: Diapositiva) => renderToStaticMarkup(createElement(Lamina, { d, editable: false }));
const grafica = (forma: DGrafica["forma"], extra: Partial<DGrafica> = {}): DGrafica => ({
  tipo: "grafica",
  forma,
  titulo: "Avance",
  series: [{ etiqueta: "Excelencia académica", valor: 68, meta: 80 }, { etiqueta: "Investigación e innovación con un nombre muy largo que se parte", valor: 55 }, { etiqueta: "Cero", valor: 0 }],
  unidad: "%",
  ...extra,
});

describe("medidas de la gráfica", () => {
  it("formato colombiano y unidad", () => {
    expect(formatoNumero(84.2)).toBe("84,2");
    expect(textoValor(72, "%")).toBe("72 %");
    expect(textoValor(9)).toBe("9");
    expect(textoValor(12, "artículos")).toBe("12 artículos");
  });
  it("la escala común toma el mayor valor o meta; el progreso, la meta, 100 si es % o el mayor", () => {
    expect(topeEscala([{ valor: 5, meta: 12 }, { valor: 9 }])).toBe(12);
    expect(topeEscala([{ valor: 0 }])).toBeGreaterThan(0);
    expect(fraccionProgreso({ valor: 9, meta: 12 }, undefined, 12)).toBeCloseTo(0.75);
    expect(fraccionProgreso({ valor: 40 }, "%", 80)).toBeCloseTo(0.4);
    expect(fraccionProgreso({ valor: 40 }, undefined, 80)).toBeCloseTo(0.5);
    expect(fraccionProgreso({ valor: 20, meta: 10 }, undefined, 20)).toBe(1);
  });
  it("los arcos de la dona suman 1 y empiezan donde termina el anterior", () => {
    const a = arcosDona([{ valor: 5 }, { valor: 5 }, { valor: 2 }]);
    expect(a.reduce((x, y) => x + y.fraccion, 0)).toBeCloseTo(1);
    expect(a[1].inicio).toBeCloseTo(a[0].fraccion);
    expect(arcosDona([{ valor: 0 }, { valor: 0 }]).map((x) => x.fraccion)).toEqual([0, 0]);
  });
  it("las etiquetas largas se parten en renglones y terminan en «…»", () => {
    expect(partirEtiqueta("Corta", 30)).toEqual(["Corta"]);
    const l = partirEtiqueta("Investigación e innovación con un nombre muy largo que se parte en dos", 24);
    expect(l).toHaveLength(2);
    expect(l[1].endsWith("…")).toBe(true);
    expect(l.every((x) => x.length <= 24)).toBe(true);
  });
  it("el texto alternativo nombra cada dato con su valor y su meta", () => {
    const t = descripcionGrafica(grafica("barras"));
    expect(t).toContain("Excelencia académica: 68 % (meta 80 %)");
    expect(t).toContain("Cero: 0 %");
  });
});

describe("Lamina · gráfica", () => {
  for (const forma of ["barras", "columnas", "dona", "progreso"] as const) {
    it(`${forma}: SVG con sus datos escritos, tabla de datos para lectores de pantalla y sin valores rotos`, () => {
      const h = html(grafica(forma));
      expect(h).toContain('data-tipo="grafica"');
      expect(h).toContain("<svg");
      expect(h).toContain('role="group"');
      expect(h).toContain("<table");
      expect(h).toContain("<caption>Avance</caption>");
      expect(h).toContain("68 %");
      expect(h).toContain("55 %");
      expect(h).not.toMatch(/undefined|NaN|Infinity|\[object/);
      // la tabla trae cada dato y la meta, no solo el color
      expect(h).toContain("<th scope=\"row\">Excelencia académica</th>");
      expect(h).toContain("80 %");
    });
  }
  it("el SVG se oculta a los lectores (la tabla y el rótulo del grupo dicen lo mismo) y cada fila entra escalonada", () => {
    const h = html(grafica("barras"));
    expect(h).toContain('aria-hidden="true"');
    expect(h.match(/data-a="/g)!.length).toBeGreaterThanOrEqual(4);
  });
  it("la dona lleva leyenda con el valor de cada parte y un arco por parte con valor", () => {
    const h = html(grafica("dona", { unidad: undefined, series: [{ etiqueta: "Completadas", valor: 5 }, { etiqueta: "En proceso", valor: 5 }, { etiqueta: "Pendientes", valor: 0 }] }));
    expect(h).toContain("Completadas");
    expect(h.match(/stroke-dasharray/g)).toHaveLength(2);
  });
  it("«parte n de m» se ve en las láminas de continuación (texto y gráfica) y no dobla el de las tablas", () => {
    const texto: Diapositiva = { tipo: "texto", titulo: "Narración", parrafos: ["Uno."], parte: { n: 2, de: 3 } };
    expect(html(texto)).toContain("Parte 2 de 3");
    expect(html(grafica("barras", { parte: { n: 1, de: 2 } }))).toContain("Parte 1 de 2");
    const tabla = presentacionEjemplo.diapositivas.find((d) => d.tipo === "tabla")!;
    expect(html({ ...tabla, parte: { n: 1, de: 2 } }).match(/Parte 1 de 2/g)).toHaveLength(1);
  });
  it("un texto con muchas líneas y cada tipo con mucha lista no rompen el dibujo", () => {
    const muchas = Array.from({ length: 10 }, (_, i) => ({ etiqueta: `Serie ${i}`, valor: i + 1 }));
    for (const forma of ["barras", "progreso"] as const) expect(html(grafica(forma, { series: muchas }))).not.toMatch(/NaN|undefined/);
    expect(html(grafica("columnas", { series: muchas.slice(0, 8) }))).not.toMatch(/NaN|undefined/);
  });
});

describe("informeParaPresentacion · pierde lo menos posible", () => {
  const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
  it("un informe grande pierde antes la matriz y el detalle redundante que las narraciones", () => {
    const narracion = "Texto de la sección. ".repeat(400); // ~8 400
    const relleno = Array.from({ length: 2400 }, (_, i) => ({ clave: `c${i}`, etiqueta: `Indicador ${i} con un nombre largo`, valor: String(i), anterior: "12", variacion: "+3", origen: "Dato propio · fuente larga" }));
    const grande = { secciones: [{ texto: narracion, matriz: relleno, dimensiones: [{ titulo: "D", filas: relleno.slice(0, 40) }], plan: [{ accion: "A", meta: "M", responsable: "R" }] }] };
    expect(bytes(grande)).toBeGreaterThan(MAX_INFORME_BYTES);
    const r = informeParaPresentacion(grande);
    const s = r.informe.secciones as { texto: string; plan: unknown[]; matriz?: unknown }[];
    expect(bytes(r.informe)).toBeLessThanOrEqual(MAX_INFORME_BYTES);
    expect(s[0].matriz).toBeUndefined();
    expect(s[0].plan).toHaveLength(1);
    expect(s[0].texto.length).toBeGreaterThanOrEqual(6000);
  });
  it("el informe de ejemplo viaja completo", () => {
    expect(informeParaPresentacion(informeEjemplo).aligerado).toBe(false);
  });
});
