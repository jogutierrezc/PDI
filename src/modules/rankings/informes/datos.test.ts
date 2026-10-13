/* Funciones puras de la capa de datos de los informes ODS. */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/supabase", () => ({ supabase: {} }));

import { bloquesDePartida, cifrasSinFuente, leerAjustes, ordenarBloques, puedePublicar, resumenCobertura } from "./datos";
import type { Bloque, EleccionIndicador, Foto, IndicadorTHE, InformeCompleto } from "./tipos";

const bloque = (c: Partial<Bloque> = {}): Bloque => ({
  id: "b1",
  report_id: "r",
  sec: "hicimos",
  pos: 0,
  origin: "pilo",
  text: "",
  orig: "",
  sources: [],
  figs: [],
  warn: null,
  enabled: true,
  spare: false,
  ...c,
});

const foto = (c: Partial<Foto> = {}): Foto => ({
  report_id: "r",
  news_id: "n1",
  use: true,
  slot: "portada",
  caption: "Estudiantes en la jornada",
  alt: "",
  credit: "",
  kind: "foto",
  minors: false,
  cleared: false,
  crop: { fx: 0.5, fy: 0.4, ratio: "16:9" },
  ...c,
});

const completo = (bloques: Bloque[], fotos: Foto[] = [], elecciones: EleccionIndicador[] = []): InformeCompleto => ({
  informe: { id: "r", ods: 4, edition: 2025, state: "revision", settings: { tone: "cercano", person: "nosotros" }, updated_at: "" },
  bloques,
  fotos,
  elecciones,
});

describe("cifrasSinFuente", () => {
  it("las cifras del demo con sus citas no faltan", () => {
    expect(
      cifrasSinFuente({
        text: "Entre febrero y marzo, más de 400 estudiantes de bachillerato aprendieron a reciclar.",
        sources: [{ news_id: "n", quote: "más de 400 estudiantes de bachillerato" }],
        figs: [],
      }),
    ).toEqual([]);
  });

  it("encuentra las cifras sin fuente y no cuenta los años", () => {
    expect(
      cifrasSinFuente({
        text: "En 2025 se vincularon 271 personas y 35 profesores, con 16.030 beneficiados en 1998.",
        sources: [{ news_id: "n", quote: "ha vinculado a 271 personas" }],
        figs: [],
      }),
    ).toEqual(["35", "16.030"]);
  });

  it("las cifras del párrafo (figs) cuentan como fuente, con o sin punto de miles", () => {
    expect(cifrasSinFuente({ text: "16.030 personas y el 20,09 % de los egresados.", sources: [], figs: [{ v: "16.030", label: "", src: "" }, { v: "20,09 %", label: "", src: "" }] })).toEqual([]);
    expect(cifrasSinFuente({ text: "Fueron 16030 personas.", sources: [], figs: [{ v: "16.030", label: "", src: "" }] })).toEqual([]);
  });

  it("un texto sin números no tiene nada que revisar", () => {
    expect(cifrasSinFuente({ text: "La UDES forma maestros.", sources: [], figs: [] })).toEqual([]);
  });
});

describe("puedePublicar", () => {
  const bueno = bloque({ text: "Más de 400 estudiantes.", sources: [{ news_id: "n", quote: "más de 400 estudiantes" }] });

  it("un informe en orden se puede publicar", () => {
    expect(puedePublicar(completo([bueno], [foto()]))).toEqual({ ok: true, motivos: [] });
  });

  it("no con cifras sin fuente en un párrafo activo; sí si el párrafo está quitado o de reserva", () => {
    const malo = bloque({ id: "b2", text: "Participaron 35 profesores." });
    const r = puedePublicar(completo([bueno, malo]));
    expect(r.ok).toBe(false);
    expect(r.motivos[0]).toMatch(/cifras sin fuente: 35/);
    expect(puedePublicar(completo([bueno, { ...malo, enabled: false }])).ok).toBe(true);
    expect(puedePublicar(completo([bueno, { ...malo, spare: true }])).ok).toBe(true);
  });

  it("no con fotos de menores en uso sin autorización", () => {
    expect(puedePublicar(completo([bueno], [foto({ minors: true })])).motivos.join(" ")).toMatch(/menores/);
    expect(puedePublicar(completo([bueno], [foto({ minors: true, cleared: true })])).ok).toBe(true);
    expect(puedePublicar(completo([bueno], [foto({ minors: true, use: false })])).ok).toBe(true);
  });

  it("no con cifras ilustrativas, párrafos vacíos o sin párrafos", () => {
    expect(puedePublicar(completo([bloque({ text: "Hay 62 apoyos.", figs: [{ v: "62", label: "apoyos", src: "Dato ilustrativo (ods-data): reemplázalo" }] })])).motivos.join(" ")).toMatch(/ilustrativas/);
    expect(puedePublicar(completo([bueno, bloque({ id: "v", text: "  " })])).motivos.join(" ")).toMatch(/vacío/);
    expect(puedePublicar(completo([])).motivos).toEqual(["El informe no tiene párrafos."]);
  });
});

describe("ordenarBloques", () => {
  it("por sección en el orden del informe y luego por posición", () => {
    const o = ordenarBloques([
      bloque({ id: "v", sec: "viene", pos: 0 }),
      bloque({ id: "h2", sec: "hicimos", pos: 2 }),
      bloque({ id: "t", sec: "tesis", pos: 0 }),
      bloque({ id: "h1", sec: "hicimos", pos: 1 }),
      bloque({ id: "c", sec: "cifras", pos: 5 }),
      bloque({ id: "p", sec: "proyectos", pos: 0 }),
    ]);
    expect(o.map((b) => b.id)).toEqual(["t", "c", "h1", "h2", "p", "v"]);
  });
});

describe("resumenCobertura", () => {
  const ind = (id: string, tipo: IndicadorTHE["tipo"], ods = 4): IndicadorTHE => ({ id, ods, titulo: id, tipo, peso: null, pregunta: "", regla: "", maximo: 3 });
  const eleccion = (indicator: string, c: Partial<EleccionIndicador> = {}): EleccionIndicador => ({ report_id: "r", indicator, news_id: null, candidates: [], ask: {}, page_es: [], page_en: "", approved: false, ...c });

  it("cuenta propuestas, aprobadas, faltantes y documentos del ODS del informe", () => {
    const lista = [ind("4.3.1", "ev"), ind("4.3.2", "ev"), ind("4.3.3", "ev"), ind("4.3.4", "doc"), ind("4.2.1", "dato"), ind("4.1", "inv"), ind("13.3.1", "ev", 13)];
    const r = resumenCobertura(completo([], [], [eleccion("4.3.1", { news_id: "n1", approved: true }), eleccion("4.3.2", { news_id: "n2" }), eleccion("4.3.4")]), lista);
    expect(r.total).toBe(6);
    expect(r.conNoticias).toBe(3);
    expect(r.propuestas).toBe(2);
    expect(r.aprobadas).toBe(1);
    expect(r.faltan).toEqual(["4.3.3"]);
    expect(r.documentos).toEqual(["4.3.4"]);
    expect(r.porIndicador.find((x) => x.id === "4.2.1")?.estado).toBe("dato");
    expect(r.porIndicador.find((x) => x.id === "4.1")?.estado).toBe("investigacion");
  });
});

describe("informe nuevo", () => {
  it("siembra tesis, cifras con figs y lo que viene, escritos por una persona", () => {
    const b = bloquesDePartida(4);
    expect(b.map((x) => x.sec)).toEqual(["tesis", "cifras", "viene"]);
    expect(b.every((x) => x.origin === "persona")).toBe(true);
    expect(b[1].figs.map((f) => f.v)).toEqual(["16.030", "20,09 %"]);
    expect(cifrasSinFuente({ ...b[1] })).toEqual([]);
    expect(b[2].text).toMatch(/^La UDES prevé seguir reduciendo/);
  });

  it("con cifras de muestra lo avisa y no deja publicar", () => {
    const b = bloquesDePartida(1);
    expect(b[1].warn).toMatch(/ilustrativas/);
    const bloques = b.map((x, i) => bloque({ ...x, id: `s${i}` }));
    expect(puedePublicar(completo(bloques)).ok).toBe(false);
  });

  it("ajustes de partida", () => {
    expect(leerAjustes(undefined)).toEqual({ tone: "cercano", person: "nosotros" });
  });
});
