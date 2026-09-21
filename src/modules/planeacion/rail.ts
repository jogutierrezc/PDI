/* =============================================================================
   Portal de Planeación · el carril de los carruseles.

   Los dos carruseles de la portada —las fotografías de la oficina y el
   equipo— son la misma mecánica: una lista que se desplaza a lo ancho con
   anclaje (`scroll-snap`), con botones de anterior y siguiente.

   Se desplaza de verdad en lugar de intercambiar diapositivas con JavaScript,
   y eso resuelve solo lo que un carrusel hecho a mano suele romper: el gesto
   del móvil, la rueda horizontal del trackpad, la barra de desplazamiento del
   teclado, el buscador de la página encontrando texto fuera de pantalla y el
   lector de pantalla leyendo la lista entera.

   Dos medidas distintas, y conviene no confundirlas:
     · `index`  cuál es el elemento anclado, para el contador y la escala.
     · `atStart` / `atEnd`  si queda recorrido, que se mide en el propio
       desplazamiento y no contando elementos. En un carril donde caben cinco
       tarjetas de siete, el último elemento nunca llega a ser el anclado: con
       el conteo, la flecha de «siguiente» se quedaba encendida para siempre al
       final de la lista.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Rail<T extends HTMLElement> {
  ref: React.RefObject<T>;
  /** Índice del elemento anclado (el más visible). */
  index: number;
  goTo: (index: number) => void;
  next: () => void;
  previous: () => void;
  atStart: boolean;
  atEnd: boolean;
}

export function useRail<T extends HTMLElement>(count: number): Rail<T> {
  const ref = useRef<T>(null);
  const [index, setIndex] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: count <= 1 });

  useEffect(() => {
    const rail = ref.current;
    if (!rail || count === 0 || typeof IntersectionObserver === "undefined") return;
    const items = Array.from(rail.children) as HTMLElement[];
    // El observador solo avisa de lo que cambió, así que la proporción visible
    // de cada elemento se guarda entre avisos: sin eso, apuntar al más visible
    // haría saltar el índice a cualquiera que cruzara el borde.
    const ratios = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(entry.target, entry.intersectionRatio);
        let best = 0;
        let bestIndex = 0;
        items.forEach((item, position) => {
          const ratio = ratios.get(item) ?? 0;
          if (ratio > best) {
            best = ratio;
            bestIndex = position;
          }
        });
        setIndex(bestIndex);
      },
      { root: rail, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const item of items) observer.observe(item);
    return () => observer.disconnect();
  }, [count]);

  // Los extremos se leen del desplazamiento real, que es lo que decide si la
  // flecha lleva a alguna parte. Un margen de 2px absorbe el redondeo de los
  // navegadores al terminar un desplazamiento suave.
  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;
    const measure = () => {
      const travel = rail.scrollWidth - rail.clientWidth;
      setEdges({ start: rail.scrollLeft <= 2, end: travel <= 2 || rail.scrollLeft >= travel - 2 });
    };
    measure();
    rail.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(rail);
    return () => {
      rail.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [count]);

  const goTo = useCallback((target: number) => {
    const rail = ref.current;
    if (!rail) return;
    const items = rail.children;
    const item = items[Math.max(0, Math.min(items.length - 1, target))] as HTMLElement | undefined;
    if (!item) return;
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Coordenadas de pantalla y no `offsetLeft`: el carril no siempre es el
    // padre posicionado de sus elementos y el cálculo se iría de sitio.
    const shift = item.getBoundingClientRect().left - rail.getBoundingClientRect().left;
    rail.scrollTo({ left: rail.scrollLeft + shift, behavior: reduced ? "auto" : "smooth" });
  }, []);

  return {
    ref,
    index,
    goTo,
    next: () => goTo(index + 1),
    previous: () => goTo(index - 1),
    atStart: edges.start,
    atEnd: edges.end,
  };
}
