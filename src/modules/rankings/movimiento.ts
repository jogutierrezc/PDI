/* =============================================================================
   Movimiento del módulo de rankings, con GSAP. Lo usan el Recolector, el
   Posicionamiento, los Informes con Pilo y THE Impact.

   Reglas (Emil Kowalski + DESIGN.md):
     · entradas de 300 ms o menos, curva expo.out, escalón de 40 ms;
     · la salida siempre más corta que la entrada;
     · solo transform y opacity, salvo el pliegue de columnas (lo pide la mesa:
       el ancho de la pista de la rejilla se interpola, el contenido no se
       reacomoda porque cada columna tiene ancho mínimo y recorta);
     · nunca desde scale(0): lo más chico es 0,92 (o 0,08 en una barra que crece
       desde su eje, que es un dato y no un objeto que aparece);
     · nada de animar lo que dispara el teclado ni lo que se repite cientos de
       veces (aprobar, descartar, moverse en la lista): quien llama decide con
       `animar`;
     · con prefers-reduced-motion solo hay fundido de opacidad (o nada);
     · todo se crea dentro de gsap.context y se revierte al desmontar.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import gsap from "gsap";

export const DURACION = { entrada: 0.24, salida: 0.16, fundido: 0.16, pliegue: 0.26, hoja: 0.28, presion: 0.1, barra: 0.42 } as const;
export const ESCALONADO = 0.04;
const CURVA = "expo.out";
const SOLTAR = "power2.out";

/** useLayoutEffect en el navegador; en el servidor (renderToString) no hace nada. */
const useLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function movimientoReducido(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/* ---------- Entrada escalonada --------------------------------------------- */

/**
 * Los hijos que cumplen `selector` dentro de `ref` entran escalonados (8 px,
 * 240 ms, 40 ms de escalón) cada vez que cambia `clave`.
 */
export function useEntrada(ref: RefObject<HTMLElement>, selector: string, clave: unknown, activo = true) {
  useLayout(() => {
    const nodo = ref.current;
    if (!nodo || !activo) return;
    const ctx = gsap.context(() => {
      const elementos = nodo.querySelectorAll(selector);
      if (!elementos.length) return;
      if (movimientoReducido()) {
        gsap.fromTo(elementos, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: SOLTAR, clearProps: "opacity" });
        return;
      }
      gsap.fromTo(
        elementos,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: DURACION.entrada, ease: CURVA, stagger: ESCALONADO, clearProps: "transform,opacity" },
      );
    }, nodo);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuentan la clave y el selector
  }, [clave, selector, activo]);
}

/** Entrada de un solo elemento (p. ej. una evidencia recién subida). */
export function entradaUnica(el: Element | null) {
  if (!el) return;
  if (movimientoReducido()) {
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: SOLTAR, clearProps: "opacity" });
    return;
  }
  gsap.fromTo(el, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.18, ease: SOLTAR, clearProps: "transform,opacity" });
}

/* ---------- Fundido al cambiar de contexto -------------------------------- */

/**
 * Fundido corto de `ref` cuando cambia `clave` (otra nota, otro ODS, otra
 * pestaña). Sin desplazamiento por defecto: el contenido no «viaja», cambia.
 * `activo = false` (p. ej. el cambio vino del teclado) lo deja en seco.
 */
export function useFundido(ref: RefObject<HTMLElement>, clave: unknown, { activo = true, desplazamiento = 0 }: { activo?: boolean; desplazamiento?: number } = {}) {
  const primera = useRef(true);
  useLayout(() => {
    const nodo = ref.current;
    if (primera.current) {
      primera.current = false;
      return;
    }
    if (!nodo || !activo) return;
    const mover = desplazamiento && !movimientoReducido() ? { y: desplazamiento } : {};
    const tw = gsap.fromTo(nodo, { opacity: 0.35, ...mover }, { opacity: 1, y: 0, duration: DURACION.fundido, ease: SOLTAR, clearProps: "opacity,transform" });
    return () => {
      tw.kill();
      gsap.set(nodo, { clearProps: "opacity,transform" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta la clave
  }, [clave]);
}

/* ---------- Pliegue de columnas -------------------------------------------- */

/**
 * Interpola `grid-template-columns` de `ref` entre lo que medía antes de que
 * cambiara `clave` y lo que mide ahora (lo decide el CSS). Sirve para plegar o
 * desplegar un panel lateral sin saltos: la columna que se cierra recorta su
 * contenido en vez de reacomodarlo. Si cambia el número de pistas (otra
 * rejilla por tamaño de pantalla) o hay movimiento reducido, cambia en seco.
 */
export function usePliegue(ref: RefObject<HTMLElement>, clave: unknown) {
  const previo = useRef<string | null>(null);
  const tween = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!tween.current?.isActive()) previo.current = getComputedStyle(nodo).gridTemplateColumns;
    });
    ro.observe(nodo);
    return () => ro.disconnect();
  }, [ref]);

  useLayout(() => {
    const nodo = ref.current;
    if (!nodo) return;
    tween.current?.kill();
    gsap.set(nodo, { clearProps: "gridTemplateColumns" });
    const ahora = getComputedStyle(nodo).gridTemplateColumns;
    const antes = previo.current;
    previo.current = ahora;
    const pistas = (s: string) => s.trim().split(/\s+/).length;
    if (!antes || antes === ahora || pistas(antes) !== pistas(ahora) || movimientoReducido()) return;
    tween.current = gsap.fromTo(
      nodo,
      { gridTemplateColumns: antes },
      { gridTemplateColumns: ahora, duration: DURACION.pliegue, ease: CURVA, clearProps: "gridTemplateColumns" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta la clave
  }, [clave]);

  useEffect(() => () => void tween.current?.kill(), []);
}

/* ---------- Contador numérico ---------------------------------------------- */

/**
 * Cuando `valor` cambia, el texto de `ref` cuenta desde el valor anterior hasta
 * el nuevo con `formato` (360 ms, expo.out). El primer render ya trae el texto
 * final (sirve en el servidor y sin JavaScript). Con movimiento reducido, en seco.
 */
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
      duration: 0.36,
      ease: CURVA,
      onUpdate: () => void (nodo.textContent = fmt.current(estado.v)),
      onComplete: () => void (nodo.textContent = fmt.current(valor)),
    });
    return () => {
      tw.kill();
      nodo.textContent = fmt.current(valor);
    };
  }, [ref, valor]);
}

/* ---------- Barras que crecen ---------------------------------------------- */

/**
 * Las barras (`selector`) crecen desde su eje cuando cambia `clave` (por
 * defecto, solo al montar): scaleX desde la izquierda o scaleY desde abajo,
 * escalonadas. Funciona con HTML y con SVG (GSAP calcula el origen en SVG).
 */
export function useCrecer(
  ref: RefObject<Element>,
  selector: string,
  { eje = "x", clave = null, escalonado = ESCALONADO / 4 }: { eje?: "x" | "y"; clave?: unknown; escalonado?: number } = {},
) {
  useLayout(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const ctx = gsap.context(() => {
      const barras = nodo.querySelectorAll(selector);
      if (!barras.length) return;
      if (movimientoReducido()) {
        gsap.fromTo(barras, { opacity: 0 }, { opacity: 1, duration: 0.16, ease: SOLTAR, clearProps: "opacity" });
        return;
      }
      const desde = eje === "x" ? { scaleX: 0.08, transformOrigin: "0% 50%" } : { scaleY: 0.08, transformOrigin: "50% 100%" };
      gsap.fromTo(
        barras,
        { ...desde, opacity: 0 },
        {
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          duration: DURACION.barra,
          ease: CURVA,
          stagger: { each: escalonado, from: "start" },
          clearProps: "transform,opacity",
        },
      );
    }, nodo);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta la clave
  }, [clave]);
}

/* ---------- Indicador deslizante ------------------------------------------- */

/**
 * Coloca el elemento `[data-indicador]` de `ref` sobre el elemento activo
 * (`activo`, un selector dentro de `ref`): mismo top, left, ancho y alto. Si
 * `animar` es verdadero se desliza (200 ms, expo.out); si no, salta (moverse
 * con el teclado, aprobar y pasar a la siguiente). Marca `data-marca` en `ref`
 * cuando ya está colocado, para que el CSS deje de pintar el fondo de respaldo
 * del activo.
 */
export function useIndicador(ref: RefObject<HTMLElement>, activo: string, clave: unknown, animar: boolean) {
  const colocado = useRef(false);
  const animarRef = useRef(animar);
  animarRef.current = animar;

  const colocar = (deslizar: boolean) => {
    const nodo = ref.current;
    const marca = nodo?.querySelector<HTMLElement>(":scope > [data-indicador]");
    const el = nodo?.querySelector<HTMLElement>(activo);
    if (!nodo || !marca) return;
    if (!el) {
      gsap.set(marca, { opacity: 0 });
      return;
    }
    const caja = { x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight, opacity: 1 };
    if (deslizar && colocado.current && !movimientoReducido()) gsap.to(marca, { ...caja, duration: 0.2, ease: CURVA, overwrite: true });
    else gsap.set(marca, { ...caja, overwrite: true });
    colocado.current = true;
    nodo.dataset.marca = "";
  };

  useLayout(() => {
    colocar(animarRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta la clave
  }, [clave]);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => colocar(false));
    ro.observe(nodo);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se mide al montar
  }, [ref]);
}

/* ---------- Presión -------------------------------------------------------- */

/**
 * Feedback de presión para los controles propios (`selector`) dentro de `ref`:
 * 0,97 en 100 ms al apretar, vuelve en 160 ms al soltar. Por delegación: un
 * solo par de escuchas para toda la pantalla. Los botones de base.css ya lo
 * hacen con :active; esto es para los que no son .button-*.
 */
export function usePresion(ref: RefObject<HTMLElement>, selector: string) {
  useEffect(() => {
    const nodo = ref.current;
    if (!nodo || movimientoReducido()) return;
    let actual: HTMLElement | null = null;
    const soltar = () => {
      if (actual) gsap.to(actual, { scale: 1, duration: 0.16, ease: SOLTAR, clearProps: "transform" });
      actual = null;
    };
    const apretar = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(selector);
      if (!el || !nodo.contains(el) || el.matches(":disabled,[aria-disabled='true']")) return;
      actual = el;
      gsap.to(el, { scale: 0.97, duration: DURACION.presion, ease: SOLTAR });
    };
    nodo.addEventListener("pointerdown", apretar);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      nodo.removeEventListener("pointerdown", apretar);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [ref, selector]);
}

/* ---------- Hoja (panel deslizable u hoja inferior) ------------------------ */

export type Lado = "abajo" | "izquierda" | "derecha";

const fuera = (lado: Lado) => (lado === "abajo" ? { yPercent: 100 } : { xPercent: lado === "izquierda" ? -100 : 100 });

/** ¿El panel está flotando (hoja o cajón) o es una columna más de la rejilla? */
const flota = (el: HTMLElement) => /^(fixed|absolute)$/.test(getComputedStyle(el).position);

/**
 * Un panel que en pantallas angostas flota (el CSS le pone position fixed o
 * absolute) y en anchas es una columna. Mientras flota:
 *   · al abrirse entra desde su lado (280 ms, expo.out) y el velo se funde;
 *   · `cerrar()` sale en 160 ms y luego llama a `alCerrar` (con `animar: false`,
 *     p. ej. desde Escape, se cierra en seco);
 *   · con `asa` (selector de la manija) se arrastra hacia afuera: suelta más
 *     allá de un tercio, o con un gesto rápido (> 0,11 px/ms), y se cierra;
 *     si no, vuelve a su sitio. Más allá del borde contrario hay fricción;
 *   · al abrir se enfoca `[data-autofocus]` (o el panel) y al cerrar el foco
 *     vuelve a donde estaba.
 * Si no flota, no hace nada y `cerrar()` llama a `alCerrar` sin más.
 */
export function useHoja(
  ref: RefObject<HTMLElement>,
  abierta: boolean,
  { lado, alCerrar, velo, asa }: { lado: Lado; alCerrar: () => void; velo?: RefObject<HTMLElement>; asa?: string },
) {
  const cerrarRef = useRef(alCerrar);
  cerrarRef.current = alCerrar;
  const antesDeAbrir = useRef<HTMLElement | null>(null);
  const saliendo = useRef(false);

  useLayout(() => {
    const el = ref.current;
    if (!el) return;
    if (!abierta) {
      // Ya cerrada en el DOM: se quita lo que dejó la salida, antes de pintar.
      gsap.set(el, { clearProps: "transform,opacity" });
      return;
    }
    if (!flota(el)) return;
    saliendo.current = false;
    antesDeAbrir.current = document.activeElement as HTMLElement | null;
    const ctx = gsap.context(() => {
      if (movimientoReducido()) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.14, clearProps: "opacity" });
      else gsap.fromTo(el, fuera(lado), { xPercent: 0, yPercent: 0, duration: DURACION.hoja, ease: CURVA, clearProps: "transform" });
      if (velo?.current) gsap.fromTo(velo.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: SOLTAR, clearProps: "opacity" });
    });
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? el).focus({ preventScroll: true });
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta abrir
  }, [abierta]);

  const terminar = () => {
    saliendo.current = false;
    cerrarRef.current();
    antesDeAbrir.current?.focus?.({ preventScroll: true });
  };

  const cerrar = ({ animar = true }: { animar?: boolean } = {}) => {
    const el = ref.current;
    if (!el || !flota(el) || !animar || movimientoReducido()) {
      terminar();
      return;
    }
    if (saliendo.current) return;
    saliendo.current = true;
    gsap.to(el, { ...fuera(lado), duration: DURACION.salida, ease: "power2.in", onComplete: terminar });
    if (velo?.current) gsap.to(velo.current, { opacity: 0, duration: DURACION.salida, ease: SOLTAR });
  };

  /* Arrastre desde la manija. */
  useEffect(() => {
    const el = ref.current;
    if (!el || !asa || !abierta) return;
    const vertical = lado === "abajo";
    const signo = lado === "izquierda" ? -1 : 1;
    let inicio = 0;
    let t0 = 0;
    let delta = 0;
    let puntero: number | null = null;
    const mover = (e: PointerEvent) => {
      if (e.pointerId !== puntero) return;
      const d = ((vertical ? e.clientY : e.clientX) - inicio) * signo;
      delta = d < 0 ? d / (1 + Math.abs(d) / 40) : d; // fricción hacia adentro
      gsap.set(el, vertical ? { y: delta * signo } : { x: delta * signo });
    };
    const soltar = (e: PointerEvent) => {
      if (e.pointerId !== puntero) return;
      puntero = null;
      const tam = vertical ? el.offsetHeight : el.offsetWidth;
      const velocidad = Math.abs(delta) / Math.max(1, performance.now() - t0);
      if (delta > tam / 3 || (delta > 8 && velocidad > 0.11)) {
        saliendo.current = true;
        gsap.to(el, { ...fuera(lado), x: 0, y: 0, duration: DURACION.salida, ease: SOLTAR, onComplete: terminar });
        if (velo?.current) gsap.to(velo.current, { opacity: 0, duration: DURACION.salida });
      } else gsap.to(el, { x: 0, y: 0, duration: 0.22, ease: CURVA, clearProps: "transform" });
    };
    const apretar = (e: PointerEvent) => {
      if (puntero !== null || !(e.target as Element | null)?.closest(asa) || !flota(el)) return; // un solo dedo
      puntero = e.pointerId;
      inicio = vertical ? e.clientY : e.clientX;
      t0 = performance.now();
      delta = 0;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    el.addEventListener("pointerdown", apretar);
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", soltar);
    el.addEventListener("pointercancel", soltar);
    return () => {
      el.removeEventListener("pointerdown", apretar);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", soltar);
      el.removeEventListener("pointercancel", soltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se arma al abrir
  }, [abierta, asa, lado]);

  return { cerrar };
}
