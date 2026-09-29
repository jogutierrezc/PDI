/* =============================================================================
   El único momento animado del módulo: «Validar plantilla».
   Un barrido baja por las filas visibles de la hoja y, al terminar, entra el
   panel de errores. GSAP, como el resto de la intranet. Con movimiento
   reducido no hay barrido ni entrada: el resultado aparece de una vez.
   ========================================================================== */

import gsap from "gsap";

export function sinMovimiento(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Barre las filas visibles del marco de la hoja. Resuelve al terminar. */
export function barrer(marco: HTMLElement | null): Promise<void> {
  if (!marco || sinMovimiento()) return Promise.resolve();
  const tabla = marco.querySelector("table");
  const scan = marco.querySelector<HTMLElement>(".ri-scan");
  const cuerpo = tabla?.tBodies[0];
  if (!tabla || !scan || !cuerpo || cuerpo.rows.length === 0) return Promise.resolve();

  marco.scrollTop = 0;
  const cabeza = tabla.tHead?.offsetHeight ?? 0;
  const visibles = Array.from(cuerpo.rows).filter((tr) => tr.offsetTop < marco.clientHeight);
  const alto = Math.min(cuerpo.offsetHeight, marco.clientHeight - cabeza);
  const paso = Math.min(0.09, 0.78 / Math.max(1, visibles.length));
  const duracion = Math.min(0.9, 0.12 + visibles.length * 0.06);

  return new Promise((resolver) => {
    const tl = gsap.timeline({ onComplete: () => resolver() });
    tl.set(scan, { y: cabeza, opacity: 1 });
    tl.to(scan, { y: cabeza + Math.max(0, alto - 36), duration: duracion, ease: "power2.inOut" }, 0);
    visibles.forEach((tr, n) => {
      tl.call(
        () => {
          tr.classList.add("ri-flash");
          gsap.delayedCall(0.14, () => tr.classList.remove("ri-flash"));
        },
        undefined,
        n * paso,
      );
    });
    tl.to(scan, { opacity: 0, duration: 0.18, ease: "power1.out" });
  });
}

/** Entrada del panel de errores: desliza 18 px y la lista cae en cascada. */
export function entrarPanel(panel: HTMLElement | null) {
  if (!panel || sinMovimiento()) return;
  gsap.fromTo(panel, { x: 18, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28, ease: "power3.out", clearProps: "transform,opacity" });
  const items = Array.from(panel.querySelectorAll("ol > li")).slice(0, 16);
  if (items.length)
    gsap.fromTo(
      items,
      { y: 6, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.24, stagger: 0.035, delay: 0.08, ease: "power2.out", clearProps: "transform,opacity" },
    );
}
