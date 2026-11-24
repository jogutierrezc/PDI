/* =============================================================================
   La imagen del andén es una paleta más.

   Al cambiar de informe la mitad superior de la foto anterior cae sobre su
   bisagra y la mitad inferior de la nueva sube y se asienta: el mismo gesto de
   las cifras, a escala de fotografía. La foto nueva se decodifica antes de
   empezar, para que ninguna mitad caiga sobre un hueco en blanco.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./motion";

interface ImageFlapProps {
  src: string;
  alt: string;
  className?: string;
  /** Carga prioritaria para la imagen que se ve al entrar. */
  eager?: boolean;
}

interface FlipState {
  current: string;
  previous: string | null;
  turn: number;
}

const FLIP_MS = 760;

export function ImageFlap({ src, alt, className = "", eager = false }: ImageFlapProps) {
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState<FlipState>({ current: src, previous: null, turn: 0 });
  const latest = useRef(src);

  useEffect(() => {
    if (src === latest.current) return;
    const from = latest.current;
    latest.current = src;

    if (reduced) {
      setState((s) => ({ current: src, previous: null, turn: s.turn + 1 }));
      return;
    }

    let cancelled = false;
    let timer = 0;
    const image = new Image();
    image.src = src;
    image
      .decode()
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        setState((s) => ({ current: src, previous: from, turn: s.turn + 1 }));
        timer = window.setTimeout(() => {
          if (!cancelled) setState((s) => ({ ...s, previous: null }));
        }, FLIP_MS);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [src, reduced]);

  const { current, previous, turn } = state;

  return (
    <div className={`image-flap ${className}`.trim()} role="img" aria-label={alt}>
      <div className="image-flap__half image-flap__half--top">
        <img src={current} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />
      </div>
      <div className="image-flap__half image-flap__half--bottom">
        <img src={previous ?? current} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />
      </div>

      {previous && (
        <>
          <div key={`t${turn}`} className="image-flap__leaf image-flap__leaf--top">
            <img src={previous} alt="" />
          </div>
          <div key={`b${turn}`} className="image-flap__leaf image-flap__leaf--bottom">
            <img src={current} alt="" />
          </div>
        </>
      )}
      <span className="image-flap__hinge" aria-hidden="true" />
    </div>
  );
}
