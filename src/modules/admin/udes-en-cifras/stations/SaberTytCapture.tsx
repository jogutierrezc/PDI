/* =============================================================================
   Motor Beta · Saber 11 → Saber TyT en la intranet (0035).

   · SaberTytForm (Estructura): título, alcance, nota metodológica y oficina.
     Un informe lleva un solo conjunto.
   · SaberTytCapture (Captura):
     1. Importar el cruce del ICFES. El Excel con una fila por evaluado —el que
        trae `estu_consecutivo`, la llave de la persona— se lee en este
        navegador. Se convierte cada puntaje a su percentil dentro de la cohorte
        histórica, se agrega por año, nivel, programa y competencia, y solo eso
        sube: agregados y las curvas de percentil. El consecutivo no sale del
        equipo.
     2. Años cargados, con sus cifras y la opción de borrar un año entero.

   El archivo no dice el nivel de formación (la fuente no trae esa columna): se
   elige antes de guardar y se aplica a todo el archivo.
   ========================================================================== */

import { useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdSaberTytResultRow, OdSaberTytRow } from "../../../../types/database";
import {
  TYT_COMPETENCIES,
  TYT_LEVEL_LABEL,
  aggregateTytRecords,
  isPaired,
  tytFigure,
} from "../../../datos-abiertos/data/saber-tyt";
import { ALPHA_CITATION, ALPHA_FIT_LABEL, ALPHA_NATIONAL, ALPHA_PREDICTORS, emptyAlpha } from "../../../datos-abiertos/data/saber-alpha";
import type { AlphaData, AlphaModel, AlphaPredictor } from "../../../datos-abiertos/data/saber-alpha";
import type { SaberTytData, TytBenchmarks, TytCompetency, TytLevel, TytRecord, TytResult } from "../../../datos-abiertos/data/saber-tyt";
import type { StationProps } from "../OdAdmin";
import { useDeleteSaberTytYear, useReplaceSaberTytResults, useSaveSaberTyt } from "../od-data";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../ui";

/* --- Estructura: definir el conjunto ------------------------------------------------ */

export interface SaberTytFields {
  title: string;
  description: string;
  note: string;
  office_id: string;
}

export function SaberTytForm({
  offices,
  initial,
  onSubmit,
  onCancel,
}: {
  offices: StationProps["data"]["rows"]["offices"];
  initial?: Partial<SaberTytFields>;
  onSubmit: (fields: SaberTytFields) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<SaberTytFields>({ title: "Saber TyT · Motor Beta", description: "", note: "", office_id: "", ...initial });
  const set = (patch: Partial<SaberTytFields>) => setF({ ...f, ...patch });

  return (
    <form className="oda-inline-form" onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) onSubmit({ ...f, title: f.title.trim() }); }}>
      <div className="oda-form-grid">
        <label className="admin-field admin-field--wide">
          <span>Título</span>
          <input autoFocus required value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Descripción</span>
          <textarea rows={2} value={f.description} placeholder="Qué mide el motor: de dónde parte el estudiante y a dónde llega" onChange={(e) => set({ description: e.target.value })} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Nota metodológica</span>
          <textarea rows={3} value={f.note} placeholder="Fuente, qué cuenta como evaluado, cómo se pareja el Saber 11 con el Saber TyT" onChange={(e) => set({ note: e.target.value })} />
          <small>Se muestra bajo el bloque, en la ficha.</small>
        </label>
        <label className="admin-field">
          <span>Oficina que reporta</span>
          <select value={f.office_id} onChange={(e) => set({ office_id: e.target.value })}>
            <option value="">Sin oficina</option>
            {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      </div>
      <div className="oda-inline-form__actions">
        <button type="button" className="button-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="button-primary">{initial?.title ? "Guardar" : "Crear Saber TyT · Motor Beta"}</button>
      </div>
    </form>
  );
}

/* --- Lectura del cruce del ICFES ------------------------------------------------------ */

type Cell = string | number | boolean | Date | null | undefined;

interface WorkbookSheet {
  name: string;
  rows: Cell[][];
}

/** Encabezado comparable: sin tildes, en minúsculas y con guion bajo entre palabras. */
const foldHeader = (value: Cell) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Texto comparable: mayúsculas, sin tildes y con espacios simples. */
const foldText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const text = (value: Cell) => String(value ?? "").replace(/\s+/g, " ").trim();

/** Puntajes de la prueba de salida (Saber TyT). */
const EXIT_HEADERS: Record<string, TytCompetency> = {
  punt_global: "global",
  mod_lectura_critica_punt: "lc",
  mod_razona_cuantitat_punt: "rc",
  mod_competen_ciudada_punt: "cc",
  mod_ingles_punt: "ing",
  mod_comuni_escrita_punt: "ce",
};

/** Puntajes de la prueba de entrada (Saber 11). */
const ENTRY_HEADERS: Record<string, TytCompetency> = {
  sb11_punt_global: "global",
  sb11_punt_lectura_critica: "lc",
  sb11_punt_matematicas: "rc",
  sb11_punt_sociales_ciudadanas: "cc",
  sb11_punt_ingles: "ing",
  sb11_punt_c_naturales: "cn",
};

interface Layout {
  headerRow: number;
  year: number;
  program: number;
  exit: Partial<Record<TytCompetency, number>>;
  entry: Partial<Record<TytCompetency, number>>;
}

/**
 * La hoja buena es la que cruza las dos pruebas: su fila de encabezados trae a
 * la vez `estu_consecutivo` y `punt_global` (en el archivo real, la hoja
 * «Resultado»).
 */
function findLayout(rows: Cell[][]): Layout | null {
  for (let r = 0; r < Math.min(rows.length, 15); r += 1) {
    const headers = (rows[r] ?? []).map(foldHeader);
    if (!headers.includes("estu_consecutivo") || !headers.includes("punt_global")) continue;
    const exit: Layout["exit"] = {};
    const entry: Layout["entry"] = {};
    headers.forEach((header, i) => {
      const out = EXIT_HEADERS[header];
      if (out && exit[out] === undefined) exit[out] = i;
      const into = ENTRY_HEADERS[header];
      if (into && entry[into] === undefined) entry[into] = i;
    });
    return { headerRow: r, year: headers.indexOf("periodo"), program: headers.indexOf("estu_prgm_academico"), exit, entry };
  }
  return null;
}

/** Año del periodo: los cuatro primeros dígitos («20241» → 2024). */
function yearOf(value: Cell): number | null {
  if (value instanceof Date) return value.getFullYear();
  const match = String(value ?? "").match(/(?:19|20)\d{2}/);
  const year = match ? Number(match[0]) : NaN;
  return year >= 2000 && year <= 2100 ? year : null;
}

/** Un puntaje 0, negativo o que no es número es una prueba no presentada: null, nunca cero. */
function tytScore(value: Cell): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "number" ? value : Number(String(value).replace(",", ".").trim());
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

/* --- Nombres de programa ------------------------------------------------------------
   La fuente llega con dos averías: caracteres perdidos («GR¿FICA», «PRODUCCI¿N»)
   y el mismo programa escrito con y sin tildes. Las dos se arreglan con el
   propio archivo: se arma el léxico de palabras sanas, se repone la vocal que
   falta probando cuál deja una palabra que ya existe, y cada palabra adopta la
   forma más completa que aparezca en la hoja. Así las variantes terminan en un
   solo nombre, en Mayúsculas Iniciales con las palabras menores en minúscula. */

const DAMAGED = /[¿�]/;
const ACCENTED_VOWELS = ["Á", "É", "Í", "Ó", "Ú"];
const SMALL_WORDS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "en", "a", "al", "con", "para", "por"]);

/** Cuántas tildes (o virgulillas) lleva: mide qué tan completa está la palabra. */
const marks = (word: string) => (word.normalize("NFD").match(/[̀-ͯ]/g) ?? []).length;

const titleCase = (value: string) =>
  value
    .toLocaleLowerCase("es")
    .split(" ")
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toLocaleUpperCase("es") + word.slice(1)))
    .join(" ");

/** Limpiador armado con los nombres del propio archivo. */
function programCleaner(raw: string[]) {
  const lexicon = new Set<string>();
  /** Palabra sin tildes → la forma más completa vista en la hoja. */
  const best = new Map<string, string>();
  for (const name of raw) {
    for (const word of text(name).toLocaleUpperCase("es").split(" ")) {
      if (!word || DAMAGED.test(word)) continue;
      const key = foldText(word);
      lexicon.add(key);
      const seen = best.get(key);
      if (!seen || marks(word) > marks(seen)) best.set(key, word);
    }
  }

  const repair = (word: string): string => {
    if (!DAMAGED.test(word)) return best.get(foldText(word)) ?? word;
    const slots = [...word].map((c, i) => (DAMAGED.test(c) ? i : -1)).filter((i) => i >= 0);
    // Con más de dos huecos ya no se adivina: se deja como vino.
    if (slots.length > 2) return word;
    const tries: string[] = [];
    const build = (at: number, current: string[]) => {
      if (at === slots.length) return void tries.push(current.join(""));
      for (const vowel of ACCENTED_VOWELS) {
        const next = [...current];
        next[slots[at]] = vowel;
        build(at + 1, next);
      }
    };
    build(0, [...word]);
    const hit = tries.find((t) => lexicon.has(foldText(t)));
    if (!hit) return word;
    const known = best.get(foldText(hit));
    return known && marks(known) > marks(hit) ? known : hit;
  };

  return (name: string) => {
    const cleaned = text(name).toLocaleUpperCase("es").split(" ").filter(Boolean).map(repair).join(" ");
    return cleaned ? titleCase(cleaned) : "";
  };
}

/* --- El plan de importación ---------------------------------------------------------- */

interface YearSummary {
  year: number;
  evaluated: number;
  crossed: number;
  programs: number;
}

interface ImportPlan {
  fileName: string;
  sheet: string;
  results: TytResult[];
  benchmarks: TytBenchmarks;
  years: YearSummary[];
  programs: string[];
  /** Filas sin año o sin programa: números de fila como los cuenta Excel. */
  skipped: number[];
  /** Competencias cuya columna no está en la hoja. */
  missing: string[];
  /** Lectura institucional: entrada, salida y valor agregado del global. */
  readout: { entry: number | null; exit: number | null; delta: number | null } | null;
  /** Motor Alpha: coeficientes ajustados sobre toda la cohorte del archivo. */
  alpha: AlphaData;
  /** Lectura Alpha del puntaje global: esperado, real y valor agregado. */
  alphaReadout: { expected: number | null; actual: number | null; va: number | null } | null;
  /** El ajuste del puntaje global con el que se calcularon esas cifras. */
  alphaModel: AlphaModel | undefined;
}

/**
 * Hoja → agregados. Los registros de cada persona viven solo dentro de esta
 * función: lo que devuelve ya no tiene a nadie.
 */
function planFrom(sheet: WorkbookSheet, fileName: string, level: TytLevel): ImportPlan | string {
  const layout = findLayout(sheet.rows);
  if (!layout) return `La hoja «${sheet.name}» no cruza las dos pruebas: sus primeras filas no traen a la vez «estu_consecutivo» y «punt_global».`;
  const absent = ([["periodo", layout.year], ["estu_prgm_academico", layout.program]] as const).filter(([, at]) => at < 0).map(([name]) => name);
  if (absent.length) return `A la hoja «${sheet.name}» le faltan las columnas ${absent.join(", ")}.`;

  const body = sheet.rows.slice(layout.headerRow + 1);
  const clean = programCleaner(body.map((row) => text(row?.[layout.program])));

  const records: TytRecord[] = [];
  const skipped: number[] = [];
  body.forEach((row = [], i) => {
    if (row.every((cellValue) => text(cellValue) === "")) return;
    const year = yearOf(row[layout.year]);
    const program = clean(text(row[layout.program]));
    if (year === null || !program) {
      skipped.push(layout.headerRow + i + 2);
      return;
    }
    const record: TytRecord = { year, level, program, entry: {}, exit: {} };
    for (const { key } of TYT_COMPETENCIES) {
      const outAt = layout.exit[key];
      if (outAt !== undefined) record.exit[key] = tytScore(row[outAt]);
      const inAt = layout.entry[key];
      if (inAt !== undefined) record.entry[key] = tytScore(row[inAt]);
    }
    records.push(record);
  });
  if (records.length === 0) return `La hoja «${sheet.name}» no trae filas con año y programa.`;

  // El ajuste "ampliado" (sin ciencias naturales) es el que cubre a más estudiantes.
  const { results, benchmarks, alpha } = aggregateTytRecords(records, ALPHA_IMPORT_FIT);
  if (results.length === 0) return `La hoja «${sheet.name}» no trae puntajes válidos.`;

  const years = Array.from(new Set(records.map((r) => r.year)))
    .sort((a, b) => a - b)
    .map((year) => {
      const own = records.filter((r) => r.year === year);
      return {
        year,
        evaluated: own.length,
        crossed: own.filter((r) => Object.values(r.entry).some((s) => s !== null && s !== undefined)).length,
        programs: new Set(own.map((r) => r.program)).size,
      };
    });

  const figure = tytFigure({ id: "", title: "", description: "", note: "", source: "", benchmarks, alpha, results } as SaberTytData, "global", null);
  return {
    fileName,
    sheet: sheet.name,
    results,
    benchmarks,
    years,
    programs: Array.from(new Set(records.map((r) => r.program))).sort((a, b) => a.localeCompare(b, "es")),
    skipped,
    missing: TYT_COMPETENCIES.filter((c) => (c.exit && layout.exit[c.key] === undefined) || (c.entry && layout.entry[c.key] === undefined)).map((c) => c.label),
    readout: figure ? { entry: figure.meanEntry, exit: figure.meanExit, delta: figure.meanDelta } : null,
    alpha,
    alphaReadout: figure ? { expected: figure.alpha.alphaExpected, actual: figure.alpha.alphaActual, va: figure.alpha.alphaVa } : null,
    alphaModel: alpha.modelos.global?.[ALPHA_IMPORT_FIT],
  };
}

/** "2016–2024" si los años son seguidos; si no, la lista. */
function yearsText(years: number[]): string {
  if (years.length === 0) return "";
  const sorted = [...years].sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  const contiguous = sorted.every((y, i) => i === 0 || y === sorted[i - 1] + 1);
  return contiguous ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(", ");
}

/** El ajuste con el que se calculan las cifras por programa: sin ciencias naturales, cubre a más estudiantes. */
const ALPHA_IMPORT_FIT = "ampliado" as const;

const count = (n: number) => n.toLocaleString("es-CO");
const percentile = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `P${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })}`);
const delta = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })}`;
const share = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)} %` : "—");
/** Puntaje de la prueba, con un decimal. */
const points = (value: number | null | undefined) => (value === null || value === undefined ? "—" : value.toLocaleString("es-CO", { maximumFractionDigits: 1 }));
/** La cita del artículo del que sale el modelo, en una línea. */
const ALPHA_SOURCE = `${ALPHA_CITATION.authors} «${ALPHA_CITATION.title}». ${ALPHA_CITATION.journal}.`;

/* --- Captura ------------------------------------------------------------------------ */

export function SaberTytCapture({ data, report, periodId, canEdit, only }: StationProps) {
  const sets = (data.rows.saberTyt ?? []).filter((t) => t.report_id === report!.uuid && (!only || t.id === only)).sort((a, b) => a.position - b.position);
  const [active, setActive] = useState(sets[0]?.id);
  const tyt = sets.find((t) => t.id === active) ?? sets[0];
  if (!tyt) {
    return (
      <StageEmpty title="Este informe no tiene el Motor Beta">
        Créalo en Estructura y KPI → Conjuntos visuales → Saber TyT · Motor Beta. Luego vuelve aquí para importar el cruce del ICFES.
      </StageEmpty>
    );
  }
  const results = (data.rows.saberTytResults ?? []).filter((r) => r.tyt_id === tyt.id);
  const props = { tyt, results, periodId, reportId: report!.uuid!, published: report!.status === "publicado", canEdit };

  return (
    <div className="oda-stack">
      {sets.length > 1 && (
        <label className="oda-inline-field">
          <span>Conjunto</span>
          <select value={tyt.id} onChange={(e) => setActive(e.target.value)}>
            {sets.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>
      )}
      <TytImport key={`importar-${tyt.id}`} {...props} />
      <TytYears key={`anios-${tyt.id}`} {...props} />
      <TytNational key={`nacional-${tyt.id}-${JSON.stringify(tyt.alpha?.nacional ?? {})}`} {...props} />
    </div>
  );
}

interface SectionProps {
  tyt: OdSaberTytRow;
  results: OdSaberTytResultRow[];
  periodId: string;
  reportId: string;
  published: boolean;
  canEdit: boolean;
}

/* --- 1. Importar el cruce del ICFES -------------------------------------------------- */

function TytImport({ tyt, results, periodId, reportId, published, canEdit }: SectionProps) {
  const save = useReplaceSaberTytResults();
  const fileInput = useRef<HTMLInputElement>(null);
  const [book, setBook] = useState<{ fileName: string; sheets: WorkbookSheet[] } | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [level, setLevel] = useState<TytLevel>("tecnologico");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const sheet = book?.sheets.find((s) => s.name === sheetName);
  const outcome = book && sheet ? planFrom(sheet, book.fileName, level) : null;
  const plan = outcome && typeof outcome !== "string" ? outcome : null;
  const planError = typeof outcome === "string" ? outcome : null;
  const fileYears = plan?.years.map((y) => y.year) ?? [];
  const storedYears = new Set(results.map((r) => r.year));
  const replaced = fileYears.filter((y) => storedYears.has(y));

  const load = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setReadError(null);
    setDone(null);
    setConfirming(false);
    try {
      // Carga bajo demanda: el portal público no descarga el lector.
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const raw = (await readXlsxFile(file)) as unknown as { sheet: string; data: Cell[][] }[];
      const sheets = raw.map((s) => ({ name: s.sheet, rows: s.data }));
      const preferred = sheets.find((s) => findLayout(s.rows));
      setBook({ fileName: file.name, sheets });
      setSheetName((preferred ?? sheets[0])?.name ?? "");
    } catch (error) {
      setBook(null);
      setReadError(`No se pudo leer «${file.name}»: ${error instanceof Error ? error.message : "no parece un .xlsx válido"}.`);
    } finally {
      setReading(false);
    }
  };

  const clear = () => {
    setBook(null);
    setSheetName("");
    setConfirming(false);
  };

  const apply = () => {
    if (!plan) return;
    setConfirming(false);
    const rows: OdSaberTytResultRow[] = plan.results.map((r) => ({
      tyt_id: tyt.id,
      year: r.year,
      level: r.level,
      program: r.program,
      competency: r.competency,
      evaluated: r.evaluated,
      mean_exit: r.meanExit,
      paired: r.paired,
      mean_entry: r.meanEntry,
      mean_delta: r.meanDelta,
      improved: r.improved,
      raw_entry: r.rawEntry,
      raw_exit: r.rawExit,
      transitions: r.transitions,
      histogram: r.histogram,
      scatter: r.scatter,
      // Motor Alpha (0037): lo que el modelo esperaba, lo que se obtuvo y dónde cae en el plano.
      alpha_n: r.alphaN,
      alpha_expected: r.alphaExpected,
      alpha_actual: r.alphaActual,
      alpha_va: r.alphaVa,
      alpha_positive: r.alphaPositive,
      plane: r.plane,
      quadrants: r.quadrants,
      quad_plane: r.quadPlane,
    }));
    const summary = `${count(rows.length)} filas de ${yearsText(fileYears)} guardadas desde «${plan.fileName}».`;
    save.mutate(
      {
        periodId, reportId, tytId: tyt.id, years: fileYears, rows, benchmarks: plan.benchmarks, fileName: plan.fileName,
        // Los promedios nacionales cargados en el conjunto mandan sobre los del artículo.
        alpha: { ...plan.alpha, nacional: tyt.alpha?.nacional ?? plan.alpha.nacional },
      },
      { onSuccess: () => { clear(); setDone(summary); } },
    );
  };

  return (
    <Panel
      id="oda-tyt-importar"
      title="Importar el cruce del ICFES"
      description="El Excel con una fila por evaluado y sus dos pruebas: periodo, programa, los puntajes de Saber TyT (punt_global, mod_…) y los del Saber 11 (sb11_…)."
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          <button type="button" className="button-secondary" disabled={!canEdit || reading || save.isPending} onClick={() => fileInput.current?.click()}>
            <Icon name="document" size={15} /> {reading ? "Leyendo…" : book ? "Otro archivo" : "Elegir archivo .xlsx"}
          </button>
        </>
      }
    >
      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ""; }}
      />
      <div className="oda-import oda-saber">
        <p className="oda-saber__privacy">
          <Icon name="lock" size={15} />
          <span>
            Todo ocurre en este navegador: el cruce, el paso a percentiles y la suma por programa. El archivo trae
            <strong> estu_consecutivo</strong>, la llave de cada persona, y esa columna no se envía a ninguna parte. Solo suben los
            agregados por año, nivel, programa y competencia, y las curvas de percentil de las dos pruebas.
          </span>
        </p>
        {readError && <p className="oda-import__error" role="alert"><Icon name="alert" size={14} /> {readError}</p>}
        {done && !book && <p className="oda-import__ok" role="status"><Icon name="check" size={14} /> {done}</p>}

        {book && (
          <>
            <div className="oda-grid-toolbar">
              <span className="oda-muted"><strong>{book.fileName}</strong></span>
              <label className="oda-inline-field">
                <span>Hoja</span>
                <select value={sheetName} onChange={(e) => { setSheetName(e.target.value); setConfirming(false); }}>
                  {book.sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </label>
              <label className="oda-inline-field">
                <span>Nivel de formación</span>
                <select value={level} onChange={(e) => { setLevel(e.target.value as TytLevel); setConfirming(false); }}>
                  {(Object.keys(TYT_LEVEL_LABEL) as TytLevel[]).map((l) => <option key={l} value={l}>{TYT_LEVEL_LABEL[l]}</option>)}
                </select>
              </label>
              <button type="button" className="oda-link-button" onClick={clear}>Descartar</button>
            </div>
            <p className="oda-import__scope">
              La fuente no trae el nivel: el elegido se aplica a todas las filas del archivo. Es el nivel con el que estos programas están en el SNIES.
            </p>

            {planError && <p className="oda-import__error" role="alert"><Icon name="alert" size={14} /> {planError}</p>}

            {plan && (
              <div className="oda-import__plan">
                <table className="oda-table oda-saber__table">
                  <caption className="sr-only">Lo que trae el archivo, por año</caption>
                  <thead>
                    <tr>
                      <th scope="col">Año</th>
                      <th scope="col">Evaluados</th>
                      <th scope="col">Con Saber 11</th>
                      <th scope="col">Programas</th>
                      <th scope="col">En el portal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.years.map((y) => (
                      <tr key={y.year}>
                        <th scope="row">{y.year}</th>
                        <td>{count(y.evaluated)}</td>
                        <td>{count(y.crossed)} <small className="oda-muted">({share(y.crossed, y.evaluated)})</small></td>
                        <td>{y.programs}</td>
                        <td>{storedYears.has(y.year) ? "se reemplaza" : "año nuevo"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <dl className="oda-import__facts oda-tyt__readout">
                  <div>
                    <dt>Percentil medio de entrada</dt>
                    <dd>{percentile(plan.readout?.entry)} <small>Saber 11, puntaje global</small></dd>
                  </div>
                  <div>
                    <dt>Percentil medio de salida</dt>
                    <dd>{percentile(plan.readout?.exit)} <small>Saber TyT, puntaje global</small></dd>
                  </div>
                  <div>
                    <dt>Valor agregado (VAI)</dt>
                    <dd>{delta(plan.readout?.delta)} <small>puntos de percentil</small></dd>
                  </div>
                </dl>
                <dl className="oda-import__facts oda-tyt__readout">
                  <div>
                    <dt>Puntaje esperado medio</dt>
                    <dd>{points(plan.alphaReadout?.expected)} <small>Motor Alpha, puntaje global</small></dd>
                  </div>
                  <div>
                    <dt>Puntaje real medio</dt>
                    <dd>{points(plan.alphaReadout?.actual)} <small>Saber TyT, puntaje global</small></dd>
                  </div>
                  <div>
                    <dt>Valor agregado (VA)</dt>
                    <dd>{delta(plan.alphaReadout?.va)} <small>puntos de la prueba</small></dd>
                  </div>
                  <div>
                    <dt>Ajuste del modelo</dt>
                    <dd>
                      {plan.alphaModel ? `R² ${plan.alphaModel.r2.toLocaleString("es-CO", { maximumFractionDigits: 3 })}` : "—"}
                      {" "}<small>{plan.alphaModel ? `n = ${count(plan.alphaModel.n)}` : "sin ajuste para el global"}</small>
                    </dd>
                  </div>
                </dl>
                <p className="oda-import__scope">
                  El Motor Alpha usa la regresión publicada ({ALPHA_SOURCE}) reajustada sobre esta cohorte; las cifras por programa salen
                  del ajuste «{ALPHA_FIT_LABEL[ALPHA_IMPORT_FIT].toLowerCase()}», porque cubre a más estudiantes.
                </p>
                <p className="oda-import__scope">
                  El motor ya corrió sobre todo el archivo: {count(plan.programs.length)} programas en {TYT_LEVEL_LABEL[level].toLowerCase()},
                  {" "}{plan.programs.slice(0, 4).join(", ")}{plan.programs.length > 4 ? "…" : ""}.
                </p>

                {(plan.skipped.length > 0 || plan.missing.length > 0) && (
                  <ul className="oda-import__warnings">
                    {plan.skipped.length > 0 && (
                      <li>
                        <span>Aviso · filas sin cargar</span>
                        {count(plan.skipped.length)} {plan.skipped.length === 1 ? "fila no tiene" : "filas no tienen"} periodo o programa y no se cuentan
                        {" "}(fila{plan.skipped.length === 1 ? "" : "s"} {plan.skipped.slice(0, 8).join(", ")}{plan.skipped.length > 8 ? "…" : ""}).
                      </li>
                    )}
                    {plan.missing.length > 0 && (
                      <li>
                        <span>Aviso · competencias ausentes</span>
                        La hoja no trae la columna de {plan.missing.join(", ")} en alguna de las dos pruebas: esas competencias quedarán sin su pareja.
                      </li>
                    )}
                  </ul>
                )}

                <footer className="oda-import__apply">
                  <p>
                    <Icon name="alert" size={15} />
                    <span>
                      Guardar <strong>reemplaza los resultados</strong> de {yearsText(fileYears)}
                      {replaced.length ? ` (hoy cargados: ${yearsText(replaced)})` : ""} y <strong>rehace las curvas de percentil</strong> del
                      conjunto, porque se calculan sobre toda la cohorte del archivo. Los demás años quedan con la curva nueva.
                      {published ? " El informe está publicado: el cambio se ve en el portal de inmediato." : ""}
                    </span>
                  </p>
                  <div className="oda-import__actions">
                    {!confirming ? (
                      <button type="button" className="button-primary" disabled={!canEdit || save.isPending} onClick={() => setConfirming(true)}>
                        Guardar {count(plan.results.length)} resultados
                      </button>
                    ) : (
                      <span className="oda-confirm" role="group" aria-label="Confirmar la importación">
                        <span>
                          {published
                            ? `Los resultados ${yearsText(fileYears)} y las curvas de percentil se reemplazan en el portal.`
                            : `Los resultados ${yearsText(fileYears)} y las curvas de percentil se reemplazan.`}
                        </span>
                        <button type="button" className="button-primary" onClick={apply}>Sí, reemplazar</button>
                        <button type="button" className="oda-link-button" onClick={() => setConfirming(false)}>Cancelar</button>
                      </span>
                    )}
                  </div>
                </footer>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

/* --- 2. Años cargados ---------------------------------------------------------------- */

function TytYears({ tyt, results, canEdit }: SectionProps) {
  const remove = useDeleteSaberTytYear();
  const years = Array.from(new Set(results.map((r) => r.year))).sort((a, b) => b - a);
  if (years.length === 0) return null;

  const number = (value: number | string | null) => (value === null ? null : Number(value));
  // La misma lectura que deja ver la importación, ahora sobre lo que está en la base.
  const stored: SaberTytData = {
    id: tyt.key, title: tyt.title, description: tyt.description, note: tyt.note, source: "", benchmarks: tyt.benchmarks ?? {},
    alpha: tyt.alpha && Object.keys(tyt.alpha).length ? tyt.alpha : emptyAlpha(),
    results: results.map((r) => ({
      year: r.year, level: r.level, program: r.program, competency: r.competency,
      evaluated: r.evaluated, meanExit: number(r.mean_exit), paired: r.paired, meanEntry: number(r.mean_entry),
      meanDelta: number(r.mean_delta), improved: r.improved, rawEntry: number(r.raw_entry), rawExit: number(r.raw_exit),
      transitions: r.transitions ?? {}, histogram: r.histogram ?? {}, scatter: r.scatter ?? {},
      alphaN: r.alpha_n ?? null, alphaExpected: number(r.alpha_expected ?? null), alphaActual: number(r.alpha_actual ?? null),
      alphaVa: number(r.alpha_va ?? null), alphaPositive: r.alpha_positive ?? null,
      plane: r.plane ?? {}, quadrants: r.quadrants ?? {}, quadPlane: r.quad_plane ?? {},
    })),
  };
  const figure = tytFigure(stored, "global", null);
  const model = stored.alpha.modelos.global?.[ALPHA_IMPORT_FIT];

  return (
    <Panel
      id="oda-tyt-anios"
      tone="quiet"
      title="Años cargados"
      description="Lo que hay hoy en la base, año por año. Borrar un año quita sus programas; las curvas de percentil se quedan como están hasta la próxima importación."
      actions={<SaveState pending={remove.isPending} error={remove.error} success={remove.isSuccess} />}
    >
      <dl className="oda-import__facts oda-tyt__readout">
        <div>
          <dt>Percentil medio de entrada</dt>
          <dd>{percentile(figure?.meanEntry)} <small>Saber 11, puntaje global</small></dd>
        </div>
        <div>
          <dt>Percentil medio de salida</dt>
          <dd>{percentile(figure?.meanExit)} <small>Saber TyT, puntaje global</small></dd>
        </div>
        <div>
          <dt>Valor agregado (VAI)</dt>
          <dd>{delta(figure?.meanDelta)} <small>puntos de percentil</small></dd>
        </div>
      </dl>
      <dl className="oda-import__facts oda-tyt__readout">
        <div>
          <dt>Puntaje esperado medio</dt>
          <dd>{points(figure?.alpha.alphaExpected)} <small>Motor Alpha, puntaje global</small></dd>
        </div>
        <div>
          <dt>Puntaje real medio</dt>
          <dd>{points(figure?.alpha.alphaActual)} <small>Saber TyT, puntaje global</small></dd>
        </div>
        <div>
          <dt>Valor agregado (VA)</dt>
          <dd>{delta(figure?.alpha.alphaVa)} <small>puntos de la prueba</small></dd>
        </div>
        <div>
          <dt>Ajuste del modelo</dt>
          <dd>
            {model ? `R² ${model.r2.toLocaleString("es-CO", { maximumFractionDigits: 3 })}` : "—"}
            {" "}<small>{model ? `n = ${count(model.n)}` : "sin ajuste guardado para el global"}</small>
          </dd>
        </div>
      </dl>
      <table className="oda-table oda-saber__table">
        <thead>
          <tr>
            <th scope="col">Año</th>
            <th scope="col">Evaluados</th>
            <th scope="col">Con las dos pruebas</th>
            <th scope="col">Programas</th>
            <th scope="col">VAI</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const rows = results.filter((r) => r.year === year);
            const global = rows.filter((r) => r.competency === "global");
            const evaluated = global.reduce((sum, r) => sum + (r.evaluated ?? 0), 0);
            const paired = global.reduce((sum, r) => sum + (r.paired ?? 0), 0);
            const weighted = global.reduce((sum, r) => sum + (number(r.mean_delta) ?? 0) * (r.paired ?? 0), 0);
            return (
              <tr key={year}>
                <th scope="row">{year}</th>
                <td>{count(evaluated)}</td>
                <td>{count(paired)} <small className="oda-muted">({share(paired, evaluated)})</small></td>
                <td>{new Set(rows.map((r) => r.program)).size}</td>
                <td data-empty={paired === 0 || undefined}>{paired ? delta(Math.round((weighted / paired) * 10) / 10) : "—"}</td>
                <td className="oda-table__actions">
                  {canEdit && (
                    <ConfirmButton
                      label="Borrar año"
                      subject={`el año ${year} de «${tyt.title}»`}
                      confirmLabel="Se quitan sus programas; las curvas de percentil se quedan como están hasta la próxima importación. No se puede deshacer."
                      disabled={remove.isPending}
                      onConfirm={() => remove.mutate({ tytId: tyt.id, year })}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="oda-muted oda-saber__legend">
        {TYT_COMPETENCIES.filter((c) => isPaired(c.key)).map((c) => `${c.code}: ${c.entry} → ${c.exit}`).join(" · ")}
      </p>
      <p className="oda-muted oda-saber__legend">
        El puntaje esperado sale de la regresión publicada ({ALPHA_SOURCE}) reajustada sobre esta cohorte, con el ajuste
        «{ALPHA_FIT_LABEL[ALPHA_IMPORT_FIT].toLowerCase()}».
      </p>
    </Panel>
  );
}

/* --- 3. Promedios nacionales del Motor Alpha ----------------------------------------- */

/** Las competencias del Saber TyT que tienen promedio nacional publicado. */
const TYT_NATIONAL_KEYS = TYT_COMPETENCIES.filter((c) => c.exit).map((c) => c.key);

function TytNational({ tyt, reportId, canEdit }: SectionProps) {
  const save = useSaveSaberTyt();
  const alpha: AlphaData = tyt.alpha && Object.keys(tyt.alpha).length ? tyt.alpha : emptyAlpha();
  const nacional = alpha.nacional ?? ALPHA_NATIONAL;
  const [draft, setDraft] = useState<Record<string, string>>({});

  const stored = (key: string) => {
    const [prueba, field] = key.split(":");
    const value = prueba === "s11" ? nacional.saber11?.[field as AlphaPredictor | "global"] : nacional.tyt?.[field as TytCompetency];
    return value === undefined || value === null ? "" : String(value);
  };
  const shown = (key: string) => draft[key] ?? stored(key);
  const set = (key: string, value: string) => setDraft({ ...draft, [key]: value });

  const entries = Object.entries(draft).filter(([key, value]) => value.trim() !== stored(key));
  const wrong = entries.filter(([, value]) => value.trim() !== "" && !Number.isFinite(Number(value.replace(",", "."))));

  const submit = () => {
    const saber11: AlphaData["nacional"]["saber11"] = { ...nacional.saber11 };
    const salida: AlphaData["nacional"]["tyt"] = { ...nacional.tyt };
    for (const [key] of entries) {
      const [prueba, field] = key.split(":");
      const raw = shown(key).trim();
      const value = raw === "" ? undefined : Math.round(Number(raw.replace(",", ".")) * 100) / 100;
      const target = prueba === "s11" ? saber11 : salida;
      if (value === undefined) delete (target as Record<string, number>)[field];
      else (target as Record<string, number>)[field] = value;
    }
    save.mutate(
      { id: tyt.id, report_id: reportId, alpha: { ...alpha, nacional: { saber11, tyt: salida } } },
      { onSuccess: () => setDraft({}) },
    );
  };

  const field = (key: string, label: string) => (
    <label key={key} className="oda-tyt-national__field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={shown(key)}
        disabled={!canEdit}
        aria-label={label}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );

  return (
    <Panel
      id="oda-tyt-nacional"
      tone="quiet"
      title="Promedios nacionales del Motor Alpha"
      description="El punto de corte de los cuadrantes: por debajo del promedio del país o por encima, en la prueba de entrada y en la de salida. No cambian el puntaje esperado, solo en qué cuadrante cae cada grupo."
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} idle={wrong.length ? "Hay casillas que no son números" : undefined} />
          <button type="button" className="button-primary" disabled={!canEdit || entries.length === 0 || wrong.length > 0 || save.isPending} onClick={submit}>
            Guardar {entries.length || ""}
          </button>
        </>
      }
    >
      <div className="oda-tyt-national">
        <fieldset className="oda-tyt-national__group" disabled={!canEdit}>
          <legend>Saber 11 · prueba de entrada</legend>
          <div className="oda-tyt-national__row">
            {ALPHA_PREDICTORS.map((pr) => field(`s11:${pr.key}`, pr.label))}
            {field("s11:global", "Puntaje global")}
          </div>
        </fieldset>
        <fieldset className="oda-tyt-national__group" disabled={!canEdit}>
          <legend>Saber TyT · prueba de salida</legend>
          <div className="oda-tyt-national__row">
            {TYT_NATIONAL_KEYS.map((key) => field(`tyt:${key}`, TYT_COMPETENCIES.find((c) => c.key === key)!.label))}
          </div>
        </fieldset>
      </div>
      <p className="oda-muted oda-saber__legend">
        Vienen llenos con los promedios que publica el artículo del que sale el modelo —Saber 11 de 2014 a 2020 y Saber TyT de 2016 a 2023—,
        no con cifras nuestras: {ALPHA_SOURCE} {ALPHA_CITATION.doi} · {ALPHA_CITATION.license}. Cámbialos cuando el ICFES publique otros.
      </p>
    </Panel>
  );
}
