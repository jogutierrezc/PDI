/* =============================================================================
   UDES Sostenible · datos del portal público.

   Los rankings, sus subcategorías y los indicadores de los campus. Mientras la
   intranet no los alimente, son de MUESTRA y la página lo dice («Dato
   ilustrativo»): ninguna cifra de aquí se presenta como oficial.

   Una posición se guarda como texto porque los rankings publican bandas
   ("801-1000", "1001+"); `mid` es el número que se dibuja (el punto medio).
   ========================================================================== */

export const YEARS = [2022, 2023, 2024, 2025] as const;
/** La edición más reciente (índice dentro de YEARS). */
export const LAST = YEARS.length - 1;

export const SDG: { name: string; color: string }[] = [
  { name: "Fin de la pobreza", color: "#E5243B" },
  { name: "Hambre cero", color: "#DDA63A" },
  { name: "Salud y bienestar", color: "#4C9F38" },
  { name: "Educación de calidad", color: "#C5192D" },
  { name: "Igualdad de género", color: "#FF3A21" },
  { name: "Agua limpia y saneamiento", color: "#26BDE2" },
  { name: "Energía asequible y no contaminante", color: "#FCC30B" },
  { name: "Trabajo decente y crecimiento", color: "#A21942" },
  { name: "Industria, innovación e infraestructura", color: "#FD6925" },
  { name: "Reducción de las desigualdades", color: "#DD1367" },
  { name: "Ciudades y comunidades sostenibles", color: "#FD9D24" },
  { name: "Producción y consumo responsables", color: "#BF8B2E" },
  { name: "Acción por el clima", color: "#3F7E44" },
  { name: "Vida submarina", color: "#0A97D9" },
  { name: "Vida de ecosistemas terrestres", color: "#56C02B" },
  { name: "Paz, justicia e instituciones sólidas", color: "#00689D" },
  { name: "Alianzas para lograr los objetivos", color: "#19486A" },
];

/* --- Indicadores de sostenibilidad ------------------------------------------------------------ */

export const CAMPUSES = ["Todos", "Bucaramanga", "Cúcuta", "Valledupar", "Bogotá"] as const;
export type Campus = (typeof CAMPUSES)[number];
/** Peso relativo de cada campus sobre el valor institucional (muestra). */
const CAMPUS_FACTOR: Record<Campus, number> = { Todos: 1, Bucaramanga: 1.12, Cúcuta: 0.92, Valledupar: 0.86, Bogotá: 0.7 };

export type IndKey = "energia" | "solar" | "agua" | "residuos" | "verde" | "arboles" | "movil" | "volunt";

export interface Indicator {
  name: string;
  unit: string;
  /** Un valor por edición (YEARS). */
  values: number[];
  /** ¿Más es mejor? Decide si el cambio se pinta como mejora o como retroceso. */
  higherIsBetter: boolean;
  decimals: number;
  /** Tope de las magnitudes en porcentaje: dibuja la barra de avance. */
  max?: number;
}

export const INDICATORS: Record<IndKey, Indicator> = {
  energia: { name: "Consumo de energía", unit: "kWh por persona al año", values: [412, 398, 371, 352], higherIsBetter: false, decimals: 0 },
  solar: { name: "Energía renovable", unit: "% del consumo", values: [0, 4, 9, 15], higherIsBetter: true, decimals: 0, max: 100 },
  agua: { name: "Consumo de agua", unit: "litros por persona al día", values: [54, 51, 47, 44], higherIsBetter: false, decimals: 0 },
  residuos: { name: "Residuos aprovechados", unit: "% del total", values: [18, 24, 31, 38], higherIsBetter: true, decimals: 0, max: 100 },
  verde: { name: "Zonas verdes", unit: "m² por persona", values: [11.2, 11.8, 12.6, 13.4], higherIsBetter: true, decimals: 1 },
  arboles: { name: "Árboles sembrados", unit: "acumulados", values: [1200, 2350, 3900, 5600], higherIsBetter: true, decimals: 0 },
  movil: { name: "Movilidad limpia", unit: "% de los viajes", values: [22, 25, 29, 33], higherIsBetter: true, decimals: 0, max: 100 },
  volunt: { name: "Estudiantes en proyectos verdes", unit: "por año", values: [380, 520, 710, 940], higherIsBetter: true, decimals: 0 },
};
export const ALL_INDICATORS = Object.keys(INDICATORS) as IndKey[];

/** Valor de un indicador en un campus y una edición. Los porcentajes no pasan de su tope. */
export function indicatorValue(key: IndKey, campus: Campus, yearIndex: number): number {
  const ind = INDICATORS[key];
  const raw = ind.values[yearIndex] * CAMPUS_FACTOR[campus];
  return ind.max ? Math.min(ind.max, raw) : raw;
}

/** Cambio porcentual frente a la primera edición, y si fue para bien. */
export function indicatorChange(key: IndKey, campus: Campus, yearIndex: number): { pct: number; good: boolean } {
  const first = indicatorValue(key, campus, 0);
  const now = indicatorValue(key, campus, yearIndex);
  const pct = first ? ((now - first) / first) * 100 : 0;
  return { pct, good: INDICATORS[key].higherIsBetter ? pct >= 0 : pct <= 0 };
}

/* --- Rankings -------------------------------------------------------------------------------- */

export type RankingId = "impact" | "world" | "green";

export interface Category {
  id: string;
  /** Rótulo corto de la ficha: "ODS 4", "EC", "Teaching". */
  code: string;
  name: string;
  en?: string;
  /** Número de ODS, cuando la subcategoría lo es. */
  sdg?: number;
  /** Peso dentro del puntaje total (GreenMetric). */
  weight?: number;
  /** Puntaje 0-100 por edición. */
  scores: number[];
  indicators: IndKey[];
  /** Color propio; si no lo hay, el del ranking. */
  color?: string;
}

export interface Ranking {
  id: RankingId;
  name: string;
  short: string;
  publisher: "THE" | "UI";
  /** Variable CSS del acento (de tokens.css). */
  accent: string;
  subtitle: string;
  about: string;
  /** Posición mundial por edición: número o banda. */
  world: string[];
  /** Número que se dibuja de cada posición mundial. */
  mid: number[];
  /** Puesto entre universidades colombianas. */
  national: number[];
  unit: string;
  /** Puntaje total sobre 10.000 (GreenMetric). */
  score?: number[];
  categoryLabel: string;
  categories: Category[];
}

const ods = (n: number, scores: number[], indicators: IndKey[]): Category => ({
  id: `o${n}`,
  code: `ODS ${n}`,
  name: SDG[n - 1].name,
  sdg: n,
  scores,
  indicators,
  color: SDG[n - 1].color,
});

export const RANKINGS: Ranking[] = [
  {
    id: "impact",
    name: "THE Impact Rankings",
    short: "THE Impact",
    publisher: "THE",
    accent: "var(--pillar-2)",
    subtitle: "Impacto por Objetivo de Desarrollo Sostenible · Times Higher Education",
    about: "Mide cómo contribuyen las universidades a los 17 ODS. La UDES se presenta en los objetivos donde tiene evidencia y se evalúa en cada uno por separado.",
    world: ["1001+", "801-1000", "601-800", "601-800"],
    mid: [1001, 900, 700, 700],
    national: [14, 12, 10, 9],
    unit: "de 2.100+ universidades",
    categoryLabel: "Objetivos de Desarrollo Sostenible",
    categories: [
      ods(4, [58, 64, 70, 76], ["volunt"]),
      ods(6, [44, 50, 57, 63], ["agua"]),
      ods(7, [39, 47, 55, 64], ["energia", "solar"]),
      ods(11, [48, 53, 60, 66], ["movil", "verde"]),
      ods(12, [41, 49, 58, 67], ["residuos"]),
      ods(13, [36, 44, 53, 61], ["solar", "arboles"]),
      ods(15, [52, 60, 69, 74], ["verde", "arboles"]),
      ods(17, [55, 60, 66, 72], ["volunt"]),
    ],
  },
  {
    id: "world",
    name: "World University Rankings",
    short: "World University",
    publisher: "THE",
    accent: "var(--pillar-1)",
    subtitle: "Clasificación mundial · Times Higher Education",
    about: "Compara a las universidades en cinco pilares: docencia, entorno de investigación, calidad de la investigación, industria y perspectiva internacional.",
    world: ["1501+", "1501+", "1201-1500", "1201-1500"],
    mid: [1501, 1501, 1350, 1350],
    national: [22, 21, 18, 17],
    unit: "de 2.000+ universidades",
    categoryLabel: "Pilares",
    categories: [
      { id: "teaching", code: "Teaching", name: "Docencia", en: "Teaching", scores: [31, 34, 38, 42], indicators: ["volunt"] },
      { id: "research-environment", code: "Research", name: "Entorno de investigación", en: "Research Environment", scores: [22, 26, 30, 35], indicators: [] },
      { id: "research-quality", code: "Quality", name: "Calidad de la investigación", en: "Research Quality", scores: [18, 22, 27, 31], indicators: [] },
      { id: "industry", code: "Industry", name: "Industria", en: "Industry", scores: [28, 31, 36, 40], indicators: [] },
      { id: "international", code: "Outlook", name: "Perspectiva internacional", en: "International Outlook", scores: [24, 27, 30, 34], indicators: [] },
    ],
  },
  {
    id: "green",
    name: "UI GreenMetric",
    short: "GreenMetric",
    publisher: "UI",
    accent: "var(--pillar-5)",
    subtitle: "Sostenibilidad del campus · Universitas Indonesia",
    about: "Evalúa la gestión ambiental de los campus en seis categorías con pesos distintos. El puntaje total es sobre 10.000.",
    world: ["780", "640", "512", "430"],
    mid: [780, 640, 512, 430],
    national: [18, 15, 12, 9],
    unit: "de 1.400+ universidades",
    score: [4650, 5400, 6150, 6700],
    categoryLabel: "Categorías",
    categories: [
      { id: "si", code: "SI", name: "Entorno e infraestructura", en: "Setting & Infrastructure", weight: 15, scores: [52, 58, 64, 70], indicators: ["verde", "arboles"] },
      { id: "ec", code: "EC", name: "Energía y cambio climático", en: "Energy & Climate Change", weight: 21, scores: [44, 52, 61, 69], indicators: ["energia", "solar"] },
      { id: "ws", code: "WS", name: "Residuos", en: "Waste", weight: 18, scores: [40, 48, 59, 68], indicators: ["residuos"] },
      { id: "wr", code: "WR", name: "Agua", en: "Water", weight: 10, scores: [50, 55, 61, 66], indicators: ["agua"] },
      { id: "tr", code: "TR", name: "Transporte", en: "Transportation", weight: 18, scores: [46, 52, 58, 63], indicators: ["movil"] },
      { id: "ed", code: "ED", name: "Educación e investigación", en: "Education & Research", weight: 18, scores: [55, 62, 69, 75], indicators: ["volunt"] },
    ],
  },
];

export const rankingById = (id: string | undefined): Ranking | undefined => RANKINGS.find((r) => r.id === id);
export const categoryById = (ranking: Ranking, id: string | undefined): Category | undefined => ranking.categories.find((c) => c.id === id);

/** Los indicadores de un ranking: los de todas sus subcategorías, sin repetir. */
export function rankingIndicators(ranking: Ranking): IndKey[] {
  return [...new Set(ranking.categories.flatMap((c) => c.indicators))];
}

/** "▲ 5 puestos" · cuántos puestos subió en Colombia entre la primera y una edición. */
export const nationalGain = (ranking: Ranking, yearIndex: number) => ranking.national[0] - ranking.national[yearIndex];

/** Los informes publicables: uno por ranking y edición reciente, del más nuevo al más viejo. */
export function reports(): { ranking: Ranking; yearIndex: number }[] {
  return RANKINGS.flatMap((ranking) => [LAST, LAST - 1].map((yearIndex) => ({ ranking, yearIndex }))).sort((a, b) => b.yearIndex - a.yearIndex);
}

/** Los frentes de trabajo de la UDES. Propuesta de estructura: cada uno enlazará a su oficina. */
export const AXES: { name: string; text: string; icon: string }[] = [
  { name: "Campus y energía", text: "Eficiencia energética, energías limpias y uso responsable de los espacios de los cuatro campus.", icon: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z" },
  { name: "Agua y residuos", text: "Ahorro de agua, separación en la fuente y aprovechamiento de residuos.", icon: "M12 3s-6 6.5-6 11a6 6 0 0 0 12 0c0-4.5-6-11-6-11Z" },
  { name: "Biodiversidad y territorio", text: "Zonas verdes, arborización y vínculo con los ecosistemas de Santander.", icon: "M12 21V9M12 15c-4 0-6-2-6-6 4 0 6 2 6 6Zm0-3c3 0 5-2 5-5-3 0-5 2-5 5Z" },
  { name: "Docencia e investigación", text: "Programas, proyectos y producción científica que aportan a los ODS.", icon: "M3 8l9-4 9 4-9 4-9-4Zm4 3v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5" },
  { name: "Comunidad y proyección social", text: "Extensión, voluntariado y alianzas que llevan el conocimiento al territorio.", icon: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9 1a2.5 2.5 0 1 0 0-5M2 20c0-3 3-5 6-5s6 2 6 5M16 15c3 0 6 1.5 6 4" },
  { name: "Gobernanza y rendición de cuentas", text: "Políticas, indicadores y reportes abiertos, con corte y fuente.", icon: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Zm-3 9 2 2 4-4" },
];

/** Formato numérico en español de Colombia. */
export const fmt = (n: number, decimals = 0) => n.toLocaleString("es-CO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
