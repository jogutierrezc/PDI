/* =============================================================================
   Con el enrutado en el cliente el navegador ya no reposiciona la página al
   navegar. Esto lo hace: arriba en cada ruta nueva, al ancla cuando la URL
   trae un #, y sin saltos cuando la persona vuelve con el botón atrás.

   Solo la ruta y el ancla son navegación. Un filtro que vive en la URL
   (?corte=2025&periodo=B) reemplaza la entrada sin cambiar de página: ahí la
   posición se queda donde está. Antes el efecto dependía también del tipo de
   navegación, y la primera selección tras llegar con un enlace (POP o PUSH →
   REPLACE) lo volvía a disparar y mandaba la página al inicio.
   ========================================================================== */

import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * ¿Hay que mover la página? Sí al cambiar de ruta, y al llegar a un ancla
 * nueva dentro de la misma. Que la URL pierda su ancla en la misma ruta (o
 * cambie solo la búsqueda) no mueve nada.
 */
export function shouldReposition(
  previous: { pathname: string; hash: string },
  next: { pathname: string; hash: string },
): boolean {
  if (previous.pathname !== next.pathname) return true;
  return next.hash !== "" && next.hash !== previous.hash;
}

export function ScrollManager() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  // El tipo de navegación se lee al cambiar la ruta, pero no dispara el efecto.
  const type = useRef(navigationType);
  type.current = navigationType;
  const last = useRef<{ pathname: string; hash: string } | null>(null);

  useEffect(() => {
    const previous = last.current;
    last.current = { pathname, hash };
    // POP = atrás/adelante: el navegador restaura la posición, no la pisamos.
    if (type.current === "POP") return;
    // Misma página y el ancla se fue (o no cambió): no es una navegación.
    if (previous && !shouldReposition(previous, { pathname, hash })) return;

    if (hash) {
      // El destino puede no existir todavía: las rutas se cargan bajo demanda,
      // así que al llegar a /implementacion#repositorio desde otra página el
      // fragmento aún se está descargando. Se reintenta durante un segundo
      // antes de rendirse, en vez de saltar al inicio y perder el ancla.
      const id = hash.slice(1);
      let frame = 0;
      const deadline = performance.now() + 1000;

      const tryScroll = () => {
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        if (performance.now() < deadline) {
          frame = requestAnimationFrame(tryScroll);
        }
      };

      frame = requestAnimationFrame(tryScroll);
      return () => cancelAnimationFrame(frame);
    }

    window.scrollTo({ top: 0 });
  }, [pathname, hash]);

  return null;
}
