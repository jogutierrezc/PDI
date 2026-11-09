/* =============================================================================
   Panel de Documentos · ventana modal.

   role="dialog" aria-modal, foco atrapado, Esc cierra y el foco vuelve a quien
   la abrió. Entrada <= 260 ms (opacidad, 14 px y escala .985 → 1) y salida más
   rápida (<= 160 ms). Con Esc no se anima, y con prefers-reduced-motion tampoco.

   Se pinta en el <body> para que ningún contenedor con overflow la recorte. Dos
   modales pueden apilarse (el asistente y la vista previa): el de arriba se
   queda con Esc y con Tab, y no se los pasa al de abajo.
   ========================================================================== */

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { Icon } from "../../../components/ui/Icon";
import { reducedMotion } from "./motion";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let locks = 0;

export function Modal({
  label,
  onClose,
  size = "lg",
  nested = false,
  children,
}: {
  /** Nombre accesible del diálogo. */
  label: string;
  /** Se llama cuando el modal ya terminó de salir. */
  onClose: () => void;
  size?: "md" | "lg" | "xl";
  nested?: boolean;
  children: (api: { close: () => void; titleId: string }) => ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    locks += 1;
    document.body.style.overflow = "hidden";

    const node = card.current;
    if (node && !reducedMotion()) {
      gsap.fromTo(node, { opacity: 0, y: 14, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.24, ease: "power3.out", clearProps: "opacity,transform" });
      if (backdrop.current) gsap.fromTo(backdrop.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power3.out", clearProps: "opacity" });
    }
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus({ preventScroll: true });

    return () => {
      locks -= 1;
      if (locks <= 0) {
        locks = 0;
        document.body.style.overflow = "";
      }
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  function close(viaKeyboard = false) {
    if (closing.current) return;
    closing.current = true;
    const node = card.current;
    if (!node || viaKeyboard || reducedMotion()) {
      onCloseRef.current();
      return;
    }
    gsap.to(node, { opacity: 0, y: 8, scale: 0.985, duration: 0.15, ease: "power2.in", onComplete: () => onCloseRef.current() });
    if (backdrop.current) gsap.to(backdrop.current, { opacity: 0, duration: 0.15, ease: "power2.in" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key !== "Tab") return;
    event.stopPropagation();
    const items = [...(card.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null);
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === card.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="da-modal" data-nested={nested || undefined} data-size={size}>
      <div ref={backdrop} className="da-modal__backdrop" onClick={() => close()} aria-hidden="true" />
      <div
        ref={card}
        className="da-modal__card"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {children({ close: () => close(), titleId })}
      </div>
    </div>,
    document.body,
  );
}

/** El botón de cerrar de la cabecera de un modal. */
export function ModalClose({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="icon-button da-modal__x" aria-label="Cerrar" onClick={onClick}>
      <Icon name="close" size={16} />
    </button>
  );
}
