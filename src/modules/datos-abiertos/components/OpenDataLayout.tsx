/* =============================================================================
   Marco del portal Datos Abiertos.

   Portal aparte dentro del mismo código: cabecera y pie propios, sin la
   navegación del PDI. Comparte el tema, la sesión y la caché de datos.
   ========================================================================== */

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { useTheme } from "../../../lib/theme";
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
        <Link className="od-button od-button--signal" to="/">
          Ir al Portal PDI
        </Link>
      </div>
    </section>
  );
}

export function OpenDataLayout({ children, title, className = "" }: OpenDataLayoutProps) {
  const { resolved, toggle } = useTheme();
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

      <header className="od-header">
        <Link className="od-brand" to="/datos-abiertos" aria-label="UDES en Cifras, ir al inicio del portal">
          <span className="od-brand__logo">
            <img src="/logo-udes.svg" alt="" width={95} height={34} decoding="async" />
          </span>
          <span className="od-brand__name">
            UDES <strong>en Cifras</strong>
          </span>
        </Link>

        <nav className="od-nav" aria-label="Datos Abiertos">
          <NavLink to="/datos-abiertos#informes" className="od-nav__link">
            Informes
          </NavLink>
          <NavLink to="/datos-abiertos/boletines" className="od-nav__link">
            Boletines
          </NavLink>
          <NavLink to="/datos-abiertos#lectura" className="od-nav__link od-nav__link--wide">
            Cómo leer las cifras
          </NavLink>
          <Link to="/" className="od-nav__link od-nav__link--wide">
            Portal PDI
          </Link>
        </nav>

        <button
          className="od-icon-button"
          type="button"
          onClick={toggle}
          aria-label={resolved === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          title={resolved === "dark" ? "Tema claro" : "Tema oscuro"}
        >
          <Icon name={resolved === "dark" ? "sun" : "moon"} size={17} />
        </button>
      </header>

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
            <Link to="/">Portal PDI</Link>
            <a href="mailto:planeacion@udes.edu.co">planeacion@udes.edu.co</a>
          </nav>
          <small>© {new Date().getFullYear()} Universidad de Santander. Datos publicados para consulta y reutilización citando la fuente.</small>
        </div>
      </footer>
    </div>
  );
}
