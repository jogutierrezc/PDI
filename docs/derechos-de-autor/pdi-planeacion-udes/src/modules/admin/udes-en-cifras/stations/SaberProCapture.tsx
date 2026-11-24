/* =============================================================================
   Resultados Saber PRO en la intranet (0031).

   · SaberProForm (Estructura): título, alcance, nota metodológica y oficina.
     Un informe suele tener un solo conjunto.
   · SaberProCapture (Captura):
     1. Importar resultados del ICFES. El Excel de resultados individuales se
        lee en el navegador; se agregan por año, sede, facultad, programa y
        competencia, y solo esos agregados se guardan. Nombres y documentos no
        salen del equipo. Guardar reemplaza los programas de los años del
        archivo; los demás años quedan como estaban.
     2. Promedio oficial y nacional: una rejilla año × competencia con el
        promedio que publica el ICFES para la UDES y el del país. Vacío es
        «no reportado», nunca cero.
     3. Años cargados, con sus cifras y la opción de borrar un año entero.
   ========================================================================== */

import { useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdSaberProResultRow, OdSaberProRow } from "../../../../types/database";
import { SABER_COMPETENCIES, aggregateSaberRecords, saberLevel, saberProgramLabel, saberScore } from "../../../datos-abiertos/data/saber-pro";
import type { SaberCompetency, SaberRecord, SaberResult } from "../../../datos-abiertos/data/saber-pro";
import type { StationProps } from "../OdAdmin";
import { DataGrid } from "../DataGrid";
import type { CellKey } from "../DataGrid";
import { useDeleteSaberProYear, useReplaceSaberProResults, useSaveSaberProReference } from "../od-data";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../ui";

/* --- Estructura: definir el conjunto ------------------------------------------------ */

export interface SaberProFields {
  title: string;
  description: string;
  note: string;
  office_id: string;
}

export function SaberProForm({
  offices,
  initial,
  onSubmit,
  onCancel,
}: {
  offices: StationProps["data"]["rows"]["offices"];
  initial?: Partial<SaberProFields>;
  onSubmit: (fields: SaberProFields) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<SaberProFields>({ title: "Resultados Saber PRO", description: "", note: "", office_id: "", ...initial });
  const set = (patch: Partial<SaberProFields>) => setF({ ...f, ...patch });

  return (
    <form className="oda-inline-form" onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) onSubmit({ ...f, title: f.title.trim() }); }}>
      <div className="oda-form-grid">
        <label className="admin-field admin-field--wide">
          <span>Título</span>
          <input autoFocus required value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Descripción</span>
          <textarea rows={2} value={f.description} placeholder="Qué muestra el bloque y frente a qué se compara" onChange={(e) => set({ description: e.target.value })} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Nota metodológica</span>
          <textarea rows={3} value={f.note} placeholder="Fuente, qué cuenta como evaluado, de dónde sale cada promedio" onChange={(e) => set({ note: e.target.value })} />
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
        <button type="submit" className="button-primary">{initial?.title ? "Guardar" : "Crear resultados Saber PRO"}</button>
      </div>
    </form>
  );
}

/* --- Lectura del Excel del ICFES ------------------------------------------------------ */

type Cell = string | number | boolean | Date | null | undefined;

interface WorkbookSheet {
  name: string;
  rows: Cell[][];
}

/** Minúsculas, sin tildes y con espacios simples: "Nivel de desempeño" → "nivel de desempeno". */
const fold = (value: Cell) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const SCORE_HEADERS: Record<string, SaberCompetency> = {
  "puntaje global": "global",
  plc: "lc",
  prc: "rc",
  ping: "ing",
  pcc: "cc",
  pce: "ce",
};

interface Layout {
  headerRow: number;
  year: number;
  campus: number;
  faculty: number;
  program: number;
  /** Columna del código SNIES; -1 si la hoja no la trae. */
  code: number;
  scores: Partial<Record<SaberCompetency, number>>;
  levels: Partial<Record<SaberCompetency, number>>;
}

/** La fila de encabezados es la primera (de las 15 de arriba) con una columna «Puntaje global». */
function findLayout(rows: Cell[][]): Layout | null {
  for (let r = 0; r < Math.min(rows.length, 15); r += 1) {
    const headers = (rows[r] ?? []).map(fold);
    if (!headers.includes("puntaje global")) continue;
    const scores: Layout["scores"] = {};
    const levels: Layout["levels"] = {};
    headers.forEach((header, i) => {
      const competency = SCORE_HEADERS[header];
      if (competency && scores[competency] === undefined) scores[competency] = i;
      // El nivel de desempeño es de la competencia que queda justo a su izquierda.
      if (header.startsWith("nivel de desempeno") && i > 0) {
        const left = SCORE_HEADERS[headers[i - 1]];
        if (left && left !== "global") levels[left] = i;
      }
    });
    return { headerRow: r, year: headers.indexOf("periodo"), campus: headers.indexOf("campus"), faculty: headers.indexOf("facultad"), program: headers.indexOf("programa"), code: headers.findIndex((h) => h.startsWith("snies")), scores, levels };
  }
  return null;
}

/** Año de la columna Periodo: 2024, "2024", "2024-2" o 20242. */
function yearOf(value: Cell): number | null {
  if (value instanceof Date) return value.getFullYear();
  const match = String(value ?? "").match(/(?:^|\D)((?:19|20)\d{2})/);
  const year = match ? Number(match[1]) : NaN;
  return year >= 2000 && year <= 2100 ? year : null;
}

const text = (value: Cell) => String(value ?? "").replace(/\s+/g, " ").trim();

interface YearSummary {
  year: number;
  evaluated: number;
  programs: number;
  campuses: number;
}

interface ImportPlan {
  fileName: string;
  sheet: string;
  results: SaberResult[];
  years: YearSummary[];
  /** Filas sin año o sin programa o sede: números de fila como los cuenta Excel. */
  skipped: number[];
  /** Puntajes 0, "-" u otro texto que no es un puntaje. */
  discarded: number;
  /** Competencias cuya columna no está en la hoja. */
  missingScores: string[];
}

function summarize(results: SaberResult[]): YearSummary[] {
  const years = Array.from(new Set(results.map((r) => r.year))).sort((a, b) => a - b);
  return years.map((year) => {
    const rows = results.filter((r) => r.year === year);
    return {
      year,
      evaluated: rows.filter((r) => r.competency === "global").reduce((sum, r) => sum + (r.evaluated ?? 0), 0),
      programs: new Set(rows.map((r) => `${r.campus}|${r.program}`)).size,
      campuses: new Set(rows.map((r) => r.campus)).size,
    };
  });
}

/**
 * Hoja → agregados. Los registros individuales viven solo dentro de esta
 * función: lo que devuelve ya no tiene a nadie.
 */
function planFrom(sheet: WorkbookSheet, fileName: string): ImportPlan | string {
  const layout = findLayout(sheet.rows);
  if (!layout) return `La hoja «${sheet.name}» no tiene una columna «Puntaje global» en sus primeras filas.`;
  const absent = ([["Periodo", layout.year], ["Campus", layout.campus], ["Programa", layout.program]] as const).filter(([, at]) => at < 0).map(([name]) => name);
  if (absent.length) return `A la hoja «${sheet.name}» le faltan las columnas ${absent.join(", ")}.`;

  const records: SaberRecord[] = [];
  const skipped: number[] = [];
  let discarded = 0;
  for (let r = layout.headerRow + 1; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r] ?? [];
    if (row.every((cell) => text(cell) === "")) continue;
    const year = yearOf(row[layout.year]);
    const campus = text(row[layout.campus]);
    // Sin código SNIES, fila propia: no se suma a un programa que la fuente no dice.
    const program = saberProgramLabel(text(row[layout.program]), layout.code < 0 || text(row[layout.code]) !== "");
    if (year === null || !campus || !program) {
      skipped.push(r + 1);
      continue;
    }
    const record: SaberRecord = { year, campus, faculty: layout.faculty >= 0 ? text(row[layout.faculty]) : "", program, scores: {}, levels: {} };
    for (const { key } of SABER_COMPETENCIES) {
      const at = layout.scores[key];
      if (at === undefined || text(row[at]) === "") continue;
      const score = saberScore(row[at]);
      if (score === null) discarded += 1;
      record.scores[key] = score;
      const levelAt = layout.levels[key];
      if (score !== null && levelAt !== undefined) record.levels[key] = saberLevel(key, row[levelAt]);
    }
    records.push(record);
  }
  const results = aggregateSaberRecords(records);
  if (results.length === 0) return `La hoja «${sheet.name}» no tiene puntajes válidos.`;
  return {
    fileName,
    sheet: sheet.name,
    results,
    years: summarize(results),
    skipped,
    discarded,
    missingScores: SABER_COMPETENCIES.filter((c) => layout.scores[c.key] === undefined).map((c) => c.label),
  };
}

/** "2016–2024" si los años son seguidos; si no, la lista. */
function yearsText(years: number[]): string {
  if (years.length === 0) return "";
  const sorted = [...years].sort((a, b) => a - b);
  const contiguous = sorted.every((y, i) => i === 0 || y === sorted[i - 1] + 1);
  if (sorted.length === 1) return String(sorted[0]);
  return contiguous ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(", ");
}

const count = (n: number) => n.toLocaleString("es-CO");

/* --- Captura ------------------------------------------------------------------------ */

export function SaberProCapture({ data, report, periodId, canEdit, only }: StationProps) {
  const sets = (data.rows.saberPro ?? []).filter((sp) => sp.report_id === report!.uuid && (!only || sp.id === only)).sort((a, b) => a.position - b.position);
  const [active, setActive] = useState(sets[0]?.id);
  const saber = sets.find((sp) => sp.id === active) ?? sets[0];
  if (!saber) {
    return (
      <StageEmpty title="Este informe no tiene resultados Saber PRO">
        Créalos en Estructura y KPI → Conjuntos visuales → Resultados Saber PRO. Luego vuelve aquí para importar el archivo del ICFES.
      </StageEmpty>
    );
  }
  const results = (data.rows.saberProResults ?? []).filter((r) => r.saber_id === saber.id);
  const props = { saber, results, periodId, reportId: report!.uuid!, published: report!.status === "publicado", canEdit };

  return (
    <div className="oda-stack">
      {sets.length > 1 && (
        <label className="oda-inline-field">
          <span>Conjunto</span>
          <select value={saber.id} onChange={(e) => setActive(e.target.value)}>
            {sets.map((sp) => <option key={sp.id} value={sp.id}>{sp.title}</option>)}
          </select>
        </label>
      )}
      <SaberImport key={`importar-${saber.id}`} {...props} />
      <SaberYears key={`anios-${saber.id}`} {...props} />
      <SaberReference
        key={`referencia-${saber.id}-${results.filter((r) => r.scope !== "programa").map((r) => `${r.year}${r.scope}${r.competency}${r.mean}`).join()}`}
        {...props}
      />
    </div>
  );
}

interface SectionProps {
  saber: OdSaberProRow;
  results: OdSaberProResultRow[];
  periodId: string;
  reportId: string;
  published: boolean;
  canEdit: boolean;
}

/* --- 1. Importar resultados del ICFES ------------------------------------------------ */

function SaberImport({ saber, results, periodId, reportId, published, canEdit }: SectionProps) {
  const save = useReplaceSaberProResults();
  const fileInput = useRef<HTMLInputElement>(null);
  const [book, setBook] = useState<{ fileName: string; sheets: WorkbookSheet[] } | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const sheet = book?.sheets.find((s) => s.name === sheetName);
  const outcome = book && sheet ? planFrom(sheet, book.fileName) : null;
  const plan = outcome && typeof outcome !== "string" ? outcome : null;
  const planError = typeof outcome === "string" ? outcome : null;
  const fileYears = plan?.years.map((y) => y.year) ?? [];
  const storedYears = new Set(results.filter((r) => r.scope === "programa").map((r) => r.year));
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
      const preferred = sheets.find((s) => {
        const layout = findLayout(s.rows);
        return layout && layout.year >= 0 && layout.program >= 0;
      }) ?? sheets.find((s) => findLayout(s.rows));
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
    const rows: OdSaberProResultRow[] = plan.results.map((r) => ({ saber_id: saber.id, ...r }));
    const summary = `${count(rows.length)} filas de ${yearsText(fileYears)} guardadas desde «${plan.fileName}».`;
    save.mutate(
      { periodId, reportId, saberId: saber.id, years: fileYears, rows, fileName: plan.fileName },
      { onSuccess: () => { clear(); setDone(summary); } },
    );
  };

  return (
    <Panel
      id="oda-saber-importar"
      title="Importar resultados del ICFES"
      description="El Excel de resultados individuales de Saber PRO, con las columnas Periodo, Campus, Facultad, Programa, Puntaje global, PLC, PRC, PING, PCC y PCE, y sus niveles de desempeño."
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
            El archivo se lee en este navegador. Nombres, documentos y puntajes individuales no se envían a ninguna parte: solo
            se guardan los agregados por programa (evaluados, promedio, niveles de desempeño y reparto del puntaje).
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
              <button type="button" className="oda-link-button" onClick={clear}>Descartar</button>
            </div>

            {planError && <p className="oda-import__error" role="alert"><Icon name="alert" size={14} /> {planError}</p>}

            {plan && (
              <div className="oda-import__plan">
                <table className="oda-table oda-saber__table">
                  <caption className="sr-only">Lo que trae el archivo, por año</caption>
                  <thead>
                    <tr>
                      <th scope="col">Año</th>
                      <th scope="col">Evaluados</th>
                      <th scope="col">Programas</th>
                      <th scope="col">Sedes</th>
                      <th scope="col">En el portal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.years.map((y) => (
                      <tr key={y.year}>
                        <th scope="row">{y.year}</th>
                        <td>{count(y.evaluated)}</td>
                        <td>{y.programs}</td>
                        <td>{y.campuses}</td>
                        <td>{storedYears.has(y.year) ? "se reemplaza" : "año nuevo"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {(plan.skipped.length > 0 || plan.discarded > 0 || plan.missingScores.length > 0) && (
                  <ul className="oda-import__warnings">
                    {plan.skipped.length > 0 && (
                      <li>
                        <span>Aviso · filas sin cargar</span>
                        {count(plan.skipped.length)} {plan.skipped.length === 1 ? "fila no tiene" : "filas no tienen"} año, sede o programa y no se cuentan
                        {" "}(fila{plan.skipped.length === 1 ? "" : "s"} {plan.skipped.slice(0, 8).join(", ")}{plan.skipped.length > 8 ? "…" : ""}).
                      </li>
                    )}
                    {plan.discarded > 0 && (
                      <li>
                        <span>Aviso · puntajes descartados</span>
                        {count(plan.discarded)} {plan.discarded === 1 ? "puntaje es" : "puntajes son"} 0, «-» u otro texto: pruebas no presentadas o anuladas. No cuentan como evaluados ni entran al promedio.
                      </li>
                    )}
                    {plan.missingScores.length > 0 && (
                      <li>
                        <span>Aviso · competencias ausentes</span>
                        La hoja no trae {plan.missingScores.join(", ")}: esos años quedarán sin esas competencias por programa.
                      </li>
                    )}
                  </ul>
                )}

                <footer className="oda-import__apply">
                  <p>
                    <Icon name="alert" size={15} />
                    <span>
                      Guardar <strong>reemplaza los resultados por programa</strong> de {yearsText(fileYears)}
                      {replaced.length ? ` (hoy cargados: ${yearsText(replaced)})` : ""}. Los demás años y los promedios oficial y nacional no cambian.
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
                            ? `Los resultados ${yearsText(fileYears)} por programa se reemplazan en el portal.`
                            : `Los resultados ${yearsText(fileYears)} por programa se reemplazan.`}
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

function SaberYears({ saber, results, canEdit }: SectionProps) {
  const remove = useDeleteSaberProYear();
  const years = Array.from(new Set(results.map((r) => r.year))).sort((a, b) => b - a);
  if (years.length === 0) return null;

  return (
    <Panel
      id="oda-saber-anios"
      tone="quiet"
      title="Años cargados"
      description="Lo que hay hoy en la base, año por año. Borrar un año quita sus programas y sus promedios oficial y nacional."
      actions={<SaveState pending={remove.isPending} error={remove.error} success={remove.isSuccess} />}
    >
      <table className="oda-table oda-saber__table">
        <thead>
          <tr>
            <th scope="col">Año</th>
            <th scope="col">Evaluados</th>
            <th scope="col">Programas</th>
            <th scope="col">Sedes</th>
            <th scope="col">Oficial</th>
            <th scope="col">Nacional</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const rows = results.filter((r) => r.year === year);
            const programs = rows.filter((r) => r.scope === "programa");
            const evaluated = programs.filter((r) => r.competency === "global").reduce((sum, r) => sum + (r.evaluated ?? 0), 0);
            const reference = (scope: "institucion" | "nacional") => rows.filter((r) => r.scope === scope && r.mean !== null).length;
            return (
              <tr key={year}>
                <th scope="row">{year}</th>
                <td data-empty={programs.length === 0 || undefined}>{programs.length ? count(evaluated) : "—"}</td>
                <td data-empty={programs.length === 0 || undefined}>{programs.length ? new Set(programs.map((r) => r.program)).size : "—"}</td>
                <td data-empty={programs.length === 0 || undefined}>{programs.length ? new Set(programs.map((r) => r.campus)).size : "—"}</td>
                <td>{reference("institucion")} de 6</td>
                <td>{reference("nacional")} de 6</td>
                <td className="oda-table__actions">
                  {canEdit && (
                    <ConfirmButton
                      label="Borrar año"
                      subject={`el año ${year} de «${saber.title}»`}
                      confirmLabel="Se quitan sus programas y sus promedios oficial y nacional. No se puede deshacer."
                      disabled={remove.isPending}
                      onConfirm={() => remove.mutate({ saberId: saber.id, year })}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

/* --- 3. Promedio oficial y nacional ------------------------------------------------- */

const REFERENCE_SCOPES = [
  { scope: "institucion" as const, label: "UDES oficial" },
  { scope: "nacional" as const, label: "Nacional" },
];

function SaberReference({ saber, results, periodId, reportId, canEdit }: SectionProps) {
  const save = useSaveSaberProReference();
  const [draft, setDraft] = useState<Record<CellKey, number | null>>({});
  const [extraYears, setExtraYears] = useState<number[]>([]);
  const [newYear, setNewYear] = useState("");

  const years = Array.from(new Set([...results.map((r) => r.year), ...extraYears])).sort((a, b) => b - a);
  const find = (year: number, scope: string, competency: string) =>
    results.find((r) => r.year === year && r.scope === scope && r.competency === competency);
  const parseRow = (row: string) => {
    const [year, scope] = row.split(":");
    return { year: Number(year), scope: scope as "institucion" | "nacional" };
  };
  const stored = (row: string, column: string) => {
    const { year, scope } = parseRow(row);
    const mean = find(year, scope, column)?.mean;
    return mean === null || mean === undefined ? null : Number(mean);
  };

  const entries = Object.entries(draft).map(([key, value]) => {
    const [row, competency] = key.split("|");
    return { ...parseRow(row), competency: competency as SaberCompetency, value };
  });
  const tooHigh = entries.filter((e) => e.value !== null && e.value > 300);
  const changes = entries.filter((e) => e.value !== null || find(e.year, e.scope, e.competency));

  const submit = () =>
    save.mutate(
      {
        periodId, reportId, saberId: saber.id,
        rows: changes
          .filter((e) => e.value !== null)
          .map((e) => ({
            saber_id: saber.id, year: e.year, scope: e.scope, campus: "", faculty: "", program: "", competency: e.competency,
            evaluated: null, mean: Math.round(e.value! * 100) / 100, levels: {}, histogram: {},
          })),
        remove: changes.filter((e) => e.value === null).map(({ year, scope, competency }) => ({ year, scope, competency })),
      },
      { onSuccess: () => { setDraft({}); setExtraYears([]); } },
    );

  return (
    <Panel
      id="oda-saber-referencia"
      title="Promedio oficial y nacional"
      description="El promedio que publica el ICFES para la UDES y el del país, por año y competencia. El oficial manda sobre el promedio sumado de los programas cuando se mira toda la universidad. Vacío es «no reportado», nunca cero."
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} idle={tooHigh.length ? "Hay promedios por encima de 300" : undefined} />
          <button type="button" className="button-primary" disabled={!canEdit || changes.length === 0 || tooHigh.length > 0 || save.isPending} onClick={submit}>
            Guardar {changes.length || ""}
          </button>
        </>
      }
    >
      {canEdit && (
        <div className="oda-grid-toolbar">
          <span className="oda-grid-toolbar__group">
            <input type="number" inputMode="numeric" min={2000} max={2100} placeholder="Año" value={newYear} aria-label="Año que se añade" onChange={(e) => setNewYear(e.target.value)} />
            <button
              type="button"
              className="button-secondary"
              disabled={!/^\d{4}$/.test(newYear) || Number(newYear) < 2000 || Number(newYear) > 2100 || years.includes(Number(newYear))}
              onClick={() => { setExtraYears([...extraYears, Number(newYear)]); setNewYear(""); }}
            >
              <Icon name="plus" size={15} /> Añadir año
            </button>
          </span>
        </div>
      )}
      {years.length === 0 ? (
        <StageEmpty title="Añade los años que publicó el ICFES">
          Escribe el año y luego el promedio de la UDES y el nacional de cada competencia. Un año sin resultados por programa también se puede cargar.
        </StageEmpty>
      ) : (
        <>
          <DataGrid
            label="Promedio oficial y nacional"
            rowHeader="Año"
            rows={years.flatMap((year) =>
              REFERENCE_SCOPES.map((s, i) => ({ key: `${year}:${s.scope}`, label: i === 0 ? String(year) : "", sub: s.label, groupStart: i === 0, format: "decimal" as const })),
            )}
            columns={SABER_COMPETENCIES.map((c) => ({ key: c.key, label: c.code, ariaLabel: c.label }))}
            stored={stored}
            draft={draft}
            onDraft={setDraft}
            readOnly={!canEdit}
          />
          <p className="oda-muted oda-saber__legend">
            {SABER_COMPETENCIES.map((c) => `${c.code}: ${c.label}`).join(" · ")}
          </p>
          {tooHigh.length > 0 && (
            <p className="oda-field-warning" role="alert">
              Un promedio Saber PRO va de 0 a 300: revisa {tooHigh.map((e) => `${e.year} ${SABER_COMPETENCIES.find((c) => c.key === e.competency)?.code}`).join(", ")}.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
