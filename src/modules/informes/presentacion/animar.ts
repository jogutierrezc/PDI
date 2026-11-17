/* =============================================================================
   Presentación con Pilo · animaciones con GSAP (carga solo al abrir el visor).

   Entradas escalonadas en cada diapositiva: opacidad y un desplazamiento corto
   (28 px) con la curva fuerte de salida cubic-bezier(0.23, 1, 0.32, 1); cada
   tween dura 600 ms (≤ 700) y el escalonado total no pasa de 500 ms. Con
   «reducir movimiento» no se anima nada: la diapositiva aparece completa.
   ========================================================================== */

export const CURVA = "0.23,1,0.32,1";
export const DURACION_S = 0.6;
export const PASO_S = 0.07;
export const TOPE_ESCALONADO_S = 0.5;

export const reducirMovimiento = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** El orden de entrada de cada bloque: posición del valor de `data-a` entre los distintos. */
export function rangos(valores: number[]): number[] {
  const unicos = [...new Set(valores)].sort((a, b) => a - b);
  return valores.map((v) => unicos.indexOf(v));
}

/** Retraso de cada rango: PASO_S por rango, sin pasar del tope de escalonado. */
export const retrasoDe = (rango: number, total: number) => (total <= 1 ? 0 : Math.min(rango * PASO_S, TOPE_ESCALONADO_S) * (rango > 0 ? 1 : 0));

let cargando: Promise<typeof import("gsap")["gsap"]> | null = null;
async function gsapListo() {
  cargando ??= (async () => {
    const { gsap } = await import("gsap");
    try {
      const { CustomEase } = await import("gsap/CustomEase");
      gsap.registerPlugin(CustomEase);
      CustomEase.create("pilo", CURVA);
    } catch {
      /* sin CustomEase: la curva más parecida de GSAP */
    }
    return gsap;
  })();
  return cargando;
}

/** Anima la entrada de los bloques `[data-a]` de la diapositiva. Devuelve cómo detenerla. */
export async function animarEntrada(raiz: HTMLElement | null): Promise<() => void> {
  if (!raiz || reducirMovimiento()) return () => {};
  const bloques = [...raiz.querySelectorAll<HTMLElement>("[data-a]")];
  if (!bloques.length) return () => {};
  const gsap = await gsapListo();
  if (!raiz.isConnected) return () => {};
  const orden = rangos(bloques.map((b) => Number(b.dataset.a) || 0));
  const total = Math.max(...orden) + 1;
  const ease = gsap.parseEase("pilo") ? "pilo" : "power4.out";
  const t = gsap.fromTo(
    bloques,
    { autoAlpha: 0, y: 28 },
    { autoAlpha: 1, y: 0, duration: DURACION_S, ease, delay: (i: number) => retrasoDe(orden[i], total), clearProps: "opacity,visibility,transform", overwrite: "auto" },
  );
  return () => {
    t.kill();
    gsap.set(bloques, { clearProps: "opacity,visibility,transform" });
  };
}
