/* =============================================================================
   Impacto · Pilares y ODS de una vicerrectoría.

   Solo el catálogo de su función: cada ficha con sus pilares del PDI y sus
   ODS, lo que el motor sugiere y lo que falta por cruzar. Con «De los
   programas» se ven también los indicadores que crearon los programas de la
   función, que la vicerrectoría puede cruzar por ellos.

   El diccionario del motor (qué términos llevan a qué pilar) es de la
   administración y vive aparte.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import type { ImpactAccess } from "./access";
import { AlignmentChips, AlignmentEditor } from "./Alignments";
import { STAGE_LABEL, byChain, type SubstantiveFunction } from "./model";
import { toMotorCriteria, useCriteria, useRunMotor, type Catalog, type ImpactBase } from "./store";

type Filter = "todas" | "sin" | "sugeridas";

export function PillarsBoard({
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
  const [withPrograms, setWithPrograms] = useState(false);
  const [filter, setFilter] = useState<Filter>("todas");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const criteria = useCriteria();
  const motor = useRunMotor();

  const siteName = (programId: string | null, campusId: string | null) => {
    const program = base.units.find((u) => u.id === programId)?.name ?? "Programa";
    const campus = base.campuses.find((c) => c.id === campusId)?.name ?? "";
    return `${program} · ${campus}`;
  };

  const all = useMemo(
    () =>
      [
        ...catalog.indicators.filter((i) => i.fn === fn && i.status !== "retirado"),
        ...(withPrograms ? catalog.programIndicators.filter((i) => i.fn === fn && i.status !== "retirado") : []),
      ].sort(byChain),
    [catalog.indicators, catalog.programIndicators, fn, withPrograms],
  );
  const confirmedOf = (id: string) => catalog.alignments.some((a) => a.indicatorId === id && a.confirmed);
  const pendingOf = (id: string) => catalog.alignments.some((a) => a.indicatorId === id && !a.confirmed);
  const shown = all.filter((i) => (filter === "sin" ? !confirmedOf(i.id) : filter === "sugeridas" ? pendingOf(i.id) : true));
  const selected = all.find((i) => i.id === selectedId) ?? null;
  const without = all.filter((i) => !confirmedOf(i.id)).length;

  const canEdit = (id: string) => {
    const i = all.find((x) => x.id === id);
    if (!i) return false;
    return i.programId ? access.canCurate(fn) : access.canDefine(i.fn, i.ownerUnitId);
  };
  const editable = all.filter((i) => canEdit(i.id));

  const runAll = () =>
    motor.mutate({
      indicators: editable.filter((i) => !confirmedOf(i.id)),
      alignments: catalog.alignments,
      criteria: toMotorCriteria(criteria.data ?? []),
      dimensions: base.dimensions,
    });

  return (
    <div className="imp-pillars" data-open={selected ? "" : undefined}>
      <div className="imp-pillars__main">
        <div className="imp-toolbar">
          <div className="imp-chips" role="group" aria-label="Qué mostrar">
            {(
              [
                ["todas", `Todas · ${all.length}`],
                ["sin", `Sin cruce confirmado · ${without}`],
                ["sugeridas", "Con sugerencias"],
              ] as [Filter, string][]
            ).map(([key, text]) => (
              <button key={key} type="button" className="imp-chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {text}
              </button>
            ))}
          </div>
          <label className="imp-check">
            <input type="checkbox" checked={withPrograms} onChange={(e) => setWithPrograms(e.target.checked)} /> Incluir los indicadores
            de los programas ({catalog.programIndicators.filter((i) => i.fn === fn && i.status !== "retirado").length})
          </label>
          {editable.length > 0 && (
            <button type="button" className="button-secondary imp-toolbar__new" onClick={runAll} disabled={motor.isPending || criteria.isPending || without === 0}>
              <Icon name="spark" size={15} /> {motor.isPending ? "Buscando…" : `Sugerir para las ${without} sin cruce`}
            </button>
          )}
        </div>
        {motor.isSuccess && (
          <p className="imp-small imp-muted" role="status">
            {motor.data ? `El motor dejó ${motor.data} sugerencias para revisar.` : "El motor no halló nada nuevo con el diccionario actual."}
          </p>
        )}

        <div className="imp-table-wrap">
          <table className="imp-table">
            <thead>
              <tr>
                <th scope="col" className="imp-col-code">Cód.</th>
                <th scope="col">Indicador</th>
                <th scope="col">Eslabón</th>
                <th scope="col">Pilares y ODS</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={4} className="imp-empty-row">Nada que mostrar con este filtro.</td>
                </tr>
              )}
              {shown.map((i) => (
                <tr key={i.id} aria-selected={i.id === selectedId || undefined}>
                  <td className="imp-col-code">
                    <span className="imp-code" data-fn={i.programId ? undefined : i.fn} data-own={i.programId ? "" : undefined}>
                      {i.programId ? "Prog." : i.code}
                    </span>
                  </td>
                  <th scope="row" className="imp-name">
                    <button type="button" onClick={() => setSelectedId(i.id === selectedId ? null : i.id)}>
                      {i.name}
                    </button>
                    {i.programId && <span className="imp-small imp-muted"> {siteName(i.programId, i.campusId)}</span>}
                  </th>
                  <td><span className="imp-tag" data-tone="quiet">{STAGE_LABEL[i.stage]}</span></td>
                  <td><AlignmentChips indicatorId={i.id} catalog={catalog} base={base} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <aside className="imp-pillars__side" aria-label={`Pilares y ODS de ${selected.name}`}>
          <header>
            <span className="imp-code">{selected.programId ? "Programa" : selected.code}</span>
            <h2>{selected.name}</h2>
            <button type="button" className="imp-icon-button" aria-label="Cerrar" onClick={() => setSelectedId(null)}>
              <Icon name="close" size={16} />
            </button>
          </header>
          {selected.description && <p className="imp-small imp-muted">{selected.description}</p>}
          <AlignmentEditor indicator={selected} base={base} catalog={catalog} canEdit={canEdit(selected.id)} />
        </aside>
      )}
    </div>
  );
}
