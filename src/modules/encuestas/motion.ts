/* =============================================================================
   Encuestas con Pilo · el movimiento, con GSAP.

   Mismo criterio que Pilo Enseñanza: solo transform y opacity, salida de ease
   fuerte, UI en 300 ms o menos (las puestas en escena de Pilo, hasta ~500 ms),
   salidas más rápidas que las entradas, cascadas de 30 a 50 ms. No se anima
   nada que se haga con el teclado a menudo (reordenar con flechas va en seco).
   Con movimiento reducido quedan fundidos cortos. Cada llamada mata lo anterior
   sobre los mismos elementos y `kill` limpia al desmontar.

     exitRow       una fila que se borra sale (140 ms) y luego se avisa.
     flip          FLIP al reordenar con el puntero: cada elemento va de donde
                   estaba a donde quedó.
     slidePanel    el panel lateral (propiedades, detalle) entra desde su borde.
     overlayAt     el overlay de Pilo junto al campo enfocado.
     draftIn       el borrador de la sugerencia de Pilo aparece.
     piloIn        Pilo entra en escena (pantalla de salida).
     bars          las barras de resultados crecen desde cero.
   ========================================================================== */

import gsap from "gsap";
import { EASE_OUT, reducedMotion } from "../impacto/pilo/motion";

export { enterList, thinkingDots } from "../admin/pilo-ensenanza/motion";

const corto = (el: Element | Element[]) => gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });

/** Mata los tweens de estos elementos (al desmontar). */
export function kill(...targets: (Element | Element[] | null | undefined)[]) {
  for (const t of targets) if (t) gsap.killTweensOf(t);
}

/** La fila sale (opacity + 8 px, 140 ms) y al terminar corre `despues`. */
export function exitRow(row: Element | null, despues: () => void) {
  if (!row || reducedMotion()) {
    if (row) gsap.to(row, { opacity: 0, duration: 0.12, ease: "none", onComplete: despues });
    else despues();
    return;
  }
  gsap.killTweensOf(row);
  gsap.to(row, { opacity: 0, x: -8, duration: 0.14, ease: "power2.in", onComplete: despues });
}

/** FLIP: `antes` son los rectángulos medidos antes del cambio; cada elemento viaja hasta su sitio nuevo (220 ms). */
export function flip(items: HTMLElement[], antes: Map<string, DOMRect>) {
  if (reducedMotion()) return;
  for (const el of items) {
    const id = el.dataset.flip;
    const a = id ? antes.get(id) : undefined;
    if (!a) continue;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (!dx && !dy) continue;
    gsap.killTweensOf(el);
    gsap.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, duration: 0.22, ease: EASE_OUT, clearProps: "transform" });
  }
}

/** Mide los rectángulos de los elementos con data-flip (llamar justo antes del cambio). */
export function medir(items: HTMLElement[]): Map<string, DOMRect> {
  const m = new Map<string, DOMRect>();
  for (const el of items) if (el.dataset.flip) m.set(el.dataset.flip, el.getBoundingClientRect());
  return m;
}

/** Un panel lateral entra desde su borde (160 px, 240 ms). */
export function slidePanel(panel: Element | null, desde: 1 | -1 = 1) {
  if (!panel) return;
  gsap.killTweensOf(panel);
  if (reducedMotion()) return void corto(panel);
  gsap.fromTo(panel, { opacity: 0, x: 24 * desde }, { opacity: 1, x: 0, duration: 0.24, ease: EASE_OUT, clearProps: "transform,opacity" });
}

/** El overlay de Pilo aparece junto al campo: «vuela» sube 6 px con escala .97 (180 ms), «aparece» solo se funde, «ninguna» no se anima. */
export function overlayAt(node: Element | null, entrada: "vuela" | "aparece" | "ninguna" = "vuela") {
  if (!node || entrada === "ninguna") return;
  gsap.killTweensOf(node);
  if (reducedMotion() || entrada === "aparece") return void corto(node);
  gsap.fromTo(node, { opacity: 0, y: 6, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.18, ease: EASE_OUT, clearProps: "transform,opacity" });
}

/** El borrador de Pilo aparece: bloque con 6 px y, línea a línea, el texto (cascada corta). */
export function draftIn(node: Element | null) {
  if (!node) return;
  gsap.killTweensOf(node);
  if (reducedMotion()) return void corto(node);
  gsap.fromTo(node, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.24, ease: EASE_OUT, clearProps: "transform,opacity" });
}

/** Pilo entra en escena (cara y globo): 420 ms, de abajo y con fundido. */
export function piloIn(nodes: Element[]) {
  if (!nodes.length) return;
  gsap.killTweensOf(nodes);
  if (reducedMotion()) return void corto(nodes);
  gsap.fromTo(nodes, { opacity: 0, y: 14, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.42, stagger: 0.05, ease: EASE_OUT, clearProps: "transform,opacity" });
}

/** Barras de resultados: crecen desde cero hasta su parte (280 ms, cascada de 40 ms). */
export function bars(items: HTMLElement[]) {
  if (!items.length) return;
  gsap.killTweensOf(items);
  if (reducedMotion()) return;
  gsap.fromTo(items, { scaleX: 0 }, { scaleX: 1, duration: 0.28, stagger: 0.04, ease: EASE_OUT, clearProps: "transform" });
}
