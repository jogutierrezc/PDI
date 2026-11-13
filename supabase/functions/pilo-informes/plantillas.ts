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
  logros: { texto: "2 a 4 párrafos, un logro por párrafo", parrafos: [2, 4], palabras: [100, 450] },
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

/** A–D o una estructura propia (X1…, 0279): el patrón que acepta la base. */
export const esPlantillaConocida = (p: unknown): p is string => typeof p === "string" && /^[A-Z][A-Z0-9]{0,2}$/.test(p);

/** Una estructura propia de Planeación (informe_estructuras, 0279): sus secciones por posición (s1, s2…). */
export interface EstructuraPropia {
  plantilla: string;
  secciones: { titulo: string; tipo: string }[];
}

const TIPO_CORPUS: Record<string, SeccionTipo> = { pdi: "alineacion", metas: "metas", dim: "resultados", matriz: "resultados", filas: "retos", logros: "logros" };
const EXT_PROPIA: Record<string, Extension | null> = { narr: EXT.breve, pdi: EXT.alineacion, metas: EXT.metas, dim: EXT.resultados, matriz: EXT.resultados, filas: EXT.retos, logros: EXT.logros };

/** Las secciones de una plantilla: las del código, o las de la estructura propia que se pasó. */
function baseDe(plantilla: string, propia?: EstructuraPropia | null): Omit<SeccionPlantilla, "clave">[] {
  if (plantilla in TPL) return TPL[plantilla as Plantilla];
  return (propia?.secciones ?? []).map((x) => {
    const tipo: SeccionTipo =
      x.tipo === "narr" ? (/conclusi/i.test(x.titulo) ? "conclusiones" : /presenta|introduc/i.test(x.titulo) ? "presentacion" : "resumen") : (TIPO_CORPUS[x.tipo] ?? "otra");
    return s(x.titulo, x.tipo, tipo, EXT_PROPIA[x.tipo] ?? null);
  });
}

/** Una fila de informe_secciones_config (0276): lo que Planeación cambió de la plantilla en el ciclo. */
export interface SeccionConfig {
  plantilla: string;
  clave: string;
  activa: boolean;
  titulo: string | null;
  libre: boolean;
}

/**
 * Las secciones de una plantilla, con su clave s1…sN. Con la configuración del ciclo (0276):
 * sin las desactivadas, con el título propio y sumando las libres (clave x1…, tipo «libre»,
 * texto simple: Pilo no las redacta ni aprende de ellas, solo las lee como contexto).
 */
export function seccionesDe(plantilla: string, config: SeccionConfig[] = [], propia?: EstructuraPropia | null): SeccionPlantilla[] {
  const filas = config.filter((f) => f.plantilla === plantilla);
  const base = baseDe(plantilla, propia).map((x, i) => {
    const clave = `s${i + 1}`;
    const f = filas.find((y) => y.clave === clave);
    return f && !f.activa ? null : { ...x, clave, titulo: f?.titulo?.trim() || x.titulo };
  });
  const libres = filas.filter((f) => f.libre && f.activa).map((f): SeccionPlantilla => ({ clave: f.clave, titulo: f.titulo?.trim() || "Sección nueva", ty: "libre", tipo: "otra", extension: null }));
  return [...base.filter((x): x is SeccionPlantilla => x !== null), ...libres];
}

export function seccionDe(plantilla: string, clave: string, config: SeccionConfig[] = [], propia?: EstructuraPropia | null): SeccionPlantilla | null {
  return seccionesDe(plantilla, config, propia).find((x) => x.clave === clave) ?? null;
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
