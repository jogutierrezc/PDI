/* =============================================================================
   Espacio de archivos · el buscador Ctrl+K: archivos y acciones.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import { normalizar } from "./logica";
import { entrarFondo, entrarVentana } from "./movimiento";
import { hayRecorrido } from "./Ventana";

export interface EntradaBuscador {
  id: string;
  titulo: string;
  icono: IconName;
  pista: string;
}

export function Buscador({ entradas, onElegir, onCerrar }: { entradas: EntradaBuscador[]; onElegir: (e: EntradaBuscador) => void; onCerrar: () => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const fondo = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const n = normalizar(q);
  const items = n ? entradas.filter((x) => normalizar(x.titulo).includes(n)) : entradas;
  const activo = Math.min(i, Math.max(0, items.length - 1));

  useEffect(() => {
    entrarFondo(fondo.current);
    entrarVentana(caja.current);
    entrada.current?.focus();
  }, []);

  const alTeclear = (e: React.KeyboardEvent) => {
    if (hayRecorrido()) return;
    if (e.key === "Escape") onCerrar();
    else if (e.key === "ArrowDown") (e.preventDefault(), setI(Math.min(items.length - 1, activo + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setI(Math.max(0, activo - 1)));
    else if (e.key === "Enter" && items[activo]) (e.preventDefault(), onElegir(items[activo]));
  };

  return (
    <div ref={fondo} className="es-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()} onKeyDown={alTeclear}>
      <div ref={caja} className="es-cmdk" role="dialog" aria-modal="true" aria-label="Buscar">
        <input ref={entrada} placeholder="Buscar un archivo o una acción…" aria-label="Buscar" value={q} onChange={(e) => (setQ(e.target.value), setI(0))} />
        <ul role="listbox">
          {items.length ? (
            items.map((x, k) => (
              <li key={x.id} role="option" aria-selected={k === activo} onClick={() => onElegir(x)}>
                <Icon name={x.icono} size={16} />
                {x.titulo}
                <small>{x.pista}</small>
              </li>
            ))
          ) : (
            <li style={{ cursor: "default" }}>Sin resultados</li>
          )}
        </ul>
      </div>
    </div>
  );
}
