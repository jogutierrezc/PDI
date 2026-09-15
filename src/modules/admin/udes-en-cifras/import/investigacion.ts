/* =============================================================================
   Perfil de importación · Sección Investigación (Vicerrectoría de Investigaciones).

   Lee lo que entrega la VI para el boletín estadístico:
   · Seccion_Investigacion_UDES_*.docx: los 17 puntos con su texto, su estado
     (completo, parcial, no recibido, no oficial), su fuente y, cuando falta
     información, qué se pidió y a quién.
   · datos_procesados/puntoNN/*.csv: las cifras de cada punto.

   Cada punto se vuelve una sección de la ficha con sus bloques. Las cifras por
   año del periodo son indicadores (capturables y comparables en el portal);
   las series fuera del periodo (jóvenes investigadores 2011-2024) y las que no
   van por año (convocatorias, facultades) son evolución histórica o mapa de
   calor; los listados son tablas. Nada se corrige en silencio: lo raro de los
   datos sale como aviso para que la oficina lo revise.
   ========================================================================== */

import { readDocx, splitPoints } from "./docx";
import type { DocPoint } from "./docx";
import { parseCsv } from "../sheet";
import type {
  ImportContext,
  ImportFile,
  ImportPlan,
  ImportProfile,
  PlanBlock,
  PlanBreakdown,
  PlanHeatmap,
  PlanHistory,
  PlanIndicator,
  PlanSection,
  PlanTable,
  PlanWarning,
  RequestedData,
  SectionStatus,
} from "./types";

const OFFICE = "Vicerrectoría de Investigaciones";

/** Títulos y estados por defecto, si no se sube el Word. */
const POINTS: { number: number; title: string; status: SectionStatus }[] = [
  { number: 1, title: "Visibilidad y posicionamiento científico nacional e internacional", status: "completo" },
  { number: 2, title: "Publicaciones indexadas en Scopus por año, incluyendo su distribución por cuartiles", status: "completo" },
  { number: 3, title: "Productos de generación de nuevo conocimiento", status: "completo" },
  { number: 4, title: "Productos de desarrollo tecnológico e innovación", status: "no_recibido" },
  { number: 5, title: "Productos de formación de recurso humano para la CTeI", status: "no_recibido" },
  { number: 6, title: "Productos de apropiación social del conocimiento", status: "no_recibido" },
  { number: 7, title: "Histórico de investigadores UDES por año", status: "completo" },
  { number: 8, title: "Evolución de los grupos de investigación categorizados por Minciencias", status: "completo" },
  { number: 9, title: "Grupos de investigación e investigadores categorizados por Minciencias según la convocatoria vigente", status: "completo" },
  { number: 10, title: "Semilleros de investigación y estudiantes vinculados", status: "parcial" },
  { number: 11, title: "Institutos, centros y demás estructuras de investigación vigentes", status: "completo" },
  { number: 12, title: "Histórico de estudiantes coautores de artículos científicos y de trabajos de grado", status: "parcial" },
  { number: 13, title: "Histórico de jóvenes investigadores", status: "completo" },
  { number: 14, title: "Histórico de proyectos de investigación internos y externos", status: "no_oficial" },
  { number: 15, title: "Proyectos internos y externos en ejecución", status: "no_recibido" },
  { number: 16, title: "Capacidades de infraestructura para la investigación", status: "no_recibido" },
  { number: 17, title: "Otros indicadores, resultados o logros relevantes", status: "abierto" },
];

const sectionKey = (n: number) => `punto-${String(n).padStart(2, "0")}`;

const EXPECTED: { name: string; section: string }[] = [
  { name: "Seccion_Investigacion_UDES_*.docx", section: "Texto, estado y fuente de los 17 puntos" },
  { name: "punto01/posicionamiento_anual.csv", section: sectionKey(1) },
  { name: "punto02/scopus_cuartiles_anual.csv", section: sectionKey(2) },
  { name: "punto02/resumen_citaciones_institucional.csv", section: sectionKey(2) },
  { name: "punto02/top15_investigadores_por_citaciones.csv", section: sectionKey(2) },
  { name: "punto02/top15_investigadores_2021_2025.csv", section: sectionKey(2) },
  { name: "punto03/nuevo_conocimiento_anual.csv", section: sectionKey(3) },
  { name: "punto07/investigadores_por_anio_campus.csv", section: sectionKey(7) },
  { name: "punto08/grupos_categoria_semestral.csv", section: sectionKey(8) },
  { name: "punto08/grupos_categoria_convocatoria.csv", section: sectionKey(8) },
  { name: "punto09/investigadores_categorizados_facultad.csv", section: sectionKey(9) },
  { name: "punto09/efecto_consolidacion_cvudes.csv", section: sectionKey(9) },
  { name: "punto10/semilleros_jovenes_investigadores.csv", section: sectionKey(10) },
  { name: "punto11/institutos_info.csv", section: sectionKey(11) },
  { name: "punto11/institutos_grupos_adscritos.csv", section: sectionKey(11) },
  { name: "punto12/estudiantes_coautores_anual.csv", section: sectionKey(12) },
  { name: "punto13/jovenes_investigadores_por_anio.csv", section: sectionKey(13) },
  { name: "punto13/jovenes_investigadores_por_campus.csv", section: sectionKey(13) },
];

/* --- Utilidades -------------------------------------------------------------------- */

const baseName = (name: string) => name.split("/").pop()!.toLowerCase();

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Número de un CSV generado por máquina: punto decimal, vacío = sin dato. */
function toNumber(raw: string | undefined): number | null {
  const text = (raw ?? "").trim();
  if (text === "" || text === "-" || text === "—" || /^nan$/i.test(text)) return null;
  const value = Number(text.replace(/%$/, ""));
  return Number.isFinite(value) ? value : null;
}

interface Csv {
  name: string;
  header: string[];
  rows: Record<string, string>[];
}

function termOfCorte(text: string): { year: number; term: "A" | "B" } | null {
  const match = text.match(/(\d{4})\s*-\s*(1|2|A|B|S1|S2)\b/i);
  if (!match) return null;
  const t = match[2].toUpperCase();
  return { year: Number(match[1]), term: t === "1" || t === "A" || t === "S1" ? "A" : "B" };
}

/* --- Texto del Word por punto -------------------------------------------------------- */

function sectionFromDoc(n: number, doc: DocPoint | undefined): PlanSection {
  const fallback = POINTS.find((p) => p.number === n)!;
  const section: PlanSection = {
    key: sectionKey(n),
    number: n,
    title: doc?.title ?? fallback.title,
    status: fallback.status,
    lede: "",
    warning: "",
    source: "",
    requested: [],
  };
  if (!doc) return section;

  const reviewed: string[] = [];
  for (const text of doc.paragraphs) {
    if (/^Estado:/i.test(text)) {
      const state = fold(text);
      section.status = state.includes("no apta") || state.includes("no oficial") ? "no_oficial" : state.includes("parcial") ? "parcial" : "no_recibido";
    } else if (/^Fuente:/i.test(text)) {
      section.source = text.replace(/^Fuente:\s*/i, "").trim();
    } else if (/^Qué se solicitó:/i.test(text)) {
      continue;
    } else if (/^Qué se revisó:/i.test(text)) {
      reviewed.push(text.replace(/^Qué se revisó:\s*/i, "").trim());
    } else if (/^⚠/.test(text)) {
      section.status = section.status === "completo" ? "parcial" : section.status;
      section.warning = text.replace(/^⚠\s*/, "").replace(/^INFORMACIÓN PARCIAL:\s*/i, "").trim();
    } else if (/^Sección abierta/i.test(text)) {
      section.status = "abierto";
      section.lede = text;
    } else if (!section.lede) {
      section.lede = text;
    }
  }
  if (reviewed.length && !section.warning) section.warning = reviewed.join(" ");
  const requested = doc.tables.find((table) => fold(table[0]?.[0] ?? "").startsWith("dato/variable"));
  if (requested) {
    section.requested = requested.slice(1).map((row): RequestedData => ({
      dato: row[0] ?? "",
      responsable: row[1] ?? "",
      periodicidad: row[2] ?? "",
    }));
  }
  return section;
}

/* --- Perfil ------------------------------------------------------------------------- */

function build(files: ImportFile[], context: ImportContext): ImportPlan {
  const warnings: PlanWarning[] = [];
  const used = new Set<string>();
  const warn = (section: string | null, message: string, level: PlanWarning["level"] = "aviso") =>
    warnings.push({ section, level, message });

  // Word: el primero que se parezca a la sección de investigación.
  const docFile = files.find((f) => /\.docx$/i.test(f.name) && f.bytes);
  let points = new Map<number, DocPoint>();
  let headerLines: string[] = [];
  if (docFile) {
    try {
      const doc = splitPoints(readDocx(docFile.bytes!));
      points = doc.points;
      headerLines = doc.lines;
      used.add(docFile.path);
      if (points.size === 0) warn(null, `${docFile.name}: no se encontraron títulos "Punto N." en el Word.`, "error");
    } catch (error) {
      warn(null, `${docFile.name}: ${(error as Error).message}`, "error");
    }
  } else {
    warn(null, "No se subió el Word del informe: se usan títulos y estados por defecto, sin textos ni fuentes.");
  }

  const csv = (name: string): Csv | null => {
    // Por ruta (carpeta subida) o, con archivos sueltos, por nombre: los nombres no se repiten entre puntos.
    const file =
      files.find((f) => f.text !== undefined && f.path.replace(/\\/g, "/").toLowerCase().endsWith(name.toLowerCase())) ??
      files.find((f) => f.text !== undefined && f.name.toLowerCase() === baseName(name));
    if (!file) return null;
    used.add(file.path);
    const [header = [], ...lines] = parseCsv(file.text!);
    const cols = header.map((h) => h.trim());
    return { name: file.name, header: cols, rows: lines.map((line) => Object.fromEntries(cols.map((c, i) => [c, (line[i] ?? "").trim()]))) };
  };
  const missing = (section: string, name: string) => warn(section, `Falta ${name}: el punto queda sin esas cifras.`, "error");

  const sections = POINTS.map((p) => sectionFromDoc(p.number, points.get(p.number)));
  const sectionOf = (n: number) => sections.find((s) => s.number === n)!;

  // Corte y alcance: de las fuentes del Word ("Corte: 2025-2") o del último año del periodo.
  const corteText = sections.map((s) => s.source).find((s) => /Corte:/i.test(s)) ?? "";
  const corte = termOfCorte(corteText.split(/Corte:/i)[1] ?? "") ?? { year: context.years[context.years.length - 1], term: "B" as const };
  const scope = headerLines.find((l) => /^Alcance:/i.test(l))?.replace(/^Alcance:\s*/i, "") ?? "";

  const inPeriod = (year: number) => context.years.includes(year);
  const campusSlug = (label: string) => context.campuses.find((c) => fold(c.label) === fold(label) || c.slug === fold(label))?.slug ?? null;

  const indicators: PlanIndicator[] = [];
  const breakdowns: PlanBreakdown[] = [];
  const heatmaps: PlanHeatmap[] = [];
  const histories: PlanHistory[] = [];
  const tables: PlanTable[] = [];

  /** Indicador anual institucional desde una columna de un CSV con "Año". */
  const annualIndicator = (
    data: Csv,
    column: string,
    base: Omit<PlanIndicator, "values" | "aggregation" | "annual_rule" | "years">,
  ) => {
    const values: PlanIndicator["values"] = [];
    const skipped: number[] = [];
    for (const row of data.rows) {
      const year = Number(row["Año"]);
      if (!Number.isInteger(year)) continue;
      if (!inPeriod(year)) {
        skipped.push(year);
        continue;
      }
      values.push({ year, term: "anual", campus: null, value: toNumber(row[column]) });
    }
    if (skipped.length) warn(base.section, `${base.label}: los años ${skipped.join(", ")} están fuera del periodo y no se cargan como indicador.`);
    const years = values.map((v) => v.year);
    indicators.push({ ...base, aggregation: "reportado", annual_rule: "reportado", years: years.length === context.years.length ? null : years, values });
  };

  /** Desglose anual: cada columna indicada es una categoría. */
  const annualBreakdown = (data: Csv, columns: { column: string; label: string }[], base: Omit<PlanBreakdown, "values" | "annual_rule">) => {
    const values: PlanBreakdown["values"] = [];
    for (const row of data.rows) {
      const year = Number(row["Año"]);
      if (!Number.isInteger(year)) continue;
      columns.forEach(({ column, label }, position) => values.push({ year, term: "anual", label, position: position + 1, value: toNumber(row[column]) }));
    }
    breakdowns.push({ ...base, annual_rule: "reportado", values });
  };

  /* Punto 1 · Visibilidad y posicionamiento */
  {
    const s = sectionOf(1).key;
    const data = csv("posicionamiento_anual.csv");
    if (!data) missing(s, "punto01/posicionamiento_anual.csv");
    else {
      annualIndicator(data, "Total Artículos", {
        key: "articulos-publicados", label: "Artículos publicados", unit: "artículos", format: "entero", direction: "sube",
        definition: "Artículos registrados en la base de producción Scopus/WoS en el año.", section: s, is_kpi: true,
      });
      annualIndicator(data, "%Internacional", {
        key: "colaboracion-internacional", label: "Artículos en colaboración internacional", unit: "%", format: "porcentaje", direction: "sube",
        definition: "Parte de los artículos del año escritos en colaboración con instituciones de otros países.", section: s, is_kpi: true,
      });
      annualBreakdown(data, [
        { column: "Internacional", label: "Internacional" },
        { column: "Nacional", label: "Nacional" },
        { column: "Institucional", label: "Institucional" },
      ], { key: "articulos-por-colaboracion", title: "Artículos por tipo de colaboración", unit: "artículos", format: "entero", chart: "barras", section: s });
      for (const row of data.rows) {
        const parts = ["Internacional", "Nacional", "Institucional"].map((c) => toNumber(row[c]) ?? 0).reduce((a, b) => a + b, 0);
        const total = toNumber(row["Total Artículos"]);
        if (total !== null && parts !== total) warn(s, `${row["Año"]}: Internacional + Nacional + Institucional = ${parts}, pero el total dice ${total}.`);
      }
    }
  }

  /* Punto 2 · Scopus por cuartiles, citaciones y ranking */
  {
    const s = sectionOf(2).key;
    const quartiles = csv("scopus_cuartiles_anual.csv");
    if (!quartiles) missing(s, "punto02/scopus_cuartiles_anual.csv");
    else {
      annualIndicator(quartiles, "Total Artículos", {
        key: "articulos-scopus", label: "Artículos en Scopus", unit: "artículos", format: "entero", direction: "sube",
        definition: "Artículos indexados en Scopus en el año.", section: s, is_kpi: true,
      });
      annualIndicator(quartiles, "%Q1+Q2", {
        key: "articulos-q1-q2", label: "Artículos en cuartiles Q1 y Q2", unit: "%", format: "porcentaje", direction: "sube",
        definition: "Parte de los artículos Scopus del año publicados en revistas de los dos primeros cuartiles.", section: s, is_kpi: true,
      });
      annualBreakdown(quartiles, ["Q1", "Q2", "Q3", "Q4"].map((q) => ({ column: q, label: q })), {
        key: "articulos-por-cuartil", title: "Artículos Scopus por cuartil", unit: "artículos", format: "entero", chart: "barras", section: s,
      });
      // Totales que no cuadran con el punto 1.
      const p1 = indicators.find((i) => i.key === "articulos-publicados");
      for (const row of quartiles.rows) {
        const year = Number(row["Año"]);
        const total = toNumber(row["Total Artículos"]);
        const other = p1?.values.find((v) => v.year === year)?.value ?? null;
        if (total !== null && other !== null && total !== other) {
          warn(s, `${year}: Scopus reporta ${total} artículos y el punto 1 reporta ${other}. Son bases distintas (Scopus frente a Scopus/WoS); conviene aclararlo en el texto.`);
        }
      }
    }

    const summary = csv("resumen_citaciones_institucional.csv");
    if (!summary) missing(s, "punto02/resumen_citaciones_institucional.csv");
    else {
      const row = summary.rows[0] ?? {};
      tables.push({
        key: "citaciones-2021-2025", title: "Citaciones Scopus 2021-2025", description: "Cifras acumuladas del periodo 2021-2025, no de un año.",
        display: "cifras", section: s,
        columns: [
          { key: "etiqueta", label: "Cifra", format: "texto" },
          { key: "valor", label: "Valor", format: "entero" },
          { key: "unidad", label: "Unidad", format: "texto" },
          { key: "alcance", label: "Alcance", format: "texto" },
        ],
        rows: [
          { etiqueta: "Investigadores con perfil Scopus", valor: toNumber(row["N_investigadores_con_perfil_Scopus"]), unidad: "investigadores", alcance: "2021-2025" },
          { etiqueta: "Citas acumuladas", valor: toNumber(row["Total_citas_2021_2025"]), unidad: "citas", alcance: "2021-2025" },
          { etiqueta: "Documentos", valor: toNumber(row["Total_output_2021_2025"]), unidad: "documentos", alcance: "2021-2025" },
          { etiqueta: "Citas por documento", valor: toNumber(row["Promedio_citas_por_documento_institucional"]), unidad: "promedio institucional", alcance: "2021-2025" },
        ],
      });
    }

    const byCites = csv("top15_investigadores_por_citaciones.csv");
    if (byCites) {
      tables.push({
        key: "top-investigadores-citas", title: "Investigadores con más citas, 2021-2025", description: "Los 15 investigadores con más citas acumuladas según su perfil Scopus.",
        display: "ranking", section: s,
        columns: [
          { key: "nombre", label: "Investigador", format: "texto" },
          { key: "auid", label: "ID Scopus", format: "texto" },
          { key: "documentos", label: "Documentos", format: "entero" },
          { key: "citas", label: "Citas", format: "entero" },
          { key: "citas_documento", label: "Citas por documento", format: "decimal" },
        ],
        rows: byCites.rows.map((r) => ({
          nombre: r["Nombre completo"], auid: r["Auid"], documentos: toNumber(r["Output"]), citas: toNumber(r["Cites"]), citas_documento: toNumber(r["Cites per document"]),
        })),
      });
    }
    const byDocs = csv("top15_investigadores_2021_2025.csv");
    if (byDocs) {
      const yearCols = byDocs.header.filter((h) => /^Docs\d{4}$/.test(h));
      tables.push({
        key: "top-investigadores-documentos", title: "Investigadores con más documentos, 2021-2025", description: "Los 15 investigadores con más documentos Scopus, año por año.",
        display: "ranking", section: s,
        columns: [
          { key: "nombre", label: "Investigador", format: "texto" },
          ...yearCols.map((c) => ({ key: c, label: c.replace("Docs", ""), format: "entero" as const })),
          { key: "total", label: "Total", format: "entero" },
        ],
        rows: byDocs.rows.map((r) => ({
          nombre: r["Nombre completo"], ...Object.fromEntries(yearCols.map((c) => [c, toNumber(r[c])])), total: toNumber(r["Total_2021_2025"]),
        })),
      });
    }
  }

  /* Punto 3 · Nuevo conocimiento */
  {
    const s = sectionOf(3).key;
    const data = csv("nuevo_conocimiento_anual.csv");
    if (!data) missing(s, "punto03/nuevo_conocimiento_anual.csv");
    else {
      annualIndicator(data, "Total", {
        key: "productos-nuevo-conocimiento", label: "Productos de nuevo conocimiento", unit: "productos", format: "entero", direction: "sube",
        definition: "Artículos científicos, capítulos de libro y libros del año.", section: s, is_kpi: true,
      });
      annualBreakdown(data, [
        { column: "Artículos científicos", label: "Artículos científicos" },
        { column: "Capítulos de libro", label: "Capítulos de libro" },
        { column: "Libros", label: "Libros" },
      ], { key: "nuevo-conocimiento-por-tipo", title: "Productos de nuevo conocimiento por tipo", unit: "productos", format: "entero", chart: "barras", section: s });
    }
  }

  /* Punto 7 · Investigadores por año, campus y dedicación */
  {
    const s = sectionOf(7).key;
    const data = csv("investigadores_por_anio_campus.csv");
    if (!data) missing(s, "punto07/investigadores_por_anio_campus.csv");
    else {
      const campusColumns = data.header.filter((h) => campusSlug(h));
      const values: PlanIndicator["values"] = [];
      for (const row of data.rows) {
        const year = Number(row["Año"]);
        if (!inPeriod(year)) continue;
        for (const column of campusColumns) values.push({ year, term: "anual", campus: campusSlug(column), value: toNumber(row[column]) });
        const campusSum = campusColumns.map((c) => toNumber(row[c]) ?? 0).reduce((a, b) => a + b, 0);
        const total = toNumber(row["Total"]);
        if (total !== null && total !== campusSum) warn(s, `${year}: la suma de campus (${campusSum}) no coincide con el total (${total}).`);
        const tc = toNumber(row["TC"]);
        const tp = toNumber(row["TP"]);
        const td = toNumber(row["TD"]);
        if (tc !== null && tp !== null && td !== null && tc + tp === td && total === tc + tp + td) {
          warn(s, `${year}: TD (${td}) es igual a TC + TP, y el total (${total}) suma TC + TP + TD. Si TD es un subtotal, el total por campus estaría contado dos veces. Confirmar con la VI qué significa TD antes de publicar.`, "error");
        }
      }
      const years = [...new Set(values.map((v) => v.year))];
      const absent = context.years.filter((y) => !years.includes(y));
      if (absent.length) warn(s, `Investigadores: no hay cifra para ${absent.join(", ")}.`);
      indicators.push({
        key: "investigadores", label: "Docentes con dedicación a la investigación", unit: "investigadores", format: "entero", direction: "sube",
        aggregation: "suma", annual_rule: "reportado", definition: "Docentes con horas de dedicación a la investigación en el año, por campus.",
        section: s, is_kpi: true, years, values,
      });
      annualBreakdown(data, [
        { column: "TC", label: "TC" },
        { column: "TP", label: "TP" },
        { column: "TD", label: "TD" },
      ], { key: "investigadores-por-dedicacion", title: "Investigadores por dedicación (TC, TP, TD)", unit: "investigadores", format: "entero", chart: "barras", section: s });
    }
  }

  /* Punto 8 · Grupos categorizados */
  {
    const s = sectionOf(8).key;
    const semester = csv("grupos_categoria_semestral.csv");
    if (!semester) missing(s, "punto08/grupos_categoria_semestral.csv");
    else {
      const values: PlanIndicator["values"] = [];
      for (const row of semester.rows) {
        const cut = termOfCorte(row["Periodo"] ?? "");
        if (!cut || !inPeriod(cut.year)) continue;
        values.push({ year: cut.year, term: cut.term, campus: null, value: toNumber(row["N_Grupos_Categorizados"]) });
      }
      indicators.push({
        key: "grupos-categorizados", label: "Grupos categorizados por Minciencias", unit: "grupos", format: "entero", direction: "sube",
        aggregation: "reportado", annual_rule: "ultimo", definition: "Grupos de investigación categorizados vigentes en cada periodo académico.",
        section: s, is_kpi: true, years: null, values,
      });
    }
    const calls = csv("grupos_categoria_convocatoria.csv");
    if (!calls) missing(s, "punto08/grupos_categoria_convocatoria.csv");
    else {
      const columns = calls.header.filter((h) => h !== "Convocatoria" && h !== "Total");
      const rows = calls.rows.map((r) => r["Convocatoria"]);
      heatmaps.push({
        key: "grupos-por-convocatoria", title: "Grupos por categoría en cada convocatoria", description: "Resultados de las convocatorias de Minciencias, de 693-2014 a la vigente.",
        row_label: "Convocatoria", column_label: "Categoría", rows, columns, unit: "grupos", format: "entero", empty_meaning: "sin grupos en la categoría", section: s,
        cells: calls.rows.flatMap((r, ri) => columns.map((c, ci) => ({ row: ri, column: ci, value: toNumber(r[c]) }))),
      });
      for (const r of calls.rows) {
        const sum = columns.map((c) => toNumber(r[c]) ?? 0).reduce((a, b) => a + b, 0);
        const total = toNumber(r["Total"]);
        if (total !== null && sum !== total) warn(s, `Convocatoria ${r["Convocatoria"]}: las categorías suman ${sum} y el total dice ${total}.`);
      }
    }
  }

  /* Punto 9 · Investigadores categorizados */
  {
    const s = sectionOf(9).key;
    const faculties = csv("investigadores_categorizados_facultad.csv");
    if (!faculties) missing(s, "punto09/investigadores_categorizados_facultad.csv");
    else {
      const columns = faculties.header.filter((h) => h !== "Facultad");
      const rows = faculties.rows.map((r) => r["Facultad"]);
      heatmaps.push({
        key: "categorizados-por-facultad", title: "Investigadores categorizados por facultad y categoría", description: `Convocatoria vigente, corte ${corte.year}-${corte.term}.`,
        row_label: "Facultad", column_label: "Categoría", rows, columns, unit: "investigadores", format: "entero", empty_meaning: "sin investigadores en la categoría", section: s,
        cells: faculties.rows.flatMap((r, ri) => columns.map((c, ci) => ({ row: ri, column: ci, value: toNumber(r[c]) }))),
      });
      const total = faculties.rows.flatMap((r) => columns.map((c) => toNumber(r[c]) ?? 0)).reduce((a, b) => a + b, 0);
      if (inPeriod(corte.year)) {
        indicators.push({
          key: "investigadores-categorizados", label: "Investigadores categorizados por Minciencias", unit: "investigadores", format: "entero", direction: "sube",
          aggregation: "reportado", annual_rule: "ultimo", definition: "Investigadores categorizados y vinculados en la convocatoria vigente, sin duplicados.",
          section: s, is_kpi: true, years: [corte.year], values: [{ year: corte.year, term: corte.term, campus: null, value: total }],
        });
      }
      // Facultades que solo difieren en tildes o letras repetidas.
      const seen = new Map<string, string>();
      for (const name of rows) {
        const id = fold(name).replace(/([aeiou])\1+/g, "$1");
        if (seen.has(id)) warn(s, `Facultades posiblemente duplicadas: "${seen.get(id)}" y "${name}". Se cargan tal cual; conviene unificarlas en la fuente.`, "error");
        else seen.set(id, name);
      }
    }
    const cvudes = csv("efecto_consolidacion_cvudes.csv");
    if (cvudes) {
      const [nameCol, apartCol, mergedCol] = cvudes.header;
      tables.push({
        key: "efecto-cvudes", title: "Investigadores categorizados por campus, con y sin CVUDES", description: "Cómo cambia la cifra por campus si el campus virtual (CVUDES) se cuenta aparte o dentro de Bucaramanga.",
        display: "tabla", section: s,
        columns: [
          { key: "campus", label: nameCol, format: "texto" },
          { key: "aparte", label: apartCol, format: "entero" },
          { key: "consolidado", label: mergedCol, format: "entero" },
        ],
        rows: cvudes.rows.map((r) => ({ campus: r[nameCol], aparte: toNumber(r[apartCol]), consolidado: toNumber(r[mergedCol]) })),
      });
      if (inPeriod(corte.year)) {
        breakdowns.push({
          key: "categorizados-por-campus", title: "Investigadores categorizados por campus (CVUDES aparte)", unit: "investigadores", format: "entero", chart: "circular",
          annual_rule: "ultimo", section: s,
          values: cvudes.rows.map((r, i) => ({ year: corte.year, term: corte.term, label: r[nameCol], position: i + 1, value: toNumber(r[apartCol]) })),
        });
      }
    }
  }

  /* Punto 10 · Semilleros (parcial) */
  {
    const s = sectionOf(10).key;
    const data = csv("semilleros_jovenes_investigadores.csv");
    if (!data) missing(s, "punto10/semilleros_jovenes_investigadores.csv");
    else {
      tables.push({
        key: "semilleros", title: "Semilleros de origen de los jóvenes investigadores", description: "Semillero declarado por los jóvenes investigadores históricos. No es el universo de semilleros activos.",
        display: "ranking", section: s,
        columns: [
          { key: "semillero", label: "Semillero", format: "texto" },
          { key: "jovenes", label: "Jóvenes investigadores", format: "entero" },
        ],
        rows: data.rows.map((r) => ({ semillero: r["Semillero"], jovenes: toNumber(r["N_jovenes_investigadores_asociados"]) })),
      });
      const groups = new Map<string, string[]>();
      for (const r of data.rows) {
        const id = fold(r["Semillero"]).replace(/[^a-z0-9]/g, "");
        if (!id) {
          warn(s, `Hay un semillero sin nombre ("${r["Semillero"]}").`);
          continue;
        }
        groups.set(id, [...(groups.get(id) ?? []), r["Semillero"]]);
      }
      const duplicates = [...groups.values()].filter((names) => names.length > 1);
      if (duplicates.length) {
        warn(s, `Semilleros escritos de varias formas: ${duplicates.map((names) => names.map((n) => `"${n}"`).join(" / ")).join("; ")}. La lista tiene ${data.rows.length} filas, pero serían ${groups.size} semilleros distintos.`, "error");
      }
      if (inPeriod(corte.year)) {
        indicators.push({
          key: "semilleros-identificados", label: "Semilleros identificados (parcial)", unit: "semilleros", format: "entero", direction: "neutro",
          aggregation: "reportado", annual_rule: "ultimo", definition: "Semilleros distintos declarados por los jóvenes investigadores históricos. Información parcial.",
          section: s, is_kpi: false, years: [corte.year], values: [{ year: corte.year, term: corte.term, campus: null, value: data.rows.length }],
        });
      }
    }
  }

  /* Punto 11 · Institutos */
  {
    const s = sectionOf(11).key;
    const info = csv("institutos_info.csv");
    if (!info) missing(s, "punto11/institutos_info.csv");
    else {
      tables.push({
        key: "institutos", title: "Institutos de investigación vigentes", description: "", display: "fichas", section: s,
        columns: [
          { key: "instituto", label: "Instituto", format: "texto" },
          { key: "facultad", label: "Facultad", format: "texto" },
          { key: "focos", label: "Focos estratégicos", format: "texto" },
          { key: "acuerdo", label: "Acuerdo de creación", format: "texto" },
          { key: "estado", label: "Estado", format: "texto" },
          { key: "sitio", label: "Sitio web", format: "enlace" },
          { key: "grupos", label: "Grupos adscritos", format: "entero" },
        ],
        rows: info.rows.map((r) => ({
          instituto: r["Instituto"], facultad: r["Facultad"], focos: r["Focos estratégicos"], acuerdo: r["Acuerdo de creación"],
          estado: r["Estado"].trim(), sitio: r["Sitio web"], grupos: toNumber(r["N_grupos_adscritos"]),
        })),
      });
      if (inPeriod(corte.year)) {
        indicators.push({
          key: "institutos", label: "Institutos de investigación vigentes", unit: "institutos", format: "entero", direction: "sube",
          aggregation: "reportado", annual_rule: "ultimo", definition: "Institutos de investigación avalados o reconocidos al corte.",
          section: s, is_kpi: false, years: [corte.year], values: [{ year: corte.year, term: corte.term, campus: null, value: info.rows.length }],
        });
      }
      const groups = csv("institutos_grupos_adscritos.csv");
      if (groups) {
        tables.push({
          key: "grupos-por-instituto", title: "Grupos adscritos a cada instituto", description: "", display: "tabla", section: s,
          columns: [
            { key: "instituto", label: "Instituto", format: "texto" },
            { key: "grupo", label: "Grupo de investigación", format: "texto" },
          ],
          rows: groups.rows.map((r) => ({ instituto: r["Instituto"], grupo: r["Grupo"].trim() })),
        });
        for (const r of info.rows) {
          const declared = toNumber(r["N_grupos_adscritos"]);
          const listed = groups.rows.filter((g) => g["Instituto"] === r["Instituto"]).length;
          if (declared !== null && declared !== listed) warn(s, `${r["Instituto"]}: declara ${declared} grupos adscritos y la lista trae ${listed}.`);
        }
      }
    }
  }

  /* Punto 12 · Estudiantes coautores (parcial) */
  {
    const s = sectionOf(12).key;
    const data = csv("estudiantes_coautores_anual.csv");
    if (!data) missing(s, "punto12/estudiantes_coautores_anual.csv");
    else {
      annualIndicator(data, "N_publicaciones_con_estudiantes", {
        key: "publicaciones-con-estudiantes", label: "Publicaciones con estudiantes coautores", unit: "publicaciones", format: "entero", direction: "sube",
        definition: "Publicaciones del año con al menos un estudiante UDES declarado como coautor. Cobertura parcial.", section: s, is_kpi: false,
      });
      annualIndicator(data, "N_estudiantes_coautores", {
        key: "estudiantes-coautores", label: "Estudiantes coautores", unit: "estudiantes", format: "entero", direction: "sube",
        definition: "Estudiantes UDES declarados como coautores en publicaciones del año. Cifra subestimada.", section: s, is_kpi: false,
      });
    }
  }

  /* Punto 13 · Jóvenes investigadores */
  {
    const s = sectionOf(13).key;
    const byYear = csv("jovenes_investigadores_por_anio.csv");
    if (!byYear) missing(s, "punto13/jovenes_investigadores_por_anio.csv");
    else {
      const rows = byYear.rows.filter((r) => /^\d{4}$/.test(r["Año"]));
      histories.push({
        key: "jovenes-investigadores-historico", title: "Jóvenes investigadores vinculados por año", description: "Serie histórica completa, desde el primer joven investigador.",
        unit: "jóvenes investigadores", format: "entero", total_label: "Jóvenes investigadores", section: s,
        values: rows.map((r) => ({ period: r["Año"], category: "", position: 0, value: toNumber(r["N_Jovenes_Investigadores"]) })),
      });
      const years = rows.map((r) => Number(r["Año"]));
      const gaps: number[] = [];
      for (let y = Math.min(...years); y <= Math.max(...years); y += 1) if (!years.includes(y)) gaps.push(y);
      if (gaps.length) warn(s, `Jóvenes investigadores: la serie no trae ${gaps.join(", ")}. Si no hubo vinculaciones, conviene que la fuente lo diga con 0.`);
      annualIndicator(byYear, "N_Jovenes_Investigadores", {
        key: "jovenes-investigadores", label: "Jóvenes investigadores vinculados", unit: "jóvenes investigadores", format: "entero", direction: "sube",
        definition: "Jóvenes investigadores vinculados en el año.", section: s, is_kpi: false,
      });
    }
    const byCampus = csv("jovenes_investigadores_por_campus.csv");
    if (byCampus) {
      const lastYear = Math.max(...(byYear?.rows.map((r) => Number(r["Año"])).filter(Number.isFinite) ?? [corte.year]));
      const year = inPeriod(lastYear) ? lastYear : corte.year;
      breakdowns.push({
        key: "jovenes-por-campus", title: "Jóvenes investigadores por campus (acumulado histórico)", unit: "jóvenes investigadores", format: "entero", chart: "barras",
        annual_rule: "reportado", section: s,
        values: byCampus.rows.map((r, i) => ({ year, term: "anual", label: r["Campus"], position: i + 1, value: toNumber(r["N_Jovenes_Investigadores"]) })),
      });
      for (const r of byCampus.rows) {
        if (!campusSlug(r["Campus"])) warn(s, `"${r["Campus"]}" aparece como campus, pero no es un campus del periodo. Se muestra como categoría del desglose.`);
      }
    }
  }

  /* Punto 14 · no oficial: el CSV existe, pero no se publica. */
  {
    const file = files.find((f) => /proyectos_por_publicaciones\.csv$/i.test(f.name));
    if (file) {
      used.add(file.path);
      warn(sectionOf(14).key, `${file.name} no se carga: la propia VI lo marca como insumo no oficial.`);
    }
  }

  /* --- Bloques de la ficha, punto por punto ------------------------------------------ */
  const blocks: PlanBlock[] = [];
  for (const section of sections) {
    const own = indicators.filter((i) => i.section === section.key);
    if (own.length) blocks.push({ kind: "kpis", ref: null, section: section.key, settings: { indicators: own.map((i) => i.key) } });
    breakdowns.filter((b) => b.section === section.key).forEach((b) => blocks.push({ kind: "desgloses", ref: `desglose:${b.key}`, section: section.key, settings: {} }));
    heatmaps.filter((h) => h.section === section.key).forEach((h) => blocks.push({ kind: "mapa_calor", ref: `calor:${h.key}`, section: section.key, settings: {} }));
    histories.filter((h) => h.section === section.key).forEach((h) => blocks.push({ kind: "historico", ref: `historico:${h.key}`, section: section.key, settings: {} }));
    tables.filter((t) => t.section === section.key).forEach((t) => blocks.push({ kind: "tabla", ref: `tabla:${t.key}`, section: section.key, settings: {} }));
  }
  blocks.push(
    { kind: "evolucion", ref: null, section: null, settings: { chart: "lineas" } },
    { kind: "tabla_dinamica", ref: null, section: null, settings: {} },
    { kind: "metodologia", ref: null, section: null, settings: {} },
  );

  // Periodicidad: lo que solo trae cifras del año se reporta por año.
  for (const set of [...indicators, ...breakdowns]) {
    set.reporting = set.values.some((v) => v.term !== "anual") ? "periodo" : "anual";
    if (set.reporting === "anual") set.annual_rule = "reportado";
  }

  const firstLine = headerLines.find((l) => /Extracto|Boletín/i.test(l)) ?? "";
  return {
    profile: "investigacion",
    report: "investigacion",
    office: OFFICE,
    title: firstLine || "Sección Investigación",
    scope,
    corte: `${corte.year}-${corte.term}`,
    sections,
    indicators,
    breakdowns,
    heatmaps,
    histories,
    tables,
    blocks,
    warnings,
    files: files.map((f) => {
      const match = EXPECTED.find(
        (e) => f.path.replace(/\\/g, "/").toLowerCase().endsWith(e.name.replace("*", "").toLowerCase()) || f.name.toLowerCase() === baseName(e.name),
      );
      return { name: f.path || f.name, section: match?.section.startsWith("punto") ? match.section : null, used: used.has(f.path) };
    }),
  };
}

export const investigacionProfile: ImportProfile = {
  id: "investigacion",
  report: "investigacion",
  name: "Sección Investigación (Vicerrectoría de Investigaciones)",
  description: "El Word del boletín con sus 17 puntos y la carpeta datos_procesados con un CSV por tabla.",
  expected: EXPECTED,
  build,
};

export const IMPORT_PROFILES: ImportProfile[] = [investigacionProfile];
