/* =============================================================================
   UDrive · el movimiento, con GSAP.

   Poco y con motivo, igual que Programas en Cifras y Pilo Enseñanza: los
   mosaicos entran en cascada al cambiar de carpeta (useCascada, del marco
   compartido), el editor crece desde su mosaico, y aquí se suman dos cosas:

     Subidas   la lista de subidas entra una vez (opacity + translateY 8 px,
               200 ms) y cada fila nueva aparece con un fundido de 160 ms.
     Ficha     la ficha de la galería cambia con un fundido de 160 ms al elegir
               otra gráfica; el contenido se queda legible desde el primer cuadro.

   Solo transform y opacity, curva expo-out. Con movimiento reducido no hay
   desplazamiento: queda un fundido corto o nada. Cada llamada mata la anterior
   sobre el mismo elemento, así que se puede interrumpir sin saltos.
   ========================================================================== */

import gsap from "gsap";
import { movimientoReducido } from "../../components/espacio/movimiento";

export { useCascada, crecerDesde, encogerHacia, entrarVentana, entrarFondo, entrarAviso } from "../../components/espacio/movimiento";

const EASE = "expo.out";

/** La bandeja de subidas entra desde abajo la primera vez que aparece. */
export function entrarSubidas(el: Element | null) {
  if (!el) return;
  gsap.killTweensOf(el);
  if (movimientoReducido()) {
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none", clearProps: "opacity" });
    return;
  }
  gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.2, ease: EASE, clearProps: "opacity,transform" });
}

/** Una fila que acaba de llegar (una subida nueva, un error) se hace notar sin moverse. */
export function entrarFila(el: Element | null) {
  if (!el) return;
  gsap.killTweensOf(el);
  gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: movimientoReducido() ? 0.1 : 0.16, ease: "none", clearProps: "opacity" });
}

/** Cambia la ficha de la galería: fundido corto, sin desplazamiento. */
export function cambiarFicha(el: Element | null) {
  if (!el || movimientoReducido()) return;
  gsap.killTweensOf(el);
  gsap.fromTo(el, { opacity: 0.4 }, { opacity: 1, duration: 0.16, ease: "none", clearProps: "opacity" });
}
