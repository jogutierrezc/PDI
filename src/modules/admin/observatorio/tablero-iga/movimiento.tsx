/* =============================================================================
   Tablero IGA · movimiento (GSAP).

   Reglas: solo transform y opacity; entradas con ease-out fuerte y ≤ 300 ms; nada
   parte de scale(0); las cifras cuentan hacia su valor en menos de medio segundo;
   con «reducir movimiento» todo aparece de una vez. La cascada se dispara al
   cambiar de pestaña o de periodo (ocasional), no al filtrar (frecuente).
   ========================================================================== */

import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import gsap from "gsap";

const reducido = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Entrada en cascada de las tarjetas y crecimiento de las barras al cambiar `clave`. */
export function useEntradaIga(ref: RefObject<HTMLElement>, clave: string) {
  useLayoutEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const ctx = gsap.context(() => {
      const tarjetas = Array.from(nodo.querySelectorAll(".iga-viz"));
      const barras = Array.from(nodo.querySelectorAll(".iga-barras__t i, .iga-cb i"));
      if (reducido()) {
        gsap.from(tarjetas, { opacity: 0, duration: 0.12, clearProps: "opacity" });
        return;
      }
      gsap.from(tarjetas.slice(0, 8), { opacity: 0, y: 10, duration: 0.28, ease: "power4.out", stagger: 0.045, clearProps: "opacity,transform" });
      gsap.from(barras.slice(0, 80), { scaleX: 0, transformOrigin: "0 50%", duration: 0.42, ease: "power3.out", stagger: 0.008, delay: 0.1, clearProps: "transform" });
    }, nodo);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta la clave
  }, [clave]);
}

/** Una cifra que cuenta desde la anterior hasta la nueva. `formato` pinta el número. */
export function Cuenta({ valor, formato }: { valor: number; formato: (v: number) => string }) {
  const el = useRef<HTMLElement>(null);
  const previo = useRef<number | null>(null);
  useLayoutEffect(() => {
    const nodo = el.current;
    if (!nodo) return;
    const desde = previo.current;
    previo.current = valor;
    if (reducido() || desde === null || desde === valor) {
      nodo.textContent = formato(valor);
      if (desde === null && !reducido()) gsap.from(nodo, { opacity: 0, y: 6, duration: 0.28, ease: "power4.out", clearProps: "opacity,transform" });
      return;
    }
    const proxy = { v: desde };
    const tween = gsap.to(proxy, { v: valor, duration: 0.4, ease: "power3.out", onUpdate: () => { nodo.textContent = formato(proxy.v); }, onComplete: () => { nodo.textContent = formato(valor); } });
    return () => { tween.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `formato` es estable por uso
  }, [valor]);
  return <b ref={el}>{formato(valor)}</b>;
}
