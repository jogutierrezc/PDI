/* =============================================================================
   Espacio de archivos · piezas pequeñas: el ícono y la miniatura de un archivo,
   la ficha de estado, el anillo de cobertura y el aviso breve.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import { ProgressRing } from "../ui/ProgressRing";
import { entrarAviso } from "./movimiento";

export type TipoArchivo = "tabla" | "lista";

/** El ícono de un archivo: tabla o lista, con su color. */
export function IconoArchivo({ tipo, className = "es-kico" }: { tipo: TipoArchivo | "carpeta"; className?: string }) {
  const nombre: IconName = tipo === "carpeta" ? "folder" : tipo === "lista" ? "list" : "table";
  return (
    <span className={className} data-k={tipo} style={{ display: "inline-flex" }}>
      <Icon name={nombre} size={18} />
    </span>
  );
}

/** La ficha de estado: color + glifo + texto, siempre los tres. */
export function Ficha({ clave, texto, icono }: { clave: string; texto: string; icono: IconName }) {
  return (
    <span className="es-est" data-e={clave}>
      <Icon name={icono} size={12} />
      {texto}
    </span>
  );
}

/** El anillo de cobertura: el compartido del portal, con el número al centro. */
export function Anillo({ pct, size = 52, etiqueta }: { pct: number; size?: number; etiqueta: string }) {
  return <ProgressRing value={pct} size={size} thickness={size > 40 ? 5 : 4} label={etiqueta} />;
}

/** Miniatura de una tabla o lista, como en el prototipo. */
export function Miniatura({ tipo, columnas }: { tipo: TipoArchivo; columnas: number }) {
  const n = Math.max(2, Math.min(columnas, 5));
  if (tipo === "lista") {
    return (
      <svg viewBox="0 0 160 84" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x="8" y={8 + i * 18} width="144" height="14" rx="3" fill="var(--es-panel)" stroke="var(--es-line)" />
            <circle cx="17" cy={15 + i * 18} r="3" fill="var(--es-k-lista)" opacity={0.9 - i * 0.15} />
            <rect x="26" y={12 + i * 18} width={70 + ((i * 23) % 40)} height="5" rx="2.5" fill="var(--es-line-2)" />
          </g>
        ))}
      </svg>
    );
  }
  const w = 144 / n;
  return (
    <svg viewBox="0 0 160 84" aria-hidden="true">
      <rect x="8" y="6" width="144" height="72" rx="4" fill="var(--es-panel)" stroke="var(--es-line)" />
      <rect x="8" y="6" width="144" height="14" rx="4" fill="var(--es-k-tabla)" opacity="0.9" />
      {Array.from({ length: n - 1 }, (_, j) => (
        <path key={`v${j}`} d={`M${8 + (j + 1) * w} 6V78`} stroke="var(--es-line)" />
      ))}
      {[1, 2, 3, 4].map((r) => (
        <g key={r}>
          <path d={`M8 ${6 + 14 * r}H152`} stroke="var(--es-line)" />
          {Array.from({ length: n }, (_, k) => (
            <rect key={k} x={12 + k * w} y={9 + 14 * r} width={Math.max(8, w - 12 - ((r * 7 + k * 5) % 14))} height="4" rx="2" fill="var(--es-line-2)" />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function MiniaturaCarpeta() {
  return (
    <svg viewBox="0 0 160 84" aria-hidden="true">
      <path d="M22 20a5 5 0 015-5h30l10 10h66a5 5 0 015 5v40a5 5 0 01-5 5H27a5 5 0 01-5-5V20z" fill="var(--es-k-carpeta)" opacity="0.85" />
      <path d="M22 34h116v31a5 5 0 01-5 5H27a5 5 0 01-5-5V34z" fill="var(--es-k-carpeta)" />
    </svg>
  );
}

/** El aviso breve de abajo (toast): `decir("Guardado.")`. */
export function useAviso(): { aviso: string | null; decir: (mensaje: string) => void } {
  const [aviso, setAviso] = useState<string | null>(null);
  const reloj = useRef<number | undefined>();
  const decir = useCallback((mensaje: string) => {
    setAviso(mensaje);
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setAviso(null), 2800);
  }, []);
  useEffect(() => () => window.clearTimeout(reloj.current), []);
  return { aviso, decir };
}

export function Aviso({ texto }: { texto: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (texto) entrarAviso(ref.current);
  }, [texto]);
  if (!texto) return null;
  return (
    <div ref={ref} className="es-toast" role="status" aria-live="polite">
      {texto}
    </div>
  );
}
