/* El corpus de Pilo (pilo-informes/corpus.ts): clasificar sin IA, descartar el
   ruido de los informes 2025 (índices, instrucciones y ejemplos copiados del
   formato, tablas rotas), quitar las cifras, deduplicar y el perfil de estilo.
   Los textos salen de los informes 2025 reales (.harness/institucionales-extract). */

import { describe, expect, it } from "vitest";
import {
  clasificarSeccion,
  elegirEjemplos,
  hashTexto,
  leerIngesta,
  limpiarSeccion,
  perfilEstilo,
  prepararIngesta,
  resumenCorpus,
  sustituirCifras,
  tokensAMarcadores,
  type EjemploCorpus,
} from "../../supabase/functions/pilo-informes/corpus";

const REAL =
  "Durante 2025 la Vicerrectoría de Extensión consolidó su presencia en el barrio Los Colorados con la Escuela de Fútbol Santander Universitario FC, que reúne a 120 niños y niñas.\n" +
  "Desarrollo de la primera conmemoración de Erradicación de la pobreza con la comunidad con más de 500 personas de la academia y la universidad que transformaron la cancha de las Minas.\n" +
  "El telecentro rural fue premiado como buena práctica educativa regional.\n" +
  "Aplicación de experiencia piloto de Datos Ciudadanos con el DANE con padres de familia de la Escuela de Fútbol, en articulación con los programas de la Facultad de Ciencias Sociales.";

const INDICE = "Portada ........................ 2\nIntroducción ..................... 2\nResultados relevantes ............ 6\nSíntesis de resultados ........... 12\nConclusiones ..................... 17";

const INSTRUCCIONES =
  "El resumen ejecutivo es una síntesis clara, concreta y global que presenta los principales logros, retos, avances, cifras clave, oportunidades y hechos relevantes de la gestión anual de la unidad.\nPor qué hacerlo:\nEs la ventana principal del informe, facilita la comprensión a directivos, auditorías y actores externos sin que deban leer el documento entero.\nExtensión recomendada:\nIdeal: 1 página (máximo 2 si es complejo).";

const EJEMPLO_FORMATO =
  "La gestión de la Vicerrectoría de Extensión en 2025 demostró la capacidad institucional de adaptación, innovación y compromiso social, en línea con los pilares estratégicos del PDI y la misión de la UDES. La implementación de los telecentros rurales, la ampliación de convenios internacionales y la atención a grupos vulnerables reflejan avances significativos en apropiación social, equidad y sostenibilidad. Los retos técnicos y de articulación institucional, lejos de limitar los objetivos, se convirtieron en oportunidades de aprendizaje.";

const TABLA = "Indicador\n2024\n2025\nVariación\nSeminarios\n20\n25\n+25%\nBeneficiarios\n650\n800\n+23%";

describe("clasificar sin IA", () => {
  it("por el título", () => {
    expect(clasificarSeccion("Resumen Ejecutivo", "")).toBe("resumen");
    expect(clasificarSeccion("5. Análisis de Retos y Oportunidades", "")).toBe("retos");
    expect(clasificarSeccion("Puntos críticos y acciones de mejora", "")).toBe("retos");
    expect(clasificarSeccion("Síntesis de resultados institucionales", "")).toBe("resultados");
    expect(clasificarSeccion("Conclusiones estratégicas", "")).toBe("conclusiones");
    expect(clasificarSeccion("Lecciones aprendidas", "")).toBe("conclusiones");
    expect(clasificarSeccion("Presentación del Rector", "")).toBe("presentacion");
    expect(clasificarSeccion("Logros destacados", "")).toBe("logros");
    expect(clasificarSeccion("Alineación Estratégica", "")).toBe("alineacion");
    expect(clasificarSeccion("Objetivos y Metas Anuales de la Unidad", "")).toBe("metas");
  });

  it("por el contenido cuando el título no dice nada", () => {
    expect(clasificarSeccion("Capítulo 3", "El principal reto fue la conectividad; otro reto, la dotación. La oportunidad está en las alianzas.")).toBe("retos");
    expect(clasificarSeccion("Capítulo 3", "Texto sin señales.")).toBe("otra");
  });
});

describe("ruido de los informes 2025", () => {
  it("descarta índices, instrucciones del formato, ejemplos copiados y tablas rotas", () => {
    expect(limpiarSeccion("Contenido", INDICE)).toEqual({ ok: false, motivo: "índice" });
    expect(limpiarSeccion("Sin título", INDICE)).toEqual({ ok: false, motivo: "índice" });
    expect(limpiarSeccion("Resumen Ejecutivo", INSTRUCCIONES)).toMatchObject({ ok: false });
    expect(limpiarSeccion("Conclusiones", EJEMPLO_FORMATO)).toEqual({ ok: false, motivo: "texto de ejemplo de la plantilla" });
    expect(limpiarSeccion("Resultados", TABLA)).toEqual({ ok: false, motivo: "tabla rota" });
    expect(limpiarSeccion("Portada", "Informe de gestión 2025")).toEqual({ ok: false, motivo: "portada" });
    expect(limpiarSeccion("Anexos", REAL)).toMatchObject({ ok: false });
  });

  it("quita la frase del formato copiada («El telecentro rural fue premiado…») y conserva lo real", () => {
    const l = limpiarSeccion("Logros destacados", REAL);
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(l.quitadas).toBe(1);
    expect(l.texto).not.toMatch(/telecentro/i);
    expect(l.texto).toContain("Escuela de Fútbol");
  });
});

describe("sin cifras en el corpus", () => {
  it("las cifras pasan a [cifra] y los años a [año]", () => {
    expect(sustituirCifras("En 2025 se firmaron 10 convenios (un aumento del 32 % respecto a 2024) por $1.200 millones.")).toBe(
      "En [año] se firmaron [cifra] convenios (un aumento del [cifra] respecto a [año]) por [cifra] millones.",
    );
    expect(sustituirCifras("1. Primer punto")).toBe("Primer punto");
  });

  it("lo aprobado cambia los tokens por marcadores genéricos con su etiqueta", () => {
    const t = tokensAMarcadores("La matrícula llegó a [[matric]] y la deserción bajó a [[deser]] (antes 8,6 %).", new Map([["matric", "Matrícula total 2026"]]));
    expect(t).toBe("La matrícula llegó a [cifra: Matrícula total] y la deserción bajó a [cifra] (antes [cifra]).");
    expect(t).not.toMatch(/\d/);
  });
});

describe("ingerir", () => {
  it("valida el cuerpo", () => {
    expect(leerIngesta({ archivos: [] }).ok).toBe(false);
    expect(leerIngesta({ anio: 2025, plantilla: "E", archivos: [{}] }).ok).toBe(false);
    expect(leerIngesta({ anio: 2025, archivos: [{ nombre: "x.pdf", secciones: [{ titulo: "a", texto: "b" }] }] }).ok).toBe(true);
  });

  it("devuelve filas nuevas, repetidas y descartadas con motivo", async () => {
    const r = await prepararIngesta(2025, null, [
      { nombre: "Informe Gestión Institucional 2025 - Extensión.pdf", secciones: [{ titulo: "Logros", texto: REAL }, { titulo: "Contenido", texto: INDICE }, { titulo: "Conclusiones", texto: EJEMPLO_FORMATO }] },
      { nombre: "copia.pdf", unidad: "Vicerrectoría de Extensión", secciones: [{ titulo: "Logros", texto: REAL.replace("120", "130") }] },
    ]);
    expect(r.filas).toHaveLength(1);
    expect(r.repetidas).toBe(1);
    expect(r.filas[0]).toMatchObject({ origen: "informe2025", anio: 2025, plantilla: "B", seccion_tipo: "logros", aprobado: true });
    expect(r.filas[0].texto).not.toMatch(/\d/);
    expect(r.descartados.map((d) => d.motivo)).toEqual(["índice", "texto de ejemplo de la plantilla"]);
  });

  it("el hash no depende de mayúsculas ni espacios", async () => {
    expect(await hashTexto("La  Facultad\nconsolidó")).toBe(await hashTexto("la facultad consolidó"));
  });
});

describe("elegir ejemplos", () => {
  const fila = (unidad: string, plantilla: string, texto: string, anio = 2025): EjemploCorpus => ({ origen: "informe2025", anio, plantilla, seccion_tipo: "resumen", unidad_nombre: unidad, titulo: "Resumen", texto });
  const relleno = " La unidad trabajó durante el periodo con sus programas, sus profesores y sus estudiantes en las metas del plan de desarrollo institucional.";
  const filas = [
    fila("FCS", "A", "La facultad mejoró la permanencia y la matrícula de sus programas de salud." + relleno),
    fila("FIT", "A", "La facultad fortaleció la investigación y los semilleros." + relleno),
    fila("FCENA", "A", "La facultad avanzó en registros calificados." + relleno),
    fila("FCMS", "A", "La facultad consolidó la matrícula y redujo la deserción." + relleno),
    fila("VEN", "B", "La vicerrectoría amplió la matrícula y la permanencia." + relleno),
  ];

  it("de 2 a 4, de la misma plantilla y tipo, primero los que comparten palabras clave", () => {
    const r = elegirEjemplos(filas, { plantilla: "A", tipo: "resumen", consulta: "Matrícula total Deserción anual permanencia" });
    expect(r.otrasPlantillas).toBe(false);
    expect(r.ejemplos.length).toBeGreaterThanOrEqual(2);
    expect(r.ejemplos.length).toBeLessThanOrEqual(4);
    expect(r.ejemplos.every((e) => e.plantilla === "A")).toBe(true);
    expect(["FCS", "FCMS"]).toContain(r.ejemplos[0].unidad_nombre);
  });

  it("si la plantilla no alcanza, completa con otras y lo dice", () => {
    const r = elegirEjemplos(filas, { plantilla: "B", tipo: "resumen", consulta: "matrícula" });
    expect(r.ejemplos).toHaveLength(2);
    expect(r.ejemplos[0].plantilla).toBe("B");
    expect(r.otrasPlantillas).toBe(true);
    expect(elegirEjemplos(filas, { plantilla: "A", tipo: "logros", consulta: "" }).ejemplos).toHaveLength(0);
  });
});

describe("lo que Pilo aprendió", () => {
  const textos = [
    "En [año] la Facultad consolidó su oferta. Además, la Facultad fortaleció la investigación con nuevos semilleros.",
    "En [año] la Facultad avanzó en la acreditación. Asimismo, la Facultad fortaleció la investigación formativa.",
    "La gestión del campus se concentró en la permanencia. Sin embargo, persisten retos de conectividad.",
  ];

  it("perfil determinista: mediana, aperturas, conectores y frases típicas", () => {
    const p = perfilEstilo("resumen", textos);
    expect(p).toEqual(perfilEstilo("resumen", [...textos]));
    expect(p.textos).toBe(3);
    expect(p.mediana_palabras).toBe(15);
    expect(p.aperturas[0]).toEqual({ texto: "en la facultad", veces: 2 });
    expect(p.conectores.map((c) => c.texto)).toEqual(["además", "asimismo", "sin embargo"]);
    expect(p.frases.map((f) => f.texto)).toContain("la facultad fortaleció la");
  });

  it("conteos por origen, plantilla y tipo", () => {
    const r = resumenCorpus([
      { origen: "informe2025", anio: 2025, plantilla: "A", seccion_tipo: "resumen", unidad_nombre: "FCS", titulo: "", texto: textos[0] },
      { origen: "aprobado", anio: 2026, plantilla: null, seccion_tipo: "retos", unidad_nombre: "FCS", titulo: "", texto: textos[2] },
    ]);
    expect(r.total).toBe(2);
    expect(r.por_origen).toEqual({ informe2025: 1, aprobado: 1 });
    expect(r.por_plantilla).toEqual({ A: 1, "sin plantilla": 1 });
    expect(r.perfiles.map((p) => p.tipo)).toEqual(["resumen", "retos"]);
  });
});
