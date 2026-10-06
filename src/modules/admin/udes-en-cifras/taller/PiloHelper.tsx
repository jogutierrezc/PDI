/* =============================================================================
   El taller · Mr. Pilo en espera.

   Un botón en la esquina: «Llamar a Pilo». No ocupa pantalla hasta que lo
   invocan. Al abrirlo ofrece el recorrido de la pantalla (el motor de
   recorridos de siempre, con su hueco que se desliza) y explicar el bloque
   elegido: etiqueta, qué muestra y cómo se llena. «Cerrar» lo devuelve a su
   botón, que recupera el foco.

   La cara es la aprobada (PiloAvatar → PiloFace): no se redibuja ni se estira.
   El fondo marino y el cian son los de su guía (`--pilo-stage`, `--pilo-accent`)
   y no cambian con el tema.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PiloAvatar } from "../../../../components/pilo/PiloAvatar";
import type { PiloMood } from "../../../../components/pilo/PiloAvatar";
import { closePanel, openPanel, playSpeech } from "./pilo-motion";

export interface PiloSay {
  /** Cambia con cada frase nueva, aunque el texto se repita. */
  id: number;
  title: string;
  text: string;
  mood: PiloMood;
}

export function PiloHelper({
  say,
  onCall,
  onClose,
  onTour,
  onHelpBlock,
  onKinds,
  blockName,
}: {
  /** Lo que Pilo dice; null: está en su botón. */
  say: PiloSay | null;
  onCall: () => void;
  onClose: () => void;
  onTour: () => void;
  /** Explicar el bloque elegido; sin bloque elegido no se ofrece. */
  onHelpBlock?: () => void;
  onKinds: () => void;
  blockName?: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const speech = useRef<HTMLParagraphElement>(null);
  const call = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  /** El panel sigue montado mientras se cierra, para que la salida se vea. */
  const [shown, setShown] = useState<PiloSay | null>(say);
  const wasOpen = useRef(false);
  /** Al cerrar, el foco vuelve al botón cuando este reaparece. */
  const refocus = useRef(false);

  /** Se está cerrando: si lo vuelven a llamar a mitad de camino, el panel se recompone. */
  const closing = useRef(false);

  useEffect(() => {
    if (say) {
      if (closing.current) {
        closing.current = false;
        openPanel(panel.current);
      }
      setShown(say);
      return;
    }
    if (!wasOpen.current) return;
    let cancelled = false;
    closing.current = true;
    void closePanel(panel.current).then(() => {
      if (cancelled) return;
      closing.current = false;
      wasOpen.current = false;
      refocus.current = true;
      setShown(null);
    });
    return () => {
      cancelled = true;
    };
  }, [say]);

  // Al abrir, el panel crece desde el botón y el foco entra a él; al cambiar la frase, solo la frase.
  const shownId = shown?.id;
  useLayoutEffect(() => {
    if (shownId === undefined) {
      if (refocus.current) {
        refocus.current = false;
        call.current?.focus();
      }
      return;
    }
    if (!wasOpen.current) {
      wasOpen.current = true;
      openPanel(panel.current);
      closeButton.current?.focus();
    } else if (speech.current) {
      playSpeech(speech.current);
    }
  }, [shownId]);

  return (
    <div className="odt-dock">
      {!shown && (
        <button ref={call} type="button" className="odt-call" data-tour="odt-pilo" onClick={onCall}>
          <PiloAvatar mood="feliz" size={40} />
          Llamar a Pilo
        </button>
      )}
      {shown && (
        <aside
          ref={panel}
          className="odt-pilo"
          aria-label="Mr. Pilo, su guía en el taller"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onClose();
            }
          }}
        >
          <header className="odt-pilo__head">
            <PiloAvatar mood={shown.mood} size={64} alive />
            <div>
              <strong>Mr. Pilo</strong>
              <small>{shown.title}</small>
            </div>
            <button ref={closeButton} type="button" className="odt-pilo__button" onClick={onClose}>
              Cerrar
            </button>
          </header>
          <p ref={speech} className="odt-pilo__say" aria-live="polite">
            {shown.text}
          </p>
          <div className="odt-pilo__nav">
            <button type="button" className="odt-pilo__button" data-tone="go" onClick={onTour}>
              Mostrarme el recorrido
            </button>
            {onHelpBlock && (
              <button type="button" className="odt-pilo__button" onClick={onHelpBlock}>
                Ayúdeme con {blockName ? `«${blockName}»` : "el bloque elegido"}
              </button>
            )}
            <button type="button" className="odt-pilo__button" onClick={onKinds}>
              Explicarme los tipos de bloque
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
