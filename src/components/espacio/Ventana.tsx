/* =============================================================================
   Espacio de archivos · la ventana (asistente, onboarding, buscador).

   Entra desde scale(0.97) y opacidad; atrapa el foco, se cierra con Escape o
   con un clic en el fondo, y devuelve el foco a quien la abrió. Si hay un
   recorrido de Pilo en marcha, Escape lo maneja el recorrido, no la ventana.
   ========================================================================== */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { entrarFondo, entrarVentana } from "./movimiento";

const FOCALIZABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const hayRecorrido = (): boolean => typeof document !== "undefined" && Boolean(document.querySelector(".tour"));

export function Ventana({
  titulo,
  onCerrar,
  children,
  pie,
  cabecera,
  ancho = "grande",
  etiqueta,
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  cabecera?: ReactNode;
  ancho?: "grande" | "chica";
  etiqueta?: string;
}) {
  const fondo = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    entrarFondo(fondo.current);
    entrarVentana(caja.current);
    const primero = caja.current?.querySelector<HTMLElement>("[data-foco], .es-choice, input, select, button:not(.es-x)");
    window.setTimeout(() => (primero ?? caja.current)?.focus({ preventScroll: true }), 60);
    const alTeclear = (e: KeyboardEvent) => {
      if (hayRecorrido()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cerrar.current();
        return;
      }
      if (e.key !== "Tab" || !caja.current) return;
      const items = Array.from(caja.current.querySelectorAll<HTMLElement>(FOCALIZABLES));
      if (!items.length) return;
      const primero = items[0];
      const ultimo = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === primero || !caja.current.contains(document.activeElement))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", alTeclear, true);
    return () => {
      document.removeEventListener("keydown", alTeclear, true);
      anterior?.focus?.();
    };
  }, []);

  return (
    <div ref={fondo} className="es-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div ref={caja} className={`es-dlg${ancho === "chica" ? " es-dlg--sm" : ""}`} role="dialog" aria-modal="true" aria-label={etiqueta ?? titulo} tabIndex={-1}>
        <header>
          <h2>{titulo}</h2>
          {cabecera}
          <button className="es-x" type="button" onClick={onCerrar} aria-label="Cerrar">
            <Icon name="close" size={16} />
          </button>
        </header>
        {children}
        {pie ? <footer>{pie}</footer> : <span />}
      </div>
    </div>
  );
}
