/* =============================================================================
   Filtro por pilar.
   Un único resaltado que se desplaza entre las opciones, en vez de un fondo
   por botón que aparece y desaparece.

   Se hace con una transición de CSS sobre transform y width —no con una
   librería de animación— por tres razones: corre fuera del hilo principal, es
   interrumpible y retargeteable a media animación (si se pulsa otra opción
   antes de que termine, sale desde donde está, no desde cero), y ahorra los
   44 KB comprimidos que costaba Framer Motion en el tablero público.
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export interface FilterOption {
  id: string | null;
  label: string;
  icon?: IconName;
  accent?: string;
}

interface FilterChipsProps {
  options: FilterOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function FilterChips({ options, value, onChange, label }: FilterChipsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>("[data-active='true']");
    if (!active) {
      setRect(null);
      return;
    }
    setRect({
      x: active.offsetLeft,
      y: active.offsetTop,
      width: active.offsetWidth,
      height: active.offsetHeight,
    });
  }, []);

  // Medir antes del pintado evita que el resaltado se vea saltar en el montaje.
  useLayoutEffect(measure, [measure, value, options]);

  // La primera posición se coloca sin transición; solo a partir de ahí anima.
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Al cambiar el ancho las píldoras se reacomodan en otras filas.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure]);

  const activeOption = options.find((option) => option.id === value);

  return (
    <div
      ref={containerRef}
      className="filter-chips"
      role="group"
      aria-label={label}
      style={
        activeOption?.accent
          ? ({ "--accent": activeOption.accent } as React.CSSProperties)
          : undefined
      }
    >
      {rect && (
        <span
          className={`filter-chips__highlight${ready ? " is-animated" : ""}`}
          aria-hidden="true"
          style={{
            // transform en una sola cadena: se compone en la GPU.
            transform: `translate(${rect.x}px, ${rect.y}px)`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
        />
      )}

      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id ?? "all"}
            type="button"
            className={`filter-chip${isActive ? " is-active" : ""}`}
            data-active={isActive}
            aria-pressed={isActive}
            onClick={() => onChange(isActive && option.id !== null ? null : option.id)}
          >
            {option.icon && <Icon name={option.icon} size={15} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
