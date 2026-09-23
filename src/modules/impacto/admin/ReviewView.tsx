/* =============================================================================
   Revisión · decanatura y vicerrectorías (sobre la base).

   Una bandeja por programa. Cada registro trae su cifra con la cuenta a la
   vista, la justificación, las observaciones y la evidencia. Aprobar es un
   clic; devolver pide un motivo de la lista y un comentario. La decanatura
   puede aprobar el paquete completo de un programa; la vicerrectoría solo ve
   su función y siempre devuelve a la decanatura.

   Nadie aprueba ni valida lo que capturó, guardó o envió: la pantalla lo
   avisa y la base (imp_review, 0071) lo impide.

   Quien es a la vez decanatura y vicerrectoría ve las dos bandejas, una por
   pestaña.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useAuth } from "../../../lib/auth";
import { FUNCTIONS, functionById } from "../data/catalog";
import { evidenceLink, indicatorOf, useEvidence, useRecordHistory } from "../data/capture-db";
import type { CaptureRow } from "../data/capture-db";
import { formatValue, unitLabel } from "../data/lens";
import { DEAN_PENDING, VICE_PENDING, isOwn, useReview, useReviewRows, useReviewScope } from "../data/review-db";
import type { ReviewAction, ReviewScope } from "../data/review-db";
import { StatePill } from "./parts";
import { DbHistory } from "./ReportView";
import { RETURN_REASONS } from "./store";
import type { ReturnReason } from "./store";

type Desk = "decanatura" | "vicerrectoria";

export function ReviewView() {
  const scope = useReviewScope();
  const rows = useReviewRows(scope.data);
  const { profile } = useAuth();
  const isDean = (scope.data?.deanPrograms.length ?? 0) > 0;
  const isVice = (scope.data?.functions.length ?? 0) > 0;
  const [desk, setDesk] = useState<Desk | null>(null);
  const current: Desk = desk ?? (isDean ? "decanatura" : "vicerrectoria");

  if (scope.isPending || (rows.isPending && rows.fetchStatus !== "idle")) return <p className="ia-muted">Cargando…</p>;
  if (scope.error || rows.error) {
    return (
      <p className="ia-error" role="alert">
        <Icon name="alert" size={15} />
        {(scope.error ?? rows.error)?.message}
      </p>
    );
  }
  if (!isDean && !isVice) {
    return (
      <section className="admin-card ia-empty-state">
        <h2>No tiene registros que revisar</h2>
        <p>La revisión es de las decanaturas y de las vicerrectorías. Planeación asigna esos roles en Usuarios y roles.</p>
      </section>
    );
  }

  const list = current === "decanatura" ? rows.data?.dean ?? [] : rows.data?.vice ?? [];

  return (
    <>
      {isDean && isVice && (
        <div className="ia-views" role="tablist" aria-label="Bandeja">
          {(["decanatura", "vicerrectoria"] as const).map((d) => (
            <button key={d} type="button" role="tab" aria-selected={current === d} className={current === d ? "is-active" : undefined} onClick={() => setDesk(d)}>
              {d === "decanatura" ? "Decanatura" : "Vicerrectoría"}
            </button>
          ))}
        </div>
      )}
      <ReviewDesk key={current} desk={current} rows={list} scope={scope.data!} me={profile?.id} />
    </>
  );
}

function ReviewDesk({ desk, rows, scope, me }: { desk: Desk; rows: CaptureRow[]; scope: ReviewScope; me: string | undefined }) {
  const isDean = desk === "decanatura";
  const pendingStates: readonly string[] = isDean ? DEAN_PENDING : VICE_PENDING;
  const queue = rows.filter((r) => pendingStates.includes(r.state));
  const done = rows.length - queue.length;

  const byProgram = useMemo(() => {
    const map = new Map<string, CaptureRow[]>();
    for (const r of queue) map.set(r.program_id, [...(map.get(r.program_id) ?? []), r]);
    return [...map.entries()].sort((a, b) => a[1][0].program_name.localeCompare(b[1][0].program_name, "es"));
  }, [queue]);

  const who = isDean
    ? scope.deanPrograms.length === 1
      ? `Decanatura · ${scope.deanPrograms[0].faculty ?? scope.deanPrograms[0].name}`
      : `Decanatura · ${[...new Set(scope.deanPrograms.map((p) => p.faculty ?? "Sin facultad"))].join(", ")}`
    : `Vicerrectoría · ${scope.functions.map((f) => functionById[f]?.name ?? f).join(", ")}`;

  return (
    <>
      <section className="admin-card ia-board">
        <div className="ia-board__who">
          <h2>{who}</h2>
          <p>
            {isDean
              ? "Revise lo que envían sus programas. Lo que apruebe pasa a la vicerrectoría de cada función."
              : "Valide los registros de su función que ya aprobó la decanatura. Si algo no está bien, vuelve a la decanatura."}
          </p>
        </div>
        <dl className="ia-counts">
          <div data-alert={queue.length > 0 || undefined}>
            <dt>Esperan su decisión</dt>
            <dd>{queue.length}</dd>
          </div>
          <div>
            <dt>{isDean ? "Aprobados" : "Validados"}</dt>
            <dd>{done}</dd>
          </div>
          <div>
            <dt>{isDean ? "Programas" : "Funciones"}</dt>
            <dd>{isDean ? scope.deanPrograms.length : scope.functions.length}</dd>
          </div>
        </dl>
      </section>

      {queue.length === 0 && (
        <section className="admin-card ia-empty-state">
          <h2>Nada pendiente</h2>
          <p>
            {isDean
              ? "Cuando un programa envíe su paquete, aparecerá aquí."
              : "Cuando una decanatura apruebe registros de su función, aparecerán aquí."}
          </p>
        </section>
      )}

      {byProgram.map(([id, list]) => (
        <ProgramPackage key={id} rows={list} isDean={isDean} me={me} />
      ))}
    </>
  );
}

function ProgramPackage({ rows, isDean, me }: { rows: CaptureRow[]; isDean: boolean; me: string | undefined }) {
  const review = useReview();
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const program = rows[0];
  const mine = rows.filter((r) => isOwn(r, me));
  // «Aprobar el paquete» es para lo que llegó sin observaciones: lo enviado, no lo que volvió de la vicerrectoría.
  const fresh = rows.filter((r) => (isDean ? r.state === "enviado" : r.state === "aprobado_decanatura") && !isOwn(r, me));
  const sites = [...new Set(rows.map((r) => r.campus_name).filter(Boolean))];

  async function approveAll() {
    setError("");
    setDone("");
    try {
      const n = await review.mutateAsync({ ids: fresh.map((r) => r.id), action: isDean ? "aprobar" : "validar" });
      setDone(`${isDean ? "Se aprobaron" : "Se validaron"} ${n} registros de ${program.program_name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar.");
    }
  }

  return (
    <section className="admin-card ia-package">
      <div className="admin-card__head">
        <div>
          <h2>{program.program_name}</h2>
          <p className="ia-muted">
            Periodo {program.period_code} · {rows.length} {rows.length === 1 ? "registro" : "registros"}
            {sites.length ? ` · ${sites.join(", ")}` : ""}
          </p>
        </div>
        {fresh.length > 1 && (
          <button type="button" className="button-secondary" disabled={review.isPending} onClick={() => void approveAll()}>
            <Icon name="check" size={15} />
            {isDean ? "Aprobar el paquete" : "Validar todo"} ({fresh.length})
          </button>
        )}
      </div>
      {mine.length > 0 && (
        <p className="ia-warning">
          <Icon name="lock" size={14} />
          {mine.length === 1 ? "Un registro lo capturó" : `${mine.length} de estos registros los capturó`} usted: otra persona debe
          {isDean ? " aprobarlos" : " validarlos"}.
        </p>
      )}
      {error && (
        <p className="ia-error" role="alert">
          <Icon name="alert" size={15} />
          {error}
        </p>
      )}
      {done && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={15} /> {done}
        </p>
      )}
      <ul className="ia-reviews">
        {rows.map((r) => (
          <ReviewItem key={r.id} row={r} isDean={isDean} own={isOwn(r, me)} />
        ))}
      </ul>
    </section>
  );
}

function ReviewItem({ row, isDean, own }: { row: CaptureRow; isDean: boolean; own: boolean }) {
  const review = useReview();
  const indicator = useMemo(() => indicatorOf(row), [row]);
  const fn = functionById[row.function_id] ?? FUNCTIONS[0];
  const [returning, setReturning] = useState(false);
  const [motivo, setMotivo] = useState<ReturnReason | "">("");
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");
  const backFromVice = row.state === "devuelto_decanatura";

  async function act(action: ReviewAction) {
    setError("");
    try {
      await review.mutateAsync(
        action === "devolver" ? { ids: [row.id], action, reason: motivo || null, comment: comentario.trim() } : { ids: [row.id], action },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar.");
    }
  }

  const value = row.no_data
    ? row.no_data === "no_aplica"
      ? "No aplica"
      : "Sin dato"
    : formatValue(indicator, row.value === null ? null : Number(row.value));
  const fraction =
    row.numerator !== null && row.denominator !== null && row.denominator_def
      ? `${Number(row.numerator).toLocaleString("es-CO")} ÷ ${Number(row.denominator).toLocaleString("es-CO")}`
      : row.n_responses !== null && row.calc_type === "puntaje"
        ? `n = ${row.n_responses}`
        : null;

  return (
    <li className="ia-review" style={{ "--tone": fn.tone } as CSSProperties}>
      <div className="ia-review__main">
        <div className="ia-review__title">
          <span className="ia-code">{row.code}</span>
          <strong>{row.name}</strong>
          <small>
            {row.campus_name ?? "Todas las sedes"} · {fn.name}
            {row.capture_mode === "precargado" &&
              (row.confirms_preloaded === false ? " · precargado con discrepancia" : row.confirms_preloaded ? " · precargado confirmado" : " · precargado")}
          </small>
        </div>

        <div className="ia-review__figure">
          <strong>{value}</strong>
          <small>
            {unitLabel(indicator)}
            {fraction && ` · ${fraction}`}
            {row.previous_period && row.previous_value !== null && ` · ${row.previous_period}: ${formatValue(indicator, Number(row.previous_value))}`}
          </small>
        </div>

        <StatePill estado={row.state} />
      </div>

      {(row.justification || row.observations || Number(row.evidence_count) > 0 || backFromVice) && (
        <div className="ia-review__notes">
          {backFromVice && <ViceReturn recordId={row.id} />}
          {row.justification && (
            <p>
              <strong>Justificación:</strong> {row.justification}
            </p>
          )}
          {row.observations && (
            <p>
              <strong>Observaciones:</strong> {row.observations}
            </p>
          )}
          {Number(row.evidence_count) > 0 && <EvidenceLinks recordId={row.id} />}
        </div>
      )}

      {error && (
        <p className="ia-error" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}

      {returning ? (
        <div className="ia-return">
          <label className="admin-field">
            <span>Motivo</span>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value as ReturnReason)}>
              <option value="">Elija un motivo</option>
              {RETURN_REASONS.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Comentario para {isDean ? "el programa" : "la decanatura"}</span>
            <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Qué hay que corregir" />
          </label>
          <div className="ia-actions">
            <button type="button" className="button-ghost" onClick={() => setReturning(false)}>
              Cancelar
            </button>
            <button type="button" className="button-primary" disabled={!motivo || !comentario.trim() || review.isPending} onClick={() => void act("devolver")}>
              Devolver {isDean ? "al programa" : "a la decanatura"}
            </button>
          </div>
        </div>
      ) : (
        <div className="ia-actions">
          {own ? (
            <span className="ia-muted">
              <Icon name="lock" size={13} /> Lo capturó usted: no puede {isDean ? "aprobarlo" : "validarlo"}.
            </span>
          ) : (
            <>
              <button type="button" className="button-ghost" onClick={() => setReturning(true)}>
                Devolver
              </button>
              <button type="button" className="button-primary" disabled={review.isPending} onClick={() => void act(isDean ? "aprobar" : "validar")}>
                <Icon name="check" size={15} />
                {isDean ? (backFromVice ? "Aprobar de nuevo" : "Aprobar") : "Validar"}
              </button>
            </>
          )}
        </div>
      )}

      <DbHistory recordId={row.id} />
    </li>
  );
}

/** Por qué lo devolvió la vicerrectoría: la última transición a devuelto_decanatura. */
function ViceReturn({ recordId }: { recordId: string }) {
  const history = useRecordHistory(recordId);
  const last = [...(history.data ?? [])].reverse().find((e) => e.kind === "transicion" && e.to_state === "devuelto_decanatura");
  if (!last) return null;
  const reason = RETURN_REASONS.find(([k]) => k === last.reason)?.[1] ?? last.reason;
  return (
    <p className="ia-returned">
      <Icon name="alert" size={14} />
      <span>
        La vicerrectoría lo devolvió{reason ? `: ${reason}` : ""}. {last.comment}
      </span>
    </p>
  );
}

function EvidenceLinks({ recordId }: { recordId: string }) {
  const evidence = useEvidence(recordId);
  const [error, setError] = useState("");
  return (
    <p className="ia-review__evidence">
      <strong>Evidencia:</strong>{" "}
      {(evidence.data ?? []).map((ev, i) => (
        <span key={ev.id}>
          {i > 0 && " · "}
          <button
            type="button"
            className="ia-link"
            onClick={() =>
              void evidenceLink(ev)
                .then((link) => link && window.open(link, "_blank", "noopener"))
                .catch(() => setError("No se pudo abrir la evidencia."))
            }
          >
            {ev.file_name ?? ev.url}
          </button>
        </span>
      ))}
      {error && <small className="ia-field-error"> {error}</small>}
    </p>
  );
}
