import { describe, expect, it } from "vitest";
import { dividirPorTitulos, plantillaDesdeNombre, unidadDesdeNombre } from "./capacitacion";
import { congelado, formatoCifra, numeroDe, resultadoMeta, semaforo, variacion, vistaCifra } from "./cifras-vivas";
import { componerNota, leerNota, motivosNoEnviar, puedeEditar, transicionPermitida } from "./estados";
import { PLANTILLAS, clavesDe, dimsDe, plantillaSugerida } from "./plantillas";
import { avanceSeccion, controlesSeccion } from "./validacion";
import type { CifraRow } from "./types";

const fila = (over: Partial<CifraRow> = {}): CifraRow => ({
  instancia_id: "i1",
  clave: "matric",
  etiqueta: "Matrícula total",
  seccion_clave: "s4",
  fuente_tipo: "auto",
  fuente_nombre: "",
  valor: null,
  unidad: "",
  meta: 2900,
  anterior: 2765,
  incluida: true,
  justificacion: "",
  propia: false,
  pilar: null,
  visto: 2840,
  foto_valor: null,
  foto_en: null,
  foto_fuente: null,
  ...over,
});

describe("plantillas", () => {
  it("numeran las secciones s1… y traen las cifras de sus dimensiones", () => {
    expect(PLANTILLAS.A.secciones).toHaveLength(10);
    expect(PLANTILLAS.B.secciones).toHaveLength(9);
    expect(PLANTILLAS.C.secciones).toHaveLength(8);
    expect(PLANTILLAS.D.secciones).toHaveLength(8);
    expect(PLANTILLAS.A.secciones.map((s) => s.clave).slice(0, 3)).toEqual(["s1", "s2", "s3"]);
    expect(dimsDe("D")).toEqual(["inv", "ext", "acad", "prof", "cal", "fin"]);
    expect(clavesDe("B")).toContain("con");
    expect(clavesDe("B")).not.toContain("matric");
  });

  it("sugiere plantilla por tipo y nombre de unidad", () => {
    expect(plantillaSugerida("facultad")).toBe("A");
    expect(plantillaSugerida("vicerrectoria")).toBe("B");
    expect(plantillaSugerida("otra", "Rectoría Campus Cúcuta")).toBe("C");
    expect(plantillaSugerida("otra", "Rectoría General")).toBe("D");
  });
});

describe("cifras vivas", () => {
  it("lee en vivo en borrador y avisa si cambió desde lo visto", () => {
    const v = vistaCifra("matric", { fila: fila(), viva: { valor: 2851, fuente: "UDES en Cifras · matriculados", corte: "2026-12-31" }, estado: "draft", condicion: "justificar" });
    expect(v.valor).toBe(2851);
    expect(v.viva).toBe(true);
    expect(v.cambio).toEqual({ de: 2840, a: 2851 });
    expect(v.incluida).toBe(true);
  });

  it("enviado o aprobado: manda la foto y no hay aviso", () => {
    const v = vistaCifra("matric", { fila: fila({ foto_valor: 2840, foto_fuente: "Foto", foto_en: "2026-10-14" }), viva: { valor: 9999, fuente: "x", corte: null }, estado: "sent" });
    expect(v.valor).toBe(2840);
    expect(v.cambio).toBeNull();
    expect(v.congelada).toBe(true);
    expect(v.fuente).toBe("Foto");
    expect(congelado("ok")).toBe(true);
    expect(congelado("back")).toBe(false);
  });

  it("una fuente propia usa su valor y su nombre", () => {
    const v = vistaCifra("matric", { fila: fila({ fuente_tipo: "manual", valor: 3000, fuente_nombre: "Registro" }), viva: { valor: 1, fuente: "x", corte: null }, estado: "draft" });
    expect(v.valor).toBe(3000);
    expect(v.propia).toBe(true);
    expect(v.fuente).toBe("Registro");
    expect(v.cambio).toBeNull();
  });

  it("«no pedir» la deja fuera; sin fila, sugerida e incluida", () => {
    expect(vistaCifra("matric", { estado: "draft", condicion: "no" }).incluida).toBe(false);
    expect(vistaCifra("matric", { estado: "draft" }).incluida).toBe(true);
  });

  it("semáforo, variación con signo y resultado de metas", () => {
    expect(semaforo(2840, 2900)).toBe("mid");
    expect(semaforo(7.8, 8, false)).toBe("ok");
    expect(semaforo(10, 8, false)).toBe("bad");
    expect(semaforo(null, 8)).toBeNull();
    expect(variacion(2840, 2765)).toBe("+75");
    expect(variacion(7.8, 8.6, " %")).toBe("−0,8 pp");
    expect(resultadoMeta(6, 6)).toBe("Cumplida");
    expect(resultadoMeta(6, 4)).toBe("Parcial");
    expect(resultadoMeta(2, 3)).toBe("Superada");
    expect(formatoCifra(2840.25, " %")).toBe("2.840,3 %");
  });

  it("lee números escritos a la colombiana", () => {
    expect(numeroDe("2.840")).toBe(2840);
    expect(numeroDe("7,8")).toBe(7.8);
    expect(numeroDe("7.8")).toBe(7.8);
    expect(numeroDe("1.234,5")).toBe(1234.5);
    expect(numeroDe("")).toBeNull();
    expect(numeroDe("abc")).toBeNull();
  });
});

describe("estados", () => {
  it("el Gestor o Planeación envían; solo Planeación aprueba o devuelve", () => {
    expect(transicionPermitida("draft", "sent", "jefe")).toBe(true);
    expect(transicionPermitida("draft", "sent", "editor")).toBe(false);
    expect(transicionPermitida("sent", "ok", "jefe")).toBe(false);
    expect(transicionPermitida("sent", "ok", "planeacion")).toBe(true);
    expect(transicionPermitida("ok", "back", "planeacion")).toBe(true);
    expect(transicionPermitida("back", "draft", "editor")).toBe(true);
    expect(transicionPermitida("draft", "sent", "visor")).toBe(false);
  });

  it("se escribe en borrador o devuelto, nunca enviado; Consulta solo lee", () => {
    expect(puedeEditar("draft", "editor")).toBe(true);
    expect(puedeEditar("back", "jefe")).toBe(true);
    expect(puedeEditar("sent", "planeacion")).toBe(false);
    expect(puedeEditar("draft", "visor")).toBe(false);
  });

  it("explica por qué no se puede enviar", () => {
    expect(motivosNoEnviar({ estado: "draft", rol: "jefe", listas: 10, total: 10 })).toEqual([]);
    expect(motivosNoEnviar({ estado: "draft", rol: "editor", listas: 3, total: 10 })).toHaveLength(2);
    expect(motivosNoEnviar({ estado: "sent", rol: "jefe", listas: 10, total: 10 })[0]).toMatch(/Ya se envió/);
  });

  it("la nota de devolución guarda y recupera las notas por sección", () => {
    const nota = componerNota("Revise las fuentes.", [
      { clave: "s3", titulo: "Objetivos: y metas", nota: "Falta el alcanzado\nde la meta 2" },
      { clave: "s4", titulo: "Resultados", nota: " " },
    ]);
    expect(nota).toBe("Revise las fuentes.\n§s3 · Objetivos y metas: Falta el alcanzado de la meta 2");
    expect(leerNota(nota)).toEqual({ general: "Revise las fuentes.", porSeccion: { s3: "Falta el alcanzado de la meta 2" } });
    expect(leerNota(null)).toEqual({ general: "", porSeccion: {} });
  });
});

describe("avance de secciones", () => {
  const vacio = { cifras: [], propias: [], anexos: 0, exigirFuente: true };
  const [resumen, pdi, metas, dim] = PLANTILLAS.A.secciones;

  it("texto: lista con el mínimo de palabras", () => {
    expect(avanceSeccion(resumen, { texto: "" }, vacio)).toBe(0);
    expect(avanceSeccion(resumen, { texto: "uno dos tres" }, vacio)).toBe(1);
    expect(avanceSeccion(resumen, { texto: Array(25).fill("palabra").join(" ") }, vacio)).toBe(2);
  });

  it("pdi con tres pilares; metas completas", () => {
    expect(avanceSeccion(pdi, { pilares: ["a", "b"] }, vacio)).toBe(1);
    expect(avanceSeccion(pdi, { pilares: ["a", "b", "c"] }, vacio)).toBe(2);
    expect(avanceSeccion(metas, { metas: [{ meta: "Convenios", programado: 4, alcanzado: null }] }, vacio)).toBe(1);
    expect(avanceSeccion(metas, { metas: [{ meta: "Convenios", programado: 4, alcanzado: 6 }] }, vacio)).toBe(2);
  });

  it("resultados: lista cuando todo lo que se justifica tiene su línea", () => {
    const pedida = vistaCifra("matric", { fila: fila(), estado: "draft", condicion: "justificar" });
    expect(avanceSeccion(dim, {}, { ...vacio, cifras: [pedida] })).toBe(0);
    const hecha = vistaCifra("matric", { fila: fila({ justificacion: "Creció por la oferta nueva" }), estado: "draft", condicion: "justificar" });
    expect(avanceSeccion(dim, {}, { ...vacio, cifras: [hecha] })).toBe(2);
    const c = controlesSeccion(dim, {}, { ...vacio, cifras: [pedida], claves: ["matric"], congelada: false, corte: null });
    expect(c[0]).toEqual({ nivel: "warn", texto: "1 cifra que pide Planeación aún sin justificación" });
  });
});

describe("capacitación de Pilo", () => {
  const p = (text: string) => ({ type: "paragraph" as const, text });
  const h = (level: number, text: string) => ({ type: "heading" as const, level, text });
  const largo = (n: number) => Array(n).fill("texto").join(" ");

  it("divide por el nivel de título que se repite y descarta índices y trozos cortos", () => {
    const d = dividirPorTitulos([
      h(1, "INFORME DE GESTIÓN 2025"),
      h(2, "Tabla de contenido"),
      p("1. Resumen ... 3"),
      h(2, "1. Resumen ejecutivo"),
      p(largo(30)),
      h(3, "1.1 Detalle"),
      p(largo(10)),
      h(2, "2. Conclusiones"),
      p("Muy poco."),
    ]);
    expect(d.secciones.map((s) => s.titulo)).toEqual(["1. Resumen ejecutivo"]);
    expect(d.secciones[0].texto).toContain("1.1 Detalle");
    expect(d.descartes.map((x) => x.motivo)).toEqual(["Título sin texto", "Índice o tabla de contenido", "Muy corto (2 palabras)"]);
  });

  it("sin títulos, todo es «Presentación»", () => {
    expect(dividirPorTitulos([p(largo(40))]).secciones[0].titulo).toBe("Presentación");
  });

  it("adivina unidad y plantilla por el nombre del archivo", () => {
    expect(unidadDesdeNombre("INFO GESTIÓN VALLEDUPAR 2025.pdf")).toBe("Valledupar");
    expect(unidadDesdeNombre("INFORME DE GESTION CFT 2025.docx")).toBe("CFT");
    expect(plantillaDesdeNombre("INFO GESTIÓN VALLEDUPAR 2025.pdf")).toBe("C");
    expect(plantillaDesdeNombre("Informe Decanatura Salud.docx")).toBe("A");
    expect(plantillaDesdeNombre("Informe Rector General.docx")).toBe("D");
  });
});
