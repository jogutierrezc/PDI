/* =============================================================================
   UI GreenMetric · página pública · textos de la interfaz (ES | EN) y aspecto de
   las siete categorías.

   Solo la interfaz estática: los contenidos (narrativas, nombres de indicadores)
   llegan de las lecturas públicas ya en el idioma pedido, y un contenido sin
   traducción revisada NO llega en inglés (lo decide la base, 0212). El inglés de
   esta interfaz y de las siete frases de categoría está redactado para la página.
   ========================================================================== */

import type { CategoriaId } from "../lib/tipos";

export type Lang = "es" | "en";

const D = {
  portada_t1: { es: "Sostenibilidad del campus", en: "Campus sustainability" },
  portada_lede: {
    es: "Lo que la Universidad de Santander reporta al UI GreenMetric Sustainable University Rankings: programas, políticas, cifras y la evidencia que las respalda, en siete categorías.",
    en: "What Universidad de Santander reports to the UI GreenMetric Sustainable University Rankings: programs, policies, figures and the evidence behind them, in seven categories.",
  },
  regla: {
    es: "Aquí solo se publica lo aprobado, traducido y con evidencia. Los borradores, los comentarios internos y los nombres de las personas nunca salen de la intranet.",
    en: "Only approved, translated and documented data is published here. Drafts, internal comments and people’s names never leave the intranet.",
  },
  regla_t: { es: "Regla de publicación", en: "Publication rule" },
  publicados: { es: "indicadores publicados", en: "indicators published" },
  viz: { es: "gráficas y tablas con datos de la universidad", en: "charts and tables from the university’s data" },
  viz_corto: { es: "gráficas y tablas", en: "charts and tables" },
  evid: { es: "documentos de evidencia públicos", en: "public evidence documents" },
  actualizacion: { es: "última actualización", en: "last update" },
  edicion: { es: "Edición", en: "Edition" },
  edicion_n: { es: "Edición {e}", en: "{e} edition" },
  filtrar: { es: "Filtrar", en: "Filter" },
  todas: { es: "Todas", en: "All" },
  con_datos: { es: "Con datos publicados", en: "With published data" },
  buscar: { es: "Buscar una categoría", en: "Search a category" },
  categorias: { es: "Categorías", en: "Categories" },
  n_de_m: { es: "{n} de {m} indicadores publicados", en: "{n} of {m} indicators published" },
  nota_regleta: {
    es: "Cada cuadro es un indicador: se llena cuando la universidad lo publica. Las cifras son las que reporta la universidad; UI GreenMetric hace su propia evaluación.",
    en: "Each square is one indicator: it fills in when the university publishes it. Figures are those reported by the university; UI GreenMetric carries out its own assessment.",
  },
  leer_informe: { es: "Leer el informe", en: "Read the report" },
  ninguna: { es: "Ninguna categoría coincide", en: "No category matches" },
  nada_t: { es: "Todavía no hay nada publicado", en: "Nothing is published yet" },
  nada_x: {
    es: "Los indicadores aparecen aquí a medida que la universidad los aprueba y los publica. Vuelva pronto.",
    en: "Indicators appear here as the university approves and publishes them. Check back soon.",
  },
  cargando: { es: "Cargando…", en: "Loading…" },
  error_t: { es: "No se pudo cargar la información", en: "The information could not be loaded" },
  error_x: { es: "Vuelva a intentarlo en un momento.", en: "Please try again in a moment." },
  volver_sos: { es: "UDES Sostenible", en: "UDES Sustainability" },
  todas_cat: { es: "Todas las categorías", en: "All categories" },
  otras_cat: { es: "Otras categorías", en: "Other categories" },
  indicadores_pub: { es: "Indicadores publicados", en: "Published indicators" },
  calculado: { es: "calculado", en: "calculated" },
  calculado_x: { es: "Calculado solo a partir de datos publicados.", en: "Calculated only from published data." },
  prog: { es: "Programas e iniciativas", en: "Programs and initiatives" },
  cat_vacia_t: { es: "Esta categoría todavía no tiene nada publicado", en: "Nothing is published in this category yet" },
  cat_vacia_x: { es: "Los indicadores aparecen cuando la universidad los aprueba y los publica.", en: "Indicators appear when the university approves and publishes them." },
  en_prep: { es: "{n} en preparación", en: "{n} still being prepared" },
  todo_pub: { es: "Todo lo de esta categoría está publicado", en: "Everything in this category is published" },
  datos_de: { es: "Datos de {a}", en: "Data for {a}" },
  datos_ant: { es: "Datos de {a} (año anterior)", en: "Data for {a} (previous year)" },
  datos_rango: { es: "Datos de {a} a {b}", en: "Data for {a} to {b}" },
  fuente_ds: { es: "Fuente: Datos de Sostenibilidad · actualizado {f}", en: "Source: Sustainability Data · updated {f}" },
  evidencias: { es: "Evidencia", en: "Evidence" },
  sin_evid: {
    es: "La evidencia la conserva la universidad y se entrega a UI GreenMetric en su revisión.",
    en: "The university keeps the evidence and delivers it to UI GreenMetric during its review.",
  },
  abrir_hoja: { es: "Abrir la página de evidencia", en: "Open the evidence page" },
  nota_textos: {
    es: "Los textos son la versión revisada por una persona. El inglés es la traducción revisada; el español original está en el conmutador de idioma.",
    en: "Texts shown here are the reviewed English translation. The Spanish original is available with the language switch.",
  },
  ev_kick: { es: "Evidencia · indicador {i}", en: "Evidence · indicator {i}" },
  ev_hechos: { es: "Hechos clave", en: "Key facts" },
  ev_desc: { es: "Descripción", en: "Description" },
  ev_soporte: { es: "Evidencia de soporte", en: "Supporting evidence" },
  ev_pregunta: { es: "Pregunta de la guía", en: "Guideline question" },
  ev_cifra: { es: "Cifra reportada", en: "Reported value" },
  ev_periodo: { es: "Periodo de referencia", en: "Reference period" },
  ev_docs: { es: "Documentos de evidencia públicos", en: "Public evidence documents" },
  ev_fuente: { es: "Fuente: Universidad de Santander, datos institucionales aprobados el {f}", en: "Source: Universidad de Santander, institutional data approved on {f}" },
  ev_no_es: { es: "Esta página de evidencia no está disponible. El indicador no está publicado.", en: "This evidence page is not available. The indicator is not published." },
  ev_no_en: { es: "Este indicador aún no tiene versión revisada en inglés.", en: "This indicator does not have a reviewed English version yet." },
  ver_es: { es: "Ver en español", en: "View in Spanish" },
  periodo_12: { es: "12 meses, {a}", en: "12 months, {a}" },
  periodo_12_ant: { es: "12 meses, {a} (año anterior)", en: "12 months, {a} (previous year)" },
  periodo_3: { es: "Tres años, {a} a {b}", en: "Three years, {a} to {b}" },
  actualizado_en: { es: "Actualizado {f}", en: "Updated {f}" },
  cambio_pub: { es: "Se actualizó la información publicada.", en: "The published information was updated." },
  tarjeta_n: { es: "{n} indicadores publicados", en: "{n} indicators published" },
  tarjeta_ir: { es: "Ver lo publicado", en: "See what is published" },
  tabla_aria: { es: "Tabla: {t}", en: "Table: {t}" },
  doc_tipo: { es: "Documento", en: "Document" },
  enlace_tipo: { es: "Enlace público", en: "Public link" },
} as const;

export type ClaveU = keyof typeof D;

export function tx(lang: Lang, k: ClaveU, vars?: Record<string, string | number>): string {
  let s: string = D[k][lang] || D[k].es;
  if (vars) for (const [v, x] of Object.entries(vars)) s = s.split(`{${v}}`).join(String(x));
  return s;
}

/** Aspecto de cada categoría: color de campo, tinta con contraste ≥ 4,5:1, tamaño del cartel y su frase. */
export const CAT_VISUAL: Record<CategoriaId, { bg: string; on: string; size: "s" | "w" | "xl"; es: string; en: string }> = {
  SI: { bg: "#2b5c30", on: "#ffffff", size: "w", es: "El contexto físico del campus: espacios abiertos, vegetación, accesibilidad, seguridad, salud y conservación.", en: "The campus setting: open space, vegetation, accessibility, safety, health and conservation." },
  EC: { bg: "#f2b705", on: "#0d1828", size: "xl", es: "Uso de la energía y acción climática: aparatos eficientes, edificios inteligentes, energías renovables y huella de carbono.", en: "Energy use and climate action: efficient appliances, smart buildings, renewable energy and carbon footprint." },
  WS: { bg: "#7a3e1d", on: "#ffffff", size: "w", es: "Prevenir, reciclar y tratar los residuos y las aguas residuales del campus.", en: "Preventing, recycling and treating campus waste and wastewater." },
  WR: { bg: "#0b6fa4", on: "#ffffff", size: "s", es: "Conservar, reciclar y proteger el agua, y dejar que el campus la absorba.", en: "Conserving, recycling and protecting water, and letting the campus absorb it." },
  TR: { bg: "#014898", on: "#ffffff", size: "w", es: "Movilidad de bajas emisiones: menos vehículos privados, buses internos, vehículos de cero emisiones y senderos peatonales.", en: "Low-emission mobility: fewer private vehicles, campus shuttles, zero-emission vehicles and pedestrian paths." },
  ED: { bg: "#b3342a", on: "#ffffff", size: "s", es: "Cursos, investigación, eventos, servicio a la comunidad y empleos verdes.", en: "Courses, research, events, community service and green jobs." },
  GD: { bg: "#4a3a8a", on: "#ffffff", size: "s", es: "Gobernanza, transparencia y digitalización al servicio de la sostenibilidad.", en: "Governance, transparency and digitalization in support of sustainability." },
};

/** Iconos de trazo (24×24), uno por categoría. */
export const CAT_ICONO: Record<CategoriaId, string> = {
  SI: "M12 21V11m0 0c0-4 3-7 8-7 0 5-3 8-8 7Zm0 3c0-3-2-5-6-5 0 4 2 6 6 5Z",
  EC: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  WS: "M5 7h14M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6",
  WR: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z",
  TR: "M4 6h16v10H4zM4 11h16M7 19v-3m10 3v-3M7 14h.01M17 14h.01",
  ED: "m2 9 10-5 10 5-10 5-10-5Zm4 3v5c3 2 9 2 12 0v-5",
  GD: "M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Zm-3 9 2 2 4-4",
};
