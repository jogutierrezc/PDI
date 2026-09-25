/* =============================================================================
   Impacto · Pilares y ODS: el diccionario del motor.

   Aquí se estandariza cómo el motor reconoce a qué pilar del PDI y a qué ODS
   apunta un indicador: términos con su peso, por destino. Se editan uno a uno
   o se reemplaza todo con un Excel. Una caja de prueba muestra qué sugeriría
   el motor para un texto cualquiera, antes de correrlo sobre el catálogo.

   Lo edita la administración; Planeación lo consulta.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { sdgById } from "../../data/pdi";
import { downloadBlob } from "../admin/traslado/transfer";
import { workbookToTables } from "../admin/institucion/structure-sheet";
import { ConfirmButton, SaveState } from "../admin/udes-en-cifras/ui";
import { suggest } from "./motor";
import { CRITERIA_SHEET, fillCriteriaWorkbook, parseCriteriaTable, type CriteriaParse } from "./criteria-sheet";
import { FUNCTION_LABEL } from "./model";
import {
  toMotorCriteria,
  useCriteria,
  useDeleteCriterion,
  useReplaceCriteria,
  useRunMotor,
  useSaveCriterion,
  type Catalog,
  type ImpactBase,
} from "./store";

type Dest = { target: "pilar" | "ods"; key: string; label: string };

export function CriteriaEditor({ base, catalog, canEdit }: { base: ImpactBase; catalog: Catalog; canEdit: boolean }) {
  const criteria = useCriteria();
  const save = useSaveCriterion();
  const remove = useDeleteCriterion();
  const replace = useReplaceCriteria();
  const motor = useRunMotor();

  const destinations: Dest[] = useMemo(
    () => [
      ...base.pillars.map((p) => ({ target: "pilar" as const, key: p.id, label: `Pilar ${p.numeral} · ${p.name}` })),
      ...Array.from({ length: 17 }, (_, k) => ({ target: "ods" as const, key: String(k + 1), label: `ODS ${k + 1} · ${sdgById.get(k + 1)?.label ?? ""}` })),
    ],
    [base.pillars],
  );
  const [dest, setDest] = useState<string>(() => `pilar:${base.pillars[0]?.id ?? ""}`);
  const [term, setTerm] = useState("");
  const [weight, setWeight] = useState("2");
  const [probe, setProbe] = useState("");
  const [upload, setUpload] = useState<CriteriaParse | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = criteria.data ?? [];
  const current = destinations.find((d) => `${d.target}:${d.key}` === dest) ?? destinations[0];
  const ofDest = rows
    .filter((c) => c.target === current?.target && (c.target === "pilar" ? c.pillarId === current.key : String(c.sdg) === current.key))
    .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term, "es"));
  const countOf = (d: Dest) => rows.filter((c) => c.target === d.target && (c.target === "pilar" ? c.pillarId === d.key : String(c.sdg) === d.key)).length;

  const probeResult = probe.trim() ? suggest({ name: probe }, toMotorCriteria(rows)) : [];
  const destLabel = (target: "pilar" | "ods", key: string) => destinations.find((d) => d.target === target && d.key === key)?.label ?? key;

  const add = () => {
    if (!current || term.trim().length < 2) return;
    save.mutate(
      {
        target: current.target,
        pillarId: current.target === "pilar" ? current.key : null,
        sdg: current.target === "ods" ? Number(current.key) : null,
        term,
        weight: Number(weight.replace(",", ".")) || 1,
      },
      { onSuccess: () => setTerm("") },
    );
  };

  async function download() {
    setBusy(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      fillCriteriaWorkbook(book, rows, base.pillars);
      const buffer = await book.xlsx.writeBuffer();
      downloadBlob(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `criterios-motor-impacto-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function read(file: File) {
    setBusy(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer());
      const tables = workbookToTables(book);
      const table = tables[CRITERIA_SHEET] ?? Object.values(tables)[0] ?? [];
      setUpload(parseCriteriaTable(table, base.pillars));
    } catch {
      setUpload({ criteria: [], problems: [{ row: 1, message: "No se pudo leer el archivo: tiene que ser un Excel (.xlsx)." }] });
    } finally {
      setBusy(false);
    }
  }

  const readable = catalog.indicators;

  return (
    <div className="imp-criteria">
      <nav className="imp-dest" aria-label="Destinos">
        <span className="imp-queue__head">Pilares del PDI</span>
        {destinations
          .filter((d) => d.target === "pilar")
          .map((d) => (
            <button key={d.key} type="button" aria-current={`${d.target}:${d.key}` === dest || undefined} onClick={() => setDest(`${d.target}:${d.key}`)}>
              <span>{d.label}</span>
              <span className="imp-count">{countOf(d)}</span>
            </button>
          ))}
        <span className="imp-queue__head">Objetivos de Desarrollo Sostenible</span>
        {destinations
          .filter((d) => d.target === "ods")
          .map((d) => (
            <button key={d.key} type="button" aria-current={`${d.target}:${d.key}` === dest || undefined} onClick={() => setDest(`${d.target}:${d.key}`)}>
              <span>{d.label}</span>
              <span className="imp-count" data-empty={countOf(d) === 0 || undefined}>
                {countOf(d)}
              </span>
            </button>
          ))}
      </nav>

      <section className="imp-panel" aria-labelledby="imp-criterios-titulo">
        <header className="imp-panel__head">
          <h2 id="imp-criterios-titulo">{current?.label}</h2>
          <p className="imp-muted imp-small">
            Si el término aparece en la ficha suma su peso; en el nombre del indicador suma el doble. 3 lo define, 2 lo
            sugiere, 1 lo acompaña.
          </p>
        </header>
        {criteria.isPending ? (
          <p className="admin-loading">Cargando el diccionario…</p>
        ) : (
          <ul className="imp-terms">
            {ofDest.map((c) => (
              <li key={c.id}>
                <span className="imp-term">{c.term}</span>
                {canEdit ? (
                  <label className="imp-weight">
                    <span className="sr-only">Peso de {c.term}</span>
                    <select value={String(c.weight)} onChange={(e) => save.mutate({ ...c, weight: Number(e.target.value) })}>
                      {[0.5, 1, 2, 3, 4, 5].map((w) => (
                        <option key={w} value={String(w)}>
                          peso {String(w).replace(".", ",")}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="imp-muted imp-small">peso {String(c.weight).replace(".", ",")}</span>
                )}
                {canEdit && (
                  <button type="button" className="icon-button" onClick={() => remove.mutate(c.id)} aria-label={`Quitar ${c.term}`} title="Quitar">
                    <Icon name="close" size={14} />
                  </button>
                )}
              </li>
            ))}
            {ofDest.length === 0 && <li className="imp-muted imp-small">Sin términos: el motor nunca sugerirá este destino.</li>}
          </ul>
        )}
        {canEdit && (
          <form
            className="imp-add-term"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <label className="admin-field">
              <span>Término o frase</span>
              <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="deserción, sector productivo…" />
            </label>
            <label className="admin-field">
              <span>Peso</span>
              <select value={weight} onChange={(e) => setWeight(e.target.value)}>
                <option value="3">3 · lo define</option>
                <option value="2">2 · lo sugiere</option>
                <option value="1">1 · lo acompaña</option>
              </select>
            </label>
            <button type="submit" className="button-primary" disabled={term.trim().length < 2 || save.isPending}>
              <Icon name="plus" size={15} /> Agregar
            </button>
          </form>
        )}
        <SaveState pending={save.isPending || remove.isPending} error={save.error ?? remove.error} success={save.isSuccess} />
      </section>

      <aside className="imp-side">
        <section>
          <span className="imp-label">Probar el motor</span>
          <label className="admin-field">
            <span className="sr-only">Nombre de un indicador</span>
            <textarea rows={3} value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="Escribe el nombre de un indicador…" />
          </label>
          {probe.trim() &&
            (probeResult.length ? (
              <ul className="imp-align-list">
                {probeResult.map((s) => (
                  <li key={`${s.target}:${s.key}`}>
                    <span className="imp-align" data-target={s.target}>
                      {destLabel(s.target, s.key)}
                    </span>
                    <span className="imp-muted imp-small">
                      {s.confidence} · «{s.terms.slice(0, 3).join("», «")}»
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="imp-muted imp-small">Con este diccionario, nada.</p>
            ))}
        </section>

        {canEdit && (
          <section>
            <span className="imp-label">Recalcular el catálogo</span>
            <p className="imp-muted imp-small">
              Vuelve a sugerir para las {readable.length} fichas. Lo confirmado, lo de la matriz y lo puesto a mano no se toca.
            </p>
            <button
              type="button"
              className="button-secondary"
              disabled={motor.isPending || !rows.length}
              onClick={() => motor.mutate({ indicators: readable, alignments: catalog.alignments, criteria: toMotorCriteria(rows), dimensions: base.dimensions })}
            >
              <Icon name="spark" size={14} /> {motor.isPending ? "Recalculando…" : "Recalcular sugerencias"}
            </button>
            {motor.isSuccess && <p className="imp-small" data-tone="ok">{motor.data} sugerencias nuevas por confirmar en las fichas.</p>}
            {motor.error && <p className="oda-field-warning">{motor.error.message}</p>}
          </section>
        )}

        <section>
          <span className="imp-label">Estandarizar con Excel</span>
          <p className="imp-muted imp-small">Descarga el diccionario vigente, corrígelo y vuelve a cargarlo. La carga lo reemplaza entero.</p>
          <div className="imp-inline-actions">
            <button type="button" className="button-ghost" onClick={() => void download()} disabled={busy}>
              <Icon name="download" size={14} /> Descargar
            </button>
            {canEdit && (
              <label className="button-ghost imp-file">
                <Icon name="upload" size={14} /> Cargar
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void read(file);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          {upload && (
            <div className="imp-upload" role="status">
              {upload.problems.length ? (
                <>
                  <p className="oda-field-warning">
                    {upload.problems.length} {upload.problems.length === 1 ? "fila tiene" : "filas tienen"} un problema; no se
                    reemplaza nada hasta corregirlas.
                  </p>
                  <ul className="imp-missing">
                    {upload.problems.slice(0, 8).map((p) => (
                      <li key={`${p.row}-${p.message}`}>
                        Fila {p.row}: {p.message}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="imp-small">
                    {upload.criteria.length} criterios listos (hoy hay {rows.length}).
                  </p>
                  <ConfirmButton
                    label="Reemplazar el diccionario"
                    confirmLabel={`¿Reemplazar los ${rows.length} criterios por ${upload.criteria.length}?`}
                    onConfirm={() => replace.mutate(upload.criteria, { onSuccess: () => setUpload(null) })}
                  />
                </>
              )}
            </div>
          )}
          <SaveState pending={replace.isPending} error={replace.error} success={replace.isSuccess} />
        </section>

        <p className="imp-muted imp-small">
          Funciones en el catálogo: {Object.values(FUNCTION_LABEL).join(", ")}. El motor lee nombre, descripción, dimensión,
          objetivo y función de cada ficha.
        </p>
      </aside>
    </div>
  );
}
