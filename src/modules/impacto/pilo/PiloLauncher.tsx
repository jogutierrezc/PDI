/* =============================================================================
   Mr. Pilo Bot · el botón y la escena, compartidos.

   El botón: posarse 400 ms con el mouse (intención, no roce) abre la escena,
   que crece desde el botón hasta ocupar la pantalla; clic, Enter o un toque
   la abren al instante. La escena: fondo marino, la mascota y su voz a la
   izquierda y el panel de trabajo a la derecha; Esc o «Cerrar» la devuelven
   al botón, el foco no se escapa y la página de atrás no se desplaza.

   Lo usan la guía de los programas (PiloBot) y el análisis de las
   vicerrectorías (PiloCurator).
   ========================================================================== */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import gsap from "gsap";
import { playEntrance, playExit, playSpeech, playStep } from "./motion";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/ui/Icon";
import "./pilo.css";

const INTENT_MS = 400;
export const AVATAR = "/pilo-96.webp";
export const AVATAR_2X = "/pilo-192.webp";
export const AVATAR_LG = "/pilo-384.webp";

export interface PiloOrigin {
  x: string;
  y: string;
}

/** La escena abierta deja aquí su animación de salida, para que cerrar la espere. */
const ExitContext = createContext<MutableRefObject<(() => Promise<void>) | null> | null>(null);

export function PiloLauncher({
  sub,
  peekTitle,
  peekText,
  children,
}: {
  /** La segunda línea del botón. */
  sub: string;
  peekTitle: string;
  peekText: string;
  /** La escena abierta. */
  children: (scene: { origin: PiloOrigin; onClose: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState(false);
  const [origin, setOrigin] = useState<PiloOrigin>({ x: "90%", y: "40px" });
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | null>(null);
  const exit = useRef<(() => Promise<void>) | null>(null);

  const clearIntent = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setIntent(false);
  };

  const show = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setIntent(false);
    const rect = button.current?.getBoundingClientRect();
    if (rect) setOrigin({ x: `${rect.left + rect.width / 2}px`, y: `${rect.top + rect.height / 2}px` });
    setOpen(true);
  }, []);

  const onEnter = (event: ReactPointerEvent) => {
    if (event.pointerType !== "mouse" || open) return;
    setIntent(true);
    timer.current = window.setTimeout(show, INTENT_MS);
  };

  useEffect(() => () => clearIntent(), []);

  // Cerrar espera a que el círculo vuelva al botón.
  const close = useCallback(async () => {
    await exit.current?.();
    exit.current = null;
    setOpen(false);
    window.requestAnimationFrame(() => button.current?.focus());
  }, []);

  return (
    <>
      <span className="pilo-anchor">
        <button
          ref={button}
          type="button"
          className="pilo-btn"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-intent={intent || undefined}
          onPointerEnter={onEnter}
          onPointerLeave={clearIntent}
          onClick={show}
        >
          <span className="pilo-btn__face">
            <img src={AVATAR} srcSet={`${AVATAR} 1x, ${AVATAR_2X} 2x`} alt="" width={40} height={40} />
          </span>
          <span className="pilo-btn__text">
            <strong>Mr. Pilo Bot</strong>
            <small>{sub}</small>
          </span>
        </button>
        {intent && (
          <span className="pilo-peek" role="tooltip">
            <strong>{peekTitle}</strong>
            <span>{peekText}</span>
            <i aria-hidden="true" />
          </span>
        )}
      </span>
      {open &&
        createPortal(
          <ExitContext.Provider value={exit}>{children({ origin, onClose: () => void close() })}</ExitContext.Provider>,
          document.body,
        )}
    </>
  );
}

/**
 * La escena a pantalla completa. `focusKey` cambia cuando cambia el paso: el
 * foco va entonces al elemento marcado con data-autofocus.
 */
export function PiloScene({
  origin,
  onClose,
  titleId,
  focusKey,
  children,
}: {
  origin: PiloOrigin;
  onClose: () => void;
  titleId: string;
  focusKey?: string | number;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const exit = useContext(ExitContext);
  const firstStep = useRef(true);
  const lastStep = useRef<string | number | undefined>(focusKey);

  // La entrada: el círculo crece desde el botón y el contenido llega en cascada.
  useLayoutEffect(() => {
    const scene = dialog.current;
    if (!scene) return;
    const ctx = gsap.context(() => {
      playEntrance(scene, origin);
    }, scene);
    if (exit) exit.current = () => playExit(scene, origin);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cada paso nuevo entra desde el lado hacia el que se avanza.
  useLayoutEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    const panel = dialog.current?.querySelector<HTMLElement>(".pilo__panel");
    const forward = typeof focusKey === "number" && typeof lastStep.current === "number" ? focusKey >= lastStep.current : true;
    lastStep.current = focusKey;
    if (panel) playStep(panel, forward ? 1 : -1);
  }, [focusKey]);

  // Mientras la escena está abierta, la página de atrás no se desplaza.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [focusKey]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const style = { "--pilo-x": origin.x, "--pilo-y": origin.y } as CSSProperties;

  return (
    <div ref={dialog} className="pilo" style={style} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

/** La voz de Mr. Pilo: cambia con un fundido corto cada vez que dice algo nuevo. */
export function PiloSpeech({ text }: { text: string }) {
  const node = useRef<HTMLParagraphElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (node.current) playSpeech(node.current);
  }, [text]);
  return (
    <p ref={node} aria-live="polite" className="pilo__speech">
      {text}
    </p>
  );
}

/** El botón de cerrar de la escena. */
export function PiloClose({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="pilo__close" onClick={onClose}>
      <Icon name="close" size={16} /> Cerrar
    </button>
  );
}
