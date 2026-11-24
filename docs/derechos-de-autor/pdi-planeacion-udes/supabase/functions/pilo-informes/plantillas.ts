/* =============================================================================
   Las secciones de las plantillas A–D (maqueta docs/informes, TPL) como las ve
   Pilo: clave (s1…sN en el orden de la plantilla), título, tipo de la maqueta,
   tipo de sección del corpus y extensión recomendada (de las plantillas 2026 y
   del formato 2025: «1 a 3 párrafos», «una página», «media página»…).
   Lógica pura: sin Deno, sin red.
   ========================================================================== */

export type Plantilla = "A" | "B" | "C" | "D";
export const PLANTILLAS: Plantilla[] = ["A", "B", "C", "D"];

export type SeccionTipo = "resumen" | "alineacion" | "metas" | "resultados" | "retos" | "logros" | "conclusiones" | "presentacion" | "otra";
export const SECCION_TIPOS: SeccionTipo[] = ["resumen", "alineacion", "metas", "resultados", "retos", "logros", "conclusiones", "presentacion", "otra"];

export interface Extension {
  /** Cómo la dice la plantilla. */
  texto: string;
  parrafos: [number, number];
  palabras: [number, number];
}

export interface SeccionPlantilla {
  clave: string;
  titulo: string;
  /** Tipo de la maqueta: narr, pdi, metas, dim, matriz, filas, logros, evid, anexos. */
  ty: string;
  tipo: SeccionTipo;
  /** null: es una lista (evidencias, anexos): Pilo no la redacta. */
  extension: Extension | null;
}

const EXT = {
  breve: { texto: "1 a 3 párrafos", parrafos: [1, 3], palabras: [60, 350] },
  dosPaginas: { texto: "1 a 3 párrafos, máximo dos páginas", parrafos: [1, 3], palabras: [60, 900] },
  propositivo: { texto: "1 a 3 párrafos, tono claro y propositivo", parrafos: [1, 3], palabras: [60, 350] },
  rector: { texto: "1 a 3 párrafos del rector", parrafos: [1, 3], palabras: [60, 350] },
  pagina: { texto: "una página", parrafos: [3, 6], palabras: [280, 550] },
  intro: { texto: "2 a 3 párrafos: propósito, periodo y organización", parrafos: [2, 3], palabras: [120, 400] },
  alineacion: { texto: "media a una página, párrafos cortos", parrafos: [1, 4], palabras: [120, 450] },
  metas: { texto: "media página: breve explicación de las metas", parrafos: [1, 2], palabras: [50, 250] },
  resultados: { texto: "comentario de los resultados, 1 a 3 párrafos", parrafos: [1, 3], palabras: [80, 450] },
  retos: { texto: "media a una página (3 a 5 párrafos)", parrafos: [3, 5], palabras: [150, 550] },
  logros: { texto: "2 a 4 párrafos (máximo 3 logros)", parrafos: [2, 4], palabras: [100, 450] },
} satisfies Record<string, Extension>;

const s = (titulo: string, ty: string, tipo: SeccionTipo, extension: Extension | null) => ({ titulo, ty, tipo, extension });

const TPL: Record<Plantilla, Omit<SeccionPlantilla, "clave">[]> = {
  A: [
    s("Resumen ejecutivo", "narr", "resumen", EXT.breve),
    s("Alineación estratégica con el PDI", "pdi", "alineacion", EXT.alineacion),
    s("Objetivos y metas", "metas", "metas", EXT.metas),
    s("Resultados por dimensión estratégica", "dim", "resultados", EXT.resultados),
    s("Síntesis de resultados institucionales", "matriz", "resultados", EXT.resultados),
    s("Puntos críticos y acciones de mejora", "filas", "retos", EXT.retos),
    s("Logros destacados", "logros", "logros", EXT.logros),
    s("Evidencias y fuentes de verificación", "evid", "otra", null),
    s("Conclusiones", "narr", "conclusiones", EXT.breve),
    s("Anexos", "anexos", "otra", null),
  ],
  B: [
    s("Resumen ejecutivo", "narr", "resumen", EXT.dosPaginas),
    s("Alineación estratégica", "pdi", "alineacion", EXT.alineacion),
    s("Objetivos y metas anuales de la unidad", "metas", "metas", EXT.metas),
    s("Resultados y evidencias", "dim", "resultados", EXT.resultados),
    s("Logros innovadores o excepcionales", "logros", "logros", EXT.logros),
    s("Análisis de retos y oportunidades", "filas", "retos", EXT.retos),
    s("Evidencia y fuentes de verificación", "evid", "otra", null),
    s("Conclusiones", "narr", "conclusiones", EXT.propositivo),
    s("Anexos", "anexos", "otra", null),
  ],
  C: [
    s("Resumen ejecutivo del campus", "narr", "resumen", EXT.rector),
    s("Alineación estratégica con el PDI", "pdi", "alineacion", EXT.alineacion),
    s("Objetivos y metas del campus", "metas", "metas", EXT.metas),
    s("Consolidado por función sustantiva", "dim", "resultados", EXT.resultados),
    s("Resultados y evidencias", "matriz", "resultados", EXT.resultados),
    s("Análisis de retos y oportunidades", "filas", "retos", EXT.retos),
    s("Conclusiones", "narr", "conclusiones", EXT.breve),
    s("Anexos", "anexos", "otra", null),
  ],
  D: [
    s("Presentación del Rector", "narr", "presentacion", EXT.pagina),
    s("Introducción", "narr", "presentacion", EXT.intro),
    s("I. Investigación", "dim", "resultados", EXT.resultados),
    s("II. Extensión", "dim", "resultados", EXT.resultados),
    s("III. Enseñanza", "dim", "resultados", EXT.resultados),
    s("IV. Gestión administrativa y financiera", "dim", "resultados", EXT.resultados),
    s("V. Síntesis y proyecciones", "matriz", "conclusiones", EXT.breve),
    s("Anexos", "anexos", "otra", null),
  ],
};

export const esPlantilla = (p: unknown): p is Plantilla => typeof p === "string" && (PLANTILLAS as string[]).includes(p);

/** Las secciones de una plantilla, con su clave s1…sN. */
export function seccionesDe(plantilla: Plantilla): SeccionPlantilla[] {
  return TPL[plantilla].map((x, i) => ({ ...x, clave: `s${i + 1}` }));
}

export function seccionDe(plantilla: Plantilla, clave: string): SeccionPlantilla | null {
  return seccionesDe(plantilla).find((x) => x.clave === clave) ?? null;
}

/** La plantilla de un informe 2025 por el nombre del archivo o de la unidad (sin IA). */
export function inferirPlantilla(...textos: (string | null | undefined)[]): Plantilla | null {
  const t = textos.filter(Boolean).join(" ").toLowerCase();
  if (/rector[ií]a general|recto general|rector general/.test(t)) return "D";
  if (/campus|c[uú]cuta|valledupar|bogot[aá]|rectoral/.test(t)) return "C";
  if (/decanatura|facultad|\b(cft|fcena|fcms|fcs|fit)\b/.test(t)) return "A";
  if (/vicerrector|oficina|direcci[oó]n|\b(vaf|ven)\b|investigaciones|posgrados|extensi[oó]n|planeaci[oó]n/.test(t)) return "B";
  return null;
}
