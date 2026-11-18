import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fondoDe, TIPOS } from "../../../../supabase/functions/pilo-presentaciones/esquema";
import type { Diapositiva } from "../../../../supabase/functions/pilo-presentaciones/esquema";
import { DURACION_S, PASO_S, TOPE_ESCALONADO_S, rangos, retrasoDe } from "./animar";
import { presentacionEjemplo } from "./ejemplo";
import { ALTO, ANCHO, Lamina } from "./Laminas";

const html = (d: Diapositiva, editable = false) => renderToStaticMarkup(createElement(Lamina, { d, editable, onEditar: () => {} }));

describe("Lamina · cada tipo de diapositiva dibuja sin errores con los datos de ejemplo", () => {
  it("el ejemplo cubre los 12 tipos", () => {
    expect(new Set(presentacionEjemplo.diapositivas.map((d) => d.tipo))).toEqual(new Set(TIPOS));
  });

  for (const tipo of TIPOS) {
    it(`${tipo}: lienzo 1920×1080, su fondo de la plantilla y su texto`, () => {
      const d = presentacionEjemplo.diapositivas.find((x) => x.tipo === tipo)!;
      const h = html(d);
      expect(h).toContain(`width:${ANCHO}px;height:${ALTO}px`);
      expect(h).toContain(`/presentaciones/fondo${fondoDe(d)}.jpg`);
      expect(h).toContain(`data-tipo="${tipo}"`);
      expect(h).not.toMatch(/undefined|NaN|\[object/);
      const titulo = (d as { titulo?: string }).titulo;
      if (titulo) expect(h).toContain(titulo.replace(/&/g, "&amp;"));
    });
  }

  it("usa los seis fondos de la plantilla según el tipo y el largo del título", () => {
    const usados = new Set(presentacionEjemplo.diapositivas.map((d) => fondoDe(d)));
    expect([...usados].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("la gráfica de cumplimiento trae leyenda con palabras, una fila Total y el texto accesible", () => {
    const h = html(presentacionEjemplo.diapositivas.find((d) => d.tipo === "cumplimiento")!);
    for (const p of ["Completadas", "En proceso", "Pendientes", "Total"]) expect(h).toContain(p);
    expect(h).toContain("pr-s-ok");
    expect(h).toContain("pr-s-pr");
    expect(h).toContain("pr-s-pe");
    expect(h).toContain('role="img"');
  });

  it("los estados de una tabla se escriben con su palabra y su color", () => {
    const d: Diapositiva = { tipo: "tabla", titulo: "Acciones", columnas: ["Acción", "Estado"], filas: [["A", "Completado"], ["B", "En proceso"], ["C", "Sin iniciar"]] };
    const h = html(d);
    expect(h).toContain('class="pr-ok"');
    expect(h).toContain('class="pr-proc"');
    expect(h).toContain('class="pr-pend"');
    for (const p of ["Completado", "En proceso", "Sin iniciar"]) expect(h).toContain(p);
  });

  it("la banda corta (fondo 4) solo con títulos de hasta 10 caracteres", () => {
    expect(html({ tipo: "logros", titulo: "Logros", logros: [{ titulo: "a", resultado: "b" }] })).toContain("fondo4.jpg");
    expect(html({ tipo: "logros", titulo: "Logros del año", logros: [{ titulo: "a", resultado: "b" }] })).toContain("fondo3.jpg");
  });

  it("el estado de ánimo se lleva a una imagen real de Pilo, con texto alternativo", () => {
    const h = html({ tipo: "texto", animo: "idea", titulo: "T", puntos: ["a"] });
    expect(h).toContain("/pilo-moods/idea-320.webp");
    expect(h).toContain("Pilo con una idea");
    expect(html({ tipo: "texto", titulo: "T", puntos: ["a"] })).not.toContain("pilo-moods");
  });

  it("una tabla partida muestra «Parte n de N»", () => {
    expect(html({ tipo: "tabla", titulo: "Acciones", columnas: ["A", "B"], filas: [["1", "2"]], parte: { n: 2, de: 3 } })).toContain("Parte 2 de 3");
  });

  it("en modo edición los textos son campos en línea; fuera de él no", () => {
    const d = presentacionEjemplo.diapositivas[0];
    expect(html(d, true)).toContain('contenteditable="true"');
    expect(html(d, false)).not.toContain("contenteditable");
  });

  it("textos con signos peligrosos se escapan", () => {
    expect(html({ tipo: "cierre", titulo: "<img src=x onerror=alert(1)>" })).not.toContain("<img src=x");
  });

  it("todas las diapositivas del ejemplo, juntas, dibujan sin lanzar", () => {
    for (const d of presentacionEjemplo.diapositivas) expect(() => html(d)).not.toThrow();
  });
});

describe("animaciones", () => {
  it("cada entrada dura ≤ 700 ms y el escalonado total no pasa de 500 ms", () => {
    expect(DURACION_S * 1000).toBeLessThanOrEqual(700);
    expect(retrasoDe(30, 31)).toBeLessThanOrEqual(TOPE_ESCALONADO_S);
    expect(retrasoDe(1, 5)).toBeCloseTo(PASO_S);
    expect(retrasoDe(0, 5)).toBe(0);
  });
  it("los rangos agrupan bloques con el mismo orden", () => {
    expect(rangos([0, 2, 2, 20, 3])).toEqual([0, 1, 1, 3, 2]);
  });
});
