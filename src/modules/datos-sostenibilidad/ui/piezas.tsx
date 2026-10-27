/* =============================================================================
   Datos de Sostenibilidad · piezas pequeñas que comparten las pantallas.
   ========================================================================== */

import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { odsByNumber } from "../../sostenible/ods-data";
import { esFaltaMigracion } from "../sos";

/** Texto legible sobre un fondo: oscuro sobre colores claros (como el amarillo del ODS 7), blanco sobre el resto. */
function tintaSobre(hex: string): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return "#fff";
  const [r, g, b] = [1, 2, 3].map((i) => {
    const v = parseInt(m[i], 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#0d1c31" : "#fff";
}

/** El chip de color de un ODS, con su número. */
export function FichaOds({ n }: { n: number }) {
  const color = odsByNumber(n)?.color ?? "#5f7089";
  return (
    <span className="dsx-ods" style={{ background: color, color: tintaSobre(color) }} role="img" aria-label={`ODS ${n}`}>
      {n}
    </span>
  );
}

/** Interruptor accesible (role="switch"): el estado se dice con aria-checked y con texto, no solo con color. */
export function Interruptor({ marcado, onChange, disabled, children, titulo }: { marcado: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: ReactNode; titulo?: string }) {
  return (
    <label className="dsx-switch" data-disabled={disabled ? "" : undefined} title={titulo}>
      <input type="checkbox" role="switch" checked={marcado} aria-checked={marcado} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="dsx-switch__trk" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

/** Un aviso en una franja: error, faltante de migración o nota. */
export function AvisoSos({ tipo = "aviso", children }: { tipo?: "aviso" | "error" | "ok"; children: ReactNode }) {
  return (
    <p className="dsx-aviso" data-t={tipo} role={tipo === "error" ? "alert" : "status"}>
      <Icon name={tipo === "ok" ? "check" : "alert"} size={15} />
      <span>{children}</span>
    </p>
  );
}

/** El mensaje de una consulta fallida: la migración sin aplicar se dice aparte. */
export function ErrorSos({ error }: { error: unknown }) {
  if (esFaltaMigracion(error)) return <AvisoSos>{error.message} Pida a quien administra la base de datos que la aplique; mientras tanto esta sección no muestra datos.</AvisoSos>;
  return <AvisoSos tipo="error">{error instanceof Error ? error.message : "No se pudo leer la información."}</AvisoSos>;
}

/** Barra de avance (hacia una meta). Crece al entrar a la sección (data-medidor). */
export function Medidor({ fraccion }: { fraccion: number }) {
  return (
    <span className="dsx-medidor" aria-hidden="true">
      <i data-medidor="" style={{ width: `${Math.round(Math.max(0, Math.min(1, fraccion)) * 100)}%` }} />
    </span>
  );
}

/** Número con los decimales del indicador y separadores en español. */
export const textoCifra = (n: number | null | undefined, decimales = 1): string => (n === null || n === undefined ? "—" : n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: decimales }));
