/* =============================================================================
   Marco de gráfica.

   Cada gráfica se presenta como un panel del tablero: una franja con el
   rótulo en letra de señalética, los controles propios a la derecha y, abajo,
   el cuerpo sobre la superficie de lectura. Debajo del cuerpo, siempre, la
   fuente: una gráfica sin procedencia no se publica.
   ========================================================================== */

import type { ReactNode } from "react";

interface ChartFrameProps {
  title: string;
  subtitle?: string;
  source?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function ChartFrame({ title, subtitle, source, actions, children, className = "", id }: ChartFrameProps) {
  return (
    <figure className={`od-frame ${className}`.trim()} id={id}>
      <figcaption className="od-frame__head">
        <span className="od-frame__titles">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </span>
        {actions && <span className="od-frame__actions">{actions}</span>}
      </figcaption>
      <div className="od-frame__body">{children}</div>
      {source && <p className="od-frame__source">Reporta: {source}</p>}
    </figure>
  );
}

interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

/** Conmutador pequeño de vista (Líneas / Barras, Circular / Barras…). */
export function ViewSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <span className="od-switch" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="od-switch__option"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

/** Globo de ayuda posicionado en píxeles dentro de un contenedor relativo. */
export function ChartTooltip({
  x,
  y,
  children,
  align = "center",
}: {
  x: number;
  y: number;
  children: ReactNode;
  align?: "center" | "start" | "end";
}) {
  return (
    <span className="od-tip" data-align={align} style={{ left: x, top: y }} role="presentation">
      {children}
    </span>
  );
}

/** Siguiente múltiplo "redondo" por encima de un máximo. */
export function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(max));
  const fraction = max / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

export function niceFloor(min: number): number {
  if (min <= 0) return 0;
  const exponent = 10 ** Math.floor(Math.log10(min));
  return Math.floor(min / exponent) * exponent;
}
