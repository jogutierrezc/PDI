/* Gestión Master · piezas pequeñas que comparten las pantallas. */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { APLICACION, ESTADOS, type Aplicacion, type Estado, textoPlazo } from "./modelo";
import { contar } from "./movimiento";

/** El estado se lee en texto y en forma (el punto), no solo en color. */
export function PastillaEstado({ estado }: { estado: Estado }) {
  const e = ESTADOS[estado];
  return (
    <span className="gm-pill" data-tono={e.tono}>
      {e.nombre}
    </span>
  );
}

export function PastillaAplicacion({ aplicacion }: { aplicacion: Aplicacion | null }) {
  if (!aplicacion) return null;
  return (
    <span className="gm-pill" data-tono={aplicacion === "reflejada" ? "ok" : aplicacion === "aplicada" ? "info" : "aviso"}>
      {APLICACION[aplicacion]}
    </span>
  );
}

export function Plazo({ dias }: { dias: number | null | undefined }) {
  const p = textoPlazo(dias);
  if (!p.texto) return null;
  return <span className={`gm-plazo gm-plazo--${p.nivel}`}>{p.texto}</span>;
}

/** Un número que se cuenta de uno a otro cuando cambia (450 ms; sin movimiento, directo). */
export function Contador({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  const ref = useRef<HTMLElement>(null);
  const anterior = useRef(0);
  useEffect(() => {
    if (ref.current) contar(ref.current, anterior.current, valor);
    anterior.current = valor;
  }, [valor]);
  return (
    <div className="gm-contador">
      <b ref={ref} aria-label={`${etiqueta}: ${valor}`}>
        {valor}
      </b>
      <span aria-hidden="true">{etiqueta}</span>
    </div>
  );
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="gm-vacio">
      <h3>{titulo}</h3>
      {texto && <p>{texto}</p>}
      {accion}
    </div>
  );
}

export function Cargando({ filas = 5, etiqueta = "Leyendo el último corte del Warehouse" }: { filas?: number; etiqueta?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={etiqueta}>
      {Array.from({ length: filas }, (_, i) => (
        <div className="gm-skel" key={i}>
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}

export function ErrorCaja({ error, onReintentar, titulo = "No se pudo leer" }: { error: unknown; onReintentar?: () => void; titulo?: string }) {
  const texto = error instanceof Error ? error.message : String(error ?? "");
  return (
    <div className="gm-vacio gm-vacio--error" role="alert">
      <h3>{titulo}</h3>
      <p>{texto}</p>
      {onReintentar && (
        <button type="button" className="button-secondary" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Una nota de «de dónde viene el dato»: fuente y corte, siempre a la vista. */
export function Fuente({ children }: { children: ReactNode }) {
  return <p className="gm-fuente">{children}</p>;
}

export function SinMigracion({ error }: { error: unknown }) {
  return <ErrorCaja error={error} titulo="Gestión Master no está lista" />;
}
