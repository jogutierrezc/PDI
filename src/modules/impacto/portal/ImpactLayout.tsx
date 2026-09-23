/* =============================================================================
   Marco del portal Impacto Institucional.

   Mismo lugar que UDES en Cifras dentro de la barra unificada, pero con
   sesión: la ruta la protege RequireRole y la entrada de la barra solo
   aparece para quien ha iniciado sesión.
   ========================================================================== */

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../../../components/layout/SiteHeader";
import "./impacto.css";

export function ImpactLayout({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | Impacto Institucional · UDES`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="imp">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <SiteHeader />
      <main id="contenido">{children}</main>
      <footer className="imp-footer">
        <div className="u-container imp-footer__inner">
          <div>
            <strong>Universidad de Santander · Impacto Institucional</strong>
            <span>
              El catálogo es la última versión publicada por Planeación. Solo se muestran cifras validadas por las
              vicerrectorías.
            </span>
          </div>
          <nav aria-label="Enlaces del pie">
            <Link to="/impacto">Portada</Link>
            <Link to="/impacto/institucion">Toda la universidad</Link>
            <Link to="/admin/impacto">Reportar en la intranet</Link>
            <Link to="/datos-abiertos">UDES en Cifras</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
