/* Segunda fase de los informes ODS (lógica pura): libro de cifras, imágenes,
   ficha de evidencia para el LLM de THE, inglés, evaluador, fuentes que no son
   noticias, verificación de varias citas y proveedor de IA de los rankings.
   Casos reales: las notas del ODS 4 de fixtures/ods4-notas.json. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import crudas from "./fixtures/ods4-notas.json";
import { aNumero, extraerCifras, leerConfirmacion, mensajesConfirmarCifras } from "../../supabase/functions/pilo-rankingsod/cifras";
import { combinarRiesgos, completarFicha, leerEvaluacion, leerFichaMejorada, leerTraducciones, mensajesEvaluar, numerosEn, validarFicha, verificarTraduccion } from "../../supabase/functions/pilo-rankingsod/ficha";
import { afinidadOds, aNotaVirtual, cifraAnual, datosCifras, datosImpacto, datosProyectos, ESTADO_FUENTES, tipoDeRef } from "../../supabase/functions/pilo-rankingsod/fuentes";
import { organizarImagenes, miniatura, leerVision, type ImagenDeNota } from "../../supabase/functions/pilo-rankingsod/imagenes";
import { leerParrafo, verificarParrafo, type NotaInforme, type Parrafo } from "../../supabase/functions/pilo-rankingsod/logica";
import { elegirProveedor, esperaTras429, leerAjustesIA, MODELO_MISTRAL } from "../../supabase/functions/pilo-rankingsod/proveedor";
import { fichaCompleta, idiomaPreferido, paginaEvidencia, reglasPagina, textoEnIdioma } from "../../src/modules/rankings/informes/pagina";

const NOTAS: NotaInforme[] = (crudas as { key: string; title: string; body: string; published_on: string; section: string }[]).map((n, i) => ({
  id: n.key,
  title: n.title,
  body: n.body,
  published_on: n.published_on,
  section: n.section,
  image_url: `https://udes.edu.co/img/${n.key}.jpg`,
  score: 90 - i,
}));
const nota = (k: string) => NOTAS.find((n) => n.id === k)!;

/* ---------- Libro de cifras ------------------------------------------------- */

describe("extraer cifras: casos reales", () => {
  const de = (k: string) => extraerCifras(nota(k).body);
  const valores = (k: string) => de(k).map((c) => c.value);

  it.each([
    ["recolector", "400", "estudiantes de bachillerato", "personas", "más de 400 estudiantes de bachillerato"],
    ["superheroes", "120", "estudiantes de preescolar", "personas", "más de 120 estudiantes de preescolar"],
    ["aire", "100", "niños", "personas", "cerca de 100 niños"],
    ["mutis", "271", "personas", "personas", "271 personas"],
    ["diplomado", "80", "horas", "horas", "80 horas"],
    ["caricartoons", "ocho", "clases", "eventos", "ocho clases"],
    ["premedico", "16", "estudiantes", "personas", "16 estudiantes"],
    ["inclusiva", "181", "universidades", "instituciones", "181 universidades"],
    ["inclusiva", "350", "asistentes", "personas", "más de 350 asistentes"],
    ["paipe", "600", "profesores", "personas", "más de 600 profesores"],
  ])("%s: %s %s", (k, value, label, kind, quote) => {
    const c = de(k).find((x) => x.value === value && x.label.startsWith(label));
    expect(c, `${k} ${value}`).toBeTruthy();
    expect(c!.kind).toBe(kind);
    expect(c!.quote).toBe(quote);
    // La cita es literal de la nota.
    expect(nota(k).body.replace(/\s+/g, " ")).toContain(c!.quote);
  });

  it("el porcentaje del Premédico, con su objeto", () => {
    const p = de("premedico").find((c) => c.kind === "porcentaje")!;
    expect(p.value).toBe("43 %");
    expect(p.num).toBe(43);
    expect(p.label).toBe("de los estudiantes");
  });

  it("no toma fechas, horas, años ni números de grado de las notas reales", () => {
    expect(valores("gestion")).toEqual([]); // «del 14 de agosto al 6 de noviembre», «8:00 a. m.»
    expect(valores("diplomado")).not.toContain("15");
    expect(valores("diplomado")).not.toContain("25");
    expect(valores("premedico")).not.toContain("11");
    expect(valores("premedico")).not.toContain("2025");
    for (const n of NOTAS) for (const c of extraerCifras(n.body)) expect(c.value).not.toMatch(/^20\d\d$/);
  });

  it("las cifras de la UDES pesan más que las de un tercero o del país", () => {
    const inc = de("inclusiva");
    const u181 = inc.find((c) => c.value === "181")!;
    const pais = inc.find((c) => c.value === "80")!;
    expect(pais.score).toBeLessThan(u181.score);
  });
});

describe("extraer cifras: casos sintéticos y negativos", () => {
  const una = (t: string) => extraerCifras(t)[0];
  it.each([
    ["La UDES entregó $ 1.200 millones en becas.", "dinero", 1.2e9],
    ["Se invirtieron 350 millones de pesos en laboratorios.", "dinero", 3.5e8],
    ["El 20,09 % de los egresados enseña.", "porcentaje", 20.09],
    ["Participaron 16.030 personas en Proyección Social.", "personas", 16030],
    ["Se dictaron cinco jornadas de salud.", "eventos", 5],
    ["Doce empresas aliadas apoyaron la feria.", "instituciones", 12],
    ["El curso tuvo 40 horas de clase.", "horas", 40],
    ["Asistieron alrededor de 2.500 visitantes.", "otro", 2500],
  ])("%s", (t, kind, num) => {
    const c = una(t);
    expect(c.kind).toBe(kind);
    expect(c.num).toBe(num);
    expect(t).toContain(c.quote);
  });

  it.each([
    ["El evento fue el 12 de noviembre de 2025."],
    ["La sesión empieza a las 8:00 a. m."],
    ["Informes al 607 6516500 o al 3001234567."],
    ["En la COP16 se presentó el vehículo."],
    ["Se cumple la Ley 30 de 1992."],
    ["Aporta al ODS 4 y al ODS 13."],
    ["Estudiantes de 11° grado participaron."],
    ["El curso Premédico 2025-A comenzó."],
    ["1. Inscripción 2. Pago"],
    ["Los dos hablaron con calma."],
    ["Del 20 al 22 de octubre de 2025."],
  ])("no es una cifra: %s", (t) => {
    expect(extraerCifras(t)).toEqual([]);
  });

  it("entiende números con letras y con separadores", () => {
    expect(aNumero("veinte")).toBe(20);
    expect(aNumero("16.030")).toBe(16030);
    expect(aNumero("20,09")).toBe(20.09);
  });
});

describe("Pilo confirma las cifras", () => {
  const cifras = [
    { id: "a", news_id: "inclusiva", value: "181", label: "universidades", quote: "181 universidades" },
    { id: "b", news_id: "inclusiva", value: "80", label: "universidades del país", quote: "más de 80 universidades del país" },
  ];
  it("los mensajes listan F1, F2 con la nota y la cita", () => {
    const u = mensajesConfirmarCifras(cifras, [nota("inclusiva")])[1].content;
    expect(u).toMatch(/\[F1\] \(N1\) «181 universidades» → 181/);
    expect(u).toMatch(/score 0/);
  });
  it("lee la confirmación; una cifra que no es de la UDES queda con score 0", () => {
    const r = leerConfirmacion('{"cifras":[{"ref":"F1","udes":false,"label":"universidades en el encuentro","score":70},{"ref":"F2","udes":true,"label":"universidades de la red","score":55}]}', cifras);
    expect(r).toEqual({ ok: true, valor: [{ id: "a", udes: false, label: "universidades en el encuentro", score: 0 }, { id: "b", udes: true, label: "universidades de la red", score: 55 }] });
  });
  it.each([
    ["sin json", "nada", /JSON/],
    ["sin lista", '{"x":1}', /cifras/],
    ["ref ajena", '{"cifras":[{"ref":"F9","udes":true,"label":"x","score":1}]}', /no está/],
    ["udes texto", '{"cifras":[{"ref":"F1","udes":"sí","label":"x","score":1}]}', /udes/],
    ["score raro", '{"cifras":[{"ref":"F1","udes":true,"label":"x","score":200}]}', /score/],
    ["sin label", '{"cifras":[{"ref":"F1","udes":true,"score":50}]}', /label/],
  ])("malformada: %s", (_, crudo, error) => {
    const r = leerConfirmacion(crudo, cifras);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(error);
  });
});

/* ---------- Verificación con varias citas y libro de cifras ------------------ */

describe("párrafo de un tema: cita todas sus notas y solo cifras del libro", () => {
  const grupo = [nota("recolector"), nota("superheroes"), nota("aire")];
  const libro = [
    { news_id: "recolector", value: "400", label: "estudiantes de bachillerato", quote: "más de 400 estudiantes de bachillerato" },
    { news_id: "superheroes", value: "120", label: "estudiantes de preescolar", quote: "más de 120 estudiantes de preescolar" },
    { news_id: "aire", value: "100", label: "niños", quote: "cerca de 100 niños" },
  ];
  const base: Parrafo = {
    text: "En tres colegios, la UDES llevó educación ambiental y en salud: más de 400 estudiantes de bachillerato aprendieron a reciclar, más de 120 niños participaron en títeres y cerca de 100 niños aprendieron a lavarse las manos.",
    text_en: "In three schools, UDES delivered environmental and health education: more than 400 secondary students learned to recycle, more than 120 children took part in puppet shows and about 100 children learned handwashing.",
    sources: [
      { news_id: "recolector", quote: "más de 400 estudiantes de bachillerato" },
      { news_id: "superheroes", quote: "más de 120 estudiantes de preescolar y básica primaria participaron en shows de títeres" },
      { news_id: "aire", quote: "cerca de 100 niños y niñas de los grados Transición y Primero participaron" },
    ],
    figs: [],
    warn: null,
  };

  it("pasa: cita las tres, cifras del libro y «tres» = número de notas citadas", () => {
    const v = verificarParrafo(base, grupo, { libro, exigir: grupo.map((n) => n.id) });
    expect(v.ok, v.error).toBe(true);
    expect(verificarTraduccion(base.text, base.text_en).ok).toBe(true);
  });

  it("falla si deja una nota del grupo sin citar", () => {
    const p = { ...base, sources: base.sources.slice(0, 2) };
    expect(verificarParrafo(p, grupo, { libro, exigir: grupo.map((n) => n.id) }).error).toMatch(/faltan: N3/);
  });

  it("falla con una cifra que está en la nota pero no en el libro", () => {
    const p = { ...base, text: `${base.text} Fueron 45 docentes.`, sources: [...base.sources] };
    expect(verificarParrafo(p, grupo, { libro, exigir: grupo.map((n) => n.id) }).error).toMatch(/libro de cifras/);
  });

  it("las fechas de las citas sí se pueden decir", () => {
    const p: Parrafo = { ...base, text: `${base.text} Las jornadas fueron entre el 17 de febrero y el 16 de mayo.`, sources: [...base.sources, { news_id: "aire", quote: "visitó el Colegio Luis Carlos Galán Sarmiento, sede D, en Piedecuesta" }] };
    const conFecha = { ...p, sources: [...p.sources.slice(0, 3), { news_id: "recolector", quote: "En los meses de febrero y marzo de 2025" }] };
    expect(verificarParrafo(conFecha, grupo, { libro }).error).toMatch(/17|16/);
    const premed = nota("premedico");
    const q: Parrafo = { text: "El curso Premédico reunió a 16 estudiantes entre el 17 de febrero y el 16 de mayo.", text_en: "x".repeat(40), sources: [{ news_id: "premedico", quote: "16 estudiantes dieron inicio al curso Premédico 2025-A" }, { news_id: "premedico", quote: "comenzó el pasado 17 de febrero y se extenderá hasta el 16 de mayo" }], figs: [], warn: null };
    expect(verificarParrafo(q, [premed], { libro: [{ news_id: "premedico", value: "16", label: "estudiantes", quote: "16 estudiantes" }] }).ok).toBe(true);
  });

  it("una fuente que no es noticia se cita con su referencia y su origen", () => {
    const dato = datosImpacto([{ indicator_id: "i1", name: "Personas beneficiadas por Proyección Social", unit_label: "personas", measure: "numero", year: 2025, value_num: 16030, value_text: "", not_applicable: false }], 2025)[0];
    const virtual = aNotaVirtual(dato);
    const crudo = JSON.stringify({ text: "Según los indicadores de Impacto, 16.030 personas se beneficiaron de la Proyección Social de la UDES.", text_en: "According to the Impact indicators, 16,030 people benefited from UDES outreach.", sources: [{ news_id: "N1", quote: dato.texto }], figs: [{ v: "16.030", label: "personas", src: "N1" }], warn: null });
    const l = leerParrafo(crudo, [virtual], "cifras");
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(l.valor.sources[0]).toMatchObject({ news_id: "", kind: "impacto", ref: "impacto:i1:2025", origen: "Indicadores de Impacto 2025" });
    const v = verificarParrafo(l.valor, [virtual], { libro: [{ news_id: dato.ref, value: dato.value!, label: dato.label, quote: dato.texto }], exigir: [dato.ref] });
    expect(v.ok, v.error).toBe(true);
    expect(verificarTraduccion(l.valor.text, l.valor.text_en).ok).toBe(true);
  });
});

/* ---------- Inglés ----------------------------------------------------------- */

describe("español e inglés", () => {
  it.each([
    ["Más de 400 estudiantes y 16.030 personas.", "More than 400 students and 16,030 people.", true],
    ["El 20,09 % de los egresados.", "20.09% of graduates.", true],
    ["Ocho clases en 2025.", "Eight classes in 2025.", true],
    ["El 12 de noviembre de 2025.", "On 2025-11-12.", true],
    ["Más de 400 estudiantes.", "More than 450 students.", false],
    ["Más de 400 estudiantes.", "Many students.", false],
    ["El programa PAIPE atendió 30 personas.", "The programme served 30 people.", false],
  ])("«%s» ↔ «%s»", (es, en, ok) => {
    expect(verificarTraduccion(es, en).ok).toBe(ok);
  });

  it("avisa del lenguaje promocional en inglés", () => {
    expect(verificarTraduccion("La UDES formó 30 líderes.", "UDES proudly trained 30 outstanding leaders.").warn).toMatch(/promocional/);
  });

  it("lee traducciones por lote; las que no cuadran quedan aparte", () => {
    const items = [{ ref: "T1", es: "Asistieron 30 personas." }, { ref: "T2", es: "Se dictaron ocho clases." }];
    const r = leerTraducciones('{"traducciones":[{"ref":"T1","en":"30 people attended."},{"ref":"T2","en":"Nine classes were taught."}]}', items);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.buenas.map((b) => b.ref)).toEqual(["T1"]);
      expect(r.valor.malas[0].ref).toBe("T2");
    }
    expect(leerTraducciones('{"traducciones":[{"ref":"T9","en":"x"}]}', items).ok).toBe(false);
  });

  it("los números de un texto en inglés: separadores y fechas ISO", () => {
    expect(numerosEn("16,030 people on 2025-03-05 and eight days")).toEqual(["16030", "2025", "5", "8"]);
  });

  it("idioma preferido: inglés salvo que se pida español; el español siempre existe", () => {
    expect(idiomaPreferido()).toBe("en");
    expect(idiomaPreferido("es")).toBe("es");
    expect(idiomaPreferido("fr", "es-CO")).toBe("es");
    expect(textoEnIdioma({ text: "Hola", text_en: "" }, "en")).toEqual({ texto: "Hola", idioma: "es" });
    expect(textoEnIdioma({ text: "Hola", text_en: "Hello" }, "en")).toEqual({ texto: "Hello", idioma: "en" });
  });
});

/* ---------- Ficha de evidencia y página para el LLM de THE --------------------- */

describe("ficha de evidencia", () => {
  const ind = { id: "4.3.3", pregunta: "Does the university provide educational outreach activities beyond campus, e.g. in local schools?" };
  const buena = {
    answer: "In 2025, the Universidad de Santander (UDES) trained more than 400 secondary school students in recycling at the Institución Educativa La Libertad in Bucaramanga.",
    answer_es: "En 2025, la Universidad de Santander (UDES) capacitó a más de 400 estudiantes de bachillerato en reciclaje.",
    who: "Surgical Instrumentation programme, UDES",
    what: "Recycling workshops for secondary school students",
    when: "2025-02-01/2025-03-31",
    where: "Institución Educativa La Libertad, Bucaramanga",
    how_many: "More than 400 secondary school students",
    beneficiaries: "Secondary school students",
    partners: "Veolia",
    evidence_type: "Educational outreach workshop",
  };

  it("una ficha correcta cumple; el código pone indicador, pregunta y periodo", () => {
    const f = completarFicha(buena, ind, 2025);
    expect(f).toMatchObject({ indicator: "4.3.3", question: ind.pregunta, period: "Academic year 2025" });
    expect(validarFicha(f, nota("recolector"), 2025)).toEqual([]);
    expect(fichaCompleta(f)).toEqual({ completa: true, faltan: [] });
  });

  it.each([
    ["un enlace", { answer: `${buena.answer} See https://udes.edu.co/x` }, /enlace/],
    ["remite a otra parte", { what: "Workshops (read more on the website)" }, /autocontenido/],
    ["promocional", { answer: buena.answer.replace("trained", "proudly trained") }, /promocional/],
    ["sin la institución completa", { answer: "In 2025, UDES trained more than 400 secondary school students." }, /Universidad de Santander/],
    ["sin el año", { answer: "The Universidad de Santander (UDES) trained more than 400 secondary school students." }, /2025/],
    ["fecha en otro formato", { when: "febrero y marzo" }, /when/],
    ["una cifra inventada", { how_many: "More than 900 students" }, /900/],
  ])("no cumple: %s", (_, cambio, error) => {
    const f = completarFicha({ ...buena, ...cambio }, ind, 2025);
    expect(validarFicha(f, nota("recolector"), 2025).join(" ")).toMatch(error);
  });

  it("si la nota no dice algo, el campo queda vacío y la ficha avisa qué falta", () => {
    const f = completarFicha({ ...buena, partners: "", when: "" }, ind, 2025);
    expect(validarFicha(f, nota("recolector"), 2025)).toEqual([]);
    expect(fichaCompleta(f).faltan).toEqual(["when"]);
  });

  it("la página va en el orden de THE: título con el código, respuesta, ficha, frases; sin enlaces", () => {
    const f = completarFicha(buena, ind, 2025);
    const en = paginaEvidencia({ id: "4.3.3", titulo: "Divulgación en colegios", pregunta: ind.pregunta }, f, ["Frase literal uno.", "Frase literal dos."], "In February and March 2025 more than 400 students took part. The workshops were led by the Surgical Instrumentation programme.", "en");
    const lineas = en.texto.split("\n");
    expect(lineas[0]).toMatch(/^Indicator 4\.3\.3 — Does the university/);
    expect(lineas[1]).toBe(buena.answer);
    expect(lineas[2]).toMatch(/^Who: /);
    expect(en.frases).toHaveLength(2);
    expect(reglasPagina(en.texto, 2025)).toEqual([]);
    const es = paginaEvidencia({ id: "4.3.3", titulo: "Divulgación en colegios" }, f, ["Frase literal uno.", "Frase literal dos."], "", "es");
    expect(es.titulo).toBe("Indicador 4.3.3 — Divulgación en colegios");
    expect(es.respuesta).toBe(buena.answer_es);
    expect(es.ficha[0].etiqueta).toBe("Quién");
    expect(es.frases).toEqual(["Frase literal uno.", "Frase literal dos."]);
  });

  it("la ficha mejorada se valida igual (no inventa)", () => {
    const n = nota("recolector");
    expect(leerFichaMejorada(JSON.stringify({ ficha: buena }), ind, n, 2025).ok).toBe(true);
    const r = leerFichaMejorada(JSON.stringify({ ficha: { ...buena, how_many: "2,000 students" } }), ind, n, 2025);
    expect(r.ok).toBe(false);
    expect(leerFichaMejorada("{}", ind, n, 2025).ok).toBe(false);
  });
});

/* ---------- Evaluador ------------------------------------------------------------ */

describe("evaluador de THE", () => {
  it("solo recibe la pregunta y el texto de la página", () => {
    const m = mensajesEvaluar("Does the university…?", "Indicator 4.3.3\nIn 2025, the Universidad de Santander…");
    expect(m).toHaveLength(2);
    expect(m[0].content).toMatch(/only see the visible text of ONE web page/);
    expect(m[1].content).toMatch(/^Question: Does the university/);
    expect(m[1].content).toMatch(/<<<PAGE[\s\S]*PAGE>>>/);
  });

  it("lee una evaluación y suma los riesgos que se ven sin IA", () => {
    const r = leerEvaluacion('{"grade":"g","confidence":70,"reasons":["Related but no date"],"missing":["the exact date"],"risks":[]}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = combinarRiesgos(r.valor, "Indicator 4.3.3\nUDES runs workshops. See www.udes.edu.co", 2025, true);
    expect(c.risks.join(" ")).toMatch(/enlace/);
    expect(c.risks.join(" ")).toMatch(/anuncia/);
    expect(c.risks.join(" ")).toMatch(/Universidad de Santander/);
  });

  it.each([
    ["vacía", "", /JSON/],
    ["texto", "Looks specific to me.", /JSON/],
    ["lista", '[{"grade":"s"}]', /objeto|leer/],
    ["grade raro", '{"grade":"x","confidence":50,"reasons":["a"]}', /grade/],
    ["grade en mayúscula", '{"grade":"S","confidence":50,"reasons":["a"]}', /grade/],
    ["confianza texto", '{"grade":"s","confidence":"alta","reasons":["a"]}', /confidence/],
    ["confianza 150", '{"grade":"s","confidence":150,"reasons":["a"]}', /confidence/],
    ["sin razones", '{"grade":"s","confidence":50,"reasons":[]}', /reasons/],
    ["razones texto", '{"grade":"s","confidence":50,"reasons":"ok"}', /reasons/],
    ["missing texto", '{"grade":"g","confidence":50,"reasons":["a"],"missing":"date"}', /listas/],
    ["genérica sin decir qué falta", '{"grade":"g","confidence":50,"reasons":["a"],"missing":[]}', /falta/],
  ])("malformada: %s", (_, crudo, error) => {
    const r = leerEvaluacion(crudo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(error);
  });
});

/* ---------- Imágenes ------------------------------------------------------------- */

describe("elegir y organizar las imágenes de las notas", () => {
  const img = (news_id: string, id: string, c: Partial<ImagenDeNota> = {}): ImagenDeNota => ({ id, news_id, url: `https://udes.edu.co/images/${id}.jpg`, width: 1200, height: 800, caption: "", credit: "", pos: 0, is_cover: false, kind: "foto", minors: false, alt: "", ...c });
  const usos = [
    { nota: nota("diplomado"), sec: "hicimos", peso: 5 },
    { nota: nota("inclusiva"), sec: "hicimos", peso: 4 },
    { nota: nota("paipe"), sec: "hicimos", peso: 3 },
    { nota: nota("gestion"), sec: "hicimos", peso: 2 },
    { nota: nota("aire"), sec: "hicimos", peso: 6 },
  ];
  const imagenes = [
    img("diplomado", "d-portada", { is_cover: true, width: 1920, height: 640, credit: "Educación Continua" }),
    img("diplomado", "d-1", { width: 685, height: 514, pos: 1 }),
    img("diplomado", "d-2", { width: 685, height: 514, pos: 2 }),
    img("diplomado", "d-3", { width: 685, height: 514, pos: 3 }),
    img("inclusiva", "i-portada", { is_cover: true, width: 1920, height: 640 }),
    img("inclusiva", "i-1", { width: 642, height: 428, pos: 1 }),
    img("paipe", "p-chica", { width: 300, height: 200 }),
    img("gestion", "g-portada", { is_cover: true, width: 1920, height: 640 }),
    img("aire", "a-portada", { is_cover: true, width: 1920, height: 640 }),
  ];
  const r = organizarImagenes(usos, imagenes);
  const de = (id: string) => r.find((x) => x.image_id === id)!;

  it("la portada: ancha y de la nota más relevante que se puede publicar (no la de menores)", () => {
    expect(de("d-portada")).toMatchObject({ use: true, slot: "portada", crop: { ratio: "3:1", fy: 0.35 } });
    expect(de("a-portada")).toMatchObject({ use: false, minors: true });
  });

  it("n1 y n2 de notas distintas; galería con hasta dos por nota", () => {
    const n1 = r.find((x) => x.slot === "n1" && x.use)!;
    const n2 = r.find((x) => x.slot === "n2" && x.use);
    expect(n1.news_id).toBe("inclusiva");
    expect(n2).toBeUndefined(); // paipe solo trae una imagen chica y gestion es una convocatoria
    const galeriaDiplomado = r.filter((x) => x.news_id === "diplomado" && x.slot === "galeria" && x.use);
    expect(galeriaDiplomado.length).toBeLessThanOrEqual(2);
    expect(r.filter((x) => x.news_id === "diplomado" && !x.use)[0].motivo).toMatch(/suficientes/);
  });

  it("fuera: la convocatoria (gráfica) y la imagen chica, con el motivo", () => {
    expect(de("g-portada")).toMatchObject({ use: false, kind: "grafica" });
    expect(de("p-chica").use).toBe(false);
    expect(de("p-chica").motivo).toMatch(/pequeña/);
  });

  it("pie del original o frase literal; crédito del original o de la nota; alt marcado «Revisar»", () => {
    expect(de("d-portada").credit).toBe("Educación Continua");
    const pie = de("i-1").caption;
    expect(nota("inclusiva").body.replace(/\s+/g, " ")).toContain(pie.replace(/…$/, ""));
    for (const f of r) expect(f.alt).toMatch(/^Revisar/);
    expect(new Set(r.filter((f) => f.news_id === "diplomado").map((f) => f.caption)).size).toBeGreaterThan(1);
  });

  it("no repite lo que ya está en el informe ni ocupa su portada; sin news_images usa la portada de la nota", () => {
    const otra = organizarImagenes(usos, imagenes, [{ news_id: "diplomado", image_id: "d-portada", slot: "portada", use: true }]);
    expect(otra.find((x) => x.image_id === "d-portada")).toBeUndefined();
    expect(otra.find((x) => x.slot === "portada" && x.use)).toBeUndefined();
    const vieja = organizarImagenes([{ nota: nota("paipe"), sec: "hicimos", peso: 1 }], []);
    expect(vieja[0]).toMatchObject({ image_id: null, news_id: "paipe", slot: "portada", use: true });
  });

  it("visión: miniatura de K2 y respuesta estricta", () => {
    expect(miniatura("https://udes.edu.co/media/k2/items/cache/abc_XL.jpg?t=1")).toBe("https://udes.edu.co/media/k2/items/cache/abc_M.jpg?t=1");
    expect(leerVision('{"alt":"Grupo de estudiantes en un aula","menores":true,"texto":false}')).toEqual({ ok: true, alt: "Grupo de estudiantes en un aula", menores: true, texto: false });
    expect(leerVision('{"alt":"x","menores":"no"}').ok).toBe(false);
    expect(leerVision("no sé").ok).toBe(false);
  });
});

/* ---------- Otras fuentes ------------------------------------------------------------- */

describe("fuentes que no son noticias", () => {
  const criterios = [
    { sdg: 4, term: "educación", weight: 3 },
    { sdg: 4, term: "estudiante", weight: 3 },
    { sdg: 4, term: "graduado", weight: 2 },
    { sdg: 13, term: "clima", weight: 3 },
  ];

  it("la afinidad usa el diccionario del motor: sin tildes, en singular, frases seguidas", () => {
    expect(afinidadOds("Estudiantes de Educación Continua", criterios, 4)).toEqual({ score: 6, terminos: ["educación", "estudiante"] });
    expect(afinidadOds("Acción por el clima", criterios, 4).score).toBe(0);
  });

  it("Impacto: la cifra global del año, con su origen", () => {
    const d = datosImpacto(
      [
        { indicator_id: "a", name: "Tasa de graduación", unit_label: "", measure: "porcentaje", year: 2025, value_num: 20.09, value_text: "", not_applicable: false },
        { indicator_id: "b", name: "No aplica", unit_label: "", measure: "numero", year: 2025, value_num: 3, value_text: "", not_applicable: true },
        { indicator_id: "c", name: "Otro año", unit_label: "", measure: "numero", year: 2024, value_num: 3, value_text: "", not_applicable: false },
      ],
      2025,
    );
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: "impacto", ref: "impacto:a:2025", value: "20,09 %", origen: "Indicadores de Impacto 2025" });
    expect(d[0].texto).toBe("Tasa de graduación: 20,09 % (Indicadores de Impacto 2025).");
  });

  it("UDES en Cifras: cifra anual por la regla del indicador y solo lo que el diccionario reconoce", () => {
    expect(cifraAnual([{ term: "A", value: 10 }, { term: "B", value: 20 }], "suma")).toBe(30);
    expect(cifraAnual([{ term: "A", value: 10 }, { term: "B", value: 20 }], "ultimo")).toBe(20);
    expect(cifraAnual([{ term: "A", value: 10 }, { term: "B", value: 20 }], "promedio")).toBe(15);
    expect(cifraAnual([{ term: "anual", value: 7 }, { term: "A", value: 10 }], "suma")).toBe(7);
    expect(cifraAnual([{ term: "A", value: 10 }], "reportado")).toBeNull();
    const fila = (id: string, label: string, term: "A" | "B", value: number) => ({ indicator_id: id, label, definition: "", unit: "estudiantes", format: "entero" as const, annual_rule: "suma" as const, report_name: "Estudiantes", year: 2025, term, value });
    const d = datosCifras([fila("x", "Estudiantes graduados de educación", "A", 1000), fila("x", "Estudiantes graduados de educación", "B", 1030), fila("y", "Toneladas de CO2", "A", 5)], criterios, 4, 2025);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: "cifras", ref: "cifras:x:2025", value: "2.030", origen: "UDES en Cifras 2025" });
  });

  it("proyectos del PDI reconocidos por el diccionario; tipo de referencia", () => {
    const d = datosProyectos([{ id: "p1", name: "Educación para estudiantes rurales", description: "Becas.", detail: "", pillar: "Formación" }, { id: "p2", name: "Mantenimiento de sedes", description: "", detail: "", pillar: "" }], criterios, 4);
    expect(d.map((x) => x.ref)).toEqual(["proyecto:p1"]);
    expect(d[0].texto).toMatch(/^Educación para estudiantes rurales \(pilar Formación\): Becas\. \(Proyectos del PDI\)$/);
    expect(tipoDeRef("cifras:x:2025")).toBe("cifras");
    expect(tipoDeRef("1f0e")).toBe("noticia");
    expect(ESTADO_FUENTES.documento.conectada).toBe(false);
  });
});

/* ---------- Proveedor de IA de los rankings ---------------------------------------- */

describe("proveedor de IA de los rankings", () => {
  const pilo = { enabled: true, provider: "nvidia", base_url: "", chat_path: "", text_model: "google/gemma-4-31b-it" };
  const secreto = { nvidia_key: "", otro_key: "", mistral_key: "mk", api_key: "nv" };

  it("por defecto, el de Mr. Pilo, con lote 2 en NVIDIA", () => {
    const d = elegirProveedor(leerAjustesIA(null), pilo, { ...secreto, nvidia_key: "nk" });
    expect(d).toMatchObject({ ok: true, eleccion: "pilo", proveedor: "nvidia", model: "google/gemma-4-31b-it", clave: "nk", lote: 2, json: false, vision: null });
  });

  it("Mistral con la clave guardada para Mr. Pilo; modelo small por defecto, large si se pide; lote 5", () => {
    const d = elegirProveedor(leerAjustesIA({ ai_provider: "mistral" }), pilo, secreto);
    expect(d).toMatchObject({ ok: true, eleccion: "mistral", proveedor: "mistral", model: MODELO_MISTRAL, clave: "mk", lote: 5, json: true });
    expect(d.url).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(elegirProveedor(leerAjustesIA({ ai_provider: "mistral", ai_model: "mistral-large-latest" }), pilo, secreto).model).toBe("mistral-large-latest");
    expect(elegirProveedor(leerAjustesIA({ ai_provider: "mistral", ai_model: "gpt-4o" }), pilo, secreto).model).toBe(MODELO_MISTRAL);
    expect(elegirProveedor(leerAjustesIA({ ai_provider: "mistral", ai_batch: 3 }), pilo, secreto).lote).toBe(3);
  });

  it("sin clave de Mistral lo dice con claridad y no inventa una", () => {
    const d = elegirProveedor(leerAjustesIA({ ai_provider: "mistral" }), pilo, { mistral_key: "" });
    expect(d.ok).toBe(false);
    expect(d.clave).toBe("");
    expect(d.motivo).toMatch(/No hay clave de Mistral/);
  });

  it("visión solo si hay modelo de visión; ajustes raros vuelven a los de partida", () => {
    expect(elegirProveedor(leerAjustesIA({ ai_provider: "mistral", ai_vision_model: "pixtral-12b-2409" }), pilo, secreto).vision).toBe("pixtral-12b-2409");
    expect(leerAjustesIA({ ai_provider: "openai", ai_batch: 99 })).toEqual({ ai_provider: "pilo", ai_model: "", ai_vision_model: "", ai_batch: 0 });
  });

  it("Pilo apagado: el motivo; con Mistral no hace falta encenderlo", () => {
    expect(elegirProveedor(leerAjustesIA(null), { ...pilo, enabled: false }, secreto).motivo).toMatch(/apagado/);
    expect(elegirProveedor(leerAjustesIA({ ai_provider: "mistral" }), { ...pilo, enabled: false }, secreto).ok).toBe(true);
  });

  it("ante un 429 espera lo que pida, entre 1 y 3 s", () => {
    expect(esperaTras429(null)).toBe(1200);
    expect(esperaTras429("10")).toBe(3000);
    expect(esperaTras429("0.2")).toBe(1000);
  });
});

/* ---------- La copia de pagina.ts de la función ------------------------------------ */

describe("pagina.ts", () => {
  it("la copia de la función es idéntica al original de src", () => {
    const raiz = resolve(__dirname, "../..");
    const original = readFileSync(resolve(raiz, "src/modules/rankings/informes/pagina.ts"), "utf8").replace(/\r\n/g, "\n");
    const copia = readFileSync(resolve(raiz, "supabase/functions/pilo-rankingsod/pagina.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(copia).toBe(original);
  });
});
