/* =============================================================================
   Impacto · el cruce de cada indicador con los pilares del PDI y los ODS.

   Tres orígenes, siempre a la vista: lo que traía la matriz vr7, lo que puso
   una persona y lo que sugiere el motor. Lo sugerido se confirma o se
   descarta; hasta entonces se dibuja con borde discontinuo y dice qué
   términos lo llevaron ahí.
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { sdgById } from "../../data/pdi";
import type { Alignment, Indicator } from "./model";
import { toMotorCriteria, useCriteria, useRunMotor, useSetAlignment, type Catalog, type ImpactBase } from "./store";

const ORIGIN_LABEL: Record<Alignment["origin"], string> = {
  matriz: "de la matriz",
  manual: "puesto a mano",
  motor: "sugerido por el motor",
};

function label(a: Alignment, base: ImpactBase, short = false) {
  if (a.target === "pilar") {
    const pillar = base.pillars.find((p) => p.id === a.pillarId);
    return short ? `P${pillar?.numeral ?? "?"}` : `Pilar ${pillar?.numeral ?? "?"} · ${pillar?.name ?? ""}`;
  }
  return short ? `ODS ${a.sdg}` : `ODS ${a.sdg} · ${sdgById.get(a.sdg ?? 0)?.label ?? ""}`;
}

/** Los cruces de una ficha en una línea: pilares, ODS y cuántas sugerencias esperan. */
export function AlignmentChips({
  indicatorId,
  catalog,
  base,
  compact,
}: {
  indicatorId: string;
  catalog: Catalog;
  base: ImpactBase;
  compact?: boolean;
}) {
  const mine = catalog.alignments.filter((a) => a.indicatorId === indicatorId);
  const confirmed = mine
    .filter((a) => a.confirmed)
    .sort((a, b) => (a.target === b.target ? (a.sdg ?? 0) - (b.sdg ?? 0) : a.target === "pilar" ? -1 : 1));
  const pending = mine.filter((a) => !a.confirmed).length;
  if (!mine.length) return <span className="imp-muted">—</span>;
  return (
    <span className="imp-align-chips">
      {confirmed.map((a) => (
        <span key={a.id} className="imp-align" data-target={a.target} title={label(a, base)}>
          {label(a, base, compact)}
        </span>
      ))}
      {pending > 0 && (
        <span className="imp-align" data-pending title={`${pending} por confirmar`}>
          +{pending}
        </span>
      )}
    </span>
  );
}

export function AlignmentEditor({
  indicator,
  base,
  catalog,
  canEdit,
}: {
  indicator: Indicator;
  base: ImpactBase;
  catalog: Catalog;
  canEdit: boolean;
}) {
  const criteria = useCriteria();
  const motor = useRunMotor();
  const set = useSetAlignment();
  const [adding, setAdding] = useState("");
  const mine = catalog.alignments.filter((a) => a.indicatorId === indicator.id);
  const confirmed = mine.filter((a) => a.confirmed);
  const pending = mine.filter((a) => !a.confirmed).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const taken = new Set(mine.map((a) => (a.target === "pilar" ? `p:${a.pillarId}` : `o:${a.sdg}`)));
  const options = [
    ...base.pillars.map((p) => ({ value: `p:${p.id}`, text: `Pilar ${p.numeral} · ${p.name}` })),
    ...Array.from({ length: 17 }, (_, k) => k + 1).map((n) => ({ value: `o:${n}`, text: `ODS ${n} · ${sdgById.get(n)?.label ?? ""}` })),
  ].filter((o) => !taken.has(o.value));

  const runMotor = () =>
    motor.mutate({
      indicators: [indicator],
      alignments: catalog.alignments,
      criteria: toMotorCriteria(criteria.data ?? []),
      dimensions: base.dimensions,
    });

  const add = () => {
    if (!adding) return;
    const [kind, id] = adding.split(":");
    set.mutate(
      kind === "p"
        ? { kind: "add", indicatorId: indicator.id, target: "pilar", pillarId: id }
        : { kind: "add", indicatorId: indicator.id, target: "ods", sdg: Number(id) },
      { onSuccess: () => setAdding("") },
    );
  };

  return (
    <div className="imp-alignments">
      {confirmed.length ? (
        <ul className="imp-align-list">
          {confirmed.map((a) => (
            <li key={a.id}>
              <span className="imp-align" data-target={a.target}>
                {label(a, base)}
              </span>
              <span className="imp-muted imp-small">{ORIGIN_LABEL[a.origin]}</span>
              {canEdit && (
                <button type="button" className="oda-link-button" onClick={() => set.mutate({ kind: "discard", id: a.id })}>
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="imp-muted imp-small">Todavía no apunta a ningún pilar ni ODS confirmado.</p>
      )}

      {pending.length > 0 && (
        <div className="imp-suggestions">
          <span className="imp-label">El motor sugiere</span>
          <ul className="imp-align-list">
            {pending.map((a) => (
              <li key={a.id}>
                <span className="imp-align" data-target={a.target} data-pending>
                  {label(a, base)}
                </span>
                <span className="imp-muted imp-small" title="Términos del diccionario hallados en la ficha">
                  por «{a.matchedTerms.slice(0, 3).join("», «")}»
                </span>
                {canEdit && (
                  <span className="imp-inline-actions">
                    <button type="button" className="oda-link-button" onClick={() => set.mutate({ kind: "confirm", id: a.id })}>
                      Confirmar
                    </button>
                    <button type="button" className="oda-link-button" onClick={() => set.mutate({ kind: "discard", id: a.id })}>
                      Descartar
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <div className="imp-align-actions">
          <button type="button" className="button-secondary" onClick={runMotor} disabled={motor.isPending || criteria.isPending}>
            <Icon name="spark" size={14} /> {motor.isPending ? "Buscando…" : "Sugerir con el motor"}
          </button>
          <label className="imp-add-align">
            <span className="sr-only">Agregar a mano</span>
            <select value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Agregar a mano…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.text}
                </option>
              ))}
            </select>
          </label>
          {adding && (
            <button type="button" className="button-ghost" onClick={add} disabled={set.isPending}>
              Agregar
            </button>
          )}
        </div>
      )}
      {motor.isSuccess && motor.data === 0 && <p className="imp-muted imp-small">El motor no halló nada nuevo con el diccionario actual.</p>}
      {(motor.error || set.error) && (
        <p className="oda-field-warning" role="alert">
          {(motor.error ?? set.error)?.message}
        </p>
      )}
    </div>
  );
}
