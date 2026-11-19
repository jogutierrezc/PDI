/* =============================================================================
   Planeación y Seguimiento · movimiento (GSAP), con parquedad.

   Solo tres momentos: conteo de las cifras clave y barras del resumen al entrar
   (una vez, ~600 ms), el paso del asistente (14 px y opacidad, 200 ms) y la
   entrada escalonada de las primeras filas. Nada se anima si la acción viene del
   teclado ni con «reducir movimiento»: ahí todo queda en su estado final.
   Misma regla que gestion-master/movimiento.ts: solo transform y opacidad.
   ========================================================================== */

import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import { movimientoReducido } from "../gestion-master/movimiento";

export { movimientoReducido };

/** Cuenta una cifra de 0 a su valor; `formato` la escribe (pesos, porcentaje…). */
export function contarHasta(el: HTMLElement, hasta: number, formato: (n: number) => string, duracion = 0.6) {
  gsap.killTweensOf(el);
  if (movimientoReducido() || hasta === 0) {
    el.textContent = formato(hasta);
    return;
  }
  const o = { v: 0 };
  gsap.to(o, { v: hasta, duration: duracion, ease: "power3.out", onUpdate: () => void (el.textContent = formato(o.v)), onComplete: () => void (el.textContent = formato(hasta)) });
}

/** Las barras crecen desde la izquierda (o desde abajo si son columnas), una sola vez. */
export function crecerBarras(raiz: Element | null) {
  if (!raiz || movimientoReducido()) return;
  const h = Array.from(raiz.querySelectorAll("[data-barra='x']"));
  const v = Array.from(raiz.querySelectorAll("[data-barra='y']"));
  if (h.length) gsap.from(h, { scaleX: 0, transformOrigin: "left center", duration: 0.5, ease: "power3.out", stagger: 0.02, clearProps: "transform" });
  if (v.length) gsap.from(v, { scaleY: 0, transformOrigin: "center bottom", duration: 0.5, ease: "power3.out", stagger: 0.03, clearProps: "transform" });
}

/** El paso del asistente llega por el lado al que se avanza. Con teclado o movimiento reducido no se desplaza. */
export function cambiarPaso(panel: Element | null, direccion: 1 | -1, desdeTeclado = false) {
  if (!panel) return;
  if (movimientoReducido() || desdeTeclado) {
    if (!desdeTeclado) gsap.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.12, clearProps: "opacity" });
    return;
  }
  gsap.fromTo(panel, { opacity: 0, x: 14 * direccion }, { opacity: 1, x: 0, duration: 0.2, ease: "power3.out", clearProps: "opacity,transform" });
}

/** Entrada del resumen: cifras que cuentan y barras que crecen, una vez al llegar los datos. */
export function useEntradaResumen(ref: RefObject<HTMLElement | null>, clave: unknown) {
  const hecho = useRef<unknown>(null);
  useLayoutEffect(() => {
    const raiz = ref.current;
    if (!raiz || hecho.current === clave) return;
    hecho.current = clave;
    raiz.querySelectorAll<HTMLElement>("[data-cuenta]").forEach((el) => {
      const hasta = Number(el.dataset.cuenta);
      const tipo = el.dataset.formato;
      if (Number.isFinite(hasta)) contarHasta(el, hasta, (n) => (tipo === "millones" ? `$ ${new Intl.NumberFormat("es-CO").format(Math.floor(n / 1e6))} M` : tipo === "pct" ? `${Math.round(n)} %` : new Intl.NumberFormat("es-CO").format(Math.round(n))));
    });
    crecerBarras(raiz);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la clave (los datos), no con cada filtro
  }, [clave]);
}
