/* =============================================================================
   Impacto · Importar cifras (vicerrectorías y oficinas).

   Descargar la plantilla de su función, llenarla en Excel y cargarla: antes
   de escribir nada se ve qué entra, qué cambia y qué ya estaba igual, y
   cualquier fila con problema detiene la carga y dice por qué.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { downloadBlob } from "../../admin/traslado/transfer";
import { workbookToTables } from "../../admin/institucion/structure-sheet";
import type { ImpactAccess } from "../access";
import { FUNCTION_LABEL, type SubstantiveFunction } from "../model";
import { useImportValues, useValues, type Catalog, type ImpactBase } from "../store";
import { DATA_SHEET, fillTemplate, parseImport, type ImportContext, type ImportParse } from "./template";
import "./import.css";

const STATE_LABEL = { nueva: "Nueva", cambia: "Cambia", igual: "Igual" } as const;

export function Importer({
  fn,
  base,
  catalog,
  access,
}: {
  fn: SubstantiveFunction;
  base: ImpactBase;
  catalog: Catalog;
  access: ImpactAccess;
}) {
  const indicators = useMemo(
    () => catalog.indicators.filter((i) => i.fn === fn && i.status !== "retirado" && access.canDefine(i.fn, i.ownerUnitId)),
    [catalog.indicators, fn, access],
  );
  const ids = useMemo(() => indicators.map((i) => i.id), [indicators]);
  const values = useValues(ids);
  const importValues = useImportValues();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<(ImportParse & { name: string }) | null>(null);
  const [done, setDone] = useState<{ creadas: number; actualizadas: number } | null>(null);

  const ctx: ImportContext = useMemo(
    () => ({
      indicators,
      campuses: base.campuses,
      sites: base.offer.map((o) => ({
        programId: o.programId,
        campusId: o.campusId,
        programName: base.units.find((u) => u.id === o.programId)?.name ?? "Programa",
        campusName: base.campuses.find((c) => c.id === o.campusId)?.name ?? "Sede",
      })),
      values: values.data ?? [],
    }),
    [indicators, base, values.data],
  );

  const cutYear = Math.min(new Date().getFullYear() - 1, 2028);

  async function download() {
    setBusy(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      fillTemplate(book, ctx, cutYear);
      const buffer = await book.xlsx.writeBuffer();
      downloadBlob(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `plantilla-cifras-${fn}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function read(input: File) {
    setBusy(true);
    setDone(null);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await input.arrayBuffer());
      const tables = workbookToTables(book);
      const table = tables[DATA_SHEET] ?? Object.values(tables)[0] ?? [];
      setParsed({ ...parseImport(table, ctx), name: input.name });
    } catch {
      setParsed({ rows: [], problems: [{ line: 1, message: "No se pudo leer el archivo: tiene que ser un Excel (.xlsx)." }], empty: 0, name: input.name });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  const toLoad = parsed?.rows.filter((r) => r.state !== "igual") ?? [];
  const counts = parsed
    ? { nueva: parsed.rows.filter((r) => r.state === "nueva").length, cambia: parsed.rows.filter((r) => r.state === "cambia").length, igual: parsed.rows.filter((r) => r.state === "igual").length }
    : null;

  const load = async () => {
    const result = await importValues.mutateAsync(toLoad.map((r) => r.row));
    setDone(result);
    setParsed(null);
  };

  if (indicators.length === 0) {
    return (
      <p className="imp-muted">
        No tiene fichas de {FUNCTION_LABEL[fn]} en las que pueda cargar cifras. Cargan el editor o el jefe de la unidad dueña.
      </p>
    );
  }

  return (
    <div className="imp-import">
      <section className="imp-import__steps">
        <div className="imp-import__step">
          <span className="imp-import__n" aria-hidden="true">1</span>
          <div>
            <h2>Descargue la plantilla</h2>
            <p>
              Trae sus {indicators.length} fichas de {FUNCTION_LABEL[fn]} con el año {cutYear} y alcance Global, y las listas de
              sedes y programas para los desplegables.
            </p>
            <button type="button" className="button-secondary" onClick={() => void download()} disabled={busy || values.isPending}>
              <Icon name="download" size={15} /> Descargar plantilla
            </button>
          </div>
        </div>
        <div className="imp-import__step">
          <span className="imp-import__n" aria-hidden="true">2</span>
          <div>
            <h2>Llénela en Excel</h2>
            <p>Una fila por cifra. Global para toda la UDES, Sede para una sede, Programa para un programa en su sede. Copie filas para más años o alcances.</p>
          </div>
        </div>
        <div className="imp-import__step">
          <span className="imp-import__n" aria-hidden="true">3</span>
          <div>
            <h2>Cárguela y revise</h2>
            <p>Verá qué entra antes de guardar. Si una fila tiene un problema, se lo decimos y no se carga nada.</p>
            <label className="button-primary imp-import__file">
              <Icon name="upload" size={15} /> {busy ? "Leyendo…" : "Cargar archivo"}
              <input
                ref={file}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                disabled={busy}
                onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])}
              />
            </label>
          </div>
        </div>
      </section>

      {done && (
        <p className="imp-sync__applied imp-import__done" role="status">
          <Icon name="check" size={16} /> Cargadas: {done.creadas} cifras nuevas y {done.actualizadas} actualizadas.
        </p>
      )}

      {parsed && (
        <section className="imp-import__review">
          <header>
            <h2>{parsed.name}</h2>
            {counts && !parsed.problems.length && (
              <span>
                {counts.nueva} nuevas · {counts.cambia} cambian · {counts.igual} iguales
                {parsed.empty ? ` · ${parsed.empty} filas sin valor, ignoradas` : ""}
              </span>
            )}
          </header>

          {parsed.problems.length > 0 ? (
            <div className="imp-import__problems" role="alert">
              <p>
                <Icon name="alert" size={16} /> <strong>{parsed.problems.length} filas con problemas.</strong> Corríjalas en el
                archivo y vuelva a cargarlo; no se cargó nada.
              </p>
              <ul>
                {parsed.problems.slice(0, 60).map((p, k) => (
                  <li key={k}>
                    <b>Fila {p.line}</b> {p.message}
                  </li>
                ))}
                {parsed.problems.length > 60 && <li>… y {parsed.problems.length - 60} más.</li>}
              </ul>
            </div>
          ) : (
            <>
              <div className="imp-table-wrap imp-import__table">
                <table className="imp-table">
                  <thead>
                    <tr>
                      <th scope="col" className="imp-num">Fila</th>
                      <th scope="col">Cifra</th>
                      <th scope="col" className="imp-num">Valor</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 300).map((r) => (
                      <tr key={r.line} data-state={r.state}>
                        <td className="imp-num">{r.line}</td>
                        <th scope="row">{r.label}</th>
                        <td className="imp-num">
                          {r.row.not_applicable
                            ? "No aplica"
                            : r.row.numerator !== null
                              ? `${r.row.numerator} / ${r.row.denominator}`
                              : r.row.value_num ?? r.row.value_text}
                        </td>
                        <td>
                          <span className="imp-tag" data-tone={r.state === "igual" ? "quiet" : undefined}>{STATE_LABEL[r.state]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="imp-sync__bar">
                <span>
                  <strong>{toLoad.length} cifras para cargar.</strong> Las iguales no se tocan.
                </span>
                {importValues.error && (
                  <span className="imp-sync__error" role="alert"><Icon name="alert" size={15} /> {importValues.error.message}</span>
                )}
                <button type="button" className="button-secondary" onClick={() => setParsed(null)}>Descartar</button>
                <button type="button" className="button-primary" disabled={!toLoad.length || importValues.isPending} onClick={load}>
                  {importValues.isPending ? "Cargando…" : `Cargar ${toLoad.length} cifras`}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
