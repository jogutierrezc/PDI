/* Funciones puras de la capa de datos de los informes ODS. */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/supabase", () => ({ supabase: {} }));

import { bloquesDePartida, cifrasSinFuente, fichaCompleta, idiomaPreferido, leerAjustes, leerAjustesRankingsIA, ordenarBloques, paginaDeEleccion, puedePublicar, registroActividades, resumenCobertura, textoProgresoTema } from "./datos";
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

describe("0146: cobertura total y registro de actividades", () => {
  const notas = [
    { id: "a", published_on: "2025-03-20", campus: "Bucaramanga", section: "Extensión", title: "El Recolector", title_en: "The Collector", url: "https://udes.edu.co/a" },
    { id: "b", published_on: "2025-01-10", campus: "", section: "Enseñanza", title: "Becas de movilidad", title_en: "", url: "https://udes.edu.co/b" },
    { id: "c", published_on: null, campus: "", section: "", title: "Sin fecha", title_en: "", url: "https://udes.edu.co/c" },
  ];
  const bloques = [
    bloque({ id: "1", sources: [{ news_id: "a", quote: "x" }] }),
    bloque({ id: "2", sources: [{ news_id: "c", quote: "x" }], enabled: false }),
    bloque({ id: "3", sources: [{ news_id: "", ref: "cifras:x:2025", kind: "cifras", quote: "x" }] }),
  ];

  it("el registro lista TODAS las notas en orden cronológico, con su cifra principal y si la narrativa la cita", () => {
    const r = registroActividades(notas, [{ news_id: "a", value: "400", label: "estudiantes", score: 80 }, { news_id: "a", value: "3", label: "talleres", score: 20 }, { news_id: "b", value: "9", label: "x", score: 0 }], bloques);
    expect(r.map((x) => x.news_id)).toEqual(["b", "a", "c"]);
    expect(r.find((x) => x.news_id === "a")).toMatchObject({ figure_value: "400", en_narrativa: true });
    expect(r.find((x) => x.news_id === "b")).toMatchObject({ figure_value: null, en_narrativa: false });
    expect(r.find((x) => x.news_id === "c")!.en_narrativa).toBe(false);
  });

  it("resumenCobertura cuenta las notas en la narrativa y las que están solo en el registro", () => {
    const r = resumenCobertura(completo(bloques), [], notas);
    expect(r).toMatchObject({ notasTotal: 3, notasEnNarrativa: 1, notasSoloRegistro: 2 });
    expect(resumenCobertura(completo(bloques), []).notasTotal).toBeUndefined();
  });

  it("progreso por tema", () => {
    expect(textoProgresoTema({ tema: { indice: 3, total: 11, heading: "Formación continua" }, cubiertas: 24, total_notas: 61 })).toBe("Tema 3 de 11 («Formación continua») · 24 de 61 notas cubiertas");
    expect(textoProgresoTema({ tema: null })).toBe("");
  });
});

describe("0146: proveedor de IA, idioma y ficha", () => {
  it("los ajustes de IA de los rankings se leen con cuidado", () => {
    expect(leerAjustesRankingsIA(null)).toEqual({ ai_provider: "pilo", ai_model: "", ai_vision_model: "", ai_batch: 0 });
    expect(leerAjustesRankingsIA({ ai_provider: "mistral", ai_model: " mistral-large-latest ", ai_vision_model: "pixtral-12b-2409", ai_batch: 5 })).toEqual({ ai_provider: "mistral", ai_model: "mistral-large-latest", ai_vision_model: "pixtral-12b-2409", ai_batch: 5 });
    expect(leerAjustesRankingsIA({ ai_provider: "x", ai_batch: 40 }).ai_batch).toBe(0);
  });

  it("inglés por defecto; ficha completa; página de una elección", () => {
    expect(idiomaPreferido(null)).toBe("en");
    expect(fichaCompleta({ answer: "x", who: "x", what: "x", when: "", where: "x" })).toEqual({ completa: false, faltan: ["when"] });
    const p = paginaDeEleccion({ indicator: "4.3.3", ficha: { answer: "In 2025, the Universidad de Santander trained 400 students." }, page_es: ["Una frase."], page_en: "One sentence." }, { id: "4.3.3", titulo: "Colegios", pregunta: "Outreach?" });
    expect(p.titulo).toBe("Indicator 4.3.3 — Outreach?");
    expect(p.frases).toEqual(["One sentence."]);
    expect(leerAjustes({ vision: true })).toEqual({ tone: "cercano", person: "nosotros", vision: true });
  });
});
