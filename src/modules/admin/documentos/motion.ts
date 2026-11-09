/* =============================================================================
   Panel de Documentos · movimiento.

   Todo es corto (<= 300 ms), "power3.out", y se apaga con prefers-reduced-motion.
   Lo que se hace con el teclado (Esc, flechas, Enter sobre un botón) no se
   anima: quien navega así quiere el resultado, no el trayecto.
   ========================================================================== */

import gsap from "gsap";

export const reducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Entrada escalonada: opacidad + 6 px hacia arriba. */
export function enterList(targets: gsap.TweenTarget, offset = 6) {
  if (reducedMotion()) return;
  gsap.from(targets, {
    opacity: 0,
    y: offset,
    duration: 0.26,
    ease: "power3.out",
    stagger: 0.03,
    clearProps: "opacity,transform",
  });
}

/** Un clic con detail 0 es el teclado (Enter o espacio sobre un botón). */
export const fromKeyboard = (event: { detail: number }) => event.detail === 0;

export const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
