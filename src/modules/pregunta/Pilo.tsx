/* =============================================================================
   Pregúntele a Pilo · el Pilo de la página.

   Es la cara oficial animada (PiloFace: las imágenes aprobadas por la
   universidad). La página habla en momentos —saluda, piensa, duda, advierte—
   y aquí cada momento se traduce a una de sus expresiones:

     feliz     →  feliz        (saluda, encontró la respuesta)
     atento    →  neutral      (espera la pregunta)
     sorpresa  →  emocionado
     piensa    →  pensar       (busca)
     cuidado   →  atrevido     (pregunta capciosa: dinero, futuro)
     duda      →  loco         (no encontró nada)
   ========================================================================== */

import { forwardRef, useImperativeHandle, useRef } from "react";
import { PILO_EXPRESSIONS, PiloFace } from "../../components/pilo/PiloFace";
import type { PiloExpression, PiloFaceHandle } from "../../components/pilo/PiloFace";
import type { MojiMood, PiloMojiHandle } from "../../components/pilo/PiloMoji";

export type { MojiMood, PiloMojiHandle };

export const EMOCION: Record<MojiMood, PiloExpression> = {
  feliz: "feliz",
  atento: "neutral",
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
    /** Una expresión del dibujo que manda sobre `mood` (la que pide el catálogo). */
    emotion?: string;
    talking?: boolean;
    label?: string;
    className?: string;
  }
>(function Pilo({ mood = "feliz", emotion, ...rest }, ref) {
  const inner = useRef<PiloFaceHandle>(null);
  useImperativeHandle(ref, () => ({
    look: (nx, ny) => inner.current?.look(nx, ny),
    talk: (on) => inner.current?.talk(on),
    mood: (m) => inner.current?.expression(EMOCION[m]),
    blink: () => inner.current?.blink(),
    nod: () => inner.current?.nod(),
    el: () => inner.current?.el() ?? null,
  }));
  const chosen = PILO_EXPRESSIONS.find((e) => e === emotion) ?? EMOCION[mood];
  return <PiloFace ref={inner} expression={chosen} {...rest} />;
});
