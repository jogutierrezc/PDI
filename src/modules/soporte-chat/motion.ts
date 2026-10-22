/* =============================================================================
   Traspaso de Pilo a un agente · el movimiento del chat, con GSAP.

   Pocas cosas se mueven y cada una dice algo. Solo transform y opacity; nada
   pasa de 300 ms; lo que sale es más rápido que lo que entra; con movimiento
   reducido quedan fundidos cortos. Lo que se hace con el teclado a cada rato
   (escribir, enviar) no se anima. La respuesta al toque es CSS.

     Mensaje     entra una vez, de 8 px abajo (220 ms), en cascada de 40 ms.
     Bloque      el formulario, la fila de espera y la encuesta entran con una
                 subida de 6 px (200 ms).
     Cabecera    al aceptar el agente, la cara de Pilo y su nombre salen (120 ms)
                 y el nombre y la foto del agente entran por partes (260 ms,
                 50 ms entre una y otra).
     Aviso       «Te pasamos con…» baja 10 px (260 ms).
   ========================================================================== */

import { useLayoutEffect } from "react";
import type { RefObject } from "react";
import gsap from "gsap";

const EASE = "power4.out";
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const CLEAR = "transform,opacity";

export function enterMessages(items: Element[]) {
  if (!items.length) return;
  gsap.killTweensOf(items);
  if (reduced()) {
    gsap.fromTo(items, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(items, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.22, stagger: Math.min(0.04, 0.2 / items.length), ease: EASE, clearProps: CLEAR });
}

export function enterBlock(node: Element | null, rise = 6) {
  if (!node) return;
  gsap.killTweensOf(node);
  if (reduced()) {
    gsap.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(node, { opacity: 0, y: rise, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: EASE, clearProps: CLEAR });
}

/** Las partes de la cabecera del agente entran una a una. */
export function enterHeader(parts: Element[]) {
  if (!parts.length) return;
  gsap.killTweensOf(parts);
  if (reduced()) {
    gsap.fromTo(parts, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(parts, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.26, stagger: 0.05, ease: EASE, clearProps: CLEAR });
}

export function enterNotice(node: Element | null) {
  if (!node) return;
  gsap.killTweensOf(node);
  if (reduced()) {
    gsap.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(node, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.26, delay: 0.1, ease: EASE, clearProps: CLEAR });
}

/** Una coreografía dentro de un gsap.context: al repetirse o desmontarse, se matan los tweens y se devuelven los estilos. */
export function useMotion(scope: RefObject<HTMLElement | null>, run: () => void, deps: unknown[]) {
  useLayoutEffect(() => {
    const ctx = gsap.context(run, scope.current ?? undefined);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
