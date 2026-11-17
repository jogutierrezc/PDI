/* =============================================================================
   Pilo · «Cómo pensó Pilo»: el razonamiento del modelo, aparte de la respuesta.

   Componente común de la web de preguntas (AskPilo, que usa TextoPensamiento) y de
   Pilo App y Pilo Work (PanelPensamiento: texto en vivo, contador de segundos y
   estado: «pensando», «redactando» o listo). El texto es el que produjo el modelo, tal
   cual (en inglés), en texto plano: ni se traduce ni se reescribe ni se cita como
   fuente. Respeta «Reducir movimiento».
   ========================================================================== */

import { useEffect, useId, useRef, useState } from "react";
import { tr, useLang } from "../i18n";
import "./pensamiento.css";

/** El texto del razonamiento, en plano. En vivo se mantiene al final. */
export function TextoPensamiento({ text, live = false, className = "ap-think__text" }: { text: string; live?: boolean; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (live && el) el.scrollTop = el.scrollHeight;
  }, [text, live]);
  return (
    <p ref={ref} className={className} lang="en" aria-live="off">
      {text}
    </p>
  );
}

export type FasePensamiento = "pensando" | "redactando" | "listo";

/** Segundos que lleva corriendo; solo avanza mientras `on`. */
function useSegundos(desde: number | undefined, on: boolean): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [on]);
  return desde ? Math.max(0, (Date.now() - desde) / 1000) : 0;
}

export const textoSegundos = (s: number) => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(0, Math.round(s))} s`);

export function PanelPensamiento({
  thinking,
  fase,
  startedAt,
  seconds,
  razona = true,
}: {
  thinking: string;
  fase: FasePensamiento;
  /** Cuándo empezó a pensar (para el contador en vivo). */
  startedAt?: number;
  /** Segundos finales, cuando ya se sabe cuánto pensó. */
  seconds?: number | null;
  /** El modelo razona: aunque aún no llegue texto, se muestra el panel con la espera. */
  razona?: boolean;
}) {
  useLang();
  const id = useId();
  const [manual, setManual] = useState<boolean | null>(null);
  const pensando = fase === "pensando";
  const corre = fase !== "listo" && seconds == null;
  const vivo = useSegundos(startedAt, corre && pensando);
  const mostrados = seconds != null ? seconds : vivo;
  // Abierto mientras piensa; al empezar a redactar se recoge solo, salvo que la persona lo haya tocado.
  const open = manual ?? pensando;
  if (!thinking && !(razona && fase !== "listo")) return null;
  const titulo = fase === "listo" ? tr("Cómo pensó Pilo") : pensando ? tr("Pilo está pensando…") : tr("Pilo está redactando…");
  const tiempo = mostrados > 0 || pensando ? ` · ${textoSegundos(mostrados)}` : "";
  return (
    <div className="pp-think" data-fase={fase}>
      <button type="button" className="pp-think__head" aria-expanded={open} aria-controls={id} onClick={() => setManual(!open)}>
        <span className="pp-think__dot" aria-hidden="true" />
        <span role="status">
          {titulo}
          {tiempo}
        </span>
        <span className="pp-think__chev" aria-hidden="true" />
      </button>
      <div id={id} className="pp-think__body" data-open={open || undefined} aria-hidden={!open}>
        <div className="pp-think__in">
          {thinking ? <TextoPensamiento text={thinking} live={pensando} className="pp-think__text" /> : <p className="pp-think__text pp-think__wait">{tr("Esperando el primer razonamiento…")}</p>}
        </div>
      </div>
    </div>
  );
}
