/* =============================================================================
   Impacto · Elegir indicadores (propuesta A3).

   El programa, en una sede, marca las fichas publicadas de las tres funciones
   a las que aporta. Marcar guarda en el acto; desmarcar deja de seguirlo sin
   borrar lo que ya reportó. A la derecha, su cadena: si cada eslabón quedó
   cubierto en cada función que eligió.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../components/ui/Icon";
import {
  FUNCTIONS,
  FUNCTION_LABEL,
  STAGES,
  STAGE_LABEL,
  byChain,
  displayValue,
  latestValue,
  type ProgramSite,
  type SubstantiveFunction,
} from "./model";
import { useAdoptions, useToggleAdoption, useValues, type Catalog, type ImpactBase } from "./store";

export function ProgramSelect({
  site,
  base,
  catalog,
  canEdit,
  onDone,
}: {
  site: ProgramSite;
  base: ImpactBase;
  catalog: Catalog;
  canEdit: boolean;
  onDone: () => void;
}) {
  const [fn, setFn] = useState<SubstantiveFunction | "todas">("todas");
  const [onlyFree, setOnlyFree] = useState(false);
  const published = useMemo(() => catalog.indicators.filter((i) => i.status === "publicado").sort(byChain), [catalog.indicators]);
  const ids = useMemo(() => published.map((i) => i.id), [published]);
  const adoptions = useAdoptions({ programId: site.programId, campusId: site.campusId });
  const values = useValues(ids, site);
  const toggle = useToggleAdoption();

  const adopted = new Set((adoptions.data ?? []).filter((a) => a.active).map((a) => a.indicatorId));
  const shown = published.filter((i) => (fn === "todas" || i.fn === fn) && (!onlyFree || !adopted.has(i.id)));
  const dimName = (id: string | null) => base.dimensions.find((d) => d.id === id)?.name ?? "—";
  const udes = (id: string) => latestValue((values.data ?? []).filter((v) => v.indicatorId === id && !v.programId));

  const mine = published.filter((i) => adopted.has(i.id));
  const fnsChosen = FUNCTIONS.filter((f) => mine.some((i) => i.fn === f));

  return (
    <div className="imp-select">
      <div className="imp-select__main">
        <div className="imp-toolbar">
          <div className="imp-chips" role="group" aria-label="Función">
            <button type="button" className="imp-chip" aria-pressed={fn === "todas"} onClick={() => setFn("todas")}>
              Todas <span>{published.length}</span>
            </button>
            {FUNCTIONS.map((f) => (
              <button key={f} type="button" className="imp-chip" data-fn={f} aria-pressed={fn === f} onClick={() => setFn(f)}>
                <i aria-hidden="true" />
                {FUNCTION_LABEL[f]} <span>{published.filter((i) => i.fn === f).length}</span>
              </button>
            ))}
          </div>
          <label className="oda-check imp-check">
            <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
            <span>Solo los que aún no sigo</span>
          </label>
        </div>

        <div className="imp-table-wrap">
          <table className="imp-table">
            <thead>
              <tr>
                <th scope="col" className="imp-col-check">
                  <span className="sr-only">Seguir</span>
                </th>
                <th scope="col" className="imp-col-code">Cód.</th>
                <th scope="col">Indicador</th>
                <th scope="col">Dimensión</th>
                <th scope="col" className="imp-num">Meta VR 2026</th>
                <th scope="col" className="imp-num">Cifra UDES</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.filter((s) => shown.some((i) => i.stage === s)).map((stage) => (
                <StageGroup key={stage} label={STAGE_LABEL[stage]}>
                  {shown
                    .filter((i) => i.stage === stage)
                    .map((i) => {
                      const on = adopted.has(i.id);
                      const u = udes(i.id);
                      return (
                        <tr key={i.id} aria-selected={on}>
                          <td className="imp-col-check">
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={!canEdit || toggle.isPending}
                              onChange={(e) =>
                                toggle.mutate({ indicatorId: i.id, programId: site.programId, campusId: site.campusId, active: e.target.checked })
                              }
                              aria-label={`Seguir ${i.code} ${i.name}`}
                            />
                          </td>
                          <td className="imp-col-code">
                            <span className="imp-code" data-fn={i.fn}>
                              {i.code}
                            </span>
                          </td>
                          <td className="imp-name">
                            <span>{i.name}</span>
                            {!i.programReports && <span className="imp-tag" data-tone="quiet">Solo consulta</span>}
                          </td>
                          <td className="imp-muted">{dimName(i.dimensionId)}</td>
                          <td className="imp-num">{i.target2026 || "—"}</td>
                          <td className="imp-num">{u ? `${displayValue(u, i.measure)} · ${u.year}` : <span className="imp-muted">Sin reportar</span>}</td>
                        </tr>
                      );
                    })}
                </StageGroup>
              ))}
            </tbody>
          </table>
        </div>
        {toggle.error && (
          <p className="admin-error" role="alert">
            <Icon name="alert" size={16} /> {toggle.error.message}
          </p>
        )}
      </div>

      <aside className="imp-tray" aria-label="Tu selección">
        <header>
          <span className="imp-label">
            {site.programName} · {site.campusName}
          </span>
          <strong>
            {mine.length} {mine.length === 1 ? "indicador" : "indicadores"}
          </strong>
          <span className="imp-muted imp-small">
            {FUNCTIONS.map((f) => `${FUNCTION_LABEL[f]} ${mine.filter((i) => i.fn === f).length}`).join(" · ")}
          </span>
        </header>
        {fnsChosen.length === 0 ? (
          <p className="imp-muted imp-small">Marca en la tabla los indicadores a los que aporta tu programa en esta sede.</p>
        ) : (
          fnsChosen.map((f) => {
            const ofFn = mine.filter((i) => i.fn === f);
            const missing = STAGES.filter((s) => !ofFn.some((i) => i.stage === s));
            return (
              <section key={f} className="imp-chain">
                <h3 data-fn={f}>
                  <i aria-hidden="true" />
                  {FUNCTION_LABEL[f]}
                </h3>
                <ul>
                  {STAGES.map((s) => {
                    const here = ofFn.filter((i) => i.stage === s);
                    return (
                      <li key={s} data-covered={here.length > 0 || undefined}>
                        {here.length ? <Icon name="check" size={14} /> : <span className="imp-gap-dot" aria-hidden="true" />}
                        <b>{STAGE_LABEL[s]}</b>
                        <span className="imp-muted">{here.map((i) => i.code).join(" · ") || "sin elegir"}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="imp-small" data-tone={missing.length ? "wait" : "ok"}>
                  {missing.length === 0
                    ? "Cadena completa: cada impacto tiene su antecedente."
                    : `Le falta ${missing.map((s) => STAGE_LABEL[s].toLowerCase()).join(", ")}.`}
                </p>
              </section>
            );
          })
        )}
        <footer>
          <p className="imp-muted imp-small">
            Por cada uno reportarás línea base, la cifra de cada año, tu meta y el enlace de evidencia. Quitar uno no borra lo
            reportado.
          </p>
          <button type="button" className="button-primary" onClick={onDone} disabled={mine.length === 0}>
            Ir a reportar
          </button>
        </footer>
      </aside>
    </div>
  );
}

function StageGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <tr className="imp-group">
        <th colSpan={6} scope="rowgroup">
          {label}
        </th>
      </tr>
      {children}
    </>
  );
}
