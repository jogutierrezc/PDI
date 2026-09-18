/* =============================================================================
   Boletín UDES en Cifras · la plantilla.

   Un boletín es una plantilla guardada en od_bulletins.settings (JSON) más las
   cifras del periodo. La plantilla dice:
   · textos: portada, cabecera de las páginas de contenido, presentación,
     contraportada y pie;
   · imágenes: portada y contraportada (por defecto, las páginas modelo de
     Planeación en public/boletin);
   · tema: colores de la cabecera y de las gráficas, y la fuente;
   · qué se muestra: corte, campus, si se omite lo que no tiene datos, y el
     contenido en orden (informes, sus indicadores con lo que muestra cada uno,
     y sus conjuntos visuales).

   Lo guardado nunca se da por bueno: `normalizeSettings` lo completa con los
   valores por defecto y lo concilia con los informes reales (lo nuevo entra al
   final, lo que ya no existe se descarta), así un informe que ganó un
   indicador después no lo pierde en el boletín.
   ========================================================================== */

import { SABER_COMPETENCIES } from "../datos-abiertos/data/saber-pro";
import { saberRef } from "../datos-abiertos/data/groups";
import { freeRefs } from "../datos-abiertos/data/free-sets";
import { tytRefs } from "./tyt";
import { deiRefs } from "./dei";
import { modelRefs } from "./model-sheets";
import { ALL_YEARS } from "../datos-abiertos/data/terms";
import type { CampusId, OpenDataCatalog, Report } from "../datos-abiertos/data/types";

export const BULLETIN_FONTS = ["Montserrat", "Manrope", "Source Sans 3", "Roboto", "Lato"] as const;
export type BulletinFont = (typeof BULLETIN_FONTS)[number];

export interface BulletinTheme {
  /** Barra superior de la cabecera y títulos. */
  navy: string;
  /** Franja del título y serie principal de las gráficas. */
  band: string;
  /** Acento: cifra ancla del capítulo y marcas. */
  accent: string;
  font: BulletinFont;
}

export interface BulletinTexts {
  coverTitle: string;
  coverSubtitle: string;
  coverOffice: string;
  /** Rótulo de la cabecera de las páginas de contenido. */
  headerTitle: string;
  headerOffice: string;
  presentationTitle: string;
  /** Párrafos separados por una línea en blanco. */
  presentation: string;
  backTitle: string;
  backNote: string;
  footer: string;
}

export interface BulletinImages {
  /** URL de una portada propia; null = la de la plantilla. */
  cover: string | null;
  back: string | null;
  /**
   * La portada de la plantilla ya trae el título dibujado. Con una portada
   * propia sin texto, el boletín escribe título, subtítulo y dependencia.
   */
  coverText: boolean;
  /**
   * Fondo de las páginas de contenido (A4 completa, detrás del cuerpo). Sirve
   * para una marca de agua o para una página modelo actualizada.
   */
  content: string | null;
  /** El fondo ya trae dibujada la cabecera: el boletín no pinta la suya encima. */
  contentHasHeader: boolean;
  /** Dibujo de la franja de la cabecera (trazo claro con transparencia). */
  headerArt: string | null;
  /** Logo de la barra superior (claro, con transparencia). */
  headerLogo: string | null;
}

export type EditionAlign = "izquierda" | "centro" | "derecha";

/** La línea de edición de la portada: "Poblacional · Periodo 2020-2025". */
export interface BulletinEdition {
  color: string;
  align: EditionAlign;
}

export const DEFAULT_EDITION: BulletinEdition = { color: "#ffffff", align: "centro" };

/**
 * Insignia del informe sobre el dibujo de la franja: código de dos letras y
 * nombre, en blanco. "relleno": cuadro blanco con el código en azul;
 * "contorno": solo el borde y el código en blanco; "ninguna": franja limpia.
 */
export type HeaderBadge = "relleno" | "contorno" | "ninguna";
export const HEADER_BADGES: HeaderBadge[] = ["relleno", "contorno", "ninguna"];

/**
 * De qué color son la barra y la franja de la cabecera. "tema": los dos colores
 * del boletín en todas las páginas. "informe": cada página toma el color de
 * línea de su informe, el mismo de su insignia en el portal y de su pestaña, y
 * las páginas sin informe (portada, contenido, resumen) siguen con el tema.
 */
export type HeaderTint = "tema" | "informe";
export const HEADER_TINTS: HeaderTint[] = ["tema", "informe"];

/** Lo que muestra la hoja de un indicador. */
export interface IndicatorShow {
  evolution: boolean;
  campus: boolean;
  table: boolean;
  notes: boolean;
}

export interface BulletinIndicator {
  id: string;
  include: boolean;
  show: IndicatorShow;
}

/** Conjunto visual del informe: "desglose:clave", "mapa:clave", "tabla:clave"… */
export interface BulletinDataset {
  ref: string;
  include: boolean;
}

export interface BulletinReport {
  slug: string;
  include: boolean;
  /** Quitado del boletín: no aparece en Contenido hasta que se vuelva a añadir. */
  removed?: boolean;
  indicators: BulletinIndicator[];
  datasets: BulletinDataset[];
}

/**
 * "completo": capítulo por informe con una hoja por indicador y conjunto.
 * "ejecutivo": síntesis. Resumen con las cifras titulares de cada informe y una
 * ficha por informe con sus cifras clave, tendencia y reparto por campus.
 */
export type BulletinFormat = "completo" | "ejecutivo";

/**
 * Dónde va Diversidad, Equidad e Inclusión en un boletín con varios informes:
 * su propio capítulo, o como sección dentro de Bienestar Institucional. Si
 * Bienestar no está en el boletín, va en su capítulo de todos modos.
 */
export type DeiPlacement = "capitulo" | "bienestar";
export const DEI_SLUG = "diversidad-equidad-inclusion";
export const BIENESTAR_SLUG = "bienestar-institucional";

export interface BulletinSettings {
  version: 1;
  format: BulletinFormat;
  /** En el completo: abre con la página de resumen ejecutivo. El ejecutivo siempre la lleva. */
  summary: boolean;
  /** Pestañas de capítulo en el borde derecho, enlazadas. */
  tabs: boolean;
  texts: BulletinTexts;
  images: BulletinImages;
  edition: BulletinEdition;
  headerBadge: HeaderBadge;
  /** Color de la barra y la franja: del tema o del informe de cada página. */
  headerTint: HeaderTint;
  theme: BulletinTheme;
  /** Año del corte, o ALL_YEARS (0) para todo el periodo. */
  cut: number;
  campus: CampusId;
  /** Omite indicadores y conjuntos sin cifras, e informes que se quedan vacíos. */
  skipEmpty: boolean;
  /** Diversidad, Equidad e Inclusión: capítulo propio o sección de Bienestar. */
  deiPlacement: DeiPlacement;
  reports: BulletinReport[];
}

export const DEFAULT_THEME: BulletinTheme = { navy: "#072b58", band: "#4078b9", accent: "#e8892b", font: "Montserrat" };

export const DEFAULT_SHOW: IndicatorShow = { evolution: true, campus: true, table: true, notes: true };

export const DEFAULT_IMAGES = {
  // JPEG y no WebP: Chrome incrusta el JPEG tal cual en el PDF, y un WebP lo
  // descomprime (la portada sola pasaría de 0,8 MB a más de 10 MB).
  cover: "/boletin/portada.jpg",
  back: "/boletin/contraportada.jpg",
  headerArt: "/boletin/cabecera-edificios.png",
  headerLogo: "/boletin/logo-udes-blanco.png",
};

export function defaultTexts(periodLabel: string, format: "completo" | "ejecutivo" = "completo"): BulletinTexts {
  return {
    coverTitle: "Informe UDES en Cifras",
    coverSubtitle: "Principales estadísticas de las actividades académicas y administrativas",
    coverOffice: "Planeación Institucional",
    headerTitle: "Boletín Estadístico",
    headerOffice: "Dirección de Planeación Institucional",
    presentationTitle: "Presentación",
    presentation: [
      `El Boletín UDES en Cifras reúne las principales estadísticas de la Universidad de Santander para el periodo ${periodLabel}, a partir de lo que reporta cada oficina a la Dirección de Planeación Institucional.`,
      format === "ejecutivo"
        ? "Este resumen ejecutivo reúne en una ficha por informe sus cifras clave del corte con sus periodos académicos, la tendencia por periodo y por año, el reparto por campus y lo esencial de sus mapas, desgloses y tablas. El detalle de cada indicador está en el boletín completo."
        : "Cada indicador se presenta en su hoja: a la izquierda, qué mide, quién lo reporta y cómo se calcula; a la derecha, la cifra del corte, su evolución por periodo académico y por año, el detalle por campus y la tabla de datos.",
    ].join("\n\n"),
    backTitle: "Oficinas que reportan",
    backNote: "Las cifras de este boletín son las que cada oficina reporta a la Dirección de Planeación Institucional.",
    footer: "Boletín UDES en Cifras",
  };
}

/** Claves de los conjuntos de un informe, en el orden de su ficha. */
export function datasetRefs(report: Report): { ref: string; title: string }[] {
  const list: { ref: string; title: string }[] = [];
  const seen = new Set<string>();
  const add = (ref: string, title: string) => {
    if (seen.has(ref)) return;
    seen.add(ref);
    list.push({ ref, title });
  };
  // El tablero de la diversidad abre su informe con sus propias hojas.
  deiRefs(report).forEach(({ ref, title }) => add(ref, title));
  modelRefs(report).forEach(({ ref, title }) => add(ref, title));
  // Primero en el orden que la intranet dio a la ficha; luego lo que no tiene bloque.
  for (const block of [...(report.blocks ?? [])].sort((a, b) => a.position - b.position)) {
    if (!block.refKey) continue;
    if (block.kind === "mapa") add(`mapa:${block.refKey}`, report.maps?.find((m) => m.id === block.refKey)?.title ?? block.refKey);
    if (block.kind === "mapa_calor") add(`calor:${block.refKey}`, report.heatmaps?.find((h) => h.id === block.refKey)?.title ?? block.refKey);
    if (block.kind === "tuberia") add(`tuberia:${block.refKey}`, (report.pipelines ?? []).find((p) => p.id === block.refKey)?.title ?? block.refKey);
    if (block.kind === "historico") add(`historico:${block.refKey}`, report.histories?.find((h) => h.id === block.refKey)?.title ?? block.refKey);
    if (block.kind === "tabla") add(`tabla:${block.refKey}`, report.tables?.find((t) => t.id === block.refKey)?.title ?? block.refKey);
  }
  // Rankings: en el orden de su bloque en la ficha, luego los demás.
  for (const block of [...(report.blocks ?? [])].sort((a, b) => a.position - b.position)) {
    if (block.kind !== "rankings") continue;
    (block.settings.rankings ?? []).forEach((key) => {
      const ranking = report.rankings?.find((r) => r.id === key);
      if (ranking) add(`ranking:${ranking.id}`, ranking.title);
    });
  }
  report.rankings?.forEach((r) => add(`ranking:${r.id}`, r.title));
  // Un lienzo con todos juntos solo tiene sentido con dos o más recorridos.
  if ((report.rankings ?? []).filter((r) => r.editions.filter((e) => e.global_rank || e.regional_rank || e.national_rank).length > 1).length >= 2) {
    add(`rankings-evo:${report.slug}`, "Evolución de los rankings");
  }
  // Saber PRO: una entrada por competencia, cada una con sus hojas de niveles y brecha.
  report.saberPro?.forEach((sp) => {
    if (!sp.results.length) return;
    SABER_COMPETENCIES.forEach((c) => add(saberRef(sp.id, c.key), `Saber PRO · ${c.label}`));
  });
  // Motor Beta: una hoja por competencia con pareja de pruebas.
  tytRefs(report).forEach(({ ref, title }) => add(ref, title));
  // Conjuntos libres: una hoja por vista publicable.
  freeRefs(report.freeSets).forEach(({ ref, title }) => add(ref, title));
  report.breakdowns.forEach((b) => add(`desglose:${b.id}`, b.title));
  report.maps?.forEach((m) => add(`mapa:${m.id}`, m.title));
  report.heatmaps?.forEach((h) => add(`calor:${h.id}`, h.title));
  (report.pipelines ?? (report.pipeline ? [report.pipeline] : [])).forEach((p) => add(`tuberia:${p.id}`, p.title));
  report.histories?.forEach((h) => add(`historico:${h.id}`, h.title));
  report.tables?.forEach((t) => add(`tabla:${t.id}`, t.title));
  return list;
}

/** Indicadores en su orden de boletín: primero los clave, luego el resto. */
function indicatorOrder(report: Report): string[] {
  const keys = report.keyIndicators.filter((id) => report.indicators.some((i) => i.id === id));
  return [...keys, ...report.indicators.map((i) => i.id).filter((id) => !keys.includes(id))];
}

/**
 * Completa y concilia una plantilla guardada. `onlyReport` restringe el
 * contenido a un informe (boletín de un informe).
 */
export function normalizeSettings(
  raw: unknown,
  catalog: OpenDataCatalog,
  onlyReport?: string | null,
): BulletinSettings {
  const saved = (raw && typeof raw === "object" ? raw : {}) as Partial<BulletinSettings>;
  const periodLabel = catalog.period?.label ?? (catalog.years.length ? `${catalog.years[0]}–${catalog.years[catalog.years.length - 1]}` : "");
  const texts = { ...defaultTexts(periodLabel, saved.format === "ejecutivo" ? "ejecutivo" : "completo"), ...(saved.texts ?? {}) };
  const images: BulletinImages = {
    cover: null,
    back: null,
    coverText: false,
    content: null,
    contentHasHeader: false,
    headerArt: null,
    headerLogo: null,
    ...(saved.images ?? {}),
  };
  const theme: BulletinTheme = { ...DEFAULT_THEME, ...(saved.theme ?? {}) };
  const edition: BulletinEdition = { ...DEFAULT_EDITION, ...(saved.edition ?? {}) };
  if (!["izquierda", "centro", "derecha"].includes(edition.align)) edition.align = DEFAULT_EDITION.align;
  const headerBadge: HeaderBadge = HEADER_BADGES.includes(saved.headerBadge as HeaderBadge) ? (saved.headerBadge as HeaderBadge) : "relleno";
  const headerTint: HeaderTint = HEADER_TINTS.includes(saved.headerTint as HeaderTint) ? (saved.headerTint as HeaderTint) : "informe";
  if (!BULLETIN_FONTS.includes(theme.font)) theme.font = DEFAULT_THEME.font;
  const cut = typeof saved.cut === "number" && (saved.cut === ALL_YEARS || catalog.years.includes(saved.cut)) ? saved.cut : ALL_YEARS;
  const campus = catalog.campuses.some((c) => c.id === saved.campus) ? saved.campus! : "todas";

  const available = catalog.reports.filter((r) => !onlyReport || r.slug === onlyReport);
  const savedReports = new Map((saved.reports ?? []).map((r) => [r.slug, r]));
  const ordered = [
    ...(saved.reports ?? []).map((r) => r.slug).filter((slug) => available.some((r) => r.slug === slug)),
    ...available.map((r) => r.slug).filter((slug) => !savedReports.has(slug)),
  ];

  const reports: BulletinReport[] = ordered.map((slug) => {
    const report = available.find((r) => r.slug === slug)!;
    const prior = savedReports.get(slug);
    const priorIndicators = new Map((prior?.indicators ?? []).map((i) => [i.id, i]));
    const order = indicatorOrder(report);
    const indicatorIds = [
      ...(prior?.indicators ?? []).map((i) => i.id).filter((id) => order.includes(id)),
      ...order.filter((id) => !priorIndicators.has(id)),
    ];
    const refs = datasetRefs(report).map((d) => d.ref);
    const priorDatasets = new Map((prior?.datasets ?? []).map((d) => [d.ref, d]));
    // Lo nuevo entra al final, salvo las hojas del tablero de la diversidad, que
    // abren su informe como abren su ficha.
    const fresh = refs.filter((ref) => !priorDatasets.has(ref));
    const opens = (ref: string) => ref.startsWith("dei:") || ref.startsWith("modelo:");
    const datasetIds = [
      ...fresh.filter(opens),
      ...(prior?.datasets ?? []).map((d) => d.ref).filter((ref) => refs.includes(ref)),
      ...fresh.filter((ref) => !opens(ref)),
    ];
    return {
      slug,
      include: prior?.include ?? true,
      removed: prior?.removed ?? false,
      indicators: indicatorIds.map((id) => {
        const p = priorIndicators.get(id);
        return { id, include: p?.include ?? true, show: { ...DEFAULT_SHOW, ...(p?.show ?? {}) } };
      }),
      datasets: datasetIds.map((ref) => ({ ref, include: priorDatasets.get(ref)?.include ?? true })),
    };
  });

  const format: BulletinFormat = saved.format === "ejecutivo" ? "ejecutivo" : "completo";
  return {
    version: 1,
    format,
    summary: saved.summary ?? false,
    tabs: saved.tabs ?? true,
    texts,
    images,
    edition,
    headerBadge,
    headerTint,
    theme,
    cut,
    campus,
    skipEmpty: saved.skipEmpty ?? true,
    deiPlacement: saved.deiPlacement === "bienestar" ? "bienestar" : "capitulo",
    reports,
  };
}

/** "boletin-global", "boletin-poblacional", "boletin-ejecutivo", "boletin-ejecutivo-poblacional". */
export function bulletinSlug(reportSlug: string | null, format: BulletinFormat = "completo"): string {
  const base = format === "ejecutivo" ? "boletin-ejecutivo" : "boletin";
  return reportSlug ? `${base}-${reportSlug}` : format === "ejecutivo" ? base : "boletin-global";
}
