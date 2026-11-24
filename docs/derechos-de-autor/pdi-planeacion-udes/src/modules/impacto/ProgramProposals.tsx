/* =============================================================================
   Impacto · De los programas (lo ve la vicerrectoría).

   Los indicadores que los programas crearon en la función, con sus cifras
   año a año. Se agrupan por programa en su sede, y cada uno dice con qué
   ficha se relaciona. La vicerrectoría (editor o jefe) puede relacionarlo
   con otra ficha de su catálogo o soltarlo; crear fichas nuevas a partir de
   lo que proponen los programas lo sugiere Mr. Pilo.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { StageEmpty } from "../admin/udes-en-cifras/ui";
import type { ImpactAccess } from "./access";
import { AlignmentChips } from "./Alignments";
import { STAGE_LABEL, byChain, displayValue, type SubstantiveFunction } from "./model";
import { useLinkProgramIndicator, useValues, type Catalog, type ImpactBase } from "./store";

const SHOWN_YEARS = [2023, 2024, 2025, 2026];

type Relation = "todas" | "relacionadas" | "solas";

export function ProgramProposals({
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
  const [site, setSite] = useState("todas");
  const [relation, setRelation] = useState<Relation>("todas");
  const link = useLinkProgramIndicator();
  const canCurate = access.canCurate(fn);

  const all = useMemo(
    () => catalog.programIndicators.filter((i) => i.fn === fn && i.status !== "retirado").sort(byChain),
    [catalog.programIndicators, fn],
  );
  const ids = useMemo(() => all.map((i) => i.id), [all]);
  const values = useValues(ids);
  const fichas = catalog.indicators.filter((i) => i.fn === fn && i.status !== "retirado").sort(byChain);
  const fichaById = new Map(catalog.indicators.map((i) => [i.id, i]));

  const siteKey = (i: { programId: string | null; campusId: string | null }) => `${i.programId}|${i.campusId}`;
  const siteName = (key: string) => {
    const [programId, campusId] = key.split("|");
    return `${base.units.find((u) => u.id === programId)?.name ?? "Programa"} · ${base.campuses.find((c) => c.id === campusId)?.name ?? "Sede"}`;
  };
  const sites = [...new Set(all.map(siteKey))].sort((a, b) => siteName(a).localeCompare(siteName(b), "es"));
  const shown = all.filter(
    (i) =>
      (site === "todas" || siteKey(i) === site) &&
      (relation === "todas" || (relation === "relacionadas" ? Boolean(i.parentId) : !i.parentId)),
  );
  const cell = (id: string, year: number, measure: Parameters<typeof displayValue>[1]) =>
    displayValue((values.data ?? []).find((v) => v.indicatorId === id && v.year === year && v.programId), measure) || "—";

  if (all.length === 0) {
    return (
      <StageEmpty title="Los programas aún no han creado indicadores en esta función">
        Cuando un programa cree un indicador propio de esta función —desde su «Mi catálogo» o al sincronizar la hoja
        anterior— aparecerá aquí con sus cifras.
      </StageEmpty>
    );
  }

  return (
    <div className="imp-proposals">
      <div className="imp-toolbar">
        <label className="imp-picker imp-picker--wide">
          <span className="imp-label">Programa</span>
          <select value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="todas">Todos · {sites.length} programas en sede</option>
            {sites.map((s) => (
              <option key={s} value={s}>
                {siteName(s)} · {all.filter((i) => siteKey(i) === s).length}
              </option>
            ))}
          </select>
        </label>
        <div className="imp-chips" role="group" aria-label="Relación con las fichas">
          {(
            [
              ["todas", `Todos · ${all.length}`],
              ["relacionadas", `Relacionados con una ficha · ${all.filter((i) => i.parentId).length}`],
              ["solas", `Sin ficha · ${all.filter((i) => !i.parentId).length}`],
            ] as [Relation, string][]
          ).map(([key, text]) => (
            <button key={key} type="button" className="imp-chip" aria-pressed={relation === key} onClick={() => setRelation(key)}>
              {text}
            </button>
          ))}
        </div>
      </div>
      {link.error && (
        <p className="admin-error" role="alert"><Icon name="alert" size={15} /> {link.error.message}</p>
      )}

      <div className="imp-table-wrap">
        <table className="imp-table imp-proposals__table">
          <thead>
            <tr>
              <th scope="col">Indicador del programa</th>
              <th scope="col">Eslabón</th>
              <th scope="col">Relacionado con</th>
              {SHOWN_YEARS.map((y) => (
                <th key={y} scope="col" className="imp-num">{y}</th>
              ))}
              <th scope="col">Pilares y ODS</th>
            </tr>
          </thead>
          {sites
            .filter((s) => shown.some((i) => siteKey(i) === s))
            .map((s) => (
              <tbody key={s}>
                <tr className="imp-group">
                  <th colSpan={4 + SHOWN_YEARS.length} scope="rowgroup">
                    {siteName(s)} <span>{shown.filter((i) => siteKey(i) === s).length}</span>
                  </th>
                </tr>
                {shown
                  .filter((i) => siteKey(i) === s)
                  .map((i) => (
                    <tr key={i.id}>
                      <th scope="row" className="imp-name">
                        {i.name}
                        {i.description && <span className="imp-small imp-muted imp-proposals__desc">{i.description}</span>}
                      </th>
                      <td><span className="imp-tag" data-tone="quiet">{STAGE_LABEL[i.stage]}</span></td>
                      <td>
                        {canCurate ? (
                          <select
                            className="imp-proposals__link"
                            aria-label={`Ficha relacionada con ${i.name}`}
                            value={i.parentId ?? ""}
                            disabled={link.isPending}
                            onChange={(e) => link.mutate({ id: i.id, parentId: e.target.value || null })}
                          >
                            <option value="">Sin ficha</option>
                            {fichas.map((f) => (
                              <option key={f.id} value={f.id}>{f.code} · {f.name}</option>
                            ))}
                          </select>
                        ) : i.parentId ? (
                          <span><span className="imp-code">{fichaById.get(i.parentId)?.code}</span> {fichaById.get(i.parentId)?.name}</span>
                        ) : (
                          <span className="imp-muted">Sin ficha</span>
                        )}
                      </td>
                      {SHOWN_YEARS.map((y) => (
                        <td key={y} className="imp-num">{cell(i.id, y, i.measure)}</td>
                      ))}
                      <td><AlignmentChips indicatorId={i.id} catalog={catalog} base={base} compact /></td>
                    </tr>
                  ))}
              </tbody>
            ))}
        </table>
      </div>
    </div>
  );
}
