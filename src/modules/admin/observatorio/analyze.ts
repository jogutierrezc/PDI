/* =============================================================================
   Observatorio · análisis, anonimización y recomendación.

   Un archivo llega como una rejilla de texto (Excel, CSV o pegado). Antes de
   que nada salga del navegador:

   1. Perfil: cada columna se clasifica por su título y sus valores —
      identificador, dato personal, texto libre, tiempo, territorio, categoría
      o cifra— con el motivo en palabras.
   2. Forma: ¿son microdatos (una fila por persona) o una tabla ya agregada?
   3. Anonimización: se quitan identificadores y datos personales; los
      microdatos se convierten en conteos por las columnas elegidas, y todo
      conteo menor que 5 se publica como «< 5» (reserva estadística). Un
      promedio de menos de 5 personas también se reserva: describe a alguien.
   4. Recomendación: con la tabla resultante, qué visores la leen mejor.

   Nada de esto guarda: el acta (ObsAnonymization) viaja con la tabla.
   ========================================================================== */

import type { FreeCell, FreeRow, FreeTemporality } from "../../datos-abiertos/data/free-sets";
import { numberOf, territoryCode } from "../../datos-abiertos/data/free-sets";
import { locateMunicipio, plano } from "../../datos-abiertos/data/municipios";
import type { ValueFormat } from "../../datos-abiertos/data/types";
import { CHARTS, RESERVE, RESERVED_TEXT, obsViewProblems } from "./model";
import type { ObsAnonymization, ObsChartType, ObsColumn, ObsDataset, ObsView } from "./model";

/* --- Perfil ------------------------------------------------------------------------ */

export type ColumnRole = "identificador" | "personal" | "texto_libre" | "tiempo" | "territorio" | "categoria" | "cifra" | "vacia";

export const ROLE_LABEL: Record<ColumnRole, string> = {
  identificador: "Identificador",
  personal: "Dato personal",
  texto_libre: "Texto libre",
  tiempo: "Tiempo",
  territorio: "Territorio",
  categoria: "Categoría",
  cifra: "Cifra",
  vacia: "Vacía",
};

/** Roles que nunca se guardan tal cual. */
export const SENSITIVE: ColumnRole[] = ["identificador", "personal", "texto_libre"];

export interface ColumnProfile {
  index: number;
  header: string;
  key: string;
  role: ColumnRole;
  reason: string;
  filled: number;
  distinct: number;
  sample: string[];
  time?: "anio" | "periodo" | "fecha";
  territory?: "departamento" | "pais" | "municipio";
  format?: ValueFormat;
}

export interface Analysis {
  fileName: string;
  header: string[];
  body: string[][];
  profiles: ColumnProfile[];
  shape: "microdatos" | "agregada";
  shapeReason: string;
}

const ID_HEADER = /(^|[\s_.-])(id|documento|doc|n[uú]m(ero)?[\s_.-]*(de[\s_.-]*)?(documento|identificaci[oó]n|id)|identificaci[oó]n|c[eé]dula|cc|nuip|nit|pasaporte|carn[eé]t?|c[oó]d(igo)?[\s_.-]*(del?[\s_.-]*)?(estudiante|alumno|egresado|docente|profesor|empleado|persona|aspirante))([\s_.-]|$)/i;
const PERSONAL_HEADER = /(nombres?|apellidos?|correo|e-?mail|mail|tel[eé]fono|celular|m[oó]vil|direcci[oó]n|barrio|fecha[\s_.-]*(de[\s_.-]*)?nacimiento|nacimiento|firma|usuario|contrase|acudiente|padre|madre)/i;
/** "Nombre del programa" no es un dato personal. */
const INSTITUTIONAL = /(programa|facultad|campus|sede|municipio|departamento|colegio|instituci|asignatura|curso|materia|ciudad|pa[ií]s|convenio|proyecto|grupo|semillero|evento|empresa|entidad)/i;
const TIME_HEADER = /(a[ñn]o|year|vigencia|cohorte|periodo|per[ií]odo|semestre|corte|fecha)/i;
const MUNICIPIO_HEADER = /(municipio|ciudad|lugar|procedencia|origen|residencia|expedici[oó]n)/i;
const DEPARTAMENTO_HEADER = /(departamento|depto|dpto)/i;
const PAIS_HEADER = /(pa[ií]s|nacionalidad|country)/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERIOD = /^\s*(19|20)\d{2}\s*[-_ ]?\s*(0?[12]|I{1,2}|[AB])\s*$/i;
const DATE = /^\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/;
const COUNT_HEADER = /(estudiantes|personas|n[uú]mero|cantidad|total|conteo|matriculad|graduad|admitid|inscrit|desert|docentes|profesores|egresad|beneficiari|casos|registros|poblaci[oó]n|primer[\s_]?curso|nuevos)/i;

export const keyOf = (header: string, taken: Set<string>) => {
  const base =
    plano(header)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || "columna";
  let key = base;
  for (let i = 2; taken.has(key); i += 1) key = `${base}_${i}`;
  taken.add(key);
  return key;
};

function distinctOf(values: string[]) {
  return new Set(values).size;
}

function profileColumn(header: string, values: string[], index: number, key: string, rows: number): ColumnProfile {
  const filled = values.filter((v) => v !== "");
  const distinct = distinctOf(filled);
  const sample = [...new Set(filled)].slice(0, 4);
  const base = { index, header, key, filled: filled.length, distinct, sample };
  if (!filled.length) return { ...base, role: "vacia", reason: "No trae datos." };

  const institutional = INSTITUTIONAL.test(header);
  const numeric = filled.map((v) => numberOf(v)).filter((n): n is number => n !== null);
  const numericShare = numeric.length / filled.length;
  const uniqueShare = distinct / filled.length;

  if (!institutional && ID_HEADER.test(header)) return { ...base, role: "identificador", reason: "El título dice que identifica a una persona." };
  if (!institutional && PERSONAL_HEADER.test(header)) return { ...base, role: "personal", reason: "El título dice que es un dato personal." };
  if (filled.filter((v) => EMAIL.test(v)).length / filled.length > 0.3) return { ...base, role: "personal", reason: "Los valores son correos electrónicos." };
  // Números largos casi todos distintos: documentos, códigos, teléfonos.
  const longDigits = filled.filter((v) => /^\+?\d[\d\s-]{5,14}$/.test(v)).length / filled.length;
  if (longDigits > 0.8 && uniqueShare > 0.85 && rows > 10) return { ...base, role: "identificador", reason: "Números largos distintos en casi cada fila: parecen documentos o códigos." };

  // Tiempo
  const years = numeric.filter((n) => Number.isInteger(n) && n >= 1990 && n <= 2100).length / filled.length;
  if (years > 0.95 && (TIME_HEADER.test(header) || distinct <= 40)) return { ...base, role: "tiempo", time: "anio", reason: "Años." };
  if (filled.filter((v) => PERIOD.test(v)).length / filled.length > 0.9) return { ...base, role: "tiempo", time: "periodo", reason: "Periodos académicos (año y semestre)." };
  if (filled.filter((v) => DATE.test(v)).length / filled.length > 0.9) return { ...base, role: "tiempo", time: "fecha", reason: "Fechas. Al agregar se leen por año." };

  // Cifras
  if (numericShare > 0.9) {
    const ints = numeric.every((n) => Number.isInteger(n));
    const pct = /%|porcentaje|tasa|proporci/i.test(header);
    return {
      ...base,
      role: "cifra",
      format: pct ? "porcentaje" : ints ? "entero" : "decimal",
      reason: pct ? "Cifra en porcentaje." : ints ? "Cifra entera." : "Cifra con decimales.",
    };
  }

  // Territorio
  const distinctValues = [...new Set(filled)].slice(0, 60);
  if (DEPARTAMENTO_HEADER.test(header)) {
    const hits = distinctValues.filter((v) => territoryCode("departamento", v)).length / distinctValues.length;
    if (hits > 0.6) return { ...base, role: "territorio", territory: "departamento", reason: "Departamentos de Colombia." };
  }
  if (PAIS_HEADER.test(header)) {
    const hits = distinctValues.filter((v) => territoryCode("pais", v)).length / distinctValues.length;
    if (hits > 0.6) return { ...base, role: "territorio", territory: "pais", reason: "Países." };
  }
  if (MUNICIPIO_HEADER.test(header)) {
    const hits = distinctValues.filter((v) => "code" in locateMunicipio(v)).length / distinctValues.length;
    if (hits > 0.5) return { ...base, role: "territorio", territory: "municipio", reason: "Municipios de Colombia (DIVIPOLA)." };
  }

  // Texto
  const avgLength = filled.reduce((s, v) => s + v.length, 0) / filled.length;
  if (uniqueShare > 0.8 && avgLength > 35 && rows > 10) return { ...base, role: "texto_libre", reason: "Respuestas abiertas: pueden nombrar a alguien." };
  if (!institutional && uniqueShare > 0.95 && rows > 30) return { ...base, role: "identificador", reason: "Un valor distinto en casi cada fila: identifica registros." };
  return { ...base, role: "categoria", reason: distinct <= 12 ? `${distinct} categorías.` : `${distinct} valores distintos.` };
}

/** Limpia la rejilla (filas y columnas vacías, títulos repetidos) y perfila cada columna. */
export function analyzeGrid(fileName: string, grid: string[][]): Analysis | null {
  const rows = grid.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some((c) => c !== ""));
  if (rows.length < 2) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const header = Array.from({ length: width }, (_, i) => rows[0][i] || `Columna ${i + 1}`);
  const body = rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  const taken = new Set<string>();
  const profiles = header.map((h, i) =>
    profileColumn(
      h,
      body.map((r) => r[i]),
      i,
      keyOf(h, taken),
      body.length,
    ),
  );
  const sensitive = profiles.filter((p) => SENSITIVE.includes(p.role));
  const measures = profiles.filter((p) => p.role === "cifra");
  let shape: Analysis["shape"] = "agregada";
  let shapeReason = "Trae cifras por categoría: se guarda como viene.";
  if (sensitive.length) {
    shape = "microdatos";
    shapeReason = `Trae ${sensitive.map((p) => `«${p.header}»`).join(", ")}: es una fila por persona. Se convierte en conteos.`;
  } else if (!measures.length) {
    shape = "microdatos";
    shapeReason = "No trae cifras: cada fila es un registro. Se cuentan por categoría.";
  }
  return { fileName, header, body, profiles, shape, shapeReason };
}

/* --- Anonimización ---------------------------------------------------------------------- */

export interface Plan {
  mode: "agregar" | "tal_cual";
  /** Columnas que se conservan (claves del perfil). Las sensibles nunca. */
  keep: string[];
  /** Agregar: columnas por las que se cuenta. */
  groupBy: string[];
  /** Agregar: cómo se resume cada cifra conservada. */
  measures: Record<string, "suma" | "promedio">;
  /** Tal cual: columnas de conteo de personas a las que se aplica la reserva. */
  reserveColumns: string[];
}

export function defaultPlan(analysis: Analysis): Plan {
  const usable = analysis.profiles.filter((p) => !SENSITIVE.includes(p.role) && p.role !== "vacia");
  if (analysis.shape === "microdatos") {
    // Por defecto, tiempo y una categoría: cada columna más que se cruza
    // multiplica las combinaciones y manda más casillas a la reserva. El
    // territorio entra solo si no hay categoría; se añade a mano.
    const time = usable.filter((p) => p.role === "tiempo").slice(0, 1);
    const cats = usable.filter((p) => p.role === "categoria" && p.distinct <= 30).sort((a, b) => a.distinct - b.distinct).slice(0, 1);
    const territory = cats.length ? [] : usable.filter((p) => p.role === "territorio").slice(0, 1);
    const groupBy = [...time, ...cats, ...territory].map((p) => p.key);
    return { mode: "agregar", keep: groupBy, groupBy, measures: {}, reserveColumns: [] };
  }
  return {
    mode: "tal_cual",
    keep: usable.map((p) => p.key),
    groupBy: [],
    measures: {},
    reserveColumns: usable.filter((p) => p.role === "cifra" && p.format === "entero" && COUNT_HEADER.test(p.header)).map((p) => p.key),
  };
}

const yearOf = (text: string) => {
  const m = text.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
};

/** "2024-02" → "2024-2"; "2024B" → "2024-2". */
function periodOf(text: string) {
  const m = text.match(PERIOD);
  if (!m) return text;
  const year = text.match(/(19|20)\d{2}/)![0];
  const term = text.slice(text.indexOf(year) + 4).replace(/[-_ ]/g, "").toUpperCase().replace(/^0/, "");
  return `${year}-${term === "A" || term === "I" ? "1" : term === "B" || term === "II" ? "2" : term}`;
}

function normalizeCell(profile: ColumnProfile, raw: string): FreeCell {
  if (raw === "") return null;
  if (profile.role === "cifra") return numberOf(raw);
  if (profile.time === "fecha") return String(yearOf(raw) ?? raw);
  if (profile.time === "periodo") return periodOf(raw);
  return raw;
}

function columnFor(profile: ColumnProfile, grouped: boolean): ObsColumn {
  if (profile.role === "cifra") return { key: profile.key, label: profile.header, kind: "cifra", format: profile.format ?? "decimal" };
  if (profile.role === "territorio") return { key: profile.key, label: profile.header, kind: "territorio", territory: profile.territory };
  if (profile.time === "fecha" && grouped) return { key: profile.key, label: `${profile.header} (año)`, kind: "texto" };
  if (profile.time === "fecha") return { key: profile.key, label: profile.header, kind: "fecha" };
  return { key: profile.key, label: profile.header, kind: "texto" };
}

export interface BuildResult {
  columns: ObsColumn[];
  rows: FreeRow[];
  temporality: FreeTemporality;
  anonymization: ObsAnonymization;
}

/** Aplica el plan: la tabla que se guardará y el acta de lo que se hizo. */
export function buildDataset(analysis: Analysis, plan: Plan): BuildResult {
  const byKey = new Map(analysis.profiles.map((p) => [p.key, p]));
  const removed = analysis.profiles
    .filter((p) => !plan.keep.includes(p.key) || SENSITIVE.includes(p.role))
    .map((p) => ({
      column: p.header,
      reason: SENSITIVE.includes(p.role) ? ROLE_LABEL[p.role] : p.role === "vacia" ? "Vacía" : plan.mode === "agregar" ? "No se usa en el conteo" : "Excluida al importar",
    }));
  const keep = plan.keep.map((k) => byKey.get(k)).filter((p): p is ColumnProfile => Boolean(p) && !SENSITIVE.includes(p!.role));
  const timeProfile = keep.find((p) => p.role === "tiempo" && p.time !== undefined && (plan.mode === "tal_cual" || plan.groupBy.includes(p.key)));
  const temporality: FreeTemporality = timeProfile ? "anual" : "sin_tiempo";
  let reservedCells = 0;

  if (plan.mode === "tal_cual") {
    const columns = keep.map((p) => columnFor(p, false));
    const rows: FreeRow[] = analysis.body.map((line) => {
      const cells: Record<string, FreeCell> = {};
      for (const p of keep) {
        let value = normalizeCell(p, line[p.index]);
        if (plan.reserveColumns.includes(p.key) && typeof value === "number" && value > 0 && value < RESERVE) {
          value = RESERVED_TEXT;
          reservedCells += 1;
        }
        cells[p.key] = value;
      }
      const year = timeProfile ? yearOf(String(cells[timeProfile.key] ?? "")) : null;
      return { year, kind: "dato", label: "", cells };
    });
    return {
      columns,
      rows,
      temporality,
      anonymization: {
        fileName: analysis.fileName,
        sourceRows: analysis.body.length,
        sourceColumns: analysis.header.length,
        removed,
        groupedBy: [],
        reservedCells,
        threshold: RESERVE,
        at: new Date().toISOString(),
      },
    };
  }

  // Agregar: una fila por combinación de las columnas elegidas.
  const dims = plan.groupBy.map((k) => byKey.get(k)).filter((p): p is ColumnProfile => Boolean(p) && !SENSITIVE.includes(p!.role));
  const measureKeys = Object.keys(plan.measures).filter((k) => byKey.get(k)?.role === "cifra" && !plan.groupBy.includes(k));
  const groups = new Map<string, { cells: Record<string, FreeCell>; count: number; sums: Record<string, number>; n: Record<string, number> }>();
  for (const line of analysis.body) {
    const cells: Record<string, FreeCell> = {};
    for (const d of dims) {
      const value = normalizeCell(d, line[d.index]);
      cells[d.key] = value === null || value === "" ? "Sin dato" : value;
    }
    const id = JSON.stringify(dims.map((d) => String(cells[d.key])));
    let group = groups.get(id);
    if (!group) {
      group = { cells, count: 0, sums: {}, n: {} };
      groups.set(id, group);
    }
    group.count += 1;
    for (const key of measureKeys) {
      const n = numberOf(line[byKey.get(key)!.index]);
      if (n === null) continue;
      group.sums[key] = (group.sums[key] ?? 0) + n;
      group.n[key] = (group.n[key] ?? 0) + 1;
    }
  }
  const columns: ObsColumn[] = [
    ...dims.map((d) => columnFor(d, true)),
    { key: "registros", label: "Registros", kind: "cifra", format: "entero", unit: "registros" },
    ...measureKeys.map((k) => {
      const p = byKey.get(k)!;
      return { key: k, label: `${p.header} (${plan.measures[k]})`, kind: "cifra" as const, format: plan.measures[k] === "promedio" ? ("decimal" as const) : (p.format ?? "decimal") };
    }),
  ];
  const sorted = [...groups.values()].sort((a, b) => {
    for (const d of dims) {
      const x = String(a.cells[d.key]);
      const y = String(b.cells[d.key]);
      if (x !== y) return x.localeCompare(y, "es", { numeric: true });
    }
    return 0;
  });
  const rows: FreeRow[] = sorted.map((g) => {
    const cells: Record<string, FreeCell> = { ...g.cells };
    const small = g.count < RESERVE;
    cells.registros = small ? RESERVED_TEXT : g.count;
    if (small) reservedCells += 1;
    for (const key of measureKeys) {
      if (small) {
        // Un promedio de menos de 5 personas describe a alguien: se deja vacío
        // (el «< 5» de Registros explica por qué).
        cells[key] = null;
        reservedCells += 1;
      } else if (g.n[key]) {
        cells[key] = plan.measures[key] === "promedio" ? Math.round((g.sums[key] / g.n[key]) * 100) / 100 : g.sums[key];
      } else {
        cells[key] = null;
      }
    }
    const year = timeProfile ? yearOf(String(cells[timeProfile.key] ?? "")) : null;
    return { year, kind: "dato", label: "", cells };
  });
  return {
    columns,
    rows,
    temporality,
    anonymization: {
      fileName: analysis.fileName,
      sourceRows: analysis.body.length,
      sourceColumns: analysis.header.length,
      removed,
      groupedBy: dims.map((d) => d.header),
      reservedCells,
      threshold: RESERVE,
      at: new Date().toISOString(),
    },
  };
}

/* --- Recomendación --------------------------------------------------------------------- */

type Encoding = Pick<ObsView, "type" | "category" | "category2" | "series" | "start" | "end" | "orientation" | "sort" | "reference" | "limit">;

export interface Recommendation {
  type: ObsChartType;
  score: number;
  why: string;
  encoding: Encoding;
}

const STAGES = /(inscrit|aspirant|admitid|matriculad|primer curso|nuevo|activo|retenid|egresad|graduad)/i;

/** Columnas de la tabla por papel, para recomendar y para rellenar un visor. */
export function fieldsOf(dataset: ObsDataset) {
  const distinct = (key: string) => new Set(dataset.rows.map((r) => String(r.cells[key] ?? ""))).size;
  const isTime = (c: ObsColumn) =>
    c.kind === "texto" &&
    (TIME_HEADER.test(c.label) ||
      dataset.rows.length > 0 && dataset.rows.every((r) => /^\s*(19|20)\d{2}(\s*[-_ ]?\s*(0?[12]|I{1,2}|[AB]))?\s*$/i.test(String(r.cells[c.key] ?? ""))));
  const time = dataset.columns.filter(isTime);
  const dims = dataset.columns.filter((c) => c.kind === "texto" && !isTime(c));
  const nums = dataset.columns.filter((c) => c.kind === "cifra");
  const places = dataset.columns.filter((c) => c.kind === "territorio");
  const dates = dataset.columns.filter((c) => c.kind === "fecha");
  return { time, dims, nums, places, dates, distinct };
}

export function recommend(dataset: ObsDataset): Recommendation[] {
  const { time, dims, nums, places, dates, distinct } = fieldsOf(dataset);
  const out: Recommendation[] = [];
  const add = (score: number, type: ObsChartType, why: string, encoding: Omit<Encoding, "type">) => out.push({ type, score, why, encoding: { type, ...encoding } });
  const lead = nums[0];
  const t = time[0];
  const d = dims[0];

  if (t && lead) {
    add(96, "lineas", `«${t.label}» es tiempo: la línea muestra cómo cambia «${lead.label}».`, { category: t.key, series: nums.slice(0, 3).map((n) => n.key) });
    add(72, "area", "Como la línea, con el volumen bajo la curva.", { category: t.key, series: nums.slice(0, 3).map((n) => n.key) });
    add(66, "barras", `Una barra por ${t.label.toLowerCase()}: se compara año contra año.`, { category: t.key, series: [lead.key], orientation: "vertical" });
  }
  if (d && lead) {
    const n = distinct(d.key);
    const labels = dataset.rows.map((r) => String(r.cells[d.key] ?? ""));
    if (nums.length === 1 && n <= 6) {
      add(88, "dona", `${n} categorías de «${d.label}»: la dona muestra el reparto del total.`, { category: d.key, series: [lead.key], sort: "desc" });
      add(70, "circular", "El mismo reparto, sin el total al centro.", { category: d.key, series: [lead.key], sort: "desc" });
    }
    add(n > 6 ? 86 : 80, "barras", n > 6 ? `${n} categorías: barras horizontales, de mayor a menor, se leen sin girar la cabeza.` : `Compara «${lead.label}» entre categorías.`, {
      category: d.key,
      series: nums.slice(0, Math.min(3, nums.length)).map((x) => x.key),
      orientation: n > 6 ? "horizontal" : "vertical",
      sort: "desc",
    });
    if (n > 8) {
      add(78, "ranking", "Muchas categorías: el ranking dice quién va primero.", { category: d.key, series: [lead.key], limit: 15 });
      add(70, "mosaico", "El reparto de muchas partes en rectángulos proporcionales.", { category: d.key, series: [lead.key] });
    }
    if (n >= 3 && n <= 7 && labels.filter((l) => STAGES.test(l)).length >= 2) {
      add(90, "embudo", "Las categorías son etapas de un proceso: el embudo muestra lo que se pierde entre una y otra.", { category: d.key, series: [lead.key] });
    }
    if (nums.length === 2) add(76, "puntos", `Dos cifras por categoría: los puntos muestran la brecha entre «${nums[0].label}» y «${nums[1].label}».`, { category: d.key, series: nums.map((x) => x.key) });
    if (nums.length >= 2) {
      add(68, "barras_apiladas", "Cada barra suma sus partes.", { category: d.key, series: nums.slice(0, 6).map((x) => x.key) });
      add(64, "barras_100", "El reparto de cada categoría entre sus partes.", { category: d.key, series: nums.slice(0, 6).map((x) => x.key) });
    }
    if (nums.length >= 3 && n <= 6) add(58, "radar", "Perfil de pocas categorías en varias cifras.", { category: d.key, series: nums.slice(0, 6).map((x) => x.key) });
    add(40, "cascada", "Cómo se suma un total parte por parte.", { category: d.key, series: [lead.key] });
  }
  const crossA = d ?? t;
  const crossB = d && t ? t : dims[1];
  if (crossA && crossB && lead && crossA.key !== crossB.key) {
    add(84, "mapa_calor", `Dos categorías («${crossA.label}» × «${crossB.label}»): el mapa de calor muestra dónde se concentra.`, {
      category: crossA.key,
      category2: crossB.key,
      series: [lead.key],
    });
  }
  const est = nums.find((c) => /(^or$|raz[oó]n|coef|estim|exp\s*\(?b)/i.test(c.label));
  const low = nums.find((c) => /(inf|low|m[ií]n)/i.test(c.label));
  const high = nums.find((c) => /(sup|up|m[aá]x)/i.test(c.label));
  if (d && est && low && high) {
    const odds = /(^or$|raz[oó]n|exp)/i.test(est.label);
    add(94, "bosque", "Estimación con intervalo: el bosque la lee frente a la referencia.", { category: d.key, series: [est.key, low.key, high.key], reference: odds ? 1 : 0 });
  }
  for (const place of places) {
    if (!lead) break;
    if (place.territory === "municipio") add(92, "mapa_municipal", `«${place.label}» son municipios: un punto por municipio.`, { category: place.key, series: [lead.key] });
    else add(92, "mapa", `«${place.label}» es territorio: el mapa ubica cada cifra.`, { category: place.key, series: [lead.key] });
  }
  if (lead && !d && !t && dataset.rows.length > 20) {
    add(82, "histograma", "Una cifra por fila: el histograma muestra cómo se reparten los valores.", { series: [lead.key] });
    add(62, "caja", "Mediana, cuartiles y extremos.", { series: [lead.key] });
  }
  if (dates.length >= 2 && (d ?? t)) add(86, "gantt", "Fechas de inicio y fin: una línea de tiempo.", { category: (d ?? t)!.key, start: dates[0].key, end: dates[1].key });
  if (lead) add(dataset.rows.length <= 3 ? 74 : 48, "cifras", "Las cifras en grande, para abrir la página.", { series: nums.slice(0, 4).map((x) => x.key) });
  add(44, "tabla", "La tabla tal cual, ordenable.", {});

  const best = new Map<ObsChartType, Recommendation>();
  for (const rec of out.sort((a, b) => b.score - a.score)) {
    if (!best.has(rec.type) && obsViewProblems(dataset, rec.encoding).length === 0) best.set(rec.type, rec);
  }
  return [...best.values()];
}

/**
 * Encaja un tipo de gráfica sobre la tabla: conserva lo que el visor ya tiene
 * si sirve y rellena lo que falte con la mejor columna. Así cambiar de tipo en
 * la galería nunca deja un lienzo vacío si la tabla lo permite.
 */
export function fitEncoding(dataset: ObsDataset, type: ObsChartType, current: Partial<Encoding>): Encoding {
  const rec = recommend(dataset).find((r) => r.type === type);
  const spec = CHARTS[type];
  const { time, dims, nums, places, dates } = fieldsOf(dataset);
  const has = (key: string | undefined, ok: (c: ObsColumn) => boolean) => {
    const c = dataset.columns.find((x) => x.key === key);
    return c && ok(c) ? key : undefined;
  };
  const textual = (c: ObsColumn) => c.kind === "texto" || c.kind === "territorio";
  let category: string | undefined;
  if (spec.category === "territorio") category = has(current.category, (c) => c.kind === "territorio" && c.territory !== "municipio") ?? places.find((p) => p.territory !== "municipio")?.key;
  else if (spec.category === "municipio") category = has(current.category, (c) => c.kind === "territorio" || c.kind === "texto") ?? places.find((p) => p.territory === "municipio")?.key;
  else if (spec.category !== "ninguna") category = has(current.category, textual) ?? rec?.encoding.category ?? (type === "lineas" || type === "area" ? time[0]?.key : undefined) ?? dims[0]?.key ?? time[0]?.key;
  // La segunda categoría nunca repite la primera: si la recomendación usa la
  // misma, se toma su otra categoría o la siguiente columna de texto.
  const category2 = spec.category2
    ? has(current.category2, (c) => textual(c) && c.key !== category) ??
      [rec?.encoding.category2, rec?.encoding.category, ...time.map((c) => c.key), ...dims.map((c) => c.key)].find((k) => k && k !== category)
    : undefined;
  const keptSeries = (current.series ?? []).filter((k) => nums.some((n) => n.key === k));
  let series: string[] | undefined;
  if (spec.series === "una") series = (keptSeries.length ? keptSeries : rec?.encoding.series ?? nums.map((n) => n.key)).slice(0, 1);
  else if (spec.series === "varias") series = keptSeries.length ? keptSeries : rec?.encoding.series ?? nums.slice(0, type === "puntos" ? 2 : 3).map((n) => n.key);
  else if (spec.series === "tres") series = keptSeries.length >= 3 ? keptSeries.slice(0, 3) : rec?.encoding.series ?? nums.slice(0, 3).map((n) => n.key);
  else if (type === "tabla") series = nums.map((n) => n.key);
  if (type === "radar" && series && series.length < 3) series = nums.slice(0, 6).map((n) => n.key);
  return {
    type,
    category,
    category2,
    series,
    start: spec.dates ? has(current.start, (c) => c.kind === "fecha") ?? dates[0]?.key : undefined,
    end: spec.dates ? has(current.end, (c) => c.kind === "fecha") ?? dates[1]?.key : undefined,
    orientation: current.orientation ?? rec?.encoding.orientation,
    sort: current.sort ?? rec?.encoding.sort,
    reference: type === "bosque" ? current.reference ?? rec?.encoding.reference ?? 1 : undefined,
    limit: type === "ranking" ? current.limit ?? 15 : undefined,
  };
}
