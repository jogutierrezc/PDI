/* Piezas pequeñas compartidas por las pantallas del reporte por oficinas. */

import type { ReactNode } from "react";
import { odsNombre, odsVars } from "../../ods";
import { ETIQUETA_ESTADO } from "../estados";
import type { EstadoRespuesta, NivelChequeo } from "../tipos";

const CLASE_ESTADO: Record<EstadoRespuesta, string> = {
  none: "",
  draft: "is-draft",
  sent: "is-sent",
  back: "is-back",
  ok: "is-ok",
};

/** Cada estado lleva su glifo además del color: no se distingue solo por color. */
const GLIFO_ESTADO: Record<EstadoRespuesta, string> = {
  none: "○",
  draft: "◐",
  sent: "◉",
  back: "↺",
  ok: "●",
};

export function EstadoPill({ estado }: { estado: EstadoRespuesta }) {
  return (
    <span className={`rk-rep-pill ${CLASE_ESTADO[estado]}`.trim()}>
      <span aria-hidden="true">{GLIFO_ESTADO[estado]}</span> {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

const CLASE_CHEQUEO: Record<NivelChequeo, string> = { ok: "is-ok", warn: "is-warn", risk: "is-risk" };
const GLIFO_CHEQUEO: Record<NivelChequeo, string> = { ok: "✓", warn: "!", risk: "✕" };
const ETIQUETA_CHEQUEO: Record<NivelChequeo, string> = { ok: "Correcto", warn: "Advertencia", risk: "Riesgo" };

export function Chequeos({ items }: { items: { nivel: NivelChequeo; texto: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="rk-rep-checks" aria-label="Chequeos de la evidencia">
      {items.map((c, i) => (
        <li key={i} className={`rk-rep-pill ${CLASE_CHEQUEO[c.nivel]}`}>
          <span aria-hidden="true">{GLIFO_CHEQUEO[c.nivel]}</span>
          <span className="rk-rep-sr">{ETIQUETA_CHEQUEO[c.nivel]}: </span>
          {c.texto}
        </li>
      ))}
    </ul>
  );
}

export function OdsChip({ ods }: { ods: number }) {
  return (
    <span className="rk-rep-chip" style={odsVars(ods)} title={odsNombre(ods)}>
      {ods}
    </span>
  );
}

export function Barra({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  const pct = Math.max(0, Math.min(1, valor)) * 100;
  return (
    <div className="rk-rep-barra" role="img" aria-label={`${etiqueta}: ${Math.round(pct)} %`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Aviso cuando faltan las tablas de la migración 0149. */
export function AvisoMigracion({ error }: { error: Error }) {
  const texto = error.message || "No se pudo leer el reporte.";
  return (
    <div className="rk-rep-aviso" role="alert">
      <b>{texto}</b>
      <p>Mientras tanto, esta pantalla no guarda nada. Aplique la migración y recargue la página.</p>
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <p className="rk-rep-muted" role="status">
      <span className="rk-rep-spin" aria-hidden="true" /> {texto}
    </p>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="rk-rep-vacio">{children}</p>;
}

/** Número con coma decimal, a dos cifras cuando hace falta. */
export function fmtNumero(n: number, decimales = 1): string {
  return n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: decimales });
}
