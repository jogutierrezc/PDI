/* =============================================================================
   Periodo · Planeación Institucional (sobre la base).

   1. Abrir un periodo: código, cortes por nivel y versión del catálogo. La
      vista previa muestra qué le toca a cada programa antes de confirmar;
      quitar o agregar pide justificación y queda escrito.
   2. Con el periodo abierto: sus asignaciones, que se pueden quitar o
      agregar con justificación, y la carga de valores precargados.
   ========================================================================== */

import { PeriodSheet } from "./PeriodSheet";
import type { WorkMode } from "./view-mode";
import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { downloadBlob } from "../../admin/traslado/transfer";
import {
  useAddAssignment,
  useAssignmentPreview,
  useClosePeriod,
  useLoadPreloaded,
  useOpenPeriod,
  usePeriodAssignments,
  usePeriods,
  usePrograms,
  usePublishedVersions,
  useSetAssignment,
  useVersionIndicators,
} from "../data/period-db";
import type { Assignment, Candidate, Change, Period, PreloadResult, ProgramOption } from "../data/period-db";
import { parsePreloadCsv, parsePreloadWorkbook, preloadTemplate } from "../import/preloaded";
import type { PreloadParse } from "../import/preloaded";

const keyOf = (indicatorId: string, programId: string, campusId: string | null) => `${indicatorId}|${programId}|${campusId ?? "-"}`;

/** El periodo que sigue al último: 2026-1 → 2026-2 → 2027-1. */
function nextCode(periods: Period[]): string {
  const last = periods[0]?.code;
  if (!last) {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() < 6 ? 1 : 2}`;
  }
  const [year, term] = last.split("-").map(Number);
  return term === 1 ? `${year}-2` : `${year + 1}-1`;
}

export function PeriodView({ mode = "sencillo" }: { mode?: WorkMode }) {
  const periods = usePeriods();
  const [selected, setSelected] = useState<string | null>(null);
  const list = periods.data ?? [];
  const current = list.find((p) => p.id === selected) ?? list.find((p) => p.state === "abierto") ?? null;

  return (
    <>
      {periods.error && (
        <p className="ia-error" role="alert">
          <Icon name="alert" size={15} />
          {periods.error.message}
        </p>
      )}

      {list.length > 0 && (
        <section className="admin-card ia-versions" aria-label="Periodos">
          <div className="ia-versions__list" role="group" aria-label="Periodo">
            {list.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === current?.id} onClick={() => setSelected(p.id)}>
                {p.code}
                <em className={`ia-pill ${p.state === "abierto" ? "ia-pill--done" : ""}`}>{p.state === "abierto" ? "Abierto" : "Cerrado"}</em>
              </button>
            ))}
          </div>
        </section>
      )}

      {current && <PeriodDetail key={current.id} period={current} mode={mode} />}

      {periods.data && <OpenPeriod suggested={nextCode(list)} onOpened={setSelected} />}
    </>
  );
}

/* --- Abrir un periodo ----------------------------------------------------------------- */

function OpenPeriod({ suggested, onOpened }: { suggested: string; onOpened: (id: string) => void }) {
  const versions = usePublishedVersions();
  const [code, setCode] = useState(suggested);
  const [cutoffs, setCutoffs] = useState<[string, string, string]>(["", "", ""]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [asked, setAsked] = useState<{ code: string; versionId: string } | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const open = useOpenPeriod();
  const version = versionId ?? versions.data?.[0]?.id ?? null;
  const preview = useAssignmentPreview(asked?.code ?? null, asked?.versionId ?? null);

  const removed = new Set(changes.filter((c) => c.action === "quitar").map((c) => keyOf(c.indicator_id, c.program_id, c.campus_id)));
  const added = changes.filter((c) => c.action === "agregar");
  const total = (preview.data?.length ?? 0) - removed.size + added.length;
  const missingWhy = changes.some((c) => !c.justification.trim());
  const cutoffsOk = cutoffs.every(Boolean) && cutoffs[0] <= cutoffs[1] && cutoffs[1] <= cutoffs[2];

  async function confirm() {
    if (!asked) return;
    setError("");
    try {
      const r = await open.mutateAsync({ code: asked.code, cutoffs, versionId: asked.versionId, changes });
      setDone(`Periodo ${asked.code} abierto: ${r.active} asignaciones activas${r.removed ? `, ${r.removed} quitadas` : ""}${r.added ? `, ${r.added} agregadas a mano` : ""}.`);
      setAsked(null);
      setChanges([]);
      onOpened(r.periodId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el periodo.");
    }
  }

  return (
    <section className="admin-card ia-period" aria-labelledby="abrir-periodo">
      <div className="ia-period__head">
        <div>
          <h2 id="abrir-periodo">Abrir un periodo</h2>
          <p>Primero se ve qué le toca a cada programa; nada se crea hasta confirmar.</p>
        </div>
      </div>

      <div className="admin-form__grid">
        <label className="admin-field">
          <span>Periodo</span>
          <input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="2026-2" pattern="[0-9]{4}-[12]" />
        </label>
        <label className="admin-field">
          <span>Versión del catálogo</span>
          <select value={version ?? ""} onChange={(e) => setVersionId(e.target.value || null)}>
            {(versions.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                Versión {v.number}
              </option>
            ))}
            {versions.data?.length === 0 && <option value="">No hay versión publicada</option>}
          </select>
        </label>
        {(["Cierre para programas", "Cierre para decanaturas", "Cierre para vicerrectorías"] as const).map((label, i) => (
          <label key={label} className="admin-field">
            <span>{label}</span>
            <input
              type="date"
              value={cutoffs[i]}
              onChange={(e) => setCutoffs((c) => c.map((v, j) => (j === i ? e.target.value : v)) as [string, string, string])}
            />
          </label>
        ))}
      </div>

      <ul className="ia-rules">
        <li>
          <Icon name="check" size={14} /> Solo indicadores oficiales con la ficha completa de la versión publicada. Los sugeridos nunca.
        </li>
        <li>
          <Icon name="check" size={14} /> Por nivel de formación y modalidad del programa; por sede cuando el indicador se reporta por sede.
        </li>
        <li>
          <Icon name="check" size={14} /> Los anuales solo en el segundo semestre.
        </li>
      </ul>

      <div className="ia-actions">
        <button
          type="button"
          className="button-secondary"
          disabled={!version || !/^\d{4}-[12]$/.test(code)}
          onClick={() => {
            setAsked({ code, versionId: version! });
            setChanges([]);
            setDone("");
          }}
        >
          Ver las asignaciones de {code || "…"}
        </button>
      </div>

      {preview.error && <p className="ia-error">{preview.error.message}</p>}
      {asked && preview.isPending && <p className="ia-muted">Calculando…</p>}

      {asked && preview.data && (
        <>
          <PreviewList
            rows={preview.data}
            removed={removed}
            changes={changes}
            onRemove={(c, label) => setChanges((all) => [...all, { action: "quitar", indicator_id: c.indicator_id, program_id: c.program_id, campus_id: c.campus_id, justification: "", label }])}
            onKeep={(c) => setChanges((all) => all.filter((x) => !(x.action === "quitar" && keyOf(x.indicator_id, x.program_id, x.campus_id) === keyOf(c.indicator_id, c.program_id, c.campus_id))))}
            onWhy={(index, why) => setChanges((all) => all.map((x, i) => (i === index ? { ...x, justification: why } : x)))}
          />

          <AddForm
            versionId={asked.versionId}
            onAdd={(indicatorId, programId, campusId, reason, label) =>
              setChanges((all) => [...all, { action: "agregar", indicator_id: indicatorId, program_id: programId, campus_id: campusId, justification: reason, label }])
            }
          />

          {added.length > 0 && (
            <ul className="ia-added">
              {added.map((c) => (
                <li key={keyOf(c.indicator_id, c.program_id, c.campus_id)}>
                  <strong>Se agrega:</strong> {c.label} — {c.justification}
                  <button type="button" className="ia-link" onClick={() => setChanges((all) => all.filter((x) => x !== c))}>
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="ia-publish">
            <div>
              <h2>
                {total} asignaciones para {asked.code}
              </h2>
              <p>
                {preview.data.length} por reglas{removed.size ? `, ${removed.size} quitadas` : ""}
                {added.length ? `, ${added.length} agregadas a mano` : ""}. Cada una crea un registro en borrador para el programa.
              </p>
              {!cutoffsOk && <p className="ia-warning">Ponga las tres fechas de corte en orden: programas, decanaturas, vicerrectorías.</p>}
              {missingWhy && <p className="ia-warning">Cada asignación que se quita o se agrega necesita su justificación.</p>}
              {error && <p className="ia-error">{error}</p>}
            </div>
            <button type="button" className="button-primary" disabled={!cutoffsOk || missingWhy || open.isPending} onClick={() => void confirm()}>
              {open.isPending ? "Abriendo…" : `Abrir ${asked.code}`}
            </button>
          </div>
        </>
      )}

      {done && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={15} /> {done}
        </p>
      )}
    </section>
  );
}

function PreviewList({
  rows,
  removed,
  changes,
  onRemove,
  onKeep,
  onWhy,
}: {
  rows: Candidate[];
  removed: Set<string>;
  changes: Change[];
  onRemove: (c: Candidate, label: string) => void;
  onKeep: (c: Candidate) => void;
  onWhy: (index: number, why: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const programs = useMemo(() => {
    const map = new Map<string, { name: string; faculty: string; degree: string; rows: Candidate[] }>();
    for (const r of rows) {
      const entry = map.get(r.program_id) ?? { name: r.program_name, faculty: r.faculty_name ?? "Sin facultad", degree: r.degree_level, rows: [] };
      entry.rows.push(r);
      map.set(r.program_id, entry);
    }
    return [...map.entries()].sort((a, b) => a[1].faculty.localeCompare(b[1].faculty, "es") || a[1].name.localeCompare(b[1].name, "es"));
  }, [rows]);

  if (rows.length === 0) return <p className="ia-empty">Ninguna asignación sale de las reglas: revise las fichas del piloto y la oferta por sede.</p>;

  return (
    <ul className="ia-programs">
      {programs.map(([id, p]) => {
        const kept = p.rows.filter((r) => !removed.has(keyOf(r.indicator_id, r.program_id, r.campus_id))).length;
        const expanded = open === id;
        return (
          <li key={id}>
            <button type="button" className="ia-programs__row" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : id)}>
              <span>
                <strong>{p.name}</strong>
                <small>
                  {p.faculty} · {p.degree}
                </small>
              </span>
              <span className="ia-programs__count">
                {kept} de {p.rows.length}
              </span>
              <Chevron />
            </button>
            {expanded && (
              <table className="ia-table">
                <thead>
                  <tr>
                    <th scope="col">Indicador</th>
                    <th scope="col">Sede</th>
                    <th scope="col">
                      <span className="sr-only">Quitar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map((r) => {
                    const key = keyOf(r.indicator_id, r.program_id, r.campus_id);
                    const index = changes.findIndex((c) => c.action === "quitar" && keyOf(c.indicator_id, c.program_id, c.campus_id) === key);
                    return (
                      <tr key={key} data-out={index >= 0 || undefined}>
                        <td>
                          <span className="ia-code">{r.indicator_code}</span> {r.indicator_name}
                        </td>
                        <td>{r.campus_name ?? "Todas (por programa)"}</td>
                        <td>
                          {index >= 0 ? (
                            <div className="ia-exclude">
                              <input
                                aria-label={`Por qué se quita ${r.indicator_code}`}
                                placeholder="Por qué se quita (obligatorio)"
                                value={changes[index].justification}
                                onChange={(e) => onWhy(index, e.target.value)}
                              />
                              <button type="button" className="button-ghost" onClick={() => onKeep(r)}>
                                Mantener
                              </button>
                            </div>
                          ) : (
                            <button type="button" className="button-ghost" onClick={() => onRemove(r, `${r.indicator_code} · ${p.name}${r.campus_name ? ` · ${r.campus_name}` : ""}`)}>
                              Quitar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Chevron() {
  return (
    <svg className="ia-chevron" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* --- Agregar una asignación a mano ------------------------------------------------------ */

function AddForm({
  versionId,
  onAdd,
}: {
  versionId: string;
  onAdd: (indicatorId: string, programId: string, campusId: string | null, reason: string, label: string) => void | Promise<void>;
}) {
  const indicators = useVersionIndicators(versionId);
  const programs = usePrograms();
  const [indicatorId, setIndicatorId] = useState("");
  const [programId, setProgramId] = useState("");
  const [campusId, setCampusId] = useState("");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const indicator = indicators.data?.find((i) => i.id === indicatorId);
  const program: ProgramOption | undefined = programs.data?.find((p) => p.id === programId);
  const bySite = indicator?.report_level === "programa_sede";
  const ready = indicatorId && programId && (!bySite || campusId) && reason.trim();

  if (!open) {
    return (
      <button type="button" className="button-ghost ia-add-toggle" onClick={() => setOpen(true)}>
        + Agregar una asignación a mano
      </button>
    );
  }

  return (
    <div className="ia-add">
      <label className="admin-field">
        <span>Indicador</span>
        <select value={indicatorId} onChange={(e) => setIndicatorId(e.target.value)}>
          <option value="">Elija</option>
          {(indicators.data ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.code} · {i.name}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-field">
        <span>Programa</span>
        <select
          value={programId}
          onChange={(e) => {
            setProgramId(e.target.value);
            setCampusId("");
          }}
        >
          <option value="">Elija</option>
          {(programs.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {bySite && (
        <label className="admin-field">
          <span>Sede</span>
          <select value={campusId} onChange={(e) => setCampusId(e.target.value)}>
            <option value="">Elija</option>
            {(program?.campuses ?? []).map(({ campus }) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="admin-field admin-field--wide">
        <span>Justificación</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por qué se agrega (obligatorio)" />
      </label>
      <div className="ia-actions admin-field--wide">
        <button type="button" className="button-ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={!ready}
          onClick={() => {
            const campus = program?.campuses.find((c) => c.campus.id === campusId)?.campus.name;
            void onAdd(indicatorId, programId, bySite ? campusId : null, reason.trim(), `${indicator?.code} · ${program?.name}${campus ? ` · ${campus}` : ""}`);
            setIndicatorId("");
            setProgramId("");
            setCampusId("");
            setReason("");
            setOpen(false);
          }}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

/* --- Un periodo ya abierto ---------------------------------------------------------------- */

function PeriodDetail({ period, mode }: { period: Period; mode: WorkMode }) {
  const assignments = usePeriodAssignments(period.id);
  const close = useClosePeriod();
  const add = useAddAssignment();
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const rows = assignments.data ?? [];
  const active = rows.filter((a) => a.active);
  const isOpen = period.state === "abierto";

  const byProgram = useMemo(() => {
    const map = new Map<string, { name: string; faculty: string; rows: Assignment[] }>();
    for (const a of rows) {
      const entry = map.get(a.program_id) ?? { name: a.program.name, faculty: a.program.parent?.name ?? "Sin facultad", rows: [] };
      entry.rows.push(a);
      map.set(a.program_id, entry);
    }
    return [...map.entries()].sort((x, y) => x[1].faculty.localeCompare(y[1].faculty, "es") || x[1].name.localeCompare(y[1].name, "es"));
  }, [rows]);

  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long" });

  return (
    <>
      <section className="admin-card ia-period">
        <div className="ia-period__head">
          <div>
            <h2>Periodo {period.code}</h2>
            <p>
              Versión {period.version?.number ?? "?"} del catálogo · cierres: programas el {fmt(period.cutoff_program)}, decanaturas el{" "}
              {fmt(period.cutoff_faculty)}, vicerrectorías el {fmt(period.cutoff_vice)}.
            </p>
          </div>
          <span className={`ia-pill ${isOpen ? "ia-pill--done" : ""}`}>{isOpen ? "Abierto" : "Cerrado"}</span>
        </div>
        <dl className="ia-counts">
          <div>
            <dt>Asignaciones activas</dt>
            <dd>{active.length}</dd>
          </div>
          <div>
            <dt>Quitadas</dt>
            <dd>{rows.length - active.length}</dd>
          </div>
          <div>
            <dt>Agregadas a mano</dt>
            <dd>{rows.filter((a) => a.manual).length}</dd>
          </div>
          <div>
            <dt>Programas</dt>
            <dd>{byProgram.length}</dd>
          </div>
        </dl>

        {isOpen && (
          <div className="ia-actions">
            {confirmClose ? (
              <span className="ia-publish__confirm">
                ¿Cerrar {period.code}? Ya no se podrá cargar ni cambiar asignaciones.
                <button type="button" className="button-primary" onClick={() => void close.mutateAsync(period.id).catch((e: Error) => setError(e.message))}>
                  Sí, cerrar
                </button>
                <button type="button" className="button-ghost" onClick={() => setConfirmClose(false)}>
                  Cancelar
                </button>
              </span>
            ) : (
              <button type="button" className="button-ghost" onClick={() => setConfirmClose(true)}>
                Cerrar el periodo
              </button>
            )}
          </div>
        )}
        {error && <p className="ia-error">{error}</p>}
      </section>

      {mode === "hoja" ? (
        <PeriodSheet period={period} assignments={rows} />
      ) : (
      <section className="admin-card" aria-labelledby="asignaciones-titulo">
        <div className="admin-card__head">
          <div>
            <h2 id="asignaciones-titulo">Asignaciones</h2>
            <p className="ia-muted">Abra un programa para ver o cambiar lo que reporta. Todo cambio necesita su justificación.</p>
          </div>
        </div>
        {assignments.isPending && <p className="ia-muted">Cargando…</p>}
        <ul className="ia-programs">
          {byProgram.map(([id, p]) => (
            <ProgramAssignments key={id} name={p.name} faculty={p.faculty} rows={p.rows} editable={isOpen} />
          ))}
        </ul>
        {isOpen && (
          <AddForm
            versionId={period.catalog_version_id}
            onAdd={(indicatorId, programId, campusId, reason) =>
              add.mutateAsync({ periodId: period.id, indicatorId, programId, campusId, reason }).catch((e: Error) => setError(e.message))
            }
          />
        )}
      </section>
      )}

      {isOpen && <Preload period={period} assignments={active} />}
    </>
  );
}

function ProgramAssignments({ name, faculty, rows, editable }: { name: string; faculty: string; rows: Assignment[]; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const set = useSetAssignment();
  const sorted = [...rows].sort((a, b) => a.indicator.code.localeCompare(b.indicator.code) || (a.campus?.name ?? "").localeCompare(b.campus?.name ?? ""));

  async function toggle(a: Assignment) {
    setError("");
    try {
      await set.mutateAsync({ id: a.id, active: !a.active, reason });
      setEditing(null);
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar la asignación.");
    }
  }

  return (
    <li>
      <button type="button" className="ia-programs__row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          <strong>{name}</strong>
          <small>{faculty}</small>
        </span>
        <span className="ia-programs__count">{rows.filter((a) => a.active).length} activas</span>
        <Chevron />
      </button>
      {open && (
        <>
          <table className="ia-table">
            <thead>
              <tr>
                <th scope="col">Indicador</th>
                <th scope="col">Sede</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Cambiar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id} data-out={!a.active || undefined}>
                  <td>
                    <span className="ia-code">{a.indicator.code}</span> {a.indicator.name}
                    {a.manual && <em className="ia-pill ia-pill--active"> Manual</em>}
                    {a.justification && <small className="ia-why">{a.justification}</small>}
                  </td>
                  <td>{a.campus?.name ?? "Por programa"}</td>
                  <td>{a.active ? a.record?.[0]?.state ?? "sin registro" : "Quitada"}</td>
                  <td>
                    {editable &&
                      (editing === a.id ? (
                        <div className="ia-exclude">
                          <input aria-label="Justificación" placeholder="Justificación (obligatoria)" value={reason} onChange={(e) => setReason(e.target.value)} />
                          <button type="button" className="button-secondary" disabled={!reason.trim() || set.isPending} onClick={() => void toggle(a)}>
                            {a.active ? "Quitar" : "Devolver"}
                          </button>
                          <button type="button" className="button-ghost" onClick={() => setEditing(null)}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => {
                            setEditing(a.id);
                            setReason("");
                          }}
                        >
                          {a.active ? "Quitar" : "Devolver"}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {error && <p className="ia-error">{error}</p>}
        </>
      )}
    </li>
  );
}

/* --- Valores precargados ------------------------------------------------------------------ */

function Preload({ period, assignments }: { period: Period; assignments: Assignment[] }) {
  const load = useLoadPreloaded();
  const [parsed, setParsed] = useState<(PreloadParse & { fileName: string }) | null>(null);
  const [result, setResult] = useState<PreloadResult | null>(null);
  const [error, setError] = useState("");
  const preloaded = assignments.filter((a) => a.indicator.capture_mode === "precargado");

  function template() {
    const csv = preloadTemplate(
      preloaded
        .map((a) => ({
          indicator: a.indicator.code,
          snies: a.program.snies_code ?? a.program.code,
          program: a.program.name,
          campus: a.campus?.name ?? "",
        }))
        .sort((x, y) => x.indicator.localeCompare(y.indicator) || x.program.localeCompare(y.program, "es")),
    );
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `precargados-${period.code}.csv`);
  }

  async function read(file: File | undefined) {
    if (!file) return;
    setError("");
    setResult(null);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { default: ExcelJS } = await import("exceljs");
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(await file.arrayBuffer());
        setParsed({ ...parsePreloadWorkbook(book), fileName: file.name });
      } else {
        setParsed({ ...parsePreloadCsv(await file.text()), fileName: file.name });
      }
    } catch (cause) {
      setError(cause instanceof Error ? `No se pudo leer el archivo: ${cause.message}` : "No se pudo leer el archivo.");
    }
  }

  async function send() {
    if (!parsed) return;
    setError("");
    try {
      setResult(await load.mutateAsync({ periodId: period.id, items: parsed.items, fileName: parsed.fileName }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar.");
    }
  }

  const allErrors = [...(parsed?.errors ?? []), ...(result?.errors ?? [])].sort((a, b) => a.row - b.row);

  return (
    <section className="admin-card" aria-labelledby="precargados-titulo">
      <div className="admin-card__head">
        <div>
          <h2 id="precargados-titulo">Valores precargados</h2>
          <p className="ia-muted">
            {preloaded.length} {preloaded.length === 1 ? "registro" : "registros"} de indicadores precargados en {period.code}. Llegan de la fuente institucional; el
            programa los confirma o declara la discrepancia. Un registro ya enviado no se sobrescribe.
          </p>
        </div>
        <div className="ia-actions">
          <button type="button" className="button-ghost" disabled={preloaded.length === 0} onClick={template}>
            <Icon name="download" size={15} />
            Plantilla CSV del periodo
          </button>
          <label className="button-secondary ia-file">
            <Icon name="upload" size={15} />
            Cargar CSV o Excel
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {parsed && !result && (
        <div className="ia-publish">
          <div>
            <h2>{parsed.fileName}</h2>
            <p>
              {parsed.items.length} filas listas para cargar
              {parsed.errors.length ? `, ${parsed.errors.length} con errores de lectura` : ""}.
            </p>
          </div>
          <button type="button" className="button-primary" disabled={parsed.items.length === 0 || load.isPending} onClick={() => void send()}>
            {load.isPending ? "Cargando…" : `Cargar ${parsed.items.length} filas`}
          </button>
        </div>
      )}

      {result && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={15} /> Se cargaron {result.loaded} valores
          {result.errors.length ? `; ${result.errors.length} filas no se cargaron (abajo, con su motivo)` : ""}.
        </p>
      )}

      {allErrors.length > 0 && (
        <div className="ia-import__table">
          <table className="ia-table">
            <thead>
              <tr>
                <th scope="col">Fila</th>
                <th scope="col">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {allErrors.map((e, i) => (
                <tr key={`${e.row}-${i}`}>
                  <td>{e.row}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="ia-error">{error}</p>}
    </section>
  );
}
