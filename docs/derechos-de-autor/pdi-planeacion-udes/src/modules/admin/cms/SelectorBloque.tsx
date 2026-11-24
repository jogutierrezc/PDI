/* =============================================================================
   CMS Portales · selector de bloque para una columna.

   El mismo catálogo de la biblioteca (por grupo), pero solo con lo que cabe dentro
   de una columna: nada de «html» ni de otras columnas. Se despliega dentro de la
   propia columna (la celda recorta lo que se sale, así que no es una ventana flotante).
   ========================================================================== */

import { useEffect, useRef } from "react";
import { BLOQUES, GRUPOS } from "./bloques";
import { tipoAnidable } from "./logica";

export function SelectorBloque({ onElegir, onCerrar }: { onElegir: (tipo: string) => void; onCerrar: () => void }) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    raiz.current?.querySelector<HTMLButtonElement>("button[data-tipo]")?.focus();
  }, []);
  return (
    <div
      ref={raiz}
      className="cms-selector"
      role="group"
      aria-label="Elija el bloque que va en esta columna"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onCerrar();
      }}
    >
      <div className="cms-selector__cabecera">
        <b>Elija un bloque</b>
        <button type="button" className="cms-btn cms-btn--chico" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
      {GRUPOS.map((grupo) => {
        const items = BLOQUES.filter((b) => b.grupo === grupo && tipoAnidable(b.tipo));
        if (items.length === 0) return null;
        return (
          <section key={grupo} aria-label={grupo}>
            <h4 className="cms-selector__grupo">{grupo}</h4>
            <ul className="cms-selector__lista">
              {items.map((b) => (
                <li key={b.tipo}>
                  <button type="button" data-tipo={b.tipo} className="cms-selector__item" title={b.ayuda} onClick={() => onElegir(b.tipo)}>
                    {b.nombre}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
