/* =============================================================================
   Espacio de archivos · el marco de pantalla completa.

   La barra azul marino (marca, buscador Ctrl+K, selectores del módulo y el menú
   de la persona con el regreso a la intranet), el riel lateral y la pantalla de
   espera. Cada módulo dice su marca, sus selectores y las entradas de su riel.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import { useAuth } from "../../lib/auth";
import "./espacio.css";
import "./marco.css";

export function iniciales(nombre: string | null | undefined, correo: string): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return (correo[0] ?? "?").toUpperCase();
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "")).toUpperCase();
}

/** La pantalla de espera, de error o de «sin acceso» que se ve antes del marco. */
export function EstadoPantalla({ children }: { children: ReactNode }) {
  return (
    <div className="es pc pc-estado">
      <div>{children}</div>
    </div>
  );
}

export function BarraSuperior({
  sigla,
  marca,
  buscar,
  onBuscar,
  selector,
  tourBuscar,
  tourSelector,
}: {
  sigla: string;
  marca: string;
  buscar: string;
  onBuscar: () => void;
  /** Los selectores del módulo (programa, periodo, campus…): selects simples. */
  selector?: ReactNode;
  tourBuscar?: string;
  tourSelector?: string;
}) {
  const { profile, signOut } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("pointerdown", fuera), document.removeEventListener("keydown", esc));
  }, [abierto]);
  return (
    <header className="pc-top">
      <div className="pc-brand">
        <span className="pc-mark" aria-hidden="true">
          {sigla}
        </span>
        {marca} <small>UDES</small>
      </div>
      <button type="button" className="pc-search" data-tour={tourBuscar} onClick={onBuscar}>
        <Icon name="search" size={16} />
        {buscar}
        <kbd>Ctrl K</kbd>
      </button>
      <span className="es-grow" />
      <div className="pc-who" data-tour={tourSelector}>
        {selector}
        <Link className="es-btn es-btn--sm es-btn--ghost" style={{ color: "inherit" }} to="/admin">
          <Icon name="arrow-left" size={14} />
          Intranet
        </Link>
        <div className="pc-me" ref={caja}>
          <button type="button" className="pc-avatar" aria-expanded={abierto} aria-label="Su cuenta" onClick={() => setAbierto(!abierto)}>
            {iniciales(profile?.full_name, profile?.email ?? "")}
          </button>
          {abierto ? (
            <div className="pc-me__panel" role="menu">
              <div className="pc-me__who">
                <b>{profile?.full_name?.trim() || profile?.email}</b>
                <small>{profile?.email}</small>
              </div>
              <Link to="/admin">
                <Icon name="settings" size={16} />
                Volver a la intranet
              </Link>
              <button type="button" onClick={() => void signOut()}>
                <Icon name="arrow-left" size={16} />
                Cerrar sesión
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/* ---------- Riel ---------------------------------------------------------------- */

export function Riel({ etiqueta, id, tour, children }: { etiqueta: string; id?: string; tour?: string; children: ReactNode }) {
  return (
    <nav className="pc-side" id={id} data-tour={tour} aria-label={etiqueta}>
      {children}
    </nav>
  );
}

export const TituloRiel = ({ children }: { children: ReactNode }) => <div className="pc-cap">{children}</div>;

/** Una entrada del riel: botón, o enlace si trae `to`. */
export function EntradaRiel({ icono, actual, cuenta, onClick, to, children }: { icono: IconName; actual: boolean; cuenta?: number; onClick?: () => void; to?: string; children: ReactNode }) {
  const cuerpo = (
    <>
      <Icon name={icono} size={18} />
      {children}
      {cuenta ? <span className="pc-badge es-num">{cuenta}</span> : null}
    </>
  );
  const aria = actual ? ("page" as const) : undefined;
  return to ? (
    <Link className="pc-navb" aria-current={aria} to={to}>
      {cuerpo}
    </Link>
  ) : (
    <button type="button" className="pc-navb" aria-current={aria} onClick={onClick}>
      {cuerpo}
    </button>
  );
}
