/* =============================================================================
   UDES Sostenible · marco de los informes ODS del THE Impact Rankings.

   Todas las vistas de informes ODS (portal, informe, presentación rectoral y
   boletín) van sobre fondo claro, también cuando el equipo usa el tema oscuro:
   `.odsx` fija los tokens `--o-*` en claro. La barra de arriba cambia de vista
   y vuelve al micrositio del ranking.
   ========================================================================== */

import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { SostenibleLayout } from "./SostenibleLayout";
import { ODS_ROUTES } from "./ods-data";
import "./ods.css";

export type OdsView = "portal" | "rector" | "boletin";

const TABS: [OdsView, string, string][] = [
  ["portal", ODS_ROUTES.portal, "Los 17 informes"],
  ["rector", ODS_ROUTES.rector, "Presentación rectoral"],
  ["boletin", ODS_ROUTES.bulletin, "Boletín PDF"],
];

export function OdsShell({ title, active, children }: { title: string; active?: OdsView; children: ReactNode }) {
  return (
    <SostenibleLayout title={title}>
      <div className="odsx">
        <div className="odsx-bar">
          <div className="odsx-wrap odsx-bar__row">
            <Link to="/sostenible/impact" className="odsx-back">
              ← THE Impact Rankings
            </Link>
            <nav className="odsx-tabs" aria-label="Informes ODS">
              {TABS.map(([id, to, label]) => (
                <NavLink key={id} to={to} end className="odsx-tab" aria-current={active === id ? "page" : undefined}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
        {children}
      </div>
    </SostenibleLayout>
  );
}
