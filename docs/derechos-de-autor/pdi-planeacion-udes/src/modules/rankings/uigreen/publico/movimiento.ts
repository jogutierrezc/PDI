/* =============================================================================
   UI GreenMetric · página pública · movimiento (GSAP).

   Reglas: entradas ≤ 240 ms con power4.out; escalonado ≤ 30 ms y como mucho 9
   elementos escalonados (el resto entra con el último); los cuadros de la regleta
   se llenan al entrar; nada se mueve al teclear; con prefers-reduced-motion solo
   hay fundidos de ≤ 120 ms. Todo vive en un gsap.context (useGSAP), que se
   deshace al desmontar y es seguro con StrictMode. En reposo todo está puesto: si
   el script no corre, la página se ve completa.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import { reduced } from "../../../sostenible/widgets";

const EASE = "power4.out";
const D = 0.24;
const PASO = 0.03;
/** Escalonado ≤ 30 ms y solo los 9 primeros; el resto entra junto con el noveno. */
const escalon = (i: number) => Math.min(i, 8) * PASO;

const todos = (root: ParentNode, sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

/** Entrada de la portada: tira, titular, cifras y herramientas, carteles y cuadros de la regleta. */
export function entradaPortada(root: HTMLElement) {
  if (reduced()) return void gsap.from(root.querySelectorAll(".ugmp-in"), { opacity: 0, duration: 0.12, ease: "none", clearProps: "opacity" });
  const tl = gsap.timeline({ defaults: { ease: EASE } });
  tl.from(todos(root, ".ugmp-bands i"), { scaleX: 0, transformOrigin: "0 50%", duration: D, stagger: (i) => escalon(i), clearProps: "transform" }, 0)
    .from(todos(root, ".opt-line > span"), { yPercent: 104, duration: D, stagger: (i) => escalon(i), clearProps: "transform" }, 0)
    .from(todos(root, ".ugmp-in"), { y: 10, opacity: 0, duration: D, stagger: (i) => escalon(i), clearProps: "opacity,transform" }, 0.06)
    .from(todos(root, ".opt-card"), { clipPath: "inset(100% 100% 0% 0%)", duration: D, stagger: (i) => escalon(i), clearProps: "clipPath" }, 0.08);
  llenarCuadros(tl, root, 0.2);
}

/** Entrada de una categoría (también al cambiar de una a otra). */
export function entradaCategoria(root: HTMLElement) {
  if (reduced()) return void gsap.from(root.querySelectorAll(".ugmp-in"), { opacity: 0, duration: 0.12, ease: "none", clearProps: "opacity" });
  const tl = gsap.timeline({ defaults: { ease: EASE } });
  tl.from(todos(root, ".ugmp-in"), { y: 10, opacity: 0, duration: D, stagger: (i) => escalon(i), clearProps: "opacity,transform" }, 0);
  llenarCuadros(tl, root, 0.12);
}

/** Cada cuadro publicado se llena (alto → completo); el escalonado total no pasa de 0,3 s. */
function llenarCuadros(tl: gsap.core.Timeline, root: HTMLElement, at: number) {
  const on = todos(root, ".ugmp-tk.on");
  if (!on.length) return;
  tl.from(on, { scaleY: 0.15, opacity: 0.25, transformOrigin: "50% 100%", duration: D - 0.04, stagger: Math.min(0.012, 0.3 / on.length), clearProps: "transform,opacity" }, at);
}

/**
 * El cambio en vivo: cuando una lectura nueva llena o vacía un cuadro, solo ese cuadro se mueve (se llena o
 * se apaga con un fundido corto) y se avisa con un mensaje de estado. La primera lectura no cuenta.
 */
export function useCambiosEnVivo(root: RefObject<HTMLElement | null>, firma: string): boolean {
  const previo = useRef<Map<string, boolean> | null>(null);
  const [aviso, setAviso] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ahora = new Map<string, boolean>();
    const cambiados: [HTMLElement, boolean][] = [];
    for (const t of todos(el, ".ugmp-tk[data-k]")) {
      const k = t.dataset.k as string;
      const on = t.classList.contains("on");
      ahora.set(k, on);
      if (previo.current?.has(k) && previo.current.get(k) !== on) cambiados.push([t, on]);
    }
    previo.current = ahora;
    if (!cambiados.length) return;
    const ctx = gsap.context(() => {
      for (const [t, on] of cambiados) {
        if (reduced()) gsap.from(t, { opacity: 0.3, duration: 0.12, ease: "none", clearProps: "opacity" });
        else if (on) gsap.from(t, { scaleY: 0.15, duration: D, ease: EASE, transformOrigin: "50% 100%", clearProps: "transform" });
        else gsap.from(t, { opacity: 0.35, duration: D, ease: EASE, clearProps: "opacity" });
      }
    }, el);
    setAviso(true);
    const fin = window.setTimeout(() => setAviso(false), 5000);
    return () => {
      ctx.revert();
      window.clearTimeout(fin);
    };
  }, [root, firma]);

  return aviso;
}
