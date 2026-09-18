/* =============================================================================
   Marco del portal Datos Abiertos.

   Portal aparte dentro del mismo código, con pie propio y la barra unificada
   de los portales de Planeación. Comparte el tema, la sesión y la caché.
   ========================================================================== */

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../../../components/layout/SiteHeader";
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

      <footer className="od-footer">
        <div className="u-container od-footer__inner">
          <div className="od-footer__brand">
            <strong>Universidad de Santander · UDES en Cifras</strong>
            <span>Oficina de Planeación Institucional</span>
            {catalog.data && (
              <span>
                Periodo {catalog.data.period?.label} · corte publicado el {formatCutoff(catalog.data.cutoffDate)}
                {catalog.data.illustrative ? " · cifras ilustrativas" : ""}.
              </span>
            )}
          </div>
          <nav aria-label="Enlaces del pie">
            <Link to="/datos-abiertos#informes">Informes</Link>
            <Link to="/datos-abiertos/boletines">Boletines</Link>
            <Link to="/datos-abiertos#lectura">Cómo leer las cifras</Link>
            <Link to="/pdi">Portal PDI</Link>
            <Link to="/">Planeación Institucional</Link>
            <a href="mailto:planeacion@udes.edu.co">planeacion@udes.edu.co</a>
          </nav>
          <small>© {new Date().getFullYear()} Universidad de Santander. Datos publicados para consulta y reutilización citando la fuente.</small>
        </div>
      </footer>
    </div>
  );
}
