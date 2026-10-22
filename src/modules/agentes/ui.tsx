/* =============================================================================
   Portal de agentes · piezas pequeñas que se repiten.
   ========================================================================== */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { initials } from "../soporte/estados";
import { PORTAL_NAME } from "./datos";
import type { Availability, SpaceKey } from "./datos";
import { enterToast } from "./motion";

/** La foto del agente; mientras no exista, sus iniciales dentro de un círculo punteado. */
export function Avatar({ name, url, size = 36 }: { name: string; url?: string; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.3)) };
  if (url) return <img className="ag-avatar" src={url} alt={`Foto de ${name}`} style={style} />;
  return (
    <span className="ag-avatar ag-avatar-ini" role="img" aria-label={`Foto de ${name} por llegar`} style={style}>
      {initials(name)}
    </span>
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
