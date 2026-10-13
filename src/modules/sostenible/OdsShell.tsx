/* =============================================================================
   UDES Sostenible · marco de los informes ODS del THE Impact Rankings.

   Todas las vistas de informes ODS (portal, informe, presentación rectoral y
   boletín) van sobre fondo claro, también cuando el equipo usa el tema oscuro:
   `.odsx` fija los tokens `--o-*` en claro. La barra de arriba es texto: la
   vista activa se marca con un filete que se desliza desde la vista anterior
   (ods-portal-rule.ts), y a la izquierda se vuelve al micrositio del ranking.
   ========================================================================== */

import { useRef } from "react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { SostenibleLayout } from "./SostenibleLayout";
import { ODS_ROUTES } from "./ods-data";
import { useSlidingRule } from "./ods-portal-rule";
import { OdsPortalArrow } from "./OdsPortalArrow";
import { useLang } from "./i18n";
import type { Clave } from "./i18n";
import "./ods.css";

export type OdsView = "portal" | "rector" | "boletin";

const TABS: [OdsView, string, Clave][] = [
  ["portal", ODS_ROUTES.portal, "tab_portal"],
  ["rector", ODS_ROUTES.rector, "tab_rector"],
  ["boletin", ODS_ROUTES.bulletin, "tab_boletin"],
];

export function OdsShell({ title, active, children }: { title: string; active?: OdsView; children: ReactNode }) {
  const tabs = useRef<HTMLElement>(null);
  const { lang, t } = useLang();
  useSlidingRule(tabs, active, "odsx-tabs");
  return (
    <SostenibleLayout title={title}>
      <div className="odsx" lang={lang}>
        <div className="odsx-bar">
          <div className="odsx-wrap odsx-bar__row">
            <Link to="/sostenible/impact" className="odsx-back">
              <OdsPortalArrow dir="left" /> THE Impact Rankings
            </Link>
            <nav ref={tabs} className="odsx-tabs" aria-label={t("informes_ods")}>
              {TABS.map(([id, to, label]) => (
                <NavLink key={id} to={to} end className="odsx-tab" aria-current={active === id ? "page" : undefined}>
                  {t(label)}
                </NavLink>
              ))}
              <i className="opt-rule" aria-hidden="true" />
            </nav>
          </div>
        </div>
        {children}
      </div>
    </SostenibleLayout>
  );
}
