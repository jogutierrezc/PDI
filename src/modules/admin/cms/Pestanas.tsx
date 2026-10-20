/* =============================================================================
   CMS Portales · grupo de pestañas.

   Las usan el panel izquierdo (Páginas, Bloques, Capas) y el inspector. Flechas,
   Inicio y Fin cambian de pestaña; solo la activa entra en el orden de Tab. El
   panel lo dibuja quien llama con `idPanel(base)` y `idPestana(base, id)`.
   ========================================================================== */

import type { ReactNode } from "react";

export const idPestana = (base: string, id: string) => `${base}-tab-${id}`;
export const idPanel = (base: string) => `${base}-panel`;

export interface PestanaDef<T extends string> {
  id: T;
  etiqueta: string;
  icono: ReactNode;
}

export function Pestanas<T extends string>({
  base,
  etiqueta,
  pestanas,
  valor,
  onCambio,
}: {
  base: string;
  etiqueta: string;
  pestanas: PestanaDef<T>[];
  valor: T;
  onCambio: (id: T) => void;
}) {
  return (
    <div
      className="cms-tabs"
      role="tablist"
      aria-label={etiqueta}
      onKeyDown={(e) => {
        const i = pestanas.findIndex((p) => p.id === valor);
        const salto = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? -i : e.key === "End" ? pestanas.length - 1 - i : 0;
        if (!salto) return;
        e.preventDefault();
        const siguiente = pestanas[(i + salto + pestanas.length) % pestanas.length];
        onCambio(siguiente.id);
        document.getElementById(idPestana(base, siguiente.id))?.focus();
      }}
    >
      {pestanas.map((p) => (
        <button
          key={p.id}
          id={idPestana(base, p.id)}
          type="button"
          role="tab"
          aria-selected={valor === p.id}
          aria-controls={idPanel(base)}
          tabIndex={valor === p.id ? 0 : -1}
          className="cms-tab"
          onClick={() => onCambio(p.id)}
        >
          {p.icono}
          {p.etiqueta}
        </button>
      ))}
    </div>
  );
}
