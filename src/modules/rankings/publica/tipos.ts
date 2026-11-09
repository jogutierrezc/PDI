/* =============================================================================
   Pilo Publica · tipos y catálogo (migración 0262).

   Un informe por ranking, unidad y edición. Los bloques kpi y gráfico no llevan
   números: citan claves del libro de cifras (pp_cifras) y la pantalla resuelve
   el valor. Una cifra que falta se avisa; nunca se inventa.
   ========================================================================== */

import { SDG } from "../../sostenible/data";
import { odsOn } from "../../sostenible/OdsArt";

export type RankingPP = "impact" | "world" | "green";
export type Idioma = "es" | "en";
export type EstadoInforme = "borrador" | "revision" | "publicado";
export type Movimiento = "editorial" | "subtle" | "none";
/**
 * bar · line · donut          los básicos.
 * compare                     «antes y ahora»: los años de una medida con su variación (evolución histórica de UDES en Cifras).
 * stack                       composición: las partes de un total en una barra al 100 % (desglose de UDES en Cifras).
 * heat                        mapa de calor: medidas × años (el mapa de calor de UDES en Cifras).
 */
export type TipoGrafico = "bar" | "line" | "donut" | "compare" | "stack" | "heat";
export type KindBloque = "kpi" | "grafico" | "texto" | "imagen";
export type OrigenBloque = "pilo" | "persona" | "editado";
export type KindFuente = "noticia" | "indicador" | "libro" | "documento" | "cifras";
export type SeccionVista = "kpis" | "graficos" | "ejes" | "noticias";

export interface AjustesPP {
  tone: string;
  person: string;
  cover: "right" | "left";
  cols: 1 | 2;
  motion: Movimiento;
  /** Orden de las secciones del informe (portada siempre primero). */
  order?: SeccionVista[];
  /** Secciones ocultas. */
  off?: SeccionVista[];
}

export const AJUSTES_BASE: AjustesPP = { tone: "cercano", person: "nosotros", cover: "right", cols: 1, motion: "editorial" };
export const ORDEN_BASE: SeccionVista[] = ["kpis", "graficos", "ejes", "noticias"];

export interface InformePP {
  id: string;
  ranking: RankingPP;
  unit_key: string;
  edition: number;
  state: EstadoInforme;
  settings: Partial<AjustesPP>;
  title_es: string;
  title_en: string;
  lead_es: string;
  lead_en: string;
  published_at: string | null;
  updated_at: string;
}

export interface FuentePP {
  id: string;
  informe_id: string;
  kind: KindFuente;
  ref: string;
  label: string;
  include: boolean;
  meta: Record<string, unknown>;
}

/** Lo que el público ve de una cifra. */
export interface CifraPub {
  key: string;
  label: string;
  label_en: string;
  unit: string;
  year: number | null;
  value: number | null;
  /** Procedencia (descripcion, tabla, oficina…). La función pública aún no la entrega: si algún día llega, se usa. */
  source?: Record<string, unknown>;
}
export interface CifraPP extends CifraPub {
  id: string;
  informe_id: string;
  derived: boolean;
  formula: string;
  source: Record<string, unknown>;
  indicator: string | null;
}

export interface SpecGrafico {
  chart?: TipoGrafico;
  series?: { x: string; cifra: string }[];
  title_es?: string;
  title_en?: string;
}
export interface SpecBloque extends SpecGrafico {
  cifra?: string;
  news_id?: string;
  image_id?: string;
  caption?: string;
  /** Imagen por enlace (manual): https, con pie, crédito y texto alternativo. */
  url?: string;
  externa?: boolean;
  caption_es?: string;
  caption_en?: string;
  credit?: string;
  credit_url?: string;
  alt_es?: string;
  alt_en?: string;
  /** Convención de esta pantalla: el bloque de texto (eje) al que acompaña una imagen. */
  eje?: string;
  indicator?: string;
}

export interface BloquePP {
  id: string;
  informe_id: string;
  kind: KindBloque;
  sec: string;
  pos: number;
  origin: OrigenBloque;
  enabled: boolean;
  spec: SpecBloque;
  heading_es: string;
  heading_en: string;
  text_es: string;
  text_en: string;
  /** Solo intranet. */
  orig_es?: string;
  orig_en?: string;
  sources?: unknown[];
  warn?: string | null;
  figs: string[];
  updated_at?: string;
}

export interface CorridaPP {
  id: string;
  accion: string;
  detalle: Record<string, unknown>;
  created_at: string;
}

export interface NoticiaPub {
  id: string;
  url: string;
  title: string;
  title_en: string | null;
  excerpt: string;
  excerpt_en: string | null;
  image_url: string | null;
  published_on: string | null;
}
export interface ImagenPub {
  id: string;
  news_id: string;
  url: string;
  caption: string | null;
  credit: string | null;
  alt: string | null;
  minors: boolean | null;
}

/* ---------- Catálogo de rankings y unidades ------------------------------- */

export interface UnidadPP {
  key: string;
  short: string;
  name: string;
  name_en: string;
  /** Color del acento: hex del ODS o variable de tokens. */
  color: string;
  /** Tinta sobre el color. */
  on: string;
  pri: boolean;
}
export interface RankingCat {
  id: RankingPP;
  name: string;
  sub: string;
  unitLabel: string;
  unitLabelEn: string;
  units: UnidadPP[];
}

const PRIORIZADOS = [4, 5, 10, 17];
const NOMBRES_ODS_EN = [
  "No Poverty",
  "Zero Hunger",
  "Good Health and Well-being",
  "Quality Education",
  "Gender Equality",
  "Clean Water and Sanitation",
  "Affordable and Clean Energy",
  "Decent Work and Economic Growth",
  "Industry, Innovation and Infrastructure",
  "Reduced Inequalities",
  "Sustainable Cities and Communities",
  "Responsible Consumption and Production",
  "Climate Action",
  "Life Below Water",
  "Life on Land",
  "Peace, Justice and Strong Institutions",
  "Partnerships for the Goals",
];

const pilar = (key: string, short: string, name: string, name_en: string, n: number): UnidadPP => ({
  key,
  short,
  name,
  name_en,
  color: `var(--pillar-${n})`,
  on: "#ffffff",
  pri: true,
});

export const CATALOGO: RankingCat[] = [
  {
    id: "impact",
    name: "THE Impact",
    sub: "Impact Rankings · 17 ODS",
    unitLabel: "ODS",
    unitLabelEn: "SDG",
    units: SDG.map((s, i) => ({
      key: String(i + 1),
      short: String(i + 1),
      name: s.name,
      name_en: NOMBRES_ODS_EN[i] ?? s.name,
      color: s.color,
      on: odsOn(s.color),
      pri: PRIORIZADOS.includes(i + 1),
    })),
  },
  {
    id: "world",
    name: "THE World",
    sub: "World University Rankings",
    unitLabel: "Pilar",
    unitLabelEn: "Pillar",
    units: [
      pilar("teaching", "T", "Enseñanza", "Teaching", 1),
      pilar("research-environment", "E", "Entorno de investigación", "Research environment", 2),
      pilar("research-quality", "C", "Calidad de la investigación", "Research quality", 4),
      pilar("international", "I", "Perspectiva internacional", "International outlook", 5),
      pilar("industry", "P", "Industria", "Industry", 6),
    ],
  },
  {
    id: "green",
    name: "UI GreenMetric",
    sub: "Ranking de universidades verdes",
    unitLabel: "Categoría",
    unitLabelEn: "Category",
    units: [
      pilar("SI", "SI", "Entorno e infraestructura", "Setting and Infrastructure", 5),
      pilar("EC", "EC", "Energía y cambio climático", "Energy and Climate Change", 3),
      pilar("WS", "WS", "Residuos", "Waste", 6),
      pilar("WR", "WR", "Agua", "Water", 2),
      pilar("TR", "TR", "Transporte", "Transportation", 1),
      pilar("ED", "ED", "Educación e investigación", "Education and Research", 4),
      pilar("GD", "GD", "Gobernanza y digitalización", "Governance and Digitalization", 3),
    ],
  },
];

export const rankingDe = (id: string): RankingCat | undefined => CATALOGO.find((r) => r.id === id);
export const unidadDe = (ranking: string, key: string): UnidadPP | undefined => rankingDe(ranking)?.units.find((u) => u.key === key);

export const ETAPAS = ["Fuentes", "Tablero", "Gráficos", "Narrativa", "Diagramación", "Publicar"] as const;
export const EDICIONES = [2025, 2026, 2027, 2028];
/** La edición vigente: la que muestra /sostenible/impact/informes/ods/:n (esa ruta solo conoce 2025 y 2026). */
export const EDICION_BASE = 2026;

export const nombreUnidad = (r: RankingPP, u: UnidadPP, idioma: Idioma = "es") =>
  r === "impact" ? (idioma === "es" ? `ODS ${u.key}: ${u.name}` : `SDG ${u.key}: ${u.name_en}`) : idioma === "es" ? u.name : u.name_en;

export const tituloPorDefecto = (r: RankingPP, u: UnidadPP) => nombreUnidad(r, u, "es");

/** Variables CSS del acento de una unidad, para ponerlas en el style de la raíz. */
export function varsAcento(u: UnidadPP | undefined): Record<string, string> {
  const c = u?.color ?? "var(--brand-blue)";
  return { "--pp-k": c, "--pp-ko": u?.on ?? "#fff" };
}

/* ---------- Cifras -------------------------------------------------------- */

export function formato(n: number, idioma: Idioma, decimales = 2): string {
  return n.toLocaleString(idioma === "en" ? "en-US" : "es-CO", { maximumFractionDigits: decimales });
}
/** «1.234 %», «3.200 personas»; el % va pegado con espacio fino. */
export function formatoConUnidad(n: number, unit: string, idioma: Idioma): string {
  const u = unit.trim();
  const v = formato(n, idioma);
  return u === "%" ? `${v} %` : v;
}

export interface PuntoSerie {
  x: string;
  v: number | null;
  key: string;
  /** La medida a la que pertenece (el nombre de la cifra sin su año): es la fila del mapa de calor. */
  g?: string;
}

/** El nombre de una cifra sin el año que lleva al final o entre paréntesis. */
const medidaDe = (t: string): string =>
  t
    .replace(/\s*[(\[]\s*(19|20)\d{2}\s*[)\]]\s*/g, " ")
    .replace(/\s*[-–·,:]?\s*\b(19|20)\d{2}\b\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
export interface SerieResuelta {
  puntos: PuntoSerie[];
  faltan: string[];
  unidad: string;
}
/** Resuelve las series de un bloque contra el libro. Lo que no hay queda en `faltan`. */
export function resolverSerie(spec: SpecBloque, libro: Map<string, CifraPub>): SerieResuelta {
  const puntos: PuntoSerie[] = [];
  const faltan: string[] = [];
  let unidad = "";
  for (const s of spec.series ?? []) {
    const c = libro.get(s.cifra);
    const v = c && c.value !== null && c.value !== undefined && Number.isFinite(Number(c.value)) ? Number(c.value) : null;
    if (c && !unidad) unidad = c.unit;
    if (v === null) faltan.push(s.cifra);
    puntos.push({ x: s.x, v, key: s.cifra, g: c ? medidaDe(c.label) || c.key : s.cifra });
  }
  return { puntos, faltan, unidad };
}

/** Las citas de un bloque como etiquetas: acepta cadenas u objetos con ref, id, label o title. */
export function citasDe(b: Pick<BloquePP, "sources">): string[] {
  const out: string[] = [];
  for (const s of b.sources ?? []) {
    if (typeof s === "string") out.push(s);
    else if (s && typeof s === "object") {
      const o = s as Record<string, unknown>;
      const t = o.label ?? o.title ?? o.ref ?? o.id ?? o.url;
      if (typeof t === "string" && t) out.push(t);
    }
  }
  return out;
}

export const parrafos = (t: string): string[] =>
  t
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

export const elegir = (es: string, en: string, idioma: Idioma): { t: string; lang: Idioma } =>
  idioma === "en" && en.trim() ? { t: en, lang: "en" } : { t: es, lang: "es" };

export function urlPublica(i: Pick<InformePP, "ranking" | "unit_key" | "edition">, lang?: Idioma): string {
  const base = typeof window === "undefined" ? "" : window.location.origin;
  // THE Impact se ve en la ruta de siempre de cada ODS; los otros rankings, en /sostenible/informes/…
  if (i.ranking === "impact") return `${base}/sostenible/impact/informes/ods/${encodeURIComponent(i.unit_key)}?edicion=${i.edition}${lang === "en" ? "&lang=en" : ""}`;
  return `${base}/sostenible/informes/${i.ranking}/${encodeURIComponent(i.unit_key)}?ed=${i.edition}${lang === "en" ? "&lang=en" : ""}`;
}

export const ajustesDe = (i: Pick<InformePP, "settings">): AjustesPP => ({ ...AJUSTES_BASE, ...(i.settings ?? {}) }) as AjustesPP;
export const ordenDe = (a: AjustesPP): SeccionVista[] => {
  const base = (a.order ?? []).filter((s) => ORDEN_BASE.includes(s));
  return [...base, ...ORDEN_BASE.filter((s) => !base.includes(s))];
};

/** Una imagen manual (por enlace) lleva `spec.url`. */
export const esImagenEnlace = (b: Pick<BloquePP, "kind" | "spec">): boolean => b.kind === "imagen" && typeof b.spec.url === "string" && b.spec.url.length > 0;

/** Solo https con servidor y sin usuario/clave; devuelve el mensaje de error o null si el enlace sirve. */
export function errorEnlaceHttps(valor: string, nombre = "El enlace"): string | null {
  const v = valor.trim();
  if (!v) return `${nombre} está vacío.`;
  if (v.length > 2000) return `${nombre} es demasiado largo.`;
  if (/^\s*(javascript|data|vbscript|file|blob):/i.test(v)) return `${nombre} no es válido: solo se aceptan direcciones https://.`;
  if (/^http:\/\//i.test(v)) return `${nombre} usa http://. Usa una dirección https:// (segura).`;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return `${nombre} no parece una dirección web. Debe empezar por https://`;
  }
  if (u.protocol !== "https:") return `${nombre} debe empezar por https://`;
  if (!u.hostname || !u.hostname.includes(".")) return `${nombre} no tiene un servidor válido.`;
  if (u.username || u.password) return `${nombre} no debe llevar usuario ni clave.`;
  return null;
}
