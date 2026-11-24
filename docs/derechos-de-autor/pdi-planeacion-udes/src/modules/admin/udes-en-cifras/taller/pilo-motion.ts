/* =============================================================================
   El taller · el movimiento de Mr. Pilo, con GSAP.

   Pilo espera en su botón y no ocupa pantalla. Al llamarlo, su panel crece
   desde la esquina del botón (240 ms, de 0.92 a 1: nunca desde cero); al
   cerrarlo vuelve hacia él (180 ms). Cuando cambia lo que dice, la frase entra
   con el fundido de siempre (`playSpeech`, de la guía de Impacto). El aviso de
   «Deshacer» sube 12 px al aparecer y un bloque que cambia de sitio llega
   desde donde estaba.

   Solo transform y opacity. Con movimiento reducido quedan fundidos cortos.
   Cada llamada mata la anterior sobre el mismo elemento.
   ========================================================================== */

import gsap from "gsap";
import { EASE_IN_OUT, EASE_OUT, reducedMotion } from "../../../impacto/pilo/motion";

export { playSpeech } from "../../../impacto/pilo/motion";

/** El panel aparece desde la esquina donde está el botón. */
export function openPanel(panel: HTMLElement | null) {
  if (!panel) return;
  gsap.killTweensOf(panel);
  if (reducedMotion()) {
    gsap.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(
    panel,
    { opacity: 0, scale: 0.92, transformOrigin: "100% 100%" },
    { opacity: 1, scale: 1, duration: 0.24, ease: EASE_OUT, clearProps: "transform,opacity" },
  );
}

/** El panel vuelve a su botón. Resuelve cuando termina, para desmontarlo después. */
export function closePanel(panel: HTMLElement | null): Promise<void> {
  return new Promise((resolve) => {
    if (!panel) {
      resolve();
      return;
    }
    gsap.killTweensOf(panel);
    if (reducedMotion()) {
      gsap.to(panel, { opacity: 0, duration: 0.12, ease: "none", onComplete: resolve });
      return;
    }
    gsap.to(panel, { opacity: 0, scale: 0.92, transformOrigin: "100% 100%", duration: 0.18, ease: EASE_IN_OUT, onComplete: resolve });
  });
}

/** Un aviso (quitado, pegado) entra desde abajo. */
export function enterToast(node: HTMLElement | null) {
  if (!node) return;
  gsap.killTweensOf(node);
  if (reducedMotion()) {
    gsap.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(node, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.22, ease: EASE_OUT, clearProps: "transform,opacity" });
}

/** Un bloque que acaba de cambiar de sitio lo dice con un desplazamiento corto desde donde estaba. */
export function settleBlock(node: Element | null, from: -1 | 1) {
  if (!node) return;
  gsap.killTweensOf(node);
  if (reducedMotion()) {
    gsap.fromTo(node, { opacity: 0.5 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(node, { y: 24 * from }, { y: 0, duration: 0.26, ease: EASE_OUT, clearProps: "transform" });
}
