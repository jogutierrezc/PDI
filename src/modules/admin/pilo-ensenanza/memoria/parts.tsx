/* =============================================================================
   Mr. Pilo en Enseñanza · Memoria · las piezas que comparten sus paneles.

   ReadingStrip   la franja «Pilo leyendo»: su cara aprobada (pensar mientras
                  trabaja), el paso en curso en palabras, una barra de avance
                  y un contador. Sin trabajo, dice el estado de la memoria.
   Stages         el recorrido de un documento o un curso: leído → en pasajes
                  → entendido → en el mapa, con glifo y palabra.
   FaultNote      un error dicho entero: qué pasó, qué hacer y, si sirve,
                  «Reintentar».
   MissingNote    falta una migración: cuál, y que el panel queda apagado.
   VisSeg         quién lo ve: con sesión o público.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { PiloFace } from "../../../../components/pilo/PiloFace";
import { Icon } from "../../../../components/ui/Icon";
import { fillBar, fillStages, readingRings, swapLine } from "../motion";
import { useReading } from "./data";
import { faultLine } from "./flow";
import type { Fault, Stage } from "./flow";

export function ReadingStrip({ total, idleLine }: { total: number | null; idleLine: string }) {
  const job = useReading();
  const rings = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const say = useRef<HTMLDivElement>(null);
  const busy = Boolean(job);
  const title = job ? job.title : total === null ? "La memoria de este Pilo" : total === 0 ? "La memoria está vacía" : "La memoria está lista para leer";
  const line = job ? job.line : idleLine;

  useEffect(() => (busy ? readingRings(rings.current ? [...rings.current.children] : []) : undefined), [busy]);

  useLayoutEffect(() => {
    if (job?.progress !== undefined) fillBar(bar.current, job.progress);
  }, [job?.progress]);

  // La frase cambia de paso: entra con un fundido. El primer pintado no se anima.
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    swapLine(say.current);
  }, [title]);

  return (
    <div className="pen-rd" role="status" aria-live="polite" data-busy={busy || undefined}>
      <span className="pen-rd__face">
        <span className="pen-rd__rings" ref={rings} aria-hidden="true">
          <i />
          <i />
        </span>
        <PiloFace size={60} expression={busy ? "pensar" : "graduado"} alive />
      </span>
      <div className="pen-rd__say">
        <div ref={say}>
          <strong>{title}</strong>
          <span>{line}</span>
        </div>
        {busy && (
          <i
            className="pen-rd__bar"
            data-loose={job?.progress === undefined || undefined}
            role="progressbar"
            aria-label="Avance"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job?.progress === undefined ? undefined : Math.round(job.progress * 100)}
          >
            <span ref={bar} />
          </i>
        )}
      </div>
      <div className="pen-rd__count">
        {job?.counter ? (
          <b>{job.counter}</b>
        ) : (
          <>
            <b>{total === null ? "—" : total.toLocaleString("es-CO")}</b>
            {total === 1 ? "pasaje en la memoria" : "pasajes en la memoria"}
          </>
        )}
      </div>
    </div>
  );
}

const STATE_WORD: Record<Stage["state"], string> = { done: "hecho", run: "en curso", fail: "falló", todo: "pendiente" };

/** El recorrido. La barra de una etapa recién cumplida se llena una vez; lo ya cumplido al llegar no se anima. */
export function Stages({ stages, label }: { stages: Stage[]; label: string }) {
  const list = useRef<HTMLOListElement>(null);
  const before = useRef<string[] | null>(null);
  const key = stages.map((s) => s.state).join();

  useLayoutEffect(() => {
    const was = before.current;
    before.current = stages.map((s) => s.state);
    if (!was || !list.current) return;
    const bars = stages.flatMap((s, i) => {
      const b = s.state === "done" && was[i] !== "done" ? list.current!.children[i]?.querySelector("b") : null;
      return b ? [b] : [];
    });
    fillStages(bars);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ol className="pen-steps" ref={list} aria-label={`Recorrido de ${label}`}>
      {stages.map((s) => (
        <li key={s.id} data-state={s.state}>
          <i aria-hidden="true">
            <b />
          </i>
          <span>
            {s.state === "done" && <Icon name="check" size={11} />}
            {s.state === "fail" && <Icon name="alert" size={11} />}
            {s.label}
            {s.state === "run" || s.state === "fail" ? <em> · {STATE_WORD[s.state]}</em> : <span className="sr-only">: {STATE_WORD[s.state]}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Un error, entero. `onRetry` solo si reintentar sin cambiar nada puede servir. */
export function FaultNote({ fault, lead, onRetry, retryLabel = "Reintentar", busy = false, children }: { fault: Fault; lead?: string; onRetry?: () => void; retryLabel?: string; busy?: boolean; children?: ReactNode }) {
  return (
    <div className="pen-fault" role="alert">
      <Icon name="alert" size={16} />
      <p>
        {lead ? <b>{lead}. </b> : null}
        {faultLine(fault)}
      </p>
      {(onRetry || children) && (
        <span className="pis-actions">
          {onRetry && (
            <button type="button" className="button-secondary" onClick={onRetry} disabled={busy}>
              {retryLabel}
            </button>
          )}
          {children}
        </span>
      )}
    </div>
  );
}

export function MissingNote({ migration, what }: { migration: string; what: string }) {
  return (
    <div className="pen-soon" role="note">
      <Icon name="alert" size={20} />
      <p>
        <b>Falta aplicar la migración {migration}.</b> {what} Este panel queda apagado hasta entonces; lo demás de la memoria sigue funcionando.
      </p>
    </div>
  );
}

/** Quién puede recibir sus pasajes. Público se marca distinto: es la opción que abre. */
export function VisSeg({ value, onChange, disabled, label }: { value: "publico" | "sesion"; onChange: (v: "publico" | "sesion") => void; disabled?: boolean; label: string }) {
  return (
    <div className="pis-seg pis-seg--sm" role="radiogroup" aria-label={`Quién ve ${label}`}>
      <button type="button" role="radio" aria-checked={value === "sesion"} disabled={disabled} onClick={() => value !== "sesion" && onChange("sesion")}>
        <Icon name="lock" size={12} /> Con sesión
      </button>
      <button type="button" role="radio" data-public aria-checked={value === "publico"} disabled={disabled} onClick={() => value !== "publico" && onChange("publico")}>
        <Icon name="eye" size={12} /> Público
      </button>
    </div>
  );
}
