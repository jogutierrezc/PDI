/* =============================================================================
   UDrive · escala una hoja de 816 px a cualquier zoom sin cambiar su layout.

   La hoja se dibuja siempre a tamaño de papel (así se miden y se reparten las
   páginas igual que al imprimir) y se achica o agranda con transform; el marco
   de afuera reserva el tamaño ya escalado para que el desplazamiento sea el
   correcto. Al imprimir, salida.css quita la escala.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export function Escalado({ escala, ancho = 816, children }: { escala: number; ancho?: number; children: ReactNode }) {
  const interno = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState(0);
  useEffect(() => {
    const el = interno.current;
    if (!el) return;
    const medir = () => setAlto(el.offsetHeight);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(medir);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return (
    <div className="ud-esc" style={{ width: ancho * escala, height: alto * escala }}>
      <div ref={interno} style={{ width: ancho, transform: `scale(${escala})` }}>
        {children}
      </div>
    </div>
  );
}
