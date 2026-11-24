/* =============================================================================
   Vídeo de la portada de Datos Abiertos.

   Parte de lo que ya resuelve HeroVideo (pausa fuera de pantalla, nada de
   descarga con movimiento reducido) y añade dos cosas que esta portada
   necesita:

   · un fotograma fijo debajo, para que la universidad se vea desde el primer
     pintado y también con movimiento reducido;
   · el bucle se corta antes del final: los últimos segundos del archivo son un
     cierre rosa de la agencia que, a pantalla completa, rompía el tablero.
   ========================================================================== */

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./motion";

/** Segundo en el que termina la última escena del campus. */
const LOOP_END = 39.2;

export function CampusVideo({ src, poster, className = "" }: { src: string; poster: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const video = ref.current;
    if (!video || reduced) return;

    const onTime = () => {
      if (video.currentTime >= LOOP_END) video.currentTime = 0;
    };
    video.addEventListener("timeupdate", onTime);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.1 },
    );
    observer.observe(video);

    return () => {
      video.removeEventListener("timeupdate", onTime);
      observer.disconnect();
    };
  }, [reduced]);

  return (
    <div className={className} aria-hidden="true">
      <img src={poster} alt="" width={1600} height={900} decoding="async" />
      {!reduced && (
        <video ref={ref} muted loop playsInline preload="metadata" tabIndex={-1}>
          <source src={src} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
