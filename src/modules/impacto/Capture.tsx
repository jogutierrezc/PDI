/* =============================================================================
   Impacto · Captura de la vicerrectoría (propuesta A2).

   Una hoja: filas por eslabón, columnas por año. Arriba se elige el alcance —la
   cifra global de la UDES o la de un programa en una sede— y la ventana de
   años. Las celdas cambiadas se marcan hasta guardar; el avance frente a la
   meta 2026 y el estado se recalculan solos. Pegar un rango de Excel rellena
   desde la celda enfocada hacia la derecha y hacia abajo.

   "N/A" en una celda es «este año no aplica», que no es lo mismo que vacío.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { ClipboardEvent, ReactNode } from "react";
import { Icon } from "../../components/ui/Icon";
import { SaveState } from "../admin/udes-en-cifras/ui";
import type { ImpactAccess } from "./access";
import {
  REPORT_STATE_LABEL,
  STAGES,
  STAGE_LABEL,
  YEARS,
  byChain,
  displayValue,
  latestValue,
  parseFigure,
  progress,
  stateAgainstTarget,
  valueScopeKey,
  type Indicator,
  type ReportState,
  type SubstantiveFunction,
  type Value,
} from "./model";
import { useAdoptions, useSaveValues, useValues, type Catalog, type ImpactBase, type ValueChange } from "./store";
import { HalfDot } from "./Catalog";

const WINDOWS = {
  corta: [2023, 2024, 2025, 2026],
  completa: YEARS,
} as const;

export function StateMark({ state }: { state: ReportState }) {
  const tone = state === "cumplida" || state === "completo" ? "ok" : state === "en_proceso" ? "wait" : "none";
  return (
    <span className="imp-mark" data-state={tone}>
      {tone === "ok" ? (
        <Icon name="check" size={13} />
      ) : tone === "wait" ? (
        <HalfDot />
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="3 3" />
        </svg>
      )}
      {REPORT_STATE_LABEL[state]}
    </span>
  );
}

/** Lo escrito en una celda, como lo guarda la base. */
function toChange(text: string, indicator: Indicator): Pick<ValueChange, "valueNum" | "valueText" | "notApplicable"> {
  const t = text.trim();
  if (/^n\/?a$/i.test(t)) return { valueNum: null, valueText: "", notApplicable: true };
  if (!t) return { valueNum: null, valueText: "", notApplicable: false };
  const n = indicator.measure === "texto" ? null : parseFigure(t);
  return n === null ? { valueNum: null, valueText: t, notApplicable: false } : { valueNum: n, valueText: "", notApplicable: false };
}

export function Capture({
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
    () => catalog.indicators.filter((i) => i.fn === fn && i.status !== "retirado").sort(byChain),
    [catalog.indicators, fn],
  );
  const ids = useMemo(() => indicators.map((i) => i.id), [indicators]);
  const values = useValues(ids);
  const adoptions = useAdoptions();
  const save = useSaveValues();

  const [scope, setScope] = useState("global");
  const [windowKey, setWindowKey] = useState<keyof typeof WINDOWS>("corta");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const cutYear = Math.min(new Date().getFullYear() - 1, 2028);
  const years = WINDOWS[windowKey];

  // Los programas en sede: primero los que siguen algún indicador de la función.
  const siteName = (programId: string, campusId: string) => {
    const program = base.units.find((u) => u.id === programId)?.name ?? "Programa";
    const campus = base.campuses.find((c) => c.id === campusId)?.name ?? "Sede";
    return `${program} · ${campus}`;
  };
  const following = new Set(
    (adoptions.data ?? []).filter((a) => a.active && ids.includes(a.indicatorId)).map((a) => `${a.programId}|${a.campusId}`),
  );
  const allSites = base.offer
    .map((o) => ({ key: `${o.programId}|${o.campusId}`, name: siteName(o.programId, o.campusId) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  // Alcance: «global», «sede|<sede>» (la UDES en una sede) o «<programa>|<sede>».
  const [programId, campusId] =
    scope === "global" ? [null, null] : scope.startsWith("sede|") ? [null, scope.slice(5)] : scope.split("|");
  const campusName = (id: string | null) => base.campuses.find((c) => c.id === id)?.name ?? "Sede";

  const cells = useMemo(() => {
    const map = new Map<string, Value>();
    for (const v of values.data ?? []) if (valueScopeKey(v) === scope) map.set(`${v.indicatorId}|${v.year}`, v);
    return map;
  }, [values.data, scope]);

  const canEditRow = (i: Indicator) => access.canDefine(i.fn, i.ownerUnitId);
  const editable = indicators.some(canEditRow);

  const textOf = (i: Indicator, year: number) => {
    const key = `${i.id}|${year}`;
    return key in edits ? edits[key] : displayValue(cells.get(key), i.measure);
  };
  const noteKey = (i: Indicator) => `${i.id}|${cutYear}`;
  const noteOf = (i: Indicator) => (noteKey(i) in notes ? notes[noteKey(i)] : cells.get(noteKey(i))?.note ?? "");

  const dirtyKeys = Object.keys(edits).filter((key) => {
    const [id, year] = key.split("|");
    const i = indicators.find((x) => x.id === id);
    return i && edits[key] !== displayValue(cells.get(key), i.measure);
  });
  const dirtyNotes = Object.keys(notes).filter((key) => notes[key] !== (cells.get(key)?.note ?? ""));
  const dirtyCount = new Set([...dirtyKeys, ...dirtyNotes]).size;

  const setCell = (i: Indicator, year: number, text: string) => setEdits((e) => ({ ...e, [`${i.id}|${year}`]: text }));

  // Pegar de Excel: filas hacia abajo (en el orden visible), columnas hacia la derecha.
  const onPaste = (event: ClipboardEvent<HTMLInputElement>, row: number, col: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    const grid = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    setEdits((current) => {
      const next = { ...current };
      grid.forEach((line, dr) => {
        const target = indicators[row + dr];
        if (!target || !canEditRow(target)) return;
        line.forEach((cellText, dc) => {
          const year = years[col + dc];
          if (year !== undefined) next[`${target.id}|${year}`] = cellText.trim();
        });
      });
      return next;
    });
  };

  const submit = () => {
    const changes: ValueChange[] = [];
    const keys = new Set([...dirtyKeys, ...dirtyNotes]);
    for (const key of keys) {
      const [id, yearText] = key.split("|");
      const i = indicators.find((x) => x.id === id)!;
      const year = Number(yearText);
      const existing = cells.get(key);
      const text = key in edits ? edits[key] : displayValue(existing, i.measure);
      changes.push({
        id: existing?.id,
        indicatorId: id,
        year,
        programId,
        campusId,
        ...toChange(text, i),
        numerator: existing?.numerator ?? null,
        denominator: existing?.denominator ?? null,
        evidenceUrl: existing?.evidenceUrl ?? "",
        note: key in notes ? notes[key] : existing?.note ?? "",
      });
    }
    save.mutate(changes, {
      onSuccess: () => {
        setEdits({});
        setNotes({});
      },
    });
  };

  const withFigure = indicators.filter((i) => {
    const v = cells.get(`${i.id}|${cutYear}`);
    return v && !v.notApplicable && (v.valueNum !== null || v.valueText);
  }).length;

  let rowIndex = -1;

  return (
    <div className="imp-capture">
      <div className="imp-toolbar">
        <label className="imp-picker imp-picker--wide">
          <span className="imp-label">Alcance</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={dirtyCount > 0} title={dirtyCount ? "Guarda o descarta antes de cambiar" : undefined}>
            <option value="global">UDES · cifra global</option>
            <optgroup label="La UDES en una sede">
              {[...base.campuses]
                .sort((a, b) => a.name.localeCompare(b.name, "es"))
                .map((c) => (
                  <option key={c.id} value={`sede|${c.id}`}>
                    UDES · {c.name}
                  </option>
                ))}
            </optgroup>
            {following.size > 0 && (
              <optgroup label="Programas que siguen indicadores de esta función">
                {allSites
                  .filter((s) => following.has(s.key))
                  .map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            )}
            <optgroup label="Todos los programas">
              {allSites
                .filter((s) => !following.has(s.key))
                .map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <div className="imp-seg imp-seg--quiet" role="group" aria-label="Años">
          <button type="button" aria-pressed={windowKey === "corta"} onClick={() => setWindowKey("corta")}>
            2023–2026
          </button>
          <button type="button" aria-pressed={windowKey === "completa"} onClick={() => setWindowKey("completa")}>
            2022–2028
          </button>
        </div>
        <span className="imp-progress-line">
          <b>
            {withFigure} de {indicators.length}
          </b>{" "}
          con cifra {cutYear}
          <span className="imp-bar" aria-hidden="true">
            <i style={{ width: `${indicators.length ? Math.round((withFigure / indicators.length) * 100) : 0}%` }} />
          </span>
        </span>
        {editable && <span className="imp-muted imp-small imp-toolbar__hint">Pega un rango de Excel desde la celda enfocada · «N/A» si no aplica</span>}
      </div>

      {values.isPending ? (
        <p className="admin-loading">Cargando las cifras…</p>
      ) : (
        <div className="imp-table-wrap imp-table-wrap--grid">
          <table className="imp-table imp-grid">
            <thead>
              <tr>
                <th scope="col" className="imp-col-code">Cód.</th>
                <th scope="col" className="imp-grid__label">Indicador</th>
                <th scope="col">Unidad</th>
                {years.map((y) => (
                  <th key={y} scope="col" className="imp-num" data-cut={y === cutYear || undefined}>
                    {y === 2023 ? "LB 2023" : y}
                  </th>
                ))}
                <th scope="col" className="imp-num">Meta 2026</th>
                <th scope="col" className="imp-num">Avance 2026</th>
                <th scope="col" className="imp-num">Meta 2028</th>
                <th scope="col">Estado</th>
                <th scope="col">Observación {cutYear}</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.filter((stage) => indicators.some((i) => i.stage === stage)).map((stage) => (
                <StageBlock key={stage} label={STAGE_LABEL[stage]} span={years.length + 8}>
                  {indicators
                    .filter((i) => i.stage === stage)
                    .map((i) => {
                      rowIndex += 1;
                      const row = rowIndex;
                      const canEdit = canEditRow(i);
                      const rowValues = years.map((y) => cells.get(`${i.id}|${y}`)).filter(Boolean) as Value[];
                      const upTo2026 = rowValues.filter((v) => v.year <= 2026);
                      const last = latestValue(upTo2026);
                      const pct = progress(last?.valueNum ?? null, i.target2026Num, i.direction);
                      const state = stateAgainstTarget(last, i.target2026Num, i.direction);
                      return (
                        <tr key={i.id}>
                          <td className="imp-col-code">
                            <span className="imp-code">{i.code}</span>
                          </td>
                          <th scope="row" className="imp-grid__label">
                            {i.name}
                          </th>
                          <td className="imp-muted imp-small">{i.unitLabel}</td>
                          {years.map((y, col) => {
                            const key = `${i.id}|${y}`;
                            const text = textOf(i, y);
                            const changed = key in edits && edits[key] !== displayValue(cells.get(key), i.measure);
                            return (
                              <td key={y} className="imp-cell" data-cut={y === cutYear || undefined} data-dirty={changed || undefined} data-empty={!text || undefined}>
                                {canEdit ? (
                                  <input
                                    value={text}
                                    onChange={(e) => setCell(i, y, e.target.value)}
                                    onPaste={(e) => onPaste(e, row, col)}
                                    aria-label={`${i.code} ${y}`}
                                    inputMode={i.measure === "texto" ? "text" : "decimal"}
                                  />
                                ) : (
                                  <span>{text || "—"}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="imp-num imp-muted">{i.target2026 || "—"}</td>
                          <td className="imp-num">
                            {pct === null ? (
                              <span className="imp-muted">—</span>
                            ) : (
                              <span className="imp-pct">
                                <span className="imp-bar" data-done={pct >= 100 || undefined} aria-hidden="true">
                                  <i style={{ width: `${Math.min(pct, 100)}%` }} />
                                </span>
                                {pct}%
                              </span>
                            )}
                          </td>
                          <td className="imp-num imp-muted">{i.target2028 || "—"}</td>
                          <td>
                            <StateMark state={state} />
                          </td>
                          <td className="imp-cell imp-cell--note">
                            {canEdit ? (
                              <input
                                value={noteOf(i)}
                                onChange={(e) => setNotes((n) => ({ ...n, [noteKey(i)]: e.target.value }))}
                                aria-label={`Observación ${i.code}`}
                                placeholder="—"
                              />
                            ) : (
                              <span className="imp-small">{noteOf(i)}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </StageBlock>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable && (
        <footer className="imp-savebar" data-dirty={dirtyCount > 0 || undefined}>
          <span>
            {dirtyCount > 0 ? (
              <>
                <b>
                  {dirtyCount} {dirtyCount === 1 ? "cambio" : "cambios"} sin guardar
                </b>{" "}
                ·{" "}
                {scope === "global"
                  ? "cifra global de la UDES"
                  : programId
                    ? `para ${siteName(programId, campusId!)}`
                    : `para la UDES en ${campusName(campusId)}`}
              </>
            ) : (
              "Sin cambios pendientes"
            )}
          </span>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess && dirtyCount === 0} />
          <button
            type="button"
            className="button-ghost"
            onClick={() => {
              setEdits({});
              setNotes({});
            }}
            disabled={dirtyCount === 0 || save.isPending}
          >
            Descartar
          </button>
          <button type="button" className="button-primary" onClick={submit} disabled={dirtyCount === 0 || save.isPending}>
            Guardar cambios
          </button>
        </footer>
      )}
    </div>
  );
}

function StageBlock({ label, span, children }: { label: string; span: number; children: ReactNode }) {
  return (
    <>
      <tr className="imp-group">
        <th colSpan={span} scope="rowgroup">
          {label}
        </th>
      </tr>
      {children}
    </>
  );
}
