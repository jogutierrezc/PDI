/* =============================================================================
   Con el enrutado en el cliente el navegador ya no reposiciona la página al
   navegar. Esto lo hace: arriba en cada ruta nueva, al ancla cuando la URL
   trae un #, y sin saltos cuando la persona vuelve con el botón atrás.
   ========================================================================== */

import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export function ScrollManager() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    // POP = atrás/adelante: el navegador restaura la posición, no la pisamos.
    if (navigationType === "POP") return;

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
  }, [pathname, hash, navigationType]);

  return null;
}
