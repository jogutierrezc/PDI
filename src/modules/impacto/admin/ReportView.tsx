/* =============================================================================
   Mi reporte · dirección y reportantes de programa (sobre la base).

   Dos formas de trabajar sobre los mismos registros y las mismas reglas:
     · Sencillo: la lista a la izquierda y, al lado, la ficha de un
       indicador con su contexto, el valor calculado en vivo y sus
       evidencias. Para quien reporta pocas veces al año.
     · Hoja de cálculo: una fila por registro, edición en la celda, flechas,
       Tab, Enter y pegar desde Excel. Para quien ya trabaja en Excel.

   «Guardar» nunca bloquea. Las reglas que bloquean (V01–V09) se aplican al
   enviar el paquete completo a decanatura, que pide la certificación.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { FUNCTIONS, LEVELS, functionById } from "../data/catalog";
import { blocking, computedValue, variation } from "../data/validate";
import type { Draft, Issue, NoData } from "../data/validate";
import {
  ConflictError,
  draftOf,
  editable,
  evidenceLink,
  indicatorOf,
  issuesOf,
  useAddEvidence,
  useCaptureRows,
  useEvidence,
  useMyPrograms,
  useOpenPeriods,
  useRecordHistory,
  useRemoveEvidence,
  useSaveRecord,
  useSubmitProgram,
} from "../data/capture-db";
import type { CaptureRow } from "../data/capture-db";
import { formatValue, unitLabel } from "../data/lens";
import { CaptureSheet } from "./CaptureSheet";
import { StatePill } from "./parts";
import { RETURN_REASONS, STATE_LABEL } from "./store";

type Mode = "sencillo" | "hoja";
const MODE_KEY = "impacto:modo-captura";
const MAX_FILE = 10 * 1024 * 1024;
const FILE_TYPES = /\.(pdf|xlsx?|png|jpe?g|webp)$/i;
const CALC_LABEL = { conteo: "Conteo", razon: "Razón", puntaje: "Puntaje", comparacion: "Comparación", texto: "Texto" } as const;

function readMode(): Mode {
  try {
    return window.localStorage.getItem(MODE_KEY) === "hoja" ? "hoja" : "sencillo";
  } catch {
    return "sencillo";
  }
}

export function ReportView() {
  const programs = useMyPrograms();
  const periods = useOpenPeriods();
  const [programId, setProgramId] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [selected, setSelected] = useState<string | null>(null);
  const program = programs.data?.find((p) => p.program_id === programId) ?? programs.data?.[0] ?? null;
  const period = periods.data?.find((p) => p.id === periodId) ?? periods.data?.[0] ?? null;
  const rows = useCaptureRows(period?.id ?? null, program?.program_id ?? null);

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {
      /* Sin almacenamiento: el modo vuelve a sencillo al recargar. */
    }
  };

  if (programs.isPending || periods.isPending) return <p className="ia-muted">Cargando…</p>;
  if (programs.error || periods.error) {
    return (
      <p className="ia-error" role="alert">
        <Icon name="alert" size={15} />
        {(programs.error ?? periods.error)?.message}
      </p>
    );
  }
  if (!program) {
    return (
      <section className="admin-card ia-empty-state">
        <h2>No tiene programas para reportar</h2>
        <p>Para capturar, Planeación debe asignarle un rol con la capacidad de capturar en el programa (Usuarios y roles).</p>
      </section>
    );
  }
  if (!period) {
    return (
      <section className="admin-card ia-empty-state">
        <h2>No hay un periodo abierto</h2>
        <p>Cuando Planeación abra el periodo, aquí aparecerá lo que {program.program_name} debe reportar.</p>
      </section>
    );
  }

  const list = rows.data ?? [];

  return (
    <>
      <Board
        rows={list}
        programName={program.program_name}
        periodCode={period.code}
        cutoff={period.cutoff_program}
        canSend={program.can_send}
        periodId={period.id}
        programId={program.program_id}
        mode={mode}
        onMode={setMode}
        onPick={(id) => {
          setSelected(id);
          setMode("sencillo");
        }}
        chooser={
          (programs.data?.length ?? 0) > 1 || (periods.data?.length ?? 0) > 1 ? (
            <div className="ia-choosers">
              {(programs.data?.length ?? 0) > 1 && (
                <label className="admin-field">
                  <span>Programa</span>
                  <select value={program.program_id} onChange={(e) => setProgramId(e.target.value)}>
                    {programs.data!.map((p) => (
                      <option key={p.program_id} value={p.program_id}>
                        {p.program_name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(periods.data?.length ?? 0) > 1 && (
                <label className="admin-field">
                  <span>Periodo</span>
                  <select value={period.id} onChange={(e) => setPeriodId(e.target.value)}>
                    {periods.data!.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ) : null
        }
      />

      {rows.error && <p className="ia-error">{rows.error.message}</p>}
      {rows.isPending && <p className="ia-muted">Cargando los registros…</p>}

      {rows.data &&
        (mode === "hoja" ? (
          <CaptureSheet rows={list} />
        ) : (
          <SimpleCapture rows={list} selected={selected} onSelect={setSelected} />
        ))}
    </>
  );
}

/* --- Tablero del periodo y envío ------------------------------------------------------ */

function Board({
  rows,
  programName,
  periodCode,
  cutoff,
  canSend,
  periodId,
  programId,
  mode,
  onMode,
  onPick,
  chooser,
}: {
  rows: CaptureRow[];
  programName: string;
  periodCode: string;
  cutoff: string;
  canSend: boolean;
  periodId: string;
  programId: string;
  mode: Mode;
  onMode: (m: Mode) => void;
  onPick: (id: string) => void;
  chooser: ReactNode;
}) {
  const submit = useSubmitProgram();
  const [sending, setSending] = useState(false);
  const [certified, setCertified] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const open = rows.filter((r) => editable(r.state));
  const complete = rows.filter((r) => blocking(issuesOf(r)).length === 0);
  const returned = rows.filter((r) => r.state === "devuelto_programa");
  const withErrors = open.map((r) => ({ row: r, errors: blocking(issuesOf(r)) })).filter((x) => x.errors.length > 0);
  const done_pct = rows.length ? Math.round((complete.length / rows.length) * 100) : 0;

  async function go() {
    setError("");
    try {
      const n = await submit.mutateAsync({ periodId, programId });
      setDone(`Se enviaron ${n} registros a decanatura.`);
      setSending(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar.");
    }
  }

  return (
    <section className="admin-card ia-board">
      <div className="ia-board__who">
        <h2>{programName}</h2>
        <p>
          Periodo {periodCode} · cierre para programas el{" "}
          {new Date(`${cutoff}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}
        </p>
        {chooser}
      </div>
      <dl className="ia-counts">
        <div>
          <dt>Asignados</dt>
          <dd>{rows.length}</dd>
        </div>
        <div>
          <dt>Completos</dt>
          <dd>{complete.length}</dd>
        </div>
        <div>
          <dt>Pendientes</dt>
          <dd>{rows.length - complete.length}</dd>
        </div>
        <div data-alert={returned.length > 0 || undefined}>
          <dt>Devueltos</dt>
          <dd>{returned.length}</dd>
        </div>
      </dl>
      <div className="ia-progress" role="progressbar" aria-valuenow={done_pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del reporte">
        <i style={{ transform: `scaleX(${done_pct / 100})` }} />
      </div>
      <div className="ia-board__actions">
        <div className="ia-mode" role="group" aria-label="Forma de trabajo">
          <button type="button" aria-pressed={mode === "sencillo"} onClick={() => onMode("sencillo")}>
            <Icon name="columns" size={14} /> Sencillo
          </button>
          <button type="button" aria-pressed={mode === "hoja"} onClick={() => onMode("hoja")}>
            <Icon name="table" size={14} /> Hoja de cálculo
          </button>
        </div>
        <button type="button" className="button-ghost" disabled title="Llega en la fase 6">
          <Icon name="download" size={15} />
          Descargar plantilla Excel
        </button>
        <button type="button" className="button-ghost" disabled title="Llega en la fase 6">
          <Icon name="upload" size={15} />
          Importar Excel
        </button>
        {canSend && (
          <button
            type="button"
            className="button-primary"
            disabled={open.length === 0}
            onClick={() => {
              setSending(true);
              setCertified(false);
              setDone("");
            }}
          >
            Enviar a decanatura
            <Icon name="arrow-right" size={15} />
          </button>
        )}
      </div>
      {!canSend && open.length > 0 && <p className="ia-muted">El envío a decanatura lo hace la dirección del programa.</p>}

      {sending && (
        <div className="ia-send" role="region" aria-label="Envío a decanatura">
          {withErrors.length > 0 ? (
            <>
              <p className="ia-error">
                <Icon name="alert" size={15} />
                No se puede enviar todavía: {withErrors.length} {withErrors.length === 1 ? "registro tiene" : "registros tienen"} algo pendiente.
              </p>
              <ul className="ia-send__list">
                {withErrors.map(({ row, errors }) => (
                  <li key={row.id}>
                    <button type="button" onClick={() => onPick(row.id)}>
                      <span className="ia-code">{row.code}</span> {row.campus_name ?? "Todas las sedes"}
                    </button>
                    <span>{errors[0].message}</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="button-ghost" onClick={() => setSending(false)}>
                Seguir capturando
              </button>
            </>
          ) : (
            <>
              <p>
                Se enviarán <strong>{open.length}</strong> registros de {programName} a la decanatura. Después solo podrá editar
                los que le devuelvan.
              </p>
              <label className="ia-check">
                <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
                Certifico que la información reportada es veraz y cuenta con los soportes correspondientes.
              </label>
              {error && <p className="ia-error">{error}</p>}
              <div className="ia-actions">
                <button type="button" className="button-ghost" onClick={() => setSending(false)}>
                  Cancelar
                </button>
                <button type="button" className="button-primary" disabled={!certified || submit.isPending} onClick={() => void go()}>
                  {submit.isPending ? "Enviando…" : `Enviar ${open.length} registros`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {done && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={15} /> {done}
        </p>
      )}
    </section>
  );
}

/* --- Modo sencillo: lista y ficha --------------------------------------------------------- */

function SimpleCapture({ rows, selected, onSelect }: { rows: CaptureRow[]; selected: string | null; onSelect: (id: string) => void }) {
  // Primero lo devuelto: es lo que la decanatura está esperando.
  const first = rows.find((r) => r.state === "devuelto_programa") ?? rows.find((r) => editable(r.state)) ?? rows[0];
  const current = rows.find((r) => r.id === selected) ?? first ?? null;

  return (
    <div className="ia-split">
      <section className="admin-card ia-list" aria-label="Indicadores asignados">
        {FUNCTIONS.map((f) => {
          const own = rows.filter((r) => r.function_id === f.id);
          if (!own.length) return null;
          return (
            <div key={f.id} className="ia-group" style={{ "--tone": f.tone } as CSSProperties}>
              <h3>{f.name}</h3>
              {LEVELS.map((level) => {
                const inLevel = own.filter((r) => r.level === level.id);
                if (!inLevel.length) return null;
                return (
                  <div key={level.id}>
                    <h4>{level.name}</h4>
                    <ul>
                      {inLevel.map((r) => {
                        const ready = blocking(issuesOf(r)).length === 0;
                        return (
                          <li key={r.id}>
                            <button type="button" aria-pressed={current?.id === r.id} onClick={() => onSelect(r.id)}>
                              <span className="ia-code">{r.code}</span>
                              <span className="ia-list__name">
                                {r.name}
                                <small>
                                  {r.campus_name ?? "Todas las sedes"} · {CALC_LABEL[r.calc_type]}
                                </small>
                              </span>
                              <span className="ia-list__meta">
                                <StatePill estado={r.state} />
                                <span className="ia-ready" data-ready={ready || undefined}>
                                  {ready ? <Icon name="check" size={13} /> : null}
                                  {ready ? "Completo" : "Pendiente"}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      {current && <CapturePanel key={current.id} row={current} />}
    </div>
  );
}

const toNumber = (text: string): number | null => {
  const clean = text.replace(/\s/g, "").replace(",", ".");
  if (clean === "") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : NaN;
};

function NumberField({ label, value, onChange, disabled, issue }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; disabled: boolean; issue?: Issue }) {
  const [text, setText] = useState(value == null ? "" : String(value).replace(".", ","));
  return (
    <label className="admin-field" data-error={issue ? true : undefined}>
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        aria-invalid={issue ? true : undefined}
        onChange={(e) => {
          setText(e.target.value);
          onChange(toNumber(e.target.value));
        }}
      />
      {issue && <small className="ia-field-error">{issue.message}</small>}
    </label>
  );
}

function CapturePanel({ row }: { row: CaptureRow }) {
  const indicator = useMemo(() => indicatorOf(row), [row]);
  const fn = functionById[row.function_id];
  const [draft, setDraft] = useState<Draft & { observations: string }>(() => ({ ...draftOf(row), observations: row.observations ?? "" }));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const save = useSaveRecord();
  const can = editable(row.state) && row.period_state === "abierto";

  // Las evidencias se guardan al momento; el borrador cuenta las que hay.
  useEffect(() => {
    setDraft((d) => ({ ...d, evidencias: draftOf(row).evidencias }));
  }, [row.evidence_count]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevValue = row.previous_value === null ? null : Number(row.previous_value);
  const value = computedValue(indicator, draft);
  const change = variation(value, prevValue);
  const issues = issuesOf(row, draft, true);
  const issueFor = (field: keyof Draft | "valor") => issues.find((i) => i.field === field && i.level === "error");
  const overThreshold = change !== null && Math.abs(change) > Number(row.variation_threshold);
  const discrepancy = row.capture_mode === "precargado" && draft.confirma === false;
  const needsWhy = Boolean(draft.noAplica) || overThreshold || discrepancy || draft.justificacion.length > 0;
  const preloadedLocked = row.capture_mode === "precargado" && draft.confirma !== false;
  const fieldsDisabled = !can || Boolean(draft.noAplica) || preloadedLocked;
  const reason = row.return_reason ? RETURN_REASONS.find(([k]) => k === row.return_reason)?.[1] : null;

  const set = (patch: Partial<Draft & { observations: string }>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setNotice("");
  };

  async function submit() {
    setError("");
    try {
      await save.mutateAsync({ row, draft });
      setNotice("Guardado en borrador.");
    } catch (cause) {
      setError(cause instanceof ConflictError || cause instanceof Error ? cause.message : "No se pudo guardar.");
    }
  }

  return (
    <aside className="admin-card ia-capture" style={{ "--tone": fn.tone } as CSSProperties} aria-label={`Captura de ${row.code}`}>
      {row.state === "devuelto_programa" && (
        <div className="ia-returned" role="note">
          <Icon name="alert" size={15} />
          <div>
            <strong>Devuelto{reason ? `: ${reason}` : ""}</strong>
            {row.return_comment && <p>{row.return_comment}</p>}
          </div>
        </div>
      )}

      <header>
        <h2>
          <span className="ia-code">{row.code}</span> {row.name}
        </h2>
        <p>
          {row.campus_name ?? "Todas las sedes"} · {CALC_LABEL[row.calc_type]} · <StatePill estado={row.state} />
        </p>
      </header>

      <details className="ia-context">
        <summary>Qué se pide</summary>
        {row.description && <p>{row.description}</p>}
        <dl>
          <div>
            <dt>{row.denominator_def ? "Numerador" : "Qué se cuenta"}</dt>
            <dd>{row.numerator_def}</dd>
          </div>
          {row.denominator_def && (
            <div>
              <dt>Denominador</dt>
              <dd>{row.denominator_def}</dd>
            </div>
          )}
          <div>
            <dt>Unidad</dt>
            <dd>{unitLabel(indicator)}</dd>
          </div>
          <div>
            <dt>Meta {row.period_code.slice(0, 4)}</dt>
            <dd>{row.target_text ?? (row.target_numeric ?? "—")}</dd>
          </div>
          <div>
            <dt>Periodo anterior</dt>
            <dd>{row.previous_period ? `${formatValue(indicator, prevValue)} (${row.previous_period})` : "Sin dato validado"}</dd>
          </div>
          <div>
            <dt>Evidencia</dt>
            <dd>{row.evidence_required ? `${row.evidence_type} (obligatoria)` : row.evidence_type || "No se exige"}</dd>
          </div>
        </dl>
      </details>

      {row.capture_mode === "precargado" && (
        <fieldset className="ia-choice" disabled={!can}>
          <legend>
            Dato precargado
            {row.preloaded
              ? `: ${row.preloaded.numerator ?? "—"}${row.preloaded.denominator ? ` ÷ ${row.preloaded.denominator}` : ""}${row.preloaded.n ? ` (n = ${row.preloaded.n})` : ""}`
              : " (aún no se ha cargado)"}
          </legend>
          <label>
            <input type="radio" name={`confirma-${row.id}`} checked={draft.confirma === true} onChange={() => set({ confirma: true })} />
            Confirmo el dato
          </label>
          <label>
            <input type="radio" name={`confirma-${row.id}`} checked={draft.confirma === false} onChange={() => set({ confirma: false })} />
            Hay una discrepancia
          </label>
        </fieldset>
      )}

      <div className="ia-fields">
        {row.calc_type === "comparacion" ? (
          <>
            <p className="ia-fields__group">Grupo intervenido</p>
            <NumberField label="Numerador" value={draft.numerador} disabled={fieldsDisabled} onChange={(v) => set({ numerador: v })} issue={issueFor("numerador")} />
            <NumberField label="Denominador" value={draft.denominador} disabled={fieldsDisabled} onChange={(v) => set({ denominador: v })} issue={issueFor("denominador")} />
            <p className="ia-fields__group">Grupo de comparación</p>
            <NumberField label="Numerador" value={draft.numComparacion} disabled={fieldsDisabled} onChange={(v) => set({ numComparacion: v })} issue={issueFor("numComparacion")} />
            <NumberField label="Denominador" value={draft.denComparacion} disabled={fieldsDisabled} onChange={(v) => set({ denComparacion: v })} issue={issueFor("denComparacion")} />
          </>
        ) : row.calc_type === "razon" ? (
          <>
            <NumberField label="Numerador" value={draft.numerador} disabled={fieldsDisabled} onChange={(v) => set({ numerador: v })} issue={issueFor("numerador")} />
            <NumberField label="Denominador" value={draft.denominador} disabled={fieldsDisabled} onChange={(v) => set({ denominador: v })} issue={issueFor("denominador")} />
          </>
        ) : row.calc_type === "puntaje" ? (
          <>
            <NumberField label="Puntaje" value={draft.numerador} disabled={fieldsDisabled} onChange={(v) => set({ numerador: v })} issue={issueFor("numerador") ?? issueFor("valor")} />
            <NumberField label="Número de respuestas o evaluados" value={draft.n} disabled={fieldsDisabled} onChange={(v) => set({ n: v })} issue={issueFor("n")} />
          </>
        ) : (
          <NumberField label="Valor" value={draft.numerador} disabled={fieldsDisabled} onChange={(v) => set({ numerador: v })} issue={issueFor("numerador") ?? issueFor("valor")} />
        )}
      </div>

      <div className="ia-live" aria-live="polite">
        <span>Valor calculado</span>
        <strong>{draft.noAplica ? (draft.noAplica === "no_aplica" ? "No aplica" : "Sin dato") : formatValue(indicator, value)}</strong>
        <small>
          {unitLabel(indicator)}
          {row.previous_period && prevValue !== null && ` · ${row.previous_period}: ${formatValue(indicator, prevValue)}`}
          {change !== null && !draft.noAplica && ` · ${change > 0 ? "+" : ""}${change.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`}
        </small>
        {row.calc_type === "comparacion" && draft.numComparacion != null && draft.denComparacion ? (
          <small>Grupo de comparación: {formatValue(indicator, (draft.numComparacion / draft.denComparacion) * row.factor)}</small>
        ) : null}
      </div>

      <label className="admin-field">
        <span>No aplica o sin dato</span>
        <select value={draft.noAplica ?? ""} disabled={!can} onChange={(e) => set({ noAplica: (e.target.value || null) as NoData })}>
          <option value="">Se reporta</option>
          <option value="no_aplica">No aplica al programa</option>
          <option value="sin_dato">No hay dato este periodo</option>
        </select>
      </label>

      {needsWhy && (
        <label className="admin-field" data-error={issueFor("justificacion") ? true : undefined}>
          <span>
            Justificación
            {overThreshold && !draft.noAplica && <output>cambió más de {row.variation_threshold} %</output>}
          </span>
          <textarea value={draft.justificacion} disabled={!can} onChange={(e) => set({ justificacion: e.target.value })} />
          {issueFor("justificacion") && <small className="ia-field-error">{issueFor("justificacion")!.message}</small>}
        </label>
      )}

      <label className="admin-field">
        <span>Observaciones para quien revisa</span>
        <textarea value={draft.observations} disabled={!can} onChange={(e) => set({ observations: e.target.value })} placeholder="Opcional" />
      </label>

      <Evidences row={row} can={can} issue={issueFor("evidencias")} />

      {issues
        .filter((i) => i.level === "alerta")
        .map((i) => (
          <p key={i.code} className="ia-warning">
            <Icon name="alert" size={14} />
            {i.message}
          </p>
        ))}

      {error && (
        <p className="ia-error" role="alert">
          <Icon name="alert" size={15} />
          {error}
        </p>
      )}

      {can ? (
        <div className="ia-actions">
          {notice && (
            <span className="ia-saved" role="status">
              <Icon name="check" size={14} /> {notice}
            </span>
          )}
          <button type="button" className="button-primary" disabled={save.isPending} onClick={() => void submit()}>
            {save.isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      ) : (
        <p className="ia-muted">{STATE_LABEL[row.state]}: este registro ya no se edita desde el programa.</p>
      )}

      <DbHistory recordId={row.id} />
    </aside>
  );
}

function Evidences({ row, can, issue }: { row: CaptureRow; can: boolean; issue?: Issue }) {
  const evidence = useEvidence(row.id);
  const add = useAddEvidence();
  const remove = useRemoveEvidence();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const run = async (work: () => Promise<unknown>) => {
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar.");
    }
  };

  return (
    <div className="ia-evidence" data-error={issue ? true : undefined}>
      <p>
        Evidencias
        {row.evidence_required && <em className="ia-pill ia-pill--pending">Obligatoria</em>}
      </p>
      {(evidence.data ?? []).length > 0 && (
        <ul>
          {evidence.data!.map((ev) => (
            <li key={ev.id}>
              <Icon name={ev.kind === "url" ? "external" : "document"} size={14} />
              <button
                type="button"
                className="ia-link"
                onClick={() =>
                  void run(async () => {
                    const link = await evidenceLink(ev);
                    if (link) window.open(link, "_blank", "noopener");
                  })
                }
              >
                {ev.file_name ?? ev.url}
              </button>
              {can && (
                <button type="button" disabled={remove.isPending} onClick={() => void run(() => remove.mutateAsync(ev))}>
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {can && (
        <div className="ia-evidence__add">
          <input aria-label="Enlace de evidencia" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button
            type="button"
            className="button-ghost"
            disabled={!url.trim() || add.isPending}
            onClick={() =>
              void run(async () => {
                if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url.trim())) throw new Error("El enlace de evidencia no es una URL válida.");
                await add.mutateAsync({ recordId: row.id, url });
                setUrl("");
              })
            }
          >
            Añadir enlace
          </button>
          <label className="button-ghost ia-file">
            <Icon name="upload" size={14} />
            {add.isPending ? "Subiendo…" : "Adjuntar archivo"}
            <input
              type="file"
              accept=".pdf,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (!FILE_TYPES.test(file.name)) return setError("Solo PDF, Excel o imagen.");
                if (file.size > MAX_FILE) return setError("El archivo pasa de 10 MB.");
                void run(() => add.mutateAsync({ recordId: row.id, file }));
              }}
            />
          </label>
        </div>
      )}
      {(error || issue) && <small className="ia-field-error">{error || issue!.message}</small>}
    </div>
  );
}

export function DbHistory({ recordId }: { recordId: string }) {
  const history = useRecordHistory(recordId);
  const entries = history.data ?? [];
  const reason = (k: string | null | undefined) => (k ? RETURN_REASONS.find(([key]) => key === k)?.[1] ?? k : null);
  return (
    <details className="ia-history">
      <summary>Historial ({entries.length})</summary>
      {entries.length === 0 ? (
        <p className="ia-muted">Sin movimientos: el registro está en borrador desde que se abrió el periodo.</p>
      ) : (
        <ol>
          {entries.map((e, i) =>
            e.kind === "transicion" ? (
              <li key={i}>
                <strong>
                  {STATE_LABEL[e.from_state as keyof typeof STATE_LABEL] ?? e.from_state} → {STATE_LABEL[e.to_state as keyof typeof STATE_LABEL] ?? e.to_state}
                </strong>
                <span>
                  {e.actor ?? "—"} · {new Date(e.at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                </span>
                {e.reason && (
                  <span>
                    {reason(e.reason)}: {e.comment}
                  </span>
                )}
              </li>
            ) : (
              <li key={i}>
                <strong>Importación de Excel</strong>
                <span>
                  {e.file_name} · {e.actor ?? "—"} · {new Date(e.at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ),
          )}
        </ol>
      )}
    </details>
  );
}
