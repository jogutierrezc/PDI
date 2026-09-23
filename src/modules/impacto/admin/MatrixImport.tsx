/* =============================================================================
   Importar la matriz · Catálogo.

   Tres pasos en el mismo sitio, sin modales:
     1. Elegir el Excel. Se lee en el navegador; nada se guarda todavía.
     2. Ver qué trae: indicadores por función, oficiales y sugeridos, y los
        hallazgos agrupados por tipo. El reporte se descarga en Excel o CSV.
     3. Crear el borrador en la base. La versión publicada no se toca.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import { downloadBlob } from "../../admin/traslado/transfer";
import { FUNCTIONS } from "../data/catalog";
import { FINDING_LABEL, countFindings, importMatrix } from "../import/matrix";
import type { FindingKind, MatrixImport as Imported } from "../import/matrix";
import { findingsToCsv, findingsToWorkbook } from "../import/findings-report";

interface Created {
  number: number;
  indicators: number;
  official: number;
  suggested: number;
  findings: number;
  carried: number;
}

const SHOWN = 60;

export function MatrixImport() {
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<Imported | null>(null);
  const [kind, setKind] = useState<FindingKind | "todos">("todos");
  const [busy, setBusy] = useState<"leer" | "guardar" | null>(null);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  const counts = useMemo(() => (result ? countFindings(result.findings) : {}), [result]);
  const visible = useMemo(
    () => (result ? result.findings.filter((f) => kind === "todos" || f.kind === kind) : []),
    [result, kind],
  );

  async function read(file: File | undefined) {
    if (!file) return;
    setError("");
    setCreated(null);
    setBusy("leer");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer());
      setResult(importMatrix(book));
      setFileName(file.name);
      setKind("todos");
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? `No se pudo leer el archivo: ${cause.message}` : "No se pudo leer el archivo.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadExcel() {
    if (!result) return;
    const book = await findingsToWorkbook(result.findings, fileName);
    const buffer = await book.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `hallazgos-${fileName.replace(/\.xlsx?$/i, "")}.xlsx`,
    );
  }

  function downloadCsv() {
    if (!result) return;
    downloadBlob(new Blob([findingsToCsv(result.findings)], { type: "text/csv;charset=utf-8" }), `hallazgos-${fileName.replace(/\.xlsx?$/i, "")}.csv`);
  }

  async function save() {
    if (!result) return;
    setError("");
    setBusy("guardar");
    try {
      const { data, error: rpcError } = await supabase.rpc("imp_import_catalog", {
        payload: { sourceFile: fileName, ...result },
        carry_sheets: true,
      });
      if (rpcError) {
        if (rpcError.code === "PGRST202") throw new Error("La base aún no tiene el importador: aplique la migración 0066_impacto_importar_catalogo.sql.");
        const friendly = describeDatabaseError(rpcError as DatabaseError);
        throw new Error(`${friendly.message}${friendly.advice ? ` ${friendly.advice}` : ""}`);
      }
      setCreated(data as Created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el borrador.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="admin-card ia-import" aria-labelledby="importar-matriz">
      <div className="admin-card__head">
        <div>
          <h2 id="importar-matriz">Importar la matriz</h2>
          <p className="ia-muted">
            Se lee aquí mismo y nada se guarda hasta que usted cree el borrador. Lo que no encaja se reporta; no se corrige
            en silencio.
          </p>
        </div>
        <label className="button-secondary ia-file">
          <Icon name="upload" size={15} />
          {busy === "leer" ? "Leyendo…" : result ? "Elegir otro archivo" : "Elegir el Excel de la matriz"}
          <input
            type="file"
            accept=".xlsx"
            disabled={busy !== null}
            onChange={(e) => {
              void read(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {error && (
        <p className="ia-error" role="alert">
          <Icon name="alert" size={15} />
          {error}
        </p>
      )}

      {result && (
        <>
          <dl className="ia-counts">
            <div>
              <dt>Indicadores</dt>
              <dd>{result.indicators.length}</dd>
            </div>
            {FUNCTIONS.map((f) => (
              <div key={f.id} style={{ ["--tone" as string]: f.tone }}>
                <dt>{f.name}</dt>
                <dd>{result.indicators.filter((i) => i.functionId === f.id).length}</dd>
              </div>
            ))}
            <div>
              <dt>Oficiales · sugeridos</dt>
              <dd>
                {result.indicators.filter((i) => i.catalogState === "oficial").length} ·{" "}
                {result.indicators.filter((i) => i.catalogState === "sugerido").length}
              </dd>
            </div>
            <div data-alert={result.findings.length > 0 || undefined}>
              <dt>Hallazgos</dt>
              <dd>{result.findings.length}</dd>
            </div>
          </dl>

          <div className="ia-import__kinds" role="group" aria-label="Filtrar hallazgos por tipo">
            <button type="button" aria-pressed={kind === "todos"} onClick={() => setKind("todos")}>
              Todos <span>{result.findings.length}</span>
            </button>
            {(Object.entries(counts) as [FindingKind, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {FINDING_LABEL[k]} <span>{n}</span>
                </button>
              ))}
          </div>

          <div className="ia-import__table">
            <table className="ia-table">
              <thead>
                <tr>
                  <th scope="col">Hoja</th>
                  <th scope="col">Fila</th>
                  <th scope="col">Col.</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Sugerencia</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, SHOWN).map((f, i) => (
                  <tr key={`${f.sheet}-${f.row}-${f.column}-${f.kind}-${i}`}>
                    <td>{f.sheet}</td>
                    <td>{f.row ?? "—"}</td>
                    <td>{f.column ?? "—"}</td>
                    <td>{FINDING_LABEL[f.kind]}</td>
                    <td className="ia-import__value">{f.value}</td>
                    <td>{f.suggestion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length > SHOWN && (
              <p className="ia-muted">
                Se muestran {SHOWN} de {visible.length}. El reporte descargable los trae todos.
              </p>
            )}
          </div>

          <div className="ia-actions">
            <button type="button" className="button-ghost" onClick={downloadCsv}>
              <Icon name="download" size={15} />
              Reporte en CSV
            </button>
            <button type="button" className="button-ghost" onClick={() => void downloadExcel()}>
              <Icon name="download" size={15} />
              Reporte en Excel
            </button>
            <button type="button" className="button-primary" disabled={busy !== null || Boolean(created)} onClick={() => void save()}>
              {busy === "guardar" ? "Creando el borrador…" : "Crear el borrador del catálogo"}
            </button>
          </div>

          {created && (
            <p className="admin-notice" role="status">
              <Icon name="check" size={15} />
              Borrador de la versión {created.number}: {created.indicators} indicadores ({created.official} oficiales,{" "}
              {created.suggested} sugeridos) y {created.findings} hallazgos abiertos.
              {created.carried > 0 && ` Se copió la ficha técnica de ${created.carried} indicadores de la versión publicada.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
