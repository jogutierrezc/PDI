/* =============================================================================
   Revisión · decanatura y vicerrectorías.

   Una bandeja por programa. Cada registro trae su cifra con la cuenta a la
   vista, la justificación y la evidencia. Aprobar es un clic; devolver pide
   un motivo de la lista y un comentario. La decanatura puede aprobar el
   paquete completo de un programa; la vicerrectoría solo ve su función y
   siempre devuelve a la decanatura.

   Nadie aprueba ni valida lo que capturó.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "../../../components/ui/Icon";
import { campusName, functionById, indicatorByCode, programBySlug } from "../data/catalog";
import { formatValue, unitLabel } from "../data/lens";
import { computedValue } from "../data/validate";
import type { RecordState } from "../data/types";
import { History, StatePill } from "./parts";
import { RETURN_REASONS, actions, functionOf, me, useImpactStore } from "./store";
import type { RecordRow, ReturnReason } from "./store";

export function ReviewView() {
  const state = useImpactStore();
  const person = me(state);
  const isDean = person.role === "decano";

  const queue = useMemo(
    () =>
      Object.values(state.records).filter((r) =>
        isDean
          ? programBySlug.get(r.program)?.faculty === person.scope && (r.estado === "enviado" || r.estado === "devuelto_decanatura")
          : functionOf(r.codigo) === person.scope && r.estado === "aprobado_decanatura",
      ),
    [state.records, isDean, person.scope],
  );
  const done = useMemo(
    () =>
      Object.values(state.records).filter((r) =>
        isDean
          ? programBySlug.get(r.program)?.faculty === person.scope && (r.estado === "aprobado_decanatura" || r.estado === "validado")
          : functionOf(r.codigo) === person.scope && r.estado === "validado",
      ).length,
    [state.records, isDean, person.scope],
  );

  const byProgram = new Map<string, RecordRow[]>();
  for (const r of queue) byProgram.set(r.program, [...(byProgram.get(r.program) ?? []), r]);

  return (
    <>
      <section className="admin-card ia-board">
        <div className="ia-board__who">
          <h2>{person.name}</h2>
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
        </dl>
      </section>

      {queue.length === 0 && (
        <section className="admin-card ia-empty-state">
          <h2>Nada pendiente</h2>
          <p>
            {isDean
              ? "Cuando un programa envíe su paquete, aparecerá aquí. Para probarlo, cambie a «Dirección de Medicina» y envíe su reporte."
              : "Cuando una decanatura apruebe registros de su función, aparecerán aquí."}
          </p>
        </section>
      )}

      {[...byProgram.entries()].map(([slug, rows]) => (
        <ProgramPackage key={slug} slug={slug} rows={rows} isDean={isDean} personId={person.id} />
      ))}
    </>
  );
}

function ProgramPackage({ slug, rows, isDean, personId }: { slug: string; rows: RecordRow[]; isDean: boolean; personId: string }) {
  const program = programBySlug.get(slug)!;
  const fresh = rows.filter((r) => r.estado === "enviado" || r.estado === "aprobado_decanatura");
  const mine = rows.filter((r) => r.capturedBy === personId);
  const approveTo: RecordState = isDean ? "aprobado_decanatura" : "validado";
  const ids = fresh.filter((r) => r.capturedBy !== personId).map((r) => r.id);

  return (
    <section className="admin-card ia-package">
      <div className="admin-card__head">
        <div>
          <h2>{program.name}</h2>
          <p className="ia-muted">
            {rows.length} {rows.length === 1 ? "registro" : "registros"} · {program.campus.map((c) => campusName(c)).join(", ")}
          </p>
        </div>
        {isDean && ids.length > 1 && (
          <button type="button" className="button-secondary" onClick={() => actions.move(ids, approveTo)}>
            <Icon name="check" size={15} />
            Aprobar el paquete ({ids.length})
          </button>
        )}
      </div>
      {mine.length > 0 && (
        <p className="ia-warning">
          <Icon name="lock" size={14} />
          {mine.length} de estos registros los capturó usted: otra persona debe aprobarlos.
        </p>
      )}
      <ul className="ia-reviews">
        {rows.map((r) => (
          <ReviewItem key={r.id} row={r} isDean={isDean} personId={personId} />
        ))}
      </ul>
    </section>
  );
}

function ReviewItem({ row, isDean, personId }: { row: RecordRow; isDean: boolean; personId: string }) {
  const state = useImpactStore();
  const indicator = indicatorByCode.get(row.codigo)!;
  const sheet = indicator.ficha!;
  const fn = functionById[indicator.funcion];
  const [returning, setReturning] = useState(false);
  const [motivo, setMotivo] = useState<ReturnReason | "">("");
  const [comentario, setComentario] = useState("");
  const own = row.capturedBy === personId;
  const value = computedValue(indicator, row.draft);
  const backFromVice = row.estado === "devuelto_decanatura";
  const reason = row.devolucion ? RETURN_REASONS.find(([k]) => k === row.devolucion!.motivo)?.[1] : null;

  const approveTo: RecordState = isDean ? "aprobado_decanatura" : "validado";
  const returnTo: RecordState = isDean ? "devuelto_programa" : "devuelto_decanatura";

  return (
    <li className="ia-review" style={{ "--tone": fn.tone } as CSSProperties}>
      <div className="ia-review__main">
        <div className="ia-review__title">
          <span className="ia-code">{row.codigo}</span>
          <strong>{indicator.nombre}</strong>
          <small>
            {campusName(row.campus)} · {fn.name}
          </small>
        </div>

        <div className="ia-review__figure">
          <strong>{row.draft.noAplica ? (row.draft.noAplica === "no_aplica" ? "No aplica" : "Sin dato") : formatValue(indicator, value)}</strong>
          <small>
            {unitLabel(indicator)}
            {row.draft.denominador !== null && row.draft.numerador !== null && sheet.denominador && ` · ${row.draft.numerador.toLocaleString("es-CO")} ÷ ${row.draft.denominador.toLocaleString("es-CO")}`}
          </small>
        </div>

        <StatePill estado={row.estado} />
      </div>

      {(row.draft.justificacion || row.draft.evidencias.length > 0 || backFromVice) && (
        <div className="ia-review__notes">
          {backFromVice && reason && (
            <p className="ia-returned">
              <Icon name="alert" size={14} />
              La vicerrectoría lo devolvió: {reason}. {row.devolucion?.comentario}
            </p>
          )}
          {row.draft.justificacion && (
            <p>
              <strong>Justificación:</strong> {row.draft.justificacion}
            </p>
          )}
          {row.draft.evidencias.length > 0 && (
            <p>
              <strong>Evidencia:</strong> {row.draft.evidencias.map((e) => e.nombre).join(" · ")}
            </p>
          )}
        </div>
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
            <button
              type="button"
              className="button-primary"
              disabled={!motivo || !comentario.trim()}
              onClick={() => actions.move([row.id], returnTo, { motivo: motivo as ReturnReason, comentario: comentario.trim() })}
            >
              Devolver {isDean ? "al programa" : "a la decanatura"}
            </button>
          </div>
        </div>
      ) : (
        <div className="ia-actions">
          {own ? (
            <span className="ia-muted">
              <Icon name="lock" size={13} /> Lo capturó usted: no puede aprobarlo.
            </span>
          ) : (
            <>
              <button type="button" className="button-ghost" onClick={() => setReturning(true)}>
                Devolver
              </button>
              <button type="button" className="button-primary" onClick={() => actions.move([row.id], approveTo)}>
                <Icon name="check" size={15} />
                {isDean ? "Aprobar" : "Validar"}
              </button>
            </>
          )}
        </div>
      )}

      <History record={row.id} log={state.log} />
    </li>
  );
}
