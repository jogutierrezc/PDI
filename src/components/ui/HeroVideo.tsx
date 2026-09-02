/* =============================================================================
   Vídeo de portada.
   Lo que el <video autoPlay loop> original no hacía:
   · respetar prefers-reduced-motion — un vídeo en bucle a pantalla completa es
     justo el tipo de movimiento que esa preferencia pide evitar;
   · pausarse al salir de pantalla, en vez de decodificar fotogramas mientras
     alguien lee el pie de página;
   · esperar a interactuar antes de descargar 15 MB: con preload="metadata"
     solo llega la cabecera hasta que el vídeo entra en pantalla.

   No lleva atributo poster: el que había apuntaba al logotipo en SVG, estirado
   a pantalla completa. Sin poster el navegador pinta el primer fotograma real
   en cuanto tiene los metadatos, y hasta entonces se ve el degradado de la
   portada, que es exactamente lo que debe verse.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";

interface HeroVideoProps {
  src: string;
  className?: string;
}

export function HeroVideo({ src, className = "" }: HeroVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [allowMotion, setAllowMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setAllowMotion(!query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!video || !allowMotion) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // play() rechaza si la pestaña está en segundo plano: no es un error.
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [allowMotion]);

  // Con movimiento reducido no se descarga el vídeo en absoluto: queda el
  // degradado de la portada, que ya es una superficie de marca terminada.
  if (!allowMotion) return null;

  return (
    <video
      ref={ref}
      className={className}
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
