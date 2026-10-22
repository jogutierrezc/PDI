/* =============================================================================
   Portal de agentes · el movimiento, con GSAP.

   Las reglas de siempre en el proyecto: solo transform y opacity, nada pasa de
   300 ms, las salidas son más rápidas que las entradas, la cascada va de 30 a
   50 ms por elemento, lo que se hace con el teclado a cada rato no se anima y
   con movimiento reducido quedan fundidos cortos. La respuesta al toque
   (scale .97, 140 ms) es CSS (agentes.css), no esto.

     Mensaje      entra una vez, de 8 px abajo (220 ms); los que llegan juntos
                  van en cascada de 40 ms con tope de 200 ms.
     Oferta       «Nueva conversación para ti»: baja 8 px y se asienta (240 ms).
     Menús        nacen del botón que los abre (escala .96 → 1, 160 ms); salen
                  en 100 ms.
     Cajón/modal  el cajón del director entra por la derecha (240 ms); el
                  diálogo, con 4 px de subida (200 ms).
     Aviso        el «Deshacer» sube 8 px (200 ms).
     Lista        las filas de la cola y los agentes entran escalonadas una vez.
     Medidor      la barra de carga va a su valor (280 ms).

   Cada función devuelve el tween para que quien la llama lo mate al
   desmontar (useMotion lo hace por su cuenta con gsap.context).
   ========================================================================== */

import { useLayoutEffect } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import { EASE_OUT, reducedMotion } from "../impacto/pilo/motion";

export { enterBlock, enterList, fillBar } from "../admin/pilo-ensenanza/motion";

const D = { ease: EASE_OUT, clearProps: "transform,opacity" } as const;

/** Un conjunto de elementos entra con un fundido corto (movimiento reducido) o con subida. */
function from(items: Element | Element[] | NodeListOf<Element>, vars: gsap.TweenVars, rise: number, duration: number, stagger = 0) {
  const list = items instanceof Element ? [items] : Array.from(items);
  if (!list.length) return;
  gsap.killTweensOf(list);
  if (reducedMotion()) {
    gsap.fromTo(list, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(list, { opacity: 0, y: rise, ...vars }, { opacity: 1, y: 0, scale: 1, duration, stagger, ...D });
}

/** Los mensajes que acaban de llegar. */
export function enterMessages(items: Element[]) {
  from(items, {}, 8, 0.22, Math.min(0.04, 0.2 / Math.max(1, items.length)));
}

/** La oferta de una conversación nueva. */
export function enterOffer(card: Element | null) {
  if (card) from(card, { scale: 0.97 }, -8, 0.24);
}

/** Un menú o un popover: nace desde su botón. */
export function enterPop(pop: HTMLElement | null, origin = "0% 100%") {
  if (!pop) return;
  pop.style.transformOrigin = origin;
  from(pop, { scale: 0.96 }, 4, 0.16);
  const items = pop.querySelectorAll("[data-pop-item]");
  if (items.length && !reducedMotion()) gsap.fromTo(items, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.16, stagger: 0.012, delay: 0.03, ...D });
}

/** El diálogo entra con 4 px de subida; el fondo, con un fundido. */
export function enterDialog(scrim: Element | null, dialog: Element | null) {
  if (scrim) from(scrim, {}, 0, 0.18);
  if (dialog) from(dialog, { scale: 0.97 }, 4, 0.2);
}

/** El cajón lateral entra por la derecha. */
export function enterDrawer(scrim: Element | null, drawer: Element | null) {
  if (scrim) from(scrim, {}, 0, 0.18);
  if (!drawer) return;
  gsap.killTweensOf(drawer);
  if (reducedMotion()) {
    gsap.fromTo(drawer, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(drawer, { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.24, ...D });
}

/** El aviso «Deshacer». */
export function enterToast(toast: Element | null) {
  if (toast) from(toast, {}, 8, 0.2);
}

/** Lo que se quita sale más rápido de lo que entró (100 ms). */
export function leave(node: Element | null, done: () => void) {
  if (!node || reducedMotion()) {
    done();
    return;
  }
  gsap.killTweensOf(node);
  gsap.to(node, { opacity: 0, y: 4, duration: 0.1, ease: "power2.in", onComplete: done });
}

/**
 * Corre una coreografía dentro de un gsap.context ligado al elemento: al volver a correr o al desmontar,
 * se matan los tweens y se devuelven los estilos. Lo que ya entró queda visible.
 */
export function useMotion(scope: RefObject<HTMLElement | null>, run: () => void, deps: unknown[]) {
  useLayoutEffect(() => {
    const ctx = gsap.context(run, scope.current ?? undefined);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Lleva el hilo al final cuando llega algo (sin animar: la lectura no espera). */
export function scrollToEnd(node: HTMLElement | null) {
  if (node) node.scrollTop = node.scrollHeight;
}
