/* =============================================================================
   Capacitación de Pilo · el movimiento de la bandeja, con GSAP.

   Lo que la base trae en otra página entra una vez, fila a fila; lo que deja
   la pantalla sale antes. Reglas del proyecto (ver pilo-ensenanza/motion.ts):
   solo transform y opacity, la curva de salida fuerte (expo.out), nada de
   más de 300 ms por animación, y con movimiento reducido solo fundidos.

     Entrada   8 px de subida y opacidad, 200 ms por fila, 30 ms entre filas.
     Salida    4 px y opacidad en 120 ms: más rápida que la entrada.
     Sección   la de siempre (revealSection), en pilo/motion.ts.

   La lista reserva su alto (CSS, min-height), así que cambiar de página no
   mueve lo que está debajo. Todo se puede interrumpir: cada llamada mata la
   anterior sobre los mismos elementos.
   ========================================================================== */

import gsap from "gsap";
import { EASE_OUT, reducedMotion } from "../../impacto/pilo/motion";

const ENTRA = 0.2;
const SALE = 0.12;
const CADA_FILA = 0.03;

/** Las filas de una página nueva entran en cascada corta. */
export function entraPagina(filas: Element[]) {
  if (!filas.length) return;
  gsap.killTweensOf(filas);
  if (reducedMotion()) {
    gsap.fromTo(filas, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(filas, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: ENTRA, stagger: CADA_FILA, ease: EASE_OUT, clearProps: "transform,opacity" });
}

/** Las filas de la página que se deja salen y, al terminar, `luego` cambia la página. */
export function saleYLuego(filas: Element[], luego: () => void) {
  if (!filas.length || reducedMotion()) {
    luego();
    return;
  }
  gsap.killTweensOf(filas);
  gsap.to(filas, {
    opacity: 0,
    y: -4,
    duration: SALE,
    ease: EASE_OUT,
    onComplete: luego,
  });
}
