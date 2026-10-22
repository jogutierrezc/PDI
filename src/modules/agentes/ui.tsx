/* =============================================================================
   Portal de agentes · piezas pequeñas que se repiten.
   ========================================================================== */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { initials } from "../soporte/estados";
import { PORTAL_NAME } from "./datos";
import type { Availability, SpaceKey } from "./datos";
import { enterToast } from "./motion";

const TINTS: [string, string][] = [
  ["#eaf1fd", "#1b52ad"],
  ["#dff3f5", "#00505a"],
  ["#e8ecf5", "#0a2d63"],
  ["#fbf2e0", "#7a5600"],
  ["#e6f4ea", "#0d6b2f"],
];

/** La foto del agente; mientras no exista, sus iniciales sobre un tono suave y estable por nombre. */
export function Avatar({ name, url, size = 36 }: { name: string; url?: string; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) };
  if (url) return <img className="ag-avatar" src={url} alt={`Foto de ${name}`} style={style} />;
  const [bg, fg] = TINTS[Array.from(name).reduce((n, ch) => n + ch.charCodeAt(0), 0) % TINTS.length];
  return (
    <span className="ag-avatar ag-avatar-ini" role="img" aria-label={name} style={{ ...style, background: bg, color: fg }}>
      {initials(name)}
    </span>
  );
}

const ICONS: Record<string, string> = {
  clip: "M21 11.5 12.6 19.9a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14.2a4.2 4.2 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
  down: "M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14",
  close: "M6 6l12 12M18 6 6 18",
  back: "M15 5l-7 7 7 7",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.5M12 7.8h.01",
  send: "M4 12 20 4l-5 16-3.5-6.5L4 12Z",
};

/** Iconos de trazo (24 px, 1.8 de grosor) en un solo juego; heredan el color del texto. */
export function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function PortalTag({ space }: { space: SpaceKey }) {
  return (
    <span className={`ag-tag ${space === "planeacion" ? "ag-t-p" : "ag-t-a"}`}>
      <i />
      {PORTAL_NAME[space]}
    </span>
  );
}

export function Tag({ tone, children }: { tone: "p" | "a" | "y" | "g" | "n" | "b" | "t"; children: ReactNode }) {
  return (
    <span className={`ag-tag ag-t-${tone === "b" ? "p" : tone === "t" ? "a" : tone}`}>
      <i />
      {children}
    </span>
  );
}

export const AVAILABILITY: Record<Availability, { label: string; color: string }> = {
  en_linea: { label: "En línea", color: "#12833a" },
  ocupado: { label: "Ocupado", color: "#b07d00" },
  fuera: { label: "Fuera", color: "#7b8ba1" },
};

export function Dot({ color }: { color: string }) {
  return <i className="ag-dot" style={{ background: color }} aria-hidden="true" />;
}

/** El aviso con «Deshacer · N s». Se muestra mientras `until` no pasa; el texto se anuncia al lector de pantalla. */
export function UndoToast({ text, seconds, onUndo }: { text: string; seconds: number; onUndo: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    enterToast(ref.current);
  }, []);
  return (
    <div className="ag-toast" ref={ref} role="status">
      <span>{text}</span>
      <button type="button" className="ag-btn ag-press ag-btn-white" onClick={onUndo}>
        Deshacer · {seconds} s
      </button>
    </div>
  );
}

/** Un aviso corto que se queda hasta que se cierra (errores y confirmaciones). */
export function Notice({ tone = "error", children }: { tone?: "error" | "ok"; children: ReactNode }) {
  return (
    <p className={`ag-notice ag-notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className="ag-sw ag-press" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

export function Seg<T extends string | number>({ value, options, label, onChange }: { value: T; options: { value: T; label: string }[]; label: string; onChange: (v: T) => void }) {
  return (
    <div className="ag-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={o.value === value ? "on" : ""} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
