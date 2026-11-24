/* =============================================================================
   Datos de Sostenibilidad · el movimiento, con GSAP.

   Las reglas del diseño aprobado: lo que se ve decenas de veces al día es corto
   (entradas de 240 ms o menos, ease-out fuerte, escalonado de 30 ms y hasta 9
   elementos); las salidas son más rápidas que las entradas; el menú nace en su
   botón; el modal se queda centrado (escala .96 → 1 y velo con fundido); las
   barras de avance crecen, las cifras cuentan y el recorrido tabla → portal se
   enciende solo al entrar a la sección.

   Nada se anima por acciones de teclado ni mientras se escribe: lo que abre o
   cierra el teclado cambia al instante (ver entradaPorTeclado). Solo transform
   y opacidad (más clip-path/filter si aportan). Con movimiento reducido queda
   un fundido de 120 ms o menos y ningún desplazamiento.

   Cada función devuelve su limpieza: se usa como retorno del useEffect, así los
   tweens mueren al desmontar y React StrictMode no deja fugas (todo vive en un
   gsap.context que se revierte).
   ========================================================================== */

import gsap from "gsap";
import { movimientoReducido } from "../../../components/espacio/movimiento";

const SALE = "power4.out";
const ESCALON = 0.03;
const MAX_ESCALONADOS = 9;
const nada = () => {};

/* ---------- Cómo se actuó por última vez: teclado o puntero ------------------------------------- */

let ultimaFueTeclado = false;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", () => (ultimaFueTeclado = true), true);
  window.addEventListener("pointerdown", () => (ultimaFueTeclado = false), true);
}

/** Verdadero si lo último que hizo la persona fue pulsar una tecla: ahí no se anima (se repite cientos de veces al día). */
export const entradaPorTeclado = (): boolean => ultimaFueTeclado;

/** Envuelve unos tweens en un contexto de GSAP y devuelve cómo deshacerlos. */
function contexto(alcance: Element | null | undefined, f: () => void): () => void {
  if (!alcance) return nada;
  const ctx = gsap.context(f, alcance as Element);
  return () => ctx.revert();
}

/* ---------- Entradas de sección ----------------------------------------------------------------- */

/** Una sección entra: sus hijos (los primeros 9) suben 6 px mientras aparecen, escalonados 30 ms. Sin hijos, la sección sube 8 px. */
export function entrar(el: Element | null, hijos?: string): () => void {
  return contexto(el, () => {
    if (!el) return;
    if (movimientoReducido()) {
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none", clearProps: "opacity" });
      return;
    }
    const lista = hijos ? [...el.querySelectorAll(hijos)].slice(0, MAX_ESCALONADOS) : [];
    if (lista.length) {
      gsap.from(lista, { opacity: 0, y: 6, duration: 0.22, ease: SALE, stagger: ESCALON, clearProps: "opacity,transform" });
    } else {
      gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.24, ease: SALE, clearProps: "opacity,transform" });
    }
  });
}

/** Un destello suave sobre una capa que está en opacidad 0 (la fila nueva, el valor que cambió). */
export function parpadear(capa: Element | null, intensidad = 0.9): () => void {
  return contexto(capa, () => {
    if (!capa) return;
    if (movimientoReducido()) {
      gsap.fromTo(capa, { opacity: intensidad }, { opacity: 0, duration: 0.12, ease: "none" });
      return;
    }
    gsap.timeline().fromTo(capa, { opacity: 0 }, { opacity: intensidad, duration: 0.12, ease: SALE }).to(capa, { opacity: 0, duration: 0.9, ease: "power2.out" });
  });
}

/** Las barras de avance crecen desde la izquierda. */
export function crecerMedidores(raiz: Element | null, retraso = 0): () => void {
  return contexto(raiz, () => {
    if (!raiz) return;
    const barras = [...raiz.querySelectorAll("[data-medidor]")].slice(0, 24);
    if (!barras.length) return;
    if (movimientoReducido()) {
      gsap.fromTo(barras, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none", clearProps: "opacity" });
      return;
    }
    gsap.from(barras, { scaleX: 0, transformOrigin: "0 50%", duration: 0.6, ease: "power3.out", delay: retraso, stagger: ESCALON, clearProps: "transform" });
  });
}

/** El recorrido tabla → gráfica → indicador → portal: cada paso aparece y su conector se enciende. */
export function encenderRecorrido(raiz: Element | null): () => void {
  return contexto(raiz, () => {
    if (!raiz) return;
    const pasos = [...raiz.querySelectorAll("[data-paso]")];
    const luces = [...raiz.querySelectorAll("[data-conector] i")];
    if (movimientoReducido()) {
      gsap.fromTo([...pasos, ...luces], { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none", clearProps: "opacity" });
      return;
    }
    const linea = gsap.timeline({ defaults: { ease: SALE } });
    pasos.forEach((p, i) => {
      linea.from(p, { opacity: 0, y: 8, duration: 0.24, clearProps: "opacity,transform" }, i * 0.14);
      if (luces[i]) linea.from(luces[i], { scaleX: 0, transformOrigin: "0 50%", duration: 0.22, ease: "power2.out", clearProps: "transform" }, i * 0.14 + 0.1);
    });
  });
}

/** Las cifras del recorrido cuentan desde cero hasta su valor (data-cuenta). Solo al entrar a la sección. */
export function contarCifras(raiz: Element | null): () => void {
  if (!raiz || movimientoReducido()) return nada;
  const cifras = [...raiz.querySelectorAll<HTMLElement>("[data-cuenta]")];
  const final = (el: HTMLElement) => Number(el.dataset.cuenta ?? 0);
  const pintar = (el: HTMLElement, n: number) => {
    // Se cambia el valor del mismo nodo de texto que React ya tiene, para no desincronizarlo.
    if (el.firstChild) el.firstChild.nodeValue = n.toLocaleString("es-CO");
  };
  const ctx = gsap.context(() => {
    cifras.forEach((el, i) => {
      const meta = final(el);
      if (!meta) return;
      const medidor = { v: 0 };
      pintar(el, 0);
      gsap.to(medidor, { v: meta, duration: 0.6, ease: SALE, delay: i * 0.14, snap: { v: 1 }, onUpdate: () => pintar(el, medidor.v) });
    });
  }, raiz);
  return () => {
    ctx.revert();
    cifras.forEach((el) => pintar(el, final(el)));
  };
}

/** Las barras de una gráfica crecen y las líneas se dibujan: solo cuando se abre la gráfica. */
export function dibujarGrafica(raiz: Element | null): () => void {
  return contexto(raiz, () => {
    if (!raiz) return;
    if (movimientoReducido()) {
      gsap.fromTo(raiz, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none", clearProps: "opacity" });
      return;
    }
    const barras = raiz.querySelectorAll("[data-barra]");
    if (barras.length) gsap.from(barras, { scaleY: 0, transformOrigin: "50% 100%", duration: 0.5, ease: "power3.out", stagger: 0.05, clearProps: "transform" });
    raiz.querySelectorAll<SVGPathElement>("[data-linea]").forEach((p, i) => {
      const largo = p.getTotalLength();
      gsap.fromTo(p, { strokeDasharray: largo, strokeDashoffset: largo }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.out", delay: i * 0.08, clearProps: "strokeDasharray,strokeDashoffset" });
    });
    gsap.from(raiz.querySelectorAll("[data-marca]"), { opacity: 0, duration: 0.3, delay: 0.55, stagger: 0.012, clearProps: "opacity" });
  });
}

/* ---------- El menú nace en su botón ------------------------------------------------------------ */

/** Un menú (popover) nace en su botón: escala .96 → 1 desde la esquina del botón, 160 ms. Con teclado, aparece al instante. */
export function nacerMenu(el: HTMLElement | null, origen = "100% 0"): () => void {
  if (entradaPorTeclado()) return nada;
  return contexto(el, () => {
    if (!el) return;
    if (movimientoReducido()) {
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.1, ease: "none", clearProps: "opacity" });
      return;
    }
    gsap.fromTo(el, { opacity: 0, scale: 0.96, y: -4, transformOrigin: origen }, { opacity: 1, scale: 1, y: 0, duration: 0.16, ease: SALE, clearProps: "opacity,transform" });
  });
}

/* ---------- El modal: la excepción, se queda centrado ------------------------------------------- */

/** Abre: el velo se funde y la caja escala .96 → 1 con opacidad, ~200 ms. Con teclado, al instante. */
export function abrirModal(velo: Element | null, caja: Element | null): () => void {
  if (entradaPorTeclado() || !velo || !caja) return nada;
  return contexto(caja, () => {
    if (movimientoReducido()) {
      gsap.fromTo([velo, caja], { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none", clearProps: "opacity" });
      return;
    }
    gsap.fromTo(velo, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out", clearProps: "opacity" });
    gsap.fromTo(caja, { opacity: 0, scale: 0.96, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.2, ease: SALE, clearProps: "opacity,transform" });
  });
}

/**
 * Cierra: ~140 ms (más rápido que al abrir) y luego avisa. Con teclado, o `instante`, avisa ya.
 * Devuelve la limpieza; si se desmonta a mitad, el aviso no se pierde porque el modal ya no existe.
 */
export function cerrarModal(velo: Element | null, caja: Element | null, alTerminar: () => void, instante = false): () => void {
  if (instante || entradaPorTeclado() || !velo || !caja) {
    alTerminar();
    return nada;
  }
  const ctx = gsap.context(() => {
    if (movimientoReducido()) {
      gsap.to([velo, caja], { opacity: 0, duration: 0.1, ease: "none", onComplete: alTerminar });
      return;
    }
    gsap.to(velo, { opacity: 0, duration: 0.14, ease: "power2.out" });
    gsap.to(caja, { opacity: 0, scale: 0.97, duration: 0.14, ease: "power2.out", onComplete: alTerminar });
  }, caja as Element);
  return () => ctx.revert();
}

/** Un toque a la caja: avisa que el clic de fuera no cierra porque hay cambios sin guardar. */
export function llamarAtencion(caja: Element | null): void {
  if (!caja || movimientoReducido()) return;
  gsap.killTweensOf(caja);
  gsap.fromTo(caja, { scale: 1.015 }, { scale: 1, duration: 0.18, ease: SALE, clearProps: "transform" });
}

/* ---------- Reordenar con movimiento de lugar (FLIP) -------------------------------------------- */

/** Antes de reordenar: dónde está cada elemento (por data-flip). */
export function capturarLugares(raiz: Element | null): Map<string, number> {
  const lugares = new Map<string, number>();
  raiz?.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => lugares.set(el.dataset.flip ?? "", el.getBoundingClientRect().top));
  return lugares;
}

/** Después de reordenar: cada elemento parte de donde estaba y se asienta en su lugar nuevo, 180 ms. */
export function asentarLugares(raiz: Element | null, antes: Map<string, number>): () => void {
  if (movimientoReducido()) return nada;
  return contexto(raiz, () => {
    raiz?.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const previo = antes.get(el.dataset.flip ?? "");
      if (previo === undefined) return;
      const dy = previo - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      gsap.fromTo(el, { y: dy }, { y: 0, duration: 0.18, ease: SALE, clearProps: "transform" });
    });
  });
}
