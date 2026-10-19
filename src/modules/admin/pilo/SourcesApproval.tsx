/* =============================================================================
   Intranet · Mr. Pilo con IA · Memoria › «Qué puede leer el público» (0173).

   La memoria es una sola. Quien pregunta decide qué lee: el personal con
   sesión lee todo lo que no esté oculto; el público (el chat de udes.edu.co,
   un visitante, una cuenta de Pilo) lee lo público Y aprobado aquí. Por
   fuente: cuántos pasajes hay, cuántos son públicos aprobados y un interruptor
   para aprobar o retirar. Lo que entra por la capa profunda nace sin aprobar.
   ========================================================================== */

import { useState } from "react";
import { approvalOn, approvalState, confirmApprovalText, countsText, STATE_TEXT, useApprove, useApproval } from "./approval";
import type { SourceApproval } from "./approval";
import { Group, StatusMark, Switch } from "./ui";

const SCOPE_NAME: Record<string, string> = { planeacion: "Planeación", ensenanza: "Enseñanza" };

export function SourcesApproval() {
  const query = useApproval();
  const approve = useApprove();
  const [asking, setAsking] = useState<{ source: SourceApproval; on: boolean } | null>(null);
  const [said, setSaid] = useState("");

  const missing = query.data === null;
  const rows = query.data ?? [];

  const apply = () => {
    if (!asking) return;
    const { source, on } = asking;
    setSaid("");
    approve.mutate(
      { source: source.id, on },
      {
        onSuccess: (n) => {
          setAsking(null);
          setSaid(on ? `«${source.name}» quedó aprobada para el público (${n.toLocaleString("es-CO")} pasajes aprobados).` : `«${source.name}» ya no la lee el público.`);
        },
        onError: () => setAsking(null),
      },
    );
  };

  return (
    <Group
      title="Qué puede leer el público"
      id="pis-aprobacion-publica"
      aside={<small role="status">{missing ? <StatusMark tone="warn">Falta la migración 0173</StatusMark> : approve.isPending ? "Aplicando…" : "Cada cambio se aplica al momento"}</small>}
    >
      <p className="pis-lead">
        Pilo tiene una sola memoria y habla de todo, pero el público solo recibe lo que usted apruebe aquí. El personal con sesión lee también lo que está sin aprobar. Lo
        «oculto» nunca se lee y «Impacto» siempre pide sesión. Lo que entra por la capa profunda nace sin aprobar.
      </p>

      {missing ? (
        <p className="pis-warn">Falta aplicar la migración 0173 en la base. Hasta entonces la memoria se lee como antes: cada portal, lo suyo.</p>
      ) : query.isError ? (
        <p className="pis-error" role="alert">
          No se pudo leer: {(query.error as Error).message}{" "}
          <button type="button" className="pis-link" onClick={() => void query.refetch()}>
            Reintentar
          </button>
        </p>
      ) : query.isPending ? (
        <p className="pis-small" role="status">
          Contando los pasajes de cada fuente…
        </p>
      ) : (
        <ul className="pis-approval" aria-label="Fuentes de la memoria y su aprobación pública">
          {rows.map((s) => {
            const state = approvalState(s);
            const on = approvalOn(s);
            const question = asking?.source.id === s.id ? asking : null;
            return (
              <li key={s.id} className="pis-approval__row">
                <span className="pis-approval__name">
                  <strong>{s.name}</strong>
                  <small>
                    {SCOPE_NAME[s.scope] ?? s.scope} · {countsText(s)}
                  </small>
                </span>
                <StatusMark tone={state === "aprobada" ? "ok" : state === "pendiente" ? "warn" : "off"}>{STATE_TEXT[state]}</StatusMark>
                <Switch
                  on={on}
                  label={`Aprobar «${s.name}» para el público`}
                  disabled={approve.isPending || (s.staffOnly && !on && s.public === 0)}
                  onChange={(v) => (setSaid(""), approve.reset(), setAsking({ source: s, on: v }))}
                />
                {question && (
                  <div className="pis-key__saved pis-key__saved--confirm pis-approval__confirm" role="alert">
                    <span>{confirmApprovalText(question.source, question.on)}</span>
                    <button type="button" className="button-secondary" onClick={() => setAsking(null)} disabled={approve.isPending}>
                      No, dejarlo como está
                    </button>
                    <button type="button" className="button-primary" onClick={apply} disabled={approve.isPending}>
                      {approve.isPending ? "Aplicando…" : question.on ? "Sí, aprobarla" : "Sí, retirarla"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {said && (
        <p className="pis-small" role="status">
          <StatusMark tone="ok">Aplicado</StatusMark> {said}
        </p>
      )}
      {approve.isError && (
        <p className="pis-error" role="alert">
          No se aplicó: {(approve.error as Error).message}
        </p>
      )}
    </Group>
  );
}
