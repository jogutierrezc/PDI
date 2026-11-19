/* Planeación y Seguimiento · Fase 2 · movimiento del tablero (GSAP), con parquedad.
   Un solo momento: el asentado de la tarjeta soltada con el ratón o el lápiz (FLIP de 220 ms, solo transform).
   Lo que viene del teclado o del menú «Mover a…» NO se anima; con «reducir movimiento» nada se anima. */

import gsap from "gsap";
import { movimientoReducido } from "../movimiento";

/** La tarjeta, ya en su cubo nuevo, llega desde donde se soltó. */
export function asentarTarjeta(el: HTMLElement, desde: DOMRect) {
  if (movimientoReducido()) return;
  const a = el.getBoundingClientRect();
  const dx = desde.left - a.left;
  const dy = desde.top - a.top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  gsap.killTweensOf(el);
  gsap.fromTo(el, { x: dx, y: dy, scale: 1.02 }, { x: 0, y: 0, scale: 1, duration: 0.22, ease: "power3.out", clearProps: "transform", overwrite: true });
}

/** Una tarjeta rechazada vuelve a su sitio. */
export function devolverTarjeta(el: HTMLElement) {
  gsap.killTweensOf(el);
  if (movimientoReducido()) {
    el.style.transform = "";
    return;
  }
  gsap.to(el, { x: 0, y: 0, scale: 1, duration: 0.2, ease: "power3.out", clearProps: "transform" });
}
