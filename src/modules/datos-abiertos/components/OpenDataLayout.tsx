/* =============================================================================
   Marco del portal Datos Abiertos.

   Portal aparte dentro del mismo código, con pie propio y la barra unificada
   de los portales de Planeación. Comparte el tema, la sesión y la caché.
   ========================================================================== */

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../../../components/layout/SiteHeader";
import { SiteFooter } from "../../../components/layout/SiteFooter";
import { useOpenDataCatalog, formatCutoff } from "../data/open-data";

interface OpenDataLayoutProps {
  children: ReactNode;
  title: string;
  className?: string;
}

/** Todavía no hay un periodo publicado: se dice, en vez de dejar la página en blanco. */
export function EmptyPeriod() {
  return (
    <section className="od-missing">
      <div className="u-container">
        <h1>Aún no hay cifras publicadas</h1>
        <p>
          La Oficina de Planeación Institucional está preparando el periodo. Vuelve pronto o escribe a
          planeacion@udes.edu.co si necesitas un dato.
        </p>
        <Link className="od-button od-button--signal" to="/pdi">
          Ir al Portal PDI
        </Link>
      </div>
    </section>
  );
}

export function OpenDataLayout({ children, title, className = "" }: OpenDataLayoutProps) {
  const catalog = useOpenDataCatalog();

  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className={`od ${className}`.trim()}>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>

      {/* La barra unificada de los portales de Planeación: UDES en Cifras y el
          Observatorio se abren desde su menú ampliado. */}
      <SiteHeader />

      <main id="contenido">{children}</main>

      <SiteFooter
        note={
          catalog.data
            ? `Periodo ${catalog.data.period?.label} · corte del ${formatCutoff(catalog.data.cutoffDate)}${catalog.data.illustrative ? " · cifras ilustrativas" : ""}`
            : undefined
        }
      />
    </div>
  );
}
