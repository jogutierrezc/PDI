/* =============================================================================
   Anillo de avance.
   Sustituye a los conic-gradient que se usaban antes: un gradiente cónico
   dibuja un borde escalonado, no admite remate redondo y no se puede animar
   sin repintar todo el elemento. Aquí es un arco SVG — nítido en cualquier
   densidad, con el extremo redondeado que pide el sistema de datos, y animado
   por stroke-dashoffset, que es una propiedad barata.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";

interface ProgressRingProps {
  /** 0-100 */
  value: number;
  size?: number;
  thickness?: number;
  /** Color del arco. Por defecto, el azul institucional. */
  color?: string;
  /** Texto para lectores de pantalla; el número visible ya lo lleva dentro. */
  label: string;
  /** Contenido del centro. Si se omite, se muestra el porcentaje. */
  children?: React.ReactNode;
}

export function ProgressRing({
  value,
  size = 96,
  thickness = 8,
  color = "var(--brand-blue)",
  label,
  children,
}: ProgressRingProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [shown, setShown] = useState(0);

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));

  // El arco crece cuando el anillo entra en pantalla: si ya está dibujado
  // cuando aparece, el movimiento no comunica nada.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(clamped);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(clamped);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [clamped]);

  return (
    <div
      className="progress-ring"
      style={{ width: size, height: size, "--ring-size": `${size}px` } as React.CSSProperties}
    >
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label}: ${clamped} por ciento`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--track)"
          strokeWidth={thickness}
        />
        <circle
          className="progress-ring__arc"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * shown) / 100}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="progress-ring__center" aria-hidden="true">
        {children ?? (
          <strong>
            {clamped}
            <span>%</span>
          </strong>
        )}
      </span>
    </div>
  );
}
