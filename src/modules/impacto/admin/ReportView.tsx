/* =============================================================================
   Mi reporte · dirección de programa.

   Lista a la izquierda, ficha de captura a la derecha: se elige un indicador
   y se llena sin cambiar de pantalla. «Guardar» nunca bloquea; las reglas
   que bloquean se aplican al enviar el paquete completo a decanatura.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "../../../components/ui/Icon";
import { CALC_LABEL, FUNCTIONS, LEVELS, campusName, functionById, indicatorByCode, programBySlug } from "../data/catalog";
import { formatValue, unitLabel } from "../data/lens";
import { blocking, computedValue, validate, variation } from "../data/validate";
import type { Draft, Issue, NoData } from "../data/validate";
import type { Measure } from "../data/types";
import { valueOf } from "../data/aggregate";
import { History, StatePill } from "./parts";
import { RETURN_REASONS, STATE_LABEL, actions, editable, me, previousOf, useImpactStore } from "./store";
import type { RecordRow } from "./store";

const MAX_FILE = 10 * 1024 * 1024;
const FILE_TYPES = /\.(pdf|xlsx?|png|jpe?g|webp)$/i;

function issuesOf(row: RecordRow, sending: boolean): Issue[] {
  const indicator = indicatorByCode.get(row.codigo)!;
  const prev = previousOf(row.codigo, row.program, row.campus);
  const prevValue = prev && indicator.ficha ? valueOf(prev.row, indicator.ficha.tipo === "comparacion" ? "razon_de_sumas" : indicator.ficha.agregacion, indicator.ficha.factor) : null;
  return validate(indicator, row.draft, { sending, previous: prev ? { period: prev.period, value: prevValue } : undefined });
}

export function ReportView() {
  const state = useImpactStore();
  const person = me(state);
  const program = programBySlug.get(person.scope)!;
  const rows = useMemo(() => Object.values(state.records).filter((r) => r.program === program.slug), [state.records, program.slug]);
  const [selected, setSelected] = useState<string | null>(rows.find((r) => editable(r.estado))?.id ?? rows[0]?.id ?? null);
  const [sending, setSending] = useState<"closed" | "check" | "confirm">("closed");
  const [certified, setCertified] = useState(false);

  if (!state.period.open) {
    return (
      <section className="admin-card ia-empty-state">
        <h2>El periodo {state.period.code} todavía no está abierto</h2>
        <p>Cuando Planeación lo abra, aquí aparecerá lo que {program.name} debe reportar.</p>
      </section>
    );
  }

  const open = rows.filter((r) => editable(r.estado));
  const complete = rows.filter((r) => blocking(issuesOf(r, true)).length === 0);
  const returned = rows.filter((r) => r.estado === "devuelto_programa");
  const withErrors = open.map((r) => ({ row: r, errors: blocking(issuesOf(r, true)) })).filter((x) => x.errors.length > 0);
  const current = rows.find((r) => r.id === selected) ?? null;
  const done = rows.length ? Math.round((complete.length / rows.length) * 100) : 0;

  return (
    <>
      <section className="admin-card ia-board">
        <div className="ia-board__who">
          <h2>{program.name}</h2>
          <p>
            Periodo {state.period.code} · cierre para programas el{" "}
            {new Date(`${state.period.cuts.programa}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}
          </p>
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
        <div className="ia-progress" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del reporte">
          <i style={{ transform: `scaleX(${done / 100})` }} />
        </div>
        <div className="ia-board__actions">
          <button type="button" className="button-ghost" disabled title="Llega en la fase 6">
            <Icon name="download" size={15} />
            Descargar plantilla Excel
          </button>
          <button type="button" className="button-ghost" disabled title="Llega en la fase 6">
            <Icon name="upload" size={15} />
            Importar Excel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={open.length === 0}
            onClick={() => {
              setSending("check");
              setCertified(false);
            }}
          >
            Enviar a decanatura
            <Icon name="arrow-right" size={15} />
          </button>
        </div>

        {sending !== "closed" && (
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
                      <button type="button" onClick={() => setSelected(row.id)}>
                        <span className="ia-code">{row.codigo}</span> {campusName(row.campus)}
                      </button>
                      <span>{errors[0].message}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="button-ghost" onClick={() => setSending("closed")}>
                  Seguir capturando
                </button>
              </>
            ) : (
              <>
                <p>
                  Se enviarán <strong>{open.length}</strong> registros de {program.name} a la decanatura. Después solo podrá
                  editar los que le devuelvan.
                </p>
                <label className="ia-check">
                  <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
                  Certifico que la información reportada es veraz y cuenta con los soportes correspondientes.
                </label>
                <div className="ia-actions">
                  <button type="button" className="button-ghost" onClick={() => setSending("closed")}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    disabled={!certified}
                    onClick={() => {
                      actions.move(open.map((r) => r.id), "enviado");
                      setSending("closed");
                    }}
                  >
                    Enviar {open.length} registros
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <div className="ia-split">
        <section className="admin-card ia-list" aria-label="Indicadores asignados">
          {FUNCTIONS.map((f) => {
            const own = rows.filter((r) => indicatorByCode.get(r.codigo)?.funcion === f.id);
            if (!own.length) return null;
            return (
              <div key={f.id} className="ia-group" style={{ "--tone": f.tone } as CSSProperties}>
                <h3>{f.name}</h3>
                {LEVELS.map((level) => {
                  const inLevel = own.filter((r) => indicatorByCode.get(r.codigo)?.nivel === level.id);
                  if (!inLevel.length) return null;
                  return (
                    <div key={level.id}>
                      <h4>{level.name}</h4>
                      <ul>
                        {inLevel.map((r) => {
                          const ind = indicatorByCode.get(r.codigo)!;
                          const ready = blocking(issuesOf(r, true)).length === 0;
                          return (
                            <li key={r.id}>
                              <button type="button" aria-pressed={selected === r.id} onClick={() => setSelected(r.id)}>
                                <span className="ia-code">{r.codigo}</span>
                                <span className="ia-list__name">
                                  {ind.nombre}
                                  <small>
                                    {campusName(r.campus)} · {CALC_LABEL[ind.ficha!.tipo]}
                                  </small>
                                </span>
                                <span className="ia-list__meta">
                                  <StatePill estado={r.estado} />
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

        {current && <CapturePanel key={`${current.id}-${current.estado}`} row={current} />}
      </div>
    </>
  );
}

/* --- Ficha de captura ---------------------------------------------------------- */

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

function CapturePanel({ row }: { row: RecordRow }) {
  const state = useImpactStore();
  const indicator = indicatorByCode.get(row.codigo)!;
  const sheet = indicator.ficha!;
  const fn = functionById[indicator.funcion];
  const [draft, setDraft] = useState<Draft>(row.draft);
  const [url, setUrl] = useState("");
  const [fileError, setFileError] = useState("");
  const [saved, setSaved] = useState(false);
  const can = editable(row.estado);

  const prev = previousOf(row.codigo, row.program, row.campus);
  const prevValue = prev ? valueOf(prev.row, sheet.tipo === "comparacion" ? "razon_de_sumas" : sheet.agregacion, sheet.factor) : null;
  const value = computedValue(indicator, draft);
  const change = variation(value, prevValue);
  const issues = validate(indicator, draft, { sending: true, previous: prev ? { period: prev.period, value: prevValue } : undefined });
  const issueFor = (field: keyof Draft | "valor") => issues.find((i) => i.field === field && i.level === "error");
  const overThreshold = change !== null && Math.abs(change) > sheet.umbral;
  const discrepancy = sheet.modo === "precargado" && draft.confirma === false;
  const needsWhy = Boolean(draft.noAplica) || overThreshold || discrepancy || draft.justificacion.length > 0;
  const preloadedLocked = sheet.modo === "precargado" && draft.confirma !== false;

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };
  const setMeasure = (patch: Partial<Measure>) => set(patch as Partial<Draft>);
  const fieldsDisabled = !can || Boolean(draft.noAplica) || preloadedLocked;
  const reason = row.devolucion ? RETURN_REASONS.find(([k]) => k === row.devolucion!.motivo)?.[1] : null;

  return (
    <aside className="admin-card ia-capture" style={{ "--tone": fn.tone } as CSSProperties} aria-label={`Captura de ${indicator.codigo}`}>
      {row.estado === "devuelto_programa" && row.devolucion && (
        <div className="ia-returned" role="note">
          <Icon name="alert" size={15} />
          <div>
            <strong>Devuelto: {reason}</strong>
            <p>{row.devolucion.comentario}</p>
          </div>
        </div>
      )}

      <header>
        <h2>
          <span className="ia-code">{indicator.codigo}</span> {indicator.nombre}
        </h2>
        <p>
          {campusName(row.campus)} · {CALC_LABEL[sheet.tipo]} · <StatePill estado={row.estado} />
        </p>
      </header>

      <details className="ia-context">
        <summary>Qué se pide</summary>
        <p>{indicator.descripcion}</p>
        <dl>
          <div>
            <dt>{sheet.denominador ? "Numerador" : "Qué se cuenta"}</dt>
            <dd>{sheet.numerador}</dd>
          </div>
          {sheet.denominador && (
            <div>
              <dt>Denominador</dt>
              <dd>{sheet.denominador}</dd>
            </div>
          )}
          <div>
            <dt>Meta {indicator.meta.anio}</dt>
            <dd>{indicator.meta.valor || "—"}</dd>
          </div>
          <div>
            <dt>Evidencia</dt>
            <dd>{sheet.evidencia ? `${sheet.evidencia.tipo}${sheet.evidencia.obligatoria ? " (obligatoria)" : ""}` : "No se exige"}</dd>
          </div>
        </dl>
      </details>

      {sheet.modo === "precargado" && (
        <fieldset className="ia-choice" disabled={!can}>
          <legend>Dato precargado desde la fuente institucional</legend>
          <label>
            <input type="radio" name="confirma" checked={draft.confirma !== false} onChange={() => set({ confirma: true })} />
            Confirmo el dato
          </label>
          <label>
            <input type="radio" name="confirma" checked={draft.confirma === false} onChange={() => set({ confirma: false })} />
            Hay una discrepancia
          </label>
        </fieldset>
      )}

      <div className="ia-fields">
        {sheet.tipo === "comparacion" ? (
          <>
            <p className="ia-fields__group">Grupo intervenido</p>
            <NumberField label="Numerador" value={draft.numerador} disabled={fieldsDisabled} onChange={(v) => setMeasure({ numerador: v })} issue={issueFor("numerador")} />
            <NumberField label="Denominador" value={draft.denominador} disabled={fieldsDisabled} onChange={(v) => setMeasure({ denominador: v })} issue={issueFor("denominador")} />
            <p className="ia-fields__group">Grupo de comparación</p>
            <NumberField label="Numerador" value={draft.numComparacion} disabled={fieldsDisabled} onChange={(v) => setMeasure({ numComparacion: v })} issue={issueFor("numComparacion")} />
            <NumberField label="Denominador" value={draft.denComparacion} disabled={fieldsDisabled} onChange={(v) => setMeasure({ denComparacion: v })} issue={issueFor("denComparacion")} />
          </>
        ) : sheet.tipo === "razon" ? (
          <>
            <NumberField label="Numerador" value={draft.numerador} disabled={fieldsDisabled} onChange={(v) => setMeasure({ numerador: v })} issue={issueFor("numerador")} />
            <NumberField label="Denominador" value={draft.denominador} disabled={fieldsDisabled} onChange={(v) => setMeasure({ denominador: v })} issue={issueFor("denominador")} />
          </>
        ) : sheet.tipo === "puntaje" ? (
          <>
            <NumberField label="Puntaje" value={draft.numerador} disabled={fieldsDisabled} onChange={(v) => setMeasure({ numerador: v })} issue={issueFor("numerador") ?? issueFor("valor")} />
            <NumberField label="Número de respuestas o evaluados" value={draft.n} disabled={fieldsDisabled} onChange={(v) => setMeasure({ n: v })} issue={issueFor("n")} />
          </>
        ) : (
          <NumberField label="Valor" value={draft.numerador} disabled={fieldsDisabled} onChange={(v) => setMeasure({ numerador: v })} issue={issueFor("numerador") ?? issueFor("valor")} />
        )}
      </div>

      <div className="ia-live" aria-live="polite">
        <span>Valor calculado</span>
        <strong>{draft.noAplica ? (draft.noAplica === "no_aplica" ? "No aplica" : "Sin dato") : formatValue(indicator, value)}</strong>
        <small>
          {unitLabel(indicator)}
          {prev && prevValue !== null && ` · ${prev.period}: ${formatValue(indicator, prevValue)}`}
          {change !== null && !draft.noAplica && ` · ${change > 0 ? "+" : ""}${change.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`}
        </small>
        {sheet.tipo === "comparacion" && draft.numComparacion != null && draft.denComparacion ? (
          <small>
            Grupo de comparación: {formatValue(indicator, (draft.numComparacion / draft.denComparacion) * sheet.factor)}
          </small>
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
            {overThreshold && !draft.noAplica && <output>cambió más de {sheet.umbral} %</output>}
          </span>
          <textarea value={draft.justificacion} disabled={!can} onChange={(e) => set({ justificacion: e.target.value })} />
          {issueFor("justificacion") && <small className="ia-field-error">{issueFor("justificacion")!.message}</small>}
        </label>
      )}

      <div className="ia-evidence" data-error={issueFor("evidencias") ? true : undefined}>
        <p>
          Evidencias
          {sheet.evidencia?.obligatoria && <em className="ia-pill ia-pill--pending">Obligatoria</em>}
        </p>
        {draft.evidencias.length > 0 && (
          <ul>
            {draft.evidencias.map((ev, i) => (
              <li key={`${ev.nombre}-${i}`}>
                <Icon name={ev.url ? "external" : "document"} size={14} />
                <span>{ev.nombre}</span>
                {can && (
                  <button type="button" onClick={() => set({ evidencias: draft.evidencias.filter((_, j) => j !== i) })}>
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
              disabled={!url.trim()}
              onClick={() => {
                set({ evidencias: [...draft.evidencias, { nombre: url.trim(), url: url.trim() }] });
                setUrl("");
              }}
            >
              Añadir enlace
            </button>
            <label className="button-ghost ia-file">
              <Icon name="upload" size={14} />
              Adjuntar archivo
              <input
                type="file"
                accept=".pdf,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (!FILE_TYPES.test(file.name)) return setFileError("Solo PDF, Excel o imagen.");
                  if (file.size > MAX_FILE) return setFileError("El archivo pasa de 10 MB.");
                  setFileError("");
                  set({ evidencias: [...draft.evidencias, { nombre: file.name }] });
                }}
              />
            </label>
          </div>
        )}
        {(fileError || issueFor("evidencias")) && <small className="ia-field-error">{fileError || issueFor("evidencias")!.message}</small>}
      </div>

      {issues.filter((i) => i.level === "alerta").map((i) => (
        <p key={i.code} className="ia-warning">
          <Icon name="alert" size={14} />
          {i.message}
        </p>
      ))}

      {can ? (
        <div className="ia-actions">
          {saved && (
            <span className="ia-saved" role="status">
              <Icon name="check" size={14} /> Guardado en borrador
            </span>
          )}
          <button
            type="button"
            className="button-primary"
            onClick={() => {
              actions.save(row.id, draft);
              setSaved(true);
            }}
          >
            Guardar
          </button>
        </div>
      ) : (
        <p className="ia-muted">{STATE_LABEL[row.estado]}: este registro ya no se edita desde el programa.</p>
      )}

      <History record={row.id} log={state.log} />
    </aside>
  );
}
