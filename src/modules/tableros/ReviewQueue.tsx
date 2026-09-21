/* =============================================================================
   Mis Tableros · la cola de publicación.

   Lo que ve Planeación cuando una unidad pide sacar un tablero al portal.

   Las comprobaciones no se recalculan aquí: se leen tal como quedaron escritas
   al pedir la publicación. Si la unidad tocó el tablero después, lo que se
   aprueba es lo que hay hoy, pero lo que se revisó es lo que se revisó, y el
   historial tiene que poder decirlo.
   ========================================================================== */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { Panel, SaveState, StageEmpty } from "../admin/udes-en-cifras/ui";
import { VISIBILITY, boardPath } from "./model";
import type { Board, BoardReview, Unit } from "./model";
import { useResolveReview, useReviews } from "./store";

export function ReviewQueue({ units, boards }: { units: Unit[]; boards: Board[] }) {
  const reviews = useReviews();
  const pending = (reviews.data ?? []).filter((r) => r.state === "pendiente");
  const settled = (reviews.data ?? []).filter((r) => r.state !== "pendiente").slice(0, 8);

  return (
    <div className="oda-stack">
      <Panel
        title="Solicitudes de publicación"
        description="Al pedirla, el sistema comprueba cuatro cosas y deja el resultado escrito. Quien aprueba lee un informe, no una casilla."
      >
        {reviews.isPending ? (
          <p className="admin-loading">Cargando las solicitudes…</p>
        ) : pending.length === 0 ? (
          <StageEmpty title="Nada esperando">
            Cuando una unidad pida sacar un tablero al portal, aparecerá aquí con lo que el sistema encontró.
          </StageEmpty>
        ) : (
          <ul className="tb-queue">
            {pending.map((review) => (
              <ReviewCard key={review.id} review={review} units={units} boards={boards} />
            ))}
          </ul>
        )}
      </Panel>

      {settled.length > 0 && (
        <Panel title="Resueltas" description="Las ocho últimas, con lo que se decidió.">
          <ul className="tb-list">
            {settled.map((review) => {
              const board = boards.find((b) => b.id === review.boardId);
              const unit = board ? units.find((u) => u.id === board.unitId) : undefined;
              return (
                <li key={review.id}>
                  <span className="tb-list__row tb-list__row--flat">
                    <span className="tb-list__main">
                      <strong>{board?.title ?? "Tablero borrado"}</strong>
                      <small>{unit?.name ?? ""}</small>
                    </span>
                    <span className="tb-list__see" data-level={review.state === "aprobada" ? "publico" : "unidad"}>
                      <Icon name={review.state === "aprobada" ? "check" : "alert"} size={14} />
                      {review.state === "aprobada" ? "Aprobada" : "Devuelta"}
                    </span>
                    <span className="tb-list__meta tb-list__when">{review.resolution || "—"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function ReviewCard({ review, units, boards }: { review: BoardReview; units: Unit[]; boards: Board[] }) {
  const resolve = useResolveReview();
  const [note, setNote] = useState("");
  const board = boards.find((b) => b.id === review.boardId);
  const unit = board ? units.find((u) => u.id === board.unitId) : undefined;
  const warnings = review.checks.filter((c) => !c.ok).length;

  if (!board || !unit) {
    return (
      <li className="tb-queue__card">
        <p className="tb-prose">Esta solicitud es de un tablero que ya no existe. Se puede ignorar.</p>
      </li>
    );
  }

  return (
    <li className="tb-queue__card">
      <div className="tb-queue__head">
        <div>
          <h3>{board.title}</h3>
          <p>
            {unit.name} · pedido {new Date(review.requestedAt).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}
          </p>
        </div>
        <span className="tb-list__see" data-level={review.target}>
          <Icon name="compass" size={14} />
          {VISIBILITY[review.target].label}
        </span>
      </div>

      {review.note && <p className="tb-prose tb-prose--aside">«{review.note}»</p>}

      <ul className="tb-checks">
        {review.checks.map((check) => (
          <li key={check.key} data-ok={check.ok || undefined}>
            <Icon name={check.ok ? "check" : "alert"} size={16} />
            <span>
              <strong>{check.label}</strong>
              {check.detail && <small>{check.detail}</small>}
            </span>
          </li>
        ))}
      </ul>

      {warnings > 0 && (
        <p className="tb-prose tb-prose--aside">
          {warnings} {warnings === 1 ? "aviso" : "avisos"}. Un aviso no impide publicar: lo pesa quien aprueba.
        </p>
      )}

      <label className="admin-field">
        <span>Nota de la resolución <small>opcional</small></span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué corregir, si se devuelve" />
      </label>

      <div className="tb-queue__actions">
        <SaveState pending={resolve.isPending} error={resolve.error} success={resolve.isSuccess} />
        <Link to={boardPath(unit.slug, board.slug)} className="button-secondary" target="_blank" rel="noreferrer">
          Verlo entero
        </Link>
        <button
          type="button"
          className="button-secondary"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ review, approve: false, resolution: note || "Devuelta sin notas" })}
        >
          Devolver con notas
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ review, approve: true, resolution: note || "Aprobada" })}
        >
          Aprobar y publicar
        </button>
      </div>
    </li>
  );
}
