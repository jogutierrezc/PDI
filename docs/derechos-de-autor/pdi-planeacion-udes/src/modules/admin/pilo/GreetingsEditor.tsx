/* =============================================================================
   Intranet · Mr. Pilo · «Saludos del chat incrustado» (0173).

   La lista de saludos con que abre el chat del Pilo en otros portales
   (udes.edu.co). Sin cifras. Varían por hora del día y por azar, sin repetir el
   último. Cada uno se edita, se activa o se quita al momento.
   ========================================================================== */

import { useState } from "react";
import { GREETING_MAX } from "../../../components/pilo/greetings";
import type { GreetingMoment } from "../../../components/pilo/greetings";
import { greetingProblem, MOMENT_LABEL, MOMENT_ORDER, useChangeGreeting, useGreetingRows } from "./greetings";
import type { GreetingRow, GreetingSpace } from "./greetings";
import { Group, StatusMark, Switch } from "./ui";

function Row({ row, busy, onEdit, onRemove }: { row: GreetingRow; busy: boolean; onEdit: (patch: Partial<Pick<GreetingRow, "text" | "moment" | "active">>) => void; onRemove: () => void }) {
  const [text, setText] = useState(row.text);
  const problem = text === row.text ? "" : greetingProblem(text);
  return (
    <li className="pis-greet__row">
      <input
        type="text"
        className="pis-input"
        aria-label="Texto del saludo"
        value={text}
        maxLength={GREETING_MAX}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== row.text && !problem && onEdit({ text })}
        disabled={busy}
      />
      <select aria-label="Momento del día" value={row.moment} onChange={(e) => onEdit({ moment: e.target.value as GreetingMoment })} disabled={busy}>
        {MOMENT_ORDER.map((m) => (
          <option key={m} value={m}>
            {MOMENT_LABEL[m]}
          </option>
        ))}
      </select>
      <Switch on={row.active} label={`Usar el saludo «${row.text.slice(0, 40)}»`} onChange={(v) => onEdit({ active: v })} disabled={busy} />
      <button type="button" className="pis-link" onClick={onRemove} disabled={busy}>
        Quitar
      </button>
      {problem && (
        <p className="pis-error pis-greet__problem" role="alert">
          {problem}
        </p>
      )}
    </li>
  );
}

export function GreetingsEditor({ space }: { space: GreetingSpace }) {
  const rows = useGreetingRows(space);
  const change = useChangeGreeting(space);
  const [text, setText] = useState("");
  const [moment, setMoment] = useState<GreetingMoment>("cualquiera");
  const problem = text ? greetingProblem(text) : "";
  const missing = rows.data === null;

  return (
    <Group
      title="Saludos del chat incrustado"
      id={`pis-saludos-${space}`}
      aside={<small role="status">{missing ? <StatusMark tone="warn">Falta la migración 0173</StatusMark> : change.isPending ? "Guardando…" : "Cada cambio se guarda al momento"}</small>}
    >
      <p className="pis-lead">
        El chat de este Pilo en otros portales abre con uno de estos saludos: cambia con la hora del día y al azar, y no repite el último que vio la persona. No llevan números ni
        cifras. Si la lista queda vacía, usa el saludo único de siempre.
      </p>
      {missing ? (
        <p className="pis-warn">Falta aplicar la migración 0173 en la base.</p>
      ) : rows.isError ? (
        <p className="pis-error" role="alert">
          No se pudieron leer los saludos: {(rows.error as Error).message}
        </p>
      ) : rows.isPending ? (
        <p className="pis-small" role="status">
          Leyendo los saludos…
        </p>
      ) : (
        <>
          <ul className="pis-greet" aria-label="Saludos">
            {rows.data!.map((r) => (
              <Row
                key={`${r.id}:${r.text}:${r.moment}:${r.active}`}
                row={r}
                busy={change.isPending}
                onEdit={(patch) => change.mutate({ kind: "edit", id: r.id, patch })}
                onRemove={() => change.mutate({ kind: "remove", id: r.id })}
              />
            ))}
            {rows.data!.length === 0 && <li className="pis-small">Sin saludos: se usa el de siempre.</li>}
          </ul>
          <form
            className="pis-greet__add"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim() || problem) return;
              change.mutate({ kind: "add", text, moment }, { onSuccess: () => setText("") });
            }}
          >
            <input type="text" className="pis-input" aria-label="Nuevo saludo" placeholder="Escriba un saludo nuevo" value={text} maxLength={GREETING_MAX} onChange={(e) => setText(e.target.value)} />
            <select aria-label="Momento del día del nuevo saludo" value={moment} onChange={(e) => setMoment(e.target.value as GreetingMoment)}>
              {MOMENT_ORDER.map((m) => (
                <option key={m} value={m}>
                  {MOMENT_LABEL[m]}
                </option>
              ))}
            </select>
            <button type="submit" className="button-primary" disabled={!text.trim() || Boolean(problem) || change.isPending}>
              Agregar
            </button>
          </form>
          {problem && (
            <p className="pis-error" role="alert">
              {problem}
            </p>
          )}
        </>
      )}
      {change.isError && (
        <p className="pis-error" role="alert">
          No se guardó: {(change.error as Error).message}
        </p>
      )}
    </Group>
  );
}
