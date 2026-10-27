/* =============================================================================
   Datos de Sostenibilidad · el movimiento, con GSAP.

   Las reglas del diseño aprobado: lo que se ve decenas de veces al día es corto
   (entradas de 240 ms o menos, ease-out fuerte, escalonado de 30 ms y hasta 9
   elementos); el menú nace en su botón; las barras de avance crecen y el
   recorrido tabla → gráfica → indicador → portal se enciende solo al entrar a
   la sección; el valor conectado parpadea en verde cuando cambia una celda.
   Nada se anima por acciones de teclado ni mientras se escribe. Solo transform
   y opacidad. Con movimiento reducido queda un fundido corto.
   ========================================================================== */

import gsap from "gsap";
import { movimientoReducido } from "../../../components/espacio/movimiento";

const SALE = "power4.out";

/** Una sección entra: sube 8 px mientras aparece y sus hijos (los primeros 9) se escalonan 30 ms. */
export function entrar(el: Element | null, hijos?: string) {
  if (!el) return;
  gsap.killTweensOf(el);
  if (movimientoReducido()) {
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.24, ease: SALE, clearProps: "opacity,transform" });
  if (hijos) {
    const lista = [...el.querySelectorAll(hijos)].slice(0, 9);
    gsap.from(lista, { opacity: 0, y: 6, duration: 0.22, ease: SALE, stagger: 0.03, delay: 0.04, clearProps: "opacity,transform" });
  }
}

/** Una pieza que cambia de contenido (el panel de la derecha, un formulario): un respiro corto. */
export function cambiar(el: Element | null) {
  if (!el) return;
  gsap.killTweensOf(el.children);
  gsap.from(el.children, { opacity: 0, y: movimientoReducido() ? 0 : 4, duration: movimientoReducido() ? 0.1 : 0.18, ease: SALE, stagger: movimientoReducido() ? 0 : 0.025, clearProps: "opacity,transform" });
}

/** El valor conectado parpadea en verde cuando cambia (la celda editada llegó al indicador). */
export function parpadear(el: Element | null) {
  if (!el || movimientoReducido()) return;
  gsap.fromTo(el, { backgroundColor: "rgba(18,131,58,.28)" }, { backgroundColor: "rgba(18,131,58,0)", duration: 0.7, ease: "power2.out", clearProps: "backgroundColor" });
}

/** Las barras de avance crecen desde la izquierda. */
export function crecerMedidores(raiz: Element | null, retraso = 0) {
  if (!raiz || movimientoReducido()) return;
  gsap.from(raiz.querySelectorAll("[data-medidor]"), { scaleX: 0, transformOrigin: "0 50%", duration: 0.6, ease: "power3.out", delay: retraso, stagger: 0.05, clearProps: "transform" });
}

/** El recorrido tabla → gráfica → indicador → portal: cada paso aparece y su conector se enciende. */
export function encenderRecorrido(raiz: Element | null) {
  if (!raiz) return;
  const pasos = [...raiz.querySelectorAll("[data-paso]")];
  const conectores = [...raiz.querySelectorAll("[data-conector]")];
  if (movimientoReducido()) {
    gsap.from(pasos, { opacity: 0, duration: 0.12, clearProps: "opacity" });
    return;
  }
  const linea = gsap.timeline({ defaults: { ease: SALE } });
  pasos.forEach((p, i) => {
    linea.from(p, { opacity: 0, y: 8, duration: 0.26, clearProps: "opacity,transform" }, i * 0.14);
    if (conectores[i]) linea.from(conectores[i], { scaleX: 0, transformOrigin: "0 50%", duration: 0.22, ease: "power2.out", clearProps: "transform" }, i * 0.14 + 0.1);
  });
}

/** Las barras de una gráfica crecen y las líneas se dibujan: solo cuando se abre la gráfica. */
export function dibujarGrafica(raiz: Element | null) {
  if (!raiz) return;
  if (movimientoReducido()) {
    gsap.from(raiz, { opacity: 0, duration: 0.12, clearProps: "opacity" });
    return;
  }
  const barras = raiz.querySelectorAll("[data-barra]");
  if (barras.length) gsap.from(barras, { scaleY: 0, transformOrigin: "50% 100%", duration: 0.5, ease: "power3.out", stagger: 0.05, clearProps: "transform" });
  raiz.querySelectorAll<SVGPathElement>("[data-linea]").forEach((p, i) => {
    const largo = p.getTotalLength();
    gsap.fromTo(p, { strokeDasharray: largo, strokeDashoffset: largo }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.out", delay: i * 0.08, clearProps: "strokeDasharray,strokeDashoffset" });
  });
  gsap.from(raiz.querySelectorAll("[data-marca]"), { opacity: 0, duration: 0.3, delay: 0.55, stagger: 0.012 });
}

/** El menú «Nuevo»-style nace en su botón: escala .96 → 1 desde la esquina del botón, 160 ms. */
export function nacerMenu(el: HTMLElement | null, origen = "100% 0") {
  if (!el) return;
  gsap.killTweensOf(el);
  if (movimientoReducido()) {
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.1, clearProps: "opacity" });
    return;
  }
  gsap.fromTo(el, { opacity: 0, scale: 0.96, y: -4, transformOrigin: origen }, { opacity: 1, scale: 1, y: 0, duration: 0.16, ease: SALE, clearProps: "opacity,transform" });
}
