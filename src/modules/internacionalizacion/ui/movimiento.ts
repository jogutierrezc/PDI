/* =============================================================================
   Internacionalización · movimiento (GSAP).

   Reutiliza la base de rankings (src/modules/rankings/movimiento.ts): entrada
   escalonada, fundido, presión, indicador y cajón. Solo redefine las dos
   piezas que allí pasan de 300 ms —las barras que crecen (420 ms) y el
   contador (360 ms)— para cumplir la regla del módulo: ≤ 300 ms, expo.out,
   escalón de 40 ms, solo transform/opacity y estado final visible en el
   servidor. Con movimiento reducido: fundido o nada. Nunca clearProps:"all".
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import { movimientoReducido } from "../../rankings/movimiento";

export { movimientoReducido, useEntrada, useFundido, useIndicador, usePresion, useHoja, entradaUnica } from "../../rankings/movimiento";

const useLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;
const DURACION_BARRA = 0.28;
const DURACION_CUENTA = 0.28;

/**
 * Las barras (`selector`) crecen desde su eje cuando cambia `clave`:
 * scaleX desde la izquierda (o scaleY desde abajo), 280 ms, escalón de 10 ms.
 */
export function useCrecer(ref: RefObject<Element>, selector: string, { eje = "x", clave = null }: { eje?: "x" | "y"; clave?: unknown } = {}) {
  useLayout(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const ctx = gsap.context(() => {
      const barras = nodo.querySelectorAll(selector);
      if (!barras.length) return;
      if (movimientoReducido()) {
        gsap.fromTo(barras, { opacity: 0 }, { opacity: 1, duration: 0.14, ease: "power2.out", clearProps: "opacity" });
        return;
      }
      const desde = eje === "x" ? { scaleX: 0.08, transformOrigin: "0% 50%" } : { scaleY: 0.08, transformOrigin: "50% 100%" };
      gsap.fromTo(barras, { ...desde, opacity: 0 }, { scaleX: 1, scaleY: 1, opacity: 1, duration: DURACION_BARRA, ease: "expo.out", stagger: 0.01, clearProps: "transform,opacity" });
    }, nodo);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta la clave
  }, [clave]);
}

/** El número cuenta del valor anterior al nuevo (280 ms). El primer render ya trae el final. */
export function useContador(ref: RefObject<HTMLElement>, valor: number, formato: (n: number) => string) {
  const anterior = useRef(valor);
  const fmt = useRef(formato);
  fmt.current = formato;
  useEffect(() => {
    const nodo = ref.current;
    const desde = anterior.current;
    anterior.current = valor;
    if (!nodo) return;
    if (desde === valor || !Number.isFinite(desde) || !Number.isFinite(valor) || movimientoReducido()) {
      nodo.textContent = fmt.current(valor);
      return;
    }
    const estado = { v: desde };
    const tw = gsap.to(estado, {
      v: valor,
      duration: DURACION_CUENTA,
      ease: "expo.out",
      onUpdate: () => void (nodo.textContent = fmt.current(Math.round(estado.v))),
      onComplete: () => void (nodo.textContent = fmt.current(valor)),
    });
    return () => {
      tw.kill();
      nodo.textContent = fmt.current(valor);
    };
  }, [ref, valor]);
}
