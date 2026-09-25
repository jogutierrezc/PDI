/* =============================================================================
   Mr. Pilo · la cara, con sus expresiones.

   Ocho expresiones (public/pilo-moods, todas con el mismo encuadre para que
   no salte al cambiar) y un momento para cada una:

     feliz      saludar                     bien       algo quedó correcto
     idea       proponer algo               excelente  terminar
     piensa     analizar, cargar            piensa2    esperar una decisión
     duda       falta elegir algo           cuidado    un hueco o una alerta

   Al cambiar de expresión, la nueva entra con un pequeño «pop» (escala
   0.9 → 1 y un giro leve, 260 ms, salida fuerte) mientras la anterior se
   desvanece: se nota que Mr. Pilo reacciona, sin distraer. Con `alive`
   respira muy suave (2 px, 3 s) mientras está en escena. Con movimiento
   reducido, solo el cambio de imagen.

   Lo usan Mr. Pilo en Impacto, el lanzador de la intranet y los recorridos
   de todos los portales.
   ========================================================================== */

import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import "./pilo-avatar.css";

export type PiloMood = "feliz" | "bien" | "idea" | "excelente" | "piensa" | "piensa2" | "duda" | "cuidado";

export const PILO_MOODS: PiloMood[] = ["feliz", "bien", "idea", "excelente", "piensa", "piensa2", "duda", "cuidado"];

const src = (mood: PiloMood, big: boolean) => `/pilo-moods/${mood}-${big ? 320 : 160}.webp`;

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Precarga las expresiones para que el primer cambio no parpadee. */
let preloaded = false;
export function preloadPiloMoods() {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;
  for (const mood of PILO_MOODS) {
    const img = new Image();
    img.src = src(mood, true);
  }
}

export function PiloAvatar({
  mood = "feliz",
  size = 64,
  alive = false,
  className,
  label,
}: {
  mood?: PiloMood;
  size?: number;
  /** Respira suave mientras está en escena. */
  alive?: boolean;
  className?: string;
  /** Texto alternativo; sin él la imagen es decorativa. */
  label?: string;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<{ current: PiloMood; previous: PiloMood | null }>({ current: mood, previous: null });
  const big = size > 80;

  useLayoutEffect(() => {
    preloadPiloMoods();
  }, []);

  useLayoutEffect(() => {
    if (mood !== shown.current) setShown({ current: mood, previous: shown.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);

  // El cambio de expresión: la nueva «aparece» y la anterior se va.
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || !shown.previous) return;
    const next = node.querySelector<HTMLElement>("[data-mood='current']");
    const prev = node.querySelector<HTMLElement>("[data-mood='previous']");
    const ctx = gsap.context(() => {
      if (reduced()) {
        if (prev) gsap.set(prev, { opacity: 0 });
        return;
      }
      if (next) gsap.fromTo(next, { scale: 0.9, rotate: -6, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.26, ease: "back.out(1.6)" });
      if (prev) gsap.to(prev, { opacity: 0, scale: 0.96, duration: 0.16, ease: "power2.out" });
    }, node);
    const clear = window.setTimeout(() => setShown((s) => ({ current: s.current, previous: null })), 280);
    return () => {
      window.clearTimeout(clear);
      ctx.revert();
    };
  }, [shown]);

  // La respiración mientras está en escena.
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || !alive || reduced()) return;
    const tween = gsap.to(node, { y: -2, duration: 1.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
    return () => {
      tween.kill();
      gsap.set(node, { y: 0 });
    };
  }, [alive]);

  return (
    <span
      ref={root}
      className={className ? `pilo-avatar ${className}` : "pilo-avatar"}
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {shown.previous && <img data-mood="previous" src={src(shown.previous, big)} alt="" width={size} height={size} draggable={false} />}
      <img data-mood="current" src={src(shown.current, big)} alt="" width={size} height={size} draggable={false} />
    </span>
  );
}
