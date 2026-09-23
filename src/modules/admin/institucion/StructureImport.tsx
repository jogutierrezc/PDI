/* =============================================================================
   Carga masiva de la estructura institucional desde Excel.

   Tres pasos en la misma ficha, sin modal: descargar la plantilla (un libro
   con una hoja por clase, que ya trae lo que existe y listas desplegables),
   subirla y ver hoja por hoja qué pasaría. Nada se guarda hasta «Aplicar», y
   aplicar es todo o nada: con una sola fila con error el botón no se
   habilita, y si la base rechaza una fila no se escribe ninguna
   (admin_import_units, 0074).

   ExcelJS pesa: se carga solo al descargar o leer.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { downloadBlob } from "../traslado/transfer";
import { useImportUnits } from "./institution-db";
import type { Institution } from "./institution-db";
import { canApply, fillStructureTemplate, parseStructureWorkbook, rowsToImport, workbookToTables } from "./structure-sheet";
import type { RowStatus, SheetSummary, StructureResult } from "./structure-sheet";

const STATUS: Record<RowStatus, { label: string; glyph: string; verb: string }> = {
  nuevo: { label: "Nuevas", glyph: "+", verb: "Se crea" },
  actualizado: { label: "Actualizadas", glyph: "↻", verb: "Se actualiza" },
  sin_cambio: { label: "Sin cambio", glyph: "=", verb: "Queda igual" },
  error: { label: "Con error", glyph: "!", verb: "No se puede cargar" },
};

const ORDER: RowStatus[] = ["error", "nuevo", "actualizado", "sin_cambio"];

export function StructureImport({ data }: { data: Institution }) {
  const apply = useImportUnits();
  const [result, setResult] = useState<StructureResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState<"plantilla" | "leer" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null);
  const [filter, setFilter] = useState<RowStatus | "todos">("todos");

  const context = useMemo(() => ({ units: data.units, campuses: data.campuses, offer: data.offer }), [data]);

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

  async function read(file: File | undefined) {
    if (!file) return;
    setError("");
    setDone(null);
    setBusy("leer");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer());
      setResult(parseStructureWorkbook(workbookToTables(book), context));
      setFileName(file.name);
      setFilter("todos");
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? `No se pudo leer el archivo: ${cause.message}` : "No se pudo leer el archivo.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!result || !canApply(result)) return;
    setError("");
    try {
      const outcome = await apply.mutateAsync(rowsToImport(result));
      setDone(outcome);
      setResult(null);
    } catch (cause) {
      const advice = (cause as Error & { advice?: string }).advice;
      setError(cause instanceof Error ? `${cause.message}${advice ? ` ${advice}` : ""}` : "No se pudo aplicar la carga.");
    }
  }

  const pending = result ? result.counts.nuevo + result.counts.actualizado : 0;
  const total = result ? result.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) : 0;

  return (
    <section className="inst-sheet" aria-labelledby="inst-import-title">
      <header className="inst-sheet__head">
        <div>
          <h2 id="inst-import-title">Cargar la estructura desde Excel</h2>
          <p className="inst-lead">
            Vicerrectorías, facultades, oficinas y programas en un solo libro, una hoja por clase. Cada unidad se reconoce
            por su código (un programa, antes por su SNIES). Nada se guarda hasta que usted aplique, y si una fila tiene
            error no se guarda ninguna.
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
            {busy === "leer" ? "Leyendo…" : result ? "Elegir otro archivo" : "Elegir el Excel"}
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
            <strong>Revise y aplique.</strong> Solo se escriben las unidades nuevas y las que cambian.
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

      {result && (
        <div className="inst-preview" aria-live="polite">
          <p className="inst-preview__file">
            <Icon name="table" size={15} /> {fileName}
          </p>
          {result.problems.map((problem) => (
            <p key={problem} className="admin-error" role="alert">
              <Icon name="alert" size={16} /> {problem}
            </p>
          ))}

          {total > 0 && (
            <>
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

              {result.sheets.map((sheet) => (
                <SheetPreview key={sheet.kind} sheet={sheet} filter={filter} />
              ))}
            </>
          )}

          <div className="inst-form__actions">
            <button
              type="button"
              className="button-primary"
              disabled={!canApply(result) || apply.isPending || !data.ready}
              onClick={() => void save()}
            >
              {apply.isPending ? "Aplicando…" : `Aplicar ${pending} ${pending === 1 ? "cambio" : "cambios"}`}
            </button>
            {result.counts.error > 0 ? (
              <span className="inst-hint">
                Corrija {result.counts.error === 1 ? "la fila con error" : `las ${result.counts.error} filas con error`} en el
                Excel y vuelva a subirlo.
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

function SheetPreview({ sheet, filter }: { sheet: SheetSummary; filter: RowStatus | "todos" }) {
  if (!sheet.found) return null;
  const rows = sheet.rows.filter((row) => filter === "todos" || row.status === filter);
  const id = `inst-hoja-${sheet.kind}`;
  return (
    <section className="inst-sheetpreview" aria-labelledby={id}>
      <h3 id={id}>
        {sheet.name}
        <span className="inst-sheetpreview__counts">
          {ORDER.filter((status) => sheet.counts[status] > 0)
            .map((status) => `${sheet.counts[status]} ${STATUS[status].label.toLowerCase()}`)
            .join(" · ") || "sin filas"}
        </span>
      </h3>
      {rows.length === 0 ? (
        <p className="inst-hint">{sheet.rows.length === 0 ? "La hoja está vacía." : "Ninguna fila con este filtro."}</p>
      ) : (
        <div className="table-scroll">
          <table className="inst-table">
            <caption className="sr-only">Vista previa de la hoja {sheet.name}, fila por fila</caption>
            <thead>
              <tr>
                <th scope="col">Fila</th>
                <th scope="col">Unidad</th>
                <th scope="col">Qué pasará</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.line} data-status={row.status}>
                  <td className="inst-table__line">{row.line}</td>
                  <th scope="row">
                    <strong>{row.name || "Sin nombre"}</strong>
                    <small>{row.code || "Sin código"}</small>
                  </th>
                  <td>
                    <span className="inst-status" data-status={row.status}>
                      <span aria-hidden="true" className="inst-glyph">
                        {STATUS[row.status].glyph}
                      </span>
                      {STATUS[row.status].verb}
                    </span>
                    {(row.errors.length > 0 || row.changes.length > 0) && (
                      <ul className="inst-table__notes">
                        {[...row.errors, ...row.changes].map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
