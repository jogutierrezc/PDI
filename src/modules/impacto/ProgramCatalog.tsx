/* =============================================================================
   Impacto · Mi catálogo (el programa en una sede).

   Lo que el programa sigue, en dos partes que no se mezclan:

     Fichas institucionales   las de las vicerrectorías que adoptó, con sus
                              metas propias y su última cifra.
     Indicadores del programa los que el programa creó. Pueden relacionarse
                              con una ficha principal o ir solos; se ordenan
                              por función y, dentro, por ficha relacionada.

   Crear, editar o retirar un indicador propio es del programa (editor o jefe
   en esa sede), con el mismo asistente de cinco pasos y la guía de Mr. Pilo
   que usan las vicerrectorías. La vicerrectoría de la función los ve y los
   reorganiza desde su lado.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../components/ui/Icon";
import { StageEmpty } from "../admin/udes-en-cifras/ui";
import {
  FUNCTIONS,
  FUNCTION_LABEL,
  STAGE_LABEL,
  byChain,
  displayValue,
  latestValue,
  type Indicator,
  type Measure,
  type ProgramSite,
  type SubstantiveFunction,
} from "./model";
import { useAdoptions, useRetireProgramIndicator, useValues, type Catalog, type ImpactBase } from "./store";
import { NewIndicatorWizard, originOf } from "./NewIndicatorWizard";

/** Un indicador del programa en blanco, para el asistente. */
function blankOwn(site: ProgramSite, fn: SubstantiveFunction, parentId: string | null, base: ImpactBase): Indicator {
  return {
    id: "",
    code: "",
    fn,
    stage: "procesos",
    suggested: false,
    dimensionId: base.dimensions.find((d) => d.fn === fn)?.id ?? null,
    ownerUnitId: site.programId,
    name: "",
    description: "",
    unitLabel: "",
    measure: "numero",
    numerator: "",
    denominator: "",
    direction: "sube",
    baselineYear: 2023,
    baselineText: "",
    baselineNum: null,
    target2026: "",
    target2026Num: null,
    target2028: "",
    target2028Num: null,
    source: "",
    responsible: "",
    projectsText: "",
    cesu: [],
    sheet: {},
    programReports: true,
    status: "publicado",
    position: 0,
    updatedAt: "",
    programId: site.programId,
    campusId: site.campusId,
    parentId,
    mandatory: false,
    legacyId: null,
  };
}

export function ProgramCatalog({
  site,
  base,
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
  const [editing, setEditing] = useState<{ draft: Indicator; origin: { x: string; y: string } } | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);
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
    setEditing({ draft: blankOwn(site, fn, parentId, base), origin: originOf(newButton.current) });

  const startEdit = (i: Indicator, from: Element | null) => setEditing({ draft: i, origin: originOf(from) });

  if (adoptions.isPending) return <p className="admin-loading">Cargando el catálogo del programa…</p>;

  return (
    <div className="imp-mine">
      <div className="imp-mine__main">
        <div className="imp-toolbar">
          <span className="imp-progress-line">
            <b>{adopted.length}</b> fichas institucionales · <b>{own.length - retiredCount}</b> indicadores del programa
          </span>
          {canEdit && (
            <button ref={newButton} type="button" className="button-secondary imp-toolbar__new" onClick={() => startNew()}>
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
                                    <button type="button" onClick={(e) => startEdit(i, e.currentTarget)}>{i.name}</button>
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
        <NewIndicatorWizard
          key={editing.draft.id || "nuevo"}
          draft={editing.draft}
          origin={editing.origin}
          base={base}
          catalog={catalog}
          site={site}
          onClose={() => setEditing(null)}
          onCreated={() => setEditing(null)}
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
