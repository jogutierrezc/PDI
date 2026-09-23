/* =============================================================================
   Plantilla Excel · Mi reporte.

   Descargar: la base registra y firma la plantilla; el navegador la arma
   con los registros de hoy.

   Importar, en la misma pantalla y sin modales:
     1. Se elige el archivo. Si la estructura o la firma no cuadran, se
        rechaza completo y se dice por qué.
     2. Vista previa: nuevas, actualizadas, sin cambio, omitidas, con error y
        en conflicto. Cada error con su fila, su columna y su mensaje. En los
        conflictos, quien importa elige qué valor conservar.
     3. Cargar: las filas válidas quedan en borrador (canal Excel) y el lote
        queda registrado. Importar no es enviar.
     Siempre se puede bajar la misma plantilla con una columna «Errores» y
     las celdas con error en rojo.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { downloadBlob } from "../../admin/traslado/transfer";
import type { CaptureRow } from "../data/capture-db";
import { signTemplate, useAllOrNothing, useImportTemplate, verifyTemplate } from "../data/excel-db";
import type { ImportResult } from "../data/excel-db";
import { buildTemplate, templateFileName } from "../excel/template";
import { STATUS_LABEL, annotate, classify, countByStatus, payloadOf, readTemplate } from "../excel/import";
import type { PreviewRow, RowStatus } from "../excel/import";
import type { Workbook } from "exceljs";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Firma, arma y descarga la plantilla del programa y el periodo. */
export async function downloadTemplate(input: { periodId: string; programId: string; programName: string; programCode: string; rows: CaptureRow[] }) {
  const signed = await signTemplate(input.periodId, input.programId);
  const { default: ExcelJS } = await import("exceljs");
  const book = await buildTemplate(ExcelJS, { signed, programName: input.programName, rows: input.rows });
  const buffer = await book.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: XLSX }), templateFileName(input.programCode, signed.periodCode));
}

const ROW_LABEL: Record<RowStatus, string> = {
  nueva: "Nueva",
  actualizada: "Actualizada",
  sin_cambio: "Sin cambio",
  omitida: "Omitida",
  error: "Con error",
  conflicto: "En conflicto",
};

const ORDER: RowStatus[] = ["error", "conflicto", "nueva", "actualizada", "omitida", "sin_cambio"];

export function ExcelImport({ rows, onClose }: { rows: CaptureRow[]; onClose: () => void }) {
  const policy = useAllOrNothing();
  const importer = useImportTemplate();
  const [file, setFile] = useState<{ name: string; book: Workbook } | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ templateId: string; rows: PreviewRow[] } | null>(null);
  const [filter, setFilter] = useState<RowStatus | "todas">("todas");
  const [keepExcel, setKeepExcel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const counts = useMemo(() => (preview ? countByStatus(preview.rows) : null), [preview]);
  const allOrNothing = policy.data === true;
  const toLoad = preview ? payloadOf(preview.rows, keepExcel) : [];
  const blockedByPolicy = allOrNothing && (counts?.error ?? 0) > 0;

  async function read(chosen: File | undefined) {
    if (!chosen) return;
    setBusy(true);
    setError("");
    setRejected([]);
    setPreview(null);
    setResult(null);
    setKeepExcel(new Set());
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await chosen.arrayBuffer());
      setFile({ name: chosen.name, book });
      const read = readTemplate(book);
      if (read.structure.length || !read.control) {
        setRejected(read.structure.length ? read.structure : ["El archivo no es una plantilla del sistema."]);
        return;
      }
      const verified = await verifyTemplate(read.control);
      setPreview({ templateId: verified.templateId, rows: classify(read.rows, rows, verified.generatedAt) });
    } catch (cause) {
      setRejected([cause instanceof Error ? cause.message : "No se pudo leer el archivo."]);
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    if (!preview || !file) return;
    setError("");
    try {
      const report = {
        conteos: countByStatus(preview.rows),
        conflictosConExcel: [...keepExcel],
        errores: preview.rows.flatMap((r) => r.errors.map((e) => e.message)).slice(0, 200),
      };
      setResult(
        await importer.mutateAsync({
          templateId: preview.templateId,
          rows: toLoad,
          fileName: file.name,
          summary: { rowsRead: preview.rows.length, rowsError: counts?.error ?? 0, report },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo importar.");
    }
  }

  async function downloadWithErrors() {
    if (!file || !preview) return;
    const buffer = await annotate(file.book, preview.rows).xlsx.writeBuffer();
    downloadBlob(new Blob([buffer], { type: XLSX }), file.name.replace(/\.xlsx$/i, "") + "-con-errores.xlsx");
  }

  const shown = (preview?.rows ?? [])
    .filter((r) => (filter === "todas" ? r.status !== "sin_cambio" : r.status === filter))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.rowNumber - b.rowNumber);

  return (
    <section className="admin-card ia-xls" aria-labelledby="importar-excel">
      <div className="admin-card__head">
        <div>
          <h2 id="importar-excel">Importar la plantilla Excel</h2>
          <p className="ia-muted">
            Use la plantilla que descargó de aquí mismo. Se revisa antes de cargar nada; importar deja los registros en
            borrador y no los envía. {allOrNothing ? "La importación es todo o nada: una fila con error cancela el archivo." : "Se cargan las filas válidas; las que tengan error quedan como están."}
          </p>
        </div>
        <div className="ia-actions">
          <label className="button-secondary ia-file">
            <Icon name="upload" size={15} />
            {busy ? "Revisando…" : file ? "Elegir otro archivo" : "Elegir el archivo"}
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" className="button-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      {rejected.length > 0 && (
        <div className="ia-xls__rejected" role="alert">
          <Icon name="alert" size={15} />
          <div>
            <strong>Se rechazó el archivo completo{file ? ` (${file.name})` : ""}.</strong>
            <ul>
              {rejected.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {preview && counts && (
        <>
          <div className="ia-import__kinds" role="group" aria-label="Filtrar la vista previa">
            <button type="button" aria-pressed={filter === "todas"} onClick={() => setFilter("todas")}>
              Con cambios o avisos <span>{preview.rows.length - counts.sin_cambio}</span>
            </button>
            {ORDER.map((s) => (
              <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} data-status={s}>
                {STATUS_LABEL[s]} <span>{counts[s]}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="ia-empty">{filter === "todas" ? "La plantilla no trae cambios frente a lo que está guardado." : "No hay filas de este tipo."}</p>
          ) : (
            <div className="ia-import__table">
              <table className="ia-table">
                <thead>
                  <tr>
                    <th scope="col">Fila</th>
                    <th scope="col">Indicador</th>
                    <th scope="col">Resultado</th>
                    <th scope="col">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.rowNumber} data-status={r.status}>
                      <td>{r.rowNumber}</td>
                      <td>
                        {r.record ? (
                          <>
                            <span className="ia-code">{r.record.code}</span> {r.record.name}
                            <small className="ia-why">{r.record.campus_name ?? "Todas las sedes"}</small>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <em className={`ia-pill ${r.status === "error" ? "ia-pill--risk" : r.status === "conflicto" ? "ia-pill--pending" : r.status === "nueva" || r.status === "actualizada" ? "ia-pill--done" : ""}`}>
                          {ROW_LABEL[r.status]}
                        </em>
                      </td>
                      <td>
                        {r.errors.map((e) => (
                          <p key={e.message} className="ia-field-error">
                            {e.message}
                          </p>
                        ))}
                        {r.warnings.map((w) => (
                          <p key={w} className="ia-muted">
                            {w}
                          </p>
                        ))}
                        {r.status === "conflicto" && (
                          <fieldset className="ia-choice ia-xls__conflict">
                            <legend>Este registro se guardó en línea después de generar la plantilla. ¿Qué valor conserva?</legend>
                            <label>
                              <input
                                type="radio"
                                name={`conflicto-${r.rowNumber}`}
                                checked={!keepExcel.has(r.rowNumber)}
                                onChange={() => setKeepExcel((k) => new Set([...k].filter((n) => n !== r.rowNumber)))}
                              />
                              El guardado en línea
                            </label>
                            <label>
                              <input
                                type="radio"
                                name={`conflicto-${r.rowNumber}`}
                                checked={keepExcel.has(r.rowNumber)}
                                onChange={() => setKeepExcel((k) => new Set(k).add(r.rowNumber))}
                              />
                              El del Excel
                            </label>
                          </fieldset>
                        )}
                        {(r.status === "nueva" || r.status === "actualizada" || r.status === "conflicto") && (
                          <p className="ia-muted">Cambia: {Object.keys(r.fields).map(fieldLabel).join(", ")}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="ia-publish">
            <div>
              <h2>
                {toLoad.length} {toLoad.length === 1 ? "fila lista" : "filas listas"} para cargar
              </h2>
              <p>
                Quedan en borrador y con canal Excel. Las omitidas (registros ya enviados) y las con error no se cargan.
                {blockedByPolicy && " La importación es todo o nada: corrija las filas con error y vuelva a importar."}
              </p>
              {error && <p className="ia-error">{error}</p>}
            </div>
            <div className="ia-actions">
              <button type="button" className="button-ghost" onClick={() => void downloadWithErrors()}>
                <Icon name="download" size={15} />
                Plantilla con errores marcados
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={toLoad.length === 0 || blockedByPolicy || importer.isPending || Boolean(result)}
                onClick={() => void load()}
              >
                {importer.isPending ? "Cargando…" : `Cargar ${toLoad.length} filas`}
              </button>
            </div>
          </div>
        </>
      )}

      {result && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={15} /> Se cargaron {result.loaded} registros en borrador (lote {result.batchId}).
          {result.errors.length > 0 && ` ${result.errors.length} filas no se cargaron: ${result.errors.map((e) => `fila ${e.row}: ${e.message}`).join(" · ")}`}
          {" "}Revise y envíe desde el tablero cuando esté listo.
        </p>
      )}
    </section>
  );
}

const FIELD_LABEL: Record<string, string> = {
  numerator: "numerador o valor",
  denominator: "denominador",
  n_responses: "n respuestas",
  num_comparison: "numerador del grupo de comparación",
  den_comparison: "denominador del grupo de comparación",
  confirms_preloaded: "confirmación del precargado",
  no_data: "no aplica / sin dato",
  justification: "justificación",
  observations: "observaciones",
  evidence_url: "enlace de evidencia",
};
const fieldLabel = (f: string) => FIELD_LABEL[f] ?? f;
