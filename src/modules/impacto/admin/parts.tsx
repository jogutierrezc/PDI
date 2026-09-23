/* =============================================================================
   Piezas comunes de la intranet de Impacto: el estado de un registro y su
   historial de transiciones.
   ========================================================================== */

import type { RecordState } from "../data/types";
import { PEOPLE, RETURN_REASONS, STATE_LABEL } from "./store";
import type { Transition } from "./store";

const TONE: Record<RecordState, string> = {
  borrador: "",
  enviado: "ia-pill--active",
  aprobado_decanatura: "ia-pill--active",
  validado: "ia-pill--done",
  devuelto_programa: "ia-pill--risk",
  devuelto_decanatura: "ia-pill--risk",
};

/** El estado siempre con palabras: el color solo acompaña. */
export function StatePill({ estado }: { estado: RecordState }) {
  return <em className={`ia-pill ${TONE[estado]}`}>{STATE_LABEL[estado]}</em>;
}

const who = (id: string) => PEOPLE.find((p) => p.id === id)?.name ?? (id.startsWith("dir-") ? `Dirección de ${id.slice(4)}` : id);

export function History({ record, log }: { record: string; log: Transition[] }) {
  const entries = log.filter((t) => t.record === record);
  return (
    <details className="ia-history">
      <summary>Historial ({entries.length})</summary>
      {entries.length === 0 ? (
        <p className="ia-muted">Sin transiciones todavía: el registro está en borrador desde que se abrió el periodo.</p>
      ) : (
        <ol>
          {entries.map((t, i) => (
            <li key={i}>
              <strong>
                {STATE_LABEL[t.from]} → {STATE_LABEL[t.to]}
              </strong>
              <span>
                {who(t.by)} · {new Date(t.at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
              </span>
              {t.motivo && (
                <span>
                  {RETURN_REASONS.find(([k]) => k === t.motivo)?.[1]}: {t.comentario}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="ia-muted">Lotes de importación de Excel que lo modificaron: ninguno (llega en la fase 6).</p>
    </details>
  );
}
