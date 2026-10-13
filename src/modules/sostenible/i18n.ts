/* =============================================================================
   UDES Sostenible · español e inglés en el portal público de los rankings.

   «Es preferible en inglés para rankings, pero siempre en español»:
   · el portal abre en español; la página de evidencia para THE abre en
     inglés (idiomaPreferido de pagina.ts) con el español a un clic;
   · el idioma vive en `?lang=es|en` y se recuerda en localStorage
     (`sostenible:lang`); cada trozo lleva su atributo `lang`;
   · un contenido sin traducción se muestra en español con la marca «ES»,
     nunca vacío (MarcaEs en LangSwitch.tsx).

   Aquí: el diccionario tipado de la interfaz estática (cada clave tiene es y
   en: lo vigila i18n.test.ts), los nombres y frases de los 17 ODS en inglés,
   y las fechas y números con Intl según el idioma. Sin React salvo useLang.
   ========================================================================== */

import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type Lang = "es" | "en";
export const LANGS: Lang[] = ["es", "en"];
export const LANG_KEY = "sostenible:lang";

/* ---------- Diccionario ---------------------------------------------------------- */

const D = {
  /* Marco y barra del portal */
  idioma: { es: "Idioma", en: "Language" },
  idioma_es: { es: "Español", en: "Spanish" },
  idioma_en: { es: "Inglés", en: "English" },
  texto_en_es: { es: "Texto en español", en: "Text in Spanish (no English version yet)" },
  nav_portal: { es: "UDES Sostenible", en: "UDES Sustainability" },
  nav_inicio: { es: "Inicio", en: "Home" },
  nav_indicadores: { es: "Indicadores", en: "Indicators" },
  nav_informes: { es: "Informes", en: "Reports" },
  saltar_intro: { es: "Saltar intro", en: "Skip intro" },
  tab_portal: { es: "Los 17 informes", en: "The 17 reports" },
  tab_rector: { es: "Presentación rectoral", en: "Rector's foreword" },
  tab_boletin: { es: "Boletín PDF", en: "PDF bulletin" },
  informes_ods: { es: "Informes ODS", en: "SDG reports" },

  /* Portal de los 17 informes */
  portal_t1: { es: "17 objetivos,", en: "17 goals," },
  portal_t2: { es: "una sola UDES.", en: "one UDES." },
  portal_lede: {
    es: "Los informes con los que la Universidad de Santander rinde cuentas de su aporte a los Objetivos de Desarrollo Sostenible en THE Impact Rankings {e}: uno por objetivo, cada uno con sus cifras y sus evidencias.",
    en: "The reports in which Universidad de Santander accounts for its contribution to the Sustainable Development Goals in THE Impact Rankings {e}: one per goal, each with its figures and evidence.",
  },
  leer_rector: { es: "Leer la presentación rectoral", en: "Read the Rector's foreword" },
  informes_publicados: { es: "informes de la edición 2025 publicados", en: "reports of the 2025 edition published" },
  evidencias_verificadas_2026: { es: "evidencias 2026 verificadas", en: "2026 evidence items verified" },
  ods_listos: { es: "ODS listos para revisión", en: "SDGs ready for review" },
  ods_a_the: { es: "ODS que se envían a THE", en: "SDGs submitted to THE" },
  dato_ilustrativo: { es: "Dato ilustrativo", en: "Illustrative data" },
  edicion: { es: "Edición", en: "Edition" },
  edicion_n: { es: "Edición {e}", en: "{e} edition" },
  filtrar_informes: { es: "Filtrar informes", en: "Filter reports" },
  filtro_todos: { es: "Todos", en: "All" },
  filtro_the: { es: "Para THE", en: "For THE" },
  buscar_ods: { es: "Buscar un ODS", en: "Search an SDG" },
  informes_17: { es: "Los 17 informes", en: "The 17 reports" },
  informes_1: { es: "1 informe", en: "1 report" },
  informes_n: { es: "{n} informes", en: "{n} reports" },
  ninguno_coincide: { es: "Ningún informe coincide con la búsqueda.", en: "No report matches your search." },
  pie_portal: { es: "La selección de THE y las cifras de los ODS distintos del 4 y el 13 son de muestra.", en: "The THE selection and the figures of SDGs other than 4 and 13 are samples." },
  informe_2025_publicado: { es: "Informe 2025 publicado", en: "2025 report published" },
  informe_e: { es: "Informe {e}", en: "{e} report" },
  noticias_1: { es: "1 noticia", en: "1 news story" },
  noticias_n: { es: "{n} noticias", en: "{n} news stories" },
  leer_informe_e: { es: "Leer el informe {e}", en: "Read the {e} report" },
  incluir_boletin: { es: "Incluir en el boletín", en: "Include in the bulletin" },
  evidencias_de: { es: "{ok} de {total} evidencias", en: "{ok} of {total} evidence items" },
  evidencias_pct: { es: "{p} % de evidencias verificadas", en: "{p}% of evidence verified" },

  /* Informe de un ODS */
  sdg_n: { es: "ODS {n}", en: "SDG {n}" },
  sdg_titulo: { es: "ODS {n}: {name}", en: "SDG {n}: {name}" },
  informe_ods_e: { es: "Informe ODS {n} · {e}", en: "SDG {n} report · {e}" },
  volver_17: { es: "Volver a los 17 informes", en: "Back to the 17 reports" },
  boletin_pdf: { es: "Boletín (PDF)", en: "Bulletin (PDF)" },
  ilustracion_ods: { es: "Ilustración del ODS {n}", en: "SDG {n} illustration" },
  secciones_informe: { es: "Secciones del informe", en: "Report sections" },
  sec_cifras: { es: "Cifras", en: "Figures" },
  sec_ruta: { es: "Ruta", en: "Timeline" },
  sec_resumen: { es: "Resumen", en: "Summary" },
  sec_evidencias: { es: "Evidencias", en: "Evidence" },
  sec_hidrogeno: { es: "Hidrógeno", en: "Hydrogen" },
  sec_avance: { es: "Avance", en: "Progress" },
  sec_viene: { es: "Lo que viene", en: "What comes next" },
  sec_relato: { es: "Qué hicimos", en: "What we did" },
  sec_proyectos: { es: "Proyectos", en: "Projects" },
  sec_registro: { es: "Registro", en: "Activity log" },
  meta_ranking: { es: "Ranking", en: "Ranking" },
  meta_periodo: { es: "Periodo", en: "Period" },
  meta_anterior: { es: "Edición anterior", en: "Previous edition" },
  meta_responsable: { es: "Responsable", en: "Owner" },
  meta_estado: { es: "Estado", en: "Status" },
  oficina_planeacion: { es: "Oficina de Planeación", en: "Planning Office" },
  estado_publicado: { es: "Publicado", en: "Published" },
  estado_borrador: { es: "Borrador para revisión", en: "Draft for review" },
  actividad_mensual: { es: "Actividad mensual del ODS, 2025–2026", en: "Monthly SDG activity, 2025–2026" },
  publicado_2025: { es: "Informe publicado de la edición 2025.", en: "Published report of the 2025 edition." },
  publicado_2025_p: {
    es: "Muestra las cifras y la ruta tal como se enviaron; la comparación con el nuevo periodo está en la edición 2026.",
    en: "It shows the figures and roadmap as submitted; the comparison with the new period lives in the 2026 edition.",
  },
  ver_2026: { es: "Ver la edición 2026", en: "See the 2026 edition" },
  ya_puede: { es: "Lo que la UDES ya puede mostrar.", en: "What UDES can already show." },
  cifras_2025_detalle: { es: "Cifras de la edición 2025. El detalle por indicador se carga desde el editor de informes.", en: "Figures from the 2025 edition. The detail by indicator is loaded from the report editor." },
  evidencias_n: { es: "{ok} de {total} evidencias verificadas.", en: "{ok} of {total} evidence items verified." },
  preve: { es: "La UDES prevé {x}", en: "UDES plans to {x}" },
  otros_informes: { es: "Otros informes ODS", en: "Other SDG reports" },
  ods_anterior: { es: "ODS anterior", en: "Previous SDG" },
  ods_siguiente: { es: "ODS siguiente", en: "Next SDG" },
  pie_informe: { es: "Informe ODS {n} · Universidad de Santander · Oficina de Planeación", en: "SDG {n} report · Universidad de Santander · Planning Office" },
  pie_cifras: {
    es: "Las cifras de 2025 provienen del informe publicado. Las marcadas como ilustrativas se reemplazan por los datos oficiales antes de enviarlas.",
    en: "2025 figures come from the published report. Those marked illustrative are replaced with official data before submission.",
  },

  /* Cuerpo redactado con Pilo */
  tesis_cifras: { es: "Tesis y cifras", en: "Thesis and figures" },
  hicimos_en: { es: "Lo que hicimos en {e}", en: "What we did in {e}" },
  proyectos_t: { es: "Proyectos que lo hacen posible", en: "Projects that make it possible" },
  hacia_proxima: { es: "Hacia la próxima edición", en: "Towards the next edition" },
  fuente: { es: "Fuente", en: "Source" },
  foto: { es: "Foto", en: "Photo" },
  fuente_n: { es: "Fuente {n}: la nota en el carrusel de noticias", en: "Source {n}: the news story in the carousel" },

  /* Registro de actividades */
  registro_t: { es: "Registro de actividades", en: "Activity log" },
  registro_p: { es: "Todas las notas de {e} sobre este ODS, de la más antigua a la más reciente.", en: "Every {e} news story on this SDG, from oldest to newest." },
  col_fecha: { es: "Fecha", en: "Date" },
  col_sede: { es: "Sede", en: "Campus" },
  col_actividad: { es: "Actividad", en: "Activity" },
  col_cifra: { es: "Cifra", en: "Figure" },
  en_relato: { es: "En el relato", en: "In the narrative" },
  ver_en_carrusel: { es: "Ver en el carrusel de noticias", en: "See it in the news carousel" },

  /* Carrusel */
  noticias_t: { es: "La UDES en las noticias", en: "UDES in the news" },
  notas_1: { es: "1 nota de 2025 sobre este ODS, publicada en udes.edu.co.", en: "1 news story from 2025 on this SDG, published on udes.edu.co." },
  notas_n: { es: "{n} notas de 2025 sobre este ODS, publicadas en udes.edu.co.", en: "{n} news stories from 2025 on this SDG, published on udes.edu.co." },
  noticias_anteriores: { es: "Noticias anteriores", en: "Previous stories" },
  noticias_siguientes: { es: "Noticias siguientes", en: "Next stories" },
  rango_de: { es: "{a}–{b} de {n}", en: "{a}–{b} of {n}" },
  uno_de: { es: "{a} de {n}", en: "{a} of {n}" },
  carrusel_label: { es: "Noticias del ODS; usa las flechas del teclado para avanzar", en: "SDG news; use the arrow keys to move" },
  carrusel: { es: "carrusel", en: "carousel" },
  leer_nota: { es: "Leer la nota en udes.edu.co", en: "Read the story on udes.edu.co" },
  otra_pestana: { es: "(se abre en otra pestaña)", en: "(opens in a new tab)" },
  ver_mas: { es: "Ver {n} más", en: "Show {n} more" },

  /* Página de evidencia */
  ev_kick: { es: "Evidencia · Indicador {i}", en: "Evidence · Indicator {i}" },
  ev_respuesta: { es: "Respuesta", en: "Answer" },
  ev_hechos: { es: "Datos clave", en: "Key facts" },
  ev_frases: { es: "Lo que dice la nota", en: "From the news story" },
  ev_nota: { es: "Nota de origen", en: "Source story" },
  ev_fuente: { es: "Fuente original", en: "Original source" },
  ev_foto: { es: "Fotografía de la actividad: {t}", en: "Photograph of the activity: {t}" },
  ev_cargando: { es: "Cargando la evidencia…", en: "Loading the evidence…" },
  ev_error: { es: "No se pudo cargar la evidencia. Vuelve a intentarlo en un momento.", en: "The evidence could not be loaded. Please try again in a moment." },
  ev_no_existe: { es: "Esta página de evidencia no existe o todavía no está aprobada.", en: "This evidence page does not exist or has not been approved yet." },
  ev_title: { es: "Evidencia {i} · {t} · Universidad de Santander", en: "Evidence {i} · {t} · Universidad de Santander" },
  ev_title_vacio: { es: "Evidencia · Indicador {i} · ODS {n} · Universidad de Santander", en: "Evidence · Indicator {i} · SDG {n} · Universidad de Santander" },

  /* Presentación rectoral y boletín */
  rector_foto_pendiente: { es: "Fotografía del Rector pendiente", en: "Rector's photograph pending" },
  rector_foto_aqui: { es: "Aquí va la fotografía oficial del Rector", en: "The Rector's official photograph goes here" },
  rector_meta: { es: "Presentación rectoral · THE Impact Rankings {e}", en: "Rector's foreword · THE Impact Rankings {e}" },
  informes_ods_n: { es: "informes ODS", en: "SDG reports" },
  ods_para_the: { es: "ODS para THE", en: "SDGs for THE" },
  edicion_vigente: { es: "edición vigente", en: "current edition" },
  ver_17: { es: "Ver los 17 informes", en: "See the 17 reports" },
  texto_ejemplo: { es: "Texto de ejemplo", en: "Sample text" },
  rector_editado: { es: "Este texto se editó en el generador del boletín y solo se ve en este navegador.", en: "This text was edited in the bulletin generator and is only visible in this browser." },
  rector_nota: {
    es: "La presentación la redacta y aprueba la Rectoría. El mismo texto se usa en esta página, en el portal y en la segunda página del boletín. Se edita en la vista",
    en: "The foreword is written and approved by the Rector's Office. The same text is used on this page, on the portal and on the second page of the bulletin. It is edited in the view",
  },
  boletin_title: { es: "Boletín de informes ODS", en: "SDG reports bulletin" },
  descargar_boletin: { es: "Descargar boletín (PDF)", en: "Download bulletin (PDF)" },
  verificando: { es: "Verificando tu sesión…", en: "Checking your session…" },
  boletin_equipo_t: { es: "El generador del boletín es para el equipo de Planeación", en: "The bulletin generator is for the Planning team" },
  boletin_equipo_p: {
    es: "Si ya hay una edición publicada, puedes descargarla en PDF. Si eres parte del equipo, ingresa a la intranet para generar y emitir ediciones.",
    en: "If an edition has been published, you can download it as a PDF. If you are part of the team, sign in to the intranet to generate and issue editions.",
  },
  ingresar_intranet: { es: "Ingresar a la intranet", en: "Sign in to the intranet" },
  generador_es: { es: "El generador del boletín es una herramienta interna en español.", en: "The bulletin generator is an internal tool, available in Spanish." },
  contenido_es: { es: "Contenido en español", en: "This content is only available in Spanish." },
} as const satisfies Record<string, { es: string; en: string }>;

export type Clave = keyof typeof D;
export const DICCIONARIO: Record<Clave, { es: string; en: string }> = D;

/** El texto de una clave en un idioma, con {variables}. */
export function tr(lang: Lang, k: Clave, vars?: Record<string, string | number>): string {
  let s: string = D[k][lang] || D[k].es;
  if (vars) for (const [v, x] of Object.entries(vars)) s = s.split(`{${v}}`).join(String(x));
  return s;
}

/* ---------- Los 17 ODS en inglés ------------------------------------------------ */

/** Nombres oficiales de la ONU. */
export const ODS_NOMBRE_EN = [
  "No poverty",
  "Zero hunger",
  "Good health and well-being",
  "Quality education",
  "Gender equality",
  "Clean water and sanitation",
  "Affordable and clean energy",
  "Decent work and economic growth",
  "Industry, innovation and infrastructure",
  "Reduced inequalities",
  "Sustainable cities and communities",
  "Responsible consumption and production",
  "Climate action",
  "Life below water",
  "Life on land",
  "Peace, justice and strong institutions",
  "Partnerships for the goals",
];

/** La tesis de cada ODS (ods-data.ts) en inglés. */
export const ODS_TESIS_EN = [
  "UDES tackles poverty through education, inclusion and social outreach programmes.",
  "A knowledge ecosystem that connects research, the countryside and communities against hunger.",
  "Health training, care and outreach for healthy lives in the region.",
  "UDES trains teachers and opens the university to those who are the first in their family to get there.",
  "Verifiable evidence of gender equality in teaching, research and university life.",
  "Rational water use on campus and applied knowledge for sanitation.",
  "Research in renewable energy and efficiency that brings clean energy closer to the region.",
  "Entrepreneurship, employability and decent work: from the classroom to the labour market.",
  "Laboratories, innovation and infrastructure that build a culture of curiosity.",
  "Inclusion and the reduction of inequalities are the cross-cutting axis of the university's mission.",
  "Direct work with urban communities and culture for sustainable cities.",
  "Circular economy and waste recovery on campus and in the region.",
  "Carbon neutrality, green hydrogen and a community that changes its habits.",
  "Conservation of water and aquatic ecosystems through UDES Verde.",
  "Protection of biodiversity and of the region's strategic ecosystems.",
  "Research and outreach that build peace, justice and strong institutions.",
  "National and international partnerships that multiply UDES's impact.",
];

/** «La UDES prevé…» de cada ODS, en inglés (sigue a «UDES plans to»). */
export const ODS_VIENE_EN = [
  "measure the effect of student support on retention.",
  "extend the vegetable gardens to every campus.",
  "link more health programmes to social outreach.",
  "keep reducing access barriers for first-generation students.",
  "publish the pay gap and the gap in senior positions.",
  "install meters on the remaining campuses.",
  "raise low-emission energy to 16%.",
  "connect the job board with more partner companies.",
  "open a lab for the community.",
  "extend reasonable accommodations to every programme.",
  "measure the impact of outreach in each neighbourhood.",
  "reach zero waste to landfill on one campus.",
  "publish the energy transition plan and energy data by source.",
  "link the research groups to the Río de Oro basin.",
  "complete the fauna inventory of the campuses.",
  "publish the annual transparency report.",
  "add partnerships with cities and companies in the region.",
];

/** Unidad y texto de las dos cifras de cada ODS (ods-data.ts), en inglés. */
export const ODS_CIFRAS_EN: [string, string][][] = [
  [["people", "served by inclusion programmes"], ["grants", "to students in vulnerable situations"]],
  [["projects", "on food security with communities"], ["families", "supported in gardens and training"]],
  [["patients", "seen in health programmes"], ["brigades", "in rural areas"]],
  [["people", "benefiting from Social Outreach"], ["of graduates", "qualified to teach"]],
  [["of students", "in postgraduate programmes are women"], ["protocols", "to prevent violence"]],
  [["less water", "used per person than in 2024"], ["campuses", "with metering by sector"]],
  [["of consumption", "from clean sources"], ["projects", "of research on renewables"]],
  [["of graduates", "employed a year after graduating"], ["entrepreneurs", "at the Yo Emprendo fair"]],
  [["projects", "of innovation under way"], ["groups", "of active research"]],
  [["students", "with reasonable accommodations"], ["scholarships", "for merit and social condition"]],
  [["neighbourhoods", "with outreach work"], ["languages", "in intercultural courses"]],
  [["kg", "of waste recovered"], ["young people", "trained in circular economy"]],
  [["kg of CO₂", "avoided on a single car-free day"], ["institutions", "connected through the WEC Colombia affiliation"]],
  [["issues", "of the UDES Verde magazine"], ["days", "of river-basin clean-ups"]],
  [["species", "recorded on campus"], ["hectares", "under conservation"]],
  [["people", "served by the legal aid clinic"], ["cases", "of conciliation"]],
  [["agreements", "in force with partners"], ["countries", "with joint projects"]],
];

/** El nombre de un ODS en el idioma pedido. */
export const nombreOds = (o: { n: number; name: string }, lang: Lang) => (lang === "en" ? ODS_NOMBRE_EN[o.n - 1] ?? o.name : o.name);
/** La tesis estática de un ODS en el idioma pedido. */
export const tesisOds = (o: { n: number; thesis: string }, lang: Lang) => (lang === "en" ? ODS_TESIS_EN[o.n - 1] ?? o.thesis : o.thesis);

/* ---------- Fechas y números ----------------------------------------------------- */

const LOCALE: Record<Lang, string> = { es: "es-CO", en: "en-GB" };

/** «2025-03-14» → «14 mar 2025» / «14 Mar 2025». Sin desfases de zona horaria. */
export function fechaCorta(d: string | null | undefined, lang: Lang): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return d ?? "";
  const f = new Date(`${d.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat(LOCALE[lang], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(f).replace(/\./g, "").replace(/ de /g, " ");
}

/** «2025-03-14» → «14 de marzo de 2025» / «14 March 2025». */
export function fechaLarga(d: string | null | undefined, lang: Lang): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return d ?? "";
  const f = new Date(`${d.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat(LOCALE[lang], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(f);
}

/* ---------- El idioma de la página -------------------------------------------------- */

/** El idioma pedido en la dirección, el guardado o el de partida. */
export function leerLang(pedido: string | null | undefined, guardado: string | null | undefined, base: Lang): Lang {
  for (const v of [pedido, guardado]) {
    const t = String(v ?? "").toLowerCase().slice(0, 2);
    if (t === "es" || t === "en") return t;
  }
  return base;
}

const leerGuardado = () => {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
};

/**
 * El idioma del portal: `?lang=` manda, luego lo recordado y, si no, `base`
 * (español en el portal; inglés en la página de evidencia, que no usa lo
 * recordado: `recordar: false`). Pone `<html lang>` mientras la página vive.
 */
export function useLang({ base = "es", recordar = true }: { base?: Lang; recordar?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const pedido = params.get("lang");
  const lang = leerLang(pedido, recordar ? leerGuardado() : null, base);

  useEffect(() => {
    const html = document.documentElement;
    const antes = html.getAttribute("lang");
    html.setAttribute("lang", lang);
    return () => {
      if (antes) html.setAttribute("lang", antes);
    };
  }, [lang]);

  const setLang = useCallback(
    (l: Lang) => {
      try {
        if (recordar) localStorage.setItem(LANG_KEY, l);
      } catch {
        /* sin almacenamiento: queda en la dirección */
      }
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set("lang", l);
          return next;
        },
        { replace: true },
      );
    },
    [recordar, setParams],
  );

  return useMemo(
    () => ({
      lang,
      setLang,
      t: (k: Clave, vars?: Record<string, string | number>) => tr(lang, k, vars),
      fecha: (d: string | null | undefined) => fechaCorta(d, lang),
    }),
    [lang, setLang],
  );
}

/** Conserva `?lang=` al enlazar dentro del portal. */
export function conLang(to: string, lang: Lang): string {
  if (lang === "es") return to;
  const [path, hash = ""] = to.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}lang=en${hash ? `#${hash}` : ""}`;
}
