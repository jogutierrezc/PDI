/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · escala las hojas a la pantalla.

   Las hojas se dibujan siempre a tamaño de papel (así se miden y se reparten
   igual que al imprimir) y se achican con transform; el marco de afuera
   reserva el tamaño ya escalado para que el desplazamiento sea el correcto. Al
   imprimir, vista.css quita la escala.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PX_POR_MM } from "./perfil";

export function Escalado({ anchoMm, zoom, maxPx, children }: { anchoMm: number; zoom?: number; maxPx?: number; children: ReactNode }) {
  const fuera = useRef<HTMLDivElement>(null);
  const dentro = useRef<HTMLDivElement>(null);
  const [disponible, setDisponible] = useState(0);
  const [alto, setAlto] = useState(0);
  const ancho = anchoMm * PX_POR_MM;

  useEffect(() => {
    const a = fuera.current;
    const b = dentro.current;
    if (!a || !b) return;
    const medir = () => {
      setDisponible(a.clientWidth);
      setAlto(b.offsetHeight);
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(medir);
    o.observe(a);
    o.observe(b);
    return () => o.disconnect();
  }, []);

  const base = zoom ?? (disponible ? Math.min(1, disponible / ancho) : 1);
  const escala = maxPx ? Math.min(base, maxPx / ancho) : base;
  return (
    <div ref={fuera} style={{ width: "100%", display: "grid", justifyItems: "center" }}>
      <div className="vi-esc" style={{ width: ancho * escala, height: alto * escala }}>
        <div ref={dentro} style={{ width: ancho, transform: `scale(${escala})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
