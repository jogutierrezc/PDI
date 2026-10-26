/* =============================================================================
   UDrive · Unidades de trabajo · el movimiento, con GSAP.

   Cada transición responde a una pregunta: ¿para qué se mueve? Solo se anima
   transform y opacity (salvo el colapso de la fila de una persona que se quita,
   donde no hay equivalente con transform). Fichas de tiempo y curvas comunes:

     rápido 140 ms   salidas y cambios de color
     base   220 ms   entradas
     lento  380 ms   de la tarjeta a la página, y la confirmación
     escalón 45 ms   entre hermanos, hasta 8

   Curva de entrada y salida: power4.out (≈ cubic-bezier(0.23, 1, 0.32, 1)).
   Nada con ease-in. Nada parte de scale(0). Con «reducir movimiento» todo se
   vuelve un fundido de 120 ms y no hay desplazamiento. Cada llamada mata la
   anterior sobre el mismo elemento (overwrite), así que se puede interrumpir.
   Lo que se usa cientos de veces al día (búsqueda, filtros, teclado) no entra
   en cascada: solo se funde.
   ========================================================================== */

import gsap from "gsap";
import { movimientoReducido } from "../../../components/espacio/movimiento";

export const FICHAS = { rapido: 0.14, base: 0.22, lento: 0.38, escalon: 0.045, maxEscalon: 8 } as const;
const ENTRA = "power4.out";
const SALE = "power2.out";
const LIMPIAR = "transform,opacity";

type Objetivo = Element | Element[] | NodeListOf<Element> | null | undefined;
const hay = (o: Objetivo): o is Element | Element[] | NodeListOf<Element> => Boolean(o) && (!("length" in (o as object)) || (o as Element[]).length > 0);

/** Un fundido corto: el único movimiento que queda con «reducir movimiento». */
export function fundir(o: Objetivo, duracion: number = FICHAS.rapido) {
  if (!hay(o)) return;
  gsap.fromTo(o, { opacity: 0 }, { opacity: 1, duration: movimientoReducido() ? 0.12 : duracion, ease: "none", overwrite: "auto", clearProps: "opacity" });
}

/** Tarjetas del índice: entran en cascada (opacity, translateY 12 → 0). Solo la primera vez y al volver. */
export function entrarTarjetas(o: Objetivo) {
  if (!hay(o)) return;
  const lista = Array.from(o as ArrayLike<Element>).slice(0, FICHAS.maxEscalon);
  if (movimientoReducido()) return fundir(lista);
  gsap.fromTo(lista, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: FICHAS.base, ease: ENTRA, stagger: FICHAS.escalon, overwrite: "auto", clearProps: LIMPIAR });
}

/** Los bloques del inicio de una unidad. */
export function entrarBloques(o: Objetivo, retraso = 0) {
  if (!hay(o)) return;
  const lista = Array.from(o as ArrayLike<Element>).slice(0, FICHAS.maxEscalon);
  if (movimientoReducido()) return fundir(lista);
  gsap.fromTo(lista, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: FICHAS.base, ease: ENTRA, stagger: FICHAS.escalon, delay: retraso, overwrite: "auto", clearProps: LIMPIAR });
}

/**
 * De la tarjeta a la página de la unidad: la portada sale del rectángulo de la tarjeta (transform) y el texto
 * aparece a los 160 ms, ya con la portada casi en su sitio. Es la única transición que cuenta de dónde viene algo.
 */
export function desdeTarjeta(portada: HTMLElement | null, origen: DOMRect | null) {
  if (!portada) return;
  if (movimientoReducido() || !origen) return fundir(portada);
  const r = portada.getBoundingClientRect();
  if (!r.width || !r.height) return fundir(portada);
  const textos = portada.querySelectorAll(".un-hero__txt, .un-hero__mono, .un-hero__giant");
  gsap.fromTo(
    portada,
    { x: origen.left - r.left, y: origen.top - r.top, scaleX: origen.width / r.width, scaleY: origen.height / r.height, transformOrigin: "0 0" },
    { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: FICHAS.lento, ease: ENTRA, overwrite: "auto", clearProps: "transform" },
  );
  if (textos.length) gsap.fromTo(textos, { opacity: 0 }, { opacity: 1, duration: FICHAS.base, delay: 0.16, ease: "none", overwrite: "auto", clearProps: "opacity" });
}

/** Una persona recién añadida: opacity y translateY -8 → 0, más un resalte de fondo que se apaga. */
export function entrarFila(o: Objetivo) {
  if (!hay(o)) return;
  const lista = Array.from(o as ArrayLike<Element>);
  if (movimientoReducido()) {
    fundir(lista);
  } else {
    gsap.fromTo(lista, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: FICHAS.base, ease: ENTRA, stagger: 0.03, overwrite: "auto", clearProps: LIMPIAR });
  }
  gsap.fromTo(lista, { backgroundColor: "#fdecc8" }, { backgroundColor: "rgba(0,0,0,0)", duration: movimientoReducido() ? 0.2 : 0.6, ease: "power1.out", clearProps: "backgroundColor" });
}

/** Quitar una persona: sale hacia la izquierda en 140 ms y luego se cierra el hueco en otros 140 ms. */
export function quitarFila(fila: HTMLElement | null, hecho: () => void) {
  if (!fila) return hecho();
  if (movimientoReducido()) {
    gsap.to(fila, { opacity: 0, duration: 0.12, ease: "none", onComplete: hecho });
    return;
  }
  gsap.to(fila, {
    opacity: 0,
    x: -14,
    duration: FICHAS.rapido,
    ease: SALE,
    overwrite: "auto",
    onComplete: () => void gsap.to(fila, { height: 0, paddingTop: 0, paddingBottom: 0, duration: FICHAS.rapido, ease: SALE, onComplete: hecho }),
  });
}

/** Cambió un papel: el campo se resalta y se apaga. Sin movimiento. */
export function resaltar(o: Objetivo) {
  if (!hay(o)) return;
  gsap.fromTo(o, { backgroundColor: "#fdecc8" }, { backgroundColor: "#ffffff", duration: movimientoReducido() ? 0.2 : 0.6, ease: "power1.out", overwrite: "auto", clearProps: "backgroundColor" });
}

/** Avance entre pasos del formulario: sale 140 ms hacia atrás y entra 220 ms desde el lado de la dirección. */
export function pasoFormulario(sale: HTMLElement | null, entra: HTMLElement | null, direccion: 1 | -1, cambio: () => void) {
  const alEntrar = () => {
    cambio();
    if (!entra) return;
    if (movimientoReducido()) return fundir(entra);
    gsap.fromTo(entra, { opacity: 0, x: direccion * 16 }, { opacity: 1, x: 0, duration: FICHAS.base, ease: ENTRA, overwrite: "auto", clearProps: LIMPIAR });
  };
  if (!sale || movimientoReducido()) return alEntrar();
  gsap.to(sale, { opacity: 0, x: -direccion * 12, duration: FICHAS.rapido, ease: SALE, overwrite: "auto", onComplete: () => { gsap.set(sale, { clearProps: LIMPIAR }); alEntrar(); } });
}

/** Confirmación de la creación: la portada y las líneas entran en cascada (opacity, translateY, scale 0,97 → 1). */
export function confirmar(o: Objetivo) {
  if (!hay(o)) return;
  const lista = Array.from(o as ArrayLike<Element>);
  if (movimientoReducido()) return fundir(lista);
  gsap.fromTo(lista, { opacity: 0, y: 10, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: FICHAS.lento, ease: ENTRA, stagger: FICHAS.escalon, overwrite: "auto", clearProps: LIMPIAR });
}

/** Un aviso o un error que aparece dentro de la página: opacity y un desplazamiento mínimo. */
export function entrarNota(o: Objetivo) {
  if (!hay(o)) return;
  if (movimientoReducido()) return fundir(o);
  gsap.fromTo(o, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: FICHAS.base, ease: ENTRA, overwrite: "auto", clearProps: LIMPIAR });
}

/** La barra de uso crece desde la izquierda (transform) la primera vez que se ve. */
export function llenarBarra(o: Objetivo) {
  if (!hay(o)) return;
  if (movimientoReducido()) return;
  gsap.fromTo(o, { scaleX: 0, transformOrigin: "0 50%" }, { scaleX: 1, duration: FICHAS.lento, ease: ENTRA, overwrite: "auto", clearProps: "transform" });
}
