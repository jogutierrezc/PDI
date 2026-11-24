/* =============================================================================
   Datos de Sostenibilidad · piezas pequeñas que comparten las pantallas.
   Botones y campos son clases dsx-* (datos-sostenibilidad.css): usan los tokens
   globales, así se ven igual dentro de AdminShell y dentro de los editores de
   UDrive (que sí tienen el ancestro .es).
   ========================================================================== */

import { useId } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import type { IconName } from "../../../components/ui/Icon";
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

/** El chip de color de un ODS, con su número; sin ODS (catálogo libre), un chip neutro. `oculta` si ya lo nombra otro texto (dentro de un botón). */
export function FichaOds({ n, oculta = false }: { n: number | null; oculta?: boolean }) {
  const color = (n !== null && odsByNumber(n)?.color) || "#5f7089";
  return (
    <span className="dsx-ods" style={{ background: color, color: tintaSobre(color) }} {...(oculta ? { "aria-hidden": true } : { role: "img", "aria-label": n === null ? "Sin ODS" : `ODS ${n}` })}>
      {n ?? "·"}
    </span>
  );
}

/** Interruptor accesible (role="switch"): el estado se dice con aria-checked y con texto, no solo con color. */
export function Interruptor({ marcado, onChange, disabled, children, titulo }: { marcado: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: ReactNode; titulo?: string }) {
  return (
    <label className="dsx-switch" data-disabled={disabled ? "" : undefined} title={titulo}>
      <input type="checkbox" role="switch" checked={marcado} aria-checked={marcado} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="dsx-switch__trk" aria-hidden="true" />
      <span className="dsx-switch__txt">{children}</span>
    </label>
  );
}

/** Opciones excluyentes en una tira (radios de verdad: flechas, foco y lectores de pantalla funcionan solos). */
export function Segmentado<T extends string>({ valor, opciones, onChange, etiqueta, ancho = false }: { valor: T; opciones: { id: T; etiqueta: string }[]; onChange: (v: T) => void; etiqueta: string; ancho?: boolean }) {
  const nombre = useId();
  return (
    <div className="dsx-seg" data-ancho={ancho ? "" : undefined} role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <label key={o.id} className="dsx-seg__op">
          <input type="radio" name={nombre} value={o.id} checked={valor === o.id} onChange={() => onChange(o.id)} />
          <span>{o.etiqueta}</span>
        </label>
      ))}
    </div>
  );
}

/** Lo que el campo le pasa a su control para quedar atado a la etiqueta, la ayuda y el error. */
interface AtadoCampo {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/** Un campo: etiqueta, control, ayuda y el error en línea justo debajo (sin alert). */
export function Campo({ etiqueta, opcional = false, ayuda, error, ancho = false, children }: { etiqueta: string; opcional?: boolean; ayuda?: ReactNode; error?: string | null; ancho?: boolean; children: (p: AtadoCampo) => ReactNode }) {
  const id = useId();
  const idAyuda = `${id}-a`;
  const idError = `${id}-e`;
  const describe = [error ? idError : null, ayuda ? idAyuda : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="dsx-fl" data-ancho={ancho ? "" : undefined}>
      <label htmlFor={id}>
        {etiqueta}
        {opcional ? <span className="dsx-fl__op"> · opcional</span> : null}
      </label>
      {children({ id, "aria-describedby": describe, ...(error ? { "aria-invalid": true as const } : {}) })}
      {error ? (
        <p id={idError} className="dsx-fl__error" role="alert">
          <Icon name="alert" size={13} />
          {error}
        </p>
      ) : null}
      {ayuda ? (
        <p id={idAyuda} className="dsx-tenue">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

/** Un grupo de opciones con su rótulo (segmentados, fichas de ODS): un fieldset con leyenda. */
export function Grupo({ etiqueta, opcional = false, ayuda, ancho = false, children }: { etiqueta: string; opcional?: boolean; ayuda?: ReactNode; ancho?: boolean; children: ReactNode }) {
  return (
    <fieldset className="dsx-fl dsx-fl--grupo" data-ancho={ancho ? "" : undefined}>
      <legend>
        {etiqueta}
        {opcional ? <span className="dsx-fl__op"> · opcional</span> : null}
      </legend>
      {children}
      {ayuda ? <p className="dsx-tenue">{ayuda}</p> : null}
    </fieldset>
  );
}

/** Un aviso en una franja: error, faltante de migración o nota. Con `accion`, un botón al final. */
export function AvisoSos({ tipo = "aviso", children, accion, onCerrar }: { tipo?: "aviso" | "error" | "ok"; children: ReactNode; accion?: { texto: string; onClick: () => void }; onCerrar?: () => void }) {
  return (
    <div className="dsx-aviso" data-t={tipo} role={tipo === "error" ? "alert" : "status"}>
      <Icon name={tipo === "ok" ? "check" : "alert"} size={15} />
      <span className="dsx-aviso__txt">{children}</span>
      {accion ? (
        <button type="button" className="dsx-btn dsx-btn--sm" onClick={accion.onClick}>
          {accion.texto}
        </button>
      ) : null}
      {onCerrar ? (
        <button type="button" className="dsx-ib" aria-label="Cerrar el aviso" onClick={onCerrar}>
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </div>
  );
}

/** El mensaje de una consulta fallida: la migración sin aplicar se dice aparte. */
export function ErrorSos({ error }: { error: unknown }) {
  if (esFaltaMigracion(error)) {
    return (
      <div className="dsx-vacio" data-t="migracion" role="status">
        <Icon name="settings" size={22} />
        <b>Falta aplicar una migración</b>
        <span>{error.message}</span>
        <span className="dsx-tenue">Pida a quien administra la base de datos que la aplique; mientras tanto esta sección no muestra datos.</span>
      </div>
    );
  }
  return <AvisoSos tipo="error">{error instanceof Error ? error.message : "No se pudo leer la información."}</AvisoSos>;
}

/** Estado vacío: qué pasa, por qué y qué hacer. La acción, si hay, va debajo. */
export function Vacio({ icono = "info", titulo, children, accion }: { icono?: IconName; titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="dsx-vacio">
      <Icon name={icono} size={22} />
      <b>{titulo}</b>
      {children ? <span>{children}</span> : null}
      {accion}
    </div>
  );
}

/** Estado cargando: filas fantasma con la forma de lo que viene, para que nada salte al llegar los datos. */
export function Cargando({ texto, filas = 3 }: { texto: string; filas?: number }) {
  return (
    <div className="dsx-cargando" role="status" aria-live="polite">
      <span className="dsx-sr">{texto}</span>
      {Array.from({ length: filas }, (_, i) => (
        <span key={i} className="dsx-esqueleto" aria-hidden="true" />
      ))}
    </div>
  );
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
