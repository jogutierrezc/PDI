/* =============================================================================
   Pilo Publica · las unidades de cada ranking (lógica pura, sin red).

     · impact  unidad = ODS 1..17. Indicadores: INDICADORES_THE (metodología
               THE Impact 2027, v1.1).
     · world   unidad = pilar del THE World University Rankings (metodología
               WUR 3.0). Indicadores: la lista fija de métricas de cada pilar
               (METRICAS_WORLD), sin pesos: Pilo no estima puntajes.
     · green   unidad = categoría de UI GreenMetric (SI, EC, WS, WR, TR, ED,
               GD). Indicadores: las preguntas del ciclo (ugm_preguntas); si el
               ciclo no existe, solo la categoría.

   Las palabras clave son un diccionario MODESTO, sin IA, para reconocer
   noticias, tablas de Datos de Sostenibilidad y cifras de UDES en Cifras que
   no traen ODS, pilar ni categoría. Se comparan sin tildes y en minúscula
   (plano, de pilo-rankingsod/fuentes.ts), como frases enteras.
   ========================================================================== */

import { INDICADORES_THE } from "../pilo-rankingsod/indicadores.ts";
import { plano } from "../pilo-rankingsod/fuentes.ts";
import { ODS_NOMBRES } from "../pilo-rankingsod/logica.ts";
import type { Ranking } from "./contrato.ts";

/** Un indicador del ranking al que puede responder un texto. */
export interface IndicadorRanking {
  id: string;
  titulo: string;
  pregunta: string;
}

export interface Unidad {
  ranking: Ranking;
  key: string;
  nombre_es: string;
  nombre_en: string;
  palabras: string[];
}

/* ---------- THE Impact: ODS -------------------------------------------------------- */

const ODS_EN = [
  "No poverty", "Zero hunger", "Good health and well-being", "Quality education", "Gender equality",
  "Clean water and sanitation", "Affordable and clean energy", "Decent work and economic growth",
  "Industry, innovation and infrastructure", "Reduced inequalities", "Sustainable cities and communities",
  "Responsible consumption and production", "Climate action", "Life below water", "Life on land",
  "Peace, justice and strong institutions", "Partnerships for the goals",
];

const PALABRAS_ODS: Record<number, string[]> = {
  1: ["pobreza", "vulnerable", "vulnerabilidad", "beca", "becas", "apoyo economico", "emprendimiento social", "poblacion vulnerable"],
  2: ["hambre", "seguridad alimentaria", "nutricion", "alimentos", "agricultura", "huerta", "huertas", "desnutricion"],
  3: ["salud", "bienestar", "brigada de salud", "vacunacion", "salud mental", "pacientes", "atencion medica", "prevencion"],
  4: ["educacion", "formacion", "colegio", "colegios", "docentes", "aprendizaje", "curso gratuito", "alfabetizacion", "educacion continua"],
  5: ["genero", "mujeres", "equidad de genero", "igualdad de genero", "violencia de genero", "lideresas", "mujer"],
  6: ["agua", "saneamiento", "agua potable", "aguas residuales", "recurso hidrico", "cuenca"],
  7: ["energia", "energia solar", "paneles solares", "eficiencia energetica", "energias renovables", "fotovoltaico"],
  8: ["empleo", "empleabilidad", "trabajo decente", "egresados", "practicas", "emprendimiento", "feria laboral"],
  9: ["innovacion", "infraestructura", "patente", "patentes", "transferencia tecnologica", "industria", "investigacion aplicada"],
  10: ["inclusion", "desigualdad", "discapacidad", "migrantes", "poblacion indigena", "diversidad", "accesibilidad"],
  11: ["ciudad", "ciudades", "patrimonio", "comunidad", "movilidad", "vivienda", "espacio publico"],
  12: ["reciclaje", "residuos", "consumo responsable", "economia circular", "aprovechamiento", "separacion en la fuente"],
  13: ["cambio climatico", "clima", "emisiones", "carbono", "huella de carbono", "accion climatica"],
  14: ["oceano", "mar", "vida marina", "ecosistemas marinos", "pesca", "manglar"],
  15: ["biodiversidad", "reforestacion", "arboles", "siembra", "ecosistemas", "fauna", "flora", "bosque"],
  16: ["paz", "justicia", "derechos humanos", "convivencia", "transparencia", "reconciliacion", "conflicto"],
  17: ["alianza", "alianzas", "convenio", "convenios", "cooperacion", "red", "redes academicas", "internacional"],
};

/* ---------- THE World: pilares (WUR 3.0) ------------------------------------------ */

interface Pilar {
  key: string;
  es: string;
  en: string;
  palabras: string[];
  metricas: IndicadorRanking[];
}

export const PILARES_WORLD: Pilar[] = [
  {
    key: "teaching",
    es: "Enseñanza",
    en: "Teaching",
    palabras: ["docencia", "ensenanza", "docentes", "profesores", "doctorado", "doctores", "estudiantes", "acreditacion", "calidad academica", "pregrado", "posgrado", "maestria"],
    metricas: [
      { id: "teaching.reputation", titulo: "Reputación docente", pregunta: "¿Qué tan reconocida es la enseñanza de la universidad entre académicos de otras instituciones?" },
      { id: "teaching.ratio", titulo: "Relación estudiantes por profesor", pregunta: "¿Cuántos estudiantes hay por cada profesor de tiempo completo?" },
      { id: "teaching.doctorate_bachelor", titulo: "Doctorados frente a pregrados", pregunta: "¿Cuántos títulos de doctorado otorga la universidad frente a los de pregrado?" },
      { id: "teaching.doctorate_staff", titulo: "Doctorados por profesor", pregunta: "¿Cuántos doctorados se otorgan por cada profesor?" },
      { id: "teaching.income", titulo: "Ingresos institucionales", pregunta: "¿Cuántos ingresos tiene la universidad por cada profesor académico?" },
    ],
  },
  {
    key: "research-environment",
    es: "Entorno de investigación",
    en: "Research environment",
    palabras: ["investigacion", "investigadores", "grupos de investigacion", "semilleros", "financiacion", "convocatoria", "minciencias", "proyectos de investigacion", "publicaciones"],
    metricas: [
      { id: "research_env.reputation", titulo: "Reputación en investigación", pregunta: "¿Qué tan reconocida es la investigación de la universidad entre sus pares?" },
      { id: "research_env.income", titulo: "Ingresos por investigación", pregunta: "¿Cuántos recursos atrae la universidad para investigar, por investigador?" },
      { id: "research_env.productivity", titulo: "Productividad investigativa", pregunta: "¿Cuántas publicaciones produce la universidad por investigador?" },
    ],
  },
  {
    key: "research-quality",
    es: "Calidad de la investigación",
    en: "Research quality",
    palabras: ["citaciones", "impacto cientifico", "articulos", "revistas", "scopus", "publicaciones", "excelencia investigativa", "indexadas"],
    metricas: [
      { id: "research_q.citation", titulo: "Impacto de citación", pregunta: "¿Cuánto citan otros investigadores los trabajos de la universidad?" },
      { id: "research_q.strength", titulo: "Fortaleza investigativa", pregunta: "¿Qué tan sólido es el impacto típico de la investigación de la universidad?" },
      { id: "research_q.excellence", titulo: "Excelencia investigativa", pregunta: "¿Qué parte de la investigación está entre la más citada del mundo?" },
      { id: "research_q.influence", titulo: "Influencia investigativa", pregunta: "¿Qué tan amplia es la influencia de la investigación en la ciencia?" },
    ],
  },
  {
    key: "industry",
    es: "Industria",
    en: "Industry",
    palabras: ["industria", "empresas", "empresa", "patente", "patentes", "transferencia", "innovacion", "spin off", "consultoria", "sector productivo"],
    metricas: [
      { id: "industry.income", titulo: "Ingresos de la industria", pregunta: "¿Cuántos recursos de la industria recibe la universidad por su conocimiento?" },
      { id: "industry.patents", titulo: "Patentes", pregunta: "¿Cuántas patentes citan la investigación de la universidad?" },
    ],
  },
  {
    key: "international",
    es: "Perspectiva internacional",
    en: "International outlook",
    palabras: ["internacional", "internacionalizacion", "movilidad", "intercambio", "extranjeros", "convenio internacional", "coautoria", "doble titulacion", "pasantia"],
    metricas: [
      { id: "intl.students", titulo: "Estudiantes internacionales", pregunta: "¿Qué parte de los estudiantes viene de otros países?" },
      { id: "intl.staff", titulo: "Profesores internacionales", pregunta: "¿Qué parte de los profesores viene de otros países?" },
      { id: "intl.collaboration", titulo: "Colaboración internacional", pregunta: "¿Qué parte de las publicaciones tiene coautores de otros países?" },
    ],
  },
];

/* ---------- UI GreenMetric: categorías -------------------------------------------- */

interface Categoria {
  key: string;
  es: string;
  en: string;
  palabras: string[];
}

/** Respaldo cuando el ciclo no existe; con ciclo, los nombres salen de ugm_categorias. */
export const CATEGORIAS_GREEN: Categoria[] = [
  { key: "SI", es: "Entorno e infraestructura", en: "Setting and infrastructure", palabras: ["campus", "zonas verdes", "infraestructura", "area verde", "arboles", "jardin", "bosque"] },
  { key: "EC", es: "Energía y cambio climático", en: "Energy and climate change", palabras: ["energia", "paneles solares", "energia solar", "eficiencia energetica", "emisiones", "huella de carbono", "cambio climatico", "electricidad"] },
  { key: "WS", es: "Residuos", en: "Waste", palabras: ["residuos", "reciclaje", "aprovechamiento", "separacion en la fuente", "compostaje", "plastico", "papel"] },
  { key: "WR", es: "Agua", en: "Water", palabras: ["agua", "ahorro de agua", "agua lluvia", "aguas residuales", "consumo de agua", "recurso hidrico"] },
  { key: "TR", es: "Transporte", en: "Transportation", palabras: ["transporte", "movilidad", "bicicleta", "bicicletas", "vehiculos", "parqueadero", "movilidad sostenible", "carro compartido"] },
  { key: "ED", es: "Educación e investigación", en: "Education and research", palabras: ["sostenibilidad", "educacion ambiental", "investigacion ambiental", "ambiental", "medio ambiente", "ods", "desarrollo sostenible"] },
  { key: "GD", es: "Gobernanza", en: "Governance", palabras: ["politica ambiental", "gobernanza", "plan de sostenibilidad", "gestion ambiental", "comite ambiental"] },
];

/* ---------- Consultas ----------------------------------------------------------------- */

/** La unidad del informe, o null si la clave no es válida para el ranking. */
export function unidadDe(ranking: Ranking, key: string): Unidad | null {
  if (ranking === "impact") {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1 || n > 17 || String(n) !== key.trim()) return null;
    return { ranking, key: String(n), nombre_es: `ODS ${n}: ${ODS_NOMBRES[n - 1] ?? ""}`, nombre_en: `SDG ${n}: ${ODS_EN[n - 1]}`, palabras: PALABRAS_ODS[n] ?? [] };
  }
  if (ranking === "world") {
    const p = PILARES_WORLD.find((x) => x.key === key);
    return p ? { ranking, key: p.key, nombre_es: p.es, nombre_en: p.en, palabras: p.palabras } : null;
  }
  const c = CATEGORIAS_GREEN.find((x) => x.key === key.toUpperCase());
  return c ? { ranking, key: c.key, nombre_es: c.es, nombre_en: c.en, palabras: c.palabras } : null;
}

/** El nombre del ranking para los prompts. */
export const NOMBRE_RANKING: Record<Ranking, { es: string; en: string }> = {
  impact: { es: "THE Impact Rankings", en: "THE Impact Rankings" },
  world: { es: "THE World University Rankings", en: "THE World University Rankings" },
  green: { es: "UI GreenMetric World University Rankings", en: "UI GreenMetric World University Rankings" },
};

/** Fila de ugm_preguntas que se usa como indicador. */
export interface PreguntaGreen {
  q: string;
  categoria: string;
  nombre_es: string;
  nombre_en: string;
}

/**
 * Los indicadores a los que puede responder un texto de esta unidad.
 * green: las preguntas del ciclo (si no hay ciclo, la categoría misma).
 */
export function indicadoresDe(u: Unidad, preguntasGreen: PreguntaGreen[] = []): IndicadorRanking[] {
  if (u.ranking === "impact") {
    return INDICADORES_THE.filter((i) => i.ods === Number(u.key) && i.tipo !== "inv").map((i) => ({ id: i.id, titulo: i.titulo, pregunta: i.pregunta }));
  }
  if (u.ranking === "world") return PILARES_WORLD.find((p) => p.key === u.key)?.metricas ?? [];
  const propias = preguntasGreen.filter((p) => p.categoria === u.key);
  if (!propias.length) return [{ id: u.key, titulo: u.nombre_es, pregunta: `Categoría ${u.key} de UI GreenMetric: ${u.nombre_es}.` }];
  return propias.map((p) => ({ id: p.q, titulo: p.nombre_es, pregunta: `${p.nombre_es} (${p.nombre_en})` }));
}

/** Las palabras clave que aparecen en el texto, como frases enteras y sin tildes. */
export function coincidencias(texto: string, palabras: string[]): string[] {
  const t = ` ${plano(texto)} `;
  return [...new Set(palabras.filter((p) => {
    const w = plano(p);
    return w.length > 0 && t.includes(` ${w} `);
  }))];
}

/** ¿El texto toca la unidad? Hace falta un mínimo de palabras distintas (el título cuenta doble). */
export function tocaUnidad(titulo: string, cuerpo: string, palabras: string[], minimo = 2): boolean {
  const enTitulo = coincidencias(titulo, palabras).length;
  const enCuerpo = coincidencias(cuerpo, palabras).length;
  return enTitulo * 2 + enCuerpo >= minimo;
}

/** El indicador más probable de un texto (por palabras del título y la pregunta), o null. */
export function indicadorProbable(texto: string, indicadores: IndicadorRanking[]): string | null {
  let mejor: { id: string; n: number } | null = null;
  const vacias = new Set(["de", "la", "el", "los", "las", "y", "en", "por", "para", "con", "que", "una", "un", "del", "al", "su", "sus", "se", "o", "a", "the", "of", "and"]);
  for (const i of indicadores) {
    const palabras = [...new Set(plano(`${i.titulo} ${i.pregunta}`).split(" ").filter((w) => w.length > 4 && !vacias.has(w)))];
    const n = coincidencias(texto, palabras).length;
    if (n > 0 && (!mejor || n > mejor.n)) mejor = { id: i.id, n };
  }
  return mejor?.id ?? null;
}
