/* =============================================================================
   Presupuesto del PDI · administración

   Vive solo aquí. El portal público no muestra ni una cifra de dinero, y desde
   la migración 0015 tampoco la sirve: `v_projects` dejó de traerla, `anon`
   perdió el permiso sobre la columna en la tabla y las vistas de presupuesto no
   se le conceden. Esta pantalla lee `v_projects_admin`, `v_project_budget` y
   `v_pillar_budget`, ninguna de las cuales responde sin sesión con rol.

   Tres cifras, y la relación entre ellas es lo que la pantalla existe para
   enseñar:

     · **Formulado** — `projects.total_value`. Lo que el proyecto dijo que
       costaría el día que se formuló. No se recalcula nunca: es el compromiso
       original y sirve de contraste.
     · **Proyectado** — la suma de lo que cada año se programó, según los
       reportes. Puede alejarse de lo formulado, y esa distancia es información.
     · **Ejecutado** — la suma de lo que cada año se giró.

   Y debajo, las **acciones que ejecutan el presupuesto**: los indicadores de
   resultado que cuelgan del proyecto. Son lo que el dinero paga, así que ver
   cuánto se ha girado sin ver qué se ha hecho con ello sería media respuesta.

   El reporte se captura año a año, como todo lo demás del plan. Un año sin
   reportar se queda en blanco y no en cero: "no lo hemos reportado" y "no se
   giró nada" son afirmaciones distintas, y confundirlas al capturar es cómo se
   fabrican los informes que nadie se cree.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { Modal, ModalActions } from "../../../components/ui/Modal";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../../../components/ui/QueryState";
import { useAdminProjects, useBudget, usePillars } from "../../../data/queries";
import { budgetScope, useRemoveRow, useSaveRow } from "../../../data/mutations";
import { accentFor, formatCurrency, planYears, statusMeta } from "../../../data/pdi";
import { useAuth } from "../../../lib/auth";
import type { Activity, ProjectBudgetReport } from "../../../types/database";
import "./budget.css";

/** Lo que se está capturando: un año de un proyecto. */
interface DraftReport {
  id?: string;
  project_id: string;
  year: number;
  projected: string;
  executed: string;
  note: string;
}

/** "" → null. Es la diferencia entre "sin reportar" y "cero". */
function toAmount(value: string): number | null {
  const clean = value.trim();
  return clean === "" ? null : Number(clean);
}

/** Ejecutado sobre proyectado. Null cuando no hay nada proyectado: un
 *  porcentaje sobre cero no es cero, es una pregunta sin respuesta. */
function rate(projected: number, executed: number): number | null {
  return projected === 0 ? null : Math.round((executed * 100) / projected);
}

export function BudgetAdmin() {
  const budget = useBudget();
  const projects = useAdminProjects();
  const pillars = usePillars();
  const { hasRole } = useAuth();
  const canEdit = hasRole("responsable");

  const [editing, setEditing] = useState<DraftReport | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectBudgetReport | null>(null);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [error, setError] = useState("");

  const save = useSaveRow(budgetScope());
  const remove = useRemoveRow(budgetScope());

  const rows = budget.data;
  const pillarById = useMemo(
    () => new Map((pillars.data ?? []).map((pillar) => [pillar.id, pillar])),
    [pillars.data],
  );

  /** Los reportes de cada proyecto, por año. */
  const reportsByProject = useMemo(() => {
    const map = new Map<string, ProjectBudgetReport[]>();
    for (const report of rows?.reports ?? []) {
      const list = map.get(report.project_id) ?? [];
      list.push(report);
      map.set(report.project_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.year - b.year);
    return map;
  }, [rows?.reports]);

  /** Las acciones —indicadores de resultado— de cada proyecto. */
  const actionsByProject = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const action of rows?.actions ?? []) {
      if (!action.project_id) continue;
      const list = map.get(action.project_id) ?? [];
      list.push(action);
      map.set(action.project_id, list);
    }
    return map;
  }, [rows?.actions]);

  const formulatedByProject = useMemo(
    () => new Map((projects.data ?? []).map((project) => [project.id, project.total_value])),
    [projects.data],
  );

  const totals = useMemo(() => {
    const list = rows?.projects ?? [];
    return {
      formulated: list.reduce((sum, row) => sum + (row.formulated ?? 0), 0),
      projected: list.reduce((sum, row) => sum + row.projected, 0),
      executed: list.reduce((sum, row) => sum + row.executed, 0),
      withReports: list.filter((row) => row.reported_years > 0).length,
      count: list.length,
    };
  }, [rows?.projects]);

  async function submit(draft: DraftReport) {
    setError("");
    try {
      await save.mutateAsync({
        table: "project_budget_reports",
        id: draft.id,
        values: {
          project_id: draft.project_id,
          year: draft.year,
          projected: toAmount(draft.projected),
          executed: toAmount(draft.executed),
          note: draft.note.trim(),
        },
      });
      setEditing(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar el reporte.");
    }
  }

  return (
    <AdminShell
      section="budget"
      kicker="Recursos del plan"
      title="Presupuesto"
      description="Lo formulado, lo proyectado y lo ejecutado de cada proyecto, año a año, con las acciones que ejecutan ese presupuesto. No se publica en ninguna pantalla abierta."
    >
      {!canEdit && <ReadOnlyNotice />}

      <p className="budget-privacy">
        <Icon name="lock" size={15} />
        <span>
          <b>Información interna.</b> Ninguna cifra de esta pantalla aparece en el portal público, y
          la base de datos tampoco la sirve a quien no tenga sesión con rol.
        </span>
      </p>

      {budget.isPending || projects.isPending ? (
        <CardSkeleton count={4} />
      ) : budget.isError ? (
        <ErrorBlock error={budget.error} onRetry={() => void budget.refetch()} />
      ) : (
        <>
          {/* --- Las tres cifras del plan ---------------------------------- */}
          <section className="budget-totals" aria-label="Presupuesto del plan">
            <BudgetTile
              label="Presupuesto formulado"
              value={formatCurrency(totals.formulated)}
              hint={`Declarado al formular ${totals.count} ${totals.count === 1 ? "proyecto" : "proyectos"}.`}
            />
            <BudgetTile
              label="Presupuesto proyectado"
              value={formatCurrency(totals.projected)}
              hint={`Programado en los reportes de ${totals.withReports} ${totals.withReports === 1 ? "proyecto" : "proyectos"}.`}
            />
            <BudgetTile
              label="Presupuesto ejecutado"
              value={formatCurrency(totals.executed)}
              hint={
                rate(totals.projected, totals.executed) === null
                  ? "Todavía no hay nada proyectado con lo que comparar."
                  : `${rate(totals.projected, totals.executed)}% de lo proyectado.`
              }
              rate={rate(totals.projected, totals.executed)}
            />
          </section>

          {/* --- Por pilar ------------------------------------------------- */}
          <section className="admin-block" aria-labelledby="por-pilar">
            <h2 id="por-pilar">Por pilar</h2>
            <p className="admin-block__hint">
              Cada proyecto cuenta una sola vez, en su pilar dueño. Es al revés que el avance, donde
              un proyecto transversal pesa en cada pilar al que aporta: el trabajo se reparte, el
              dinero no se multiplica.
            </p>

            <div className="budget-table-wrap">
              <table className="budget-table">
                <caption className="sr-only">Presupuesto por pilar</caption>
                <thead>
                  <tr>
                    <th scope="col">Pilar</th>
                    <th scope="col">Proyectos</th>
                    <th scope="col">Formulado</th>
                    <th scope="col">Proyectado</th>
                    <th scope="col">Ejecutado</th>
                    <th scope="col">Ejecución</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows?.pillars ?? []).map((row) => (
                    <tr key={row.pillar_id}>
                      <th scope="row">
                        <span
                          className="budget-swatch"
                          style={{ background: accentFor(pillarById.get(row.pillar_id)?.accent_slot) }}
                          aria-hidden="true"
                        />
                        {row.name}
                      </th>
                      <td>{row.project_count}</td>
                      <td>{formatCurrency(row.formulated)}</td>
                      <td>{formatCurrency(row.projected)}</td>
                      <td>{formatCurrency(row.executed)}</td>
                      <td>{row.execution_rate === null ? "—" : `${row.execution_rate}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* --- Proyecto a proyecto --------------------------------------- */}
          <section className="admin-block" aria-labelledby="por-proyecto">
            <h2 id="por-proyecto">Proyecto a proyecto</h2>
            <p className="admin-block__hint">
              Abre un proyecto para reportar sus años y ver las acciones que ejecutan su
              presupuesto. Un año sin reportar se deja en blanco: no es lo mismo que un cero.
            </p>

            {(rows?.projects ?? []).length === 0 ? (
              <EmptyBlock
                title="Todavía no hay proyectos formulados."
                hint="Los proyectos se crean en el módulo de Proyectos."
              />
            ) : (
              <ul className="budget-list">
                {(rows?.projects ?? []).map((row) => {
                  const open = openProject === row.project_id;
                  const reports = reportsByProject.get(row.project_id) ?? [];
                  const actions = actionsByProject.get(row.project_id) ?? [];
                  const pillar = pillarById.get(row.pillar_id);
                  const formulated = formulatedByProject.get(row.project_id) ?? row.formulated;

                  return (
                    <li className="budget-card card" key={row.project_id}>
                      <button
                        type="button"
                        className="budget-card__head"
                        aria-expanded={open}
                        onClick={() => setOpenProject(open ? null : row.project_id)}
                      >
                        <span className="budget-card__title">
                          <strong>{row.name}</strong>
                          <small>
                            {pillar?.name ?? "Sin pilar"} ·{" "}
                            {row.reported_years === 0
                              ? "sin años reportados"
                              : `${row.reported_years} ${row.reported_years === 1 ? "año reportado" : "años reportados"}`}
                          </small>
                        </span>

                        <span className="budget-card__figures">
                          <span>
                            <small>Formulado</small>
                            {formatCurrency(formulated)}
                          </span>
                          <span>
                            <small>Proyectado</small>
                            {formatCurrency(row.projected)}
                          </span>
                          <span>
                            <small>Ejecutado</small>
                            {formatCurrency(row.executed)}
                          </span>
                          <span className="budget-card__rate">
                            <small>Ejecución</small>
                            {row.execution_rate === null ? "—" : `${row.execution_rate}%`}
                          </span>
                        </span>

                        <Icon name={open ? "close" : "plus"} size={16} />
                      </button>

                      {open && (
                        <div className="budget-card__body">
                          {/* --- El reporte año a año --------------------- */}
                          <div className="budget-years">
                            <h3>Reporte anual</h3>
                            <table className="budget-table">
                              <caption className="sr-only">
                                Presupuesto anual de {row.name}
                              </caption>
                              <thead>
                                <tr>
                                  <th scope="col">Año</th>
                                  <th scope="col">Proyectado</th>
                                  <th scope="col">Ejecutado</th>
                                  <th scope="col">Ejecución</th>
                                  <th scope="col">Nota</th>
                                  {canEdit && (
                                    <th scope="col">
                                      <span className="sr-only">Acciones</span>
                                    </th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {planYears.map((year) => {
                                  const report = reports.find((item) => item.year === year);
                                  const projected = report?.projected ?? null;
                                  const executed = report?.executed ?? null;
                                  const yearRate =
                                    projected === null || projected === 0
                                      ? null
                                      : Math.round(((executed ?? 0) * 100) / projected);

                                  return (
                                    <tr key={year} className={report ? "" : "is-empty"}>
                                      <th scope="row">{year}</th>
                                      <td>{projected === null ? "—" : formatCurrency(projected)}</td>
                                      <td>{executed === null ? "—" : formatCurrency(executed)}</td>
                                      <td>{yearRate === null ? "—" : `${yearRate}%`}</td>
                                      <td className="budget-note">{report?.note || "—"}</td>
                                      {canEdit && (
                                        <td className="budget-actions">
                                          <button
                                            type="button"
                                            className="button-ghost"
                                            onClick={() =>
                                              setEditing({
                                                id: report?.id,
                                                project_id: row.project_id,
                                                year,
                                                projected:
                                                  projected === null ? "" : String(projected),
                                                executed: executed === null ? "" : String(executed),
                                                note: report?.note ?? "",
                                              })
                                            }
                                          >
                                            {report ? "Editar" : "Reportar"}
                                          </button>
                                          {report && (
                                            <button
                                              type="button"
                                              className="icon-button icon-button--danger"
                                              onClick={() => setPendingDelete(report)}
                                              aria-label={`Borrar el reporte de ${year}`}
                                              title="Borrar el reporte"
                                            >
                                              <Icon name="close" size={14} />
                                            </button>
                                          )}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* --- Las acciones que lo ejecutan ------------- */}
                          <div className="budget-actions-block">
                            <h3>Acciones que ejecutan el presupuesto</h3>
                            {actions.length === 0 ? (
                              <EmptyBlock
                                title="Este proyecto no tiene indicadores de resultado."
                                hint="Se registran en la configuración del pilar; sin ellos no hay forma de saber qué compra este presupuesto."
                              />
                            ) : (
                              <ul className="budget-action-list">
                                {actions.map((action) => {
                                  const meta = statusMeta[action.status];
                                  return (
                                    <li key={action.id}>
                                      <span className="budget-action__name">
                                        <strong>{action.title}</strong>
                                        <small>{action.owner || "Sin responsable"}</small>
                                      </span>
                                      <span
                                        className={`status-badge status-badge--${action.status}`}
                                      >
                                        <span className="status-badge__glyph" aria-hidden="true">
                                          {meta.glyph}
                                        </span>
                                        {meta.label}
                                      </span>
                                      <span className="budget-action__progress">
                                        <span className="progress-track">
                                          <span
                                            className="progress-track__fill"
                                            style={{
                                              width: `${action.progress}%`,
                                              background: meta.color,
                                            }}
                                          />
                                        </span>
                                        <b>{action.progress}%</b>
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {editing && (
        <ReportForm
          draft={editing}
          pending={save.isPending}
          error={error}
          onSubmit={submit}
          onClose={() => {
            setEditing(null);
            setError("");
          }}
        />
      )}

      {pendingDelete && (
        <Modal
          title="Borrar el reporte"
          description={`Se borrará el presupuesto reportado para ${pendingDelete.year}. El año vuelve a quedar sin reportar, que no es lo mismo que en cero.`}
          onClose={() => setPendingDelete(null)}
        >
          <div className="modal-actions">
            <button className="button-ghost" type="button" onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
            <button
              className="button-danger"
              type="button"
              onClick={async () => {
                await remove.mutateAsync({
                  table: "project_budget_reports",
                  id: pendingDelete.id,
                });
                setPendingDelete(null);
              }}
            >
              {remove.isPending ? "Borrando…" : "Borrar"}
            </button>
          </div>
        </Modal>
      )}
    </AdminShell>
  );
}

function BudgetTile({
  label,
  value,
  hint,
  rate: percentage,
}: {
  label: string;
  value: string;
  hint: string;
  rate?: number | null;
}) {
  return (
    <article className="budget-tile card">
      <span className="budget-tile__label">{label}</span>
      <strong className="budget-tile__value">{value}</strong>
      {percentage !== undefined && percentage !== null && (
        <span className="progress-track">
          <span
            className="progress-track__fill"
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </span>
      )}
      <span className="budget-tile__hint">{hint}</span>
    </article>
  );
}

function ReportForm({
  draft,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  draft: DraftReport;
  pending: boolean;
  error: string;
  onSubmit: (draft: DraftReport) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState(draft);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <Modal
      title={`Presupuesto ${values.year}`}
      description="Deja un campo en blanco si todavía no se ha reportado. Un cero dice que ese año no se programó ni se giró nada, y eso es una afirmación."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <div className="field-pair">
          <label className="admin-field">
            <span>Presupuesto proyectado</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={values.projected}
              placeholder="Sin reportar"
              onChange={(event) => setValues({ ...values, projected: event.target.value })}
            />
            <small>En pesos. Lo programado para {values.year}.</small>
          </label>

          <label className="admin-field">
            <span>Presupuesto ejecutado</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={values.executed}
              placeholder="Sin reportar"
              onChange={(event) => setValues({ ...values, executed: event.target.value })}
            />
            <small>Lo efectivamente girado en {values.year}.</small>
          </label>
        </div>

        <label className="admin-field">
          <span>Nota del reporte</span>
          <textarea
            rows={3}
            value={values.note}
            placeholder="Qué explica la diferencia entre lo proyectado y lo ejecutado, si la hay."
            onChange={(event) => setValues({ ...values, note: event.target.value })}
          />
        </label>

        {error && (
          <p className="admin-field-error" role="alert">
            <Icon name="alert" size={15} /> {error}
          </p>
        )}

        <ModalActions onCancel={onClose} submitLabel={pending ? "Guardando…" : "Guardar reporte"} />
      </form>
    </Modal>
  );
}
