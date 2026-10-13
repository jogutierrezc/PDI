/* =============================================================================
   Portal de Planeación Institucional · marco.

   La barra unificada (SiteHeader, la misma del PDI, UDES en Cifras y el
   Observatorio) y el pie propio de la oficina. En la portada, la lupa de la
   barra y Ctrl/Cmd + K llevan al buscador sin cambiar de página.
   ========================================================================== */

import { useEffect } from "react";
import type { ReactNode } from "react";
import { SiteHeader } from "../../components/layout/SiteHeader";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { useOfficePage } from "./page";
import "./planeacion.css";

export function PlanLayout({ title, children, onSearch }: { title: string; children: ReactNode; onSearch?: () => void }) {
  const { page } = useOfficePage();
  const office = page.office;

  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="pl-page">
      <a className="skip-link" href="#pl-contenido">
        Saltar al contenido
      </a>
      <SiteHeader onSearch={onSearch} />

      <main id="pl-contenido">{children}</main>

      <SiteFooter />
    </div>
  );
}
