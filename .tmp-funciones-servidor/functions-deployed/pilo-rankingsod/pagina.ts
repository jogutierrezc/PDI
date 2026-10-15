/* =============================================================================
   Informes ODS con Pilo · la página de evidencia para THE y el idioma.

   Lo comparten la intranet, el portal y la función `pilo-rankingsod`: este
   archivo no importa nada. La función usa una copia exacta en
   supabase/functions/pilo-rankingsod/pagina.ts (Deno no importa de src/); la
   prueba tests/noticias/pagina-evidencia.test.ts falla si se separan.

   Cómo lee THE (metodología 2027): un LLM califica cada evidencia como
   específica, genérica o irrelevante; ve solo el contenido visible de UNA
   página, no sigue enlaces, rechaza páginas con muchos enlaces, no abre
   adjuntos; una evidencia por indicador; año 2025; en inglés. Por eso la
   página va en este orden, sin un solo enlace:
     1. título con el código del indicador y la pregunta de THE;
     2. la respuesta directa (1–2 frases, con el nombre completo de la
        institución y el año);
     3. la ficha de hechos (quién, qué, cuándo, dónde, cuántos…);
     4. 2–4 frases literales de la nota.
   ========================================================================== */

export type Idioma = "es" | "en";

/** La ficha de hechos de una evidencia. En inglés; un campo que la nota no da queda vacío. */
export interface FichaEvidencia {
  indicator: string;
  /** La pregunta de THE para el indicador. */
  question: string;
  /** 1–2 frases que responden la pregunta directamente. */
  answer: string;
  /** La misma respuesta en español (el español siempre existe). */
  answer_es?: string;
  who: string;
  what: string;
  /** ISO («2025-03-20» o «2025-02-01/2025-03-31») o «12 November 2025». */
  when: string;
  where: string;
  /** Cifra y unidad («400 secondary school students»). */
  how_many: string;
  beneficiaries: string;
  partners: string;
  evidence_type: string;
  /** «Academic year 2025». */
  period: string;
}

export const INSTITUCION = "Universidad de Santander";

export const CAMPOS_FICHA: { k: keyof FichaEvidencia; en: string; es: string }[] = [
  { k: "who", en: "Who", es: "Quién" },
  { k: "what", en: "What", es: "Qué" },
  { k: "when", en: "When", es: "Cuándo" },
  { k: "where", en: "Where", es: "Dónde" },
  { k: "how_many", en: "How many", es: "Cuántos" },
  { k: "beneficiaries", en: "Beneficiaries", es: "Beneficiarios" },
  { k: "partners", en: "Partners", es: "Aliados" },
  { k: "evidence_type", en: "Type of evidence", es: "Tipo de evidencia" },
  { k: "period", en: "Period", es: "Periodo" },
];

const texto = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** Una ficha leída con cuidado (de la base o del modelo): todos los campos como texto. */
export function leerFicha(v: unknown): FichaEvidencia {
  const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const f: FichaEvidencia = {
    indicator: texto(o.indicator),
    question: texto(o.question),
    answer: texto(o.answer),
    who: texto(o.who),
    what: texto(o.what),
    when: texto(o.when),
    where: texto(o.where),
    how_many: texto(o.how_many),
    beneficiaries: texto(o.beneficiaries),
    partners: texto(o.partners),
    evidence_type: texto(o.evidence_type),
    period: texto(o.period),
  };
  const es = texto(o.answer_es);
  return es ? { ...f, answer_es: es } : f;
}

/** ¿Está completa la ficha para THE? Lo esencial: respuesta, quién, qué, cuándo y dónde. */
export function fichaCompleta(ficha: Partial<FichaEvidencia> | null | undefined): { completa: boolean; faltan: (keyof FichaEvidencia)[] } {
  const f = leerFicha(ficha);
  const esenciales: (keyof FichaEvidencia)[] = ["answer", "who", "what", "when", "where"];
  const faltan = esenciales.filter((k) => !f[k]);
  return { completa: faltan.length === 0, faltan };
}

/** El idioma en que se muestra: el pedido si es válido; si no, inglés (así se presentan los rankings). */
export function idiomaPreferido(pedido?: string | null, guardado?: string | null): Idioma {
  for (const v of [pedido, guardado]) {
    const t = String(v ?? "").toLowerCase().slice(0, 2);
    if (t === "es" || t === "en") return t;
  }
  return "en";
}

/** El texto de un párrafo en el idioma pedido; si falta el inglés, el español (que siempre existe). */
export function textoEnIdioma(b: { text: string; text_en?: string | null }, idioma: Idioma): { texto: string; idioma: Idioma } {
  if (idioma === "en" && texto(b.text_en)) return { texto: String(b.text_en), idioma: "en" };
  return { texto: b.text, idioma: "es" };
}

/** Partir en frases. */
const frasesDe = (t: string) =>
  String(t ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"\d])/)
    .map((s) => s.trim())
    .filter(Boolean);

export interface PaginaEvidencia {
  idioma: Idioma;
  titulo: string;
  respuesta: string;
  ficha: { k: keyof FichaEvidencia; etiqueta: string; v: string }[];
  frases: string[];
  /** Todo junto, en el orden de la página, como texto plano (lo que lee el LLM de THE). */
  texto: string;
}

/**
 * La página de evidencia en el orden que entiende el LLM de THE. En inglés:
 * pregunta de THE, respuesta, ficha y las frases en inglés (page_en). En
 * español: el título del indicador, la respuesta en español (si la hay), la
 * ficha con etiquetas en español y las frases literales de la nota (page_es).
 */
export function paginaEvidencia(
  ind: { id: string; titulo?: string; pregunta?: string },
  ficha: Partial<FichaEvidencia> | null | undefined,
  page_es: string[],
  page_en: string,
  idioma: Idioma,
): PaginaEvidencia {
  const f = leerFicha(ficha);
  const en = idioma === "en";
  const titulo = en ? `Indicator ${ind.id}${f.question || ind.pregunta ? ` — ${f.question || ind.pregunta}` : ""}` : `Indicador ${ind.id}${ind.titulo ? ` — ${ind.titulo}` : ""}`;
  const respuesta = en ? f.answer : f.answer_es ?? "";
  const filas = CAMPOS_FICHA.filter((c) => f[c.k]).map((c) => ({ k: c.k, etiqueta: en ? c.en : c.es, v: String(f[c.k]) }));
  const frases = en ? frasesDe(page_en).slice(0, 6) : page_es.map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const textoPlano = [titulo, respuesta, ...filas.map((r) => `${r.etiqueta}: ${r.v}`), ...frases].filter(Boolean).join("\n");
  return { idioma, titulo, respuesta, ficha: filas, frases, texto: textoPlano };
}

/* ---------- Reglas de la página (lo que haría rechazar o bajar la evidencia) ---- */

export const PROMOCIONAL_EN = /\b(?:outstanding|excellent|excellence|remarkable|amazing|incredible|world[- ]class|leading|prestigious|unique|exceptional|proud(?:ly)?|renowned|cutting[- ]edge|state[- ]of[- ]the[- ]art|unparalleled|best|great(?:est)?|wonderful|extraordinary)\b/i;
export const PROMOCIONAL_ES = /(?<![\p{L}])(?:destacad[oa]s?|excelente|excelencia|maravillos[oa]|increíble|prestigios[oa]|únic[oa]|excepcional|orgullos[oa]s?|líder(?:es)?|mejor(?:es)?|gran(?:des)?)(?![\p{L}])/iu;
const URL_O_ENLACE = /https?:\/\/|www\.|\b[\w-]+\.(?:edu|com|org|gov|net)(?:\.[a-z]{2})?\b|<a\s|\]\(|@[\w-]+\.[\w-]+/i;
const REMITE = /\b(?:see more|read more|more information|click|visit (?:our|the)|follow us|ver más|más información|haga clic|consulte|visite)\b/i;
const PRONOMBRE_VAGO = /^(?:this|it|they|these|those|he|she|we|our|esto|este|esta|ellos|ellas)\b/i;

/** Lo que una página de evidencia no debe tener. Lista vacía = cumple. */
export function reglasPagina(textoPagina: string, anio: number): string[] {
  const t = String(textoPagina ?? "");
  const out: string[] = [];
  const enlaces = t.match(new RegExp(URL_O_ENLACE.source, "gi")) ?? [];
  if (enlaces.length) out.push(enlaces.length > 1 ? `Tiene ${enlaces.length} enlaces o direcciones: THE rechaza páginas con enlaces.` : "Tiene un enlace o una dirección: THE no sigue enlaces; quítalo.");
  if (REMITE.test(t)) out.push("Remite a otra parte («ver más», «visite…»): el texto debe ser autocontenido.");
  if (PROMOCIONAL_EN.test(t)) out.push(`Lenguaje promocional («${t.match(PROMOCIONAL_EN)?.[0]}»): THE pide hechos.`);
  const lineas = t.split("\n").map((l) => l.trim()).filter(Boolean);
  // La respuesta es la segunda línea (la primera es el título): sus dos primeras frases.
  const primeras = frasesDe(lineas[1] ?? "").slice(0, 2).join(" ");
  if (!primeras.includes(INSTITUCION)) out.push(`Las dos primeras frases deben nombrar a la «${INSTITUCION}» completa.`);
  if (!primeras.includes(String(anio))) out.push(`Las dos primeras frases deben decir el año ${anio}.`);
  if (PRONOMBRE_VAGO.test(lineas[1] ?? "")) out.push("La respuesta empieza con un pronombre vago: nombra a la institución.");
  return out;
}
