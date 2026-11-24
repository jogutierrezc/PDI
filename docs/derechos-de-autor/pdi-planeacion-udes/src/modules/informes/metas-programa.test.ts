// @vitest-environment jsdom
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { vistaCifra } from "./cifras-vivas";
import { esMetaDelPrograma, filasMetaPrograma, recibeMetasDeImpacto, resultadoDe } from "./metas-programa";
import { PLANTILLAS } from "./plantillas";
import type { CifraRow, EstadoInstancia } from "./types";
import { TablaMetasPrograma } from "./ui/MetasPrograma";
import { avanceSeccion, controlesSeccion } from "./validacion";

const meta = (clave: string, etiqueta: string, over: Partial<CifraRow> = {}): CifraRow => ({
  instancia_id: "i1",
  clave,
  etiqueta,
  seccion_clave: null,
  fuente_tipo: "pdi",
  fuente_nombre: "Indicador del programa",
  valor: null,
  unidad: " %",
  meta: 80,
  anterior: null,
  incluida: true,
  justificacion: "",
  propia: false,
  pilar: null,
  visto: null,
  foto_valor: null,
  foto_en: null,
  foto_fuente: null,
  consulta: { programa_nombre: "Medicina", sede_nombre: "Bucaramanga", origen: "adopcion", baja: false, meta_texto: "" },
  ...over,
});

const armar = (filas: CifraRow[], vivas: Record<string, number>, estado: EstadoInstancia = "draft") =>
  filasMetaPrograma(filas, (k) => vistaCifra(k, { fila: filas.find((f) => f.clave === k), viva: k in vivas ? { valor: vivas[k], fuente: "PDI · TM1", corte: "2026" } : null, estado }));

describe("metas del programa", () => {
  it("reconoce sus claves y las unidades que las reciben", () => {
    expect(esMetaDelPrograma("meta_ab12")).toBe(true);
    expect(esMetaDelPrograma("matric")).toBe(false);
    expect(recibeMetasDeImpacto("programa") && recibeMetasDeImpacto("facultad")).toBe(true);
    expect(recibeMetasDeImpacto("vicerrectoria")).toBe(false);
  });

  it("resultado: si el indicador debe bajar, quedar por debajo supera la meta", () => {
    expect(resultadoDe(80, 90, false)).toBe("Superada");
    expect(resultadoDe(80, 80, false)).toBe("Cumplida");
    expect(resultadoDe(80, 60, false)).toBe("Parcial");
    expect(resultadoDe(10, 6, true)).toBe("Superada");
    expect(resultadoDe(10, 14, true)).toBe("Parcial");
    expect(resultadoDe(10, null, true)).toBeNull();
  });

  it("arma las filas con valor vivo, semáforo y orden; ignora cifras que no son metas", () => {
    const filas = [
      meta("meta_b", "Deserción", { meta: 10, consulta: { programa_nombre: "Medicina", sede_nombre: "Bucaramanga", baja: true } }),
      meta("meta_a", "Graduación"),
      { ...meta("matric", "Matrícula"), fuente_tipo: "auto" as const },
    ];
    const r = armar(filas, { meta_a: 90, meta_b: 10.5 });
    expect(r.map((x) => x.nombre)).toEqual(["Deserción", "Graduación"]);
    expect(r[0]).toMatchObject({ alcanzado: 10.5, meta: 10, baja: true, resultado: "Parcial", semaforo: "mid" });
    expect(r[1]).toMatchObject({ alcanzado: 90, resultado: "Superada", semaforo: "ok", viva: true });
  });

  it("enviado manda la foto; el cambio vivo avisa solo en borrador", () => {
    const f = meta("meta_a", "Graduación", { visto: 70, foto_valor: 75, foto_en: "2026-10-01", foto_fuente: "PDI" });
    expect(armar([f], { meta_a: 90 }, "draft")[0].cambio).toEqual({ de: 70, a: 90 });
    const enviado = armar([f], { meta_a: 90 }, "sent")[0];
    expect(enviado).toMatchObject({ alcanzado: 75, congelada: true, cambio: null });
  });

  it("la sección cuenta las metas del programa como contenido y avisa de dónde vienen", () => {
    const def = PLANTILLAS.A.secciones.find((s) => s.tipo === "metas")!;
    const ctx = { cifras: [], propias: [], anexos: 0, exigirFuente: false };
    expect(avanceSeccion(def, {}, ctx)).toBe(0);
    expect(avanceSeccion(def, {}, { ...ctx, metasPrograma: 3 })).toBe(2);
    expect(avanceSeccion(def, { metas: [{ meta: "Extra", programado: 1, alcanzado: null }] }, { ...ctx, metasPrograma: 3 })).toBe(1);
    const c = controlesSeccion(def, {}, { ...ctx, metasPrograma: 3, claves: [], congelada: false, corte: null });
    expect(c[0].texto).toMatch(/3 metas vienen de los indicadores del programa/);
  });
});

describe("tabla de metas del programa", () => {
  const pintar = (p: Partial<Parameters<typeof TablaMetasPrograma>[0]>) =>
    renderToString(
      h(MemoryRouter, null, h(TablaMetasPrograma, { filas: [], observaciones: {}, editable: true, cambiarObservacion: () => {}, aceptar: () => {}, esperaIndicadores: true, ...p })),
    );

  it("sin indicadores seleccionados lo dice y enlaza a Impacto, no queda vacía", () => {
    const html = pintar({});
    expect(html).toContain("Todavía no hay indicadores del programa");
    expect(html).toContain('href="/admin/impacto/elegir"');
    expect(pintar({ esperaIndicadores: false })).toBe("");
  });

  it("muestra el objetivo, la meta, el alcanzado, el resultado y el análisis; las filas no se editan", () => {
    const filas = armar([meta("meta_a", "Graduación"), meta("meta_b", "Deserción", { meta: 10, consulta: { baja: true } })], { meta_a: 90, meta_b: 6 });
    const html = pintar({ filas, observaciones: { meta_a: "Subió por tutorías" } });
    expect(html).toContain("Graduación");
    expect(html).toContain("Indicador del programa");
    expect(html).toContain("debe bajar");
    expect(html).toContain("Superada");
    expect(html).toContain("Subió por tutorías");
    expect(html).toContain("En vivo");
    expect(html.match(/<input/g)).toHaveLength(2);
  });
});
