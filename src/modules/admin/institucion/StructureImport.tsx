/* =============================================================================
   Carga masiva de la estructura institucional desde Excel.

   Tres pasos en la misma ficha, sin modal: descargar la plantilla (un libro
   con una hoja por clase, que ya trae lo que existe y listas desplegables),
   subirla y revisarla, y aplicar.

   REVISAR ES CORREGIR AQUÍ MISMO
   Cada hoja del libro se abre como hoja de cálculo (DataGrid): se recorre con
   el teclado y el ratón, las celdas con error salen en rojo con su motivo y se
   corrigen en la celda; al escribir, todo se vuelve a validar. No hace falta
   volver al Excel, aunque se puede descargar lo corregido. Una fila vacía se
   omite. Si al aplicar la base rechaza una fila, el error vuelve a su fila.

   Aplicar es todo o nada: con una celda con error el botón no se habilita, y
   si la base rechaza una fila no se escribe ninguna (admin_import_units,
   0074). ExcelJS pesa: se carga solo al descargar o leer.
   ========================================================================== */

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { DataGrid } from "../../../components/sheet/DataGrid";
import type { GridColumn } from "../../../components/sheet/DataGrid";
import { downloadBlob } from "../traslado/transfer";
import { DEGREE_LABEL, FUNCTION_LABEL, MODALITY_LABEL } from "./institution-model";
import { useImportUnits } from "./institution-db";
import type { Institution } from "./institution-db";
import {
  SHEETS,
  canApply,
  fillStructureTemplate,
  normalize,
  parseStructureWorkbook,
  rowsToImport,
  workbookToTables,
} from "./structure-sheet";
import type { RowStatus, SheetSummary, StructureRow } from "./structure-sheet";

const STATUS: Record<RowStatus, { label: string; glyph: string; verb: string }> = {
  nuevo: { label: "Nuevas", glyph: "+", verb: "Se crea" },
  actualizado: { label: "Actualizadas", glyph: "↻", verb: "Se actualiza" },
  sin_cambio: { label: "Sin cambio", glyph: "=", verb: "Queda igual" },
  error: { label: "Con error", glyph: "!", verb: "Tiene error" },
};

const ORDER: RowStatus[] = ["error", "nuevo", "actualizado", "sin_cambio"];

/** Listas cerradas por encabezado: el editor de la celda es un desplegable. */
const CHOICES: Record<string, readonly string[]> = {
  nivel: ["", ...Object.values(DEGREE_LABEL)],
  modalidad: ["", ...Object.values(MODALITY_LABEL)],
  "funcion sustantiva": ["", ...Object.values(FUNCTION_LABEL)],
};

type Tables = Record<string, string[][]>;
type SheetRow = { index: number; cells: string[] };

/** «A» → 0, «AB» → 27. */
const columnIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

/** El error de la base al aplicar, si nombra una fila: «Hoja Facultades, fila 8: …». */
function locate(message: string): { sheet: string; line: number; text: string } | null {
  const hit = /Hoja ([^,]+), fila (\d+)(?:, columna [A-Z]+)?:\s*(.*)$/s.exec(message);
  return hit ? { sheet: hit[1].trim(), line: Number(hit[2]), text: hit[3] } : null;
}

/** Los mensajes de la base, en palabras de quien carga. */
function friendly(text: string): string {
  if (/units_slug_format/.test(text)) return "el nombre no produjo una dirección válida; cámbielo un poco (por ejemplo, abrévielo) y vuelva a aplicar.";
  if (/units_code_unique|duplicate key.*code/i.test(text)) return "ese código ya lo usa otra unidad.";
  if (/units_snies_code_unique|snies/i.test(text) && /duplicate/i.test(text)) return "ese SNIES ya lo tiene otro programa.";
  return text;
}

export function StructureImport({ data }: { data: Institution }) {
  const apply = useImportUnits();
  const [tables, setTables] = useState<Tables | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState<"plantilla" | "leer" | null>(null);
  const [error, setError] = useState("");
  const [serverRow, setServerRow] = useState<{ sheet: string; line: number; text: string } | null>(null);
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null);
  const [filter, setFilter] = useState<RowStatus | "todos">("todos");
  const [edited, setEdited] = useState(false);

  const context = useMemo(() => ({ units: data.units, campuses: data.campuses, offer: data.offer }), [data]);
  const result = useMemo(() => (tables ? parseStructureWorkbook(tables, context) : null), [tables, context]);

  async function downloadTemplate() {
    setError("");
    setBusy("plantilla");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      book.creator = "Planeación Institucional · UDES";
      fillStructureTemplate(book, context);
      const buffer = await book.xlsx.writeBuffer();
      downloadBlob(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        "estructura-institucional-udes.xlsx",
      );
    } catch (cause) {
      setError(cause instanceof Error ? `No se pudo armar la plantilla: ${cause.message}` : "No se pudo armar la plantilla.");
    } finally {
      setBusy(null);
    }
  }

  /** Lo corregido en pantalla, como libro, por si se quiere guardar el archivo. */
  async function downloadEdited() {
    if (!tables) return;
    const { default: ExcelJS } = await import("exceljs");
    const book = new ExcelJS.Workbook();
    for (const [name, table] of Object.entries(tables)) {
      if (!SHEETS.some((def) => normalize(def.name) === normalize(name))) continue;
      const sheet = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
      table.forEach((row) => sheet.addRow(row));
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((column) => (column.width = 22));
    }
    const buffer = await book.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      fileName.replace(/\.xlsx$/i, "") + "-corregido.xlsx",
    );
  }

  async function read(file: File | undefined) {
    if (!file) return;
    setError("");
    setServerRow(null);
    setDone(null);
    setBusy("leer");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer());
      setTables(workbookToTables(book));
      setFileName(file.name);
      setFilter("todos");
      setEdited(false);
    } catch (cause) {
      setTables(null);
      setError(cause instanceof Error ? `No se pudo leer el archivo: ${cause.message}` : "No se pudo leer el archivo.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!result || !canApply(result)) return;
    setError("");
    setServerRow(null);
    try {
      const outcome = await apply.mutateAsync(rowsToImport(result));
      setDone(outcome);
      setTables(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudo aplicar la carga.";
      const where = locate(message);
      if (where) {
        setServerRow({ ...where, text: friendly(where.text) });
        setFilter("todos");
        setError(`La base no aceptó la hoja ${where.sheet}, fila ${where.line}: ${friendly(where.text)} No se guardó nada; corríjala en la hoja de abajo y vuelva a aplicar.`);
      } else {
        const advice = (cause as Error & { advice?: string }).advice;
        setError(`${message}${advice ? ` ${advice}` : ""}`);
      }
    }
  }

  const updateCell = useCallback((sheetKey: string, index: number, cells: string[]) => {
    setTables((current) => {
      if (!current) return current;
      const table = current[sheetKey].slice();
      table[index] = cells;
      return { ...current, [sheetKey]: table };
    });
    setServerRow(null);
    setEdited(true);
  }, []);

  const addRow = useCallback((sheetKey: string) => {
    setTables((current) => {
      if (!current) return current;
      const width = current[sheetKey][0]?.length ?? 1;
      return { ...current, [sheetKey]: [...current[sheetKey], Array.from({ length: width }, () => "")] };
    });
    setEdited(true);
  }, []);

  const errorRows = result ? result.counts.error + (serverRow ? 1 : 0) : 0;
  const pending = result ? result.counts.nuevo + result.counts.actualizado : 0;
  const total = result ? result.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) : 0;

  return (
    <section className="inst-sheet" aria-labelledby="inst-import-title">
      <header className="inst-sheet__head">
        <div>
          <h2 id="inst-import-title">Cargar la estructura desde Excel</h2>
          <p className="inst-lead">
            Vicerrectorías, facultades, oficinas y programas en un solo libro, una hoja por clase. Cada unidad se reconoce
            por su código (un programa, antes por su SNIES). Lo que traiga error se corrige aquí mismo, en la hoja; nada
            se guarda hasta que usted aplique, y si una fila tiene error no se guarda ninguna.
          </p>
        </div>
        <Link className="button-ghost" to="/admin/estructura-institucional">
          Cerrar
        </Link>
      </header>

      <ol className="inst-steps">
        <li>
          <span>
            <strong>Descargue la plantilla.</strong> Trae lo que ya existe, listas desplegables y una hoja de instrucciones.
          </span>
          <button type="button" className="button-secondary" onClick={() => void downloadTemplate()} disabled={busy !== null}>
            <Icon name="download" size={15} /> {busy === "plantilla" ? "Armando…" : "Descargar plantilla"}
          </button>
        </li>
        <li>
          <span>
            <strong>Súbala diligenciada.</strong> Se lee aquí mismo y se compara con lo que hay. Puede traer solo las hojas
            que use.
          </span>
          <label className="button-secondary inst-file">
            <Icon name="upload" size={15} />
            {busy === "leer" ? "Leyendo…" : tables ? "Elegir otro archivo" : "Elegir el Excel"}
            <input
              type="file"
              accept=".xlsx"
              disabled={busy !== null || apply.isPending}
              onChange={(event) => {
                void read(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </li>
        <li>
          <span>
            <strong>Revise, corrija y aplique.</strong> Las celdas en rojo dicen qué falta; escriba en ellas como en Excel.
            Solo se escriben las unidades nuevas y las que cambian.
          </span>
        </li>
      </ol>

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      {done && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={16} /> Listo: {done.created} {done.created === 1 ? "unidad nueva" : "unidades nuevas"} y{" "}
          {done.updated} {done.updated === 1 ? "actualizada" : "actualizadas"}.
        </p>
      )}

      {result && tables && (
        <div className="inst-preview" aria-live="polite">
          <div className="inst-preview__file">
            <span>
              <Icon name="table" size={15} /> {fileName}
              {edited && <em className="inst-edited"> · con correcciones en pantalla</em>}
            </span>
            {edited && (
              <button type="button" className="button-ghost" onClick={() => void downloadEdited()}>
                <Icon name="download" size={14} /> Descargar lo corregido
              </button>
            )}
          </div>
          {result.problems.map((problem) => (
            <p key={problem} className="admin-error" role="alert">
              <Icon name="alert" size={16} /> {problem}
            </p>
          ))}

          {total > 0 && (
            <div className="inst-filters" role="group" aria-label="Filtrar filas">
              <button type="button" aria-pressed={filter === "todos"} onClick={() => setFilter("todos")}>
                Todas <span>{total}</span>
              </button>
              {ORDER.map((status) => (
                <button
                  key={status}
                  type="button"
                  data-status={status}
                  aria-pressed={filter === status}
                  disabled={result.counts[status] === 0}
                  onClick={() => setFilter(status)}
                >
                  <span aria-hidden="true" className="inst-glyph">
                    {STATUS[status].glyph}
                  </span>
                  {STATUS[status].label} <span>{result.counts[status]}</span>
                </button>
              ))}
            </div>
          )}

          {result.sheets.map((summary) => {
            const key = Object.keys(tables).find((name) => normalize(name) === normalize(summary.name));
            if (!summary.found || !key) return null;
            return (
              <SheetEditor
                key={summary.kind}
                summary={summary}
                table={tables[key]}
                filter={filter}
                serverRow={serverRow && normalize(serverRow.sheet) === normalize(summary.name) ? serverRow : null}
                onCells={(index, cells) => updateCell(key, index, cells)}
                onAddRow={() => addRow(key)}
              />
            );
          })}

          <div className="inst-form__actions">
            <button
              type="button"
              className="button-primary"
              disabled={!canApply(result) || Boolean(serverRow) || apply.isPending || !data.ready}
              onClick={() => void save()}
            >
              {apply.isPending ? "Aplicando…" : `Aplicar ${pending} ${pending === 1 ? "cambio" : "cambios"}`}
            </button>
            {errorRows > 0 ? (
              <span className="inst-hint">
                {errorRows === 1 ? "Queda una fila con error" : `Quedan ${errorRows} filas con error`}: corríjalas en las
                celdas en rojo (F8 salta a la siguiente) o vacíe la fila para omitirla.
              </span>
            ) : pending === 0 && result.problems.length === 0 ? (
              <span className="inst-hint">El libro coincide con lo que ya hay: no hay nada que aplicar.</span>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function SheetEditor({
  summary,
  table,
  filter,
  serverRow,
  onCells,
  onAddRow,
}: {
  summary: SheetSummary;
  table: string[][];
  filter: RowStatus | "todos";
  serverRow: { line: number; text: string } | null;
  onCells: (index: number, cells: string[]) => void;
  onAddRow: () => void;
}) {
  const header = table[0] ?? [];
  const def = SHEETS.find((item) => item.kind === summary.kind)!;
  const byLine = useMemo(() => new Map(summary.rows.map((row) => [row.line, row])), [summary.rows]);

  const rows: SheetRow[] = useMemo(
    () =>
      table
        .slice(1)
        .map((cells, offset) => ({ index: offset + 1, cells: header.map((_, i) => cells[i] ?? "") }))
        .filter((row) => {
          if (filter === "todos") return true;
          const parsed = byLine.get(row.index + 1);
          if (serverRow?.line === row.index + 1) return filter === "error";
          return parsed ? parsed.status === filter : false;
        }),
    [table, header, filter, byLine, serverRow],
  );

  /** Errores por columna de una fila, sacados de «…, columna X: motivo». */
  const errorsOf = useCallback(
    (line: number): Map<number, string> => {
      const out = new Map<number, string>();
      const parsed: StructureRow | undefined = byLine.get(line);
      for (const message of parsed?.errors ?? []) {
        const hit = /columna ([A-Z]+):\s*(.*)$/.exec(message);
        const at = hit ? columnIndex(hit[1]) : 0;
        out.set(at, out.has(at) ? `${out.get(at)} · ${hit?.[2] ?? message}` : hit?.[2] ?? message);
      }
      return out;
    },
    [byLine],
  );

  const columns: GridColumn<SheetRow, string[]>[] = header.map((title, i) => {
    const known = def.columns.find((column) => normalize(column.header).replace(/\s*\(.*\)\s*$/, "") === normalize(title).replace(/\s*\(.*\)\s*$/, ""));
    const choices = CHOICES[normalize(title).replace(/\s*\(.*\)\s*$/, "")];
    return {
      key: `c${i}`,
      label: title || `Columna ${i + 1}`,
      width: Math.max(90, Math.min(320, (known?.width ?? 16) * 8)),
      choices,
      show: (_, draft) => draft[i] ?? "",
      write: (draft, raw) => {
        const next = draft.slice();
        next[i] = raw.trim();
        return { draft: next };
      },
    };
  });

  const counts =
    ORDER.filter((status) => summary.counts[status] > 0)
      .map((status) => `${summary.counts[status]} ${STATUS[status].label.toLowerCase()}`)
      .join(" · ") || "sin filas";

  return (
    <section className="inst-sheetpreview" aria-labelledby={`inst-hoja-${summary.kind}`}>
      <h3 id={`inst-hoja-${summary.kind}`}>
        {summary.name}
        <span className="inst-sheetpreview__counts">{counts}</span>
      </h3>
      <DataGrid<SheetRow, string[]>
        label={`Hoja ${summary.name}`}
        rows={rows}
        rowId={(row) => String(row.index)}
        initial={(row) => row.cells}
        columns={columns}
        frozen={Math.min(2, columns.length)}
        showFilter={false}
        rowLabel={(row) => String(row.index + 1)}
        empty={table.length <= 1 ? "La hoja está vacía." : "Ninguna fila con este filtro."}
        toolbar={
          <button type="button" className="button-ghost" onClick={onAddRow}>
            <Icon name="plus" size={14} /> Añadir fila
          </button>
        }
        onDraftChange={(row, draft) => onCells(row.index, draft)}
        cellError={(row, _draft, key) => {
          const line = row.index + 1;
          if (serverRow?.line === line && key === "c1") return serverRow.text;
          return errorsOf(line).get(Number(key.slice(1)));
        }}
        status={(row) => {
          const line = row.index + 1;
          if (serverRow?.line === line) return { text: `La base la rechazó: ${serverRow.text}`, tone: "bad" };
          const parsed = byLine.get(line);
          if (!parsed) return { text: "Vacía: se omite", tone: "muted" };
          // El motivo por escrito, no solo el color: «columna B: falta el nombre».
          const reasons = parsed.errors.map((message) => message.replace(/^Hoja [^,]+, fila \d+, /, ""));
          const note =
            parsed.status === "error"
              ? `${reasons[0] ?? "Tiene error"}${reasons.length > 1 ? ` (+${reasons.length - 1})` : ""}`
              : STATUS[parsed.status].verb;
          const detail = parsed.status === "actualizado" && parsed.changes.length ? ` · ${parsed.changes.join(" · ")}` : "";
          const tone = parsed.status === "error" ? "bad" : parsed.status === "sin_cambio" ? "muted" : parsed.status === "nuevo" ? "ok" : "warn";
          return { text: `${STATUS[parsed.status].glyph} ${note}${detail}`, tone };
        }}
      />
    </section>
  );
}
