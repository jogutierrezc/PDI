/* =============================================================================
   Movimiento de la descarga en CSV.

   El tablero confirma una salida como confirma una llegada: el rótulo voltea,
   las filas se sellan una a una. GSAP, como el módulo de reportes
   (reportes/movimiento.ts). Solo transform y opacity (o una propiedad
   personalizada que alimenta un transform), nada en bucle, todo interrumpible:
   cada función mata antes lo que corra sobre los mismos nodos, y quien se
   desmonta llama a cancelarMovimiento. Con movimiento reducido ninguna hace
   nada y el estado final ya está en el DOM.

   El movimiento acompaña, no decide: el sello tiene un tope de 420 ms contando
   la última fila y un reloj propio, porque en una pestaña en segundo plano
   GSAP no avanza y la descarga no puede quedarse esperándolo.

   Estructura que esperan las tres últimas (las usa el selector de descarga):

     <fieldset class="od-pick__group">
       <label class="od-pick__row"><input type="checkbox" /> …</label>
       …
     </fieldset>

   - entrarGrupos(contenedor): anima los hijos directos del contenedor, es
     decir los fieldset .od-pick__group.
   - sellarFilas(filas): filas = los <label class="od-pick__row"> marcados.
     Pone data-sealing en cada fila y anima --od-pick-seal (0 a 1, barrido) y
     --od-pick-fade (0 a 1, desvanece el sello). El CSS que los consume está en
     chart-export.css, bajo .od-pick__row[data-sealing]::after.
   - cancelarMovimiento(raíz…): corta lo que corra sobre esos nodos y sus
     descendientes, incluido el sello. Para el desmontaje.
   - recorrerCasillas(filas): pulsa la casilla (input) de cada fila; si la fila
     no tiene input, la fila misma.
   ========================================================================== */

import gsap from "gsap";

export function sinMovimiento(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** El rótulo asienta su texto nuevo como una paleta partida: cae, rebota y se queda. ~160 ms. */
export function voltearRotulo(el: HTMLElement | null): void {
  if (!el || sinMovimiento()) return;
  gsap.killTweensOf(el);
  el.dataset.flap = "";
  gsap.fromTo(
    el,
    { rotateX: -80, y: -3, opacity: 0, transformPerspective: 160, transformOrigin: "50% 50%" },
    {
      rotateX: 0,
      y: 0,
      opacity: 1,
      duration: 0.16,
      ease: "power2.out",
      clearProps: "transform,opacity",
      // El destello ámbar (color, vía data-flap) dura un poco más que el volteo.
      onComplete: () => {
        window.setTimeout(() => {
          if (!gsap.isTweening(el)) delete el.dataset.flap;
        }, 90);
      },
      onInterrupt: () => {
        delete el.dataset.flap;
      },
    },
  );
}

/** Los grupos del selector entran en cascada: 8 px y fundido, 30 ms de escalón, tope de 240 ms en total. */
export function entrarGrupos(container: HTMLElement | null): void {
  if (!container || sinMovimiento()) return;
  const grupos = Array.from(container.children) as HTMLElement[];
  if (grupos.length === 0) return;
  gsap.killTweensOf(grupos);
  gsap.fromTo(
    grupos,
    { y: 8, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: 0.22,
      ease: "power2.out",
      stagger: Math.min(0.03, 0.24 / Math.max(1, grupos.length - 1)),
      clearProps: "transform,opacity",
    },
  );
}

/** Tope del sello, de la primera fila a la última ya desvanecida. */
const SELLO_TOPE = 0.42;
const SELLO_BARRIDO = 0.16;
const SELLO_FUNDIDO = 0.12;
const SELLO_ESCALON = 0.035;

let selloEnCurso: { rows: HTMLElement[]; cortar: () => void } | null = null;

/**
 * Sella las filas una a una (barrido ámbar de izquierda a derecha, que se
 * desvanece). Escalón de 35 ms como mucho; con muchas filas se aprieta para
 * que todo, la última incluida, quepa en 420 ms. Resuelve al terminar o al
 * cumplirse el tope, lo que pase antes.
 */
export function sellarFilas(rows: HTMLElement[]): Promise<void> {
  if (rows.length === 0 || sinMovimiento()) return Promise.resolve();
  // Un sello en curso se corta (y su promesa se resuelve) antes de empezar otro.
  selloEnCurso?.cortar();
  gsap.killTweensOf(rows);
  const limpiar = () => {
    rows.forEach((row) => {
      delete row.dataset.sealing;
      row.style.removeProperty("--od-pick-seal");
      row.style.removeProperty("--od-pick-fade");
    });
  };
  const porFila = SELLO_BARRIDO + SELLO_FUNDIDO;
  const paso = Math.min(SELLO_ESCALON, (SELLO_TOPE - porFila) / Math.max(1, rows.length - 1));
  return new Promise((resolver) => {
    const terminar = () => {
      if (selloEnCurso?.cortar !== terminar) return;
      selloEnCurso = null;
      window.clearTimeout(reloj);
      tl.kill();
      limpiar();
      resolver();
    };
    const tl = gsap.timeline({ onComplete: terminar });
    // GSAP se detiene con la pestaña oculta; el reloj no. Lo que tarde de más no se espera.
    const reloj = window.setTimeout(terminar, SELLO_TOPE * 1000 + 60);
    selloEnCurso = { rows, cortar: terminar };
    rows.forEach((row, n) => {
      tl.call(() => { row.dataset.sealing = ""; }, undefined, n * paso);
      tl.fromTo(row, { "--od-pick-seal": 0, "--od-pick-fade": 0 }, { "--od-pick-seal": 1, duration: SELLO_BARRIDO, ease: "power2.out" }, n * paso);
      tl.to(row, { "--od-pick-fade": 1, duration: SELLO_FUNDIDO, ease: "power1.out" }, n * paso + SELLO_BARRIDO);
    });
  });
}

/**
 * Corta lo que corra sobre estos nodos y sus descendientes: volteos, cascadas,
 * pulsos y el sello (cuya promesa se resuelve). Lo llama quien se desmonta,
 * para no dejar nada animando un nodo que ya no está.
 */
export function cancelarMovimiento(...raices: (HTMLElement | null | undefined)[]): void {
  for (const raiz of raices) {
    if (!raiz) continue;
    gsap.killTweensOf([raiz, ...Array.from(raiz.querySelectorAll<HTMLElement>("*"))]);
    if (selloEnCurso?.rows.some((row) => raiz.contains(row))) selloEnCurso.cortar();
  }
}

/** Pulso muy corto de las casillas al marcar o quitar todos. */
export function recorrerCasillas(rows: HTMLElement[]): void {
  if (rows.length === 0 || sinMovimiento()) return;
  const casillas = rows.map((row) => row.querySelector<HTMLElement>("input") ?? row);
  gsap.killTweensOf(casillas);
  gsap.fromTo(
    casillas,
    { scale: 1 },
    {
      scale: 1.22,
      duration: 0.07,
      ease: "power1.out",
      yoyo: true,
      repeat: 1,
      stagger: Math.min(0.02, 0.2 / Math.max(1, casillas.length - 1)),
      clearProps: "transform",
    },
  );
}
