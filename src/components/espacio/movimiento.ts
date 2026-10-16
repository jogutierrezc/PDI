/* =============================================================================
   Espacio de archivos · movimiento (GSAP).

   Lo que el prototipo aprobado hace, portado tal cual:
     · los mosaicos y las filas entran en cascada (opacidad + 8 px, 240 ms);
     · el editor CRECE desde el mosaico que se abrió (clip-path, técnica FLIP):
       parte de la caja del mosaico y se abre hasta la pantalla completa;
     · el asistente desliza el paso (14 px + opacidad);
     · el panel de detalles y los paneles del editor se abren de ancho.

   Reglas: ≤ 300 ms en la interfaz, curvas expo/power3, nunca desde scale(0),
   solo transform, opacity y clip-path (y el ancho de los paneles laterales),
   y con movimiento reducido todo queda en su estado final sin animar.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import type { Caja } from "./tipos";

export type { Caja };

const useLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

export const movimientoReducido = (): boolean => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export function cajaDe(el: Element | null | undefined): Caja | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** El recorte que deja a la pantalla del tamaño de una caja (el mosaico de origen). */
export function recorteDeCaja(c: Caja, ancho: number, alto: number, radio = "10px"): string {
  const top = Math.max(0, c.top);
  const left = Math.max(0, c.left);
  const derecha = Math.max(0, ancho - c.left - c.width);
  const abajo = Math.max(0, alto - c.top - c.height);
  return `inset(${top}px ${derecha}px ${abajo}px ${left}px round ${radio})`;
}

/** Mosaicos y filas en cascada cada vez que cambia `clave`. */
export function useCascada(ref: RefObject<HTMLElement>, selector: string, clave: unknown) {
  useLayout(() => {
    const nodo = ref.current;
    if (!nodo || movimientoReducido()) return;
    const ctx = gsap.context(() => {
      const items = nodo.querySelectorAll(selector);
      if (!items.length) return;
      gsap.from(items, { opacity: 0, y: 8, duration: 0.24, ease: "power3.out", stagger: 0.03, clearProps: "opacity,transform" });
    }, nodo);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta la clave
  }, [clave]);
}

/** El editor crece desde la caja del mosaico hasta ocupar la pantalla. */
export function crecerDesde(el: HTMLElement, origen: Caja | null) {
  if (movimientoReducido()) return;
  const c = origen ?? { left: window.innerWidth / 2 - 60, top: window.innerHeight / 2 - 40, width: 120, height: 80 };
  gsap.fromTo(
    el,
    { clipPath: recorteDeCaja(c, window.innerWidth, window.innerHeight), opacity: 0.6 },
    { clipPath: "inset(0px 0px 0px 0px round 0px)", opacity: 1, duration: 0.28, ease: "expo.out", clearProps: "clipPath,opacity" },
  );
  const interior = el.querySelectorAll("[data-entra]");
  if (interior.length) gsap.from(interior, { opacity: 0, duration: 0.2, delay: 0.1, ease: "power3.out", clearProps: "opacity" });
  const filas = el.querySelectorAll("[data-fila-entra]");
  if (filas.length) gsap.from(filas, { opacity: 0, y: 6, duration: 0.22, ease: "power3.out", stagger: 0.02, delay: 0.08, clearProps: "opacity,transform" });
}

/** El editor se encoge de vuelta hacia su mosaico. */
export function encogerHacia(el: HTMLElement, destino: Caja | null, alTerminar: () => void) {
  if (movimientoReducido() || !destino) {
    alTerminar();
    return;
  }
  gsap.to(el, {
    clipPath: recorteDeCaja(destino, window.innerWidth, window.innerHeight),
    opacity: 0.4,
    duration: 0.22,
    ease: "power3.inOut",
    onComplete: () => {
      gsap.set(el, { clearProps: "clipPath,opacity" });
      alTerminar();
    },
  });
}

/** El paso del asistente desliza 14 px hacia la dirección del movimiento. */
export function deslizarPaso(el: HTMLElement | null, dir: 1 | -1) {
  if (!el || movimientoReducido()) return;
  gsap.fromTo(el, { x: dir * 14, opacity: 0 }, { x: 0, opacity: 1, duration: 0.22, ease: "power3.out", clearProps: "transform,opacity" });
}

/** Un panel lateral se abre y se cierra de ancho. */
export function usePanelAncho(ref: RefObject<HTMLElement>, abierto: boolean, ancho: number) {
  const primera = useRef(true);
  useLayout(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const destino = abierto ? ancho : 0;
    if (primera.current || movimientoReducido()) {
      gsap.set(nodo, { width: destino });
      primera.current = false;
      return;
    }
    const tween = gsap.to(nodo, { width: destino, duration: 0.22, ease: "expo.out", overwrite: true });
    return () => {
      tween.kill();
    };
  }, [abierto, ancho, ref]);
}

/** La ventana (asistente, buscador) entra desde scale(0.97) y opacidad, nunca desde cero. */
export function entrarVentana(el: HTMLElement | null) {
  if (!el || movimientoReducido()) return;
  gsap.fromTo(el, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.2, ease: "expo.out", clearProps: "transform,opacity" });
}

/** El fondo oscuro de una ventana se aclara. */
export function entrarFondo(el: HTMLElement | null) {
  if (!el || movimientoReducido()) return;
  gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power2.out", clearProps: "opacity" });
}

/** Un menú pequeño (columnas visibles) baja 4 px desde su botón. */
export function entrarMenu(el: HTMLElement | null) {
  if (!el || movimientoReducido()) return;
  gsap.fromTo(el, { opacity: 0, y: -4, scale: 0.97, transformOrigin: "top left" }, { opacity: 1, y: 0, scale: 1, duration: 0.16, ease: "power3.out", clearProps: "transform,opacity" });
}

/** El aviso (toast) sube y se desvanece. */
export function entrarAviso(el: HTMLElement | null) {
  if (!el || movimientoReducido()) return;
  gsap.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.22, ease: "expo.out", clearProps: "transform,opacity" });
}
