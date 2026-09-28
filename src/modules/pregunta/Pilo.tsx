/* =============================================================================
   Pregúntele a Pilo · el Pilo de la página.

   Es el Pilo oficial animado (PiloSvgMoji: las cuatro emociones dibujadas
   por la oficina, por capas). La página habla en momentos —saluda, piensa,
   duda, advierte— y aquí cada momento se traduce a una de sus emociones:

     feliz, atento, sorpresa  →  emocionado   (saluda, encontró la respuesta)
     piensa                   →  pensar       (busca)
     cuidado                  →  atrevido     (pregunta capciosa: dinero, futuro)
     duda                     →  loco         (no encontró nada)
   ========================================================================== */

import { forwardRef, useImperativeHandle, useRef } from "react";
import { PILO_SVG_MOODS, PiloSvgMoji } from "../../components/pilo/PiloSvgMoji";
import type { PiloSvgMojiHandle, PiloSvgMood } from "../../components/pilo/PiloSvgMoji";
import type { MojiMood, PiloMojiHandle } from "../../components/pilo/PiloMoji";

export type { MojiMood, PiloMojiHandle };

export const EMOCION: Record<MojiMood, PiloSvgMood> = {
  feliz: "emocionado",
  atento: "emocionado",
  sorpresa: "emocionado",
  piensa: "pensar",
  cuidado: "atrevido",
  duda: "loco",
};

export const Pilo = forwardRef<
  PiloMojiHandle,
  {
    size?: number | string;
    track?: boolean;
    idle?: boolean;
    alive?: boolean;
    mood?: MojiMood;
    /** Una emoción del dibujo que manda sobre `mood` (la que pide el catálogo). */
    emotion?: string;
    talking?: boolean;
    label?: string;
    className?: string;
  }
>(function Pilo({ mood = "feliz", emotion, ...rest }, ref) {
  const inner = useRef<PiloSvgMojiHandle>(null);
  useImperativeHandle(ref, () => ({
    look: (nx, ny) => inner.current?.look(nx, ny),
    talk: (on) => inner.current?.talk(on),
    mood: (m) => inner.current?.mood(EMOCION[m]),
    blink: () => inner.current?.blink(),
    nod: () => inner.current?.nod(),
    el: () => inner.current?.el() ?? null,
  }));
  const chosen = PILO_SVG_MOODS.find((m) => m === emotion) ?? EMOCION[mood];
  return <PiloSvgMoji ref={inner} mood={chosen} {...rest} />;
});
