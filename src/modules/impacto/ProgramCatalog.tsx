/* =============================================================================
   Impacto · Mi catálogo (el programa en una sede).

   Lo que el programa sigue, en dos partes que no se mezclan:

     Fichas institucionales   las de las vicerrectorías que adoptó, con sus
                              metas propias y su última cifra.
     Indicadores del programa los que el programa creó. Pueden relacionarse
                              con una ficha principal o ir solos; se ordenan
                              por función y, dentro, por ficha relacionada.

   Crear, editar o retirar un indicador propio es del programa (editor o jefe
   en esa sede). La vicerrectoría de la función los ve y los reorganiza
   desde su lado.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../components/ui/Icon";
import { StageEmpty } from "../admin/udes-en-cifras/ui";
import {
  FUNCTIONS,
  FUNCTION_LABEL,
  MEASURE_LABEL,
  STAGES,
  STAGE_LABEL,
  byChain,
  displayValue,
  latestValue,
  type Indicator,
  type Measure,
  type ProgramSite,
  type Stage,
  type SubstantiveFunction,
} from "./model";
import {
  useAdoptions,
  useRetireProgramIndicator,
  useSaveProgramIndicator,
  useValues,
  type Catalog,
  type ImpactBase,
  type ProgramIndicatorInput,
} from "./store";

export function ProgramCatalog({
  site,
  catalog,
  canEdit,
  onChoose,
}: {
  site: ProgramSite;
  base: ImpactBase;
  catalog: Catalog;
  canEdit: boolean;
  onChoose: () => void;
}) {
  const adoptions = useAdoptions({ programId: site.programId, campusId: site.campusId });
  const adopted = useMemo(
    () =>
      catalog.indicators
        .filter((i) => (adoptions.data ?? []).some((a) => a.active && a.indicatorId === i.id))
        .sort(byChain),
    [catalog.indicators, adoptions.data],
  );
  const own = useMemo(
    () => catalog.programIndicators.filter((i) => i.programId === site.programId && i.campusId === site.campusId).sort(byChain),
    [catalog.programIndicators, site.programId, site.campusId],
  );
  const ids = useMemo(() => [...adopted, ...own].map((i) => i.id), [adopted, own]);
  const values = useValues(ids, site);
  const [editing, setEditing] = useState<ProgramIndicatorInput | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const retire = useRetireProgramIndicator();

  const last = (id: string, measure: Measure) =>
    displayValue(
      latestValue((values.data ?? []).filter((v) => v.indicatorId === id && v.programId === site.programId && v.campusId === site.campusId)),
      measure,
    ) || "—";
  const adoptionOf = (id: string) => (adoptions.data ?? []).find((a) => a.indicatorId === id);
  const byId = new Map(catalog.indicators.map((i) => [i.id, i]));
  const liveOwn = own.filter((i) => showRetired || i.status !== "retirado");
  const retiredCount = own.filter((i) => i.status === "retirado").length;

  const startNew = (fn: SubstantiveFunction = "ensenanza", parentId: string | null = null) =>
    setEditing({
      programId: site.programId,
      campusId: site.campusId,
      fn,
      stage: "procesos",
      name: "",
      description: "",
      unitLabel: "",
      measure: "numero",
      parentId,
      baselineText: "",
      target2026: "",
      target2028: "",
    });

  const startEdit = (i: Indicator) =>
    setEditing({
      id: i.id,
      programId: site.programId,
      campusId: site.campusId,
      fn: i.fn,
      stage: i.stage,
      name: i.name,
      description: i.description,
      unitLabel: i.unitLabel,
      measure: i.measure,
      parentId: i.parentId,
      baselineText: i.baselineText,
      target2026: i.target2026,
      target2028: i.target2028,
    });

  if (adoptions.isPending) return <p className="admin-loading">Cargando el catálogo del programa…</p>;

  return (
    <div className="imp-mine" data-editing={editing ? "" : undefined}>
      <div className="imp-mine__main">
        <div className="imp-toolbar">
          <span className="imp-progress-line">
            <b>{adopted.length}</b> fichas institucionales · <b>{own.length - retiredCount}</b> indicadores del programa
          </span>
          {canEdit && (
            <button type="button" className="button-secondary imp-toolbar__new" onClick={() => startNew()}>
              <Icon name="plus" size={15} /> Nuevo indicador del programa
            </button>
          )}
        </div>

        {adopted.length === 0 && own.length === 0 ? (
          <StageEmpty title="Su catálogo está vacío">
            Elija a qué fichas de las vicerrectorías aporta el programa —Mr. Pilo le ayuda en tres preguntas— o cree
            indicadores propios.{" "}
            <button type="button" className="oda-link-button" onClick={onChoose}>
              Elegir indicadores
            </button>
          </StageEmpty>
        ) : (
          <>
            <section className="imp-mine__block">
              <header>
                <h2>Fichas institucionales que sigue</h2>
                <p>Las definen las vicerrectorías. El programa pone su línea base, sus metas y sus cifras.</p>
              </header>
              {adopted.length === 0 ? (
                <p className="imp-muted imp-small">
                  Todavía ninguna.{" "}
                  <button type="button" className="oda-link-button" onClick={onChoose}>
                    Elegir indicadores
                  </button>
                </p>
              ) : (
                FUNCTIONS.filter((fn) => adopted.some((i) => i.fn === fn)).map((fn) => (
                  <FunctionTable key={fn} fn={fn}>
                    {adopted
                      .filter((i) => i.fn === fn)
                      .map((i) => {
                        const a = adoptionOf(i.id);
                        return (
                          <tr key={i.id}>
                            <td className="imp-col-code"><span className="imp-code" data-fn={i.fn}>{i.code}</span></td>
                            <th scope="row" className="imp-name">{i.name}</th>
                            <td><span className="imp-tag" data-tone="quiet">{STAGE_LABEL[i.stage]}</span></td>
                            <td className="imp-num">{a?.target2026 || "—"}</td>
                            <td className="imp-num">{last(i.id, i.measure)}</td>
                            <td className="imp-small imp-muted">{own.filter((o) => o.parentId === i.id && o.status !== "retirado").length || ""}</td>
                          </tr>
                        );
                      })}
                  </FunctionTable>
                ))
              )}
            </section>

            <section className="imp-mine__block">
              <header>
                <h2>Indicadores del programa</h2>
                <p>
                  Los personalizados de {site.programName} en {site.campusName}. Pueden relacionarse con una ficha principal
                  o ir solos; la vicerrectoría de su función los ve y puede reorganizarlos.
                </p>
                {retiredCount > 0 && (
                  <label className="imp-check">
                    <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> Ver los{" "}
                    {retiredCount} retirados
                  </label>
                )}
              </header>
              {liveOwn.length === 0 ? (
                <p className="imp-muted imp-small">
                  Aún no hay indicadores propios.
                  {canEdit && (
                    <>
                      {" "}
                      <button type="button" className="oda-link-button" onClick={() => startNew()}>
                        Crear el primero
                      </button>
                    </>
                  )}
                </p>
              ) : (
                FUNCTIONS.filter((fn) => liveOwn.some((i) => i.fn === fn)).map((fn) => {
                  const rows = liveOwn.filter((i) => i.fn === fn);
                  const groups = [...new Set(rows.map((i) => i.parentId ?? ""))].sort((a, b) =>
                    a === "" ? 1 : b === "" ? -1 : (byId.get(a)?.code ?? "").localeCompare(byId.get(b)?.code ?? "", "es", { numeric: true }),
                  );
                  return (
                    <FunctionTable key={fn} fn={fn} own>
                      {groups.map((parentId) => {
                        const parent = parentId ? byId.get(parentId) : undefined;
                        return [
                          <tr key={`g-${parentId}`} className="imp-group">
                            <th colSpan={6} scope="rowgroup">
                              {parent ? (
                                <>
                                  Relacionados con <span className="imp-code">{parent.code}</span> {parent.name}
                                </>
                              ) : (
                                "Sin ficha relacionada"
                              )}
                            </th>
                          </tr>,
                          ...rows
                            .filter((i) => (i.parentId ?? "") === parentId)
                            .map((i) => (
                              <tr key={i.id} data-status={i.status}>
                                <td className="imp-col-code"><span className="imp-code" data-own="">{i.code.split("-").pop()}</span></td>
                                <th scope="row" className="imp-name">
                                  {canEdit ? (
                                    <button type="button" onClick={() => startEdit(i)}>{i.name}</button>
                                  ) : (
                                    i.name
                                  )}
                                  {i.status === "retirado" && <span className="imp-tag" data-tone="quiet">Retirado</span>}
                                </th>
                                <td><span className="imp-tag" data-tone="quiet">{STAGE_LABEL[i.stage]}</span></td>
                                <td className="imp-num">{i.target2026 || "—"}</td>
                                <td className="imp-num">{last(i.id, i.measure)}</td>
                                <td className="imp-num">
                                  {canEdit && (
                                    <button
                                      type="button"
                                      className="oda-link-button"
                                      disabled={retire.isPending}
                                      onClick={() => retire.mutate({ id: i.id, retired: i.status !== "retirado" })}
                                    >
                                      {i.status === "retirado" ? "Recuperar" : "Retirar"}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )),
                        ];
                      })}
                    </FunctionTable>
                  );
                })
              )}
            </section>
          </>
        )}
      </div>

      {editing && (
        <ProgramIndicatorForm
          value={editing}
          fichas={catalog.indicators.filter((i) => i.status === "publicado")}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function FunctionTable({ fn, own = false, children }: { fn: SubstantiveFunction; own?: boolean; children: ReactNode }) {
  return (
    <div className="imp-table-wrap imp-mine__table" data-fn={fn}>
      <table className="imp-table">
        <caption>
          <i aria-hidden="true" /> {FUNCTION_LABEL[fn]}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="imp-col-code">{own ? "N.º" : "Cód."}</th>
            <th scope="col">Indicador</th>
            <th scope="col">Eslabón</th>
            <th scope="col" className="imp-num">Meta 2026</th>
            <th scope="col" className="imp-num">Última cifra</th>
            <th scope="col" className="imp-num">{own ? "" : "Propios"}</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* --- Crear o editar un indicador del programa ---------------------------------------- */

function ProgramIndicatorForm({
  value,
  fichas,
  onClose,
}: {
  value: ProgramIndicatorInput;
  fichas: Indicator[];
  onClose: () => void;
}) {
  const [form, setForm] = useState(value);
  const save = useSaveProgramIndicator();
  const set = <K extends keyof ProgramIndicatorInput>(key: K, v: ProgramIndicatorInput[K]) => setForm((f) => ({ ...f, [key]: v }));
  const parents = fichas.filter((i) => i.fn === form.fn).sort(byChain);
  const problem = !form.name.trim() ? "Escriba el nombre del indicador." : null;

  const submit = async () => {
    if (problem) return;
    try {
      await save.mutateAsync(form);
      onClose();
    } catch {
      // El error se muestra en el pie (save.error).
    }
  };

  return (
    <aside className="imp-mine__form" aria-label={form.id ? "Editar indicador del programa" : "Nuevo indicador del programa"}>
      <header>
        <h2>{form.id ? "Editar indicador" : "Nuevo indicador del programa"}</h2>
        <button type="button" className="imp-icon-button" aria-label="Cerrar" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="imp-mine__fields">
        <label className="admin-field">
          <span>Nombre</span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej. Estudiantes en tutorías entre pares" autoFocus />
        </label>
        <label className="admin-field">
          <span>Qué mide</span>
          <textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </label>
        <div className="imp-mine__row">
          <label className="admin-field">
            <span>Función</span>
            <select
              value={form.fn}
              onChange={(e) => setForm((f) => ({ ...f, fn: e.target.value as SubstantiveFunction, parentId: null }))}
            >
              {FUNCTIONS.map((fn) => (
                <option key={fn} value={fn}>{FUNCTION_LABEL[fn]}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Eslabón</span>
            <select value={form.stage} onChange={(e) => set("stage", e.target.value as Stage)}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABEL[s]}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="admin-field">
          <span>Relacionado con (opcional)</span>
          <select value={form.parentId ?? ""} onChange={(e) => set("parentId", e.target.value || null)}>
            <option value="">Ninguna ficha: es solo del programa</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
            ))}
          </select>
        </label>
        <div className="imp-mine__row">
          <label className="admin-field">
            <span>Forma de medir</span>
            <select value={form.measure} onChange={(e) => set("measure", e.target.value as Measure)}>
              {(Object.keys(MEASURE_LABEL) as Measure[]).map((m) => (
                <option key={m} value={m}>{MEASURE_LABEL[m]}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Unidad</span>
            <input value={form.unitLabel} onChange={(e) => set("unitLabel", e.target.value)} placeholder="Ej. N.º estudiantes" />
          </label>
        </div>
        <div className="imp-mine__row imp-mine__row--3">
          <label className="admin-field">
            <span>Línea base</span>
            <input value={form.baselineText} onChange={(e) => set("baselineText", e.target.value)} />
          </label>
          <label className="admin-field">
            <span>Meta 2026</span>
            <input value={form.target2026} onChange={(e) => set("target2026", e.target.value)} />
          </label>
          <label className="admin-field">
            <span>Meta 2028</span>
            <input value={form.target2028} onChange={(e) => set("target2028", e.target.value)} />
          </label>
        </div>
      </div>
      <footer>
        {save.error && (
          <p className="admin-error" role="alert"><Icon name="alert" size={15} /> {save.error.message}</p>
        )}
        {problem && form.name !== value.name && <span className="imp-small imp-muted">{problem}</span>}
        <button type="button" className="button-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="button-primary" disabled={Boolean(problem) || save.isPending} onClick={submit}>
          {save.isPending ? "Guardando…" : form.id ? "Guardar cambios" : "Crear indicador"}
        </button>
      </footer>
    </aside>
  );
}
