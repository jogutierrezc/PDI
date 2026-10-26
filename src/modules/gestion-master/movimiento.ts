/* =============================================================================
   Gestión Master · movimiento (GSAP).

   La especificación aprobada en la propuesta (docs/gestion-master):
     · entrada de la bandeja: opacidad + 8 px, 260 ms, desfase de 30 ms, solo las 12 primeras filas;
     · lista a detalle: 28 px + opacidad, 220 ms (con teclado no se anima: es una acción repetida);
     · panel de confirmación: opacidad + escala 0.97 a 1, 200 ms;
     · sello de la decisión: entra 200 ms, espera 700 ms, sale 180 ms;
     · fila que sale de un filtro: opacidad + 12 px y luego el alto, 200 ms (el alto es la excepción: no hay equivalente en transform);
     · línea del flujo: scaleX 320 ms; punto 0.9 a 1, 180 ms;
     · contadores: 450 ms; barras: scaleX 400 ms, una vez.
   Reglas: solo transform y opacity, curvas power3/power2, nunca desde scale(0), y con «reducir movimiento»
   no hay desplazamientos ni escalas: quedan fundidos de 120 ms o cambios instantáneos.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import gsap from "gsap";

const useLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

export const movimientoReducido = (): boolean =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

type Blancos = Element | Element[] | NodeListOf<Element> | HTMLCollection | null | undefined;
const lista = (b: Blancos): Element[] => (!b ? [] : b instanceof Element ? [b] : Array.from(b));

/** Entrada escalonada: opacidad + 8 px. Con movimiento reducido, solo un fundido. */
export function entrada(blancos: Blancos, max = 12) {
  const els = lista(blancos).slice(0, max);
  if (!els.length) return;
  if (movimientoReducido()) {
    gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: 0.12, clearProps: "opacity" });
    return;
  }
  gsap.fromTo(els, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.26, ease: "power3.out", stagger: 0.03, clearProps: "opacity,transform" });
}

/** El panel de detalle llega por el lado de la lista. Con teclado no se anima. */
export function deslizar(panel: Element | null, fondo: Element | null, desdeTeclado: boolean) {
  if (!panel || desdeTeclado) return;
  if (movimientoReducido()) {
    gsap.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.12, clearProps: "opacity" });
    return;
  }
  gsap.fromTo(panel, { opacity: 0, x: 28 }, { opacity: 1, x: 0, duration: 0.22, ease: "power3.out", clearProps: "opacity,transform" });
  if (fondo) gsap.fromTo(fondo, { opacity: 0 }, { opacity: 1, duration: 0.16, clearProps: "opacity" });
}

/** El paso del formulario: llega por el lado al que se avanza (14 px y opacidad, 200 ms). Con movimiento reducido, solo un fundido. */
export function cambiarPaso(panel: Element | null, direccion: 1 | -1) {
  if (!panel) return;
  if (movimientoReducido()) {
    gsap.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.12, clearProps: "opacity" });
    return;
  }
  gsap.fromTo(panel, { opacity: 0, x: 14 * direccion }, { opacity: 1, x: 0, duration: 0.2, ease: "power3.out", clearProps: "opacity,transform" });
}

/** Un panel que aparece (confirmación, formulario en línea). */
export function aparecer(el: Element | null) {
  if (!el) return;
  if (movimientoReducido()) {
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.12, clearProps: "opacity" });
    return;
  }
  gsap.fromTo(el, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power3.out", clearProps: "opacity,transform" });
}

/** El sello de una decisión: entra, espera y sale; al terminar llama a `alTerminar`. */
export function sello(el: Element | null, alTerminar: () => void) {
  if (!el) {
    alTerminar();
    return;
  }
  const h = el as HTMLElement;
  if (movimientoReducido()) {
    gsap.timeline({ onComplete: alTerminar }).to(h, { opacity: 1, duration: 0.12 }).to(h, { opacity: 0, duration: 0.12 }, "+=0.8");
    return;
  }
  gsap
    .timeline({ onComplete: alTerminar })
    .fromTo(h, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power3.out" })
    .to(h, { opacity: 0, duration: 0.18, ease: "power1.in" }, "+=0.7");
}

/** Saca filas de la lista (ya no cumplen el filtro) sin que la lista salte. */
export function salirFilas(blancos: Blancos, alTerminar: () => void) {
  const els = lista(blancos);
  if (!els.length || movimientoReducido()) {
    alTerminar();
    return;
  }
  gsap.to(els, {
    opacity: 0,
    x: 12,
    duration: 0.2,
    ease: "power2.inOut",
    onComplete: () => {
      gsap.to(els, { height: 0, duration: 0.2, ease: "power2.inOut", onComplete: alTerminar });
    },
  });
}

/** El flujo avanza un paso: la línea se llena y el punto se asienta. */
export function avanzarPaso(linea: Element | null, punto: Element | null) {
  if (movimientoReducido()) return;
  if (linea) gsap.fromTo(linea, { scaleX: 0 }, { scaleX: 1, duration: 0.32, ease: "power2.inOut", clearProps: "transform" });
  if (punto) gsap.fromTo(punto, { scale: 0.9 }, { scale: 1, duration: 0.18, ease: "power3.out", clearProps: "transform" });
}

/** Un número que cambia, contado en 450 ms. */
export function contar(el: HTMLElement, desde: number, hasta: number) {
  gsap.killTweensOf(el);
  if (movimientoReducido() || desde === hasta) {
    el.textContent = String(hasta);
    return;
  }
  const o = { v: desde };
  gsap.to(o, {
    v: hasta,
    duration: 0.45,
    ease: "power2.out",
    onUpdate: () => {
      el.textContent = String(Math.round(o.v));
    },
    onComplete: () => {
      el.textContent = String(hasta);
    },
  });
}

/** Las barras crecen desde la izquierda, una sola vez. */
export function barras(raiz: Element | null) {
  if (!raiz || movimientoReducido()) return;
  const els = Array.from(raiz.querySelectorAll(".gm-barra > i"));
  if (els.length) gsap.from(els, { scaleX: 0, transformOrigin: "left center", duration: 0.4, ease: "power3.out", stagger: 0.025 });
}

/** Cambio de periodo o sede: un fundido corto antes de que lleguen los datos nuevos. */
export function cruzar(el: Element | null, cambiar: () => void) {
  if (!el || movimientoReducido()) {
    cambiar();
    return;
  }
  gsap.to(el, {
    opacity: 0.35,
    filter: "blur(2px)",
    duration: 0.12,
    ease: "power1.out",
    onComplete: () => {
      cambiar();
      gsap.to(el, { opacity: 1, filter: "blur(0px)", duration: 0.18, ease: "power2.out", clearProps: "filter,opacity" });
    },
  });
}

/** Anima la entrada de los hijos que cumplen `selector` cada vez que cambia `clave`. */
export function useEntrada(ref: RefObject<HTMLElement | null>, selector: string, clave: unknown, activo = true) {
  useLayout(() => {
    if (!activo || !ref.current) return;
    entrada(ref.current.querySelectorAll(selector));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, activo]);
}

/** Entrada de las barras de una tabla cuando llegan los datos. */
export function useBarras(ref: RefObject<HTMLElement | null>, clave: unknown) {
  useLayout(() => {
    barras(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
}

/** El número anterior, para contar desde él. */
export function useAnterior<T>(valor: T): T | undefined {
  const r = useRef<T | undefined>(undefined);
  useEffect(() => {
    r.current = valor;
  }, [valor]);
  return r.current;
}
