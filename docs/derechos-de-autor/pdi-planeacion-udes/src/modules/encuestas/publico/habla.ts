/* =============================================================================
   Encuestas con Pilo · cómo habla Pilo.

   Una frase a la vez: las palabras aparecen en el elemento `.ep-dice` de la raíz
   (un <span class="wd"> por palabra) y, si hay voz, suena la OFICIAL
   (sayOfficial) y el pico se mueve mientras el audio suena de verdad. Sin voz
   —apagada, sin toque previo, o el servicio falló— el pico acompaña a las
   palabras mientras aparecen y la frase queda como texto.

   Cada animación vive en un contexto de GSAP: al cambiar de frase o desmontar,
   todo vuelve a su estado visible. Con movimiento reducido, solo fundidos.
   ========================================================================== */

import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import type { PiloFaceHandle } from "../../../components/pilo/PiloFace";
import { prefetchOfficial, sayOfficial, stopOfficial } from "../../pilo-app/official-voice";

export const VOZ = { portal: "pregunta", advanced: true, keep: true } as const;

export const sinMovimiento = (): boolean => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Ya hubo un toque o una tecla en esta página: el navegador deja sonar. */
export const yaTocado = (): boolean => typeof navigator !== "undefined" && Boolean((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive);

/** Pide por adelantado el audio de unas frases. */
export const precargarVoz = (frases: string[]): void => prefetchOfficial(frases, VOZ);

export { stopOfficial };

export function useHabla({
  raiz,
  cara,
  id,
  texto,
  conVoz,
  onSinVoz,
  onFin,
}: {
  raiz: RefObject<HTMLElement>;
  cara: RefObject<PiloFaceHandle>;
  /** Cambia con cada frase; null = nada que decir. */
  id: string | number | null;
  texto: string;
  conVoz: boolean;
  /** El servicio no dio audio: seguir en texto. */
  onSinVoz?: () => void;
  /** La frase terminó de escribirse y de sonar. */
  onFin?: () => void;
}) {
  const alFin = useRef(onFin);
  alFin.current = onFin;
  const sinVoz = useRef(onSinVoz);
  sinVoz.current = onSinVoz;

  useLayoutEffect(() => {
    const el = raiz.current;
    if (id === null || !el) return;
    const quieta = sinMovimiento();
    const palabras = el.querySelectorAll(".ep-dice .wd");
    const porPalabra = quieta ? 0 : conVoz ? 0.22 : 0.09;
    let escrita = false;
    let dicha = !conVoz;
    let cancelada = false;
    const terminar = () => {
      if (cancelada || !escrita || !dicha) return;
      cara.current?.talk(false);
      alFin.current?.();
    };
    if (conVoz) {
      void sayOfficial(texto, {
        ...VOZ,
        // El pico se mueve con el audio: cuando empieza y hasta que calla.
        onSound: (on) => !cancelada && cara.current?.talk(on),
      }).then((r) => {
        if (cancelada || r === "cancelado") return;
        if (r === "sin voz") sinVoz.current?.();
        dicha = true;
        terminar();
      });
    } else cara.current?.talk(true);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      if (palabras.length) tl.fromTo(palabras, { autoAlpha: 0, y: quieta ? 0 : 8 }, { autoAlpha: 1, y: 0, duration: quieta ? 0.2 : 0.35, stagger: porPalabra, ease: "power3.out" }, 0);
      tl.add(() => {
        escrita = true;
        if (!conVoz) cara.current?.talk(false);
        terminar();
      }, palabras.length * porPalabra + 0.3);
    }, el);

    return () => {
      cancelada = true;
      ctx.revert();
      if (conVoz) stopOfficial();
      cara.current?.talk(false);
    };
    // Mandan la frase y si suena; lo demás llega por refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, conVoz]);
}
